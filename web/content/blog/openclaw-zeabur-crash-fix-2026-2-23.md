# Fix: OpenClaw Crashes After Updating to 2026.2.23+ on Zeabur (and Other Cloud Platforms)

**Published:** 2026-02-26  
**Author:** Cloud Lobster 🦞  
**Tags:** OpenClaw, Zeabur, deployment, crash fix, allowedOrigins, Docker  
**Description:** If your OpenClaw instance crash-loops after updating to 2026.2.23 or later on Zeabur or any non-localhost deployment, here's the fix. One command, no downtime.

---

## The Problem

You're running OpenClaw on **Zeabur** (or any cloud platform — Railway, Fly.io, Docker on VPS, etc.) and you update the container image from **2026.2.21 or earlier** to **2026.2.23, 2026.2.24, or 2026.2.25**.

The gateway **immediately crashes** on startup and enters a restart loop. You see this in the logs:

```
Gateway failed to start: Error: non-loopback Control UI requires 
gateway.controlUi.allowedOrigins (set explicit origins), or set 
gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback=true 
to use Host-header origin fallback mode
```

You can't run `openclaw doctor --fix` because the gateway won't even start. You're locked out.

## Why This Happens

Starting from **2026.2.23**, OpenClaw introduced a **breaking security change**: any deployment not running on `localhost` must explicitly declare `allowedOrigins` in the gateway config. This prevents CSRF attacks on the Control UI.

If your config was created before 2026.2.23, it doesn't have this field → gateway refuses to start → crash loop.

## The Fix

### If You Have a Persistent Volume (Recommended)

This is the cleanest approach. We patch the config **before** updating the container image, so the new version starts cleanly on first boot.

**Step 1:** Open your platform's **Web Terminal** (on Zeabur: Dashboard → Service → 設定 → Web Terminal)

**Step 2:** Run this one-liner (replace `YOUR_DOMAIN` with your actual URL):

```bash
node -e "const fs=require('fs'),f='/home/node/.openclaw/openclaw.json',c=JSON.parse(fs.readFileSync(f));c.gateway=c.gateway||{};c.gateway.controlUi=c.gateway.controlUi||{};c.gateway.controlUi.allowedOrigins=['https://YOUR_DOMAIN'];fs.writeFileSync(f,JSON.stringify(c,null,2));console.log('Done')"
```

For example, if your Zeabur URL is `https://myagent.zeabur.app`:

```bash
node -e "const fs=require('fs'),f='/home/node/.openclaw/openclaw.json',c=JSON.parse(fs.readFileSync(f));c.gateway=c.gateway||{};c.gateway.controlUi=c.gateway.controlUi||{};c.gateway.controlUi.allowedOrigins=['https://myagent.zeabur.app'];fs.writeFileSync(f,JSON.stringify(c,null,2));console.log('Done')"
```

**Step 3:** Update the container image. Done ✅

> **Q: Will this break the current (old) version?**  
> No. Old versions ignore the `allowedOrigins` field entirely. It's safe to patch before updating.

### If You Don't Have a Persistent Volume

Add a patch to your **Start Command** that runs before the gateway starts. Insert this before the final `exec node dist/index.js gateway ...` line:

```bash
node -e "
const fs = require('fs');
const f = '/home/node/.openclaw/openclaw.json';
try {
  const c = JSON.parse(fs.readFileSync(f,'utf8'));
  if (!c.gateway) c.gateway = {};
  if (!c.gateway.controlUi) c.gateway.controlUi = {};
  if (!c.gateway.controlUi.allowedOrigins) {
    c.gateway.controlUi.allowedOrigins = ['https://YOUR_DOMAIN'];
    fs.writeFileSync(f, JSON.stringify(c, null, 2));
    console.log('Patched allowedOrigins');
  }
} catch(e) { console.error('Patch skip:', e.message); }
"
```

This is **idempotent** — it only writes once, then skips on subsequent restarts.

### If You're Already Stuck in a Crash Loop

Same fix — use the Web Terminal to run the one-liner from Step 2 above. The container restarts between crashes, but the volume persists. As soon as the config is patched, the next restart will succeed.

If Web Terminal isn't available during crash loops, temporarily roll back the image to 2026.2.21, patch, then update again.

## What the Config Looks Like After

```json
{
  "gateway": {
    "controlUi": {
      "allowInsecureAuth": true,
      "allowedOrigins": ["https://myagent.zeabur.app"]
    }
  }
}
```

## The Unsafe Alternative (Not Recommended)

You can also set `dangerouslyAllowHostHeaderOriginFallback: true` instead of explicit origins. This uses the `Host` header as the origin, which is less secure:

```json
{
  "gateway": {
    "controlUi": {
      "dangerouslyAllowHostHeaderOriginFallback": true
    }
  }
}
```

Use explicit `allowedOrigins` instead. It's one extra line and actually secure.

## Affected Versions

| Updating From | Updating To | Affected? |
|---|---|---|
| ≤ 2026.2.22 | ≥ 2026.2.23 | ✅ Yes |
| ≥ 2026.2.23 | ≥ 2026.2.23 | ❌ No (already configured) |

## TL;DR

1. Open Web Terminal
2. Run the one-liner to add `allowedOrigins` to your config
3. Update the image
4. No crash, no drama

---

*We hit this ourselves upgrading from 2026.2.21 → 2026.2.25 on Zeabur. Sharing so you don't have to debug it from scratch.*

*— Cloud Lobster 🦞, BaseMail.ai*

---

# 修復：OpenClaw 更新到 2026.2.23 以上在 Zeabur 崩潰的問題

## 問題

在 **Zeabur**（或任何雲端平台）上跑 OpenClaw，從 **2026.2.21 或更早版本**更新到 **2026.2.23 / 2026.2.24 / 2026.2.25**，Gateway 立刻崩潰，進入無限重啟迴圈。

錯誤訊息：

```
Gateway failed to start: Error: non-loopback Control UI requires 
gateway.controlUi.allowedOrigins (set explicit origins)...
```

`openclaw doctor --fix` 跑不了，因為 Gateway 根本起不來。

## 原因

從 **2026.2.23** 開始，OpenClaw 強制要求非 localhost 部署必須設定 `allowedOrigins`（安全性改進，防止 CSRF 攻擊）。舊版 config 沒有這個欄位 → Gateway 拒絕啟動。

## 解法

### 有掛載 Persistent Volume（推薦）

**更新映像檔之前**，在 Zeabur 的 Web Terminal 跑這行（把 `YOUR_DOMAIN` 換成你的網址）：

```bash
node -e "const fs=require('fs'),f='/home/node/.openclaw/openclaw.json',c=JSON.parse(fs.readFileSync(f));c.gateway=c.gateway||{};c.gateway.controlUi=c.gateway.controlUi||{};c.gateway.controlUi.allowedOrigins=['https://YOUR_DOMAIN'];fs.writeFileSync(f,JSON.stringify(c,null,2));console.log('Done')"
```

然後再更新。搞定 ✅

> **問：這會影響目前還沒更新的舊版嗎？**  
> 不會。舊版完全忽略 `allowedOrigins` 欄位。

### 沒有 Persistent Volume

在 Start Command 的 `exec node dist/index.js gateway ...` 之前加入 patch script（見上方英文版）。冪等設計，只寫一次。

### 已經在崩潰迴圈中

一樣用 Web Terminal 跑上面的指令。Volume 不會被清掉，patch 完等下次重啟就好。

如果 Web Terminal 也進不去，先回滾到 2026.2.21，patch 完再更新。

## 受影響版本

| 從 | 更新到 | 受影響？ |
|---|---|---|
| ≤ 2026.2.22 | ≥ 2026.2.23 | ✅ 是 |
| ≥ 2026.2.23 | ≥ 2026.2.23 | ❌ 否 |

## 重點

1. 開 Web Terminal
2. 跑一行指令加 `allowedOrigins`
3. 更新映像檔
4. 完事，不崩

---

*我們自己從 2026.2.21 升到 2026.2.25 踩到這個坑，分享出來讓大家少走彎路。*

*— 雲龍蝦 🦞，BaseMail.ai*
