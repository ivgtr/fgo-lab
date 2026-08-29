# Damage condition application convergence plan

## Decision

Damage-related conditional effects are controlled from the applied-effects list. Turning an
effect on is the user's explicit assertion that its gameplay condition is satisfied for this
calculation. The resolved calculator does not also maintain a target-trait editor.

This applies to attacker skills, passives, Craft Essences, Mystic Codes, support effects,
before-damage NP effects, and conditional NP damage functions. Conditions remain normalized in
master data for labels, audit evidence, and automatic checks that cannot be user assumptions
(for example, the NP card type), but there is one user-facing application decision.

## Structural changes

1. Remove target traits, target state traits, attacker state traits, target rarity, and field traits
   from the resolved scenario contract. Manual final-value calculations keep their low-level input
   contract.
2. Define an explicit `true` effect decision (or a selected support effect) as both enabling the
   effect and asserting its normalized trait/field conditions. A decision never bypasses card-type
   compatibility, actor routing, missing level values, or unresolved parameter semantics.
3. Represent conditional NP damage functions as resolved effects with stable decision keys. Binary
   conditions use one toggle; target trait-count functions expose one toggle per contributing trait.
   HP-ratio and battle-point functions remain quantitative inputs and are not reduced to booleans.
4. Remove the separate target-trait / special-NP-condition UI and show NP condition controls in
   `自身の適用内容` with the other damage effects.
5. Bump the scenario schema and calculation engine versions. Old resolved scenarios are rejected;
   no migration or dual interpretation is retained.

## Quality gates

- Explicit selection applies a condition-dependent damage modifier without target-state entry.
- An unselected conditional modifier is excluded from damage.
- Selection cannot force a card-incompatible or semantically unresolved effect into the result.
- Conditional NP multipliers round-trip through scenario sharing and visibly affect damage.
- Non-damage effects remain absent from the applied-effects UI.
- Typecheck, lint, unit/integration tests, production build, and focused calculator E2E pass.

## Commit sequence

1. Record the contract and remove the obsolete resolved-scenario condition fields.
2. Unify condition assertion in effect resolution and add conditional-NP resolved effects.
3. Replace the UI, add regression coverage, and update quality reports/versioned fixtures.
