# BaseMail v3.0 — $ATTN Implementation Plan (FINAL)

> **Goal**: Off-chain $ATTN points MVP + USDC bond sunset
> **Estimated effort**: ~3 days
> **Rollback**: All changes are additive. Each step has rollback instructions.
> **Branch**: `feature/attn-v3`
> **決策日期**: 2026-02-28
> **決策者**: 寶博 + Tom Lam feedback + 雲龍蝦規劃

---

## Core Design (Tom Lam Philosophy)

> "All positive feedback, no punishment."

- **免費用**: 每天 drip 10 ATTN，註冊送 50
- **讀了 = approve**: 退款給寄件人（你的信是好的）
- **沒讀/拒絕 = 痛苦補償**: ATTN 轉給收件人
- **回信 = 最高獎勵**: 退款 + 雙方各得 bonus
- **USDC = 加速器**: 花錢買更多 ATTN，不是門檻

## Key Decisions

| 決策 | 選擇 | 原因 |
|------|------|------|
| 帳戶餘額上限 | ❌ 移除 | daily earn cap 就夠了 |
| 每日收入上限 | 200 ATTN/天 | 防 farming |
| v2 USDC Bond | Sunset mode | 不接新 bond，現有正常結算 |
| Token 上鏈 | v3.0 不上鏈 | Off-chain points 先驗證機制 |
| USDC 充值 | ✅ 買 ATTN credits | freemium 模式 |
| Cold vs reply 定價 | 3 / 1 ATTN | 差異化定價 |
| Reply bonus | +2 / +2 雙方 | 鼓勵真對話 |
| Reject 功能 | ✅ 不打開就拒 | 立即補償，用戶有控制感 |

---

## Constants

```typescript
const ATTN_SIGNUP_GRANT = 50;
const ATTN_DAILY_DRIP = 10;
const ATTN_DAILY_EARN_CAP = 200;
const ATTN_DEFAULT_STAKE = 1;
const ATTN_COLD_STAKE = 3;       // 第一次寄給陌生人
const ATTN_REPLY_STAKE = 1;      // 已有對話的回覆串
const ATTN_REPLY_BONUS = 2;      // 回信時雙方各得
const ATTN_MIN_STAKE = 1;
const ATTN_MAX_STAKE = 10;
const ATTN_ESCROW_WINDOW = 48 * 60 * 60; // 48 hours
const ATTN_BUY_RATE = 100;       // 1 USDC = 100 ATTN
```

---

## ATTN Economy Flow

```
動作              寄件人          收件人          系統
────────────────  ─────────      ──────         ────
寄信(cold)        -3 ATTN        escrow         
寄信(reply串)     -1 ATTN        escrow         
收件人讀了        +refund         0              
收件人回信        +refund +2      +2 bonus       mint +4
收件人拒絕        -forfeit        +stake         
48h 超時沒讀      -forfeit        +stake         
每日 drip          +10            +10            mint
註冊              +50             —              mint +50
USDC 充值         +N ATTN         —              mint (paid)
```

---

## Database Schema

```sql
-- 1. Balance per account
CREATE TABLE IF NOT EXISTS attn_balances (
  wallet TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  daily_earned INTEGER NOT NULL DEFAULT 0,
  last_drip_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_earn_reset INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2. Transaction log (audit trail)
CREATE TABLE IF NOT EXISTS attn_transactions (
  id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  ref_email_id TEXT,
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_attn_tx_wallet ON attn_transactions(wallet, created_at);
CREATE INDEX IF NOT EXISTS idx_attn_tx_date ON attn_transactions(wallet, type, created_at);

-- 3. Escrow for pending emails
CREATE TABLE IF NOT EXISTS attn_escrow (
  email_id TEXT PRIMARY KEY,
  sender_wallet TEXT NOT NULL,
  receiver_wallet TEXT NOT NULL,
  sender_handle TEXT NOT NULL,
  receiver_handle TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  settled_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_attn_escrow_status ON attn_escrow(status, expires_at);

-- 4. Per-user ATTN settings
CREATE TABLE IF NOT EXISTS attn_settings (
  handle TEXT PRIMARY KEY,
  receive_price INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

---

## Step-by-Step Implementation

### Step 1: `routes/attn.ts` — New file + DB tables + endpoints

**New file**: `worker/src/routes/attn.ts`

Auto-migration middleware creates all 4 tables on first request.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/attn/balance` | Balance + next drip time + daily earned |
| GET | `/api/attn/history` | Transaction log (paginated) |
| POST | `/api/attn/buy` | USDC → ATTN (verify on-chain tx) |
| GET | `/api/attn/settings` | My receive-price |
| PUT | `/api/attn/settings` | Set receive-price (1-10) |

**Mount in index.ts**: `app.route('/api/attn', attnRoutes);`

🔴 **Rollback**: Delete `routes/attn.ts`, remove route from `index.ts`. Tables are inert.

---

### Step 2: Auto-grant on auth

**File**: `routes/auth.ts` → `agent-register` handler

After successful login/register:
```typescript
try {
  // Check if ATTN balance exists
  const bal = await c.env.DB.prepare(
    'SELECT wallet FROM attn_balances WHERE wallet = ?'
  ).bind(address.toLowerCase()).first();
  
  if (!bal) {
    await c.env.DB.batch([
      c.env.DB.prepare(
        'INSERT INTO attn_balances (wallet, handle, balance) VALUES (?, ?, 50)'
      ).bind(address.toLowerCase(), handle),
      c.env.DB.prepare(
        'INSERT INTO attn_transactions (id, wallet, amount, type, note) VALUES (?, ?, 50, \'signup_grant\', \'Welcome to BaseMail!\')'
      ).bind(generateId(), address.toLowerCase()),
    ]);
  }
} catch (_) { /* ATTN tables may not exist yet — skip gracefully */ }
```

🔴 **Rollback**: Remove the try/catch block. Zero impact on auth flow.

---

### Step 3: Modify `POST /api/send` — auto-stake ATTN

**File**: `routes/send.ts`

After validation, before email delivery:
```
1. Determine stake amount:
   - Same wallet → 0 (self-send, no stake)
   - Has prior conversation (email from recipient exists in inbox) → ATTN_REPLY_STAKE (1)
   - First contact (cold) → ATTN_COLD_STAKE (3)
   - Whitelisted → 0

2. Check sender's attn_balance >= stake
   - YES → deduct, create escrow, log 'stake' tx
   - NO  → WARNING in response, but STILL SEND (never block)

3. Response includes: { attn: { staked: 3, balance_after: 47, escrow_id: "..." } }
```

**Detection of "cold" vs "reply"**: 
```sql
SELECT COUNT(*) FROM emails 
WHERE handle = ? AND from_addr LIKE ? AND folder = 'inbox'
-- If recipient has previously emailed this sender → it's a reply thread
```

🔴 **Rollback**: Remove the ATTN block. Send works exactly as before.

---

### Step 4: Modify `GET /api/inbox/:id` — refund on read

**File**: `routes/inbox.ts`

In the `/:id` handler, after `UPDATE emails SET read = 1`:
```
1. SELECT from attn_escrow WHERE email_id = ? AND status = 'pending'
2. If found:
   - Refund sender: UPDATE attn_balances SET balance = balance + amount
   - Log 'refund' transaction
   - UPDATE attn_escrow SET status = 'refunded', settled_at = now
```

🔴 **Rollback**: Remove the block. Read marking unchanged.

---

### Step 5: New action — Reject email (immediate forfeit)

**File**: `routes/inbox.ts`

New endpoint: `POST /api/inbox/:id/reject`
```
1. Verify email belongs to user and is unread
2. Check attn_escrow for this email
3. If found + pending:
   - Check receiver daily_earned < DAILY_EARN_CAP
   - Transfer ATTN to receiver
   - Log 'transfer' tx for receiver, 'forfeit' for sender
   - UPDATE attn_escrow SET status = 'transferred'
4. Mark email as read (so it doesn't trigger double settlement)
5. Optionally move to trash/spam
```

🔴 **Rollback**: Delete the endpoint. No other code depends on it.

---

### Step 6: Reply bonus — modify send for replies

**File**: `routes/send.ts`

When `in_reply_to` is set AND there's an active escrow for that email:
```
1. Refund sender's escrow (same as read)
2. PLUS: mint +2 ATTN to sender, +2 to receiver (reply bonus)
3. Log 'reply_bonus' transactions
```

This already partially exists (bond auto-resolve on reply). Extend it for ATTN.

🔴 **Rollback**: Remove the bonus block. Existing bond logic untouched.

---

### Step 7: `GET /api/inbox` — include ATTN stake info

**File**: `routes/inbox.ts`

Modify list query:
```sql
SELECT e.*, ae.amount as attn_stake, ae.status as attn_status, ae.expires_at as attn_expires
FROM emails e
LEFT JOIN attn_escrow ae ON ae.email_id = e.id
WHERE e.handle = ? AND e.folder = ?
ORDER BY 
  CASE WHEN ae.amount IS NOT NULL AND ae.status = 'pending' THEN ae.amount ELSE 0 END DESC,
  e.created_at DESC
```

Emails with higher ATTN stake sort to top.

🔴 **Rollback**: Revert query to original (no JOIN).

---

### Step 8: USDC Bond sunset

**File**: `routes/attention.ts`

Add to `POST /bond` handler (top):
```typescript
return c.json({
  error: 'USDC Attention Bonds are being upgraded to $ATTN system. Use /api/attn/* endpoints instead.',
  migration: 'https://api.basemail.ai/api/docs#attn',
  hint: 'POST /api/attn/buy to purchase ATTN credits, or use free daily drip.',
}, 410);  // 410 Gone
```

All read endpoints (GET /price, /qaf, /coqaf, /stats) stay alive.
Existing active bonds still settle normally via cron.

🔴 **Rollback**: Remove the `return c.json(...)` at top. Bond creation re-enabled.

---

### Step 9: Cron — daily drip + escrow settlement

**File**: `worker/src/cron.ts` (new)

```typescript
export async function handleCron(event: ScheduledEvent, env: Env) {
  const now = Math.floor(Date.now() / 1000);
  
  // 1. Reset daily_earned for new day
  await env.DB.prepare(
    'UPDATE attn_balances SET daily_earned = 0, last_earn_reset = ? WHERE last_earn_reset < ?'
  ).bind(now, now - 86400).run();
  
  // 2. Daily drip (only if not yet dripped today, and under daily cap)
  await env.DB.prepare(`
    UPDATE attn_balances 
    SET balance = balance + 10, 
        daily_earned = daily_earned + 10,
        last_drip_at = ?
    WHERE last_drip_at < ? AND daily_earned + 10 <= 200
  `).bind(now, now - 86400).run();
  
  // 3. Settle expired escrows (48h timeout)
  const expired = await env.DB.prepare(
    'SELECT * FROM attn_escrow WHERE status = \'pending\' AND expires_at < ?'
  ).bind(now).all();
  
  for (const escrow of (expired.results || [])) {
    const e = escrow as any;
    // Check receiver daily cap
    const receiver = await env.DB.prepare(
      'SELECT daily_earned FROM attn_balances WHERE wallet = ?'
    ).bind(e.receiver_wallet).first<{ daily_earned: number }>();
    
    if (receiver && receiver.daily_earned + e.amount > 200) {
      // Cap reached → refund to sender instead
      await env.DB.batch([
        env.DB.prepare('UPDATE attn_balances SET balance = balance + ? WHERE wallet = ?')
          .bind(e.amount, e.sender_wallet),
        env.DB.prepare('UPDATE attn_escrow SET status = \'refunded\', settled_at = ? WHERE email_id = ?')
          .bind(now, e.email_id),
        env.DB.prepare('INSERT INTO attn_transactions (id, wallet, amount, type, ref_email_id, note) VALUES (?, ?, ?, \'cap_refund\', ?, \'Receiver daily cap reached\')')
          .bind(generateId(), e.sender_wallet, e.amount, e.email_id),
      ]);
    } else {
      // Transfer to receiver
      await env.DB.batch([
        env.DB.prepare('UPDATE attn_balances SET balance = balance + ?, daily_earned = daily_earned + ? WHERE wallet = ?')
          .bind(e.amount, e.amount, e.receiver_wallet),
        env.DB.prepare('UPDATE attn_escrow SET status = \'transferred\', settled_at = ? WHERE email_id = ?')
          .bind(now, e.email_id),
        env.DB.prepare('INSERT INTO attn_transactions (id, wallet, amount, type, ref_email_id, note) VALUES (?, ?, ?, \'transfer\', ?, \'Unread email timeout\')')
          .bind(generateId(), e.receiver_wallet, e.amount, e.email_id),
        env.DB.prepare('INSERT INTO attn_transactions (id, wallet, amount, type, ref_email_id, note) VALUES (?, ?, ?, \'forfeit\', ?, \'Email not read within 48h\')')
          .bind(generateId(), e.sender_wallet, -e.amount, e.email_id),
      ]);
    }
  }
}
```

**Mount in index.ts**:
```typescript
export default {
  fetch: app.fetch,
  email: handleIncomingEmail,
  scheduled: handleCron,
};
```

**wrangler.toml** add:
```toml
[triggers]
crons = ["0 * * * *"]  # Every hour
```

🔴 **Rollback**: Remove scheduled handler + cron trigger. Escrows just stay pending (no data loss).

---

## Implementation Order & Git Commits

```
commit 1: [attn-v3] Step 1 — routes/attn.ts + DB tables + endpoints
commit 2: [attn-v3] Step 2 — Auto-grant 50 ATTN on register
commit 3: [attn-v3] Step 3 — Auto-stake on send (cold=3, reply=1)
commit 4: [attn-v3] Step 4 — Refund on read
commit 5: [attn-v3] Step 5 — Reject endpoint (immediate forfeit)
commit 6: [attn-v3] Step 6 — Reply bonus (+2/+2)
commit 7: [attn-v3] Step 7 — Inbox list with ATTN info + sort
commit 8: [attn-v3] Step 8 — USDC bond sunset (410 on new bond)
commit 9: [attn-v3] Step 9 — Cron: drip + escrow settlement
```

Each commit is independently revertable. To rollback step N:
```bash
git revert <commit-N-hash>
```

To rollback everything:
```bash
git revert HEAD~9..HEAD  # revert all 9 commits
# or simply:
git checkout main -- worker/src/
```

---

## Anti-Abuse Rules (built into code)

| Attack | Defense |
|--------|---------|
| Auto mark-all-as-read | Rate limit: max 10 refunds/minute per account |
| Self-send farming | Same wallet → skip ATTN stake (0 cost, 0 escrow) |
| Mass reject farming | Daily earn cap 200 |
| Bot signup farming | Same IP/wallet signup grant once per wallet |
| Reply-bonus farming | Reply bonus only for first reply per email thread |

---

## Files Changed (final list)

| File | Change | New/Modified |
|------|--------|-------------|
| `routes/attn.ts` | All ATTN endpoints | **NEW** |
| `cron.ts` | Drip + settlement | **NEW** |
| `routes/auth.ts` | Signup grant (try/catch) | Modified |
| `routes/send.ts` | Auto-stake + reply bonus | Modified |
| `routes/inbox.ts` | Refund on read + reject + list JOIN | Modified |
| `routes/attention.ts` | Sunset new bond creation | Modified |
| `index.ts` | Mount /api/attn + scheduled handler | Modified |

No changes to: `types.ts`, `auth.ts` (core), `basename-lookup.ts`, `email-handler.ts`, `refresh.ts`, or any other route.
