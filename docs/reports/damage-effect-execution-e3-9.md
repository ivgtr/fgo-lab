# Damage effect execution E3.9 completion report

- Date: 2026-08-26
- Base: `1b8c260`
- Scope: 単発宝具ダメージ計算の特殊入力。E4ランキング統合は未着手。
- Scenario schema: 23
- Master schema: 27
- Artifact: `2026-08-26-atlas-jp-calculator-v50`
- Engine: `15.0.0`

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

## 代表UIとdamage

- ジョン: 宝具威力アップ2行へ〔王〕一致数・〔悪〕一致数を各stepperで配置。本人から最低1ずつを
  導出し、既定`npDamageBuff=0.2`。同一actorのpredicate別重複計上を説明する。
- 水着ハベトロット: 宝具威力アップへ敵の合計数1〜3をsegmented controlで配置。現在対象から
  最低1を導出し、既定`npDamageBuff=0.1`、3体時`0.3`。
- アーキタイプ：アース: 千年城fieldは表示せず、成立した最終火力effectだけを表示する。
- ダンテ: field mutationは表示せず、選択宝具cardと一致する火力effectと排他的な天・地decisionを
  従来どおり操作する。

このフェーズでdamage値は変更していない。承認済みのジョン／水着ハベトロット修正値を含む
canonical actor count golden、Dante排他、アーキタイプ：アース、水着武則天、hidden mutation、
一般OR特攻の回帰を維持した。

## 品質ゲート

- format / lint / typecheck: 成功
- unit / integration / property / golden: 45 files、238 tests
- master validation: 6 files、38 tests
- evidence validation: 2 files、10 tests
- production build: 180 modules、main 472.00 kB（gzip 135.55 kB）、ranking worker 98.94 kB
- benchmark: 413.70 ops/s、mean 2.4172 ms
- Playwright Chromium / mobile Chromium: 47 passed、21 skipped
- desktop / 390px / 320px、keyboard、a11y、share/save: 成功
- `git diff --check`: 成功

buildの既定4 GiB heapではTypeScript検査がOOMとなったため、typecheckとproduction buildは
`NODE_OPTIONS=--max-old-space-size=8192`で完走した。E3.8比でmain bundleは+5.07 kB
（gzip +1.61 kB）、workerは+0.03 kBで、application view modelと汎用inline rendererの追加に対応する。
