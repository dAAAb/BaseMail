# BaseMail Feature Plan — 5 項新功能

## 現有架構摘要

- **Credits**: `accounts.credits` 欄位（但 schema.sql 裡沒有，是 auto-migration 加的）
- **外寄信**: send.ts 檢查 `credits >= 1`，不足回 402
- **Attention Bonds**: attention.ts，config/bonds/whitelist/reputation/qaf_scores 五張表
- **Inbox**: inbox.ts，已有 unread count、mark-read（支援 ids 或全部）
- **前端**: Dashboard.tsx 3333 行，sidebar 有 NavLink，已有 unread badge 在 Inbox

---

## Feature 1: 新用戶免費 10 封外寄信

### 改動範圍：最小

**方案：註冊時給 10 credits**

只需改 2 處：

1. **`routes/auth.ts` L139** — `INSERT INTO accounts` 後加一行：
   ```sql
   UPDATE accounts SET credits = 10 WHERE handle = ? AND credits = 0
   ```
   
2. **`routes/register.ts` L111** — 同上

**就這樣。** 現有的 credit 扣款邏輯（send.ts）完全不用改，用完就是用完。

### 替代方案（更乾淨）
在 INSERT 語句直接加 credits：
```sql
INSERT INTO accounts (handle, wallet, basename, tx_hash, credits, created_at)
VALUES (?, ?, ?, ?, 10, ?)
```

### 前端
- Credits 頁面已有餘額顯示，不用改
- 可選：在 credits = 0 時顯示「Buy more credits」提示

### 風險：無
- 不影響現有用戶（他們的 credits 不會被覆蓋）
- 不影響 credit 購買流程

---

## Feature 2: Attention Priority Inbox

### API 層

**新增查詢參數到 `GET /api/inbox`**：

```
GET /api/inbox?folder=inbox&bonded=true&sort=bond_amount|deadline&order=asc|desc
```

改動 `routes/inbox.ts`：
- `bonded=true` → LEFT JOIN attention_bonds，只回傳有 bond 的信
- `sort=bond_amount` → ORDER BY attention_bonds.amount_usdc DESC
- `sort=deadline` → ORDER BY attention_bonds.response_deadline ASC（最急的排前面）
- 每封 email 回傳多加 `bond` 欄位：`{ amount_usdc, status, response_deadline, time_remaining_hours }`

```ts
// inbox.ts 新增
if (bonded === 'true') {
  sql = `SELECT e.*, ab.amount_usdc as bond_amount, ab.status as bond_status, 
         ab.response_deadline as bond_deadline
         FROM emails e
         INNER JOIN attention_bonds ab ON ab.email_id = e.id
         WHERE e.handle = ? AND e.folder = 'inbox' AND ab.status = 'active'
         ORDER BY ${sortField} ${order}
         LIMIT ? OFFSET ?`;
}
```

### 前端

Dashboard Inbox 加一個 filter bar：
```
[All] [🔥 Bonded (3)] [Sort: Amount ▼ | Deadline ▼]
```

每封 bonded email 顯示：
- 💰 Bond 金額 badge（如 `$0.50 USDC`）
- ⏰ 剩餘回覆時間（如 `23h left`，變紅 <6h）

### 風險：低
- 只是在現有 inbox query 加 JOIN，不改寫任何資料
- filter 是 additive，不影響預設 inbox 顯示

---

## Feature 3: Attention Bond 缺少的功能

### 3a. 寄件者視角：Bond 追蹤 Dashboard

**現有問題**：寄件者發了 bond 後，無法追蹤狀態（active/refunded/forfeited）

**API**：
```
GET /api/attention/my-bonds  （需 auth）
```
回傳該用戶作為 sender 的所有 bonds，含狀態、金額、deadline。

**前端**：Attention 頁面加 "My Sent Bonds" tab。

### 3b. 收件者視角：一鍵回覆 bonded email

**現有問題**：收件者回覆 bonded email 後，bond 狀態沒有自動更新

**方案**：send.ts 發信時，檢查是否在回覆一封有 active bond 的 email，如果是：
```ts
// send.ts — 回覆時自動 resolve bond
if (in_reply_to) {
  const bond = await DB.prepare(
    'SELECT * FROM attention_bonds WHERE email_id = ? AND recipient_handle = ? AND status = ?'
  ).bind(in_reply_to, auth.handle, 'active').first();
  if (bond) {
    await DB.prepare(
      'UPDATE attention_bonds SET status = ?, resolved_time = ? WHERE email_id = ?'
    ).bind('refunded', now, in_reply_to).run();
    // TODO: trigger on-chain refund
  }
}
```

### 3c. 過期 Bond 自動 forfeit

**現有問題**：bond 過了 deadline 沒人處理

**方案**：加一個 Cloudflare Cron Trigger（或在 inbox 查詢時 lazy check）：
```sql
UPDATE attention_bonds SET status = 'forfeited', resolved_time = ?
WHERE status = 'active' AND response_deadline < ?
```

### 3d. Bond 收據 email

寄件者 stake bond 後，自動收到一封系統確認信：
```
Subject: 🔒 Attention Bond Confirmed — $0.50 USDC
Body: Your bond to daaaaab@basemail.ai is active. 
      Deadline: 2026-02-28 12:00 UTC
      If they reply, you get a full refund.
```

### 風險：中等
- 3b 改動 send.ts（核心路徑），需小心
- 3c 需要新 cron 或 lazy evaluation
- 3a 和 3d 是 additive，低風險

---

## Feature 4: 新用戶 Attention Bond 引導

### Sidebar 未讀紅點

Dashboard.tsx sidebar NavLink 加 badge：

```tsx
<NavLink to="/dashboard/inbox" icon="inbox" label="Inbox" 
  active={...} badge={unreadCount > 0 ? unreadCount : undefined} />
<NavLink to="/dashboard/attention" icon="attention" label="Attention" 
  active={...} badge={!hasConfiguredAttention ? '!' : undefined} />
```

`hasConfiguredAttention`：查 `GET /api/attention/config` 是否已 enabled。

### Attention 頁面首次引導 popup

```tsx
// 在 Attention component mount 時
if (!config.enabled && !localStorage.getItem('attention_intro_seen')) {
  showIntroModal();
}
```

Modal 內容：
- 標題：🛡️ Protect your inbox with Attention Bonds
- 說明 QAF 機制（3 句話版本）
- CTA: "Enable & Set Price" → 導到設定
- "Learn More" → 連到 blog/attention-bonds 文章
- "Skip" → localStorage 記住不再顯示

### 已設定標記

Attention 頁面顯示設定狀態：
```
✅ Attention Bonds: Enabled
💰 Base Price: 0.10 USDC
⏰ Response Window: 48 hours
📝 Last updated: 2026-02-20
```

未設定時顯示 setup wizard。

### 風險：低
- 純前端改動 + 一個 API call
- 不影響任何後端邏輯

---

## Feature 5: Inbox「全部設成已讀」+ 未讀數

### API 層

**已經有了！** `POST /api/inbox/mark-read` 不傳 ids 就是全部已讀。
回傳也已有 `unread` count。

### 前端

Inbox 頂部加：
```tsx
<div className="flex justify-between items-center">
  <span className="text-gray-400">{unread} unread</span>
  {unread > 0 && (
    <button onClick={markAllRead} className="text-sm text-blue-400 hover:text-blue-300">
      Mark all as read
    </button>
  )}
</div>
```

Sidebar Inbox NavLink 已有 unread badge（L1160），確認它正確顯示即可。

### 風險：幾乎為零
- API 已存在
- 純前端 UI 改動

---

## 實作順序（安全優先）

| 順序 | Feature | 改動 | 風險 | 估時 |
|------|---------|------|------|------|
| 1 | #5 全部已讀 + 未讀數 | 前端 only | 幾乎零 | 15min |
| 2 | #1 免費 10 credits | 2 行 SQL | 零 | 10min |
| 3 | #4 Attention 引導 | 前端 + localStorage | 低 | 30min |
| 4 | #2 Priority Inbox | inbox.ts JOIN + 前端 filter | 低 | 45min |
| 5 | #3a Sent Bonds 追蹤 | 新 API + 前端 tab | 低 | 30min |
| 6 | #3b 回覆自動 resolve | send.ts 改動 | 中 | 20min |
| 7 | #3c 過期 auto-forfeit | cron 或 lazy check | 中 | 20min |
| 8 | #3d Bond 收據 email | send internal | 低 | 15min |

**總估時：~3h**

每個 feature 獨立 commit + deploy，確認不壞再做下一個。
