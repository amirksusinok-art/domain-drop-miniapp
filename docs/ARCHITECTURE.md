# DOMAIN DROP

Telegram WebView → React / Vite → Express TypeScript API → PostgreSQL.

## Decisions

- Domains are virtual collectible instances. Duplicate names are allowed.
- Immutable name, TLD, score, rarity, tags and valuation snapshot. Database trigger prevents mutation.
- 50,000 starting coins (new users only); one first free spin; daily claim of 1,000 coins; 750 RANDOM spin (fixed TLD prices are independent); one daily re-roll. UTC days.
- Ordinary paid-spin target RTP is 80%, including pity, excluding rewards, first spin, re-rolls, events and auctions. Simulation reports the actual result; it is not a promise to individual players.
- One unresolved drop per player. Reload restores it. Re-roll destroys it atomically and creates a new instance.
- Transactions and row locks serialize each player's economy. Idempotency keys bind to request method, path and payload. Ledger records every currency change.
- Auctions escrow the full bid, refund the previous bidder and settle once. Auction lock precedes participant locks, acquired in sorted order. Scheduler uses PostgreSQL advisory transaction lock for multi-instance safety.
- Scanner generates all three cards on the server when opened; hidden cards are not sent until a choice is committed. Only selected result affects XP/pity.
- Authentication verifies original Telegram initData with HMAC-SHA256 and freshness; opaque session tokens are stored hashed. Production disables development auth and embedded database.
- Admin IDs come from environment, never client claims. Settings validated and audited. New configuration never reprices owned items.

## Layout

`server/`: auth, database adapter, migrations, economy, game services, API, scheduler.
`src/`: mobile-first React screens, Card Decryption animation and Telegram bridge.
`shared/`: response types; no economy configuration or secrets in browser code.
`tests/`: authentication, immutable snapshots, transactional gameplay and concurrency regression tests.

## Operations

Single web service serves API and compiled SPA over same origin. Production PostgreSQL is external. Migrations run at boot under a lock. Sessions expire after 7 days. Rate limits protect login and mutations; horizontal scaling requires a shared rate-limit store before scaling beyond one web instance. Database transactions remain safe across instances.

## Extension boundaries

No real payments, real-domain registration or cash-out. Cosmetics do not affect odds. Rewards for levels, quests and collection sets are explicitly defined on server. Events only change future drop distribution. Background processing does not require an in-memory queue; each scheduler pass queries persisted due work.
