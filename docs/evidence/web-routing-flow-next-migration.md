---
title: "Next.js route and browser-state flow"
status: "Implementation"
created_at: "2026-09-05"
updated_at: "2026-09-05"
---

# Next.js route and browser-state flow

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

The runtime master artifact remains 30,107,913 bytes uncompressed and 2,260,578 bytes with gzip. It is
the dominant payload and is deferred because its canonical schema and validation flow are a separate
semantic family.

## Test-server ownership delta

The former browser-observation contract owned Vite development-client console and WebSocket events.
After migration, E2E serves a completed Next.js build with `next start`, matching Vercel's production
runtime rather than a development server or static-export fallback. The replacement contract owns the
exact Next production identity; there is no HMR/WebSocket failure class to reinterpret. Application
console, page errors, resource failures, and exact allowances remain fail closed.

## Verification

- Unit: 75 files, 416 tests passed.
- Production master: 24 files, 116 tests passed, including calculator/ranking parity and fail-closed
  inventory checks.
- Next production E2E: 3 files, 25 tests passed, including all matrix paths above.
