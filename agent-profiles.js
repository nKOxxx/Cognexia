/**
 * Cognexia — Agent Profiles
 *
 * Stores team and agent definitions separately from project memory.
 * Agent profiles are project-independent: they carry across all projects.
 * Database: ~/.cognexia/agents.db
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');

const AGENTS_DB_PATH = path.join(
  process.env.DATA_LAKE_PATH || path.join(os.homedir(), '.cognexia', 'data-lake'),
  '..', // up from data-lake → .cognexia
  'agents.db'
);

function getDb() {
  const dir = path.dirname(path.resolve(AGENTS_DB_PATH));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new sqlite3.Database(path.resolve(AGENTS_DB_PATH));
  return db;
}

function initSchema(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS teams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT DEFAULT '',
          color TEXT DEFAULT '#6366f1',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY,
          team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
          name TEXT NOT NULL,
          role TEXT DEFAULT '',
          skills TEXT DEFAULT '[]',
          experience TEXT DEFAULT '',
          tools TEXT DEFAULT '[]',
          tasks TEXT DEFAULT '[]',
          personality TEXT DEFAULT '',
          model TEXT DEFAULT '',
          notes TEXT DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS agent_projects (
          agent_id TEXT NOT NULL,
          project_name TEXT NOT NULL,
          assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (agent_id, project_name)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

function generateId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function parseAgent(agent) {
  if (!agent) return null;
  return {
    ...agent,
    skills: safeJson(agent.skills, []),
    tools: safeJson(agent.tools, []),
    tasks: safeJson(agent.tasks, []),
  };
}

function safeJson(str, fallback) {
  try { return JSON.parse(str || 'null') || fallback; } catch { return fallback; }
}

function withDb(fn) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    initSchema(db)
      .then(() => fn(db))
      .then(result => { db.close(); resolve(result); })
      .catch(err => { db.close(); reject(err); });
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null));
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) { err ? reject(err) : resolve(this); });
  });
}

// ─── Teams ────────────────────────────────────────────────────────────────────

async function listTeams() {
  return withDb(async (db) => {
    const teams = await dbAll(db, 'SELECT * FROM teams ORDER BY name');
    const agents = await dbAll(db, 'SELECT * FROM agents ORDER BY name');
    return teams.map(team => ({
      ...team,
      agents: agents.filter(a => a.team_id === team.id).map(parseAgent),
    }));
  });
}

async function createTeam({ name, description = '', color = '#6366f1' }) {
  if (!name || !name.trim()) throw new Error('Team name is required');
  return withDb(async (db) => {
    const id = generateId('team');
    await dbRun(db,
      'INSERT INTO teams (id, name, description, color) VALUES (?, ?, ?, ?)',
      [id, name.trim(), description, color]
    );
    return dbGet(db, 'SELECT * FROM teams WHERE id = ?', [id]);
  });
}

async function updateTeam(id, { name, description, color }) {
  return withDb(async (db) => {
    const team = await dbGet(db, 'SELECT * FROM teams WHERE id = ?', [id]);
    if (!team) throw new Error('Team not found');
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name.trim()); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (color !== undefined) { fields.push('color = ?'); values.push(color); }
    if (!fields.length) return team;
    fields.push('updated_at = CURRENT_TIMESTAMP');
    await dbRun(db, `UPDATE teams SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
    return dbGet(db, 'SELECT * FROM teams WHERE id = ?', [id]);
  });
}

async function deleteTeam(id) {
  return withDb(async (db) => {
    const team = await dbGet(db, 'SELECT * FROM teams WHERE id = ?', [id]);
    if (!team) throw new Error('Team not found');
    await dbRun(db, 'UPDATE agents SET team_id = NULL WHERE team_id = ?', [id]);
    await dbRun(db, 'DELETE FROM teams WHERE id = ?', [id]);
    return { deleted: true };
  });
}

// ─── Agents ───────────────────────────────────────────────────────────────────

async function listAgents(teamId) {
  return withDb(async (db) => {
    const rows = teamId
      ? await dbAll(db, 'SELECT * FROM agents WHERE team_id = ? ORDER BY name', [teamId])
      : await dbAll(db, 'SELECT * FROM agents ORDER BY name');
    return rows.map(parseAgent);
  });
}

async function getAgent(id) {
  return withDb(async (db) => {
    const agent = await dbGet(db, 'SELECT * FROM agents WHERE id = ?', [id]);
    if (!agent) throw new Error('Agent not found');
    return parseAgent(agent);
  });
}

async function createAgent({ team_id, name, role = '', skills = [], experience = '', tools = [], tasks = [], personality = '', model = '', notes = '' }) {
  if (!name || !name.trim()) throw new Error('Agent name is required');
  return withDb(async (db) => {
    if (team_id) {
      const team = await dbGet(db, 'SELECT id FROM teams WHERE id = ?', [team_id]);
      if (!team) throw new Error('Team not found');
    }
    const id = generateId('agent');
    await dbRun(db,
      `INSERT INTO agents (id, team_id, name, role, skills, experience, tools, tasks, personality, model, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, team_id || null, name.trim(), role, JSON.stringify(skills), experience, JSON.stringify(tools), JSON.stringify(tasks), personality, model, notes]
    );
    return parseAgent(await dbGet(db, 'SELECT * FROM agents WHERE id = ?', [id]));
  });
}

async function updateAgent(id, updates) {
  return withDb(async (db) => {
    const agent = await dbGet(db, 'SELECT * FROM agents WHERE id = ?', [id]);
    if (!agent) throw new Error('Agent not found');
    const allowed = ['team_id', 'name', 'role', 'skills', 'experience', 'tools', 'tasks', 'personality', 'model', 'notes'];
    const fields = [];
    const values = [];
    for (const key of allowed) {
      if (key in updates) {
        fields.push(`${key} = ?`);
        values.push(['skills', 'tools', 'tasks'].includes(key) ? JSON.stringify(updates[key]) : updates[key]);
      }
    }
    if (!fields.length) return parseAgent(agent);
    fields.push('updated_at = CURRENT_TIMESTAMP');
    await dbRun(db, `UPDATE agents SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
    return parseAgent(await dbGet(db, 'SELECT * FROM agents WHERE id = ?', [id]));
  });
}

async function deleteAgent(id) {
  return withDb(async (db) => {
    const agent = await dbGet(db, 'SELECT * FROM agents WHERE id = ?', [id]);
    if (!agent) throw new Error('Agent not found');
    await dbRun(db, 'DELETE FROM agent_projects WHERE agent_id = ?', [id]);
    await dbRun(db, 'DELETE FROM agents WHERE id = ?', [id]);
    return { deleted: true };
  });
}

// ─── Briefing ─────────────────────────────────────────────────────────────────
// Returns the agent's base profile as markdown context — no project memories included.

async function getAgentBriefing(id) {
  return withDb(async (db) => {
    const agent = await dbGet(db, 'SELECT * FROM agents WHERE id = ?', [id]);
    if (!agent) throw new Error('Agent not found');
    const parsed = parseAgent(agent);

    let teamName = null;
    if (parsed.team_id) {
      const team = await dbGet(db, 'SELECT name FROM teams WHERE id = ?', [parsed.team_id]);
      if (team) teamName = team.name;
    }

    const lines = [`# Agent Profile: ${parsed.name}`, ''];
    if (parsed.role) lines.push(`**Role:** ${parsed.role}`);
    if (teamName) lines.push(`**Team:** ${teamName}`);
    if (parsed.model) lines.push(`**Model:** ${parsed.model}`);
    lines.push('');

    if (parsed.skills.length) {
      lines.push('## Skills');
      parsed.skills.forEach(s => lines.push(`- ${s}`));
      lines.push('');
    }

    if (parsed.experience) {
      lines.push('## Experience');
      lines.push(parsed.experience);
      lines.push('');
    }

    if (parsed.tools.length) {
      lines.push('## Tools');
      parsed.tools.forEach(t => lines.push(`- ${t}`));
      lines.push('');
    }

    if (parsed.tasks.length) {
      lines.push('## Core Tasks');
      parsed.tasks.forEach(t => lines.push(`- ${t}`));
      lines.push('');
    }

    if (parsed.personality) {
      lines.push('## Communication Style');
      lines.push(parsed.personality);
      lines.push('');
    }

    if (parsed.notes) {
      lines.push('## Notes');
      lines.push(parsed.notes);
      lines.push('');
    }

    lines.push('---');
    lines.push('*Base profile — no project memories loaded. Use /api/memory/query to load project-specific context.*');

    return {
      agent: parsed,
      team: teamName,
      markdown: lines.join('\n'),
      generatedAt: new Date().toISOString(),
    };
  });
}

// ─── Project Assignments ──────────────────────────────────────────────────────

async function assignToProject(agentId, projectName) {
  return withDb(async (db) => {
    const agent = await dbGet(db, 'SELECT id FROM agents WHERE id = ?', [agentId]);
    if (!agent) throw new Error('Agent not found');
    await dbRun(db,
      'INSERT OR REPLACE INTO agent_projects (agent_id, project_name, assigned_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [agentId, projectName]
    );
    return { agentId, projectName, assigned: true };
  });
}

async function getProjectAgents(projectName) {
  return withDb(async (db) => {
    const assignments = await dbAll(db, 'SELECT agent_id FROM agent_projects WHERE project_name = ?', [projectName]);
    const agents = await Promise.all(
      assignments.map(a => dbGet(db, 'SELECT * FROM agents WHERE id = ?', [a.agent_id]))
    );
    return agents.filter(Boolean).map(parseAgent);
  });
}

async function removeFromProject(agentId, projectName) {
  return withDb(async (db) => {
    await dbRun(db, 'DELETE FROM agent_projects WHERE agent_id = ? AND project_name = ?', [agentId, projectName]);
    return { removed: true };
  });
}

module.exports = {
  listTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getAgentBriefing,
  assignToProject,
  getProjectAgents,
  removeFromProject,
};
