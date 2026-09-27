import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const web = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.execPath, [web + 'node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], {
  cwd: web, stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: web + 'node_modules/.cache/browsers' },
});
process.exit(result.status ?? 1);
