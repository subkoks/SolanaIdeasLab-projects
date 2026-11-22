# Wallet durable delivery

The Wallet delivery gate is hard-coded off. In this revision, the full Telegram bot
exits before starting, and the Wallet activity API returns HTTP 503. The fixture
demo still uses deterministic local data. Publishing this code does not authorize
deploying it or applying the draft migration.

## Delivery behavior

- For a watch with a saved cursor, the reader must find that cursor and retrieve
  metadata for every newer transaction within the bounded RPC window. An
  unavailable transaction or history gap holds the read and preserves the cursor.
  A new watch without a cursor reads only the newest page. Each RPC request has a
  deadline that aborts its transport so one stalled provider response cannot
  block later watches or drains.
- Ingestion verifies the subscriber, watch revision, and expected cursor before a
  write. It commits activity, immutable notification snapshots, and the cursor in
  one transaction. Readable transactions with no balance change retain an
  `unknown` activity entry. If ingestion receives a verified cursor with an
  empty batch, it updates only the cursor. Stale readers cannot overwrite it.
- Activity is keyed by wallet, transaction signature, and movement. Delivery is
  keyed by watch, signature, and movement. Existing activity rows keep their IDs
  and payloads. A legacy notification suppresses replay only for the watch that
  owns it, while missing activity for another watch can still be recorded. A
  label-only watch edit does not cancel already-enqueued immutable snapshots.
  Persisted transaction order keeps same-timestamp activity and delivery queues
  deterministic.
- The dispatcher claims each pending row before attempting a send. An ambiguous
  Telegram response or an interrupted claim is retained for reconciliation.
  Sends to one chat are paced, and an explicit Telegram 429 returns the row to
  pending with `nextAttemptAt` set from `retry_after`. Ambiguous outcomes remain
  outside the automatic retry queue.

## Cutover and rollback

1. Obtain approval for the target environment, backup, migration, and activation.
   Keep this revision off the live bot and API until that release is approved.
2. Coordinate with the operator of the legacy Wallet bot. Quiesce legacy polling
   and dispatch, then inventory every undelivered `WalletNotification`, including
   claimed rows and rows with an uncertain provider outcome. Export and preserve
   their delivery evidence with the approved database backup.
3. Resolve pending and ambiguous legacy rows before switching. Carry forward or
   deliver only work whose status can be established. Require operator
   reconciliation for ambiguous claims. The new dispatcher reads only
   `WalletDelivery`, and the draft does not copy or replay historical
   notifications. Changing a watch in the new ledger preserves legacy records.
4. Review the SQL under `wallet-tracker-pro/prisma/drafts/` against the target
   database and test migration and rollback with an isolated restore. Promote it
   to a new Prisma migration only as part of the approved release. Verify the
   applied schema and legacy records before reviewing a separate gate change.
5. After activation, use retained database and provider evidence for delivery
   reconciliation. Once new movement identities or sends exist, returning to
   the old signature-unique schema requires an approved restore and
   reconciliation plan.

## Verification

From `wallet-tracker-pro` on Node 24, run the frozen install, Prisma client
generation, type-check, lint, Jest, Next build, and production dependency audit.
The pull request's checks and review identify the exact revision tested.

On macOS with Homebrew PostgreSQL 16, `npm run test:delivery:postgres` creates a
private synthetic cluster on a Unix socket with TCP disabled. It verifies
migration preservation, rollback, concurrent writes, cursor-only advances,
legacy notifications, and ambiguous sends. CI also runs the database Jest suites
and the same durable-delivery integration file against separate dedicated
service databases. It loads the draft explicitly in those fixtures and fails if
the selected Jest suites or tests are skipped.
