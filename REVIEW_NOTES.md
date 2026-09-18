# Review notes: last five commits

Reviewed on 2026-09-18:

- `121b690` — merge of seller photos and Stripe Identity
- `c74b1f0` — database connection pre-ping
- `fa91890` — merge of the privacy page
- `e6e2a8f` — public privacy policy page
- `c1570aa` — seller photos and Stripe Identity

## Finding

**Fixed — stale Stripe Identity webhooks could replace the active verification
state.** When a seller restarted verification, both sessions carried the same
user ID in metadata. A delayed webhook from the canceled session was therefore
able to select the user and overwrite the newer session ID and status. Webhook
handling now requires the event's session ID to match the session currently
stored for that user. A regression test covers an out-of-order cancellation.

No additional correctness or security defects requiring a code change were
found in these five commits. The full backend test suite passed after the fix;
Postgres-only migration tests remain skipped unless `TEST_DATABASE_URL` is
provided.
