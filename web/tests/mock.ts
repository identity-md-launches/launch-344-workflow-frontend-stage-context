import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { decodeFunctionData, encodeFunctionResult, encodeErrorResult, toHex, zeroAddress } from 'viem';
const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
export const deployment = read('../../dist/imd-deployment.json');
const clock = deployment.contracts.find((c: any) => c.name === 'DoomsdayClock');
const token = deployment.contracts.find((c: any) => c.name === 'LaunchToken');
const clockAbi = read('../../dist/' + clock.abiPath);
const tokenAbi = read('../../dist/' + token.abiPath);
export const account = '0x1234567890123456789012345678901234567890';
export const alternate = '0x9876543210987654321098765432109876543210';
const unit = 10n ** 18n;
const hash = '0x' + 'a'.repeat(64);
const txHash = '0x' + 'b'.repeat(64);
export async function mock(page: Page, options: { wrongChain?: boolean; noWallet?: boolean; expired?: boolean; idle?: boolean; rejectConnect?: boolean; noKeys?: boolean; lowBalance?: boolean } = {}) {
  const state = {
    connected: false, chainId: options.wrongChain ? 1 : deployment.chainId, known: !options.wrongChain, reject: false,
    rejectConnect: !!options.rejectConnect, failRpc: false, missingCode: false, wrongToken: false, simulationRevert: false,
    staleBlock: false, changeAccountOnSimulation: false, account, round: options.idle ? 1n : 2n, end: options.idle ? 0n : BigInt(Math.floor(Date.now() / 1000) + (options.expired ? -10 : 3723)),
    pot: options.idle ? 0n : 125n * unit, keys: options.noKeys ? 0n : 2n,
    balance: options.lowBalance ? 0n : 1000n * unit, allowance: 0n, withdrawable: 4n * unit, claimed: false,
    transactions: [] as any[], calls: [] as string[], simulations: [] as string[], sendsBeforeSimulation: false,
  };
  function info(id: bigint) {
    return id === state.round ? { end: state.end, pot: state.pot, totalKeys: state.end ? 100n : 0n, nextPrice: unit, perKey: 0n, lastBuyer: state.end ? account : zeroAddress, settled: false }
      : { end: 1n, pot: 100n * unit, totalKeys: 10n, nextPrice: unit, perKey: 3n * unit, lastBuyer: account, settled: id > 0n && id < state.round };
  }
  const rpc = async ({ method, params = [] }: { method: string; params?: any[] }, wallet = false) => {
    state.calls.push(method);
    if (state.failRpc && !wallet) throw Error('Mock RPC unavailable');
    const timestamp = BigInt(Math.floor(Date.now() / 1000));
    const block = { number: '0x12345', hash, parentHash: hash, timestamp: toHex(state.staleBlock ? timestamp - 181n : timestamp), nonce: '0x0000000000000000', difficulty: '0x0', totalDifficulty: '0x0', extraData: '0x', size: '0x1', gasLimit: '0x1c9c380', gasUsed: '0x0', miner: zeroAddress, baseFeePerGas: '0x1', transactions: [], uncles: [], logsBloom: '0x' + '0'.repeat(512), mixHash: hash, receiptsRoot: hash, sha3Uncles: hash, stateRoot: hash, transactionsRoot: hash };
    if (method === 'eth_chainId') return toHex(wallet ? state.chainId : deployment.chainId);
    if (method === 'eth_accounts') return state.connected ? [state.account] : [];
    if (method === 'eth_requestAccounts') { if (state.rejectConnect) throw Object.assign(Error('User rejected request'), { code: 4001 }); state.connected = true; return [state.account]; }
    if (method === 'wallet_switchEthereumChain') { if (!state.known) throw Object.assign(Error('Unknown chain'), { code: 4902 }); state.chainId = Number(params[0].chainId); return null; }
    if (method === 'wallet_addEthereumChain') {
      if (JSON.stringify(params[0]) !== JSON.stringify(deployment.walletAddChain)) throw Error('Incorrect wallet_addEthereumChain configuration');
      state.known = true; return null;
    }
    if (method === 'eth_getCode') return state.missingCode ? '0x' : '0x60006000';
    if (method === 'eth_blockNumber') return block.number;
    if (method === 'eth_getBlockByNumber' || method === 'eth_getBlockByHash') return block;
    if (method === 'eth_getTransactionReceipt') return { transactionHash: txHash, transactionIndex: '0x0', blockHash: hash, blockNumber: block.number, from: account, to: clock.address, cumulativeGasUsed: '0x5208', gasUsed: '0x5208', effectiveGasPrice: '0x1', contractAddress: null, logs: [], logsBloom: block.logsBloom, status: '0x1', type: '0x2' };
    if (method === 'eth_getTransactionByHash') return { hash: txHash, blockHash: hash, blockNumber: block.number, from: account, to: clock.address, nonce: '0x0', gas: '0x5208', gasPrice: '0x1', value: '0x0', input: '0x', transactionIndex: '0x0', type: '0x2', chainId: toHex(deployment.chainId), v: '0x1', r: hash, s: hash };
    if (method === 'eth_call' || method === 'eth_sendTransaction') {
      const tx = params[0];
      const abi = tx.to.toLowerCase() === token.address.toLowerCase() ? tokenAbi : clockAbi;
      const { functionName: name, args = [] } = decodeFunctionData({ abi, data: tx.data });
      const writes = ['approve', 'buyKeys', 'settle', 'claimShare', 'withdraw'];
      if (writes.includes(name)) {
        if (method === 'eth_call') {
          state.simulations.push(name);
          if (state.changeAccountOnSimulation) state.account = alternate;
          if (state.simulationRevert) throw Object.assign(Error('Execution reverted'), { data: encodeErrorResult({ abi: clockAbi, errorName: 'CostExceedsMax', args: [3n * unit, unit] }) });
        } else {
          if (state.reject) throw Object.assign(Error('User rejected request'), { code: 4001 });
          if (!state.simulations.includes(name)) state.sendsBeforeSimulation = true;
          state.transactions.push({ name, args, to: tx.to, value: tx.value ?? '0x0' });
          if (name === 'approve') state.allowance = args[1] as bigint;
          if (name === 'buyKeys') { const cost = (args[0] as bigint) * unit; state.balance -= cost; state.allowance -= cost; state.keys += args[0] as bigint; state.pot += cost; }
          if (name === 'claimShare') { state.claimed = true; state.withdrawable += state.keys * 3n * unit; }
          if (name === 'withdraw') { state.balance += state.withdrawable; state.withdrawable = 0n; }
          if (name === 'settle') { state.round++; state.end = 0n; state.pot = 0n; }
          return txHash;
        }
      }
      let result: any;
      if (name === 'token') result = state.wrongToken ? zeroAddress : token.address;
      else if (name === 'round') result = state.round;
      else if (name === 'roundInfo') result = info(args[0] as bigint);
      else if (name === 'carry') result = 25n * unit;
      else if (name === 'priceOfNext') result = (args[0] as bigint) * unit;
      else if (name === 'decimals') result = 18;
      else if (name === 'balanceOf') result = state.balance;
      else if (name === 'allowance') result = state.allowance;
      else if (name === 'withdrawable') result = state.withdrawable;
      else if (name === 'keysOf') result = state.keys;
      else if (name === 'claimed') result = state.claimed;
      else if (name === 'claimable') result = state.claimed ? 0n : state.keys * 3n * unit;
      else if (name === 'approve') result = true;
      else if (name === 'buyKeys') result = (args[0] as bigint) * unit;
      else if (name === 'withdraw') result = state.withdrawable;
      else if (name === 'claimShare') result = state.keys * 3n * unit;
      else if (name === 'settle') result = undefined;
      else throw Error('Unexpected mock function: ' + name);
      return encodeFunctionResult({ abi, functionName: name, result });
    }
    throw Error('Unexpected mock method: ' + method);
  };
  for (const url of deployment.network.rpcUrls) await page.route(url + '/**', async route => {
    const json = route.request().postDataJSON();
    try { await route.fulfill({ json: { jsonrpc: '2.0', id: json.id, result: await rpc(json) } }); }
    catch (e: any) { await route.fulfill({ json: { jsonrpc: '2.0', id: json.id, error: { code: e.data ? 3 : -32000, message: e.message, data: e.data } } }); }
  });
  // Match origins whose fetch requests preserve an empty trailing pathname.
  await page.route(url => deployment.network.rpcUrls.some((base: string) => url.href === base || url.href === base + '/'), async route => {
    const json = route.request().postDataJSON();
    try { await route.fulfill({ json: { jsonrpc: '2.0', id: json.id, result: await rpc(json) } }); }
    catch (e: any) { await route.fulfill({ json: { jsonrpc: '2.0', id: json.id, error: { code: e.data ? 3 : -32000, message: e.message, data: e.data } } }); }
  });
  if (!options.noWallet) {
    await page.exposeFunction('__walletRpc', async (request: any) => {
      try { return { result: await rpc(request, true) }; } catch (e: any) { return { error: { code: e.code, message: e.message } }; }
    });
    await page.addInitScript(() => {
      const listeners: Record<string, Function[]> = {};
      (window as any).__emit = (name: string, value: any) => (listeners[name] ?? []).forEach(fn => fn(value));
      (window as any).ethereum = {
        request: async (request: any) => { const response = await (window as any).__walletRpc(request); if (response.error) throw response.error; return response.result; },
        on: (name: string, fn: Function) => { (listeners[name] ??= []).push(fn); },
        removeListener: (name: string, fn: Function) => { listeners[name] = (listeners[name] ?? []).filter(item => item !== fn); },
      };
    });
  }
  return state;
}
