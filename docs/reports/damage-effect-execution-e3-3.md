---
title: "Damage effect execution E3.3 unified constraint validation"
status: "Complete"
created_at: "2026-08-26"
schema_version: 13
engine_version: "11.0.0"
master_data_version: "2026-08-25-atlas-jp-calculator-v18"
---

# E3.3 unified constraint validation

## Root cause

E3.2 separated `EffectDecision` from `WorldFactAssertion`, but validated them in separate passes. An effect-local satisfaction decision could therefore override known target or field facts. Context mutation also changed the live state before conflict validation, so a rejected mutation could contaminate later operations and the final damage input.

## Final design

One bounded exact constraint solver now validates fixed facts and satisfiable expressions together.

- Fixed facts come from master/input traits, explicit positive or negative world facts, committed context mutations, card type, and known quantities.
- An absent trait is unknown, not false.
- A selected effect-local condition remains a logical expression owned by that operation. It neither creates a concrete trait nor mutates world state.
- AND, OR, and NOT are retained. Trait polarity, canonical exclusivity, card equality, and integer quantity ranges are checked across all expressions.
- Expressions are normalized, conflicting alternatives are pruned, and equivalent alternatives are deduplicated. More than 2,048 alternatives or 128 literals in one alternative yields typed `constraintComplexityExceeded` instead of an approximation.
- World facts are committed only after the combined constraint set succeeds.
- A context mutation uses clone, apply, validate, commit. On failure, the original state continues and the mutation is not `applied`.
- Web consumes only `calculation-application` view models, projections, and commands; it no longer imports executor runtime classification.

## Removed paths

- Separate `validateAndApplyWorldFacts` and `validateConditionDecisions` execution paths
- `facts.ts` and the old fact-only validation result types
- Set-based trait state that conflated absence with explicit negative
- Post-commit context mutation validation
- Web imports of `battle-execution` runtime helpers
- Conditional decisions that became irreversibly unsupported after a conflict

No compatibility flag, servant/effect/name branch, parallel resolver, or scenario-owned exclusivity metadata was added.

## Production impact

- 469 servants inventoried; 420 attacking-NP scenarios executed.
- User-controllable projections: 1,545; automatic visible: 439; hidden: 671.
- Multi-branch OR: 16 servants, 19 effects; all retain effect-local operation.
- Canonical fact × effect-condition conflict candidates: 221 combinations, 57 effects, 50 servants.
- UI-derived exclusive pairs: 7 effect/effect and 1 world-fact/world-fact. Current UI projections contain 0 world-fact/effect pairs.
- Calculated conflicts: 0; applied conflicting operations: 0; incompatible final input states: 0.
- Selected typed-unsupported projections remain 90 effects across 58 servants.
- Default unsupported scenarios remain 15. No previously calculated default scenario became unsupported.

The 15 default unsupported servants are `106600`, `202500`, `203300`, `305800`, `400900`, `702500`, `800100`, `1000300`, `1102000`, `1102300`, `2300600`, `2300900`, `2301200`, `2801300`, and `3300200`. They remain classified by unresolved automatic/NP operation, missing attacker HP ratio, missing Battle Point phase, or an exactness-preserving partial condition. BB Dubai's partial condition remains typed unsupported. Resolution continues by normalized Function family, never by servant exception.

## Real-master measurements

- Dante base NP1 average: `32208.975` (UI `32,209`).
- Dante sky only: `powerMod 0.5`, `45629.59` (UI `45,630`).
- Dante earth only: `powerMod 0.5`, `45629.59` (UI `45,630`).
- Dante sky + earth decisions: unsupported; both conditional power operations are not applied and final `powerMod` remains `0`.
- World Sky/Heaven + earth decision and World Earth/Hell + sky decision: unsupported with typed canonical conflict.
- Matching world facts and decisions: calculated. Removing one conflicting decision restores normal calculation.
- Indra snake/dragon OR: `47,663`; the modifier is applied without adding snake or dragon to target facts.
- Gray Lily, Nemo, Morgan, Martha, Solomon, and U-Olga Marie retain the same effect-local OR semantics. A compatible fixed branch calculates; explicit negatives or canonical facts excluding every branch fail closed.
- A crafted share containing Sky/Heaven facts plus the earth decision is rejected by executor constraint validation even if a stale calculated result is supplied.

The actual UI trace was inspected for the input decision, fixed facts, selected operation, operation outcome, final damage input, and typed conflict. Intermediate heaven/hell operations remain hidden from normal firepower controls and visible in trace.

## Validation

- format, lint, typecheck: pass
- unit/integration/property/golden: 29 files, 140 tests pass
- production master validation: 3 files, 15 tests pass
- evidence validation: 2 files, 10 tests pass
- production condition/projection cross audit: pass for all 420 scenarios
- production build: pass, 169 modules
- Playwright Chromium and mobile Chromium: 35 pass, 21 project-specific skips, 0 failures
- PC, 390px, and 320px Dante/Indra/support/share operation: pass
- benchmark: 348.08 ops/s, mean 2.8729 ms for NP1-5 / 200 random values
- `git diff --check`: pass

E4 remains unstarted.
