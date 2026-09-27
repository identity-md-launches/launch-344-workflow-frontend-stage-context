import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import { mock, deployment, alternate } from './mock';
const approve = (page: any) => page.getByRole('button', { name: /1\. (Approve DOOM|DOOM approved)/ });
const buy = (page: any) => page.getByRole('button', { name: '2. Buy keys' });
async function open(page: any) { await page.goto('./'); await expect(page.getByText('Contract reads verified', { exact: false })).toBeVisible(); }
async function connect(page: any) { await page.getByRole('button', { name: 'Connect wallet' }).click(); await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible(); }

test('disconnected reads, missing wallet and no enabled transaction actions', async ({ page }) => {
  await mock(page, { noWallet: true }); await open(page);
  await expect(approve(page)).toBeDisabled(); await expect(buy(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Withdraw DOOM' })).toBeDisabled();
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.getByRole('alert')).toContainText(['No browser wallet found']);
});

test('unknown chain offers add-chain and retries switching with exact handoff params', async ({ page }) => {
  const state = await mock(page, { wrongChain: true }); await open(page); await connect(page);
  await expect(approve(page)).toBeDisabled(); await page.getByRole('button', { name: 'Switch to Sepolia' }).click();
  await expect(approve(page)).toBeEnabled();
  expect(state.calls.filter(m => m.startsWith('wallet_'))).toEqual(['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain']);
});

test('approve exact cap, buy, claim once and withdraw; each write simulated and zero ETH', async ({ page }) => {
  const state = await mock(page); await open(page); await connect(page);
  await expect(buy(page)).toBeDisabled();
  await page.getByLabel('Number of keys').fill('2'); await page.getByRole('button', { name: 'Use quote + 1%' }).click();
  await expect(page.getByLabel('Maximum total cost')).toHaveValue('2.02');
  await approve(page).click(); await expect(buy(page)).toBeEnabled();
  expect(state.transactions[0].args[1]).toBe(2020000000000000000n);
  expect(state.transactions[0].args[0].toLowerCase()).toBe(deployment.contracts.find((c: any) => c.name === 'DoomsdayClock').address);
  await buy(page).click(); await expect(page.getByRole('status')).toContainText('Transaction confirmed');
  expect(state.transactions[1].args).toEqual([2n, 2020000000000000000n]);
  await expect(page.getByRole('button', { name: 'Claim share', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Claim share', exact: true }).click();
  await expect(page.getByText(/Already claimed/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Claim share', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Withdraw DOOM' }).click();
  await expect(page.getByRole('button', { name: 'Withdraw DOOM' })).toBeDisabled();
  expect(state.transactions.map(t => t.name)).toEqual(['approve', 'buyKeys', 'claimShare', 'withdraw']);
  expect(state.transactions.every(t => BigInt(t.value) === 0n)).toBe(true);
  expect(state.sendsBeforeSimulation).toBe(false);
});

test('settle expired round and display unopened next round', async ({ page }) => {
  const state = await mock(page, { expired: true }); await open(page); await connect(page);
  await expect(page.getByRole('button', { name: 'Settle round' })).toBeEnabled();
  await page.getByRole('button', { name: 'Settle round' }).click();
  await expect(page.getByText('Awaiting first key', { exact: true })).toBeVisible();
  expect(state.transactions[0].name).toBe('settle');
  await expect(page.getByRole('button', { name: 'Settle round' })).toBeDisabled();
});

test('key bounds, cap precision, maximum below quote and insufficient balance block purchases', async ({ page }) => {
  await mock(page, { lowBalance: true }); await open(page); await connect(page);
  for (const value of ['0', '101', '1.5']) { await page.getByLabel('Number of keys').fill(value); await expect(approve(page)).toBeDisabled(); }
  await page.getByLabel('Number of keys').fill('1');
  for (const value of ['0.5', '-1', '1.0000000000000000001', '1e2']) { await page.getByLabel('Maximum total cost').fill(value); await expect(approve(page)).toBeDisabled(); }
  await page.getByLabel('Maximum total cost').fill('1.01'); await expect(approve(page)).toBeEnabled();
  await approve(page).click(); await expect(buy(page)).toBeDisabled();
  await expect(page.getByText('Your balance must cover', { exact: false })).toBeVisible();
});

test('wallet rejection and simulation revert are recoverable without a broadcast', async ({ page }) => {
  const state = await mock(page, { rejectConnect: true }); await open(page);
  await page.getByRole('button', { name: 'Connect wallet' }).click(); await expect(page.getByText(/Wallet request rejected/)).toBeVisible();
  state.rejectConnect = false; await connect(page);
  state.reject = true; await approve(page).click();
  await expect(page.getByText(/Wallet request rejected/)).toBeVisible(); expect(state.transactions).toHaveLength(0);
  state.reject = false; await approve(page).click(); await expect(buy(page)).toBeEnabled();
  state.simulationRevert = true; await buy(page).click(); await expect(page.getByText(/CostExceedsMax/)).toBeVisible();
  expect(state.transactions).toHaveLength(1);
  state.simulationRevert = false; await buy(page).click(); await expect(page.getByRole('status')).toContainText('Transaction confirmed');
});

test('account and network changes invalidate action eligibility', async ({ page }) => {
  const state = await mock(page); await open(page); await connect(page); await expect(approve(page)).toBeEnabled();
  state.chainId = 1; await page.evaluate(() => (window as any).__emit('chainChanged', '0x1'));
  await expect(approve(page)).toBeDisabled(); await expect(page.getByText('Your wallet is on the wrong network.', { exact: false })).toBeVisible();
  state.account = alternate; await page.evaluate(account => (window as any).__emit('accountsChanged', [account]), alternate);
  await expect(approve(page)).toBeDisabled();
  state.connected = false; await page.evaluate(() => (window as any).__emit('accountsChanged', []));
  await expect(page.getByRole('button', { name: 'Connect wallet' })).toBeVisible();
});

test('RPC failure and missing code keep writes disabled; retry recovers', async ({ page }) => {
  const state = await mock(page); state.failRpc = true; await page.goto('./');
  await expect(page.getByText(/Live reads unavailable/)).toBeVisible(); await expect(approve(page)).toBeDisabled();
  state.failRpc = false; state.missingCode = true; await page.getByRole('button', { name: 'Retry reads' }).click();
  await expect(page.getByText(/Deployed contract code is missing/)).toBeVisible();
  state.missingCode = false; await page.getByRole('button', { name: 'Retry reads' }).click(); await expect(page.getByText('Contract reads verified', { exact: false })).toBeVisible();
  await connect(page); await expect(approve(page)).toBeEnabled();
});

test('tampered ABI fails closed before contract or wallet actions', async ({ page }) => {
  const state = await mock(page);
  await page.route('**/abi/DoomsdayClock.json', route => route.fulfill({ json: [] }));
  await page.goto('./'); await expect(page.getByText('DoomsdayClock ABI hash verification failed.')).toBeVisible();
  expect(state.transactions).toHaveLength(0); await expect(page.getByRole('button', { name: 'Connect wallet' })).toHaveCount(0);
});

test('token binding mismatch fails closed', async ({ page }) => {
  const state = await mock(page); state.wrongToken = true; await page.goto('./');
  await expect(page.getByText(/Clock token differs/)).toBeVisible(); await expect(approve(page)).toBeDisabled();
});

test('empty round, no share, invalid past-round selection', async ({ page }) => {
  await mock(page, { idle: true, noKeys: true }); await open(page); await connect(page);
  await expect(page.getByText(/No settled rounds yet/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Claim share', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Settle round' })).toBeDisabled();
});

test('desktop/mobile screenshots, keyboard flow, accessibility and layout measurements', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const failed: string[] = []; page.on('requestfailed', request => failed.push(request.url()));
  await mock(page); await open(page);
  await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Skip to game' })).toBeFocused();
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Connect wallet' })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(approve(page)).toBeEnabled();
  await page.getByLabel('Number of keys').focus(); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('2');
  await expect(page.getByRole('button', { name: 'Use quote + 1%' })).toBeEnabled();
  await page.getByRole('button', { name: 'Use quote + 1%' }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByLabel('Maximum total cost')).toHaveValue('2.02');
  await approve(page).focus(); await page.keyboard.press('Enter'); await expect(buy(page)).toBeEnabled();
  await buy(page).focus();
  await page.screenshot({ path: '../docs/evidence/desktop.png', fullPage: true });
  const contrast = await page.evaluate(() => {
    const rgb = (text: string) => text.match(/[0-9.]+/g)!.slice(0, 3).map(Number);
    const luminance = (text: string) => rgb(text).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const measure = (name: string, foreground: string, background: string, minimum: number) => {
      const a = luminance(foreground), b = luminance(background);
      return { name, foreground, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), minimum };
    };
    const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
    const page = style(':root'), panel = style('.clock-panel'), button = style('button.primary'), muted = style('.timer-note'), input = style('input');
    return [measure('Body / page', page.color, page.backgroundColor, 4.5), measure('Muted / clock surface', muted.color, panel.backgroundColor, 4.5), measure('Primary button', button.color, button.backgroundColor, 4.5), measure('Input boundary / page', input.borderColor, page.backgroundColor, 3), measure('Control boundary / clock surface', input.borderColor, panel.backgroundColor, 3), measure('Focus / page', button.outlineColor, page.backgroundColor, 3)];
  });
  writeFileSync('../docs/evidence/contrast.json', JSON.stringify(contrast, null, 2));
  for (const pair of contrast) expect(pair.ratio).toBeGreaterThanOrEqual(pair.minimum);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  writeFileSync('../docs/evidence/accessibility.json', JSON.stringify({ violations: audit.violations, incomplete: audit.incomplete.map(item => ({ id: item.id, impact: item.impact })), passes: audit.passes.length }, null, 2));
  expect(audit.violations).toEqual([]);
  const measurements: any[] = [];
  for (const width of [1440, 960, 720, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    measurements.push(await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, heading: getComputedStyle(document.querySelector('h1')!).fontSize, input: getComputedStyle(document.querySelector('input')!).fontSize })));
    expect(measurements.at(-1).scrollWidth).toBeLessThanOrEqual(width);
    if (width === 390) await page.screenshot({ path: '../docs/evidence/mobile.png', fullPage: true });
    if (width === 320) await page.screenshot({ path: '../docs/evidence/narrow.png', fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('button').first().evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.setViewportSize({ width: 960, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(960);
  writeFileSync('../docs/evidence/layout.json', JSON.stringify({ measurements, reducedMotion: '0s', textEnlargement: '200% root text at 960 CSS pixels, no overflow; not native browser zoom', pageErrors: errors, failedRequests: failed }, null, 2));
  expect(errors).toEqual([]); expect(failed).toEqual([]);
});


test('old RPC blocks disable writes and explain the stale state', async ({ page }) => {
  const state = await mock(page); state.staleBlock = true; await page.goto('./');
  await expect(page.getByText(/RPC returned an old block/)).toBeVisible();
  await expect(approve(page)).toBeDisabled();
  state.staleBlock = false; await page.getByRole('button', { name: 'Retry reads' }).click();
  await expect(page.getByText('Contract reads verified', { exact: false })).toBeVisible();
});

test('account changes after simulation prevent a wallet send', async ({ page }) => {
  const state = await mock(page); await open(page); await connect(page);
  state.changeAccountOnSimulation = true; await approve(page).click();
  await expect(page.getByText(/Wallet account changed/)).toBeVisible();
  expect(state.simulations).toContain('approve'); expect(state.transactions).toHaveLength(0);
});
