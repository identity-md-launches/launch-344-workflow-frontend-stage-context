# Doomsday Clock design

## Overview

A single-page Sepolia test game for visitors connecting an Ethereum browser wallet. The implemented direction is a restrained dark instrument panel: a large stable countdown leads, followed by the pot and last buyer; the purchase panel sits beside it on wide screens. Personal balances and claims sit below, then rules and full contract addresses. The aesthetic is inferred for this assignment, not a separate approved brand system.

This document is in `docs/DESIGN.md` because the overriding write scope permits `docs/**` and forbids creating repository-root `DESIGN.md`. The final source is `web/src/App.tsx`, `web/src/styles.css`, and `web/src/main.tsx`.

## Colors

All values are in `web/src/styles.css:1`. Components use semantic tokens pointing to the hex primitives.

| Semantic token | Value | Use |
| --- | --- | --- |
| `--page`, `--on-accent` | `#121512` | Page/input background; text on lime buttons |
| `--surface` | `#1b1f1a` | Clock panel |
| `--surface-hover` | `#22271f` | Neutral hover and unavailable primary background |
| `--text` | `#f1f3e8` | Main content |
| `--muted` | `#aeb7a6` | Supporting text, labels and unavailable action text |
| `--border` | `#515a4c` | Structural dividers and panel boundaries |
| `--control-border` | `#66705f` | Interactive input/button boundaries |
| `--accent` | `#d8f36a` | The current purchase-flow action’s fill |
| `--accent-hover`, `--focus` | `#e5ff89` | Primary hover and keyboard focus |
| `--error` | `#ffb0a4` | Error text and outline |
| `--error-bg` | `#382321` | Error background |

One dark theme is implemented. Accent fill follows the paying flow: approval first, purchase once approved. Status has explicit words, never color alone. There are no gradients, image backgrounds or external color assets. Browser-computed foreground/background ratios are recorded in `docs/evidence/contrast.json`: body/page 16.40:1, muted/clock 8.05:1, primary button 14.84:1, input border/page 3.55:1, control border/clock 3.22:1, and focus/page 16.64:1. These cover named pairs, not a universal compliance claim.

## Typography

`--font-body` is Arial, Helvetica, sans-serif. `--font-number` is Courier New, Courier, monospace. The app bundles no fonts and makes no font-service requests; actual glyphs depend on installed system fonts. It uses normal and bold, no italic. `font-synthesis: none` and root font smoothing are enabled.

Body text is 16px with 1.5 line height. Supporting prose is 14px; fine print is 13px with 1.55 line height. The title is `clamp(2.5rem, 5.3vw, 4rem)`, 1.08 line height, and −0.055em tracking. Section headings are 24px/1.2, with 16px subsection headings. Small instrument labels are 10–11px, intentionally secondary rather than instructions. The desktop brand subtitle is 9px and disappears on mobile. Inputs remain 16px.

The countdown uses bold monospace, tabular numbers, a responsive 44–85px size and −0.065em tracking. Balances also use tabular numbers. Headings balance line breaks, prose uses pretty wrapping, and long amounts/addresses may wrap. `Value` displays up to four decimal places, preserves the exact amount in a title and screen-reader text, and labels very small values `< 0.0001`. No amount arithmetic uses JavaScript floating-point numbers.

## Layout

`.wrap` is capped at 1184px with 32px side margins on wide screens, 20px below 60rem and 16px below 45rem. The main grid is 1.65:1 with a 20px gap, moves to 1.2:1 below 60rem, and stacks below 45rem. Panels use 28px padding, reduced to 20px and then 16px at the narrowest size. Common content/control gaps are 8, 12, 16, 20, 24, 28 and 32px, with larger 36–52px section spacing.

Balances use four columns, two below 45rem and one below 23rem. Claim fields stack below their description on mobile. Rules move from three columns to one. Controls stay in normal document flow; there are no fixed overlays. Directional spacing uses logical properties. Addresses and values stay selectable.

Chromium reflow was measured at 1440, 960, 720, 390 and 320 CSS pixels, with no horizontal overflow. The root text-size enlargement to 200% at 960px also had no overflow; this is not browser-native zoom. Screenshots in `docs/evidence/` show final mock-connected desktop, mobile and narrow states. Physical devices and RTL rendering were not tested; only English is implemented.

## Elevation & Depth

The interface is flat. The clock’s slightly lighter surface groups the timer, pot and round state. Thin borders separate panels and data groups. There are no box shadows, floating cards, modal backdrops or stacked chrome. A visible keyboard focus ring is the only transient outer outline.

## Shapes

Major panels have 12px radii; fields and buttons have 6px radii; status pills use 30px. Boundaries are 1px. Focus is a 3px solid outline with a 4px offset. The inline SVG clock mark is local, uses `currentColor`, and is decorative. Arrows supplement text labels rather than naming actions.

## Components

- `App` in `web/src/App.tsx` owns the one-page state and sections. It renders `.clock-panel`, `.buy-panel`, `.wallet-panel`, `.rules`, and full-address footer links. These are patterns within this page, not a published component library.
- `Value({value, decimals})` presents exact bigint token data accessibly with a compact visual amount. Undefined state is a dash, never a fabricated balance.
- `Glyph` is the decorative clock mark. Do not use its decorative SVG as the sole accessible name of an action.
- Buttons: neutral bordered by default, `.primary` for the current approval/purchase step, `.full` for the two payment actions and `.text-button` for secondary utilities. Disabled controls use native `disabled`, dashed borders and explanatory nearby text. Pending labels retain the action word.
- Fields use persistent native labels, meaningful names, numeric/decimal keyboard hints and `aria-describedby`. Invalid key counts and cost limits are expressed in text and `aria-invalid`. The key stepper’s two native buttons are named “Remove one key” and “Add one key.”
- The transaction status region is persistent and polite. Wallet/read/write failures use alert regions. The countdown is a timer rather than an every-second live announcement. The first focusable element is a skip link.
- Startup loads and verifies the runtime deployment before mounting the game. Its failure state offers reload. An RPC failure preserves previously read values, labels them stale and offers retry while blocking writes. Empty rounds and no-wallet/no-share states explain what is missing.

Hover effects apply only to hover-capable devices. Under `prefers-reduced-motion: no-preference`, buttons have 120ms background/transform transitions and a 0.96 press scale. Reduced motion has no transition. Focus uses the system Highlight color under forced colors; that mode is implemented but was not visually tested.

## Do’s and don’ts

Reuse the semantic tokens, `.wrap`, existing field/button states and exact-unit `Value` presentation. Preserve one emphasized paying action at a time and place consequences beside it. Keep the live configuration in the manifest and contract state in reads; never put illustrative values in a production empty state.

Do not substitute an estimated countdown for transaction eligibility, hide full contract destinations, introduce unlimited approval or make claims imply automatic withdrawal. Keep primary actions in normal flow and preserve 16px inputs on mobile.

If another authorized page is added later, start with the same wrap, heading hierarchy, semantic colors and native controls; use hash navigation or an explicitly exported entrypoint. Verify the new page at the narrow widths and update this document from the final source. This assignment adds only one page.
