---
title: "ADR 023: canonical noble phantasm variant selection"
status: "accepted"
recorded_commit: "5844afca744dac03aaf1c6cef2d49ec76e7a59c9"
---

# ADR 023: canonical noble phantasm variant selection

## Status

accepted

This replaces the card-type mutation interpretation of Atlas
`tdTypeChange*`; it does not begin E5.

## Context

Atlas `tdTypeChangeArts`, `tdTypeChangeBuster`, and `tdTypeChangeQuick` do not
describe a card mutation. Their card enum value indexes the base noble
phantasm's `tdTypeChangeIDs` and selects another `NiceTd`. The selected
`NiceTd` owns its card, attack target scope, NP-level multiplier, damage
function, before/after effects, and other damage-reachable semantics.

Treating the suffix as a card allowed one variant's card and state traits to be
combined with another variant's multiplier and effects. It also discarded
non-attack variants and could not identify a variant that belongs to a
transformed actor form.

## Decision

Master schema 34 represents noble phantasms as form-qualified variant groups.
A variant identity is `{ actorFormId, noblePhantasmId }`. Every group has one
base variant and unique members. `attack` and `nonAttack` are a discriminated
union. An attack variant owns card type, target scope, NP-level multipliers,
damage function, and before/after effects; a non-attack variant cannot supply a
damage operation.

The pipeline is the only layer that reads Atlas `tdTypeChange*`, card-enum
indexes, and `tdTypeChangeIDs`. It strictly resolves each index to a
form-qualified variant and emits typed `selectNoblePhantasmVariant` operations.
When a choice changes actor form, it also emits `transformActorForm`. The raw
suffix is evidence for the lookup index only and is never evidence for the
selected variant's card.

Battle preparation derives the current actor form and selected variant from
canonical master operations plus scenario choices and activation facts. Form
transition, variant selection, linked state mutations, and the activation fact
form one transaction. Validation completes before a damage operation is
executed. Unknown or missing variants, form mismatch, conflicting selection,
partial activation, non-attack damage, and mixed variant properties reject the
whole scenario without rewriting a decision or falling back to the base
variant.

The scenario continues to store only user input, including existing choices,
activation facts, effect decisions, world facts, target context, and quantities.
It does not persist selected variants, actor forms, compiled operations, or
ranking-entry identities. Scenario schema therefore remains 30. Calculator and
ranking use the same application facade and battle executor.

Ranking compiles a servant once, evaluates its canonical attack-variant
candidates as one NP1-5 matrix, then partitions results by target scope. A
ranking entry is `Servant × AttackTargetScope`; the existing `all`, `single`,
and `all-target` filters only partition calculated entries. Within one scope,
the winner is selected by damage, then fewer external assumptions, then fewer
activation facts, then the stable form-qualified variant key. Variants of
different scopes never eliminate each other, and non-attack variants never
produce entries.

## Ownership

- data-pipeline owns all raw Atlas lookup semantics and strict normalization.
- schema/master-data owns variant identities, groups, operations, and
  cross-reference validation.
- calculation-application owns canonical scenario commands and derived
  selection requests shared by calculator and ranking.
- battle-execution owns atomic preparation, validation, and execution of the
  selected complete variant.
- web renders canonical evidence and never infers a variant from names, labels,
  or Atlas vocabulary.

## Consequences

`cardTypeMutation` and `changeCardType` are removed rather than retained as a
compatibility path. Master artifact `20260828.3` and engine `25.0.0` are
breaking changes. The twelve production operations previously normalized as
card mutations must either resolve to canonical variant selection (including
the form-qualified Flora transition) or fail artifact generation. No servant
identity, name, skill ID, or effect label may participate in runtime dispatch.
