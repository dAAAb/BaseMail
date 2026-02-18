import { ethers } from "hardhat";

// Base Mainnet USDC (Circle official)
const BASE_MAINNET_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying AttentionBondEscrow with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  if (balance < ethers.parseEther("0.001")) {
    console.error("Insufficient ETH for deployment");
    process.exit(1);
  }

  // Treasury = deployer for now (can be changed later)
  const treasury = deployer.address;

  console.log("\nConstructor args:");
  console.log("  USDC:", BASE_MAINNET_USDC);
  console.log("  Treasury:", treasury);

  const Factory = await ethers.getContractFactory("AttentionBondEscrow");
  const escrow = await Factory.deploy(BASE_MAINNET_USDC, treasury);
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log("\n✅ AttentionBondEscrow deployed to:", address);
  console.log("\nVerify:");
  console.log(`npx hardhat verify --network baseMainnet ${address} ${BASE_MAINNET_USDC} ${treasury}`);
  console.log("\nContract details:");
  console.log("  USDC:", BASE_MAINNET_USDC);
  console.log("  Treasury:", treasury);
  console.log("  Default attention price: 0.01 USDC");
  console.log("  Protocol fee: 10%");
  console.log("  Response window: 7 days");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
