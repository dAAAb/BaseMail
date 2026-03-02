-- BaseMail v3: World ID Human Verification
-- Rollback: DROP TABLE world_id_verifications; (accounts.is_human stays 0)

-- World ID verification records
CREATE TABLE IF NOT EXISTS world_id_verifications (
    id                TEXT PRIMARY KEY,
    handle            TEXT NOT NULL,
    wallet            TEXT NOT NULL,
    nullifier_hash    TEXT NOT NULL UNIQUE,
    verification_level TEXT NOT NULL DEFAULT 'orb',  -- orb | device
    credential_type   TEXT,                           -- v3 legacy field
    world_id_version  TEXT NOT NULL DEFAULT 'v4',
    verified_at       INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (handle) REFERENCES accounts(handle)
);

CREATE INDEX IF NOT EXISTS idx_worldid_handle ON world_id_verifications(handle);
CREATE INDEX IF NOT EXISTS idx_worldid_nullifier ON world_id_verifications(nullifier_hash);
