import { JsonRpcProvider, parseEther, Wallet, formatEther } from "ethers";
import { loadAccounts, waitForNextBlock, sleep } from './utils.js';
import { JsonRpcApiProvider } from "ethers";

const RPC_URL = "http://localhost:8545";
const TRANSFER_AMOUNT = "0.01";

// Function to check 
async function main() {
  const accountsData = loadAccounts();
  const provider = new JsonRpcProvider(RPC_URL);
  console.log("Connecting to local node...");

  let ownerAddress = accountsData.accounts[0].address;

  console.log(await provider.getTransactionCount(ownerAddress))
  console.log(await provider.getTransaction("0x80638d95470fb2fa52ddee40b338aa04de3f41299029b99aac0cc45f8585a1ed"))
  console.log(await provider.getBlock(2601n, true))
}

main().catch((error) => {
  console.error("Error in main:", error);
  process.exit(1);
});
