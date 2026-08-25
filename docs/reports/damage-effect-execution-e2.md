---
title: "Damage effect execution E2 central switch"
status: "Complete"
created_at: "2026-08-25"
schema_version: 11
engine_version: "8.0.0"
master_data_version: "2026-08-25-atlas-jp-calculator-v17"
---

# E2 central execution switch

The production calculator now has one path from a resolved scenario through ordered battle operations, a single mutable battle state, the existing damage kernel, and typed effect projections. There is no runtime flag or fallback to the removed resolver.

## Execution order

Operations are normalized without servant-specific branches and executed as passive state, selected attacker skills, craft essence, support, mystic code, NP-before-damage state changes, continuous-condition evaluation, and NP damage. Continuous passive modifiers are evaluated at the damage boundary after NP-before-damage state changes; this is the general rule that lets Archetype: Earth’s Millennium Castle establish the later Buster modifier without fixed-point search or retroactive application.

Assumptions add only their typed trait or quantity fact. Operation enablement, card compatibility, target routing, source order, parameter support, and handler availability remain independently enforced. Contradictions and unresolved quantities fail closed.

## UI projection

`EffectProjection` directly supplies visibility, controllability, decision state, outcome, modifier kind, and explanation code. State-only operations and mismatched card modifiers are hidden by the executor projection. The calculator no longer interprets labels or reason strings to decide calculation or control behavior. Existing controls write typed `effectAssumptions` and retain the approved labels, positions, operation order, result table, details, and share actions.

## Removed paths

- deleted the complete `@fgo-lab/effect-resolver` package and its 1,585-line legacy test suite;
- deleted fixed-point battle-context resolution and whole-condition assertion behavior;
- deleted boolean effect-decision/override schema and the separate NP-condition-control composition;
- deleted flat legacy modifier aggregation and legacy result types;
- deleted UI context-shape and reason-string inference;
- replaced the old source aggregation fixture with an ordered-execution golden.

The existing kernel’s binary32 boundaries, final floors, random 900–1099 evaluation, and NP1–5 row evaluator were not changed.

## Version impact

Calculation schema 11 and engine 8.0.0 intentionally reject old calculation drafts, histories, and share snapshots as current results. The normalized production artifact is published as `2026-08-25-atlas-jp-calculator-v17`. No compatibility adapter or implicit recalculation is provided.

## E2 validation

- format, lint, and typecheck pass;
- all 116 unit/integration/golden tests pass;
- production master covers all 420 attacking-NP servants and retains 17 typed fail-closed cases;
- the default desktop and 320px calculator baselines preserve the approved input/result hierarchy; only version text changes;
- forbidden legacy symbol search is zero in runtime source.

Full browser, share, accessibility, and real-master scenario regression remains the E3 gate.
