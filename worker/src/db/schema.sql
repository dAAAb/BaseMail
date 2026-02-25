-- BaseMail D1 Schema

-- 帳號表：錢包 ↔ Email handle 映射
CREATE TABLE IF NOT EXISTS accounts (
    handle      TEXT PRIMARY KEY,
    wallet      TEXT NOT NULL UNIQUE,
    basename    TEXT,
    webhook_url TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    tx_hash     TEXT
);

CREATE INDEX IF NOT EXISTS idx_accounts_wallet ON accounts(wallet);

-- 郵件表：收件匣 + 已寄送
CREATE TABLE IF NOT EXISTS emails (
    id          TEXT PRIMARY KEY,
    handle      TEXT NOT NULL,
    folder      TEXT NOT NULL DEFAULT 'inbox',
    from_addr   TEXT NOT NULL,
    to_addr     TEXT NOT NULL,
    subject     TEXT,
    snippet     TEXT,
    r2_key      TEXT NOT NULL,
    size        INTEGER DEFAULT 0,
    read        INTEGER DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    usdc_amount TEXT,
    usdc_tx     TEXT,
    usdc_network TEXT,
    FOREIGN KEY (handle) REFERENCES accounts(handle)
);

CREATE INDEX IF NOT EXISTS idx_emails_inbox ON emails(handle, folder, created_at DESC);

-- Basename 自動註冊等候名單（Coming Soon 功能）
CREATE TABLE IF NOT EXISTS waitlist (
    id              TEXT PRIMARY KEY,
    wallet          TEXT NOT NULL,
    desired_handle  TEXT NOT NULL,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_waitlist_handle ON waitlist(desired_handle);

-- Refresh tokens (long-lived) for access token re-issue
CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash   TEXT PRIMARY KEY,
    wallet       TEXT NOT NULL,
    handle       TEXT NOT NULL,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at   INTEGER NOT NULL,
    last_used_at INTEGER,
    FOREIGN KEY (handle) REFERENCES accounts(handle)
);

CREATE INDEX IF NOT EXISTS idx_refresh_wallet ON refresh_tokens(wallet);

-- API keys (long-lived, revocable) for agent usage without private keys
CREATE TABLE IF NOT EXISTS api_keys (
    key_hash     TEXT PRIMARY KEY,
    handle       TEXT NOT NULL,
    name         TEXT,
    scopes       TEXT NOT NULL DEFAULT 'send,inbox',
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    last_used_at INTEGER,
    revoked_at   INTEGER,
    FOREIGN KEY (handle) REFERENCES accounts(handle)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_handle ON api_keys(handle);

-- ═══════════════════════════════════════════════════
-- BaseMail v2: Attention Bond Tables
-- ═══════════════════════════════════════════════════

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
CREATE INDEX IF NOT EXISTS idx_bonds_deadline ON attention_bonds(status, response_deadline);

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_whitelist_unique ON attention_whitelist(recipient_handle, sender_handle);

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

-- ═══════════════════════════════════════════════════
-- BaseMail v2: Basename Aliases & Multi-Handle
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS basename_aliases (
  id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  handle TEXT NOT NULL,
  basename TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  expiry INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (wallet) REFERENCES accounts(wallet)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alias_handle ON basename_aliases(handle);
CREATE INDEX IF NOT EXISTS idx_alias_wallet ON basename_aliases(wallet);

-- ═══════════════════════════════════════════════════
-- BaseMail v2.1: Payment Escrow Claims (external email USDC)
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS escrow_claims (
    claim_id         TEXT PRIMARY KEY,
    sender_handle    TEXT NOT NULL,
    sender_wallet    TEXT NOT NULL,
    recipient_email  TEXT NOT NULL,
    amount_usdc      REAL NOT NULL,
    deposit_tx       TEXT NOT NULL,
    network          TEXT NOT NULL DEFAULT 'base-mainnet',
    status           TEXT NOT NULL DEFAULT 'pending',  -- pending | claimed | refunded | expired
    claimer_handle   TEXT,
    claimer_wallet   TEXT,
    release_tx       TEXT,
    receipt_email_id TEXT,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at       INTEGER NOT NULL,
    claimed_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_escrow_sender ON escrow_claims(sender_handle);
CREATE INDEX IF NOT EXISTS idx_escrow_status ON escrow_claims(status, expires_at);

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
