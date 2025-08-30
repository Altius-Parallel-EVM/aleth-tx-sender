import { keccak256 } from "ethers";
import fs from "fs";
import path from "path";

// IMPORTANT: Make sure this path points to your *COMPILED*, *MODIFIED* UniswapV2Pair artifact.
// The path might be different depending on your compilation setup (e.g., Hardhat, Foundry, Truffle).
// This example assumes a structure like `artifacts/contracts/UniswapV2Pair.sol/UniswapV2Pair.json`.
// Please UPDATE THE PATH below to match your project structure.
const PAIR_ARTIFACT_PATH = path.join("data", "univ2-pair.json"); // <--- UPDATE THIS PATH IF NEEDED

function getInitCodeHash() {
  console.log(`Reading compiled bytecode from: ${PAIR_ARTIFACT_PATH}`);

  if (!fs.existsSync(PAIR_ARTIFACT_PATH)) {
    console.error(`\nError: Artifact file not found at "${PAIR_ARTIFACT_PATH}".`);
    console.error("Please compile your contracts and ensure the path is correct.");
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(PAIR_ARTIFACT_PATH, "utf8"));
  const bytecode = artifact.bytecode;

  if (!bytecode || bytecode === "0x") {
    console.error("\nError: Bytecode in artifact is empty. Please check your compilation.");
    process.exit(1);
  }

  const initCodeHash = keccak256(bytecode);

  console.log("\n-------------------------------------------------");
  console.log(`✅ Your new init code hash is:`);
  console.log(`${initCodeHash}`);
  console.log("-------------------------------------------------");
  console.log("\nNext steps:");
  console.log("1. Copy this hash.");
  console.log("2. Open your 'UniswapV2Library.sol' file.");
  console.log(`3. Replace the old hash (96e8ac...) with this new one (don't forget the hex'' prefix).`);
  console.log("4. Recompile your contracts and redeploy everything.");
}

getInitCodeHash();