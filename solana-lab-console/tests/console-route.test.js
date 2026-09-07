'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { server } = require('../src/server.js');

let port;

before(async () => {
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', function () {
      port = server.address().port;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
});

const get = (p, urlPath) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port: p, path: urlPath }, (res) => {
    let body = '';
    res.on('data', (c) => { body += c.toString(); });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  }).on('error', reject);
});

describe('default port', () => {
  it('default development port is 3002', () => {
    const src = require('node:fs').readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
    assert.match(src, /\?\? '3002'/);
  });
});

describe('dev mode — fixture static console', () => {
  it('GET / returns 200 with HTML containing all three module names', async () => {
    const { status, body } = await get(port, '/');
    assert.strictEqual(status, 200);
    assert.match(body, /<title>Solana Lab Console/);
    assert.match(body, /Token Safety Bot/);
    assert.match(body, /Token Sniper Bot/);
    assert.match(body, /Wallet Tracker Pro/);
  });

  it('GET /console.css returns 200 with CSS', async () => {
    const { status, headers, body } = await get(port, '/console.css');
    assert.strictEqual(status, 200);
    assert.match(headers['content-type'], /text\/css/);
    assert.match(body, /design-tokens\.css/);
  });

  it('GET /console.js returns 200 with JS', async () => {
    const { status, headers } = await get(port, '/console.js');
    assert.strictEqual(status, 200);
    assert.match(headers['content-type'], /javascript/);
  });

  it('unknown route returns 404 JSON', async () => {
    const { status, body } = await get(port, '/no-such-path');
    assert.strictEqual(status, 404);
    assert.strictEqual(body, '{"error":"Not found"}');
  });

  it('HTML embeds three confirmed local module links (console at 3002)', async () => {
    const { body } = await get(port, '/');
    assert.match(body, /http:\/\/localhost:3002\//); // console self-link
    assert.match(body, /http:\/\/localhost:3000\/demo/);
    assert.match(body, /http:\/\/localhost:8000\/demo/);
    assert.match(body, /http:\/\/localhost:3001\/demo/);
  });

  it('HTML contains no dynamic/client-side data fetching', async () => {
    const { body } = await get(port, '/');
    assert.doesNotMatch(body.toLowerCase(), /fetch\(|new websocket|xmlhttprequest|eventsource|<iframe/);
  });
});

describe('production mode — concealment', () => {
  it('NODE_ENV=production serves 404 JSON with no content leaks', async () => {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, NODE_ENV: 'production', PORT: '34567' };
      const child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (c) => { stderr += c.toString(); });
      let settled = false;
      const fail = (err) => { if (!settled) { settled = true; try { child.kill(); } catch (_) {} reject(err); } };
      const finish = () => { if (!settled) { settled = true; try { child.kill(); } catch (_) {} resolve(); } };
      child.on('error', fail);
      // server has no ready line in prod — small delay then request
      setTimeout(() => {
        http.get({ host: '127.0.0.1', port: 34567, path: '/' }, (res) => {
          let body = '';
          res.on('data', (c) => { body += c.toString(); });
          res.on('end', () => {
            try {
              assert.strictEqual(res.statusCode, 404);
              assert.strictEqual(body, '{"error":"Not found"}');
              assert.match(res.headers['content-type'], /application\/json/);
              assert.doesNotMatch(body.toLowerCase(), /solana lab console/);
              assert.doesNotMatch(body.toLowerCase(), /demo/);
              assert.doesNotMatch(body.toLowerCase(), /3000|8000|3001/);
              assert.doesNotMatch(body.toLowerCase(), /token safety|token sniper|wallet tracker/);
              finish();
            } catch (e) { fail(e); }
          });
        }).on('error', fail);
      }, 300);
      // safety timeout
      setTimeout(() => fail(new Error('prod test timed out: ' + stderr)), 5000);
    });
  });
});
