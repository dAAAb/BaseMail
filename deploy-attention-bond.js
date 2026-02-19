const { createWalletClient, createPublicClient, http, parseAbi, encodeFunctionData, encodeDeployData } = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
const fs = require('fs');

// Base Mainnet USDC (Circle official)
const BASE_MAINNET_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

async function main() {
  // Load wallet from environment variable
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ DEPLOYER_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }
  const account = privateKeyToAccount(privateKey);
  console.log('Deployer:', account.address);

  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log('Balance:', Number(balance) / 1e18, 'ETH');

  if (balance < 500000000000000n) { // 0.0005 ETH minimum
    console.error('Insufficient ETH');
    process.exit(1);
  }

  // Load compiled bytecode and ABI
  const bytecode = '0x' + fs.readFileSync(
    '/home/node/.openclaw/workspace/BaseMail/contracts/build/contracts_AttentionBondEscrowFlat_sol_AttentionBondEscrow.bin',
    'utf8'
  ).trim();
  const abi = JSON.parse(fs.readFileSync(
    '/home/node/.openclaw/workspace/BaseMail/contracts/build/contracts_AttentionBondEscrowFlat_sol_AttentionBondEscrow.abi',
    'utf8'
  ));

  console.log('Bytecode size:', bytecode.length / 2, 'bytes');
  console.log('USDC:', BASE_MAINNET_USDC);
  console.log('Treasury:', account.address);

  // Estimate gas
  console.log('\nEstimating gas...');

  // Encode constructor args
  // constructor(address _usdc, address _treasury)
  const constructorArgs = [BASE_MAINNET_USDC, account.address];

  try {
    const hash = await walletClient.deployContract({
      abi,
      bytecode,
      args: constructorArgs,
    });

    console.log('\n📤 Deploy tx:', hash);
    console.log('Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });

    console.log('\n✅ AttentionBondEscrow deployed!');
    console.log('Contract:', receipt.contractAddress);
    console.log('Block:', receipt.blockNumber);
    console.log('Gas used:', receipt.gasUsed.toString());
    console.log('TX:', `https://basescan.org/tx/${hash}`);
    console.log('\nContract:', `https://basescan.org/address/${receipt.contractAddress}`);

    // Save deployment info
    const deployInfo = {
      contract: 'AttentionBondEscrow',
      address: receipt.contractAddress,
      deployer: account.address,
      usdc: BASE_MAINNET_USDC,
      treasury: account.address,
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
      gasUsed: Number(receipt.gasUsed),
      network: 'Base Mainnet',
      chainId: 8453,
      deployedAt: new Date().toISOString(),
      paper: 'Ko, Tang, Weyl (2026) — Connection-Oriented QAF',
    };
    fs.writeFileSync(
      '/home/node/.openclaw/workspace/BaseMail/contracts/deployment-attention-bond.json',
      JSON.stringify(deployInfo, null, 2)
    );
    console.log('\nDeployment info saved to deployment-attention-bond.json');

  } catch (e) {
    console.error('Deploy failed:', e.message || e);
    if (e.details) console.error('Details:', e.details);
  }
}

main();
