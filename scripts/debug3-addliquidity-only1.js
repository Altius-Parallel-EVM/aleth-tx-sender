import { Wallet, JsonRpcProvider, Contract, formatUnits, parseUnits, formatEther } from "ethers";
import fs from "fs";
import path from "path";
import { loadContract } from './utils.js';

// --- Configuration ---
const RPC_URL = "http://127.0.0.1:8545";
const WALLETS_FILE_PATH = path.join("keys", "wallets.json");
const TOKENS_FILE_PATH = path.join("keys", "tokens.json");
const UNISWAP_FILE_PATH = path.join("keys", "uniswap.json");

// --- Transaction Parameters ---
const APPROVE_AMOUNT = parseUnits("1000000", 18);
const LIQUIDITY_AMOUNT = parseUnits("10000", 18);
const DEADLINE = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

// --- Logging Colors ---
const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  console.log("Connecting to local node...");

  // 1. Load all necessary data
  console.log("Loading user wallet, tokens, and Uniswap contracts...");
  const userWalletsInfo = JSON.parse(fs.readFileSync(WALLETS_FILE_PATH, "utf8"));
  const tokenAddresses = JSON.parse(fs.readFileSync(TOKENS_FILE_PATH, "utf8"));
  const uniswapAddresses = JSON.parse(fs.readFileSync(UNISWAP_FILE_PATH, "utf8"));

  const selectedIdx = 5;
  const userWallet = new Wallet(userWalletsInfo[selectedIdx].privateKey, provider);
  const tokenAAddress = tokenAddresses[selectedIdx * 2];
  const tokenBAddress = tokenAddresses[selectedIdx * 2 + 1];
  const routerAddress = uniswapAddresses.router;
  const factoryAddress = uniswapAddresses.factory;

  const { abi: tokenAbi } = loadContract('musdc');
  const { abi: routerAbi } = loadContract('univ2-router');
  const { abi: factoryAbi } = loadContract('univ2-factory');

  const tokenAContract = new Contract(tokenAAddress, tokenAbi, userWallet);
  const tokenBContract = new Contract(tokenBAddress, tokenAbi, userWallet);
  const routerContract = new Contract(routerAddress, routerAbi, userWallet);
  const factoryContract = new Contract(factoryAddress, factoryAbi, userWallet);

  console.log(`\n${BLUE}--- Target Details ---${RESET}`);
  console.log(`User Wallet:    ${userWallet.address}`);
  console.log(`Token A:        ${tokenAAddress}`);
  console.log(`Token B:        ${tokenBAddress}`);
  console.log(`Router:         ${routerAddress}`);

  try {
    // STEP 1: Check balances
    console.log(`\n${YELLOW}--- Step 1: Checking Balances ---${RESET}`);
    const balanceA = await tokenAContract.balanceOf(userWallet.address);
    const balanceB = await tokenBContract.balanceOf(userWallet.address);
    console.log(`Token A Balance: ${formatUnits(balanceA, 18)}`);
    console.log(`Token B Balance: ${formatUnits(balanceB, 18)}`);

    if (balanceA < LIQUIDITY_AMOUNT || balanceB < LIQUIDITY_AMOUNT) {
      throw new Error("Insufficient token balance to add liquidity.");
    }
    console.log(`${GREEN}Balances are sufficient.${RESET}`);

    // STEP 2: Get current nonce and prepare 3 transactions
    console.log(`\n${YELLOW}--- Step 2: Sending 3 transactions simultaneously ---${RESET}`);
    let nonce = await provider.getTransactionCount(userWallet.address);
    console.log(`Starting nonce for the batch: ${nonce}`);

    const allowanceA = await tokenAContract.allowance(userWallet.address, routerAddress);
    const allowanceB = await tokenBContract.allowance(userWallet.address, routerAddress);
    console.log(`${GREEN}Allowance A: ${RESET} ${formatEther(allowanceA)}`);
    console.log(`${GREEN}Allowance B: ${RESET} ${formatEther(allowanceB)}`);
    console.log(`${GREEN}Router -> factory(): ${RESET} ${await routerContract.factory()}`);

    // const approveA = await tokenAContract.approve(routerAddress, APPROVE_AMOUNT, { nonce: nonce });
    // console.log(`  - Approve A Hash:  ${BLUE}${approveA.hash}${RESET}`);
    // const approveB = await tokenBContract.approve(routerAddress, APPROVE_AMOUNT, { nonce: nonce + 1 });
    // console.log(`  - Approve B Hash:  ${BLUE}${approveB.hash}${RESET}`);

    // const createPair = await factoryContract.createPair(
    //   tokenAAddress,
    //   tokenBAddress,
    //   { nonce: nonce + 2 }
    // );
    // console.log(`  - Create Pair Hash:  ${BLUE}${createPair.hash}${RESET}`);

    const addLiquidity = await routerContract.addLiquidity(
      tokenAAddress,
      tokenBAddress,
      LIQUIDITY_AMOUNT,
      LIQUIDITY_AMOUNT,
      0, 0, // amount min
      userWallet.address,
      DEADLINE,
      { nonce: nonce, gasLimit: 60000000 }  // , gasPrice: 10000000000
    );
    console.log(`  - Add Liquidity Hash:  ${BLUE}${addLiquidity.hash}${RESET}`);

    // STEP 3: Wait for all transactions to be confirmed
    console.log(`\n${YELLOW}--- Step 3: Waiting for confirmations ---${RESET}`);
    // const approveAReceipt = await approveA.wait()
    // const approveBReceipt = await approveB.wait()
    // const createPairReceipt = await createPair.wait()
    const addLiquidityReceipt = await addLiquidity.wait()

    // STEP 4: Analyze results
    console.log(`\n${YELLOW}--- Step 4: Final Results ---${RESET}`);
    // console.log(`Approve A Status:  ${approveAReceipt.status === 1 ? GREEN + 'SUCCESS' : RED + 'FAILED'}${RESET}`);
    // console.log(`Approve B Status:  ${approveBReceipt.status === 1 ? GREEN + 'SUCCESS' : RED + 'FAILED'}${RESET}`);
    // console.log(`Create Pair Status:  ${createPairReceipt.status === 1 ? GREEN + 'SUCCESS' : RED + 'FAILED'}${RESET}`);
    console.log(`Add Liquidity Status:  ${addLiquidityReceipt.status === 1 ? GREEN + 'SUCCESS' : RED + 'FAILED'}${RESET}`);

    if (addLiquidityReceipt.status === 0) {
      console.log(`\n${RED}Conclusion: The addLiquidity transaction failed on-chain even when sent in a batch. The issue remains within the token or router contract's internal logic.${RESET}`);
    } else {
      console.log(`\n${GREEN}Conclusion: All transactions succeeded! The parallel execution might have worked.${RESET}`);
    }

  } catch (error) {
    console.error(`\n${RED}--- An error occurred during the process ---${RESET}`);
    console.error(error);
    process.exit(1);
  }
}

main();