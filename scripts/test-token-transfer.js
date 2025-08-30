import { Wallet, JsonRpcProvider, Contract, formatUnits } from "ethers";
import fs from "fs";
import path from "path";
import { loadContract } from './utils.js';

// --- Configuration ---
const RPC_URL = "http://127.0.0.1:8545";
const WALLETS_FILE_PATH = path.join("keys", "wallets.json");
const TOKENS_FILE_PATH = path.join("keys", "tokens.json");

const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  console.log("Connecting to local node...");

  // 1. Load wallets and a token
  const userWalletsInfo = JSON.parse(fs.readFileSync(WALLETS_FILE_PATH, "utf8"));
  const tokenAddresses = JSON.parse(fs.readFileSync(TOKENS_FILE_PATH, "utf8"));

  if (userWalletsInfo.length < 2) throw new Error("Need at least 2 wallets for this test.");

  const ownerWallet = new Wallet(userWalletsInfo[0].privateKey, provider);
  const spenderWallet = new Wallet(userWalletsInfo[1].privateKey, provider);
  const tokenAddress = tokenAddresses[0];

  console.log(`\n${BLUE}Test Setup:${RESET}`);
  console.log(`- Token Contract: ${tokenAddress}`);
  console.log(`- Owner Wallet:   ${ownerWallet.address} (will own and approve tokens)`);
  console.log(`- Spender Wallet: ${spenderWallet.address} (will call transferFrom)`);

  const { abi: tokenAbi } = loadContract('musdc');
  const tokenContractAsOwner = new Contract(tokenAddress, tokenAbi, ownerWallet);

  try {
    // 2. Mint tokens to the owner
    console.log(`\n${BLUE}Step 1: Minting tokens for Owner...${RESET}`);
    const mintTx = await tokenContractAsOwner.mint();
    await mintTx.wait();
    console.log(`${GREEN}Mint successful.${RESET}`);
    const balance = await tokenContractAsOwner.balanceOf(ownerWallet.address);
    console.log(`Owner balance: ${formatUnits(balance, 18)} Tokens`);

    // 3. Owner approves Spender
    const approveAmount = balance; // Approve the full balance
    console.log(`\n${BLUE}Step 2: Owner approving Spender for ${formatUnits(approveAmount, 18)} tokens...${RESET}`);
    const approveTx = await tokenContractAsOwner.approve(spenderWallet.address, approveAmount);
    await approveTx.wait();
    console.log(`${GREEN}Approve successful.${RESET}`);

    // 4. Verify allowance
    console.log(`\n${BLUE}Step 3: Verifying allowance...${RESET}`);
    const allowance = await tokenContractAsOwner.allowance(ownerWallet.address, spenderWallet.address);
    console.log(`Allowance for Spender: ${formatUnits(allowance, 18)} Tokens`);
    if (allowance < approveAmount) {
      throw new Error("Allowance verification failed! The amount set is less than approved.");
    }
    console.log(`${GREEN}Allowance verified.${RESET}`);

    // 5. Spender calls transferFrom
    console.log(`\n${BLUE}Step 4: Spender attempting to transfer 100 tokens from Owner...${RESET}`);
    const transferAmount = parseUnits("100", 18);
    const tokenContractAsSpender = new Contract(tokenAddress, tokenAbi, spenderWallet);
    const transferTx = await tokenContractAsSpender.transferFrom(ownerWallet.address, spenderWallet.address, transferAmount);
    await transferTx.wait();
    console.log(`${GREEN}transferFrom successful! The token contract seems to be working correctly.${RESET}`);

    const finalOwnerBalance = await tokenContractAsOwner.balanceOf(ownerWallet.address);
    const finalSpenderBalance = await tokenContractAsOwner.balanceOf(spenderWallet.address);
    console.log(`\nFinal Owner Balance:   ${formatUnits(finalOwnerBalance, 18)}`);
    console.log(`Final Spender Balance: ${formatUnits(finalSpenderBalance, 18)}`);


  } catch (error) {
    console.error(`\n${RED}--- TEST FAILED ---${RESET}`);
    console.error("The isolated token transfer test failed. This strongly confirms the issue is within your token contract's implementation.");
    console.error("\nOriginal error:", error);
    process.exit(1);
  }
}

// Helper to re-add parseUnits since we're not using it much
import { parseUnits } from "ethers";

main();