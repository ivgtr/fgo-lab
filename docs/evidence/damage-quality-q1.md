---
title: "Damage quality Q1 checkpoint"
status: "Complete"
status_scope: "Q1 normalization／fail-closed移管の当時の完了記録"
historical_status: "complete"
date: "2026-08-25"
---

# Damage quality Q1 checkpoint

- Date: 2026-08-25
- Phase: Q1
- Status: complete
- Implementation commits: `1c4057f`, `d74d063`, `0213896`, `9664969`, `3f3a6ed`, `7892421`, `dd3578f`, `446c0c8`
- Published master: `2026-08-25-atlas-jp-calculator-v12`
- Master schema: 5

## 完了した置換

サーヴァント直下の`hasAttackNp`、`npCard`、`npTarget`、`npMultipliers`、`attackNpFunctionType`、`npEffects`、`npSpecialAttack`を削除した。代わりに宝具variantごとの`noblePhantasms`と、9種の判別可能な`NpDamageSpec`を唯一のmaster表現とした。旧フィールドや読替え用optional fieldは残していない。

各damage Functionは次を保持する。

- raw Function ID、raw Function type、raw JSON path
- 宝具variant ID、priority、card、対象範囲
- OC1〜5 × NP1〜5の`Rate`、`Value`とFunction固有値
- trait IDと解決名、対象trait列、rarity列、最大一致数
- `Value2`、`Correction`、Battle Point ID、HP比率用Target
- 追加trait、無効特性の扱い、死亡対象判定などrawに存在する追加flag

Function種別ごとの必須値が欠けた場合、masterを生成せずvalidation errorにする。欠損値を0へ変換しない。

## 全件対応

rawの攻撃宝具Function 627件は次のように分類した。

- 計算対象masterへ格納: 621件、617宝具variant
- `collectionNo`未付与の未実装サーヴァント: 2件
- `enemyCollectionDetail`の敵専用サーヴァント: 4件

除外6件もmasterの`normalization.attackFunctions.excluded`へFunction単位・理由付きで記録する。`sourceCount = includedCount + excluded.length`と、実際の格納件数が一致しなければmaster validationを失敗させる。

## Scenarioと結果契約

旧`CalcInput`と`CalculationSelection`は削除した。永続化境界は`CalculationScenario`の`resolved | manual` union、純粋計算境界は`DamageKernelInput`、UI編集状態は非永続の`CalculationEditorState`へ分離した。draft、履歴、共有はscenarioを保存し、master由来のATK、宝具倍率、集約済みbuffをresolved scenarioへ複製しない。

`CalculationResult`は`calculated | unsupported`の判別可能unionである。`unsupported`の`rows`は空tupleであり、ランキングから除外され、UIでも数値を表示しない。旧v1〜v3保存形式のmigrationは削除し、非互換データは現行形式へ読み替えない。

## 魔術礼装source

Atlas Academy JPの`nice_mystic_code.json`をnormalizer入力へ追加した。28着、84スキル、139 effectを、サーヴァントや概念礼装と同じ`MasterSkill` / `MasterEffect`へ正規化する。別の効果モデルは作っていない。

resolved scenarioは魔術礼装IDと選択スキル／レベルを保持する。resolverは共通のeffect解決経路を使用し、参照不能な魔術礼装・スキルを`unsupported`とする。

## Effect parameterのlossless化

旧`values: number[]`と`Value ?? Rate ?? 0`を削除した。各effectは次を保持する。

- `svals`〜`svals5`の5系列をrawキーのまま保持する`parameterSets`
- 概念礼装の通常／最大解放それぞれのparameter series
- Function scriptと`overWriteTvalsList`
- 条件、対象、buff type、card typeなど既存の構造化metadata

resolverはdamage値として`Value`が実在する場合だけ使用する。実値0と欠損を区別し、damage関連effectで`Value`が欠ければ`unsupported`とする。宝具前effectは`parameterSets[overcharge - 1][npLevel - 1]`、通常スキルは`parameterSets[0][skillLevel - 1]`を参照するため、OC軸とNPレベル軸を混同しない。

既知だが未解決のdamage関連buff typeはfail-closed registryへ分類した。カード種変更、クラス相性上書き、特性／フィールド変更、防御・damage cut貫通、未解決buff rate等が選択scenarioへ含まれる場合、`approximate`な数値を返さず`unsupported`とする。

## 検証

- `pnpm typecheck`: success
- `pnpm test`: 14 files / 98 tests passed
- `pnpm validate:master`: 2 files / 12 tests passed、artifact validation success
- `pnpm lint`: success
- `pnpm build`: success

追加した回帰テストは、OC×NPレベルの二軸参照、実値0と欠損の区別、`svals2`とFunction固有metadataの保持、未対応damage effectで数値行が空になることを検証する。

## Q1ゲート判断

Q1を完了とする。新旧schemaは併存せず、全攻撃宝具と現行damage effectは暗黙の0を使わず内部モデルへ格納される。現在のresolverで意味を確定していないeffectは数値なし`unsupported`へ分類される。

Q2では、このschemaを前提にkernelを「1宝具レベル・1乱数点」の純粋計算へ限定し、NP1〜5と乱数評価をResultEvaluatorへ分離する。対象・付与元・順序を含むeffect semanticsの完成はQ3で扱う。
