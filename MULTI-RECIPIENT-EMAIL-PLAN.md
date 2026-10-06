# 一般信件多收件人（to / cc / bcc）— Backlog

> 2026-10-06 記錄。狀態：**backlog，尚未排程**。估計 1–1.5 天，大部分時間在防濫用規則與測試。
> Send USDC 的多收件人已另外做完（前端逐一送出，見 `UsdcSendModal`），不依賴這項。

## 現況

- `POST /api/send` 的 `to` 只收單一字串（`worker/src/routes/send.ts` ~L139），`isValidEmail(to)` 驗證，沒有 cc / bcc。
- 外寄走 Resend（`to: [to]`，本來就收陣列）或 Cloudflare `send_email`（一次一個收件人）。
- 內部收件人（`@basemail.ai`）直接寫進對方 inbox（R2 + `emails` 表），並跑 ATTN 自動質押。
- Compose 頁只有單一收件人欄位。

## 要做的事

### API
- `to: string | string[]`，新增 `cc?: string[]`、`bcc?: string[]`；保留單一字串的舊行為（SDK / MCP / 既有 agent 不能壞）。
- 收件人總數上限（建議 20，與 Send USDC 一致），去重、全部先驗證格式，有任何一個無效就整封拒絕。
- 回應改成逐一收件人結果：`results: [{ to, internal, delivered, error? }]`，頂層 `success` 表示至少一位成功；OpenAPI、`llms.txt`、SDK（`sdk/node`）、MCP（`mcp/`）一起更新。

### 防濫用（最重要）
- 免費帳號的外寄 rate limit（`EXTERNAL_SEND_PER_IP_PER_HOUR` 30、`EXTERNAL_SEND_PER_HANDLE_PER_HOUR` 10，`worker/src/ratelimit.ts`）要**按外部收件人數計算**，不是按請求數；否則一封信寄 20 人就繞過 8/24 sybil 事件後加的限制。
- 額度：每位外部收件人扣 1 credit，**先檢查總數夠不夠再寄**，不要寄到一半才 402。
- 考慮免費帳號單封外部收件人上限更低（例如 5）。

### 投遞
- 外寄：Resend 一次送出 to/cc/bcc（bcc 不能出現在標頭）；`send_email` 需要逐一送。
- 內部：每位收件人各寫一份 inbox；ATTN 質押逐一計算（`getStakeAmount` / `stakeAttn`），餘額不足時哪些人質押、哪些沒有要在結果裡講清楚。
- 寄件備份只存一份，`to_addr` 存完整收件人列表（欄位長度、Sent 列表顯示要確認）。
- MIME：`To` / `Cc` 標頭正確；bcc 不寫進任何人看得到的副本。
- 回覆：`in_reply_to` 的 attention bond 自動結算邏輯目前假設單一收件人，要確認多收件人時不會重複結算。

### 前端
- Compose 收件人改成 chips 輸入（可沿用 `UsdcSendModal` 的輸入方式：Enter / 逗號 / 貼上清單），加 Cc / Bcc 展開。
- 送出前顯示外部收件人數與將扣的 credits。
- 收件匣「Reply all」。

## 測試重點
- 舊的單一 `to` 字串請求行為完全不變。
- 免費帳號：外部收件人數超過剩餘 rate limit / credits → 整封拒絕且什麼都沒寄。
- 混合內部 + 外部；部分外寄失敗時的結果與扣款一致。
- bcc 收件人不出現在其他人收到的標頭與寄件備份的可見內容。
