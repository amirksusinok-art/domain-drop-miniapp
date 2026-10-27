ALTER TABLE users ADD COLUMN IF NOT EXISTS quick_level integer NOT NULL DEFAULT 0 CHECK(quick_level BETWEEN 0 AND 5);
ALTER TABLE users ADD COLUMN IF NOT EXISTS quick_rules jsonb NOT NULL DEFAULT '{"enabled":false,"rarities":["COMMON"],"below":null,"tlds":[],"keepTags":["SHORT","TRIPLE","PERFECT MATCH"],"favoriteTld":null}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS permanent_ban boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_ack boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_amount integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cosmetics jsonb NOT NULL DEFAULT '[]';
ALTER TABLE domains ADD COLUMN IF NOT EXISTS serial bigint;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS finder_id uuid REFERENCES users(id);
ALTER TABLE domains ADD COLUMN IF NOT EXISTS quick_sold boolean NOT NULL DEFAULT false;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS acknowledged boolean NOT NULL DEFAULT true;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS discovery jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS domain_serial_unique ON domains(name,tld,serial) WHERE serial IS NOT NULL;
CREATE INDEX IF NOT EXISTS drop_records ON domains(value DESC,created_at,id) WHERE source IN ('spin','reroll','scanner');
CREATE TABLE IF NOT EXISTS domain_serial_counters(name text NOT NULL,tld text NOT NULL,last_number bigint NOT NULL,PRIMARY KEY(name,tld));
CREATE TABLE IF NOT EXISTS system_config(id integer PRIMARY KEY CHECK(id=1),config jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS promo_codes(id uuid PRIMARY KEY,code text UNIQUE NOT NULL,reward_type text NOT NULL,reward_value integer NOT NULL,cosmetic text,total_limit integer NOT NULL,user_limit integer NOT NULL,starts_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,enabled boolean NOT NULL DEFAULT true,uses integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),CHECK(expires_at>starts_at));
CREATE TABLE IF NOT EXISTS promo_redemptions(id uuid PRIMARY KEY,promo_id uuid NOT NULL REFERENCES promo_codes(id),user_id uuid NOT NULL REFERENCES users(id),ordinal integer NOT NULL,reward_type text NOT NULL,reward_value integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(promo_id,user_id,ordinal));
CREATE TABLE IF NOT EXISTS security_flags(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),kind text NOT NULL,day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,detail jsonb NOT NULL DEFAULT '{}',resolved boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,kind,day));
CREATE OR REPLACE FUNCTION immutable_domain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.name,NEW.tld,NEW.rarity,NEW.score,NEW.value,NEW.tags,NEW.breakdown,NEW.source,NEW.spin_mode,NEW.serial,NEW.finder_id,NEW.discovery) IS DISTINCT FROM ROW(OLD.name,OLD.tld,OLD.rarity,OLD.score,OLD.value,OLD.tags,OLD.breakdown,OLD.source,OLD.spin_mode,OLD.serial,OLD.finder_id,OLD.discovery) THEN
 RAISE EXCEPTION 'Domain attributes are immutable';
 END IF;
 RETURN NEW;
END; $$;
CREATE INDEX IF NOT EXISTS drop_records_time ON domains(created_at DESC,id) WHERE source IN ('spin','reroll','scanner');
CREATE INDEX IF NOT EXISTS personal_drop_records ON domains((COALESCE(finder_id,owner_id)),value DESC,created_at,id) WHERE source IN ('spin','reroll','scanner');
CREATE INDEX IF NOT EXISTS spins_user_time ON spins(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS bids_user_time ON auction_bids(user_id,created_at DESC);
