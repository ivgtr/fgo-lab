---
title: "TSK-06.1 portable calculation identity flow closure"
status: "Complete"
updated_at: "2026-09-01"
---

# TSK-06.1 portable calculation identity flow closure

## Baseline, outcome, and invariant

Implementation baseline is the approved clean HEAD `9cf3cee56b6fe16bf54ff9cc63ddc43e181974cf`. Runtime now uses schema 33 and the portable request contract below. Schema 32 remains only as the isolated profile／backup migration input.

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

### Implementation review delta

The first implementation review found three related closure gaps. First, `savePortableDraft` replaced the workspace before a current-version upgrade was known to be executable, so invalid and unsupported attempts could discard or replace the pinned historical value. Second, ranking candidate materialization and portable execution independently classified operation origin, contribution scope, and skill activation, leaving contribution semantics with two owners. Third, the schema 33 atomic cutover necessarily changed the direct Web request writer and ranking-origin notice, while the plan still classified those implemented paths as TSK-07 work and did not close their production E2E path.

The implementation mismatch is therefore transactional commit ownership, contribution compiler ownership, and stale scope classification—not three unrelated local defects. The missed detection was that the original matrix checked recovery output classes and pure-constructor parity but not failed-attempt workspace state, compiler recurrence for schema-legal operation variants, or the direct Web writer changed by the atomic schema cutover. The recurrence scope is bounded to version-upgrade attempt/commit/retry, self and area contribution inclusion, and ranking detail → calculator → reset. Minimum guardrails are a typed transactional upgrade result, one typed contribution compiler consumed by ranking and portable execution, and production-path Web parity including notice and reset.

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
- `historicalOnly` is an application/workspace recovery state only and never an engine numeric result or battle outcome. `origin` is application/workspace/presentation metadata and never a battle-execution branch condition.
- Exact schema 32 profile／backup migration preserves safe profile data and discards old draft／history. Old-schema share and arbitrary old／future schema fail closed. A current share with matching request/result versions but unavailable runtime may show only the stored historical result. Failed migration never clears the user store.
- `UI-CALC-001` owns the result-adjacent origin/version notice, reset, explicit version upgrade, invalid recovery, focus, and 320px behavior.

Product decision alternatives remaining: 0. Product requirements v0.3.8、ranking v0.8.0、UI spec v1.4.1 and ADR-027 were approved／accepted on 2026-09-01. Runtime implementation is closed by the evidence below.

## Producer, reader, writer, and recovery inventory

| Path | Producer | Semantic reader | Writer / recovery | Runtime classification |
| --- | --- | --- | --- | --- |
| normal/manual constructor | application | compiler/executor | workspace | Verified |
| selected ranking candidate constructor | ranking application | portable request schema | returns request without Web state | Verified |
| Web immediate ranking handoff | ranking detail command | calculator workspace | presentation/command wiring | Verified |
| projection | typed contribution intent + matching master | battle execution | derived in memory only | Verified: one shared compiler |
| fingerprint | full versioned request | workspace/cache identity | no parallel version args | Verified |
| draft restore | workspace request/result | application/repository | pinned or historical-only | Verified |
| history finalize/copy | matching request/result | workspace/repository | copy preserves pinned identity | Verified |
| share URL/JSON | matching request/result | strict parser | historical-only or explicit upgrade | Verified |
| backup export/import | current profiles | current parser or exact-v32 migrator | current format only | Verified |
| startup migration | exact schema 32 stored profile | isolated migrator | safe profile retained; snapshots dropped | Verified |
| calculator recovery UI | portable state | calculator presentation | transactional upgrade/reset commands | Verified |
| ranking origin notice | handed-off ranking request | calculator presentation | reset command | Verified |
| worker summary/detail | ranking application | worker/useRanking | summary max 1; detail worker 0/React 1 | Deferred: TSK-07 |

Implementation evidence: schema current readers accept only schema 33 request envelopes; the two schema 32 literals occur only in the isolated profile／backup migrator. `calculation-application` owns normal/manual/ranking constructors, typed contribution compilation, execution, reset, upgrade, and historical recovery. Workspace hashes and stores the complete request. Repository migration persists the fully parsed current collection only after successful conversion and returns `profile_parse_failed` without clearing the user store on failure.

## Portable request counterexample matrix

`V` means `Verified`; `N/A` includes the reason. Direct test-only reinjection does not close a production path.

| State / counterexample | Pure constructor / execution | Immediate ranking→calculator | Draft restore | History finalize/copy | Share URL/JSON | Backup/fingerprint/migration |
| --- | --- | --- | --- | --- | --- | --- |
| normal current 100% + standard | V | N/A: not ranking | V | V | V | V |
| ranking 200% start, OC changes | V | V | V | V | V | V |
| ranking self-buff exclusion | V | V: production E2E parity | V | V | V | V |
| ranking conditional satisfied | V | V | V | V | V | V |
| same payload, different master | V: distinct result/identity | N/A: Web writes active runtime | V | V | V | V: distinct fingerprint |
| same payload, different engine | V: distinct result/identity | N/A: Web writes active runtime | V | V | V | V: distinct fingerprint |
| request/result version mismatch | V: invalid | N/A: rejected before handoff | V: reject | V: reject | V: reject historical value | V: fail closed |
| app update restores pinned draft | V: exact runtime or historical-only | N/A: recovery path | V | V | N/A: draft path | V |
| old-version history copied | V: preserve identity | N/A: history path | V | V | N/A: history path | V |
| share runtime unavailable | V: historical-only | N/A: share path | N/A: share path | N/A: share path | V: explicit current-version recalc | V |
| current-version recalc succeeds | V: atomic commit | N/A: recovery path | V | V | V | V |
| current-version recalc invalid | V: retain old pair + typed attempt | N/A: recovery path | V | V | V | V |
| current-version recalc unsupported | V: retain old pair + typed attempt | N/A: recovery path | V | V | V | V |
| failed recalc focus/error/retry | V: typed UI recovery | N/A: recovery path | V: production E2E | V | V | N/A: UI path |
| ranking notice → normal reset | V: pure reset | V: production E2E | V | V | V | V |
| schema 32 profile/backup | N/A: calculation snapshots discarded | N/A: migration path | V | V | N/A: old share rejected | V: safe profile retained |
| arbitrary old/future schema | V: reject | N/A: rejected before handoff | V | V | V | V: fail closed |

The three reopened mechanisms are closed together. TSK-07 retains only evidence-free cache and stale-detail ownership.

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

Closure: Blocking 0, Deferred 1

- Deferred: TSK-07 owns evidence-free summary/detail cache and stale response wiring.

Verification: focused portable/projection/recovery suites passed, including self included/excluded × area included/excluded, successful/invalid/unsupported upgrade, failed-attempt focus/retry, and production ranking handoff parity/reset. Final `pnpm quality` passed with unit 66 files／370 tests、production 24 files／111 tests、E2E 66 passed／34 skipped. The production audit payload, digest `cc14841f8852c50ca432176f61fad141ce8abde955082a5d9191ccc1c945cf86`, inventory, and counters are unchanged; only measured timings differ. Against the pre-fix 18.837s production compile, three post-fix review runs were 18.219s、19.178s、19.689s (-3.3% to +4.5%); candidate 6,376、deduplicated 3,957、damage requests 6,913、distinct 1,599 remain unchanged.

Product decision alternatives remaining: 0. Product, ranking, and UI requirements are approved, ADR-027 is accepted, and ADR-016 is superseded. TSK-06.1 is `done` with `Closure: Blocking 0, Deferred 1`. TSK-06.2 subsequently closed E2E ownership with Blocking 0. A later test-strategy review inserted TSK-06.3 for execution observability; TSK-06.3 is `ready`, TSK-07 remains the owner of deferred cache work and is blocked on TSK-06.3, and TSK-08 remains blocked on TSK-07.
