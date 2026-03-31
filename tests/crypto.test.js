/**
 * Tests for crypto.js — AES-256-GCM encryption + blind indexing
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate key storage to a temp dir so tests don't touch ~/.cognexia
// Use a fixed tmp path (jest.mock factory can't reference out-of-scope vars)
const MOCK_HOME = path.join(os.tmpdir(), 'cognexia-test-crypto-mock');
const KEY_PATH = path.join(MOCK_HOME, '.cognexia', 'cognexia.key');

jest.mock('os', () => ({
  ...jest.requireActual('os'),
  homedir: () => require('path').join(require('os').tmpdir(), 'cognexia-test-crypto-mock'),
}));

const {
  getOrCreateKey,
  encryptWithIndex,
  decrypt,
  generateQueryIndex,
  extractKeywords,
  isEncryptionEnabled,
  enableEncryption,
} = require('../crypto');

beforeAll(() => {
  fs.mkdirSync(MOCK_HOME, { recursive: true });
});

afterAll(() => {
  fs.rmSync(MOCK_HOME, { recursive: true, force: true });
  delete process.env.COGNEXIA_ENCRYPT;
});

// ─── Key Management ───────────────────────────────────────────────────────────

describe('getOrCreateKey', () => {
  afterEach(() => {
    if (fs.existsSync(KEY_PATH)) fs.unlinkSync(KEY_PATH);
  });

  test('generates a 32-byte key when none exists', () => {
    const key = getOrCreateKey();
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
  });

  test('writes key file with owner-only permissions', () => {
    getOrCreateKey();
    expect(fs.existsSync(KEY_PATH)).toBe(true);
    const stat = fs.statSync(KEY_PATH);
    // 0o600 = owner read+write only
    expect(stat.mode & 0o777).toBe(0o600);
  });

  test('returns the same key on subsequent calls', () => {
    const key1 = getOrCreateKey();
    const key2 = getOrCreateKey();
    expect(key1.equals(key2)).toBe(true);
  });

  test('loads existing key from disk', () => {
    const expectedKey = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true });
    fs.writeFileSync(KEY_PATH, expectedKey);
    fs.chmodSync(KEY_PATH, 0o600);
    const loadedKey = getOrCreateKey();
    expect(loadedKey.equals(expectedKey)).toBe(true);
  });
});

// ─── Encryption / Decryption ──────────────────────────────────────────────────

describe('encryptWithIndex + decrypt', () => {
  let key;

  beforeEach(() => {
    key = crypto.randomBytes(32);
  });

  test('encrypt returns ciphertext, iv, and blindIndexes', () => {
    const result = encryptWithIndex('hello world test content', key);
    expect(result).toHaveProperty('ciphertext');
    expect(result).toHaveProperty('iv');
    expect(result).toHaveProperty('blindIndexes');
    expect(typeof result.ciphertext).toBe('string');
    expect(typeof result.iv).toBe('string');
    expect(Array.isArray(result.blindIndexes)).toBe(true);
  });

  test('ciphertext differs from plaintext', () => {
    const plaintext = 'super secret memory content';
    const { ciphertext } = encryptWithIndex(plaintext, key);
    expect(ciphertext).not.toContain(plaintext);
  });

  test('round-trip encrypt/decrypt returns original plaintext', () => {
    const plaintext = 'This is a test memory about React and Node.js performance';
    const { ciphertext, iv } = encryptWithIndex(plaintext, key);
    const decrypted = decrypt(ciphertext, iv, key);
    expect(decrypted).toBe(plaintext);
  });

  test('round-trip works for empty string', () => {
    const { ciphertext, iv } = encryptWithIndex('', key);
    const decrypted = decrypt(ciphertext, iv, key);
    expect(decrypted).toBe('');
  });

  test('round-trip works for unicode content', () => {
    const plaintext = 'Memory with émojis 🧠 and unicode: 你好世界';
    const { ciphertext, iv } = encryptWithIndex(plaintext, key);
    const decrypted = decrypt(ciphertext, iv, key);
    expect(decrypted).toBe(plaintext);
  });

  test('round-trip works for long content', () => {
    const plaintext = 'word '.repeat(1000).trim();
    const { ciphertext, iv } = encryptWithIndex(plaintext, key);
    const decrypted = decrypt(ciphertext, iv, key);
    expect(decrypted).toBe(plaintext);
  });

  test('two encryptions of same plaintext produce different ciphertexts (random IV)', () => {
    const plaintext = 'identical content';
    const r1 = encryptWithIndex(plaintext, key);
    const r2 = encryptWithIndex(plaintext, key);
    expect(r1.ciphertext).not.toBe(r2.ciphertext);
    expect(r1.iv).not.toBe(r2.iv);
  });

  test('decrypt throws with wrong key', () => {
    const { ciphertext, iv } = encryptWithIndex('secret', key);
    const wrongKey = crypto.randomBytes(32);
    expect(() => decrypt(ciphertext, iv, wrongKey)).toThrow();
  });

  test('decrypt throws with tampered ciphertext', () => {
    const { ciphertext, iv } = encryptWithIndex('secret data', key);
    const tampered = ciphertext.slice(0, -4) + 'dead';
    expect(() => decrypt(tampered, iv, key)).toThrow();
  });
});

// ─── Blind Indexing ───────────────────────────────────────────────────────────

describe('blind indexing', () => {
  let key;

  beforeEach(() => {
    key = crypto.randomBytes(32);
  });

  test('blindIndexes are hex strings', () => {
    const { blindIndexes } = encryptWithIndex('React Node.js TypeScript performance', key);
    blindIndexes.forEach(idx => {
      expect(idx).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  test('generateQueryIndex returns 64-char hex string', () => {
    const idx = generateQueryIndex('react', key);
    expect(idx).toMatch(/^[0-9a-f]{64}$/);
  });

  test('generateQueryIndex matches blind index for same keyword', () => {
    const keyword = 'typescript';
    const content = `We use ${keyword} for type safety`;
    const { blindIndexes } = encryptWithIndex(content, key);
    const queryIdx = generateQueryIndex(keyword, key);
    expect(blindIndexes).toContain(queryIdx);
  });

  test('generateQueryIndex is case-insensitive', () => {
    const lower = generateQueryIndex('react', key);
    const upper = generateQueryIndex('REACT', key);
    const mixed = generateQueryIndex('React', key);
    expect(lower).toBe(upper);
    expect(lower).toBe(mixed);
  });

  test('different keywords produce different indexes', () => {
    const idx1 = generateQueryIndex('react', key);
    const idx2 = generateQueryIndex('angular', key);
    expect(idx1).not.toBe(idx2);
  });

  test('different keys produce different indexes for same keyword', () => {
    const key2 = crypto.randomBytes(32);
    const idx1 = generateQueryIndex('react', key);
    const idx2 = generateQueryIndex('react', key2);
    expect(idx1).not.toBe(idx2);
  });
});

// ─── Keyword Extraction ───────────────────────────────────────────────────────

describe('extractKeywords', () => {
  test('returns an array of strings', () => {
    const kw = extractKeywords('We are building a React application with Node.js');
    expect(Array.isArray(kw)).toBe(true);
    kw.forEach(k => expect(typeof k).toBe('string'));
  });

  test('filters out words shorter than 4 characters', () => {
    const kw = extractKeywords('the app is fun');
    kw.forEach(k => expect(k.length).toBeGreaterThan(3));
  });

  test('removes duplicates', () => {
    const kw = extractKeywords('react react react performance performance');
    const unique = new Set(kw);
    expect(kw.length).toBe(unique.size);
  });

  test('returns lowercase keywords', () => {
    const kw = extractKeywords('TypeScript React NodeJS');
    kw.forEach(k => expect(k).toBe(k.toLowerCase()));
  });

  test('handles empty string', () => {
    const kw = extractKeywords('');
    expect(Array.isArray(kw)).toBe(true);
  });
});

// ─── isEncryptionEnabled / enableEncryption ───────────────────────────────────

describe('isEncryptionEnabled', () => {
  afterEach(() => {
    delete process.env.COGNEXIA_ENCRYPT;
    if (fs.existsSync(KEY_PATH)) fs.unlinkSync(KEY_PATH);
  });

  test('returns false when env var not set and no key file', () => {
    expect(isEncryptionEnabled()).toBe(false);
  });

  test('returns true when COGNEXIA_ENCRYPT=1', () => {
    process.env.COGNEXIA_ENCRYPT = '1';
    expect(isEncryptionEnabled()).toBe(true);
  });

  test('returns true when key file exists', () => {
    fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true });
    fs.writeFileSync(KEY_PATH, crypto.randomBytes(32));
    expect(isEncryptionEnabled()).toBe(true);
  });
});
