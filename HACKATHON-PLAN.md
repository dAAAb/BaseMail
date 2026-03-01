# Chainlink Convergence Hackathon — BaseMail: The Diplomat

## 比賽資訊
- **Hackathon**: Chainlink Convergence (Feb 6 – Mar 8, 2026)
- **截止**: 2026-03-08 11:59 PM ET
- **目標 Track**: CRE & AI ($17K: 1st $10.5K / 2nd $6.5K)
- **次要 Track**: Autonomous Agents on Moltbook ($5K: 1st $3.5K / 2nd $1.5K)
- **保底**: Top 10 Projects ($1.5K × 10)
- **最大獎金可能**: $10.5K + $3.5K + $1.5K = $15.5K

---

## 1. 比賽需求 vs 我們的對應（逐項核對）

### ✅ 必要需求

| 需求 | 我們怎麼做 | 狀態 |
|------|-----------|------|
| CRE Workflow as orchestration layer | "The Diplomat" workflow：x402 → QAF 定價 → LLM 仲裁 → ATTN stake → 鏈上 attestation | 🔨 待做 |
| Integrate blockchain with external API/LLM/AI agent | Base chain + BaseMail API + Gemini LLM + x402 payment | 🔨 待做 |
| Successful simulation (CRE CLI) or live deployment | `cre simulate` 跑完整流程 | 🔨 待做 |
| 3-5 min demo video | 錄影展示 workflow 執行 | 🔨 待做 |
| Public source code (GitHub) | 新 repo: `dAAAb/basemail-diplomat` | 🔨 待做 |
| README: link to all files that use Chainlink | README 裡標注 workflow files | 🔨 待做 |
| Hackathon 期間新建的 components | CRE workflow 全新；BaseMail 是既有產品加新組件 | ✅ 合規 |

### ✅ CRE & AI Track 特定對應

| Track 描述 | 我們怎麼命中 |
|-----------|------------|
| "AI into Web3 workflows to assist with **decision-making**" | LLM 仲裁信件品質 → 決定加收/補助/仲裁 |
| "**autonomous agents** interacting with onchain systems" | Agent 自主寄信、claim ATTN、管理 inbox |
| "**AI-in-the-loop** applications that combine intelligence with **verifiable execution**" | LLM 判斷 + 鏈上 attestation = 可驗證的 AI 決策 |
| Use case: "**AI agents consuming CRE workflows with x402 payments**" | Agent 用 x402 USDC 觸發 The Diplomat workflow |

### ✅ 評審標準對應

| 標準 | 我們的得分點 |
|------|------------|
| **Technical execution** | CRE 5-step workflow + x402 + LLM + 鏈上寫入，完整串接 |
| **Blockchain technology application** | ATTN staking + QAF 定價上鏈 + attestation |
| **Effective use of CRE** | CRE 不是裝飾，是核心 orchestration（沒有 CRE 就無法運作） |
| **Originality (wow factor)** | CO-QAF paper (Glen Weyl 共同作者) + 真實上線產品 + 經濟免疫系統概念 |

---

## 2. 核心設計：The Diplomat CRE Workflow

### Pitch（一段話）

> Email spam costs $20B/year globally. Filters don't work — spammers adapt. BaseMail flips the model with an economic immune system: every email passes through a CRE workflow where an LLM acts as an economic arbitrator. It surcharges spam, subsidizes quality, and boosts messages worth reading. Repeat offenders face quadratically increasing costs (CO-QAF, EAAMO '25, co-authored with Glen Weyl). Payment flows via x402 USDC, stakes $ATTN tokens, and every decision is on-chain attested. Spam becomes economically self-destructive.

### 架構

```
Agent A 要寄信給 Agent B
    │
    ├── x402 付 USDC（基礎費 $0.01）
    │
    ▼
┌──────────────────────────────────────┐
│  CRE Workflow: "The Diplomat"        │
│                                      │
│  Step 1: x402 Payment 驗證            │
│  └── Coinbase facilitator 結算       │
│                                      │
│  Step 2: QAF 歷史查詢                 │
│  ├── GET /api/send-history?from=A&to=B│
│  ├── 未讀數 = n                       │
│  └── QAF 定價:                         │
│      第1封 = 3 ATTN (base)            │
│      第n封(n≥2) = n² ATTN             │
│      (B 讀了 → 重置 n=0)             │
│                                      │
│  Step 3: LLM 仲裁 (Gemini)           │
│  ├── 輸入: email 內容 + 歷史上下文    │
│  ├── 輸出: quality_score (0-10)       │
│  ├── 分類: spam/cold/legit/high_value │
│  └── 決策:                            │
│      🔴 Surcharge (spam): ×3 費率     │
│      🟡 Standard (cold): ×1 費率      │
│      🟢 Subsidy (legit): ×0.5 費率    │
│      ⭐ Boost (high_value): ×0.3 費率  │
│         + 額外獎勵鼓勵收件人閱讀       │
│      💬 Reply: ×0 免費 + 雙方 bonus   │
│                                      │
│  Step 4: 定價 + 執行                  │
│  ├── final = base × QAF × LLM係數    │
│  ├── USDC → ATTN 轉換                │
│  ├── POST /api/send (stake ATTN)     │
│  └── 仲裁獎勵: 補助/加收結算          │
│                                      │
│  Step 5: 鏈上 Attestation (Base)     │
│  └── 寫入: {                          │
│        sender, recipient,             │
│        attn_staked, qaf_multiplier,   │
│        llm_score, llm_category,       │
│        x402_payment_hash,             │
│        timestamp                      │
│      }                                │
└──────────────────────────────────────┘
```

### 經濟模型：Spam 自我毀滅

```
Spammer 寄 5 封信給同一人（都沒被讀）：
┌──────┬──────────┬──────────┬───────────┬──────────┐
│ 封數 │ QAF定價   │ LLM判定   │ LLM係數   │ 最終成本  │
│      │ (n²)     │          │           │          │
├──────┼──────────┼──────────┼───────────┼──────────┤
│ #1   │ 3 (base) │ cold     │ ×1        │ 3 ATTN   │
│ #2   │ 2² =  4  │ spam     │ ×3        │ 12 ATTN  │
│ #3   │ 3² =  9  │ spam     │ ×3        │ 27 ATTN  │
│ #4   │ 4² = 16  │ spam     │ ×3        │ 48 ATTN  │
│ #5   │ 5² = 25  │ spam     │ ×3        │ 75 ATTN  │
├──────┼──────────┼──────────┼───────────┼──────────┤
│ 總計 │          │          │           │ 165 ATTN │
└──────┴──────────┴──────────┴───────────┴──────────┘
收件人淨賺 165 ATTN。Spammer 破產。

正常人寄信：
┌──────┬──────────┬──────────┬───────────┬──────────┐
│ 封數 │ QAF定價   │ LLM判定   │ LLM係數   │ 最終成本  │
├──────┼──────────┼──────────┼───────────┼──────────┤
│ #1   │ 3 (base) │ legit    │ ×0.5      │ 1.5 ATTN │
│ #2   │ 1 (重置) │ reply    │ ×0        │ 0 (免費)  │
│      │ (被讀了   │          │           │ +2 bonus │
│      │  → n=0)  │          │           │          │
└──────┴──────────┴──────────┴───────────┴──────────┘
正常對話幾乎免費，還有 bonus。
```

### 學術背書

- **Paper**: "CO-QAF: Cooperative Quadratic Attention Finance" (EAAMO '25)
- **Authors**: Ko, Tang, **Weyl** (Glen Weyl, Microsoft Research)
- **核心概念**: 注意力是公共財，重複消耗應 quadratically 加價

---

## 3. 風險 & 潛在弱點

| 風險 | 等級 | 對策 |
|------|------|------|
| CRE 不熟，學習曲線 | 🟡 中 | 有官方 x402+CRE demo repo 可參考 |
| x402 設定複雜 | 🟡 中 | 照 `cre_x402_smartcon_demo` 架構走 |
| BaseMail 是既有專案 | 🟢 低 | 規則允許：「updating with new components」 |
| demo 影片品質 | 🟡 中 | 提前寫好腳本，CLI 模擬畫面清楚 |
| Gemini API rate limit | 🟢 低 | 免費 tier 足夠 demo |
| QAF 概念太學術 | 🟡 中 | demo 用視覺化數字展示，不講公式 |

---

## 4. 提交 Checklist

- [ ] CRE Workflow 可 simulate
- [ ] x402 payment 可觸發 workflow
- [ ] LLM 仲裁 + QAF 定價可運作
- [ ] 鏈上 attestation 寫入成功
- [ ] Public GitHub repo + README
- [ ] 3-5 min demo video (公開連結)
- [ ] Airtable submission form
- [ ] (Moltbook track) Moltbook post in m/chainlink-official
- [ ] (Moltbook track) Testnet on-chain write
- [ ] (Moltbook track) 人類 operator 填 Google Form

---

## 5. 時程

| 日期 | 項目 |
|------|------|
| 2/28-3/1 | 環境設定 + 學習 CRE (bootcamp repo) |
| 3/1-3/3 | CRE workflow 核心開發 |
| 3/3-3/5 | x402 + LLM + QAF 整合 |
| 3/5-3/6 | 鏈上 attestation + BaseMail API 新 endpoint |
| 3/6-3/7 | 測試 + demo 影片 |
| 3/7-3/8 | 提交 (deadline: 3/8 11:59 PM ET) |
