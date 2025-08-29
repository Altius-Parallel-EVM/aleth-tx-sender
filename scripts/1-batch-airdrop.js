import { Wallet, JsonRpcProvider, parseEther, formatEther } from "ethers";
import { loadOriginAccounts } from "./utils.js";
import fs from "fs";
import path from "path";

// --- Configuration ---
const RPC_URL = "http://127.0.0.1:8545";
const WALLETS_TO_GENERATE = 1000;
const AMOUNT_TO_SEND = "1.0"; // Amount in ETH for each airdrop
const WALLETS_FILE_PATH = path.join("keys", "wallets.json");

const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

/**
 * Generates a specified number of wallets.
 * @param {number} count - The number of wallets to generate.
 * @returns {Array<{address: string, privateKey: string}>} An array of generated wallets.
 */
function generateWallets(count) {
  const wallets = [];
  for (let i = 0; i < count; i++) {
    const wallet = Wallet.createRandom();
    wallets.push({
      address: wallet.address,
      privateKey: wallet.privateKey,
    });
  }
  return wallets;
}

/**
 * Saves the generated wallets to a JSON file.
 * @param {Array<{address: string, privateKey: string}>} wallets - The wallets to save.
 */
function saveWalletsToFile(wallets) {
  const directory = path.dirname(WALLETS_FILE_PATH);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(WALLETS_FILE_PATH, JSON.stringify(wallets, null, 2));
  console.log(`\n${GREEN}Successfully saved ${wallets.length} wallets to ${BLUE}${WALLETS_FILE_PATH}${RESET}`);
}


async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  console.log("Connecting to local node...");

  const funderAccount = loadOriginAccounts()[0];
  const funderWallet = new Wallet(funderAccount.privateKey, provider);
  console.log(`Funder wallet address: ${BLUE}${funderWallet.address}${RESET}`);

  const funderBalance = await provider.getBalance(funderWallet.address);
  console.log(`Funder balance: ${GREEN}${formatEther(funderBalance)} ETH${RESET}`);

  if (funderBalance < parseEther((WALLETS_TO_GENERATE * parseFloat(AMOUNT_TO_SEND)).toString())) {
      console.error(`\nError: Funder wallet has insufficient funds. Please fund the account.`);
      return;
  }
  
  // 1. Generate 1000 wallets
  console.log(`\nGenerating ${WALLETS_TO_GENERATE} new wallets...`);
  const newWallets = generateWallets(WALLETS_TO_GENERATE);
  console.log(`${GREEN}Wallets generated.${RESET}`);

  // 2. Fund all wallets in parallel
  console.log(`\nAirdropping ${AMOUNT_TO_SEND} ETH to each of the ${WALLETS_TO_GENERATE} wallets...`);
  let nonce = await funderWallet.getNonce();
  console.log(`Current nonce: ${nonce}`);
  
  const transactionPromises = newWallets.map(wallet => {
    const tx = {
      to: wallet.address,
      value: parseEther(AMOUNT_TO_SEND),
      nonce,
    };
    nonce++;
    return funderWallet.sendTransaction(tx);
  });

  console.log("Sending all transactions...");
  const txResponses = await Promise.all(transactionPromises);
  console.log(`${GREEN}${txResponses.length} transactions sent successfully.${RESET}`);
  
  console.log("\nWaiting for all transactions to be confirmed...");
  // Now, wait for all transactions to be included in a block
  const receiptPromises = txResponses.map(tx => tx.wait());
  const receipts = await Promise.all(receiptPromises);
  console.log(`${GREEN}All ${receipts.length} transactions have been confirmed.${RESET}`);
  
  // 3. Save wallets to a file
  saveWalletsToFile(newWallets);

  const finalFunderBalance = await provider.getBalance(funderWallet.address);
  console.log(`\nFinal funder balance: ${GREEN}${formatEther(finalFunderBalance)} ETH${RESET}`);

  console.log("\n--- Airdrop complete! ---");
}

main().catch((error) => {
  console.error("Error in main function:", error);
  process.exit(1);
});
