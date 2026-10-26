const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

// Keep runner plumbing only. Never copy application settings or credentials
// from the invoking shell into tests, including opt-in database test URLs.
module.exports = function isolateEnvironment(fixtures = {}) {
  const runnerEnvironment = {}
  for (const name of ['PATH', 'TMPDIR', 'TZ', 'SYSTEMROOT']) {
    if (process.env[name] !== undefined) runnerEnvironment[name] = process.env[name]
  }
  const directory = mkdtempSync(join(tmpdir(), 'solana-bot-tests-'))
  process.env = {
    ...runnerEnvironment,
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret',
    REFRESH_TOKEN_SECRET: 'test-refresh-secret',
    DATA_STORE_PATH: join(directory, 'store.json'),
    LOG_FILE_PATH: join(directory, 'test.log'),
    ...fixtures,
    TEST_WORK_DIR: directory,
  }
}
