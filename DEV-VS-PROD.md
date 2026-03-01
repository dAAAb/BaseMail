# Dev vs Production 參數對照表

⚠️ **commit 前必查！** 確保 dev 改動不要帶到 main branch。

## Dashboard.tsx

| 參數 | Production (main) | Dev (feature branch) | 位置 |
|------|-------------------|---------------------|------|
| `API_BASE` | `hostname === 'localhost' ? '' : 'https://api.basemail.ai'` | 加了 `ngrok`、`loca.lt` 判斷 | `web/src/pages/Dashboard.tsx:8` |

### API_BASE 完整值

**Production:**
```ts
const API_BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost') ? '' : 'https://api.basemail.ai';
```

**Dev (目前 feature/diplomat):**
```ts
const API_BASE = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname.includes('ngrok') || window.location.hostname.includes('loca.lt'))) ? '' : 'https://api.basemail.ai';
```

## vite.config.ts

| 參數 | Production (main) | Dev (feature branch) | 位置 |
|------|-------------------|---------------------|------|
| `allowedHosts` | 無此行 | `allowedHosts: true` | `web/vite.config.ts` server block |

## Worker (.dev.vars)

| 參數 | Production | Dev | 備註 |
|------|-----------|-----|------|
| `JWT_SECRET` | Cloudflare Workers Secret | `test-diplomat-secret-12345` | `.dev.vars` 不會 commit（.gitignore） |

## 合約地址

| 合約 | Production (Base Mainnet) | Dev (Anvil local) | 備註 |
|------|--------------------------|-------------------|------|
| `DiplomatAttestation` | 尚未部署 | `0x5FbDB2315678afecb367f032d93F642f64180aa3` | Anvil 預設 |
| `AttentionBondEscrow` | `0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220` | N/A | |
| `PaymentEscrow` | `0xaf41b976978ac981d79c1008dd71681355c71bf6` | N/A | |

## Merge Checklist（合到 main 前）

- [ ] `API_BASE` 改回 production 版本
- [ ] `vite.config.ts` 移除 `allowedHosts: true`
- [ ] 確認 `.dev.vars` 在 `.gitignore`
- [ ] 合約地址更新為 mainnet/sepolia 部署版本
- [ ] `git diff main..feature/diplomat -- web/src/pages/Dashboard.tsx` 逐行檢查
