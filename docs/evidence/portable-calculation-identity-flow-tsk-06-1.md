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
master data version + engine version
+ origin (calculator | ranking | manual)
+ resolved CalculationScenario
+ initial NP gauge
+ typed contribution intent
= PortableCalculationRequest
```

The product requirements own portable identity and migration (`CALC-PORTABLE-001`). Ranking requirements own selected-candidate handoff (`RK-HANDOFF-001`) and bounded evidence cache (`RK-CACHE-001`). `calculation-application` is the only semantic compiler from typed intent plus current master to contribution projection.

## Structural finding and earlier review gap

Confirmed mechanism: execution already depends on scenario, contribution projection, and preparation options, but workspace fingerprint, draft, history, and share identify only scenario. TSK-06 parity tests supplied projection and initial NP directly, proving executor parity but not production handoff or portable restore parity. TSK-07 then cached complete policy results and accumulated details in both worker and React.

Implementation mismatch: distinct calculations can share an identity, request/result versions can disagree, derived projection disappears on recovery paths, ranking origin cannot be presented without inference, and evidence cache cardinality grows with profiles or opened rows. Missed detection: prior matrices audited candidate execution and cache keys, not the complete versioned tuple, production entrypoint transport, cache values, lifetime, owner, or restore paths. The recurrence scope is every scenario-external input that changes damage, precision, outcome, fingerprint, recovery, or UI command.

Minimum guardrail: when a calculation entrypoint gains a semantic argument, reopen immediate handoff, draft, history, share, backup, fingerprint, migration, and cache value matrices. Separate execution, handoff, persisted restore, and portable share parity.

## Canonical design

- Every request embeds `masterDataVersion` and `engineVersion`. Resolved requests carry typed origin, `initialNpGauge`, and `standard | excludeVoluntarySkillModifiers`; manual requests carry only `manual` intent.
- Request and persistence never contain projection, `Set`, raw／compiled operation ID, compiled operations, or derived execution state.
- Normal calculator explicitly creates `calculator + 10000 + standard`. The ranking application pure constructor creates `ranking + adopted gauge + typed contribution intent`.
- Inherited intent remains visible and non-editable through scenario edits until the explicit “通常の計算条件へ戻す” command creates `10000 + standard`. No hidden reset or hidden retention after reset.
- Capacity overflow, schema/reference/request-result version mismatch, execution-version mismatch, and mode/origin contradiction are `invalid`; a coherent request whose available engine cannot execute known semantics is `unsupported`.
- Manual scenario accepts only manual intent. No resolved resource policy is inferred.
- Fingerprint and execution receive the full versioned request; they do not accept parallel version arguments. Result master／engine versions must equal the request.
- Current-schema persistence parses bounded opaque engine/master version strings; version availability is semantic validation, not a current-engine schema literal or a dual-runtime promise.
- Restore and history copy preserve the pinned identity. Missing matching runtime produces `historicalOnly: versionUnavailable`; only explicit current-version recalculation creates a new request and never overwrites the old record.
- Exact schema 32 profile／backup migration preserves safe profile data and discards old draft／history. Old-schema share and arbitrary old／future schema fail closed. A current share with matching request/result versions but unavailable runtime may show only the stored historical result. Failed migration never clears the user store.
- `UI-CALC-001` owns the result-adjacent origin/version notice, reset, explicit version upgrade, invalid recovery, focus, and 320px behavior.

Product decision alternatives remaining: 0. Approval remains required before runtime implementation.

## Producer, reader, writer, and recovery inventory

| Path | Producer | Semantic reader | Writer / recovery | Runtime classification |
| --- | --- | --- | --- | --- |
| normal/manual constructor | application | compiler/executor | workspace | Blocking: TSK-06.1 |
| selected ranking candidate constructor | ranking application | portable request schema | returns request without Web state | Blocking: TSK-06.1 |
| Web immediate ranking handoff | ranking detail command | calculator workspace | presentation/command wiring | Deferred: TSK-07 |
| projection | typed contribution intent + matching master | battle execution | derived in memory only | Blocking: TSK-06.1 |
| fingerprint | full versioned request | workspace/cache identity | no parallel version args | Blocking: TSK-06.1 |
| draft restore | workspace request/result | application/repository | pinned or historical-only | Blocking: TSK-06.1 |
| history finalize/copy | matching request/result | workspace/repository | copy preserves pinned identity | Blocking: TSK-06.1 |
| share URL/JSON | matching request/result | strict parser | historical-only or explicit upgrade | Blocking: TSK-06.1 |
| backup export/import | current profiles | current parser or exact-v32 migrator | current format only | Blocking: TSK-06.1 |
| startup migration | exact schema 32 stored profile | isolated migrator | safe profile retained; snapshots dropped | Blocking: TSK-06.1 |
| calculator recovery UI | portable state | calculator presentation | reset/version-upgrade commands | Blocking: TSK-06.1 |
| ranking origin notice | handed-off ranking request | calculator presentation | reset command | Deferred: TSK-07 |
| worker summary/detail | ranking application | worker/useRanking | summary max 1; detail worker 0/React 1 | Deferred: TSK-07 |

No runtime reader, writer, migration, or Web component was changed in this design phase.

## Portable request counterexample matrix

`B06.1` means `Blocking: TSK-06.1 implementation`; `D07` means `Deferred: TSK-07`; `N/A` includes the reason. Direct test-only reinjection does not close a production path.

| State / counterexample | Pure constructor / execution | Immediate ranking→calculator | Draft restore | History finalize/copy | Share URL/JSON | Backup/fingerprint/migration |
| --- | --- | --- | --- | --- | --- | --- |
| normal current 100% + standard | B06.1 | N/A: not ranking | B06.1 | B06.1 | B06.1 | B06.1 |
| ranking 200% start, OC changes | B06.1 | D07 | B06.1 | B06.1 | B06.1 | B06.1 |
| ranking self-buff exclusion | B06.1 | D07 | B06.1 | B06.1 | B06.1 | B06.1 |
| ranking conditional satisfied | B06.1 | D07 | B06.1 | B06.1 | B06.1 | B06.1 |
| same payload, different master | B06.1: distinct result/identity | D07 | B06.1 | B06.1 | B06.1 | B06.1: distinct fingerprint |
| same payload, different engine | B06.1: distinct result/identity | D07 | B06.1 | B06.1 | B06.1 | B06.1: distinct fingerprint |
| request/result version mismatch | B06.1: invalid | N/A: rejected before handoff | B06.1: reject | B06.1: reject | B06.1: reject historical value | B06.1: fail closed |
| app update restores pinned draft | B06.1: exact runtime or historical-only | N/A: recovery path | B06.1 | B06.1 | N/A: draft path | B06.1 |
| old-version history copied | B06.1: preserve identity | N/A: history path | B06.1 | B06.1 | N/A: history path | B06.1 |
| share runtime unavailable | B06.1: historical-only | N/A: share path | N/A: share path | N/A: share path | B06.1: explicit current-version recalc | B06.1 |
| current-version recalc fails validation | B06.1: invalid/unsupported, old value retained | N/A: recovery path | B06.1 | B06.1 | B06.1 | B06.1 |
| schema 32 profile/backup | N/A: calculation snapshots discarded | N/A: migration path | B06.1 | B06.1 | N/A: old share rejected | B06.1: safe profile retained |
| arbitrary old/future schema | B06.1: reject | N/A: rejected before handoff | B06.1 | B06.1 | B06.1 | B06.1: fail closed |

Expected outcome classes and ownership are `Verified` as design. Runtime cells remain Blocking or Deferred exactly as shown.

## Cache and stale-detail matrix

| Event | Worker summary | Worker detail | React active/in-flight | Required result |
| --- | --- | --- | --- | --- |
| summary success | replace latest, maximum 1 | none | unchanged | evidence-free rows + typed exclusions |
| detail open | unchanged | materialize, cache 0 | replace with requested entry, maximum 1 | only selected evidence |
| detail close | unchanged | none | clear both | late response rejected |
| condition change | invalidate/replace by fingerprint | none | clear both | old fingerprint rejected |
| context change | clear | none | clear both | old context rejected |
| response reordering | current identity only | cache 0 | request ID and fingerprint must both match | stale detail never displayed |

All rows are `Deferred: TSK-07` from TSK-06.1. They become `Blocking: RK-CACHE-001 implementation` only when TSK-07 starts. TSK-08 retains ownership of prepared damage matrix and NP1–5 cross-level optimization.

## Closure

Closure: Blocking 1, Deferred 2

- Blocking: TSK-06.1-owned versioned identity, persistence, migration, version recovery, and approval are not implemented/approved.
- Deferred: TSK-07 owns Web immediate ranking handoff and ranking-origin presentation.
- Deferred: TSK-07 owns evidence-free summary/detail cache and stale response wiring.

Product decision alternatives remaining: 0. Product, ranking, and UI requirements remain approval required; no ADR proposal is registered before approval. TSK-06.1 remains `in_progress` at the approval gate. TSK-07 and TSK-08 remain blocked. This note must be updated with implementation evidence rather than replaced by another family note.
