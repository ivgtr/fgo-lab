---
title: "Damage effect execution E1 contract"
status: "Superseded"
historical_status: "Complete"
status_scope: "E1 ordered execution contract記録の完了を保持。production未接続は当時の境界"
superseded_by: "docs/evidence/damage-effect-execution-e2.md"
created_at: "2026-08-25"
source: "docs/damage-effect-execution-requirements.md v1.0.0"
---

# E1 final execution contract

`@fgo-lab/battle-execution` is the final owner of ordered battle state, conditions, operations, outcomes, and UI projection. At E1 it is a contract package only and is not connected to production, so no alternate runtime path exists.

## Contract decisions

- `BattleState` owns attacker/target/field traits, quantitative state, ordered applied modifiers, ignore flags, evidence, and unresolved issues.
- `ConditionExpression` is a discriminated recursive union for trait presence/absence, trait counts, card, quantitative comparisons, AND, OR, and NOT.
- `BattleOperation` covers trait add/remove, modifier add/rate change, defense ignore, damage-cut ignore, and all nine normalized NP-damage families.
- `ScenarioAssumption` can assert exactly one typed state fact for a stable decision key. It cannot bypass card, recipient, ordering, handler, value, or the rest of an expression.
- `OperationResult` uses the typed outcomes `applied`, `notApplied`, `notRelevant`, `impossible`, and `unsupported`.
- `EffectProjection` explicitly owns visibility, controllability, decision state, and an explanation code. UI behavior never depends on parsing free-form reason text.
- Source master IDs remain trace/evidence identity only. `BattleState`, conditions, and operation semantics contain no servant identity or display-name branches.

## Version and stored-data decision

The E2 central switch will set `schemaVersion` to 11, `engineVersion` to `8.0.0`, and publish a newly normalized master version. Existing draft/history/share snapshots are already validated against exact schema and engine literals; they will be rejected as current calculations rather than silently adapted. Profile originals unrelated to calculation meaning remain eligible for the existing one-way profile migration policy.

## Representative flow

Archetype: Earth compiles an `addTrait(field, milleniumCastle)` before a conditional Buster `addModifier`, followed by `executeNpDamage`. The state mutation has a hidden projection, while the modifier has a typed visible projection. A user declaration may supply a target trait for the NP special condition, but cannot make an Arts-only modifier apply to a Buster NP or move an operation earlier.

Unknown parameter semantics, unsupported condition forms, contradictory assumptions, and missing quantitative inputs produce typed issues and fail closed. Fixed-point context search is not part of the contract.
