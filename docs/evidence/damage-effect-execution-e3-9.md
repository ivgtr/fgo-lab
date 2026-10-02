---
title: "Damage effect execution E3.9 completion report"
status: "Complete"
status_scope: "E3.9 HP threshold／特殊入力の当時の完了記録"
date: "2026-08-26"
---

# Damage effect execution E3.9 completion report

- Date: 2026-08-26
- Base: `1b8c260`
- Scope: 単発宝具ダメージ計算の特殊入力。E4ランキング統合は未着手。
- Scenario schema: 23
- Master schema: 29
- Artifact: `2026-08-26-atlas-jp-calculator-v53`
- Engine: `17.0.0`

## 結果

旧`battleContext.values: Record<string, number>`と、Webが全入力definitionを基本設定末尾へ
一括表示する経路を削除した。scenarioは`canonicalInputValues`へtyped integer valueだけを保存し、
applicationがmaster definition、runtimeで導出したminimum/default、明示値を一度だけ解決する。
executorはapplicationが検証済みのresolved valueだけを受け取る。

production 420攻撃宝具はすべて既定scenarioで`calculated`である。implementation unsupported、
unknown damage semantic key、inert user projection、applied unsupported operation、failed effectの
partial commitは0件を維持した。既存calculated 1,504 scenarioのfinal damage inputとNP1〜5 digest
`3a13bdfbc13c83e0279ee58311dd212537ed6c667a9d290f97be3916a9fea6ec`も不変である。

## Production input inventory

runtimeの既定420計算から13 unique inputを再計測した。damage modifierへ到達する12 inputを9騎へ
投影し、非火力のBattle Point mutationだけが消費するfriendship level 1 inputは通常UIへ出さない。

| canonical kind | UI control | runtime count | placement |
| --- | --- | ---: | --- |
| `fieldActorCount` | segmented | 1 | effect inline |
| `matchingActorCount` | segmented / stepper | 3 | effect inline |
| `effectStackCount` | stepper | 4 | effect inline |
| `currentTurn` | stepper | 2 | effect inline |
| `availableSkillCount` | segmented | 1 | effect inline |
| `criticalStars` | stepper、10 effectで共有 | 1 | effect group inline |
| `friendshipLevel` | controlなし | 1 | non-damageのためhidden |

対象はアショカ王、ビショーネ、茶々、キングプロテア、魔王信長、カーマ、ジョン・ラックランド、
キングプロテア・オルタ、水着ハベトロットの9騎である。segmented 3、stepper 9、重複control 0、
支援を設定していない既定scenarioでsupport inline input 0だった。HPとBattle Pointは宝具・攻撃全体の
quantityとして既存基本設定に残す。trait/field conditionはeffect toggle、field/linked state mutationは
自動導出・hiddenを維持する。

## 責務境界

- data-pipeline: raw parameterからkind、owner、domain、default policy、count predicateをcanonical化する。
- master artifact: `CanonicalInputDefinition`と`inputLinear` value expressionを保持する。
- calculation-application: default/明示値検証、effect association、control policy、scenario commandを所有する。
- battle-execution: `ResolvedCanonicalInputSet`だけを状態へ渡し、raw入力やUI placementを知らない。
- Web: `EffectInputViewModel`を汎用rendererで表示し、ID、名称、skill、labelから配置を判定しない。

E4は`resolveCanonicalInputValues`、`applyCanonicalInputCommand`、`calculateScenario`を再利用する。
ranking workerへdefault導出、domain検証、effect固有入力を複製しない。

## Fail-closedと共有

入力は追加量ではなく最終値である。既知keyの欠落、範囲外、step不一致、canonical minimum未満は
clampせずtyped `inputRequired`となり、damage rowを返さない。artifactに存在しないkeyは黙って
無視せず`invalidCanonicalInput`により`unsupported`となる。旧number mapはschemaで拒否し、
互換fallbackは設けない。URL、共有JSON、保存draftは同じscenario schemaをround-tripする。

resolved inputは計算traceへdefault/explicitの別と共に残し、結果カード・画像対象と計算内訳にも
表示する。

## Effect interactionとHP condition

applicationはtoggle、single choice、threshold seriesを`EffectControlViewModel`へ統一した。Habetrotの
critical star 10段階は一つの入力、一つのdecision、一つの合計表示となり、Danteを含む11 canonical
choice groupはsingle-choice操作で兄弟を解除する。crafted scenarioの競合はexecutorが引き続き拒否する。

raw inventoryはservant `HP_LOWER` 6件、`HP_HIGHER` 2件、craft essence `HP_LOWER` 1件である。
HP conditionは0〜1000の整数とcanonical target policyをbuild時に検証し、`attackerHpPermille`条件へ
正規化した。単独conditionは独立したautomatic effect、同一activationの複数modifierだけを
`quantityThresholdSeries`とする。operation ID、condition、Atlas evidence、outcomeはoccurrence単位で
保持し、UI合計へ置換しない。
production ratchetはcanonical化後の全9件を固定し、`HP_LOWER` 7件を`atMost`、`HP_HIGHER` 2件を
`atLeast`として検証する。seriesの比較方向が混在するartifactは生成しない。

## 代表UIとdamage

- ジョン: 宝具威力アップ2行へ〔王〕一致数・〔悪〕一致数を各stepperで配置。本人から最低1ずつを
  導出し、既定`npDamageBuff=0.2`。同一actorのpredicate別重複計上を説明する。
- 水着ハベトロット: 宝具威力アップへ敵の合計数1〜3をsegmented controlで配置。現在対象から
  最低1を導出し、既定`npDamageBuff=0.1`、3体時`0.3`。
- アーキタイプ：アース: 千年城fieldは表示せず、成立した最終火力effectだけを表示する。
- ダンテ: field mutationは表示せず、選択宝具cardと一致する火力effectと排他的な天・地decisionを
  single-choiceとして操作する。
- 雨の魔女トネリコ: 逆境のカリスマは一つのdecision、一つの「攻撃力アップ 合計」として表示する。
  HP1000/990/760/750/510/500/260/250/0で20/30/30/40/40/50/50/60/60%を適用し、5 operationの
  traceは独立している。OFF時は全memberが`notApplied`となる。
- 一夏の城: `interaction: null`のautomatic effectである。HP501以上は`npDamageBuff=0`、HP500以下は
  `0.3`となり、LB0/LB4で同じ境界をgolden化した。HP100%の旧常時30%は誤算として削除した。

意図的なdamage変更は承認済みのジョン、水着ハベトロット、雨の魔女トネリコ、一夏の城に限定した。
既存1,504 scenarioのHP条件差分はトネリコの旧個別decision 4件だけで、他1,500件はtest内differentialで
不変を確認した。一夏の城はLB0/LB4・HP1000/501/500/0の独立goldenへ固定した。

## 品質ゲート

- format / lint / typecheck: 成功
- unit / integration / property / golden: 47 files、256 tests
- master validation: 6 files、51 tests
- evidence validation: 2 files、10 tests
- production build: 181 modules、main 475.59 kB（gzip 136.45 kB）、ranking worker 99.14 kB
- benchmark: 385.36 ops/s、mean 2.5950 ms
- Playwright Chromium / mobile Chromium: 51 passed、21 skipped
- desktop / 390px / 320px、keyboard、a11y、share/save: 成功
- `git diff --check`: 成功

E3.9の前回記録比でmain bundleは+3.59 kB（gzip +0.90 kB）、workerは+0.20 kBである。
canonical HP condition、effect aggregation、single-choice view modelと回帰検証の追加に対応する。
