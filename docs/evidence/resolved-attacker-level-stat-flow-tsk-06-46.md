---
title: "Resolved attacker level-stat fail-closed flow"
status: "Active"
updated_at: "2026-09-05"
---

# Resolved attacker level-stat fail-closed flow

## Step 1 baseline and source contract

- Start HEAD: `907f2514f0f1c06d30d9d39419ba843a35ca043e` on `main`.
- Dependency: TSK-06.41 is `done`; its Done gate, Contract closure matrix, final `pnpm quality`, production
  inventory, and Handoff are recorded in `docs/tasks/development-redesign-tasks.md`.
- Start worktree: documentation-only changes for the TSK-06.42 Step 1 split already existed in
  `docs/README.md`, `docs/evidence/README.md`, `docs/evidence/ranking-policy-candidate-flow-tsk-06.md`,
  `docs/tasks/development-redesign-tasks.md`, and the new TSK-06.46／06.47 notes. They are treated as
  pre-existing user changes; this review changes no production or test code.
- Governing sources: `AGENTS.md`, TSK-06.46, ranking requirements 2／3.2／4.2／11／12／15／17 and
  `RK-EXEC-001`／`RK-POLICY-001`／`RK-HANDOFF-001`／`RK-AUDIT-001`／`RK-PERF-001`, product requirements
  6.9〜6.11／8.2／9 and `CALC-PORTABLE-001`, UI `UI-CALC-001`, test strategy `TS-PERF-002`, and
  `docs/guides/systematic-review-guidelines.md`.

The entry condition is satisfied. No product decision is missing, and no separate semantic-family blocker was
found. Runtime work remains unstarted; Step 2 must first mark TSK-06.46 `in_progress` at the recorded HEAD and
must preserve the allowed documentation-only worktree listed in the Handoff.

## User-visible outcome, invariant, and semantic owner

User-visible outcome: calculator, ranking, and portable replay show damage only when a resolved attacker has an
exact canonical master ATK entry for the selected level. A missing entry is
`invalid: attackerLevelStatUnavailable`, never a zero-damage row, a nearby-level value, an unrelated retained
value, or a home-screen numeric `0`. Manual calculation continues to use its explicit ATK.

Domain invariants:

1. A resolved numeric result is identified by one servant, one selected level, and one present
   `atkByLevel[String(level)]` entry. Presence is tested with `undefined`, not truthiness: schema-legal canonical
   ATK `0` is present and distinct from a missing key.
2. `explicitOverrides.attackerAtk` may override the value only after the resolved servant／level master join is
   valid. It cannot turn a missing canonical pair into a resolved calculation.
3. The invalid join occurs before ordered preparation and damage execution. Therefore no action, mutation,
   cache entry, ranking row, portable draft, or replacement result is partially committed.
4. Calculator, ranking, and portable execution consume the same application preparation result. Ranking policy,
   Web, and recovery code do not repeat the lookup, interpolate, or select a fallback level.
5. Nonnumeric outcome classes remain distinct: missing level stat is semantic `invalid`; unsupported operation,
   required input, policy unavailability, historical-only version, and manual calculation retain their existing
   meanings.

Semantic owner: `packages/calculation-application/src/scenario.ts` owns a focused resolved-attacker level-stat
join before `DamageResolutionInput` construction. The data pipeline only emits canonical `atkByLevel`; master
data validates its shape; battle execution and calc-core consume a complete numeric input; ranking and portable
code map the shared typed application outcome without reinterpreting it.

## Structural finding record

- Symptom: `damageResolutionInputForNoblePhantasm` currently evaluates
  `scenario.explicitOverrides.attackerAtk ?? servant.atkByLevel[String(level)] ?? 0`. A schema-legal resolved
  scenario whose selected level is absent can therefore produce plausible numeric damage with base ATK `0`.
- Mechanism: master normalization emits an independently keyed record from `atkGrowth`; `CalculationScenario`
  accepts levels 1〜120; master schema permits a partial or empty record; the application join collapses
  `undefined` into the numeric domain. The override is ordered before validation, so it can also mask absence.
- Implementation mismatch: the requirements distinguish semantic invalidity from unsupported execution, but
  `CalculationResult` currently has only `calculated | inputRequired | unsupported`. Ranking has a separate
  invalid outcome and portable execution has a generic `scenarioInvalid`, so a local throw or ranking precheck
  would leave outcome ownership split.
- Missed detection: the TSK-06.42 comparison-basis draft inspected owned-level selection, but the earlier review
  did not expand the same lookup through normal calculator, prepared ranking candidates, portable execute／
  recover／reset／upgrade, direct Web writers, and the home summary reader.
- Recurrence scope: every resolved scenario producer or persisted writer, the one master-stat reader, prepared
  scenario reuse, ranking aggregation, portable transaction attempts, and Web consumers that can turn a
  nonnumeric result into a number. Manual `DamageResolutionInput` is a separate semantic family.
- Minimum guardrail: one discriminated application-owned invalid join result; exact-key positive／zero／absent
  fixtures; calculator／ranking／portable parity; retained-state recovery assertions; a shared production
  availability ratchet; and a scan proving zero alternative resolved lookup／interpolation／numeric fallback.

The pre-existing draft classified Web presentation as N/A and did not cover the override-first branch.
Code audit found `HomeRoute` maps every non-calculated outcome to numeric `0` and found the override can hide a
missing canonical pair. This review gap is corrected here before implementation; both belong to the same
resolved level-stat family, so no additional Task is required.

## Canonical type and ownership boundary

Step 2 should make semantic invalidity explicit at the application boundary instead of adding a
`PreparationFailureCode`: a missing master stat is not an ordered-action failure owned by battle execution.
The focused application issue is `attackerLevelStatUnavailable` with canonical `servantId` and `level` detail.
It must propagate through scenario preparation／prepared calculation／calculation execution as a discriminated
invalid outcome and be mapped as follows:

| Consumer | Canonical mapping | Planning status |
| --- | --- | --- |
| direct calculator result | nonnumeric `invalid` with the same issue; no `DamageResolutionInput` | Verified: required type boundary identified |
| ranking candidate／profile | `RankingProfileResult.invalid`; invalid candidate blocks numeric selection for its AttackProfile | Verified: current aggregator and missing invalid branch identified |
| portable execute | `PortableCalculationOutcome.invalid` with reason `attackerLevelStatUnavailable` | Verified: current closed reason union identified |
| portable recover | same invalid attempt; stored request／result remain inputs, not a replacement result | Verified: recovery is read-only until success |
| reset／version upgrade | rejected attempt with retained request／result and typed failure | Verified: existing attempt／commit transaction boundary identified |
| persisted result schema | accept the application invalid result only if it is exposed as `CalculationResult`; invalid attempts are never committed as draft/history | Verified: schema impact and no-write rule identified |

Implementation must choose one discriminated application result that all three consumers use. It must not keep
an `unsupported` calculation result beside an `invalid` portable or ranking wrapper for the same missing stat.
If `CalculationResult` gains the invalid variant, schema／engine version and all exhaustive readers must be
updated once in this Task. If the invalid variant remains application-only, the public calculation API and
every caller must narrow it before reading `result`; it still may not be represented internally as
`unsupported`. This is an implementation-shape choice within the approved outcome, not an unresolved product
decision. The smaller complete change after compile errors reveal the direct readers is preferred.

## Production family inventory

| Producer／reader／writer／recovery path | Required ownership or transition | Status |
| --- | --- | --- |
| `data-pipeline/snapshotNormalization.ts` | Atlas `atkGrowth[index]` → canonical string level key; no interpolation or application fallback | Verified: sole raw producer; unchanged |
| `master-data` `servantMasterSchema` | retain level-addressable record and schema-legal absence for focused fixtures | Verified: shape owner identified; global completeness is not added to master schema |
| default calculator scenario constructors | write servant identity and natural／owned level only; do not pre-resolve ATK | Verified: producer identified; Step 2 reuses central join |
| calculator resolved level and attacker writers | `Calculator` changes `scenario.attacker.level`／servant; application validates on save attempt | Verified: direct writer identified |
| resolved explicit override writer | override is applied only after exact master-pair presence succeeds | Verified: newly discovered same-family delta |
| ranking base／candidate producers | write selected comparison level; policy and witness construction do not read `atkByLevel` | Verified: direct producers identified; owned／Lv.90 basis expansion remains TSK-06.42 |
| shared resolved scenario preparation | resolve servant, selected attack NP, and exact level ATK once before ordered execution | Verified: semantic owner and current fallback line identified |
| rematerialize／reapply prepared scenario | reuse the prepared valid join; any full reprepare returns the same typed invalid | Verified: no independent ATK reader |
| `battle-execution` and `calc-core` | consume complete `DamageResolutionInput`; never receive absence | N/A: downstream numeric family has no master lookup |
| ranking execution／selection／profile aggregation | consume prepared outcome; invalid cannot enter damage cache or be replaced by another numeric candidate | Verified: readers and required invalid branch identified |
| ranking row／detail／portable constructor | only calculated details can write rows or handoff requests | Verified: current calculated-only types identified |
| portable execute | parse/version/capacity checks, then call shared preparation and map typed invalid | Verified: direct recovery entrypoint identified |
| portable recover／share validation | replay the same request; do not rewrite missing level or stored result | Verified: recovery readers identified |
| portable normal reset | construct exact retained subject scenario; commit only after successful execution | Verified: transactional writer identified |
| portable version upgrade | change version identity, execute, and retain old pair on invalid | Verified: transactional writer identified |
| Web calculator draft／history writer | invalid save attempt writes neither memory nor durable draft/history | Verified: success-only commit boundary identified |
| Web ranking handoff | invalid immediate replay writes no draft and must not navigate to a fabricated numeric calculation | Verified: direct writer identified; assertion required |
| calculator invalid presentation | render invalid reason and relevant reset／reload command, never a result table | Verified: existing portable notice boundary identified |
| home last-calculation summary | replace `non-calculated -> 0` with explicit unavailable presentation／nullable value | Verified: newly discovered numeric consumer delta |
| manual scenario and manual level editor fallbacks | explicit `DamageResolutionInput.attackerAtk`; no resolved master-stat contract | N/A: separate canonical manual-input family |
| unknown servant reference | already fails before numeric input; exact missing-subject taxonomy is not changed here | N/A: separate servant-reference identity family, no numeric fallback found |
| profile record key／embedded ID validation | determines whether the correct build is selected before scenario construction | Deferred: TSK-06.47 |
| owned／uniform level selection, URL, worker protocol, cache identity | consumes this owner after the comparison-basis cutover | Deferred: TSK-06.42 |
| notice copy, responsive and a11y revalidation beyond the changed invalid/home assertion | presentation polish after semantic cutover | Deferred: TSK-07 |

Planning Blocking count: **0**.

## State-by-path counterexample matrix

| Canonical state | Path | Expected observable outcome | Status |
| --- | --- | --- | --- |
| exact key present with positive ATK | calculator／ranking／portable | unchanged exact numeric input and damage | Verified: focused parity case specified |
| exact key present with ATK `0` | direct calculator | numeric result is permitted because key presence, not truthiness, owns validity | Verified: schema-legal boundary case specified |
| exact key absent | direct resolved calculator | `invalid: attackerLevelStatUnavailable`; no input, rows, effects, or mutations | Verified: focused negative specified |
| exact key absent, resolved explicit override present | direct calculator／portable | same invalid; override cannot repair the master join | Verified: override masking regression specified |
| exact key absent | ranking baseline／policy candidate | profile invalid, no cache request／row／detail／alternate candidate numeric replacement | Verified: ranking aggregation case specified |
| exact key absent | portable execute | typed invalid; no draft or history write | Verified: execute/write case specified |
| exact key absent with matching stored pair | portable recover／share validation | typed invalid attempt; stored pair remains unchanged | Verified: recovery case specified |
| exact key absent in reset target build level | portable reset | rejected attempt retains request／result and publishes no attempted pair | Verified: transactional reset case specified |
| exact key absent only in current master | current-version upgrade | rejected attempt retains historical request／result／focus state | Verified: transactional upgrade case specified |
| nonnumeric missing-stat outcome with existing history | home summary | no `0` headline; explicit unavailable state while open-calculator command remains | Verified: UI numeric-fallback case specified |
| manual explicit ATK | direct／portable manual | unchanged numeric calculation, independent of `atkByLevel` | N/A: separate manual family |
| unknown servant ID | direct／portable／ranking | existing fail-closed reference error; no level lookup or numeric result | N/A: separate subject-reference family |
| production natural limit | 422 attack servants | exact key present for all, missing 0 | Verified: master `20260902.02` read-only inventory |
| production Lv.90 | 422 attack servants | exact key present for all, missing 0 | Verified: master `20260902.02` read-only inventory |
| production Lv.91〜120 | Mash `800100` versus other attackers | Mash absence remains schema-legal negative; 421 attackers have keys through Lv.120 | Verified: inventory defines focused negative without ID branch |
| future owned／uniform level products | ranking／worker／portable | exact shared join, no interpolation or default basis | Deferred: TSK-06.42 |

## Production inventory and focused fixture split

The shared `compileCalculationApplicationProductionAudit` remains the sole full-master load／parse／compile
lifecycle. Step 2 adds a canonical availability inventory for unique `(servantId, level)` pairs covering all
422 attack servants at natural limit and Lv.90 plus every level actually referenced by calculator and ranking
scenarios compiled by that audit. It records total／unique／missing counts and canonical missing identities;
production missing must ratchet at 0. It does not reload or recalculate the master once per servant or fixture.

At master `20260902.02`, read-only planning inventory is 469 servants, 422 attack servants, natural missing 0,
Lv.90 missing 0, 421 attackers with keys through Lv.120, and Mash `800100` with keys through Lv.90. Production
availability proves current coverage only. It does not prove behavior for absence, a present zero, or an override
mask, so those states use one small cloned-master fixture in `scenario.test.ts`; portable and ranking tests reuse
that fixture shape rather than loading production data per case.

No servant ID, name, or label appears in runtime behavior. Mash is inventory evidence only, not an implementation
branch.

## Implementation units and order

1. In `calculation-application/scenario.ts`, introduce the focused resolved level-stat join and its discriminated
   invalid issue. Validate exact pair presence before applying `explicitOverrides.attackerAtk`, before ordered
   preparation, and before creating a damage-cache key. Extend the minimum application／schema result unions
   needed to keep invalid distinct from unsupported; update schema and engine versions once only if their public
   wire shapes change.
2. Close direct consumers: prepared rematerialization, ranking candidate blocking／profile aggregation／audit,
   portable execute／recover／reset／upgrade, and exhaustive result switches. Do not add a ranking precheck or a
   second lookup.
3. Close write and presentation paths: prevent invalid calculator saves and ranking handoff publication, preserve
   retained recovery state, and change Home／HomeRoute to represent no numeric value rather than `0`. Keep manual
   editor fallbacks and explicit manual ATK unchanged.
4. Add focused fixtures for present-positive, present-zero, absent, absent-plus-override, calculator/ranking
   parity, portable execute／recover／reset／upgrade rollback, ranking handoff no-write, and home no-zero display.
5. Extend the one shared production audit with natural／Lv.90／referenced-pair availability and stable counts.
   Search for remaining resolved `atkByLevel` readers, interpolation, `?? 0`, outcome collapse, and ID/name
   branches; all scoped runtime alternatives must be 0.

## Verification and performance plan

Run diagnostics in failure-localizing order, then expand once:

1. `pnpm test:diagnostic -- scenario`
2. `pnpm test:diagnostic -- rankingProfileOutcome`
3. `pnpm test:diagnostic -- portableCalculation`
4. `pnpm test:diagnostic -- "HomeRoute|rankingHandoff"`
5. `pnpm test:diagnostic -- productionAudit`
6. `pnpm test:unit`
7. `pnpm test:production`
8. `pnpm quality` as the only phase-completion gate

Before completion, run `pnpm test:diagnostic -- productionAudit` three times in the same environment and compare
the instrumented application compile median and exact counters with this Step 1 baseline. Planning runs were:

| Run | Application compile | Bounded command | Artifact |
| --- | ---: | ---: | --- |
| 1 | 5,358 ms | 13.14 s | `.test-results/2026-09-05T05-38-58-278Z-15-430398` |
| 2 | 5,491 ms | 9.99 s | `.test-results/2026-09-05T05-39-14-858Z-15-f7f947` |
| 3 | 5,081 ms | 9.38 s | `.test-results/2026-09-05T05-39-28-522Z-15-0e3c6b` |

Median application compile is 5,358 ms and median bounded command is 9.99 s. All runs recorded candidate 6,360,
deduplicated 3,949, damage requests 1,924, and distinct damage inputs 1,298. The level-stat join is O(1) per
prepared resolved scenario; no candidate dimension is added. Any counter change, or an unexplained median
increase of at least 10% or 5 seconds, is a design failure. `pnpm quality` evidence must also report production
availability, calculator／ranking parity, invalid 0 in the published master, no skipped／todo／retry／warning／
unexpected-console, and the artifact path.

## Step 1 closure

- Production family, direct writers/readers, recovery, and counterexamples: Verified as the bounded plan above.
- Product requirement change: N/A: existing invalid／no-fallback／shared-execution contracts already determine the
  expected result.
- New ADR or package: N/A: the existing calculation-application boundary owns the join.
- Separate semantic-family finding: N/A: no newly discovered out-of-family contract violation requires a Task.
- Planning Blocking: **0**.
- Runtime closure: not claimed; TSK-06.46 remains `ready` until Step 2 starts and every implemented path is
  reclassified from planned evidence to executed verification.
