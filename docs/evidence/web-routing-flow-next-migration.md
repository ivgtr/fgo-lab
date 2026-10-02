---
title: "Next.js route and browser-state flow"
status: "Complete"
historical_status: "Implementation"
status_scope: "Next移行・master配信・route splitの4 commitに属する実装・測定記録。現HEADの性能・受入を所有しない"
created_at: "2026-09-05"
updated_at: "2026-09-05"
---

# Next.js route and browser-state flow

## Evidence scope and current contracts

This note is supporting historical evidence for the Next migration and its route/master delivery
measurements. The original implementation boundaries are `c216284e3edcdb4b741364f8548a617464ffea69`
(Next migration), `2a818bdb024d07dadd2a2b2c71075c114314091b` (master cache),
`2c1a978db1ce1b794748627fbf888ea678e09f55` (validated startup), and
`907f2514f0f1c06d30d9d39419ba843a35ca043e` (route interaction bundles).
The sizes, timing, test counts, and `Verified` references below belong to those measurements;
they are not measurements or test identifiers for the current HEAD. No successor reproduces these
before/after measurements, so the original values remain here.

Current route and browser ownership is governed by [ADR-029](../adr/029-next-vercel-routing.md),
[canonical data flow](../guides/data-flow.md), and the [UI contract](../requirements/ui-design-spec.md).
The direct implementation is `app/layout.tsx → App.tsx` (pathname, lazy views, navigation),
`app/startup.ts → adapters/repository.ts` (download, validation, atomic activation and receipt load),
and `public/sw.js` (master-payload cache exclusion). Current receipt versions and test identifiers
must be read from those owners; the historical receipt description below does not fix their versions.
Current acceptance and remaining work are linked by the [evidence index](README.md#読み分けと現行の受入先)
and [Tasks](../tasks/development-redesign-tasks.md). The original metadata value `Implementation` is preserved in `historical_status`.
Frontmatter `Complete` describes this recorded migration scope; it does not claim current-HEAD acceptance.

## Outcome and ownership

The Web shell owns route identity and navigation commands. Next.js App Router owns URL matching and
route-specific delivery. Browser adapters continue to own IndexedDB, service worker, fragment share,
and Worker connections. Calculation application and battle execution remain the only owners of
calculation and ranking semantics.

User-visible outcome: every major screen has a stable path and direct navigation loads only that
route's UI chunk, without changing damage, ranking, persistence, recovery, or offline outcomes.

## Canonical route inventory

| Page | Path | URL-owned state |
| --- | --- | --- |
| home | `/` | none |
| calculator | `/calculator` | share snapshot in fragment |
| ranking | `/ranking` | filters and policy in query |
| servants | `/servants` | none |
| craft essences | `/craft-essences` | none |
| supports | `/supports` | none |
| growth | `/growth` | none |
| data | `/data` | none |

## Flow closure matrix

| State / path | Producer | Consumer / writer | Expected outcome | Status |
| --- | --- | --- | --- | --- |
| direct route load | App Router path | Web shell and route chunk | matching heading and page; no unrelated page UI chunk | Verified: Next production build plus E2E-017 reload |
| sidebar / bottom / home navigation | typed page command | Next router | history entry and matching route | Verified: E2E-017, E2E-020, E2E-021 |
| browser back / forward | browser history | App Router | matching page without duplicated route state | Verified: E2E-017 |
| leave calculator | navigation command | history finalizer then router | current calculation finalized once | Verified: E2E-017 plus workspace finalization idempotence unit fixture |
| ranking detail to calculator | ranking command | draft writer then router | same portable request opens at `/calculator` | Verified: E2E-050 damage parity and handoff |
| calculation share | fragment writer / direct URL | startup adapter | share opens `/calculator`; invalid share remains repairable warning | Verified: E2E-045 plus share adapter invalid-state fixtures |
| ranking query | ranking URL-state adapter | ranking controls | query survives serialization, reload parsing, and history parsing | Verified: ranking URL-state round-trip and invalid-domain unit fixtures |
| setup / IndexedDB recovery | startup adapter | persistent application shell | same ready/setup/invalid/offline classes | Verified: E2E-025, E2E-046, E2E-047 |
| service-worker reload | visited Next response and required assets | browser cache | visited shell and required assets reopen offline; old Vite cache is removed | Verified: E2E-023 |
| ranking Worker | route-specific ranking chunk | Worker protocol | same results and calculator handoff | Verified: E2E-050 plus production parity suite |
| ranking initial presentation | ranking route boundary | summary controls and rows | detail presentation and calculator handoff code are not fetched before their interactions | Verified: production loadable manifest |
| ranking detail expansion | selected calculated row | lazy detail presentation chunk | same canonical evidence and calculator command | Verified: focused ranking detail tests plus E2E-050 |
| unknown path | App Router | Next not-found response | HTTP 404 with no plausible page fallback | Verified: E2E-001 |
| calculation semantics | calculation application / execution | calculator and ranking | no producer, consumer, or rule changes | N/A: routing does not modify semantic state |

## Performance evidence

Before migration, Vite emitted one 636.98 kB minified application chunk (177.78 kB gzip), a 306.71 kB
ranking Worker, and 47.16 kB CSS (9.70 kB gzip). The final Next production HTML declares 618.60 kB
of modern initial JavaScript (180.93 kB gzip) and 10.12 kB initial CSS (3.29 kB gzip). Next also emits
a 112.59 kB `nomodule` compatibility script (39.63 kB gzip), which is excluded from the modern-browser
comparison. The modern JavaScript bootstrap is 3.15 kB gzip larger than the former Vite chunk, while
initial CSS is 6.41 kB gzip smaller.

Feature code is no longer part of the declared initial scripts. The generated loadable manifest gives
independent lazy boundaries including home at 1.22 kB gzip, calculator UI at 21.73 kB gzip, ranking UI
at 10.52 kB gzip, servants at 5.26 kB gzip, growth at 1.49 kB gzip, and data at 1.54 kB gzip. Shared
calculation/application chunks load only for calculation-family and support paths. This migration
therefore establishes selective loading without claiming that the framework bootstrap itself is
smaller.

The subsequent route-boundary split removes the shared calculation orchestrator from home, calculator,
and ranking delivery. Measured from the production loadable manifest, the complete initial lazy
payloads changed as follows (JavaScript gzip, excluding the already-declared shell): home 49.90 kB to
45.57 kB, calculator 70.42 kB to 68.19 kB, and ranking 59.20 kB to 6.15 kB. Ranking detail
presentation is now a separate 5.59 kB interaction chunk, while the 44.95 kB canonical portable
handoff/application chunk loads only when the user opens the selected result in the calculator. The
ranking Worker remains independently bundled and continues to own summary/detail calculation. Direct
package subpath exports expose the small ranking presentation contract without pulling the full
calculation application barrel into the initial ranking UI.

The runtime master artifact remains 30,107,913 bytes uncompressed and 2,260,578 bytes with gzip. It is
not imported by a Server or Client Component and is therefore absent from the JavaScript bundle. The
browser downloads it as a separate artifact only during initial setup or after the manifest announces
a new version, verifies its byte length, SHA-256, schema, references, and version, then atomically
activates it with a versioned validation receipt in IndexedDB. Normal revisits download only the
548-byte manifest, hash the stored source bytes against the receipt, parse those proven bytes, and
check schema version, master version, and artifact identity. They do not repeat the full schema and
reference scans. A production-file Node baseline measured those removed repeat scans at 1.05 seconds
and 0.94 seconds respectively, while the resulting hash-and-parse load measured 0.28 seconds with
fake IndexedDB in the same environment. These figures are directional; browser hardware remains the
user-visible performance authority. A missing or contradictory receipt, or any nested byte mutation,
fails closed and triggers a fresh download and full validation. Service Worker cache excludes the
master payload to avoid storing a second 30 MB copy; it retains the manifest and visited application
shell for offline startup.

## Master delivery delta

| Canonical state / path | Network read | Local transition | Status |
| --- | --- | --- | --- |
| no active master | manifest, then required payload | validate and atomically activate in IndexedDB | Verified: setup journey and production inventory |
| active version equals manifest | manifest only | retain active snapshot | Verified: E2E-023 asserts zero payload requests on revisit |
| manifest announces a new version | manifest, then required payload | validate, stage, and atomically replace active snapshot | Verified: incompatible-version recovery journey |
| update request or validation fails with valid active master | attempted update only | retain previously validated active snapshot and warn | Verified: startup fallback contract |
| no valid active master and payload is unavailable or invalid | attempted initial download | do not create a plausible active snapshot | Verified: fail-closed startup and production validation contracts |
| offline revisit with active master | cached manifest when available | use IndexedDB active snapshot | Verified: E2E-023 offline reload |
| Service Worker runtime cache | shell assets and manifest only | never duplicate the master payload outside IndexedDB | Verified: E2E-023 cache inventory assertion |
| missing, stale, contradictory, or byte-mismatched activation receipt | manifest after local discard | never trust an unproven or mutated stored snapshot; reacquire and fully validate | Verified: focused pre-receipt and nested-mutation fixtures |

## Test-server ownership delta

The former browser-observation contract owned Vite development-client console and WebSocket events.
After migration, E2E serves a completed Next.js build with `next start`, matching Vercel's production
runtime rather than a development server or static-export fallback. The replacement contract owns the
exact Next production identity; there is no HMR/WebSocket failure class to reinterpret. Application
console, page errors, resource failures, and exact allowances remain fail closed.

## Verification

- Unit: 76 files, 421 tests passed.
- Production master: 24 files, 116 tests passed, including calculator/ranking parity and fail-closed
  inventory checks.
- Next production E2E: 3 files, 25 tests passed, including all matrix paths above.
- Route-boundary completion gate: `pnpm quality` passed with 421 unit, 116 production, and
  25 Playwright tests; warnings and unexpected console events were both zero.
