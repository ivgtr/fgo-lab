# Damage quality Q2 checkpoint

- Date: 2026-08-25
- Phase: Q2
- Status: complete
- Implementation commits: `6d40c5c`, `515ec2b`, `cda237a`, `9fc38f8`, `2436d45`
- Schema version: 5
- Engine version: 3.0.0

## 完了した置換

計算境界を次の三層へ分離した。

1. `calculateDamagePoint(DamageKernelInput, randomPermille)`は、1宝具Lv・1乱数点だけを計算する純粋kernelである。
2. `evaluateDamageRows()`は、5個のkernel inputを乱数900〜1099の200点で評価し、NP1〜5の最小・平均・最大を返す。
3. `calculateDamageResolution()`は、fail-closed判定と版付き`CalculationResult`構築を担当し、単発計算とranking workerから共用される。

`DamageKernelInput`からサーヴァントID、対象状態、effect選択、master由来の構造を除き、計算に必要な一階層の数値とcard、`ignoreDefense`だけを許可した。schemaはstrictであり、追加フィールドを拒否する。

旧`calculateNpDamage()`、旧`damageAtRandom()`、Function名をprecisionへ読み替える`classifyAttackNpFunction()`と`attackNpFunction.ts`は削除した。旧Function文字列と新しい判別可能handler結果は併存していない。

## 演算境界

binary32境界を`f32`、`f32Add`、`f32Mul`、`f32Div`として名前付きにし、clampと最終floorを`clamp`、`floorDamage`へ分離した。kernel内の倍率はpermilleで受け取り、各乗算境界でbinary32へ丸める。乱数は整数900〜1099以外を拒否し、最終ダメージは0未満へ落とさない。

unit testは加算、乗算、除算、0除算拒否、clamp、無効範囲拒否、floor、0 clamp、乱数範囲、strict kernel schemaを個別に固定する。

## NP damage handler

masterの9種`NpDamageSpec`をサーヴァントIDに依存せず解決する。

- standard
- defensePiercing
- trait
- traitCount
- stateTrait
- hpRatioLow
- battlePointPhase
- targetRarity
- traitExpression

解決結果は、NP1〜5の通常倍率、NP1〜5の特攻倍率、防御無視flagを一度だけ`DamageResolutionInput`へ反映する。効果resolverに残っていたtrait特攻の旧倍率適用を削除したため、特攻倍率の二重適用経路はない。

攻撃者HP、対象rarity、Battle Point phase、OC系列が欠ける場合は、理由付き`unsupported`として数値行を返さない。通常traitと状態traitは保存時から別配列で保持し、判定時にも混同しない。trait count用配列では重複をstack数として維持する。

OCやFunction固有条件は計算直前に再解決する。UIが保持した古い倍率をそのまま計算する経路はない。manual modeだけは、明示入力済みの最終値をmasterから再解決しない。

## Golden evidence

`packages/test-fixtures/golden/np-damage-v1.json`は次を保持する。

- kernel入力一式
- NP倍率100%〜500%
- 乱数900〜1099と200 sample
- NP1〜5の最小・平均・最大
- 乱数1000の独立確認値
- 取得日、master/engine版、導出、レビュー状態

一次根拠はAtlas Academyのdamage formulaとbinary32説明である。

- https://github.com/atlasacademy/fgo-docs/blob/master/deeper/battle/damage.md
- https://github.com/atlasacademy/fgo-docs/blob/master/deeper/battle/32-bit-float.md

特殊Functionの式とパラメータ対応は、Atlas式に加えてChaldeaのdamage実装を実装参照とした。外部実装との差分検証とevidenceによる`exact`判定はQ4で閉じる。

- https://github.com/chaldea-center/chaldea/blob/main/lib/app/battle/functions/damage.dart

## Benchmark

実行コマンドは`pnpm benchmark:calc`で、生成済み`dist`を拾わず`packages/calc-core/src/calc.bench.ts`だけを測定する。

- Environment: Linux 6.18.33.2-microsoft-standard-WSL2 x86_64
- Node.js: v26.3.1
- pnpm: 11.20.0
- Vitest: 4.1.11
- Workload: NP1〜5 × 乱数200点（合計1,000 kernel evaluations）
- Result (2 runs): 359.74〜385.97 ops/s、mean 2.5909〜2.7798 ms、p99 3.6998〜5.7383 ms、180〜194 samples、RME ±1.45〜3.39%

この値は回帰比較用の初回baselineであり、公開性能保証値ではない。

## 破壊的変更とデータ影響

`DamageResolutionInput`から`attackNpFunctionType`を削除し、解決済み／未解決を判別できる`damageFunction`へ置換した。Function固有条件として攻撃者HP、対象rarity、対象state traits、Battle Point phaseを追加し、誤って対象HPとしていたscenarioの`target.hpPermille`は削除した。

`schemaVersion`を5、`engineVersion`を3.0.0へ更新した。旧計算draft、履歴、共有snapshotは現行計算へ暗黙変換しない。旧実装との互換field、fallback、二重読込は追加していない。

## 検証

- `pnpm typecheck`: success
- `pnpm test`: 16 files / 98 tests passed
- `pnpm validate:master`: 2 files / 12 tests passed、artifact validation success
- `pnpm lint`: success
- `pnpm build`: success
- `pnpm benchmark:calc`: success
- `git diff --check`: success

## Q2ゲート判断

Q2を完了とする。純粋kernel、NP1〜5 evaluator、共有application facade、9種Function handlerは一つの計算経路へ収束した。標準式の演算境界とNP1〜5・乱数端点・平均は出典付きgoldenで固定され、Function固有入力不足はfail-closedとなり、benchmark baselineも記録された。

Q3では、現在のeffect resolverを`EffectSource`と単一`ScenarioResolver`へ置換し、対象条件、適用順、集約、traceを完成させる。Q2で確定したkernelとhandlerへUI固有の補正組立を戻さない。
