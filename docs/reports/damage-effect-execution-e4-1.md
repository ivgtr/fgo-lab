---
title: "Damage effect execution E4.1 NP variant completion evidence"
status: "Complete"
date: "2026-08-28"
---

# E4.1 canonical noble phantasm variant completion evidence

## Outcome

Atlas `tdTypeChange*` のsuffixをcard変更として扱う旧モデルを削除した。pipelineだけがsuffixを
`tdTypeChangeIDs`のindexとして解釈し、`{ actorFormId, noblePhantasmId }`をidentityとする完全なNP variantへ
解決する。attack variantはcard、target scope、damage function、NP倍率、NP前後effectを所有し、non-attack
variantはdamage operationを持てない。

Master schemaは34、artifactは`20260828.3`、engineは`25.0.0`。Scenarioの保存項目は変えていないためschemaは
30のままである。`cardTypeMutation`、`changeCardType`、suffixからcardを作るmapping、base NPへのfallbackは
production codeから削除した。E5には着手していない。

## Layer ownership and atomicity

- data-pipeline: Atlas index lookup、form/TDの厳密照合、variant group/base、attack/non-attack、canonical operation生成。
- schema/master-data: form-qualified ref、variant discriminated union、group/base/identity validation。
- calculation-application: choice/activation factからselectionを導出し、calculatorとrankingへ同じscenario経路を提供。
- battle-execution: form transition、variant selection、state trait mutationを一つの準備transactionとして検証・commit。
- web: canonical card/scope/nameを表示するだけで、Atlas語彙や名称から意味論を推測しない。

unknown/missing variant、form不一致、複数selection、partial activation、non-attack damage、variant familyの混成は
damage operation前にscenario全体をfail-closedする。scenarioにはvariant、actor form、compiled operation、ranking
entry identityを保存しない。

## Production inventory

- servant: 469
- actor form: 471
- NP variant group: 687
- form-qualified NP variant: 696（attack 618、non-attack 78）
- 別actor formを参照するvariant: 2
  - フランソワ・プレラーティ: `505700:505701` attack
  - フローラ: `1002100:1002101` Quick non-attack
- ranking対象servant: 420
- `Servant × AttackTargetScope` entry: 422（single 177、all 245）
- ranking entry distinct servant ID: 420
- single-only: 175、all-only: 243、ranking上のdual-scope: 2
- entry式: `175 + 243 + 2 × 2 = 422`
- non-attack ranking entry: 0
- unknown variant / partial commit / mixed variant: 0
- calculator default / rankingのimplementation unsupported、意図しないinputRequired: 0
- calculator/ranking parity差分: 0

旧12 operationのdigestは
`d9d8a55f897792568167a02c9054d442eda80e492997c35dfb4d76628805fc0a`。全件が
`selectNoblePhantasmVariant`へ移行し、フローラだけ同じactivationに汎用`transformActorForm`を併記した。

| servant | canonical selection |
| --- | --- |
| エミヤ | `200100:200197` Arts all / `200100:200102` Buster all |
| UDK－バーゲスト | `204900:204998` Arts single |
| フローラ | form `1002100` + `1002100:1002101` Quick non-attack |
| スペース・イシュタル | `1100900:1100901` Arts / `1100900:1100997` Buster / `1100900:1100998` Quick（all） |
| BBドバイ | `2300600:2300601` Arts all attack / `2300600:2300698` Arts non-attack |
| 玉兎 | `2301100:2301198` Arts all / `2301100:2301101` Arts single（choice + passive） |

artifact coverageでは、form-qualifiedに収録されたフランチェスカformのattack sourceを旧「collectionNoなし」
除外リストにも数える二重計上を解消した。source 627 = included 622 + excluded 5で一意に一致する。

## Damage corrections

値は標準ranking policy（自然上限、Fou1000、skill Lv10、OC1、自己buffあり、proc成功、特攻inactive）の
canonical executor平均値である。

| servant / variant | NP1 | NP2 | NP3 | NP4 | NP5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 玉兎 旧混成 | 73,070.790 | 97,427.870 | 109,606.420 | 115,695.685 | 121,784.975 |
| 玉兎 日輪 `2301101` single Arts | 47,794.550 | 63,726.225 | 71,692.080 | 75,675.005 | 79,657.925 |
| 玉兎 月下 `2301198` all Arts | 31,250.115 | 41,666.990 | 46,875.425 | 49,479.640 | 52,083.865 |
| UDK 旧混成 / canonical all `204901` | 22,653.385 | 30,204.705 | 33,980.140 | 35,868.165 | 37,755.995 |
| UDK canonical single `204998` | 45,307.295 | 60,409.895 | 67,961.140 | 71,736.845 | 75,512.490 |
| Space Ishtar 旧混成 | 39,303.080 | 52,314.265 | 58,819.870 | 62,072.665 | 65,325.465 |
| Space Ishtar Arts `1100901` | 31,496.375 | 41,905.315 | 47,109.795 | 49,712.035 | 52,314.265 |
| Space Ishtar Buster `1100997` | 31,496.375 | 41,905.315 | 47,109.795 | 49,712.035 | 52,314.265 |
| Space Ishtar Quick `1100998`（採用） | 33,578.155 | 44,681.035 | 50,232.475 | 53,008.195 | 55,783.920 |
| BBドバイ 旧混成 | 23,958.135 | 31,861.010 | 35,812.450 | 37,788.170 | 39,763.890 |
| BBドバイ attack `2300601` | 22,377.555 | 29,753.580 | 33,441.590 | 35,285.585 | 37,129.595 |

Space Ishtarの事前監査投影`28,026.710`はQuick procを除いた値だった。既存の共通ranking policyは単純procを
successとして扱い、skill 3のQuick 80% + 20%が成立するため、canonical inputを再照合した上で上表をgoldenとした。
servant固有補正はない。エミヤはArts/Busterの完全variantと対応card buffを選択してもdamage列が同値であり、
identityだけが修正された。承認済み4騎以外の既存calculated NP1-5差分は0件だった。

## Ranking entries and positions

同じscope内だけでdamage、外部仮定数、activation fact数、stable variant keyの順に候補を選ぶ。通常表示は
single/allをdamage順に混在させ、filterは計算済み422 entryをpartitionするだけで再計算しない。

ranking上で両scope entryを持つservantと採用variant:

| servant | single | all |
| --- | --- | --- |
| UDK－バーゲスト | `204900:204998` | `204900:204901` |
| 玉兎 | `2301100:2301101` | `2301100:2301198` |

master inventory上ではプトレマイオスとメリュジーヌもsingle/all両方のattack variantを持つ。ただし今回の
canonical masterには対応するselection operationまたはform transitionがなく、通常操作からactivation可能なのは
baseのall variant（プトレマイオス`205000:205002`、メリュジーヌ`304800:304802`）だけである。このため両者は
all-only entryであり、未選択variantをranking専用に有効化していない。calculator defaultも同じbase variantで
calculatedとなる。プトレマイオスはNP1-5平均`24,129.550 / 32,172.895 / 36,194.570 / 38,205.400 /
40,216.240`、混在270位・all 105位。メリュジーヌは`31,204.410 / 41,606.050 / 46,806.865 /
49,407.275 / 52,007.690`、混在167位・all 25位で、いずれもranking detailをcalculatorで再実行したinput/resultが
一致した。entry欠落やdamage・順位の修正は発生していない。

NP1混在順位の修正は、玉兎 旧4位 → single 41位 / all 166位、UDK 旧287位 → single 54位 /
all 288位、Space Ishtar 旧88位 → all 143位、BBドバイ 旧271位 → all 293位。scope内では玉兎
single 40位 / all 24位、UDK single 53位 / all 121位、Space Ishtar all 11位、BBドバイ all 126位。

single上位3件はジャンヌ・ダルク〔オルタ〕77,801.205、メルトリリス74,701.015、
クー・フーリン〔オルタ〕74,212.830。all上位3件はアルトリア・ペンドラゴン49,304.900、
アビゲイル・ウィリアムズ〔夏〕38,170.510、イスカンダル37,569.630。single filterへのall混入、
all filterへのsingle混入はいずれも0件である。

## Performance and size

| gate | baseline | final | delta |
| --- | ---: | ---: | ---: |
| focused canonical Vitest | 1.84s / 65 tests | 1.80s / 43 selected tests | suite composition changed |
| full Vitest | 77.57s | 80.79s / 395 tests | +4.2% |
| production ranking suite | 58.53s | 63.65s | +8.7% |
| all entry generation | 9.80s / 420 servants | 9.94s / 420 servants, 422 entries | +1.4% |
| NP1-5 × 4 policy matrix | 20.36s | 22.10s | +8.5% |
| kernel | 398.03 ops/s | median 383.87 ops/s, mean 2.6050ms | -3.6% |
| ranking worker | 209.76kB | 219.51kB | +4.6% |
| main JS | 534.27kB / gzip 151.38kB | 542.13kB / gzip 153.24kB | +1.5% / +1.2% |

kernelは336.97、394.45、383.87 ops/sの3回を測定し、初回outlierを含む中央値で判定した。calc-core自体の変更は
ない。warm production profileはmaster read 81ms、schema parse 1,208ms、execution plan compile 2,106ms、
variant candidate生成203ms、candidate execution 1,883ms、NP1-5 matrix 3,928ms、digest/serialization 13ms。
生成候補は440で、scopeごとに420 servantsを再compileしていない。
E4.1以後のproduction ranking suite性能baselineは63.65秒、+10%上限は70.02秒とする。

## Validation and VRT

- format、ESLint、TypeScript、master/evidence validation、`git diff --check`: success
- full Vitest: 74 files / 395 tests passed
- Playwright Chromium + mobile Chromium: 63 passed / 31 project-specific skipped
- a11y、keyboard、share/save/URL round-trip、ranking→calculator handoff: success
- production build、benchmark、bundle measurement: success

VRTはDB version、422 entry、正しい順位、scope/variant/card evidenceだけを更新した。calculatorの3 baselineはDB
version文字列だけの差分で、配置・操作・密度差分はない。rankingはdesktop、390px、320pxを画像確認し、横overflow
0、同時展開1件、filter領域の増加なしを維持した。
