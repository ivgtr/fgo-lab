---
title: "TSK-06.1 portable calculation identity flow closure"
status: "Active"
updated_at: "2026-09-01"
---

# TSK-06.1 portable calculation identity flow closure

## Baseline, outcome, and invariant

Design audit baseline is `c5511221c0fc2ec1baabaa4838b3c7c396b20f43` with a clean worktree. This phase changes documentation only; runtime remains at schema 32 and retains the mismatches below.

After the separately approved implementation, a selected ranking calculation must reopen, restore, copy, share, and back up as the same calculation without adding an initial-NP editor. The invariant is one portable request per damage result:

```text
resolved CalculationScenario
+ initial NP gauge
+ typed contribution intent
= PortableCalculationRequest
```

The product requirements own portable identity and migration (`CALC-PORTABLE-001`). Ranking requirements own selected-candidate handoff (`RK-HANDOFF-001`) and bounded evidence cache (`RK-CACHE-001`). `calculation-application` is the only semantic compiler from typed intent plus current master to contribution projection.

## Structural finding and earlier review gap

Confirmed mechanism: execution already depends on scenario, contribution projection, and preparation options, but workspace fingerprint, draft, history, and share identify only scenario. TSK-06 parity tests supplied projection and initial NP directly, proving executor parity but not production handoff or portable restore parity. TSK-07 then cached complete policy results and accumulated details in both worker and React.

Implementation mismatch: distinct calculations can share an identity, derived projection disappears on recovery paths, and evidence cache cardinality grows with profiles or opened rows. Missed detection: prior matrices audited candidate execution and cache keys, not production entrypoint transport, cache values, lifetime, owner, or restore paths. The recurrence scope is every scenario-external input that changes damage, precision, outcome, fingerprint, recovery, or UI command.

Minimum guardrail: when a calculation entrypoint gains a semantic argument, reopen immediate handoff, draft, history, share, backup, fingerprint, migration, and cache value matrices. Separate execution, handoff, persisted restore, and portable share parity.

## Canonical design

- Resolved requests carry `initialNpGauge` and `standard | excludeVoluntarySkillModifiers`; manual requests carry only `manual` intent.
- Request and persistence never contain projection, `Set`, raw／compiled operation ID, compiled operations, or derived execution state.
- Normal calculator explicitly creates `10000 + standard`. Ranking creates the adopted gauge and typed contribution intent.
- Inherited intent remains visible and non-editable through scenario edits until the explicit “通常の計算条件へ戻す” command creates `10000 + standard`. No hidden reset or hidden retention after reset.
- Capacity overflow, schema/reference/version/master mismatch, and mode contradiction are `invalid`; a coherent request whose known semantics current engine cannot execute is `unsupported`.
- Manual scenario accepts only manual intent. No resolved resource policy is inferred.
- Fingerprint includes the full request plus master and engine versions.
- Exact schema 32 profile／backup migration preserves safe profile data and discards old draft／history. Old-schema share and arbitrary old／future schema fail closed. A current share without its master may show only the stored historical result, never a recalculated current result. Failed migration never clears the user store.

Product decision alternatives remaining: 0. Approval remains required before runtime implementation.

## Producer, reader, writer, and recovery inventory

| Path | Producer | Semantic reader | Writer / recovery | Design classification |
| --- | --- | --- | --- | --- |
| normal calculator | application request constructor | application compiler/executor | workspace | Verified |
| ranking handoff | selected candidate scenario, gauge, policy | same compiler/executor | calculator command | Verified |
| projection | typed contribution intent + current master | battle execution | derived in memory only | Verified |
| fingerprint | full request + master/engine versions | workspace/cache identity | no scenario-only fallback | Verified |
| draft | workspace request | repository/application restore | current request only | Verified |
| history finalize/copy | calculated request/result | workspace/repository | copy restores request | Verified |
| share URL/JSON | current request/result | strict current-schema parser | old-schema share rejected | Verified |
| backup export/import | current profiles | current parser or exact-v32 migrator | current format only | Verified |
| startup migration | exact schema 32 stored profile | isolated migrator | safe profile data retained; snapshots dropped | Verified |
| manual mode | manual request constructor | manual executor | manual intent only | Verified |
| worker summary | ranking application summary | worker/useRanking | latest success, maximum 1 | Verified |
| detail evidence | selected entry request | application materializer | worker cache 0; React maximum 1 | Verified |

Runtime closure for portable paths is `Blocking: CALC-PORTABLE-001 implementation not started`; ranking handoff/cache paths remain `Blocking: TSK-07`. No runtime reader, writer, or migration was changed in this design phase.

## Portable request counterexample matrix

Every `Required` cell must use the same request identity; direct test-only reinjection does not close it.

| State | Immediate handoff | Draft restore | History finalize/copy | Share URL/JSON | Backup export/import | Fingerprint | Migration/rejection |
| --- | --- | --- | --- | --- | --- | --- | --- |
| normal 100% + standard | Required | Required | Required | Required | Required | unique baseline | current schema accepted |
| 200% start, OC changes | Required | Required | Required | Required | Required | distinct from 100% | capacity overflow invalid |
| self-buff exclusion | Required | Required | Required | Required | Required | distinct from standard | compile failure classified without fallback |
| conditional satisfied | Required | Required | Required | Required | Required | scenario world distinct | missing reference invalid |
| invalid / old schema | fail closed | fail closed | fail closed | old-schema share rejected | exact v32 only | N/A | safe profile preserved; arbitrary old/future rejected |

All implementation cells are `Blocking: TSK-06.1 runtime implementation and verification`; the matrix itself and expected outcome classes are `Verified` as design.

## Cache and stale-detail matrix

| Event | Worker summary | Worker detail | React active/in-flight | Required result |
| --- | --- | --- | --- | --- |
| summary success | replace latest, maximum 1 | none | unchanged | evidence-free rows + typed exclusions |
| detail open | unchanged | materialize, cache 0 | replace with requested entry, maximum 1 | only selected evidence |
| detail close | unchanged | none | clear both | late response rejected |
| condition change | invalidate/replace by fingerprint | none | clear both | old fingerprint rejected |
| context change | clear | none | clear both | old context rejected |
| response reordering | current identity only | cache 0 | request ID and fingerprint must both match | stale detail never displayed |

All rows are `Blocking: RK-CACHE-001 implementation in TSK-07`. TSK-08 retains ownership of prepared damage matrix and NP1–5 cross-level optimization.

## Closure

Closure: Blocking 2

- portable calculation identity: design has one recommendation and no unresolved product alternatives; approval and runtime implementation remain open.
- evidence cache ownership: contract is fixed; TSK-07 runtime implementation and verification remain open.

TSK-06.1 remains `in_progress` at the approval gate. TSK-07 and TSK-08 remain blocked. This note must be updated with implementation evidence rather than replaced by another family note.
