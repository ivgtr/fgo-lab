---
title: "TSK-04 legacy runtime removal closure"
status: "Verified"
updated_at: "2026-08-31"
---

# TSK-04 legacy runtime removal closure

## Outcome and ownership

The published master and runtime now have one model for condition/provenance/route and one canonical
contract for NP resources. Atlas/raw vocabulary is interpreted only by the data pipeline. Application
constructs scenario commands, execution binds canonical actor roles and source-local identities, and
calculator/ranking consume the same prepared execution. This removal is breaking: there is no schema
adapter, feature flag, fallback, or dual runtime branch for the removed fields.

## Legacy path disposition

| Removed path | Canonical disposition | Status |
| --- | --- | --- |
| `MasterEffect.conditions` and `TraitCondition` | `CanonicalEffectRequirement.expression`, produced by `effectNormalization.ts` | Verified |
| `traitReadPolicy` | provenance on each canonical trait requirement | Verified |
| `conditionTargetPolicy` | `CanonicalEffectRequirement.recipient` | Verified |
| `quantityConditions`, `sourceQuantityConditions`, `inputQuantityConditions` | exhaustive leaves in the requirement tree | Verified |
| execution `targetPolicy` | `CanonicalEffectRoute.target` | Verified |
| parallel `expectedRecipient` / `targetMismatch` | exhaustive `CanonicalEffectRoute.eligibility` | Verified |
| parallel `contributionScope` | `CanonicalEffectRoute.contributionScope` | Verified |
| execution-side `normalizeTraitCondition` raw reader | deleted; pipeline is the only canonical producer | Verified |
| raw NP function/target/value interpretation | `npResourceNormalization.ts` -> fixed or typed unsupported transition | Verified |
| schema defaults for removed runtime fields | deleted; outer schemas and every nested execution operation reject old and mixed shapes | Verified |
| test-only old-to-new master adapter | deleted; fixtures construct canonical state directly | Verified |
| compatibility flag / raw fallback | no production path existed and none was introduced | N/A: absent |

`targetMismatch` remains only as a typed user-facing execution outcome code. It is not a route field
or raw target interpreter. `atlasEvidence` remains in the master for audit provenance; production
application and execution code do not read it to determine behavior.

## Forward, recovery, and alternate paths

```text
Atlas/raw
  -> data pipeline canonical requirement / route / resource contract
  -> strict master schema
  -> application command
  -> shared execution binding and transactional operation
  -> calculator / ranking result

old, mixed, ambiguous, or incomplete artifact
  -> schema rejection or typed unsupported result
  -> no numeric fallback and no partial state
  -> corrected artifact/input is fully parsed and re-prepared
```

Import and cache restore use the same strict master schema. Share/profile restore persists scenario
commands rather than runtime operations, so it cannot revive the deleted IR. Ranking counterfactuals
refer to canonical operation IDs and contribution projections and do not contain a separate semantic
reader.

## State x path counterexample matrix

| State | Artifact/import | Calculator | Ranking | Restore/reapply | Status |
| --- | --- | --- | --- | --- | --- |
| canonical-only state | parses | shared execution | shared execution | deterministic | Verified |
| old-only condition fields | strict parse rejects | unreachable | unreachable | rejected | Verified |
| old-only route fields | strict parse rejects | unreachable | unreachable | rejected | Verified |
| mixed old and canonical fields at effect level | strict parse rejects unknown keys | unreachable | unreachable | rejected | Verified |
| canonical operation plus contradictory legacy operation fields | strict nested operation parse rejects unknown keys | unreachable | unreachable | rejected | Verified |
| unresolved raw target | pipeline emits typed unsupported route | no numeric fallback | typed failure | deterministic | Verified |
| dependent NP amount | pipeline emits typed unsupported transition | no guessed amount | no guessed amount | deterministic | Verified |
| schema-legal production-negative canonical state | focused fixture parses | expected typed outcome | same outcome | round-trip | Verified |
| operation failure after prior transition | canonical transaction aborts | original state retained | same path | retry starts unchanged | Verified |

## Verification

- Architecture ratchets scan non-test application/execution/UI sources for deleted master fields and
  Atlas target/buff vocabulary. Matches for `targetMismatch` are limited to the canonical outcome.
- Strict schema fixtures reject legacy `quantityConditions`, incomplete canonical routes, and the
  old-only／canonical-only／mixed-contradictory operation crossing cases.
- Published master is schema 42, version `20260831.10`, 29,902,484 bytes, SHA-256
  `76848894dc47f5c3783463d821d7f6dd0b016406e8fe20aafd381848dd4308d8`.
- Production inventory remains 13,875 effects, 14,623 operations, 706 canonical NP identities,
  433 ranking rows, and 422/422 calculated calculator scenarios.
- Successful production runs: 68.92s, 69.17s, 68.23s; median 68.92s versus the 72.00s baseline
  (-4.28%). Runtime counters remain 1/1/1 reads/parses/compiles, 6,508/4,009 candidates, and
  3,744/1,644 damage requests.

## Review delta: mixed nested operation artifact

1. **発生機構 — 確認済み:** `masterEffectSchema`と`canonicalEffectRouteSchema`はstrictだが、
   `effectExecutionOperationSchema`を構成する9個の`z.object()`は非strictである。Zodがoperation
   内の未知legacy fieldを除去するため、canonical routeと矛盾するmixed artifactがparse成功する。
2. **実装時のズレ — 推論:** 外側schemaのstrictnessがnested operationへ伝播する前提でclosureを
   記録した可能性がある。根拠は、外側／routeには`.strict()`がある一方、union memberにはなく、
   closureがnested境界を個別に検証していないことである。
3. **検出を逃れた理由 — 確認済み:** fixtureはold-only effect fieldと不完全なcanonical routeを
   扱うが、完全なcanonical operationと矛盾するlegacy operation fieldの交差セルを持たない。
   architecture ratchetはruntime sourceのlegacy readerを検査するため、parse時のunknown-key除去を
   検出しない。
4. **再発範囲 — 推論:** breaking cutover対象の他のnested objectでも同じunknown-key除去が成立し得る。
   最小guardrailはschema境界ごとのold-only／canonical-only／mixed contradictory fixtureである。

Resolution: all 9 `effectExecutionOperationSchema` union members are strict. The crossing fixture
proved the original mixed artifact was accepted before the fix and now proves old-only rejection,
canonical-only acceptance, and mixed-contradictory rejection. Red artifact:
`.test-results/2026-08-31T00-37-24-565Z-15-9a9175`; focused green artifact:
`.test-results/2026-08-31T00-38-06-758Z-15-f7244a`. Final `pnpm quality` passed unit 56 files／
311 tests (`.test-results/2026-08-31T00-44-42-950Z-320-cc3deb`), production 25 files／119 tests
(`.test-results/2026-08-31T00-44-48-010Z-802-d4e4b7`), published-master validation, build, and
E2E 64 passed／32 skipped. Inventory, damage, calculator／ranking parity, and runtime counters retain
their existing ratchets.

All legacy paths are `Verified` or `N/A`, with `Blocking: 0`.
