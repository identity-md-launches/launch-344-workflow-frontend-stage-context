import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, custom, fallback, http, formatUnits, parseUnits, type Address, type EIP1193Provider } from 'viem';
import type { BoundContract, Config } from './config';
export type Provider = EIP1193Provider & { on?: (event: string, listener: (...args: any[]) => void) => void; removeListener?: (event: string, listener: (...args: any[]) => void) => void };
declare global { interface Window { ethereum?: Provider } }
export type Round = { end: bigint; pot: bigint; totalKeys: bigint; nextPrice: bigint; perKey: bigint; lastBuyer: Address; settled: boolean };
export type Snapshot = { round: bigint; info: Round; carry: bigint; nextPrice: bigint; cost: bigint; decimals: number; token: Address;
  balance: bigint; allowance: bigint; withdrawable: bigint; keys: bigint; block: bigint; timestamp: bigint; readAt: number; account?: Address; n: number };
export type PastRound = { id: bigint; info: Round; keys: bigint; claimed: boolean; claimable: bigint; account: Address };
export type Action = 'approve' | 'buyKeys' | 'settle' | 'claimShare' | 'withdraw';
export const short = (s: string) => s.slice(0, 6) + '…' + s.slice(-4);
export const amount = (n: bigint, decimals = 18) => formatUnits(n, decimals);
export function parseAmount(value: string, decimals: number) {
  if (!new RegExp(`^(0|[1-9][0-9]*)(\\.[0-9]{1,${decimals}})?$`).test(value)) throw Error(`Use a positive DOOM amount with at most ${decimals} decimals.`);
  const parsed = parseUnits(value, decimals);
  if (parsed <= 0n || parsed >= 2n ** 256n) throw Error('Enter a positive amount within the token limit.');
  return parsed;
}
export function errorText(error: unknown): string {
  const e = error as { code?: number; shortMessage?: string; message?: string; cause?: unknown };
  if (e?.code === 4001 || /rejected|denied/i.test(e?.message ?? '')) return 'Wallet request rejected. Nothing was confirmed; you can try again.';
  if (error instanceof BaseError) {
    const revert = error.walk(cause => cause instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName) {
      return `${revert.data.errorName}: the contract rejected this transaction. Refresh the quote, balances and round before trying again.`;
    }
  }
  const message = (e?.shortMessage || e?.message || 'Request failed.').slice(0, 500);
  return `${message} Refresh the state and review your inputs before trying again.`;
}
export async function switchNetwork(provider: Provider, config: Config) {
  const params: [{ chainId: string }] = [{ chainId: config.deployment.walletAddChain.chainId }];
  try { await provider.request({ method: 'wallet_switchEthereumChain', params }); }
  catch (error) {
    const e = error as { code?: number; message?: string; data?: { originalError?: { code?: number } } };
    if (e.code !== 4902 && e.data?.originalError?.code !== 4902 && !/unknown chain|unrecognized chain|chain.*not.*added/i.test(e.message ?? '')) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [config.deployment.walletAddChain] });
    await provider.request({ method: 'wallet_switchEthereumChain', params });
  }
}
export function createGame(config: Config) {
  const client = createPublicClient({ chain: config.chain, batch: { multicall: false },
    transport: fallback(config.deployment.network.rpcUrls.map(url => http(url, { timeout: 8000, retryCount: 0 })), { retryCount: 0 }), pollingInterval: 1500 });
  const read = async <T>(contract: BoundContract, functionName: string, args: readonly unknown[] = [], blockNumber?: bigint) =>
    await client.readContract({ address: contract.address, abi: contract.abi, functionName, args, blockNumber }) as T;
  async function verify() {
    if (await client.getChainId() !== config.chain.id) throw Error('RPC chain mismatch. Transactions are disabled.');
    const codes = await Promise.all(config.deployment.contracts.map(c => client.getCode({ address: c.address })));
    if (codes.some(code => !code || code === '0x')) throw Error('Deployed contract code is missing. Transactions are disabled.');
    const token = await read<Address>(config.clock, 'token');
    if (token.toLowerCase() !== config.token.address.toLowerCase()) throw Error('Clock token differs from the attested deployment. Transactions are disabled.');
    return token;
  }
  async function snapshot(account: Address | undefined, n: number): Promise<Snapshot> {
    const block = await client.getBlock();
    const round = await read<bigint>(config.clock, 'round', [], block.number);
    const token = await read<Address>(config.clock, 'token', [], block.number);
    if (token.toLowerCase() !== config.token.address.toLowerCase()) throw Error('Clock token binding changed.');
    const tokenContract = { ...config.token, address: token };
    const [info, carry, nextPrice, cost, decimals, balance, allowance, withdrawable, keys] = await Promise.all([
      read<Round>(config.clock, 'roundInfo', [round], block.number), read<bigint>(config.clock, 'carry', [], block.number),
      read<bigint>(config.clock, 'priceOfNext', [1n], block.number), read<bigint>(config.clock, 'priceOfNext', [BigInt(n)], block.number),
      read<number>(tokenContract, 'decimals', [], block.number),
      account ? read<bigint>(tokenContract, 'balanceOf', [account], block.number) : 0n,
      account ? read<bigint>(tokenContract, 'allowance', [account, config.clock.address], block.number) : 0n,
      account ? read<bigint>(config.clock, 'withdrawable', [account], block.number) : 0n,
      account ? read<bigint>(config.clock, 'keysOf', [round, account], block.number) : 0n,
    ]);
    if (decimals !== 18) throw Error('DOOM decimals differ from the approved deployment.');
    if (Date.now() / 1000 - Number(block.timestamp) > 180) throw Error('RPC returned an old block. Refresh before transacting.');
    return { round, info, carry, nextPrice, cost, decimals, token, balance, allowance, withdrawable, keys,
      block: block.number, timestamp: block.timestamp, readAt: Date.now(), account, n };
  }
  async function past(id: bigint, account: Address): Promise<PastRound> {
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    const [info, keys, claimed, claimable] = await Promise.all([
      read<Round>(config.clock, 'roundInfo', [id], blockNumber), read<bigint>(config.clock, 'keysOf', [id, account], blockNumber),
      read<boolean>(config.clock, 'claimed', [id, account], blockNumber), read<bigint>(config.clock, 'claimable', [id, account], blockNumber),
    ]);
    return { id, info, keys, claimed, claimable, account };
  }
  async function transact(provider: Provider, account: Address, action: Action, n: number, max: bigint, round: bigint,
    status: (text: string, hash?: `0x${string}`) => void) {
    async function checkWallet() {
      const [accounts, chainId] = await Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })]);
      if (Number(chainId) !== config.chain.id) throw Error(`Switch to ${config.chain.name} before continuing.`);
      if (!accounts[0] || accounts[0].toLowerCase() !== account.toLowerCase()) throw Error('Wallet account changed. Review the updated balances and try again.');
    }
    status('Checking current state…');
    await checkWallet(); await verify();
    const live = await snapshot(account, n);
    let contract = config.clock;
    let args: readonly unknown[] = [];
    if (action === 'approve' || action === 'buyKeys') {
      if (max < live.cost) throw Error('The quote now exceeds your maximum cost. Refresh the quote or increase the limit.');
      if (action === 'approve') { contract = { ...config.token, address: live.token }; args = [config.clock.address, max]; }
      else {
        if (live.balance < max) throw Error('Your DOOM balance is below the maximum cost. Lower the limit or get DOOM.');
        if (live.allowance < max) throw Error('Approve the maximum DOOM cost before buying keys.');
        args = [BigInt(n), max];
      }
    } else if (action === 'claimShare') {
      const claim = await past(round, account);
      if (!claim.info.settled || claim.keys === 0n || claim.claimed) throw Error('This round has no unclaimed share for your wallet.');
      args = [round];
    } else if (action === 'withdraw' && live.withdrawable === 0n) throw Error('There is no DOOM ready to withdraw.');
    else if (action === 'settle' && (live.info.end === 0n || live.timestamp < live.info.end)) throw Error('The current round has not ended.');
    status('Simulating transaction…');
    const { request, result } = await client.simulateContract({ address: contract.address, abi: contract.abi, functionName: action, args, account });
    if (action === 'approve' && result === false) throw Error('DOOM approval simulation returned false.');
    await checkWallet();
    status('Confirm the transaction in your wallet.');
    const wallet = createWalletClient({ chain: config.chain, transport: custom(provider) });
    const hash = await wallet.writeContract(request);
    status('Transaction submitted. Waiting for confirmation…', hash);
    let actionReplaced = false;
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120000, onReplaced: ({ transaction, reason }) => {
      if (reason !== 'repriced') actionReplaced = true;
      status('Tracking replacement transaction…', transaction.hash);
    } });
    if (actionReplaced) throw Error('The transaction was cancelled or replaced with a different action. Review the transaction link.');
    if (receipt.status !== 'success') throw Error('Transaction reverted. Check the explorer, refresh, and try again.');
    status('Transaction confirmed.', receipt.transactionHash);
  }
  return { verify, snapshot, past, transact };
}
export type Game = ReturnType<typeof createGame>;
