const { JsonRpcProvider, formatUnits } = require("ethers")
const RPC_URL = "http://127.0.0.1:8545";
const provider = new JsonRpcProvider(RPC_URL);

const interval = setInterval(async () => {
  const height = await provider.getBlockNumber();
  const block = await provider.getBlock(height);
  const used = block.gasUsed * 10000n / block.gasLimit;
  console.log(`Current height: ${height}, block gas used: ${formatUnits(used, 2)}%`)
}, 5000);
