# E4.1 ActorForm plan / AttackProfile completion

## Outcome

Ranking entryを`Servant × TargetScope`から、form semanticsとattack NP variantを不可分にした
`Servant × AttackProfile`へ置換した。E5には着手していない。

処理経路は次へ一本化した。

```text
Scenario commands
  → action compiler
  → transactional reducer
  → AppliedPreparationAction[]
  → PreparedNoblePhantasmExecution
  → AttackProfile grouping
  → contribution projection
  → canonical damage executor / NP1–5 matrix cache
```

`AppliedPreparationAction`がchoice、transition、effect evidenceの唯一のauthorityである。
rankingはevidenceを再構築せず、自己バフなしprojectionもeffectの存在やprovenanceを変更しない。

## Canonical identities

`ActorFormProfile`の同値性はform-qualified skill slot/skill variant、passive variant、intrinsic
trait、base NP variant、reachable attack NP variantで決める。同じscope、card、NP IDだけを理由に
統合しない。

`AttackProfile` identityはservant lineage、terminal actor form profile、attack NP variantから作る。
scopeとcardはprofile自身の属性でありfilter条件である。

Scenario schema 31はinitial actor formとordered preparation commandを保存する。current form、resolved
NP、compiled operation、ranking entry identityは保存しない。

## Production inventory

| Item | Count |
|---|---:|
| master servant | 469 |
| reachable ranking servant | 422 |
| ActorForm node | 484 |
| ActorFormProfile | 484 |
| attack NP variant | 626 |
| non-attack NP variant | 101 |
| AttackProfile ranking entry | 433 |
| single / all | 180 / 253 |
| Arts / Buster / Quick | 144 / 182 / 107 |
| non-attack ranking entry | 0 |
| non-attack transform NP preparation対象 | 1（蒼崎青子） |
| non-attackからattackへ到達不能 | 47 |

maximumはform node 7、profile 7、legal initial form 7、transition edge 2、terminal plan 29である。
semantic同値化後もproduction node/profileは484/484で、誤統合・重複entryは0だった。合成fixtureで
presentationだけが異なるformの統合と、skill/trait/base NPが異なるformの非統合を固定した。

同一scopeに複数profileを持つ対象は次の6騎である。

- エミヤ: Arts全体 / Buster全体
- メリュジーヌ: 第3再臨Buster全体 / バトルキャラ13 Buster全体
- エリザベート・バートリー: 第1・第2再臨Buster単体 / 第3再臨Buster単体
- マシュ・キリエライト: バトルキャラ17 / 20のBuster全体
- スペース・イシュタル: Arts / Buster / Quick全体
- Ｕ－オルガマリー: 第1・第2再臨 / 第3再臨のBuster全体

同一NP IDを複数profileが所有する対象はメリュジーヌ、マシュ、Ｕ－オルガマリーである。

## Finite plan inventory

全productionでgenerated state 6,508、exact-state deduplicate後4,009、terminal plan 3,559、
exact duplicate 2,499、rejected action 0だった。最大semantic stateは56、最大preparation actionは4
（skill最大3回＋transform NP最大1回）である。

plan数分布は0件47騎、8件400騎、12件8騎、13件1騎、16件9騎、24/26/27/29件が各1騎だった。
全terminalはreducer成功、evidence完全、attack NP終端であり、invalid terminal、missing/orphan/unknown
fact、choice conflict、failureを無視したentryはいずれも0である。

## Ranking NP1–5 differences from the previous HEAD

値はneutral、自己バフあり、special/field inactiveの平均damage。`—`は旧entryが存在しなかったことを
表す。既存profileと完全同値の行は「同値」とした。

| AttackProfile | Previous | Canonical |
|---|---|---|
| EMIYA Arts all | — | 26,568.175 / 33,210.345 / 36,531.435 / 38,191.970 / 39,852.520 |
| EMIYA Buster all | 同値 | 26,568.175 / 33,210.345 / 36,531.435 / 38,191.970 / 39,852.520 |
| UDK all `204901` | 22,653.385 / 30,204.705 / 33,980.140 / 35,868.165 / 37,755.995 | 17,425.585 / 23,234.270 / 26,138.610 / 27,590.790 / 29,042.960 |
| Ptolemy single `205001` | — | 44,207.220 / 58,943.110 / 66,311.070 / 69,995.055 / 73,679.035 |
| Ptolemy all `205002` | 24,129.550 / 32,172.895 / 36,194.570 / 38,205.400 / 40,216.240 | 30,162.055 / 40,216.240 / 45,243.325 / 47,756.875 / 50,270.430 |
| Melusine single `304801` | — | 43,606.360 / 58,141.975 / 65,409.795 / 69,043.700 / 72,677.645 |
| Melusine all `304802`（2 profiles） | 31,204.410 / 41,606.050 / 46,806.865 / 49,407.275 / 52,007.690 | 同値 |
| Elizabeth first/second single `306201` | — | 49,035.785 / 65,381.215 / 73,553.930 / 77,640.290 / 81,726.650 |
| Elizabeth third single `306204` | 同値 | 53,493.625 / 71,325.010 / 80,240.690 / 84,698.540 / 89,156.390 |
| Francesca all `505701` | — | 21,141.640 / 28,157.350 / 31,665.210 / 33,419.140 / 35,173.060 |
| Mash form 17 / 20 all `800108` | 29,525.010 / 36,906.395 / 40,597.080 / 42,442.430 / 44,287.775 | 20,935.770 / 26,169.845 / 28,786.890 / 30,095.385 / 31,403.910 |
| Space Ishtar Arts / Buster all | — | 31,496.375 / 41,905.315 / 47,109.795 / 49,712.035 / 52,314.265 |
| Space Ishtar Quick all | 同値 | 33,578.155 / 44,681.035 / 50,232.475 / 53,008.195 / 55,783.920 |
| Kingprotea all `2301201` | 29,085.695 / 38,697.755 / 43,503.785 / 45,906.805 / 48,309.830 | 24,649.355 / 32,782.645 / 36,849.285 / 38,882.615 / 40,915.930 |
| Aoko transform all `2501501` | — | 22,708.935 / 30,278.745 / 34,063.660 / 35,956.115 / 37,848.560 |
| Dante all `2801001` | 19,165.975 / 25,554.800 / 28,749.210 / 30,346.410 / 31,943.620 | 23,957.595 / 31,943.620 / 35,936.640 / 37,933.155 / 39,929.650 |
| U Olga first/second all | — | 27,261.025 / 36,264.880 / 40,766.795 / 43,017.765 / 45,268.700 |
| U Olga third all | 同値 | 22,249.860 / 29,583.285 / 33,250.015 / 35,083.375 / 36,916.740 |

Mashの旧値はform 17/20のNPへform 12/13/18用skill `744450`（Buster 100%）を混成していた。
canonical planはform 17/20のslot 1 `2476450`（attack 30%）を解決するため、回帰ではなく
form-qualified skill修正である。

Kingproteaの旧値はOC1 10%と別value-set由来20%のNP-before効果を同時加算していた。canonical
variantはOC1の10%だけを適用する。[公開仕様](https://gamewith.jp/fgo/article/show/572415)も宝具前効果を
OC依存10–30%としている。

Danteは旧candidateが地獄choiceを列挙せず、skill 2の宝具威力30%を落としていた。finite plannerは
typed choice actionから地獄fieldとNP buffをatomicに適用する。[公開仕様](https://gamewith.jp/fgo/article/show/488623)でも
地獄choiceの宝具威力30%を確認した。

玉兎のcanonical値は日輪single 47,794.550 / 63,726.225 / 71,692.080 / 75,675.005 /
79,657.925、月下all 31,250.115 / 41,666.990 / 46,875.425 / 49,479.640 / 52,083.865を維持した。
BB Dubai attack variantも22,377.555 / 29,753.580 / 33,441.590 / 35,285.585 / 37,129.595で
不変だった。

## Cache and performance

詳細rankingでは3,744 matrix requestを1,479 distinct damage inputへ縮約し、2,265 hit、hit rate
60.50%だった。plan evidenceとpresentationはcacheせず、damage matrixだけを共有する。

| Gate | Baseline | Final | Change |
|---|---:|---:|---:|
| full Vitest | 80.82 s | 68.34 s | -15.4% |
| production ranking suite | 63.65 s | 54.86 s | -13.8% |
| all-entry generation | 9.94 s | 7.997 s | -19.5% |
| NP1–5 × 4 policy | 22.10 s | 19.603 s | -11.3% |
| kernel | 383.87 ops/s | 2,071.66 ops/s | +439.6% |
| ranking worker | 209.76 kB | 244.08 kB | +16.4% |
| main bundle | 534.27 kB / gzip 151.38 kB | 569.61 kB / gzip 160.03 kB | +6.6% / +5.7% |

runtime gateはいずれもbaseline比+10%以内である。worker増加はform graph、ordered command、profile
evidenceをworker内で共有するためで、候補ごとのmaster compileやNP-level再計算は増やしていない。

## Versions and validation

- Master schema 36
- Artifact `20260829.3`, SHA-256 `908c0116db68030530f06c8c948edefe359427a9658321fb7634b2581186a458`
- Engine `26.0.0`
- Scenario schema 31

format、ESLint、TypeScript、380 Vitest、master/evidence validation、production ranking、calculator
default 422件、calculator/ranking parity 433件、share/save/URL、Chromium E2E 63件、VRT、a11y、keyboard、
production build、benchmark、`git diff --check`を通過した。VRT差分はversion、433 profile entry、
scope/card/variant表示に限定され、desktop/390px/320pxで横overflowはない。
