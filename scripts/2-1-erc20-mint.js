import { Wallet, JsonRpcProvider, Contract } from "ethers";
import fs from "fs";
import path from "path";
import { loadContract } from './utils.js';

const RPC_URL = "http://127.0.0.1:8545";
const WALLETS_FILE_PATH = path.join("keys", "wallets.json");
const TOKENS_FILE_PATH = path.join("keys", "tokens.json");

const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  console.log("Connecting to local node...");

  // 1. Load ABI
  console.log("\nLoading contract artifacts for 'musdc'...");
  const { abi } = loadContract('musdc');
  console.log(`${GREEN}Contract ABI loaded.${RESET}`);

  // 2. Load wallets and token addresses
  console.log(`Loading wallets from ${BLUE}${WALLETS_FILE_PATH}${RESET}...`);
  const wallets = JSON.parse(fs.readFileSync(WALLETS_FILE_PATH, "utf8"));
  console.log(`Loading tokens from ${BLUE}${TOKENS_FILE_PATH}${RESET}...`);
  const tokenAddresses = JSON.parse(fs.readFileSync(TOKENS_FILE_PATH, "utf8"));

  const MINT_COUNT = wallets.length;
  console.log(`Found ${GREEN}${MINT_COUNT}${RESET} wallets and ${GREEN}${tokenAddresses.length}${RESET} token contracts.`);

  if (tokenAddresses.length < MINT_COUNT) {
    console.error(`\nError: Not enough token contracts. Found ${tokenAddresses.length}, but need ${MINT_COUNT}.`);
    process.exit(1);
  }

  // 3. Prepare and send all mint transactions in parallel
  console.log(`\nPreparing ${MINT_COUNT} mint transactions (Wallet[i] mints Token[i])...`);

  const transactionPromises = wallets.map(async (walletInfo, index) => {
    try {
      const userWallet = new Wallet(walletInfo.privateKey, provider);
      const tokenContract = new Contract(tokenAddresses[index], abi, provider);
      
      const nonce = await provider.getTransactionCount(userWallet.address);
      return tokenContract.connect(userWallet).mint({ nonce });
    } catch (err) {
      console.error(`Error preparing mint tx for wallet ${index}:`, err.message);
      return null;
    }
  });

  const validPromises = (await Promise.all(transactionPromises)).filter(p => p);
  console.log(`Sending ${validPromises.length} valid mint transactions...`);

  const txResponses = await Promise.all(validPromises);
  console.log(`${GREEN}${txResponses.length} mint transactions sent successfully.${RESET}`);

  console.log("\nWaiting for all mint transactions to be confirmed...");
  const receiptPromises = txResponses.map(tx => tx.wait());
  const receipts = await Promise.all(receiptPromises);
  console.log(`${GREEN}All ${receipts.length} mint transactions have been confirmed.${RESET}`);

  console.log("\n--- ERC20 minting complete! ---");
}

main().catch((error) => {
  console.error("Error in main function:", error);
  process.exit(1);
});