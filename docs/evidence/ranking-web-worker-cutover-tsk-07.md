---
title: "TSK-07 ranking Web and worker canonical cutover"
status: "Complete"
updated_at: "2026-09-21"
---

# TSK-07 ranking Web and worker canonical cutover

> Historical entry audit: the five-field URL/protocol cutover evidence below records the original
> dependency sequence. TSK-06.4／06.41 reopened portable identity for a two-axis contribution intent,
> TSK-06.4 owned source-program／action-admission design, TSK-06.41 owned its implementation, and TSK-06.5
> owned final maximum／production closure. The final integrated closure at the end of this flow supersedes
> that historical sequencing record and is the current TSK-07 status.

## Outcome and ownership

The following ownership snapshot is retained as historical entry evidence; the integrated closure at the
end is authoritative for the completed task.

The ranking screen, public URL state, worker protocol, worker cache, response ordering, and detail
evidence use one `RankingPolicyConditions` contract with exactly five fields:
`comparisonMode`, `npLevel`, `classAffinity`, `selfBuffs`, and `conditionalEffects`. The cutover is
destructive. The old independent `specialAttack` and `field` inputs have no reader, writer, adapter,
fallback, compatibility flag, or runtime calculation path.

The application ranking policy currently exposes
`calculated | unavailableUnderPolicy | invalid`; TSK-06.41 will add distinct `inputRequired` and
`unsupported` outcomes before this Web flow resumes. Battle execution remains the only owner of
ordered preparation and damage semantics. The worker runtime currently owns request fingerprinting and caches
complete canonical calculations, which violates the proposed evidence-free cache contract. Web code renders the canonical presentation model and dispatches
condition/detail commands; list filters and display metrics remain local presentation state and do
not issue worker calculations.

## Read-only entry audit and TSK-06 carry-over

The entry audit started from `b325ef55a2b8ed094eee1f69464615e058d3018b` with a clean worktree.
The original audit treated the TSK-06 deferral as only the legacy UI/worker/URL cutover and policy evidence
presentation. Structural review found that portable start gauge/contribution handoff and cache-value ownership were also deferred. Cross-level blueprint/cache optimization and the full NP1–NP5 × four-policy
production digest remain deferred to TSK-08.

| Surface | Producer | Reader | Writer / recovery | Entry classification |
| --- | --- | --- | --- | --- |
| Web controls | `RankingConditions` | canonical presentation labels | five command dispatches | Verified |
| presentation | policy rows/details | `Ranking`, `RankingList`, `RankingEffectDetails` | local filter/sort/metric only | Verified |
| worker request | `useRanking` | thin worker adapter/runtime | initialize, calculate, detail | Verified |
| worker response ordering | worker runtime | `useRanking` | request ID plus canonical fingerprint rejection | Verified |
| cache identity/value | five-field fingerprint | calculation/detail caches | current complete result and accumulated evidence | Deferred: TSK-07; summary must be evidence-free, worker detail 0, React detail maximum 1 |
| URL | `serializeRankingState` | `parseRankingState` | canonical `rConditional`; obsolete params removed | Verified |
| detail evidence | selected `RankingPolicyDetail` | pure presentation builder | profile, start gauge, facts, ordered actions | Verified |
| portable calculator handoff | versioned two-axis request emitted from selected ranking candidate | calculator/workspace | TSK-06.41 owns identity／compiler／direct writer／minimal parity; TSK-07 owns notice and interaction | Deferred: implementation TSK-06.41, UI closure TSK-07 |
| old policy/fallback | removed files and exports | no production reader | no compatibility recovery | Verified |
| full four-policy production digest | application production audit | TSK-08 | shared final audit model | Deferred: TSK-08 |

No unrecorded external URL contract was found. Ranking URL state is an internal query contract, and
the requirements explicitly require old readers to be deleted. Old `rSpecial` / `rField` values are
ignored on parse and removed on the next serialization; they are not interpreted or migrated.
The destructive five-field cutover and wider portable calculation identity remain verified, but the cache family does not close. No external URL compatibility was newly inferred; old ranking-condition URL fields remain intentionally rejected. Old calculation share schema is rejected by the implemented portable contract.

## Canonical flow

```text
five Web commands
  -> canonical URL serialization
  -> calculate request
  -> worker-owned five-field fingerprint
  -> calculateRankingPolicy
  -> rows + typed exclusions + current evidence-bearing cache (Deferred: TSK-07)
  -> request ID/fingerprint stale-response gate
  -> local filter/sort/metric presentation
  -> detail command with the same fingerprint
  -> current worker/React detail accumulation (Deferred: TSK-07)
  -> profile/fact/ordered-action evidence presentation
```

## Counterexample and closure matrix

| State by path | Classification |
| --- | --- |
| all five controls expose accessible names and keyboard order | Verified: component and E2E |
| select popup expanded state | Verified: E2E `aria-expanded` transition |
| desktop / 390 px / 320 px, collapsed and expanded detail | Verified: no document overflow and reviewed snapshots |
| filter, sort, or displayed metric changes | Verified: presentation-only; absent from protocol/fingerprint |
| two identical five-field requests | Verified: one policy calculation through worker cache |
| newer condition response arrives before an older response | Verified: older request ID/fingerprint cannot replace rows or exclusions |
| detail response belongs to an obsolete condition fingerprint | Verified: rejected before display/cache application |
| unavailable／invalid profile in historical three-class model | Verified: typed exclusion; no numeric row or baseline fallback |
| `inputRequired`／`unsupported`／`invalid`／`unavailableUnderPolicy` after five-class cutover | Deferred: TSK-07; distinct label／recovery command and zero numeric rows |
| nonbaseline start NP, false world fact, ordered preparation | Verified: detail evidence fixture |
| old `rSpecial` / `rField` URL | Verified: ignored and removed, never converted |
| old special-attack/field request fields or fallback | Verified: production source scan 0 and legacy runtime files deleted |
| TSK-06.41 contribution semantics change reaches Web summaries／handoff | Deferred: TSK-07 after TSK-06.5 |
| full production digest across four policies | Deferred: TSK-08 |
| compatibility adapter or dual runtime | N/A: prohibited by destructive cutover |
| nonbaseline two-axis request through draft/history/share/backup/fingerprint | Deferred: TSK-06.41 portable identity implementation |
| selected ranking two-axis intent → calculator replay | Deferred: TSK-06.41 direct writer／minimal parity |
| notice／true normal reset interaction | Deferred at this historical checkpoint; final closure retains target／field／input／stochastic／action facts and changes only execution intent |
| repeated detail open/close/condition/context changes | Deferred: TSK-07 evidence-free bounded cache implementation |

## Inventory and parity

The canonical default production audit retains 433 attack profiles and 433 ranking rows with zero
exclusions. The shared digest is
`fef0cb14a63ecdb8292773e7d17030720b4314c92521e5d46a9f32274ec58d7e` after replacing legacy
detail records with canonical candidate evidence. The runtime counter contract is 6,376 candidates,
3,957 deduplicated candidates, 6,913 damage requests, and 1,599 distinct damage inputs, matching the
TSK-06 inventory.

A focused real-fixture test passes a worker-produced scenario, start gauge, and contribution
projection back through the calculator and compares the complete result and effect evidence. The
default production ranking returns 433 rows / 0 exclusions; the satisfied policy returns 424 rows /
9 typed exclusions. Nemo's focused worker E2E changes from 44,551 baseline average damage to 105,891
when conditional effects are satisfied, then returns to 44,551 without using an old field axis.

## Verification and performance

| Check | Result |
| --- | --- |
| focused component / URL / worker / stale response | 8 files / 14 tests passed |
| unit suite | 62 files / 350 tests passed |
| production suite | 24 files / 111 tests passed |
| compact runner suite | 17 tests passed |
| focused ranking E2E | 9 tests passed after snapshot update |
| full E2E performance sample | 64 passed / 32 skipped |
| final phase gate | `pnpm quality` passed |

Build was measured three times on the same worktree state. Median wall time changed from 2.08 s
(4.90 / 2.08 / 1.99) to 1.87 s (6.06 / 1.87 / 1.87), a 10.1% improvement. The worker bundle changed
from 264.56 kB to 269.38 kB (+4.82 kB / +1.82%); application modules fell from 256 to 248. The main
bundle changed from 592.60 kB / 165.45 kB gzip to 593.30 kB / 165.88 kB gzip.

Per the execution-time instruction, the after-change full E2E performance measurement was run once:
693.31 s. Its 64 passed / 32 skipped outcome matches the baseline's three runs (584.12 / 575.60 /
580.56 s; median 580.56 s). The increased single observation is explained by the satisfied-policy
worker scenario added to the smoke gate and is not treated as a stable median. The final canonical
quality gate revalidates the same E2E contract but is not an additional performance sample.

## Artifact manifest and source removal

Seven intentional Playwright baselines were updated: ranking desktop, 390 px, 320 px, desktop detail,
320 px detail, compact row, and deterministic icon fallback. They were visually reviewed for control
wrapping, evidence order, readable labels, and overflow.

The final production-source scan covers obsolete condition symbols, URL keys, readers, matrix
facades, and legacy runtime filenames and returns zero matches. Deleted runtime modules include the
legacy field/world selectors, legacy ranking facade/candidate/matrix/scenario/preparation family, and
their legacy-only tests. Historical evidence and baseline-audit references are retained as records,
not runtime readers.

The recorded test and performance results are historical evidence for the five-field cutover. They do not prove portable restore parity or bounded cache values because those cases were absent from the gate design.

Historical closure: Blocking 0, Deferred 2. At that historical checkpoint, the current reopening left the direct two-axis writer／minimal
handoff in TSK-06.41 and three TSK-07 paths: notice／five-outcome presentation, atomic reset interaction, and
bounded cache／stale response rejection.

- Verified: TSK-06.2 closed E2E case ownership, project assignment, setup/ranking repetition, and the current performance baseline.
- Deferred: TSK-07 separates summary/detail evidence and enforces maximum cardinality.

Historical dependency: TSK-07 waited for TSK-06.5, and TSK-08 could not start. Cross-level optimization and
the full production digest remain deferred to TSK-08 after TSK-07 closes.

## Current RK-CACHE-001 bounded closure (2026-09-21)

The historical five-field evidence above remains unchanged. This section records only the current
bounded unit after the seven-field, two-axis identity and TSK-06.5 production closure were available.

Ownership is now separated at the cache boundary. `rankingConditionsFingerprint` remains the sole
identity producer for the canonical seven inputs, including `selfBuffs` and `conditionalEffects`.
`createRankingWorkerRuntime` retains one successful summary for the current worker context, with only
`rows` and typed `exclusions`. A new successful fingerprint replaces that value; initialization clears
it. A failed calculation cannot make an older summary serve a new fingerprint. The worker has no detail
cache. A detail request first proves the current context, summary fingerprint, and entry membership,
then calls the existing application detail owner with the same area-support boundary used by summary
calculation. This preserves the prior production detail output while avoiding evidence retention in the
worker summary value.

`useRanking` owns one pending detail identity and one active detail value. A new row replaces the
pending identity and clears the previous value; close, condition change, context replacement, and
unmount clear it. Responses are applied only when worker instance, context ID, request ID, fingerprint,
and (for detail) entry ID all match. Stale summary, detail, and typed error responses therefore cannot
populate rows, active detail, or detail errors. The ranking component dispatches `clearDetail` when an
open row closes, so repeated open/close cannot accumulate values.

The bounded counterexample matrix is:

| Path | Expected result | Evidence |
| --- | --- | --- |
| same seven-field request twice | one summary calculation; identical rows/exclusions | focused worker test |
| A → B → A | one summary value at a time; A is recalculated after B replaces it | focused worker test |
| summary value inspection | no profile result, scenario, effect, trace, projection, or detail value | worker implementation and response schema |
| detail open twice | worker detail cache remains zero; each request uses current fingerprint | focused worker test |
| detail row replacement | first response is rejected; second response yields exactly one active value | focused React test |
| close before response | pending identity is invalidated and response is ignored | focused React test |
| old context or old summary response | no row/detail/error mutation | existing response-ordering tests |
| filter, metric, or handoff | no new ranking calculation request from presentation-only changes | direct Web consumer and E2E-050 |

Focused verification passed 11 unit tests, 33 direct calculator/ranking/portable tests, typecheck,
targeted lint and format, and E2E-050 (2/2). The final `pnpm quality` also passed with unit 885,
production 144, Playwright 29, retry 0, warnings 0, and unexpected console 0. The E2E path covered the real worker, detail snapshot,
keyboard contribution filter, 390px/320px expanded overflow, and calculator handoff. The ranking hot
path remained 433 rows / 0 exclusions with digest
`a9cee3d7a5ec35a30f9ef2b2fdc97ab0c00aa27d6593ba70e02eb4f0f6c5626f`; three samples had a median of
5779.623 ms against the TSK-06.5 baseline median 5560.169 ms (+3.95%). No fixed wall-clock target,
cache-reduction ratchet, or timeout relaxation was introduced.

TSK-06.5 candidate inventory, support status, production output, calculator/ranking/portable parity,
and legacy-removal evidence are reused because the canonical input and production digest are unchanged.
The machine-readable record is [TSK-07 cache closure](tsk-07-cache-closure.json). At this historical
checkpoint the task sequencing record was still `in_progress`; the later integrated closure below is the
current status.

## Current notice and normal-reset bounded closure (2026-09-21)

This section records the next bounded unit only. The historical five-field cutover and the preceding
RK-CACHE-001 section remain unchanged. The machine-readable evidence is
[TSK-07 notice/reset closure](tsk-07-notice-reset-closure.json).

The selected ranking detail still enters the calculator through the current discriminated portable
request. `CalculationContextNotice` now presents the complete ranking-origin identity that affects the
handoff: start NP, self-buff policy, conditional-effects policy, and version metadata. The notice uses
the requirement vocabulary `自己バフ` and `条件効果` and keeps the reset command in the result-adjacent
notice. The selected ranking result and effect evidence continue to be replayed by the shared
application executor; Web does not reconstruct policy semantics from labels or IDs.

The normal-reset command is an application-owned transaction. It validates the retained request subject,
keeps the request's scenario and version context unchanged, changes only the execution intent to
`calculator` with `initialNpGauge: 10000` and standard calculator policy, executes it, and publishes
the new request/result/fingerprint only after the durable draft write succeeds. Target/field facts,
canonical inputs, stochastic activation facts, ordered choice/action witness, effect decisions, and
candidate evidence remain in the scenario; ranking policy and intent are removed from the request intent.
A reset attempt that cannot resolve the subject, execute the retained scenario, or persist the pair leaves
the retained request/result/fingerprint intact and reports the typed failure in the notice.

`CalculatorRoute` gives each scenario/reset publication a mutation identity. When a newer mutation starts,
an older asynchronous fingerprint or durable-write completion cannot publish its workspace state or
replace a newer reset error. Successful reset focuses the result heading; failure focuses the error
summary. This is a Web publication guard and does not change the ranking worker cache contract.

| Path | Expected result | Evidence |
| --- | --- | --- |
| selected ranking detail with `selfBuffs` and `conditionalEffects` | current portable request and replayed calculator result/effects remain equal | ranking handoff, portable reconstruction, E2E-050 |
| ranking-origin notice | start NP, both policy axes, version, and explicit reset are visible | CalculationContextNotice unit and E2E-050 |
| reset with target/field/input/activation/action/effect state | same scenario/version context is retained; only calculator intent/result/fingerprint replace the ranking identity | portable reset fixture and E2E-050 draft inspection |
| reset failure or durable write failure | old request/result/fingerprint remains; typed error is visible | portable reset failure tests and notice fixture |
| scenario edit, reset, current history copy, historical regeneration | one App-owned mutation gate prevents a later-completed older publication from changing workspace or durable draft | portable draft stale-publication fixtures and route handoff tests |
| ranking worker response after condition/context/detail replacement | no stale rows/detail/error enter current UI state | RK-CACHE-001 focused `useRanking` and worker tests, reused |
| calculator reset fingerprint | new calculator request identity is stored; ranking fingerprint is not reused | E2E-050 draft inspection and portable draft writer |

The bounded unit changes presentation and calculator publication state only. Candidate generation,
ranking worker protocol/cache cardinality, damage semantics, canonical production output, support status,
and production parity remain unchanged. TSK-06.41, TSK-06.5, and RK-CACHE-001 evidence are therefore
reused under their existing identity conditions. No fixed wall-clock target, candidate ratchet, timeout
relaxation, or compatibility path was introduced.

Focused unit/direct-consumer checks and the required E2E paths are recorded in the machine-readable
evidence. The full `pnpm quality` gate also passed for this final source state (unit 886, production 144,
Playwright 29, zero retries/warnings/unexpected console observations); its manifest is
`.test-results/2026-09-20T19-18-55-246Z-73-bbda97`. The remaining five-outcome and responsive/a11y
bounded units still require the final TSK-07 integrated closure.

This bounded unit was complete at its historical checkpoint; the integrated closure below supersedes its
temporary `in_progress` sequencing status.

## Current five-outcome presentation and recovery bounded closure (2026-09-21)

This section records the bounded outcome unit only. The historical five-field cutover, RK-CACHE-001
closure, and notice/normal-reset closure above remain unchanged. The machine-readable evidence is
[TSK-07 outcome closure](tsk-07-outcome-closure.json).

The application already owns the five-way profile result and the numeric boundary remains explicit:
only `calculated` is passed to `createRankingRow`; `inputRequired`, `unsupported`, `invalid`, and
`unavailableUnderPolicy` are retained as typed exclusions. `RankingPolicyExclusion` now carries the
exact `AttackProfile`, required inputs, reason, and a typed recovery disposition. The worker summary
and response schema carry those fields without scenario, effect, candidate, or detail evidence.

`inputRequired` is the only exclusion with a recovery command. It resolves the same AttackProfile
through the application preparation planner and constructs a normal calculator portable request with
calculator intent. The command does not select a default form or another profile. `unsupported` and
`unavailableUnderPolicy` display their distinct reason and have no input-change or numeric recovery.
`invalid` maps its known cause to a ranking-condition reset or page reload; no invalid reason is
silently converted to a retry or baseline damage. Detail errors preserve their typed status so the
same command boundary also applies when detail materialization rejects a profile.

| Path | Expected result | Evidence |
| --- | --- | --- |
| calculated profile | one numeric ranking row | `calculateRankingPolicy`, `rankingRows` focused fixture |
| inputRequired exclusion | required input and same AttackProfile calculator command | `rankingRows` fixture, Ranking integration fixture, portable request fixture |
| unsupported exclusion | reason shown; no command or numeric row | typed exclusion/recovery fixture |
| invalid exclusion | reason plus cause-specific reset/reload only | typed recovery fixture |
| unavailableUnderPolicy exclusion | policy reachability reason only | existing profile outcome owner plus typed exclusion fixture |
| inputRequired detail error | same row AttackProfile calculator command | RankingList focused fixture |
| invalid detail error | reload command; unsupported/unavailable remain non-recoverable | RankingList focused fixture |
| stale summary/detail/error | no current React state mutation | RK-CACHE-001 focused response-ordering evidence, reused |

The exact-profile calculator command reuses the existing preparation planner, scenario constructor,
portable schema, shared executor, and durable draft publication order. It does not change canonical
input, ranking fingerprint, candidate inventory, production output, or damage semantics. Existing
TSK-06.41 handoff/parity, TSK-06.5 production inventory/support status, RK-CACHE-001 cardinality and
stale rejection, and notice/reset evidence are reused under those unchanged identities. No adapter,
compatibility flag, legacy reader, numeric fallback, 0-damage fallback, or parallel compiler was added.

Focused verification passed 37 tests across outcome conversion, exact-profile portable construction,
worker protocol/runtime, React response ordering, ranking integration, and direct presentation
consumers. Typecheck, targeted lint, and format passed. The required browser path is the existing
real-worker ranking/handoff journey; final artifact paths are recorded in the machine-readable
evidence. The full `pnpm quality` gate is deferred to final TSK-07 integrated closure because this
unit leaves candidate generation, production matrix, and hot-path calculation unchanged; no fixed
wall-clock target, candidate ratchet, or timeout relaxation was introduced.

This bounded unit is a historical checkpoint; the final responsive/accessibility closure and integrated
quality gate are recorded below.

## Current responsive, accessibility, and integrated-quality closure (2026-09-21)

This section records the final responsive/accessibility bounded unit. The historical five-field cutover,
RK-CACHE-001 cache closure, two-axis notice/normal-reset closure, and typed-outcome closure above remain
unchanged. The machine-readable evidence is [TSK-07 responsive/accessibility closure](tsk-07-responsive-accessibility-closure.json).

The presentation owners now keep ranking rows, expanded detail, typed exclusions, required-input lists,
recovery commands, and the calculator-origin notice bounded at desktop, 390px, and 320px widths. Row
disclosures retain `aria-expanded`/`aria-controls` and an accessible name containing the servant and Noble
Phantasm. Exclusion status is presented with distinct human labels; reason and required-input descriptions
are associated with each recovery button. The ranking status remains a polite live region and receives
focus after an invalid-condition reset. The calculator-origin notice has a heading, readable version
metadata, a reset description, and a keyboard-operable command. The existing global `:focus-visible`
outline remains the focus-visibility owner.

| Path | Expected result | Evidence |
| --- | --- | --- |
| desktop ranking row/detail | position, portrait, name/NP, numeric damage, disclosure, detail evidence, and recovery remain readable without horizontal overflow | E2E-050 detail state and direct consumer tests |
| 390px ranking row/detail | detail becomes one column; contribution cells, long reasons, required inputs, and recovery commands wrap; recovery commands use available width | E2E-050 390px viewport |
| 320px ranking row/detail and calculator notice | condition/basis controls collapse, common equipment stacks, row columns reduce, long labels/reasons/buttons wrap, and reset is full-width | E2E-050 320px viewport and E2E-014/015/016 |
| typed exclusion list | `calculated` is the only numeric row; inputRequired exposes the same AttackProfile calculator command; unsupported/unavailable are non-recoverable; invalid exposes only reset/reload | Ranking integration fixture and outcome closure evidence |
| keyboard/focus | Enter dispatches existing commands, focus order is preserved, expanded state is announced, invalid reset returns focus to the status region | E2E-050, E2E-051 |
| accessibility | overview and expanded ranking detail have no serious/critical axe violations | E2E-002 overview/detail axe audit |

The CSS changes are presentation-only: `min-width: 0`, `max-width: 100%`, `overflow-wrap: anywhere`,
bounded grids, and direct-child failure-list scrolling contain long content without turning nested
required-input lists into an inaccessible scroll region. No DOM change enters the ranking request,
canonical fingerprint, worker cache key, stale-response identity, or durable calculator publication.
Worker summary remains maximum one, worker detail remains zero, and React active detail remains maximum
one. The five typed outcomes, exact AttackProfile calculator handoff, two-axis notice/normal reset,
calculator/ranking/portable parity, and `calculated`-only numeric boundary are reused unchanged.

Focused component verification passed 3 files/10 tests (artifact
`.test-results/2026-09-21T03-36-55-745Z-15-455798`); direct consumers passed 10 files/55 tests
(artifact `.test-results/2026-09-21T03-38-36-868Z-15-846e45`). Typecheck, changed-file ESLint,
Prettier, E2E-050 (2/2), E2E-051 (2/2), E2E-014/015/016 (4/4), and E2E-002 (2/2, overview and
expanded-detail serious/critical axe checks) passed. This is a UI/presentation-only unit, so no candidate
reduction ratchet, fixed wall-clock target, timeout relaxation, or new production hot-path measurement
was introduced; TSK-06.5 production and parity evidence is reused.

The integrated `pnpm test:docs` passed. The final `pnpm quality` passed with unit 890, production 144,
Playwright 29, retry 0, warnings 0, and unexpected console 0; its manifest is
`.test-results/2026-09-21T03-55-07-915Z-15-120d12` and the machine-readable evidence records the step list
and duration. No canonical identity, support status, candidate inventory, production output, or parity
difference was found; therefore TSK-06.41 and TSK-06.5 remain closed. If any such difference appears,
the next bounded unit must stop and record the canonical owner, impact, rerun scope, and reopen decision
before further work.

This bounded unit was the final pre-closure checkpoint. The integrated closure below sets TSK-07 to `done`
and releases TSK-08 to `ready`; TSK-06.5, TSK-06.47, and TSK-06.48 remain `done`.

## Final integrated TSK-07 closure (2026-09-21)

The portable normal reset now retains the ranking request's exact scenario and version context and changes
only the execution intent to `calculator + initialNpGauge 10000 + standard`. Target/field facts, canonical
inputs, stochastic facts, ordered actions/choice, effect decisions, and candidate evidence remain scenario
state; ranking intent and policy are removed from the request rather than retained as hidden state. The
execution boundary uses the intent's standard OC1 without rewriting the persisted scenario.

`portableDraft.ts::commitPortableDraft` is the single Web workspace publication owner. An App-owned mutation
gate covers scenario edits, reset, current-history copy, historical regeneration, version upgrade, ranking
handoff, finalizer, navigation, undo, and profile import. Every durable write and workspace/session/route
publication checks the token before and after the asynchronous write, so a later-completing stale operation
cannot overwrite the last-started valid user operation. Reset executes before publication and retains the old
request/result/fingerprint/draft on subject, execution, or durable-write failure.

| Closure | Evidence |
| --- | --- |
| scenario/version retention and calculator intent normalization | `portableCalculation.test.ts`, focused 34-test artifact |
| failure retention of request/result/fingerprint/draft | portable reset and durable-write failure fixtures |
| scenario edit → reset ordering | stale-publication fixture |
| reset → current history copy ordering | stale-publication fixture |
| current history copy → historical regeneration ordering | stale-publication fixture |
| ranking worker, notice, keyboard, responsive, and calculator parity | E2E-050 2/2 and E2E-051 2/2 artifacts |

Focused tests (34), typecheck, targeted lint/format, and `pnpm test:docs` passed. The final `pnpm quality`
gate passed with unit 895, production 144, Playwright 29, retry 0, warnings 0, and unexpected console 0;
artifact: `.test-results/2026-09-21T05-40-21-470Z-15-a881eb`. Production inventory, candidate count,
support status, calculator/ranking/portable parity, fingerprint contract, cache cardinality, and worker
stale gates are unchanged. Blocking is 0, TSK-07 is `done`, TSK-08 is `ready`, and no commit was created.
