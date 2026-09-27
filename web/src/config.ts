import { defineChain, isAddress, keccak256, stringToHex, type Abi, type Address } from 'viem';
import { canonical } from './canonical.mjs';
export type Deployment = {
  version: number; launchId: string; chainId: number; sourceCommit: string; attestationHash: string;
  contracts: { name: string; address: Address; abiHash: string; abiPath: string }[];
  assets: { path: string; sha256: string }[];
  network: { chainId: number; name: string; testnet: boolean; rpcUrls: string[]; explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number }; faucets: string[]; uniswapV4: Record<string, Address> };
  walletAddChain: { chainId: string; chainName: string; rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls: string[] };
};
export type BoundContract = { address: Address; abi: Abi; name: string };
const safePath = (value: string) => /^[a-zA-Z0-9_./-]+$/.test(value) && !value.startsWith('/') && !value.split('/').includes('..');
export async function loadConfig() {
  const base = new URL('./', window.location.href);
  const response = await fetch(new URL('imd-deployment.json', base), { cache: 'no-store' });
  if (!response.ok) throw Error('Deployment configuration unavailable. Reload to retry.');
  const deployment: Deployment = await response.json();
  const { network, walletAddChain } = deployment;
  if (deployment.version !== 1 || deployment.chainId !== network.chainId || !network.testnet ||
    Number(walletAddChain.chainId) !== deployment.chainId || network.rpcUrls.length === 0 ||
    JSON.stringify(walletAddChain.rpcUrls) !== JSON.stringify(network.rpcUrls) ||
    walletAddChain.chainName !== network.name || walletAddChain.blockExplorerUrls[0] !== network.explorer ||
    canonical(walletAddChain.nativeCurrency) !== canonical(network.nativeCurrency)) throw Error('Deployment network configuration is inconsistent.');
  const contracts = await Promise.all(deployment.contracts.map(async item => {
    if (!isAddress(item.address) || !safePath(item.abiPath)) throw Error('Invalid deployment contract.');
    const result = await fetch(new URL(item.abiPath, base));
    if (!result.ok) throw Error(`Unable to load ${item.name} ABI. Reload to retry.`);
    const abi: Abi = await result.json();
    if (!Array.isArray(abi) || keccak256(stringToHex(canonical(abi))).slice(2) !== item.abiHash) throw Error(`${item.name} ABI hash verification failed.`);
    return { name: item.name, address: item.address, abi };
  }));
  if (contracts.length !== 2 || new Set(contracts.map(c => c.name)).size !== 2) throw Error('Unexpected deployment contract set.');
  const clock = contracts.find(c => c.name === 'DoomsdayClock');
  const token = contracts.find(c => c.name === 'LaunchToken');
  if (!clock || !token) throw Error('Required contracts missing.');
  const chain = defineChain({ id: deployment.chainId, name: network.name, testnet: network.testnet,
    nativeCurrency: network.nativeCurrency, rpcUrls: { default: { http: network.rpcUrls } },
    blockExplorers: { default: { name: 'Explorer', url: network.explorer } } });
  return { deployment, chain, clock, token };
}
export type Config = Awaited<ReturnType<typeof loadConfig>>;
