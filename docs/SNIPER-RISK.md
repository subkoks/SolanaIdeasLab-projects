# Sniper metadata and risk observations

These full-app endpoints use configured services; the dedicated local fixture server
has a separate simulated contract and never invokes this analysis.

| Endpoint | Authentication | Behavior |
|---|---|---|
| `GET /api/v1/tokens/:tokenAddress/score` | Public | Current Sniper heuristic score or its versioned cache |
| `POST /api/v1/tokens/analyze` | Required | Analysis for `tokenAddress` and optional `analysisDepth` |

## Mint observations

The metadata reader uses parsed mint-account data owned by the classic Token or
Token-2022 program. It requires a nonexecutable, initialized mint, integer decimals
from 0 through 255, unsigned u64 supply as an exact decimal string, and explicit
mint/freeze authorities as a canonical public key or `null`.
These fields follow [Agave's token decoder types](https://raw.githubusercontent.com/anza-xyz/agave/master/account-decoder-client-types/src/token.rs).

Zero decimals and zero supply remain valid observations. Missing authority fields,
malformed metadata, unsupported owners, undecoded bytes and failed reads cannot
establish revoked authorities or substitute a zero supply. Canonical native mints
also require the matching token program, nine decimals, zero mint supply and null
authorities. This validates their metadata; Sniper's other supply/distribution
heuristics do not yet implement Safety's explicit native concentration model.

Names, symbols, creators, social links and liquidity locks are not established by
this base mint read. `Unknown Token`, `UNKNOWN` and an empty creator are display
placeholders. No extra asset-metadata request is made by this reader.

## Authority and availability semantics

- `factors.renouncedMint` reflects explicit absence of the base mint authority.
- `factors.freezeAuthorityRevoked` reflects explicit absence of the base freeze authority.
- `factors.liquidityLocked` is `null`: the reader has no independent liquidity-lock evidence.
  Freeze-authority revocation is not proof of a liquidity lock.
- The contract category penalizes active authorities. Revoked authorities no longer
  lower that category's score. Telegram labels say revoked/active, without claiming a lock.
- New scores use the `risk_score_v3_*` cache namespace. Older entries remain stored
  but are not reused; TTL remains 30 minutes.

Metadata observation failures return HTTP 503 with no score, in both analysis routes:

```json
{"error":"Token observations unavailable","code":"TOKEN_OBSERVATIONS_UNAVAILABLE"}
```

Private provider error details are omitted. A genuinely absent mint or decoded
nonmint retains the public score route's `404 {"error":"Token not found"}` behavior.
Failed metadata analyses are not cached as scored reports.

## Supply and concentration

Supply and largest-account helpers validate raw u64 amount strings and propagate typed
unavailability. Largest-account rows are unique and sorted by raw balance before slicing.
The [RPC returns up to 20 largest token accounts](https://solana.com/docs/rpc/http/gettokenlargestaccounts),
not a complete list of distinct owners. Compatibility `getTokenHolders` returns sampled
positive-balance account addresses, using raw amounts rather than nullable display values.

Scoring uses mint supply and one validated 20-account response for its concentration factor,
distribution category and retained account-count liquidity heuristic. BigInt arithmetic
preserves raw precision. Percentage rounds upward to 0.01%, preserving strict integer score
thresholds. `distributionEvidence` exposes exact supply, sampled/top-ten sums, sampled/positive
account counts, `sampleLimit: 20`, account basis, rounding and explicit incomplete-holder/
unverified-liquidity flags. No UI amount participates in concentration math.

Zero supply, no positive sampled balance, or sampled totals above supply cannot establish
this concentration model and return typed 503 without caching a score. This includes native
mints until Sniper gains an explicit alternate supply basis. Genuine zero/empty helper responses
remain valid observations, but are insufficient for a complete scored report here.

Separate RPC reads are not atomic; provider completeness is unproven. The liquidity category
still uses an account-count heuristic and does not establish a pool or sellability. Recommendations
say to verify DEX liquidity separately. Social/developer/age placeholders remain unchanged.

## Launch monitoring

Unavailable launch analysis no longer creates a fabricated 50/100 medium-risk alert.
The monitor handles each launch independently and retains failed analyses before any
recording or notification, including webhook launches already deduplicated by detection.
Later polling cycles retry retained work even if the new-launch poll itself fails.

Retries are process-local, with at most 100 pending mints and three total analysis
attempts per retained launch. Capacity or attempt exhaustion logs unavailable analysis;
it does not emit a scored alert. Retained work is not durable across process restarts.
Automatic analysis retries stop before publication: publication failures are logged
without automatic replay because some notification side effects may have succeeded.
This does not establish guaranteed delivery or durable ingestion.

## Verification and remaining limits

Offline tests exercise the actual mint reader with mocked SDK transport, real risk
scoring and HTTP handlers with isolated cache/service stubs, and real monitor retry
behavior. The HTTP analysis test bypasses authentication to isolate observations;
it does not establish authentication acceptance. No live provider, Redis/Postgres,
Telegram delivery or asset-metadata service is exercised.

Sniper remains a partial reference implementation. Other liquidity,
social, developer and contract-age heuristics contain placeholders or default values;
Token-2022 extensions are not fully assessed. This metadata repair does not establish
a complete risk assessment or prove a token safe.
