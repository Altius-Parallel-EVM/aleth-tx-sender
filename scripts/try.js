const { JsonRpcProvider, parseEther, Wallet, formatEther } = require("ethers");
const fs = require("fs");
const path = require("path");

// Function to load accounts from the specified JSON file
function loadAccounts() {
  try {
    const filePath = path.join(__dirname, '..', 'keys', 'eth_accounts.json');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error("Error reading or parsing the accounts file:", error.message);
    console.error("Please make sure 'keys/eth_accounts.json' exists and is a valid JSON file.");
    process.exit(1);
  }
}

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

  console.log("\n--- Starting Transactions ---");

  // Start monitoring RECIPIENT balance every second
  console.log(`\n--- Starting RECIPIENT balance monitoring (every 1 second) ---`);
  const balanceInterval = setInterval(async () => {
    await checkRecipientBalance(provider);
  }, 1000);

  // Initial balance check
  console.log("Initial RECIPIENT balance:");
  await checkRecipientBalance(provider);

  for (const account of accountsToUse) {
    const wallet = new Wallet(account.privateKey, provider);

    console.log(`\nProcessing account: ${account.address}`);
    const tx = {
      to: RECIPIENT,
      value: parseEther(TRANSFER_AMOUNT)
    };

    console.log(`Sending ${TRANSFER_AMOUNT} ETH from ${account.address} to ${RECIPIENT}...`);
    const txResponse = await wallet.sendTransaction(tx);
    console.log(`Transaction sent. Hash: ${txResponse.hash}`);

    await txResponse.wait();
    console.log(`Transaction confirmed for ${account.address}.`);
  }

  console.log("\n--- All transactions confirmed. Checking final balances... ---");

  for (const account of accountsToUse) {
    const address = account.address;
    const balance = await provider.getBalance(address);
    const formattedBalance = formatEther(balance);
    console.log(`Final balance of ${address}: ${formattedBalance} ETH`);
  }

  // Final RECIPIENT balance check
  console.log("\nFinal RECIPIENT balance:");
  await checkRecipientBalance(provider);

  // Stop the balance monitoring
  clearInterval(balanceInterval);
  console.log("\n--- RECIPIENT balance monitoring stopped ---");
}

main().catch((error) => {
  console.error("Error in main:", error);
  process.exit(1);
});