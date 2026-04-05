# BaseMail × MPP 整合計劃

**日期**：2026-04-05
**目標**：讓 BaseMail 成為 MPP service provider，agent 用 Tempo 付款即可收發信
**工時**：4 天
**回滾**：每步 commit，`git revert` 即可

---

## 現狀分析

### BaseMail 架構
- **框架**：Hono（Cloudflare Workers）
- **認證**：SIWE（Sign-In with Ethereum）→ JWT
- **部署**：`api.basemail.ai`（CF Workers custom domain）
- **DB**：D1（帳號+郵件索引）
- **儲存**：R2（原始郵件）
- **收費 endpoint**：目前不收費，用 credit 系統 + Attention Bond

### 要接 MPP 的 endpoints

| Endpoint | 方法 | 說明 | MPP 定價 |
|----------|------|------|---------|
| `POST /api/register` | 註冊信箱 | 建立 email handle | $1.00 |
| `POST /api/send` | 發信 | 發送一封 email | $0.01 |
| `GET /api/inbox` | 收件箱 | 讀取信件列表 | Free |
| `GET /api/inbox/:id` | 讀信 | 讀取單封信件 | Free |
| `POST /api/identity` | 身份設定 | 更新 profile | Free |
| `POST /api/webhooks` | Webhook | 設定通知 | Free |

**策略**：寫入收費，讀取免費。跟 AgentMail 一樣的模式。

---

## 架構設計

### 雙軌認證（核心設計決策）

```
Request → 檢查 Authorization header
  ├── "Payment ..." → MPP 流程（mppx 處理 402/credential/receipt）
  ├── "Bearer ..." → 原有 SIWE JWT 流程（不動）
  └── 無 header → 回 402（MPP challenge）或 401（需登入）
```

**關鍵**：MPP 用戶不需要 SIWE 登入。他們用 Tempo 錢包付款，BaseMail 用錢包地址作為身份。

### MPP 用戶的帳號流程

```
1. Agent 發 POST /api/send（無 auth）
2. BaseMail 回 402 + Payment challenge
3. Agent 用 Tempo 錢包付款，重試帶 Payment credential
4. BaseMail 驗證付款 → 從 credential 取得錢包地址
5. 自動建帳號（如果不存在）→ 以錢包地址作為 handle
6. 發信 → 回 200 + Payment-Receipt
```

這樣 MPP agent **零註冊門檻** — 付款即開戶。

---

## 實作計劃

### Day 1：環境 + mppx SDK 整合

```
上午：
□ 1.1 建立 MPP 開發分支
    git checkout -b feat/mpp-integration

□ 1.2 安裝 mppx SDK
    cd worker && npm install mppx

□ 1.3 確認 mppx 跟 CF Workers 相容
    - mppx 用 Fetch API → CF Workers 原生支援 ✅
    - 如果有 Node.js polyfill 問題 → 用 compatibility_flags: ["nodejs_compat"]（已有）

□ 1.4 建 Tempo 錢包（收款用）
    - 用 BaseMail 現有私鑰（WALLET_PRIVATE_KEY）
    - 同一地址在 Tempo 上就是收款地址
    - 不需要額外設定！

下午：
□ 1.5 建立 MPP middleware
    新增 worker/src/mpp.ts：

    import { Mppx, tempo } from 'mppx/server'

    export function createMppx(env: Env) {
      return Mppx.create({
        methods: [tempo({
          currency: '0x20c000000000000000000000b9537d11c60e8b50', // PathUSD
          recipient: env.WALLET_ADDRESS!,
          // testnet: true,  // Day 1-3 用 testnet
        })],
      })
    }

    // Hono middleware：偵測 MPP payment header
    export function mppCharge(amount: string) {
      return async (c: Context, next: () => Promise<void>) => {
        const authHeader = c.req.header('Authorization') || ''
        
        // 如果是 Bearer token → 走原有 SIWE 流程
        if (authHeader.startsWith('Bearer ')) {
          return next()
        }
        
        // 如果是 Payment credential 或無 auth → 走 MPP 流程
        const mppx = createMppx(c.env)
        const result = await mppx.charge({ amount })(c.req.raw)
        
        if (result.status === 402) {
          return result.challenge
        }
        
        // 付款成功 → 從 credential 取得錢包地址
        // 存入 context 供後續 handler 使用
        c.set('mppWallet', result.identity?.address || null)
        c.set('mppReceipt', result)
        
        return next()
      }
    }

□ 1.6 加入 Env types
    // types.ts 新增
    MPP_ENABLED?: string       // 'true' | 'false'，feature flag
    TEMPO_TESTNET?: string     // 'true' → 用 testnet
```

### Day 2：包裝 API endpoints

```
上午：
□ 2.1 POST /api/send — 發信（$0.01）

    修改 worker/src/routes/send.ts：
    - 在 authMiddleware() 前加 mppCharge('0.01')
    - 如果是 MPP 付款 → 用 mppWallet 作為 sender
    - 自動查找/建立帳號
    - 回應加 Payment-Receipt header

□ 2.2 POST /api/register — 註冊（$1.00）

    修改 worker/src/routes/register.ts：
    - MPP 用戶直接付 $1 即可註冊
    - 從 Tempo credential 取得錢包地址
    - 自動指派 handle（basename 或 0x 地址縮寫）

下午：
□ 2.3 POST /api/auth/agent-register — Agent 註冊（free → $0 charge）

    - mppx.charge({ amount: '0' }) → zero-dollar auth
    - 不收費，但驗證 Tempo 錢包身份
    - 等於用 MPP 做「身份驗證」替代 SIWE

□ 2.4 確保讀取 endpoints 不受影響
    - GET /api/inbox → 不加 MPP（需要 auth 看自己的信）
    - GET /api/stats → 不動（公開）
    - GET /api/agents/list → 不動（公開）

□ 2.5 Feature flag 控制
    - env.MPP_ENABLED !== 'true' → 完全跳過 MPP，走原有流程
    - 方便隨時關閉
```

### Day 3：Discovery + 測試

```
上午：
□ 3.1 更新 /api/openapi.json
    - 在現有 OpenAPI spec 加入 x-payment-info
    - POST /api/send → x-payment-info: { method: "tempo", intent: "charge", amount: "10000" }
    - POST /api/register → x-payment-info: { amount: "1000000" }

□ 3.2 建立 /llms.txt（BaseMail 版）
    新增到 worker route：
    app.get('/llms.txt', (c) => c.text(`# BaseMail ...`))

□ 3.3 更新 /.well-known/agent-registration.json
    加入 MPP 支援資訊

下午：
□ 3.4 本地測試（Tempo testnet）
    # 建立測試帳號
    npx mppx account create
    
    # 測試註冊
    npx mppx https://api.basemail.ai/api/register \
      -X POST --json '{"handle":"test-agent"}'
    
    # 測試發信
    npx mppx https://api.basemail.ai/api/send \
      -X POST --json '{"to":"littl3lobst3r@basemail.ai","subject":"test","body":"hello"}'

□ 3.5 端對端驗證
    1. 402 response 格式正確？
    2. WWW-Authenticate header 存在？
    3. 付款後 200 + Payment-Receipt？
    4. 信件真的送到了？
    5. 原有 SIWE 用戶不受影響？
```

### Day 4：上線 + 目錄提交

```
上午：
□ 4.1 切到 Tempo mainnet
    - 移除 testnet: true
    - 確認 WALLET_ADDRESS 在 Tempo mainnet 有 PathUSD
    
□ 4.2 Deploy to production
    cd worker && npm run deploy:worker
    
□ 4.3 線上測試（重複 3.4-3.5）

下午：
□ 4.4 提交 MPPScan
    - https://mppscan.com/register
    - URL: https://api.basemail.ai
    
□ 4.5 提交 mpp.dev PR
    - Fork https://github.com/tempoxyz/mpp
    - 編輯 schemas/services.ts 加入 BaseMail
    - pnpm check:types && pnpm build
    - 開 PR

□ 4.6 更新相關文件
    - CanFly llms.txt 加入 BaseMail MPP 資訊
    - BaseMail README 更新
    - MEMORY.md 記錄完成
```

---

## MPP 服務定義（提交 mpp.dev 用）

```typescript
{
  id: "basemail",
  name: "BaseMail",
  url: "https://basemail.ai",
  serviceUrl: "https://api.basemail.ai",
  description: "Crypto-native email for AI agents on Base chain. Wallet-based identity, SIWE auth, ERC-8004 compatible, Attention Bonds.",
  categories: ["ai", "social"],
  integration: "first-party",
  tags: ["email", "agents", "base", "identity", "web3", "erc8004"],
  status: "active",
  docs: {
    homepage: "https://basemail.ai",
    apiReference: "https://api.basemail.ai/api/docs",
  },
  methods: {
    tempo: {
      intents: ["charge"],
      assets: ["0x20c000000000000000000000b9537d11c60e8b50"]
    }
  },
  realm: "api.basemail.ai",
  provider: {
    name: "BaseMail",
    url: "https://basemail.ai"
  },
  endpoints: [
    {
      method: "POST",
      path: "/api/register",
      description: "Register email inbox",
      payment: {
        intent: "charge",
        method: "tempo",
        amount: "1000000",  // $1.00
        unitType: "request"
      }
    },
    {
      method: "POST",
      path: "/api/send",
      description: "Send email",
      payment: {
        intent: "charge",
        method: "tempo",
        amount: "10000",  // $0.01
        unitType: "request"
      }
    },
    {
      method: "GET",
      path: "/api/inbox",
      description: "List emails",
      payment: null
    },
    {
      method: "GET",
      path: "/api/agents/list",
      description: "List registered agents",
      payment: null
    },
    {
      method: "GET",
      path: "/.well-known/agent-registration.json",
      description: "ERC-8004 agent discovery",
      payment: null
    }
  ]
}
```

---

## vs AgentMail 差異化

| | AgentMail | BaseMail |
|---|---|---|
| 註冊 inbox | $2.00 | **$1.00** |
| 發信 | $0.01 | $0.01 |
| 鏈 | Tempo only | **Base + Tempo** |
| 身份 | Email only | **Basename + World ID + ERC-8004** |
| 特色功能 | 基本收發 | **Attention Bond + CO-QAF 反垃圾信** |
| Webhook | ✅ | ✅ |
| 自訂域名 | $10.00 | 暫無（未來 $5.00）|

**核心訊息**：BaseMail 不只是 email，是 AI Agent 的 **onchain identity + communication layer**。

---

## 風險與對策

| 風險 | 對策 |
|------|------|
| mppx 跟 CF Workers 不相容 | Day 1 下午先測，不行就用 raw 402 response（不依賴 SDK）|
| PathUSD 入金問題 | 先查 Tempo 橋接方案；最差情況用 feePayer 模式讓 server 代付 gas |
| 現有用戶被影響 | Feature flag `MPP_ENABLED`，隨時關閉 |
| Tempo mainnet 不穩定 | 先在 testnet 測 2 天，確認穩定再上 mainnet |

---

## 成功指標

- [ ] `npx mppx https://api.basemail.ai/api/send` 可以付款發信
- [ ] 原有 SIWE 用戶不受影響
- [ ] MPPScan 收錄 BaseMail
- [ ] mpp.dev PR 被接受
- [ ] 第一個外部 agent 透過 MPP 使用 BaseMail
