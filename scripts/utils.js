import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

// Helper function to pause execution
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Load origin accounts from the specified JSON file
 * @returns {Array<{address: string, privateKey: string}>} An array of origin accounts
 */
export function loadOriginAccounts() {
  try {
    const filePath = path.join(path.dirname(
      fileURLToPath(import.meta.url)
    ), '..', 'keys', 'eth_accounts.json');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent).accounts;
  } catch (error) {
    console.error("Error reading or parsing the accounts file:", error.message);
    console.error("Please make sure 'keys/eth_accounts.json' exists and is a valid JSON file.");
    process.exit(1);
  }
}

// A new function to wait for the next block to be mined
export async function waitForNextBlock(provider, initialBlockNumber) {
  console.log(`   Waiting for next block (current is ${initialBlockNumber})...`);
  let currentBlockNumber = initialBlockNumber;
  while (currentBlockNumber <= initialBlockNumber) {
    await sleep(1000); // Poll every 1 second
    currentBlockNumber = await provider.getBlockNumber();
  }
  console.log(`   New block mined: ${currentBlockNumber}.`);
}

/**
 * Load the contract's ABI and bytecode from the specified file
 * @param {string} name 
 * @returns {abi: string, bytecode: string}
 */
export function loadContract(name) {
  try {
    const filePath = path.join(path.dirname(
      fileURLToPath(import.meta.url)), '..', 'data', `${name}.json`
    );
    const abiAndBytecode = fs.readFileSync(filePath, 'utf8').trim();
    return JSON.parse(abiAndBytecode);
  } catch (error) {
    console.error(`Error reading bytecode for ${name}:`, error.message);
    process.exit(1);
  }
}
