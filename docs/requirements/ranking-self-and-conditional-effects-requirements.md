---
title: "ランキング自己バフ・条件効果統合仕様"
document_version: "0.11.2"
status: "Active"
approval: "approved"
approved_at: "2026-10-08"
updated_at: "2026-10-08"
created_at: "2026-08-30"
related_adrs:
  - "docs/adr/030-ranking-basis-and-certain-contributions.md"
  - "docs/adr/028-canonical-source-program-and-finite-ranking-domain.md"
  - "docs/adr/027-portable-calculation-request-and-ranking-presentation.md"
  - "docs/adr/018-ranking-comparison-policy.md"
  - "docs/adr/019-ranking-contribution-and-execution-plan.md"
  - "docs/adr/020-ranking-condition-provenance-and-field-policy.md"
  - "docs/adr/024-pre-noble-phantasm-plans-and-attack-profiles.md"
  - "docs/adr/025-canonical-target-state-damage-semantics.md"
implementation_tasks: "docs/tasks/development-redesign-tasks.md"
---

# ランキング自己バフ・条件効果統合仕様

2026-10-03の最終製品判断は[§20](#20-2026-10-03の最終製品判断)を正本とする。§4〜7／17の比較基準・通常寄与・action admissionに相違がある場合は§20を適用する。旧条件の歴史的承認と実装済み証拠を新方針の受入へ読み替えない。比較基準と確定寄与の現行ADRは[ADR-030](../adr/030-ranking-basis-and-certain-contributions.md)。具体的な実装差とproduct／UI／ADRへの伝播・受入はTSK-14で追跡する。

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
2. 一つの数値は、一つの矛盾しないportable calculation requestとordered planから生成する。
3. rankingとcalculatorは同じmaster、reducer、condition evaluator、damage executorを使う。
4. ranking policyはexecution outcomeやconditionを改変せず、候補生成とdamage contributionを制御する。
5. UI上の二軸を、domain上の二つのbooleanとして実装しない。
6. servant ID、名称、effect label、raw Atlas keyによるruntime分岐を追加しない。
7. 旧policyとの後方互換のために新旧経路を併存させない。
8. 完全な戦闘シミュレーターへ拡張せず、宝具直前の有限な準備phaseだけを扱う。
9. published masterに存在するplayableな攻撃宝具は全AttackProfileを計算対象とする。`unsupported`は将来の未知semanticsを
   fail-closedにする型であり、現行production inventoryの順位外を完了状態として許容するための分類ではない。

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
  | { status: 'inputRequired'; inputs: readonly RequiredInput[] }
  | { status: 'invalid'; issues: readonly ExecutionIssue[] }
  | { status: 'unsupported'; issues: readonly ExecutionIssue[] };
```

- `unavailableUnderPolicy`: 正しいprofileだが、選択条件では攻撃宝具まで到達できない。
- `inputRequired`: supported semanticsを実行するためのcanonical inputが不足している。値を推測せず、calculatorへ
  同じAttackProfileと不足inputを渡す回復commandを提示する。
- `invalid`: malformed IR、矛盾した利用者state、planner invariant違反等のsemantic invalidityである。
- `unsupported`: canonical semanticsは存在するが、現在のengineでは完全に評価できない。

非数値outcomeを0 damage、通常値、別profileへfallbackしない。数値ランキングは`calculated`だけを並べる。

現行published masterについては、全playable AttackProfileが各合法なproduction policyで`calculated`へ到達することを
release gateとする。`unsupported`型はschema-legalな将来fixtureとmaster更新時の安全停止のために残すが、現行masterの
`unsupported`、`invalid`、`inputRequired`を「理由付き順位外」として受け入れない。policyそのものが攻撃宝具への到達を
禁止する場合だけ`unavailableUnderPolicy`を許容し、その到達不能性はtyped proofを持たなければならない。

この契約を満たすためのresource／quantity stateは、宝具直前の有限な準備phaseに必要なreaderだけをcanonical IRへ追加する。
trigger scope、damage relevance、effect timingを実行前に正しく判定し、damageに到達しないoperationをprofile全体の
unsupported理由へ昇格させない。HP、NP、battle point等の値がdamageまたは到達可能性を変える場合は、選択した比較basisから
導出できるtyped initial stateとordered mutationで評価し、もっともらしい定数やservant固有分岐で補完しない。

## 4. 利用者向け条件

ランキング上部の計算条件は次の7項目に限定する。

1. 対象: `全サーヴァント | 保有サーヴァント`
2. レベル: `自然上限 | Lv.90統一 | 保有レベル`
3. 宝具Lv: `NP1 | NP2 | NP3 | NP4 | NP5 | 保有宝具レベル`
4. クラス相性: `等倍 | 相性有利`
5. 自己バフ: `なし | あり`
6. 条件効果: `通常のみ | 成立込み`
7. 初期OC: `1 | 2 | 3`

対象、レベル基準、宝具レベル基準は直交するcanonical stateとする。`保有サーヴァント`は比較母集団だけを
絞り込み、レベル、宝具レベル、Fou、skill Lvを暗黙に一括変更しない。`保有レベル`と
`保有宝具レベル`は対象が`保有サーヴァント`の場合だけ選択できる。対象が`全サーヴァント`の状態でこれらを
保持するURL、worker request、portable requestは不正であり、自然上限やNP1へfallbackしない。

最低／平均／最大の表示metric、class／rarity／card／scope／所持状態等の一覧filterは表示stateであり、上記7項目の
計算条件へ含めない。表示stateの変更だけではscenarioを再計算しない。

旧`特攻なし | 成立`と`フィールドなし | 成立`は`条件効果`へ破壊的に統合する。旧入力を非表示state、URL fallback、
内部互換flagとして残さない。

### 4.1 既定値

- 対象: 全サーヴァント
- レベル: 自然上限
- 宝具Lv: NP1
- クラス相性: 等倍
- 自己バフ: あり
- 条件効果: 通常のみ
- 初期OC: 1

### 4.2 共通の固定条件

二軸へ統合しても、全entryの比較条件は次へ統一する。

- `自然上限`: 各サーヴァントのcanonicalな自然上限Lvを使用する
- `Lv.90統一`: 全entryをLv.90のcanonical ATKへ揃える
- `保有レベル`: 保存済みの当該サーヴァントLvだけを使用し、欠落値を自然上限やLv.90で補完しない
- `NP1`〜`NP5`: 全entryへ指定値を使用する
- `保有宝具レベル`: 保存済みの当該サーヴァント宝具Lvを使用する。NP0は数値ランキングへ含めず、欠落値をNP1で補完しない
- Fou ATK+1,000、skill Lv10。保有サーヴァントでも保存済みFou／skill Lvへ暗黙に切り替えない
- 初期最大HPは選択Lvのcanonical master HP＋固定HPフォウ1,000。礼装HPは含めない。HPフォウは2026-09-08に明示追加した製品条件であり、ATKフォウ設定から推論しない。編集UIは追加しない
- 属性等倍、HP100%、スター0、初期turn、Battle Point 0
- 礼装、魔術礼装、支援なし
- 外部field、外部target state、追加target traitなし
- `通常のみ`の人数、stack等の定量入力はcanonical baseline値。`成立込み`の宣言済みmaximumは5.2に従う
- 準備actionから攻撃宝具までは同一turn
- turn経過、effect期限切れ、skill再使用なし

初期最大HPと戦闘中の最大HP増減は別の意味論として扱い、後者は共通executorの順序付き状態更新で処理する。
master HPの欠損を0やATK由来の推定値で補完しない。通常計算機の礼装HPを含む条件は
[効果実行要件の初期最大HP契約](damage-effect-execution-requirements.md#31a-初期最大hpの固定条件)に従う。

固定条件は一つの`RankingComparisonPolicy`が所有し、Web、worker、testへ複製しない。
将来、保存済みFou／skill Lv等を含む完全な保有育成状態を比較する場合は、レベル／宝具レベル基準へ混ぜず、
別のtyped build basisとして要件を追加する。

## 5. 二軸の意味

### 5.1 自己バフ

自己バフは、攻撃役の任意skillを候補化するsource policyと、そのskillに由来するdamage contributionを含めるかを
制御する。action admissionとcontribution inclusionは同じ判定ではない。

`あり・通常のみ`で候補化するのは、少なくとも一つの無条件かつ確定的な実効寄与を持つskill actionである。
canonicalに表現されたデメリット、negative modifier、HP／NP消費、detrimental stateの存在自体をadmission除外条件に
しない。選択policyの合法な初期state候補ごとにaction全operationと後続の攻撃宝具をordered transactionとして実行し、
最後まで到達できたcandidateだけをdamage比較へ残す。AttackProfileへ到達するために必要なform／NP variantの構造actionは、
damage寄与がなくても別の`structuralRequired`として保持する。

- 攻撃力、card性能、宝具威力、特攻付与等の自己強化
- 本人がrecipient条件を満たす味方全体効果
- 攻撃対象へ付与する防御力低下等のdebuff
- 利用者が確定的に選べるskill branchのdamage modifier

条件付き寄与だけを持つactionは`通常のみ`の候補へ入れない。無条件寄与と条件付き寄与を同じskillが持つ場合はactionを
候補化し、無条件寄与だけを含める。条件付きsiblingがあることを理由に無条件寄与を失わない。

`なし`では、任意skill由来のdamage modifierだけを反実仮想として除外する。次は維持する。

- legal initial formとform transition
- NP variant、card、scope、倍率、damage function
- passiveとform intrinsic trait
- NP固有の強制的な宝具前effect
- ordered action、state mutation、activation evidence

`なし`はskillを使用しなかった戦闘stateへ巻き戻す機能ではない。AttackProfileへ到達する構造actionを保持したまま、
任意skill由来のdamage寄与を除外する。policy上no-opとなる任意actionは候補へ残さない。

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

stack可能なdamage増幅条件についてdata pipelineがcanonical最大回数を宣言している場合、`成立込み`はその最大回数を
quantity witnessとして使用する。application／Webがservant ID、名称、effect labelから上限を補正してはならない。
これはskill再使用やturn経過を一般シミュレーションする契約ではなく、準備phase開始時の明示的なstack count assumptionで
あり、detail evidenceへ回数と由来を表示する。最大回数が欠落、矛盾、support上限外の場合はbaseline countへfallbackせず
`invalid`または`unsupported`とする。排他条件や他のquantityとの整合は同じglobal constraint validationを通し、
共存不能な最大値を合算しない。

自己バフ`あり・成立込み`は、通常候補を包含した上で、追加condition witnessにより実効寄与を持つactionも候補化する。
両modeとも表現済みcostは無視せずordered transactionで適用し、具体的な初期stateからattack NPへ到達できないcandidateは
`unreachable`として採用しない。一つでも合法に完遂できるcandidateがあるactionを、デメリットの分類だけで全体除外しない。
未解釈のデメリットは成立可能と推測せず`unsupported`としてfail-closedにする。

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
| あり | 通常のみ | 無条件・確定的に有効で、表現済みデメリットを含め最後まで実行可能なself skillを含む標準性能 |
| なし | 成立込み | 任意skill modifierを除いた条件付き宝具性能 |
| あり | 成立込み | 通常候補と追加条件付き寄与を持つactionを、全cost込みの一つの合法scenarioで比較した理論最大火力 |

二軸は利用者選択とportable ranking identityでは独立に保持するが、domainの二つの独立projectionではない。
action admissionは二軸の組み合わせ、選択branch、AttackProfile、ordered pathから一度だけcompileする。NP固有効果や
passiveでも条件付き寄与なら条件効果policyに従い、任意skillでも無条件かつ確定的な寄与なら自己バフpolicyに従う。

### 5.5 自己バフなしのcondition-enabler action

`selfBuffs = excluded × conditionalEffects = satisfied`で、任意skillがdamage modifierを直接持たず、
target state／field等を生成してattack-NP固有のconditional contributionを成立させる場合でも、
`structuralRequired`以外の任意skill actionはadmitしない。contribution originがattack NPであることを理由に、
自己バフsource policyで除外したoptional actionを復活させない。これにより「自己バフなし」はoptionalな
任意skill不使用に収束し、condition軸がdamage contributionのoriginを使ってaction admissionを上書きしない。

structuralRequired actionは上記と別である。攻撃AttackProfileへ到達するため必須なactionのmutationはself軸で
rollbackせず、そのmutation後にattack-NP寄与が成立するかは選択したcondition policyと同じexecutorで評価する。

### 5.6 代表ケース

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
| 無条件寄与とNP消費を伴うskill | あり | 通常のみ | 選択した開始NPから消費後にattack NPへ到達不能なら、そのcandidateだけを除外 |
| 無条件寄与とHP消費を伴うskill | あり | 通常のみ | HP消費をcommitし、後続attack NPまで合法に完遂できるcandidateを候補化 |
| 条件付き寄与とNP消費を伴うskill | あり | 成立込み | 選択した開始NPから、消費後もattack NPへ到達できるcandidateを候補化 |
| 条件付き寄与だけを持つsafe skill | あり | 通常のみ | policy上no-opとして候補化しない |
| 無条件＋条件付きsiblingを持つsafe skill | あり | 通常のみ | actionを候補化し、無条件寄与だけを適用 |

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

### 6.4 Action admission

pipelineはraw効果をselected branchごとのcanonical source programへ正規化する。actionとpassive等の
automatic sourceを同じaction transactionへ偽装せず、外側のdiscriminated unionで分ける。actionだけがcommand、
precondition、transaction boundaryを持ち、両variantは同じordered step operationを消費する。pipelineはranking用の
safe／tradeoff判定を発行せず、applicationがclosed operation unionとcandidate pathからadmissionをcompileする。

```ts
type CanonicalSourceProgram =
  | {
      kind: 'action';
      sourceId: CanonicalSourceId;
      actionOptionId: CanonicalActionOptionId;
      command: CanonicalPreparationCommand;
      preconditions: readonly CanonicalRequirement[];
      steps: readonly CanonicalExecutionStep[];
    }
  | {
      kind: 'automatic';
      sourceId: CanonicalSourceId;
      source: CanonicalAutomaticSourceKind;
      steps: readonly CanonicalExecutionStep[];
    };

type CandidateLocalActionRole = 'structuralRequired' | 'optional';
type CandidateLocalActionAdmission =
  | { kind: 'admitted'; role: CandidateLocalActionRole }
  | { kind: 'policyNoOp'; proof: 'noEffectiveContributionUnderPolicy' }
  | { kind: 'unreachable'; reason: ReachabilityReason }
  | { kind: 'unsupported'; reason: UnsupportedReason };
```

`structuralRequired`はaction固有のstatic classificationではない。同じform transitionが、あるAttackProfileには必須、
別AttackProfileには任意となり得るため、AttackProfile、initial state、完全なordered pathからcandidate-local
roleとして導出する。prefixだけから後続到達性を推測しない。

自己バフ`あり・通常のみ`は、選択AttackProfileへ無条件かつ確定的な実効damage contributionを少なくとも一つ持つ
任意actionをpolicy上relevantとしてadmitする。自己バフ`あり・成立込み`は、追加condition witnessで実効寄与を持つ
actionもadmitする。どちらもbeneficial／detrimental、modifierの正負、HP／NP costの有無をadmission verdictに使わない。
表現済みconsequenceはtransaction全体へ適用し、resource残量、action precondition、AttackProfile到達役割、後続action、
攻撃宝具の成否を初期stateごとのordered executorで評価する。完遂不能な具体candidateだけを`unreachable`とし、別の合法な
初期state候補で完遂できるaction optionまで全体除外しない。

ordered step operationはpipeline-owned closed unionで、少なくともresource、HP、state、form、fieldの
mutation、damage contribution、根拠付き`boundedPhaseIrrelevant`、`unsupported`を区別する。admission用の
`consequences`要約とexecution用の`mutations`列を並存させず、applicationもexecutorも同じordered operation列を読む。
raw function名をapplicationへ渡さない。意味を失った`nonDamage`や未分類副作用を無デメリットまたは
`boundedPhaseIrrelevant`へ推測せず、`unsupported`としてfail-closedにする。

policy projection後に実効寄与も構造遷移も持たない任意actionは、plannerだけが
`noEffectiveContributionUnderPolicy`のtyped proofを発行して除外できる。実効寄与を持つactionの具体candidateが
precondition、HP／NP cost、後続action、攻撃宝具のいずれかで完遂不能な場合はexecutorの結果から`unreachable`にする。
未表現operationは`unsupported`であり、aggregatorはaction relevanceや成立可能性を推測しない。

### 6.5 Closed operation inventory

`CanonicalStepOperation`は次のclosed unionとする。pipelineはraw functionをこのunionへ全件変換し、raw名をartifactの
実行分岐へ残さない。

```ts
type CanonicalStepOperation =
  | CanonicalResourceMutation
  | CanonicalStateMutation
  | CanonicalActorMutation
  | CanonicalDamageContribution
  | {
      kind: 'boundedPhaseIrrelevant';
      proof:
        | 'accountOrDropOnly'
        | 'cooldownWithoutReuse'
        | 'commandCardOutsideTerminalNp'
        | 'enemyChargeOutsideDamage'
        | 'postTerminalDamageOnly'
        | 'presentationOnly'
        | 'noBattleStateChange';
    }
  | {
      kind: 'unsupported';
      reason:
        | 'dependentResourceAmount'
        | 'partyCompositionMutation'
        | 'unresolvedOperation'
        | 'unresolvedTarget';
    };
```

`CanonicalResourceMutation`が扱うresourceは現在のbounded phaseに必要な`npGauge | hp | criticalStars |
battlePoint`だけである。`CanonicalStateMutation`はrecipient trait／buff、field、duration／countを、
`CanonicalActorMutation`はform／NP variantを扱う。依存target数等からamountを一意に正規化できないoperationは
`unsupported`であり、もっともらしい固定値へ変換しない。`boundedPhaseIrrelevant`はraw family名ではなく、終端attack
NP一回、skill再使用なし、通常攻撃なしというphase境界から機械検証できるproofを必須とする。

current productionの`nonDamage` 9,124 operationsは9,123 raw effect occurrencesから生じる（一つのeffectが二operationを
発行）。raw effect occurrenceのclosureはresource 1,164、state／field 5,213、typed unsupported 21、
bounded-phase-irrelevant 2,725であり、未分類0件とする。この値は実装時に一回compileした共有inventoryでratchetする。

## 7. 実行と寄与

### 7.1 単一の準備phase

評価する行動列は次に限定する。

```text
legal initial actor form
  -> 0..N回の合法なself skill action（各slot最大1回）
  -> 0..1回の合法なnon-attack transform NP
  -> 1回のattack NP（終端）
```

`N`はactive servant skillだけのcanonical slot domainから導出し、サーヴァント別定数にしない。active skill、
passive、mystic codeでslot schemaを共用しない。support、礼装、魔術礼装、通常攻撃、
NP回収、turn進行、cooldown回復はこのplanへ含めない。

source別artifact schemaは次の境界を持つ。上限はcurrent productionを包含しつつbounded preparationを有限にするproduct
schemaであり、範囲外の将来データは黙って切り捨てずartifact生成をfail-closedにする。

| Source | Slot | Effects/source | Player-choice groups | Candidates/group |
| --- | --- | ---: | ---: | ---: |
| active servant skill | `1 | 2 | 3` | 24以下 | 1以下 | 5以下 |
| passive | field自体を持たない | 16以下 | 0 | 0 |
| attack／transform NP | field自体を持たない | 20以下 | 1以下 | 3以下 |
| craft essence | field自体を持たない | 16以下 | 0 | 0 |
| mystic-code skill | `1 | 2 | 3` | 4以下 | 1以下 | 5以下 |

player choiceとstochastic outcomeは別unionであり、上表のchoice上限をproc outcomeへ流用しない。複数の独立
player-choice groupを一actionへ含むartifactはpipelineで拒否する。action optionはchoiceなし、または唯一のgroupから
一candidateを選んだselected branch全体であり、sibling operationを個別選択しない。

一つのtransactional reducerが、requirement、choice、proc、resource、effect、state mutation、form transition、
NP variant selectionを順に検証する。actionの一部だけをcommitしない。

### 7.2 Executionとcontributionの分離

executorはaction transaction、そのordered step、mutation／damage contributionをnested resultとして返す。

```ts
interface CanonicalExecutionStep {
  stepId: CanonicalStepId;
  activation: CanonicalStepActivation;
  operations: readonly CanonicalStepOperation[];
}

interface CanonicalDamageContribution {
  contributionId: CanonicalContributionId;
  presentationGroupId: CanonicalEffectId | null;
  source: 'voluntarySkill' | 'passive' | 'attackNp';
  evaluation: CanonicalContributionEvaluation;
}
```

`CanonicalStepOperation`はmutation、damage contribution、bounded-phase-irrelevant、unsupportedの一つである。
contributionが参照するapplicability requirement、value expression、input readは`evaluation`が所有する。
`intrinsic | unconditional | conditional`の同期enumを別fieldに持たず、applicationはこのcanonical evaluatorの
typed read ownershipからcondition policyを一度だけcompileする。NP baseとconditional special、HP基礎値と
HP依存deltaのようにpolicyが分離する単位はpipelineが別contributionとして発行する。

policy decisionは各contributionに対してself、condition、areaViewを独立に記録し、単一の`excludedBy...`へ潰さない。
ただしaction admissionは二軸を組み合わせて先に一度だけcompileする。damageへ寄与するのは、source programと
stepが正常に評価され、contributionが成立し、三decisionがすべてincludedの場合だけである。condition falseやproc
failureによるstepの正常な非適用はaction failureではない。それ以外のapplied siblingは同じaction transactionで
commitできるが、invalid／unsupported／resource failureでactionの一部だけをcommitしない。同じcontributionがselfと
conditionの両方から除外されても、detailとauditは両理由を保持する。

ranking policyは`unresolved`、`procFailed`、`conditionNotMet`、`targetMismatch`等のexecution reasonを
「計算外」へ再分類しない。表示集約はoperation順や最初のeffectではなく、executionと独立したpolicy decisionsから
安定決定する。

required inputはordered readerの構造から扱う。action preconditionはtransaction前、effect requirementはそのstep、
contribution valueはincluded contributionへ到達した時だけ読む。short-circuit、選択済みbranch、mutation後stateを反映した
actual readだけから`inputRequired`を発行する。execution前にmutation後truthを推測してexact live setを作らず、除外済み
contributionだけが読むinputを要求せず、execution preconditionまたは保持mutationへ到達するinputをpolicyで消さない。
同じcanonical input keyを複数readerが共有できるが、別のdependency node／edge／read-point graphは正本にしない。

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

ランキングは初期OCを明示的に選択する。初期OCは準備開始時のNP gaugeであり、発動時OCの固定値ではない。

- 初期OC 1／2／3を開始NP 100%／200%／300%へ一意に変換する。既定値は1。
- NP1は初期OC1、NP2〜4は1〜2、NP5は1〜3を選択可能とする。capacityはcanonical NP resourceから導出する。
- 通常のみ／成立込みのどちらも選択した開始NPを固定し、候補探索で増減・最大化しない。
- 外部支援、宝具チェイン、初期OC4／5、「最大化」、自前OCアップの個別toggleは追加しない。
- 自前のNP増減とOC段階アップは既存の自己バフ／条件効果policyに従ってordered executionで評価する。
  発動時OCは準備後のgauge由来base OCと適用可能なOC加算から導出し、上限5とする。
- 指定宝具Lvと初期OCが矛盾する入力は拒否する。UIの宝具Lv変更で初期OCの修正が必要なら、変更commandが
  初期OC1への変更を明示して一括適用し、変更後の選択値を表示する。parser／workerで黙ってclampしない。
- 保有宝具Lvが混在する場合は初期OCを共通条件として保持し、capacity不足のentryを理由付き
  `unavailableUnderPolicy`とする。個別に初期OCを下げて比較条件を変えない。
- 有効な開始stateからattack NPまで到達できないplanは`unavailableUnderPolicy`とする。
- detailとcalculator引継ぎは選択初期OC、開始NP、発動時OCと自前効果の根拠を保持・表示する。
  任意%の開始NP editorは追加しない。
- resolved calculatorも初期OC1／2／3を選択し、同じcapacity規則と共通executorで発動時OCを導出・表示する。
  新規requestの既定値は初期OC1（開始NP100%）。manual計算は最終OC1〜5の直接指定を維持する。
  ranking由来の開始NPは11.4の明示resetまで維持する。

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

NP command自体のgauge消費とOC導出はskillのNP増減から分離する。発動直前かつ全消費前のgaugeからbase OCを導出し、
canonicalなOC段階アップeffectの対象、条件、加算段階、回数、有効期間をordered executorで評価する。
初期OC1でも自前NP増加によりbase OCが上がり得る。OC段階アップはgaugeやNP capacityを増やさない。
非攻撃・変身宝具を含め、実際のNP使用時に適用・回数消費し、失敗transactionや再計算で二重適用・消費しない。
欠落・矛盾したOC semanticsを無効果やOC1へfallbackしない。

resource stateはpreparation stateとsemantic fingerprintへ含める。現時点ではNP gaugeだけを閉じたresource unionとして扱い、
将来用途を想定した汎用resource frameworkを先に作らない。

## 10. Candidate planning

### 10.1 候補生成

```text
AttackProfile
  -> policy別ActionAdmissionPlan
  -> selected branch全体を持つlegal action options / preparation plans
  -> damage-reachable condition requirements
  -> typed target / field / quantity / stochastic / resource candidates
  -> global constraint validation
  -> transactional reducer
  -> canonical damage executor
  -> policy result
```

effectの任意部分集合を探索しない。action admission、canonical world、排他的branchを含むordered planを先に作り、
そのworldで成立するeffectをexecutorが一括評価する。成立込みでも、異なるtarget／field／choice候補の局所最大を後から
合算しない。一つの合法scenarioに共存する寄与だけで最終damageを比較する。

一skill内に複数の独立player-choice groupを許す場合は、action optionが各groupのcandidateを一つずつ持つ完全な
Cartesian selectionを表す。productが一groupだけに限定する場合は、pipelineがschema境界でそれ以外を拒否する。
production 0件やplannerの固定capをこの制約の根拠にしない。

finite completenessはactive slot数、action option／choice数、ordered program数、target／field／quantity／input／
stochastic各domainのproduct上界から導出する。pipeline/application compilerは各`AttackProfile × ranking policy × NP
level`について、admission後の全ordered programごとにlive dimension cardinalityを掛け、その和を記録した
`FiniteRankingDomainCertificate`を`PreparedRankingContext` constructionの一部として生成する。certificateは次を満たす。

- active slotは各1回までだが順序を区別し、choice candidateはbranch全体として数える。
- target、field、quantity、canonical input、stochastic outcomeはdamage-reachableなlive requirementだけをdimensionにする。
- canonicalなstack可能damage増幅条件はbaseline countと宣言済みmaximum countを区別し、成立込みではmaximum countを
  候補へ含める。一般のquantity conditionを一律に最大値へ書き換えない。
- actionが生成するstate／fieldはworld witnessとして捏造せず、ordered mutationでだけ到達する。
- class、attribute、family、trait、state、field、choiceのcompatible／exclusive literalを一つのconstraint setで検証する。
- `unknownTruth`はcandidateのtrue／falseへ展開せず、明示input不足なら`inputRequired`、解釈不能なら`unsupported`とする。
- profile／policy／NP levelごとの完全上界は4,096以下とする。超過contextはtyped `unsupported`であり、一部candidateの数値を返さない。
- runtime materialization件数はcertificateの上界と一致しなければ`invalid`とする。4,096はtruncate用capではない。

現productionの最大は2,880／4,096であり、上限緩和を必要としない。current runtimeの独立した512 preparation-state
capはcertificateと二重のcorrectness boundaryになるためcutoverで削除し、context constructorとruntime assertionへ
置き換える。小さなschema-legal fixtureでは全tupleを直接列挙するoracleとplanner結果を一致させる。

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

排他的player choiceはbranch内のmodifier値ではなく、cost、後続state、攻撃宝具への到達可能性を含むscenarioの最終
平均damageで比較する。同率時だけ上記tie-breakを使う。

### 10.4 Candidate dispositionとoutcome集約

materializeしてexecutionへ渡したcandidateの結果と、canonical domain constructionで候補にしなかったstateのproofを
同じunionへ入れない。

```ts
type CandidateDisposition =
  | { kind: 'omitted'; proof: CandidateDispositionProof }
  | { kind: 'deduplicated'; retainedStateId: CanonicalStateId };

type CandidateExecutionOutcome =
  | { status: 'calculated'; result: CalculatedResult }
  | { status: 'inputRequired'; inputs: readonly RequiredInput[] }
  | { status: 'unreachable'; reason: ReachabilityReason }
  | { status: 'invalid'; issues: readonly ExecutionIssue[] }
  | { status: 'unsupported'; issues: readonly ExecutionIssue[] };
```

`unknownTruth`のうち、supported semanticsが明示的なcanonical user inputだけを欠く場合だけ`inputRequired`へ写す。
plannerが有限生成するtarget／field／state／quantity／stochastic witnessは利用者の未入力として扱わない。候補母集団は
ActionAdmissionPlanとcanonical domainがadmitしたstateに限定し、生成対象外の任意tupleをprofile blockerへ数えない。
profile aggregatorはtyped dispositionを消費するが、新たな到達可能性、上界、requirement truthを推測しない。

## 11. UI／表示

### 11.1 一覧

- 閉じた行へ個別condition、開始NP、field、target入力を追加しない。
- 対象、レベル基準、宝具レベル基準を独立controlとして表示し、保有限定値は対象が保有サーヴァントのときだけ有効にする。
- `参考サイト基準`、`現在戦力`のように反映範囲を過大に示す名称は使わず、`自然上限`、`Lv.90統一`、
  `保有レベル`、`保有宝具レベル`と表示する。
- 現在の二軸は見出しに`自己バフあり・条件効果成立`のように表示する。
- 特攻badge等は実際にdamageへ寄与したeffectだけから導出する。
- policy除外、条件不成立、確率失敗、未対応を同じ「計算外」へ潰さない。
- detail開閉や表示filter変更で主damageを再計算しない。

非数値outcomeは数値rowと分け、回復可能性を偽らない。

| Outcome | 表示／command |
| --- | --- |
| `unavailableUnderPolicy` | 選択policyではattack NPへ到達できない理由を表示する。別profileや0 damageへ置換しない |
| `inputRequired` | 不足inputを表示し、同じAttackProfileのnormal calculatorを開くcommandを提供する。ranking数値は生成しない |
| `invalid` | invalid reasonを表示し、原因に対応するreset／reloadだけを提示する |
| `unsupported` | engine未対応semanticsを表示する。入力変更で直る状態として扱わない |

### 11.2 Detail evidence

採用した場合だけ、一つの「成立条件」領域へまとめる。

```text
成立条件
・対象: 〔混沌〕
・フィールド: 水辺
・対象状態: 混乱
・初期OC: 2（開始NP 200%）
・発動時OC: 4（自前効果によるOC+2）
・確率結果: 攻撃力アップ成功
```

条件がなければ領域を省略する。AttackProfile、initial／terminal form、NP variant、ordered action、effect適用理由を
同じcanonical evidenceから表示する。

寄与判定はraw `contributionId`や内部enumを利用者へ表示しない。canonical presentation groupごとにまとめ、各寄与の
自己バフ、条件効果、エリア表示、最終適用結果を独立した人間向けlabelで示す。複数の内部contributionへ分割された
一つのlogical effectを重複計数せず、policy除外済み寄与も理由付きでdetailへ保持する。

### 11.3 UI品質

- 既存の一覧密度とaccordion構造を維持する。
- desktop、390px、320pxで横overflowを出さない。
- keyboard、accessible name、expanded state、focus orderを維持する。
- calculator UIへ開始NP入力やランキング専用condition editorを追加しない。

### 11.4 Calculator handoff（approved 2026-09-01）

採用ranking calculationは`CALC-PORTABLE-001`の`PortableCalculationRequest`としてcalculatorへ渡す。

- ranking applicationのpure constructorがcurrent master／engineをrequestの`versionContext`へ固定し、
  `executionIntent.origin: ranking`を生成する。
- 採用scenarioをrequestのscenarioとする。
- `candidateEvidence.startNpGauge`をresolved execution intentの`initialNpGauge`とする。
- resolved portable intentは`calculator`と`ranking`のdiscriminated unionにする。ranking variantだけが自己バフ軸と
  条件効果軸を独立に保持する。通常calculatorはranking policyを流用せず、明示scenarioで成立した寄与を通常評価する。
- 条件効果`成立込み`のworld facts、canonical inputs、ordered commandsは採用scenarioが保持する。
- `DamageContributionProjection`、operation IDの集合、ranking row、modifier合計をhandoff payloadへ保存しない。
- calculatorはapplicationのportable request entrypointでprojectionを再compileし、ranking detailのresult、effect、
  condition、procと一致させる。

引き継いだ開始NP、contribution intent、master／engine versionは非編集値として結果近傍へ表示する。scenario編集後も明示的な
「通常の計算条件へ戻す」commandまでは維持し、暗黙に`100% + standard`へ戻さない。通常条件へ戻した後は
ranking intentをhidden stateへ保持しない。開始NP editor、contribution policy editor、汎用resource editorは
追加しない。

handoff parityはexecution parityと分ける。portable二軸schemaへ破壊的に切り替えるTaskは、pure constructorだけでなく
実Webのdirect request writerと最小immediate handoff parityも同じcutoverで閉じる。TSK-07はnotice、recovery interaction、
cache、responsive／a11yを検証する。draft restore、history finalize／copy、share
URL／JSON、backup export／import、fingerprint、version upgradeは`CALC-PORTABLE-001`で検証する。master／engine
incompatibility、request／result version不一致、capacity超過、旧schema shareはfail-closedにする。

### 11.5 Worker／detail cache（approved 2026-09-01）

cacheはkeyだけでなくvalue、lifetime、owner、maximum cardinalityを次で固定する。

| Cache/state | Owner | Key | Value | Lifetime / maximum |
| --- | --- | --- | --- | --- |
| ranking summary | worker | context identity + canonical 6-field fingerprint | rows + typed exclusionsだけ | worker context内の直近成功1件。context変更で破棄 |
| detail evidence | worker | N/A | cacheしない。requestごとに選択entryだけmaterializeして返す | 0件 |
| active detail | React | request ID + fingerprint + entry ID | 現在開いている1件のdetailまたはtyped error | close、condition変更、context変更で破棄。最大1件 |
| in-flight detail | React | request ID + fingerprint + entry ID | request identityだけ | 置換／close／condition変更／context変更で無効化。最大1件 |

applicationのUI summary型はrows、typed exclusions、summary inventoryだけを返し、`RankingPolicyDetail`や
`profileResults`を含めない。audit用のprofile resultはUI summaryと別のapplication API／artifactで生成する。
worker summary cacheへcandidate evidence、scenario、effect、trace、projectionを保持しない。detail responseは
request IDとfingerprintの両方が現在値に一致する場合だけReactへ適用する。TSK-08のprepared damage matrix／
NP1〜5 cross-level cacheは本契約へ先取りしない。

## 12. Layer ownership

### data-pipeline

- raw Atlas condition、target、proc、choice、resource、transformを解釈する唯一の層
- player choiceとstochastic outcomeをtyped IRへ分離
- target、recipient、resource単位、固定増減／全消費を根拠付きで正規化
- action／automatic sourceを分け、selected action optionごとにpreconditionとordered step operationをlosslessに
  正規化する。resource／HP／state／form／field mutation、damage contribution、bounded-phase-irrelevant、
  unsupportedは一つのclosed operation unionに収束させ、ranking admission verdictは発行しない
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
- canonical source program／step operationとcandidate-local pathからのActionAdmissionPlan
- finite preparation plan、condition candidate、各damage contributionのself／condition／area decision
- stable candidate selectionとprepared damage matrix cache
- portable requestのdiscriminated execution intentからadmission／contribution policyをcompileする唯一の層

### Web／worker

- Webは7項目をdispatchし、presentation modelを描画するだけ
- workerはrequest ordering、stale response破棄、cacheを所有
- summary cacheはevidence-freeな直近1件、detail evidenceはworker 0件／React最大1件
- raw condition、effect label、servant IDから意味論を再構築しない

## 13. 移行方針

1. [ADR-028](../adr/028-canonical-source-program-and-finite-ranking-domain.md)をsource-program、finite domain、portable
   identityのaccepted decisionとし、ADR-019／027はhistorical recordとして`superseded`にする。
2. `RankingConditions.specialAttack`と`field`を削除する。
3. `conditionalEffects: 'baseline' | 'satisfied'`を追加する。
4. player choice／stochastic outcome、action precondition、NP resource、ordered step内のmutation／damage contributionを
   pipelineでcanonical化し、admission用consequence要約とexecution用mutationの二重modelを作らない。
5. active servant skill、passive、mystic codeのschemaを別型にし、active slotとaction option／choice／world
   domainをbounded preparation productと一致させ、範囲外をpipelineでfail-closedにする。
6. ActionAdmissionPlan、condition planner、per-contribution decision、nested execution resultへ一括移行する。
7. portable schema、fingerprint、全direct reader／writer、persistence、resetをdiscriminated intentへ一括移行する。
8. URL、worker protocol、cache key、test matrixを新contractへ置換する。
9. 旧`comparisonMode`を母集団、レベル基準、宝具レベル基準へ破壊的に分離し、7入力のURL、worker、fingerprint、
   portable identityへ一括移行する。
10. stack可能damage増幅条件のbaseline／maximum countをpipeline IRへ追加し、application witnessとexecutor評価へ接続する。
11. rankingによるeffect decision、condition fact、resource stateの再構築を削除する。
12. 旧URL reader、旧portable reader、operation-ID projection、compatibility flag、旧fixture、旧policy fallbackを削除する。
13. artifact、master schema、scenario schema、engine versionを実際の契約変更に合わせて一度だけ更新する。

新しいpackageは原則追加しない。既存のlayer責務内でfocused moduleへ分割し、orchestrator、worker、React componentへ
条件分岐を集積しない。

## 14. 実装前production audit

次は推測で固定せず、実装開始前に一度の共有master compileから全数監査する。

| 監査対象 | 確認内容 | Gate |
| --- | --- | --- |
| selection | player choice／stochastic／複合conditionの全occurrence | 未分類・raw形状推測0件 |
| source program／step operation | action／automatic、resource、HP、state、form、field、damage contribution、bounded-phase-irrelevant、unsupported＋candidate-local structural role | 意味を失った`nonDamage`、二重consequence／mutation owner、未分類operation、profile role 0件 |
| condition family | target、field、state、HP、quantity、proc、resource | damage-reachable requirementの欠落0件 |
| stack quantity | stack可能damage増幅条件のbaseline、maximum、source、support範囲 | 上限欠落／矛盾／servant別runtime補正0件 |
| comparison basis | natural-limit／Lv.90 ATK、owned level／NP、NP0／欠落 | 母集団との不正組合せ、暗黙fallback、保存済みFou／skill混入0件 |
| contribution scope | personal、partyWide、partyOther、enemyApplied、external | recipientとの矛盾0件 |
| target candidate | class、attribute、trait、state、family | 矛盾candidate 0件 |
| NP capacity | NP Lv、form、variantごとの導出元 | ID・名称分岐なしで一意に解決 |
| NP skill mutation | gain／loss、固定／全消費、target、単位 | unknown・二重適用0件 |
| NP use／OC | non-attack／attack NPの消費とOC導出 | 選択初期OC・発動時OC・自前加算との矛盾0件 |
| profile可用性 | baselineのみ、satisfiedのみ、両方、どちらも不可 | 暗黙のrow欠落0件 |
| candidate規模 | profile別generated／deduplicated／executed数 | 有限性とcapを構造で説明 |
| damage差分 | 全entry、NP1〜5、四policy組合せ | input、witness、planで全件説明 |
| canonical identity | source、action option、execution step、contribution、presentation group | collision、配列順依存、重複owner 0件 |
| bounded action／world domain | active servant slot、action option／choice、ordered program、target／field／quantity／input／stochastic | active／passive／mystic schema分離、schemaとplannerの範囲差0件、固定capに依存しないcomplete上界、範囲外artifactはfail-closed |

既知のpolicy変更で説明できる差分と、未知semantics／回帰を分ける。前者は本仕様の結果として記録し、後者を
個別補正せず設計gateへ戻す。

## 15. Test／performance gate

### 15.1 Domain tests

- 無条件かつ確定的な実効寄与を持つskill actionは、表現済みデメリットの有無で落とされず、全operationと攻撃宝具を完遂できる通常candidateだけが残る
- conditional-only actionは通常候補へ残らず、mixed siblingの無条件寄与は失われない
- NP／HP消費、negative modifier、detrimental stateを持つactionもpolicy上の実効寄与があり完遂可能なら候補化され、cost後もattack NPへ到達する
- 同じaction optionの到達可能／不能な初期state候補を分け、不能candidateだけが`unreachable`になる
- policy上no-op actionをtyped proofなしに落とさない
- 排他的player choiceは一branchだけを実行し、最終damageで最大branchを選ぶ
- stochastic failure／minimumとsatisfied maximum
- stack可能damage増幅条件のbaseline count／canonical maximum countと、最大回数欠落時のfail-closed
- 全／保有母集団 × 自然上限／Lv.90統一／保有レベル × 指定／保有宝具Lvの合法組合せと不正組合せ
- 低レベル保有サーヴァント、自然上限がLv.90のサーヴァント、NP0、保有値欠落
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

- 全AttackProfile × 自然上限／Lv.90統一 × NP1〜5 × 自己バフ二値 × 条件効果二値
- stableな保有fixtureによる保有母集団 × 三レベル基準 × 指定／保有宝具Lvの合法組合せ
- policy別calculated／unavailable／inputRequired／invalid／unsupported inventory
- 現行published masterの全playable AttackProfileについて、合法なproduction policyでunsupported／invalid／inputRequired 0件
- trigger scope × damage relevance × timing × resource readerの交差inventoryと、順位外理由から実行結果までのfirst-diff
- source／step operation別resource／HP／state／form／field／damage contribution／bounded-phase-irrelevant／unsupportedと
  candidate-local admission inventory
- calculator／ranking canonical parity
- implementation unsupported、partial commit、inert control、stale mutation
- 適用effect、policy除外、表示理由、condition witnessの整合
- 旧policyからの全damage、順位、entry差分

全masterをtestごとに再load／compileしない。共有inventoryから複数assertionを行い、代表familyだけをfocused goldenにする。

### 15.3 Performance

- effect subsetの`2^N`探索を行わない。
- admitted action optionとdamage-reachable condition signatureだけを候補化する。
- semantic stateとworld candidateをcanonical keyでdeduplicateする。
- prepared damage inputとNP1〜5 matrixだけをcacheし、evidenceをcacheしない。
- baselineと同一環境でproduction ranking、全Vitest、entry生成、policy matrixを比較する。
- 主要suiteまたはhot pathが理由なく10%を超えて悪化したら設計未完了とする。
- candidate cap緩和、timeout延長、production assertion削減だけでgateを通さない。
- bounded action／world domainはschemaとplannerで一致させ、範囲外actionを黙って無視しない。
  candidate capは安全ガードにはできるが、schema-legal maximumのcompleteness証明の代替にしない。

## 16. 実装停止条件

次を検出した場合は、その場でcase分岐を追加せず、実装を一度止めて全体設計とproduction inventoryを再確認する。

- servant ID、名称、effect labelによる補正が必要
- player choiceとstochastic outcomeをcanonicalに区別できない
- condition plannerがAttackProfileを変更または混成する
- 一つのcandidateで矛盾するTargetContext／field／quantityを成立させる
- contribution policyがexecution preconditionを上書きする
- NP／HP消費、negative modifier、detrimental state等の表現可能なconsequenceをadverseとして一律除外する
- conditional-only actionを通常候補へ残す
- self／condition／areaの除外理由を一つの排他的statusへ潰す
- 同じdependency expressionをmutation前後で同じtruthとして使う
- 正常actionの一部operationだけがcommitされる
- rankingとcalculatorで別evaluatorが必要になる
- 新旧policyまたはscenario形式をruntimeで併存させる必要が生じる
- damage差分をcanonical input、witness、planで説明できない
- candidate数、bundle、test時間が想定外に増える
- UI二軸化のためにdetail evidenceまたはaccessibilityを失う

停止時は個別caseの修正案ではなく、影響するsemantic family、全production件数、責務重複、単一のcanonical構造、
damage差分、性能見積もりを提示してから再開する。

## 17. 完了条件

- ranking UIが7項目、火力条件が自己バフ／条件効果の二軸へ収束している
- 対象、レベル基準、宝具レベル基準が独立し、保有母集団でも自然上限／Lv.90統一と指定NPを選択できる
- 保有レベル／保有宝具レベルの欠落、NP0、不正な全サーヴァントとの組合せを標準値へfallbackしない
- 初期OCの選択以外に、任意%の開始NP、field、特攻、対象条件の追加editorが存在しない
- 旧特攻／field入力、URL、fallbackが0件
- RankingEntryがAttackProfile単位で、variant／form／scope混成が0件
- player choiceとstochastic outcomeがtyped semanticsで分離されている
- execution、source contribution、condition contribution、resource legalityが型で分離されている
- 通常のみの任意skillは無条件かつ確定的な実効寄与を持ち、表現済みデメリットを含む全operationと攻撃宝具を完遂でき、conditional-only actionの選出が0件
- 成立込みは追加condition witnessを持つactionを同じ到達可能性規則で評価し、未解釈デメリットを成立可能と推測しない
- 排他的branchを同時適用せず、compatibleな特攻、条件効果、fieldを一つのscenarioで最大化する
- self／condition／areaのpolicy decisionが独立に保持される
- 全数値が一つのscenario、ordered plan、TargetContextを持つ
- baseline候補をsatisfied候補集合が包含する
- NP不足、OC不一致、排他矛盾を迂回して数値を返さない
- 通常のみでconditional contributionの混入が0件
- 成立込みで成立可能なconditional contributionの欠落が0件
- 成立込みでcanonical最大回数を持つstack可能damage増幅条件が最大回数で計算される
- contribution detailがraw identityを露出せず、logical effect単位の表示と寄与ごとの独立判定を両立する
- intrinsic不一致の捏造、partyOther混入、policyによる理由改変が0件
- 現行published masterの全playable AttackProfileが数値ランキングへ含まれ、implementation unsupported、invalid、
  inputRequiredによる順位外が0件
- schema-legalな将来unknownは`unsupported`としてfail-closedになり、数値fallbackしない
- partial commit、stale mutationが0件
- calculator／ranking parity差分が0件
- 全damage差分がsemantic ruleとevidenceで説明されている
- desktop、390px、320pxの密度、overflow、keyboard、a11y gateを満たす
- production rankingと全test suiteが性能gateを満たす

## 18. Contract catalog

| Contract ID | Governing sections | Contract |
| --- | --- | --- |
| `RK-IR-001` | 3〜8、12、20 | AttackProfile、condition、choice、resource、action cost、contribution identityをdata pipelineがcanonical typed IRへ収束させる。保存育成basisはapplicationがtyped inputへ解決する。 |
| `RK-EXEC-001` | 9、12、20 | preparationをordered／transactionalに実行し、NP消費後の自前補完を同じ資源stateで判定する。invalid stateとpartial commitをfail-closedにする。 |
| `RK-POLICY-001` | 5〜7、10、11、20 | ranking policyはaction admissionとindependent contribution decisionsを制御し、通常の自前確定寄与と理想火力を§20に従って選ぶ。execution semanticsを再実装しない。 |
| `RK-UI-001` | 4、11、12、20 | Web／workerはcanonical比較stateを扱い、母集団／レベル／宝具Lvと共通／保存育成を明示する。旧policy／URL／protocolを併存させず、既存選択能力を維持する。 |
| `RK-HANDOFF-001` | 11.4、12、20 | 採用ranking calculationと固定した育成basisを版付きportable requestとしてcalculatorへ渡し、application constructorとWeb immediate handoffの責務を分けて同一結果を再現する。 |
| `RK-CACHE-001` | 11.5、12、15.3、20 | summary cacheをevidence-freeにし、比較basis／profile変更をidentityへ反映する。workerのdetail evidence 0件、Reactのactive detail最大1件とstale rejectionを維持する。 |
| `RK-AUDIT-001` | 3.2、14、15、17、20 | 全playable AttackProfile、四policy、NP1〜5と共通／保存育成のparityを共有production inventoryで監査する。現行masterの合法条件で実装unsupported／invalid／inputRequiredによる順位外0件を維持し、選択条件の合法性によるunavailableと区別する。 |
| `RK-PERF-001` | 15.3 | 2^N探索を避け、candidate／damage requestを説明し、主要suiteの10%超の未説明退行を拒否する。 |
| `RK-BUNDLE-001` | 21 | 高速化で配信JS全体を増加させない。同じbuild条件でWorker・共有chunkを含むdistinct assetの非圧縮／gzip bytesを比較し、初期chunkからの移動だけを削減と扱わない。 |
| `RK-UPDATE-001` | 21 | 現行schemaのcanonical masterから操作と共有範囲を導出し、master更新時に旧計算を再利用しない。servant別設定・raw再解釈を追加せず、新しい意味論はcanonical IR／共通executionで扱う。 |
| `RK-FINAL-001` | 17、20 | §20の最終製品判断と17章の有効なUI、IR、execution、parity、damage evidenceをproject closureで全て満たす。 |

## 19. Revision log

| Version | Reason／Contract | Approval | Impacted Tasks | Baseline impact |
| --- | --- | --- | --- | --- |
| 0.7.0 | 既存のranking要件群へstable Contract IDを付与 | approved 2026-08-30: semanticsは0.6.1から不変 | TSK-02.1、TSK-04〜09 | none: 承認状態の変更のみでinventory／digest baselineは変更しない |
| 0.8.0 | versioned portable ranking handoffとbounded evidence-free cacheを追加（`RK-HANDOFF-001`、`RK-CACHE-001`） | approved 2026-09-01: design review at `245d1ee`; approval commitはsemantics不変 | TSK-06.1、TSK-07〜09 | docs phaseはnone。implementationでhandoff、cache inventory、schema／fingerprint artifactが変わる。TSK-08 cross-level cacheとproduction digestは未変更 |
| 0.9.0 | safe unconditional self-skill、conditional theoretical extension、independent contribution axes、five-outcome profile、breaking portable cutoverを確定 | approved 2026-09-02: product direction confirmed in planning review | TSK-06.4、TSK-06.41、TSK-06.5、TSK-07〜09 | implementationでaction／contribution inventory、四policy damage、portable schema／fingerprint、Web handoffが変わる。旧runtimeとの互換pathは追加しない |
| 0.9.1 | 自己バフありを無条件・無デメリットactionへ限定し、成立込みをcompatibleな特攻／条件／field／表現可能costの合法な理論最大値へ固定。structural role、二段階input read、candidate disposition、atomic semantic cutover境界を明確化 | approved 2026-09-02: final product direction confirmed | TSK-06.4、TSK-06.41、TSK-06.5 | 0.9.0の目標を変更せず実装循環を除去。B1〜B4とportableを同一runtime cutoverで切り替え、TSK-06.5は最終証明だけを所有する |
| 0.9.2 | TSK-06.4独立設計監査。product outcomeを維持し、global dependency graphとstatic skill verdictを棄却。action option transaction → effect step → damage contribution、candidate-local admission、discriminated portable intentへ縮小 | approved product outcome retained; internal design Blocking A1／A2 recorded 2026-09-02 | TSK-06.4、TSK-06.41、TSK-06.5 | runtime変更なし。action consequence lossless inventoryとbounded skill-slot schema closureまではTSK-06.4をdoneにしない |
| 0.9.3 | 0.9.2のnested action proposalにあったconsequence／mutation二重owner、passive階層欠落、conditionality同期field、fixed candidate capを再監査。source-program union＋ordered step operationの一本化とfinite domain blockerを記録し、`selfBuffs=excluded × satisfied`のcondition-enabler actionを未解決product decisionとして明示 | retained: fixed product outcomeは不変、未決定cellを推測で閉じない | TSK-06.4、TSK-06.41、TSK-06.5、TSK-07 | runtime変更なし。Blocking A1〜A4とADR-019／027 replacementの完了までdesign closureにしない |
| 0.9.4 | `selfBuffs=excluded × satisfied`のoptional condition-enabler skillをadmitしないと確定。structuralRequired actionのみ保持し、そのmutation後のattack-NP寄与はcondition policyで評価する | approved 2026-09-02: user confirmed the audit recommendation | TSK-06.4、TSK-06.41、TSK-06.5 | runtime変更なし。A4をVerifiedへ閉じ、A1〜A3＋ADR replacementは継続 |
| 0.9.5 | A1〜A3 closure。全`nonDamage` raw familyをclosed step-operation unionへ分類し、source別slot／effect／choice schemaと`FiniteRankingDomainCertificate`を確定。4,096をtruncate capではなくprepared-context support上限とし、current 512 state capを廃止対象へ変更。ADR-028で019／027を置換 | approved 2026-09-02: user requested remaining audit closure; fixed product outcomeは不変 | TSK-06.4、TSK-06.41、TSK-06.5、TSK-07 | runtime変更なし。current production最大2,880のためcandidate cap／timeout緩和なし。IR、schema、certificate、portableはTSK-06.41でatomic cutover |
| 0.9.6 | action admissionを「無デメリット」から「policy上の実効寄与」に修正し、表現済みデメリットを含む全transactionの成立可否を具体candidateのordered executionへ委譲。`policyNoOp`／`unreachable`／`unsupported`を分離 | approved 2026-09-04: user confirmed that only non-executable NP／HP-consumption candidates are dropped and every executable adverse action remains eligible | TSK-06.41、TSK-06.5 | ranking候補と順位は意図的に変わり得る。`unsafeBaselineEffect`相当の静的adverse除外を削除し、全cost込みのcandidate soundnessとproduction差分を再固定する |
| 0.10.0 | 比較対象を母集団へ限定し、自然上限／Lv.90統一／保有レベルと指定NP／保有宝具Lvを直交化。成立込みのcanonical最大stack countと寄与判定detailの人間向け表示を追加 | approved 2026-09-05: user confirmed naming, retained natural／uniform choices for owned servants, owned level and NP level reflection, maximum stack examples, and contribution UI cleanup | TSK-06.42〜06.5、TSK-07 | ranking scenario、URL／worker fingerprint、production matrix、detail UIが変わる。保存済みFou／skill Lvは反映せず、servant固有runtime branchは追加しない |
| 0.10.1 | 現行published masterの全playable攻撃宝具を数値計算対象とし、typed `unsupported`を理由にしたproduction順位外を完了状態として許容しない。有限な準備phaseのtrigger／timing／resource readerをcanonical executionへ収束させる | approved 2026-09-05: user required all attack NPs to be included in the implementation plan | TSK-06.45、TSK-06.5、TSK-08 | planning baselineは433 AttackProfiles中393 calculated／40 unsupported、calculator defaultは422中420 calculated／2 unsupported。実装後は現行masterのunsupported／invalid／inputRequired順位外0件。将来unknownのfail-closed型は維持する |
| 0.10.2 | 初期OC1／2／3を第7条件として固定し、成立込みの開始NP自動最大化を廃止。自前OC加算と発動時OCを分離（RK-IR／EXEC／POLICY／UI／HANDOFF／CACHE／AUDIT／PERF） | approved 2026-09-06: user confirmed initial OC only without external support and requested insertion into the existing plan | TSK-06.44、TSK-06.45、TSK-06.5、TSK-07〜09 | docs phaseはruntime不変。実装時はNP5順位・OC加算damage、schema／URL／worker／portable identity、production digestを意図的に更新する |
| 0.10.3 | 初期最大HPを選択Lvのmaster HP＋固定HPフォウ1000へ明示。通常計算機は装備礼装HPも加算し、canonical成長表から解決する。HPフォウ編集UIなし | approved 2026-09-08: user specified separate ranking／calculator HP conditions | TSK-06.45 | 今回は要件反映のみ。実装時にHP依存damage、canonical master／schema／復元identityを更新する。欠損HPの0補完とATK由来推定は禁止 |
| 0.11.0 | 共通条件と保存育成状態の両対応、自前で確実に成立する通常寄与、合法な組合せ・使用順とNP消費後の自前補完、単体の理想火力を最終製品判断として確定（`RK-IR-001`、`RK-EXEC-001`、`RK-POLICY-001`、`RK-UI-001`、`RK-HANDOFF-001`、`RK-CACHE-001`、`RK-AUDIT-001`、`RK-FINAL-001`）。詳細は§20 | approved 2026-10-03: 利用者が両比較への対応、通常の確定条件採用、成立込みの理想火力・説明文追加不要、合法な組合せとNP消費後の自前補完を明示し、最終意思決定Taskの作成を指示 | TSK-13（決定・実装事実／改修前調査）、TSK-14（実装・正本伝播）。TSK-12の旧ranking文書整合案を分離 | docs phaseはruntime／保存入力／expected／digest不変。実装時は保存育成basis、通常寄与、候補、URL／worker／portable identityと意図的damage差が変わり得る。基準の更新範囲はTSK-13の差分調査で確定し、今回再生成しない |
| 0.11.1 | §20の比較判断をproduct／UIの現行版とADR-030へ結び、旧§4〜7／17との優先関係とTSK-14受入ownerを明記 | retained: 2026-10-03承認の§20を変更せず、文書間の参照と有効範囲だけを同期 | TSK-14のDOC-REV／DOC-CLOSE。TSK-13の歴史判断は保持 | none: 文書相互参照のみ。runtime、固定master／expected、保存schema、既存原artifactは変更しない |
| 0.11.2 | 高速化の配信JS非増加・master更新追従を追加（`RK-BUNDLE-001`、`RK-UPDATE-001`）。現行確認・計画提示を先に行い、具体計画の確認前に実装しない境界を記録 | approved 2026-10-08: 利用者がサイズ非増加・更新追従を求め、この前提で計画と実行プロンプトの作成を指示。個別の共有方式・内部設計は未採用 | TSK-15（調査・計画）。実装Taskは具体計画の確認後に確定 | none: 本改訂は制約と計画境界のみ。runtime／master／schema／expected／digestを変更せず、実装時も正しい意味値と候補完全性を維持する |

## 20. 2026-10-03の最終製品判断

### 20.1 利用者成果と比較基準

- 共通条件での性能比較と、保存育成状態による現在の戦力比較の両方へ対応する。保有母集団への絞込みと育成基準は別の意味として保持する。
- 共通比較では、現行の自然上限／Lv.90統一／保有レベル、指定NP／保有宝具レベルの選択能力を維持する。保存育成状態の比較は、少なくとも保存Lv・NP Lv・Fou ATK・active skill Lvを反映し、固定Fou1000／skill Lv10を保存値の代わりに使わない。
- 再臨・形態・アペンド等の既存保存値が計算に影響する直接経路も調査する。未保存の値のeditorや新しい戦闘機能を、この判断から自動的に追加しない。欠落・不正値はtypedな拒否／不足入力として扱い、共通値へfallbackしない。
- 具体的なcontrol構成、canonical basis schemaとidentityの変更境界はTSK-13の実装事実調査で確定する。既存選択能力の削除はこの承認に含めない。

### 20.2 通常のみと成立込み

- 自己バフあり・通常のみは、選択した比較基準・初期stateから自前の合法なskill組合せと使用順を実行し、確実に成立する寄与を含めた最大火力を採用する。全skill使用を必須にせず、排他的な選択肢を同時使用しない。
- 自己生成field、attacker／target state、marker、HP変化等の条件は、実際のordered executionで確実に成立するなら採用する。条件付きという静的分類だけで除外せず、生成・解除・後続readの順序と実際の適用結果で決める。
- 元々の敵特性・外部field・他者の支援等、選択初期stateと自前行動から確定できない条件を通常へ捏造しない。確率的寄与の成功も通常では仮定せず、確定する部分と確率部分を区別する。
- 成立込みは単体スペックとしての理想火力を採用する。既存のtyped対象条件・確率結果・宣言済み最大stack等のうち、共存可能な候補だけを同じexecutorで評価する。外部support／礼装の採用や、turn経過／skill再使用を一般シミュレーションする機能を追加しない。
- この意味を説明する新しいUIの一文は追加しない。採用条件・使用順・寄与の根拠は既存detail／calculator handoffの責務で保持する。
- 自己バフなしの既存選択能力は維持する。任意自前skillを復活させず、AttackProfile到達に必要な構造actionとNP／passiveの実行結果は既存境界で扱う。

### 20.3 NP資源と合法性

- 選択初期OCに対応する開始NPから、各action使用時点の前提・NP消費／回復・容量上限を順序どおりに適用する。途中のNP低下だけで候補全体を拒否せず、自前skillで補完して攻撃宝具へ合法に到達できる組合せを採用する。
- 直接damage modifierを持たないNP回復・条件生成skillも、後続の採用寄与または宝具到達へ必要なら候補に含める。後続回復で過去のaction使用条件を遡及成立させず、容量clip・排他・死亡・unsupported・rollbackを無視しない。
- 成立込みでも開始NPを暗黙に増やさない。オルガマリーは利用者が挙げた実データ確認対象であり、ID・名称によるruntime例外の根拠ではない。

### 20.4 責務・参考条件・受入境界

data pipelineがrawをcanonical IRへ変換し、applicationが比較基準と合法候補を選び、executionがordered transactionと実際の寄与を決める。calculator／rankingは同じapplication／execution／damageを使い、UI／workerは選択・表示・ordering／cacheだけを扱う。AttackProfile単位を維持し、HP・marker・field等に個別のranking damage evaluatorを増やさない。

参考条件は[神ゲー攻略の宝具威力ランキング](https://kamigame.jp/fgo/%E5%88%9D%E5%BF%83%E8%80%85%E6%94%BB%E7%95%A5/%E5%AE%9D%E5%85%B7%E5%A8%81%E5%8A%9B%E3%83%A9%E3%83%B3%E3%82%AD%E3%83%B3%E3%82%B0.html)を2026-10-03に閲覧した。自前buff／debuff、共通育成、通常と特殊条件の分離を参考にする。同siteは確率buff成功を仮定するが、本決定では通常の確定分と成立込みの成功仮定を分ける。[遊びゴコロの指定ページ](https://asobigokoro.work/Game-strategy-site/fgo-hougu-iryoku-ranking/)は同日の取得が失敗しており、条件を確認済みと扱わない。参考siteの数値を原raw／master／expectedの代替入力に採用しない。

本決定の承認は新runtimeの受入ではない。TSK-13で既存実装・正本・同条件証拠との差を確定し、TSK-14で必要な局所反証、保存復元／入力修復、calculator handoff、対象production差分・同条件性能・固定差分の最終qualityを閉じる。旧baseline／expected／fixtureの意味と母集団を今回変更せず、改修時の意図的差分と適用契約を明示して受け入れる。

## 21. 2026-10-08の高速化制約と計画境界

§20の利用者成果・正しいdamage・採用plan・同点選択・非数値outcomeを維持して、初回rankingの重複計算を減らす。

- 配信するJS全体の非圧縮／gzip bytesを増加させない。同じsource基底・lockfile・Node・build設定・圧縮条件で、Workerと共有chunkを含むdistinct assetを比較する。初期読込と遅延読込を分けて示すが、chunkの移動だけで全体の非増加を満たしたことにしない。高速化のための追加配信データも必要性・bytesを計画で示す。
- 現行schemaで表現できるservant・効果値・choice・form等の更新はcanonical masterから処理する。servant ID／名前別の設定やraw語彙の再解釈を追加しない。共有のidentity・寿命・更新時の破棄条件を明示し、master変更後に旧計算を再利用しない。
- 新しいoperationの意味はdata pipelineと共通executionで対応する。未知の意味論を既知の効果へ読み替えず、型とfail-closedを維持する。ranking独自のdamage evaluatorを追加しない。
- 共通接頭辞、静的コンパイルの再利用、状態DPは調査候補であり、採用済み方式ではない。論理候補数と物理的な実行回数を区別し、候補完全性・Blocking判定・transaction・certainty・receiptの責務を維持する。request内の状態共有と、§15.3で制限するevidence cacheの違いを具体計画で説明する。
- 内部API・型・module境界・不要な旧経路は、より良い実装のため置換・削除できる。変更理由・直接consumer・削除範囲を計画へ示す。保存・portable等の外部契約変更が必要な場合は、利用者への影響と必要な移管を具体計画に含める。既存データの削除や未定義の製品変更を自動的に実施しない。
- まず現行実装の確認と実装計画を提示し、そこで停止する。利用者による具体計画の確認と実装依頼後に実装する。試算を実測改善・サイズ非増加・安全なstate統合の証明へ読み替えない。

調査・計画と次の実装開始条件は[TSK-15](../tasks/development-redesign-tasks.md#tsk-15-ranking高速化の実装確認と計画策定)を正本とする。TSK-14の限定受入を再開せず、TSK-12／R1全体の未達とは別に扱う。
