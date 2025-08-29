import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

// Helper to get __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to pause execution
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to load accounts from the specified JSON file
export function loadAccounts() {
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

// Load bytecode from the specified file
export function loadBytecode(name) {
  try {
    const filePath = path.join(__dirname, '..', 'data', `${name}.bytecode`);
    const bytecode = fs.readFileSync(filePath, 'utf8').trim();
    return bytecode;
  } catch (error) {
    console.error(`Error reading bytecode for ${name}:`, error.message);
    process.exit(1);
  }
}
