# SPIN and Auction extension

SPIN generation, prices, pity and immutable drop snapshots are unchanged. The playfield reserves permanent selector, domain/status, rarity/value/serial/tags, Luck, honor and action slots. Recent Drops appears after the playfield and refreshes only once the request/reveal finishes. The TLD strip scrolls horizontally within itself, without scrolling the document.

Reveal pauses: ordinary rarities 300 ms after complete domain; Legendary 300 ms silence then 150 ms dim; Mythic 400 ms silence, then 250 ms UNKNOWN SIGNAL before rarity. Fixed TLD remains known. Normal/fast timing, acceleration and reduced-motion paths retain their existing architecture. Legendary and Mythic have distinct synthesized short cues, gated by both persisted sound settings; reduced motion suppresses reveal audio and haptics.

Schema version 6 adds auction kind/slot, per-user watchlists and expiring Common sale quotes. Existing auctions, bids, wallet balances, serials and domain values are preserved.

## Auctions

The existing advisory-locked scheduler settles escrow first, then fills one Daily slot (12 h) and four Live slots (30/60/120/240 min). Existing/manual lots remain additional lots until they finish. Each automated replacement excludes the previous 20 automated addresses and all currently active addresses. Pool attributes are evaluated on the server using enabled zones and existing domain valuation; no Serial or global discovery is minted for artificial auction supply.

Live rarity weights: Rare 65 / Epic 28 / Legendary 6 / Mythic 1. Daily: Epic 65 / Legendary 30 / Mythic 5. If an administrator removes all candidates of a rarity, weights normalize over remaining eligible rarities; if none remain, settlement still commits and creation waits for an eligible configuration. Starting price remains max(1,000, rounded 50% of saved value).

Watchlists belong to authenticated users and persist across devices. Active lots and the most recent 20 completed lots are returned, together with all lots watched by that user. No Telegram ID is exposed. UI refreshes every 10 seconds while visible, timers every second. Server settlement runs every 30 seconds; an expired lot shows completion in progress until settlement is confirmed. All bids still pass original server deadline, escrow, ban/freeze and idempotency checks.

## Collection and profile

Sell All Common always covers the entire kept collection, ignoring UI filters. It excludes favorite/vault/showcase, Serial and the union of built-in protected patterns and administrator-protected tags. Preview stores exact IDs, server total and a 5-minute expiration. Confirmation locks the user, quote and eligible domains, revalidates ownership/status/protection and sells that snapshot atomically with one ledger credit and quest progress. Added drops are not silently included. Changed/expired/used quotes require renewed confirmation; normal idempotency safely replays a completed request.

Favorite TLD uses actual domain zones from historical ordinary SPIN records, including the first free spin and RANDOM outcomes, excluding Scanner and Re-roll. Sold/destroyed drops remain in statistics; ties use latest drop time then stable zone name. Recent Drops shows the latest 10 personal SPIN, Re-roll and chosen Scanner results, initially five, including status and server values.

Validation: backend tests cover auction slot replenishment, rarity boundaries, recent-address exclusion, preserved old bids, private watchlists, sale snapshot protection/replay/expiry/freeze and historical statistics. Browser QA covers fixed SPIN geometry, native tap scroll stability, watchlist filtering, confirmation/cancellation/sale and mobile widths. Real phone speaker/haptic behavior depends on Telegram client support and requires device verification.
