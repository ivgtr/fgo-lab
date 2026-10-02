---
title: "Master data validation report: 2026-08-24-atlas-jp-skills"
status: "Superseded"
status_scope: "2026-08-24採取masterのsource checksum／artifact digest／469・420 inventoryの歴史記録"
---

# Master data validation report: 2026-08-24-atlas-jp-skills

- Retrieved: 2026-08-24T04:38:07.769Z
- Source: Atlas Academy JP static exports
- Normalized playable servants: 469
- Normalized servants with an attack NP: 420
- Normalized craft essences: 2,700
- Normalized growth materials: 152
- Normalized active skill summaries: 1,770
- Normalized artifact bytes: 7,530,618
- Artifact SHA-256: `d96fdf76c91458cc1631bcade6b5c8212de06ee7a959e85af80a3821b5f628a0`
- Schema/reference validation errors: 0

Raw checksums:

- `nice_servant.json`: `1abf690ac22bcdd427788e0ff545320af491ee9f90fbc08a56af9603a217118f`
- `nice_equip.json`: `bb339ac726f8201243410ec82b85a14496e6a8dace54b226071b556604fc27e5`
- `nice_item.json`: `e76d36180d2635e7df35c0b8b8be1d6617fb7c21d7364f770765873e3d8b5194`

## Attack NP Function inventory

| Function | Entries | Engine status |
|---|---:|---|
| damageNp | 374 | kernel implemented |
| damageNpIndividual | 141 | differential validation pending |
| damageNpPierce | 68 | differential validation pending |
| damageNpIndividualSum | 21 | handler implemented; validation pending |
| damageNpStateIndividualFix | 13 | differential validation pending |
| damageNpHpratioLow | 6 | approximate |
| damageNpBattlePointPhase | 2 | approximate |
| damageNpRare | 1 | differential validation pending |
| damageNpAndOrCheckIndividuality | 1 | trait matcher implemented; validation pending |

Total entries are 627. Unknown Function types are 0. Because several handlers still require independent differential validation, the UI forces all current results to `approximate`; this report does not satisfy the M3 `exact` release gate yet.
