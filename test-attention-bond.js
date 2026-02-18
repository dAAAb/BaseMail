const { createWalletClient, createPublicClient, http, parseAbi, encodeFunctionData, keccak256, toHex } = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
const fs = require('fs');

const CONTRACT = '0x0f686c8ac82654fe0d3e3309f4243f13c9576b27';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const ESCROW_ABI = JSON.parse(fs.readFileSync(
  '/home/node/.openclaw/workspace/BaseMail/contracts/build/contracts_AttentionBondEscrowFlat_sol_AttentionBondEscrow.abi',
  'utf8'
));

const USDC_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
]);

async function main() {
  const walletData = JSON.parse(fs.readFileSync('/home/node/.openclaw/workspace/cloudlobster-wallet.json', 'utf8'));
  const account = privateKeyToAccount(walletData.privateKey);

  const publicClient = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
  const walletClient = createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') });

  console.log('=== AttentionBondEscrow Test ===');
  console.log('Contract:', CONTRACT);
  console.log('Wallet:', account.address);

  // 1. Check USDC balance
  const usdcBalance = await publicClient.readContract({
    address: USDC, abi: USDC_ABI, functionName: 'balanceOf', args: [account.address],
  });
  console.log('\nUSDC balance:', Number(usdcBalance) / 1e6, 'USDC');

  // 2. Check ETH balance
  const ethBalance = await publicClient.getBalance({ address: account.address });
  console.log('ETH balance:', Number(ethBalance) / 1e18, 'ETH');

  // 3. Read contract state
  const defaultPrice = await publicClient.readContract({
    address: CONTRACT, abi: ESCROW_ABI, functionName: 'defaultAttentionPrice',
  });
  console.log('\nDefault attention price:', Number(defaultPrice) / 1e6, 'USDC');

  const protocolFee = await publicClient.readContract({
    address: CONTRACT, abi: ESCROW_ABI, functionName: 'protocolFeeBps',
  });
  console.log('Protocol fee:', Number(protocolFee) / 100, '%');

  const contractOwner = await publicClient.readContract({
    address: CONTRACT, abi: ESCROW_ABI, functionName: 'owner',
  });
  console.log('Owner:', contractOwner);

  const treasuryAddr = await publicClient.readContract({
    address: CONTRACT, abi: ESCROW_ABI, functionName: 'treasury',
  });
  console.log('Treasury:', treasuryAddr);

  // 4. Test: Set attention price for our wallet
  console.log('\n--- Setting attention price to 0.01 USDC ---');
  const setTx = await walletClient.writeContract({
    address: CONTRACT, abi: ESCROW_ABI,
    functionName: 'setAttentionPrice',
    args: [10000n], // 0.01 USDC
  });
  console.log('TX:', setTx);
  await publicClient.waitForTransactionReceipt({ hash: setTx });

  const myPrice = await publicClient.readContract({
    address: CONTRACT, abi: ESCROW_ABI, functionName: 'getAttentionPrice', args: [account.address],
  });
  console.log('My attention price:', Number(myPrice) / 1e6, 'USDC ✅');

  // 5. Test: Approve USDC for escrow contract
  if (usdcBalance >= 10000n) {
    console.log('\n--- Approving 1 USDC for escrow ---');
    const approveTx = await walletClient.writeContract({
      address: USDC, abi: USDC_ABI,
      functionName: 'approve',
      args: [CONTRACT, 1000000n], // 1 USDC
    });
    console.log('Approve TX:', approveTx);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    const allowance = await publicClient.readContract({
      address: USDC, abi: USDC_ABI, functionName: 'allowance', args: [account.address, CONTRACT],
    });
    console.log('Allowance:', Number(allowance) / 1e6, 'USDC ✅');

    // 6. Test deposit (to a different address — use treasury which is our own address, but we can't bond to self)
    // We need a second address. Let's use 寶博's BaseMail wallet (deposit address from config)
    // Actually we can't deposit to ourselves. Let's just verify the contract works with view functions.
    console.log('\n--- Attempting deposit (to 0x4BbdB896...) ---');
    const RECIPIENT = '0x4BbdB896eCEd7d202AD7933cEB220F7f39d0a9Fe'; // BaseMail worker wallet
    const emailId = keccak256(toHex('test-email-' + Date.now()));
    
    try {
      const depositTx = await walletClient.writeContract({
        address: CONTRACT, abi: ESCROW_ABI,
        functionName: 'deposit',
        args: [RECIPIENT, emailId, 10000n], // 0.01 USDC
      });
      console.log('Deposit TX:', depositTx);
      const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositTx });
      console.log('Deposit confirmed! Gas:', Number(depositReceipt.gasUsed));

      // Read bond
      const bond = await publicClient.readContract({
        address: CONTRACT, abi: ESCROW_ABI,
        functionName: 'getBond',
        args: [emailId],
      });
      console.log('\nBond details:');
      console.log('  Sender:', bond[0]);
      console.log('  Recipient:', bond[1]);
      console.log('  Amount:', Number(bond[2]) / 1e6, 'USDC');
      console.log('  Deposit time:', new Date(Number(bond[3]) * 1000).toISOString());
      console.log('  Response deadline:', new Date(Number(bond[4]) * 1000).toISOString());
      console.log('  Status:', ['Active', 'Refunded', 'Forfeited'][Number(bond[5])]);

      const totalDeposited = await publicClient.readContract({
        address: CONTRACT, abi: ESCROW_ABI, functionName: 'totalBondsDeposited',
      });
      console.log('\nTotal bonds deposited:', Number(totalDeposited) / 1e6, 'USDC');

      console.log('\n✅ Full deposit test PASSED!');
    } catch (e) {
      console.log('Deposit test error:', e.shortMessage || e.message);
    }
  } else {
    console.log('\nSkipping deposit test (insufficient USDC)');
  }

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);
