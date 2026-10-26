/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/../shared/testing/cleanup.cjs'],
  moduleNameMapper: {
    '^dotenv(?:/config)?$': '<rootDir>/../shared/testing/dotenv.cjs',
    '^(?:\\./|\\.\\./)(?:.*?/)?utils/logger$': '<rootDir>/../shared/testing/logger.cjs',
  },
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': ['ts-jest', { tsconfig: { allowJs: true } }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(?:.*[\\/])?(uuid|rpc-websockets|@solana\\/web3.js|@solana\\/buffer-layout|@solana\\/codecs-core|@solana\\/codecs-numbers|@solana\\/errors)/)',
  ],
}
