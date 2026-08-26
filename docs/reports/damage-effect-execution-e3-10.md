# Damage effect execution E3.10 completion report

- Date: 2026-08-27
- Scope: 効果の包含、発動条件、確率判定の分離。E4ランキング統合は未着手。
- Scenario schema: 25
- Master schema: 30
- Master data: `20260827`
- Engine: `18.0.0`

## 結果

この計算機は確率期待値を求めるものではなく、成立した効果を選ぶシナリオ計算機である。
表示される確定火力効果は既定ONで、OFFは比較のための除外を表す。単純な確率火力効果は
同じスイッチを使い、ONを成功、OFFを失敗として扱う。確率だけを理由とする追加フォームや
`inputRequired`は生成しない。HP、trait、field、個数などの決定的条件は包含と独立して評価し、
ONでも条件不成立なら適用しない。

使用スキルのactivation、terminal effectのinclusion、deterministic condition、proc selection、
visibilityを別の契約へ分離した。field・trait付与などの中間operationはhiddenのままsource activationへ
従属し、表示されたeffectの除外とは混同しない。旧`automatic`による多重解釈、effect toggleからの
skill activation推論、支援だけの選択済みeffect復元、raw condition evidenceのruntime参照を削除した。

## Canonical proc semantics

data-pipelineだけがAtlasのRateと判定構造を解釈し、master effectへ次を保持する。

- `guaranteed`: 確定効果。既定ON、比較除外可能。
- `singleRoll`: 一つの成功・失敗判定。effect switchがproc selectionを兼ねる。
- `independentRolls`: 判定identityごとに独立して成功・失敗を選択する。
- `chainedRolls`: 先行成功時だけ次へ進む列。0〜最大回数の一つの入力で不可能な飛び石を防ぐ。

production 13,322 effectの内訳はguaranteed 13,279、single roll 3、independent rolls 35、
chained rolls 5で、非guaranteedは合計43 occurrenceである。unknown proc semantics、runtime/UIの
raw `Rate`参照、確率100%未満なのに操作不能なterminal damage effectは0件である。

## UIとscenario

「自身の適用内容」には最終damageへ関係するeffectだけを表示し、由来、確定／成功率、計算中／
計算外、比較除外／失敗扱いを通常表示する。カード不一致、非damage、宝具後、中間stateは表示しない。
確定effectと単純procはtoggle、排他的conditionはsingle-choice、連鎖procだけは成功回数stepperを使う。

scenarioは既定値との差分を保存する。確定・単純procのOFFは`effectInclusions`の除外、連鎖procは
canonical input value、skill使用はsource activationとして保存する。URL、共有JSON、保存支援構成は
同じschemaを使い、復元後のdamage inputと結果を一致させる。旧形式のfallbackは設けない。

E4は同じscenario validation、source activation、effect inclusion、proc selection、ordered executor、
damage resolutionを再利用する。確率効果を無条件に最大成功へ置換するランキング専用経路は作らない。

## 代表結果

- カエサル: chained roll成功回数0〜5でNP1平均
  54,130.230 / 59,530.825 / 64,931.400 / 70,331.980 / 75,732.555 / 81,133.125。
- 杉谷善住坊: damage-relevantな独立判定を個別に操作し、全失敗43,749.280、全成功73,499.140。
- ドゥリーヨダナ: OC1〜5の表示率60/70/80/90/100%。Arts耐性ダウン失敗23,688.940、
  成功28,426.830。OC5でも比較除外できる。
- 水着ハベトロット: 宝具前の確定Buster・宝具威力effectを既定ONで個別除外でき、スキル3の
  同名effectとはsource表示で区別する。敵数・スター数入力は包含decisionから独立する。
- ダンテ: 宝具前確定effectは比較除外可能。field mutationはhidden、天・地はsingle-choiceのまま。

単純確率スキルはネロ、テスラ、ロムルス、オジマンディアス、エレナ、百貌のハサン、
クレオパトラ、武則天、スペース・イシュタル、シトナイ、支援時カラミティ・ジェーンで、
skill OFF、skill ON＋成功、skill ON＋失敗、skill level依存rateをgolden化した。

| 対象 | 失敗時NP1平均 | 成功時NP1平均 |
| --- | ---: | ---: |
| ネロ | 37,471.765 | 53,959.575 |
| テスラ | 40,193.535 | 52,251.735 |
| ロムルス | 17,898.015 | 25,773.360 |
| オジマンディアス | 71,738.600 | 100,364.280 |
| エレナ | 26,296.635 | 39,445.195 |
| 百貌のハサン | 38,164.455 | 49,613.940 |
| クレオパトラ | 39,139.545 | 54,745.575 |
| 武則天 | 52,864.365 | 72,953.030 |
| スペース・イシュタル | 37,444.340 | 44,879.310 |
| シトナイ | 57,885.730 | 69,417.980 |
| 支援時カラミティ・ジェーン | 33,712.600 | 40,455.225 |

シトナイのrateはskill Lv1/9/10で800/960/1000、カラミティ・ジェーンは800として固定した。
Lv10でguaranteed表示へ変わってもeffect identityと比較除外操作は維持する。

production既定420件はすべてcalculatedで、digestは
`9d67d4d84b715e3f2eda8f5ed317496c1df69d175982f25c09e732280f7a3603`。
実装不足unsupported、inert control、applied unsupported、partial commitは0件である。
旧unsupported代表25件の単独選択digest
`f08bebaaeaa638ae8910cb74cf4f81f29d725e9fb710a6ee923ce5df4df3d17f`も維持した。

## Artifact

- `master.json`: 30,720,631 bytes
- SHA-256: `1ad7277e61677873a03a94c8693782afb686ba9f45d0fa40552c330ed03c608f`
- canonical raw occurrence対応: 13,322 / 13,322

## 品質ゲート

- format / lint / typecheck: 成功
- unit / integration / property / golden: 48 files、268 tests
- master validation: 6 files、55 tests
- evidence validation: 2 files、10 tests
- production build: 181 modules、main 480.86 kB（gzip 137.60 kB）、ranking worker 99.92 kB
- benchmark: 391.60 ops/s、mean 2.5536 ms
- Playwright Chromium / mobile Chromium: 54 passed、22 skipped
- desktop / 390px / 320px、keyboard、a11y、URL/share/save、選択状態VRT: 成功
- `git diff --check`: 成功

E3.9記録比でmainは+5.27 kB（gzip +1.15 kB）、workerは+0.78 kB。source activation、
effect inclusion、proc view model、scenario validationと表示metadataの追加による。計算benchmarkは
385.36から391.60 ops/sで、計測誤差内に収まる。

E4ランキング統合は本フェーズ中はblockedとし、実装していない。
