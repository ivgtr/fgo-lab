# ADR 022: activation structure cleanup boundaries

## Status

Accepted for E4.1 cleanup. This ADR changes ownership and control flow only; schema 30, engine 24.0.0, damage semantics, UI, and persisted scenario values remain unchanged.

## Context

The canonical model already separates `ActivationFact`, `EffectDecision`, and immutable execution-time `ActivationContext`. Its first implementation nevertheless duplicated condition-tree traversal between battle-execution and calculation-application, duplicated fact-set structure rules between Zod and the executor, and represented invalid preparation as an issue list plus an empty valid-looking context.

Those duplicates create multiple modification points for a future activation family even though current production damage is correct.

## Decision

Ownership is reduced to four boundaries:

1. `schema/activationFactSet` owns canonical activation identity, ordering, duplicate detection, choice exclusivity, quantity-range intersection, and immutable fact indexes. Zod and battle-execution consume the same analyzer result.
2. `battle-execution/activationCondition` is the only activation-aware condition-tree analyzer. It owns atom collection, deterministic materialization analysis, negation rejection, and three-valued evaluation against a valid context.
3. `battle-execution/activationContext` only combines compiled operation requirements with analyzed scenario facts, validates source/requirement reachability and mandatory facts, and returns a discriminated valid/invalid result.
4. `calculation-application/activationContext` updates primary scenario selections and canonicalizes/prunes them from exported compiled analyses. It does not recurse over `ConditionExpression`.

Candidate preparation becomes a discriminated union. Invalid activation context returns before operation activation, constraint validation, card mutation selection, or operation execution. Failure assembly receives the unchanged candidate input, decisions, projections, and explicit invalid issues; it never substitutes an empty context as executable state.

## Invariants

- Validation and execution use the same immutable analyzed fact indexes.
- Portable fact-set validation is implemented once and translated to Zod or execution issues at boundaries.
- Operation-aware unknown/orphan/missing validation remains in battle-execution.
- Ranking and calculator use the same application fact-selection service and canonical executor.
- No raw Atlas vocabulary, servant identity, labels, UI commands, legacy helpers, or compatibility fallback enter the activation path.
- Damage input, effect outcome, typed precision, scenario serialization, versions, and UI remain byte-for-byte or pixel-for-pixel equivalent to E4.1.5.
