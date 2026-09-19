---
title: "Profile servant-record identity fail-closed flow"
status: "Complete"
updated_at: "2026-09-05"
---

# Profile servant-record identity fail-closed flow

## PIR-002 implementation delta

The post-implementation review found a missing population boundary: Zod record parsing drops an own JSON
`__proto__` key before the profile-level identity refinement sees it. Both matching and mismatched entries can
therefore disappear from a successfully parsed profile. The same normalization exists in every legacy input
schema, and v34 migration now persists that deletion. Ordinary-key fixtures did not cover raw-to-parsed key loss;
the earlier claim that the final profile refinement alone closes all ingress was incomplete.

The schema-owned servant-map parser must conserve original own keys before publishing a validated map. A key
discarded by record parsing is explicitly invalid; retained keys must match their embedded identity. Current and
v32/v33/v34 build and target schemas must share this owner. Consumers and normal writers remain unchanged, and
schema v35 remains the same identity contract with its enforcement corrected.

| New state × path | Required outcome | Implementation status |
| --- | --- | --- |
| own `__proto__`, matching or mismatched identity, both maps × current/v32/v33/v34 stored/backup | reject without silently deleting the entry | Verified: shared record parser and raw-key fixture |
| ordinary / `constructor` / `toString` own key, matching or mismatch, same paths | preserve matching record; reject mismatch | Verified: raw-key matrix |
| invalid original map × repository load/replace | retain original stored collection; publish no ready/replacement state | Verified: no-write fixture across both maps and all supported versions |
| published map × calculator/ranking/reset/profile/support/growth/undo | consume the same validated collection | Verified: existing reader/writer inventory below; no consumer parser added |

The shared `servantIdentityRecordSchema` parses the value schema, checks original own keys against parsed own
keys, then checks each retained embedded identity. Lost keys fail with `servant_record_key_not_preserved`;
identity mismatches retain `servant_record_identity_mismatch`. All current and legacy map schemas use this owner,
so normalization cannot remove the counterexample before final collection validation. Invalid map/value types
retain schema error paths. The obsolete profile-level refinement is removed.

This delta closes the implementation paths of one runtime mechanism from the completion handoff below.
Independent review remains pending; the historical completion evidence is retained.

Implementation evidence: schema/repository focused 31 tests, related reader/writer focused 33 tests, unit 441
tests, and production 117 tests passed with warnings 0. Production inventory, candidate counters, and damage
semantics remain unchanged. A same-process, three-round benchmark of one profile containing 422 builds and 422
targets measured median parse time 2.067ms before and 2.105ms after this correction. Phase-gate and independent
review results belong to the separate PIR-002 review record.

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
| profile command writer | build／target updates continue writing `[servantId]` and embedded `servantId` atomically | Verified: create／patch regression and NP0 ownership fixture |
| current stored profile load | validate both servant-keyed maps before returning `ready`; retain invalid storage unchanged | Verified: schema plus repository current-load fixture |
| v32／v33／v34 migration and backup import | apply the same coherence invariant before committing an upgraded collection; never repair either side | Verified: shared build／target matrix and import fixture |
| calculator default／subject change | consume only a validated matching build; no wrong-servant level／NP／Fou／skills | Verified: sole profile ingress rejects mismatch; consumer diagnostics unchanged |
| portable reset recovery | exact retained subject lookup may consume only its matching validated build; failed recovery preserves request／result | Verified: validated ingress plus retained-subject recovery diagnostics |
| ranking population／owned basis／row ownership | consumes the shared validated map and canonical ownership fact; comparison axes remain TSK-06.42 | Verified: identity ingress and row reader; Deferred: comparison axes TSK-06.42 |
| profile UI／support picker／material planning | consume validated identity; no label or servant-ID exception | Verified: direct-reader inventory contains no repair／alternate lookup |
| worker structured-clone payload | runtime validation at the worker boundary remains part of the ranking protocol cutover | Deferred: TSK-06.42 |

Runtime Blocking is **0**. Existing invalid-profile presentation is reused, while worker payload validation remains
Deferred to TSK-06.42 and any new recovery wording or interaction remains Deferred to TSK-07.

### Counterexample matrix

| State | Forward／recovery path | Expected outcome | Status |
| --- | --- | --- | --- |
| matching record key and embedded ID, NP1〜5 | load／backup → all build consumers | unchanged valid owned build | Verified: NP0〜5 schema matrix |
| matching identity with NP0 | load／backup → profile and ranking | record retained; canonical ownership is false | Verified: schema and profile-domain fixtures |
| mismatched build or target key and embedded ID | current profile load | profile load is invalid; persisted bytes are not overwritten | Verified: repository current-load and replace fixtures |
| mismatched key and embedded ID | legacy migration or backup import | migration／import rejected transactionally; neither identity is selected | Verified: v32／v33／v34 stored and backup matrix |
| mismatched record reaches calculator or portable reset fixture | direct application boundary | no scenario or numeric result uses the build; retained portable state is unchanged | N/A: persistence is the sole app profile ingress and rejects before consumer invocation; forged raw application input is outside the validated profile contract |
| normal update to an existing build or target | profile command writer | key and embedded identity remain equal after every patch | Verified: create and patch regression fixture |

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
   changing TSK-06.412 to `done`.

The identity refinement is one linear validation pass at each profile trust boundary. Consumers must not rescan
the maps, and production master compilation／ranking candidate cardinality is unchanged. Schema-legal focused
fixtures own the mismatch proof because production user profiles are not repository data.

## Step 1 planning handoff

- Baseline: `07b260147c8c27e1047043d081478ebdbc0fbcff` on `main`. TSK-06.41 and TSK-06.411 are `done`; PIR-001 is
  reviewer-approved and committed. TSK-06.42 remains `blocked` on this Task.
- Planning scope: production and test changes are 0. This note is the canonical flow record; the Task source and
  documentation indexes only record dependency, status, contract closure, and the current delta. Product
  requirements and ADRs need no revision because the existing fail-closed profile/persistence boundary owns the
  behavior.
- Confirmed mechanism: current v34 `localProfileSchema`, legacy v32／v33 profile schemas, and backup schemas validate
  record values independently from their keys. Migration output already converges through the current
  `profileCollectionSchema`, while repository load／replace and backup import are the persistence trust boundaries.
  Normal profile-domain writers are coherent; the gap is accepted contradictory input before shared consumers.
- Entry condition for Step 2: begin from the commit containing this handoff with TSK-06.412 `ready`, planning
  Blocking 0, TSK-06.41／06.411 `done`, TSK-06.42 `blocked`, and no staged, unstaged, or untracked production／test
  changes. Create a start commit that changes only TSK-06.412 to `in_progress` before source edits.
- Allowed worktree at Step 2 start: none. If another source, test, fixture, snapshot, baseline, or configuration
  delta exists, do not begin implementation. Preserve any later user change and record a new explicit boundary.
- Planned completion: all current／v32／v33／v34 load and backup paths reject build or target identity mismatch
  without persistence; matching NP1〜5 and retained NP0 remain valid; direct consumers contain no alternate lookup,
  repair, ID/name branch, or numeric fallback; this note reaches runtime Blocking 0 and `pnpm quality` passes.

## Step 2 completion handoff

- Boundary: start `17b26ce`; implementation `911753c`. `localProfileSchema` owns one linear refinement over
  `servantBuilds` and `servantTargets`, with schema v35 and explicit v34 collection／backup migration. v34 draft and
  history results migrate to the current envelope and remain validated; v32／v33 dispositions are unchanged.
- Trust boundaries: current repository load returns the existing typed invalid state and leaves bytes untouched;
  repository replace validates before write; v32／v33／v34 migration and backup import converge through the current
  `profileCollectionSchema`. No path repairs a key, embedded ID, record, or consumer lookup.
- Reader inventory: calculator default／subject selection, exact-subject portable reset, ranking population／row,
  profile and growth UI, support selection, and data counts read only the validated collection published by startup.
  No new servant ID／name／label branch, embedded-ID lookup, or fallback exists. Worker structured-clone validation
  remains Deferred to TSK-06.42.
- Semantic evidence: coherent NP0〜5 identities parse; NP0 remains retained and `isOwned === false`; both map kinds
  mismatch in current／v32／v33／v34 stored and backup input fail with `servant_record_identity_mismatch`. Repository
  load／replace and text backup import prove no invalid persistence or publication.
- Production／performance: attack servant 422、AttackProfile 433、calculated 420、unsupported 2、ranking row 393、
  candidate 6,360、deduplicated 3,949、damage request 1,924、distinct 1,298 are unchanged. The application digest is
  `fa9148dc060b7585c22cbb1b933a8f731718167a0e5cd2053bbdadb7a655362a`; diagnostic attribution classified the
  change from the prior digest as `introducedByChange` solely through the required schema-version envelope.
- Verification: focused 9 files／95 tests, unit 78 files／435 tests, production 24 files／117 tests, and final
  `pnpm quality` passed with Playwright 25 and skip／todo／retry／warning／unexpected-console 0. Final artifact is
  `.test-results/2026-09-05T08-09-19-780Z-15-ce996e`. A transient mobile VRT line-wrap failure reproduced only in
  some quality runs, passed standalone and final quality without source／snapshot changes, and is classified
  `environmentDependent`.
- Completion classification: all scoped paths above are `Verified`, `N/A`, or explicitly `Deferred`; Blocking is
  **0**. TSK-06.412 is `done`; both prerequisites are complete and TSK-06.42 is now `ready` for its own start boundary.
