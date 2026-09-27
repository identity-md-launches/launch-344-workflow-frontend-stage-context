import { execFileSync } from 'node:child_process';
import { readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const handoff = JSON.parse(await readFile(root + 'web/deployment.handoff.json'));
const pinned = JSON.parse(await readFile(root + 'web/network.json'));
const manifest = JSON.parse(await readFile(root + 'dist/imd-deployment.json'));
for (const field of ['version', 'launchId', 'chainId', 'sourceCommit', 'attestationHash']) assert.deepEqual(manifest[field], handoff[field]);
assert.deepEqual(manifest.network, pinned.network);
assert.deepEqual(manifest.walletAddChain, pinned.walletAddChain);
assert.deepEqual(manifest.contracts.map(({ name, address, abiHash }) => ({ name, address, abiHash })), handoff.contracts.map(({ name, address, abiHash }) => ({ name, address, abiHash })));
async function files(dir, prefix = '') {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'Symlinks are not permitted');
    if (entry.isDirectory()) result.push(...await files(dir + '/' + entry.name, prefix + entry.name + '/'));
    else result.push(prefix + entry.name);
  }
  return result.sort();
}
const inventory = await files(root + 'dist');
assert.deepEqual(manifest.assets.map(a => a.path).sort(), inventory.filter(p => p !== 'imd-deployment.json'));
assert(manifest.assets.length <= 128);
let exportBytes = 0;
for (const path of inventory) {
  assert(!path.includes('..') && !path.startsWith('/'));
  const bytes = await readFile(root + 'dist/' + path); exportBytes += bytes.length;
  assert(bytes.length <= 8388608);
  if (path !== 'imd-deployment.json') assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.assets.find(a => a.path === path).sha256);
}
const changed = [...new Set([...git('diff', '--name-only', handoff.sourceCommit).trim().split('\n'), ...git('ls-files', '--others', '--exclude-standard').trim().split('\n')].filter(Boolean))];
for (const path of changed) {
  assert(/^(web|dist|docs)\//.test(path) || path.startsWith('test/scratch/'), 'Out-of-scope path: ' + path);
  if (!path.startsWith('test/scratch/')) {
    assert(!/(^|\/)(node_modules|\.cache|playwright-report|test-results)(\/|$)/.test(path), 'Generated cache in submission: ' + path);
    assert(!path.endsWith('.tgz'), 'Unnecessary dependency archive: ' + path);
    assert(path === 'web/.gitignore' || !path.split('/').some(s => s.startsWith('.')), 'Dotfile outside explicit allowance: ' + path);
  }
}
assert(!git('ls-files', '--stage').split('\n').some(line => line.startsWith('160000 ')), 'Submodule in submission');
const report = { sourceCommit: handoff.sourceCommit, protectedTrackedFilesUnchanged: true, networkMatches: true, contractSetMatches: true,
  completeAssetInventory: true, assetCount: manifest.assets.length, exportBytes, assetHashesVerified: true,
  permittedChangedPaths: changed.filter(p => !p.startsWith('test/scratch/')).length, noTrackedCachesOrArchives: true, noSubmodules: true };
await writeFile(root + 'docs/evidence/integrity.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
