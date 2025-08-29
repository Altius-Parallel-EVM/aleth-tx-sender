import { Wallet, JsonRpcProvider, ContractFactory, formatEther } from "ethers";
import fs from "fs";
import path from "path";
// Assuming you have utility functions that can load your contract's ABI/bytecode and origin accounts
import { loadContract, loadOriginAccounts } from './utils.js'; 
import { exit } from "process";

// --- Configuration ---
const RPC_URL = "http://127.0.0.1:8545";
const DEPLOY_COUNT = 2000;
const TOKENS_FILE_PATH = path.join("keys", "tokens1.json");

const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

/**
 * Saves the deployed token addresses to a JSON file.
 * @param {string[]} addresses - The contract addresses to save.
 */
function saveTokenAddressesToFile(addresses) {
  const directory = path.dirname(TOKENS_FILE_PATH);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(TOKENS_FILE_PATH, JSON.stringify(addresses, null, 2));
  console.log(`\n${GREEN}Successfully saved ${addresses.length} token addresses to ${BLUE}${TOKENS_FILE_PATH}${RESET}`);
}

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  console.log("Connecting to local node...");

  const deployerAccount = loadOriginAccounts()[0];
  const deployerWallet = new Wallet(deployerAccount.privateKey, provider);
  console.log(`Deployer wallet address: ${BLUE}${deployerWallet.address}${RESET}`);

  const deployerBalance = await provider.getBalance(deployerWallet.address);
  console.log(`Deployer balance: ${GREEN}${formatEther(deployerBalance)} ETH${RESET}`);

  // A basic check for funds. This is just an estimate.
  if (deployerBalance < 10n * 10n**18n) { // Check for at least 10 ETH
      console.warn(`\nWarning: Deployer wallet balance is low. Deployment might fail due to insufficient gas.`);
  }

  // 1. Load contract artifacts
  console.log("\nLoading contract artifacts for 'musdc'...");
  const { abi, bytecode } = loadContract('musdc');

  const factory = new ContractFactory(abi, bytecode, deployerWallet);
  console.log(`${GREEN}Contract factory created.${RESET}`);

  // 2. Deploy all contracts in parallel with manual nonce management
  console.log(`\nPreparing to deploy ${DEPLOY_COUNT} token contracts...`);

  const startingNonce = await provider.getTransactionCount(deployerWallet.address);
  console.log(`Starting nonce: ${BLUE}${startingNonce}${RESET}`);

  const deploymentPromises = [];
  for (let i = 0; i < DEPLOY_COUNT; i++) {
    const tx = {
      nonce: startingNonce + i,
    };
    deploymentPromises.push(factory.deploy(tx));
  }

  console.log("Sending all deployment transactions...");
  const deploymentResponses = await Promise.all(deploymentPromises);
  console.log(`${GREEN}${deploymentResponses.length} deployment transactions sent successfully.${RESET}`);

  console.log("\nWaiting for all deployment transactions to be confirmed...");
  const receiptPromises = deploymentResponses.map(response => response.deploymentTransaction().wait());
  const receipts = await Promise.all(receiptPromises);
  console.log(`${GREEN}All ${receipts.length} deployments have been confirmed.${RESET}`);
  
  // 3. Extract addresses and save to file
  const deployedAddresses = receipts.map(receipt => receipt.contractAddress);
  saveTokenAddressesToFile(deployedAddresses);
  
  const finalDeployerBalance = await provider.getBalance(deployerWallet.address);
  console.log(`\nFinal deployer balance: ${GREEN}${formatEther(finalDeployerBalance)} ETH${RESET}`);

  console.log("\n--- Contract deployments complete! ---");
}

main().catch((error) => {
  console.error("Error in main function:", error);
  process.exit(1);
});

