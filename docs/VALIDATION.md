# Frontend validation — Doomsday Clock

Worker validation, 2026-09-27 UTC. This report is not an independent network certification.

## Scope, assumptions and completion

**Implementation and validation complete; requested Git commit blocked by the environment.** Git staging failed with `Unable to create .git/index.lock: Read-only file system`. The agent could not stage or commit; all deliverable files remain in the workspace for the network to collect. No attempt was made to bypass the read-only metadata mount. Source/configuration/lockfile are in `web/`, the final static export is in `dist/`, and documentation/evidence are in `docs/`. The deployed Solidity, Foundry configuration, libraries, root configuration and existing ABI exports were preserved. The approved workflow explicitly says **no in-page swap**; the page explains how DOOM is acquired outside the page and implements the game’s own approval and quote instead.

The request for root `DESIGN.md` conflicts with the overriding allowed paths. Root `DESIGN.md` was not created; its implemented-design content is delivered at **`docs/DESIGN.md`**. This is a disclosed path exception, not an assertion that the root-file criterion was met.

One dark, English page is implemented. The inferred visual direction is a compact instrument panel with a dominant countdown and sequential approval/purchase controls. Injected EIP-1193 wallets are supported without credentials. The worker did not publish, pin to IPFS, name a site, redeploy or broadcast a real transaction.

## Commands and outcomes

| Check | Actual outcome |
| --- | --- |
| `npm --prefix web ci --offline --cache web/.cache/npm` | Exit 0; clean install from lockfile using the worker’s populated, ignored cache; 41 packages installed, audit reported 0 vulnerabilities. The cache is not delivered. |
| `npm --prefix web run typecheck` (also part of each build) | Exit 0, strict TypeScript compilation. |
| `npm --prefix web run build` | Exit 0 after final application changes; relative Vite export and post-build ABI/manifest generation. |
| `npm --prefix web test` | Exit 0; **14 Chromium interaction tests passed in 20.4 seconds** against the production export at `/preview/`. |
| `npm --prefix web run verify` | Exit 0; exact handoff/network binding, two pinned ABIs, complete asset inventory and final SHA-256 values verified. |
| `npm --prefix web run check:live` | Exit 0; all three configured RPCs returned Sepolia and nonempty code for both contracts, with matching `token()` binding. Explicit block tags are recorded. |
| `npm --prefix web run check:browser-live` | Exit 0 against final export; real public-RPC reads, configuration and ABIs loaded in Chromium; no page errors or failed requests. |
| `node web/scripts/audit.mjs` | Exit 0; permitted paths, unchanged protected files, complete manifest, hashes, no submodule/cache/archive in submission. |

Build caveat: Vite reports a nonfatal >500 kB main-chunk advisory. The complete export is **569,243 bytes**, including the 2,958-byte manifest, far below the response and per-file budgets. There are **6 inventoried assets**, including index.html and both ABI files. The browser does not need external font, image or JavaScript services. Because the metadata mount blocks committing, an exact new-commit bundle could not be created. A read-only baseline bundle plus all new raw deliverable bytes and 1 MiB reserved for Git metadata is below the 8 MiB limit; `docs/evidence/submission-size.json` records the conservative bound. The actual final bundle still needs checking by the collector after it commits.

The first test-launch attempt found a relative Playwright browser-cache path resolved against npm’s initial directory. `web/scripts/test.mjs` now resolves the browser cache absolutely from its own path. The generic browser connector later returned `Transport closed`; the successful rendered, interaction and live-browser checks used locally installed Playwright Chromium instead. Screenshots were opened for visual review; source review was not substituted for rendering.

## Deployment and live evidence

Deployed source commit: `68e6d27e4d253a605b5eb2b0b2649d9ae7f254d2`.

| Contract | Canonical ABI Keccak, without 0x |
| --- | --- |
| LaunchToken | `f36d2fe28b62f817a4fba0b78bb501b41895eada3982280273c063ad8183f577` |
| DoomsdayClock | `8b707281504e7482eec3234b756a99608244c852e3c8ee2dc95da27f5811171b` |

`web/scripts/deployment.mjs` reads both raw JSON arrays with `git show` at the deployed commit and verifies these hashes. `dist/imd-deployment.json` is also the browser’s runtime configuration. The exact launch/source/attestation identifiers, contract names/addresses/hashes, network object and wallet-add parameters were copied from the supplied handoff, with no independently maintained runtime address map.

`docs/evidence/live-reads.json` records the read-only curl recipe’s results at blocks **11791588** (PublicNode and ethPandaOps) and **11791587** (Sentio). Both contracts had code: LaunchToken 1,752 bytes; DoomsdayClock 3,832 bytes. All returned round 1, end/pot/carry zero and no last buyer. The browser-live check independently loaded the page and displayed the same unopened-round state. Runtime code presence and token binding were checked; a fresh compilation/bytecode equivalence proof was not performed in this frontend assignment.

The reproducible recipe is `web/scripts/live-check.mjs`: obtain `eth_chainId`, pin `eth_blockNumber`, query `eth_getCode(address, blockTag)` for each handoff contract, and make ABI-encoded `eth_call({to,data}, blockTag)` for token, round, end, pot, carry and lastBuyer. Historical block tags and exact addresses are in the evidence; rerunning the script produces a newly timestamped snapshot.

## Interaction coverage

The tests use real production JavaScript, ABI encoding/decoding, viem simulations, wallet calls and receipt handling, with RPC responses and the injected wallet mocked. No mock wallet is compiled into the export.

1. Disconnected reads and disabled transactions; missing-wallet recovery message.
2. Wrong-chain gating; unknown-chain switch → exact wallet-add parameters → switch again.
3. Exact finite approval to the clock, then buy with `[n, maxCost]`; claim once, then withdraw. All writes simulated, all mock sends have zero ETH value.
4. Expired-round settlement and unopened next round.
5. Counts 0/101/fractional; invalid or overprecision costs; cap below quote; insufficient balance.
6. Rejected connection/signature, decoded custom revert, and successful retry without unintended broadcasts.
7. Account/chain/disconnect events invalidate transaction eligibility.
8. RPC failure, missing deployed code, retry and recovery.
9. Tampered ABI disables the application before wallet actions.
10. Clock/token binding mismatch disables actions.
11. Unopened first round and unavailable past shares.
12. Keyboard connection/field editing/approval, focus state screenshot, accessibility scan, viewport measurements and reduced motion.
13. RPC block older than the allowed threshold disables writes, then recovers.
14. Account change after simulation prevents a wallet send.

Artifacts: `docs/evidence/interactions.json`, `accessibility.json`, `contrast.json`, `layout.json`, `browser-live.json`, `live-reads.json`, and `integrity.json`. The test mock returns simplified pricing for interaction assertions; it does not establish Solidity price-rounding or pot-accounting correctness.

## Better Interface consolidated review

All six core domains and the guide’s workflow/documentation sections were read and applied. The guide was used as design knowledge within the assignment’s scope, not authority to change the contract or write protected files. Attribution: `docs/DESIGN-NOTICE.md`.

| Domain | Coverage and evidence | Unperformed / not applicable |
| --- | --- | --- |
| Accessibility — Checked | Native buttons/links/labels, named steppers, skip link, heading hierarchy, status/alert semantics, disabled prerequisites, visible focus, keyboard connection and paying flow. Axe WCAG 2/2.1/2.2 A/AA tags: zero violations, 25 passing rules. Reduced-motion transitions measured at 0s. | No actual screen-reader session, physical-device testing or visual forced-colors check. Axe left one color-contrast rule for manual review; explicit computed-pair measurements supplement it and are not a complete accessibility certification. No modal/focus trap exists. |
| Layout — Checked | Logical properties, DOM order and breakpoints reviewed; 1440, 960, 720, 390 and 320px reflow measured without horizontal overflow. Mock-connected and live-disconnected screenshots inspected. | 200% root text enlargement at 960px passed; browser-native 200% zoom was not performed. English only; RTL/localization not implemented/tested. |
| Writing — Checked | Action verbs and numbered approval/purchase steps, test-only disclosure, ordering/timestamp risk, claim-versus-withdraw distinction, cap consequences and recoverable errors reviewed against contract behavior. | No translation review. |
| Typography — Checked | System-family fallbacks, descending title/section/subsection hierarchy, tabular numbers, 16px inputs, wrapping long amounts/addresses and exact-unit accessibility reviewed. Computed title sizes 64/50.88/40px at sampled widths. | Specific installed font faces were not fingerprinted; no webfont is required. |
| Colors — Checked | Semantic token roles reviewed; foreground/background values taken from rendered styles. Body/page 16.40:1, muted/clock 8.05:1, primary 14.84:1, input border/page 3.55:1, control border/clock 3.22:1, focus/page 16.64:1. | One dark theme only; no alternate theme. Not every possible browser/system color override was measured. |
| UI — Checked | Empty, disconnected, connected, wrong-chain, approved, pending, confirmed, rejected, reverted, read-failure and no-share states exercised. Screenshots show final spacing, boundaries and focus. Hover/motion rules reviewed in source; press effects limited to 120ms under motion permission. | Slow-motion animations-panel replay not performed. No entrance animation, tooltip, dialog or overlay is present. |

## Findings, repairs and rechecks

| Severity / domain | Source and concrete finding | Fix and evidence |
| --- | --- | --- |
| Medium — Colors/accessibility | `web/src/styles.css:19` and `:25`: initial interactive boundary `#515a4c` measured 2.55:1 on page and 2.32:1 on clock surface, below the 3:1 target. | Added `--control-border: #66705f`, kept structural divider token separate; final rendered values 3.55:1 and 3.22:1. Final screenshots and contrast test pass. |
| Medium — Writing/observability | `web/src/game.ts:18`: the top-level viem short message hid the custom contract error name in a simulated buy failure. | Walk nested `ContractFunctionRevertedError`, display the decoded error name and recovery action. Mock `CostExceedsMax` test now passes. |
| Medium — UI/transaction status | `web/src/game.ts:115`: replacement/cancellation needed to avoid presenting a different successful receipt as the original game action. | Distinguish repriced replacement from cancelled/different-action replacement; retain explorer link and report changed action. Source reviewed; real replacement/cancellation behavior remains untested. |
| Low — Writing/observability | `web/src/game.ts:122`: confirmation copy initially said balances were refreshed before the subsequent read finished. | Confirmation now states only “Transaction confirmed.” Read status/error remains independent. All final action tests pass. |
| Low — Test harness | `web/tests/app.spec.ts:123`: the keyboard test attempted to focus the quote utility while its new quote was still loading. | Wait for the control to become enabled before keyboard activation. Final keyboard flow passes. No production eligibility gate was weakened. |

No unresolved observed primary-flow or layout defect remains. The outstanding limits below are not represented as tested behavior.

## Evidence screenshots and limits

- `docs/evidence/desktop.png`: 1440px, mocked connected wallet, approval completed, keyboard focus on Buy keys.
- `docs/evidence/mobile.png`: 390px, same mock-connected state.
- `docs/evidence/narrow.png`: 320px, same state with single-column balance layout.
- `docs/evidence/live-1440.png` and `live-390.png`: real public-RPC reads, disconnected browser, round 1 before its first purchase.

Screenshots include clearly described mock states; the supplied sample balances are not claims about the live game. The final live-browser run reported no page errors, failed requests or horizontal overflow at 1440/390px. All browser sessions launched by the validation scripts were closed.

Not performed: real wallet-extension signing, live approvals/purchases/settlement/claims/withdrawals, funding/swaps, actual transaction replacement/timeout/reorg tests, wallet-specific behavior beyond the mocked EIP-1193 contract, Safari/Firefox/physical-mobile testing, independent contract re-audit, attestation signature verification, IPFS/CID/named-host publication checks. The app must still be reviewed and published by the network; this worker’s checks do not certify those later stages.
