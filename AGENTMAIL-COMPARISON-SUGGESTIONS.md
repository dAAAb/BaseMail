# BaseMail 優化建議 — 基於 AgentMail 實際申請體驗

> 作者：LittleLobster（同時是 BaseMail 和 AgentMail 用戶）
> 日期：2026-03-09
> 角色：我用程式化方式從零註冊了 AgentMail，全程不到 5 分鐘

---

## 🏆 AgentMail 做得好、BaseMail 可以參考的

### 1. 📦 官方 SDK（最大差距）

**AgentMail**：
```bash
pip install agentmail    # Python
npm install agentmail    # TypeScript
```
```python
from agentmail import AgentMail
client = AgentMail(api_key="am_...")
inbox = client.inboxes.create(username="myagent")
client.inboxes.messages.send(inbox.inbox_id, to="...", subject="...", text="...")
```

**BaseMail 現狀**：沒有官方 SDK，只有 curl 範例和 MCP server。

**建議**：出 `pip install basemail` / `npm install basemail`，包含 SIWE 簽名流程。這是最大的 DX 差距。

```python
# 理想狀態
from basemail import BaseMail
client = BaseMail(private_key="0x...")  # 自動 SIWE
client.send(to="alice@basemail.ai", subject="Hello", body="...")
inbox = client.inbox(limit=10)
```

把 SIWE 簽名流程封裝進 SDK，Agent 開發者不需要自己搞 `eth_account.sign_message`。

---

### 2. 🔑 長效 API Key（除了 JWT）

**AgentMail**：API Key 永久有效，建立一次就好。
**BaseMail 現狀**：JWT 24 小時過期，每天要重新 SIWE 驗證。

**建議**：增加 API Key 機制（類似 AgentMail 的 `am_...` key），跟 JWT 並存：
- **JWT**：短效、SIWE 驗證、高安全場景
- **API Key**：長效、Dashboard 產生、自動化/cron job 場景

```
POST /api/keys/create   → { key: "bm_...", name: "My Agent" }
GET  /api/keys/list      → [{ prefix: "bm_abc", name, created_at }]
DELETE /api/keys/:prefix → revoke
```

認證 header 同時支援：
- `Authorization: Bearer eyJ...`（JWT）
- `Authorization: Bearer bm_...`（API Key）

**好處**：cron job、長期運行的 agent 不用每天重新簽名。我的 BaseMail 收信腳本就是用存好的 JWT，過期就要手動重跑。

---

### 3. 📖 獨立文件網站

**AgentMail**：`docs.agentmail.to` — 獨立文件站，有分類（Inboxes、Messages、Threads、Webhooks...），每個 endpoint 有完整範例。

**BaseMail 現狀**：`/api/docs` 回傳一個巨大 JSON（很適合 AI 讀），但沒有人類友善的文件頁面。

**建議**：
- 保留 `/api/docs` JSON（這其實是優勢，AI agent 很愛）
- 加一個 `docs.basemail.ai` 或 `basemail.ai/docs`，用 Mintlify/Fumadocs/Nextra 生成
- 從現有的 OpenAPI spec 自動產生

---

### 4. 🔔 Webhooks / WebSockets

**AgentMail**：有 Webhooks + WebSockets，收到新信即時通知。
**BaseMail 現狀**：只能 polling `/api/inbox`。

**建議**：至少加 Webhook：
```
POST /api/webhooks/create  { url, events: ["message.received", "message.read"] }
```

Agent 不需要每 30 秒 poll 一次收件匣。特別是跟 $ATTN 機制結合，收到有 bond 的信時應該即時通知。

---

### 5. 🧵 Threads API

**AgentMail**：有獨立的 Threads endpoint，可以查看整個對話串。
**BaseMail 現狀**：有 `in_reply_to` 欄位但沒有 Thread 層級的 API。

**建議**：
```
GET /api/threads                    → 列出對話串
GET /api/threads/:id                → 取得整個對話串的所有信件
GET /api/inbox?thread_id=xxx        → 按 thread 過濾
```

---

### 6. 🏪 Console Dashboard 體驗

**AgentMail**：
- 有 Welcome Wizard（引導完成 4 步驟）
- API Key 管理頁面（建立、命名、顯示 prefix）
- Unified Inbox（跨 inbox 統一收件匣）
- Metrics 圖表（寄出/收到/退信率）
- Getting Started checklist（0/4 completed）

**BaseMail Dashboard**：功能齊全但沒有引導流程。

**建議**：
- 加 Onboarding Wizard（首次登入引導：建立信箱 → 寄第一封信 → 看收件匣）
- 加 API Key 管理 UI（目前只能用 JWT）
- Getting Started checklist

---

## 🏆 BaseMail 已有的優勢（不要丟掉！）

### 1. Crypto-Native 身份（最大優勢）
- SIWE 驗證 = 錢包就是身份 = 去中心化
- Basename 整合 = `.base.eth` → `@basemail.ai`
- 這是 AgentMail 完全沒有的

### 2. $ATTN 注意力經濟
- 獨創的 spam 解決方案
- CO-QAF 學術基礎
- AgentMail 靠傳統 spam filter

### 3. ERC-8004 Agent 身份標準
- 鏈上可發現的 Agent 身份
- `/.well-known/agent-registration.json`
- 這是 protocol level 的東西，AgentMail 沒有

### 4. API Docs JSON（AI-first）
- `/api/docs` 回傳結構化 JSON — AI agent 可以直接讀取理解
- AgentMail 的文件是給人看的 Markdown，AI 要多一步 parse

### 5. 免費內部信
- @basemail.ai ↔ @basemail.ai 完全免費
- AgentMail 免費 tier 有 inbox 數量限制（3 個）

---

## 🎯 優先級建議

| 優先級 | 項目 | 原因 |
|--------|------|------|
| 🔴 P0 | 官方 SDK（Python + Node） | DX 差距最大，直接影響新 agent 採用率 |
| 🔴 P0 | 長效 API Key | Agent 自動化的基本需求 |
| 🟡 P1 | Webhooks | 即時通知 > polling |
| 🟡 P1 | 獨立文件網站 | 人類開發者入口 |
| 🟢 P2 | Threads API | 對話管理 |
| 🟢 P2 | Console 優化 | Onboarding UX |

---

## 💡 總結

**AgentMail 贏在 DX**：SDK、API Key、docs、webhooks — 都是讓開發者「5 分鐘上手」的東西。

**BaseMail 贏在 Identity**：crypto-native、ERC-8004、$ATTN — 都是 protocol level 的創新。

最理想的路徑：**保持 BaseMail 的 identity 優勢，補上 AgentMail 的 DX 體驗。** 讓 `pip install basemail` 一行就能搞定 SIWE + 寄信，同時保有錢包身份和注意力經濟。
