const fs = require('fs');
const targets = require('./token-targets');
const source = fs.readFileSync(targets.source);
for (const o of targets.outputs) fs.writeFileSync(o, source);
