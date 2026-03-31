#!/usr/bin/env node

/**
 * Cognexia Briefing Generator
 *
 * Produces a Markdown context file from your stored memories,
 * ready to paste into a new AI session to restore full context.
 *
 * Usage:
 *   node briefing.js            → generate ~/.cognexia/briefing.md
 *   node briefing.js --seed     → store initial context into Cognexia
 *   node briefing.js --stdout   → print briefing to stdout instead of file
 *   node briefing.js --project=my-project  → limit to one project
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();

const COGNEXIA_DIR = path.join(os.homedir(), '.cognexia');
const DATA_LAKE = path.join(COGNEXIA_DIR, 'data-lake');
const BRIEFING_PATH = path.join(COGNEXIA_DIR, 'briefing.md');
const SERVER_URL = `http://localhost:${process.env.PORT || 10000}`;

const args = process.argv.slice(2);
const MODE_SEED = args.includes('--seed');
const MODE_STDOUT = args.includes('--stdout');
const PROJECT_FLAG = args.find(a => a.startsWith('--project='));
const TARGET_PROJECT = PROJECT_FLAG ? PROJECT_FLAG.split('=')[1] : null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, data: JSON.parse(raw) }); }
        catch { resolve({ ok: false, data: null }); }
      });
    });
    req.setTimeout(2000, () => { req.destroy(); resolve({ ok: false, data: null }); });
    req.on('error', () => resolve({ ok: false, data: null }));
  });
}

function httpPost(url, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };
    const req = http.request(url, options, (res) => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, data: JSON.parse(raw) }); }
        catch { resolve({ ok: false, data: null }); }
      });
    });
    req.setTimeout(3000, () => { req.destroy(); resolve({ ok: false, data: null }); });
    req.on('error', () => resolve({ ok: false, data: null }));
    req.write(payload);
    req.end();
  });
}

// ─── Direct SQLite fallback (when server is not running) ──────────────────────

function listProjectsFromDisk() {
  if (!fs.existsSync(DATA_LAKE)) return [];
  return fs.readdirSync(DATA_LAKE)
    .filter(d => d.startsWith('memory-'))
    .map(d => d.replace('memory-', ''));
}

function queryProjectDirect(project, days = 30, limit = 20) {
  return new Promise((resolve) => {
    const dbPath = path.join(DATA_LAKE, `memory-${project}`, 'bridge.db');
    if (!fs.existsSync(dbPath)) return resolve([]);

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) return resolve([]);
    });

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const sql = `
      SELECT id, content, content_type, importance, created_at, tags
      FROM memories
      WHERE deleted_at IS NULL
        AND created_at > ?
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `;

    db.all(sql, [cutoff.toISOString(), limit], (err, rows) => {
      db.close();
      if (err) return resolve([]);
      resolve(rows || []);
    });
  });
}

// ─── Fetch memories (server first, SQLite fallback) ───────────────────────────

async function fetchMemories(projects) {
  const projectMemories = {};

  // Try server first
  const health = await httpGet(`${SERVER_URL}/api/health`);
  const useServer = health.ok;

  if (useServer) {
    for (const project of projects) {
      const url = `${SERVER_URL}/api/memory/recent?project=${encodeURIComponent(project)}&limit=20&days=30`;
      const res = await httpGet(url);
      if (res.ok && res.data?.data) {
        projectMemories[project] = res.data.data.memories || res.data.data || [];
      } else {
        projectMemories[project] = [];
      }
    }
  } else {
    // Direct SQLite fallback
    for (const project of projects) {
      projectMemories[project] = await queryProjectDirect(project, 30, 20);
    }
  }

  return { projectMemories, useServer };
}

// ─── Format briefing markdown ─────────────────────────────────────────────────

function formatBriefing(projectMemories, generatedAt) {
  const totalCount = Object.values(projectMemories).reduce((sum, ms) => sum + ms.length, 0);
  const projects = Object.keys(projectMemories).filter(p => projectMemories[p].length > 0);

  if (totalCount === 0) {
    return `# Cognexia Briefing\n\n_Generated: ${generatedAt}_\n\nNo memories found in the last 30 days.\n`;
  }

  const lines = [
    `# Cognexia Briefing`,
    ``,
    `> Generated: ${generatedAt} | ${totalCount} memories across ${projects.length} project${projects.length !== 1 ? 's' : ''}`,
    `> Paste this at the start of a new AI session to restore full context.`,
    ``,
  ];

  // Type emoji map
  const typeEmoji = {
    insight: '💡',
    goal: '🎯',
    milestone: '🏆',
    decision: '⚖️',
    preference: '⚙️',
    error: '🐛',
    security: '🔒',
    conversation: '💬',
  };

  for (const project of projects) {
    const memories = projectMemories[project];
    if (!memories.length) continue;

    lines.push(`## Project: ${project}`);
    lines.push(``);

    // Group by type
    const byType = {};
    for (const m of memories) {
      const t = m.content_type || m.type || 'insight';
      if (!byType[t]) byType[t] = [];
      byType[t].push(m);
    }

    // High-importance pinned memories first
    const pinned = memories.filter(m => (m.importance || 5) >= 8);
    if (pinned.length) {
      lines.push(`### ⭐ High Priority`);
      for (const m of pinned.slice(0, 5)) {
        const emoji = typeEmoji[m.content_type || m.type] || '•';
        const imp = m.importance ? ` _(importance: ${m.importance})_` : '';
        lines.push(`- ${emoji} **[${m.content_type || m.type || 'insight'}]** ${m.content.trim()}${imp}`);
      }
      lines.push(``);
    }

    // Remaining by type
    const typeOrder = ['goal', 'decision', 'milestone', 'insight', 'preference', 'error', 'security', 'conversation'];
    const renderedTypes = new Set(pinned.map(m => m.content_type || m.type));

    for (const type of typeOrder) {
      const group = (byType[type] || []).filter(m => (m.importance || 5) < 8 || !pinned.includes(m));
      if (!group.length) continue;

      const emoji = typeEmoji[type] || '•';
      lines.push(`### ${emoji} ${type.charAt(0).toUpperCase() + type.slice(1)}s`);
      for (const m of group.slice(0, 8)) {
        const date = m.created_at ? new Date(m.created_at).toLocaleDateString() : '';
        const dateStr = date ? ` _(${date})_` : '';
        lines.push(`- ${m.content.trim()}${dateStr}`);
      }
      lines.push(``);
    }
  }

  lines.push(`---`);
  lines.push(`_End of briefing. Continue from where you left off._`);
  lines.push(``);

  return lines.join('\n');
}

// ─── Seed mode ────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Seeding initial context into Cognexia...');

  const health = await httpGet(`${SERVER_URL}/api/health`);
  if (!health.ok) {
    console.error('❌ Cognexia server is not running. Start it first: ./start.sh start');
    process.exit(1);
  }

  const project = TARGET_PROJECT || 'general';
  const seeds = [
    {
      content: `Cognexia briefing system initialized. Use 'node briefing.js' to generate context files for new AI sessions.`,
      type: 'insight',
      importance: 6,
    },
    {
      content: `Project '${project}' is the primary memory store. Memories are organized by type: insight, goal, milestone, decision, preference, error, security.`,
      type: 'insight',
      importance: 5,
    },
  ];

  let stored = 0;
  for (const seed of seeds) {
    const res = await httpPost(`${SERVER_URL}/api/memory/store`, {
      ...seed,
      project,
      agentId: 'briefing-system',
    });
    if (res.ok) stored++;
  }

  console.log(`✅ Seeded ${stored} initial memories into project '${project}'`);
  console.log(`   Now run: node briefing.js`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (MODE_SEED) {
    await seed();
    return;
  }

  // Discover projects
  let projects = [];

  if (TARGET_PROJECT) {
    projects = [TARGET_PROJECT];
  } else {
    // Try server first, fall back to disk scan
    const health = await httpGet(`${SERVER_URL}/api/health`);
    if (health.ok && health.data?.data?.projects) {
      projects = health.data.data.projects;
    } else {
      projects = listProjectsFromDisk();
    }
    if (!projects.length) projects = ['general'];
  }

  const { projectMemories, useServer } = await fetchMemories(projects);
  const source = useServer ? 'server' : 'SQLite (direct)';

  const now = new Date();
  const generatedAt = now.toLocaleString();
  const briefing = formatBriefing(projectMemories, generatedAt);

  if (MODE_STDOUT) {
    process.stdout.write(briefing);
    return;
  }

  // Write to ~/.cognexia/briefing.md
  fs.mkdirSync(COGNEXIA_DIR, { recursive: true });
  fs.writeFileSync(BRIEFING_PATH, briefing, 'utf8');

  const totalMemories = Object.values(projectMemories).reduce((s, ms) => s + ms.length, 0);
  console.log(`✅ Briefing generated (via ${source})`);
  console.log(`   ${totalMemories} memories | ${projects.length} project(s): ${projects.join(', ')}`);
  console.log(`   Saved to: ${BRIEFING_PATH}`);
  console.log(``);
  console.log(`   Quick access: cat ${BRIEFING_PATH}`);
  console.log(`   Or add alias: echo "alias briefing='cat ${BRIEFING_PATH}'" >> ~/.zshrc`);
}

main().catch(err => {
  console.error('Error generating briefing:', err.message);
  process.exit(1);
});
