# Shared Components Library

> Common patterns, authentication, database schemas, and reusable components used across all SolanaIdeasLab projects.

## Purpose

Avoid reinventing the wheel across 10+ projects by providing:
- Unified authentication system
- Common database patterns
- Shared UI components
- Standardized API patterns
- Common deployment configurations

## Structure

```
shared/
├── auth/              # Authentication patterns (JWT, OAuth, wallet)
├── database/          # Database schemas and migrations
├── api/               # API patterns and middleware
├── ui/                # Reusable React components
├── monitoring/        # Logging, metrics, error tracking
├── payments/          # Stripe integration patterns
└── deployment/        # Docker, CI/CD templates
```

## Usage

Import patterns into individual projects:
```bash
cp -r shared/auth ../token-sniper-bot/src/
cp -r shared/database ../wallet-tracker-pro/src/
```

## Projects Using This

- [x] Token Sniper Bot
- [x] Token Safety Bot  
- [x] Wallet Tracker Pro
- [x] Airdrop Tracker
- [x] KOL Tracker
- [x] Token Safety Suite
- [x] On-Chain Casino
- [x] AI Agent Platform
- [x] Crypto Tax Calculator
