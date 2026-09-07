const fs = require('fs');
const targets = require('./token-targets');

function resolveTokenPaths() {
  return targets;
}

function checkTokenOutputs(targetDef) {
  const failures = [];
  let sourceBuf;
  try {
    sourceBuf = fs.readFileSync(targetDef.source);
  } catch (e) {
    failures.push({ path: targetDef.source, reason: 'missing source' });
    return { ok: false, failures };
  }
  for (const out of targetDef.outputs) {
    try {
      const outBuf = fs.readFileSync(out);
      if (!sourceBuf.equals(outBuf)) {
        failures.push({ path: out, reason: 'byte mismatch' });
      }
    } catch (e) {
      failures.push({ path: out, reason: e.code === 'ENOENT' ? 'missing output' : 'read error' });
    }
  }
  return { ok: failures.length === 0, failures, count: targetDef.outputs.length - failures.length };
}

function formatCheckResult(result) {
  if (result.ok) {
    console.log('design-tokens: 4/4 outputs match shared/design/tokens.css');
    return 0;
  }
  console.log('design-tokens: check failed');
  for (const f of result.failures) console.log(f.path + ': ' + f.reason);
  return 1;
}

function runCli() {
  const targetDef = resolveTokenPaths();
  const result = checkTokenOutputs(targetDef);
  return formatCheckResult({ ...result, ok: result.failures.length === 0 });
}

if (require.main === module) {
  process.exit(runCli());
}

module.exports = { resolveTokenPaths, checkTokenOutputs, formatCheckResult, runCli };
