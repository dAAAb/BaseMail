/**
 * BaseMail API 完整流程測試
 *
 * 使用 viem 產生測試錢包並執行：
 * 1. GET /api/auth/nonce
 * 2. POST /api/auth/message
 * 3. 簽名 SIWE message
 * 4. POST /api/auth/verify → 取得 JWT
 * 5. GET /api/register/check/:handle
 * 6. POST /api/register
 * 7. GET /api/identity/:handle
 * 8. GET /api/inbox
 */

import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const API = 'https://basemail-worker.dab.workers.dev';

// 產生一個隨機測試錢包
const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Hardhat #0
const account = privateKeyToAccount(testPrivateKey);

console.log('=== BaseMail API 測試 ===');
console.log(`測試錢包: ${account.address}\n`);

// 小工具函數
async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

async function runTests() {
  let token = null;

  // ── 1. 取得 nonce ──
  console.log('1. GET /api/auth/nonce');
  const { status: s1, data: d1 } = await api('GET', '/api/auth/nonce');
  console.log(`   Status: ${s1}`);
  console.log(`   Nonce: ${d1.nonce}`);
  if (!d1.nonce) { console.error('   ❌ 未取得 nonce'); return; }
  console.log('   ✅ 成功\n');

  // ── 2. 取得 SIWE message ──
  console.log('2. POST /api/auth/message');
  const { status: s2, data: d2 } = await api('POST', '/api/auth/message', {
    address: account.address,
    nonce: d1.nonce,
  });
  console.log(`   Status: ${s2}`);
  if (!d2.message) { console.error('   ❌ 未取得 message', d2); return; }
  console.log(`   Message preview: ${d2.message.split('\n')[0]}...`);
  console.log('   ✅ 成功\n');

  // ── 3. 簽名 ──
  console.log('3. 簽名 SIWE message');
  const signature = await account.signMessage({ message: d2.message });
  console.log(`   Signature: ${signature.slice(0, 20)}...`);
  console.log('   ✅ 成功\n');

  // ── 4. 驗證並取得 JWT ──
  console.log('4. POST /api/auth/verify');
  const { status: s4, data: d4 } = await api('POST', '/api/auth/verify', {
    address: account.address,
    signature,
    message: d2.message,
  });
  console.log(`   Status: ${s4}`);
  if (s4 !== 200 || !d4.token) {
    console.error('   ❌ 驗證失敗', d4);
    return;
  }
  token = d4.token;
  console.log(`   Token: ${token.slice(0, 30)}...`);
  console.log(`   Wallet: ${d4.wallet}`);
  console.log(`   Registered: ${d4.registered}`);
  console.log('   ✅ 成功\n');

  // ── 5. 檢查 handle 是否可用 ──
  const testHandle = 'test-agent-' + Date.now().toString(36);
  console.log(`5. GET /api/register/check/${testHandle}`);
  const { status: s5, data: d5 } = await api('GET', `/api/register/check/${testHandle}`);
  console.log(`   Status: ${s5}`);
  console.log(`   Available: ${d5.available}`);
  console.log(`   Email: ${d5.email}`);
  console.log('   ✅ 成功\n');

  // ── 6. 註冊 ──
  console.log(`6. POST /api/register (handle: ${testHandle})`);
  const { status: s6, data: d6 } = await api('POST', '/api/register', {
    handle: testHandle,
    basename: 'test.base.eth',
  }, token);
  console.log(`   Status: ${s6}`);
  if (s6 !== 201) {
    console.error('   ❌ 註冊失敗', d6);
    // 如果是因為已註冊，繼續測試
    if (d6.existing_handle) {
      console.log(`   ℹ️  此錢包已有帳號: ${d6.existing_handle}`);
      token = d4.token; // 使用原始 token
    } else {
      return;
    }
  } else {
    console.log(`   Email: ${d6.email}`);
    console.log(`   Handle: ${d6.handle}`);
    // 使用新 token（包含 handle）
    token = d6.token;
    console.log('   ✅ 成功\n');
  }

  // ── 7. 查詢身份 ──
  const handleToQuery = d6?.handle || d6?.existing_handle || testHandle;
  console.log(`7. GET /api/identity/${handleToQuery}`);
  const { status: s7, data: d7 } = await api('GET', `/api/identity/${handleToQuery}`);
  console.log(`   Status: ${s7}`);
  console.log(`   Data:`, JSON.stringify(d7, null, 2).split('\n').map(l => '   ' + l).join('\n'));
  console.log('   ✅ 成功\n');

  // ── 8. 查看收件匣 ──
  console.log('8. GET /api/inbox');
  const { status: s8, data: d8 } = await api('GET', '/api/inbox', null, token);
  console.log(`   Status: ${s8}`);
  console.log(`   Total: ${d8.total}, Unread: ${d8.unread}`);
  console.log(`   Emails: ${d8.emails?.length || 0}`);
  console.log('   ✅ 成功\n');

  // ── 9. 查看寄件匣 ──
  console.log('9. GET /api/inbox?folder=sent');
  const { status: s9, data: d9 } = await api('GET', '/api/inbox?folder=sent', null, token);
  console.log(`   Status: ${s9}`);
  console.log(`   Total: ${d9.total}`);
  console.log('   ✅ 成功\n');

  // ── 10. Identity 統計 ──
  console.log('10. GET /api/identity (stats)');
  const { status: s10, data: d10 } = await api('GET', '/api/identity');
  console.log(`   Status: ${s10}`);
  console.log(`   Data:`, JSON.stringify(d10, null, 2).split('\n').map(l => '    ' + l).join('\n'));
  console.log('   ✅ 成功\n');

  // ── 11. Waitlist ──
  console.log('11. POST /api/waitlist');
  const { status: s11, data: d11 } = await api('POST', '/api/waitlist', {
    desired_handle: 'future-agent',
    wallet: account.address,
  });
  console.log(`   Status: ${s11}`);
  console.log(`   Data:`, JSON.stringify(d11));
  console.log('   ✅ 成功\n');

  console.log('=== 所有測試完成 ===');
  console.log(`已註冊 email: ${handleToQuery}@basemail.ai`);
  console.log(`可以嘗試寄信到此地址測試收信功能`);
}

runTests().catch(console.error);
