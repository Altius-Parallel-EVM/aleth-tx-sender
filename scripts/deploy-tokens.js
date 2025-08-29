import { JsonRpcProvider, Wallet, ContractFactory } from "ethers";
// Assuming you've converted utils.js to ESM and added loadBytecode and waitForNextBlock
import { loadOriginAccounts, loadBytecode, waitForNextBlock } from './utils.js';

const RPC_URL = "http://localhost:8545";
const DEPLOY_COUNT = 10;

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  const accountsData = loadOriginAccounts();

  const deployerAccount = accountsData[0];
  const wallet = new Wallet(deployerAccount.privateKey, provider);
  console.log(`Using deployer: ${wallet.address}`);

  const musdcBytecode = loadBytecode('musdc');
  const factory = new ContractFactory([], musdcBytecode, wallet);

  console.log(`\n--- Preparing to deploy ${DEPLOY_COUNT} MUSDC contracts concurrently ---`);

  // Get the initial nonce once before the loop
  let currentNonce = await wallet.getNonce('pending');
  console.log(`Initial nonce: ${currentNonce}`);

  const deploymentPromises = [];

  for (let i = 0; i < DEPLOY_COUNT; i++) {
    console.log(`Sending deployment tx #${i} with nonce ${currentNonce}...`);
    const deployPromise = factory.deploy({ nonce: currentNonce });
    deploymentPromises.push(deployPromise);

    // Manually increment the nonce for the next transaction
    currentNonce++;
  }

  // 1. Await all deployment broadcasts to get the Contract objects
  // At this point, transactions are in the mempool but not yet confirmed.
  console.log(`\n--- All ${deploymentPromises.length} deployment transactions sent to the node. ---`);
  const contracts = await Promise.all(deploymentPromises);

  // 2. Log all transaction hashes
  contracts.forEach((contract, index) => {
    const txHash = contract.deploymentTransaction().hash;
    console.log(`   Tx #${index} Hash: ${txHash}`);
  });

  // 3. Get the current block number and wait for the next one to be mined.
  // This replaces the problematic .wait() method.
  console.log('\n--- Waiting for the next block to confirm transactions... ---');
  const initialBlock = await provider.getBlockNumber();
  await waitForNextBlock(provider, initialBlock);

  // 4. After the next block is mined, fetch all the receipts
  const receiptPromises = contracts.map(contract => {
    return provider.getTransactionReceipt(contract.deploymentTransaction().hash);
  });
  const receipts = await Promise.all(receiptPromises);

  // 5. Log the results from the receipts
  console.log(`\n--- All transactions should now be confirmed. ---`);
  receipts.forEach((receipt, index) => {
    if (receipt && receipt.contractAddress) {
      console.log(`Contract #${index} deployed at address: ${receipt.contractAddress} (in block ${receipt.blockNumber})`);
    } else {
      console.log(`Could not get receipt for Contract #${index}. It may have failed or is still pending.`);
    }
  });

  console.log(`\n--- Successfully processed ${receipts.length} deployments! ---`);
}

main().catch((error) => {
  console.error("An error occurred:", error);
  process.exit(1);
});
