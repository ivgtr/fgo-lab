---
title: "TSK-04 NP resource semantics flow closure"
status: "Verified"
updated_at: "2026-08-31"
---

# TSK-04 NP resource semantics flow closure

## Outcome and ownership

Calculator and ranking damage, current operation outcomes, required inputs, and UI commands remain
unchanged while NP capacity, action requirements, gauge gain/loss, NP all-consume, and base
overcharge become canonical state. The data pipeline alone interprets Atlas function names, targets,
`Value`, and skill `NP_HIGHER`. Application owns scenario policy and commands. Battle execution owns
capacity/requirement/transition validation and atomic application. No generic battle-resource
framework is introduced; the closed resource union contains NP gauge only.

## Canonical state and outcome classes

- `CanonicalNpResourceSemantics`: NP-level capacity, NP command requirement, all-consume rule, and
  base-overcharge derivation.
- `CanonicalNpGaugeRequirement`: the skill-level minimum gauge emitted from raw `NP_HIGHER`.
- `CanonicalNpGaugeTransition`: recipient, fixed gain/loss amount series, clamp behavior, or an
  explicit unsupported dependent family. Raw function/target names are not members.
- `NpResourceState`: current gauge plus capacity. Execution validates the complete transaction before
  commit and returns the original state on any failure.

Distinct outcomes are: requirement satisfied, insufficient gauge, capacity contradiction, gain
clamped at capacity, loss clamped at zero, all-consume, base OC derived before consumption,
unsupported dependent transition, and invalid/partial transaction. None falls back to a plausible
numeric value.

## Producer, reader, writer, and flow inventory

| Path | Responsibility and direct nodes | Status |
| --- | --- | --- |
| raw producer | `snapshotNormalization.ts` reads skill `NP_HIGHER`; `effectNormalization.ts` reads NP function family/value/target | Verified |
| canonical artifact writer | pipeline emits the one snapshot NP rule, skill requirement, and effect transition; master schema rejects incomplete states | Verified |
| production occurrence inventory | 743 NP-gauge effects: 729 fixed, 14 dependent; unknown raw target 0 | Verified |
| capacity producer | one canonical NP-level table: NP1 100%, NP2-4 200%, NP5 300% | Verified |
| NP command producer | one canonical requirement 100%, all-consume rule, base OC from pre-consume gauge | Verified |
| application command writer | existing typed preparation commands identify skill/transform NP/attack NP; no gauge editor or raw key is added | Verified |
| execution transition | focused NP reducer validates capacity, requirement, all transitions, then commits atomically | Verified |
| calculator path | current calculator policy remains canonical start 100% and consumes the shared preparation/execution result | Verified; resource-aware plan selection remains TSK-05 |
| ranking alternate path | current ranking and calculator continue to share the same preparation reducer and damage executor | Verified; resource candidate generation remains TSK-05 |
| restore/reapply | scenario persists commands and NP level, not resource mutations; state is re-derived from master | Verified |
| UI | no sixth ranking condition or permanent start-NP input is introduced | N/A: product requirement |
| enemy NP turn/Battle Point | separate resource/state families, not player NP gauge | N/A: scoped out |

The resource-aware preparation integration that can intentionally change plan availability belongs to
TSK-05. TSK-04 publishes and validates the complete canonical resource contract and its atomic
execution primitive without changing current calculator/ranking policy results.

## Raw-to-canonical inventory

| Family | Occurrences | Canonical disposition |
| --- | ---: | --- |
| `gainNp` | 650 | fixed gain |
| `lossNp` | 79 | fixed loss |
| multiplier/count/dependent gain families | 14 | typed unsupported family; no numeric inference |
| total | 743 | classified 743, unclassified 0 |

The seven observed raw targets cover all 743 occurrences and map to the closed canonical recipient
union. Active production skills have seven occurrences across six `NP_HIGHER` skill identities; all are ten-level integer series
with values 10%, 30%, 50%, or 100%. There is no production skill `lossNp` all-consume marker; all
consumption is the separate NP-command rule.

## State x path counterexample matrix

| State | Pipeline/schema | Calculator/ranking | Restore/reapply | Status |
| --- | --- | --- | --- | --- |
| below requirement | typed minimum | atomic rejection, no partial state | deterministic | Verified |
| exactly requirement | typed minimum | transaction applies | deterministic | Verified |
| above requirement | typed minimum | transaction applies within capacity | deterministic | Verified |
| gain reaches/exceeds capacity | fixed amount and clamp | capped, never over-capacity | deterministic | Verified |
| loss reaches/crosses zero | fixed amount and clamp | floored at zero | deterministic | Verified |
| all-consume | NP command, not skill loss | pre-consume OC derived then gauge zero | deterministic | Verified |
| requirement/capacity contradiction | schema-legal forged state | typed invalid state | parse/rebuild rejects | Verified |
| dependent production gain | exhaustive unsupported member | typed unsupported, no guessed amount | deterministic | Verified |
| legal production-negative transition | focused all-consume/capacity fixtures | shared reducer result | round trip | Verified |
| later operation fails | full transaction prevalidation | original state returned | retry starts unchanged | Verified |

## Closure classification

- Verified: producer boundary, commands, restore/reapply ownership, production raw inventory, and
  absence of UI start-NP input.
- Verified: canonical schemas, full production classification, capacity boundaries,
  gain/loss clamps, all-consume/base OC, contradictions, unsupported dependent family, and rollback.
- Deferred: resource-aware preparation planning/application is `TSK-05`; satisfied-policy start-gauge
  candidate generation is `TSK-06`; UI evidence is `TSK-07`.
- Blocking: 0.

## Verification result

- Published master: schema 42, version `20260831.10`; 743/743 raw NP-gauge occurrences classified,
  with 0 unclassified targets.
- Focused resource/schema/inventory diagnostic: 5 files, 57 tests passed; artifact
  `.test-results/2026-08-30T17-50-39-212Z-15-782986`.
- NP transaction fixtures cover capacity below/equal/above, post-gain requirement, loss boundaries,
  all-consume/base OC, contradiction, dependent unsupported state, and rollback.
- Full production: 25 files, 119 tests passed in three runs; median 68.92s. Damage and applied-state
  hashes match HEAD for all 40 ranking matrices.

Inventory and implementation are complete with `Blocking: 0`. Newly found resource producers or
writers reopen this note before adding a local exception.
