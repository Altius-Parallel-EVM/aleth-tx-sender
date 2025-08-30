import { Wallet, JsonRpcProvider, ContractFactory, formatEther } from "ethers";
import fs from "fs";
import path from "path";
import { loadContract, loadOriginAccounts } from './utils.js';

// --- Configuration ---
const RPC_URL = "http://127.0.0.1:8545";
const UNISWAP_FILE_PATH = path.join("keys", "uniswap.json");

const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

/**
 * Saves the deployed Uniswap contract addresses to a JSON file.
 * @param {{factory: string, router: string}} addresses - The contract addresses to save.
 */
function saveUniswapAddressesToFile(addresses) {
  const directory = path.dirname(UNISWAP_FILE_PATH);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(UNISWAP_FILE_PATH, JSON.stringify(addresses, null, 2));
  console.log(`\n${GREEN}Successfully saved Uniswap addresses to ${BLUE}${UNISWAP_FILE_PATH}${RESET}`);
}

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  console.log("Connecting to local node...");

  const deployerAccount = loadOriginAccounts()[0];
  const deployerWallet = new Wallet(deployerAccount.privateKey, provider);
  console.log(`Deployer wallet address: ${BLUE}${deployerWallet.address}${RESET}`);

  const deployerBalance = await provider.getBalance(deployerWallet.address);
  console.log(`Deployer balance: ${GREEN}${formatEther(deployerBalance)} ETH${RESET}`);

  // 1. Load WETH address from previously deployed tokens
  const WETH_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  console.log(`\nUsing token ${BLUE}${WETH_ADDRESS}${RESET} as the WETH address for the Router.`);

  // 2. Deploy Uniswap V2 Factory
  console.log("\n--- Deploying Uniswap V2 Factory ---");
  const { abi: factoryAbi, bytecode: factoryBytecode } = loadContract('univ2-factory');
  const Factory = new ContractFactory(factoryAbi, factoryBytecode, deployerWallet);

  console.log("Sending deployment transaction for Factory...");
  const factoryContract = await Factory.deploy(deployerWallet.address);
  await factoryContract.deploymentTransaction().wait();
  const factoryAddress = await factoryContract.getAddress();
  console.log(`${GREEN}Uniswap V2 Factory deployed successfully at: ${BLUE}${factoryAddress}${RESET}`);

  // 3. Deploy Uniswap V2 Router
  console.log("\n--- Deploying Uniswap V2 Router ---");
  const { abi: routerAbi, bytecode: routerBytecode } = loadContract('univ2-router');
  const Router = new ContractFactory(routerAbi, routerBytecode, deployerWallet);

  console.log("Sending deployment transaction for Router...");
  const routerContract = await Router.deploy(factoryAddress, WETH_ADDRESS);
  await routerContract.deploymentTransaction().wait();
  const routerAddress = await routerContract.getAddress();
  console.log(`${GREEN}Uniswap V2 Router deployed successfully at: ${BLUE}${routerAddress}${RESET}`);

  // 4. Save deployed addresses to file
  const deployedAddresses = {
    factory: factoryAddress,
    router: routerAddress,
  };
  saveUniswapAddressesToFile(deployedAddresses);

  const finalDeployerBalance = await provider.getBalance(deployerWallet.address);
  console.log(`\nFinal deployer balance: ${GREEN}${formatEther(finalDeployerBalance)} ETH${RESET}`);

  console.log("\n--- Uniswap V2 deployment complete! ---");
}

main().catch((error) => {
  console.error("Error in main function:", error);
  process.exit(1);
});