/**
 * Memory Graph Module for Cognexia
 * 
 * Features:
 * - Automatic relationship detection via content similarity
 * - Explicit linking between memories
 * - Graph visualization API
 * - Shortest path queries (how are two memories connected?)
 */

const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

// ============================================
// SCHEMA EXTENSION FOR MEMORY GRAPH
// ============================================

const GRAPH_SCHEMA = `
  -- Memory relationships/links
  CREATE TABLE IF NOT EXISTS memory_links (
    id TEXT PRIMARY KEY,
    source_memory_id TEXT NOT NULL,
    target_memory_id TEXT NOT NULL,
    link_type TEXT DEFAULT 'related', -- related, parent, child, references, contradicts
    strength REAL DEFAULT 0.5, -- 0.0 to 1.0
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_memory_id) REFERENCES memories(id),
    FOREIGN KEY (target_memory_id) REFERENCES memories(id),
    UNIQUE(source_memory_id, target_memory_id, link_type)
  );

  -- Memory entities (extracted keywords, concepts)
  CREATE TABLE IF NOT EXISTS memory_entities (
    id TEXT PRIMARY KEY,
    memory_id TEXT NOT NULL,
    entity_type TEXT NOT NULL, -- person, organization, concept, technology, project
    entity_name TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (memory_id) REFERENCES memories(id)
  );

  -- Entity co-occurrence index (for relationship detection)
  CREATE INDEX IF NOT EXISTS idx_entity_name ON memory_entities(entity_name);
  CREATE INDEX IF NOT EXISTS idx_entity_type ON memory_entities(entity_type);
  CREATE INDEX IF NOT EXISTS idx_entity_memory ON memory_entities(memory_id);
  CREATE INDEX IF NOT EXISTS idx_link_source ON memory_links(source_memory_id);
  CREATE INDEX IF NOT EXISTS idx_link_target ON memory_links(target_memory_id);
  CREATE INDEX IF NOT EXISTS idx_link_type ON memory_links(link_type);
`;

// ============================================
// ENTITY EXTRACTION
// ============================================

/**
 * Extract entities from memory content
 * Simple keyword extraction - can be enhanced with NLP later
 * @param {string} content - Memory content
 * @returns {Array<{type, name, confidence}>}
 */
function extractEntities(content) {
  const entities = [];
  const lowerContent = content.toLowerCase();
  
  // Technology patterns
  const techPatterns = [
    /\b(openai|anthropic|claude|gpt-4|gpt4|llama|mistral|gemini)\b/gi,
    /\b(react|vue|angular|svelte|next\.js|nuxt)\b/gi,
    /\b(node\.?js|python|go|rust|typescript|javascript)\b/gi,
    /\b(postgres|mysql|mongo|redis|sqlite)\b/gi,
    /\b(aws|gcp|azure|vercel|netlify|render)\b/gi,
  ];
  
  // Organization patterns
  const orgPatterns = [
    /\b(yc|ycombinator|sequoia|a16z|benchmark)\b/gi,
    /\b(google|microsoft|apple|amazon|meta|twitter|x\.com)\b/gi,
  ];
  
  // Project/Product patterns (capitalized words)
  const projectMatches = content.match(/\b[A-Z][a-z]+[A-Z][a-zA-Z]+\b/g) || [];
  
  techPatterns.forEach(pattern => {
    const matches = content.match(pattern) || [];
    matches.forEach(match => {
      entities.push({
        type: 'technology',
        name: match.toLowerCase(),
        confidence: 0.9
      });
    });
  });
  
  orgPatterns.forEach(pattern => {
    const matches = content.match(pattern) || [];
    matches.forEach(match => {
      entities.push({
        type: 'organization',
        name: match.toLowerCase(),
        confidence: 0.85
      });
    });
  });
  
  projectMatches.forEach(match => {
    entities.push({
      type: 'project',
      name: match.toLowerCase(),
      confidence: 0.7
    });
  });
  
  // Remove duplicates
  const seen = new Set();
  return entities.filter(e => {
    const key = `${e.type}:${e.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================
// GRAPH DATABASE OPERATIONS
// ============================================

/**
 * Initialize graph schema in database
 * @param {sqlite3.Database} db 
 */
async function initGraphSchema(db) {
  return new Promise((resolve, reject) => {
    db.exec(GRAPH_SCHEMA, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Store entities for a memory
 * @param {sqlite3.Database} db 
 * @param {string} memoryId 
 * @param {Array} entities 
 */
async function storeEntities(db, memoryId, entities) {
  if (!entities.length) return;
  
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO memory_entities (id, memory_id, entity_type, entity_name, confidence)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  for (const entity of entities) {
    const id = crypto.randomUUID();
    await new Promise((resolve, reject) => {
      stmt.run([id, memoryId, entity.type, entity.name, entity.confidence], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  stmt.finalize();
}

/**
 * Create link between two memories
 * @param {sqlite3.Database} db 
 * @param {string} sourceId 
 * @param {string} targetId 
 * @param {string} linkType 
 * @param {number} strength 
 */
async function createLink(db, sourceId, targetId, linkType = 'related', strength = 0.5) {
  const id = crypto.randomUUID();
  
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO memory_links (id, source_memory_id, target_memory_id, link_type, strength)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run([id, sourceId, targetId, linkType, strength], (err) => {
      stmt.finalize();
      if (err) reject(err);
      else resolve({ id, sourceId, targetId, linkType, strength });
    });
  });
}

/**
 * Find related memories based on shared entities
 * @param {sqlite3.Database} db 
 * @param {string} memoryId 
 * @param {number} limit 
 */
async function findRelatedByEntities(db, memoryId, limit = 5) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT DISTINCT m.id, m.content, m.content_type, m.importance, m.created_at,
             COUNT(e2.entity_name) as shared_entities,
             AVG(e2.confidence) as avg_confidence
      FROM memory_entities e1
      JOIN memory_entities e2 ON e1.entity_name = e2.entity_name AND e1.entity_type = e2.entity_type
      JOIN memories m ON e2.memory_id = m.id
      WHERE e1.memory_id = ?
        AND e2.memory_id != ?
        AND m.deleted_at IS NULL
      GROUP BY m.id
      ORDER BY shared_entities DESC, avg_confidence DESC
      LIMIT ?
    `;
    
    db.all(sql, [memoryId, memoryId, limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/**
 * Build memory graph for a project
 * @param {sqlite3.Database} db 
 * @param {Object} options
 */
async function buildMemoryGraph(db, options = {}) {
  const { 
    days = 30, 
    minImportance = 1,
    includeLinks = true,
    includeEntities = true 
  } = options;
  
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  return new Promise((resolve, reject) => {
    // Get all memories in timeframe
    const memorySql = `
      SELECT id, content, content_type, importance, created_at, agent_id
      FROM memories
      WHERE deleted_at IS NULL
        AND created_at > ?
        AND importance >= ?
      ORDER BY created_at DESC
    `;
    
    db.all(memorySql, [since.toISOString(), minImportance], async (err, memories) => {
      if (err) return reject(err);
      
      const nodes = memories.map(m => ({
        id: m.id,
        content: m.content.substring(0, 100) + (m.content.length > 100 ? '...' : ''),
        fullContent: m.content,
        type: m.content_type,
        importance: m.importance,
        createdAt: m.created_at,
        agentId: m.agent_id
      }));
      
      const edges = [];
      const nodeIds = new Set(memories.map(m => m.id));
      
      if (includeLinks) {
        // Get explicit links
        const linkSql = `
          SELECT source_memory_id, target_memory_id, link_type, strength
          FROM memory_links
          WHERE source_memory_id IN (${memories.map(() => '?').join(',')})
             OR target_memory_id IN (${memories.map(() => '?').join(',')})
        `;
        
        const linkParams = [...memories.map(m => m.id), ...memories.map(m => m.id)];
        
        db.all(linkSql, linkParams, (err, links) => {
          if (err) return reject(err);
          
          links.forEach(link => {
            if (nodeIds.has(link.source_memory_id) && nodeIds.has(link.target_memory_id)) {
              edges.push({
                source: link.source_memory_id,
                target: link.target_memory_id,
                type: link.link_type,
                strength: link.strength
              });
            }
          });
          
          resolve({ nodes, edges, stats: { nodeCount: nodes.length, edgeCount: edges.length } });
        });
      } else {
        resolve({ nodes, edges, stats: { nodeCount: nodes.length, edgeCount: 0 } });
      }
    });
  });
}

/**
 * Find shortest path between two memories
 * @param {sqlite3.Database} db 
 * @param {string} startId 
 * @param {string} endId 
 */
async function findPath(db, startId, endId) {
  // BFS to find shortest path
  const visited = new Set();
  const queue = [[startId]];
  
  while (queue.length > 0) {
    const path = queue.shift();
    const currentId = path[path.length - 1];
    
    if (currentId === endId) {
      // Found path, get memory details
      const memorySql = `SELECT id, content, content_type FROM memories WHERE id IN (${path.map(() => '?').join(',')})`;
      return new Promise((resolve, reject) => {
        db.all(memorySql, path, (err, rows) => {
          if (err) reject(err);
          else {
            const memoryMap = new Map(rows.map(r => [r.id, r]));
            const pathWithDetails = path.map(id => memoryMap.get(id));
            resolve(pathWithDetails);
          }
        });
      });
    }
    
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    
    // Get neighbors
    const neighbors = await new Promise((resolve, reject) => {
      const sql = `
        SELECT target_memory_id as neighbor FROM memory_links WHERE source_memory_id = ?
        UNION
        SELECT source_memory_id as neighbor FROM memory_links WHERE target_memory_id = ?
      `;
      db.all(sql, [currentId, currentId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => r.neighbor));
      });
    });
    
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push([...path, neighbor]);
      }
    }
  }
  
  return null; // No path found
}

/**
 * Get memory clusters (groups of related memories)
 * @param {sqlite3.Database} db 
 * @param {number} days 
 */
async function getClusters(db, days = 30) {
  // Simple clustering by shared entities
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT e.entity_name, e.entity_type,
             GROUP_CONCAT(m.id) as memory_ids,
             GROUP_CONCAT(m.content, '|||') as contents,
             COUNT(DISTINCT m.id) as memory_count
      FROM memory_entities e
      JOIN memories m ON e.memory_id = m.id
      WHERE m.deleted_at IS NULL
        AND m.created_at > ?
      GROUP BY e.entity_name, e.entity_type
      HAVING memory_count >= 2
      ORDER BY memory_count DESC
      LIMIT 50
    `;
    
    db.all(sql, [since.toISOString()], (err, rows) => {
      if (err) reject(err);
      else {
        const clusters = rows.map(r => ({
          entity: r.entity_name,
          type: r.entity_type,
          memoryCount: r.memory_count,
          memoryIds: r.memory_ids.split(','),
          preview: r.contents.split('|||')[0].substring(0, 100)
        }));
        resolve(clusters);
      }
    });
  });
}

// ============================================
// AUTO-LINKING (BACKGROUND PROCESS)
// ============================================

/**
 * Auto-generate links based on content similarity
 * Run this periodically to build the graph
 * @param {sqlite3.Database} db 
 * @param {number} days - Only process recent memories
 */
async function autoLinkMemories(db, days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  // Get recent memories without many links
  const memories = await new Promise((resolve, reject) => {
    const sql = `
      SELECT m.id, m.content
      FROM memories m
      LEFT JOIN (
        SELECT source_memory_id as id, COUNT(*) as link_count
        FROM memory_links
        GROUP BY source_memory_id
      ) links ON m.id = links.id
      WHERE m.created_at > ?
        AND m.deleted_at IS NULL
        AND (links.link_count IS NULL OR links.link_count < 3)
    `;
    db.all(sql, [since.toISOString()], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
  
  let linksCreated = 0;
  
  for (const memory of memories) {
    const entities = extractEntities(memory.content);
    await storeEntities(db, memory.id, entities);
    
    // Find related memories
    const related = await findRelatedByEntities(db, memory.id, 3);
    
    for (const rel of related) {
      if (rel.shared_entities >= 2) {
        const strength = Math.min(0.9, rel.shared_entities * 0.2 + rel.avg_confidence * 0.3);
        await createLink(db, memory.id, rel.id, 'related', strength);
        linksCreated++;
      }
    }
  }
  
  return { processed: memories.length, linksCreated };
}

module.exports = {
  GRAPH_SCHEMA,
  extractEntities,
  initGraphSchema,
  storeEntities,
  createLink,
  findRelatedByEntities,
  buildMemoryGraph,
  findPath,
  getClusters,
  autoLinkMemories
};
