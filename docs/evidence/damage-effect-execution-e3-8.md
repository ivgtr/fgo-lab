# Damage effect execution E3.8 completion report

- Date: 2026-08-26
- Base: `033d5da`
- Scope: 単発宝具ダメージ計算。E4ランキング統合は未着手。
- Master schema: 26
- Artifact: `2026-08-26-atlas-jp-calculator-v49`
- Engine: `14.0.0`

## 結果

production攻撃宝具420件はすべて既定scenarioで`calculated`となった。実装未対応は12騎から0騎、全user projection単独選択の実装未対応は14騎25 occurrenceから0騎0 occurrenceになった。`unknownDamageSemanticKeys`、`missingRequiredInputDescriptors`、`inertUserProjections`、`appliedUnsupportedOperations`、`partialCommittedFailedEffects`も0件である。

入力不足はeffect occurrenceへ結び付いたtyped `inputRequired`として返し、damage rowを生成しない。effectのoperation列とstate/input/evidenceはtransaction単位でcommitし、参照operation、linked state、quantityの途中失敗を部分適用しない。

## 解消したsemantic family

| family | canonical解決 |
|---|---|
| referenced skill | 参照skill artifactをbuild時に解決し、順序付きcanonical operationへ展開。欠落・循環・曖昧性はartifact生成失敗 |
| HP / Battle Point | 既存入力をowner付きquantityへ統合。HP 100%、BP 0を根拠ある初期値として使用 |
| turn / critical star / stack | 範囲、owner、default policy、consuming occurrenceを持つbattle-context inputとcondition/value expressionへ分離 |
| field / actor population | population、alive-only、source/other predicate、actor propertyをtyped count semanticsとして保持 |
| trait provenance | initial、active state、passive、ignore対象、unremovableをread policyで区別 |
| linked state | stable state identity、dependency、initial trait suppressionを同一effect transactionで実行 |
| partial trait | signed trait候補の論理式を保持し、先頭候補やtrait countへ単純化しない |
| non-damage | 後続conditionにもdamage inputにも作用しないと正規化時に確定したoperationだけを非火力として分離 |

raw Function、buff、parameter、script、targetの解釈はdata-pipelineに限定した。executor、application、webはcanonical IR以外から計算規則を復元しない。サーヴァントID、名称、skill名、labelによるruntime計算分岐は追加していない。

## Actor countの意図的なダメージ修正

ジョン・ラックランドと水着ハベトロットは、旧既定値0がcanonical対象集合から確定できるactorを除外していたため修正した。最低値はID別補正ではなく、population、source/other predicate、恒常trait、現在対象の`inBattle` propertyから導出する。

- ジョンは`〔王〕一致数`と`〔悪〕一致数`を別入力とし、本人を各1回数える。同一actorが別predicateへ一致する重複計上を明示する。既定`npDamageBuff=0.2`。
- 水着ハベトロットは`敵の合計数`とし、現在対象を含む最低1、最大3。既定`npDamageBuff=0.1`、3体時`0.3`。
- scenario明示値は追加分ではなく最終count。canonical最低値未満はclampせず`inputRequired`。
- share/saveで値が省略された場合は再計算時に最低値を再導出し、旧誤算を維持する分岐は持たない。

公開仕様とのmodifier差分は0である。ジョンは〔王〕と〔悪〕を別々に数える仕様、水着ハベトロットは生存中の敵数ごとに10%となる仕様を確認した。actor列挙時にself/otherのpredicate一致を加算する挙動も比較した。

- https://appmedia.jp/fategrandorder/79995691
- https://appmedia.jp/fategrandorder/80270005
- https://github.com/chaldea-center/chaldea/blob/main/lib/app/battle/models/buff.dart#L201-L280

## NP1〜5 golden

既定unsupportedだった12騎は、final damage input digest、適用operation、NP1〜5平均を`unsupportedConvergenceGolden.test.ts`へ固定した。

| servant | NP1 | NP2 | NP3 | NP4 | NP5 |
|---|---:|---:|---:|---:|---:|
| ジャック・ド・モレー | 31,998.575 | 42,664.930 | 47,998.095 | 50,664.690 | 53,331.280 |
| アン＆メアリー（Archer） | 41,063.075 | 54,750.935 | 61,594.870 | 65,016.840 | 68,438.805 |
| アシュヴァッターマン | 46,640.680 | 62,117.775 | 69,856.310 | 73,725.570 | 77,594.840 |
| アショカ王 | 34,888.580 | 46,459.940 | 52,245.615 | 55,138.445 | 58,031.310 |
| アン＆メアリー（Rider） | 59,020.730 | 73,776.035 | 81,153.690 | 84,842.520 | 88,531.345 |
| ビショーネ | 20,697.330 | 27,596.605 | 31,046.250 | 32,771.060 | 34,495.865 |
| 土方歳三 | 83,408.010 | 104,260.125 | 114,686.205 | 119,899.230 | 125,112.260 |
| ジョン・ラックランド | 31,826.970 | 42,436.130 | 47,740.715 | 50,393.000 | 53,045.290 |
| キングプロテア・オルタ | 64,172.380 | 85,563.345 | 96,258.835 | 101,606.570 | 106,954.255 |
| BBドバイ | 24,566.050 | 32,671.560 | 36,724.325 | 38,750.700 | 40,777.080 |
| 水着ハベトロット | 50,393.910 | 67,192.040 | 75,591.115 | 79,790.650 | 83,990.170 |
| エレシュキガル | 25,850.530 | 34,420.875 | 38,706.045 | 40,848.630 | 42,991.215 |

選択時unsupportedだった25 occurrenceも、NP1〜5、final input、適用operationを同じproduction goldenへ固定した。actor countの境界goldenではジョンのKing/Evil各1、各6、水着ハベトロットの敵1、3、最低値未満を個別に検証する。

## 非退行とUI

収束開始時点でcalculatedだった1,504 scenarioは固定fixtureから再計算し、digest `3a13bdfbc13c83e0279ee58311dd212537ed6c667a9d290f97be3916a9fea6ec`で不変を確認した。今回の12既定scenarioと25選択scenarioは別golden digestで管理する。ジョン／水着ハベトロット以外の既存calculatedケースに意図しないdamage差分はない。

通常サーヴァントの画面構成と操作順は変更していない。必要な対象だけ既存の戦闘状況領域へ汎用inputを表示する。ジョン、水着ハベトロット、ダンテ、ガレス、OR条件、share/saveをdesktop、390px、320pxで操作し、入力、button状態、damage row、fail-closed、traceの一致を確認した。VRT更新はartifact/engine version表記だけである。

## 品質ゲート

- format / lint: 成功
- typecheck: 成功（Node heap 8 GiB。既定4 GiBでは検査プロセスがOOM）
- unit / integration / production property-golden: 42 files、226 tests
- master validation: 6 files、38 tests
- evidence validation: 2 files、10 tests
- production build: 178 modules、main 466.93 kB（gzip 133.94 kB）、ranking worker 98.91 kB
- benchmark: 392.90 ops/s、mean 2.5452 ms
- Playwright Chromium: 47 passed、21 skipped。desktop、390px、320pxを含む
- `git diff --check`: 成功

E3.8の単発計算正本はimplementation unsupported 0へ到達した。E4ランキング統合へ進める状態だが、このフェーズでは統合変更を行っていない。
