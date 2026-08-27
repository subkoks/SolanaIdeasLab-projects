# Security Policy

## Supported Versions

This monorepo (`SolanaIdeasLab-projects`) is under continuous local development.
Security fixes are applied to the `main` branch; pin to the latest `main` and
keep dependencies updated.

| Branch | Supported with security updates |
| ------ | ------------------------------- |
| `main` | :white_check_mark: |
| older  | :x: |

## Authentication & Authorization Model

- **Wallet ownership proof**: clients sign a server-issued, timestamped Ed25519
  challenge; the server verifies the signature against the claimed Solana public
  key (real `crypto.verify`). Forgery is not possible by merely presenting
  another key.
- **Session tokens**: HS256 JWTs (HMAC-SHA256) signed with an operator-supplied
  secret. Verification uses a timing-safe comparison and rejects expired or
  tampered tokens. The library refuses to initialize with a `jwtSecret` shorter
  than 16 characters.
- **Tier / entitlement gating**: endpoints require a minimum subscription tier or
  specific entitlement; requests below the required tier receive `403`.
- **Production guardrails**: a `production-guard` utility rejects unsafe
  configurations at startup in production (e.g. `SKIP_AUTH_IN_DEV`,
  `SKIP_WALLET_SIGNATURE_VERIFY`, a default/dev JWT secret). The development
  auth bypass is gated to non-production runtimes only and is covered by
  regression tests.

## Safe Redirect Handling

Return URLs are validated through a safe-return helper that only allows
same-origin absolute URLs or same-origin relative paths beginning with `/`;
everything else falls back to an application-controlled path. This prevents
open-redirect (`//evil.com`, scheme-less, or cross-origin) attacks.

## Reporting a Vulnerability

- **Do not** open a public GitHub issue for security reports.
- Email the maintainer privately or use GitHub's private vulnerability reporting
  for this repository.
- Expect an acknowledgement within a few business days; if accepted, a fix is
  prepared on a private branch and shipped via a security release/PR. If
  declined, you will be given the rationale.

## Out of Scope / Hard Boundaries

This project is local-first. The autonomous build does not perform on-chain
actions, key generation, wallet funding, deploys, or any external state change.
