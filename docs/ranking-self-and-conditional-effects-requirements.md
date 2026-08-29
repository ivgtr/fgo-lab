---
title: "ランキング自己バフ・条件効果統合仕様"
document_version: "0.1.0"
status: "Draft - design review required"
created_at: "2026-08-30"
related_adrs:
  - "docs/adr/018-ranking-comparison-policy.md"
  - "docs/adr/019-ranking-contribution-and-execution-plan.md"
  - "docs/adr/020-ranking-condition-provenance-and-field-policy.md"
  - "docs/adr/024-pre-noble-phantasm-plans-and-attack-profiles.md"
  - "docs/adr/025-canonical-target-state-damage-semantics.md"
---

# ランキング自己バフ・条件効果統合仕様

## 1. 目的

本書は、宝具威力ランキングの比較条件を増やし続けず、利用者向けには「自己バフ」と
「条件効果」の二軸へ整理するための製品仕様と実装境界を定める。

達成する利用者体験は次のとおりである。

- 通常時の性能と、条件成立時の最大ポテンシャルを迷わず切り替えられる。
- 特攻、フィールド、HP、対象状態、確率結果、NP条件を個別の見出しへ増やさない。
- 一覧行の情報密度を維持し、採用した詳細条件は展開時だけ確認できる。
- 全サーヴァントを同じ比較policyで評価し、成立不能な効果を最大値へ混入させない。
- calculatorとrankingは同じcanonical state、ordered action reducer、damage executorを使う。

最優先事項はダメージ計算品質である。UIを二項目へ統合するために、異なるゲーム意味論を
一つのbooleanや`assumeSatisfied`へ潰してはならない。

## 2. 最上位原則

1. UI上の単純化とdomain model上の単純化を混同しない。
2. 効果の実行、ダメージへの寄与、条件成立、行動の合法性を別契約として保持する。
3. 「条件効果：成立込み」は条件を無条件にtrueへ書き換える機能ではない。
4. 同時成立する一つのcanonical scenarioを構築できた効果だけを計算する。
5. NP不足、排他choice、対象不一致、form不一致等をranking policyで迂回しない。
6. サーヴァントID、名称、効果label、raw Atlas keyによるruntime分岐を追加しない。
7. 旧policyとの互換性のために新旧経路を併存させない。採用時はschemaを破壊的に更新してよい。
8. 完全な戦闘シミュレーターへ拡張せず、宝具前の有限planに必要な状態だけを扱う。

## 3. 対象範囲

### 3.1 対象

- rankingの比較条件、URL、worker request、cache key
- 自己火力効果の寄与policy
- 特攻、フィールド、HP、対象状態、定量条件、確率・choiceの寄与policy
- 宝具前skill／変身NP／攻撃NPの実行可能性
- NP条件、NP増減、攻撃宝具実行に必要なNP resource
- 採用条件のdetail evidence
- calculatorとrankingのscenario／executor parity

### 3.2 非対象

- ターン進行、Wave、敵HP、撃破、通常攻撃、NP回収、カード選択
- supportや礼装を含めた最大火力編成探索
- cooldown回復、同一skill slotの再使用
- ranking上の個別field、対象trait、HP、スター、人数editor
- 条件ごとのランキング列や個別toggleの追加
- 旧ranking URL／保存形式を暗黙変換するcompatibility layer

## 4. 利用者向けランキング条件

ランキング上部の計算条件は、次の5項目へ収束させる。

1. 比較対象: `標準比較 | 所持戦力`
2. 宝具Lv: `NP1 | NP2 | NP3 | NP4 | NP5`
3. クラス相性: `等倍 | 相性有利`
4. 自己バフ: `なし | あり`
5. 条件効果: `通常のみ | 成立込み`

ADR-018の`特攻なし | 成立`とADR-020の`フィールドなし | 成立`は、採用時に
`条件効果`へ破壊的に統合する。旧二項目を非表示で残したり、内部fallbackとして読み取ったりしない。

### 4.1 既定値

- 比較対象: 標準比較
- 宝具Lv: NP1
- クラス相性: 等倍
- 自己バフ: あり
- 条件効果: 通常のみ

既定ランキングは「全員へ共通の通常条件で、無条件の自己火力効果を含めた比較」とする。
`成立込み`は通常順位を置き換えるものではなく、合法な最大ポテンシャルを比較する別modeである。

### 4.2 表示

閉じた一覧行へ個別条件を追加しない。ranking見出しまたはdetail summaryには、例えば
`自己バフあり・条件効果成立`のように現在の二軸だけを表示する。

採用した条件は、展開したdetail内の一つの「成立条件」領域へまとめる。

```text
成立条件
・対象: 〔混沌〕
・フィールド: 水辺
・対象状態: 混乱
・開始NP: 150%
・確率結果: 攻撃力アップ成功
```

条件のない行では領域自体を省略する。詳細の開閉によって主順位やdamageを再計算しない。

## 5. 二軸の意味

### 5.1 自己バフpolicy

`自己バフ`は、攻撃役の任意行動に由来するdamage modifierを寄与へ含めるかを決める。

`あり`で含め得るもの:

- 攻撃力、カード性能、宝具威力、特攻付与等の自己強化
- 攻撃役本人もrecipient条件を満たす味方全体効果
- 攻撃役が対象へ付与する防御力低下等のdebuff
- 攻撃役が生成した状態を読むdamage modifier

`なし`でも維持するもの:

- legal initial formとform transition
- NP variant、card、scope、倍率、damage function
- passiveとform intrinsic trait
- NP固有の強制的な宝具前effect
- ordered actionとそのevidence

`なし`は戦闘stateを書き換える操作ではなく、既存の
`counterfactualWithoutVoluntarySkillModifiers`を明確化した寄与projectionである。

### 5.2 条件効果policy

`条件効果`は、通常比較を超える条件を必要とするdamage contributionを含めるかを決める。

対象familyは少なくとも次を含む。

- `powerMod`および`npSpecial`の対象条件
- 外部または自己生成fieldを読む効果
- 対象の一時状態を読む効果
- attacker／target HP閾値
- star、人数、turn、Battle Point、その他のcanonical quantity
- 確率proc、連鎖成功回数、damageに影響するchoice
- NP resource条件を持つ任意skill由来のdamage contribution

`通常のみ`ではこれらのcondition-dependent contributionを除外する。ただしconditionを作った
state mutation、field mutation、choice evidence、form transition自体は削除しない。

`成立込み`では、有限なcanonical候補から一つの矛盾しないscenarioを生成し、ordered reducerで
実行可能な候補だけをdamage計算へ含める。同じeffect groupの一部だけを任意に抜き出さない。

### 5.3 二軸の組み合わせ

| 自己バフ | 条件効果 | 比較する内容 |
| --- | --- | --- |
| なし | 通常のみ | 宝具本体、passive、intrinsic condition中心の基礎性能 |
| あり | 通常のみ | 無条件の自己火力効果を含む標準性能 |
| なし | 成立込み | 自己skill modifierを除いた条件付き宝具性能 |
| あり | 成立込み | 一つの合法scenarioで到達できる最大自己完結火力 |

## 6. conditionのcanonical分類

UIは二軸でも、domainでは次を区別する。

### 6.1 Intrinsic condition

scenarioの追加仮定なしにidentityから確定する条件である。条件効果policyの対象外とし、常に通常評価する。

- attacker自身のclass、attribute、gender、alignment、固定trait
- current ActorFormとform-qualified skill／NP
- NP card type、target scope、recipient
- canonical TargetContextから一意に導出されるclass／attribute relation

条件効果`成立込み`でも、attackerが持たないintrinsic traitを追加してはならない。例えば、本人が〔竜〕でない
攻撃役へ「味方全体の〔竜〕」効果を適用しない。

### 6.2 Conditional contribution requirement

damage contributionの包含を条件効果policyが制御する条件である。

- target／targetState predicate
- field predicate
- HP／quantity predicate
- stochastic proc／choice
- resource-gated voluntary skill contribution

condition witnessは`intrinsic | derivedAction | externalAssumption | explicitInput | stochastic`
のprovenanceを保持する。provenanceは説明とtie-breakに使い、execution outcomeの代わりにしない。

### 6.3 Execution precondition

actionを実行できるかを決める条件であり、条件効果policyで上書きできない。

- NPが一定値以上ある
- skill slotが未使用である
- current formにskill variantが存在する
- choiceが排他的である
- transform NPが未使用である
- attack NP実行時にNPが100%以上ある

execution preconditionを満たさないplanは`calculated`候補へ入れない。これは「条件効果通常のみ」と
「成立込み」の双方に適用する。

## 7. 実行と寄与の契約

既存の「execution state」と「ranking contribution policy」の分離を維持し、寄与除外理由を二軸にする。

```ts
interface RankingEffectEvaluation {
  execution: {
    outcome: ExecutionOutcome;
    explanation: ExecutionExplanation;
    witnesses: readonly ConditionWitness[];
  };
  contribution: {
    sourcePolicy: 'included' | 'excludedBySelfBuffPolicy';
    conditionPolicy: 'included' | 'excludedByConditionPolicy';
  };
}
```

最終的なdamage寄与は次をすべて満たした場合だけ適用する。

```text
execution outcome is applied
AND source policy is included
AND condition policy is included
```

ranking policyは`unresolved`、`cardMismatch`、`targetMismatch`、`conditionNotMet`等のexecution reasonを
「計算外」へ再分類しない。表示集約はoperation順ではなく、execution outcomeと二つのpolicy decisionから
安定して決定する。

## 8. NP resource semantics

### 8.1 背景

現在の`PreNoblePhantasmState`はNP gaugeを保持せず、raw `lossNp`は`nonDamage`として扱われる。
このためNPを消費するskillのmodifierを適用した直後に、NP不足を無視してattack NPを実行できる。

raw productionには、`NP_HIGHER`を持つskill variant、固定NP消費、NP全消費、自己NP増加が存在する。
特定サーヴァントだけを除外せず、宝具前有限planのresource semanticsとして扱う。

### 8.2 Canonical action semantics

使用条件とresource mutationを分離する。

```ts
interface PreparationActionSemantics {
  requirements: readonly PreparationRequirement[];
  resourceMutations: readonly PreparationResourceMutation[];
}

type PreparationRequirement = {
  kind: 'resourceAtLeast';
  resource: 'npGauge';
  valuePermyriad: number;
};

type PreparationResourceMutation =
  | {
      kind: 'decreaseClamped';
      resource: 'npGauge';
      valuePermyriad: number;
    }
  | {
      kind: 'increaseClamped';
      resource: 'npGauge';
      valuePermyriad: number;
    };
```

`NP_HIGHER=100`かつ`lossNp=30000`は「NP300%を要求する」意味ではない。100%以上で使用可能かを
先に判定し、その後300%減少を0でclampすることで「NPをすべて消費」を表現する。

### 8.3 Preparation state

```ts
interface PreparationResourceState {
  npGauge: {
    currentPermyriad: number;
    capacityPermyriad: number;
  };
}
```

resource stateは`PreNoblePhantasmState`とsemantic fingerprintへ含める。新しい汎用resource frameworkを
先に作らず、production上の必要性が確認できた`npGauge`だけを閉じたunionとして導入する。

skill reducerはrequirement、resource mutation、choice、proc、effect、form transitionをcandidate state上で
検証し、全体が成功した場合だけcommitする。非攻撃transform NPはNP100%以上を要求して消費し、attack NPは
終端でNP100%以上を要求する。

### 8.4 Ranking resource policy

推奨policyは次のとおりである。

- `通常のみ`: 全員が開始NP100%、外部NP供給なし。
- `成立込み`: 実際のNP gauge capacity内で、planを成立させる開始NP候補を有限生成できる。
- 自身のskillによるNP増減は、どちらもordered actionとして反映する。
- NP不足をfieldやtarget conditionと同様の外部factで補わない。
- 候補選択ではdamageの次に、外部仮定数、追加開始NP量、action数、stable keyを使う。

`成立込み`でもNP Lv由来のcapacityを超える開始NPを生成しない。開始NPを増やしても、NP全消費後に
再充填できないplanはattack NPへ到達しない。

### 8.5 Calculator

resolved scenarioは開始NPを暗黙のglobal定数ではなく`preparationContext`として明示する方向を推奨する。

```ts
preparationContext: {
  initialNpGaugePermyriad: 10_000;
}
```

第一段階ではcalculatorの常設入力を増やさず、100%を明示的な既定scenarioとして保存する。NP条件を持つ
火力効果が選択された場合だけ詳細入力を提示する案は将来拡張とし、rankingの条件項目には追加しない。

## 9. 代表例の期待挙動

| 対象 | 自己バフ | 条件効果 | 期待挙動 |
| --- | --- | --- | --- |
| ジャンヌ〔オルタ〕の通常全体攻撃力アップ | あり | 通常のみ | 本人へ適用 |
| ジャンヌ〔オルタ〕の〔竜〕限定効果 | あり | 成立込み | 本人のintrinsic trait不一致なら非適用 |
| ネモの水辺／虚数空間Artsアップ | あり | 通常のみ | 条件寄与を除外 |
| ネモの水辺／虚数空間Artsアップ | あり | 成立込み | 矛盾しないfield witnessで適用可能 |
| 水着リリスの自己生成状態を読む特攻 | あり | 通常のみ | stateは保持し、特攻寄与を除外 |
| 水着リリスの自己生成状態を読む特攻 | あり | 成立込み | ordered grant後にconsumerを適用 |
| トネリコの無条件20%とHP段階 | あり | 通常のみ | 無条件20%だけ適用 |
| トネリコの無条件20%とHP段階 | あり | 成立込み | 一つのHP witnessで成立する累積値を適用 |
| ブレエリのランダム攻撃力アップ | あり | 通常のみ | 条件寄与を除外 |
| ブレエリのランダム攻撃力アップ | あり | 成立込み | proc成功かつNP消費後にattack NP可能なplanだけ適用 |
| 自身が生成したfieldを読む後続効果 | あり | 通常のみ | field stateは保持し、条件寄与は除外 |
| 自身が生成したfieldを読む後続効果 | あり | 成立込み | derivedAction witnessとして適用 |

最後の二行はADR-020の「自前生成fieldはfield inactiveでも適用する」契約からの意図的なpolicy変更候補である。
採用前にproduction差分を全件提示して承認を得る。

## 10. Canonical condition planning

`成立込み`はeffectの任意部分集合を探索せず、damage-reachable requirementから有限なworld候補を作る。

```text
AttackProfile
  -> damage-reachable conditional requirementsを収集
  -> typed target / field / input / stochastic候補を生成
  -> global constraintで矛盾を除外
  -> preparation resource candidateを設定
  -> single transactional reducerでordered planを実行
  -> canonical executorでdamageを計算
  -> 同一AttackProfile内で最大候補を選択
```

複数条件を同時成立させる場合も、一つのTargetContext、field set、input set、resource stateとして表現する。
候補0件は`impossible`、未知semantics、曖昧性、探索上限超過はtyped failureとし、通常値へfallbackしない。

選択順は次を推奨する。

1. damage
2. external assumption数
3. baselineからのinput deviation
4. preparation action数
5. transition数
6. stable typed candidate key

## 11. Layer ownership

### data-pipeline

- Atlas raw condition、target、field、proc、choice、`NP_HIGHER`、`lossNp`、`gainNp`を解釈する唯一の層
- typed condition requirement、resource requirement／mutation、evidenceへ正規化
- target team、recipient、固定消費、全消費を名称やdetail文字列から推測しない
- 未知値、曖昧なtarget、conditionとmutationの不整合をartifact生成時に拒否

### master-data／schema

- canonical condition family、witness provenance、preparation resource contractを保持
- scenarioには利用者／policyの一次入力だけを保存
- derived field、targetState、current form、resolved skill、selected NP、validation結果は保存しない
- 配列順序、重複、範囲、identityをschemaで検証

### battle-execution

- immutableなcondition contextとresource-aware preparation stateを所有
- action requirement、resource mutation、state mutation、modifier、evidenceをtransactionalに適用
- execution outcomeをranking policyから独立して返す
- executable stateとrejected stateを型で分離

### calculation-application

- `RankingComparisonPolicy`をcompile
- self contribution、conditional contribution、resource候補を所有
- world candidate、finite preparation plan、AttackProfile grouping、stable selectionを所有
- calculatorとrankingで同じscenario service／reducer／executorを使う

### Web／worker

- Webは5項目をdispatchし、canonical evidenceを表示するだけにする
- workerはrequest orderingとcacheを所有し、effect conditionを解釈しない
- label、tooltip、servant IDからcondition familyを推測しない

## 12. 移行方針

採用時は次の単一構造へ破壊的に移行する。

1. `RankingConditions.specialAttack`と`RankingConditions.field`を削除する。
2. `RankingConditions.conditionalEffects: 'baseline' | 'satisfied'`を追加する。
3. URL、worker message、cache key、test matrixを新policyへ置換する。
4. special attack worldとfield worldの上位に一つのcondition plannerを置く。
5. target resolver、field resolver、condition evaluator自体はtyped domain serviceとして再利用する。
6. NP resource semanticsをpreparation reducerへ追加する。
7. ranking側でeffect inclusion、condition fact、resource stateを再構築する旧経路を削除する。
8. 旧URL parameter、reader fallback、互換flag、旧fixtureを残さない。
9. 採用判断を新ADRへ記録し、ADR-018とADR-020の該当policyをsupersedeする。

新しいpackageは原則追加しない。既存責務内のfocused moduleへ分割し、ranking orchestrator、engine、Web componentへ
条件分岐を集積しない。

## 13. 性能・テスト要件

### 13.1 Unit／domain fixture

- intrinsic conditionはpolicyで変更されない
- external／derived condition contributionのbaseline／satisfied
- self policyとconditional policyの4組み合わせ
- 矛盾するtarget／field candidate
- 自己生成field／targetStateはstateへ残り、寄与だけpolicyで変わる
- fixed NP consume、consume-all、gain、clamp、capacity
- resource requirement不足、cost後のattack NP不足
- cost後に自己NP増加してattackへ到達する合法順序
- non-attack transform NP後のresource state
- choice／proc／resource／modifierのatomic rollback
- rejected actionを数値結果へ読み替えない

### 13.2 Production ratchet

masterを一度だけload／compileした共有inventoryから次を検証する。

- condition family別effect／operation／owner件数
- resource requirement／mutation別skill／servant件数
- 全AttackProfileの通常／成立、自己バフあり／なし、NP1〜5 matrix
- calculator／ranking canonical parity
- implementation unsupported、inputRequired、partial commit、inert control
- 採用condition witnessと適用effectの整合
- 旧特攻／field policyからの全damage・順位・entry差分

代表goldenだけを個別fixture化し、全production masterをtest caseごとに再load／再compileしない。

### 13.3 性能gate

- effect subsetの`2^N`探索を再導入しない
- damage-reachable condition signatureだけを候補化する
- world／resource candidateをcanonical keyでdeduplicateする
- prepared damage inputとNP1〜5 matrixだけをcacheし、evidenceをcacheしない
- 変更前後でproduction ranking、全Vitest、entry生成、policy matrixを同一環境で比較する
- 主要suiteまたはhot pathが理由なく10%を超えて悪化した場合は設計未完了として停止する
- 候補上限の緩和やtest timeout延長だけで性能gateを通さない

## 14. 実装前の設計判断

次を承認してからproduction実装へ進む。

| 論点 | 推奨案 | 影響 |
| --- | --- | --- |
| UI名称 | `条件効果: 通常のみ／成立込み` | 特攻・field以外も含むことを明確化 |
| 自己生成condition | 通常のみでは寄与を除外、成立込みで許可 | ADR-020からdamage差分が生じる |
| 確率／choice | 成立込みで最大の合法結果を候補化 | 通常順位からランダム最大値を除外 |
| 開始NP | 通常100%、成立込みはcapacity内の合法候補 | NP Lvにより成立可能planが変わり得る |
| HP／quantity | 通常は固定baseline、成立込みは有限候補 | 最大ポテンシャルmodeの意味が広がる |
| calculator NP入力 | scenarioへ明示し、常設UI追加は保留 | share/save parityを先に確保 |
| 旧URL／保存 | fallbackなしで拒否 | schema移行は破壊的になる |

特に「自己生成field／targetStateを通常のみで寄与させるか」と「成立込みで開始NPを変更できるか」は、
順位へ直接影響する製品判断である。実装者が作業中に独断で決めない。

## 15. 実装停止条件

次を検出した場合はその場で例外分岐を追加せず、実装を一度止めて全体設計とproduction inventoryを再確認する。

- servant ID、名称、effect labelによる補正が必要になった
- 一つのcondition modeで矛盾するworld factを同時成立させる
- execution preconditionをcontribution policyが上書きする
- rankingとcalculatorで別のresource／condition evaluatorが必要になった
- 正常planの一部operationだけがcommitされる
- 新旧policyまたは新旧scenarioをruntimeで併存させる必要が出た
- damage差分をcanonical inputとwitnessで説明できない
- production candidate数またはtest時間が想定外に増加した
- UIを二項目へ減らすためにdetail evidenceを失う

停止時は、症状単位の修正案ではなく、影響するsemantic family、全production件数、責務重複、候補となる
単一構造、意図的damage差分、性能見積もりを提示してから再開判断を求める。

## 16. 完了条件

- ranking UIの火力条件が`自己バフ`と`条件効果`の二項目へ収束している
- 特攻／fieldの旧独立入力、URL parameter、fallbackが0件
- execution、source contribution、conditional contribution、resource legalityが型で分離されている
- 全candidateが一つの矛盾しないscenarioとordered planを持つ
- NP条件を持つskillがNP不足を迂回してattack NPへ到達しない
- 通常のみでconditional contributionの混入が0件
- 成立込みで成立可能なconditional effectの欠落が0件
- intrinsic不一致を成立込みで捏造する経路が0件
- implementation unsupported、partial commit、stale mutationが0件
- calculator／ranking parity差分が0件
- 全damage差分がsemantic ruleとcondition witnessで説明され、承認されている
- PC／390px／320pxで横overflowがなく、閉じた一覧行の情報密度が維持されている
- production rankingと全test suiteが性能gateを満たす
