---
title: "TSK-05 transactional preparation execution flow closure"
status: "Complete"
updated_at: "2026-08-31"
---

# TSK-05 transactional preparation execution flow closure

## Outcome, invariants, and ownership

The user-visible outcome is that every attacker preparation command either commits all of its
condition, choice, NP-resource, effect, trait/quantity, form, and NP-variant consequences in canonical
order or commits none. An unavailable attack NP never reaches a numeric damage result. Repairing a
typed input causes a complete re-prepare from the persisted commands and current master; runtime
mutations are never restored.

The semantic family is the attacker preparation program owned by battle execution. The data pipeline
alone interprets Atlas vocabulary and emits canonical requirement, selection, resource, route, and
mutation semantics. Calculation application owns commands and, from TSK-06, finite policy candidates.
Ranking policy may choose a command/world/resource candidate but cannot rewrite an execution
precondition or operation outcome.

Start baseline is clean `main` at `69f8207e6252f8991b42ee7c55b578dba3c5f359`. The inherited TSK-04
ratchets are 422 calculator scenarios, 433 ranking rows, runtime counters `1 / 1 / 1`, preparation
`6,508 / 4,009`, ranking damage requests `3,744 / 1,644`, production canonical inventory/digests,
calculator/ranking shared execution, and no unexplained damage change. The pre-change production
times are 77.78s, 79.73s, and 79.73s (median 79.73s).

## Canonical state and outcome classes

Preparation executable state contains current form, selected form-qualified NP variant, used skill
slots, transform-NP use, active effects, state traits, ordered applied actions, and canonical NP gauge
with NP-level capacity. A rejected transition carries its typed code and the original executable state;
it cannot be passed forward as a successful state.

Externally meaningful outcomes remain distinct:

| Outcome class | Canonical disposition |
| --- | --- |
| executable | complete ordered action commits |
| inclusion disabled / stochastic failure | operation is not applied; it does not become invalid |
| repairable input | `inputRequired`; full re-prepare after the command |
| semantic invalidity | typed invalid result; no numeric fallback |
| unsupported execution/resource family | typed unsupported result; original action state retained |
| insufficient resource / illegal command | typed rejected preparation transition; original action state retained |
| later member fails | whole action/effect transaction rolls back |

## Producer, reader, writer, and flow delta

| Path | Direct responsibility | Classification |
| --- | --- | --- |
| raw producer | `data-pipeline` normalizes condition, choice, proc, NP resource, route, form, and variant vocabulary | Verified: TSK-04 canonical boundary unchanged |
| canonical artifact writer | `master-data` strict unions reject partial/mixed operation and resource states | Verified: TSK-04 contract unchanged |
| command writer | schema/application persist only initial form and ordered preparation commands | Verified |
| preparation state producer | `resolveAttackerFormExecution` builds `PreparationExecutionContext`; planner helpers and `actorFormGraph` also produce/read preparation states | Verified: resource semantics and selected NP level are mandatory at every direct reader |
| skill action writer | skill slot, player choice, condition, skill requirement, effect resource transition, traits, form, and variant commit as one action | Verified: transactional fixtures and production inventory |
| non-attack NP writer | resource requirement/consume, effects, form, and next NP variant commit as one action | Verified: shared reducer and restore/reapply fixture |
| attack NP writer | validates selected attack variant and NP resource, derives base OC before all-consume, then terminates | Verified: exact-consume and insufficient-gauge fixtures |
| effect execution | shared stochastic resolver records the preparation result on the applied effect and ordinary operation | Verified: success/failure/inputRequired/invalid fixture plus compiler handoff counterexample |
| calculator path | `sourceCollection` preserves preparation required-input definitions through the prepared execution union | Verified: public result is `inputRequired`, with a repairable UI input model |
| ranking alternate path | `compileRankingPreparationProgram` calls full rematerialization after canonical-minimum selection | Verified: resource-only input change re-prepares gauge through the ranking candidate path |
| recovery | `rematerializePreparedCalculationInputs` rebuilds scenario input, preparation, source collection, operations, and execution when a preparation input changes | Verified: application recovery fixture changes the committed resource state from 10,000 to 12,000 |
| damage-only input rematerialization | canonical keys absent from the preparation-input identity set reuse the prepared sources and rerun ordinary execution | N/A: these keys cannot change condition/resource/state/form/variant preparation; focused resource-input counterexample takes the full replay branch |
| restore/reapply | application fixture restores the persisted command list and repairs only canonical input | Verified: real rematerialization path, not a reducer-local replay helper |
| preparation readers/cache | `productionPlanCache` and `actorFormGraph` read candidate availability | Verified: mandatory semantics/NP-level arguments and independent cache-identity fixtures |
| contribution counterfactual | removes contribution only after legal execution; cannot restore resource or an illegal action | Verified existing boundary |
| support/CE/mystic-code resource mutation | not members of the bounded self-preparation command grammar | N/A: current product plan contains only attacker skill, optional transform NP, and attack NP |
| normal attacks, NP refund, turns, cooldowns | outside the bounded preparation product | N/A: battle simulation is not a requirement |
| ranking satisfied-policy resource candidates | finite internal start-gauge and unresolved scenario-fact candidates | Deferred: TSK-06; unresolved conditional gains are retained for normal effect execution but are not guessed as preparation resource |
| permanent start-NP editor/UI | explicitly excluded by the product requirement | N/A: no sixth ranking condition or calculator resource editor |

## Forward and recovery flow

```text
canonical master + ordered command + immutable action-start state
  -> command/form/slot precondition
  -> player choice resolution
  -> stochastic/condition activation for action-relevant operations
  -> NP requirement and complete resource transition validation
  -> effect/state/form/variant mutation on a clone
  -> attack-NP resource validation and terminal commit
  -> shared calculator/ranking damage execution

rejected / inputRequired / unsupported / invalid
  -> retain the action-start state
  -> typed application result
  -> repair persisted canonical input/command
  -> recreate initial preparation state and reapply every command
```

## State x path counterexample matrix

| State | Skill | Non-attack NP | Attack NP | Restore/reapply | Classification |
| --- | --- | --- | --- | --- | --- |
| exact 100% baseline | requirement and ordered mutations apply | consume only when selected | consumes all and terminates | deterministic | Verified acceptance case |
| below action requirement | no effect/form/trait/resource commit | no transition commit | no terminal commit | repaired gauge candidate replays | Verified acceptance case |
| gain then later unsupported transition | whole skill rolls back, including gain and traits | whole NP rolls back | N/A: attack command has only canonical consume | original commands re-reject | Verified acceptance case |
| legal choice / illegal choice | selected branch only / original state | N/A: transform NP has no player command choice | N/A | corrected choice replays | Verified existing plus atomicity delta |
| stochastic success/failure/inputRequired/invalid on a preparation mutation | one shared resolver classifies the effect before resource/state mutation | applied success/failure is passed into the ordinary operation | rejected activation leaves attack availability unchanged | repair performs full replay | Verified: schema-legal success/failure production-negative cases plus typed inputRequired/invalid contract cases |
| condition false after prior mutation in group | group starts from cloned state and rolls back on later failure | same executor | attack unreachable when structural action failed | deterministic | Verified existing group rollback; retained as adjacent guardrail |
| form transition plus variant mismatch | no form, trait, resource, or selected variant commit | same | cannot execute mismatched NP | deterministic | Verified acceptance case |
| non-attack NP reaches attack form | one ordered program continues | consumes resource and commits transition atomically | selected attack NP executes once | deterministic | Verified acceptance case |
| schema-legal dependent NP transition absent from active plan production | typed unsupported action; no guessed amount | same | N/A | deterministic | Verified production-negative focused fixture |
| action after attack / skill reuse / transform reuse | rejected before mutation | rejected before mutation | exactly one terminal action | deterministic | Verified existing reducer invariant |
| contribution excluded by ranking | action/resource/state remain committed | same | legal execution retained | deterministic | Verified adjacent-boundary refutation: contribution policy cannot create or undo execution state |

The minimum adjacent-boundary refutation is the contribution-exclusion case: it shares the compiled
operation and state types, but cannot exhibit the preparation partial-commit mechanism because it is a
read-only projection applied after legal execution. The minimum alternate-family refutation is an
effect group whose second operation fails: the existing executor restores the cloned group state, so
the newly found mechanism is specifically the pre-execution preparation/resource split rather than a
general failure of every transaction boundary.

## Closure classification after structural review

- Verified: raw/canonical producer boundaries, command grammar, shared stochastic activation,
  application required-input propagation, full calculator/ranking replay, mandatory planner identity,
  local resource atomicity, form/variant validation, ordinary effect-group rollback, and the adjacent
  contribution counterfactual.
- N/A: support/CE/mystic-code resource mutation, normal attacks/refund/turn/cooldown simulation, and a
  permanent start-NP UI.
- Deferred: satisfied-policy start-gauge/resource candidate generation is TSK-06; UI presentation is
  TSK-07; the four-policy full audit remains TSK-08 where it depends on those policies.
- Blocking: 0.

Any structural finding that introduces another writer, bypasses activation, or requires a second
calculator/ranking executor reopens this note before a local patch is added.

## Structural review cause analysis

### 1. Mechanism — confirmed

TSK-05 made preparation depend on canonical input, NP resource semantics/level,
condition/choice, typed rejection, stochastic outcome, and fresh-state replay. The baseline already
contained the generic issue adapter and input-only rematerialization, but the new dependencies make
those paths inconsistent in this change: `resolveAttackerFormExecution` converts every rejection to
`unsupportedOperation`; `resolvedScenarioBaseInput` throws `preparation_plan_invalid`;
`rematerializePreparedCalculationInputs` reuses prepared source collection; preparation has a local
condition evaluator with no stochastic outcome; planner defaults/cache and `actorFormGraph` omit new
identity inputs. This is a TSK-05 integration regression, not a pre-existing product failure.

### 2. Implementation mismatch — inference

The planned boundary was resolved stochastic/condition activation -> resource validation -> state
mutation -> typed application result -> full replay after repair. The implementation split that into
a preparation-local condition/resource transaction, ordinary-executor stochastic activation, a
generic issue adapter, and ordinary-operation-only rematerialization. The evidence is the new local
evaluator in `preparationTransaction`, the unchanged issue adapter in `sourceCollection`, and the
unchanged reuse branch in `rematerializePreparedCalculationInputs`.

### 3. Missed detection — confirmed

The focused tests stop at the reducer boundary: they manually replace context or create a fresh state,
all effects are guaranteed, and no test asserts the public calculator/ranking result after repair.
Production cannot cover the missing state because attacker preparation mutations with stochastic proc
are currently zero, default inputs do not exercise repair, and default semantics equal the master.
The earlier `Verified` labels therefore described intended behavior rather than the concrete path.

### 4. Recurrence scope and minimum guardrail — inference

The same mechanism can recur for attacker HP/Battle Point repair, TSK-06 scenario facts/start gauge,
stochastic success-count input, NP-level changes, restore, ranking canonical minimums, and future
master resource semantics. The minimum guardrail is: inventory every context producer/consumer;
propagate a required-input key through the application union; rebuild preparation from persisted
commands on repair; feed one resolved activation outcome to preparation and ordinary execution; make
semantics/NP-level arguments mandatory and cache-identifying; and execute schema-legal negative
fixtures through both calculator and ranking.

## Direct path inventory for the reopened delta

| Role | Concrete path | Required closure |
| --- | --- | --- |
| context producer | `resolveAttackerFormExecution` | canonical semantics, NP level, inputs, and resolved activation |
| rejection adapter | `sourceCollection` -> `resolvedScenarioBaseInput` | preserve `inputRequired` with input definition/key; keep unsupported/invalid distinct |
| recovery writer | `rematerializePreparedCalculationInputs` | rebuild scenario input, source collection, preparation, compiled plan, and execution |
| ranking alternate consumer | `compileRankingPreparationProgram` | use the same full rematerialization result and never override preparation preconditions |
| UI reader | `getAttackReachableActorFormStates` / `getAttackReachableInitialActorForms` | require master semantics and selected NP level |
| cache writer | `productionPlanCache` | include canonical resource semantics identity, NP level, OC, and start gauge |
| activation producer | ordinary `OperationActivation` planning | expose success/failure/inputRequired/invalid once for preparation-affecting effects |

## Implementation and production delta

`preparationTransaction` is the single action planner for preparation-affecting canonical effects. It
evaluates local condition and choice state, validates the complete resource requirement/mutation
sequence on the immutable action-start gauge, and returns only a ready plan or a typed rejection.
Skill and transform-NP reducers then validate form/variant/state mutations against the condition-
enabled effects and commit structural and resource results together. Attack NP uses the same resource
transaction, derives base OC from the pre-consumption gauge, consumes all once, and terminates.

The production plan inventory changed intentionally from `6,508 / 4,009 / 3,559` generated /
deduplicated / terminal states to `6,376 / 3,957 / 3,446`. Seventy attempted actions are rejected:
64 `unsupportedResourceMutation` and 6 `insufficientNpGauge`. Calculator remains 422/422 calculated
with zero unsupported, invalid, or input-required results; ranking remains 433 rows with zero
failures. Runtime counters are `1 / 1 / 1`, preparation `6,376 / 3,957`, and damage cache
`3,629 / 1,623`. The application inventory digest is
`80a63a7be083c68dc80c844aa99a891d5fa4cfe2491e0c69cb0358d71d990f25`; calculator/ranking execution
parity is `9c1100da17d8b7ac1e6f5c11594c2caa5236061c28647d585d23934d6b964ad1`.

The damage delta is bounded by the governing rule: a preparation action with an attacker-affecting
unsupported NP mutation, or an attack attempted below 10,000 basis points, is no longer selectable.
This changes the default calculator result for six canonical skill/resource families
(`dependentTargetResult` x3, `matchingTargetCount`, `matchingBuffCount`, and one ordered fixed-loss
sequence) and removes the stronger activation-local ranking plan for one additional servant. No
servant ID/name/raw key is used by runtime branching; IDs remain only in production assertions and
the comparison record.

## Verification and performance

- Focused transaction: 8/8, including false condition, ambiguous condition, repairable input,
  rollback, insufficient gauge, choice, exact consume, and restore/reapply; artifact
  `.test-results/2026-08-31T01-55-41-567Z-15-3e94aa`.
- Focused family inventory/parity: 21/21; artifact
  `.test-results/2026-08-31T01-47-08-947Z-41-55435f`.
- Unit before structural review: 57 files / 318 tests; artifact
  `.test-results/2026-08-31T01-47-23-287Z-15-f34479`.
- Production before structural review: 25 files / 119 tests passed in 78.59s and 77.58s; artifacts
  `.test-results/2026-08-31T01-58-11-086Z-15-8d1759` and
  `.test-results/2026-08-31T01-59-36-330Z-15-bafde0`. A third 79.44s measurement had two
  independently passing tests exceed Vitest's existing 5s limit only under full-suite contention.
  The three-run median is 78.59s versus the 79.73s pre-change median; no timeout was relaxed.
- Post-review focused transaction: 12/12; public calculator/recovery/ranking fixture: 20/20 in the
  scenario facade; planner identity: 2/2; operation activation handoff: 11/11.
- Unit after structural review: 58 files / 327 tests; artifact
  `.test-results/2026-08-31T02-54-18-782Z-15-5c0b3f`.
- Post-review production: 25 files / 119 tests. The final three canonical 85%-worker runs completed
  in 81.81s, 82.42s, and 82.11s (median 82.11s, +2.98% from the 79.73s baseline median), with the
  unchanged 5s per-test timeout. The production worker share is capped to remove full-host
  contention; suite membership and assertions are unchanged. The final artifacts include
  `.test-results/2026-08-31T03-19-18-333Z-15-6704cc`,
  `.test-results/2026-08-31T03-21-34-223Z-816-87e724`, and
  `.test-results/2026-08-31T03-28-05-706Z-816-a57cb7`.
- Production comparison: all 855 calculator/ranking records retain the same outcome, used input,
  applied effects, and execution issues. Inventory remains calculator 422, ranking 433, preparation
  plans 3,446, and failures 0. Read/parse/compile `1 / 1 / 1`, candidates `6,376 / 3,957`, and damage
  cache `3,629 / 1,623` are unchanged. The digest change to
  `beb6f9f13b74acd52d0c384095a1fe82b8194a8d2cb500781e55b959d98cfe4b` records preparation stochastic
  identity and preparation-input trace rather than an additional damage delta.
- Final `pnpm quality` passed format, lint, typecheck, runner 16/16, docs 5/5, unit 58 files / 327
  tests, production 25 files / 119 tests, master validation, build, and E2E 64 passed / 32 skipped.
  The three calculator snapshots changed only for the intentional engine `28.0.0` -> `29.0.0`
  footer and passed the targeted and full E2E runs.
- Blocking: 0. `RK-POLICY-001` remains `Deferred: TSK-06`; it does not leave a TSK-05 execution
  writer open.

## Fourth structural review delta: multi-project test execution

The production-only 75% worker cap and Vitest's default `sequence.groupOrder: 0` formed an invalid
multi-project configuration: unit and production had different worker limits inside one concurrent
group. This is a TSK-05 integration regression introduced with the final contention cap. It prevented
the canonical all-suite runner from reaching collection, so diagnostic and agent paths reported zero
tests even though the individually selected projects used by `quality` passed.

The execution-family closure for this delta is bounded to the Vitest project scheduler and compact
runner: unit-only and production-only selection remain valid; all-suite execution must select both
projects without a configuration rejection; production retains the unchanged 5s test timeout and 75%
worker cap. Unit and production now use distinct group orders, and the runner contract guards the
relationship between the unequal cap and those groups.

| Path | Classification |
| --- | --- |
| `test:unit` / `test:production` explicit project selection | Verified: existing canonical quality paths remain project-local |
| focused diagnostic selecting only unit files | Verified: 1 file / 18 tests on the failing baseline, artifact `.test-results/2026-08-31T05-47-58-915Z-15-48d532` |
| focused diagnostic selecting unit and production files | Verified: 3 files / 55 tests, artifact `.test-results/2026-08-31T05-50-13-805Z-15-5af010` |
| `test:agent` all-project compact runner | Verified: 83 files / 458 tests, artifact `.test-results/2026-08-31T05-50-23-531Z-15-e8b33a` |
| `pnpm test` | Verified by command identity with `test:agent`; both dispatch the same all-suite compact runner |
| production contention cap and 5s timeout | Verified by configuration: 75% cap retained; timeout unchanged |

Confirmed mechanism: Vitest rejected the current HEAD with `Projects "production" and "unit" have
different 'maxWorkers' but same 'sequence.groupOrder'`; artifact
`.test-results/2026-08-31T05-48-08-684Z-15-5d0bf2`. Implementation mismatch: the cap was treated as a
production-local performance setting although Vitest validates worker limits at the concurrent
project-group boundary. Missed detection: the post-cap gate selected projects separately and the
earlier focused artifact preceded the cap. Recurrence scope is any project-local worker limit added
to an all-project runner; the minimum guardrail is distinct group-order configuration plus an actual
all-project compact run.

- Resolution: unit uses group 0 and production uses group 1. The production-only 75% cap and existing
  5s timeout remain unchanged. The final focused diagnostic crossed both project groups and executed
  55 tests; `test:agent` crossed the complete partition and executed 458 tests. The static runner
  contract now detects removal of either distinct group while the cap is present.
- Blocking: 0. TSK-05 returns to `done`; TSK-06 returns to `ready` after the final quality gate.

## Second structural review delta and resolution

The preceding completion claim was withdrawn while four concrete crossings were open. Each now has
an application-level counterexample:

| State x path | Concrete mechanism | Status |
| --- | --- | --- |
| non-attack form -> input-dependent transition -> attack NP | `ScenarioPreparationOutcome` rejects without a `DamageResolutionInput`; repair replays persisted commands and reaches the attack form in calculator and ranking executors | Verified focused schema-legal fixture |
| preparation stochastic + ordinary stochastic effects in one skill | only the resource effect receives `success`; the ordinary effect retains `null` and its ordinary resolver produces the fixture's default failure | Verified reducer plus public calculator fixture |
| preparation input below/above/step-invalid | minimum/maximum/step validation returns required input against the action-start state; valid input alone commits form/variant | Verified reducer and public calculator matrix |
| insufficient/unsupported/ambiguous/invalid -> public calculator result | each code survives as `preparation:<code>` in an `unsupported` result and no longer throws | Verified public calculator matrix |

The earlier resource-only recovery fixture remains Verified. The compiler fixture with a manually
injected outcome and reducer-local invalid fixture remain supporting-only; closure comes from the new
cross-path fixtures. Support/CE/mystic-code sources are `N/A`: they cannot write attacker preparation
resource/form/variant state and retain `null` stochastic ownership. Normal damage-only input
rematerialization is `N/A`: its keys are absent from `preparationInputKeys`; the resource and structural
counterexamples prove the opposite branch performs a full replay.

Second-review verification: focused unit paths 54/54, probabilistic production golden 8/8, unit 58
files / 338 tests, and production 25 files / 119 tests. The three 92%-worker production runs completed
in 81.95s, 75.04s, and 75.34s (median 75.34s versus the 79.73s baseline); the per-test 5s timeout and
suite membership are unchanged. Inventory and runtime counters remain calculator 422, ranking 433,
preparation plans 3,446, failures 0, read/parse/compile `1 / 1 / 1`, candidates `6,376 / 3,957`, and
damage cache `3,629 / 1,623`. Comparing the prior and current 4,735 production records finds zero
differences in the 855 calculator/ranking outcomes, used inputs, applied effects, or issues. The digest
change to `80a63a7be083c68dc80c844aa99a891d5fa4cfe2491e0c69cb0358d71d990f25` records `null` for ordinary
stochastic effects that preparation did not resolve.

`Blocking: 0`. The final `pnpm quality` passed all canonical phases; TSK-05 is complete and TSK-06 is
ready. `RK-POLICY-001` remains `Deferred: TSK-06` and does not leave an execution writer open.

## Third structural review delta

The second completion claim is historical and was withdrawn after review found two transaction
crossings. The current delta extends the same canonical family rather than adding local fallbacks.

| Producer / consumer | Reviewed crossing | Current classification |
| --- | --- | --- |
| `resolveScenarioPreparationOutcome` | rejected preparation previously selected an unrelated attack NP for presentation and threw for servants with no attack variant | Verified: rejected outcome has no NP or damage input |
| `ResolvedCalculationInput` | rejected state previously carried `input` | Verified: discriminated union omits `input` from rejected |
| `PreparedCalculationScenario` | rejected preparation previously carried `scenarioInput` | Verified: discriminated union omits `scenarioInput` from rejected |
| `CalculationExecution` | public rejected execution previously exposed both numeric inputs | Verified: discriminated union exposes neither input |
| calculator UI manual command | manual switch consumed fallback `scenarioInput` | Verified: rejected UI has no direct-input command and exposes only repairable canonical inputs |
| ranking damage cache / matrix | readers previously assumed every prepared candidate had damage input | Verified: cache reads only executable branch; rejected branch remains typed |
| preparation stochastic producer | proc and condition previously overwrote one `boolean` | Verified: `procOutcome` and `conditionOutcome` are stored independently |
| resource/form mutation writers | mutation needs the composed applicability result | Verified: composition occurs only when selecting `preparationEffects` |
| ordinary operation executor | condition-false effect previously arrived as pre-resolved proc failure | Verified: proc remains `success`; ordinary projection reports `conditionNotMet` |

Third-review counterexamples are schema-legal and cover both missing production state and the missed
intersection:

| Proc state | Condition state | Preparation mutation | Ordinary outcome | Classification |
| --- | --- | --- | --- | --- |
| guaranteed success | true | applies | normal execution | Verified existing acceptance |
| guaranteed success | false | does not apply | `conditionNotMet`, not `disabled` | Verified focused reducer + application fixture |
| stochastic success | false | does not apply | condition remains independent of proc | Verified by the same separated activation contract; production-negative intersection |
| stochastic failure | any | does not apply | proc failure remains `disabled` | Verified existing stochastic fixture |
| no attack NP variant | attack command rejected | no damage input is created | typed unsupported result | Verified focused application fixture; production has 47 such servants |

Recovery remains a full replay from persisted commands. Damage-only rematerialization is
`N/A: keys outside preparationInputKeys cannot change proc, condition, resource, form, or variant`.
Support/CE/mystic-code preparation mutation remains `N/A: not in the bounded attacker preparation
command grammar`. `RK-POLICY-001` remains `Deferred: TSK-06`.

Focused verification: 3 files / 55 tests passed; artifact
`.test-results/2026-08-31T04-59-52-640Z-15-2d2a62`. Unit passed 58 files / 339 tests. Production
passed 25 files / 119 tests with calculator 422, ranking 433, preparation plans 3,446, failures 0,
read/parse/compile `1 / 1 / 1`, candidates `6,376 / 3,957`, and damage cache `3,629 / 1,623`;
artifact `.test-results/2026-08-31T05-08-01-771Z-816-3a6509`. The digest changed to
`e9441e4f35eb74af80a79967ee20ea735687a899cc2b6f606ea3db5ae0297e7f`: comparison against the
previous 4,735 records found exactly 32 changed preparation identities and zero calculator/ranking
records. Those 32 replace condition-false `stochasticOutcome: failure` with the independently
resolved proc outcome; damage, used input, applied effects, and issues are unchanged.

At 92% workers the standalone production gate passed in 77.61s, but two quality attempts reproduced
5s timeouts in three and six CPU-bound production tests with no assertion failures. The production
cap is therefore 75% (9 of 12 workers), retaining the 5s timeout and all 119 tests. Final
`pnpm quality` passed format, lint, typecheck,
runner 16/16, docs 5/5, unit 339, production 119, master validation, build, and E2E 64 passed / 32
skipped. `Blocking: 0`; TSK-05 is `done` and TSK-06 is `ready`.
