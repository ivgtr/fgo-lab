---
title: "E4.1.2 ranking condition provenance completion"
status: "Superseded by E4.1.3 activation witness closure"
date: "2026-08-28"
---

# E4.1.2 ranking condition provenance completion

> Review correction: field／recipient provenanceの修正は維持するが、choice、operation trigger、source-owned quantityのactivation witnessが未実装だった。choice由来のdamage差分を完成値として扱わず、ADR 021の再計測結果で置換する。

## Outcome and removed path

ランキングがUI向け`conditionAllowsEffectLocalDecision()`を使ってincluded effectの複合conditionを
`assumeSatisfied`へ変換する経路を削除した。inclusionはterminal effectを候補に含めるだけであり、recipient、
attacker trait、field、target、proc、quantityはcanonical stateと明示scenario factからsingle evaluatorが評価する。

`partyWide`は表示上の寄与範囲でありrecipient eligibilityではない。本人へ適用可能な効果は主火力へ含めるが、
本人がrecipient conditionを満たさない効果は`conditionNotMet`となる。area contributionも、適用済みparty-wideだけを
除いた同一worldの反実仮想差分である。

executor全体をclosed-world化する案は通常calculatorの明示trait decisionと競合するため採用しなかった。
ランキングだけが参照するattacker traitをapplication層でnegative canonical witnessとしてscenarioへmaterializeし、
ordered mutationは同じstate上で後からtrueへ変更できる。これによりcalculatorとrankingの条件所有を混ぜない。

## Former assumption inventory

旧経路の73 occurrenceをcanonical fact provenanceで分類した。複合conditionは複数分類へ入るため合計は73を超え得る。

| provenance | occurrence |
|---|---:|
| intrinsic | 42 |
| derivedまたはexternal field | 26 |
| external scenario fact | 12 |
| target | 5 |
| proc／quantity | 2 |

現在、ranking scenarioが生成する`conditionSatisfaction: assumeSatisfied`は0件である。

field条件は24騎26 occurrenceである。

- ネロ・クラウディウス `100500:3370:0`
- ガウェイン `100700:959:0`
- バーゲスト `105000:959:0`
- ガレス `105400:9148:0`
- 魔王信長 `1100700:7905:0`
- キングプロテア・オルタ `1102300:23580:0`
- 源為朝 `204600:8875:0`
- アーキタイプ：アース `2300500:8988:0`
- ワンジナ `2501300:21182:0`
- ファンタズムーン `2800900:22430:0`
- ダンテ・アリギエーリ `2801000:22552:0`
- ドブルイニャ・ニキチッチ `305500:7616:0`
- モードレッド `402400:9158:0`
- ネモ `403700:6010:0`、`403700:6013:0`、`403700:6022:0`
- カイニス `404500:7616:0`
- リリス `405900:23569:0`
- 張角 `505100:8692:0`
- 久遠寺有珠 `505500:21680:0`
- ビショーネ `506000:23542:0`
- ファントム・オブ・ジ・オペラ `601300:22390:0`
- 耀星のハサン `605000:21381:0`
- 織田信長 `702900:1622:0`
- マルタ `900400:984:0`
- スカサハ＝スカディ `901400:9158:0`

## Field policy

- `inactive`（既定）: `ranking:field:*` assertionは0件。自身の先行operationが生成したfieldはordered stateから成立する。
- `active`: damage-relevant conditionが参照するfieldだけを有限列挙し、canonical排他groupの矛盾を除外する。
  各候補を同じexecutorへ通し、最大average、少ないexternal fact、stable scenario keyの順で採用する。
- 探索上限は`ranking_field_candidate_limit`でfail-closedとし、「fieldなし」へ読み替えない。

UI、URL、worker matrix keyは`field: inactive | active`を同じ正本として持つ。headerには一つのcompact selectだけを追加し、
個別field editorは設けない。詳細には採用したpositive field witnessだけを表示する。

## Focused damage corrections

旧`assumeSatisfied` policyを同じproduction master上で再現した標準NP1との比較では42騎が変化した。
これは旧binary artifactとの互換値ではなく、削除したcondition policyだけを再現した差分である。

| servant ID | before | after |
|---|---:|---:|
| 100500 | 31,130.300 | 26,979.550 |
| 100700 | 28,047.585 | 21,574.930 |
| 101000 | 63,138.515 | 42,092.175 |
| 105000 | 22,426.850 | 19,104.275 |
| 106400 | 27,767.290 | 25,783.880 |
| 204600 | 22,495.340 | 19,848.765 |
| 305500 | 39,145.700 | 33,553.385 |
| 305600 | 17,119.090 | 14,265.825 |
| 402400 | 24,719.575 | 20,916.490 |
| 403600 | 21,154.585 | 15,278.175 |
| 403700 | 70,660.610 | 44,551.025 |
| 404500 | 47,697.160 | 40,915.325 |
| 405300 | 22,157.570 | 19,017.145 |
| 405900 | 27,380.320 | 22,846.020 |
| 505500 | 20,824.875 | 18,048.160 |
| 506000 | 16,934.080 | 14,676.135 |
| 601300 | 11,894.095 | 9,911.670 |
| 603800 | 23,557.645 | 15,704.930 |
| 604700 | 26,387.595 | 22,639.365 |
| 605000 | 20,208.390 | 16,840.235 |
| 605100 | 53,621.055 | 43,567.005 |
| 702200 | 50,977.500 | 40,781.880 |
| 702900 | 51,138.875 | 42,615.640 |
| 705300 | 36,795.270 | 26,829.750 |
| 900400 | 44,801.810 | 38,401.475 |
| 901300 | 38,001.670 | 33,658.550 |
| 901400 | 31,624.235 | 28,771.985 |
| 1000900 | 30,505.210 | 26,497.825 |
| 1100300 | 90,768.145 | 77,801.205 |
| 1100900 | 21,087.410 | 31,496.375 |
| 1101900 | 32,879.940 | 41,100.055 |
| 1102300 | 55,353.380 | 46,127.735 |
| 2300600 | 26,329.000 | 22,377.555 |
| 2300700 | 14,596.530 | 13,269.535 |
| 2300800 | 14,596.530 | 13,269.535 |
| 2500900 | 24,650.190 | 19,720.050 |
| 2501100 | 35,622.360 | 21,921.270 |
| 2501300 | 55,867.195 | 47,272.165 |
| 2800400 | 22,319.370 | 18,885.550 |
| 2800600 | 22,587.700 | 19,360.845 |
| 2800900 | 60,174.105 | 52,150.835 |
| 2801000 | 23,957.595 | 19,165.975 |

増加した2件も有利なconditionを追加した結果ではない。旧policyが複合condition全体をassumeしたことで生じた
constraint conflict／候補選択の歪みがなくなり、通常評価で到達可能なexecutionへ収束した結果である。

平均damageのNP1〜5は次のとおり。

| target | before | after |
|---|---|---|
| ジャンヌ・ダルク〔オルタ〕 | 90,768.145 / 113,460.300 / 124,806.385 / 130,479.430 / 136,152.465 | 77,801.205 / 97,251.635 / 106,976.830 / 111,839.435 / 116,702.045 |
| ネモ（fieldなし） | 70,660.610 / 94,147.610 / 105,891.125 / 111,762.865 / 117,634.605 | 44,551.025 / 59,334.870 / 66,726.790 / 70,422.745 / 74,118.715 |

ジャンヌ〔オルタ〕は`attackBuff=0.2`、`cardBuff=0.5`で、通常の味方全体+20%だけを適用する。
〔竜〕限定+20%は本人のmaster traitで不成立となり、`conditionNotMet` evidenceを持つ。

ネモのfieldなしは`attackBuff=0.15`、`cardBuff=0.2`、`npDamageBuff=0.25`である。field成立ではstable witnessとして
`fieldImaginarySpace`を一つ採用し、`0.35 / 0.4 / 0.45`、NP1〜5平均はbefore欄と同値になる。
ガレスはexternal assertion 0のまま先行hidden mutationが`fieldSunlight`を生成し、後続効果が適用される。

## Production ratchets

- 全420攻撃宝具、implementation unsupported 0、inputRequired 0
- external field assertion: inactive 0
- field condition witnessなしのapplied effect: 0
- canonical exclusive field conflict: 0
- 特攻inactiveのconditional power／NP special適用: 0
- neutral policyの`classAffinity !== 1`: 0
- `partyOther`主順位適用: 0
- recipient通常評価後のarea contribution対象: 172騎
- 主順位へ適用された一意な`partyWide` projection: 230
- special attack active: 189騎
- 最大world candidate: 16、最大scenario calculation: 17
- partial commit、stale mutation、inert control: 0

field inactiveのclass／special／NP1〜5 digestとfield activeのNP1〜5 digestは
`rankingProduction.test.ts`へ64桁で固定した。calculator handoffは採用scenarioを渡し、input、rows、effect、conditionを
同じapplication facadeで再計算する。

## UI, versions, and performance

- 1440px: closed row 68px、filter 126.89px、horizontal overflow 0
- 390px: closed row 75.59px、filter 126.89px、horizontal overflow 0
- 320px: closed row 73.59px、filter 126.89px、horizontal overflow 0
- scenario schema 27、engine 21.0.0、master artifact 20260828.2、manifest schema 33
- main JS 522.47 kB（gzip 148.37 kB）、ranking worker 197.22 kB、CSS 44.93 kB（gzip 9.29 kB）
- damage kernel 386.40 ops/s、mean 2.5880 ms

engine executorの最終契約は変えていないためengine versionは21.0.0を維持した。増加したbundleは有限field world生成、
ranking actor witness、URL／worker policy、詳細evidenceによる。calculatorのdesktop／390px／320px VRTは更新していない。

## Validation

- format、ESLint、TypeScript: success
- unit／integration／property／golden: 66 files、345 tests
- master validation: 7 files、68 tests
- evidence validation: 2 files、10 tests
- production build: success
- Playwright Chromium／mobile Chromium／VRT／a11y: 62 passed、30 project-specific skipped
- `git diff --check`: success

E5には着手していない。
