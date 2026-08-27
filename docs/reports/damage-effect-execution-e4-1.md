---
title: "Damage effect execution E4.1 comparison policy evidence"
status: "Complete"
date: "2026-08-28"
---

# E4.1 ranking comparison policy evidence

## Outcome

rankingはcalculatorの全入力を再掲する画面ではなく、同じ固定基準を5項目だけで比較する機能へ収束した。
計算経路はE4のcanonical `CalculationScenario -> calculation-application -> battle-execution -> damage kernel`
を維持し、ranking専用式・modifier解釈・raw Atlas参照を追加していない。

変更可能な条件は標準／所持、NP1〜5、class等倍／有利、自己buffあり／なし、特攻なし／成立だけである。
自然上限、Fou+1000、skill Lv10、OC1、attribute等倍、HP100%、star 0、turn 1、BP 0、quantity minimum、
proc成功、chained最大、礼装・魔術礼装・支援なしはtyped fixed policyが一度だけ所有する。

追補として、effectの発生源と寄与範囲を分離した。主順位は攻撃役本人へ実際に適用される`personal`、
`partyWide`、`enemyApplied`を含み、本人へ適用されない`partyOther`を除く。`partyWide`は主火力へ含めたうえで、
同じ条件・同じtarget candidateからarea効果だけを除いた反実仮想との差を「エリア貢献」として詳細表示する。
ランキング条件は5項目のままである。

ranking scenarioはUI presentation commandを再利用しない。`RankingExecutionPolicy`がranking条件由来の
`TargetContext`とterminal effect包含集合を所有し、effectのON／OFFはTargetContextを変更しない。

TargetContext基盤は先行する`66a21f3`で独立確定した。engine 996行へ意味論を足す構造を廃止し、
compile plan、target resolution、candidate execution、candidate comparison、result assemblyへ分割した。
family runtime semanticsとAtlas evidenceを分離し、typed predicateだけをsingle constraint evaluatorへ渡す。

## Production inventory and digests

全条件で420行、implementation unsupported 0、inputRequired 0である。特攻inactiveの適用badgeは0、activeは
206騎で、一騎を複数行へ分割しない。neutral policyでは全420騎の最終`classAffinity`が1である。

| class | special | NP1 | NP2 | NP3 | NP4 | NP5 |
|---|---|---|---|---|---|---|
| neutral | inactive | `143960d6` | `b003cad5` | `fbcba002` | `67d88881` | `ef246434` |
| neutral | active | `1e4e8a23` | `b4943d4d` | `ddf4af53` | `7c08bf10` | `6940e048` |
| favorable | inactive | `a1359950` | `d8e1e77f` | `d17c9bd0` | `8786de65` | `76271536` |
| favorable | active | `2678d1fa` | `36262bc6` | `b7f4a228` | `589f2d17` | `e2105a5c` |

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

標準比較workerはNP levelを除いたpolicy keyでNP1〜5 matrixをcacheする。NP selector変更では420騎の
scenarioを再compileせず、保持済みseriesを選択する。summaryではarea executionを行わず、展開した一行のdetailだけを
遅延計算する。productionでは主順位とareaなし反実仮想が異なる176騎、主順位へ適用された一意な`partyWide`
246 projectionをratchetし、`partyOther`の主順位適用を0へ固定した。ジャンヌ〔オルタ〕は本人に適用される
全体攻撃力アップを含み、neutral NP1平均90,768.145となる。XX〔オルタ〕の特攻inactiveはTargetContextを変更せず、
class affinity 1、power modifier 0、NP特攻倍率1のNP1平均39,381.220となる。

## Versions

- scenario schema: 27
- engine: 21.0.0
- master artifact: 20260828.2
- master manifest schema: 33

TargetContextの破壊的契約変更による更新であり、旧scenario／URL fallbackは持たない。E3.12.1 calculatorのlayout、
操作位置、visible controlsは変更していない。承認済み46騎だけは存在しない2.0倍既定値をcanonical最大有利へ修正した。

## Validation and performance

- format／ESLint／TypeScript: success
- unit／integration／property／golden: 63 files、336 tests、80.72s
- master validation: 7 files、68 tests
- evidence validation: 2 files、10 tests
- production build: success
- Playwright Chromium／mobile Chromium／VRT／a11y: 62 passed、30 project-specific skipped
- `git diff --check`: success
- main JS: 522.05 kB、gzip 148.23 kB
- ranking worker: 197.59 kB
- CSS: 44.93 kB、gzip 9.28 kB
- damage kernel benchmark: 411.80 ops/s、mean 2.4284 ms
- ranking matrix実測: policy一組のNP1〜5全420件を約2.7〜3.4秒で生成する。
- 特攻成立detail全420件は約4.1秒、最大world candidate 12、最大scenario calculation 14である。

旧11〜26秒の主因だったeffectごとの再compileと最大`2^N`のsubset探索を削除した。main threadは420件を
計算せず、filter変更はworker requestを発行しない。20 policyは4 matrixで検証し、NP levelごとの同一計算を
繰り返さない。
