import { Wallet, JsonRpcProvider, Contract, parseUnits } from "ethers";
import fs from "fs";
import path from "path";
import { loadContract } from './utils.js';
import { exit } from "process";

// --- Configuration ---
const RPC_URL = "http://127.0.0.1:8545";
const WALLETS_FILE_PATH = path.join("keys", "wallets.json");
const TOKENS_FILE_PATH = path.join("keys", "tokens.json");
const UNISWAP_FILE_PATH = path.join("keys", "uniswap.json");
const TX_COUNT = 1000;
const CHUNK_SIZE = 200;

// --- Transaction Parameters ---
const APPROVE_AMOUNT = parseUnits("1000000", 18);
const LIQUIDITY_AMOUNT = parseUnits("10000", 18);
const DEADLINE = Math.floor(Date.now() / 1000) + 3600 * 24 * 365;

// --- Logging Colors ---
const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

/**
 * Executes a batch of transactions and waits for confirmation.
 */
async function executeBatch(description, txPromises) {
  if (txPromises.length === 0) return;
  console.log(`  ${YELLOW}Executing: ${description} for ${txPromises.length} users...${RESET}`);
  const responses = await Promise.all(txPromises);
  const receiptPromises = responses.map(res => res.wait());
  await Promise.all(receiptPromises);
  console.log(`  ${GREEN}Confirmed: ${description} for ${txPromises.length} users.${RESET}`);
}

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  console.log("Connecting to local node...");

  // 1. Load all necessary data from files
  console.log("Loading wallets, tokens, and Uniswap contract addresses...");
  const userWalletsInfo = JSON.parse(fs.readFileSync(WALLETS_FILE_PATH, "utf8"));
  const tokenAddresses = JSON.parse(fs.readFileSync(TOKENS_FILE_PATH, "utf8"));
  const uniswapAddresses = JSON.parse(fs.readFileSync(UNISWAP_FILE_PATH, "utf8"));

  const { abi: tokenAbi } = loadContract('musdc');
  const { abi: routerAbi } = loadContract('univ2-router');

  // 2. Prepare wallets and fetch initial nonces
  console.log(`Fetching initial nonces for all ${TX_COUNT} user wallets...`);
  const userWallets = userWalletsInfo.map(info => new Wallet(info.privateKey, provider));
  const nonceTrackers = new Map();
  const noncePromises = userWallets.map(async (wallet) => {
    const nonce = await provider.getTransactionCount(wallet.address);
    nonceTrackers.set(wallet.address, nonce);
  });
  await Promise.all(noncePromises);
  console.log(`${GREEN}Initial nonces fetched.${RESET}`);

  // 3. Process users in chunks, with strict sequential steps inside each chunk
  for (let i = 0; i < TX_COUNT; i += CHUNK_SIZE) {
    const chunkEnd = Math.min(i + CHUNK_SIZE, TX_COUNT);
    console.log(`\n${BLUE}--- Processing user chunk: ${i} to ${chunkEnd - 1} ---${RESET}`);

    const currentChunkWallets = userWallets.slice(i, chunkEnd);

    // STEP 1: Mint for Token A
    let mintAPromises = [];
    for (const userWallet of currentChunkWallets) {
      const m = userWallets.indexOf(userWallet);
      const tokenAAddress = tokenAddresses[2 * m];
      const tokenAContract = new Contract(tokenAAddress, tokenAbi, userWallet);
      let nonce = nonceTrackers.get(userWallet.address);
      mintAPromises.push(tokenAContract.mint({ nonce: nonce }));
      nonceTrackers.set(userWallet.address, nonce + 1);
    }

    // STEP 2: Mint for Token B
    let mintBPromises = [];
    for (const userWallet of currentChunkWallets) {
      const m = userWallets.indexOf(userWallet);
      const tokenBAddress = tokenAddresses[2 * m + 1];
      const tokenBContract = new Contract(tokenBAddress, tokenAbi, userWallet);
      let nonce = nonceTrackers.get(userWallet.address);
      mintBPromises.push(tokenBContract.mint({ nonce: nonce }));
      nonceTrackers.set(userWallet.address, nonce + 1);
    }

    // STEP 3: Approve for Token A
    let approveAPromises = [];
    for (const userWallet of currentChunkWallets) {
      const m = userWallets.indexOf(userWallet);
      const tokenAAddress = tokenAddresses[2 * m];
      const tokenAContract = new Contract(tokenAAddress, tokenAbi, userWallet);
      let nonce = nonceTrackers.get(userWallet.address);
      approveAPromises.push(tokenAContract.approve(uniswapAddresses.router, APPROVE_AMOUNT, { nonce: nonce }));
      nonceTrackers.set(userWallet.address, nonce + 1);
    }

    // STEP 4: Approve for Token B
    let approveBPromises = [];
    for (const userWallet of currentChunkWallets) {
      const m = userWallets.indexOf(userWallet);
      const tokenBAddress = tokenAddresses[2 * m + 1];
      const tokenBContract = new Contract(tokenBAddress, tokenAbi, userWallet);
      let nonce = nonceTrackers.get(userWallet.address);
      approveBPromises.push(tokenBContract.approve(uniswapAddresses.router, APPROVE_AMOUNT, { nonce: nonce }));
      nonceTrackers.set(userWallet.address, nonce + 1);
    }

    // STEP 5: Add Liquidity
    let addLiquidityPromises = [];
    const routerContract = new Contract(uniswapAddresses.router, routerAbi, provider);
    for (const userWallet of currentChunkWallets) {
      const m = userWallets.indexOf(userWallet);
      const tokenAAddress = tokenAddresses[2 * m];
      const tokenBAddress = tokenAddresses[2 * m + 1];
      let nonce = nonceTrackers.get(userWallet.address);
      addLiquidityPromises.push(
        routerContract.connect(userWallet).addLiquidity(
          tokenAAddress, tokenBAddress, LIQUIDITY_AMOUNT, LIQUIDITY_AMOUNT, 0, 0, userWallet.address, DEADLINE,
          { nonce: nonce, gasLimit: 3000000 }
        )
      );
      nonceTrackers.set(userWallet.address, nonce + 1);
    }
    
    await executeBatch("Minting for Token A", mintAPromises);
    await executeBatch("Minting for Token B", mintBPromises);
    await executeBatch("Approving Router for Token A", approveAPromises);
    await executeBatch("Approving Router for Token B", approveBPromises);
    await executeBatch("Adding Liquidity", addLiquidityPromises);
  }

  console.log(`\n\n${GREEN}--- All liquidity provisioning tasks are complete! ---${RESET}`);
}

main().catch((error) => {
  console.error("Error in main function:", error);
  process.exit(1);
});