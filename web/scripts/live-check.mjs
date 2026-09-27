import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { encodeFunctionData, decodeFunctionResult, keccak256 } from 'viem';
const root = fileURLToPath(new URL('../../', import.meta.url));
const config = JSON.parse(await readFile(root + 'dist/imd-deployment.json'));
const exec = promisify(execFile);
async function rpc(url, method, params) {
  const { stdout } = await exec('curl', ['--fail', '--silent', '--show-error', '--max-time', '20', '-H', 'Content-Type: application/json', '--data', JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), url]);
  const json = JSON.parse(stdout); if (json.error) throw Error(JSON.stringify(json.error)); return json.result;
}
const evidence = { checkedAt: new Date().toISOString(), sourceCommit: config.sourceCommit, readOnly: true, endpoints: [] };
for (const url of config.network.rpcUrls) {
  try {
    const chainId = Number(await rpc(url, 'eth_chainId', []));
    if (chainId !== config.chainId) throw Error('Wrong chain');
    const block = await rpc(url, 'eth_blockNumber', []);
    const contracts = await Promise.all(config.contracts.map(async c => {
      const code = await rpc(url, 'eth_getCode', [c.address, block]);
      if (!code || code === '0x') throw Error('Empty contract code');
      return { name: c.name, address: c.address, codeBytes: (code.length - 2) / 2, runtimeKeccak: keccak256(code) };
    }));
    const clock = config.contracts.find(c => c.name === 'DoomsdayClock');
    const abi = JSON.parse(await readFile(root + 'dist/' + clock.abiPath));
    const state = {};
    for (const functionName of ['token', 'round', 'end', 'pot', 'carry', 'lastBuyer']) {
      const result = await rpc(url, 'eth_call', [{ to: clock.address, data: encodeFunctionData({ abi, functionName }) }, block]);
      state[functionName] = String(decodeFunctionResult({ abi, functionName, data: result }));
    }
    if (state.token.toLowerCase() !== config.contracts.find(c => c.name === 'LaunchToken').address.toLowerCase()) throw Error('Token binding mismatch');
    evidence.endpoints.push({ url, ok: true, chainId, blockNumber: Number(block), blockTag: block, contracts, state });
  } catch (error) { evidence.endpoints.push({ url, ok: false, error: error.message }); }
}
await writeFile(root + 'docs/evidence/live-reads.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
if (!evidence.endpoints.some(endpoint => endpoint.ok)) process.exitCode = 1;
