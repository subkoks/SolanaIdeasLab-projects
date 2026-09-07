'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number.parseInt(process.env.PORT ?? '3002', 10);
const NODE_ENV = process.env.NODE_ENV ?? 'development';

// __dirname is available in CJS modules
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const JSON_404 = Buffer.from('{"error":"Not found"}', 'utf8');

const send404 = (res) => {
  res.writeHead(404, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON_404);
};

const sendFile = (res, filePath, contentType) => {
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(body);
};

const server = http.createServer((req, res) => {
  if (NODE_ENV === 'production') {
    send404(res);
    return;
  }

  if (req.method !== 'GET') {
    send404(res);
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    sendFile(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8');
    return;
  }

  if (req.url === '/console.css') {
    sendFile(res, path.join(PUBLIC_DIR, 'console.css'), 'text/css; charset=utf-8');
    return;
  }

  if (req.url === '/console.js') {
    sendFile(res, path.join(PUBLIC_DIR, 'console.js'), 'application/javascript; charset=utf-8');
    return;
  }

  send404(res);
});

if (require.main === module) {
  server.listen(PORT, () => {
    process.stdout.write(`Solana Lab Console: dev mode on http://localhost:${PORT}\n`);
  });
}

module.exports = { server, send404, sendFile };
