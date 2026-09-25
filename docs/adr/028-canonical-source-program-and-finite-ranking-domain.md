---
title: "Canonical source programと有限ranking domain"
status: accepted
date: "2026-09-02"
approved_at: "2026-09-02"
amended_at: "2026-09-26"
supersedes:
  - "ADR-019"
  - "ADR-027"
---

# ADR 028: Canonical source programと有限ranking domain

## Context

ADR-019はoperation-ID projectionとranking execution planを、ADR-027は一つのranking contribution intentを持つportable
requestを採用した。その後、自己バフと条件効果を二軸で選び、表現可能なcost、action-generated state、排他的branchを
一つの合法scenarioで最終damage比較するproduct outcomeが承認された。

既存decisionでは、NP baseとconditional specialが一operationに同居し、action admissionとcontribution inclusionを
operation-IDだけで分離できない。また、active skillの副作用は`nonDamage`へ情報を失い、schemaのslot／choice範囲と
plannerの列挙範囲が一致しない。固定candidate capは探索打切りを検出するが、schema-legal maximumの完全性を証明しない。
portable requestも自己バフと条件効果の組合せを一意に再compileできない。

TSK-06.4はfixed product outcomeから設計を再導出し、global contribution graph、action consequence summaryとordered
mutationの二重owner、static skill verdict、compatibility adapterを比較して棄却した。本ADRはそのdesign closureを採用し、
ADR-019／027の有効なrecipient、portable、persistence、presentation／cache契約を新しい単一modelへ再掲して置き換える。

## Decision

### One source program, one ordered operation owner

pipelineは全sourceを次のdiscriminated programへ正規化する。

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
```

skillまたはNP useがtransaction boundaryであり、choice branch、cost、mutation、damage contributionをatomicに扱う。
passive、intrinsic、craft essence、support、mystic-codeの非command sourceはautomatic variantであり、fake actionを作らない。
各stepの一つのordered operation列だけがresource／HP／state／field／form／NP variant mutationとdamage contributionを
所有する。admission用consequence summary、dependency graph、conditionality同期fieldを併設しない。

`CanonicalStepOperation`はresource mutation、state mutation、actor mutation、damage contribution、typed
`boundedPhaseIrrelevant`、typed `unsupported`のclosed unionである。pipelineだけがraw Atlas vocabularyを解釈する。
未分類operationは`unsupported`であり、無デメリットまたはphase外へ推測しない。

current masterの`nonDamage`は9,124 operations／9,123 effect occurrencesである。全effect occurrenceは次へ分類する。

| Canonical family | Occurrences | Raw family disposition |
| --- | ---: | --- |
| resource mutation | 1,164 | fixed NP gain/loss、HP fixed/percent、critical stars、battle point |
| state／field mutation | 5,213 | add/remove/move state、duration/count、field state |
| unsupported | 21 | dependent target/buff-count resource amount、party composition mutation |
| bounded-phase-irrelevant | 2,725 | account/drop、no-reuse cooldown、command-card-only、enemy charge、post-terminal damage、presentation/no-op |

一つの`addStateShort` effectが二つの現行`nonDamage` operationを発行するためoperation数はoccurrence数より一つ多い。
実装時はraw family全件を同じ共有inventoryで再compileし、未分類0件をratchetする。phase外proofは終端attack NP一回、
skill再使用なし、通常攻撃なしというbounded phaseから導出し、raw function名自体をproofにしない。

### Source-specific schema

active servant skill、passive、NP、craft essence、mystic-code skillは別schemaにする。

| Source | Slot | Effects/source | Player-choice groups | Candidates/group |
| --- | --- | ---: | ---: | ---: |
| active servant skill | `1 | 2 | 3` | 24以下 | 1以下 | 5以下 |
| passive | slotなし | 16以下 | 0 | 0 |
| attack／transform NP | slotなし | 20以下 | 1以下 | 3以下 |
| craft essence | slotなし | 16以下 | 0 | 0 |
| mystic-code skill | `1 | 2 | 3` | 4以下 | 1以下 | 5以下 |

current productionはactive 1,427件（max effect 23、choice group 1、candidate 5）、passive 1,253件
（14、0）、NP 727件（17、1、3）、craft essence 2,700件（14、0）、mystic-code skill 84件（3、0）で、
全件がこのschemaへ収まる。activeとmysticのslotは1〜3だけであり、passiveはslot 0を意味として保持せずfield自体を持たない。
範囲外artifactはpipelineで拒否し、plannerが黙ってactionを落とさない。

player choiceとstochastic outcomeは別unionである。一actionのplayer-choice groupは高々一つとし、action optionは
choiceなし、またはそのgroupから一candidateを選んだbranch全体である。複数groupのschema-legal fixtureはproducer
rejectionを期待する。operation／mutation／damage contributionはbranch内で個別選択しない。

### Candidate-local policy and execution

structural roleは`AttackProfile × initial state × complete ordered path`から導出する。static skill propertyではない。
applicationはselected action optionのordered operationを読み、二軸の組合せからaction admissionを一度だけcompileする。
executorは同じoperationを順に適用し、contribution evaluatorへ到達した時だけrequired inputを読む。

2026-09-04 amendment: optional actionのadmissionは、選択policyで実効寄与を持つかだけを判定し、canonical operationの
beneficial／detrimental分類、modifierの正負、HP／NP costの有無を除外条件にしない。admitされたaction optionは、各合法な
初期state candidateから全operationと後続の攻撃宝具までtransactionalに実行する。完遂不能な具体candidateだけを
`unreachable`とし、一つでも完遂可能なcandidateがあるaction optionをstaticなadverse分類で全体除外しない。未表現または
曖昧なconsequenceは成立可能と推測せず`unsupported`とする。condition policyはdamage contributionの包含とwitness domainを
変えるが、この実行可能性規則は変えない。

`selfBuffs=excluded × conditionalEffects=satisfied`はoptionalなcondition-enabler skillをadmitしない。
`structuralRequired` actionだけは保持し、そのmutation後にattack-NP contributionが成立するかをcondition policyで評価する。
policy exclusionはdamage contributionを除くが、正常に実行されたsibling mutationをrollbackしない。

排他的branchはcostと後続stateを含むtransactionとして別candidateにし、final average damageで比較する。effect-local最大値を
合算しない。materialized candidateの`inputRequired`、`invalid`、`unsupported`は、そのcandidateがplanner-owned proofで
omitted／deduplicatedされていない限りprofile maximumをblockする。

### Finite domain certificate

calculation-application compilerは各`AttackProfile × four-policy combination × NP level`について
`FiniteRankingDomainCertificate`を生成する。certificateの上界は、admission後の全ordered programごとに、liveな開始NP、
canonical input、target、field、quantity、stochastic dimensionのcardinality productを求め、その和とする。

action-generated state／fieldはworld witnessへ追加せずordered mutationからだけ得る。target class／attribute／family／trait、
state、field、choiceは同じtyped constraint setでcompatible／exclusiveを検証する。planner-generated witness、明示required
input、unknown truthを別型にし、unknownを有利なtruthへ変換しない。

valid `PreparedRankingContext`は各certificateの完全上界が4,096以下でなければならない。超過はtyped `unsupported`であり、
先頭4,096候補のmaximumを返さない。runtime materialization数はcertificateと一致することをassertし、不一致は`invalid`と
する。したがって4,096はtruncate capではなくprepared-context support boundである。current production最大は2,880であり、
capまたはtimeoutを緩和しない。独立した512 preparation-state capは二重correctness boundaryなのでcutoverで削除する。

小さなschema-legal fixtureでは全tupleの直接列挙oracleとplannerを比較する。productionは一回compileしたcertificate／digestを
共有し、caseごとにmasterを再compileしない。

### One effective application result

battle executionはsource／step／operation outcomeと`EffectiveContributionSet`を返す。damage、candidate selection、row
count、badge、detail evidenceはこの一結果から導出し、requirementまたはprojectionを再評価しない。

contribution scopeの`personal | partyWide | partyOther | enemyApplied | external`はrecipient／presentation分類として保持する。
本人へ実際に適用されたpersonal、partyWide、enemyAppliedは主火力へ含め、partyOtherは含めない。area viewは同一scenarioと
同一execution resultからpartyWide contributionだけを除く反実仮想である。

### Portable execution identity

resolved portable identityは次のdiscriminated intentをscenario、version contextとともに保存する。

```ts
type ResolvedExecutionIntent =
  | { kind: 'calculator'; initialNpGauge: 10000 }
  | {
      kind: 'ranking';
      initialNpGauge: number;
      policy: {
        selfBuffs: 'included' | 'excluded';
        conditionalEffects: 'baseline' | 'satisfied';
      };
    };
```

manual requestは別variantである。compiled operation ID、projection、resolved execution stateは保存しない。applicationだけが
stored intentと一致するcurrent masterからadmission／contribution policyをcompileする。fingerprint、draft、history、share、
backupはrequest全体をidentityに使う。

schema v41ではresolved／manual双方のrequestの`versionContext.schemaVersion`を必須とする。v40 requestにはそのfieldがなく、
旧request／result／fingerprintは歴史的identityとして保持する。v41への明示再計算は新request全体から新fingerprintを作る。
これはportable identityの版境界の明文化であり、ranking条件fingerprintやdamage式の版を兼ねない。

normal calculator resetはsubject／build等の明示入力からfresh calculator scenarioを作り、ranking world、choice、field、state、
canonical inputを引き継がない。version upgradeとは別commandである。schema不正、参照欠落、version不一致、capacity超過は
`invalid`、既知だが未対応のsemanticsは`unsupported`とし、数値へfallbackしない。

schema migrationは一方向・atomicであり、current形式へ完全変換してから保存する。旧reader、dual writer、compatibility flag、
parallel intentをruntimeへ残さない。復元不能なshareは拒否し、履歴runtimeがない正当な旧recordはhistorical-onlyとして
編集／再計算を許可しない。

### Worker and presentation ownership

workerはapplication API、request ordering、stale rejection、cacheだけを所有する。summary cacheはcontext identityとcanonical
condition fingerprintをkeyにした直近成功1件、worker detail cacheは0件、React active/in-flight detailは各最大1件とする。
filter／sort／display metric変更だけでは再計算しない。Webはcanonical presentation modelを描画し、ID、名称、label、raw keyから
semanticsを推測しない。

## Package boundaries

- data-pipeline: raw vocabularyの解釈、source-specific schema、lossless source program
- master-data／schema: typed source program、portable primary inputs。derived execution state／certificateは保存しない
- battle-execution: ordered transactional reducer、condition evaluation、nested operation outcome、effective contributions
- calculation-application: candidate-local admission、finite scenario construction／certificate、profile outcome、portable intent compiler
- worker／Web: bounded cache、ordering、presentation、command dispatchのみ

calculatorとrankingは同じapplication／execution semanticsを使用する。rankingはscenarioを選ぶがdamage evaluatorを持たない。

## Alternatives rejected

- Global contribution/dependency graph: ordered program、requirement、input identityを二重化するため不採用。
- Action consequence summary plus ordered mutations: admissionとexecutionのwrite ownerが分かれるため不採用。
- Operation-ID projection with exceptions: NP base／specialとmixed siblingを分離できないため不採用。
- Multiple player-choice groupsのCartesian product: current productに必要なく、action／test domainを増やすためproducer rejectionを採用。
- Runtime candidate cap／timeout: maximum completenessを証明しないため不採用。prepared-context certificateを採用。
- Old portable intent adapter／fallback: parallel semantic modelになるため不採用。

## Consequences

- TSK-06.4のdesign Blockingは0になる。runtime pathはTSK-06.41へDeferredであり、実装済みとは扱わない。
- TSK-06.41はmaster IR、source schema、application policy、battle execution、portable schema／fingerprint、direct Web writerを
  atomicに切り替え、旧runtimeを残さない。
- TSK-06.5は四policy × NP1〜5のproduction maximum、certificate、small oracle、calculator parity、performanceを証明する。
  新しいsemanticsを追加しない。
- candidate cap／timeout緩和、servant例外、raw runtime branch、compatibility adapterはcompletion手段にできない。
- ADR-019とADR-027は本ADRで全体として置き換え、historical recordとしてのみ保持する。

## Verification evidence

- baseline HEAD: `45878789e77160b0beba0e6c203e72756c5a0383`
- production execution inventory: 13,875 effects／14,623 operations／`nonDamage` 9,124
- source inventory: active 1,427、passive 1,253、NP 727、craft essence 2,700、mystic-code skill 84
- production player-choice maximum: one group; active five candidates、NP three candidates
- current maximum one-profile product: 2,880／4,096
- schema-legal counterexamples and flow closure: `docs/evidence/ranking-policy-candidate-flow-tsk-06.md`

本判断は[ADR-019](019-ranking-contribution-and-execution-plan.md)と
[ADR-027](027-portable-calculation-request-and-ranking-presentation.md)を全体として置き換える。
