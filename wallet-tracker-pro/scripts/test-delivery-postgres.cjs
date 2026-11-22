// A new synthetic cluster only. No application config, dotenv, existing DB, or TCP.
const { chmodSync, mkdtempSync, mkdirSync, realpathSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')

function runFixture({ spawn = spawnSync, report = console.log, generatedClient } = {}) {
  if (generatedClient && !/^\/private\/tmp\/wallet-delivery-validation-[A-Za-z0-9]+\/generated$/.test(generatedClient)) {
    throw new Error('Generated client must be an explicit isolated Wallet validation output')
  }
  const packageDirectory = resolve(__dirname, '..')
  const fixtureDirectory = mkdtempSync(join(realpathSync('/tmp'), 'wallet-delivery-fixture-'))
  chmodSync(fixtureDirectory, 0o700)
  const dataDirectory = join(fixtureDirectory, 'data')
  const socketDirectory = join(fixtureDirectory, 'socket')
  mkdirSync(socketDirectory, { mode: 0o700 })
  const guardPath = join(fixtureDirectory, 'fixture-guard.cjs')
  writeFileSync(guardPath, `
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { fileURLToPath } = require('node:url');
const denyEnvironment = file => {
  const value = file instanceof URL ? fileURLToPath(file) : Buffer.isBuffer(file) ? file.toString() : file;
  if (typeof value === 'string' && path.basename(value).startsWith('.env')) {
    const error = new Error('Environment files are unavailable in the synthetic fixture'); error.code = 'ENOENT'; throw error;
  }
};
for (const method of ['readFile','readFileSync','open','openSync']) {
  const original = fs[method]; fs[method] = function(file,...args) { denyEnvironment(file); return original.call(this,file,...args); };
}
for (const method of ['readFile','open']) {
  const original = fs.promises[method]; fs.promises[method] = async function(file,...args) { denyEnvironment(file); return original.call(this,file,...args); };
}
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const socketPath = typeof args[0] === 'string' ? args[0] : args[0]?.path;
  if (socketPath !== ${JSON.stringify(join(socketDirectory, '.s.PGSQL.55439'))}) throw new Error('Only the private fixture Unix socket is available');
  return originalConnect.apply(this,args);
};
require('node:module').syncBuiltinESMExports();
`, { mode: 0o600 })
  const binaries = '/usr/local/opt/postgresql@16/bin'
  const cleanEnvironment = { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' }
  const receipt = { fixtureDirectory, socketDirectory, packageDirectory, port: 55439, role: 'wallet_fixture', database: 'wallet_delivery_fixture',
    generatedClient, listenAddresses: '', startAttempted: false, started: false, stopped: false, stages: [] }
  const receiptPath = join(fixtureDirectory, 'receipt.json')
  let exitCode = 0
  const save = () => writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 })
  const run = (stage, command, args, { echo = false, allowFailure = false } = {}) => {
    const result = spawn(command, args, { cwd: packageDirectory,
      env: ['compile', 'integration'].includes(stage) ? { ...cleanEnvironment, NODE_PATH: join(packageDirectory, 'node_modules'),
        PREFER_MOCK_SOL_PRICE: 'true', NODE_OPTIONS: `--require ${JSON.stringify(guardPath)}` } : cleanEnvironment,
      encoding: 'utf8',
      timeout: stage === 'integration' ? 120_000 : 15_000 })
    const logPath = join(fixtureDirectory, stage + '.log')
    writeFileSync(logPath, (result.stdout || '') + (result.stderr || ''), { mode: 0o600 })
    receipt.stages.push({ stage, command, args, exitCode: result.status, logPath })
    save()
    if (echo) report((result.stdout || '') + (result.stderr || ''))
    if (!allowFailure && (result.error || result.status !== 0)) throw new Error(`${stage} failed; inspect ${logPath}`)
    return result
  }
  save()
  try {
    run('version', join(binaries, 'postgres'), ['--version'], { echo: true })
    run('initdb', join(binaries, 'initdb'), ['-D', dataDirectory, '-U', receipt.role, '--auth=trust', '--encoding=UTF8', '--no-locale'])
    // A lost pg_ctl acknowledgement cannot establish that no postmaster started.
    receipt.startAttempted = true
    save()
    run('start', join(binaries, 'pg_ctl'), ['-D', dataDirectory, '-l', join(fixtureDirectory, 'postgres.log'),
      '-o', `-c listen_addresses='' -c unix_socket_directories='${socketDirectory}' -c unix_socket_permissions=0700 -p ${receipt.port}`, '-t', '10', '-w', 'start'])
    receipt.started = true
    save()
    run('createdb', join(binaries, 'createdb'), ['-h', socketDirectory, '-p', String(receipt.port), '-U', receipt.role, receipt.database])
    run('compile', process.execPath, [require.resolve('typescript/bin/tsc'), join(packageDirectory, 'tests/wallet-delivery.postgres.ts'),
      '--ignoreConfig', '--outDir', join(fixtureDirectory, 'compiled'), '--rootDir', packageDirectory, '--noEmit', 'false', '--incremental', 'false',
      '--module', 'commonjs', '--target', 'es2020', '--moduleResolution', 'node', '--esModuleInterop', '--skipLibCheck',
      '--strict', '--ignoreDeprecations', '6.0', '--types', 'node,jest'])
    run('integration', process.execPath, [join(fixtureDirectory, 'compiled/tests/wallet-delivery.postgres.js'), fixtureDirectory], { echo: true })
  } catch (error) {
    exitCode = 1
    report(error instanceof Error ? error.message : 'Fixture validation failed')
  } finally {
    if (receipt.startAttempted) {
      try {
        const status = run('status-before-stop', join(binaries, 'pg_ctl'), ['-D', dataDirectory, 'status'], { allowFailure: true })
        if (status.status !== 3 || status.error) {
          // Exact new data directory only: no PID guessing or broad process kill.
          run('stop', join(binaries, 'pg_ctl'), ['-D', dataDirectory, '-m', 'fast', '-t', '10', '-w', 'stop'], { allowFailure: true })
        }
        const finalStatus = run('status-after-stop', join(binaries, 'pg_ctl'), ['-D', dataDirectory, 'status'], { allowFailure: true })
        receipt.stopped = !finalStatus.error && finalStatus.status === 3
        if (!receipt.stopped) throw new Error('Fixture shutdown could not be verified')
      } catch (error) {
        exitCode = 1
        report(error instanceof Error ? error.message : 'Fixture shutdown failed')
      }
    }
    save()
    report(`Retained private fixture receipt: ${receiptPath}`)
  }
  return { receipt, receiptPath, exitCode }
}

if (require.main === module) process.exitCode = runFixture({ generatedClient: process.argv[2] }).exitCode
module.exports = { runFixture }
