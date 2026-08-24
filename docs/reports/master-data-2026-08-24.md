# Master data validation report: 2026-08-24-atlas-jp

- Retrieved: 2026-08-24T04:13:42Z
- Source: Atlas Academy JP static exports
- Normalized servants with an attack NP: 420
- Normalized craft essences: 2,700
- Normalized growth materials: 152
- Normalized artifact bytes: 5,548,096
- Artifact SHA-256: `59a68462de1d1e507d86bc5d701e1a238c8de8c760542fd988fea9e675b0ebe9`
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
