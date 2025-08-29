import { JsonRpcProvider, parseEther, Wallet, formatEther } from "ethers";
import { loadAccounts, waitForNextBlock, sleep } from './utils.js';

const RPC_URL = "http://localhost:8545";
const TRANSFER_AMOUNT = "0.01";
const RECIPIENT = "0x0000000000000000000000000000000000000055";

// Function to check RECIPIENT balance
async function checkRecipientBalance(provider) {
  try {
    const balance = await provider.getBalance(RECIPIENT);
    const formattedBalance = formatEther(balance);
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] RECIPIENT (${RECIPIENT}) balance: ${formattedBalance} ETH`);
    return balance;
  } catch (error) {
    console.error(`Error checking RECIPIENT balance: ${error.message}`);
  }
}

async function main() {
  const accountsData = loadAccounts();
  const provider = new JsonRpcProvider(RPC_URL);
  console.log("Connecting to local node...");

  const accountsToUse = accountsData.accounts.slice(0, 3);

  // Initial balance check
  console.log("Initial RECIPIENT balance:");
  await checkRecipientBalance(provider);

  console.log("\n--- Starting Transactions ---");
  for (const account of accountsToUse) {
    const wallet = new Wallet(account.privateKey, provider);
    
    console.log(`\nProcessing account: ${account.address}`);

    const initialBlock = await provider.getBlockNumber();

    const tx = {
      to: RECIPIENT,
      value: parseEther(TRANSFER_AMOUNT)
    };

    console.log(`Sending ${TRANSFER_AMOUNT} ETH from ${account.address} to ${RECIPIENT}...`);
    const txResponse = await wallet.sendTransaction(tx);
    console.log(`Transaction sent. Hash: ${txResponse.hash}`);

    await waitForNextBlock(provider, initialBlock);
    
    const receipt = await provider.getTransactionReceipt(txResponse.hash);
    if (receipt && receipt.status === 1) {
        console.log(`   Transaction confirmed successfully in block ${receipt.blockNumber}.`);
    } else {
        console.log(`   Transaction may have failed or is not yet confirmed.`);
    }
  }

  console.log("\n--- All transactions sent. Checking final balances... ---");

  for (const account of accountsToUse) {
    const address = account.address;
    const balance = await provider.getBalance(address);
    const formattedBalance = formatEther(balance);
    console.log(`Final balance of ${address}: ${formattedBalance} ETH`);
  }

  // Stop the balance monitoring
  clearInterval(balanceInterval);
  console.log("\n--- RECIPIENT balance monitoring stopped ---");

  // Final RECIPIENT balance check
  console.log("\nFinal RECIPIENT balance:");
  await checkRecipientBalance(provider);
}

main().catch((error) => {
  console.error("Error in main:", error);
  process.exit(1);
});
