import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const web = fileURLToPath(new URL('../', import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH = web + 'node_modules/.cache/browsers';
const { chromium } = await import('@playwright/test');
const server = spawn(process.execPath, [web + 'scripts/serve.mjs'], { env: { ...process.env, PORT: '4174' }, stdio: ['ignore', 'pipe', 'pipe'] });
const report = { checkedAt: new Date().toISOString(), mocked: false, consoleErrors: [], failedRequests: [], verifiedReads: false, overflow: [] };
let browser;
try {
  await once(server.stdout, 'data');
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => report.consoleErrors.push(error.message));
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText }));
  await page.goto('http://127.0.0.1:4174/preview/');
  try { await page.getByText('Contract reads verified', { exact: false }).waitFor({ timeout: 45000 }); report.verifiedReads = true; }
  catch { report.visibleState = await page.locator('main').innerText(); }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    report.overflow.push(await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth })));
    await page.screenshot({ path: web + `../docs/evidence/live-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  report.missingWalletMessage = await page.getByText('No browser wallet found.', { exact: false }).isVisible();
  report.stateText = await page.locator('.clock-panel').innerText();
  report.staticResources = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => new URL(e.name).origin === location.origin).map(e => ({ url: new URL(e.name).pathname, bytes: e.transferSize })));
} finally {
  await browser?.close(); server.kill('SIGTERM');
  await writeFile(web + '../docs/evidence/browser-live.json', JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
if (!report.verifiedReads) process.exitCode = 1;
