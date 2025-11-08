import { Wallet, JsonRpcProvider, Contract, parseUnits } from "ethers";
import fs from "fs";
import path from "path";
import { loadContract } from './utils.js';

const RPC_URL = "http://127.0.0.1:8545";
const WALLETS_FILE_PATH = path.join("keys", "wallets.json");
const TOKENS_FILE_PATH = path.join("keys", "tokens.json");

const AMOUNT_TO_TRANSFER = parseUnits("1", 6);

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
  
  const TRANSFER_COUNT = wallets.length;
  console.log(`Found ${GREEN}${TRANSFER_COUNT}${RESET} wallets and ${GREEN}${tokenAddresses.length}${RESET} token contracts.`);

  if (tokenAddresses.length < TRANSFER_COUNT) {
    console.error(`\nError: Not enough token contracts. Found ${tokenAddresses.length}, but need ${TRANSFER_COUNT}.`);
    process.exit(1);
  }

  // 3. Prepare and send all transfer transactions in parallel
  console.log(`\nPreparing ${TRANSFER_COUNT} ERC20 transfer transactions...`);
  console.log(`Pattern: Wallet[i] transfers Token[i] to Wallet[(i + 1) % ${TRANSFER_COUNT}]`);

  const transactionPromises = wallets.map(async (senderInfo, index) => {
    try {
      const senderWallet = new Wallet(senderInfo.privateKey, provider);
      const receiverInfo = wallets[(index + 1) % TRANSFER_COUNT];
      const tokenContract = new Contract(tokenAddresses[index], abi, provider);
      
      const nonce = await provider.getTransactionCount(senderWallet.address);
      return tokenContract.connect(senderWallet).transfer(
        receiverInfo.address, AMOUNT_TO_TRANSFER, { nonce }
      );
    } catch (err) {
      console.error(`Error preparing transfer tx for wallet ${index}:`, err.message);
      return null;
    }
  });

  const validPromises = (await Promise.all(transactionPromises)).filter(p => p);
  console.log(`Sending ${validPromises.length} valid transfer transactions...`);

  const txResponses = await Promise.all(validPromises);
  console.log(`${GREEN}${txResponses.length} transfer transactions sent successfully.${RESET}`);

  console.log("\nWaiting for all transfer transactions to be confirmed...");
  const receiptPromises = txResponses.map(tx => tx.wait());
  const receipts = await Promise.all(receiptPromises);
  console.log(`${GREEN}All ${receipts.length} transfer transactions have been confirmed.${RESET}`);
  
  console.log("\n--- ERC20 transfer dataset generation complete! ---");
}

main().catch((error) => {
  console.error("Error in main function:", error);
  process.exit(1);
});