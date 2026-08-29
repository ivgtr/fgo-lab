# Damage effect implementation-unsupported 0 収束計画

- Status: completed
- Date: 2026-08-26
- Base: `033d5da`
- Scope: 単発宝具ダメージ計算。ランキング統合は含めない。

## 1. 完了契約

productionの攻撃宝具420件と、全user projectionの単独選択について、実装不足を理由とする`unsupported`を0件にする。利用者が決める戦闘状況はcanonical battle-context inputとして入力可能にし、不足は`unsupported`ではなくeffect occurrenceへ結び付いたtyped `inputRequired`として返す。未解決条件の無視、0倍／1倍への置換、先頭候補の採用、通常値へのfallbackは行わない。

既定値はゲーム上の開始状態または現在の単一対象計算から導出できる値だけにする。HP 100%、Battle Point 0、現在turn 1、critical star 0、外部から付与されたstack 0、利用可能なマスタースキル数0を採用する。actor population countは一律値を置かず、canonical populationとpredicateから攻撃役本人・現在対象について保証できる最低値をruntime descriptorへ具体化する。scenarioに明示値がない場合もapplicationがこのpolicyを一度だけ具体化し、executor内で根拠のない値を補わない。

## 2. 現HEAD inventory

現行artifactを現行executorで再計算した。攻撃宝具は420件、既定unsupportedは12騎、user projection単独選択時unsupportedは14騎25 occurrenceである。

### 2.1 既定scenario

| servant | origin / occurrence | raw semantics | damage影響 | 不足 | 共通解決 |
|---|---|---|---|---|---|
| ジャック・ド・モレー `106600` | NP `23291:0` | `attackBeforeFunction`, `Value/Value2` | 宝具前にやけどを付与し、直後のやけど数特攻へ影響 | 参照skill `970869` | build時に参照skillを正規化し、target buff stackを順序付きで追加 |
| アン＆メアリー `202500` | NP damage | HP比例 | NP倍率 | attacker HP | 既定100%、既存HP入力をcanonical quantityへ統合 |
| アシュヴァッターマン `203300` | NP damage | HP比例 | NP倍率 | attacker HP | 同上 |
| アショカ王 `305800` | NP `249:0` | `TriggeredFieldCountTarget/Range` | 敵1体時NP威力+50% | field enemy count | target population input。既定1 |
| アン＆メアリー `400900` | NP damage | HP比例 | NP倍率 | attacker HP | 既定100%、既存HP入力 |
| ビショーネ `506000` | NP `23560:0` | `attackBeforeFunction`, `Value/Value2` | 参照先は表示とNP獲得のみ | 参照skill `970936` | build時解決しcanonical `nonDamage`として順序traceへ保持 |
| 土方歳三 `702500` | NP damage | HP比例 | NP倍率 | attacker HP | 既定100%、既存HP入力 |
| ジョン・ラックランド `1102000` | NP `249:0/1` | `ParamAdd*TargetType`, survival, trait count | NP威力 | 編成内の生存・trait一致actor数 | population count input。本人を含む対象規則はIRへ保持 |
| キングプロテア・オルタ `1102300` | NP `23468:0` | `TypeIndividualityEachFunc` | 使用可能master skill数×20% | available master skill count | master-skill availability count input、既定0、最大3 |
| BBドバイ `2300600` | passive `21987:0` | buff `checkIndvType=4` | 条件成立時attack +10% | partialの誤分類 | signed trait群のORとしてlosslessに正規化しeffect-local decision化 |
| 水着ハベトロット `2801300` | NP `249:0` | target population + survival | 敵数×NP威力 | field enemy count | target population input。既定1 |
| エレシュキガル `3300200` | NP damage | Battle Point phase | NP倍率 | BP | 既定0、既存BP入力。field連動参照skillは別operationで加算 |

### 2.2 user projection単独選択

| family | servant / occurrence | raw semantics | occurrence | 共通解決 |
|---|---|---|---:|---|
| trait provenance | メドゥーサ `22457:0`、ゴルゴーン `22457:0`、ビショーネ `23549:0`、セミラミス `6925:0`、テスカトリポカ `20775:0`、アルジュナ〔オルタ〕 `3683:0` | `IncludeIgnoreIndividuality`, `IncludePassiveIndividuality`, `IgnoreIndivUnreleaseable` | 6 | provenance policyをcondition IRへ保持。effect-local成立は具体traitへ変換せずmodifierだけへ作用 |
| linked trait suppression | 黄飛虎 `9620:0` | `BehaveAsFamilyBuff`, `UnSubStateWhileLinkedToOthers` | 1 | linked buff identityと初期trait suppressionを同effect transactionで実行。中間operationはhidden |
| current turn | 茶々 `194:0`、魔王信長 `147:0` | `ParamAdd`, `ParamMax` | 2 | turn-linear value expression。既定turn 1 |
| trait/buff stack | ビショーネ `23547:0`、キングプロテア `8808:0`、カーマ `7592:0`、水着ハベトロット `23559:0` | `ParamAdd*Individuality`, max count/value | 4 | owner、provenance、trait集合、上限付きcount expression。外部stack既定0、先行operation分を加算 |
| critical star threshold | 水着ハベトロット `23594:0..9` | `StarHigher` | 10 | critical-star condition。0〜99、既定0。10個刻み効果は一つのstar入力から自動判定 |
| referenced skill | 葛飾北斎 `2096:0`、エレシュキガル `21814:0` | `SkillID/SkillLV`, `Value/Value2` | 2 | 参照skill `961313` / `970535`をbuild時解決し、同じordered operationへ展開 |

単独unsupportedのservant別ratchetは現行どおり14騎25 occurrenceである。同じ計算が別のautomatic unsupportedも含む場合、原因を重複計上せずoccurrence identityで集計する。

## 3. canonical IR

### 3.1 battle-context input

`BattleContextInputDefinition`は次を持つ。

- stable canonical key
- kind、owner、scope、subject
- label、description
- integer min、max、stepまたは選択肢
- default valueとdefault reason
- consuming effect occurrence

quantity kindはHP、Battle Point、turn、critical star、trait/buff stack、field population、matching actor population、available master skill countを判別する。動的なtrait/count対象はtyped subjectに保持し、ラベルやraw parameter名からruntimeで復元しない。

matching actor populationはpopulation、alive-only、source predicate、other predicate、matching-trait/matching-clause方式を保持する。scenario入力は最終countであり、executorがsource master traitと現在の宝具対象から導出した保証済み最低値以上でなければならない。ジョン・ラックランドの〔王〕・〔悪〕は別入力、ハベトロットは敵の合計数とし、サーヴァントID別の最低値は持たない。

### 3.2 execution semantics

- `valueExpression`: turn-linear、trait-stack-linear、population-linear、available-skill-linear
- `condition`: star threshold、population range、provenance-aware trait expression
- `state`: buff instance identity、linked dependency、initial trait suppression、stack contribution
- `reference`: build時に解決済みの順序付きcanonical operation列
- `nonDamage`: 参照先を解決した結果、NP damage inputにも後続conditionにも作用しないことが確定したoperation

一effect内の参照operation、state mutation、modifier、evidenceは一つのtransactionで実行する。値、入力、依存のいずれかが欠けた場合は全operationをrollbackする。

## 4. pipelineと依存方向

1. data-pipelineがraw Function、buff、parameter、script、reference skillを解釈する。
2. master IRはraw語彙を含まないtyped condition、quantity、state、reference operationを保持する。
3. calculation-applicationがscenario明示値とcanonical default policyを一つのbattle contextへ解決する。
4. executorはcanonical IRとresolved contextだけを順序付き・transactionalに実行する。
5. UIはapplicationのinput descriptor、projection、commandだけを表示する。

参照skillはAtlasのskill resourceをnormalization入力へ追加し、参照IDとskill levelをbuild時に解決する。欠落、循環、対象不一致、未分類operationはartifact生成失敗とし、runtime fallbackを作らない。

## 5. UIとscenario

通常のサーヴァントでは現行画面を変えない。追加context inputは該当effectまたはNPが存在する場合だけ、結果に近い既存の戦闘状況領域へ表示する。star、turn、stack、対象数、該当actor数、利用可能master skill数はnumber/select controlとし、PC、390px、320pxで同じ順序とkeyboard操作を提供する。

scenarioは`battleContextInputs`をstable canonical keyからinteger valueへのmapとして持つ。共有、保存、復元は同じschemaを使い、一方向version更新する。旧scenarioとのruntime併存は行わない。

## 6. fail-closedと`inputRequired`

- definitionが存在するがresolved valueがない場合は`inputRequired`を返し、damage rowを返さない。
- descriptorにはowner/scope、範囲、default policy、effect occurrenceを含める。
- schema迂回の範囲外値はexecutorでも拒否する。
- effect-local decisionでtrait条件が成立しても、stack数やpopulation数を捏造しない。
- referenced operationの一部だけをcompile／commitしない。

## 7. production ratchet

- `implementationUnsupportedServants = 0`
- `implementationUnsupportedOccurrences = 0`
- `unknownDamageSemanticKeys = 0`
- `missingRequiredInputDescriptors = 0`
- `inertUserProjections = 0`
- `appliedUnsupportedOperations = 0`
- `partialCommittedFailedEffects = 0`
- attack NP 420件が`calculated`またはtyped `inputRequired`へ到達
- 全user projection単独選択が`calculated`またはtyped `inputRequired`へ到達
- servant ID、名前、skill名、labelによるruntime計算分岐0

## 8. 検証とコミット境界

familyごとにnormalizer、schema、executor、application、UI、share/save、fixture、production ratchetを同じ系列で完了し、旧表現を削除してから次へ進む。canonical IR移行時の1,954ケースdigestに加え、収束開始時点でcalculatedだった1,504ケースを固定fixtureから再計算する。unsupportedからexactへ移る対象は別goldenへNP1〜5、final input、operation traceを固定する。

現在calculatedの値が変わる、default policyが一意でない、外部根拠が矛盾する、完全な戦闘simulatorが必要になる場合は実装前に停止する。unsupportedからexactへの新規値はこの停止条件に含めない。
