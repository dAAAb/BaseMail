# 錢包風險警告（Send USDC escrow / ATTN bond）— 調查筆記與計畫

> 2026-10-06 調查。狀態：**尚未動工**，等 Blockaid 回報結果再決定是否做方案 3。

## 現象

Dashboard → Send USDC → 收件人是外部 email（escrow 模式）→ 按「Approve USDC spending」時，MetaMask 顯示：

- 紅框 **High-risk approval**：「The contract 0xaf41b976978ac981d79c1008dd71681355c71bf6 involved in the transaction is untrusted」（Powered by Blockaid）
- 標題「Withdrawal request — This site wants permission to withdraw your NFTs」
- Estimated changes：「Withdraw #0.1 USDC」
- Data：`approve(spender = PaymentEs…, value = 100000)`

## 結論：誤判，交易本身安全

| 檢查 | 結果 |
|---|---|
| 地址是否為我們的合約 | 是。`web/src/pages/Dashboard.tsx:20`、`worker/wrangler.toml:16`、部落格文章都是同一個地址 |
| 鏈上 `usdc()` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`（Base 官方 USDC） |
| 鏈上 `owner()` | `0x4BbdB896eCEd7d202AD7933cEB220F7f39d0a9Fe`（平台錢包，worker 的 `WALLET_PRIVATE_KEY`） |
| 原始碼驗證 | Sourcify full match（creation + runtime），2026-02-26 驗證，即 `contracts/contracts/PaymentEscrow.sol` |
| 授權金額 | 剛好等於送出金額（`amountRaw`），不是無上限授權 |

- **「NFT」字樣是 MetaMask 解讀錯**：ERC-20 `approve(address,uint256)` 與 ERC-721 `approve(address,uint256)` 的 selector 完全相同（`0x095ea7b3`），錢包只能用猜的；這次把 0.1 當成 tokenId，所以出現「#0.1」與「withdraw NFTs」。實際上只授權 USDC 合約裡的 0.1 USDC，**沒有 NFT 權限可以「預設關閉」**——本來就沒給。
- **「untrusted」是 Blockaid 的名氣判斷**：合約新、互動量少、不在白名單，並沒有指出任何具體惡意行為。
- **真實存在的信任前提（設計取捨，非漏洞）**：owner 可以把任何未結算的存款 `release()` 到任意地址，所以 escrow 裡的錢安全性等於 `WALLET_PRIVATE_KEY` 的保管。

同樣的 approve 寫法也出現在 ATTN bond 質押流程（`Dashboard.tsx:3952`，AttentionBondEscrow `0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220`），預期會跳一樣的警告。

## 方案

### 1. UI 事前說明（建議先做，小改動）

在 Send USDC 的 Escrow Mode 區塊（`Dashboard.tsx` ~L1191）與 ATTN 質押流程，按 Approve 前顯示：

> 錢包會請你授權**剛好 X USDC** 給 BaseMail escrow 合約（0xaf41…1bf6，[已驗證](https://basescan.org/address/0xaf41b976978ac981d79c1008dd71681355c71bf6)）。部分錢包會誤標為「NFT 提領」或「untrusted」，這是誤判。

### 2. 向 Blockaid 回報誤判（需本人送出）

MetaMask 警告框的「Report an issue」或 Blockaid 官網表單，附 Sourcify 驗證結果，申請把 `0xaf41…1bf6`（與 `0xF5fB…C220`）列入白名單。**這才是消除紅色警告的根本解法。**

### 3. 改用 USDC permit（EIP-2612）— 可行，但先等 2 的結果

**可行性已確認：**

- Base USDC 支援 permit：`DOMAIN_SEPARATOR()`、`nonces()` 存在，`version()` = `"2"`。
- **不需要原部署者私鑰**：
  - 原部署者 `0x44F892b06849A285528ECeA8E08Ae5d93F166e70`（CloudLobster 錢包 cloudlobst3rjr.base.eth，deploy tx `0x5755bee2…ff88`，block 42605809），之後 owner 已轉給 `0x4Bbd…a9Fe`。此私鑰是否還在未確認，但不影響。
  - 任何有 ~0.0005 ETH 的錢包都能部署（用你自己的 MetaMask 即可，私鑰不經手）。
  - 新合約 constructor 直接帶 `owner = 0x4Bbd…a9Fe`，worker 現有 secret 就能 `release()`，不必碰任何私鑰。

**要改的地方：**

- **合約** `PaymentEscrowV2`：constructor(`usdc`, `owner`)；新增 `depositWithPermit(claimId, amount, expiry, deadline, v, r, s)`（內部 `permit` 用 try/catch 包起來，防止有人搶先送出同一份 permit 讓交易失敗），保留 `deposit()`。先上 Sepolia 測試，部署後到 Sourcify/Basescan 驗證。
- **前端**（`Dashboard.tsx` ~L968）：`signTypedDataAsync` 簽 permit → 一筆 `depositWithPermit`。從「兩筆交易」變成「一次簽名 + 一筆交易」，MetaMask 會顯示「Spending cap request: X USDC」。
- **Worker**（`worker/src/routes/claim.ts` ~L241）：目前只查單一 `PAYMENT_ESCROW_ADDRESS`。改成先查新合約、查不到再查舊合約，舊合約的 pending claim 最長要撐 30 天（到期上限）。或在 `escrow_claims` 記錄每筆用的合約地址。
- `worker/wrangler.toml`、`DEV-VS-PROD.md`、部落格文章裡的合約地址。
- 工作量估計：半天 + Sepolia 測試 + mainnet 0.1 USDC 實測。

**⚠️ 限制：permit 不會消除紅色警告，可能更嚴重。** 新合約一樣是陌生地址會被標 untrusted，而「對陌生 spender 簽 permit」正是 drainer 最常見的手法，錢包對這類簽名的警告通常更兇。方案 3 只解決「NFT」誤標和少一筆交易。若做，新合約部署後也要再申請 Blockaid 白名單。

## 下一步

1. [ ] 方案 1：Send USDC escrow 與 ATTN 質押加說明文字
2. [ ] 方案 2：向 Blockaid 回報 `0xaf41…1bf6`、`0xF5fB…C220`（本人）
3. [ ] 視 2 的結果決定是否做方案 3
