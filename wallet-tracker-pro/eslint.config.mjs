// ESLint 9 flat config (migrated from .eslintrc.json for eslint-config-next 16).
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

export default [
  { ignores: [".next/**", "node_modules/**", "dist/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
];
