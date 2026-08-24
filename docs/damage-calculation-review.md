---
title: "FGOダメージ計算 実装調査・検証方針"
document_version: "1.0.0"
status: "Implementation Baseline"
created_at: "2026-08-24"
---

# FGOダメージ計算 実装調査・検証方針

## 1. 結論

FGO Labの価値は、保存や比較のUIだけでなく、計算条件を追跡できる正確な宝具ダメージ計算に置く。R1の実装は次の役割分担で進める。

- **仕様の一次根拠**: Atlas Academyの戦闘仕様文書とJPマスターデータ
- **独立した挙動比較**: Chaldeaの計算結果と公開テストケース
- **標準ケースと表示比較**: AppMediaの宝具ダメージ計算機
- **補助比較**: FGO 3T Damage Calculator等の公開実装

既存計算機の出力をそのまま正解値にせず、式、32-bit演算、丸め位置、バフ上限、効果発動順、特殊宝具を独立に実装して検証する。計算コアが本書のM3品質ゲートを通るまで、火力ランキングを製品機能として完成扱いにしない。

## 2. 調査対象と評価

| 対象 | 確認できた特徴 | FGO Labでの扱い |
|---|---|---|
| [Atlas Academy: Damage](https://github.com/atlasacademy/fgo-docs/blob/master/deeper/battle/damage.md) | 基本ダメージ式、乱数、補正の順序、上限、ヒット配分を文書化 | 数式・定数・順序の一次根拠 |
| [Atlas Academy: 32-bit float](https://github.com/atlasacademy/fgo-docs/blob/master/deeper/battle/32-bit-float.md) | ゲーム再現には32-bit浮動小数点が必要で、演算ごとの丸め差も例示 | `Math.fround`相当を演算境界ごとに適用 |
| [AppMedia 宝具ダメージ計算機](https://appmedia.jp/fategrandorder/5499061) | NP1〜5、最低・平均・最大を簡潔に比較。公開JSは標準式を一式で計算 | UIと一般的な入力の比較先。唯一の正解にはしない |
| [AppMedia ダメージ計算機](https://appmedia.jp/fategrandorder/77077189) | 通常攻撃、クリティカル、EX等も扱い、一部をサーヴァントIDで個別分岐 | R2調査資料。R1の宝具コアへ個別ID分岐を持ち込まない |
| [Chaldea battle utils](https://github.com/chaldea-center/chaldea/blob/main/lib/app/battle/utils/battle_utils.dart) | Atlas式を基礎に戦闘状態、効果順、上限、特殊Functionを解決 | 最も広い差分照合先。ただしAGPLコードは複製しない |
| [Chaldea float implementation](https://github.com/chaldea-center/chaldea/blob/main/lib/packages/float.dart) | 演算ごとにfloat32へ丸める型を使用 | 独立実装の挙動比較に使用 |
| [Chaldea tests](https://github.com/chaldea-center/chaldea/blob/main/test/app/battle/utils/battle_utils_test.dart) | 通常宝具、NPレベル、各種バフ、相性、特攻等のケースを保有 | テスト観点を参照し、期待値は独立に再作成 |
| [FGO 3T Damage Calculator](https://github.com/gakiloroth/gakiloroth.github.io) | 3WaveとNP回収を含む簡潔な公開計算機。入力者が事前効果等を補う前提 | 補助比較。R1の正確性判定には使用しない |

### 2.1 AppMediaを正解実装にしない理由

AppMediaの宝具計算は、公開されている[宝具計算JavaScript](https://appmedia.jp/wp-content/themes/appmedia/lib/fgo/fgo_damage_simulator_ver2.js?202605131445)上で、概ね次の項を乗算し、最後にfloorする読みやすい実装である。[一般ダメージ計算JavaScript](https://appmedia.jp/wp-content/themes/appmedia/lib/fgo/fgo_damage_simulator_ver3.js?202605131445)も比較対象にした。

```text
(ATK + Fou + CE ATK)
× 0.23
× クラス攻撃補正 × クラス相性 × 属性相性
× 攻防補正
× カード補正
× 宝具威力・特攻付与補正
× 宝具倍率 × 特攻宝具倍率
× 特殊耐性・特殊威力
× 乱数
+ 固定ダメージ
```

一方で、公開JSから次の差が確認できる。

- JavaScriptの倍精度数を使い、ゲーム相当のfloat32丸めを演算ごとには行わない。
- NP1〜5は主に宝具倍率を差し替えるため、NPレベルで特殊倍率も変わる一部宝具は正確に出せない旨が表示される。
- 一般ダメージ計算機にはサーヴァントIDによる例外分岐があり、マスターデータのFunction種別を網羅的に解釈する構造ではない。
- バフ上限や特殊条件の一部は画面・実装側の個別処理である。

したがってAppMediaは、標準条件が大きくずれていないことと、承認済み結果UIの比較には向くが、微小な丸め差や新しい特殊宝具まで保証するoracleにはしない。

### 2.2 Chaldeaをそのまま移植しない理由

Chaldeaはfloat32、戦闘状態、効果発動順、特殊Function、ヒット配分まで広く扱い、今回確認した実装では最も強い比較先である。しかし、ランキング用のスキル順や変身形態等には個別調整も含まれる。またソースコードはAGPL-3.0である。

FGO LabではAtlasの文書とデータから独立実装し、Chaldeaは入力と出力の差分照合に限定する。コード、テスト値、個別分岐を機械的に移植しない。

## 3. R1で再現する計算契約

### 3.1 基本式

実装上の名称はAtlasの概念と対応させ、次の積・和を追跡可能な段階へ分ける。

1. サーヴァントATK、フォウ、概念礼装ATK
2. 宝具倍率
3. カード補正とカード性能補正
4. クラス攻撃補正、クラス相性、属性相性
5. 乱数と基本定数`0.23`
6. 攻撃力上昇・防御力低下
7. 特殊耐性、防御無視、宝具耐性
8. 特攻付与、宝具威力、クリティカル専用項を除くpower系補正
9. 特攻宝具・特殊威力倍率
10. 固定ダメージ加算・固定ダメージ軽減
11. 最終下限処理とfloor

各段階は`Breakdown`と`Trace`へ残し、UIから適用元、値、上限、対象判定を確認できるようにする。

### 3.2 数値と乱数

- ゲーム相当の演算境界でfloat32へ丸める。JavaScriptでは計算プリミティブを通して`Math.fround`を適用する。
- バフ値は可能な限りマスターの整数値で集約・clampし、必要な段階でfloatへ変換する。
- ダメージ乱数は整数`900..1099`の200通りとして扱う。
- 最低は900、最大は1099の最終floor済み結果とする。
- UIの「平均」は乱数1000一点ではなく、200通りそれぞれの最終結果の算術平均とする。これによりAppMediaの基準値と僅差が出る場合があるため、計算方法をヘルプと内訳に記す。
- 水着リリスの比較入力（NP5、等倍、合計ATK 20,781、Quick 0%、宝具80%、特攻宝具100%、固定0）は、AppMediaの最低61,944、最大75,640を比較oracleとして固定する。直接入力ではパッシブを重ねない。

### 3.3 入力モードと効果の所有者

計算入力は次の二経路だけとし、同じ計算で併用しない。

```text
クイック操作: 基礎入力 -> パッシブ・礼装・自身スキル・支援・宝具前効果を解決 -> damage kernel
直接入力:     最終入力 ---------------------------------------------------------> damage kernel
```

- `resolved`モードは効果解決器だけが火力補正を更新する。直接入力から切り替える際は手動の火力補正を中立値へ戻し、二重加算を防ぐ。
- `manual`モードは入力値を最終値として扱い、パッシブ、礼装効果、自身スキル、支援、宝具前効果を加算しない。
- 共有snapshotは解決済み入力を保持するため、復元時は`manual`モードで再計算し、効果を二重解決しない。
- UIは最終入力を常時表示し、クイック操作では解決器が返した効果を補正種別ごとにスタック表示する。表示用に別の火力状態は保持しない。

### 3.4 Functionと特殊宝具

2026-08-24時点のAtlas Academy [JP `nice_servant`](https://api.atlasacademy.io/export/JP/nice_servant.json)に含まれる攻撃宝具Functionを集計した。強化前後、同一宝具の別データ、未公開データを含むFunction entry数であり、サーヴァント数ではない。

| FuncType | entry数 | 主な意味 |
|---|---:|---|
| `damageNp` | 374 | 通常の宝具ダメージ |
| `damageNpIndividual` | 141 | 個別特性への特攻宝具 |
| `damageNpPierce` | 68 | 防御無視宝具 |
| `damageNpIndividualSum` | 21 | 一致特性数に応じた威力 |
| `damageNpStateIndividualFix` | 13 | 特定状態への固定特攻 |
| `damageNpHpratioLow` | 6 | HP低下に応じた威力 |
| `damageNpBattlePointPhase` | 2 | Battle Point段階による威力 |
| `damageNpRare` | 1 | レアリティ条件 |
| `damageNpAndOrCheckIndividuality` | 1 | AND／ORを含む特性条件 |

通常、個別特攻、防御無視以外にも44 entryがあり、単一の標準式と手入力の特攻checkboxだけでは網羅できない。

サーヴァントIDの条件分岐ではなく、Function種別をキーとして計算可否を分類する。計算に必要な値を内部モデルへ正規化できるFunctionだけを`exact`とし、現在の入力モデルで表現できないFunctionへ空のhandlerを作らない。データ取込時に全攻撃宝具をFunction種別へ分類し、次を必須にする。

- 未分類Function数が0件である。
- `exact`とするFunctionには最低一件の専用golden testがある。
- 未対応Functionは標準宝具として黙って扱わず、`unsupported`または`approximate`を返す。
- 火力ランキングでは`unsupported`を通常順位へ混ぜず、除外理由を別枠で表示する。

### 3.5 効果の発動順

自己バフ自動計算は、単純なバフ値の加算ではない。スキルの対象、発動順、確率、HP、場、特性付与、変身、宝具前効果が結果へ影響する。

R1は次の決定的なscenario contractを使う。

- パッシブを先に適用する。
- 支援条件はテンプレートへ保存された支援元、スキル、対象、順序で適用する。
- 自身スキルは利用するスキルと順序を明示し、既定値は1→2→3とする。
- 宝具のダメージ前効果を適用してから宝具ダメージを解決する。
- 敵クラス、属性、特性、場、OC、HP条件、確率効果の仮定をscenarioへ含める。
- 条件不明な効果を都合のよい値で暗黙適用しない。
- 適用順と不適用理由を`Trace`へ残す。

「最大火力になる任意のスキル順を探索する」はR1に含めない。個別例外を追加する場合は、根拠、handler、専用テスト、UI上の仮定表示を必須とする。

## 4. 実装構造

```text
Atlas raw snapshot
  -> normalize / validate / classify Function
  -> versioned MasterDataSnapshot

CalculationScenario
  -> effect resolver（対象・条件・順序）
  -> buff aggregator（BuffAction別の集約・上限）
  -> damage formula（1宝具Lv・1乱数点のfloat32純粋計算）
  -> result evaluator（NP1〜5・乱数分布・精度分類）
  -> CalcResult + Breakdown + Assumptions + Warnings + Trace
```

- `damage kernel`はUI、DB、HTTP、サーヴァントIDへ依存しない。
- `effect resolver`はマスターのFunctionを解釈する。
- ゲーム固有のFunction差は正規化と精度分類へ隔離し、サーヴァントID分岐を計算式へ持ち込まない。
- 火力ランキングも単発計算と同じscenario resolverとkernelを使い、別の簡易式を持たない。
- Rawレスポンスはチェックサム付きで保存し、正規化データとの対応を追跡する。

## 5. M3品質ゲート

### 5.1 必須テスト行列

- Buster、Arts、Quickの単体・全体宝具
- NP1〜5、OC、強化前後
- 乱数900、1099、200通り平均
- クラス攻撃補正、クラス相性、属性相性
- 攻撃力、防御力、カード性能、カード耐性、宝具威力、power系補正
- バフ上限、負値、下限、重複、無効化
- 特攻付与、特攻宝具、複数特性、状態特攻
- 特殊耐性、防御無視、宝具耐性、固定加算・軽減
- HP比率、特性一致数、レアリティ、Battle Point段階、AND/OR特性条件
- パッシブ、自身スキル、支援、宝具前効果の順序
- 条件不足、未知Function、未対応handlerのfail-closed

### 5.2 検証レイヤー

1. **Unit**: 各演算、float32境界、clamp、対象判定を小さい値で検証する。
2. **Golden**: 根拠、入力、期待値、データ版、エンジン版、レビュー記録を固定する。
3. **Differential**: 標準ケースをAppMedia、広い特殊ケースをChaldeaと比較する。差は許容誤差で隠さず、丸め、仮定、データ版のどれかへ分類する。
4. **Inventory**: JPの全攻撃宝具を毎回分類し、未知Functionと未対応handlerをレポートする。
5. **Regression**: エンジン版またはマスター版更新時に全対象を再計算し、差分理由を残す。

### 5.3 M3完了条件

- 攻撃宝具のFunction分類が100%である。
- R1対応対象では未対応handlerが0件である。
- 必須テスト行列がCIで通る。
- AppMediaとの差を標準ケースごとに説明できる。
- Chaldeaとの差を特殊ケースごとに説明できる。
- `exact`結果に未解決の仮定、未知Function、未対応handlerが含まれない。
- 計算式、丸め、上限、発動順の変更は`engineVersion`を更新する。

## 6. 配信方針

R1はSSRを必要としない。IndexedDB、Web Worker、Canvas画像保存、URLフラグメント共有、静的マスターデータ取得はすべてブラウザ内で成立するため、**GitHub Pagesを第一配信先**とする。

- SPAはGitHub Pagesのサブパスを前提にasset base pathを設定する。
- 直接URL復元はhash routingまたは404 fallbackを採用する。
- マスターデータと画像は版付き静的ファイルとして配信し、manifestを最後に切り替える。
- 画像manifestを構造化データから分離し、画像配信停止後も名称・数値・fallbackで主要機能を使えるようにする。
- 指摘時に画像だけを停止できる設定と手順を用意する。

Vercelへ切り替えるのは、SSRが必要になった時ではなく、具体的にサーバー実行が必要になった時に再判断する。例は秘密情報を使うAPI、サーバー側ジョブ、認証、サーバー保存、静的配信では解決できない同一オリジンproxyである。R1の現要件には該当しない。

## 7. 実装前に確定する小項目

大項目は確定した。M0で次をADRとして固定すれば実装へ進める。

1. float32プリミティブの演算境界と、最終floorの仕様
2. 200乱数平均の表示丸め（内部値と画面表示桁）
3. ランキングの確率効果既定値（100%のみ／成功仮定）
4. 自身スキルの既定順と、順序を利用者が変更するUIの範囲
5. `approximate`と`unsupported`をランキングでどう分離表示するか
6. AppMedia・Chaldea比較fixtureの作成方法と、ライセンス境界
