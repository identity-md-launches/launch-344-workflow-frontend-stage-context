import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { keccak256, stringToHex } from 'viem';
import { canonical } from '../src/canonical.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const handoff = JSON.parse(await readFile(root + 'web/deployment.handoff.json', 'utf8'));
const networks = JSON.parse(await readFile(root + 'web/network.json', 'utf8'));
const check = process.argv.includes('--check');
if (handoff.chainId !== networks.network.chainId) throw Error('Network does not match handoff');
const manifest = {
  version: 1, launchId: handoff.launchId, chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit, attestationHash: handoff.attestationHash,
  contracts: [], assets: [], network: networks.network, walletAddChain: networks.walletAddChain,
};
for (const contract of handoff.contracts) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(contract.name)) throw Error('Unsafe contract name');
  const bytes = execFileSync('git', ['show', `${handoff.sourceCommit}:docs/abi/${contract.name}.json`], { cwd: root });
  const abi = JSON.parse(bytes.toString());
  if (!Array.isArray(abi)) throw Error('ABI must be a raw array');
  const hash = keccak256(stringToHex(canonical(abi))).slice(2);
  if (hash !== contract.abiHash) throw Error(`Pinned ABI hash mismatch: ${contract.name}`);
  const abiPath = `abi/${contract.name}.json`;
  manifest.contracts.push({ name: contract.name, address: contract.address, abiHash: hash, abiPath });
  if (!check) { await mkdir(root + 'dist/abi', { recursive: true }); await writeFile(root + 'dist/' + abiPath, bytes); }
  else if (!(await readFile(root + 'dist/' + abiPath)).equals(bytes)) throw Error(`Export differs from pinned ABI: ${abiPath}`);
}
async function inventory(dir, prefix = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isSymbolicLink()) throw Error('Export must not contain symlinks');
    if (entry.isDirectory()) files.push(...await inventory(dir + '/' + entry.name, path + '/'));
    else if (path !== 'imd-deployment.json') files.push(path);
  }
  return files.sort();
}
let total = 0;
for (const path of await inventory(root + 'dist')) {
  const bytes = await readFile(root + 'dist/' + path);
  total += bytes.length;
  if (bytes.length > 8388608) throw Error(`Oversized asset: ${path}`);
  manifest.assets.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') });
}
if (manifest.assets.length > 128 || total > 8 * 1024 * 1024) throw Error('Export exceeds assignment budget');
const output = JSON.stringify(manifest, null, 2) + '\n';
if (check) {
  if ((await readFile(root + 'dist/imd-deployment.json', 'utf8')) !== output) throw Error('Manifest or inventory mismatch');
} else await writeFile(root + 'dist/imd-deployment.json', output);
console.log(`${check ? 'Verified' : 'Generated'} manifest: ${manifest.contracts.length} pinned ABIs, ${manifest.assets.length} assets, ${total} asset bytes.`);
