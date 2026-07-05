/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testMatch: ['**/*.test.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(uuid|@solana/web3.js|@solana/buffer-layout|@solana/codecs-core|@solana/codecs-numbers|@solana/errors)/)',
  ],
}
