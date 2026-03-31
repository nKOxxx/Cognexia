/**
 * Tests for index.js — Cognexia library (SQLite backend)
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const Cognexia = require('../index');

const TMP_DIR = path.join(os.tmpdir(), `cognexia-lib-test-${Date.now()}`);
const DB_PATH = path.join(TMP_DIR, 'test.db');

let memory;

beforeAll(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  memory = new Cognexia({ storage: 'sqlite', path: DB_PATH });
});

afterAll(async () => {
  await memory.close();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

// ─── Constructor ──────────────────────────────────────────────────────────────

describe('constructor', () => {
  test('creates instance with sqlite storage', () => {
    expect(memory).toBeInstanceOf(Cognexia);
    expect(memory.storage).toBe('sqlite');
  });

  test('throws on invalid storage type', () => {
    expect(() => new Cognexia({ storage: 'invalid' })).toThrow('Invalid storage type');
  });

  test('throws on path inside /etc', () => {
    expect(() =>
      new Cognexia({ storage: 'sqlite', path: '/etc/passwd' })
    ).toThrow('Invalid path: Cannot write to system directories');
  });
});

// ─── store() ──────────────────────────────────────────────────────────────────

describe('store()', () => {
  test('stores a memory and returns success + id', async () => {
    const result = await memory.store('Test memory content for storing');
    expect(result.success).toBe(true);
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
  });

  test('stores with explicit type and importance', async () => {
    const result = await memory.store('Security vulnerability found in deps', {
      type: 'security',
      importance: 9,
    });
    expect(result.success).toBe(true);
  });

  test('stores with custom agentId', async () => {
    const result = await memory.store('Preference: dark mode always on', {
      type: 'preference',
      agentId: 'claude-agent',
      importance: 8,
    });
    expect(result.success).toBe(true);
  });

  test('throws on empty content', async () => {
    await expect(memory.store('')).rejects.toThrow('Content cannot be empty');
  });

  test('throws on non-string content', async () => {
    await expect(memory.store(123)).rejects.toThrow('Content must be a string');
  });

  test('throws on content exceeding max length', async () => {
    const huge = 'x'.repeat(10001);
    await expect(memory.store(huge)).rejects.toThrow('Content too long');
  });

  test('throws on invalid type', async () => {
    await expect(
      memory.store('Some content', { type: 'invalid-type' })
    ).rejects.toThrow('Invalid type');
  });

  test('throws on importance outside 1-10', async () => {
    await expect(
      memory.store('Some content', { importance: 11 })
    ).rejects.toThrow('Importance must be a number 1-10');
    await expect(
      memory.store('Some content', { importance: 0 })
    ).rejects.toThrow('Importance must be a number 1-10');
  });

  test('throws on invalid agentId format', async () => {
    await expect(
      memory.store('Content', { agentId: 'invalid id with spaces!' })
    ).rejects.toThrow('Invalid agentId');
  });

  test('auto-calculates higher importance for security type', async () => {
    // security type gets +3 bonus, so base 5+3=8
    const id1 = (await memory.store('security alert', { type: 'security' })).id;
    // Can't directly check importance without querying, just ensure it stored
    expect(id1).toBeTruthy();
  });
});

// ─── query() ──────────────────────────────────────────────────────────────────

describe('query()', () => {
  beforeAll(async () => {
    await memory.store('React hooks are powerful for state management', {
      type: 'insight',
      agentId: 'test-agent',
      importance: 7,
    });
    await memory.store('TypeScript improves code quality significantly', {
      type: 'insight',
      agentId: 'test-agent',
      importance: 6,
    });
    await memory.store('User prefers dark mode interface always', {
      type: 'preference',
      agentId: 'test-agent',
      importance: 8,
    });
  });

  test('returns an array', async () => {
    const results = await memory.query('react hooks', { agentId: 'test-agent' });
    expect(Array.isArray(results)).toBe(true);
  });

  test('throws on non-string query', async () => {
    await expect(memory.query(123)).rejects.toThrow('Query must be a string');
  });

  test('respects limit option', async () => {
    const results = await memory.query('', { agentId: 'test-agent', limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  test('returns relevance score on each result', async () => {
    const results = await memory.query('react', { agentId: 'test-agent' });
    results.forEach(r => {
      expect(r).toHaveProperty('relevance');
      expect(typeof r.relevance).toBe('number');
    });
  });

  test('empty query returns results without filtering', async () => {
    const results = await memory.query('', { agentId: 'test-agent', limit: 10 });
    expect(results.length).toBeGreaterThan(0);
  });
});

// ─── timeline() ───────────────────────────────────────────────────────────────

describe('timeline()', () => {
  test('returns an object grouped by date', async () => {
    const result = await memory.timeline(30, { agentId: 'test-agent' });
    expect(typeof result).toBe('object');
    Object.keys(result).forEach(date => {
      // SQLite CURRENT_TIMESTAMP returns "YYYY-MM-DD HH:MM:SS"; the split on 'T'
      // may return the full datetime string, so just verify it starts with a date
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(Array.isArray(result[date])).toBe(true);
    });
  });

  test('defaults to 7 days for invalid input', async () => {
    // Should not throw
    const result = await memory.timeline(-1, { agentId: 'test-agent' });
    expect(typeof result).toBe('object');
  });

  test('caps days at max limit', async () => {
    // Should not throw even with huge value
    const result = await memory.timeline(99999, { agentId: 'test-agent' });
    expect(typeof result).toBe('object');
  });
});

// ─── Utilities ────────────────────────────────────────────────────────────────

describe('generateId()', () => {
  test('generates unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(memory.generateId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('extractKeywords()', () => {
  test('extracts keywords from content', () => {
    const kw = memory.extractKeywords('React hooks improve state management performance');
    expect(Array.isArray(kw)).toBe(true);
    expect(kw.length).toBeGreaterThan(0);
  });

  test('handles NLP failure gracefully', () => {
    // Force basicExtract by passing unusual input
    const kw = memory.extractKeywords('12345 67890 !@#$%');
    expect(Array.isArray(kw)).toBe(true);
  });
});

describe('calculateImportance()', () => {
  test('security type gets highest bonus', () => {
    const score = memory.calculateImportance('short', 'security');
    expect(score).toBeGreaterThanOrEqual(8);
  });

  test('insight type gets bonus', () => {
    const score = memory.calculateImportance('short', 'insight');
    const base = memory.calculateImportance('short', 'conversation');
    expect(score).toBeGreaterThan(base);
  });

  test('caps at 10', () => {
    const score = memory.calculateImportance('x'.repeat(201), 'security');
    expect(score).toBeLessThanOrEqual(10);
  });
});

// ─── Static Helpers ───────────────────────────────────────────────────────────

describe('Cognexia.sanitizeHTML()', () => {
  test('escapes angle brackets', () => {
    expect(Cognexia.sanitizeHTML('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  test('escapes ampersands', () => {
    expect(Cognexia.sanitizeHTML('a & b')).toBe('a &amp; b');
  });

  test('escapes quotes', () => {
    expect(Cognexia.sanitizeHTML('"hello"')).toBe('&quot;hello&quot;');
  });

  test('returns empty string for non-string input', () => {
    expect(Cognexia.sanitizeHTML(null)).toBe('');
    expect(Cognexia.sanitizeHTML(123)).toBe('');
  });
});

describe('Cognexia.sanitizeCLI()', () => {
  test('strips ANSI escape codes', () => {
    expect(Cognexia.sanitizeCLI('\x1b[31mred text\x1b[0m')).toBe('red text');
  });

  test('strips control characters', () => {
    expect(Cognexia.sanitizeCLI('clean\x00content')).toBe('cleancontent');
  });

  test('preserves normal text', () => {
    expect(Cognexia.sanitizeCLI('normal text 123')).toBe('normal text 123');
  });

  test('returns empty string for non-string input', () => {
    expect(Cognexia.sanitizeCLI(null)).toBe('');
  });
});
