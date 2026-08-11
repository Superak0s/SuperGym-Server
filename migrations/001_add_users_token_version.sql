-- Adds a per-user token version counter used to revoke all outstanding JWTs
-- at once (e.g. via POST /api/auth/logout-all). Bumping this column makes
-- every previously issued token fail auth, since each token embeds the
-- version it was issued under.
ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0;
