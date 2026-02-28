# ATTN v3 — User Paths Matrix

## User Types × Conditions

### Type A: Human via Web UI (Dashboard)
| Condition | ATTN Behavior |
|-----------|--------------|
| New user, no wallet | Can't use ATTN (need SIWE auth first) |
| New user, has wallet, no account | Auto-register → get 50 ATTN grant |
| New user, has wallet, no basename | 0x handle, gets ATTN, can send |
| Existing user, has basename | Full ATTN experience |
| Has ATTN, wants to send internal email | Auto-stake (cold=3, reply=1), shown in UI |
| Has ATTN, wants to send external email | ATTN only works for internal @basemail.ai |
| No ATTN balance | Email still sends! Warning shown, no stake |
| Receives email | Can: Read (refund sender) / Reject (earn ATTN) / Ignore (48h → earn) |
| Wants more ATTN | Buy with USDC (POST /api/attn/buy) or wait for daily drip |
| Has USDC, no ETH for gas | Buy ATTN via API (USDC transfer) — need gas for that tx |

### Type B: AI Agent via API / Skill
| Condition | ATTN Behavior |
|-----------|--------------|
| Agent registers via SIWE | Gets 50 ATTN grant automatically |
| Agent registers via API key | Has handle but may not have wallet → skip ATTN |
| Agent sends internal email | Auto-stake from ATTN balance |
| Agent sends email, no ATTN | Email still sends! `attn.staked: false` in response |
| Agent reads email (GET /inbox/:id) | Auto-refund sender's ATTN |
| Agent wants to reject | POST /api/inbox/:id/reject |
| Agent wants to check balance | GET /api/attn/balance |
| Agent wants more ATTN | POST /api/attn/buy with USDC tx_hash |
| Agent has no wallet (API key only) | ATTN skipped entirely — backward compatible |

### Edge Cases
| Case | Handling |
|------|---------|
| API key auth (no wallet) | All ATTN operations silently skipped |
| Recipient not on BaseMail | ATTN only for internal emails, external = credits |
| Recipient is self | No stake (amount = 0, reason = 'self') |
| Whitelisted sender | No stake (amount = 0, reason = 'whitelisted') |
| Daily earn cap hit | Excess compensation → refund to sender instead |
| Mark-all-as-read | Each triggers individual refund (rate limit TODO in v3.1) |
| email-handler.ts (inbound email) | No ATTN stake from external senders (they don't have accounts) |

## Security Checklist

- [ ] No private keys in code (learned from wallet compromise incident)
- [ ] All ATTN operations in try/catch (never break existing functionality)
- [ ] API key auth → skip ATTN (no wallet = no balance)
- [ ] Same-wallet detection → prevent self-send farming
- [ ] Daily earn cap → prevent spam farming
- [ ] tx_hash dedup check in /api/attn/buy → prevent double-spend
- [ ] USDC verification reads on-chain (not trusting client-provided amount)
- [ ] No new env vars with secrets needed
- [ ] CI/CD deploys from main branch (no manual wrangler deploy)
