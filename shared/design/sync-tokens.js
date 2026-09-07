#!/usr/bin/env node
// Generates per-app local token copies from shared/design/tokens.css
// to: token-safety-bot/public/design-tokens.css, token-sniper-bot/public/design-tokens.css,
//     wallet-tracker-pro/src/app/demo/design-tokens.module.css, solana-lab-console/public/design-tokens.css
// Run with: node shared/design/sync-tokens.js
// Determinism: copies file content byte-for-byte; no mtime/injection.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, 'tokens.css');
const OUTS = [
  'token-safety-bot/public/design-tokens.css',
  'token-sniper-bot/public/design-tokens.css',
  'wallet-tracker-pro/src/app/demo/design-tokens.module.css',
  'solana-lab-console/public/design-tokens.css',
];

const src = fs.readFileSync(SRC);
let changed = 0;
for (const rel of OUTS) {
  const abs = path.join(__dirname, '..', '..', rel);
  const existing = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
  if (existing && existing.equals(src)) continue;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, src);
  changed++;
}
console.log(`sync-tokens: ${changed}/${OUTS.length} files updated`);