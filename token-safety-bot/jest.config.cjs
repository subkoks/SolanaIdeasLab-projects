module.exports = {
  clearMocks: true,
  preset: 'ts-jest',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': ['ts-jest', { tsconfig: { allowJs: true } }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(?:.*[\\/])?(uuid|rpc-websockets|@solana\\/web3.js|@solana\\/buffer-layout|@solana\\/codecs-core|@solana\\/codecs-numbers|@solana\\/errors)/)',
  ],
}
