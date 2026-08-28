---
title: "E4.1.3 ranking activation witness closure"
status: "Complete"
date: "2026-08-28"
---

# E4.1.3 ranking activation witness closure

## Outcome

E4.1.2で削除したwhole-condition `assumeSatisfied`は復活させず、source activation内で決まる
`choice`、`operationTrigger`、`sourceQuantity`をtyped activation witnessとしてscenarioと
`BattleState`へ追加した。effect inclusionはoperationを候補にするだけであり、condition evaluatorは
typed witness、通常quantity、TargetContext、world／derived stateを一つの経路で評価する。

ランキングはchoice groupごとのcandidate直積を有限列挙し、各worldをcalculatorと同じexecutorへ
通す。採用順はdamage最大、外部field fact最少、activation fact最少、canonical scenario keyの安定順で
ある。同一candidateに属する複数operationは同じchoice selectionを読み、異なるcandidateの併存は
schemaとconstraint evaluatorの双方で拒否する。

## Removed path

- `choice`／`operationTrigger`／`sourceQuantity`を常にunknownとして落とすcondition経路
- linked source activationを`conditionSatisfaction === assumeSatisfied`へ結合する経路
- rankingで同一choice groupの配列末尾をeffect inclusionだけへ反映する処理
- card mutationをtyped choice selectionなしで選ぶ処理

## Production inventory

canonical masterでdamageへ到達可能なactivation-local effectは39 occurrenceである。

| semantic | canonical occurrence | 標準rankingで採用したwitness |
| --- | ---: | ---: |
| choice | 34 | 12 |
| operation trigger | 5 | 3 |
| source quantity | 5 | 2 |

複数semanticを同時に持つeffectがあるため、semantic列の合計はeffect総数と一致しない。最終scenarioで
activation witnessを持つ攻撃宝具は12騎、damage-relevantなincluded effectの`unresolved`は0件である。
projection inventoryはchoice 30、operation trigger 3、source quantity 3で固定した。

E4.1.2で「assumeSatisfied 73件」と数えていた集合は、provenanceが重複するため内訳合計とは
一致しない（intrinsic 42、field 26、external scenario fact 12、target 5、proc／quantity 2）。
全candidateを落とさず再監査した現在のselectable inventoryは87 controlで、そのうちactivation-localは
20 controlである。canonical master側ではdamage-reachable effect 39 occurrenceを別ratchetとして固定した。
この区別により、world factの仮定とactivation内で確定するwitnessを再び混同しない。

field inventoryは24騎・27 occurrenceである。E4.1.2の26件に対し、排他candidateを末尾一件へ
潰していた監査を廃止したことでダンテの`2801000:22548:0`も証拠集合へ復帰した。標準fieldなしでは
external field assertionは0件であり、自身の先行mutationが生成したfieldだけが通常のoperation順で成立する。

## Standard-ranking corrections

HEADのE4.1.2標準条件と比較して変化した行は次の12騎だけであり、すべてtyped activation witnessの
追加で説明できる。エミヤはcard choiceの証跡だけが変わりdamageは同値である。

| servant | before NP1 average | after NP1 average | restored semantic |
| --- | ---: | ---: | --- |
| エリザベート・バートリー〔ブレイブ〕 | 42,092.175 | 63,138.515 | choice |
| エミヤ | 26,568.175 | 26,568.175 | choice／card mutation |
| UDK-バーゲスト | 19,632.875 | 22,653.385 | operation trigger／choice |
| ヴァン・ゴッホ〔マイナー〕 | 14,265.825 | 17,119.090 | choice |
| シャルロット・コルデー | 15,704.930 | 23,557.645 | choice |
| 紅閻魔 | 26,829.750 | 36,795.270 | choice／source quantity |
| スペース・イシュタル | 31,496.375 | 39,303.080 | choice／card mutation |
| BBドバイ | 22,377.555 | 23,958.135 | choice／card mutation |
| 玉兎 | 50,000.485 | 73,070.790 | choice／card mutation／derived state |
| キングプロテア | 24,649.355 | 29,085.695 | operation trigger |
| ククルカン | 21,921.270 | 35,622.360 | 2 choice groups |
| テノチティトラン | 20,289.735 | 28,656.495 | operation trigger |

pre-existing 1,504 calculated scenarioのinput／NP1〜5 digestと、通常calculator 420攻撃宝具の既定digestは
不変である。rankingのNP1〜5×class affinity×special attack matrixは、上記12行の意図的修正を反映した
新digestへ更新した。

- 1,504 scenario digest: `e754617b09edeacf9661fb95d7b814bfd178e07c1827d0df16224cd02ce33b77`
- calculator default 420 digest: `a469ff71f5c4a6171a7e4d20dcb4f8f77475a38fbb08f236e4e691214e94e5e9`
- standard ranking NP1 digest: `e406c6db9014a60d73517fdcd77edef5581a3c7e49f73b2751514dc6fab01afb`

ジャンヌ〔オルタ〕とネモのE4.1.2修正も不変である。

| case | NP1–5 average |
| --- | --- |
| ジャンヌ〔オルタ〕 | 77,801.205 / 97,251.635 / 106,976.830 / 111,839.435 / 116,702.045 |
| ネモ fieldなし | 44,551.025 / 59,334.870 / 66,726.790 / 70,422.745 / 74,118.715 |
| ネモ field成立 | 70,660.610 / 94,147.610 / 105,891.125 / 111,762.865 / 117,634.605 |

## Quality gates

- format、ESLint、TypeScript: success
- unit／integration／property／golden: 68 files, 358 tests（最終追加分を含む）
- master validation: 7 files, 68 tests; artifact validation valid
- evidence validation: 2 files, 10 tests
- production build: success; JS 526.82 kB (gzip 149.59 kB), worker 201.85 kB,
  CSS 44.93 kB (gzip 9.29 kB)
- Playwright Chromium／mobile Chromium／a11y／VRT: 62 passed, 30 skipped
- benchmark: 340.61 ops/s, mean 2.9359 ms
- `git diff --check`: success

calculator VRTのlayout／visible effect表現は不変で、更新差分はfooterに表示するEngine
`21.0.0`→`22.0.0`の字形10–12 pixelだけである。ranking desktop VRTは上記12騎の正しい値・順位を
反映して更新した。390px／320pxのdensity、横overflow、操作構造は既存ratchetを維持した。

## Versions

- scenario schema: 28
- battle engine: 22.0.0
- master schema／artifact: 変更なし（raw activation semanticsは既にcanonical masterに存在）

E5の実装には着手していない。activation-local conditionが未解決のままcalculatedへ到達する経路は
productionで0件となり、本P1を理由とするE5 blockは解除できる。
