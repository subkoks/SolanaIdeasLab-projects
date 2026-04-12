/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  passWithNoTests: true,
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
};
