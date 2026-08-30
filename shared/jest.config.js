/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': ['ts-jest', { tsconfig: { allowJs: true } }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(uuid|@solana/web3.js|@solana/buffer-layout|@solana/codecs-core|@solana/codecs-numbers|@solana/errors)/)',
  ],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
}
