---
title: "FGO Lab ダメージ効果実行エンジン移行要件"
document_version: "1.0.0"
status: "Proposed"
created_at: "2026-08-25"
source_requirements: "docs/fgo-lab-requirements-v0.3.md v0.3.5"
ui_baseline: "docs/ui-design-spec.md v1.3.9"
refactoring_contract: "docs/adr/008-refactoring-contract.md"
---

# FGO Lab ダメージ効果実行エンジン移行要件

## 1. 目的

本書は、宝具ダメージに関係する条件判定、戦闘状態変化、補正集約を、効果ごとの例外分岐から状態駆動の順序付き実行へ置換する要件を定める。

移行の第一目的は計算品質の向上である。ただし利用者が現在使っているダメージ計算画面の入力項目、操作順、結果形式、共有導線は変更しない。内部APIや保存中の計算形式の互換性は目的としない。

## 2. 最上位制約

> 作業は既存実装との後方互換性を目的とした複雑化は避け、現在の要件に対して最適な実装を優先し、必要であれば破壊的変更や旧実装の削除も許容し、新旧の実装を併存させず、最終的に破綻しにくい構造へ収束させる。

この移行では次を必須とする。

1. 現行の`effect-resolver`の型や判定順を前提に機能を継ぎ足さず、目標状態と操作モデルから契約を定義する。
2. 新旧resolver、条件評価器、NP条件制御、状態表現をruntimeで切り替えたり二重実行したりしない。
3. 互換flag、サーヴァントID別分岐、UI文言やreason文字列を使う計算判定を追加しない。
4. 置換完了時に旧型、旧経路、旧fixture、不要なadapterを削除する。
5. 計算の意味が変わるschemaとengineは版を更新し、旧draft、旧履歴、旧共有snapshotを暗黙変換しない。

## 3. 維持するフロントエンド入出力体験

### 3.1 入力体験

次を移行前後で維持する。

- 攻撃役、礼装、サーヴァントLv、宝具Lv、OC、フォウ、スキルLvの入力位置と操作方法
- 未所持サーヴァント選択時のレアリティ別自然上限Lv、NP1、フォウ1000という仮想初期値
- サーヴァント変更時に仮想Lvも選択先のレアリティへ更新する挙動
- Lvショートカットを100／120とし、90を再追加しないこと
- クラス相性と属性相性の選択
- 攻撃役の三つの自身スキルをスキル単位で有効化し、レベルを変更する操作
- `自身の適用内容`で、宝具火力へ関係する条件付き効果をon/offする操作
- 支援役の追加、保存セットの呼び出し、支援スキルの有効化とレベル変更
- クイック操作と直接入力が同じ計算状態を表すこと
- 入力変更後に計算ボタンを要求せず、自動再計算すること

次の入力UIは追加しない。

- 対象特性を利用者が組み立てる専用エディタ
- フィールド状態だけを設定する専用エディタ
- 特攻宝具専用の別パネル
- 効果実行順を利用者に選ばせる操作
- 内部条件式をそのまま編集する操作

### 3.2 `自身の適用内容`の表示契約

- 宝具ダメージへ直接影響する効果だけを表示する。
- 対象カードと一致しない色バフは表示しない。
- 弱体耐性、NP獲得、スター、フィールド設定そのもの、特性付与そのもの等、ダメージを変えない中間効果は表示しない。
- 中間効果によって成立した最終的な火力効果は表示する。
- 自動的に成立する効果は自動適用し、利用者の判断が必要な条件付き火力効果だけを操作可能にする。
- onは「効果を無条件に強制適用」ではなく、「表示された成立条件をこの計算で満たす」という利用者の宣言として扱う。
- onでもカード不一致、付与対象不一致、効果順違反、未解決parameterを迂回してはならない。

### 3.3 出力体験

次を移行前後で維持する。

- NP1〜5を縦に並べ、各行へ平均、最低、最大を表示する。
- 現在の宝具Lvだけを強調する。
- 結果カードへ攻撃役、礼装、対象相性、自身スキル、支援の要約を表示する。
- `exact`、`approximate`、`unsupported`と警告を既存の結果領域で表示する。
- 計算内訳、根拠、仮定、警告を折りたたみ領域から確認できる。
- URL、画像、共有専用JSONの三つの共有導線を維持する。

計算不具合の修正による数値、適用件数、内訳、精度判定の変化は、維持対象の出力互換性に含めない。誤った旧結果へ合わせる補正は行わない。

## 4. 目標ドメインモデル

### 4.1 計算状態

一件の計算は、少なくとも次を持つ`BattleState`から導出する。

- 攻撃者の恒常特性と、その計算内で得た状態特性
- 対象の恒常特性と、利用者が成立宣言した状態特性
- フィールド特性
- 宝具カード種、クラス・属性相性、HP比率、Battle Point段階等の定量入力
- 付与済みの火力補正と、その付与元、順序、条件評価結果
- 実行時に使用したevidenceと未解決事項

状態はapplicationまたはUIから部分的に複製せず、単一の実行結果として生成する。同じscenario、master、engineから同じ状態遷移と結果を返す。

### 4.2 正規化操作

マスター由来の宝具火力関連Functionを、サーヴァントIDではなく型付き操作へ正規化する。R1では少なくとも次を扱う。

- `AddAttackerTrait`
- `AddTargetTrait`
- `AddFieldTrait`
- `RemoveTrait`
- `AddModifier`
- `ChangeModifierRate`
- `IgnoreDefense`
- `IgnoreDamageCut`
- `ExecuteNpDamage`

各操作は、付与元、対象、実行順、条件式、値系列、期間または有効範囲、evidenceを持つ。表示名や日本語ラベルを実行判定へ使わない。

### 4.3 条件式と成立宣言

- recipient、holder、opponent、field、card、state、定量条件を型として分離する。
- AND、OR、否定、個数条件をlosslessに保持する。
- 条件評価は全付与元と宝具特殊Functionで同じ評価器を使う。
- UIの効果on/offは、安定したdecision keyを介して型付き`ScenarioAssumption`へ変換する。
- `ScenarioAssumption`は宣言対象の条件だけを補い、効果の対象、カード、値、順序、handler対応状況を上書きしない。
- 同時に成立しない宣言が選択された場合は暗黙に片方を優先せず、矛盾を型付きで検出して結果をfail-closedにする。

### 4.4 順序付き実行

実行順は次を基準とし、実データの順序情報を保持する。

```text
初期BattleState
  -> パッシブ
  -> 選択された自身スキル
  -> 概念礼装
  -> 選択された支援・魔術礼装
  -> 宝具ダメージ前Function
  -> 宝具ダメージFunction
  -> ResultEvaluator
```

各操作は実行時点の状態で条件評価する。フィールドや特性を生成する操作は状態だけを更新し、火力補正でなければ適用内容UIへ出さない。後続の火力補正は更新後の状態で評価する。

固定点探索はゲーム上の順序を代替する手段として使わない。循環依存または順序不明を検出した場合は、都合のよい状態へ収束させず`unsupported`とする。

### 4.5 実行結果

内部結果は少なくとも次を型で区別する。

- `applied`: 条件が成立し計算へ適用
- `notApplied`: 無効化または条件不成立
- `notRelevant`: 宝具ダメージへ影響しない
- `impossible`: カード、対象、順序等から成立不能
- `unsupported`: 値、条件、handler、evidenceを解決不能

UIは自由形式のreason文字列から操作可否や表示可否を推測しない。実行結果が`visibility`、`controllability`、`decision`、`explanation`の型付き表示投影を提供する。

## 5. 一つにする処理経路

- 自身スキル、パッシブ、礼装、支援、魔術礼装、宝具前効果を同じ操作列へ変換する。
- 通常の条件付き補正と特攻宝具を同じ条件評価・成立宣言経路へ通す。
- 単発計算と火力ランキングは同じscenario compiler、executor、damage kernelを使う。
- クイック操作と直接入力は別の計算器を持たず、同じ最終`DamageKernelInput`へ到達する。
- UI表示用の適用内容は実行結果から導出し、別のeffect classifierを持たない。

## 6. 非対象

- ChaldeaのコードまたはAGPL-3.0実装の複製・翻案
- 完全な戦闘シミュレーター
- ターン進行、Wave、敵HP、撃破、NP回収、スター、通常攻撃
- 最大火力になるスキル順の自動探索
- R1で利用者が任意の行動順を編集する機能
- 旧engineを残して旧結果を再現する互換モード

Chaldeaは、戦闘状態へFunctionを順序付きで適用する設計の比較先としてのみ利用する。FGO Labの実装はAtlasデータとFGO Labの要件から独立して設計する。

## 7. データと版

- 正規化操作または条件式が変わる場合は`masterDataVersion`を更新する。
- scenario、assumption、実行結果が変わる場合は`schemaVersion`を更新する。
- 効果順、条件成立、集約結果が変わる場合は`engineVersion`を更新する。
- 旧計算draftと履歴は、意味を完全に維持できない場合は破棄または履歴値としてのみ表示する。
- 旧共有URLと共有JSONは現行engineで暗黙に再計算しない。
- 所持・育成値、礼装コピー等、計算意味に依存しないユーザー原本は安全に一方向移行できる場合だけ維持する。

## 8. 品質要件

### 8.1 計算品質

- 全JP攻撃宝具を対象に、未分類操作、未分類条件、未分類parameterをinventoryで検出する。
- 適用、非適用、状態変化、ダメージ実行の順序をtraceで再現できる。
- 同じscenario、master、engineの結果は決定的である。
- 解決不能な火力効果を0として続行しない。
- サーヴァントID別のproduction分岐を0件にする。
- 単発計算とランキングの同一入力結果を完全一致させる。

### 8.2 UI回帰

- 移行前の承認済み代表画面をPCと320px幅でスクリーンショット基準化する。
- 入力コントロールのラベル、順序、初期値、操作可能状態をcontract testで固定する。
- 同じ操作列から同じ共有可能入力を生成することをE2Eで確認する。
- DOM構造やCSS classの完全一致は要求しないが、情報階層、操作数、主要文言、フォーカス順、結果表、共有導線を維持する。
- 計算修正に必要な適用内容や警告の差は、理由をgolden差分へ記録する。

### 8.3 必須回帰シナリオ

- アーキタイプ：アース: 宝具前フィールドが後続Buster補正を成立させ、フィールド設定自体は表示しない。
- ダンテ・アリギエーリ: 天国／地獄のフィールド変化を表示せず、対応するArts・宝具威力・対象特攻だけを正しく操作・適用する。
- 武則天（夏）: 宝具前効果、特攻、NPレベル別倍率の順序とAppMedia比較差を根拠付きで固定する。
- 水着リリス: 宝具カードと一致する色バフだけを表示・適用する。
- 防御無視とダメージカット無視: 対象防御状態との関係を別操作として評価する。
- 特性数、状態特性、レアリティ、HP比率、Battle Point段階の特殊宝具をFunction familyごとに固定する。

## 9. 受入条件

- [ ] §3のフロントエンド入出力体験が、承認済みUI baselineと回帰テストで維持されている。
- [ ] UIがreason文字列やマスターラベルを使って表示・操作可否を判定していない。
- [ ] `conditionAsserted`のように効果条件を一括迂回する経路が存在しない。
- [ ] 通常条件効果と特攻宝具の別々のcondition control生成経路が存在しない。
- [ ] context生成と火力補正が順序付きの一つの操作列で実行される。
- [ ] 新旧resolver、scenario、実行結果、UI投影がruntimeで併存していない。
- [ ] 旧型、旧関数、互換flag、不要なadapterへの参照が0件である。
- [ ] 必須回帰シナリオと全master inventoryが成功する。
- [ ] 単発計算とランキングが同じapplication facadeを使う。
- [ ] schema、master、engineの版変更とデータ影響が記録されている。

## 10. 設計上の比較根拠

2026-08-25時点のChaldea `0411ef595144a208ab932682978755a1dcba5667`を比較対象とした。

- [`function_executor.dart`](https://github.com/chaldea-center/chaldea/blob/main/lib/app/battle/functions/function_executor.dart): Functionを順序付きで戦闘状態へ適用する責務
- [`battle.dart`](https://github.com/chaldea-center/chaldea/blob/main/lib/app/battle/models/battle.dart): actor、field、quest状態の所有
- [`buff.dart`](https://github.com/chaldea-center/chaldea/blob/main/lib/app/battle/models/buff.dart): バフ条件の共通評価
- [`damage.dart`](https://github.com/chaldea-center/chaldea/blob/main/lib/app/battle/functions/damage.dart): 実行済み状態からのダメージ評価
- [`td_damage/model.dart`](https://github.com/chaldea-center/chaldea/blob/main/lib/app/modules/battle/td_damage/model.dart): 共通battle engineの再利用と、上位層に残る個別順序・ID分岐

FGO Labは、順序付き状態実行と共通条件評価という境界だけを設計比較に用いる。完全battle simulatorと個別ID分岐は採用しない。ChaldeaはAGPL-3.0であるため、コードの複製・翻案を行わない。
