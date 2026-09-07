const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkTokenOutputs, formatCheckResult, resolveTokenPaths } = require('./check-tokens');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'token-check-'));
}

test('real repository contract passes', () => {
  const targetDef = resolveTokenPaths();
  const result = checkTokenOutputs(targetDef);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.failures.length, 0);
  assert.strictEqual(result.count, 4);
  assert.strictEqual(formatCheckResult({ ok: true, failures: [] }), 0);
});

test('matching temporary fixture passes', () => {
  const dir = makeTempDir();
  const src = path.join(dir, 't.css');
  const out1 = path.join(dir, 'o1.css');
  fs.writeFileSync(src, 'x');
  fs.writeFileSync(out1, 'x');
  const result = checkTokenOutputs({ source: src, outputs: [out1] });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.failures.length, 0);
  fs.rmSync(dir, { recursive: true });
});

test('missing output fails', () => {
  const dir = makeTempDir();
  const src = path.join(dir, 't.css');
  const out = path.join(dir, 'missing.css');
  fs.writeFileSync(src, 'x');
  const result = checkTokenOutputs({ source: src, outputs: [out] });
  assert.strictEqual(result.ok, false);
  const missing = result.failures.find(f => f.path === out);
  assert.ok(missing);
  assert.strictEqual(missing.reason, 'missing output');
  fs.rmSync(dir, { recursive: true });
});

test('byte mismatch fails', () => {
  const dir = makeTempDir();
  const src = path.join(dir, 't.css');
  const out = path.join(dir, 'o.css');
  fs.writeFileSync(src, 'x');
  fs.writeFileSync(out, 'y');
  const result = checkTokenOutputs({ source: src, outputs: [out] });
  assert.strictEqual(result.ok, false);
  const fail = result.failures.find(f => f.path === out);
  assert.strictEqual(fail.reason, 'byte mismatch');
  fs.rmSync(dir, { recursive: true });
});

test('missing source fails safely', () => {
  const dir = makeTempDir();
  const src = path.join(dir, 'no.css');
  const result = checkTokenOutputs({ source: src, outputs: [] });
  assert.strictEqual(result.ok, false);
  assert.ok(result.failures.some(f => f.path === src && f.reason === 'missing source'));
  fs.rmSync(dir, { recursive: true });
});

test('read-only guarantee', () => {
  const targetDef = resolveTokenPaths();
  const before = {};
  for (const p of [targetDef.source, ...targetDef.outputs]) {
    before[p] = fs.readFileSync(p);
  }
  const result = checkTokenOutputs(targetDef);
  assert.strictEqual(result.ok, true);
  for (const p of Object.keys(before)) {
    assert.ok(before[p].equals(fs.readFileSync(p)), 'modified: ' + p);
  }
});

test('target-list consistency uses shared module', () => {
  const targets = require('./token-targets');
  const checkerModule = require('./check-tokens');
  assert.ok(checkerModule.resolveTokenPaths);
  assert.strictEqual(checkerModule.resolveTokenPaths().source, targets.source);
  assert.deepStrictEqual(checkerModule.resolveTokenPaths().outputs, targets.outputs);
});
