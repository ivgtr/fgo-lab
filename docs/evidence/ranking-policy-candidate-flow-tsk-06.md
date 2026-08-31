---
title: "TSK-06 ranking policy and finite candidate flow closure"
status: "Complete"
updated_at: "2026-09-01"
---

# TSK-06 ranking policy and finite candidate flow closure

## Outcome and ownership

Every numeric value produced by the new ranking-policy API retains exactly one policy,
`AttackProfile`, ordered preparation program, start gauge, canonical input set, target candidate,
field candidate, quantity candidate, resolved scenario, and complete damage input. A candidate-space
error or an AttackProfile that cannot execute is never converted to baseline damage.

`RankingCandidateSpace` is the planning owner. It compiles finite domains from canonical master IR
before preparation runs. Battle execution remains the sole owner of ordered preparation, resource
preconditions, form transitions, overcharge, operation outcomes, and damage-input construction.
`calculateRankingPolicy` and the calculator use the same application facade and executor.

The old `RankingConditions` family is intentionally isolated through TSK-07. Its independent
`specialAttack` and `field` axes cannot be converted reversibly to
`RankingConditionalEffects`; therefore no legacy adapter exists. The worker/UI continue to use the
approved `ed88f1f8896354e31ae331b1d2302d765a2760e4` ranking family. New policy code is under
`rankingPolicyScenario`, `rankingPolicyCandidates`, `rankingPolicyCalculation`, and
`rankingPolicyMatrix`.

## Outcome classes

| Result | Meaning | Numeric value |
| --- | --- | --- |
| `calculated` | one complete candidate passed ordered preparation and canonical damage execution | yes |
| `unavailableUnderPolicy` | the requested AttackProfile exists but no candidate can execute | no |
| `invalid` | static semantics, canonical input, contradiction, or finite bound is invalid | no |

The legacy `RankingDetail` and new `RankingPolicyDetail` are distinct. Only the latter requires
candidate evidence. Execution rejection, missing input, and unsupported semantics remain typed and
are not passed to damage as guessed inputs.

## Flow inventory

| Path | Closure |
| --- | --- |
| policy producer | Verified: four self-buff × conditional-effect combinations compile to canonical commands |
| legacy producer | Verified: separate old family; non-reversible adapter removed |
| AttackProfile producer | Verified: policy-independent static inventory |
| preparation producer | Verified: finite initial form, ordered skill commands, optional transform NP, attack NP |
| preparation ordering | Verified: command sequence is part of state identity; equal slot sets in different orders remain distinct |
| semantic-domain producer | Verified: static conditions/input definitions only; no prepare/projection read during discovery |
| start gauge | Verified: baseline always present; satisfied policy adds legal capacities without overriding preconditions |
| TargetContext/field/quantity | Verified: finite canonical domains with baseline candidates and exclusive-fact constraints |
| complete product bound | Verified: checked before materialization, maximum production profile 2,880 / 4,096 |
| scenario materialization | Verified: every candidate starts from a fresh base scenario |
| ordered executor | Verified: TSK-05 transaction path; no ranking-side execution semantics |
| damage executor/cache | Verified: complete NP variant + damage input identity; calculator parity fixture passes |
| candidate selector | Verified: profile-local stable tie-break by damage, external facts, input deviation, actions/transitions, typed key |
| result writer | Verified: exhaustive calculated/unavailable/invalid profile result |
| recovery | Verified: another independently materialized candidate is tried; rejected prepared state is never mutated |
| legacy UI/worker/URL cutover | Deferred: TSK-07 |
| cross-level blueprint/cache optimization and full four-policy digest | Deferred: TSK-08 |
| support/CE/mystic-code/turn/refund expansion | N/A: outside the bounded TSK-06 policy |

## Canonical flow

```text
canonical master + AttackProfile + RankingComparisonPolicy
  -> static ordered PreparationProgram inventory
  -> static condition/input/resource domains
  -> full semantic product upper-bound check
  -> baseline + finite policy candidates
  -> fresh scenario materialization
  -> TSK-05 ordered preparation and canonical execution
  -> complete damage-input cache lookup
  -> AttackProfile-local stable selection
  -> calculated | unavailableUnderPolicy | invalid with one evidence trace
```

The NP1–NP5 correctness oracle is five complete `calculateRankingPolicy` calls. It does not rewrite
scenario/input NP level after execution and does not classify programs as partially reusable.
Optimization may cache only observable static blueprints or complete damage-input results in TSK-08.

## Counterexample matrix

| Counterexample | Classification |
| --- | --- |
| trait `present:true` / `present:false` | Verified: canonical evaluator completeness fixture |
| targetPredicate `present:true` / `present:false` | Verified: family-membership witness fixture |
| `target` / `targetState` positive, negative, and overlapping reads | Verified: physical read-scope closure fixture |
| traitCount `atLeast` / `atMost` / `equal` | Verified: target and field focused fixtures |
| provenance boundary by `trait` / `traitCount` variant | Verified: shared leaf-level source matrix across executor, audit, and planner axes |
| mixed ownership `any` / `all` / `not` | Verified: focused composition fixture and zero-production ratchet |
| nested `all` / `any` / `not` | Verified: canonical evaluator completeness fixture |
| exclusive traits: positive, negative, and mixed | Verified: candidate soundness fixture |
| self-generated trait before and after mutation | Verified: 405900 ordered target-state transition fixture |
| self buffs included/excluded with witness generation | Verified: four policy crossings and inventory fixtures |
| target traits with field, quantity, and canonical input | Verified: complete semantic-product materialization fixture |
| schema-legal conditions absent from production | Verified: focused traitCount/nested/exclusive fixtures |
| production 1102300 negative superGiant condition | Verified: NP1 average 88,558.08 and `powerMod` 0.5 |
| self buffs × conditional effects, all four crossings | Verified: focused policy fixture |
| external field absent/present | Verified: focused production fixture |
| self-generated field satisfies a later condition | Verified: focused production fixture |
| exclusive trait/class facts are not combined | Verified: finite-world fixtures |
| canonical-input-dependent form transition | Verified: schema-legal scenario fixture |
| ordered `S1 -> S2` and `S2 -> S1` with the same used slots | Verified: static program fixture |
| 505300 NP2–5 start gauge, terminal gauge, executor OC, and damage | Verified |
| rejected preparation does not become damage input | Verified: TSK-05 facade fixtures |
| one AttackProfile cannot substitute a sibling | Verified: full static inventory assertion |
| planner limit exceeded | Verified: typed `candidateLimitExceeded`, no numeric fallback |
| schema-legal unreachable profile | Verified: focused form-transition fixture returns `unavailableUnderPolicy` |
| exact tie | Verified: stable typed-key fixture |
| calculator/ranking scenario, effects, and result parity | Verified: all four policy fixture |
| UI presentation of new policy/evidence | Deferred: TSK-07 |

## Finite inventory

No effect inclusion is a dimension and no effect-subset `2^N` search remains. Domains are semantic:
ordered preparation program, start gauge, canonical inputs, target identity/facts, field facts, and
quantities. The complete per-profile product is checked before allocation.

Default new-policy production inventory:

| Counter | Value |
| --- | ---: |
| semantic upper bound | 7,255 |
| generated candidates | 7,255 |
| deduplicated candidates | 7,255 |
| damage request upper bound | 7,255 |
| damage requests | 6,913 |
| distinct damage inputs | 1,599 |
| cache hits | 5,314 |
| maximum one-profile product | 2,880 / 4,096 |

The ordered-program correction doubled the three-servant policy fixture from 24 to 48 baseline
candidates and from 208 to 404 satisfied candidates. Distinct damage inputs stayed 16/56 for included
and 4/14 for excluded; the extra legal orders therefore converge through the complete-input cache.
Production servant 2501400 also became calculated: its former unavailable result was a false negative
caused by unordered state deduplication.

The witness correction keeps the default baseline-policy inventory above unchanged. In the focused
three-servant satisfied-policy inventory, candidates increase from 404 to 1,056; included distinct
damage inputs increase from 56 to 104 and excluded from 14 to 26. The increase represents explicit
false/true physical target facts and the field all-absent state, not effect subsets. A production
audit checks 13,026 world-fact-only target condition occurrences across 205 servants/program paths and finds a
canonical true witness for every occurrence. The population includes 1,743 occurrences with
canonical default provenance, including 49 with a negative trait leaf.

## Structural findings and guardrails

### Fourth review reopening: nested ownership composition

Confirmed fact: the production audit recursively requires every leaf to be world-fact evaluable for
both `all` and `any`. The executor instead evaluates `any(effectLocal, worldTrue)` as true, while
`targetConditionWitnessSpace` retains the world branch axis and omits only the effect-local leaf.
The audit therefore excludes a schema-legal condition for which the planner can generate a true
witness. The same test-local `every` structure exists in parent `8393c5c`; current production has
zero mixed-ownership conditions, so the 13,026-condition inventory and ranking damage are unchanged.

Implementation mismatch: the leaf-level source matrix was presented as nested closure without
testing boolean composition. Missed detection: the added matrix covered only standalone leaves.
Recurrence scope: `any`, `all`, and `not` combinations of world-fact and effect-local leaves.
Minimum guardrail: name and document the production population as world-fact-only, cover mixed
ownership in focused fixtures, retain a world-true witness for `any`, and prove that `all` and
`not(effectLocal)` cannot be made true by fabricated world facts.

Resolution: the audit predicate is named and documented as world-fact-only rather than as general
witness eligibility. A focused schema-legal fixture proves that mixed `any` retains only the world
axis and has a canonical true witness, while mixed `all` and `not(effectLocal)` have no fabricated
true witness. The production gate separately ratchets mixed ownership at 0 conditions / 0 servants;
the world-fact-only population remains 13,026 conditions / 205 servants.

### Third review reopening: provenance variant ownership

Confirmed fact: `conditionTraitRequiresProvenanceDecision` accepts only a provenance value, so it
cannot own which `ConditionExpression` variants use provenance. The executor applies it only to
`trait`, while the production audit independently applies it to both `trait` and `traitCount`, and
`targetConditionWitnessSpace` enumerates both variants without consulting the classification.

Implementation mismatch: the exported value comparison was described as the executor-owned
provenance boundary even though union-variant applicability remained in each consumer. Missed
detection: the boundary fixture tested provenance values in isolation and did not cross executor
evaluation, audit eligibility, and witness-axis generation for every trait condition variant.
Recurrence scope: every new provenance-bearing leaf or consumer can choose a different applicability
set. Minimum guardrail: remove unsupported `traitCount.provenance`, expose a discriminated leaf-level
`worldFacts` / `effectLocalDecision` classification from battle-execution, and use it in the
executor, witness-space producer, and production audit with one schema-legal variant matrix.

Resolution: `ConditionExpression.traitCount` no longer exposes provenance because the canonical
pipeline has no provenance-aware count requirement. Battle-execution now accepts the whole
`trait | traitCount` leaf in `traitConditionEvaluationSource` and exhaustively returns `worldFacts`
or `effectLocalDecision`. The evaluator, `targetConditionWitnessSpace`, and production audit share
that classification. The variant matrix fixes absent/default/exceptional trait provenance and
provenance-free `traitCount`, including executor result, audit eligibility, and planner axes.

### Second review reopening: provenance audit population

Confirmed fact: the production completeness test admitted only traits with absent provenance, while
the executor also evaluates the canonical default provenance normally. This excluded 1,743
otherwise evaluable condition occurrences, including 49 `present:false` occurrences in the
recurrence family. The implementation already generates witnesses for the expanded population, but
the production gate did not retain that evidence. The guardrail is to export the executor-owned
provenance decision rule and use it directly when defining the audit population; test-local
provenance defaults are prohibited.

### Review reopening: incomplete condition witness space

Confirmed fact: `7159e27` changed `rankingWorld.ts` from enumerating both truth values for every
referenced target trait to deriving one value from the outer `not`, while ignoring the leaf
`present` value and the comparison/count of `traitCount`. It also treated a `target` trait as one
initial fact although the canonical evaluator reads both `target` and `targetState`. Consequently a
negative combined trait was left unknown or true after a state contribution, and a legal stronger
candidate could be absent. The production review fixture for 1102300 demonstrated this mechanism:
asserting `superGiant=false` in both physical scopes changes NP1 average from 80,857.34 to 88,558.08
and `powerMod` from 0.3 to 0.5.

Implementation mismatch: the planner partially reimplemented condition polarity instead of asking
battle-execution for the canonical read dimensions and validating witnesses with its evaluator.
Missed detection: parity tests replayed the selected candidate but did not compare the selected
maximum against the complete finite state space. Recurrence scope: target/targetState traits,
target predicates, `traitCount`, nested `all`/`any`/`not`, exclusive traits, and self-generated state
transitions. Minimum guardrail: separate candidate soundness, per-condition completeness, a small
exhaustive maximum oracle, and a production negative-condition damage fixture.

### Candidate discovery/execution cycle

The removed planner prepared a scenario to discover inputs/effects and then prepared again after
adding candidates. This was a procedural fixed-point search and its partial 4,096 checks did not
bound the total product. The guardrail is a static `RankingCandidateSpace` plus one whole-product
check before materialization.

### Non-reversible legacy adapter

Legacy `specialAttack` and `field` have four combinations, while one new conditional-effect axis
has two. Mapping either middle state to `satisfied` loses meaning. The adapter was removed; old and
new families remain separate until the UI cutover.

### Ordered-state deduplication

A state key based on a used-slot set collapsed different transaction orders. The state key now
contains the full command sequence. Semantic deduplication before execution is prohibited unless a
complete canonical state identity proves equivalence.

### Partial NP-level execution reuse

The removed matrix optimization executed NP5 candidates, rewrote scenario/input NP level, and
selectively reran candidates based on a ranking-owned sensitivity predicate. It recreated damage
semantics outside the executor. The canonical new-policy matrix is five complete executions;
blueprint-only caching is deferred.

### Executor-derived overcharge

The application previously rebuilt damage OC from persisted scenario OC and dropped the ordered
executor's terminal base OC. Calculator and new policy now use executor-derived OC. A scoped legacy
preparation option preserves the approved old ranking entrypoint only until TSK-07.

## Verification and performance

- Focused witness/policy/candidate/scenario diagnostics: 6 files / 55 tests passed.
- Unit: 60 files / 352 tests passed.
- Production: 27 files / 150 tests passed.
- Legacy production audit: 433 AttackProfiles/rows and damage cache 3,629 requests / 1,623 distinct,
  unchanged from the approved baseline.
- Ranking hot path after witness correction: 64.56s, 65.31s, 64.70s; median 64.70s versus the
  pre-correction median 60.91s (+3.79s / +6.22%, inside the 5s / 10% ratchet).
- Final production gate after registering the witness audit in the production suite: 80.16s,
  80.80s, 80.77s; median 80.77s versus the pre-correction median 75.50s (+5.27s / +6.98%). The
  measured increase includes 21 new production tests and remains below the 10% ratchet.
- Final `pnpm quality`: passed, including 64 executed E2E cases (32 project-filtered skips).

## Closure

- Verified: canonical witness generation, candidate soundness, per-condition completeness,
  exhaustive four-state maximum-damage oracle, selected-candidate calculator parity, production
  negative fixture, executor-shared leaf evaluation source, inventory, performance, ordered
  preparation, typed outcomes, and legacy isolation. The maximum-product record is consistently
  2,880 / 4,096.
- N/A: support/CE/mystic-code/turn/refund expansion.
- Deferred: TSK-07 UI/worker/URL cutover; TSK-08 cross-level blueprint caching and full four-policy
  production digest.
- Blocking: 0.
