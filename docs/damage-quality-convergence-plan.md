---
title: "FGO Lab ダメージ計算品質 収束計画"
document_version: "1.0.0"
status: "In Progress"
created_at: "2026-08-25"
updated_at: "2026-08-25"
source_requirements: "docs/fgo-lab-requirements-v0.3.md v0.3.4"
source_calculation_review: "docs/damage-calculation-review.md v1.0.0"
refactoring_contract: "docs/adr/008-refactoring-contract.md"
---

# FGO Lab ダメージ計算品質 収束計画

## 1. 目的と位置づけ

本計画は、FGO LabのR1においてダメージ計算品質を最優先し、計算コア、マスターデータ正規化、効果解決、単発計算、ランキング、履歴・共有、公開ゲートを一つの追跡可能な計算経路へ収束させる実行計画である。

機能範囲は `docs/fgo-lab-requirements-v0.3.md`、計算仕様と検証観点は `docs/damage-calculation-review.md`、破壊的変更を含む実装方針は `docs/adr/008-refactoring-contract.md` を正とする。本計画は `docs/implementation-plan.md` のM3、M6、M7、M9のうち計算品質に関係する作業順を具体化し、その範囲では `docs/demo-feature-restoration-plan.md` のD2、D3、D4、D7、D9より優先する。

本計画の完了までは、火力ランキングを完成機能として扱わず、`VITE_ENGINE_RELEASE_VALIDATED=true`を公開buildへ設定しない。

## 2. 強制する実装原則

> 作業は既存実装との後方互換性を目的とした複雑化は避け、現在の要件に対して最適な実装を優先し、必要であれば破壊的変更や旧実装の削除も許容し、新旧の実装を併存させず、最終的に破綻しにくい構造へ収束させる。

この作業では次を必須とする。

1. 現行の型、schema、package、保存形式、UI状態を前提に継ぎ足さない。現在の要件から目標契約を先に定義し、既存実装は利用可能性を後から判定する。
2. 新旧の計算API、effect resolver、入力形式、precision判定、共有形式を併存させない。置換スライスの完了時に旧経路、旧型、互換flag、不要なadapterを削除する。
3. 互換性だけを目的とするoptional field、fallback、二重読込、二重書込、旧版自動変換を追加しない。
4. 正しさを保証できる単純な一方向変換だけをmigrationとして許可する。保証できない計算draft、履歴、共有snapshotは現行結果へ暗黙変換せず、版不一致として明示的に拒否または破棄する。
5. 破壊的変更では`schemaVersion`または`engineVersion`を更新し、削除対象、利用箇所の更新、データへの影響を同じスライスに記録する。
6. 一時的な互換実装が必要な状態でスライスを完了扱いにしない。テストも最終契約だけを検証し、削除予定の旧挙動を固定しない。
7. `approximate`を未実装の隠れ蓑にしない。R1対象外として残す機能と、R1で`exact`へ閉じる機能を明示的に分ける。

### 2.1 破壊的変更時のデータ方針

- 所持サーヴァント、育成値、礼装コピー等のユーザー原本は、意味を変えず単純に写せる場合だけ移行する。
- 計算入力、支援構成、draft、履歴、共有snapshotは、意味または効果順が変わる場合に旧形式を引き継がない。
- 旧backupと旧共有URLを現行形式として読み替えない。未対応版であることを表示し、現行計算結果として扱わない。
- 開発中のローカルDB resetを許容する。ただし実行前に対象と影響を確認し、ユーザー操作なしに既存データを暗黙削除しない。

## 3. 今回の確定範囲と非対象

### 3.1 確定範囲

- 宝具ダメージのfloat32演算、丸め、clamp、乱数900〜1099
- JP全攻撃宝具Functionの分類と、R1対応handler
- パッシブ、自身スキル、礼装、支援、魔術礼装、宝具前効果の解決
- 対象クラス、属性、特性、フィールド、OC、Function固有条件
- NP1〜5の最低、平均、最大
- precision、Breakdown、Assumption、Warning、Trace
- 単発計算とランキングの同一scenario resolver・kernel利用
- 計算draft、履歴、共有snapshotの現行契約への再設計
- golden、differential、inventory、regression、benchmarkのCIゲート

### 3.2 非対象

- NP回収、3Wave、通常攻撃、クリティカル、チェイン
- 最大火力となるスキル順の自動探索
- 敵HP、撃破率、不足・余剰
- 旧計算結果を現行engineで再現する互換engine
- 旧schema、旧共有URL、旧backupを無期限に読み続ける互換層
- ダメージ計算品質に依存しない育成計画、画像cache、ホーム装飾の改善

## 4. 目標構造

```text
Atlas raw data
  -> normalize / validate / Function inventory
  -> MasterDataSnapshot
  -> CalculationScenario
       - attacker and NP
       - ordered effect sources
       - target and field state
       - explicit assumptions
  -> ScenarioResolver
       - condition evaluation
       - effect ordering
       - resolved / rejected effects
       - required handler inputs
  -> DamageKernelInput
  -> DamageKernel
       - one NP level / one random value
  -> ResultEvaluator
       - NP1..5 / random 900..1099
       - precision and evidence
  -> CalcResult
       - breakdown / assumptions / warnings / trace / versions
```

依存方向を次に固定する。

```text
schema <- master-data
schema <- calc-core
schema + master-data <- effect-resolver
calc-core + effect-resolver <- calculation-application
calculation-application <- web / ranking worker
```

`A <- B`は、BがAへ依存してよいことを表す。逆方向の依存は許可しない。

- `DamageKernel`はReact、IndexedDB、Worker、Atlas raw形式、サーヴァントIDを知らない。
- `ScenarioResolver`はUI状態を知らず、版付き内部マスターと明示的scenarioだけを受け取る。
- 単発計算とランキングは同じapplication facadeを呼び、独自の入力組立や簡易式を持たない。
- precisionは環境変数だけで一括変更せず、実際に通過したFunction、効果、条件と検証済みevidenceから導出する。
- UIは`CalcResult`を表示し、計算用の補正値を別stateへ複製しない。

## 5. 作業フェーズと確認ゲート

各フェーズは、成果物と検証結果を提示して確認を受けてから次へ進む。確認前に次フェーズの本実装へ着手しない。調査用コードやfixtureは、採用されなければ同じフェーズ内で削除する。

### Q0：現状inventoryと目標契約

状態: 実施中

作業:

- 現在の`CalcInput`、`CalculationSelection`、effect resolver、kernel、ranking worker、share/historyの全利用箇所を列挙する。
- JP全攻撃宝具Functionと、damage関連effect/buff typeのinventoryを再生成する。
- 現行テストが保証する範囲と、根拠なしに固定している期待値を分離する。
- 目標となる`CalculationScenario`、`ResolvedEffect`、`DamageKernelInput`、`CalcResult`、evidence registryの型案を作る。
- 廃止する型、関数、package API、環境flag、保存形式を一覧化する。

確認ゲート Q0:

- R1で`exact`を目指すFunctionと、R1対象外として`unsupported`にするFunctionが確定している。
- 新しいデータフローと状態所有者が一意である。
- 破壊的変更の対象と、失われる可能性があるローカルデータが明記されている。
- 旧実装削除リストに合意できる。

### Q1：計算schemaとマスター正規化の置換

状態: 未着手

作業:

- Q0で承認したscenario/result契約へschemaを置換する。
- Function固有入力、効果条件、対象、タイミング、順序、値系列を内部マスターへ正規化する。
- raw値欠損、未知Function、未知buff type、参照不整合をvalidation errorまたは明示的unsupportedへ分類する。
- `schemaVersion`と必要な`masterDataVersion`を更新する。
- 旧schema、旧normalizer、旧optional field、変換用互換分岐を削除する。

確認ゲート Q1:

- 全攻撃宝具とdamage関連effectが、暗黙の0を使わず分類される。
- rawデータから内部モデルへの対応をfixtureで追跡できる。
- 新旧schemaがランタイムで併存していない。
- master validationとinventory reportが成功する。

### Q2：DamageKernelの再構築

状態: 未着手

作業:

- 1宝具Lv・1乱数点だけを計算する純粋kernelへ責務を限定する。
- float32境界、固定小数、floor、clamp、加算・乗算順を名前付きプリミティブで固定する。
- 通常式とFunction固有処理をサーヴァントIDではなくhandler registryで構成する。
- NP1〜5と200乱数評価をkernel外の`ResultEvaluator`へ分離する。
- 旧kernel、旧handler、重複する式、不要なwrapperを削除する。

確認ゲート Q2:

- 各演算境界のunit testがある。
- 標準宝具、NP1〜5、乱数端点と平均が出典付きgoldenへ完全一致する。
- Function handlerごとの入力不足がfail-closedになる。
- 同一入力が決定的で、benchmarkが記録される。

### Q3：ScenarioResolverの再構築

状態: 未着手

作業:

- パッシブ、自身スキル、礼装、支援、宝具前効果を同じ`EffectSource`契約へ正規化する。
- 魔術礼装を同じ`EffectSource`契約へ正規化し、R1で使用する効果を解決する。
- 対象、特性、フィールド、順序、OC、確率、デメリット、Function固有条件を明示的に評価する。
- 適用、非適用、未解決を区別し、全効果へ理由と付与元を残す。
- buff aggregationと上限処理を一箇所へ集約する。
- 現行effect resolverとUI側の補正組立を削除する。

確認ゲート Q3:

- 同じscenarioから単一の`DamageKernelInput`だけが生成される。
- 条件不明な効果が暗黙適用されない。
- 全効果の適用順と理由をtraceで確認できる。
- 自身・礼装・支援・宝具前効果の組合せgoldenが成功する。

### Q4：特殊Functionとevidence-based precision

状態: 未着手

作業:

- 各Functionについて一次根拠、独立golden、differential結果、レビュー記録をevidenceとして管理する。
- `exact`、`approximate`、`unsupported`を、実行時に使用したFunction・効果・条件のevidenceから導出する。
- `VITE_ENGINE_RELEASE_VALIDATED`による全体precision上書きを削除する。
- 差分を丸め、入力仮定、データ版、比較先の簡略化、FGO Lab不具合へ分類する。
- `engineVersion`を更新し、旧engine経路を削除する。

確認ゲート Q4:

- `exact`結果に未検証handler、未解決効果、暗黙仮定が含まれない。
- R1対応Functionの必須テスト行列が100%成功する。
- R1対象外Functionは理由付き`unsupported`となる。
- AppMedia標準ケースとChaldea特殊ケースとの差を説明できる。

### Q5：単発計算UI・draft・履歴・共有の置換

状態: 未着手

作業:

- Web UIを新しい`CalculationScenario`とapplication facadeへ接続する。
- quickとmanualを二つの明確なscenario生成経路とし、補正の二重適用を構造的に防ぐ。
- Breakdown、Assumption、Warning、Trace、precision根拠を表示する。
- draft、履歴、共有snapshotを新契約へ置換し、計算画面を開くたびsession IDを発行する。
- 旧draft、旧履歴、旧共有形式の互換読込を残さない。必要ならschemaを更新して明示的に拒否または破棄する。
- 旧UI state、旧selection変換、旧計算呼出しを削除する。

確認ゲート Q5:

- quickとmanualの同値ケースが同じ結果になる。
- 一つのsessionから履歴が一件だけ確定する。
- 同じmaster・engine・scenarioの共有結果が一致する。
- 旧版共有を現行結果として誤表示しない。
- UIから計算に至る経路が一つだけである。

### Q6：ランキングの同一計算経路への置換

状態: 未着手

作業:

- ranking workerから単発計算と同じapplication facadeを呼ぶ。
- 共通の対象、礼装、支援と、候補別の自身効果・特攻をscenarioとして解決する。
- 全体の共通育成値と、所持の現在値・育成目標を明確に分ける。
- `unsupported`候補を順位から除外し、理由と内訳を表示する。
- fingerprint cache、cancel、途中結果を最終契約上で実装する。
- 現在のranking専用入力組立と重複処理を削除する。

確認ゲート Q6:

- 同一候補・同一scenarioの単発計算とランキング結果が完全一致する。
- 候補ごとの自身効果と条件が解決される。
- filter変更だけでは再計算しない。
- unsupported除外が利用者に説明される。

### Q7：公開品質ゲートと文書の収束

状態: 未着手

作業:

- CIへmaster validation、Function/effect inventory、unit、golden、differential、regression、benchmarkを組み込む。
- engineまたはmaster更新時の全対象差分reportを生成する。
- 公開buildはQ0〜Q6のゲート成功を必須とする。
- `docs/damage-calculation-review.md`、ADR、要件トレーサビリティ、実装状況reportを実装へ合わせて更新する。
- supersededな計画、旧status、旧説明を削除または履歴化し、進行中の正本を一つにする。

確認ゲート Q7:

- R1の計算goldenが100%成功する。
- 未知Functionと未分類damage effectが0件である。
- `exact`判定がevidenceと一致する。
- production build、単発計算、ランキング、共有の必須E2Eが成功する。
- 公開可否と残る`unsupported`範囲を文書から判断できる。

## 6. 検証方針

各フェーズで最低限、対象packageのformat、lint、typecheck、unit test、master validationを実行する。計算変更では次を追加する。

| 検証 | 目的 | 必須タイミング |
|---|---|---|
| Unit | 演算境界、条件判定、集約規則 | 各スライス |
| Golden | 独立根拠に対する完全一致 | Q2以降 |
| Differential | 外部実装との差の説明 | Q4、公開前 |
| Inventory | 未知Function・effectの検出 | master変更、CI |
| Regression diff | engine/master変更影響の確認 | Q4以降 |
| Property | 単調性、範囲、決定性、不変条件 | Q2以降 |
| Benchmark | 単発、NP1〜5、全候補ranking | Q2、Q6、公開前 |
| E2E | UIから同じ計算経路を使用する証明 | Q5以降 |

golden fixtureには、入力、期待値、根拠、取得日、masterDataVersion、engineVersion、レビュー状態を含める。外部計算機の出力だけを期待値の根拠にしない。

## 7. コミットと削除確認

各フェーズは、次の単位を目安にレビュー可能なコミットへ分ける。

1. 契約とfixture
2. 純粋domain実装とunit/golden
3. adapterまたはUI接続とintegration/E2E
4. 旧経路削除、version更新、文書更新

各フェーズの最終コミット前に次を確認する。

- 新旧APIまたは状態が併存していない。
- 旧型、旧関数、旧test fixture、互換flagへの参照が0件である。
- 削除した経路を代替する最終経路がテストされている。
- schema／engine変更とデータ影響が記録されている。
- unrelatedなユーザー変更を含めていない。

## 8. 進捗記録

| Phase | 状態 | 確認日 | 成果物・判断 |
|---|---|---|---|
| Plan | 承認済み | 2026-08-25 | 本計画の範囲、順序、破壊的変更方針 |
| Q0 | 実施中 | - | inventory、目標契約、削除・破壊的変更影響の調査 |
| Q1 | 未着手 | - | - |
| Q2 | 未着手 | - | - |
| Q3 | 未着手 | - | - |
| Q4 | 未着手 | - | - |
| Q5 | 未着手 | - | - |
| Q6 | 未着手 | - | - |
| Q7 | 未着手 | - | - |

## 9. 最初の確認事項

本計画の承認後はQ0だけに着手する。Q0ではまだproduction実装を変更せず、次の三点を確認可能な成果物として提示する。

1. R1で`exact`へ閉じるFunction一覧と、理由付き`unsupported`一覧
2. 新しいscenario／resolver／kernel／result契約案
3. 削除する現行API・保存形式と、破壊的変更の影響一覧

この三点の確認後に、Q1のschema・master正規化置換へ進む。
