module.exports = {
  clearMocks: true,
  preset: 'ts-jest',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(uuid|@solana/web3.js|@solana/buffer-layout|@solana/codecs-core|@solana/codecs-numbers|@solana/errors)/)',
  ],
}
