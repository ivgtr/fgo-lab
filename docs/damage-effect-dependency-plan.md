# Damage effect dependency convergence plan

## Problem statement

The resolver currently treats every enabled effect as one flat candidate list. Direct damage
modifiers, battle-context mutations, and unrelated effects share the same unsupported path. It
also clears a candidate's known value while the effect is disabled. This produces three systemic
failures:

- known skill values are displayed as `倍率不明` until selected;
- context producers such as an NP field change stop the whole calculation as an unknown modifier;
- context consumers such as field-only passives can be applied without their condition because
  the relevant Atlas buff-script predicate is not normalized.

The 2026-08-25 production master audit found 37 of 469 servants stopped by default. The failures
span direct modifiers, context mutations, referenced functions, and genuinely unresolved dynamic
parameters, so servant-ID exceptions are not an acceptable fix.

## Target model

Each normalized effect has two independent semantics:

1. `damageModifier`: an operation that directly changes a kernel input.
2. `context`: conditions consumed by the modifier and mutations produced before damage.

Application state is separate from both semantics. A known magnitude remains available for UI and
audit while disabled. Enabling an effect decides whether it participates; it does not determine
whether its value can be decoded.

Context is resolved before direct modifiers:

```text
inherent attacker/card context
  -> selected skill/support context mutations
  -> automatic NP-before-damage context mutations
  -> passive and modifier condition evaluation
  -> direct modifier aggregation
  -> damage kernel
```

Only an enabled direct modifier whose output cannot be determined may stop a calculation. A
context mutation may stop it only when an enabled direct modifier consumes the unresolved context.
Unrelated field presentation, BGM, NP charge, trait assignment, and defensive effects do not stop
NP damage merely because their full gameplay behavior is outside the calculator.

## Implementation phases

1. Normalize Atlas `buff.script.INDIVIDUALITIE` as a field condition and typed field-trait
   production from `FieldIndividuality`. Bump the master schema; do not retain the lossy form.
2. Introduce a context-resolution pass before modifier routing. Context producers are not emitted
   as damage modifiers and their presentation-only parameters are not fed to modifier validation.
3. Decode effect magnitude before the enabled/disabled branch so the same value contract drives UI,
   application, and audit.
4. Replace the broad unsupported-buff list with explicit semantic roles. Continue to fail closed for
   enabled direct modifiers with unresolved dynamic magnitude or class-affinity behavior.
5. Audit all 469 servants after every phase. Add representative golden tests by semantic family,
   including Archetype: Earth; do not add servant-ID branches.

## Archetype: Earth acceptance case

- Chaos NP special remains a user toggle.
- Lv10 Rainbow Mystic Eyes shows defence down 20% and attack up 30% before selection.
- Lv10 Breath of the Planet shows NP damage up 20% before selection.
- NP field change produces `milleniumCastle` before damage and does not itself appear as an
  unsupported damage effect.
- Primordial One's Buster 30% applies because the NP creates the required field before damage.
- With no selected active skills, the result is calculated instead of unsupported.

## Quality gates

- normalized raw fixtures prove field condition and production without label parsing;
- effect resolver tests prove context-before-modifier ordering and known disabled magnitude;
- production-master audit records unsupported counts and reason families before/after;
- typecheck, lint, unit/integration, production build, and focused calculator E2E pass;
- residual unsupported cases remain fail-closed with a typed reason and an audit entry.

## 2026-08-25 implementation result

Phases 1–5 are complete. Master schema 8 replaces the lossy effect shape; the resolver now runs a
fixed-point context pass before modifier aggregation, and disabled effects retain known values.
Archetype: Earth passes the production-master regression and focused browser flow without a
servant-specific branch.

The default production audit moved from 37 unsupported calculations to 24 after context resolution,
then to 18 after the already-tested defence-ignore operation was connected to the evidence gate.
The audit now locks the exact servant IDs and reason families, not only the count. Four HP-dependent
entries can be resolved by the new conditional quantitative input. Battle Point input uses the same
contract, but Ereshkigal remains fail-closed because a separate phase-range parameter is unresolved.

Residual implementation is tracked by semantic family in
`docs/reports/damage-effect-dependency-audit.md`. It must be reduced by adding shared parameter or
effect handlers and golden cases; production code must not branch on the audit's servant IDs.
