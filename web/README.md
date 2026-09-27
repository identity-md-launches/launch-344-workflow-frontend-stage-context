# Doomsday Clock frontend

One static React + TypeScript page for the already deployed Sepolia DoomsdayClock. This is a Sepolia test game with no real value. Transaction ordering and block timestamps determine the last buyer; block stuffing near the end is a known strategy.

## Install, build and preview

Use Node 22.12+ (validated on Node 22.23.3) and npm. From the repository root:

```sh
npm --prefix web ci --cache web/.cache/npm
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web run verify
npm --prefix web run preview
```

`npm ci` uses `web/package-lock.json`; package installation needs the registry or an existing local package-manager cache. Once dependencies are installed, typecheck/build/manifest verification use local files and Git only and make no network requests. No registry mirror, dependency archive or node_modules is submitted. `web/.gitignore` excludes dependency, browser and package-manager caches at every nested dependency directory.

The preview command serves the committed production export. For the exact subpath used in tests, run `node web/scripts/serve.mjs` and open `http://127.0.0.1:4173/preview/`. Stop the preview with Ctrl+C. Edit source, rebuild, and reload. `dist/` has relative asset references (`base: './'`), a single entrypoint, and hash anchors; it needs no server routing or backend. Serve over HTTPS outside local development. JavaScript must be enabled.

## Configuration and provenance

The browser fetches **only `dist/imd-deployment.json` for deployment configuration**, then loads its referenced implementation-derived ABI JSON files. `src/config.ts` checks the network/wallet configuration, expected contract set, relative paths and canonical ABI Keccak hashes. There are no hardcoded deployment addresses, chain IDs, RPC URLs or alternative ABI definitions in application source.

`deployment.handoff.json` and `network.json` are exact copies of the supplied build inputs. They are build-time provenance and are not imported into the browser bundle. `scripts/deployment.mjs` reads each ABI using:

```sh
git show 68e6d27e4d253a605b5eb2b0b2649d9ae7f254d2:docs/abi/DoomsdayClock.json
git show 68e6d27e4d253a605b5eb2b0b2649d9ae7f254d2:docs/abi/LaunchToken.json
```

The pinned commit must remain available locally when rebuilding. The script verifies canonical Keccak (recursively sorted object keys, preserved array order, compact JSON), preserves exact ABI file bytes, and emits the manifest **after** Vite finishes. It retains the exact handoff identifiers and complete contract set, copies the network block unchanged, and includes the exact wallet-add-chain parameters. It inventories every exported file except the manifest, using SHA-256 of final bytes. `npm run verify` recomputes and compares the full result without modifying it. Do not edit exported files directly: rebuild and regenerate the manifest.

The manifest includes `network` and `walletAddChain` as the additional network configuration fields required for this assignment. All six Uniswap addresses remain unchanged as reference data. The approved workflow explicitly excludes an in-page swap: DOOM comes from swapping Sepolia ETH in the launch pool elsewhere. Accordingly, the only token approval here authorizes the deployed **DoomsdayClock**, and the only quote is its `priceOfNext(n)` view. No router or Permit2 transaction is constructed.

## Wallet and game behavior

- Supports browser wallets exposing the EIP-1193 `window.ethereum` provider. No WalletConnect ID or private credentials are needed. Multiple-provider selection and WalletConnect are not implemented.
- Restores only an already authorized account. Connect explicitly requests access. Disconnect clears the local session; it does not revoke wallet permissions.
- Wrong-chain transactions stay disabled. Switch requests use the runtime configuration; unknown-chain errors trigger the exact `wallet_addEthereumChain` request, followed by another switch.
- Public reads use the three configured public RPCs in fallback order. Before enabling writes, the page checks RPC chain ID, nonempty contract code, the ABI hashes and the clock’s `token()` binding to the handoff. This is not a runtime-bytecode equivalence proof or an independent attestation signature check.
- A snapshot pins related game/token reads to one block. Balances use the DOOM address returned by `token()` and its on-chain decimals. The page refreshes every 15 seconds, rejects RPC blocks older than 180 seconds, and gates transactions while refreshing, on read errors, or after 45 seconds without a fresh snapshot. There is no backend, indexer, event list or local fabricated live state.
- Buy 1–100 keys. Quotes come from `priceOfNext`. The initial maximum is quote + 1%, rounded up in base units; it is then user controlled. `Use quote + 1%` explicitly resets it. Invalid amounts, excessive decimal precision and a cap below the quote block approval/purchase. Buying conservatively requires balance and allowance to cover the entire maximum, even if the current quote is lower.
- `Approve DOOM` sets an exact finite allowance equal to the displayed maximum, never unlimited. The page waits for the receipt before enabling `Buy keys`. An existing sufficient allowance displays as approved. Purchases do not send ETH to the game; the wallet still needs Sepolia ETH for network gas.
- `Settle round` unlocks only when a fresh on-chain timestamp reaches the end. The visual countdown is an estimate between blocks. A purchase can also settle an expired round and open the next one.
- Past-round lookup uses `roundInfo`, `keysOf`, `claimed` and `claimable`. An arbitrary settled round number is supported without scanning the chain. Claiming credits the withdrawable balance; `Withdraw DOOM` transfers that balance. Zero-value dust shares may still be claimed when keys exist and the round is unclaimed.
- Every write rechecks chain, account and current contract state and calls `simulateContract` before `writeContract`. Account/chain are checked again immediately before the wallet request. Pending actions block duplicates. Receipts, rejection/revert errors and explorer links are shown. Repriced replacements are tracked; cancelled/different-action replacements are not reported as successful game actions. After a submitted transaction times out, check its retained explorer link before retrying.

The implementation follows viem’s documented [simulation](https://viem.sh/docs/contract/simulateContract) and [write](https://viem.sh/docs/contract/writeContract) APIs. Simulation reduces avoidable failures; it cannot promise future inclusion or prevent competing transactions.

## Validation

Install the test browser into an ignored, scoped directory:

```sh
PLAYWRIGHT_BROWSERS_PATH=web/node_modules/.cache/browsers web/node_modules/.bin/playwright install chromium
npm --prefix web test
npm --prefix web run check:live
npm --prefix web run check:browser-live
```

`npm test` starts/stops its own preview and tests the **production export at `/preview/`**. Wallet and RPC interactions are mocked; all sends terminate in the mock. It writes interaction, accessibility, contrast, layout and screenshot evidence under `docs/evidence/`. `check:live` makes read-only RPC calls using curl and writes explicit block-tag evidence. `check:browser-live` starts its own preview and Chromium session, uses real public RPC reads, and closes both on completion. It does not connect a real wallet or sign anything.

See [validation](../docs/VALIDATION.md), [implemented design](../docs/DESIGN.md) and [guide attribution](../docs/DESIGN-NOTICE.md). No Foundry or deployed-source files changed. Hosting, CID/naming, publication checks and deployment are outside this worker assignment.
