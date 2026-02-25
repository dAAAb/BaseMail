const { createPublicClient, createWalletClient, http, encodeDeployData } = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
const fs = require('fs');
const path = require('path');

const USDC_BASE_MAINNET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
// Deploy with platform wallet
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0x71af4490752eb418b231b5b50819fe03c423a4e266fe9244948b9e5080d5ad32';

const abi = JSON.parse(fs.readFileSync(path.join(__dirname, '../build/contracts_PaymentEscrowFlat_sol_PaymentEscrow.abi'), 'utf8'));
const bytecode = '0x' + fs.readFileSync(path.join(__dirname, '../build/contracts_PaymentEscrowFlat_sol_PaymentEscrow.bin'), 'utf8').trim();

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
  const walletClient = createWalletClient({ chain: base, transport: http('https://mainnet.base.org'), account });

  console.log('Deployer:', account.address);
  const bal = await publicClient.getBalance({ address: account.address });
  console.log('ETH balance:', Number(bal) / 1e18);

  console.log('Deploying PaymentEscrow with USDC:', USDC_BASE_MAINNET);

  const hash = await walletClient.deployContract({
    abi,
    bytecode,
    args: [USDC_BASE_MAINNET],
  });

  console.log('Deploy TX:', hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  console.log('Status:', receipt.status);
  console.log('Contract address:', receipt.contractAddress);
  console.log('');
  console.log('Next steps:');
  console.log(`1. Add PAYMENT_ESCROW_ADDRESS = "${receipt.contractAddress}" to wrangler.toml secrets`);
  console.log(`2. Verify on BaseScan`);
}

main().catch(e => { console.error(e); process.exit(1); });
