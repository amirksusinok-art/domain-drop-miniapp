CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS settings(id integer PRIMARY KEY CHECK(id=1), config jsonb NOT NULL, version integer NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, telegram_id text UNIQUE NOT NULL, username text NOT NULL, first_name text NOT NULL,
 coins bigint NOT NULL CHECK(coins>=0 AND coins<=9000000000000), xp integer NOT NULL DEFAULT 0 CHECK(xp>=0),
 pity integer NOT NULL DEFAULT 0, spins integer NOT NULL DEFAULT 0, free_spin boolean NOT NULL DEFAULT true,
 daily_claim_date date, reroll_date date, reroll_tokens integer NOT NULL DEFAULT 0 CHECK(reroll_tokens>=0),
 scanner_tokens integer NOT NULL DEFAULT 1 CHECK(scanner_tokens>=0), vault_slots integer NOT NULL DEFAULT 5,
 theme text NOT NULL DEFAULT 'CYBER', onboarded boolean NOT NULL DEFAULT false,
 last_spin_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS domains (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), name text NOT NULL, tld text NOT NULL,
 rarity text NOT NULL CHECK(rarity IN ('COMMON','UNCOMMON','RARE','EPIC','LEGENDARY','MYTHIC')),
 score integer NOT NULL, value bigint NOT NULL CHECK(value>=0), tags jsonb NOT NULL, breakdown jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','kept','sold','destroyed')), favorite boolean NOT NULL DEFAULT false,
 vaulted boolean NOT NULL DEFAULT false, showcase boolean NOT NULL DEFAULT false, source text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(NOT vaulted OR status='kept'), CHECK(NOT showcase OR status='kept')
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_drop ON domains(owner_id) WHERE status='pending';
ALTER TABLE domains ADD COLUMN IF NOT EXISTS spin_mode text;
CREATE INDEX IF NOT EXISTS collection_lookup ON domains(owner_id,status,created_at DESC);
CREATE OR REPLACE FUNCTION immutable_domain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.name,NEW.tld,NEW.rarity,NEW.score,NEW.value,NEW.tags,NEW.breakdown,NEW.spin_mode) IS DISTINCT FROM ROW(OLD.name,OLD.tld,OLD.rarity,OLD.score,OLD.value,OLD.tags,OLD.breakdown,OLD.spin_mode) THEN
   RAISE EXCEPTION 'Domain attributes are immutable';
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS immutable_domain_trigger ON domains;
CREATE TRIGGER immutable_domain_trigger BEFORE UPDATE ON domains FOR EACH ROW EXECUTE FUNCTION immutable_domain();
CREATE TABLE IF NOT EXISTS transactions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),amount bigint NOT NULL,balance_after bigint NOT NULL CHECK(balance_after>=0),reason text NOT NULL,reference text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ledger_user ON transactions(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS requests(user_id uuid NOT NULL REFERENCES users(id),key uuid NOT NULL,fingerprint text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,key));
CREATE TABLE IF NOT EXISTS spins(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),domain_id uuid NOT NULL REFERENCES domains(id),kind text NOT NULL,cost integer NOT NULL,pity_before integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS daily_progress(user_id uuid NOT NULL REFERENCES users(id),day date NOT NULL,metric text NOT NULL,value integer NOT NULL DEFAULT 0,PRIMARY KEY(user_id,day,metric));
CREATE TABLE IF NOT EXISTS reward_claims(user_id uuid NOT NULL REFERENCES users(id),reward_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,reward_key));
CREATE TABLE IF NOT EXISTS zone_pity(user_id uuid NOT NULL REFERENCES users(id),tld text NOT NULL,counter integer NOT NULL DEFAULT 0 CHECK(counter>=0),PRIMARY KEY(user_id,tld));
CREATE TABLE IF NOT EXISTS scanner_sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),cards jsonb NOT NULL,picked integer CHECK(picked BETWEEN 0 AND 2),created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS one_open_scanner ON scanner_sessions(user_id) WHERE picked IS NULL;
CREATE TABLE IF NOT EXISTS auctions(id uuid PRIMARY KEY,domain jsonb NOT NULL,starts_at timestamptz NOT NULL DEFAULT now(),ends_at timestamptz NOT NULL,bid bigint NOT NULL DEFAULT 0,start_price bigint NOT NULL,bidder_id uuid REFERENCES users(id),status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','settled')),domain_id uuid REFERENCES domains(id));
CREATE INDEX IF NOT EXISTS auctions_due ON auctions(status,ends_at);
CREATE TABLE IF NOT EXISTS auction_bids(id uuid PRIMARY KEY,auction_id uuid NOT NULL REFERENCES auctions(id),user_id uuid NOT NULL REFERENCES users(id),amount bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS events(id uuid PRIMARY KEY,title text NOT NULL,description text NOT NULL,tld text NOT NULL,boost numeric NOT NULL CHECK(boost>=1 AND boost<=10),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,CHECK(ends_at>starts_at));
CREATE TABLE IF NOT EXISTS admin_audit(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),action text NOT NULL,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS bot_updates(update_id bigint PRIMARY KEY,processed_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
