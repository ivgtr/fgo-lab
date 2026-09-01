---
title: "TSK-07 ranking Web and worker canonical cutover"
status: "Active"
updated_at: "2026-09-01"
---

# TSK-07 ranking Web and worker canonical cutover

> Structural review reopened this flow. The five-field URL/protocol cutover evidence below remains historical verification. Portable calculation identity is closed by TSK-06.1; TSK-06.2 closed E2E ownership with Blocking 0. Evidence cache ownership remains TSK-07 scope and is now ready to resume.

## Outcome and ownership

The ranking screen, public URL state, worker protocol, worker cache, response ordering, and detail
evidence use one `RankingPolicyConditions` contract with exactly five fields:
`comparisonMode`, `npLevel`, `classAffinity`, `selfBuffs`, and `conditionalEffects`. The cutover is
destructive. The old independent `specialAttack` and `field` inputs have no reader, writer, adapter,
fallback, compatibility flag, or runtime calculation path.

The application ranking policy owns scenario selection and typed
`calculated | unavailableUnderPolicy | invalid` outcomes. Battle execution remains the only owner of
ordered preparation and damage semantics. The worker runtime currently owns request fingerprinting and caches
complete canonical calculations, which violates the proposed evidence-free cache contract. Web code renders the canonical presentation model and dispatches
condition/detail commands; list filters and display metrics remain local presentation state and do
not issue worker calculations.

## Read-only entry audit and TSK-06 carry-over

The entry audit started from `b325ef55a2b8ed094eee1f69464615e058d3018b` with a clean worktree.
The original audit treated the TSK-06 deferral as only the legacy UI/worker/URL cutover and policy evidence
presentation. Structural review found that portable start gauge/contribution handoff and cache-value ownership were also deferred. Cross-level blueprint/cache optimization and the full NP1–NP5 × four-policy
production digest remain deferred to TSK-08.

| Surface | Producer | Reader | Writer / recovery | Entry classification |
| --- | --- | --- | --- | --- |
| Web controls | `RankingConditions` | canonical presentation labels | five command dispatches | Verified |
| presentation | policy rows/details | `Ranking`, `RankingList`, `RankingEffectDetails` | local filter/sort/metric only | Verified |
| worker request | `useRanking` | thin worker adapter/runtime | initialize, calculate, detail | Verified |
| worker response ordering | worker runtime | `useRanking` | request ID plus canonical fingerprint rejection | Verified |
| cache identity/value | five-field fingerprint | calculation/detail caches | current complete result and accumulated evidence | Deferred: TSK-07; summary must be evidence-free, worker detail 0, React detail maximum 1 |
| URL | `serializeRankingState` | `parseRankingState` | canonical `rConditional`; obsolete params removed | Verified |
| detail evidence | selected `RankingPolicyDetail` | pure presentation builder | profile, start gauge, facts, ordered actions | Verified |
| portable calculator handoff | versioned application request emitted from selected ranking candidate | calculator/workspace | TSK-06.1 owns identity/persistence and immediate Web wiring | Verified: `RK-HANDOFF-001` closed by TSK-06.1 |
| old policy/fallback | removed files and exports | no production reader | no compatibility recovery | Verified |
| full four-policy production digest | application production audit | TSK-08 | shared final audit model | Deferred: TSK-08 |

No unrecorded external URL contract was found. Ranking URL state is an internal query contract, and
the requirements explicitly require old readers to be deleted. Old `rSpecial` / `rField` values are
ignored on parse and removed on the next serialization; they are not interpreted or migrated.
The destructive five-field cutover and wider portable calculation identity remain verified, but the cache family does not close. No external URL compatibility was newly inferred; old ranking-condition URL fields remain intentionally rejected. Old calculation share schema is rejected by the implemented portable contract.

## Canonical flow

```text
five Web commands
  -> canonical URL serialization
  -> calculate request
  -> worker-owned five-field fingerprint
  -> calculateRankingPolicy
  -> rows + typed exclusions + current evidence-bearing cache (Deferred: TSK-07)
  -> request ID/fingerprint stale-response gate
  -> local filter/sort/metric presentation
  -> detail command with the same fingerprint
  -> current worker/React detail accumulation (Deferred: TSK-07)
  -> profile/fact/ordered-action evidence presentation
```

## Counterexample and closure matrix

| State by path | Classification |
| --- | --- |
| all five controls expose accessible names and keyboard order | Verified: component and E2E |
| select popup expanded state | Verified: E2E `aria-expanded` transition |
| desktop / 390 px / 320 px, collapsed and expanded detail | Verified: no document overflow and reviewed snapshots |
| filter, sort, or displayed metric changes | Verified: presentation-only; absent from protocol/fingerprint |
| two identical five-field requests | Verified: one policy calculation through worker cache |
| newer condition response arrives before an older response | Verified: older request ID/fingerprint cannot replace rows or exclusions |
| detail response belongs to an obsolete condition fingerprint | Verified: rejected before display/cache application |
| unavailable/invalid profile | Verified: typed exclusion; no numeric row or baseline fallback |
| nonbaseline start NP, false world fact, ordered preparation | Verified: detail evidence fixture |
| old `rSpecial` / `rField` URL | Verified: ignored and removed, never converted |
| old special-attack/field request fields or fallback | Verified: production source scan 0 and legacy runtime files deleted |
| damage semantics changes | N/A: battle execution is unchanged |
| full production digest across four policies | Deferred: TSK-08 |
| compatibility adapter or dual runtime | N/A: prohibited by destructive cutover |
| nonbaseline request through draft/history/share/backup/fingerprint | Verified: TSK-06.1 portable request implementation |
| repeated detail open/close/condition/context changes | Deferred: TSK-07 evidence-free bounded cache implementation |

## Inventory and parity

The canonical default production audit retains 433 attack profiles and 433 ranking rows with zero
exclusions. The shared digest is
`fef0cb14a63ecdb8292773e7d17030720b4314c92521e5d46a9f32274ec58d7e` after replacing legacy
detail records with canonical candidate evidence. The runtime counter contract is 6,376 candidates,
3,957 deduplicated candidates, 6,913 damage requests, and 1,599 distinct damage inputs, matching the
TSK-06 inventory.

A focused real-fixture test passes a worker-produced scenario, start gauge, and contribution
projection back through the calculator and compares the complete result and effect evidence. The
default production ranking returns 433 rows / 0 exclusions; the satisfied policy returns 424 rows /
9 typed exclusions. Nemo's focused worker E2E changes from 44,551 baseline average damage to 105,891
when conditional effects are satisfied, then returns to 44,551 without using an old field axis.

## Verification and performance

| Check | Result |
| --- | --- |
| focused component / URL / worker / stale response | 8 files / 14 tests passed |
| unit suite | 62 files / 350 tests passed |
| production suite | 24 files / 111 tests passed |
| compact runner suite | 17 tests passed |
| focused ranking E2E | 9 tests passed after snapshot update |
| full E2E performance sample | 64 passed / 32 skipped |
| final phase gate | `pnpm quality` passed |

Build was measured three times on the same worktree state. Median wall time changed from 2.08 s
(4.90 / 2.08 / 1.99) to 1.87 s (6.06 / 1.87 / 1.87), a 10.1% improvement. The worker bundle changed
from 264.56 kB to 269.38 kB (+4.82 kB / +1.82%); application modules fell from 256 to 248. The main
bundle changed from 592.60 kB / 165.45 kB gzip to 593.30 kB / 165.88 kB gzip.

Per the execution-time instruction, the after-change full E2E performance measurement was run once:
693.31 s. Its 64 passed / 32 skipped outcome matches the baseline's three runs (584.12 / 575.60 /
580.56 s; median 580.56 s). The increased single observation is explained by the satisfied-policy
worker scenario added to the smoke gate and is not treated as a stable median. The final canonical
quality gate revalidates the same E2E contract but is not an additional performance sample.

## Artifact manifest and source removal

Seven intentional Playwright baselines were updated: ranking desktop, 390 px, 320 px, desktop detail,
320 px detail, compact row, and deterministic icon fallback. They were visually reviewed for control
wrapping, evidence order, readable labels, and overflow.

The final production-source scan covers obsolete condition symbols, URL keys, readers, matrix
facades, and legacy runtime filenames and returns zero matches. Deleted runtime modules include the
legacy field/world selectors, legacy ranking facade/candidate/matrix/scenario/preparation family, and
their legacy-only tests. Historical evidence and baseline-audit references are retained as records,
not runtime readers.

The recorded test and performance results are historical evidence for the five-field cutover. They do not prove portable restore parity or bounded cache values because those cases were absent from the gate design.

Closure: Blocking 0, Deferred 2

- Verified: TSK-06.2 closed E2E case ownership, project assignment, setup/ranking repetition, and the current performance baseline.
- Deferred: TSK-07 separates summary/detail evidence and enforces maximum cardinality.

TSK-07 is ready after TSK-06.2 reached Blocking 0; TSK-08 may not start. Cross-level optimization and the full production digest remain deferred to TSK-08 after TSK-07 closes.
