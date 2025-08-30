import { Wallet, JsonRpcProvider, Contract, ContractFactory, formatUnits, parseUnits } from "ethers";
import fs from "fs";
import path from "path";
import { loadContract } from './utils.js';

// --- Configuration ---
const RPC_URL = "http://127.0.0.1:8545";
const WALLETS_FILE_PATH = path.join("keys", "wallets.json");
const TOKENS_FILE_PATH = path.join("keys", "tokens.json");

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

  // 1. Load necessary accounts and ABIs
  console.log("Loading user wallet, tokens, and contract artifacts...");
  const userWalletsInfo = JSON.parse(fs.readFileSync(WALLETS_FILE_PATH, "utf8"));
  const tokenAddresses = JSON.parse(fs.readFileSync(TOKENS_FILE_PATH, "utf8"));

  // Using user[0] as the deployer and tester for this isolated test
  const userWallet = new Wallet(userWalletsInfo[10].privateKey, provider);
  const tokenAAddress = tokenAddresses[20];
  const tokenBAddress = tokenAddresses[21];

  const { abi: tokenAbi } = loadContract('musdc');
  const { abi: factoryAbi, bytecode: factoryBytecode } = loadContract('univ2-factory');
  const { abi: routerAbi, bytecode: routerBytecode } = loadContract('univ2-router'); // This will load your MODIFIED router bytecode

  console.log(`\n${BLUE}--- Test Setup ---${RESET}`);
  console.log(`Test Wallet (user[0]): ${userWallet.address}`);
  console.log(`Token A:               ${tokenAAddress}`);
  console.log(`Token B:               ${tokenBAddress}`);
  
  try {
    // --- Step 1: Deploy a fresh Factory and the modified Router ---
    console.log(`\n${YELLOW}--- Step 1: Deploying new Factory and modified Router ---${RESET}`);
    
    // Deploy Factory
    const FactoryFactory = new ContractFactory(factoryAbi, factoryBytecode, userWallet);
    const factoryContract = await FactoryFactory.deploy(userWallet.address);
    await factoryContract.deploymentTransaction().wait();
    const newFactoryAddress = await factoryContract.getAddress();
    console.log(`New Factory deployed at: ${BLUE}${newFactoryAddress}${RESET}`);

    // Deploy modified Router
    const RouterFactory = new ContractFactory(routerAbi, routerBytecode, userWallet);
    // The router constructor needs a WETH address, we'll use tokenA as a substitute.
    const routerContract = await RouterFactory.deploy(newFactoryAddress, tokenAAddress);
    await routerContract.deploymentTransaction().wait();
    const newRouterAddress = await routerContract.getAddress();
    console.log(`Modified Router deployed at: ${BLUE}${newRouterAddress}${RESET}`);

    // --- Step 2: Approve the newly deployed Router ---
    console.log(`\n${YELLOW}--- Step 2: Approving the new Router ---${RESET}`);
    const tokenAContract = new Contract(tokenAAddress, tokenAbi, userWallet);
    const tokenBContract = new Contract(tokenBAddress, tokenAbi, userWallet);

    const approveATx = await tokenAContract.approve(newRouterAddress, APPROVE_AMOUNT);
    await approveATx.wait();
    console.log(`Approved Token A for new Router. Tx: ${approveATx.hash}`);
    
    const approveBTx = await tokenBContract.approve(newRouterAddress, APPROVE_AMOUNT);
    await approveBTx.wait();
    console.log(`Approved Token B for new Router. Tx: ${approveBTx.hash}`);
    console.log(`${GREEN}Approvals successful.${RESET}`);

    // --- Step 3: Call the modified addLiquidity function ---
    console.log(`\n${YELLOW}--- Step 3: Calling the modified addLiquidity function ---${RESET}`);
    const newRouterInstance = new Contract(newRouterAddress, routerAbi, userWallet);
    
    const addLiquidityTx = await newRouterInstance.addLiquidity(
      tokenAAddress,
      tokenBAddress,
      LIQUIDITY_AMOUNT,
      LIQUIDITY_AMOUNT,
      0, 0, // amount min
      userWallet.address,
      DEADLINE,
      { gasLimit: 3000000 } // Keep a gas limit just in case, but it shouldn't be needed if the loop is gone
    );
    console.log(`addLiquidity transaction sent! Hash: ${BLUE}${addLiquidityTx.hash}${RESET}`);
    console.log("Waiting for confirmation...");
    const receipt = await addLiquidityTx.wait();

    // --- Step 4: Analyze the result ---
    console.log(`\n${YELLOW}--- Step 4: Final Result ---${RESET}`);
    if (receipt.status === 1) {
      console.log(`${GREEN}✅✅✅ SUCCESS! ✅✅✅${RESET}`);
    } else {
      console.log(`${RED}❌❌❌ FAILURE! ❌❌❌${RESET}`);
    }

  } catch (error) {
    console.error(`\n${RED}--- An error occurred during the process ---${RESET}`);
    console.error(error);
    process.exit(1);
  }
}

main();