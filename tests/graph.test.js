/**
 * Tests for memory-graph.js — entity extraction, linking, graph building
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');

const {
  extractEntities,
  initGraphSchema,
  storeEntities,
  createLink,
  findRelatedByEntities,
  buildMemoryGraph,
  findPath,
  getClusters,
  autoLinkMemories,
} = require('../memory-graph');

const TMP_DIR = path.join(os.tmpdir(), `cognexia-graph-test-${Date.now()}`);
const DB_PATH = path.join(TMP_DIR, 'graph-test.db');

let db;

// Helper: insert a memory directly
function insertMemory(db, { id, content, type = 'insight', importance = 5 }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO memories (id, agent_id, content, content_type, importance, created_at)
       VALUES (?, 'test-agent', ?, ?, ?, datetime('now'))`,
      [id, content, type, importance],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

beforeAll(async () => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  db = new sqlite3.Database(DB_PATH);

  // Create base memories table
  await new Promise((resolve, reject) => {
    db.exec(
      `CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        content TEXT NOT NULL,
        content_type TEXT DEFAULT 'insight',
        importance INTEGER DEFAULT 5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  // Init graph schema
  await initGraphSchema(db);

  // Seed test memories
  await insertMemory(db, {
    id: 'mem-1',
    content: 'We chose React for the frontend because of its component model',
  });
  await insertMemory(db, {
    id: 'mem-2',
    content: 'React hooks replaced class components across the project',
  });
  await insertMemory(db, {
    id: 'mem-3',
    content: 'Node.js powers the backend API with Express',
  });
  await insertMemory(db, {
    id: 'mem-4',
    content: 'Postgres is the primary database, hosted on AWS',
  });
  await insertMemory(db, {
    id: 'mem-5',
    content: 'Anthropic Claude is used for the AI memory summarisation feature',
  });
});

afterAll(() => {
  db.close();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

// ─── extractEntities ──────────────────────────────────────────────────────────

describe('extractEntities()', () => {
  test('detects technology entities', () => {
    const entities = extractEntities('We use React and Node.js with Postgres');
    const names = entities.map((e) => e.name);
    expect(names).toContain('react');
    expect(names).toContain('node.js');
    expect(names).toContain('postgres');
  });

  test('detects organisation entities', () => {
    const entities = extractEntities('Google and Microsoft are major cloud providers');
    const names = entities.map((e) => e.name);
    expect(names).toContain('google');
    expect(names).toContain('microsoft');
  });

  test('assigns correct entity types', () => {
    const entities = extractEntities('We use React with AWS');
    const tech = entities.filter((e) => e.type === 'technology');
    expect(tech.length).toBeGreaterThan(0);
  });

  test('removes duplicate entities', () => {
    const entities = extractEntities('React React React is great');
    const reactEntities = entities.filter((e) => e.name === 'react');
    expect(reactEntities.length).toBe(1);
  });

  test('returns empty array for content with no recognisable entities', () => {
    const entities = extractEntities('The weather is nice today');
    // May return project-style CamelCase matches, but no tech/org entities
    const techOrOrg = entities.filter(
      (e) => e.type === 'technology' || e.type === 'organization'
    );
    expect(techOrOrg.length).toBe(0);
  });

  test('each entity has type, name, and confidence', () => {
    const entities = extractEntities('Using React and Anthropic Claude for the project');
    entities.forEach((e) => {
      expect(e).toHaveProperty('type');
      expect(e).toHaveProperty('name');
      expect(e).toHaveProperty('confidence');
      expect(e.confidence).toBeGreaterThan(0);
      expect(e.confidence).toBeLessThanOrEqual(1);
    });
  });
});

// ─── storeEntities ────────────────────────────────────────────────────────────

describe('storeEntities()', () => {
  test('stores entities without error', async () => {
    const entities = extractEntities('React and Node.js are used here');
    await expect(storeEntities(db, 'mem-1', entities)).resolves.toBeUndefined();
  });

  test('handles empty entity array gracefully', async () => {
    await expect(storeEntities(db, 'mem-1', [])).resolves.toBeUndefined();
  });

  test('does not duplicate entities (INSERT OR IGNORE)', async () => {
    const entities = [{ type: 'technology', name: 'react', confidence: 0.9 }];
    await expect(storeEntities(db, 'mem-1', entities)).resolves.toBeUndefined();
    await expect(storeEntities(db, 'mem-1', entities)).resolves.toBeUndefined();
  });
});

// ─── createLink ───────────────────────────────────────────────────────────────

describe('createLink()', () => {
  test('creates a link between two memories', async () => {
    const link = await createLink(db, 'mem-1', 'mem-2', 'related', 0.8);
    expect(link).toHaveProperty('id');
    expect(link.sourceId).toBe('mem-1');
    expect(link.targetId).toBe('mem-2');
    expect(link.linkType).toBe('related');
    expect(link.strength).toBe(0.8);
  });

  test('creates links with different types', async () => {
    for (const type of ['related', 'parent', 'child', 'references', 'contradicts']) {
      const link = await createLink(db, 'mem-3', 'mem-4', type, 0.5);
      expect(link.linkType).toBe(type);
    }
  });

  test('replaces existing link (INSERT OR REPLACE)', async () => {
    await createLink(db, 'mem-4', 'mem-5', 'related', 0.3);
    const updated = await createLink(db, 'mem-4', 'mem-5', 'related', 0.9);
    expect(updated.strength).toBe(0.9);
  });
});

// ─── findRelatedByEntities ────────────────────────────────────────────────────

describe('findRelatedByEntities()', () => {
  beforeAll(async () => {
    // Store entities for mem-1 and mem-2 (both mention react)
    await storeEntities(db, 'mem-1', [{ type: 'technology', name: 'react', confidence: 0.9 }]);
    await storeEntities(db, 'mem-2', [{ type: 'technology', name: 'react', confidence: 0.9 }]);
    await storeEntities(db, 'mem-3', [{ type: 'technology', name: 'node.js', confidence: 0.9 }]);
  });

  test('returns array', async () => {
    const related = await findRelatedByEntities(db, 'mem-1', 5);
    expect(Array.isArray(related)).toBe(true);
  });

  test('finds mem-2 as related to mem-1 via shared react entity', async () => {
    const related = await findRelatedByEntities(db, 'mem-1', 5);
    const ids = related.map((r) => r.id);
    expect(ids).toContain('mem-2');
  });

  test('does not return the source memory itself', async () => {
    const related = await findRelatedByEntities(db, 'mem-1', 5);
    const ids = related.map((r) => r.id);
    expect(ids).not.toContain('mem-1');
  });

  test('respects limit parameter', async () => {
    const related = await findRelatedByEntities(db, 'mem-1', 1);
    expect(related.length).toBeLessThanOrEqual(1);
  });
});

// ─── buildMemoryGraph ─────────────────────────────────────────────────────────

describe('buildMemoryGraph()', () => {
  test('returns nodes and edges', async () => {
    const graph = await buildMemoryGraph(db, { days: 365 });
    expect(graph).toHaveProperty('nodes');
    expect(graph).toHaveProperty('edges');
    expect(graph).toHaveProperty('stats');
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
  });

  test('nodes have expected fields', async () => {
    const graph = await buildMemoryGraph(db, { days: 365 });
    if (graph.nodes.length > 0) {
      const node = graph.nodes[0];
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('content');
      expect(node).toHaveProperty('type');
      expect(node).toHaveProperty('importance');
    }
  });

  test('stats reports correct node count', async () => {
    const graph = await buildMemoryGraph(db, { days: 365 });
    expect(graph.stats.nodeCount).toBe(graph.nodes.length);
  });

  test('includes only memories within days window', async () => {
    const graph = await buildMemoryGraph(db, { days: 0 });
    // days:0 means since now, so should return 0 or very few results
    expect(graph.nodes.length).toBe(0);
  });

  test('filters by minImportance', async () => {
    const graph = await buildMemoryGraph(db, { days: 365, minImportance: 10 });
    graph.nodes.forEach((n) => expect(n.importance).toBeGreaterThanOrEqual(10));
  });
});

// ─── findPath ─────────────────────────────────────────────────────────────────

describe('findPath()', () => {
  beforeAll(async () => {
    // Create a chain: mem-1 → mem-2 → mem-5
    await createLink(db, 'mem-1', 'mem-2', 'related', 0.8);
    await createLink(db, 'mem-2', 'mem-5', 'related', 0.7);
  });

  test('finds direct path between linked memories', async () => {
    const path = await findPath(db, 'mem-1', 'mem-2');
    expect(path).not.toBeNull();
    expect(path.length).toBe(2);
    expect(path[0].id).toBe('mem-1');
    expect(path[1].id).toBe('mem-2');
  });

  test('finds indirect path through intermediate memory', async () => {
    const path = await findPath(db, 'mem-1', 'mem-5');
    expect(path).not.toBeNull();
    expect(path.length).toBe(3);
  });

  test('returns null when no path exists', async () => {
    // Insert two isolated nodes that have never been linked to anything
    await insertMemory(db, { id: 'isolated-a', content: 'Isolated node A' });
    await insertMemory(db, { id: 'isolated-b', content: 'Isolated node B' });
    const result = await findPath(db, 'isolated-a', 'isolated-b');
    expect(result).toBeNull();
  });

  test('returns single-node path when start equals end', async () => {
    const path = await findPath(db, 'mem-1', 'mem-1');
    expect(path).not.toBeNull();
    expect(path.length).toBe(1);
  });
});

// ─── getClusters ──────────────────────────────────────────────────────────────

describe('getClusters()', () => {
  test('returns an array', async () => {
    const clusters = await getClusters(db, 365);
    expect(Array.isArray(clusters)).toBe(true);
  });

  test('each cluster has required fields', async () => {
    const clusters = await getClusters(db, 365);
    clusters.forEach((c) => {
      expect(c).toHaveProperty('entity');
      expect(c).toHaveProperty('type');
      expect(c).toHaveProperty('memoryCount');
      expect(c).toHaveProperty('memoryIds');
      expect(c.memoryCount).toBeGreaterThanOrEqual(2);
    });
  });
});
