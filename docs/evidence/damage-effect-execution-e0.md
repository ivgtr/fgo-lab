---
title: "Damage effect execution E0 baseline"
status: "Complete"
created_at: "2026-08-25"
master_data_version: "2026-08-25-atlas-jp-calculator-v16"
baseline_commit: "9f7c836"
---

# E0 baseline and removal inventory

This report freezes the user-facing calculator contract and the pre-migration execution inventory. The screenshots and contract tests are comparison evidence only; the legacy resolver is not retained after the central switch.

## UI baseline

The versioned Playwright snapshots in `e2e/calculator-baseline.spec.ts-snapshots` cover the default calculator at desktop (1440×1000) and 320px. Both use the same diagnostic master and block remote images so rendering is deterministic.

The following are invariant: quick/direct input modes; attacker and craft essence controls; rarity-derived virtual level and servant-change update; level 100/120 shortcuts; NP and OC; three attacker skills; `自身の適用内容`; support addition and saved-set recall; class and attribute affinity; automatic recalculation; the NP1–5 average/minimum/maximum table; breakdown/evidence/assumption/warning disclosures; URL/image/share-JSON actions; desktop/mobile hierarchy and keyboard reachability.

Numeric damage, applied-effect rows, precision and warnings may change when the migration corrects execution semantics. There is no compatibility target for incorrect output.

## Runtime paths to remove at the E2 switch

| Responsibility | Current symbol/file | Required final state |
|---|---|---|
| flat legacy result | `ResolvedEffect`, `EffectResolution` in `packages/effect-resolver/src/index.ts` | replaced by typed `OperationResult` and `EffectProjection` |
| condition bypass | `conditionAsserted`, `effectOverrides`, `effectDecisions` | replaced by scoped `ScenarioAssumption`; no whole-condition override |
| fixed-point context | `resolveBattleContext` | deleted; ordered state mutations only |
| separate NP control | `NpConditionControl`, `npConditionControls`, `resolveScenarioNpDamage` in `scenario.ts` | compiled as ordinary ordered damage operations |
| legacy aggregation | modifier summation in `resolveEffectSources` | executor-owned state folded once into `DamageKernelInput` |
| UI inference | `isAppliedEffectUserControllable`, `isContextOnly`, reason comparisons in calculator presentation | typed projection fields only |
| duplicated relevance | resolver and UI classifiers | normalizer/executor projection is the single owner |

The workspace audit must also reach zero references for legacy types/functions, compatibility flags, and servant-ID production branches.

## Master inventory baseline

Production normalized master contains 469 servants and 420 servants with an attacking NP. NP damage function families are:

| Family | Count |
|---|---:|
| `standard` | 371 |
| `defensePiercing` | 67 |
| `trait` | 141 |
| `traitCount` | 20 |
| `stateTrait` | 12 |
| `hpRatioLow` | 6 |
| `battlePointPhase` | 2 |
| `targetRarity` | 1 |
| `traitExpression` | 1 |

`packages/calculation-application/src/executionBaselineInventory.test.ts` derives and locks the complete effect type, buff type, condition-operator, parameter-key, context-producer and NP-function inventories from the production master. This avoids a hand-maintained servant allowlist and fails when a new family appears.

## Mandatory regression fixtures

The production-master contract test identifies fixtures by master identity only at the test boundary; execution code must not branch on these IDs.

- Archetype: Earth (`2300500`): field creation precedes the conditional Buster modifier; field creation is not projected.
- Dante Alighieri (`2801000`): heaven/hell state changes remain hidden while Arts, NP damage, and target power modifiers are projected.
- Wu Zetian summer (`505200` in the current Japanese master): before-damage operations and NP-level values retain source order.
- Summer Lilith (`405900` in the current Japanese master): only the NP-card-matching color modifier is projected.
- Defense ignore and damage-cut ignore are distinct operations.
- `traitCount`, `stateTrait`, `targetRarity`, `hpRatioLow`, and `battlePointPhase` each have a family fixture selected from production master.

## E0 gate

The baseline distinguishes UX invariants from correctness-driven output changes, identifies deletions by responsibility, inventories all production-master families without servant exceptions, and provides versioned comparison artifacts. No production behavior changes in E0.
