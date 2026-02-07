/**
 * BaseMail 完整流程測試（含 Basename 鏈上註冊）
 *
 * 1. SIWE 認證
 * 2. 自動 Basename 註冊 (basemailai.base.eth)
 * 3. Email 帳號建立 (basemailai@basemail.ai)
 * 4. 查詢身份
 * 5. 查看收件匣
 */

import { privateKeyToAccount } from 'viem/accounts';

const API = 'https://api.basemail.ai';
const PRIVATE_KEY = '***REDACTED_PRIVATE_KEY***';
const account = privateKeyToAccount(PRIVATE_KEY);

console.log('=== BaseMail 完整流程測試（含 Basename 鏈上註冊）===');
console.log(`錢包: ${account.address}\n`);

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

async function run() {
  // ── 1. 取得 nonce ──
  console.log('1. 取得 nonce...');
  const { data: d1 } = await api('GET', '/api/auth/nonce');
  console.log(`   Nonce: ${d1.nonce}`);

  // ── 2. 取得 SIWE message ──
  console.log('2. 取得 SIWE message...');
  const { data: d2 } = await api('POST', '/api/auth/message', {
    address: account.address,
    nonce: d1.nonce,
  });

  // ── 3. 簽名 ──
  console.log('3. 簽名...');
  const signature = await account.signMessage({ message: d2.message });

  // ── 4. 驗證取得 JWT ──
  console.log('4. SIWE 驗證...');
  const { status: s4, data: d4 } = await api('POST', '/api/auth/verify', {
    address: account.address,
    signature,
    message: d2.message,
  });
  if (s4 !== 200) { console.error('   驗證失敗:', d4); return; }
  console.log(`   JWT 取得成功, registered: ${d4.registered}`);
  let token = d4.token;

  // ── 5. 註冊 email + 自動 Basename ──
  console.log('\n5. 註冊 basemailai@basemail.ai + basemailai.base.eth...');
  console.log('   (鏈上交易中，可能需要 10-30 秒...)\n');

  const startTime = Date.now();
  const { status: s5, data: d5 } = await api('POST', '/api/register', {
    handle: 'basemailai',
    auto_basename: true,
  }, token);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`   耗時: ${elapsed}s`);
  console.log(`   Status: ${s5}`);

  if (s5 !== 201) {
    console.error('   註冊失敗:', JSON.stringify(d5, null, 2));
    return;
  }

  console.log(`   Email: ${d5.email}`);
  console.log(`   Basename: ${d5.basename}`);
  console.log(`   TX Hash: ${d5.tx_hash}`);
  console.log(`   BaseScan: https://basescan.org/tx/${d5.tx_hash}`);
  token = d5.token; // 用新 token（含 handle）

  // ── 6. 查詢身份 ──
  console.log('\n6. 查詢身份...');
  const { data: d6 } = await api('GET', '/api/identity/basemailai');
  console.log('  ', JSON.stringify(d6, null, 2));

  // ── 7. 查看收件匣 ──
  console.log('\n7. 查看收件匣...');
  const { data: d7 } = await api('GET', '/api/inbox', null, token);
  console.log(`   收件: ${d7.total}, 未讀: ${d7.unread}`);

  console.log('\n=== 測試完成 ===');
  console.log(`\n已註冊:`);
  console.log(`  Email: basemailai@basemail.ai`);
  console.log(`  Basename: basemailai.base.eth`);
  console.log(`  TX: https://basescan.org/tx/${d5.tx_hash}`);
  console.log(`\n現在可以寄信到 basemailai@basemail.ai 測試收信功能！`);
}

run().catch(console.error);
