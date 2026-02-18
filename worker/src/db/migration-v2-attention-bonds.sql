-- BaseMail v2: Attention Bond Migration
-- Run after schema.sql

-- ── Attention Configuration (per-account) ──
CREATE TABLE IF NOT EXISTS attention_config (
    handle          TEXT PRIMARY KEY,
    base_price      REAL NOT NULL DEFAULT 0.01,   -- p₀ in USDC
    alpha           REAL NOT NULL DEFAULT 0.1,     -- demand sensitivity
    beta            REAL NOT NULL DEFAULT 1.0,     -- price growth exponent (1=QV-like)
    gamma           REAL NOT NULL DEFAULT 0.5,     -- reply rate discount (max 0.99)
    response_window INTEGER NOT NULL DEFAULT 604800, -- 7 days in seconds
    enabled         INTEGER NOT NULL DEFAULT 0,    -- 0=off (no bond required), 1=on
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (handle) REFERENCES accounts(handle)
);

-- ── Attention Bonds (escrow tracking) ──
CREATE TABLE IF NOT EXISTS attention_bonds (
    email_id        TEXT PRIMARY KEY,
    sender_handle   TEXT NOT NULL,
    sender_wallet   TEXT NOT NULL,
    recipient_handle TEXT NOT NULL,
    recipient_wallet TEXT NOT NULL,
    amount_usdc     REAL NOT NULL,           -- bond amount in USDC
    tx_hash         TEXT,                     -- deposit tx hash on Base
    status          TEXT NOT NULL DEFAULT 'active', -- active|refunded|forfeited|exempt
    deposit_time    INTEGER NOT NULL DEFAULT (unixepoch()),
    response_deadline INTEGER NOT NULL,      -- unix timestamp
    resolved_time   INTEGER,                 -- when refund/forfeit happened
    refund_tx_hash  TEXT,                    -- refund or forfeit tx hash
    protocol_fee    REAL DEFAULT 0,          -- τ portion
    FOREIGN KEY (sender_handle) REFERENCES accounts(handle),
    FOREIGN KEY (recipient_handle) REFERENCES accounts(handle)
);

CREATE INDEX IF NOT EXISTS idx_bonds_sender ON attention_bonds(sender_handle, status);
CREATE INDEX IF NOT EXISTS idx_bonds_recipient ON attention_bonds(recipient_handle, status);
CREATE INDEX IF NOT EXISTS idx_bonds_deadline ON attention_bonds(response_deadline) WHERE status = 'active';

-- ── Whitelist (sender exemptions per recipient) ──
CREATE TABLE IF NOT EXISTS attention_whitelist (
    id              TEXT PRIMARY KEY,
    recipient_handle TEXT NOT NULL,
    sender_handle   TEXT,                    -- null = by wallet only
    sender_wallet   TEXT,                    -- null = by handle only
    note            TEXT,                    -- reason for whitelisting
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (recipient_handle) REFERENCES accounts(handle)
);

CREATE INDEX IF NOT EXISTS idx_whitelist_recipient ON attention_whitelist(recipient_handle);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whitelist_unique ON attention_whitelist(recipient_handle, sender_handle) WHERE sender_handle IS NOT NULL;

-- ── Sender Reputation (reply rates per sender-recipient pair) ──
CREATE TABLE IF NOT EXISTS sender_reputation (
    id              TEXT PRIMARY KEY,
    sender_handle   TEXT NOT NULL,
    recipient_handle TEXT NOT NULL,
    emails_sent     INTEGER NOT NULL DEFAULT 0,
    emails_replied  INTEGER NOT NULL DEFAULT 0,
    reply_rate      REAL NOT NULL DEFAULT 0.0,   -- R̄ₛ(t)
    total_bonded    REAL NOT NULL DEFAULT 0.0,    -- total USDC bonded
    total_refunded  REAL NOT NULL DEFAULT 0.0,    -- total USDC refunded
    total_forfeited REAL NOT NULL DEFAULT 0.0,    -- total USDC forfeited
    last_email_at   INTEGER,
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (sender_handle) REFERENCES accounts(handle),
    FOREIGN KEY (recipient_handle) REFERENCES accounts(handle)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reputation_pair ON sender_reputation(sender_handle, recipient_handle);

-- ── QAF Scores (cached per recipient) ──
CREATE TABLE IF NOT EXISTS qaf_scores (
    handle          TEXT PRIMARY KEY,
    qaf_value       REAL NOT NULL DEFAULT 0.0,     -- AV = (Σ√bᵢ)²
    coqaf_value     REAL NOT NULL DEFAULT 0.0,     -- AV_CO (if graph data available)
    unique_senders  INTEGER NOT NULL DEFAULT 0,     -- n
    total_bonds     REAL NOT NULL DEFAULT 0.0,      -- Σbᵢ
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (handle) REFERENCES accounts(handle)
);

-- ── Add bond fields to emails table ──
-- Note: D1 doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS
-- These will be added in code if they don't exist
-- ALTER TABLE emails ADD COLUMN bond_status TEXT DEFAULT NULL;
-- ALTER TABLE emails ADD COLUMN bond_amount REAL DEFAULT NULL;
