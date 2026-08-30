---
title: "ランキング自己バフ・条件効果統合仕様"
document_version: "0.7.0"
status: "Active"
approved_at: "2026-08-30"
updated_at: "2026-08-30"
created_at: "2026-08-30"
related_adrs:
  - "docs/adr/018-ranking-comparison-policy.md"
  - "docs/adr/019-ranking-contribution-and-execution-plan.md"
  - "docs/adr/020-ranking-condition-provenance-and-field-policy.md"
  - "docs/adr/024-pre-noble-phantasm-plans-and-attack-profiles.md"
  - "docs/adr/025-canonical-target-state-damage-semantics.md"
implementation_tasks: "docs/tasks/development-redesign-tasks.md"
---

# ランキング自己バフ・条件効果統合仕様

## 1. WHY

宝具威力ランキングは、個別の戦闘状況を再現する画面ではなく、同じ基準でサーヴァントの火力を比較する画面である。

特攻、field、HP、対象状態、確率結果、人数、NP条件を個別入力として増やすと、比較基準が読み取りにくくなり、
一覧より条件editorが主役になる。一方、内部でもこれらを一つのbooleanへ潰すと、矛盾する条件、実行不能なskill、
異なる宝具variantを組み合わせた誤算が生じる。

そのため、利用者向けの条件は「自己バフ」と「条件効果」の二軸へ集約し、内部では次を独立した契約として保持する。

- どのAttackProfileを比較するか
- どの行動を実行できるか
- 実行によりどのstateが生成されたか
- effectが実際に成立したか
- 成立したeffectを比較policy上のdamageへ含めるか

UIを単純にし、domain modelは正確に保つことが本仕様の目的である。

## 2. 最上位原則

1. 最優先はdamage計算品質である。
2. 一つの数値は、一つの矛盾しないcanonical scenarioとordered planから生成する。
3. rankingとcalculatorは同じmaster、reducer、condition evaluator、damage executorを使う。
4. ranking policyはexecution outcomeやconditionを改変せず、候補生成とdamage contributionを制御する。
5. UI上の二軸を、domain上の二つのbooleanとして実装しない。
6. servant ID、名称、effect label、raw Atlas keyによるruntime分岐を追加しない。
7. 旧policyとの後方互換のために新旧経路を併存させない。
8. 完全な戦闘シミュレーターへ拡張せず、宝具直前の有限な準備phaseだけを扱う。

## 3. 比較単位

### 3.1 Ranking entry

ランキングの比較単位は`Servant × AttackProfile`である。

AttackProfileは少なくとも次のidentityを持つ。

- servant lineage
- terminal ActorFormProfile
- attack Noble Phantasm variant

target scopeとcard typeはAttackProfileの属性であり、一覧filterにも使用する。同じサーヴァントが同一scopeの
異なる攻撃宝具、異なるcard、異なるformを持つ場合は別entryとして保持する。

条件成立探索はAttackProfileを変更しない。NP variant、terminal form、card、scopeが異なる候補を一つのentryへ
混成しない。

### 3.2 Policyごとの可用性

AttackProfile inventoryは比較policyから独立して生成する。各policyで合法な攻撃planが存在するかは、次の型で
別に評価する。

```ts
type RankingProfileResult =
  | { status: 'calculated'; detail: RankingDetail }
  | { status: 'unavailableUnderPolicy'; reason: PolicyUnavailabilityReason }
  | { status: 'invalid'; issues: readonly ExecutionIssue[] };
```

- `unavailableUnderPolicy`: 正しいprofileだが、選択条件では攻撃宝具まで到達できない。
- `invalid`: master、scenario、未知semantics、探索上限等の異常である。

`unavailableUnderPolicy`を0 damage、通常値、別profileへfallbackしない。数値ランキングは`calculated`だけを並べる。

## 4. 利用者向け条件

ランキング上部の計算条件は次の5項目に限定する。

1. 比較対象: `標準比較 | 所持戦力`
2. 宝具Lv: `NP1 | NP2 | NP3 | NP4 | NP5`
3. クラス相性: `等倍 | 相性有利`
4. 自己バフ: `なし | あり`
5. 条件効果: `通常のみ | 成立込み`

最低／平均／最大の表示metric、class／rarity／card／scope／所持状態等の一覧filterは表示stateであり、上記5項目の
計算条件へ含めない。表示stateの変更だけではscenarioを再計算しない。

旧`特攻なし | 成立`と`フィールドなし | 成立`は`条件効果`へ破壊的に統合する。旧入力を非表示state、URL fallback、
内部互換flagとして残さない。

### 4.1 既定値

- 比較対象: 標準比較
- 宝具Lv: NP1
- クラス相性: 等倍
- 自己バフ: あり
- 条件効果: 通常のみ

### 4.2 共通の固定条件

二軸へ統合しても、全entryの比較母集団を揃える条件は変更しない。

- 標準比較: 自然上限Lv、Fou ATK+1,000、skill Lv10
- 所持戦力: 保存済みLv、宝具Lv、Fou、skill Lv。欠落値を標準値で補完しない
- OC1、属性等倍、HP100%、スター0、初期turn、Battle Point 0
- 礼装、魔術礼装、支援なし
- 外部field、外部target state、追加target traitなし
- 人数、stack等の定量入力はcanonical baseline値
- 準備actionから攻撃宝具までは同一turn
- turn経過、effect期限切れ、skill再使用なし

固定条件は一つの`RankingComparisonPolicy`が所有し、Web、worker、testへ複製しない。

## 5. 二軸の意味

### 5.1 自己バフ

自己バフは、攻撃役の任意skillに由来するdamage contributionを含めるかを制御する。

`あり`では、合法な準備actionから得られる次の寄与を含める。

- 攻撃力、card性能、宝具威力、特攻付与等の自己強化
- 本人がrecipient条件を満たす味方全体効果
- 攻撃対象へ付与する防御力低下等のdebuff
- 利用者が確定的に選べるskill branchのdamage modifier

`なし`では、任意skill由来のdamage modifierだけを反実仮想として除外する。次は維持する。

- legal initial formとform transition
- NP variant、card、scope、倍率、damage function
- passiveとform intrinsic trait
- NP固有の強制的な宝具前effect
- ordered action、state mutation、activation evidence

`なし`はskillを使用しなかった戦闘stateへ巻き戻す機能ではない。AttackProfileへ到達する構造的actionを保持したまま、
任意skill由来のdamage寄与だけを除外する。

### 5.2 条件効果

条件効果は、共通の通常条件を超えるrequirementを持つdamage contributionを含めるかを制御する。

対象familyは次を含む。

- target identity／trait／state
- field
- attacker／target HP
- 人数、star、turn、Battle Point、stack等のquantity
- stochastic procと連鎖成功回数
- NP resource condition
- その他のtyped external assumption

`通常のみ`では、これらに依存するdamage contributionを除外する。conditionを生成したstate mutation、field mutation、
ordered action、form transition、evidence自体は削除しない。stochastic outcomeは失敗／最小結果を使用する。

`成立込み`では、同時成立可能なcanonical候補を有限生成し、合法な最大結果を使用する。conditionを無条件にtrueへ
書き換えたり、effectを個別にONへしたりしない。

分類はmodifier名ではなくcanonical requirementで行う。`powerMod`／`npSpecial`というkindだけで条件効果へ入れず、
通常modifierという理由で条件付き寄与を通常扱いしない。

### 5.3 利用者選択と確率結果

排他的な効果を`choice`という一語で扱わない。

```ts
type SelectionSemantics =
  | { kind: 'playerChoice'; group: CanonicalChoiceGroup }
  | { kind: 'stochasticOutcome'; group: CanonicalOutcomeGroup };
```

- `playerChoice`: action planの一部。追加条件がなければ自己バフ`あり・通常のみ`でも候補化する。
- `stochasticOutcome`: condition witness。通常のみは失敗／最小、成立込みは合法な最大を候補化する。

choice branchがfield、target、resource等のrequirementを持つ場合は、branchの選択とcondition成立を別々に評価する。
raw `ActSet`等の格納形式だけからselection semanticsを推測しない。

### 5.4 二軸の組み合わせ

| 自己バフ | 条件効果 | 比較内容 |
| --- | --- | --- |
| なし | 通常のみ | 構造、宝具本体、passive、intrinsic効果を中心とする基礎性能 |
| あり | 通常のみ | 無条件・確定的な自己火力効果を含む標準性能 |
| なし | 成立込み | 任意skill modifierを除いた条件付き宝具性能 |
| あり | 成立込み | 一つの合法scenarioで到達できる最大条件成立火力 |

source軸とcondition軸は直交する。NP固有効果やpassiveでも条件付き寄与なら条件効果policyに従い、任意skillでも
無条件かつ確定的な寄与なら自己バフpolicyだけに従う。

### 5.5 代表ケース

| ケース | 自己バフ | 条件効果 | 期待結果 |
| --- | --- | --- | --- |
| ジャンヌ〔オルタ〕の本人が持たない〔竜〕限定効果 | あり | 成立込み | intrinsic不一致のため非適用 |
| ネモの水辺／虚数空間Artsアップ | あり | 通常のみ | field寄与を除外 |
| ネモの水辺／虚数空間Artsアップ | あり | 成立込み | 一つの合法field候補で適用可能 |
| 水着リリスの自己生成target state特攻 | あり | 通常のみ | stateは保持し、特攻寄与を除外 |
| 水着リリスの自己生成target state特攻 | あり | 成立込み | ordered grant後にconsumerを適用 |
| ダンテの確定的な天／地選択 | あり | 通常のみ | player choiceとして合法な最大branchを評価 |
| ブレエリのランダム効果 | あり | 通常のみ | stochastic damage寄与を除外 |
| ブレエリのランダム効果 | あり | 成立込み | 成功結果とNP resourceを同時に満たすplanだけ適用 |

## 6. Condition model

UIは二軸でも、domainではconditionを次の三種類へ分ける。

### 6.1 Intrinsic fact

identityまたは選択済みAttackProfileから追加仮定なしに確定する。

- attacker class、attribute、gender、alignment、固定trait
- current ActorFormとform-qualified skill／NP
- NP card、target scope、recipient
- concrete TargetContextから導出されるclass／attribute relation

intrinsic factは条件効果policyで変更しない。成立込みでも、本人が持たない〔竜〕等のtraitを追加しない。

### 6.2 Conditional contribution requirement

damage contributionへ条件効果policyを適用するrequirementである。

- target／targetState predicate
- field predicate
- HP／quantity predicate
- stochastic outcome
- resource-gated voluntary skill contribution

condition witnessは`intrinsic | derivedAction | externalAssumption | explicitInput | stochastic`のprovenanceを持つ。
provenanceは説明とtie-breakに使用し、execution outcomeの代わりにしない。

### 6.3 Execution precondition

actionの実行可能性を決める。

- resourceが必要量以上ある
- skill slotが未使用である
- current formにskill variantが存在する
- player choiceが合法かつ排他的である
- transform NPが未使用である
- attack NPを実行できるresourceがある

execution preconditionは両condition modeで常に強制する。ranking policyで上書きしない。

## 7. 実行と寄与

### 7.1 単一の準備phase

評価する行動列は次に限定する。

```text
legal initial actor form
  -> 0..N回の合法なself skill action（各slot最大1回）
  -> 0..1回の合法なnon-attack transform NP
  -> 1回のattack NP（終端）
```

`N`はmasterのcanonical skill slot数から導出し、サーヴァント別定数にしない。support、礼装、魔術礼装、通常攻撃、
NP回収、turn進行、cooldown回復はこのplanへ含めない。

一つのtransactional reducerが、requirement、choice、proc、resource、effect、state mutation、form transition、
NP variant selectionを順に検証する。actionの一部だけをcommitしない。

### 7.2 Executionとcontributionの分離

effect評価は次の二層を保持する。

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

damageへ寄与するのは、executionが`applied`で、両policyが`included`の場合だけである。

ranking policyは`unresolved`、`procFailed`、`conditionNotMet`、`targetMismatch`等のexecution reasonを
「計算外」へ再分類しない。表示集約はoperation順や最初のeffectではなく、executionとpolicyの二軸から安定決定する。

### 7.3 Contribution scope

`personal | partyWide | partyOther | enemyApplied | external`はrecipient／寄与範囲であり、条件分類ではない。

- `personal`: 本人へ適用可能なら主火力へ含める。
- `partyWide`: 本人がrecipient条件を満たす場合は主火力へ含める。
- `partyOther`: 本人へ適用されないため主火力へ含めない。
- `enemyApplied`: 攻撃対象へ正しく適用された場合は主火力へ含める。
- `external`: 支援なしのランキングでは含めない。

エリア寄与は同一scenarioから`partyWide`寄与だけを除外した詳細用の反実仮想であり、ランキング条件軸にしない。

## 8. TargetContext

class、attribute、target identity、trait、state、family predicateを一つのTargetContext候補として扱う。

- concrete identityからclass／attribute relationとpredicateを導出する。
- relative relationとtarget predicateを併用する場合は、実在する有限candidateへ解決する。
- class相性だけ有利、target traitだけ別対象という合成を禁止する。
- 排他的trait、class、attributeを同時成立させない。
- 候補0件は`impossible`とし、通常値へfallbackしない。

条件成立plannerはeffect単位でtargetを最大化せず、一つのTargetContextで成立する全effectを同時評価する。

## 9. NP resource

### 9.1 製品仕様

開始NPを第6のランキング条件または常設UIとして追加しない。

- calculator: canonicalな開始NP100%固定
- ranking通常のみ: 開始NP100%、外部NP供給なし
- ranking成立込み: 選択NP Lvのcapacity内で、必要な開始NP候補を内部生成可能
- 自身のNP増減はordered actionとして評価
- attack NPまで到達できないplanは`unavailableUnderPolicy`
- 採用開始NPはdetail evidenceへ表示できるが編集UIを持たない

NP Lvに応じて開始時NP上限が変わることは公式仕様にも明記されているため、capacityは選択NP Lvとcanonical masterから
導出する（[FGO公式](https://news.fate-go.jp/2025/cil_final_chapter_cp/)）。

### 9.2 Canonical resource semantics

resource requirement、skill resource mutation、NP使用時のresource mutationを分離する。

```text
requirementを検証
  -> action全operationを検証
  -> canonical resource mutation
  -> state/effect/form mutation
  -> 全体をatomic commit
```

raw `NP_HIGHER`、`lossNp`、`gainNp`をruntimeが直接解釈しない。pipelineが単位、target、固定増減、全消費、上限処理を
全production inventoryと根拠からtyped IRへ正規化する。曖昧な値はartifact生成時に拒否する。

NP command自体のgauge消費とOC導出はskillの`lossNp`とは別のsemantic familyとして保持する。ランキングのOC1固定は、
開始NP gaugeから導出されるbase OCを1に固定する意味である。canonicalなOC段階アップeffectは通常のordered executionで
別に評価する。開始NPによるbase OC上昇を暗黙に無視したり、固定100%減算を仮定したりしない。

resource stateはpreparation stateとsemantic fingerprintへ含める。現時点ではNP gaugeだけを閉じたresource unionとして扱い、
将来用途を想定した汎用resource frameworkを先に作らない。

## 10. Candidate planning

### 10.1 候補生成

```text
AttackProfile
  -> legal preparation plans
  -> damage-reachable condition requirements
  -> typed target / field / quantity / stochastic / resource candidates
  -> global constraint validation
  -> transactional reducer
  -> canonical damage executor
  -> policy result
```

effectの任意部分集合を探索しない。effect inclusionを候補生成の入力にせず、canonical worldとaction planを先に作り、
そのworldで成立するeffectをexecutorが一括評価する。

### 10.2 Baseline包含

`成立込み`の候補集合は、同一AttackProfileの`通常のみ`候補を必ず含む。

- 追加条件が成立しなければ通常候補を採用する。
- 条件候補0件とAttackProfile実行候補0件を区別する。
- 通常候補がcalculatedなら、成立込みの同じNP Lv平均damageは通常値未満にならない。
- 未知semantics、曖昧性、探索上限超過を通常候補で隠さない。

### 10.3 候補選択

同一AttackProfile、選択されたNP Lvの中で次の順に選ぶ。

1. 平均damageが大きい
2. external assumptionが少ない
3. baselineからのinput deviationが小さい
4. preparation actionが少ない
5. form transitionが少ない
6. stable typed candidate keyが小さい

NP Lvごとに候補を選び直す。利用者が一覧表示を最低／平均／最大へ切り替えても、採用scenarioは平均damage最大候補から
変更せず、その候補の最低／平均／最大を並べ替えに使用する。

## 11. UI／表示

### 11.1 一覧

- 閉じた行へ個別condition、開始NP、field、target入力を追加しない。
- 現在の二軸は見出しに`自己バフあり・条件効果成立`のように表示する。
- 特攻badge等は実際にdamageへ寄与したeffectだけから導出する。
- policy除外、条件不成立、確率失敗、未対応を同じ「計算外」へ潰さない。
- detail開閉や表示filter変更で主damageを再計算しない。

### 11.2 Detail evidence

採用した場合だけ、一つの「成立条件」領域へまとめる。

```text
成立条件
・対象: 〔混沌〕
・フィールド: 水辺
・対象状態: 混乱
・開始NP: 150%
・確率結果: 攻撃力アップ成功
```

条件がなければ領域を省略する。AttackProfile、initial／terminal form、NP variant、ordered action、effect適用理由を
同じcanonical evidenceから表示する。

### 11.3 UI品質

- 既存の一覧密度とaccordion構造を維持する。
- desktop、390px、320pxで横overflowを出さない。
- keyboard、accessible name、expanded state、focus orderを維持する。
- calculator UIへ開始NP入力やランキング専用condition editorを追加しない。

## 12. Layer ownership

### data-pipeline

- raw Atlas condition、target、proc、choice、resource、transformを解釈する唯一の層
- player choiceとstochastic outcomeをtyped IRへ分離
- target、recipient、resource単位、固定増減／全消費を根拠付きで正規化
- 未知値、曖昧性、重複identityをartifact生成時に拒否

### master-data／schema

- AttackProfile材料、condition requirement、selection semantics、resource semanticsを保持
- scenarioには利用者またはpolicyの一次入力とordered commandだけを保存
- current form、derived state、resolved skill／NP、compiled operation、validation結果を保存しない

### battle-execution

- 単一のtransactional preparation reducer
- immutableなcondition／resource context
- executable stateとrejected stateの型分離
- execution outcomeとevidenceをpolicyから独立して返す

### calculation-application

- RankingComparisonPolicyのcompile
- AttackProfile inventoryとpolicy可用性
- finite preparation plan、condition candidate、contribution projection
- stable candidate selectionとprepared damage matrix cache

### Web／worker

- Webは5項目をdispatchし、presentation modelを描画するだけ
- workerはrequest ordering、stale response破棄、cacheを所有
- raw condition、effect label、servant IDから意味論を再構築しない

## 13. 移行方針

1. 本仕様をsuperseding ADRとして確定する。
2. `RankingConditions.specialAttack`と`field`を削除する。
3. `conditionalEffects: 'baseline' | 'satisfied'`を追加する。
4. URL、worker protocol、cache key、test matrixを一度に置換する。
5. player choice／stochastic outcomeとNP resourceをpipelineでcanonical化する。
6. condition plannerを既存target／field／state resolverの上位へ置く。
7. rankingによるeffect decision、condition fact、resource stateの再構築を削除する。
8. 旧URL reader、compatibility flag、旧fixture、旧policy fallbackを削除する。
9. artifact、master schema、scenario schema、engine versionを実際の契約変更に合わせて一度だけ更新する。

新しいpackageは原則追加しない。既存のlayer責務内でfocused moduleへ分割し、orchestrator、worker、React componentへ
条件分岐を集積しない。

## 14. 実装前production audit

次は推測で固定せず、実装開始前に一度の共有master compileから全数監査する。

| 監査対象 | 確認内容 | Gate |
| --- | --- | --- |
| selection | player choice／stochastic／複合conditionの全occurrence | 未分類・raw形状推測0件 |
| condition family | target、field、state、HP、quantity、proc、resource | damage-reachable requirementの欠落0件 |
| contribution scope | personal、partyWide、partyOther、enemyApplied、external | recipientとの矛盾0件 |
| target candidate | class、attribute、trait、state、family | 矛盾candidate 0件 |
| NP capacity | NP Lv、form、variantごとの導出元 | ID・名称分岐なしで一意に解決 |
| NP skill mutation | gain／loss、固定／全消費、target、単位 | unknown・二重適用0件 |
| NP use／OC | non-attack／attack NPの消費とOC導出 | OC1固定との矛盾0件 |
| profile可用性 | baselineのみ、satisfiedのみ、両方、どちらも不可 | 暗黙のrow欠落0件 |
| candidate規模 | profile別generated／deduplicated／executed数 | 有限性とcapを構造で説明 |
| damage差分 | 全entry、NP1〜5、四policy組合せ | input、witness、planで全件説明 |

既知のpolicy変更で説明できる差分と、未知semantics／回帰を分ける。前者は本仕様の結果として記録し、後者を
個別補正せず設計gateへ戻す。

## 15. Test／performance gate

### 15.1 Domain tests

- deterministic player choiceが通常候補へ残る
- stochastic failure／minimumとsatisfied maximum
- self／condition policyの四組合せ
- intrinsic factをsatisfiedで捏造しない
- TargetContext内のclass／attribute／trait整合
- self-generated field／targetStateはstateへ残り、寄与だけ変わる
- partyWide、partyOther、enemyAppliedのrecipient
- resource requirement、固定増減、全消費、capacity、base OCとOC段階アップ
- resource不足後にattack NPへ到達しない
- choice、proc、resource、effect、transitionのatomic rollback
- baseline包含と同一profileでのdamage単調性

### 15.2 Production ratchet

- 全AttackProfile × NP1〜5 × 自己バフ二値 × 条件効果二値
- policy別calculated／unavailable／invalid inventory
- calculator／ranking canonical parity
- implementation unsupported、partial commit、inert control、stale mutation
- 適用effect、policy除外、表示理由、condition witnessの整合
- 旧policyからの全damage、順位、entry差分

全masterをtestごとに再load／compileしない。共有inventoryから複数assertionを行い、代表familyだけをfocused goldenにする。

### 15.3 Performance

- effect subsetの`2^N`探索を行わない。
- damage-reachable condition signatureだけを候補化する。
- semantic stateとworld candidateをcanonical keyでdeduplicateする。
- prepared damage inputとNP1〜5 matrixだけをcacheし、evidenceをcacheしない。
- baselineと同一環境でproduction ranking、全Vitest、entry生成、policy matrixを比較する。
- 主要suiteまたはhot pathが理由なく10%を超えて悪化したら設計未完了とする。
- candidate cap緩和、timeout延長、production assertion削減だけでgateを通さない。

## 16. 実装停止条件

次を検出した場合は、その場でcase分岐を追加せず、実装を一度止めて全体設計とproduction inventoryを再確認する。

- servant ID、名称、effect labelによる補正が必要
- player choiceとstochastic outcomeをcanonicalに区別できない
- condition plannerがAttackProfileを変更または混成する
- 一つのcandidateで矛盾するTargetContext／field／quantityを成立させる
- contribution policyがexecution preconditionを上書きする
- 正常actionの一部operationだけがcommitされる
- rankingとcalculatorで別evaluatorが必要になる
- 新旧policyまたはscenario形式をruntimeで併存させる必要が生じる
- damage差分をcanonical input、witness、planで説明できない
- candidate数、bundle、test時間が想定外に増える
- UI二軸化のためにdetail evidenceまたはaccessibilityを失う

停止時は個別caseの修正案ではなく、影響するsemantic family、全production件数、責務重複、単一のcanonical構造、
damage差分、性能見積もりを提示してから再開する。

## 17. 完了条件

- ranking UIが5項目、火力条件が自己バフ／条件効果の二軸へ収束している
- 開始NP、field、特攻、対象条件の追加editorが存在しない
- 旧特攻／field入力、URL、fallbackが0件
- RankingEntryがAttackProfile単位で、variant／form／scope混成が0件
- player choiceとstochastic outcomeがtyped semanticsで分離されている
- execution、source contribution、condition contribution、resource legalityが型で分離されている
- 全数値が一つのscenario、ordered plan、TargetContextを持つ
- baseline候補をsatisfied候補集合が包含する
- NP不足、OC不一致、排他矛盾を迂回して数値を返さない
- 通常のみでconditional contributionの混入が0件
- 成立込みで成立可能なconditional contributionの欠落が0件
- intrinsic不一致の捏造、partyOther混入、policyによる理由改変が0件
- implementation unsupported、partial commit、stale mutationが0件
- calculator／ranking parity差分が0件
- 全damage差分がsemantic ruleとevidenceで説明されている
- desktop、390px、320pxの密度、overflow、keyboard、a11y gateを満たす
- production rankingと全test suiteが性能gateを満たす

## 18. Contract catalog

| Contract ID | Governing sections | Contract |
| --- | --- | --- |
| `RK-IR-001` | 3〜8、12 | AttackProfile、condition、choice、resource、provenanceをdata pipelineがcanonical typed IRへ収束させる。 |
| `RK-EXEC-001` | 9、12 | preparationをordered／transactionalに実行し、invalid stateとpartial commitをfail-closedにする。 |
| `RK-POLICY-001` | 10、11 | ranking policyは候補とcontributionだけを制御し、execution semanticsを再実装しない。 |
| `RK-UI-001` | 11、12 | Web／workerはcanonical stateと5入力を扱い、旧policy／URL／protocolを併存させない。 |
| `RK-AUDIT-001` | 14、15 | 全AttackProfile、四policy、NP1〜5、parity、invalid／unsupportedを共有production inventoryで監査する。 |
| `RK-PERF-001` | 15.3 | 2^N探索を避け、candidate／damage requestを説明し、主要suiteの10%超の未説明退行を拒否する。 |
| `RK-FINAL-001` | 17 | 17章のUI、IR、execution、parity、damage evidenceをproject closureで全て満たす。 |

## 19. Revision log

| Version | Reason／Contract | Approval | Impacted Tasks | Baseline impact |
| --- | --- | --- | --- | --- |
| 0.7.0 | 既存のranking要件群へstable Contract IDを付与 | approved 2026-08-30: semanticsは0.6.1から不変 | TSK-02.1、TSK-04〜09 | none: 承認状態の変更のみでinventory／digest baselineは変更しない |
