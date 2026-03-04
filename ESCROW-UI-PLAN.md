# Send USDC Escrow UI — Integration Plan

## Current State

### What exists ✅
1. **PaymentEscrow.sol** — `0xaf41b976978ac981d79c1008dd71681355c71bf6` (Base Mainnet, verified)
   - `deposit(claimId, amount, expiry)` — sender deposits USDC
   - `release(claimId, claimer)` — owner releases to claimer
   - `refund(claimId)` — sender reclaims after expiry
2. **Worker API**:
   - `GET /api/claim/:id` — public claim info (HTML + JSON)
   - `POST /api/claim/:id` — auth'd claim (SIWE or API key), calls `release()` on-chain
   - `POST /api/send` with `escrow_claim` param — records claim in DB + sends email with claim link
3. **Frontend**:
   - `/claim/:id` page (`Claim.tsx`) — connect wallet → sign → claim. Full flow works.
4. **DB**: `escrow_claims` table (auto-migration)

### What's missing ❌
- **Send USDC modal** only does direct transfer → fails on external email ("Recipient not found")
- No UI to trigger escrow deposit + send email in one flow

## Plan

### Frontend: `UsdcSendModal` changes

**Detect external vs internal recipient:**
```
const isExternal = recipient.includes('@') && !recipient.endsWith('@basemail.ai');
const isInternal = !isExternal;
```

**Two modes in same modal:**

#### Mode A: Direct Transfer (existing, internal only)
- Recipient is `handle` or `handle@basemail.ai`
- Resolve wallet via `/api/identity/:handle`
- On-chain: `USDC.transfer(recipientWallet, amount)`
- Then `POST /api/send` with `usdc_payment`
- **No changes needed** (current behavior)

#### Mode B: Escrow Deposit (new, external email)
- Recipient is external email (e.g. `dablog@gmail.com`)
- No wallet resolution needed
- UI changes:
  - Hide "Recipient not found" error
  - Show escrow info box: "USDC will be held in escrow. Recipient gets a claim link via email."
  - Add expiry selector: 1h / 24h / 7d / 30d (default: 7d)
  - Show PaymentEscrow contract address for transparency
- Flow:
  1. Generate `claim_id` (client-side UUID)
  2. User approves USDC spending (`USDC.approve(escrow, amount)`)
  3. User calls `PaymentEscrow.deposit(keccak256(claim_id), amount, expiry)`
  4. On success, `POST /api/send` with `escrow_claim` param:
     ```json
     {
       "to": "dablog@gmail.com",
       "subject": "USDC Payment: $10.00",
       "body": "You received 10.00 USDC! Click to claim: ...",
       "escrow_claim": {
         "claim_id": "uuid-xxx",
         "amount": "10.00",
         "deposit_tx": "0x...",
         "network": "base-mainnet",
         "expires_at": 1772990400
       }
     }
     ```
  5. Worker records in `escrow_claims` table + sends email with claim link
  6. Recipient gets email → clicks claim link → `/claim/:id` page

### State changes in UsdcSendModal
```ts
// New states
const [isEscrow, setIsEscrow] = useState(false);  // derived from recipient
const [expiryHours, setExpiryHours] = useState(168); // 7 days default
const [approving, setApproving] = useState(false);

// New status values
type Status = 'idle' | 'switching' | 'approving' | 'depositing' | 'sending_email' | 'success' | 'error'
```

### New contract interactions (escrow mode)
```ts
const ESCROW_ADDRESS = '0xaf41b976978ac981d79c1008dd71681355c71bf6';
const ESCROW_ABI = [
  'function deposit(bytes32 claimId, uint256 amount, uint256 expiry) external',
];
const ERC20_APPROVE_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
];

// 1. Approve
await writeContractAsync({
  address: USDC_ADDRESS,
  abi: ERC20_APPROVE_ABI,
  functionName: 'approve',
  args: [ESCROW_ADDRESS, amountRaw],
});

// 2. Deposit
const claimId = crypto.randomUUID();
const claimIdHash = keccak256(toHex(claimId));
const expiryTimestamp = Math.floor(Date.now() / 1000) + expiryHours * 3600;
const hash = await writeContractAsync({
  address: ESCROW_ADDRESS,
  abi: ESCROW_ABI,
  functionName: 'deposit',
  args: [claimIdHash, amountRaw, BigInt(expiryTimestamp)],
});
```

### UI Layout (escrow mode)

```
┌─────────────────────────────────────────┐
│ Send USDC                          ✕    │
│ 💰 Real USDC                            │
│                                         │
│ Recipient                               │
│ [dablog@gmail.com                    ]  │
│ 📦 External email — USDC held in escrow │
│                                         │
│ Network    [💰 Base Mainnet] [🧪 Test]  │
│                                         │
│ Amount (USDC)                           │
│ [10.00                               ]  │
│                                         │
│ Claim Expiry                            │
│ [1h] [24h] [●7d] [30d]                 │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 📦 Escrow Mode                      │ │
│ │ USDC deposited to PaymentEscrow.    │ │
│ │ Recipient gets email with claim     │ │
│ │ link. No account needed — one is    │ │
│ │ auto-created on claim.              │ │
│ │ If unclaimed, you can refund after  │ │
│ │ expiry.                             │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [        Send 10.00 USDC           ]    │
│                                         │
│ ⚠️ This sends real USDC.               │
└─────────────────────────────────────────┘
```

### Changes Summary

| File | Change | Risk |
|------|--------|------|
| `Dashboard.tsx` UsdcSendModal | Add escrow mode detection + UI + contract calls | Medium — new code path, existing untouched |
| No backend changes | `/api/send` + `escrow_claim` already works | Zero |
| No contract changes | PaymentEscrow.sol already deployed | Zero |
| `Claim.tsx` | No changes needed | Zero |

### Rollback
- All changes in single commit to `Dashboard.tsx`
- `git revert` one commit if issues
- Direct transfer mode (internal) completely untouched

### Testing
1. Send USDC escrow to external email (gmail) → check email arrives with claim link
2. Open claim link → connect wallet → claim → verify USDC received
3. Verify direct transfer (internal) still works unchanged
4. Test minimum amount (0.10 USDC)
5. Test expiry selector UI
