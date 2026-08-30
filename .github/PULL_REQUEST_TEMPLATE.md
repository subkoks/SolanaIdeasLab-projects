## Description

Please include a summary of the change and which issue (if any) it addresses.

Fixes #

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] Security fix (auth, redirect, signing, validation, rate limit, secret handling)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that changes existing behavior)
- [ ] Documentation / CI / tooling only

## How has this been tested?

- [ ] `bash scripts/test-all.sh` passes locally (type-check + tests, no network/deploy)
- [ ] Affected package's `npm run type-check` and `npm test` pass
- [ ] Security-sensitive change has a regression test

## Security checklist

If this touches auth, redirects, signing, transaction construction, external URLs,
user input, or serialization, confirm:

- [ ] No real keys / seed phrases / tokens are committed (use `[REDACTED]`)
- [ ] No production endpoints or production credentials are used in tests
- [ ] Rate limits / validation were not weakened

## Notes for reviewers

Anything specific you want reviewed, or follow-up work planned.
