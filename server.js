/**
 * Cognexia API Server - Data Lake Edition
 * Multi-project memory with isolated databases per project
 * Data location: ~/.openclaw/data-lake/memory-<project>/bridge.db
 * Markdown files: ~/.openclaw/data-lake/memory-<project>/memories/{id}.md
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

// Crypto module for blind indexing (optional encryption)
const cognexiaCrypto = require('./crypto');

// File upload for import
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 10000;

// Base data lake path
const DATA_LAKE_BASE = process.env.DATA_LAKE_PATH || path.join(require('os').homedir(), '.openclaw', 'data-lake');

// Middleware
app.use(express.json({ limit: '1mb' }));

// Security: CORS - Only allow localhost origins
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  next();
});

// Security: Remove server header
app.disable('x-powered-by');

// ============================================
// RATE LIMITING
// ============================================

const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100; // 100 requests per window per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  if (!rateLimits.has(ip)) {
    rateLimits.set(ip, []);
  }
  
  const attempts = rateLimits.get(ip);
  const recentAttempts = attempts.filter(time => time > windowStart);
  
  rateLimits.set(ip, recentAttempts);
  
  if (recentAttempts.length >= RATE_LIMIT_MAX) {
    return false;
  }
  
  recentAttempts.push(now);
  return true;
}

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
    });
  }
  
  next();
}

// ============================================
// STANDARDIZED RESPONSE HELPERS
// ============================================

function successResponse(data) {
  return { success: true, data, error: null };
}

function errorResponse(message, code = null) {
  return { success: false, data: null, error: message, code };
}

// ============================================
// REVERSE PROXY / HTTPS SUPPORT
// ============================================

// Trust proxy headers when behind reverse proxy (nginx, traefik, etc.)
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', true);
  console.log('[Cognexia] Trusting proxy headers (X-Forwarded-For, etc.)');
}

// Security: Force HTTPS redirect in production
app.use((req, res, next) => {
  if (process.env.FORCE_HTTPS === 'true' && !req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// Static files for web UI
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// AUTO-CLEANUP & COMPRESSION
// ============================================

/**
 * Delete old low-importance memories
 * @param {string} project - Project name
 * @param {number} days - Delete memories older than this
 * @param {number} maxImportance - Delete memories with importance <= this
 * @returns {Promise<number>} Number of memories deleted
 */
async function cleanupOldMemories(project = 'general', days = 90, maxImportance = 3) {
  const db = await getDb(project);
  
  return new Promise((resolve, reject) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    const sql = `
      DELETE FROM memories 
      WHERE created_at < ? 
        AND importance <= ?
        AND deleted_at IS NULL
    `;
    
    db.run(sql, [cutoff.toISOString(), maxImportance], function(err) {
      db.close();
      if (err) return reject(err);
      console.log(`[Cognexia Cleanup] Deleted ${this.changes} old memories from ${project}`);
      resolve(this.changes);
    });
  });
}

/**
 * Compress old memories by summarizing them
 * @param {string} project - Project name  
 * @param {number} days - Compress memories older than this
 * @returns {Promise<number>} Number of memories compressed
 */
async function compressOldMemories(project = 'general', days = 30) {
  const db = await getDb(project);
  
  return new Promise((resolve, reject) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    // Find old memories that haven't been compressed yet
    const sql = `
      SELECT id, content, content_type, created_at
      FROM memories 
      WHERE created_at < ?
        AND deleted_at IS NULL
        AND metadata NOT LIKE '%"compressed":true%'
      ORDER BY created_at DESC
      LIMIT 100
    `;
    
    db.all(sql, [cutoff.toISOString()], async (err, rows) => {
      if (err) {
        db.close();
        return reject(err);
      }
      
      if (!rows.length) {
        db.close();
        return resolve(0);
      }
      
      let compressed = 0;
      
      for (const row of rows) {
        // Simple compression: truncate long content
        if (row.content.length > 200) {
          const summary = row.content.substring(0, 197) + '...';
          
          const updateSql = `
            UPDATE memories 
            SET content = ?,
                metadata = json_object('compressed', true, 'original_length', ?),
                updated_at = ?
            WHERE id = ?
          `;
          
          await new Promise((res, rej) => {
            db.run(updateSql, [summary, row.content.length, new Date().toISOString(), row.id], (err) => {
              if (err) rej(err);
              else res();
            });
          });
          
          compressed++;
        }
      }
      
      db.close();
      console.log(`[Cognexia Compression] Compressed ${compressed} memories in ${project}`);
      resolve(compressed);
    });
  });
}

/**
 * Run maintenance: cleanup + compression on all projects
 */
async function runMaintenance() {
  console.log('[Cognexia] Running maintenance...');
  const projects = listProjects();
  let totalCleaned = 0;
  let totalCompressed = 0;
  
  for (const project of projects) {
    try {
      const cleaned = await cleanupOldMemories(project, 90, 3);
      totalCleaned += cleaned;
      
      const compressed = await compressOldMemories(project, 30);
      totalCompressed += compressed;
    } catch (err) {
      console.error(`[Cognexia] Maintenance error for ${project}:`, err.message);
    }
  }
  
  console.log(`[Cognexia] Maintenance complete: ${totalCleaned} cleaned, ${totalCompressed} compressed`);
  return { cleaned: totalCleaned, compressed: totalCompressed };
}

// ============================================
// DATA LAKE MANAGEMENT
// ============================================

/**
 * Get or create database for a project
 * @param {string} project - Project name (e.g., 'general', 'project1', 'project2')
 * @returns {string} Path to SQLite database
 */
function getProjectDbPath(project = 'general') {
  // Sanitize project name (alphanumeric, hyphens, underscores only)
  const sanitized = project.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const projectDir = path.join(DATA_LAKE_BASE, `memory-${sanitized}`);
  
  // Auto-create project directory if it doesn't exist
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
    fs.chmodSync(projectDir, 0o700); // Owner-only access
    console.log(`[Cognexia] Created new project memory: ${sanitized}`);
  }
  
  return path.join(projectDir, 'bridge.db');
}

/**
 * Initialize SQLite database with schema
 * @param {string} dbPath - Path to database file
 * @returns {Promise<void>}
 */
function initDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL DEFAULT 'default',
        content TEXT NOT NULL,
        content_type TEXT DEFAULT 'insight',
        metadata TEXT,
        importance INTEGER DEFAULT 5,
        project TEXT DEFAULT 'general',
        pinned INTEGER DEFAULT 0,
        published INTEGER DEFAULT 0,
        published_at DATETIME,
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );
      
      CREATE INDEX IF NOT EXISTS idx_agent ON memories(agent_id);
      CREATE INDEX IF NOT EXISTS idx_project ON memories(project);
      CREATE INDEX IF NOT EXISTS idx_created ON memories(created_at);
      CREATE INDEX IF NOT EXISTS idx_content_type ON memories(content_type);
      CREATE INDEX IF NOT EXISTS idx_pinned ON memories(pinned);
      CREATE INDEX IF NOT EXISTS idx_published ON memories(published);
    `, (err) => {
      if (err) {
        db.close();
        return reject(err);
      }
      console.log(`[Cognexia] Initialized database: ${dbPath}`);
      db.close();
      resolve();
    });
  });
}

/**
 * Get database connection for project
 * @param {string} project - Project name
 * @returns {Promise<sqlite3.Database>} Database connection
 */
async function getDb(project = 'general') {
  const dbPath = getProjectDbPath(project);
  
  // Initialize if first time
  if (!fs.existsSync(dbPath)) {
    await initDatabase(dbPath);
  }
  
  return new sqlite3.Database(dbPath);
}

/**
 * Generate unique ID for memory
 */
function generateId() {
  return crypto.randomUUID();
}

// ============================================
// MARKDOWN FILE STORAGE
// ============================================

/**
 * Get the markdown files directory for a project
 */
function getMarkdownDir(project = 'general') {
  const sanitized = project.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return path.join(DATA_LAKE_BASE, `memory-${sanitized}`, 'memories');
}

/**
 * Ensure the markdown directory exists for a project
 */
function ensureMarkdownDir(project = 'general') {
  const dir = getMarkdownDir(project);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.chmodSync(dir, 0o700);
  }
  return dir;
}

/**
 * Save a memory as a Markdown file with YAML frontmatter
 * @param {Object} memory - Memory object
 * @returns {Promise<string>} - Path to saved file
 */
async function saveMemoryMarkdown(memory) {
  const dir = ensureMarkdownDir(memory.project || 'general');
  const filePath = path.join(dir, `${memory.id}.md`);
  
  // Build frontmatter
  const frontmatter = [
    '---',
    `id: ${memory.id}`,
    `type: ${memory.content_type || 'insight'}`,
    `importance: ${memory.importance || 5}`,
    `tags: [${(memory.tags || []).join(', ')}]`,
    `created_at: ${memory.created_at || new Date().toISOString()}`,
    `published: ${memory.published ? 'true' : 'false'}`,
    `pinned: ${memory.pinned ? 'true' : 'false'}`,
    `agent_id: ${memory.agent_id || 'default'}`,
    `project: ${memory.project || 'general'}`,
    '---',
    ''
  ].join('\n');
  
  // Write file with frontmatter + content
  const content = frontmatter + (memory.content || '');
  fs.writeFileSync(filePath, content, 'utf8');
  
  return filePath;
}

/**
 * Parse frontmatter from markdown content
 * @param {string} markdownContent - Raw markdown content
 * @returns {Object} - { metadata: {}, content: string }
 */
function parseFrontmatter(markdownContent) {
  const metadata = {};
  let content = markdownContent;
  
  // Check for frontmatter
  if (markdownContent.trim().startsWith('---')) {
    const endMatch = markdownContent.indexOf('---', 3);
    if (endMatch !== -1) {
      const frontmatterBlock = markdownContent.slice(3, endMatch).trim();
      content = markdownContent.slice(endMatch + 3).trim();
      
      // Parse frontmatter lines
      const lines = frontmatterBlock.split('\n');
      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          const key = line.slice(0, colonIdx).trim();
          let value = line.slice(colonIdx + 1).trim();
          
          // Parse arrays (tags)
          if (value.startsWith('[') && value.endsWith(']')) {
            value = value.slice(1, -1).split(',').map(v => v.trim()).filter(v => v);
          }
          // Parse booleans
          else if (value === 'true') value = true;
          else if (value === 'false') value = false;
          // Parse numbers
          else if (!isNaN(value) && value !== '') value = Number(value);
          
          metadata[key] = value;
        }
      }
    }
  }
  
  return { metadata, content };
}

/**
 * Read a memory from its Markdown file
 * @param {string} memoryId - Memory ID
 * @param {string} project - Project name
 * @returns {Object|null} - Memory object or null if not found
 */
function getMemoryMarkdown(memoryId, project = 'general') {
  const filePath = path.join(getMarkdownDir(project), `${memoryId}.md`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  const markdownContent = fs.readFileSync(filePath, 'utf8');
  const { metadata, content } = parseFrontmatter(markdownContent);
  
  return {
    id: metadata.id || memoryId,
    content_type: metadata.type || 'insight',
    importance: metadata.importance || 5,
    tags: metadata.tags || [],
    created_at: metadata.created_at || null,
    published: metadata.published || false,
    pinned: metadata.pinned || false,
    agent_id: metadata.agent_id || 'default',
    project: metadata.project || project,
    content: content
  };
}

/**
 * Delete a memory's Markdown file
 * @param {string} memoryId - Memory ID
 * @param {string} project - Project name
 * @returns {boolean} - True if deleted, false if not found
 */
function deleteMemoryMarkdown(memoryId, project = 'general') {
  const filePath = path.join(getMarkdownDir(project), `${memoryId}.md`);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/**
 * Check if a memory has a Markdown file
 * @param {string} memoryId - Memory ID
 * @param {string} project - Project name
 * @returns {boolean}
 */
function hasMemoryMarkdown(memoryId, project = 'general') {
  const filePath = path.join(getMarkdownDir(project), `${memoryId}.md`);
  return fs.existsSync(filePath);
}

/**
 * Migrate memories from SQLite to Markdown files
 * @param {string} project - Project name
 * @returns {Promise<{migrated: number, failed: number}>}
 */
async function migrateMemoriesToMarkdown(project = 'general') {
  const db = await getDb(project);
  const dir = ensureMarkdownDir(project);
  
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM memories WHERE deleted_at IS NULL', [], async (err, rows) => {
      if (err) {
        db.close();
        return reject(err);
      }
      
      let migrated = 0;
      let failed = 0;
      
      for (const row of rows) {
        try {
          const filePath = path.join(dir, `${row.id}.md`);
          
          // Skip if already migrated
          if (fs.existsSync(filePath)) {
            migrated++;
            continue;
          }
          
          // Parse tags from JSON or use empty array
          let tags = [];
          try {
            tags = row.tags ? JSON.parse(row.tags) : [];
          } catch (e) {}
          
          const memory = {
            id: row.id,
            content: row.content,
            content_type: row.content_type,
            importance: row.importance,
            tags: tags,
            created_at: row.created_at,
            published: row.published === 1,
            pinned: row.pinned === 1,
            agent_id: row.agent_id,
            project: row.project
          };
          
          await saveMemoryMarkdown(memory);
          migrated++;
        } catch (e) {
          console.error(`[Migration] Failed to migrate memory ${row.id}:`, e.message);
          failed++;
        }
      }
      
      db.close();
      console.log(`[Cognexia Migration] Migrated ${migrated} memories to Markdown, ${failed} failed`);
      resolve({ migrated, failed });
    });
  });
}

/**
 * Migrate all projects to Markdown storage
 */
async function migrateAllProjectsToMarkdown() {
  const projects = listProjects();
  const results = {};
  
  for (const project of projects) {
    try {
      results[project] = await migrateMemoriesToMarkdown(project);
    } catch (e) {
      console.error(`[Migration] Failed for project ${project}:`, e.message);
      results[project] = { migrated: 0, failed: 0, error: e.message };
    }
  }
  
  return results;
}

// ============================================
// MEMORY BRIDGE CORE FUNCTIONS
// ============================================

/**
 * Store a memory (saves to both SQLite index and Markdown file)
 */
async function storeMemory({ content, type = 'insight', importance = 5, agentId = 'default', project = 'general', metadata = {}, pinned = false, published = false, tags = [] }) {
  // Extract tags from content if not provided
  if (!tags || tags.length === 0) {
    tags = content.match(/#[\w]+/g) || [];
  }
  
  const db = await getDb(project);
  const id = generateId();
  const now = new Date().toISOString();
  
  // Save to SQLite index
  await new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO memories (id, agent_id, content, content_type, importance, project, metadata, pinned, published, published_at, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run([id, agentId, content, type, importance, project, JSON.stringify(metadata), pinned ? 1 : 0, published ? 1 : 0, published ? now : null, JSON.stringify(tags), now], function(err) {
      if (err) {
        stmt.finalize();
        db.close();
        return reject(err);
      }
      stmt.finalize();
      db.close();
      resolve();
    });
  });
  
  // Save as Markdown file with frontmatter
  try {
    await saveMemoryMarkdown({
      id,
      content,
      content_type: type,
      importance,
      tags,
      created_at: now,
      published,
      pinned,
      agent_id: agentId,
      project
    });
  } catch (mdErr) {
    console.error('[StoreMemory] Failed to save markdown:', mdErr.message);
    // Continue anyway - SQLite is the source of truth for index
  }
  
  return {
    id,
    content,
    type,
    importance,
    project,
    agentId,
    published,
    createdAt: now
  };
}

/**
 * Query memories with full-text search
 */
async function queryMemories({ query, project = 'general', agentId, limit = 5, days = 30, type }) {
  const db = await getDb(project);
  
  return new Promise((resolve, reject) => {
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    let sql = `
      SELECT id, agent_id, content, content_type, importance, metadata, created_at,
             (LENGTH(content) - LENGTH(REPLACE(LOWER(content), LOWER(?), ''))) / LENGTH(?) as relevance
      FROM memories
      WHERE deleted_at IS NULL
        AND created_at > ?
    `;
    const params = [query, query, since.toISOString()];
    
    if (agentId) {
      sql += ' AND agent_id = ?';
      params.push(agentId);
    }
    
    if (type) {
      sql += ' AND content_type = ?';
      params.push(type);
    }
    
    // Simple keyword matching (fallback if FTS not available)
    sql += ` AND (
      LOWER(content) LIKE LOWER(?) 
      OR LOWER(content) LIKE LOWER(?)
    )`;
    params.push(`%${query}%`, `%${query.split(' ').join('%')}%`);
    
    sql += ' ORDER BY importance DESC, relevance DESC, created_at DESC LIMIT ?';
    params.push(limit);
    
    db.all(sql, params, (err, rows) => {
      db.close();
      if (err) return reject(err);
      resolve(rows.map(row => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : {}
      })));
    });
  });
}

/**
 * Get timeline of memories
 */
async function getTimeline({ project = 'general', agentId, days = 7 }) {
  const db = await getDb(project);
  
  return new Promise((resolve, reject) => {
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    let sql = `
      SELECT id, agent_id, content, content_type, importance, pinned, published, tags, created_at
      FROM memories
      WHERE deleted_at IS NULL
        AND created_at > ?
    `;
    const params = [since.toISOString()];
    
    if (agentId) {
      sql += ' AND agent_id = ?';
      params.push(agentId);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    db.all(sql, params, (err, rows) => {
      db.close();
      if (err) return reject(err);
      
      // Group by date
      const timeline = {};
      rows.forEach(row => {
        const date = row.created_at.split('T')[0];
        if (!timeline[date]) timeline[date] = [];
        timeline[date].push({...row, pinned: row.pinned === 1, published: row.published === 1});
      });
      
      resolve(timeline);
    });
  });
}

/**
 * Get all projects in data lake
 */
function listProjects() {
  if (!fs.existsSync(DATA_LAKE_BASE)) return [];
  
  return fs.readdirSync(DATA_LAKE_BASE)
    .filter(name => name.startsWith('memory-'))
    .map(name => name.replace('memory-', ''));
}

// ============================================
// API ROUTES
// ============================================

// Apply rate limiting to all API routes
app.use('/api', rateLimitMiddleware);

// Health check - shows all projects
app.get('/api/health', (req, res) => {
  const projects = listProjects();
  res.json(successResponse({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0-data-lake',
    dataLake: DATA_LAKE_BASE,
    projects: projects.length > 0 ? projects : ['general'],
    totalProjects: projects.length
  }));
});

// List all projects
app.get('/api/projects', (req, res) => {
  res.json(successResponse({
    projects: listProjects(),
    dataLake: DATA_LAKE_BASE
  }));
});

// Store memory
app.post('/api/memory/store', async (req, res) => {
  try {
    const { content, type, importance, agentId, project, metadata, published } = req.body;
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json(errorResponse('Content required (string)', 'VALIDATION_ERROR'));
    }
    
    if (content.length > 10000) {
      return res.status(400).json(errorResponse('Content too long (max 10000 chars)', 'VALIDATION_ERROR'));
    }
    
    const result = await storeMemory({
      content,
      type: type || 'insight',
      importance: Math.min(10, Math.max(1, importance || 5)),
      agentId: agentId || 'default',
      project: project || 'general',
      metadata: metadata || {},
      published: !!published
    });
    
    res.json(successResponse(result));
  } catch (err) {
    console.error('[Store Error]', err);
    res.status(500).json(errorResponse(err.message, 'STORE_ERROR'));
  }
});

// Get recent memories (browse without search)
app.get('/api/memory/recent', async (req, res) => {
  try {
    const { project, limit, days } = req.query;
    const db = await getDb(project || 'general');
    
    return new Promise((resolve, reject) => {
      const since = new Date();
      since.setDate(since.getDate() - (parseInt(days) || 30));
      
      const sql = `
        SELECT id, agent_id, content, content_type, importance, metadata, created_at
        FROM memories
        WHERE deleted_at IS NULL
          AND created_at > ?
        ORDER BY created_at DESC
        LIMIT ?
      `;
      
      db.all(sql, [since.toISOString(), parseInt(limit) || 20], (err, rows) => {
        db.close();
        if (err) return reject(err);
        resolve(rows.map(row => ({
          ...row,
          metadata: row.metadata ? JSON.parse(row.metadata) : {}
        })));
      });
    }).then(results => {
      res.json(successResponse({
        project: project || 'general',
        count: results.length,
        results
      }));
    });
  } catch (err) {
    console.error('[Recent Error]', err);
    res.status(500).json(errorResponse(err.message, 'RECENT_ERROR'));
  }
});

// Get memory types used in project (for dropdown filter)
app.get('/api/memory/types', async (req, res) => {
  try {
    const { project } = req.query;
    const db = await getDb(project || 'general');
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT content_type, COUNT(*) as count
        FROM memories
        WHERE deleted_at IS NULL
        GROUP BY content_type
        ORDER BY count DESC
      `;
      
      db.all(sql, [], (err, rows) => {
        db.close();
        if (err) return reject(err);
        resolve(rows);
      });
    }).then(types => {
      res.json(successResponse({
        project: project || 'general',
        types
      }));
    });
  } catch (err) {
    console.error('[Types Error]', err);
    res.status(500).json(errorResponse(err.message, 'TYPES_ERROR'));
  }
});

// Get keyword suggestions from memories
app.get('/api/memory/keywords', async (req, res) => {
  try {
    const { project, limit } = req.query;
    const db = await getDb(project || 'general');
    
    return new Promise((resolve, reject) => {
      // Get recent memory content
      const sql = `
        SELECT content
        FROM memories
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 100
      `;
      
      db.all(sql, [], (err, rows) => {
        db.close();
        if (err) return reject(err);
        
        // Extract common words (simple approach)
        const wordCounts = {};
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their']);
        
        rows.forEach(row => {
          const words = row.content.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3 && !stopWords.has(w));
          
          words.forEach(word => {
            wordCounts[word] = (wordCounts[word] || 0) + 1;
          });
        });
        
        // Sort by frequency
        const keywords = Object.entries(wordCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, parseInt(limit) || 20)
          .map(([word, count]) => ({ word, count }));
        
        resolve(keywords);
      });
    }).then(keywords => {
      res.json(successResponse({
        project: project || 'general',
        keywords
      }));
    });
  } catch (err) {
    console.error('[Keywords Error]', err);
    res.status(500).json(errorResponse(err.message, 'KEYWORDS_ERROR'));
  }
});

// Query memories
app.get('/api/memory/query', async (req, res) => {
  try {
    const { q, project, agentId, limit, days, type } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" required' });
    }
    
    const results = await queryMemories({
      query: q,
      project: project || 'general',
      agentId,
      limit: parseInt(limit) || 5,
      days: parseInt(days) || 30,
      type
    });
    
    res.json(successResponse({
      query: q,
      project: project || 'general',
      count: results.length,
      results
    }));
  } catch (err) {
    console.error('[Query Error]', err);
    res.status(500).json(errorResponse(err.message, 'QUERY_ERROR'));
  }
});

// Get timeline
app.get('/api/memory/timeline', async (req, res) => {
  try {
    const { project, agentId, days } = req.query;
    
    const timeline = await getTimeline({
      project: project || 'general',
      agentId,
      days: parseInt(days) || 7
    });
    
    res.json(successResponse({
      project: project || 'general',
      days: parseInt(days) || 7,
      timeline
    }));
  } catch (err) {
    console.error('[Timeline Error]', err);
    res.status(500).json(errorResponse(err.message, 'TIMELINE_ERROR'));
  }
});

// Get all memories for current project (for graph view)
app.get('/api/memory/all', async (req, res) => {
  try {
    const { project, days } = req.query;
    const db = await getDb(project || 'general');
    
    const since = new Date();
    since.setDate(since.getDate() - (parseInt(days) || 30));
    
    const memories = await new Promise((resolve, reject) => {
      const sql = `
        SELECT id, agent_id, content, content_type, importance, pinned, published, tags, created_at
        FROM memories
        WHERE deleted_at IS NULL
          AND created_at > ?
        ORDER BY pinned DESC, importance DESC, created_at DESC
      `;
      
      db.all(sql, [since.toISOString()], (err, rows) => {
        db.close();
        if (err) reject(err);
        else {
          resolve(rows.map(row => ({
            ...row,
            pinned: row.pinned === 1,
            published: row.published === 1,
            tags: row.tags ? JSON.parse(row.tags) : []
          })));
        }
      });
    });
    
    // Try to load content from Markdown files when available
    const projectName = project || 'general';
    const memoriesWithContent = memories.map(memory => {
      const mdMemory = getMemoryMarkdown(memory.id, projectName);
      if (mdMemory) {
        return {
          ...memory,
          content: mdMemory.content,
          hasMarkdown: true
        };
      }
      return {
        ...memory,
        hasMarkdown: false
      };
    });
    
    res.json(successResponse({
      project: projectName,
      count: memoriesWithContent.length,
      memories: memoriesWithContent
    }));
  } catch (err) {
    console.error('[All Memories Error]', err);
    res.status(500).json(errorResponse(err.message, 'ALL_MEMORIES_ERROR'));
  }
});

// Get single memory by ID (reads from Markdown file if available)
app.get('/api/memory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { project } = req.query;
    const projectName = project || 'general';
    
    // Try markdown first
    const mdMemory = getMemoryMarkdown(id, projectName);
    if (mdMemory) {
      return res.json(successResponse({
        ...mdMemory,
        hasMarkdown: true
      }));
    }
    
    // Fall back to SQLite
    const db = await getDb(projectName);
    const memory = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM memories WHERE id = ? AND deleted_at IS NULL', [id], (err, row) => {
        db.close();
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!memory) {
      return res.status(404).json(errorResponse('Memory not found'));
    }
    
    res.json(successResponse({
      ...memory,
      pinned: memory.pinned === 1,
      published: memory.published === 1,
      tags: memory.tags ? JSON.parse(memory.tags) : [],
      hasMarkdown: false
    }));
  } catch (err) {
    console.error('[Get Memory Error]', err);
    res.status(500).json(errorResponse(err.message, 'GET_MEMORY_ERROR'));
  }
});

// Get backlinks for a memory
app.get('/api/memory/:id/backlinks', async (req, res) => {
  try {
    const { id } = req.params;
    const { project } = req.query;
    const db = await getDb(project || 'general');
    
    // Get the target memory
    const targetMemory = await new Promise((resolve, reject) => {
      db.get('SELECT content FROM memories WHERE id = ? AND deleted_at IS NULL', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!targetMemory) {
      db.close();
      return res.status(404).json(errorResponse('Memory not found'));
    }
    
    // Extract words from target memory (exclude common words)
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'what', 'when', 'where', 'why', 'how', 'not', 'all', 'any', 'some', 'every', 'each']);
    const targetWords = new Set(
      targetMemory.content.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w))
    );
    
    // Find memories that share significant words
    const backlinks = await new Promise((resolve, reject) => {
      const sql = `
        SELECT id, content, content_type, importance, created_at
        FROM memories
        WHERE deleted_at IS NULL
          AND id != ?
        ORDER BY created_at DESC
        LIMIT 50
      `;
      
      db.all(sql, [id], (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // Score backlinks by shared keywords
    const scoredBacklinks = backlinks.map(mem => {
      const memWords = new Set(
        mem.content.toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .filter(w => w.length > 3 && !stopWords.has(w))
      );
      
      let sharedCount = 0;
      targetWords.forEach(w => {
        if (memWords.has(w)) sharedCount++;
      });
      
      // Also check if any target word appears as a hashtag in source
      const hasDirectRef = Array.from(targetWords).some(w => 
        mem.content.toLowerCase().includes('#' + w)
      );
      
      return {
        ...mem,
        sharedKeywords: sharedCount,
        hasDirectReference: hasDirectRef,
        relevanceScore: sharedCount + (hasDirectRef ? 5 : 0)
      };
    }).filter(m => m.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10);
    
    res.json(successResponse({
      memoryId: id,
      backlinks: scoredBacklinks
    }));
  } catch (err) {
    console.error('[Backlinks Error]', err);
    res.status(500).json(errorResponse(err.message, 'BACKLINKS_ERROR'));
  }
});

// Update memory
app.patch('/api/memory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, type, importance, project, pinned, tags, published } = req.body;
    
    if (!content && !type && importance === undefined && pinned === undefined && tags === undefined && published === undefined) {
      return res.status(400).json(errorResponse('At least one field required to update'));
    }
    
    // Extract tags from content if tags not provided but content changed
    let finalTags = tags;
    if (tags === undefined && content) {
      finalTags = content.match(/#[\w]+/g) || [];
    }
    
    const db = await getDb(project || 'general');
    
    // First check if memory exists
    const memory = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM memories WHERE id = ? AND deleted_at IS NULL', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!memory) {
      db.close();
      return res.status(404).json(errorResponse('Memory not found'));
    }
    
    const updates = [];
    const params = [];
    
    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
    }
    if (type !== undefined) {
      updates.push('content_type = ?');
      params.push(type);
    }
    if (importance !== undefined) {
      updates.push('importance = ?');
      params.push(Math.min(10, Math.max(1, parseInt(importance))));
    }
    if (pinned !== undefined) {
      updates.push('pinned = ?');
      params.push(pinned ? 1 : 0);
    }
    if (finalTags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(finalTags));
    }
    if (published !== undefined) {
      updates.push('published = ?');
      params.push(published ? 1 : 0);
      if (published) {
        updates.push('published_at = ?');
        params.push(new Date().toISOString());
      }
    }
    
    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    
    await new Promise((resolve, reject) => {
      const sql = `UPDATE memories SET ${updates.join(', ')} WHERE id = ?`;
      db.run(sql, params, function(err) {
        db.close();
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Update Markdown file if content changed
    if (content !== undefined || tags !== undefined || pinned !== undefined || published !== undefined) {
      try {
        const projectName = project || 'general';
        const mdMemory = getMemoryMarkdown(id, projectName);
        if (mdMemory) {
          await saveMemoryMarkdown({
            id,
            content: content !== undefined ? content : mdMemory.content,
            content_type: type !== undefined ? type : mdMemory.content_type,
            importance: importance !== undefined ? importance : mdMemory.importance,
            tags: finalTags !== undefined ? finalTags : mdMemory.tags,
            created_at: mdMemory.created_at,
            published: published !== undefined ? published : mdMemory.published,
            pinned: pinned !== undefined ? pinned : mdMemory.pinned,
            agent_id: mdMemory.agent_id,
            project: projectName
          });
        }
      } catch (mdErr) {
        console.error('[UpdateMemory] Failed to update markdown:', mdErr.message);
      }
    }
    
    res.json(successResponse({ id, updated: true }));
  } catch (err) {
    console.error('[Update Error]', err);
    res.status(500).json(errorResponse(err.message, 'UPDATE_ERROR'));
  }
});

// Delete memory (soft delete)
app.delete('/api/memory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { project } = req.query;
    const db = await getDb(project || 'general');
    
    // Check if memory exists
    const memory = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM memories WHERE id = ? AND deleted_at IS NULL', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!memory) {
      db.close();
      return res.status(404).json(errorResponse('Memory not found'));
    }
    
    // Soft delete
    await new Promise((resolve, reject) => {
      db.run('UPDATE memories SET deleted_at = ? WHERE id = ?', [new Date().toISOString(), id], function(err) {
        db.close();
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Delete Markdown file if exists
    try {
      deleteMemoryMarkdown(id, project || 'general');
    } catch (mdErr) {
      console.error('[DeleteMemory] Failed to delete markdown:', mdErr.message);
    }
    
    res.json(successResponse({ id, deleted: true }));
  } catch (err) {
    console.error('[Delete Error]', err);
    res.status(500).json(errorResponse(err.message, 'DELETE_ERROR'));
  }
});

// Bulk delete memories
app.post('/api/memory/bulk-delete', async (req, res) => {
  try {
    const { ids, project } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json(errorResponse('ids array required'));
    }
    
    const db = await getDb(project || 'general');
    const now = new Date().toISOString();
    
    await new Promise((resolve, reject) => {
      const placeholders = ids.map(() => '?').join(',');
      db.run(`UPDATE memories SET deleted_at = ? WHERE id IN (${placeholders})`, [now, ...ids], function(err) {
        db.close();
        if (err) reject(err);
        else resolve();
      });
    });
    
    res.json(successResponse({ deleted: ids.length, ids }));
  } catch (err) {
    console.error('[Bulk Delete Error]', err);
    res.status(500).json(errorResponse(err.message, 'BULK_DELETE_ERROR'));
  }
});

// Merge memories
app.post('/api/memory/merge', async (req, res) => {
  try {
    const { ids, project } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length < 2) {
      return res.status(400).json(errorResponse('At least 2 memory IDs required to merge'));
    }
    
    const db = await getDb(project || 'general');
    
    // Get all memories to merge
    const memories = await new Promise((resolve, reject) => {
      const placeholders = ids.map(() => '?').join(',');
      db.all(`SELECT * FROM memories WHERE id IN (${placeholders}) AND deleted_at IS NULL`, ids, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    if (memories.length < 2) {
      db.close();
      return res.status(400).json(errorResponse('Need at least 2 valid memories to merge'));
    }
    
    // Merge content with separator
    const mergedContent = memories.map(m => `[${m.content_type.toUpperCase()}] ${m.content}`).join('\n\n---\n\n');
    
    // Use highest importance from the group
    const maxImportance = Math.max(...memories.map(m => m.importance));
    
    // Use most recent created_at
    const earliestCreated = memories.reduce((min, m) => m.created_at < min ? m.created_at : min, memories[0].created_at);
    
    // Create new merged memory
    const newId = generateId();
    const now = new Date().toISOString();
    
    await new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO memories (id, agent_id, content, content_type, importance, project, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run([newId, 'merged', mergedContent, 'insight', maxImportance, project || 'general', JSON.stringify({ merged_from: ids }), earliestCreated], function(err) {
        stmt.finalize();
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Soft delete original memories
    await new Promise((resolve, reject) => {
      const placeholders = ids.map(() => '?').join(',');
      db.run(`UPDATE memories SET deleted_at = ? WHERE id IN (${placeholders})`, [now, ...ids], function(err) {
        db.close();
        if (err) reject(err);
        else resolve();
      });
    });
    
    res.json(successResponse({ 
      id: newId, 
      merged: ids.length,
      content_preview: mergedContent.substring(0, 100) + '...'
    }));
  } catch (err) {
    console.error('[Merge Error]', err);
    res.status(500).json(errorResponse(err.message, 'MERGE_ERROR'));
  }
});

// Query across ALL projects (cascading search)
app.get('/api/memory/query-all', async (req, res) => {
  try {
    const { q, agentId, limit } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" required' });
    }
    
    const projects = listProjects();
    const allResults = [];
    
    for (const project of projects) {
      const results = await queryMemories({
        query: q,
        project,
        agentId,
        limit: parseInt(limit) || 3
      });
      allResults.push(...results.map(r => ({ ...r, project })));
    }
    
    // Sort by importance, then relevance
    allResults.sort((a, b) => b.importance - a.importance);
    
    res.json(successResponse({
      query: q,
      projectsSearched: projects,
      count: allResults.length,
      results: allResults.slice(0, parseInt(limit) || 10)
    }));
  } catch (err) {
    console.error('[Query-All Error]', err);
    res.status(500).json(errorResponse(err.message, 'QUERY_ALL_ERROR'));
  }
});

// ============================================
// ENCRYPTED STORAGE (Blind Indexing)
// ============================================

// Initialize encrypted storage schema
async function initEncryptedSchema(project) {
  const dbPath = getProjectDbPath(project);
  const db = new sqlite3.Database(dbPath);
  
  return new Promise((resolve, reject) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS encrypted_memories (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL DEFAULT 'default',
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        content_type TEXT DEFAULT 'insight',
        importance INTEGER DEFAULT 5,
        project TEXT DEFAULT 'general',
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      );
      
      CREATE TABLE IF NOT EXISTS blind_indexes (
        memory_id TEXT NOT NULL,
        index_hash TEXT NOT NULL,
        FOREIGN KEY (memory_id) REFERENCES encrypted_memories(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_blind_hash ON blind_indexes(index_hash);
    `, (err) => {
      db.close();
      if (err) reject(err);
      else resolve();
    });
  });
}

// Store encrypted memory with blind indexes
app.post('/api/memory/store-encrypted', async (req, res) => {
  try {
    const { content, type, importance, agentId, project, metadata } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }
    
    // Get or create encryption key
    const key = cognexiaCrypto.getOrCreateKey();
    
    // Encrypt content and generate blind indexes
    const encrypted = cognexiaCrypto.encryptWithIndex(content, key);
    
    // Initialize schema if needed
    await initEncryptedSchema(project || 'general');
    
    const db = await getDb(project || 'general');
    const id = generateId();
    const now = new Date().toISOString();
    
    // Store encrypted memory
    await new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO encrypted_memories (id, agent_id, ciphertext, iv, content_type, importance, project, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run([
        id,
        agentId || 'default',
        encrypted.ciphertext,
        encrypted.iv,
        type || 'insight',
        Math.min(10, Math.max(1, importance || 5)),
        project || 'general',
        JSON.stringify(metadata || {}),
        now
      ], function(err) {
        stmt.finalize();
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Store blind indexes
    await new Promise((resolve, reject) => {
      const stmt = db.prepare('INSERT INTO blind_indexes (memory_id, index_hash) VALUES (?, ?)');
      let completed = 0;
      
      if (encrypted.blindIndexes.length === 0) {
        resolve();
        return;
      }
      
      encrypted.blindIndexes.forEach(indexHash => {
        stmt.run([id, indexHash], (err) => {
          if (err) reject(err);
          completed++;
          if (completed === encrypted.blindIndexes.length) {
            stmt.finalize();
            resolve();
          }
        });
      });
    });
    
    db.close();
    
    res.json(successResponse({
      id,
      encrypted: true,
      blindIndexes: encrypted.blindIndexes.length,
      project: project || 'general',
      createdAt: now
    }));
  } catch (err) {
    console.error('[Store-Encrypted Error]', err);
    res.status(500).json(errorResponse(err.message, 'STORE_ENCRYPTED_ERROR'));
  }
});

// Query encrypted memories using blind indexes
app.get('/api/memory/query-encrypted', async (req, res) => {
  try {
    const { q, project, limit } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" required' });
    }
    
    const key = cognexiaCrypto.getOrCreateKey();
    const queryIndex = cognexiaCrypto.generateQueryIndex(q, key);
    
    const db = await getDb(project || 'general');
    
    // Query using blind index
    const results = await new Promise((resolve, reject) => {
      const sql = `
        SELECT em.id, em.ciphertext, em.iv, em.content_type, em.importance, em.metadata, em.created_at
        FROM encrypted_memories em
        JOIN blind_indexes bi ON em.id = bi.memory_id
        WHERE bi.index_hash = ?
          AND em.deleted_at IS NULL
        ORDER BY em.importance DESC, em.created_at DESC
        LIMIT ?
      `;
      
      db.all(sql, [queryIndex, parseInt(limit) || 10], (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // Decrypt results for client (client should do this in production)
    const decryptedResults = results.map(row => {
      try {
        const plaintext = cognexiaCrypto.decrypt(row.ciphertext, row.iv, key);
        return {
          id: row.id,
          content: plaintext,
          type: row.content_type,
          importance: row.importance,
          metadata: row.metadata ? JSON.parse(row.metadata) : {},
          created_at: row.created_at
        };
      } catch (decryptErr) {
        return {
          id: row.id,
          content: '[decryption failed]',
          type: row.content_type,
          importance: row.importance,
          error: true,
          created_at: row.created_at
        };
      }
    });
    
    res.json(successResponse({
      query: q,
      blindIndex: queryIndex.substring(0, 16) + '...',
      project: project || 'general',
      count: decryptedResults.length,
      encrypted: true,
      results: decryptedResults
    }));
  } catch (err) {
    console.error('[Query-Encrypted Error]', err);
    res.status(500).json(errorResponse(err.message, 'QUERY_ENCRYPTED_ERROR'));
  }
});

// Get encryption status
app.get('/api/crypto/status', (req, res) => {
  const enabled = cognexiaCrypto.isEncryptionEnabled();
  res.json(successResponse({
    encryptionEnabled: enabled,
    keyExists: fs.existsSync(path.join(require('os').homedir(), '.openclaw', 'cognexia.key')),
    algorithm: 'AES-256-GCM',
    indexing: 'HMAC-SHA256 (blind indexes)',
    note: 'Server can search but cannot read content without client key'
  }));
});

// Enable encryption
app.post('/api/crypto/enable', (req, res) => {
  try {
    cognexiaCrypto.enableEncryption();
    res.json(successResponse({ 
      message: 'Encryption enabled. New memories will be encrypted.',
      warning: 'Existing memories remain unencrypted. Migrate if needed.'
    }));
  } catch (err) {
    res.status(500).json(errorResponse(err.message, 'CRYPTO_ENABLE_ERROR'));
  }
});

// Cleanup old memories
app.post('/api/cleanup', async (req, res) => {
  try {
    const { project, days, maxImportance } = req.body;
    const deleted = await cleanupOldMemories(
      project || 'general',
      days || 90,
      maxImportance || 3
    );
    res.json(successResponse({ 
      deleted,
      project: project || 'general',
      criteria: `Older than ${days || 90} days, importance <= ${maxImportance || 3}`
    }));
  } catch (err) {
    console.error('[Cleanup Error]', err);
    res.status(500).json(errorResponse(err.message, 'CLEANUP_ERROR'));
  }
});

// Compress old memories
app.post('/api/compress', async (req, res) => {
  try {
    const { project, days } = req.body;
    const compressed = await compressOldMemories(
      project || 'general',
      days || 30
    );
    res.json(successResponse({ 
      compressed,
      project: project || 'general',
      criteria: `Older than ${days || 30} days`
    }));
  } catch (err) {
    console.error('[Compress Error]', err);
    res.status(500).json(errorResponse(err.message, 'COMPRESS_ERROR'));
  }
});

// Run full maintenance
app.post('/api/maintenance', async (req, res) => {
  try {
    const result = await runMaintenance();
    res.json(successResponse({
      ...result,
      timestamp: new Date().toISOString()
    }));
  } catch (err) {
    console.error('[Maintenance Error]', err);
    res.status(500).json(errorResponse(err.message, 'MAINTENANCE_ERROR'));
  }
});

// Migrate memories to Markdown storage
app.post('/api/migrate/markdown', async (req, res) => {
  try {
    const { project } = req.body;

    let result;
    if (project) {
      result = await migrateMemoriesToMarkdown(project);
    } else {
      result = await migrateAllProjectsToMarkdown();
    }

    res.json(successResponse({
      migration: result,
      message: project
        ? `Migrated project '${project}' to Markdown storage`
        : 'Migrated all projects to Markdown storage'
    }));
  } catch (err) {
    console.error('[Migration Error]', err);
    res.status(500).json(errorResponse(err.message, 'MIGRATION_ERROR'));
  }
});

// Get migration status
app.get('/api/migrate/status', async (req, res) => {
  try {
    const { project } = req.query;
    const projects = project ? [project] : listProjects();
    const status = {};

    for (const proj of projects) {
      const db = await getDb(proj);
      const count = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM memories WHERE deleted_at IS NULL', [], (err, row) => {
          db.close();
          if (err) reject(err);
          else resolve(row.count);
        });
      });

      const mdDir = getMarkdownDir(proj);
      let mdCount = 0;
      if (fs.existsSync(mdDir)) {
        mdCount = fs.readdirSync(mdDir).filter(f => f.endsWith('.md')).length;
      }

      status[proj] = {
        sqliteCount: count,
        markdownCount: mdCount,
        migrated: mdCount > 0 && mdCount >= count * 0.9,
        progress: count > 0 ? Math.round((mdCount / count) * 100) : 100
      };
    }

    res.json(successResponse({ status }));
  } catch (err) {
    console.error('[Migration Status Error]', err);
    res.status(500).json(errorResponse(err.message, 'MIGRATION_STATUS_ERROR'));
  }
});

// ============================================
// MEMORY GRAPH API
// ============================================

const memoryGraph = require('./memory-graph');

// Initialize graph schema for all existing projects
async function initAllGraphSchemas() {
  const projects = listProjects();
  for (const project of projects) {
    try {
      const db = await getDb(project);
      await memoryGraph.initGraphSchema(db);
      db.close();
    } catch (err) {
      console.error(`[Cognexia Graph] Failed to init schema for ${project}:`, err.message);
    }
  }
}

// Get memory graph for visualization
app.get('/api/graph', async (req, res) => {
  try {
    const { project, days, minImportance } = req.query;
    
    const db = await getDb(project || 'general');
    await memoryGraph.initGraphSchema(db);
    
    const graph = await memoryGraph.buildMemoryGraph(db, {
      days: parseInt(days) || 30,
      minImportance: parseInt(minImportance) || 1,
      includeLinks: true,
      includeEntities: true
    });
    
    db.close();
    res.json(successResponse(graph));
  } catch (err) {
    console.error('[Graph Error]', err);
    res.status(500).json(errorResponse(err.message, 'GRAPH_ERROR'));
  }
});

// Get memory clusters (entity-based groups)
app.get('/api/graph/clusters', async (req, res) => {
  try {
    const { project, days } = req.query;
    
    const db = await getDb(project || 'general');
    await memoryGraph.initGraphSchema(db);
    
    const clusters = await memoryGraph.getClusters(db, parseInt(days) || 30);
    
    db.close();
    res.json(successResponse({ clusters, count: clusters.length }));
  } catch (err) {
    console.error('[Clusters Error]', err);
    res.status(500).json(errorResponse(err.message, 'CLUSTERS_ERROR'));
  }
});

// Get related memories (with relationship info)
app.get('/api/graph/related/:memoryId', async (req, res) => {
  try {
    const { memoryId } = req.params;
    const { project, limit } = req.query;
    
    const db = await getDb(project || 'general');
    await memoryGraph.initGraphSchema(db);
    
    const related = await memoryGraph.findRelatedByEntities(db, memoryId, parseInt(limit) || 5);
    
    db.close();
    res.json(successResponse({ memoryId, related, count: related.length }));
  } catch (err) {
    console.error('[Related Error]', err);
    res.status(500).json(errorResponse(err.message, 'RELATED_ERROR'));
  }
});

// Create explicit link between memories
app.post('/api/graph/link', async (req, res) => {
  try {
    const { sourceId, targetId, linkType, strength, project } = req.body;
    
    if (!sourceId || !targetId) {
      return res.status(400).json(errorResponse('sourceId and targetId required'));
    }
    
    const db = await getDb(project || 'general');
    await memoryGraph.initGraphSchema(db);
    
    const link = await memoryGraph.createLink(
      db, 
      sourceId, 
      targetId, 
      linkType || 'related', 
      strength || 0.5
    );
    
    db.close();
    res.json(successResponse(link));
  } catch (err) {
    console.error('[Link Error]', err);
    res.status(500).json(errorResponse(err.message, 'LINK_ERROR'));
  }
});

// Find path between two memories
app.get('/api/graph/path', async (req, res) => {
  try {
    const { from, to, project } = req.query;
    
    if (!from || !to) {
      return res.status(400).json(errorResponse('from and to memory IDs required'));
    }
    
    const db = await getDb(project || 'general');
    await memoryGraph.initGraphSchema(db);
    
    const path = await memoryGraph.findPath(db, from, to);
    
    db.close();
    res.json(successResponse({ from, to, path, found: !!path }));
  } catch (err) {
    console.error('[Path Error]', err);
    res.status(500).json(errorResponse(err.message, 'PATH_ERROR'));
  }
});

// Run auto-linking to build relationships
app.post('/api/graph/auto-link', async (req, res) => {
  try {
    const { project, days } = req.body;
    
    const db = await getDb(project || 'general');
    await memoryGraph.initGraphSchema(db);
    
    const result = await memoryGraph.autoLinkMemories(db, parseInt(days) || 7);
    
    db.close();
    res.json(successResponse(result));
  } catch (err) {
    console.error('[Auto-Link Error]', err);
    res.status(500).json(errorResponse(err.message, 'AUTO_LINK_ERROR'));
  }
});

// Get graph statistics
app.get('/api/graph/stats', async (req, res) => {
  try {
    const { project } = req.query;
    
    const db = await getDb(project || 'general');
    await memoryGraph.initGraphSchema(db);
    
    const stats = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          (SELECT COUNT(*) FROM memories WHERE deleted_at IS NULL) as memory_count,
          (SELECT COUNT(*) FROM memory_links) as link_count,
          (SELECT COUNT(*) FROM memory_entities) as entity_count,
          (SELECT COUNT(DISTINCT entity_name) FROM memory_entities) as unique_entities
      `;
      db.get(sql, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    db.close();
    res.json(successResponse({ project: project || 'general', ...stats }));
  } catch (err) {
    console.error('[Stats Error]', err);
    res.status(500).json(errorResponse(err.message, 'STATS_ERROR'));
  }
});

// Initialize graph schemas on startup
initAllGraphSchemas().catch(console.error);

// ============================================
// IMPORT/EXPORT API
// ============================================

const importExport = require('./import-export');

// Configure multer for file uploads
const upload = multer({ dest: '/tmp/cognexia-uploads/' });

// Import memories from file
app.post('/api/import', upload.single('file'), async (req, res) => {
  try {
    const { format, project } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json(errorResponse('No file uploaded'));
    }
    
    let memories = [];
    
    switch (format) {
      case 'chatgpt':
        memories = importExport.importChatGPT(file.path);
        break;
      case 'claude':
        memories = importExport.importClaude(file.path);
        break;
      case 'json':
        memories = importExport.importJSON(file.path);
        break;
      case 'obsidian':
        return res.status(400).json(errorResponse('Obsidian import requires directory, not file'));
      default:
        // Auto-detect based on content
        try {
          memories = importExport.importJSON(file.path);
        } catch {
          memories = importExport.importChatGPT(file.path);
        }
    }
    
    // Store imported memories
    const db = await getDb(project || 'general');
    const stored = [];
    
    for (const memory of memories) {
      const stmt = db.prepare(`
        INSERT INTO memories (id, agent_id, content, content_type, importance, project, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const id = generateId();
      await new Promise((resolve, reject) => {
        stmt.run([
          id,
          'import',
          memory.content,
          memory.type,
          memory.importance,
          project || 'general',
          JSON.stringify(memory.metadata),
          memory.createdAt
        ], (err) => {
          stmt.finalize();
          if (err) reject(err);
          else resolve();
        });
      });
      
      stored.push({ id, ...memory });
    }
    
    db.close();
    
    // Clean up uploaded file
    fs.unlinkSync(file.path);
    
    res.json(successResponse({
      imported: stored.length,
      format: format || 'auto-detected',
      project: project || 'general',
      memories: stored.slice(0, 5).map(m => ({ id: m.id, type: m.type, preview: m.content.substring(0, 100) }))
    }));
  } catch (err) {
    console.error('[Import Error]', err);
    res.status(500).json(errorResponse(err.message, 'IMPORT_ERROR'));
  }
});

// Export memories
app.get('/api/export', async (req, res) => {
  try {
    const { format, project, days } = req.query;
    
    // Get memories from project
    const db = await getDb(project || 'general');
    
    const since = new Date();
    since.setDate(since.getDate() - (parseInt(days) || 365));
    
    const memories = await new Promise((resolve, reject) => {
      const sql = `
        SELECT id, content, content_type, importance, created_at, metadata
        FROM memories
        WHERE deleted_at IS NULL
          AND created_at > ?
        ORDER BY created_at DESC
      `;
      db.all(sql, [since.toISOString()], (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows.map(r => ({
          id: r.id,
          content: r.content,
          type: r.content_type,
          importance: r.importance,
          createdAt: r.created_at,
          metadata: r.metadata ? JSON.parse(r.metadata) : {}
        })));
      });
    });
    
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `cognexia-export-${project || 'general'}-${timestamp}`;
    
    switch (format) {
      case 'json': {
        const outputPath = `/tmp/${filename}.json`;
        const count = importExport.exportToJSON(memories, outputPath);
        res.download(outputPath, `${filename}.json`, () => {
          fs.unlinkSync(outputPath);
        });
        break;
      }
      case 'obsidian': {
        const outputDir = `/tmp/${filename}-obsidian`;
        const count = importExport.exportToObsidian(memories, outputDir);
        // Create zip of directory (simplified - just return count for now)
        res.json(successResponse({
          exported: count,
          format: 'obsidian',
          path: outputDir,
          note: 'Obsidian export creates markdown files in the specified directory'
        }));
        break;
      }
      case 'notion': {
        const outputPath = `/tmp/${filename}.csv`;
        const count = importExport.exportToNotionCSV(memories, outputPath);
        res.download(outputPath, `${filename}.csv`, () => {
          fs.unlinkSync(outputPath);
        });
        break;
      }
      case 'text': {
        const outputPath = `/tmp/${filename}.txt`;
        const count = importExport.exportToText(memories, outputPath);
        res.download(outputPath, `${filename}.txt`, () => {
          fs.unlinkSync(outputPath);
        });
        break;
      }
      default:
        res.status(400).json(errorResponse('Invalid format. Use: json, obsidian, notion, text'));
    }
  } catch (err) {
    console.error('[Export Error]', err);
    res.status(500).json(errorResponse(err.message, 'EXPORT_ERROR'));
  }
});

// Get import formats info
app.get('/api/import/formats', (req, res) => {
  res.json(successResponse({
    formats: [
      {
        id: 'chatgpt',
        name: 'ChatGPT',
        description: 'OpenAI ChatGPT conversation export (conversations.json)',
        fileType: '.json'
      },
      {
        id: 'claude',
        name: 'Claude',
        description: 'Anthropic Claude conversation export',
        fileType: '.json'
      },
      {
        id: 'json',
        name: 'JSON Backup',
        description: 'Cognexia JSON backup format',
        fileType: '.json'
      },
      {
        id: 'obsidian',
        name: 'Obsidian',
        description: 'Obsidian vault (markdown files)',
        fileType: 'directory'
      }
    ]
  }));
});

// Get export formats info
app.get('/api/export/formats', (req, res) => {
  res.json(successResponse({
    formats: [
      {
        id: 'json',
        name: 'JSON',
        description: 'Full JSON backup with all metadata',
        extension: '.json'
      },
      {
        id: 'obsidian',
        name: 'Obsidian',
        description: 'Markdown files with YAML frontmatter',
        extension: '.md'
      },
      {
        id: 'notion',
        name: 'Notion CSV',
        description: 'CSV format for Notion import',
        extension: '.csv'
      },
      {
        id: 'text',
        name: 'Plain Text',
        description: 'Simple text backup',
        extension: '.txt'
      }
    ]
  }));
});

// ============================================
// AGENT COLLABORATION API
// ============================================

const agentCollab = require('./agent-collaboration');

// Initialize agent schema on startup
async function initAllAgentSchemas() {
  const projects = listProjects();
  for (const project of projects) {
    try {
      const db = await getDb(project);
      await agentCollab.initAgentSchema(db);
      db.close();
    } catch (err) {
      console.error(`[Cognexia Agents] Failed to init schema for ${project}:`, err.message);
    }
  }
}

// Register a new agent
app.post('/api/agents', async (req, res) => {
  try {
    const { name, description, permissions, project } = req.body;
    if (!name) {
      return res.status(400).json(errorResponse('Agent name required'));
    }
    const db = await getDb(project || 'general');
    await agentCollab.initAgentSchema(db);
    const agent = await agentCollab.registerAgent(db, { name, description, permissions });
    db.close();
    res.json(successResponse(agent));
  } catch (err) {
    console.error('[Register Agent Error]', err);
    res.status(500).json(errorResponse(err.message, 'REGISTER_AGENT_ERROR'));
  }
});

// List all agents
app.get('/api/agents', async (req, res) => {
  try {
    const { project } = req.query;
    const db = await getDb(project || 'general');
    await agentCollab.initAgentSchema(db);
    const agents = await agentCollab.listAgents(db);
    db.close();
    res.json(successResponse({ agents, count: agents.length }));
  } catch (err) {
    console.error('[List Agents Error]', err);
    res.status(500).json(errorResponse(err.message, 'LIST_AGENTS_ERROR'));
  }
});

// Get agent details
app.get('/api/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { project } = req.query;
    const db = await getDb(project || 'general');
    await agentCollab.initAgentSchema(db);
    const agent = await agentCollab.getAgent(db, agentId);
    db.close();
    if (!agent) {
      return res.status(404).json(errorResponse('Agent not found'));
    }
    res.json(successResponse(agent));
  } catch (err) {
    console.error('[Get Agent Error]', err);
    res.status(500).json(errorResponse(err.message, 'GET_AGENT_ERROR'));
  }
});

// Share memory with agent
app.post('/api/agents/share', async (req, res) => {
  try {
    const { memoryId, fromAgentId, toAgentId, shareType, project } = req.body;
    if (!memoryId || !fromAgentId || !toAgentId) {
      return res.status(400).json(errorResponse('memoryId, fromAgentId, and toAgentId required'));
    }
    const db = await getDb(project || 'general');
    await agentCollab.initAgentSchema(db);
    const share = await agentCollab.shareMemory(db, { memoryId, fromAgentId, toAgentId, shareType: shareType || 'read' });
    await agentCollab.logAgentActivity(db, { agentId: fromAgentId, action: 'share', memoryId, project: project || 'general' });
    db.close();
    res.json(successResponse(share));
  } catch (err) {
    console.error('[Share Memory Error]', err);
    res.status(500).json(errorResponse(err.message, 'SHARE_MEMORY_ERROR'));
  }
});

// Get memories shared with agent
app.get('/api/agents/:agentId/shared', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { project, limit, offset } = req.query;
    const db = await getDb(project || 'general');
    await agentCollab.initAgentSchema(db);
    const memories = await agentCollab.getSharedMemories(db, agentId, { limit: parseInt(limit) || 20, offset: parseInt(offset) || 0 });
    db.close();
    res.json(successResponse({ memories, count: memories.length }));
  } catch (err) {
    console.error('[Get Shared Memories Error]', err);
    res.status(500).json(errorResponse(err.message, 'GET_SHARED_ERROR'));
  }
});

// ============================================
// MEMORY TEMPLATES API
// ============================================

const memoryTemplates = require('./memory-templates');

// List all templates
app.get('/api/templates', (req, res) => {
  try {
    const templates = memoryTemplates.getAllTemplates();
    res.json(successResponse({ templates, count: templates.length }));
  } catch (err) {
    console.error('[Templates Error]', err);
    res.status(500).json(errorResponse(err.message, 'TEMPLATES_ERROR'));
  }
});

// Get specific template
app.get('/api/templates/:templateId', (req, res) => {
  try {
    const { templateId } = req.params;
    const template = memoryTemplates.getTemplate(templateId);
    if (!template) {
      return res.status(404).json(errorResponse('Template not found'));
    }
    res.json(successResponse(template));
  } catch (err) {
    console.error('[Template Error]', err);
    res.status(500).json(errorResponse(err.message, 'TEMPLATE_ERROR'));
  }
});

// Apply template to project
app.post('/api/templates/apply', async (req, res) => {
  try {
    const { templateId, project } = req.body;
    if (!templateId || !project) {
      return res.status(400).json(errorResponse('templateId and project required'));
    }
    const result = memoryTemplates.applyTemplate(templateId, project);
    const db = await getDb(project);
    for (const memory of result.memories) {
      const stmt = db.prepare(`INSERT INTO memories (id, agent_id, content, content_type, importance, project, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      await new Promise((resolve, reject) => {
        stmt.run([generateId(), 'template', memory.content, memory.type, memory.importance, project, JSON.stringify(memory.metadata), memory.createdAt], (err) => {
          stmt.finalize();
          if (err) reject(err);
          else resolve();
        });
      });
    }
    db.close();
    res.json(successResponse(result));
  } catch (err) {
    console.error('[Apply Template Error]', err);
    res.status(500).json(errorResponse(err.message, 'APPLY_TEMPLATE_ERROR'));
  }
});

// Initialize agent schemas
initAllAgentSchemas().catch(console.error);

// Error handling
app.use((err, req, res, next) => {
  console.error('[API Error]', err);
  res.status(500).json(errorResponse('Internal server error', 'INTERNAL_ERROR'));
});

// 404 handler - API routes not found
app.use('/api/*', (req, res) => {
  res.status(404).json(errorResponse('Not found', 'NOT_FOUND'));
});

// ============================================
// PUBLIC PAGES (No Auth Required)
// ============================================

// Published memories index
app.get('/published', async (req, res) => {
  try {
    const { project } = req.query;
    const db = await getDb(project || 'general');
    
    const memories = await new Promise((resolve, reject) => {
      const sql = `
        SELECT id, content, content_type, importance, tags, created_at, published_at
        FROM memories
        WHERE deleted_at IS NULL AND published = 1
        ORDER BY published_at DESC
      `;
      db.all(sql, [], (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Published Memories</title>
  <style>
    :root{--bg:#0a0a0f;--bg-card:#12121a;--border:#2a2a3e;--text:#e0e0e0;--text-muted:#666;--accent:#667eea}
    body{font-family:-apple-system,system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;margin:0;padding:40px 20px}
    .container{max-width:700px;margin:0 auto}
    h1{font-size:2rem;font-weight:700;margin-bottom:8px;background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .subtitle{color:var(--text-muted);margin-bottom:32px}
    .memory-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px;transition:border-color 0.2s}
    .memory-card:hover{border-color:var(--accent)}
    .memory-type{font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--accent);margin-bottom:8px}
    .memory-content{font-size:1rem;line-height:1.6;margin-bottom:12px}
    .memory-meta{font-size:0.8rem;color:var(--text-muted);display:flex;gap:16px;flex-wrap:wrap}
    .importance{font-weight:600;padding:2px 8px;border-radius:4px}
    .imp-high{background:rgba(231,76,60,0.15);color:#e74c3c}
    .imp-med{background:rgba(243,156,18,0.15);color:#f39c12}
    .imp-low{background:rgba(39,174,96,0.15);color:#27ae60}
    .date{margin-top:8px}
    .tag{color:var(--accent);margin-right:8px}
    .empty{text-align:center;padding:60px;color:var(--text-muted)}
    .empty-icon{font-size:48px;margin-bottom:16px}
    .footer{margin-top:40px;text-align:center;font-size:0.8rem;color:var(--text-muted);padding-top:20px;border-top:1px solid var(--border)}
    .footer a{color:var(--accent);text-decoration:none}
  </style>
</head>
<body>
  <div class="container">
    <h1>🧠 Published Memories</h1>
    <p class="subtitle">Shared insights from Cognexia</p>
    ${memories.length === 0 ? '<div class="empty"><div class="empty-icon">📭</div><p>No published memories yet</p></div>' : memories.map(m => {
      const impClass = m.importance >= 8 ? 'imp-high' : m.importance >= 5 ? 'imp-med' : 'imp-low';
      const tags = m.tags ? JSON.parse(m.tags) : [];
      const preview = m.content.length > 200 ? m.content.substring(0, 197) + '...' : m.content;
      return `<div class="memory-card">
        <div class="memory-type">${m.content_type}</div>
        <div class="memory-content">${escapeHtml(preview)}</div>
        <div class="memory-meta">
          <span class="importance ${impClass}">${m.importance}/10</span>
          ${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        <div class="memory-meta date">
          <a href="/p/${m.id}" style="color:var(--accent)">Read more →</a>
          <span>Published ${formatDate(m.published_at)}</span>
        </div>
      </div>`;
    }).join('')}
    <div class="footer">
      <a href="/">← Back to Cognexia</a>
    </div>
  </div>
</body>
</html>`;
    res.type('html').send(html);
  } catch (err) {
    console.error('[Published Index Error]', err);
    res.status(500).send('<h1>Error</h1><p>Failed to load published memories</p>');
  }
});

// Single published memory page
app.get('/p/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { project } = req.query;
    const db = await getDb(project || 'general');
    
    const memory = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM memories WHERE id = ? AND deleted_at IS NULL AND published = 1', [id], (err, row) => {
        db.close();
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!memory) {
      return res.status(404).send('<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0a0a0f;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0"><div style="text-align:center"><h1 style="font-size:4rem;margin:0">404</h1><p style="color:#666">Memory not found or not published</p><a href="/published" style="color:#667eea">← Back to Published</a></div></body></html>');
    }
    
    const impClass = memory.importance >= 8 ? 'imp-high' : memory.importance >= 5 ? 'imp-med' : 'imp-low';
    const tags = memory.tags ? JSON.parse(memory.tags) : [];
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Memory - Cognexia</title>
  <style>
    :root{--bg:#0a0a0f;--bg-card:#12121a;--border:#2a2a3e;--text:#e0e0e0;--text-muted:#666;--accent:#667eea;--red:#e74c3c;--yellow:#f39c12;--green:#27ae60}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:60px 20px}
    .container{max-width:680px;margin:0 auto}
    .back{font-size:0.9rem;color:var(--text-muted);margin-bottom:32px}
    .back a{color:var(--accent);text-decoration:none}
    .memory-card{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:40px}
    .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px}
    .type{font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--accent);font-weight:600}
    .importance{font-size:0.8rem;font-weight:600;padding:4px 12px;border-radius:6px}
    .imp-high{background:rgba(231,76,60,0.15);color:#e74c3c}
    .imp-med{background:rgba(243,156,18,0.15);color:#f39c12}
    .imp-low{background:rgba(39,174,96,0.15);color:#27ae60}
    .content{font-size:1.125rem;line-height:1.8;white-space:pre-wrap;word-break:break-word}
    .tags{margin-top:24px;padding-top:24px;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:8px}
    .tag{font-size:0.85rem;padding:4px 12px;border-radius:20px;background:rgba(102,126,234,0.1);color:var(--accent)}
    .meta{margin-top:24px;font-size:0.85rem;color:var(--text-muted);display:flex;gap:20px;flex-wrap:wrap}
    .published{color:var(--accent)}
    .footer{margin-top:48px;text-align:center}
    .footer a{color:var(--accent);text-decoration:none;font-size:0.9rem}
  </style>
</head>
<body>
  <div class="container">
    <div class="back"><a href="/published">← All Published Memories</a></div>
    <div class="memory-card">
      <div class="header">
        <span class="type">${escapeHtml(memory.content_type)}</span>
        <span class="importance ${impClass}">${memory.importance}/10</span>
      </div>
      <div class="content">${escapeHtml(memory.content)}</div>
      ${tags.length > 0 ? `<div class="tags">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      <div class="meta">
        <span>Created: ${formatDate(memory.created_at)}</span>
        <span class="published">Published: ${formatDate(memory.published_at)}</span>
      </div>
    </div>
    <div class="footer">
      <a href="/">← Back to Cognexia</a>
    </div>
  </div>
</body>
</html>`;
    res.type('html').send(html);
  } catch (err) {
    console.error('[Public Memory Error]', err);
    res.status(500).send('<h1>Error</h1><p>Failed to load memory</p>');
  }
});

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Web UI fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     Cognexia 🧠 — Data Lake Edition v2.3.0                ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  Data Lake: ${DATA_LAKE_BASE.padEnd(46)}║`);
  console.log(`║  Web UI:    http://localhost:${PORT}${' '.repeat(29 - PORT.toString().length)}║`);
  console.log(`║  API:       http://localhost:${PORT}/api${' '.repeat(23 - PORT.toString().length)}║`);
  console.log('║                                                        ║');
  console.log('║  Endpoints:                                            ║');
  console.log('║    GET  /                    - Web UI (Memory Browser) ║');
  console.log('║    GET  /api/health          - Status & projects       ║');
  console.log('║    GET  /api/projects        - List all projects       ║');
  console.log('║                                                         ║');
  console.log('║  Memory Core:                                          ║');
  console.log('║    POST /api/memory/store    - Store a memory          ║');
  console.log('║    POST /api/memory/store-encrypted - Store encrypted  ║');
  console.log('║    GET  /api/memory/query    - Query project memory    ║');
  console.log('║    GET  /api/memory/query-encrypted - Query encrypted  ║');
  console.log('║    GET  /api/memory/query-all - Search all projects    ║');
  console.log('║    GET  /api/memory/recent   - Browse recent memories  ║');
  console.log('║    GET  /api/memory/types    - List memory types       ║');
  console.log('║    GET  /api/memory/keywords - Get keyword suggestions ║');
  console.log('║    GET  /api/memory/timeline - Get memory timeline     ║');
  console.log('║                                                         ║');
  console.log('║  Memory Graph:                                         ║');
  console.log('║    GET  /api/graph           - Get memory graph        ║');
  console.log('║    GET  /api/graph/clusters  - Get memory clusters     ║');
  console.log('║    GET  /api/graph/related/:id - Get related memories  ║');
  console.log('║    GET  /api/graph/path      - Find path between nodes ║');
  console.log('║    GET  /api/graph/stats     - Graph statistics        ║');
  console.log('║    POST /api/graph/link      - Create memory link      ║');
  console.log('║    POST /api/graph/auto-link - Auto-build relationships║');
  console.log('║                                                         ║');
  console.log('║  Agent Collaboration:                                  ║');
  console.log('║    GET  /api/agents          - List agents             ║');
  console.log('║    POST /api/agents          - Register agent          ║');
  console.log('║    GET  /api/agents/:id      - Get agent details       ║');
  console.log('║    GET  /api/agents/:id/shared - Memories shared       ║');
  console.log('║    POST /api/agents/share    - Share memory            ║');
  console.log('║                                                         ║');
  console.log('║  Memory Templates:                                     ║');
  console.log('║    GET  /api/templates       - List templates          ║');
  console.log('║    GET  /api/templates/:id   - Get template            ║');
  console.log('║    POST /api/templates/apply - Apply to project        ║');
  console.log('║                                                         ║');
  console.log('║  Maintenance:                                          ║');
  console.log('║    GET  /api/crypto/status   - Encryption status       ║');
  console.log('║    POST /api/crypto/enable   - Enable encryption       ║');
  console.log('║    POST /api/cleanup         - Delete old memories     ║');
  console.log('║    POST /api/compress        - Compress old memories   ║');
  console.log('║    POST /api/maintenance     - Run full maintenance    ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  
  // Schedule daily maintenance at 3 AM
  const now = new Date();
  const nextMaintenance = new Date(now);
  nextMaintenance.setHours(3, 0, 0, 0);
  if (nextMaintenance <= now) {
    nextMaintenance.setDate(nextMaintenance.getDate() + 1);
  }
  const msUntilMaintenance = nextMaintenance - now;
  
  setTimeout(() => {
    runMaintenance();
    // Then every 24 hours
    setInterval(runMaintenance, 24 * 60 * 60 * 1000);
  }, msUntilMaintenance);
  
  console.log(`[Cognexia] Next maintenance: ${nextMaintenance.toLocaleString()}`);
});

module.exports = { app, getProjectDbPath, listProjects };