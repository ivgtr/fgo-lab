---
title: "Damage effect execution E3 production and UX audit"
status: "Superseded"
historical_status: "Complete - Awaiting User UX Confirmation"
status_scope: "E3実装・検証の歴史記録。元UX確認待ちを保持し、後続Task doneからUX承認を推定しない"
superseded_by: "docs/evidence/damage-effect-execution-e3-2.md"
created_at: "2026-08-25"
schema_version: 11
engine_version: "8.0.0"
master_data_version: "2026-08-25-atlas-jp-calculator-v17"
---

# E3 production and UX audit

E3 closes the ordered-execution migration gate for the single-calculation experience. E4 ranking integration has not started.

## Correctness convergence

- Permanent traits and state traits are stored separately, with multiplicity retained for count-based NP functions. Ordinary target-trait conditions see their union, while state-trait NP functions read only the state-trait set.
- Compound AND conditions emit every required typed scenario assertion; an effect toggle no longer asserts only the first fact.
- NP special-function evaluation moved into the ordered battle-execution package. The former calculation-application NP handler type, functions, tests, exports, and generated artifacts were removed.
- Target trait-count NP functions expose ordinary typed effect projections for each target trait. They use the same projection and assumption path as every other conditional effect; no separate NP condition controller was reintroduced.
- Conditional NP operations remain enabled and are decided by battle state at their execution point. A preceding state mutation can therefore satisfy a later condition without fixed-point search or retroactive evaluation.
- NP special correction is selected by OC, independently of NP level. The Archetype: Earth regression at NP5 and OC1 now correctly shows 1.50x instead of retaining the former 2.00x expectation.

The damage kernel implementation and its binary32 boundaries, final floors, 900–1099 random range, and NP1–5 evaluation were not changed.

## Production master audit

- 469 servants inventoried.
- 420 servants with an attacking NP executed through the production facade.
- 403 resolve to calculated results and 17 remain typed fail-closed cases; the E2 unsupported set did not grow.
- Candidate projections have no missing modifier value.
- Archetype: Earth establishes Millennium Castle before the continuous Buster modifier is evaluated.
- Dante exposes the two attribute power modifiers and NP damage modifier while non-damage NP effects stay out of the calculation projection.
- Summer Wu records the pre-damage undead state mutation without displaying the state-only operation.
- Water Lilith's NP state-trait condition does not match a permanent trait and remains user-controllable through a typed state assertion.
- Defense piercing, damage-cut piercing, trait count, state trait, target rarity, HP ratio, and Battle Point phase are covered by operation tests and golden fixtures. Missing quantitative context fails closed.

## UX and persistence audit

- Desktop and explicit 320px visual baselines pass. The information hierarchy and controls are unchanged; the stored baseline difference is the master version footer from v16 to v17.
- Keyboard and accessibility coverage passes with no serious Axe violations on the startup, desktop, and mobile calculator paths.
- URL sharing, share-only JSON, image export, draft restore, history, offline restore, incompatible cache rejection, and current-schema round trips pass.
- Real-data browser regressions pass for Archetype: Earth, Dante, Summer Wu, and Water Lilith.
- No target-trait editor, field-state editor, special-NP panel, or manual operation-order input was added.

## Validation record

- `pnpm format:check`: pass
- `pnpm lint`: pass
- `pnpm typecheck`: pass
- `pnpm test`: 27 files, 121 tests passed
- `pnpm validate:master`: 3 files, 15 tests passed after master validation
- production master regression: pass for 469/420 inventory and the 17-case fail-closed ratchet
- property tests: condition order invariance, unrelated-trait invariance, state/permanent separation, three-valued logic, and compound assertions pass
- `pnpm test:e2e`: 31 passed, 21 project-specific skips, 0 failed
- desktop and 320px screenshots: pass and visually inspected
- `pnpm build`: pass
- `git diff --check`: pass

## Removed-path audit

Runtime-source searches return zero references for the legacy resolver package, fixed-point context resolver, whole-condition assertion, boolean effect decisions/overrides, separate NP condition controls, old NP handler types/functions, legacy resolved-effect shape, compatibility flags, constant servant-ID calculation branches, and UI reason-string calculation decisions.

The next action is user confirmation of the actual calculator input and result experience. E4 remains unstarted until that confirmation.
