# Hackathon Dev Plan — 可執行步驟

**目標**: CRE & AI Track 1st ($10.5K) + Autonomous Agents ($3.5K) + Top 10 ($1.5K)
**截止**: 2026-03-08 11:59 PM ET (台灣時間 3/9 中午 12:59)
**可用天數**: ~8 天

---

## 回滾策略

### 原則：BaseMail 主線零風險

```
basemail-diplomat/     ← 新 repo，隨便搞，不影響任何東西
BaseMail/              ← 只開 feature branch，不動 main
```

### 隔離方式

| 改動 | 位置 | 回滾方式 |
|------|------|---------|
| CRE workflow | `basemail-diplomat/` (新 repo) | 整個 repo 刪掉就好 |
| x402 gateway | `basemail-diplomat/` (新 repo) | 同上 |
| DiplomatAttestation.sol | `basemail-diplomat/` (新 repo) | 同上 |
| BaseMail 新 API endpoints | `BaseMail` branch: `feature/diplomat` | `git branch -D feature/diplomat` |
| BaseMail send.ts 改動 | `BaseMail` branch: `feature/diplomat` | 不 merge 到 main 就不影響 production |

### Git 規則

1. **BaseMail repo**: 開 `feature/diplomat` branch，所有改動在這
   - 絕不直接改 main
   - Hackathon 結束再決定要不要 merge
   - 每個 Phase 結束打 tag: `hackathon-phase-0`, `hackathon-phase-1`...
2. **basemail-diplomat repo**: 直接在 main 開發（新 repo 沒風險）
   - 每個 Phase 結束也打 tag
3. **每次改動前**: 記錄當前 commit hash 到 memory

### 最壞情況

如果搞砸了：
- `basemail-diplomat/` → `rm -rf` 或 `git reset --hard <tag>`
- `BaseMail/` → `git checkout main` → production 完全不受影響
- 線上 BaseMail.ai → 永遠跑 main branch，diplomat branch 不會部署

---

## Phase 0: 環境搞定 (Day 1 — 2/28~3/1)

### 0.1 安裝 CRE 工具鏈
```bash
# CRE CLI
# Bun (if not installed)
# Foundry (forge, for smart contracts)
# Node.js v20+
```
- [ ] 安裝 CRE CLI (`cre --version`)
- [ ] 安裝 Bun v1.3+
- [ ] 安裝 Foundry (`forge --version`)
- [ ] 取得 Gemini API key (https://aistudio.google.com/apikey)
- [ ] 取得 Sepolia ETH (https://faucets.chain.link/sepolia)
- [ ] 取得 CDP API key (Coinbase Developer Platform, for x402 facilitator)

### 0.2 學習 CRE
- [ ] Clone `smartcontractkit/cre-templates` → 跑一個 basic workflow
- [ ] Clone `smartcontractkit/cre_x402_smartcon_demo` → 理解 x402 + CRE 架構
- [ ] Clone `smartcontractkit/cre-bootcamp-2026` → 看完整 workflow 結構
- [ ] 跑 `cre simulate` 確認環境正常

### 0.3 建立新 repo
- [ ] 建立 `dAAAb/basemail-diplomat` (public repo)
- [ ] 初始化 CRE project 結構（參考 cre_x402_smartcon_demo）

**產出**: CRE 環境可跑，reference demo 可 simulate

---

## Phase 1: 核心 CRE Workflow (Day 2-3 — 3/1~3/3)

### 1.1 x402 Gateway
參考 `cre_x402_smartcon_demo/x402_cre_gateway/`

- [ ] 建立 x402 gateway（FastAPI 或 Express）
  - Endpoint: `POST /diplomat/send`
  - 無付款 → 回 `402 Payment Required` + payment instructions
  - 有付款 → 驗證 x402 header → 觸發 CRE workflow
- [ ] 設定 x402 pricing（$0.01 USDC per email）
- [ ] 整合 Coinbase CDP facilitator 做付款驗證

### 1.2 CRE Workflow — Step 1+2: QAF 歷史查詢
- [ ] 在 BaseMail worker 新增 API endpoint:
  - `GET /api/diplomat/history?from=<addr>&to=<addr>`
  - 回傳: `{ unread_count, total_sent, last_read_at }`
- [ ] Workflow 調用 BaseMail API 查歷史
- [ ] 計算 QAF 定價:
  - 第 1 封: base = 3 ATTN（固定）
  - 第 n 封 (n≥2): n² ATTN
  - 序列: 3, 4, 9, 16, 25, 36...
  - B 讀了信 → n 重置為 0
  - Cap: n=10 (100 ATTN) 防溢出
  - 出自 Quadratic Voting (Lalley & Weyl, 2015)

### 1.3 CRE Workflow — Step 3: LLM 仲裁
- [ ] 在 CRE workflow 用 Gemini capability:
  - 輸入: email subject + body + QAF context
  - 輸出 JSON: `{ quality: 0-10, category: "spam|cold|legit|high_value|reply", reasoning: "..." }`
- [ ] 定義 LLM 係數:
  - spam: ×3
  - cold: ×1
  - legit: ×0.5
  - high_value: ×0.3 + boost reward
  - reply: ×0 + mutual bonus

### 1.4 CRE Workflow — Step 4: 定價 + 送信
- [ ] 計算: `final_attn = base(3) × qaf_multiplier × llm_coefficient`
- [ ] 調 BaseMail API 送信: `POST /api/send`
  - 新增可選參數: `attn_override` (The Diplomat 指定的 stake 金額)
- [ ] 仲裁獎勵邏輯:
  - boost → 額外 ATTN 獎勵給收件人
  - subsidy → 退回部分給寄件人

**產出**: Workflow 可 `cre simulate` 跑完 step 1-4

---

## Phase 2: 鏈上 Attestation (Day 4 — 3/3~3/5)

### 2.1 Smart Contract
- [ ] 寫 `DiplomatAttestation.sol`:
  ```solidity
  struct Attestation {
      address sender;
      address recipient;
      uint256 attnStaked;
      uint8 qafMultiplier;
      uint8 llmScore;       // 0-10
      string llmCategory;   // spam/cold/legit/high_value/reply
      bytes32 x402PaymentHash;
      uint256 timestamp;
  }
  
  event EmailAttested(bytes32 indexed emailHash, Attestation attestation);
  
  function attest(bytes32 emailHash, Attestation calldata att) external onlyWorkflow;
  ```
- [ ] 部署到 Base Sepolia (testnet) — for Moltbook track
- [ ] 可選：部署到 Base Mainnet — for CRE & AI track

### 2.2 CRE Workflow — Step 5: 寫鏈
- [ ] Workflow 調用合約 `attest()` 寫入 attestation
- [ ] 完整 5-step workflow 可 `cre simulate` 跑完

**產出**: 完整 workflow 端到端可跑，鏈上有記錄

---

## Phase 3: BaseMail API 新 Endpoints (Day 4-5 — 3/3~3/5)

### 3.1 Diplomat 專用 API
在 `worker/src/routes/diplomat.ts` 新增:

- [ ] `GET /api/diplomat/history?from=&to=` — QAF 歷史
- [ ] `POST /api/diplomat/send` — 帶 attn_override 的送信
- [ ] `GET /api/diplomat/pricing?from=&to=` — 預覽定價（不實際扣費）

### 3.2 USDC → ATTN 購買
- [ ] `POST /api/attn/buy` — x402 USDC 轉 ATTN
  - 這可以是第二個 x402 use case
  - Agent 用 USDC 買 ATTN credits

### 3.3 送信支援 attn_override
- [ ] `POST /api/send` 加 optional `attn_override` 參數
  - The Diplomat 可以指定 stake 金額（不使用預設）
  - 安全: 只有帶合法 diplomat token 的請求可用

**產出**: BaseMail API 支援 Diplomat workflow 所需的所有操作

---

## Phase 4: 整合測試 (Day 5-6 — 3/5~3/6)

### 4.1 端到端測試
- [ ] Scenario 1: 正常信件 — legit, QAF=1, 低費用
- [ ] Scenario 2: Cold email — cold, QAF=1, 正常費用
- [ ] Scenario 3: Spam 第一封 — spam, QAF=1, 高費用
- [ ] Scenario 4: Spam 第三封 — spam, QAF=4, 超高費用
- [ ] Scenario 5: 被讀後重置 — QAF 回到 1
- [ ] Scenario 6: Reply — 免費 + 雙方 bonus
- [ ] Scenario 7: High value — 低費用 + 收件人 boost

### 4.2 驗證
- [ ] `cre simulate` 跑所有 scenario
- [ ] 鏈上 attestation 可在 BaseScan 看到
- [ ] BaseMail dashboard 顯示正確 ATTN 餘額變化

**產出**: 所有 scenario 通過，可以錄 demo

---

## Phase 5: Demo 影片 + 提交 (Day 6-8 — 3/6~3/8)

### 5.1 Demo 影片（3-5 分鐘）
大綱：
1. **問題** (30s): Email spam costs $20B/yr, filters fail
2. **解法** (30s): Economic immune system — spam 越多虧越多
3. **架構** (60s): x402 → QAF → LLM → ATTN → attestation
4. **Live demo** (90s): 
   - 跑 `cre simulate` 展示 workflow
   - 顯示 spammer 成本指數爆炸
   - 顯示正常對話幾乎免費
   - BaseScan 上看 attestation
5. **學術基礎** (30s): CO-QAF paper, Glen Weyl
6. **真實產品** (30s): BaseMail.ai 已上線，5 users, $ATTN live

- [ ] 寫影片腳本
- [ ] 錄影 (OBS 或 screen recording)
- [ ] 上傳 YouTube (公開)

### 5.2 README
- [ ] 寫 README.md:
  - Project description
  - Architecture diagram
  - **Link to all files that use Chainlink** (必要!)
  - Setup instructions
  - Demo video link
  - CO-QAF paper reference

### 5.3 提交
- [ ] Airtable submission form (https://airtable.com/appgJctAaKPFkMKrW/pagPPG1kBRC0C54w6/form)
- [ ] (Moltbook) Publish post in m/chainlink-official
- [ ] (Moltbook) 人類 operator 填 Google Form: https://forms.gle/xk1PcnRmky2k7yDF7

**產出**: 完整提交，等 3/27 公佈結果

---

## 新 Repo 結構

```
basemail-diplomat/
├── README.md                    # ← Link to Chainlink files
├── cre-workflow/
│   ├── workflow.ts              # ← Chainlink CRE workflow
│   ├── config.staging.json      # ← CRE config (testnet)
│   ├── config.production.json   # ← CRE config (mainnet)
│   └── secrets.yaml             # ← Secret names (not values)
├── contracts/
│   └── DiplomatAttestation.sol  # ← On-chain attestation
├── x402-gateway/
│   ├── server.ts                # ← x402 payment gateway
│   └── Dockerfile
├── basemail-api-additions/      # ← 新 endpoints (也 PR 到 BaseMail repo)
│   ├── diplomat.ts
│   └── attn-buy.ts
└── demo/
    ├── scenarios/               # ← 測試 scenarios
    └── video-script.md
```

---

## 技術依賴

| 工具 | 用途 | 費用 |
|------|------|------|
| CRE CLI | Workflow 開發 + simulate | 免費 |
| Gemini API | LLM 仲裁 | 免費 tier |
| CDP (Coinbase) | x402 facilitator | 免費 (1000 tx/mo) |
| Foundry | Smart contract | 免費 |
| Base Sepolia | Testnet deploy | 免費 (faucet) |
| Base Mainnet | Production deploy | ~$0.01 gas |
| YouTube | Demo video hosting | 免費 |

---

## ⚠️ 注意事項

1. **Moltbook track 限 testnet** — 不能用主網 wallet/funds/credentials
2. **CRE & AI track 可用主網** — "simulation or live deployment"
3. **兩個 track 用同一個 project**，但 demo 方式不同:
   - CRE & AI: 展示 production BaseMail.ai
   - Moltbook: 跑 testnet simulation
4. **不改 BaseMail 現有 code** — 只新增 diplomat routes
5. **Private key 永遠用 .env / CRE Vault** — 記住上次的教訓
