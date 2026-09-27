import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { zeroAddress, type Address } from 'viem';
import type { Config } from './config';
import { amount, createGame, errorText, parseAmount, short, switchNetwork, type Action, type PastRound, type Snapshot } from './game';

function Value({ value, decimals = 18 }: { value?: bigint; decimals?: number }) {
  if (value === undefined) return <span className="muted">—</span>;
  const full = amount(value, decimals);
  const [whole, fraction] = full.split('.');
  const display = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction.slice(0, 4) : '');
  return <span title={`${full} DOOM`} className="numeric">{value > 0n && value < 10n ** BigInt(Math.max(decimals - 4, 0)) ? '< 0.0001' : display}<span className="sr-only"> DOOM, exact amount {full}</span></span>;
}
const Glyph = () => <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="12"/><path d="M16 7v10h7M16 1v3M31 16h-3M16 31v-3M1 16h3"/></svg>;
export default function App({ config }: { config: Config }) {
  const game = useMemo(() => createGame(config), [config]);
  const [account, setAccount] = useState<Address>();
  const [walletChain, setWalletChain] = useState<number>();
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [verified, setVerified] = useState(false);
  const [data, setData] = useState<Snapshot>();
  const [readError, setReadError] = useState('');
  const [refreshing, setRefreshing] = useState(true);
  const [keys, setKeys] = useState('1');
  const [maxCost, setMaxCost] = useState('');
  const [pastId, setPastId] = useState('1');
  const [past, setPast] = useState<PastRound>();
  const [pastError, setPastError] = useState('');
  const [pastBusy, setPastBusy] = useState(false);
  const [pending, setPending] = useState<Action>();
  const [txStatus, setTxStatus] = useState('');
  const [txError, setTxError] = useState('');
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [tick, setTick] = useState(Date.now());
  const lock = useRef(false);
  const generation = useRef(0);
  const pastGeneration = useRef(0);
  const n = /^\d+$/.test(keys) ? Number(keys) : 0;
  const validKeys = Number.isInteger(n) && n >= 1 && n <= 100;
  const correctChain = walletChain === config.chain.id;
  const accountMatches = data?.account === account;
  const fresh = !!data && tick - data.readAt < 45000 && !readError;
  const ready = verified && !!account && correctChain && fresh && accountMatches && !pending && !refreshing;
  let max = 0n, maxError = '';
  if (maxCost) { try { max = parseAmount(maxCost, data?.decimals ?? 18); } catch (e) { maxError = errorText(e); } }
  else maxError = 'Set your maximum total cost in DOOM.';
  const quoteMatches = validKeys && data?.n === n;
  const validCost = !maxError && quoteMatches && max >= (data?.cost ?? 0n);
  const allowanceEnough = !!data && validCost && data.allowance >= max;
  const balanceEnough = !!data && validCost && data.balance >= max;
  const chainNow = data ? Number(data.timestamp) + Math.floor((tick - data.readAt) / 1000) : 0;
  const remaining = data ? Math.max(0, Number(data.info.end) - chainNow) : 0;
  const started = !!data && data.info.end > 0n;
  const ended = started && remaining === 0;
  const countdown = data ? (started ? [Math.floor(remaining / 3600), Math.floor(remaining / 60) % 60, remaining % 60].map(x => String(x).padStart(2, '0')).join(':') : '01:00:00') : '––:––:––';
  const explorer = config.deployment.network.explorer;

  const refresh = useCallback(async () => {
    const id = ++generation.current;
    setRefreshing(true);
    try {
      await game.verify();
      const next = await game.snapshot(account, validKeys ? n : 1);
      if (id !== generation.current) return;
      setVerified(true); setData(next); setReadError('');
      setMaxCost(value => value || amount((next.cost * 101n + 99n) / 100n, next.decimals));
    } catch (e) {
      if (id !== generation.current) return;
      setReadError(errorText(e)); setVerified(false);
    } finally { if (id === generation.current) setRefreshing(false); }
  }, [game, account, n, validKeys]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (!lock.current) void refresh(); }, 15000);
    return () => { generation.current++; clearInterval(timer); };
  }, [refresh]);
  useEffect(() => { const timer = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;
    let mounted = true;
    const accountsChanged = (accounts: Address[]) => { setAccount(accounts[0]); setData(undefined); setPast(undefined); setVerified(false); };
    const chainChanged = (chain: string) => { setWalletChain(Number(chain)); setPast(undefined); };
    const disconnected = () => { setAccount(undefined); setWalletChain(undefined); setData(undefined); setPast(undefined); };
    provider.on?.('accountsChanged', accountsChanged); provider.on?.('chainChanged', chainChanged); provider.on?.('disconnect', disconnected);
    void Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })])
      .then(([accounts, chain]) => { if (mounted) { setAccount(accounts[0]); setWalletChain(Number(chain)); } }).catch(() => {});
    return () => { mounted = false; provider.removeListener?.('accountsChanged', accountsChanged); provider.removeListener?.('chainChanged', chainChanged); provider.removeListener?.('disconnect', disconnected); };
  }, []);
  const inspectPast = useCallback(async () => {
    const version = ++pastGeneration.current;
    setPast(undefined); setPastError(''); setPastBusy(false);
    if (!account || !data) return;
    if (!/^[1-9][0-9]*$/.test(pastId) || BigInt(pastId) >= data.round) { setPastError(data.round <= 1n ? 'No settled rounds yet. Shares appear after the first settlement.' : `Choose a settled round from 1 to ${data.round - 1n}.`); return; }
    setPastBusy(true);
    try { const result = await game.past(BigInt(pastId), account); if (version === pastGeneration.current) setPast(result); }
    catch (e) { if (version === pastGeneration.current) setPastError(errorText(e)); }
    finally { if (version === pastGeneration.current) setPastBusy(false); }
  }, [account, data?.round, data?.readAt, game, pastId]);
  useEffect(() => { void inspectPast(); return () => { pastGeneration.current++; }; }, [inspectPast]);

  async function connect() {
    if (!window.ethereum) { setWalletError('No browser wallet found. Install an Ethereum browser wallet, or open this page in your wallet’s browser, then reload.'); return; }
    setWalletBusy(true); setWalletError('');
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts[0]) throw Error('No account selected. Open your wallet and try again.');
      setAccount(accounts[0]); setWalletChain(Number(await window.ethereum.request({ method: 'eth_chainId' })));
    } catch (e) { setWalletError(errorText(e)); }
    finally { setWalletBusy(false); }
  }
  async function switchChain() {
    if (!window.ethereum) return;
    setWalletBusy(true); setWalletError('');
    try { await switchNetwork(window.ethereum, config); setWalletChain(Number(await window.ethereum.request({ method: 'eth_chainId' }))); await refresh(); }
    catch (e) { setWalletError(errorText(e)); } finally { setWalletBusy(false); }
  }
  async function act(action: Action) {
    if (lock.current || !ready || !account || !window.ethereum) return;
    if ((action === 'approve' || action === 'buyKeys') && !validCost) return;
    let submitted = false;
    lock.current = true; setPending(action); setTxError(''); setTxHash(undefined);
    try {
      await game.transact(window.ethereum, account, action, validKeys ? n : 1, max, past?.id ?? 0n,
        (message, hash) => { setTxStatus(message); if (hash) { submitted = true; setTxHash(hash); } });
      await refresh(); await inspectPast();
    } catch (e) { setTxStatus(''); setTxError(errorText(e) + (submitted ? ' Check the transaction link before trying again.' : '')); await refresh(); }
    finally { lock.current = false; setPending(undefined); }
  }
  const waitingReason = !account ? 'Connect your wallet to approve and play.' : !correctChain ? `Switch to ${config.chain.name} to play.` : !verified ? 'Waiting for verified contract reads.' : !fresh ? 'State is stale. Refresh to continue.' : refreshing ? 'Refreshing contract state…' : '';
  const costHint = !validKeys ? 'Choose a whole number from 1 to 100.' : maxError || (!quoteMatches ? 'Updating quote…' : max < (data?.cost ?? 0n) ? 'Maximum cost is below the current quote.' : !account ? '' : !balanceEnough ? 'Your balance must cover the maximum cost. Get DOOM or lower the limit.' : !allowanceEnough ? 'Approve this maximum cost, then buy your keys.' : 'Approval covers this limit. You can buy your keys.');

  return <>
    <a className="skip" href="#main">Skip to game</a>
    <header className="site-header wrap">
      <a className="brand" href="#main"><Glyph/><span>DOOMSDAY<span className="brand-sub">A GAME AGAINST THE CLOCK</span></span></a>
      <div className="wallet-connect"><span className="network-label"><i aria-hidden="true"/> {config.chain.name} testnet</span>
        {account ? <div className="connected"><span title={account}><span className="sr-only">Connected wallet </span>{short(account)}</span><button className="text-button" disabled={!!pending} onClick={() => { setAccount(undefined); setData(undefined); setPast(undefined); }}>Disconnect</button></div> : <button onClick={connect} disabled={walletBusy}>{walletBusy ? 'Connecting…' : 'Connect wallet'} <span aria-hidden="true">↗</span></button>}
      </div>
    </header>
    <main id="main" className="wrap">
      <div className="intro"><div><p className="eyebrow">THE LAST KEY HAS THE LAST WORD</p><h1>Doomsday Clock<span className="accent-dot">.</span></h1><p>Buy time. Hold the last key. When the clock runs out, the last buyer wins half the pot.</p></div><a className="rules-link" href="#rules">How it works <span aria-hidden="true">↓</span></a></div>
      <div className="test-notice"><span className="tag">TEST GAME</span><p>Sepolia only. DOOM has no real value.</p></div>
      {account && !correctChain && <div className="notice warning"><p>Your wallet is on the wrong network. Switch to {config.chain.name} to enable transactions.</p><button disabled={walletBusy || !!pending} onClick={switchChain}>{walletBusy ? 'Switching…' : `Switch to ${config.chain.name}`}</button></div>}
      <div role="alert" className={walletError ? 'notice error' : ''}>{walletError}</div>
      {readError && <div className="notice error" role="alert"><p>Live reads unavailable: {readError} {data && 'Displayed values are from the last successful read.'}</p><button onClick={refresh} disabled={refreshing || !!pending}>Retry reads</button></div>}
      <div className="game-grid">
        <section className="clock-panel" aria-labelledby="countdown-title">
          <div className="panel-top"><span className="eyebrow">ROUND {data?.round.toString().padStart(3, '0') ?? '—'}</span><span className="state-pill">{!data ? 'Loading chain state' : !fresh ? 'State unavailable' : !started ? 'Awaiting first key' : ended ? 'Ready to settle' : 'Round in progress'}</span></div>
          <div className="timer-area"><h2 id="countdown-title">{!data ? 'Reading the clock' : !started ? 'The first key starts the clock' : ended ? 'This round has ended' : 'Time until doomsday'}</h2><div className="countdown" role="timer" aria-label={data ? `${countdown}, estimated time remaining` : 'Countdown loading'}>{countdown}</div><div className="time-units" aria-hidden="true"><span>HOURS</span><span>MINUTES</span><span>SECONDS</span></div><p className="timer-note">{!started ? '1 hour to start. Every key adds 30 seconds.' : 'Every key adds 30 seconds · capped at 24 hours'}</p></div>
          <div className="pot-row"><div><span className="eyebrow">CURRENT POT</span><p className="pot-value"><Value value={data?.info.pot}/> <small>DOOM</small></p></div><div className="split-mark" aria-hidden="true">50<span>/ 30 / 20</span></div></div>
          <div className="round-meta"><div><span>Last buyer</span>{data?.info.lastBuyer && data.info.lastBuyer !== zeroAddress ? <a href={`${explorer}/address/${data.info.lastBuyer}`} target="_blank" rel="noreferrer" title={data.info.lastBuyer}>{short(data.info.lastBuyer)} ↗</a> : <strong>{data ? 'The next key could be yours' : '—'}</strong>}</div><div><span>Keys this round</span><strong>{data?.info.totalKeys.toString() ?? '—'}</strong></div><div><span>Carry into next round</span><strong><Value value={data?.carry}/> DOOM</strong></div></div>
          <div className="settle-row"><p>{ended ? 'Settle to credit the winner and unlock shares. A new purchase also settles this round.' : 'Anyone can settle once the on-chain timer ends.'}</p><button onClick={() => act('settle')} disabled={!ready || !data || data.info.end === 0n || data.timestamp < data.info.end}>{pending === 'settle' ? 'Settling…' : 'Settle round'}</button></div>
        </section>
        <section className="buy-panel" aria-labelledby="buy-title"><div className="panel-top"><span className="eyebrow">MAKE YOUR MOVE</span><span className="step-index">01</span></div><h2 id="buy-title">Keep the clock alive.</h2><p className="muted">Each purchase makes you the last buyer.</p>
          <div className="next-price"><span>Next key price</span><strong><Value value={data?.nextPrice}/> DOOM</strong></div>
          <form onSubmit={e => { e.preventDefault(); void act(allowanceEnough ? 'buyKeys' : 'approve'); }}>
            <label htmlFor="keys">Number of keys <span>1–100 per purchase</span></label><div className="key-input"><button type="button" aria-label="Remove one key" disabled={!!pending || n <= 1} onClick={() => setKeys(String(Math.max(1, n - 1)))}>−</button><input id="keys" name="keys" inputMode="numeric" value={keys} onChange={e => setKeys(e.target.value)} disabled={!!pending} aria-invalid={!validKeys} aria-describedby="cost-hint"/><button type="button" aria-label="Add one key" disabled={!!pending || n >= 100} onClick={() => setKeys(String(Math.min(100, n + 1)))}>+</button></div>
            <div className="quote-row"><span>Total quote</span><strong><Value value={quoteMatches ? data?.cost : undefined}/> DOOM</strong></div>
            <label htmlFor="max-cost">Maximum total cost <span>DOOM</span></label><input id="max-cost" name="max-cost" inputMode="decimal" value={maxCost} onChange={e => setMaxCost(e.target.value)} disabled={!!pending} aria-invalid={!!maxError || (quoteMatches && max < (data?.cost ?? 0n))} aria-describedby="max-help cost-hint"/>
            <div className="max-help"><p id="max-help">The purchase reverts if its cost exceeds this limit.</p><button className="text-button" type="button" disabled={!quoteMatches || !!pending || !fresh} onClick={() => data && setMaxCost(amount((data.cost * 101n + 99n) / 100n, data.decimals))}>Use quote + 1%</button></div>
            <p id="cost-hint" className="cost-hint">{waitingReason || costHint}</p>
            <button type="button" className={!allowanceEnough ? 'primary full' : 'full'} onClick={() => act('approve')} disabled={!ready || !validCost || allowanceEnough}>{pending === 'approve' ? 'Approving DOOM…' : allowanceEnough ? '1. DOOM approved' : '1. Approve DOOM'} <span aria-hidden="true">{allowanceEnough ? '✓' : '↗'}</span></button>
            <button type="submit" className={allowanceEnough ? 'primary full' : 'full'} disabled={!ready || !validCost || !allowanceEnough || !balanceEnough}>{pending === 'buyKeys' ? 'Buying keys…' : '2. Buy keys'} <span aria-hidden="true">↗</span></button>
            <p className="fine-print">Approve gives the clock permission to spend up to your limit. Buy keys spends DOOM. Both require Sepolia ETH for gas.</p>
          </form>
        </section>
      </div>
      <div className="tx-feedback" aria-live="polite" role="status">{txStatus}{txHash && <> <a href={`${explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">View transaction ↗</a></>}</div><div role="alert" className={txError ? 'notice error' : ''}>{txError}</div>
      <section className="wallet-panel" aria-labelledby="wallet-title"><div className="section-heading"><div><p className="eyebrow">YOUR POSITION</p><h2 id="wallet-title">The keys. The rewards.</h2></div><button className="text-button" onClick={refresh} disabled={refreshing || !!pending}>{refreshing ? 'Refreshing…' : 'Refresh balances'} <span aria-hidden="true">↻</span></button></div>
        {!account && <p className="muted">Connect a browser wallet to see your DOOM, keys and rewards.</p>}
        <div className="balances"><div><span>DOOM balance</span><strong><Value value={account && accountMatches ? data?.balance : undefined}/></strong></div><div><span>Clock allowance · DOOM</span><strong><Value value={account && accountMatches ? data?.allowance : undefined}/></strong></div><div><span>Your keys this round</span><strong>{account && accountMatches ? data?.keys.toString() ?? '—' : '—'}</strong></div><div><span>Withdrawable · DOOM</span><strong><Value value={account && accountMatches ? data?.withdrawable : undefined}/></strong><button disabled={!ready || !data || data.withdrawable === 0n} onClick={() => act('withdraw')}>{pending === 'withdraw' ? 'Withdrawing…' : 'Withdraw DOOM'} <span aria-hidden="true">↗</span></button></div></div>
        <p className="fine-print">Claiming a share credits your withdrawable balance. Withdraw transfers that DOOM to your wallet.</p>
        <div className="claim-row"><div><h3>Claim a past round</h3><p className="muted">Look up any settled round. Your share is based on the keys you held.</p></div><div className="claim-controls"><label htmlFor="past-round">Round number</label><input id="past-round" name="past-round" inputMode="numeric" value={pastId} onChange={e => setPastId(e.target.value)} disabled={!account || !!pending} aria-describedby="past-result"/><button onClick={inspectPast} disabled={!account || pastBusy || !!pending}>Check share</button></div></div>
        <div id="past-result" className="past-result" aria-live="polite">{!account ? 'Connect your wallet to check past shares.' : pastBusy ? 'Reading round…' : pastError || (past ? `${past.keys} keys · ${amount(past.claimable, data?.decimals)} DOOM claimable${past.claimed ? ' · Already claimed' : past.keys === 0n ? ' · No keys held in this round' : ''}` : 'Enter a settled round number.')}</div>
        <button disabled={!ready || pastBusy || !past || past.account !== account || past.id.toString() !== pastId || past.claimed || past.keys === 0n || !past.info.settled} onClick={() => act('claimShare')}>{pending === 'claimShare' ? 'Claiming share…' : 'Claim share'} <span aria-hidden="true">↗</span></button>
      </section>
      <section className="rules" id="rules" aria-labelledby="rules-title"><div className="section-heading"><h2 id="rules-title">One clock. Three ways the pot moves.</h2><span className="eyebrow">THE RULES</span></div><div className="rule-grid"><div><strong>50<span>%</span></strong><h3>To the last buyer</h3><p>When the round ends, half the pot is credited to the last wallet that bought keys.</p></div><div><strong>30<span>%</span></strong><h3>Shared by key holders</h3><p>Claim a per-key share after settlement. The last buyer earns this share too.</p></div><div><strong>20<span>% + dust</span></strong><h3>To the next round</h3><p>The remainder and rounding dust carry forward. Every new round starts at 1 DOOM per key.</p></div></div><div className="rule-notes"><p>Each key costs 0.1% more than the previous one, rounded up in token base units. A round starts with one hour plus 30 seconds per key, with extensions capped at 24 hours from the purchase.</p><p><strong>Timing matters.</strong> Transaction ordering and block timestamps decide the last buyer. Block stuffing near the end is a known strategy. The countdown is an estimate; the chain decides when the round ends.</p><p><strong>Need DOOM?</strong> Swap Sepolia ETH for DOOM in the launch’s Uniswap v4 pool outside this page. Use the DOOM token address below. This page has no swap. <a href={`${explorer}/address/${config.token.address}`} target="_blank" rel="noreferrer">View DOOM token ↗</a></p></div></section>
      <footer><div className="footer-top"><span className="brand footer-brand"><Glyph/> DOOMSDAY</span><span>{verified ? 'Contract reads verified' : 'Contract verification pending'} · {data ? `Block ${data.block}` : 'Loading block'}</span></div><div className="contract-links">{config.deployment.contracts.map(contract => <a key={contract.name} href={`${explorer}/address/${contract.address}`} target="_blank" rel="noreferrer">{contract.name}<span>{contract.address} ↗</span></a>)}</div><p className="fine-print">Public RPC reads refresh every 15 seconds. No owner, admin or upgrade path. Test tokens only.</p></footer>
    </main>
  </>;
}
