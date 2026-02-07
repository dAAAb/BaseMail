/**
 * BaseMail 收發信測試
 * 1. SIWE 認證取得 JWT
 * 2. 寄信給自己 (basemailai@basemail.ai → basemailai@basemail.ai)
 * 3. 等待收信
 * 4. 查看收件匣
 * 5. 讀取信件內容
 */

import { privateKeyToAccount } from 'viem/accounts';

const API = 'https://api.basemail.ai';
const PRIVATE_KEY = '***REDACTED_PRIVATE_KEY***';
const account = privateKeyToAccount(PRIVATE_KEY);

console.log('=== BaseMail 收發信測試 ===');
console.log(`錢包: ${account.address}\n`);

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

async function run() {
  // ── 1. SIWE 認證 ──
  console.log('1. SIWE 認證...');
  const { data: d1 } = await api('GET', '/api/auth/nonce');
  const { data: d2 } = await api('POST', '/api/auth/message', {
    address: account.address,
    nonce: d1.nonce,
  });
  const signature = await account.signMessage({ message: d2.message });
  const { status: s3, data: d3 } = await api('POST', '/api/auth/verify', {
    address: account.address,
    signature,
    message: d2.message,
  });
  if (s3 !== 200) { console.error('   認證失敗:', d3); return; }
  console.log(`   JWT 取得成功, handle: ${d3.handle || '(none)'}`);
  const token = d3.token;

  // ── 2. 寄信給自己 ──
  console.log('\n2. 寄信: basemailai@basemail.ai → basemailai@basemail.ai');
  const { status: s4, data: d4 } = await api('POST', '/api/send', {
    to: 'basemailai@basemail.ai',
    subject: 'Hello from BaseMail! 🚀',
    body: `This is a test email sent from BaseMail.ai!\n\nSent by AI Agent wallet: ${account.address}\nBasename: basemailai.base.eth\nTimestamp: ${new Date().toISOString()}\n\n-- \nBaseMail - Email for AI Agents on Base`,
    html: `<h2>Hello from BaseMail! 🚀</h2>
<p>This is a test email sent from <strong>BaseMail.ai</strong>!</p>
<ul>
  <li>AI Agent wallet: <code>${account.address}</code></li>
  <li>Basename: <strong>basemailai.base.eth</strong></li>
  <li>Timestamp: ${new Date().toISOString()}</li>
</ul>
<hr>
<p><em>BaseMail - Email for AI Agents on Base</em></p>`,
  }, token);

  console.log(`   Status: ${s4}`);
  if (s4 !== 200 && s4 !== 201) {
    console.error('   寄信失敗:', JSON.stringify(d4, null, 2));
    return;
  }
  console.log(`   Email ID: ${d4.email_id}`);
  console.log(`   From: ${d4.from}`);
  console.log(`   To: ${d4.to}`);
  console.log(`   Subject: ${d4.subject}`);

  // ── 3. 等待收信（Cloudflare Email Routing 需要一點時間） ──
  console.log('\n3. 等待收信（5 秒）...');
  await new Promise(r => setTimeout(r, 5000));

  // ── 4. 查看收件匣 ──
  console.log('\n4. 查看收件匣...');
  const { data: d5 } = await api('GET', '/api/inbox', null, token);
  console.log(`   收件: ${d5.total}, 未讀: ${d5.unread}`);
  if (d5.emails && d5.emails.length > 0) {
    for (const e of d5.emails) {
      console.log(`   - [${e.read ? '已讀' : '未讀'}] ${e.from_addr} → ${e.to_addr}: ${e.subject}`);
    }
  }

  // ── 5. 查看已寄件 ──
  console.log('\n5. 查看已寄件...');
  const { data: d6 } = await api('GET', '/api/inbox?folder=sent', null, token);
  console.log(`   已寄件: ${d6.total}`);
  if (d6.emails && d6.emails.length > 0) {
    for (const e of d6.emails) {
      console.log(`   - ${e.from_addr} → ${e.to_addr}: ${e.subject}`);
    }

    // ── 6. 讀取第一封已寄件的內容 ──
    console.log('\n6. 讀取已寄件內容...');
    const sentId = d6.emails[0].id;
    const { data: d7 } = await api('GET', `/api/inbox/${sentId}`, null, token);
    console.log(`   Subject: ${d7.subject}`);
    console.log(`   Body preview: ${(d7.body || '').slice(0, 200)}...`);
  }

  console.log('\n=== 測試完成 ===');
  console.log('\n提醒: 自寄自收需要 Cloudflare Email Routing 處理，');
  console.log('收件可能需要幾秒到幾分鐘才會出現在收件匣中。');
}

run().catch(console.error);
