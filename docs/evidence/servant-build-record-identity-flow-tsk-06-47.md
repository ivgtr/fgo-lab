---
title: "Profile servant-record identity fail-closed flow"
status: "Active"
updated_at: "2026-09-05"
---

# Profile servant-record identity fail-closed flow

## Planning delta

### Outcome, invariant, owner, and structural finding

A saved build or target may affect only the servant named by its canonical identity. `servantBuilds[recordKey]`
and `servantTargets[recordKey]` must match the embedded `servantId` before profile state becomes readable by the
calculator, ranking, support selection, material planning, or UI. NP0 remains a retained but unowned build; this
identity rule does not redefine ownership.

The current `localProfileSchema` accepts both maps as unconstrained records of individually valid values. Normal
`profile-domain.updateServantBuild` and `updateServantTarget` write matching identities, but stored profile and
backup parsers accept schema-legal counterexamples whose record key and embedded ID disagree. Direct readers then
look up by the record key and can use saved values with a separately selected master servant. Ranking exposed the
build counterexample, but a ranking-only comparison-basis check would leave the same mechanism in default
calculator construction, portable reset, profile presentation, support pickers, and the parallel target map.

Profile schema／persistence validation owns map coherence. It rejects the contradictory profile without repairing a
key, changing an embedded ID, choosing one identity, deleting user data, or falling back to defaults. Profile-domain
commands remain the only normal writers and continue emitting coherent records. Consumers may rely on the validated
profile contract; they must not add independent repair or alternate-lookup branches.

### Flow closure

| Path | Required transition | Status |
| --- | --- | --- |
| profile command writer | build／target updates continue writing `[servantId]` and embedded `servantId` atomically | Verified: current writers are coherent |
| current stored profile load | validate both servant-keyed maps before returning `ready`; retain invalid storage unchanged | Deferred: TSK-06.47 |
| v32／v33／v34 migration and backup import | apply the same coherence invariant before committing an upgraded collection; never repair either side | Deferred: TSK-06.47 |
| calculator default／subject change | consume only a validated matching build; no wrong-servant level／NP／Fou／skills | Deferred: TSK-06.47 |
| portable reset recovery | exact retained subject lookup may consume only its matching validated build; failed recovery preserves request／result | Deferred: TSK-06.47 |
| ranking population／owned basis／row ownership | consumes the shared validated map and canonical ownership fact; comparison axes remain TSK-06.42 | Deferred: TSK-06.47 then TSK-06.42 |
| profile UI／support picker／material planning | consume validated identity; no label or servant-ID exception | Deferred: TSK-06.47 |
| worker structured-clone payload | runtime validation at the worker boundary remains part of the ranking protocol cutover | Deferred: TSK-06.42 |

Planning Blocking is **0**. This identity guard is independent of comparison-basis semantics and may be implemented
in parallel with TSK-06.46; both precede TSK-06.42. Existing invalid-profile presentation is reused, while any new
recovery wording or interaction remains Deferred to TSK-07.

### Counterexample matrix

| State | Forward／recovery path | Expected outcome | Status |
| --- | --- | --- | --- |
| matching record key and embedded ID, NP1〜5 | load／backup → all build consumers | unchanged valid owned build | Deferred: TSK-06.47 |
| matching identity with NP0 | load／backup → profile and ranking | record retained; canonical ownership is false | Deferred: TSK-06.47 |
| mismatched build or target key and embedded ID | current profile load | profile load is invalid; persisted bytes are not overwritten | Deferred: TSK-06.47 |
| mismatched key and embedded ID | legacy migration or backup import | migration／import rejected transactionally; neither identity is selected | Deferred: TSK-06.47 |
| mismatched record reaches calculator or portable reset fixture | direct application boundary | no scenario or numeric result uses the build; retained portable state is unchanged | Deferred: TSK-06.47 |
| normal update to an existing build or target | profile command writer | key and embedded identity remain equal after every patch | Verified: current implementation; add regression fixture in TSK-06.47 |

### Implementation units and verification order

1. Extend the schema-owned profile identity refinement across both servant-keyed maps. Increment schema v34 to
   v35 once, preserve explicit v32／v33 readers, and add v34 collection／backup migration input. Every migrated
   value must pass the same current `profileCollectionSchema`; a mismatch rejects rather than selecting or
   rewriting either identity.
2. Keep `profile-domain.updateServantBuild`／`updateServantTarget` as the normal writers and `isOwned` as the NP1〜5
   ownership owner. Add focused fixtures proving matching identities after create and patch, retained NP0, and no
   second repair path.
3. Verify current load and repository migration before application readers. Cover calculator default／subject
   change, portable reset, ranking input／row ownership, profile and growth presentation, support selection, and
   backup import with one shared schema-legal mismatch fixture instead of adding consumer-side validation.
4. Run bounded diagnostics for schema migration, profile-domain writers, repository load, calculator／portable
   recovery, and ranking readers. Expand to `pnpm test:unit` and `pnpm test:production`; use `pnpm quality` as the
   only implementation phase-completion gate.
5. Search all direct `servantBuilds`／`servantTargets` readers and legacy v32／v33／v34 parsers. Close each path as
   `Verified`, `N/A`, or `Deferred`, update this note with the implementation delta, and require Blocking 0 before
   changing TSK-06.47 to `done`.

The identity refinement is one linear validation pass at each profile trust boundary. Consumers must not rescan
the maps, and production master compilation／ranking candidate cardinality is unchanged. Schema-legal focused
fixtures own the mismatch proof because production user profiles are not repository data.

## Step 1 planning handoff

- Baseline: `07b260147c8c27e1047043d081478ebdbc0fbcff` on `main`. TSK-06.41 and TSK-06.46 are `done`; PIR-001 is
  reviewer-approved and committed. TSK-06.42 remains `blocked` on this Task.
- Planning scope: production and test changes are 0. This note is the canonical flow record; the Task source and
  documentation indexes only record dependency, status, contract closure, and the current delta. Product
  requirements and ADRs need no revision because the existing fail-closed profile/persistence boundary owns the
  behavior.
- Confirmed mechanism: current v34 `localProfileSchema`, legacy v32／v33 profile schemas, and backup schemas validate
  record values independently from their keys. Migration output already converges through the current
  `profileCollectionSchema`, while repository load／replace and backup import are the persistence trust boundaries.
  Normal profile-domain writers are coherent; the gap is accepted contradictory input before shared consumers.
- Entry condition for Step 2: begin from the commit containing this handoff with TSK-06.47 `ready`, planning
  Blocking 0, TSK-06.41／06.46 `done`, TSK-06.42 `blocked`, and no staged, unstaged, or untracked production／test
  changes. Create a start commit that changes only TSK-06.47 to `in_progress` before source edits.
- Allowed worktree at Step 2 start: none. If another source, test, fixture, snapshot, baseline, or configuration
  delta exists, do not begin implementation. Preserve any later user change and record a new explicit boundary.
- Planned completion: all current／v32／v33／v34 load and backup paths reject build or target identity mismatch
  without persistence; matching NP1〜5 and retained NP0 remain valid; direct consumers contain no alternate lookup,
  repair, ID/name branch, or numeric fallback; this note reaches runtime Blocking 0 and `pnpm quality` passes.
