# World ID v4 Integration Plan

## Overview
Add World ID human verification to BaseMail. Users prove they're human via World App → get ✅ Human badge on profile.

## Components

### 1. DB Migration (`migration-v3-world-id.sql`)
- `world_id_verifications` table: handle, nullifier_hash, verification_level, verified_at
- `accounts` table: add `is_human INTEGER DEFAULT 0`

### 2. Worker Routes (`routes/world-id.ts`)
- `POST /api/world-id/verify` — verify proof from IDKit, store nullifier, mark account
- `GET /api/world-id/status/:handle` — public: check if handle is verified human

### 3. Frontend
- IDKit v4 button on Dashboard (Settings section)
- ✅ Human badge on AgentProfile page
- Uses `@worldcoin/idkit` React component

### 4. Env Vars (wrangler.toml secrets)
- `WORLD_ID_APP_ID` = app_7099aeba034f8327d91420254b4b660e
- `WORLD_ID_ACTION` = verify-human
- `WORLD_ID_API_KEY` = (stored as secret, not in code)

## Verification Flow
1. User clicks "Verify Human" on Dashboard
2. IDKit opens → World App scan
3. Proof returned to frontend
4. Frontend POSTs proof to `/api/world-id/verify`
5. Worker calls World ID `/api/v2/verify/{app_id}` (cloud verification)
6. If valid → store nullifier + set is_human = 1
7. Profile shows ✅ Human badge

## Rollback
- All new code in separate files (route, migration)
- Single `git revert` removes everything
- No existing tables modified (is_human default 0 = backward compatible)

## Security
- Nullifier stored to prevent double-verification
- API key in wrangler secrets only
- Private signing key NOT used in v2 verify flow (only needed for v4 OPRF)
