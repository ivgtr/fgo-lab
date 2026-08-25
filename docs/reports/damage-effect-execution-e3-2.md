---
title: "Damage effect execution E3.2 condition/decision/fact redesign"
status: "Complete - Awaiting User UX Confirmation"
created_at: "2026-08-25"
schema_version: 13
engine_version: "10.0.0"
master_data_version: "2026-08-25-atlas-jp-calculator-v18"
---

# E3.2 condition/decision/fact redesign

## Root cause

E3.1 converted a controllable condition into concrete trait assertions. `assertionsForCondition(any)` could not choose one fact from a multi-branch OR without inventing information, so `decisionMode` silently classified the effect as automatic. Production audit started from already-user-controllable projections and therefore could not see this misclassification. The same scenario structure carried a caller-supplied `exclusiveGroup`, allowing external input to remove canonical exclusivity.

## Final design

ADR-009 compares concrete world assertions, effect-local satisfaction, persisted logical constraints, and split decision/fact types. The implementation adopts split types plus effect-local satisfaction, while logical constraints are derived from the current master IR inside the executor.

```text
master TraitCondition
  -> lossless ConditionExpression
  -> ordered BattleOperation + OperationDecisionPlan
scenario EffectDecision / WorldFactAssertion
  -> canonical fact validation + selected-condition satisfiability
  -> ordered execution
  -> DamageResolutionInput fold
  -> calculation
  -> typed EffectProjection / trace / evidence
```

- `ConditionExpression` retains AND, OR, NOT, quantity, and `partialTrait` data.
- `EffectDecision` separates operation activation from effect-local condition satisfaction.
- `WorldFactAssertion` contains only a concrete fact; exclusivity is never accepted from input.
- Derived facts come only from ordered context mutation and remain hidden from firepower controls.
- Effect-local satisfaction applies only to its operation and never becomes a world fact for another effect.
- `EffectProjection` owns visibility, controllability, decision kind, execution support, outcome, and explanation.
- `calculation-application` owns projection commands. Web, support restore, and ranking preparation do not interpret conditions.

## Removed paths

- `ScenarioAssumption` and scenario `effectAssumptions`
- `OperationDecisionMode`
- `assertionsForCondition` and `assumptionsForProjection`
- scenario-owned `exclusiveGroup`
- multi-branch OR to `automatic` fallback
- web/application duplication of condition-to-assertion reconstruction
- unsupported selected-effect UI lockout
- incorrect alignment exclusivity (`alignmentSummer` and good/evil can coexist in production master)

No compatibility flag, servant/effect/name branch, legacy resolver, or alternate runtime path was added.

## Production impact

- 469 servants inventoried; 420 attacking-NP scenarios executed.
- Multi-branch OR: 16 servants, 19 visible firepower effects.
- User-controllable projections: 1,545; automatic visible: 439; hidden: 671.
- User controls with no decision/outcome/input/result change: 0.
- Canonically incompatible selected-effect pairs: 7; calculated results: 0.
- Selected typed-unsupported projections: 90 effects across 58 servants.
- Partial condition: BB Dubai, 1 servant / 1 effect; remains typed unsupported.
- Default unsupported scenarios: 19 -> 15.

The default scenarios that became calculable are `403400`, `506000`, `605300`, and `2301100`. `403400` target-rarity OR can be calculated exactly from effect-local satisfaction. The other three contain optional unsupported effects: the default calculation is valid while unselected, and selecting the unresolved effect fails closed. No default calculated scenario became unsupported.

The 15 remaining default unsupported servants are `106600`, `202500`, `203300`, `305800`, `400900`, `702500`, `800100`, `1000300`, `1102000`, `1102300`, `2300600`, `2300900`, `2301200`, `2801300`, and `3300200`. They are classified as unresolved automatic/NP operation, missing attacker HP ratio, missing Battle Point phase, or the one partial condition. Future work targets normalized Function families, not servant exceptions.

## Real-master measurements

- Dante base NP1 average: `32208.975` (UI `32,209`).
- Dante sky only: `powerMod 0.5`, NP1 average `45629.59` (UI `45,630`).
- Dante earth only: the same `powerMod 0.5` and average; only the selected operation is applied.
- Dante sky + earth: `conditionDecisionConflict` with canonical world-attribute/field conflicts, both power operations `notApplied`, `powerMod 0`, result unsupported.
- Indra OR selection: UI NP1 average `47,663`; `威力アップ〔蛇・竜〕 +30%` is applied without adding snake or dragon to target facts.
- Nemo's shore/imaginary-space attack, Arts, and NP-damage effects can be selected together and yield `attackBuff 0.2`, `cardBuff 0.2`, `npDamageBuff 0.3`, with no fabricated field fact.
- Morgan, Martha, Solomon, U-Olga Marie, and Gray Lily representative OR operations are applied and increase damage without a concrete target trait assertion.

The inspected UI trace contains the `user-decision`, the selected operation ID and `applied` outcome, and the final damage input. Dante's hidden heaven/hell context operations remain traceable as `notApplied`; the local power operation is independently `applied`. Conflict trace records both user decisions and the typed canonical conflicts.

## Validation

- format, lint, typecheck: pass
- unit/integration/property/golden: 27 files, 130 tests pass
- production master validation: 3 files, 15 tests pass
- evidence validation: 2 files, 10 tests pass
- production condition/projection invariant audit: pass for all 420 calculations
- production build: pass, 168 modules
- Playwright Chromium + mobile Chromium: 35 pass, 21 project-specific skips, 0 failures
- PC, 390px, 320px Dante/Indra operation: pass
- URL/share JSON, draft restore, support template persistence, ranking support semantics: pass
- benchmark: 366.80 ops/s, mean 2.7263 ms for NP1-5 / 200 random values
- `git diff --check`: pass

E4 remains unstarted. The next action is user confirmation of the actual calculator experience.
