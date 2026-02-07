# BaseMail.ai — Cloudflare 資源追蹤

> **用途**：記錄本專案在 Cloudflare 上建立的所有資源。
> 若要移除此專案，請按照下方清單逐一刪除，不會影響帳號中其他既有資源。

## 帳號既有資源（勿動）

- R2 Bucket: `voice-assets`
- KV Namespace: `VOICE_METADATA` (id: `7b417deddec04b758f1a4975cc34bf90`)
- Pages: `transpal-editor`, `energy`

## 狀態圖例

- [ ] 尚未建立
- [x] 已建立

---

## 1. DNS Zone / Domain

- [x] **basemail.ai** — 網域已加入 Cloudflare DNS（NS: rob.ns.cloudflare.com / edna.ns.cloudflare.com）
  - 移除方式：Cloudflare Dashboard → Websites → basemail.ai → Remove Site

## 2. Workers

- [x] **basemail-worker** — 主要 API + Email 處理 Worker
  - URL: `https://basemail-worker.dab.workers.dev`
  - Custom Domain: `https://api.basemail.ai`
  - Version ID: `d4a5f4e9-738a-4c02-83e6-6696d3c094ec`
  - 部署時間：2026-02-07
  - 移除方式：`npx wrangler delete --name basemail-worker` 或 Dashboard → Workers → basemail-worker → Delete

## 3. D1 Database

- [x] **basemail-db** — 帳號與郵件索引資料庫
  - Database ID: `58b739b9-854c-4998-8f7c-498251f68f14`
  - Region: APAC
  - 建立時間：2026-02-07
  - 移除方式：`npx wrangler d1 delete basemail-db` 或 Dashboard → D1 → basemail-db → Delete

## 4. R2 Bucket

- [x] **basemail-emails** — 原始郵件內容儲存
  - Storage Class: Standard
  - 建立時間：2026-02-07
  - 移除方式：先清空 bucket 內所有物件，再 `npx wrangler r2 bucket delete basemail-emails` 或 Dashboard → R2 → basemail-emails → Delete

## 5. KV Namespace

- [x] **basemail-nonces** — SIWE 驗證用的一次性 nonce 儲存（TTL 自動過期）
  - Namespace ID: `6424876ef5e449fea7ba9e800514d528`
  - 建立時間：2026-02-07
  - 移除方式：`npx wrangler kv namespace delete --namespace-id 6424876ef5e449fea7ba9e800514d528` 或 Dashboard → KV → basemail-nonces → Delete

## 6. Email Routing

- [x] **Email Routing 啟用** — 在 basemail.ai 網域上啟用 Email Routing
  - 啟用時間：2026-02-07
  - 移除方式：Dashboard → basemail.ai → Email → Email Routing → Settings → Disable
- [x] **Catch-all 規則 → Worker** — 所有寄到 @basemail.ai 的信轉給 basemail-worker 處理
  - 狀態：Active
  - 設定時間：2026-02-07
  - 移除方式：Dashboard → basemail.ai → Email → Email Routing → Routing rules → Edit catch-all → Disable

## 7. Cloudflare Pages

- [x] **basemail-web** — 前端 Landing page + Dashboard
  - URL: `https://basemail-web.pages.dev`
  - Custom Domain: `https://basemail.ai`
  - 部署時間：2026-02-07
  - 移除方式：Dashboard → Pages → basemail-web → Settings → Delete project

## 8. DNS Records（自動建立）

以下 DNS 記錄會在啟用各服務時自動建立：

- [x] MX records（route1/2/3.mx.cloudflare.net — Email Routing 啟用時自動加入）
- [x] SPF TXT record（`v=spf1 include:_spf.mx.cloudflare.net ~all`）
- [x] DKIM TXT record（`cf2024-1._domainkey.basemail.ai`）
- [x] A/AAAA records for `api.basemail.ai`（Worker Custom Domain 自動建立）
- [x] CNAME for Pages custom domain（`basemail.ai` → `basemail-web.pages.dev`）

移除方式：刪除對應服務後，手動到 DNS → Records 中清除殘留記錄

---

## 完整移除步驟（按順序）

1. 刪除 Email Routing rules（catch-all → Worker）
2. 停用 Email Routing
3. 刪除 Worker：`npx wrangler delete --name basemail-worker`
4. 刪除 D1：`npx wrangler d1 delete basemail-db`
5. 清空並刪除 R2：`npx wrangler r2 bucket delete basemail-emails`
6. 刪除 KV：`npx wrangler kv namespace delete --namespace-id 6424876ef5e449fea7ba9e800514d528`
7. 刪除 Pages：Dashboard → Pages → basemail-web → Delete
8. 清除 DNS 殘留記錄
9. 移除 Site：Dashboard → Websites → basemail.ai → Remove Site

---

## Base Chain 資源（非 Cloudflare）

- [x] **BaseMailRegistry 合約** — 部署在 Base Mainnet
  - 合約地址：`0x54569D87348ba71e33832b78D61FBC0B94Fed17D`
  - BaseScan: https://basescan.org/address/0x54569D87348ba71e33832b78D61FBC0B94Fed17D
  - Owner: `0x4BbdB896eCEd7d202AD7933cEB220F7f39d0a9Fe`
  - 部署時間：2026-02-07
  - 移除方式：合約無法從鏈上刪除，但可呼叫 `pause()` 停用
