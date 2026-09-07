const path = require('path');
module.exports = {
  source: path.join('shared', 'design', 'tokens.css'),
  outputs: [
    'token-safety-bot/public/design-tokens.css',
    'token-sniper-bot/public/design-tokens.css',
    'wallet-tracker-pro/src/app/demo/design-tokens.module.css',
    'solana-lab-console/public/design-tokens.css',
  ],
};
