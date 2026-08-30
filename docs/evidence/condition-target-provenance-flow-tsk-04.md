---
title: "TSK-04 condition, target, and provenance flow closure"
status: "Verified"
updated_at: "2026-08-31"
---

# TSK-04 condition, target, and provenance flow closure

## Outcome and ownership

User-visible calculator and ranking damage, operation outcomes, required inputs, and UI commands stay
unchanged. This family owns condition requirements, trait provenance, operation target and recipient,
and contribution scope. The data pipeline is the only raw-vocabulary interpreter; application owns
scenario commands and ranking policy; execution evaluates canonical requirements and applies canonical
routes transactionally.

The cutover replaces the parallel master fields `conditions`, `traitReadPolicy`,
`conditionTargetPolicy`, `quantityConditions`, `sourceQuantityConditions`, and
`inputQuantityConditions` with one canonical requirement tree. It also replaces the parallel operation
fields `targetPolicy`, `expectedRecipient`, `targetMismatch`, and `contributionScope` with an exhaustive
canonical route union. Runtime source qualification may bind canonical source-local keys and actor
roles, but must not reinterpret Atlas target, buff, condition, or provenance vocabulary.

## Canonical state and outcome classes

Canonical producer state:

- `CanonicalEffectRequirement`: an exhaustive boolean requirement tree with typed trait provenance,
  actor role, target predicate, quantity, canonical input, player choice, and operation-trigger leaves.
- `CanonicalEffectRoute`: an exhaustive union containing the eligible recipient, contribution scope,
  and mismatch behavior as one valid state. Recipient-less and unsupported routes are explicit union
  members rather than nullable combinations.
- `ConditionExpression`: execution-bound requirement after source-local key and holder/opponent role
  binding. It contains no Atlas vocabulary and is evaluated only against executable battle state.
- `EffectContributionScope`: the execution/application projection of the canonical route. Ranking may
  select contribution policy from it but cannot infer recipient eligibility from it.

Externally meaningful outcomes remain distinct:

| Outcome | Canonical result |
| --- | --- |
| condition satisfied | operation may apply after inclusion and stochastic checks |
| condition unsatisfied | `conditionUnsatisfied`; no contribution |
| inclusion disabled | `disabled`; condition is not rewritten |
| no recipient or target | explicit non-applicable route; operation does not apply |
| ambiguous or contradictory target | typed invalid target/constraint issue; no numeric fallback |
| partially applicable contribution scope | schema-invalid route or typed unsupported; never a partial operation |
| insufficient provenance | unresolved condition requiring an effect-local decision or typed input |
| repairable user input | `inputRequired` with the canonical command/input definition |
| unsupported execution | typed `unsupported`; no plausible numeric result |

## Producer, reader, writer, and flow inventory

| Path | Responsibility and direct nodes | Status |
| --- | --- | --- |
| raw producer | `data-pipeline/effectNormalization.ts` reads Atlas condition/provenance parameters; `executionSemantics.ts` reads raw function target/team and buff type | Verified |
| canonical artifact writer | data pipeline emits `MasterEffect` requirement and per-operation route; `master-data` schema rejects missing, contradictory, ambiguous, or partial unions | Verified |
| artifact import | `apps/web/adapters/repository.ts` parses manifest and snapshot before use; cache restore is parsed by the same schemas | Verified |
| application command writers | `scenarioCommands.ts`, `canonicalInputs.ts`, `activationContext.ts`, `targetContext.ts`, ranking world/field materializers create typed scenario facts and commands | Verified |
| share/profile restore | schema parses calculation share/profile draft; application re-prepares canonical operations from the active master instead of persisting runtime operations | Verified |
| execution compiler | `sourceCollection.ts` supplies source identity; `operationCompiler.ts` binds canonical holder/opponent/source-local identities without raw interpretation | Verified after cutover fixture |
| forward execution | prepare scenario -> compile plan -> candidate prepare/execute/rollback -> condition evaluation/recipient application -> NP damage -> application result | Verified |
| recovery | execution issue/required input -> `scenario.ts` typed result -> effect/input view model -> application command -> complete re-prepare/re-execute | Verified |
| calculator path | Calculator dispatches application commands; `calculateScenario` consumes the shared prepared/execution result | Verified |
| ranking alternate path | ranking policy materializes typed target/field facts and contribution projection; shared prepare/execution path produces rows/details | Verified |
| ranking counterfactual writer | `rankingScenarioWorlds.ts` excludes canonical operation IDs/state contributions, then reuses prepared canonical execution | Verified |
| UI interpretation | UI presents canonical projection and dispatches commands; it does not read raw target/buff keys | Verified |
| direct raw runtime reader | raw evidence remains audit-only in `MasterEffect.atlasEvidence`; no application/execution/UI semantic reader | Verified after architecture ratchet |

The cutover is breaking: the master schema and execution compiler accept only the canonical
requirement and route contracts. No compatibility reader, fallback, or dual runtime IR is retained.
Raw target and buff vocabulary remains only in the pipeline producer and audit evidence.

## Forward and recovery flow

```text
Atlas function / buff / parameter
  -> data pipeline canonical requirement + canonical route
  -> master schema validation
  -> application scenario command and typed facts
  -> execution source binding and ordered operation compilation
  -> inclusion -> stochastic outcome -> condition -> route eligibility -> transactional apply
  -> shared calculator/ranking damage execution
  -> application result and UI projection

invalid / ambiguous / incomplete artifact or scenario
  -> schema rejection or typed execution issue
  -> inputRequired / unsupported / invalid presentation
  -> application command repairs canonical scenario
  -> full re-prepare and re-execute (no partial state retained)
```

## State x path counterexample matrix

| State | Pipeline/schema | Calculator | Ranking | Restore/reapply | Status |
| --- | --- | --- | --- | --- | --- |
| satisfied requirement | canonical tree emitted | operation applies | same operation applies | deterministic after parse | Verified |
| unsatisfied requirement | canonical negative/constraint retained | `conditionUnsatisfied` | same outcome unless policy materializes a fact | deterministic after parse | Verified |
| disabled inclusion | independent inclusion state | `disabled` | projection exclusion, no condition rewrite | retained command state | Verified |
| provenance-default trait | explicit default provenance leaf | executable state evaluation | same evaluator | deterministic | Verified |
| provenance-sensitive trait | explicit exceptional provenance leaf | unresolved without local decision | same evaluator; policy cannot invent provenance | decision can repair | Verified |
| recipient absent for source/route | explicit non-applicable/unsupported route | no mutation | no contribution | deterministic | Verified after focused fixture |
| ambiguous/contradictory target | pipeline/schema rejects or typed target conflict | no numeric result | no candidate fallback | forged restore rejected | Verified |
| partial route fields | union cannot represent partial state | N/A: schema cannot construct executable operation | N/A: schema cannot construct executable operation | parse rejects | Verified after schema fixture |
| party-wide contribution | route recipient includes attacker and scope is `partyWide` | applies when condition holds | included in main; excluded only in canonical area counterfactual | deterministic | Verified |
| party-other contribution | route excludes source self | no self application | excluded from self ranking | deterministic | Verified |
| enemy-applied contribution | route recipient is target | target modifier applies | included through same execution | deterministic | Verified |
| repairable quantity/input | canonical input leaf | `inputRequired` | canonical default/policy or typed failure | command then full re-execution | Verified |
| unsupported route/execution | explicit union member | typed `unsupported` | typed ranking failure | deterministic | Verified after focused fixture |
| operation fails after earlier member in transaction | canonical issue aborts group/candidate | rollback leaves no partial mutation | same transaction path | retry starts from prepared state | Verified |
| schema-legal state absent from production | focused canonical fixture | fail-closed expected outcome | shared-path parity fixture | round-trip fixture | Verified after focused fixture |

## Closure classification

- Verified: raw producer boundary, artifact import/cache restore, application/UI writers, forward and
  recovery flows, calculator/ranking shared path, target conflict handling, contribution projection,
  and transactional rollback have direct code and existing test coverage.
- Verified after cutover fixture: compiler binding without raw interpretation, route union partial-state
  rejection, absent recipient, unsupported route, architecture ratchet, and production-negative legal
  states are implementation acceptance checks defined above.
- N/A: no independent ranking damage semantics; ranking policy only supplies typed worlds and operation
  projections. No persisted runtime operation restore exists; scenarios are recompiled from master.
- Deferred: NP capacity/resource transitions belong to the next TSK-04 family note. General preparation
  transaction expansion remains TSK-05, without allowing this family to leave partial application.
- Blocking: 0.

## Verification result

- Published master after the complete TSK-04 cutover: schema 42, version `20260831.10`.
- Production canonical contribution inventory: personal 2,663; party-wide 928; party-other 51;
  enemy-applied 1,798. Terminal inventory remains 2,593 / 920 / 46 / 367 respectively.
- Focused and production diagnostic: 5 files, 47 tests passed; artifact
  `.test-results/2026-08-30T17-41-27-648Z-15-426e53`.
- The preceding shared-path diagnostic passed 9 files and 95 tests, including calculator support,
  craft essence, mystic code, target-state mutation, rollback, and canonical input inventory; artifact
  `.test-results/2026-08-30T17-36-46-685Z-15-897ff0`.
- Architecture ratchet rejects legacy condition/target fields and Atlas target/buff vocabulary in the
  scoped execution/application consumers.
- Full production gate passes 25 files and 119 tests. A canonical subject-binding counterexample
  caught during the full gate now verifies that the current attacker's quantity subject is removed
  before execution-state evaluation; calculator/ranking damage remains equal to HEAD.

Inventory and implementation are complete with `Blocking: 0`. Any newly found producer, consumer,
writer, or structural review finding reopens this note before another local exception is added.
