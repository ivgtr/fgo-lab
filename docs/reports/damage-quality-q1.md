# Damage quality Q1 checkpoint

- Date: 2026-08-25
- Phase: Q1
- Status: in progress
- Implementation commit: `1c4057f`
- Result contract commit: `d74d063`
- Published master: `2026-08-25-atlas-jp-calculator-v10`
- Master schema: 4

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

## 検証

- `pnpm typecheck`: success
- `pnpm test`: 14 files / 94 tests passed
- `pnpm validate:master`: 2 files / 11 tests passed、artifact validation success
- `pnpm format:check`: success
- `pnpm lint`: success
- `pnpm build`: success

## Q1で残る作業

- `CalculationResult`は`calculated | unsupported`のdiscriminated unionへ置換済み。`unsupported`の`rows`は空tupleであり、rankingとUIも数値として扱わない。
- `schemaVersion`を4、`engineVersion`を2.0.0へ更新済み。旧v1〜v3保存形式のmigrationは削除し、不一致時はuser storeをresetする。
- `CalculationScenario`のdiscriminated unionへ入力schemaを置換する。
- 旧`CalcInput`とそれを含むdraft・history・share保存形式を削除する。
- 魔術礼装raw sourceと内部master modelを追加する。
- damage関連effectの値・条件・対象・タイミングをlosslessに正規化し、未知・欠損を分類する。

これらが完了するまでQ1ゲートは承認しない。
