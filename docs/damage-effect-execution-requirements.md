---
title: "FGO Lab ダメージ効果実行エンジン移行要件"
document_version: "1.1.0"
status: "E3.2 Redesign Approved"
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
- 表示される最終火力効果は、ゲーム内で確定発動するものも含めて原則操作可能にする。確定効果は既定onとし、offは比較のため計算から除外することを意味する。
- on/offによる計算への包含、ゲーム内の発動形態、条件成立、確率結果を別概念として保持する。onは条件やworld factを強制成立させない。
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

- 完全な戦闘シミュレーター
- ターン進行、Wave、敵HP、撃破、NP回収、スター、通常攻撃
- 最大火力になるスキル順の自動探索
- R1で利用者が任意の行動順を編集する機能
- 旧engineを残して旧結果を再現する互換モード

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

### 8.4 E3後の条件decision是正

2026-08-25のE3画面確認で、順序付きexecutorへの移行後も条件成立宣言とoperation有効化が一つのboolean decisionへ混在していることを確認した。現行実装では次を再現できる。

- ダンテ・アリギエーリの対天と対地を同時に成立宣言すると、`attributeSky`／`fieldHeaven`と`attributeEarth`／`fieldHell`が同じBattleStateへ入り、両方の威力アップが加算される。
- `baseOperation`が全効果へdecision keyを付けるため、無条件NP効果とパッシブがユーザー操作可能になる。
- operationが無効な場合にカード不一致より先にdisabled判定するため、成立不能な色バフが表示される。
- 支援効果だけが`selectedEffects`を更新してreturnするため、同じ条件式でも自身効果と同じScenarioAssumptionを作らない。

是正後の契約は次とする。

1. operation有効化と条件成立のassertionを、`automatic`、`enableOperation`、`assertCondition`、`enableAndAssert`の型付きdecision modeで分離する。
2. 状態生成だけを行うoperationは内部実行とし、火力decisionとしてprojectionしない。
3. `attributeSky`／`attributeEarth`／`attributeHuman`／`attributeStar`／`attributeBeast`、`fieldHeaven`／`fieldHell`等は、サーヴァントや効果IDではなくtrait意味論から排他groupを付ける。
4. 同一scope・排他groupへ異なるpresent traitを要求するScenarioAssumptionは、適用前に型付き矛盾として検出し、どちらも優先せず結果全体をfail-closedにする。
5. 条件式の`partial`や複数候補ORを一つのtraitへ暗黙変換しない。UI操作から具体的な成立factを一意に生成できない場合は操作不能またはtyped unsupportedにする。
6. 自身と支援のon/offは同じScenarioAssumption更新関数を使用する。支援テンプレート保存用の選択一覧は、最終decision projectionから導出する。

この是正では入力欄や配置を増やさない。変化を許容するのは、成立不能操作の非表示、自動効果の操作不可、排他矛盾時のunsupported表示、正しい効果内訳とダメージ値である。

### 8.5 E3.1実装結果

2026-08-25にschema 12、engine 9.0.0で是正した。

- ダンテの対天は`attributeSky`と`fieldHeaven`、対地は`attributeEarth`と`fieldHell`を同じScenarioAssumption契約で記録し、選択した側の`powerMod +0.5`だけを適用する。
- 世界属性とフィールドrealmはtrait意味論の排他groupで検査する。対天／対地の同時選択は状態変更前に2件の`exclusiveAssumptionConflict`となり、両補正を適用せず結果を`unsupported`にする。
- フィールド変化と特性付与はhiddenかつautomaticなoperation、無条件NP効果とパッシブはautomatic、カード不一致はhiddenとした。UIはprojectionの型だけを参照する。
- 自身と支援の操作はどちらも`assumptionsForProjection`を通る。支援テンプレートの選択参照は保存契約としてだけ保持し、executorの有効化入力には使用しない。
- Atlas `checkIndvType=4`のpartial条件はtrait数条件へ単純化せず、現在のnormalized masterで正確に評価できないためtyped unsupportedとした。複数候補ORも先頭候補を暗黙選択しない。
- 適用したScenarioAssumptionとoperation IDを計算traceへ記録し、ダメージ内訳から成立factと実行結果を追跡できるようにした。

production master 469騎中、攻撃宝具を解決できる420騎を監査した。ユーザー操作可能projection 1,083件の操作後無変化は0件、排他候補12組の正常計算は0件、automatic visibleは548件、hiddenは671件だった。既定scenarioのunsupportedは17騎から19騎へ増えた。追加2騎はpartial条件を持つ自動パッシブ1騎と、対象レアリティを一意に仮定できない特殊宝具1騎であり、誤った旧結果を維持しない。さらにNPレベル別の条件付き宝具projection表示は3騎で選択中NPレベルを参照するよう是正した。

### 8.6 E3.2 条件・decision・fact意味論の再設計

E3.1は単一traitの条件成立をworld fact assertionへ変換することでダンテの回帰を止めたが、複数候補ORを一意なfactへ変換できない場合に`automatic`へ落とす欠陥を残した。その結果、条件付き火力がvisibleであるにもかかわらず、操作不能・計算外のまま結果全体は`calculated`になり得る。さらに排他検証がscenarioから渡された`exclusiveGroup`を信用するため、外部入力が同フィールドを欠落・改変するとcanonicalな排他関係を迂回できる。

E3.2では次を最終契約とする。

1. `MasterCondition`はAND、OR、NOT、partial、数量条件を情報欠落なく正規化したIRとし、UI操作の作りやすさを理由に単一traitへ縮約しない。
2. scenarioへ保存する`UserDecision`は、operationを使用する意思とeffect-localな条件成立宣言を別フィールドで表す。条件成立宣言をworld factへ変換しない。
3. `WorldFact`はscenarioの定量入力、masterの恒常trait、executorが順序付きcontext mutationから生成したtraitだけで構成する。排他groupは保存せず、executorがcanonical trait semanticsから導出する。
4. 選択されたeffect-local condition同士は、完全な条件式を論理制約として検証する。両立する選択肢が一つもない場合は型付き`conditionDecisionConflict`として両方を適用せずfail-closedにする。
5. effect-local成立は当該火力operationだけに作用し、別効果のcondition evaluatorやworld factへ伝播しない。状態変更operationへeffect-local成立を使う必要がある場合はexactとせずtyped unsupportedにする。
6. 条件を入力なしで評価できることをUI操作不可と同一視しない。未成立・未解決の条件付き火力を確定適用へfallbackしない。
7. UIはapplication facadeが返すprojectionとcommandだけを扱う。webがcondition IRを解釈してscenario入力を再構築しない。
8. 未選択の任意効果のunsupportedは計算全体を止めない。選択済み、automatic、または宝具本体のunsupportedは必ず結果全体をfail-closedにする。

この契約により、「蛇または竜」のようなOR効果は、どちらのtraitかを捏造せず、その効果だけの成立を宣言して正確に計算できる。一方、その成立が中間状態として後続へ伝播しなければ結果を確定できない場合は、具体的なworld factがない限りunsupportedとする。

### 8.7 E3.2実装結果

2026-08-25にschema 13、engine 10.0.0、normalized master v18で中央置換した。

- scenarioは`effectDecisions`と`worldFactAssertions`を別型で保存し、effect decision内でも`operationEnabled`と`conditionSatisfaction`を分離する。master conditionはscenarioへ複製しない。
- 複数候補ORはeffect-local成立として当該火力operationだけへ適用する。productionの16騎19効果を監査し、すべてvisibleかつuser-controllable、選択後appliedとした。具体traitやfieldはworld factへ追加しない。
- selected condition群はAND/OR/NOTを保った制約として検証する。ダンテの天/地同時選択は`exclusiveTrait`のscope、canonical group、traitsを含む`conditionDecisionConflict`となり、両operationは`notApplied`、結果はunsupportedになる。
- 排他性はscenarioの入力値を受け取らない。E3.1で排他扱いしたalignmentは、実masterで`alignmentSummer`との併存や善/悪の併存が確認されたため除外し、確実な`worldAttribute`と`fieldRealm`へ限定した。
- context mutationはderived battle stateだけを更新しhidden、effect-local成立はworld factへ波及しない。両者はtraceのoperationと`user-decision`で区別できる。
- webはprojectionからdecisionを組み立てず、`calculation-application`のcommandを呼ぶ。自身、支援、保存セット復元、ranking準備が同じcommand semanticsを使う。
- production 420計算でuser projection 1,545件、automatic visible 439件、hidden 671件、操作後不変0件、排他矛盾7組の正常計算0件。未知condition variantはproduction ratchetで検出する。
- 既定scenarioのunsupportedは19騎から15騎。対象レアリティORの1騎はexactに解決可能となり、未選択の任意unsupportedを持つ3騎は既定計算を継続する。選択時にfail-closedとなるunsupportedは58騎90効果、partialはBBドバイの1騎1効果である。

### 8.8 E3.3 unified constraint validation

E3.2で型分離したworld factとeffect-local decisionを、実行時には一つのcanonical制約系で検証する。

1. master／damage input、外部world fact、commit済みcontext mutation、既知quantityをfixed literalとして扱う。
2. 未指定traitはunknownであり、`present: false`とみなさない。negativeは明示的world factまたはcommit済みremove mutationだけが生成する。
3. 選択済みeffect-local conditionはmaster IR由来のsatisfiable expressionであり、具体traitやworld stateへ変換しない。
4. fixed literalとexpressionの交差をAND／OR／NOTの情報を失わず検証し、共通の充足割当がなければtyped conflictでfail-closedにする。
5. canonical排他、trait polarity、quantity rangeを同じsolverで検証する。解釈不能conditionと安全上限超過はtyped unsupportedにする。
6. context mutationはcandidate stateで検証し、成功時だけ原子的にcommitする。失敗時は元stateを後続operationとdamage inputへ渡す。
7. webはexecutorのruntime分類関数を直接使用せず、`calculation-application`のview model、projection、commandだけを使用する。
8. crafted shareを含む外部scenarioはschema通過後もexecutorで同じ制約検証を受け、矛盾した結果を`calculated`として受理しない。
9. quantity factは種類ごとのcanonical定義域をschemaとexecutorで共有する。範囲外の値はクランプせず、入力境界で拒否し、schemaを迂回した実行境界でもtyped unsupportedにする。
10. trait制約IRはactorの初期trait、後から付与・解除されるstate trait、両者の論理和であるcombined predicateを別scopeとして保持する。actor条件はcombined、state専用条件はstateだけを読む。初期negativeだけではstateを否定せず、positive stateはcombinedを成立させる。この規則をcondition evaluatorとsolverで共有する。
11. 初期制約検証が失敗した場合、選択中の条件付きoperationをall-or-nothingで非適用とし、競合後のdamage inputへmodifierを残さない。
12. context mutationは初期traitを書き換えずstate traitだけを更新し、各operationのcandidate stateからcombined predicateを再導出する。付与後と解除後の条件評価は同じ時点のstateを使用する。
13. 攻撃役スキル由来のhidden context mutationは、スキルがmaster上に存在することだけでは自動実行しない。選択された最終火力effectとのsource skill activationまたは論理的trait prerequisiteをcanonical operationへ保持し、対応するdecisionが有効な場合だけ候補stateを生成する。
14. choiceを持つhidden mutationは、同一skillという理由だけで全候補を有効化しない。選択effectのconditionが候補traitをすべての充足枝で要求する場合だけ結び付け、ORの一枝を暗黙採用しない。
15. hidden mutationのactivation linkはworld factではない。effect-local成立を具体的traitへ変換せず、候補stateの制約検証に成功したoperationだけをcommitする。

### 8.9 E3.4 unsupported semantics convergence

残存unsupportedは件数ではなくraw semantics単位で収束させる。完全なinventory、優先度、canonical IR、残存理由は`docs/damage-effect-unsupported-convergence-plan.md`を正本とする。

1. Function IDとraw effect occurrenceを別識別子とし、decision、operation、projection、evidenceはoccurrence単位で一意にする。
2. raw parameterはmodifier、state mutation、choice、guard、metadata、reference、non-damageへlosslessに分類する。未知keyをexecutorのallowlistで黙認しない。
3. damage inputまたは後続damage conditionへ影響するoperationだけが計算precisionを左右する。表示metadataと証明済みnon-damage効果は計算を阻害しない。
4. 可変値は既知quantityとcommit済みstateからexactに評価する。必要な値がunknownなら0倍・1倍へ置換せずtyped unsupportedとする。
5. field/state mutationはhiddenなordered operation、random/action候補はcanonical choice groupの排他decisionとして扱う。
6. 現行UIにない敵trait、star、turn、編成生存入力を追加しない。不足familyは個別理由を付けてfail-closedを維持する。
7. production ratchetはunknown family、occurrence key衝突、非damageによる阻害、choice同時適用、unsupported operation適用を0件に固定する。

quantity guardはmaster正規化時に比較式へ変換し、source identityを保持する。attackerのHP・Battle Pointとsupport sourceのHP・Battle Pointを同一の値として評価してはならない。現在の入力に対応するsourceだけを具体値で評価し、effect-local成立だけで結果が一意な別source条件はworld factへ変換せず当該operationに限定する。

quantityがmodifier値を変える場合はtyped value expressionとして実行し、effect-localな成立宣言で具体値を代用しない。projectionは必要quantityとownerを返し、attacker HPは既存入力欄を必要時に再利用する。support source HPなど現行UIにないquantityは、攻撃役の値を流用せず選択時unsupportedにする。

action choiceはeffect-localな候補制約として扱う。同じsource instance・skill・family内の同一候補に属するmodifierは共存し、異なる候補を同時選択した場合は全候補を非適用としてtyped conflictにする。choiceをtrait、field、quantityへ変換せず、scenarioへmaster由来のgroup metadataを保存しない。

宝具card mutationはcard種別がmasterから一意に確定する場合だけordered stateへ適用する。card固有modifierは付与時点ではなく最終cardに対して評価し、damage input、UI visibility、traceで同じ判定を使う。競合したcard choiceはcandidate stateをcommitせず、元のcardとmodifier入力を維持する。

同一action内のFunction位置で成立する火力効果は、整数positionをlosslessに保持したeffect-local trigger制約として扱う。位置成立decisionはworld fact、trait、field、quantityを生成せず、当該operationだけを有効化する。damage operation後の効果を最終inputへ遡及させず、位置が複数・非整数・欠落して一意に正規化できない場合はtyped unsupportedとする。

buff instanceへ付くidentity・linkage metadataはactor traitやstate mutationへ変換しない。modifierの値と条件が独立に確定する場合はidentity metadataを保持したままdamage operationを実行する。`faceCard`はcommand-card scopeとしてNP executionから分離し、route可能なmodifier typeを持っていてもNP projectionを生成しない。

source-owned quantity guardは、同名に近いscenario quantityへ読み替えず、subject、比較、境界を保持したeffect-local rangeとして扱う。選択されたrange同士はsolverで交差検証し、共通の充足値がなければ全operationを非適用にする。成立宣言から具体的なquantity world factは生成しない。modifier値そのものがquantityに依存する場合はこの成立宣言だけで値を決めず、具体入力がなければunsupportedとする。

参照Functionは実行containerのscopeを保持する。通常攻撃だけで発火するtriggerはNP火力UIと計算を阻害させず、宝具Function列のNP前triggerへ同じ非damage分類を流用しない。参照先がartifactから解決できないNP前triggerは値を推測せずfail-closedにする。

NP executionでは`cardNP`、`faceCard`、`cardExtra`をtrait factではなく実行scopeとして評価する。NPでは`cardNP`だけが成立し、scope外conditionを成立decisionへ投影しない。宝具card形態を表すstate traitがmasterのcard change buffから一意に得られる場合、cardと形態stateを一つのtransactional operationで置換する。形態traitはscenarioへ保存せずderived stateだけへcommitし、排他的な形態decisionはall-or-nothingでfail-closedにする。

### 8.10 E3.8 implementation-unsupported 0

ランキング統合前に、単発宝具計算の実装不足を完全に解消する。正本inventoryと実装計画は`docs/damage-effect-zero-unsupported-plan.md`とする。

1. production攻撃宝具420件と全user projection単独選択で、実装未対応を理由とする`unsupported`を0件にする。
2. 利用者しか決められないturn、star、stack、field population、actor population、available master skill等は、canonical quantity/factとしてscenarioへ入力可能にする。
3. 入力定義はowner、scope、範囲、default policy、consuming occurrenceを持つ。欠落はtyped `inputRequired`とし、`unsupported`や黙示的な0へ変換しない。
4. HP 100%、Battle Point 0、turn 1、star 0、外部stack 0、available master skill 0をゲーム開始状態から導出する。actor population countは一律0にせず、canonical target populationとtrait predicateから攻撃役本人・現在の宝具対象について保証できる最低値を導出する。
5. trait provenance、linked buff identity、参照skill、population/survival、count expressionをmaster IRで判別し、raw parameter名をexecutorへ渡さない。
6. `checkIndvType=4`はsigned trait候補のpartial-match ORとしてlosslessに正規化し、trait countや先頭候補へ読み替えない。
7. 参照skillはbuild時に解決し、参照先のcanonical operationを呼出位置へ展開する。欠落、循環、対象不一致、未分類operationはartifact生成を失敗させる。
8. operation、state、modifier、evidence、damage inputはeffect単位のtransactionとし、依存または入力不足時に部分commitしない。
9. 通常画面では追加入力を表示せず、必要な対象だけ既存の戦闘状況領域へapplication提供descriptorから表示する。
10. scenario、share、saveのversionは一方向に更新し、旧context表現とのfallbackや二重解釈を残さない。

matching actor countの明示入力は「最低値への追加分」ではなく最終合計値とする。同一actorが別々のtrait predicateへ一致する場合は各predicateで独立に数え、UIも単純な合計人数として表示しない。明示値がcanonical最低値未満なら入力境界・実行境界でclampせずfail-closedにする。入力省略時はshare/saveからの再計算を含めて最低値を再導出する。

E3.8は単発計算を正本として完了させるフェーズであり、E4ランキング統合は開始しない。

### 8.11 E3.9 特殊入力interfaceの収束

E3.8のcanonical battle-context inputを内部状態editorとして露出せず、最終火力effectへ近接した
入力へ投影する。詳細なinventory、型、wireframe、依存方向は
`docs/adr/013-effect-context-input-presentation.md`を正本とする。

1. HPとBattle Pointは攻撃全体の基礎条件として既存の基本設定欄に残す。
2. turn、star、stack、actor population、trait一致count、available skill、支援元HPは、消費する
   最終火力effectの行またはeffect group内へ表示する。
3. trait、field、特攻成立条件は既存のeffect toggleを維持し、独立したworld fact editorを作らない。
4. field、trait、linked state等の中間mutationは自動導出してhiddenとし、traceだけへ残す。
5. 同じcanonical input keyを複数effectが消費する場合、applicationが一つのshared inputへまとめる。
6. scenario値はtyped canonical valueとし、旧number mapとのfallbackを持たない。
7. Webはapplication view modelとcommandだけを扱い、master definitionやconditionから配置・controlを
   再解釈しない。
8. `inputRequired`は該当inline inputにも表示し、欠落・範囲外・導出minimum未満をclampしない。
9. E4は同じinput resolver、scenario validation、command、executorを再利用し、ranking専用意味論を
   作らない。

この変更で入力位置と表示部品は改善するが、「攻撃役→スキル→自身の適用内容→支援→結果」という
主要な操作順、共有・保存導線、damage値は変更しない。

### 8.12 effect interactionと条件付きseries

1. effect toggle、single choice、inline quantityはapplicationの型付きinteraction view modelから表示する。
2. 同じスキル使用で発生する累積閾値operationを任意選択可能な複数toggleへ分解しない。
3. seriesの各condition、operation、outcome、evidenceはexecutorで独立に保持し、表示時だけ合計する。
4. single choiceはcanonical choiceまたはcanonical exclusive factから導出し、ID・名称・labelでgroup化しない。
5. 選択commandは競合candidateを解除するが、外部入力された競合scenarioはexecutorでfail-closedにする。
6. input値変更が関連operationまたはdamageへ到達しないcontrolをproductionへ生成しない。
7. `HP_LOWER`は0〜1000の整数閾値として既存`attackerHpPermille`へ正規化し、IDや固定閾値表を用いない。
8. 同一skillの無条件baseとHP閾値memberは一つのdecision・一つの合計表示へ投影するが、operation、
   condition、Atlas evidence、outcomeはoccurrence単位で保持する。
9. HP閾値不成立はmemberの`notApplied`であり、skill全体を`unsupported`にしない。範囲外、非整数、
   重複、condition方向・target・operation semantics不一致はartifact生成を失敗させる。

## 9. 受入条件

- [x] §3のフロントエンド入出力体験が、承認済みUI baselineと回帰テストで維持されている。
- [x] UIがreason文字列やマスターラベルを使って表示・操作可否を判定していない。
- [x] `conditionAsserted`のように効果条件を一括迂回する経路が存在しない。
- [x] 通常条件効果と特攻宝具の別々のcondition control生成経路が存在しない。
- [x] context生成と火力補正が順序付きの一つの操作列で実行される。
- [x] 新旧resolver、scenario、実行結果、UI投影がruntimeで併存していない。
- [x] 旧型、旧関数、互換flag、不要なadapterへの参照が0件である。
- [x] 必須回帰シナリオと全master inventoryが成功する。
- [x] 単発計算とランキングが同じapplication facadeを使う。
- [x] schema、master、engineの版変更とデータ影響が記録されている。

## 10. 設計根拠の追跡

計算仕様はAtlas Academyの構造化データとfgo-docs、正規化manifest、golden／property test、production master監査を根拠として追跡する。外部実装の挙動は計算根拠や正解データとして扱わない。
