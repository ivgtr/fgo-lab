---
title: "TSK-06 ranking policy and finite candidate flow closure"
status: "Active"
updated_at: "2026-09-04"
---

# TSK-06 ranking policy and finite candidate flow closure

## TSK-06.41 runtime cutover — authoritative current delta

This section supersedes the TSK-06.4 implementation deferrals below. Implementation started from clean HEAD
`b07ca1ddb4fae01d67e38321e7a7c496b9592a64`. Damage, profile selection, row count, badge, detail, and portable
replay now consume one canonical ordered application result and its effective contribution set. Action
admission remains separate from contribution inclusion; an admitted action commits its branch, cost, and
mutations atomically even when policy excludes one damage contribution.

| Direct producer／reader／writer／recovery | Classification |
| --- | --- |
| Atlas vocabulary → source-specific canonical schemas | Verified: pipeline-only interpretation; active／passive／NP／CE／mystic bounds reject schema-legal overflow fixtures |
| canonical effects → ordered operations／retained evidence | Verified: one battle-execution compiler; resource／state／bounded／unsupported outcomes are typed |
| ordered action → branch, cost, mutation, contribution | Verified: one transactional executor; failure rolls back the action, policy exclusion does not roll mutations back |
| AttackProfile and complete path → candidate-local admission | Verified: structural role uses terminal profile and the full ordered path |
| finite domain → materialization → final-damage comparison | Verified: certificate precedes allocation, count matches materialization, independent oracle passes; maximum 2,880／4,096 |
| calculator／ranking／without-area／portable replay | Verified: same application preparation and executor; without-area is reapplied only to the selected result |
| effective contributions → damage／selection／row／badge／detail | Verified: self, condition, and area decisions remain independent; presentation groups exclude NP base |
| invalid／unsupported／inputRequired／unavailable recovery | Verified: five profile outcomes remain distinct; only typed insufficient-NP unavailability is non-blocking |
| UI writer and ranking → calculator handoff | Verified: current discriminated intent is written directly; detail renders canonical decisions |
| final four-policy × NP1–5 maximum／digest | Deferred: TSK-06.5; no new runtime semantics may be added there |

Runtime Blocking count: **0**. Cache lifetime／stale-response UI is `Deferred: TSK-07`; a general battle
simulator is `N/A: outside the bounded preparation product`.

Schema-legal fixtures cover slot 4, source effect／choice overflow, multiple choice groups, nested conditions,
exclusive branches with cost, mutation-retained／contribution-excluded actions, missing inputs, stochastic
failure, unsupported operations, unreachable profiles, and invalid／mixed portable snapshots. Calculator,
ranking, without-area, migration, reset, and replay use the same canonical application boundary.

The current master has 13,875 effects and 14,623 typed operations. TSK-06.4 counted 9,123 affected effect
occurrences and 9,124 legacy operations because one referenced wrapper expanded twice; the cutover preserves
that explained delta while removing the legacy variant. Preparation inventory is 6,360 generated, 3,949
deduplicated, and 3,438 terminal plans. Default ranking emits 576 certified candidates, makes 575 damage
requests, and has 556 distinct inputs. There are 433 static AttackProfiles and 432 numeric rows: `2501400` NP1
is typed `unavailableUnderPolicy: insufficientNpGauge`, not a numeric fallback or sibling substitution.

Production digests are application `8f52a96e2e49e5917e61dc49253a102127a6a3fda21029d1c0f17933bf985b57`
and pipeline `916403ecd681dc6b2c4655bd3c052bd8527db3eeac0d54dd1b1a2d18641c02e8`. The pre-cutover
production run was 38.47 s real. Post-cutover canonical-runner measurements were 38.01／40.24／38.74 s,
median 38.74 s: +0.27 s／+0.70%, within the 10% ratchet. Each run executed 24 files／113 tests; the first
completed its tests before reporting the then-stale runtime-counter contract, and the latter two passed the
updated contract. Final quality passed unit 380, production 113, and Playwright 25 with no skip, retry, warning,
or unexpected console; artifact `.test-results/2026-09-02T06-07-59-655Z-44-fc4f13`.

Removal audit finds zero production legacy operation variants, operation-ID contribution projections,
independent 512-state caps, current old portable-intent writers, compatibility flags, adapters, or parallel
compilers. The schema-33 parser remains only as the exact approved migration boundary.

### Completion verification correction — legacy overcharge bypass

Confirmed mechanism: the first completion retained `CalculationPreparationOptions.preserveScenarioOvercharge`
and a runtime branch that could bypass the ordered NP resource transaction's derived base overcharge. No current
producer passed the option, so production inventory and damage digests were unchanged, but the public
schema-legal preparation path still represented the pre-policy compatibility model.

Implementation mismatch: the runtime and removal audit had converged all current callers without deleting the
obsolete override itself. Missed detection: the original legacy scan covered old operation／portable names but
not preparation-option fields, and parity fixtures exercised only the canonical default branch. Recurrence scope
is bounded to scenario preparation options that can override terminal resource or OC state. The minimum guardrail
is deletion of the option and branch, a focused NP2 fixture proving that 200% initial gauge produces executor-
derived base OC2, and a source scan for the removed symbol. After the correction this path is `Verified` and the
TSK-06.41 runtime Blocking count remains 0.

## TSK-06.4 independent design audit — authoritative current delta

This section supersedes both the pre-audit contribution-graph proposal below and the first planning-diff nested
action proposal. The rejected graph is retained only as review history; `transaction.consequences`,
`steps[].mutations`, `eligibility`, its type names, the B1〜B4 split, and its implementation boundary are not
implementation instructions.

### Fixed outcome and independently derived invariants

The user-visible result is one standard or theoretical-maximum NP damage value for one `AttackProfile`,
derived from one legal ordered preparation program. The following invariants follow from that outcome rather
than from the current proposal:

1. The two UI controls identify a ranking policy, but they are not two independent domain-state projections.
   Action admission depends on the pair, the selected action option, and the candidate-local path.
2. A skill use or NP use is the execution transaction boundary. Resource cost, selected branch, and every
   successfully applicable sibling mutation are staged and committed together. Condition-false or proc-failed
   siblings are normal non-applications, not transaction failures. Invalid, unsupported, or resource failure
   commits no part of that action. Policy exclusion of one damage contribution is not a rollback.
3. A branch is an exclusive action option. An ordered step evaluates activation, and its operation is a mutation,
   damage contribution, bounded-phase-irrelevant proof, or unsupported result. None is a second action boundary.
   Passive and intrinsic sources use an automatic source-program variant; they are not fake actions.
4. Structural necessity is an `AttackProfile × initial state × complete ordered path` role. It is never a
   static property of a skill or effect and is not inferred from a prefix without checking downstream reachability.
5. An action that establishes a condition remains executed when a downstream conditional damage contribution
   is excluded. The mutation and contribution therefore need separate canonical children under one action
   transaction.
6. Candidate construction enumerates legal action options and compatible world facts first. The executor
   evaluates every contribution in that one scenario, and selection compares final average damage after cost
   and downstream state. Effect-local maxima are never composed afterward.
7. Only candidates admitted into the canonical domain participate in profile dominance. Within that domain,
   `inputRequired`、`invalid`、or `unsupported` blocks a numeric maximum unless a planner-owned typed proof has
   already shown that exact candidate unavailable or duplicate.
8. Damage, ranking selection, row count, badge, detail, and portable replay consume one canonical application
   result. Presentation never re-evaluates requirements or contribution eligibility.
9. Portable identity stores the execution intent that changes the result; it does not infer it from scenario
   facts. Normal calculator intent and ranking policy are different union variants, not a third value on the
   ranking condition axis.
10. The preparation domain is explicitly bounded by the product. Active slots, action-option choice groups,
    ordered programs, and world dimensions have schema bounds whose complete product or sound dominance pruning
    is proven before execution. A cap is only a guardrail; it is not a completeness proof.

### Confirmed facts

| Fact | Evidence | Baseline classification |
| --- | --- | --- |
| `conditionalContribution` is compiled but not passed to contribution projection | `rankingComparisonPolicy.ts` emits it; `rankingCandidateSpace.ts` calls `compileDamageContributionProjection` with only `selfSkill` and `area` | HEAD defect, not introduced by the planning diff |
| Projection is operation-ID based | `DamageContributionProjection` contains included／excluded operation IDs and state-trait exceptions | HEAD fact |
| NP base and conditional special output share one `executeNpDamage` operation | `npDamageCompilation.ts` emits one operation; `npDamageOperation.ts` returns base and special multiplier arrays together | HEAD fact; operation exclusion cannot express the product outcome |
| Ranking profile result has three classes | `rankingContracts.ts` has calculated／unavailable／invalid; `rankingPolicyCalculation.ts` maps `inputRequired` to invalid | HEAD fact |
| Planner enumerates every ordered skill program before policy admission | `rankingStaticPreparation.ts` adds every available slot／choice command | HEAD fact |
| Planner recognizes only slots 1〜3 while schema permits 0〜20 | `skillCommands` uses `1 | 2 | 3`; `masterSkillSchema.slot` accepts 0〜20 | HEAD schema-legal completeness defect |
| Production currently has only slots 1〜3 | shared master inventory: slot 1 = 475, slot 2 = 475, slot 3 = 477, other = 0 | production-positive bound; not schema closure |
| Active skills, passives, and mystic-code skills share `MasterSkill` | `masterSkillSchema` owns the 0〜20 slot and is reused by all three populations | HEAD type-boundary fact; globally narrowing `MasterSkill.slot` is not a valid A2 fix |
| Choice count is not schema-bounded and planner models one selected group/candidate | `MasterSkill.effects` has no maximum; `skillCommands` emits one `choice` object and `selectedEffects` filters to that one pair | HEAD schema-legal completeness defect |
| Production player choice is smaller than the legal schema | maximum one group per servant skill and five candidates in the current master | production fact; not schema closure |
| Canonical action-safety information is incomplete | `nonDamage` has no typed consequence payload; 1,244／1,427 production skills contain at least one such operation | HEAD fact |
| Production contains represented tradeoffs | 7 skills have NP requirements; 38 skills have a fixed NP-loss effect; 14 skills have an unsupported NP-transition family | production fact |
| Current finite product is bounded only after program generation | cap 4,096 per profile; largest current satisfied product 2,880; baseline semantic product 7,255 and damage requests 6,913 | existing test inventory, not evidence for the proposed new dimensions |
| Portable ranking identity has one contribution field | schema 33 stores `standard | excludeVoluntarySkillModifiers`; portable execution recompiles only self／area projection | HEAD fact |
| Current reset preserves the resolved ranking scenario | `resetPortableCalculationRequest` calls the calculator constructor with the existing scenario | HEAD fact |
| Row, badge, and detail re-read effect projection | `rankingRows.ts` counts projection keys and tests `isSpecialAttack`; `RankingEffectDetails.tsx` rebuilds stacks from effects plus projection | HEAD fact; presentation is not yet derived from one canonical application result |
| Accepted ADRs at HEAD conflict with the current approved requirement | ADR-019 retains old NP-series/policy planning; ADR-027 resets the same scenario and has one ranking contribution intent | HEAD documentation-authority conflict; current documentation diff resolves it through accepted ADR-028 |

The `nonDamage` inventory includes action consequences that are visibly different for admission: production
contains `lossHpSafe` 22、`lossHpPerSafe` 1、`lossNp` 38、`lossStar` 5、and `subBattlePoint` 1 occurrences,
as well as gains and bounded-phase-irrelevant effects. Their raw function name may be used only by the pipeline
to produce typed canonical operations; application runtime cannot branch on those names.

The full master has 9,124 `nonDamage` operations from 9,123 effect occurrences. The design-time raw-family
classifier closes every occurrence as resource 1,164、state／field 5,213、typed unsupported 21、or
bounded-phase-irrelevant 2,725. One `addStateShort` occurrence currently emits two `nonDamage` operations.
There are zero unclassified raw families; implementation and the production ratchet are Deferred TSK-06.41.

| Design disposition | Raw producer families in current production |
| --- | --- |
| resource mutation | `gainNp`、`lossNp`、`gainStar`、`lossStar`、`gainHp`、`gainHpPer`、`lossHpSafe`、`lossHp`、`lossHpPerSafe`、`subBattlePoint` |
| state／field mutation | `addStateShort`、`addState`、`subState`、`moveState`、`extendBuffturn`、`shortenBuffcount`、`addStateShortToField`、`addStateToField` |
| typed unsupported | `gainNpBuffIndividualSum`、`gainHpFromTargets`、`gainNpFromTargets`、`gainNpIndividualSum`、`gainNpTargetSum`、`gainMultiplyNp`、`replaceMember`、`moveToLastSubmember` |
| bounded-phase-irrelevant | `hastenNpturn`、`none`、`friendPointUpDuplicate`、`userEquipExpUp`、`eventDropUp`、`expUp`、`delayNpturn`、`instantDeath`、`servantFriendshipUp`、`shortenSkill`、`eventDropRateUp`、`qpDropUp`、`enemyEncountCopyRateUp`、`forceInstantDeath`、`qpUp`、`displayBuffstring`、`cardReset`、`classDropUp`、`enemyEncountRateUp`、`eventPointUp`、`absorbNpturn`、`extendUserEquipSkill`、`fixCommandcard`、`friendPointUp` |

These names are audit evidence only. The pipeline maps them to typed payloads and proof codes; no downstream
runtime switch may consume this table or a raw family name.

The source inventory and chosen schema bounds are:

| Source | Production count／maximum | Approved schema |
| --- | --- | --- |
| active servant skill | 1,427; effects 23; player-choice groups 1; candidates 5; slots 1〜3 | effects ≤24、groups ≤1、candidates ≤5、slot `1 | 2 | 3` |
| passive | 1,253; effects 14; groups 0; current slot sentinel 0 | effects ≤16、groups 0、slot field absent |
| NP | 727; effects 17; groups 1; candidates 3 | effects ≤20、groups ≤1、candidates ≤3、slot field absent |
| craft essence | 2,700; effects 14; groups 0 | effects ≤16、groups 0、slot field absent |
| mystic-code skill | 84; effects 3; groups 0; slots 1〜3 | effects ≤4、groups ≤1、candidates ≤5、slot `1 | 2 | 3` |

The aggregate bound is not inferred from these local maxima. A valid `PreparedRankingContext` carries a complete
`AttackProfile × policy × NP level` domain certificate with an upper bound of at most 4,096. The current maximum
is 2,880, so the design does not relax a cap or timeout. A certificate overflow returns typed `unsupported`
before any partial maximum can be published.

### Inferences

- A global dependency graph would duplicate the already canonical ordered program, `ConditionExpression`,
  effect transaction grouping, and input definition key. Separate node／edge／read-point identities create a
  second representation that must remain synchronized. This is a two-owner risk, not required expressiveness.
- `safeDeterministic | conditionalTradeoff` is not a complete static skill classification. Safety belongs to a
  selected action option's complete consequences; effectiveness and structural necessity are candidate-local.
  A skill with unconditional and conditional siblings is the direct counterexample.
- Compiling contribution projection before action admission is cyclic: baseline action admission needs to know
  whether an unconditional contribution is effective for the selected `AttackProfile`, while input liveness and
  execution can only be compiled after the admitted action option is known.
- Deferring the action-consequence and slot inventories to TSK-06.5 would permit TSK-06.41 to implement an
  unproved domain model and then call the later mismatch “production closure”. This is an early completion gap.
- The portable schema must cut over with the result-changing runtime semantics. It can, however, use a smaller
  discriminated intent instead of a nominal `normalCalculator | baselineOnly | satisfiedCandidates` axis.
- The planning-diff `transaction.consequences` and `steps[].mutations` are two representations of the same
  resource／HP／state／form／field writes. Admission would read the summary while execution reads the ordered
  mutations, so correspondence becomes a new invariant. This is the same synchronization failure rejected for
  the dependency graph, introduced by the planning diff rather than HEAD runtime.
- The planning-diff `eligibility: intrinsic | unconditional | conditional` cannot replace the concrete
  applicability requirement, value expression, or lazy input read. Keeping both would be a synchronization
  field; keeping only the enum cannot replay NP special or HP-dependent contributions.
- `CanonicalActionOption` cannot be the outer node for passive contributions because passives have no command or
  action transaction. A source-program union is smaller than inventing a no-op action kind.
- The current 4,096 caps detect explosion but do not prove a maximum. Because choice groups and effect counts are
  schema-unbounded and the planner fails to form multi-group selections, finite-domain closure is a design input,
  not a TSK-06.5 performance-only check.
- `selfBuffs=excluded × conditionalEffects=satisfied` does not admit an optional skill that only establishes a
  condition for an attack-NP contribution. This is an application-policy decision, not something inferred from
  contribution origin. `structuralRequired` actions remain a separate AttackProfile/path-dependent case.

### Counterexamples

| State | Current／proposed failure | Required outcome | Status |
| --- | --- | --- | --- |
| schema-legal servant skill in slot 4 | current planner never emits the action | active-servant schema rejects it; passive has no slot field and mystic uses its own 1〜3 schema | Verified design A2; schema fixtures Deferred TSK-06.41 |
| one skill has two independent player-choice groups | current command stores one group/candidate and drops the other group's effects | producer rejects the artifact; supported action option has zero or one complete selected branch | Verified design A3; schema fixture Deferred TSK-06.41 |
| damage skill with an unconditional modifier plus HP／NP loss sibling | static “safe” from the modifier or “tradeoff” from one sibling loses the other fact | action option carries every ordered operation; baseline rejects disadvantage, satisfied may admit the fully represented transaction | Verified design A1; operation fixture Deferred TSK-06.41 |
| action summary says state mutation while ordered step omits it | planning-diff admission accepts an action that execution cannot apply | one ordered operation list is the only consequence owner; no summary/mutation correspondence exists | Verified design correction; fixture deferred to runtime task |
| passive contribution under `CanonicalActionOption` | passive has no legal preparation command or transaction boundary | use an automatic source-program variant with the same ordered steps | Verified design correction; fixture deferred |
| unconditional and conditional damage siblings in one safe action | whole-skill classification either loses the baseline modifier or leaks the conditional modifier | admit the action in baseline; include only the unconditional contribution | Verified design expectation; fixture deferred to runtime task |
| action grants target state used by a later special | contribution exclusion can accidentally remove the mutation or require a graph exception | commit the action／mutation; baseline excludes only the dependent damage contribution | Verified design expectation; fixture deferred |
| one NP operation with base and conditional special multiplier | operation-ID exclusion removes both or neither | base is an intrinsic contribution; special is a separate conditional contribution under the same attack action | Verified design expectation; fixture deferred |
| two exclusive branches with different NP loss | choosing the largest modifier can make the attack unreachable | execute each legal branch transaction and compare final average damage | Verified design expectation; fixture deferred |
| excluded-only contribution reads a missing input | precomputed input collection reports a false repair request | no input read unless the action precondition／retained mutation also consumes it | Verified design expectation; fixture deferred |
| retained mutation and excluded contribution share an input | dropping the contribution can incorrectly drop the mutation read | action step remains live and may return `inputRequired` | Verified design expectation; fixture deferred |
| optional skill only grants target state consumed by attack-NP special under self-excluded/satisfied | contribution-origin policy could incorrectly resurrect an action excluded by self policy | omit the optional action; retain only independently `structuralRequired` actions, then evaluate the attack-NP contribution under condition policy | Verified product decision; fixture Deferred TSK-06.41 |
| calculated candidate plus unsupported admitted branch | known number may not be the maximum | profile is unsupported; bounded diagnostics retain the blocker class | Verified design expectation; fixture deferred |
| identical scenario with baseline and satisfied ranking intents | current portable request collides | distinct request／fingerprint／replay identity | Verified design expectation; runtime deferred |
| ranking scenario reset while target／field／choice facts remain | `normalCalculator` would reactivate ranking assumptions | construct a fresh calculator baseline from explicit subject/build inputs | Verified design expectation; runtime deferred |
| schema permits enough choice/condition dimensions to exceed 4,096 | current code returns `candidateLimitExceeded` after construction | prepared-context certificate returns typed `unsupported` before publication; no partial numeric maximum | Verified design A3; certificate/oracle Deferred TSK-06.41 |

### Alternatives

| Alternative | Correctness | Complexity | Migration | Performance／test cost |
| --- | --- | --- | --- | --- |
| Preserve the proposed global contribution／dependency graph | Expressive if every duplicate identity and edge remains synchronized | Highest: graph nodes, uses, explicit read points, composition IDs, and parallel stage unions duplicate existing ordered IR | Largest schema and compiler cutover | More inventory dimensions and collision fixtures; candidate bound unchanged but compile／test cost rises |
| Keep operation-ID projection and add condition exceptions | Cannot split NP base／special or mixed sibling outputs; repeats the current structural defect | Low initially, unbounded exceptions later | Small but leaves parallel semantics | Cheap tests do not prove completeness; rejected |
| Preserve the planning-diff action transaction + consequence summary + nested effect/contribution | Represents action atomicity but duplicates every state consequence, lacks a passive outer node, and needs conditionality synchronization | Medium-high: summary-to-step correspondence and source exceptions become new invariants | Destructive IR replacement plus synchronization fixtures | Candidate bound remains unproved; test matrix grows across summary × step × contribution |
| **Discriminated action/automatic source program with one ordered step-operation list** | Directly represents action atomicity, passive sources, retained mutation, concrete contribution evaluation, lazy reads, and final-damage branch selection | Smallest closed model: no graph and no consequence summary; order supplies read points | One destructive IR/runtime/portable cutover after design closure | Reuses the reducer; bounded schema and oracle are required before a cap can be retained |

### Recommendation

Adopt the fourth alternative. The canonical model is a discriminated source program with one ordered operation
sequence, not a general dependency graph or an admission summary synchronized to an execution tree:

```ts
type CanonicalSourceProgram =
  | {
      kind: 'action';
      sourceId: CanonicalSourceId;
      actionOptionId: CanonicalActionOptionId;
      command: CanonicalPreparationCommand;
      preconditions: readonly CanonicalRequirement[];
      steps: readonly CanonicalExecutionStep[];
    }
  | {
      kind: 'automatic';
      sourceId: CanonicalSourceId;
      source: CanonicalAutomaticSourceKind;
      steps: readonly CanonicalExecutionStep[];
    };

interface CanonicalExecutionStep {
  stepId: CanonicalStepId;
  activation: CanonicalStepActivation;
  operations: readonly CanonicalStepOperation[];
}

interface CanonicalDamageContribution {
  contributionId: CanonicalContributionId;
  presentationGroupId: CanonicalEffectId | null;
  source: 'voluntarySkill' | 'passive' | 'attackNp';
  evaluation: CanonicalContributionEvaluation;
}
```

`CanonicalAutomaticSourceKind` is the closed non-command source union needed by the shared calculator executor,
including passive, intrinsic, craft-essence, support, and mystic-code sources. Ranking policy admits only the
bounded sources in its product; it does not shrink the common execution IR. `CanonicalStepOperation` is a closed
pipeline-owned union of resource／HP／state／form／field mutation, damage
contribution, `boundedPhaseIrrelevant` with a typed proof, and `unsupported`. Application derives admission from
the selected action option's ordered operations; it does not receive a pipeline-authored verdict or a separate
consequence summary. An unclassified operation is `unsupported`, never `outOfScope`.

Order supplies the read point: an action precondition is read before its transaction, step activation at that
step, and contribution evaluation only when the included contribution is reached. The evaluation owns its
concrete requirement, value expression, and input reads; conditionality is derived from those typed reads and is
not a parallel enum. Canonical input keys may be shared by multiple readers; no dependency node identity is
needed. The executor returns source/step/operation outcomes and one `EffectiveContributionSet`. Damage and
presentation consume that result without re-reading requirements.

Portable resolved intent becomes a discriminated union:

```ts
type ResolvedExecutionIntent =
  | { kind: 'calculator'; initialNpGauge: 10000 }
  | {
      kind: 'ranking';
      initialNpGauge: number;
      policy: { selfBuffs: 'included' | 'excluded'; conditionalEffects: 'baseline' | 'satisfied' };
    };
```

Manual remains a separate portable request variant. Ranking replay compiles admission and contribution policy
from the stored ranking policy; calculator execution includes every satisfied contribution in its explicit
scenario. No condition policy is inferred from world facts.

### Flow inventory and closure

| Path | Classification |
| --- | --- |
| raw source effect → canonical step operation | Verified design A1: closed operation union and all 9,123 raw effect occurrence dispositions recorded; runtime/ratchet Deferred TSK-06.41 |
| bounded active skill-slot domain | Verified design A2: source-specific schemas and 1〜3 active/mystic slots fixed; implementation Deferred TSK-06.41 |
| action option/choice and world domain | Verified design A3: at most one player-choice group plus complete prepared-context domain certificate ≤4,096; implementation/oracle Deferred TSK-06.41 |
| self-excluded/satisfied optional condition-enabler | Verified product decision: optional action is omitted; independently `structuralRequired` action is retained; fixture Deferred TSK-06.41 |
| source-program identity and action transaction | Verified design correction: action and automatic source are separate; action option is the atomic unit; runtime Deferred TSK-06.41 |
| candidate-local structural/effective role | Verified design: derived after AttackProfile and complete ordered path; runtime Deferred TSK-06.41 |
| step activation/operation/contribution evaluation | Verified design correction; no consequence summary or eligibility synchronization field; IR implementation Deferred TSK-06.41 |
| condition truth and nested composition | Verified: battle execution remains the sole evaluator; focused delta Deferred TSK-06.41 |
| policy admission → finite candidate domain | Verified design A3: admission precedes live dimensions and certificate sum; runtime Deferred TSK-06.41, production proof Deferred TSK-06.5 |
| ordered execution／rollback／lazy input recovery | Verified owner; new nested-result paths Deferred TSK-06.41 |
| effective contribution → damage／selection／row／badge／detail | Verified owner and derivation rule; implementation Deferred TSK-06.41 |
| five-class profile aggregation／bounded diagnostics | Verified design; implementation Deferred TSK-06.41 |
| portable request／fingerprint／draft／history／share／backup | Verified discriminated identity design; implementation Deferred TSK-06.41 |
| schema 33 intent-specific recovery | Verified: manual migrate, calculator deterministic current intent, ranking matching pair historical-only, ambiguous reject／snapshot discard; fixtures Deferred TSK-06.41 |
| true calculator reset | Verified design: fresh baseline constructor and atomic replacement; implementation Deferred TSK-06.41 |
| minimal Web handoff | Deferred TSK-06.41 because it is a direct schema writer |
| notice／interaction／cache／responsive／a11y | Deferred TSK-07 |
| accepted ADR authority | Verified: ADR-028 accepted; ADR-019／027 superseded and retained only as history |
| four-policy × NP1〜5 production maximum and performance | Deferred TSK-06.5; schema certificate and small exhaustive oracle strategy are fixed by A3 |

Current closure: `Blocking 0`. TSK-06.4 design is done and TSK-06.41 is ready after documentation validation.
No runtime path is Verified by this design audit; every implementation path remains explicitly Deferred.

### Planning delta

- Delete the global `DependencyNode／DependencyUse／readPoint` proposal and the four-owner B1〜B4 partition.
  The semantic families are now canonical source program, ranking application policy／outcome, and portable
  identity; execution remains their single shared evaluator.
- A1〜A3 are closed in the document-only TSK-06.4: production operation classification, source-specific schema
  bounds, and the complete candidate-domain certificate are implementation inputs, not TSK-06.5 cleanup. The
  optional condition-enabler decision remains closed by requirement 5.5.
- Do not create a separately completed runtime IR-preparation phase: keeping old behavior through a new IR would
  require an adapter or parallel compiler. Pipeline/master IR, all consumers, ranking policy, five-class outcome,
  portable schema, fingerprint, direct writers, and minimal handoff switch destructively in TSK-06.41. Internal
  commits may be ordered, but there is no phase-complete mixed runtime.
- ADR-028 is the accepted source-program／policy／portable decision; ADR-019／027 are superseded in the same
  documentation change.
- TSK-06.5 owns only exhaustive four-policy maximum, production parity, performance, and zero-legacy proof. A
  semantic mismatch found there reopens TSK-06.41; it is not patched in the audit layer.

## Rejected pre-audit proposal — non-normative review history

> TSK-06.4 reopened three semantic families owned by this note: B1 per-contribution ownership, B3 complete
> profile outcome／dominance, and B4 action admission. Portable identity／persistence／recovery remains the
> separate B2 family owned by `portable-calculation-identity-flow-tsk-06-1.md`. B1 and B2 share only the
> compiled typed projection interface; B4 consumes B1 results but never reclassifies them. Runtime paths
> remain `Deferred: TSK-06.41`／`TSK-06.5` until every design Blocking reaches 0.

### Former TSK-06.4 design reopening delta

### User-visible outcome and invariant

`baselineOnly` selects only safe deterministic voluntary actions with an unconditional effective
contribution, plus structural actions required to reach the AttackProfile. It preserves every legal ordered
mutation and evidence of those actions, but excludes damage contribution that depends on a conditional
requirement. A conditional-only voluntary action is not selected as a baseline no-op.

`satisfiedCandidates` extends that baseline with canonically represented conditional tradeoffs such as NP
consumption and with target／field／state／quantity／stochastic candidates. It does not add independent local
maxima: all included contributions must coexist in one legal ordered scenario, and an exclusive branch is
selected by final damage after costs and downstream state are applied.

This is the final product direction, not a compatibility target. `self included` admits only unconditional、
deterministic、disadvantage-free optional skills plus candidate-local structural actions. `condition satisfied`
then extends that same legal plan with compatible special attack、conditional contribution、field、and fully
represented costs such as NP consumption. Old operation-ID projection、parallel policy runtime、and adapters
must be deleted in the semantic cutover rather than retained beside the canonical model.

Damage, selected rank, effective logical effect count, and the special-attack badge derive from one effective
contribution set. Detail keeps the independent self／condition／area policy decisions, execution effects,
state, action, and evidence instead of filtering excluded effects. These outcomes are now governed by ranking
requirements 5〜7、10、11、17 and are the approved product target for TSK-06.4〜06.5.

### Confirmed mechanism and previous review gap

`compileRankingComparisonPolicy` emits `conditionalContribution: baselineOnly | satisfiedCandidates`,
but candidate materialization compiles `DamageContributionProjection` from only `selfSkill` and `area`.
The baseline condition currently limits generated world／input candidates and stochastic inputs; it does
not classify or remove a contribution whose condition becomes true through baseline facts or ordered
self mutation. `executeNpDamage` also contains base NP damage and conditional special multipliers in one
operation, so excluding every `npSpecial` operation would incorrectly remove the NP itself.

The original review proved candidate soundness, maximum completeness, and replay parity, but replayed the
same incomplete projection. It did not trace the conditional policy command through projection, damage
input, selection, row aggregation, detail, and badge, and it had no production assertion that baseline
conditional contamination was zero. The later shared projection refactor centralized source／area
classification but preserved the missing condition axis. This was a recurrence-scope gap in the earlier
review, not evidence that the approved conditional-contribution contract was complete.

Portable identity exposes a cross-family interface defect: current resolved ranking requests persist only
`standard | excludeVoluntarySkillModifiers`, while this family needs a compiled condition projection.
The portable flow note owns request identity, persistence, migration, and recovery; this note owns the typed
projection input consumed by execution. Neither family reclassifies the other's semantics.

Profile outcome aggregation is a third confirmed mechanism. `RankingProfileResult` currently exposes only
`calculated | unavailableUnderPolicy | invalid`; repairable `inputRequired` is converted to `invalid`, and
unsupported or incomplete candidates can collapse into no candidate. A lower calculated candidate must not
hide an unknown candidate that could change the maximum. This outcome closure belongs to TSK-06.4／06.41 because
per-contribution evaluation changes the candidate result population; it is not deferred to TSK-08.

Action admission is a fourth mechanism. The current planner can retain a conditional-only safe action in the
baseline candidate set, while the earlier proposal classified NP consumption as globally adverse. The first
produces policy no-op actions and unstable detail; the second removes a required conditional theoretical
candidate. B4 therefore separates static action semantics, policy admission, candidate-local reachability,
and contribution projection before implementation.

### Layer ownership

```text
data pipeline emits canonical dependency／contribution／action cost IR
battle execution evaluates dependency truth, resolved value, and execution outcome
calculation application compiles ActionAdmissionPlan and independent self／condition／area projection
ranking／portable／production audit call the same application compiler
battle execution consumes only the compiled typed projection
```

No application compiler interprets Atlas/raw vocabulary. Execution does not select a ranking policy, and
ranking／portable do not independently reclassify operation source, scope, requirement, or contribution.

### Canonical contribution and dependency design gate

Before implementation, one bounded contribution graph must replace operation-ID-only policy ownership.
Its population is policy-excludable damage contributions plus an NP base sentinel where one operation must
be split. Policy-invariant base ATK, class affinity, card constants, and equivalent base inputs remain
ordinary damage input and are inventoried as `N/A: policy invariant`; this Task does not create a general
provenance engine. Dependency identity is separate from consumer edges so one dependency can feed multiple
operations／mutations／contributions and one contribution can use multiple dependencies:

```ts
interface CanonicalDamageContribution {
  contributionId: CanonicalContributionId;
  sourceRef: CanonicalContributionSourceRef;
  operationId: string | null;
  presentationGroupId: CanonicalEffectIdentity | null;
  component: 'modifier' | 'modifierRate' | 'ignore' | 'npBase' | 'npSpecial';
  outputAddress: DamageContributionOutputAddress;
  composition: DamageContributionComposition;
  compositionIdentity: CanonicalCompositionIdentity;
  executionOrder: number;
}

interface DependencyNode {
  dependencyId: CanonicalDependencyId;
  expression: ContributionDependencyExpression;
  dependencyOrigin: DependencyOrigin;
}

interface DependencyUse {
  dependencyId: CanonicalDependencyId;
  consumer:
    | { kind: 'operation'; operationId: string }
    | { kind: 'mutation'; mutationId: CanonicalMutationId }
    | { kind: 'contribution'; contributionId: CanonicalContributionId };
  roles: NonEmptyReadonlyArray<
    | 'executionPrecondition'
    | 'retainedMutation'
    | 'contributionApplicability'
    | 'contributionValue'
  >;
  readPoint:
    | { kind: 'beforeOperation'; operationId: string }
    | { kind: 'afterOperation'; operationId: string }
    | { kind: 'beforeAttackNp' };
}

interface CanonicalContributionGraph {
  contributions: readonly CanonicalDamageContribution[];
  dependencies: readonly DependencyNode[];
  uses: readonly DependencyUse[];
}
```

`contributionId` distinguishes components inside one operation, especially NP base from each special
damage component. `dependency` is not an alias for `operation.condition`; its leaf origins cover
activation requirement, value dependency, stochastic dependency, resource dependency, world／state
dependency, and intrinsic／unconditional input. The audit population is every contribution reaching a
damage-input component plus every canonical dependency that changes its applicability or value.

Origin answers where a dependency comes from; an edge role answers why a consumer reads it; `readPoint`
answers which ordered state snapshot supplies its truth. The same expression before and after a mutation is
not merged merely because its syntax matches. One input may resolve multiple dependency nodes, one node may
have multiple role edges, and liveness is the union of every retained consumer.

Canonical IDs are emitted by the pipeline from typed source identity, component identity, and a canonical
source-local ordinal that is part of normalized IR—not the runtime array index, label, or iteration order.
The ID namespace and serialization version are explicit; synthetic NP base、split contribution、choice branch、
and cloned form variant identities have collision fixtures. `contributionId` is unique within one compiled
AttackProfile graph; `presentationGroupId` is a stable many-to-one logical effect identity; composition and
dependency identities have deterministic ordering and collision checks. Master-version changes may change an
ID only when one of its canonical inputs changes.

### Typed stage transitions

IR, policy, liveness, execution, and effective damage are separate discriminated stages rather than optional
fields on one evaluation object:

```text
CanonicalContributionGraph
  -> CompiledContributionProjection
  -> PotentialInputPlan
  -> ContributionExecutionResult
  -> EffectiveContributionSet
  -> DamageResolutionInput + RankingPresentation
```

- `CompiledContributionProjection` records independent `self`、`condition`、`areaView` decisions for every
  contribution. A contribution may be excluded on more than one axis; it has no resolved value or execution
  outcome.
- `PotentialInputPlan` contains only dependency reads reachable from admitted actions and included or retained
  consumers. It is a conservative execution plan, not an exact pre-execution truth result. Excluded-only
  value／applicability edges cannot appear live.
- `ContributionExecutionResult` is a union of applied, not-applicable false, unknown/input-required,
  execution-rejected, unsupported, and invalid outcomes. The ordered evaluator resolves actual reads at each
  `readPoint`, after short-circuit、selected branch、and prior mutation. Only an included, true, successfully
  executed contribution can carry a resolved value into `EffectiveContributionSet`.
- `EffectiveContributionSet` contains applied contribution IDs, resolved values, output addresses, and
  composition identities only. Damage／selection／row／badge consumers cannot inspect raw requirements to
  reclassify inclusion.

This makes unsupported-with-value, excluded-only-but-input-required, failed-but-effective, and
false-but-applied states unrepresentable rather than relying on consumer checks. Projection inclusion is
not itself effective application; execution may still produce a typed non-effective outcome.

### Projection-after-input liveness matrix

| Dependency role reached by an input | Contribution included | Contribution excluded | Required input outcome |
| --- | --- | --- | --- |
| execution precondition | yes／no | operation still executes | live／required |
| retained mutation | yes／no | mutation／state evidence remains | live／required |
| contribution applicability only | yes | evaluate applicability | live／required when no earlier canonical truth resolves it |
| contribution applicability only | no | no retained consumer | dead／must not emit `inputRequired` |
| contribution value only | yes | resolve effective value | live／required |
| contribution value only | no | no retained consumer | dead／must not emit `inputRequired` |
| execution／mutation plus excluded contribution value | mixed | retained consumer remains | live／required |

Potential input reachability is computed after policy projection and action admission but before execution.
Actual `inputRequired` is emitted only by ordered evaluation at the edge's `readPoint`; the planner does not
predict mutation-derived exact truth. Potential planning may suppress only reads whose entire consumer set is
excluded; it never disables an operation precondition or a retained mutation. `any(true, input-dependent)`、
unselected exclusive branches、and false applicability do not request value inputs that execution never reads.

Current-world evaluation and policy classification are separate results. Canonical simplification may
remove a branch only with a static proof; truth created by an ordered mutation does not make the
requirement unconditional.

`unknownTruth` means a supported leaf reads a fact that is not yet known and participates in three-valued
logic. `unsupportedSemantics` means the leaf itself cannot be interpreted and fails the whole expression
closed. `invalidExpression` means malformed canonical IR and remains distinct from engine support. A
well-formed but statically unsatisfiable expression is ordinary `false`. A tuple proven contradictory while
the planner constructs its canonical domain is not emitted and receives an unavailable disposition proof. A
contradictory user／schema state or a contradictory tuple emitted by the planner is `invalid`; the two are not
represented by the same reason.

| Composition | Result |
| --- | --- |
| `all(true, unknownTruth)` | `unknownTruth` |
| `any(true, unknownTruth)` | `true` |
| `not(unknownTruth)` | `unknownTruth` |
| any expression containing `unsupportedSemantics` | `unsupportedSemantics`; a true sibling does not reinterpret the leaf |
| well-formed but unsatisfiable expression | `false`／candidate unavailable |
| contradiction proven during canonical domain construction | not emitted／unavailable proof |
| contradictory user／schema state | invalid |
| malformed canonical expression | `invalidExpression` |
| planner emits a candidate outside its canonical domain | invariant violation／profile invalid |

### Contribution output and composition matrix

| Contribution family | Output address | Composition | Boundary／dependency |
| --- | --- | --- | --- |
| normal modifier | typed modifier bucket＋card qualifier | ordered additive fold after card applicability | activation and value dependencies are separate |
| modifier rate | typed rate bucket linked to its modifier family | maximum rate contribution, then multiply the completed base sum | cannot be projected as an independent additive modifier |
| ignore flag | typed damage-function boolean | boolean OR | execution and policy state remain per contribution |
| NP base sentinel | NP level multiplier slot | canonical base replace／selection | intrinsic and always included; exists only to split a mixed NP operation |
| NP special multiplier | typed NP special slot | canonical multiplier composition | special requirement and effective value are independent from NP base |
| HP／trait-count／Battle Point／rarity-derived NP value | declared NP value／multiplier slot | operation-defined typed composition | value dependency is classified even without `operation.condition` |

Any additional production output address or composition becomes Blocking until added here. A dependency
origin with zero production occurrences receives both a production `0` ratchet and a schema-legal focused
fixture; absence from current master data is not closure by itself.

### Profile outcome and dominance matrix

Candidate execution and profile results map to the same externally meaningful five classes without collapsing
repairability, semantic invalidity, or implementation support. Internally, omitted／deduplicated domain states
remain `CandidateDisposition`; they are not fake executed candidates:

| Candidate outcome | Meaning | Profile aggregation rule |
| --- | --- | --- |
| `calculated` | complete executable candidate with numeric damage | participates in maximum |
| `unavailableUnderPolicy` | candidate is canonically unreachable or disabled by the selected policy | never blocks another complete calculated candidate |
| `inputRequired` | executable semantics need repairable canonical user input | blocks numeric profile result unless the candidate is already unavailable by planner proof |
| `invalid` | contradictory user／schema state、malformed IR、planner invariant violation | blocks numeric profile result; never converted to unavailable |
| `unsupported` | canonical semantics exist but this engine cannot evaluate them completely | blocks numeric profile result unless the candidate is already unavailable by planner proof |

`RankingCandidateSpace` is the only disposition proof owner. It may omit or deduplicate a domain state only with one typed
`CandidateDispositionProof`: `staticallyUnsatisfiableRequirement`,
`contradictionProvenDuringDomainConstruction`, `noEffectiveContributionUnderPolicy`, or
`duplicateCanonicalState` with the retained state identity. A tuple outside the declared finite domain is
not a candidate; if the planner emits it, that is an invariant violation and profile invalid. No numeric
upper-bound heuristic, reachability
inference, or requirement evaluation may be added to the aggregator. An input-required or unsupported
candidate is therefore never ignored as “unable to beat the maximum”; it stays blocking until made
unavailable by one of those canonical planner proofs.

`unknownTruth` becomes `inputRequired` only when supported semantics lacks an explicit canonical user input.
Planner-generated target／field／state／quantity／stochastic witnesses are finite domain choices, not missing user
input. The blocker population is the admitted canonical candidate set; arbitrary tuples outside that domain do
not block the profile.

With at least one calculated candidate, only proven candidate-local unavailable is safely dominated. With no
calculated candidate and only unavailable candidates, the profile is unavailable. Any remaining input-required,
invalid, or unsupported candidate blocks a numeric profile result. When multiple blocking classes coexist,
profile status
uses `invalid > unsupported > inputRequired > unavailableUnderPolicy`; it retains every candidate-local blocker
as bounded typed evidence, so precedence controls presentation／recovery and does not erase diagnostics.
Diagnostics store class-level count, stable digest, and bounded representatives per class rather than every
candidate. `calculated` dominates only unavailable and otherwise yields to the highest blocking class. This
precedence is fixture-backed and never selected by candidate iteration order.

### Presentation matrix

| Surface | Canonical source | Policy-excluded contribution |
| --- | --- | --- |
| row effect count | distinct `presentationGroupId`／canonical logical effect identity among effective contributions | excluded groups are not counted; internal contribution split does not change the count |
| detail | all execution effects and contributions | retained with independent self／condition／areaView decisions |
| special-attack badge | effective special contribution set | absent when no special contribution remains effective |
| action／state／field／resource evidence | ordered execution record | always retained; policy exclusion is not execution failure |
| outcome notice | typed profile outcome plus policy state | distinguishes exclusion, input required, invalid, and unsupported |

Detail retains each policy axis independently; it does not choose a single exclusion reason when self and
condition both exclude the same contribution. `areaView` remains a detail counterfactual rather than a sixth
ranking condition.

`contributionId` is internal damage provenance and is never the user-facing count identity. Multiple output
buckets, modifier／rate pairs, stochastic minimum／success delta, or NP special components from one logical
effect share one `presentationGroupId`. The intrinsic NP base sentinel has `presentationGroupId: null` and is
never counted as an applied effect. This is a product contract, not a consequence of implementation shape.

### Reopened flow inventory

| Path | Current classification |
| --- | --- |
| canonical contribution／dependency IR design | Blocking B1／TSK-06.4: output population, origin, role, and liveness identity require approval |
| ranking condition policy producer | Verified: typed `baselineOnly | satisfiedCandidates` declaration exists |
| typed stage transition design | Blocking B1／TSK-06.4: IR／projection／liveness／execution／effective aggregation unions require approval |
| truth／semantic composition design | Blocking B1／TSK-06.4: three-valued truth, unsupported semantics, and invalid expression require typed approval |
| contribution output／composition design | Blocking B1／TSK-06.4: all output addresses and composition identities require inventory closure |
| presentation grouping design | Blocking B1／TSK-06.4: logical effect identity and NP base exclusion require product approval |
| portable compiled-projection interface | Blocking B1／TSK-06.4: interface with the separate portable family requires mutual approval |
| profile outcome／dominance design | Blocking B3／TSK-06.4: five classes, precedence, bounded diagnostics, and completeness proof require approval |
| action admission／relevance design | Blocking B4／TSK-06.4: structural、safe、conditional tradeoff、no-op proof、candidate reachability require approval |
| canonical producer implementation | Deferred: TSK-06.41 after design Blocking 0 |
| normal modifier／rate／ignore and NP base／special projection | Deferred: TSK-06.41 |
| ordered state／field／resource mutation and rollback | Deferred: TSK-06.41 |
| state-derived downstream contribution and input liveness | Deferred: TSK-06.41 |
| candidate selection／damage cache／profile aggregation | Deferred: TSK-06.41 |
| row／detail／special badge／outcome presentation | Deferred: TSK-06.41 |
| action admission implementation | Deferred: TSK-06.41 atomic semantic cutover |
| exhaustive production final maximum | Deferred: TSK-06.5 after TSK-06.41 |
| direct portable Web writer／minimal handoff parity | Deferred: TSK-06.41 as part of breaking schema cutover |
| TSK-07 notice／recovery interaction／cache and final audit | Deferred: TSK-07／TSK-08 after TSK-06.5 |

### State-by-path matrix

| Canonical state | Operation／mutation | Baseline projection | Satisfied projection | Selection／presentation | Status |
| --- | --- | --- | --- | --- | --- |
| `always`／intrinsic and NP base | apply normally | include | include | same effective set | Verified: requirement v0.9.1 |
| unconditional deterministic player choice | execute one selected exclusive branch | include | include | choose one legal maximum branch | Verified: requirement v0.9.1 |
| target／targetState conditional modifier | preserve grants and condition result | exclude contribution | include only with legal witness | damage／rank／badge follow projection | Verified: requirement v0.9.1 |
| field, including self-generated field | preserve field mutation | exclude dependent contribution | include in one legal field candidate | evidence remains even when contribution excluded | Verified: requirement v0.9.1 |
| HP／quantity／canonical input／resource gate | enforce live input and execution precondition | dead contribution-only input is not required | include legal maximum only | no fallback or precondition bypass | Blocking TSK-06.4: liveness approval |
| stochastic outcome | preserve minimum／failure semantics | exclude success-only damage contribution | include legal maximum outcome | effect reason remains stochastic, not policy-disabled | Verified: requirement v0.9.1 |
| conditional NP special multiplier | execute NP base damage | multiplier 1／conditional part excluded | legal multiplier included | special badge only when included | Verified: requirement v0.9.1 |
| activation input A＋value input B | separate dependency nodes／edges | A remains live for execution; B follows projection | both live when contribution included | no role collapse | Blocking TSK-06.4: graph／liveness approval |
| one input shared by included／excluded contributions | one dependency node, two consumer edges | live through included consumer only | live through both included consumers | no duplicate input or false suppression | Blocking TSK-06.4: graph／liveness approval |
| `all(true, unknownTruth)` | three-valued composition | unknown | unknown until resolved | no guessed witness／number | Blocking TSK-06.4: composition approval |
| `any(true, unknownTruth)` | three-valued composition | true | true | unknown branch does not hide true | Blocking TSK-06.4: composition approval |
| `not(unknownTruth)` | three-valued composition | unknown | unknown | no guessed negation | Blocking TSK-06.4: composition approval |
| `all(always, targetTrait)` | evaluate current truth separately | conditional | include only with legal target witness | preserve dependency explanation | Blocking TSK-06.4: classification approval |
| `any(always, targetTrait)` | statically simplify `always` branch | unconditional | unconditional | no external witness required | Blocking TSK-06.4: classification approval |
| `not(targetTrait present)` | evaluate explicit absence fact | conditional external-absence dependency | include only with legal negative witness | absence is evidence, not default inference | Blocking TSK-06.4: classification approval |
| `any(targetTraitA, targetTraitB)` | evaluate both branches canonically | conditional | include one sound satisfiable branch | no contradictory combined witness | Blocking TSK-06.4: classification approval |
| `all(T, not(T))` | well-formed static false | candidate unavailable | candidate unavailable | does not block another calculated candidate | Blocking TSK-06.4: classification approval |
| `any(unsupportedSemantics, always)` | semantic fail-closed | cannot produce numeric result | cannot produce numeric result | distinct from `unknownTruth` composition | Blocking TSK-06.4: classification approval |
| truth created by self mutation | preserve mutation and evaluate true | requirement remains conditional; exclude contribution | include contribution | execution truth and policy class stay distinct | Verified: requirement v0.9.1 |
| stochastic minimum＋success delta in one operation | execute one operation／outcome | retain minimum; exclude conditional delta | include legal outcome delta | one presentation group | Blocking TSK-06.4: graph／group approval |
| exclusive proc branches A／B target different buckets | preserve exclusive choice | include only baseline-effective branch outputs | include one legal maximum branch | never combine A＋B | Blocking TSK-06.4: graph／composition approval |
| modifier＋modifier rate share one condition | one dependency node, multiple consumer edges | both excluded together when conditional | both included when true | composition order remains typed | Blocking TSK-06.4: edge／composition approval |
| conditional ignore＋unconditional modifier in one effect | one presentation group, two contributions | keep modifier; exclude ignore | include legal ignore | row effect count remains one | Blocking TSK-06.4: split／group approval |
| excluded contribution input also feeds retained mutation | shared dependency with multiple role edges | input remains live | input remains live | no false `inputRequired` suppression | Blocking TSK-06.4: liveness approval |
| nested `false`＋`unknownTruth`＋`unsupportedSemantics` | separate truth and semantic status | canonical composition result | canonical composition result | no numeric fallback | Blocking TSK-06.4: composition approval |
| one logical effect split into multiple outputs | retain canonical effect identity | count effective group once | count effective group once | internal split does not change UI count | Blocking TSK-06.4: presentation approval |
| conditional-only safe skill | no baseline action | no candidate／no detail action | candidate only with legal witness | no policy no-op action | Verified: requirement v0.9.1; fixture Deferred TSK-06.41、production ratchet TSK-06.5 |
| unconditional＋conditional sibling | one safe transaction | action＋unconditional contribution | add legal conditional sibling | no partial transaction | Verified: requirement v0.9.1; fixture Deferred TSK-06.41、production ratchet TSK-06.5 |
| NP-consuming conditional tradeoff | not baseline-safe | no candidate | candidate only if attack NP remains reachable | cost is never discarded | Verified: requirement v0.9.1; fixture Deferred TSK-06.41、production ratchet TSK-06.5 |
| same trait expression before／after self mutation | two read points | pre-mutation truth | ordered post-mutation truth | syntax does not collapse time | Blocking B1／TSK-06.4 |
| self and condition both exclude one contribution | execute retained action／mutation | preserve both policy decisions | condition may include while self excludes | detail keeps both axes | Blocking B1／TSK-06.4 |

### Planning closure

- Verified: approved requirement already defines operation／state preservation, conditional contribution
  exclusion, effective-contribution-derived badge, and fail-closed execution preconditions. HEAD、main、
  merge-base are the same `45878789...`; the confirmed code mechanism predates this planning diff.
- Contribution execution／projection is B1, profile outcome／dominance is B3, and action admission is B4.
  Because B3 blocker population and input reachability depend on B4, TSK-06.41 performs one runtime semantic
  cutover for B1〜B4 and the portable B2 identity. TSK-06.5 adds no ranking semantics; it closes the exhaustive
  production maximum、four-policy inventory、performance、and legacy-removal proof.
- Portable identity is a separate B2 family and is not counted here. The shared compiled-projection interface
  must reach compatible approved types in both notes before either implementation starts.
- The breaking portable cutover includes every direct request reader／writer and minimal production Web
  handoff parity in TSK-06.41. TSK-07 retains presentation notice, recovery interaction, bounded cache,
  responsive, and accessibility closure. TSK-08 consumes the final TSK-06.5 inventory rather than producing a
  second semantic inventory.

The four proofs remain separate, but ownership follows the implementation order so eligibility does not
invalidate a just-closed maximum baseline:

| Proof | Minimum evidence | Current status |
| --- | --- | --- |
| focused candidate soundness | schema-legal action／branch／cost fixtures emit one legal ordered scenario | Deferred: TSK-06.41 |
| production candidate soundness | every emitted production candidate is one legal ordered scenario | Deferred: TSK-06.5 |
| per-contribution completeness | all policy-excludable outputs and live dependencies are represented exactly once | Deferred: TSK-06.41 |
| focused finite maximum oracle | small exhaustive schema-legal oracle matches the cutover planner | Deferred: TSK-06.41 |
| production maximum closure | four-policy × NP1〜5 inventory and representative exhaustive oracle detect missing candidates | Deferred: TSK-06.5 |
| portable／calculator execution parity | same typed request and projection reproduce damage, outcomes, and evidence | Deferred: TSK-06.41, then final regression in TSK-06.5 |

### TSK-06.4 eligibility design gate／TSK-06.41 atomic implementation boundary

TSK-06.4 approves static action semantics, policy admission, candidate-local reachability, branch atomicity,
and contribution projection before TSK-06.41 starts. TSK-06.41 implements B4 before potential input planning、
execution、and B3 aggregation inside the same atomic semantic cutover. Static semantics describe what an action is; the two ranking axes decide where it may be
admitted; ordered execution decides whether the concrete candidate remains reachable.

| Unit／mutation | Proposed classification | Atomicity／projection rule |
| --- | --- | --- |
| skill action | static `safeDeterministic | conditionalTradeoff | unsupported | outOfScope` | transaction全体を分類し、sibling operationを部分適用しない |
| AttackProfile到達role | candidate-local `structuralRequired | optional` | form、current state、ordered pathから導出し、static action kindへ固定しない |
| candidate-local action | `eligible | unreachable | unsupported` | initial resource、ordered path、AttackProfileを含めて評価する |
| canonical player-choice branch | branch-local static semantics and eligibility | 排他branchを一つの合法transactionとして選び、adverse siblingを落とさない |
| executed damage component | contribution projection | conditional siblingと独立に各dependencyを分類する |
| attacker HP decrease／NP consumption／typed detrimental state | `conditionalTradeoff` when fully represented | 成立込みでもcostをcommitし、attack NP到達不能は`unreachable` |
| stochastic／failure-capable transaction | `conditionalTradeoff` | 通常のみでは候補化せず、成立込みでも一つの合法outcomeだけを選ぶ |
| target debuff | safe or conditional by its requirement | damage contributionとしてB1 projectionへ渡す |
| conditional-only skill | policy no-op in baseline | 通常候補へ残さず、成立込みでだけ合法最大へ参加できる |
| unconditional＋conditional sibling | `safeDeterministic` action plus per-contribution projection | 通常は無条件寄与だけ、成立込みは合法なconditional siblingも含める |
| NP increase／beneficial state／trait grant／form transition | safe unless represented conditional cost exists | downstream state and livenessをordered executionで保持する |
| cooldownなどbounded preparation外 | `N/A: bounded phase外` | calculatorを一般battle simulatorへ拡張しない |
| 未解釈副作用 | `unsupported` | eligibleへ推測しない |

## Historical TSK-06 outcome and ownership

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

## Historical outcome classes before TSK-06.4 reopening

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

## Historical TSK-06 closure

- Verified: canonical witness generation, candidate soundness, per-condition completeness,
  exhaustive four-state maximum-damage oracle, selected-candidate calculator parity, production
  negative fixture, executor-shared leaf evaluation source, inventory, performance, ordered
  preparation, typed outcomes, and legacy isolation. The maximum-product record is consistently
  2,880 / 4,096.
- N/A: support/CE/mystic-code/turn/refund expansion.
- Deferred: TSK-07 UI/worker/URL cutover; TSK-08 cross-level blueprint caching and full four-policy
  production digest.
- Historical Blocking: 0 at the original TSK-06 review boundary. The TSK-06.4／06.41 reopening status at
  the top of this note supersedes this value for current work.
