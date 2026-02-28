import { Hono } from 'hono';
import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';
import { createPublicClient, http, parseAbi, type Hex, type Chain } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { AppBindings } from '../types';
import { authMiddleware } from '../auth';

// ── USDC Network Configs ──
const USDC_NETWORKS: Record<string, { chain: Chain; rpc: string; usdc: string; label: string; explorer: string }> = {
  'base-mainnet': {
    chain: base,
    rpc: 'https://mainnet.base.org',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    label: 'Base Mainnet',
    explorer: 'https://basescan.org',
  },
  'base-sepolia': {
    chain: baseSepolia,
    rpc: 'https://sepolia.base.org',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    label: 'Base Sepolia (Testnet)',
    explorer: 'https://sepolia.basescan.org',
  },
};
const USDC_TRANSFER_ABI = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);

// ── Lightweight Markdown → HTML (zero deps) ──
function hasMarkdown(text: string): boolean {
  return /```[\s\S]*?```|^#{1,3} |\*\*.*?\*\*|\[.*?\]\(.*?\)|^- |^\d+\. /m.test(text);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function md2html(md: string): string {
  let html = md
    // Code blocks (fenced)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre style="background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:16px;overflow-x:auto;font-size:13px;line-height:1.5"><code style="color:#e0e0e0;font-family:monospace">${esc(code.trim())}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code style="background:#1a1a2e;padding:2px 6px;border-radius:4px;font-size:0.9em;color:#e0e0e0;font-family:monospace">$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 style="color:#fff;margin:24px 0 8px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#fff;margin:32px 0 12px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="color:#fff;margin:32px 0 16px">$1</h1>')
    // Bold + italic
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#fff">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#0052FF" target="_blank">$1</a>')
    // Horizontal rules
    .replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #333;margin:24px 0" />')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li style="margin-bottom:4px">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => `<ul style="margin:12px 0;padding-left:24px;color:#ccc">${m}</ul>`)
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li style="margin-bottom:4px">$1</li>');

  // Paragraphs
  html = html
    .split('\n\n')
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (/^<(h[1-6]|ul|ol|pre|hr|div|table)/.test(block)) return block;
      return `<p style="margin:12px 0;color:#ccc;line-height:1.6">${block.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');

  return `<div style="background:#0a0a0a;color:#e5e5e5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;max-width:640px">${html}</div>`;
}

export const sendRoutes = new Hono<AppBindings>();

sendRoutes.use('/*', authMiddleware());

// Auto-migrate: add usdc columns if missing
let migrated = false;
sendRoutes.use('/*', async (c, next) => {
  if (!migrated) {
    migrated = true;
    for (const col of ['usdc_amount TEXT', 'usdc_tx TEXT', 'usdc_network TEXT']) {
      try { await c.env.DB.prepare(`ALTER TABLE emails ADD COLUMN ${col}`).run(); } catch {}
    }
  }
  await next();
});

// ── Email Signature (appended for free-tier users) ──
const TEXT_SIGNATURE = `\n\n--\nSent via BaseMail.ai — Email Identity for AI Agents on Base\nhttps://basemail.ai`;

const HTML_SIGNATURE = `<br><br><div style="border-top:1px solid #333;padding-top:12px;margin-top:24px;font-size:12px;color:#888;font-family:sans-serif;">Sent via <a href="https://basemail.ai" style="color:#3B82F6;text-decoration:none;font-weight:bold;">BaseMail.ai</a> — Email Identity for AI Agents on Base</div>`;

interface Attachment {
  filename: string;
  content_type: string;
  data: string; // base64 encoded
}

interface UsdcPayment {
  tx_hash: string;
  amount: string; // human-readable e.g. "10.00"
  network?: string; // 'base-mainnet' | 'base-sepolia' (default: 'base-sepolia' for backward compat)
}

/**
 * POST /api/send
 * Send email from Agent's @basemail.ai address
 *
 * Body: {
 *   to: string,
 *   subject: string,
 *   body: string,
 *   html?: string,
 *   in_reply_to?: string,       // email ID to reply to (adds In-Reply-To header)
 *   attachments?: Attachment[],  // base64-encoded file attachments
 * }
 *
 * Routing:
 * - @basemail.ai -> @basemail.ai: internal delivery (direct D1/R2 storage)
 * - @basemail.ai -> external: via Resend API or Cloudflare send_email
 */
sendRoutes.post('/', async (c) => {
  const auth = c.get('auth');

  if (!auth.handle) {
    return c.json({ error: 'No email registered for this wallet or API key' }, 403);
  }

  const { to, subject, body, html, in_reply_to, attachments, usdc_payment, escrow_claim } = await c.req.json<{
    to: string;
    subject: string;
    body: string;
    html?: string;
    in_reply_to?: string;
    attachments?: Attachment[];
    usdc_payment?: UsdcPayment;
    escrow_claim?: {
      claim_id: string;
      amount: string;      // human-readable e.g. "10.00"
      deposit_tx: string;  // on-chain deposit tx hash
      network?: string;    // 'base-mainnet' | 'base-sepolia'
      expires_at: number;  // unix timestamp
    };
  }>();

  if (!to || !subject || !body) {
    return c.json({ error: 'to, subject, and body are required' }, 400);
  }

  if (!isValidEmail(to)) {
    return c.json({ error: 'Invalid recipient email address' }, 400);
  }

  // Validate attachments (max 10MB total)
  if (attachments && attachments.length > 0) {
    const totalSize = attachments.reduce((sum, a) => sum + (a.data?.length || 0) * 0.75, 0);
    if (totalSize > 10 * 1024 * 1024) {
      return c.json({ error: 'Total attachment size exceeds 10MB limit' }, 400);
    }
    for (const att of attachments) {
      if (!att.filename || !att.content_type || !att.data) {
        return c.json({ error: 'Each attachment must have filename, content_type, and data (base64)' }, 400);
      }
    }
  }

  // ── USDC Payment Verification (supports Base Mainnet + Base Sepolia) ──
  let verifiedUsdc: { amount: string; tx_hash: string; network: string } | null = null;

  if (usdc_payment?.tx_hash) {
    const networkKey = usdc_payment.network || 'base-sepolia';
    const netConfig = USDC_NETWORKS[networkKey];
    if (!netConfig) {
      return c.json({ error: `Unsupported USDC network: ${networkKey}. Use 'base-mainnet' or 'base-sepolia'` }, 400);
    }

    try {
      const client = createPublicClient({ chain: netConfig.chain, transport: http(netConfig.rpc) });
      const receipt = await client.waitForTransactionReceipt({
        hash: usdc_payment.tx_hash as Hex,
        timeout: 15_000,
      });

      if (receipt.status !== 'success') {
        return c.json({ error: 'USDC payment transaction failed on-chain' }, 400);
      }

      // Parse Transfer events from USDC contract
      const transferLog = receipt.logs.find(
        (log) => log.address.toLowerCase() === netConfig.usdc.toLowerCase() && log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
      );

      if (!transferLog || !transferLog.topics[1] || !transferLog.topics[2]) {
        return c.json({ error: 'No USDC Transfer event found in transaction' }, 400);
      }

      const txFrom = ('0x' + transferLog.topics[1].slice(26)).toLowerCase();
      const txTo = ('0x' + transferLog.topics[2].slice(26)).toLowerCase();
      const txAmount = BigInt(transferLog.data);
      const humanAmount = (Number(txAmount) / 1e6).toFixed(2);

      // Verify sender matches (requires wallet-based auth)
      if (!auth.wallet) {
        return c.json({ error: 'USDC verification requires wallet-based auth (JWT), not API key' }, 400);
      }
      if (txFrom !== auth.wallet.toLowerCase()) {
        return c.json({ error: 'USDC sender does not match authenticated wallet' }, 400);
      }

      // Resolve recipient wallet
      const recipientHandle = to.split('@')[0].toLowerCase();
      const recipientAcct = await c.env.DB.prepare(
        'SELECT wallet FROM accounts WHERE handle = ? OR wallet = ?'
      ).bind(recipientHandle, recipientHandle).first<{ wallet: string }>();

      if (recipientAcct && txTo !== recipientAcct.wallet.toLowerCase()) {
        return c.json({ error: 'USDC recipient does not match email recipient wallet' }, 400);
      }

      verifiedUsdc = { amount: humanAmount, tx_hash: usdc_payment.tx_hash, network: networkKey };
    } catch (e: any) {
      return c.json({ error: `USDC verification failed: ${e.message}` }, 400);
    }
  }

  const fromAddr = `${auth.handle}@${c.env.DOMAIN}`;
  const emailId = generateId();
  const now = Math.floor(Date.now() / 1000);

  // ── ATTN v3: Auto-stake ATTN (never blocks sending) ──
  let attnResult: { staked: boolean; amount: number; reason: string; balance_after?: number } = { staked: false, amount: 0, reason: 'skip' };
  if (isValidEmail(to) && to.toLowerCase().endsWith(`@${c.env.DOMAIN}`)) {
    try {
      const { getStakeAmount, stakeAttn, ensureBalance } = await import('./attn');
      const recipientHandle = to.split('@')[0].toLowerCase();

      // Ensure sender has ATTN balance
      if (auth.wallet) {
        await ensureBalance(c.env.DB, auth.wallet, auth.handle);

        const recipientAcct = await c.env.DB.prepare(
          'SELECT wallet FROM accounts WHERE handle = ?'
        ).bind(recipientHandle).first<{ wallet: string }>();

        if (recipientAcct) {
          const stakeInfo = await getStakeAmount(c.env.DB, auth.handle, auth.wallet, recipientHandle);

          if (stakeInfo.amount > 0) {
            const result = await stakeAttn(
              c.env.DB, auth.wallet, auth.handle,
              recipientAcct.wallet, recipientHandle,
              emailId, stakeInfo.amount,
            );
            if (result) {
              attnResult = { staked: true, amount: stakeInfo.amount, reason: stakeInfo.reason, balance_after: result.balance_after };
            } else {
              attnResult = { staked: false, amount: stakeInfo.amount, reason: 'insufficient_balance' };
            }
          } else {
            attnResult = { staked: false, amount: 0, reason: stakeInfo.reason };
          }
        }
      }
    } catch (_) { /* ATTN system not ready — skip */ }
  }

  // If API key auth, resolve wallet for headers when possible
  let walletForHeaders = auth.wallet;
  if (!walletForHeaders) {
    const acct = await c.env.DB.prepare('SELECT wallet FROM accounts WHERE handle = ?')
      .bind(auth.handle)
      .first<{ wallet: string }>();
    walletForHeaders = acct?.wallet || '';
  }

  // Check tier for signature
  const acctTier = await c.env.DB.prepare(
    'SELECT tier FROM accounts WHERE handle = ?'
  ).bind(auth.handle).first<{ tier: string }>();
  const isPro = acctTier?.tier === 'pro';

  // Append escrow claim API instructions for AI agents
  let enrichedBody = body;
  if (escrow_claim) {
    const claimUrl = `https://basemail.ai/claim/${escrow_claim.claim_id}`;
    const apiUrl = `https://api.basemail.ai/api/claim/${escrow_claim.claim_id}`;
    enrichedBody += `\n\n---\n🤖 AI Agent? Claim via API:\n` +
      `GET  ${apiUrl} — view claim details\n` +
      `POST ${apiUrl} — claim USDC (requires auth)\n\n` +
      `Auth options:\n` +
      `• API Key: Authorization: Bearer bm_live_xxx\n` +
      `• SIWE: POST /api/auth/start → sign → POST /api/auth/verify → use token\n` +
      `No BaseMail account? One is auto-created when you claim.\n` +
      `Docs: https://api.basemail.ai/api/docs`;
  }

  // Append signature for free-tier users
  const finalBody = isPro ? enrichedBody : enrichedBody + TEXT_SIGNATURE;
  // Auto-generate HTML from markdown if no HTML provided and body contains markdown syntax
  const autoHtml = (!html && hasMarkdown(enrichedBody)) ? md2html(enrichedBody) : undefined;
  const rawHtml = html || autoHtml;
  const finalHtml = rawHtml ? (isPro ? rawHtml : rawHtml + HTML_SIGNATURE) : undefined;

  // Build MIME message
  const msg = createMimeMessage();
  msg.setSender({ name: auth.handle, addr: fromAddr });
  msg.setRecipient(to);
  msg.setSubject(subject);
  msg.addMessage({ contentType: 'text/plain', data: finalBody });
  if (finalHtml) {
    msg.addMessage({ contentType: 'text/html', data: finalHtml });
  }
  msg.setHeader('X-BaseMail-Agent', auth.handle);
  if (walletForHeaders) msg.setHeader('X-BaseMail-Wallet', walletForHeaders);

  // USDC payment headers
  if (verifiedUsdc) {
    msg.setHeader('X-BaseMail-USDC-Payment', `${verifiedUsdc.amount} USDC`);
    msg.setHeader('X-BaseMail-USDC-TxHash', verifiedUsdc.tx_hash);
    msg.setHeader('X-BaseMail-USDC-Network', USDC_NETWORKS[verifiedUsdc.network]?.label || verifiedUsdc.network);
  }

  // Reply headers
  if (in_reply_to) {
    const origEmail = await c.env.DB.prepare(
      'SELECT id, from_addr, subject FROM emails WHERE id = ? AND handle = ?'
    ).bind(in_reply_to, auth.handle).first<{ id: string; from_addr: string; subject: string }>();

    if (origEmail) {
      const messageId = `<${origEmail.id}@${c.env.DOMAIN}>`;
      msg.setHeader('In-Reply-To', messageId);
      msg.setHeader('References', messageId);
    }
  }

  // Attachments
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      msg.addAttachment({
        filename: att.filename,
        contentType: att.content_type,
        data: att.data,
      });
    }
  }

  const rawMime = msg.asRaw();
  const snippet = body.slice(0, 200);

  // Internal vs external routing
  const isInternal = to.toLowerCase().endsWith(`@${c.env.DOMAIN}`);

  if (isInternal) {
    // ── Internal delivery: store directly in recipient's inbox ──
    let recipientHandle = to.split('@')[0].toLowerCase();

    let recipient = await c.env.DB.prepare(
      'SELECT handle FROM accounts WHERE handle = ?'
    ).bind(recipientHandle).first<{ handle: string }>();

    // 0x 地址 fallback：查 wallet 欄位找到 basename 帳號
    if (!recipient && /^0x[a-f0-9]{40}$/.test(recipientHandle)) {
      recipient = await c.env.DB.prepare(
        'SELECT handle FROM accounts WHERE wallet = ?'
      ).bind(recipientHandle).first<{ handle: string }>();
      if (recipient) {
        recipientHandle = recipient.handle;
      }
    }

    if (!recipient) {
      // 未註冊收件者 — 僅 0x 地址可預存
      const is0xAddress = /^0x[a-f0-9]{40}$/.test(recipientHandle);
      if (!is0xAddress) {
        return c.json({ error: `Recipient not found: ${to}` }, 404);
      }

      // 預存機制：限制每個 0x 地址最多 10 封，30 天 TTL
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60);
      const pendingCount = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM emails WHERE handle = ? AND created_at > ?'
      ).bind(recipientHandle, thirtyDaysAgo).first<{ count: number }>();

      if (pendingCount && pendingCount.count >= 10) {
        return c.json({ error: 'Pre-storage limit reached for this address (max 10 emails)' }, 429);
      }

      // 限制 1MB
      if (rawMime.length > 1 * 1024 * 1024) {
        return c.json({ error: 'Email too large for pre-storage (max 1MB)' }, 413);
      }
    }

    const inboxEmailId = generateId();
    const inboxR2Key = `emails/${recipientHandle}/inbox/${inboxEmailId}.eml`;
    await c.env.EMAIL_STORE.put(inboxR2Key, rawMime);

    await c.env.DB.prepare(
      `INSERT INTO emails (id, handle, folder, from_addr, to_addr, subject, snippet, r2_key, size, read, created_at, usdc_amount, usdc_tx, usdc_network)
       VALUES (?, ?, 'inbox', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
    ).bind(
      inboxEmailId,
      recipientHandle,
      fromAddr,
      to,
      subject,
      snippet,
      inboxR2Key,
      rawMime.length,
      now,
      verifiedUsdc?.amount || null,
      verifiedUsdc?.tx_hash || null,
      verifiedUsdc?.network || null,
    ).run();
  } else {
    // ── External sending (paid, costs 1 credit) ──
    const acct = await c.env.DB.prepare(
      'SELECT credits FROM accounts WHERE handle = ?'
    ).bind(auth.handle).first<{ credits: number }>();

    if (!acct || acct.credits < 1) {
      return c.json({
        error: "You've used all your free email credits",
        credits: 0,
        upgrade: {
          message: 'Every BaseMail account starts with 10 free external emails. To keep sending, add credits — just $0.002 per email.',
          pricing: '0.001 ETH ≈ 1,000 emails (~$2.70)',
          how_to: 'Send ETH on Base to your deposit address, then call POST /api/credits/buy with the tx_hash.',
          dashboard: 'https://basemail.ai/dashboard/credits',
          docs: 'https://api.basemail.ai/api/docs',
        },
      }, 402);
    }

    if (c.env.RESEND_API_KEY) {
      try {
        const resendBody: any = {
          from: fromAddr,
          to: [to],
          subject,
          text: finalBody,
          ...(finalHtml ? { html: finalHtml } : {}),
          headers: {
            'X-BaseMail-Agent': auth.handle,
            'X-BaseMail-Wallet': auth.wallet,
          },
        };

        // Add attachments to Resend payload
        if (attachments && attachments.length > 0) {
          resendBody.attachments = attachments.map((att) => ({
            filename: att.filename,
            content: att.data,
            type: att.content_type,
          }));
        }

        // Add reply headers to Resend
        if (in_reply_to) {
          const origEmail = await c.env.DB.prepare(
            'SELECT id FROM emails WHERE id = ? AND handle = ?'
          ).bind(in_reply_to, auth.handle).first<{ id: string }>();
          if (origEmail) {
            resendBody.headers['In-Reply-To'] = `<${origEmail.id}@${c.env.DOMAIN}>`;
            resendBody.headers['References'] = `<${origEmail.id}@${c.env.DOMAIN}>`;
          }
        }

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${c.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(resendBody),
        });
        if (!res.ok) {
          const err = await res.text();
          return c.json({ error: `Failed to send email: ${err}` }, 500);
        }
      } catch (e: any) {
        return c.json({ error: `Failed to send email: ${e.message}` }, 500);
      }
    } else {
      try {
        const message = new EmailMessage(fromAddr, to, rawMime);
        await c.env.SEND_EMAIL.send(message);
      } catch (e: any) {
        return c.json({
          error: `Failed to send email: ${e.message}`,
          hint: 'External sending requires RESEND_API_KEY or a verified destination in Cloudflare Email Routing',
        }, 500);
      }
    }
  }

  // Deduct credit for external sends
  if (!isInternal) {
    await c.env.DB.prepare(
      'UPDATE accounts SET credits = credits - 1 WHERE handle = ?'
    ).bind(auth.handle).run();

    const txId = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    await c.env.DB.prepare(
      `INSERT INTO credit_transactions (id, handle, type, amount, tx_hash, price_wei, created_at)
       VALUES (?, ?, 'send_external', -1, NULL, NULL, ?)`
    ).bind(txId, auth.handle, Math.floor(Date.now() / 1000)).run();
  }

  // Save to sender's sent folder
  const sentR2Key = `emails/${auth.handle}/sent/${emailId}.eml`;
  await c.env.EMAIL_STORE.put(sentR2Key, rawMime);

  await c.env.DB.prepare(
    `INSERT INTO emails (id, handle, folder, from_addr, to_addr, subject, snippet, r2_key, size, read, created_at, usdc_amount, usdc_tx, usdc_network)
     VALUES (?, ?, 'sent', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
  ).bind(
    emailId,
    auth.handle,
    fromAddr,
    to,
    subject,
    snippet,
    sentR2Key,
    rawMime.length,
    now,
    verifiedUsdc?.amount || null,
    verifiedUsdc?.tx_hash || null,
    verifiedUsdc?.network || null,
  ).run();

  // ── Record escrow claim (for external email with USDC) ──
  let escrowRecorded = false;
  if (escrow_claim && !isInternal) {
    try {
      await c.env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS escrow_claims (
          claim_id TEXT PRIMARY KEY, sender_handle TEXT NOT NULL, sender_wallet TEXT NOT NULL,
          recipient_email TEXT NOT NULL, amount_usdc REAL NOT NULL, deposit_tx TEXT NOT NULL,
          network TEXT NOT NULL DEFAULT 'base-mainnet', status TEXT NOT NULL DEFAULT 'pending',
          claimer_handle TEXT, claimer_wallet TEXT, release_tx TEXT, receipt_email_id TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()), expires_at INTEGER NOT NULL, claimed_at INTEGER
        )`
      ).run();

      const senderWallet = auth.wallet || '';
      await c.env.DB.prepare(
        `INSERT INTO escrow_claims (claim_id, sender_handle, sender_wallet, recipient_email, amount_usdc, deposit_tx, network, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        escrow_claim.claim_id,
        auth.handle,
        senderWallet,
        to,
        parseFloat(escrow_claim.amount),
        escrow_claim.deposit_tx,
        escrow_claim.network || 'base-mainnet',
        escrow_claim.expires_at,
      ).run();
      escrowRecorded = true;
    } catch (_) { /* don't block email sending */ }
  }

  // Auto-resolve attention bond if replying to a bonded email
  let bondResolved = false;
  if (in_reply_to) {
    try {
      const bond = await c.env.DB.prepare(
        `SELECT email_id, sender_handle FROM attention_bonds
         WHERE email_id = ? AND recipient_handle = ? AND status = 'active'`
      ).bind(in_reply_to, auth.handle).first<{ email_id: string; sender_handle: string }>();
      if (bond) {
        await c.env.DB.prepare(
          `UPDATE attention_bonds SET status = 'refunded', resolved_time = ? WHERE email_id = ?`
        ).bind(now, bond.email_id).run();
        // Update sender reputation
        await c.env.DB.prepare(
          `UPDATE sender_reputation SET emails_replied = emails_replied + 1,
           reply_rate = CAST(emails_replied + 1 AS REAL) / CAST(emails_sent AS REAL),
           updated_at = ?
           WHERE sender_handle = ? AND recipient_handle = ?`
        ).bind(now, bond.sender_handle, auth.handle).run();
        bondResolved = true;
      }
    } catch (_) { /* don't block email sending */ }
  }

  // ── ATTN v3: Reply bonus (refund + bonus for both parties) ──
  let attnReplyBonus: { refunded: number; bonus: number } | null = null;
  if (in_reply_to && auth.wallet) {
    try {
      const { processReplyBonus } = await import('./attn');
      attnReplyBonus = await processReplyBonus(c.env.DB, in_reply_to, auth.wallet, auth.handle);
    } catch (_) { /* ATTN system not ready — skip */ }
  }

  return c.json({
    success: true,
    email_id: emailId,
    from: fromAddr,
    to,
    subject,
    internal: isInternal,
    bond_resolved: bondResolved || undefined,
    attachments: attachments?.length || 0,
    ...(verifiedUsdc ? {
      usdc_payment: {
        verified: true,
        amount: verifiedUsdc.amount,
        tx_hash: verifiedUsdc.tx_hash,
        network: USDC_NETWORKS[verifiedUsdc.network]?.label || verifiedUsdc.network,
      },
    } : {}),
    ...(escrowRecorded ? {
      escrow_claim: {
        claim_id: escrow_claim!.claim_id,
        amount: escrow_claim!.amount,
        claim_url: `https://basemail.ai/claim/${escrow_claim!.claim_id}`,
        expires_at: escrow_claim!.expires_at,
      },
    } : {}),
    ...(attnResult.amount > 0 || attnResult.reason !== 'skip' ? {
      attn: {
        staked: attnResult.staked,
        amount: attnResult.amount,
        reason: attnResult.reason,
        balance_after: attnResult.balance_after,
      },
    } : {}),
    ...(attnReplyBonus ? {
      attn_reply_bonus: {
        refunded: attnReplyBonus.refunded,
        bonus_each: attnReplyBonus.bonus,
        note: 'Both sender and replier received reply bonus!',
      },
    } : {}),
  });
});

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${timestamp}-${random}`;
}
