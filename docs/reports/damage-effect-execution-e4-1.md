---
title: "Damage effect execution E4.1 comparison policy evidence"
status: "Complete"
date: "2026-08-27"
---

# E4.1 ranking comparison policy evidence

## Outcome

rankingはcalculatorの全入力を再掲する画面ではなく、同じ固定基準を5項目だけで比較する機能へ収束した。
計算経路はE4のcanonical `CalculationScenario -> calculation-application -> battle-execution -> damage kernel`
を維持し、ranking専用式・modifier解釈・raw Atlas参照を追加していない。

変更可能な条件は標準／所持、NP1〜5、class等倍／有利、自己buffあり／なし、特攻なし／成立だけである。
自然上限、Fou+1000、skill Lv10、OC1、attribute等倍、HP100%、star 0、turn 1、BP 0、quantity minimum、
proc成功、chained最大、礼装・魔術礼装・支援なしはtyped fixed policyが一度だけ所有する。

TargetContext基盤は先行する`66a21f3`で独立確定した。engine 996行へ意味論を足す構造を廃止し、
compile plan、target resolution、candidate execution、candidate comparison、result assemblyへ分割した。
family runtime semanticsとAtlas evidenceを分離し、typed predicateだけをsingle constraint evaluatorへ渡す。

## Production inventory and digests

全条件で420行、implementation unsupported 0、inputRequired 0である。特攻inactiveの適用badgeは0、activeは
206騎で、一騎を複数行へ分割しない。

| class | special | NP1 | NP2 | NP3 | NP4 | NP5 |
|---|---|---|---|---|---|---|
| neutral | inactive | `143960d6` | `b003cad5` | `fbcba002` | `67d88881` | `ef246434` |
| neutral | active | `ad225574` | `cf27f22b` | `fadfaf8e` | `ff422353` | `7b19c240` |
| favorable | inactive | `a1359950` | `d8e1e77f` | `d17c9bd0` | `8786de65` | `76271536` |
| favorable | active | `eb307083` | `82084f98` | `bebccf12` | `682ba3fa` | `2fd56359` |

テストは省略表記ではなく各64桁digestを保持する。NP Lv依存特攻の平均damageは次のとおり。

- エウリュアレ: 41,345.805 / 55,027.875 / 61,868.985 / 65,289.450 / 68,709.995
- 雨の魔女トネリコ: 41,920.510 / 65,209.955 / 78,601.400 / 85,755.900 / 93,157.300
- アーキタイプ：アース: 45,754.140 / 71,173.420 / 85,789.500 / 93,598.280 / 101,676.515

## UI and worker

旧詳細condition componentとURL parameterを削除した。desktopは5項目を一行、390px／320pxは2列で表示し、
横overflowは0である。閉じた行の高さは1440px 68px、390px 75.59px、320px 73.59px、filter regionは
各126.89pxでE4のdensity ratchetを維持した。

detail worker errorはinitialization／summary／detailをtypedに区別し、detailにはrequest ID、fingerprint、servant ID、
reasonを保持する。該当行だけerrorとretryを表示し、loading表示へ残留しない。

通常icon VRTはlocal deterministic PNGをAtlas成功responseとして使用し、network abort時fallbackは別snapshotで固定する。

## Versions

- scenario schema: 27
- engine: 20.0.0
- master artifact: 20260827.4
- master manifest schema: 32

TargetContextの破壊的契約変更による更新であり、旧scenario／URL fallbackは持たない。E3.12.1 calculatorのlayout、
操作位置、visible controlsは変更していない。承認済み46騎だけは存在しない2.0倍既定値をcanonical最大有利へ修正した。
