ALTER TABLE auctions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'manual' CHECK(kind IN ('manual','daily','live'));
ALTER TABLE auctions ADD COLUMN IF NOT EXISTS slot text;
CREATE UNIQUE INDEX IF NOT EXISTS auction_active_slot ON auctions(slot) WHERE status='active' AND slot IS NOT NULL;
CREATE TABLE IF NOT EXISTS auction_watchlist (
 user_id uuid NOT NULL REFERENCES users(id), auction_id uuid NOT NULL REFERENCES auctions(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,auction_id)
);
CREATE TABLE IF NOT EXISTS common_sale_quotes (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), domain_ids jsonb NOT NULL,
 total bigint NOT NULL, expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes', used boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS common_quotes_expiry ON common_sale_quotes(expires_at);
CREATE INDEX IF NOT EXISTS spins_personal_recent ON spins(user_id,created_at DESC,id DESC);
