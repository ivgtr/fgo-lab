---
title: "TSK-06.48 パッケージ別semantic complexity convergence計画"
document_version: "1.0.7"
status: "Active"
created_at: "2026-09-20"
updated_at: "2026-09-20"
task: "TSK-06.48"
baseline_commit: "0c12261"
current_worktree_base: "ee9f00f"
previous_bounded_unit_base: "128189f"
---

# TSK-06.48 パッケージ別semantic complexity convergence計画

## 1. 目的

W0〜W7で固定したcanonical output、ordered execution、ranking candidate、production closureを維持したまま、
パッケージごとの複雑性をsemantic family単位で収束させる。対象は複合`||`、同じunion分類の反復、
一つのtyped変換にまとめられる複数のdomain判断、責務をまたいだraw vocabularyの再解釈である。

package全体の機械的な分割、行数削減、構文を隠す汎用helperの追加は目的にしない。新しい型・関数・
ファイルは、semantic owner、依存方向、状態所有、テスト境界、削除対象を説明できる場合だけ追加する。

## 2. 現在の基点と対象外

- 基点はclean worktreeの`0c12261`（TSK-06.46 W7完了）とする。
- `TSK-06.47`のcontribution presentation、`TSK-06.5`のtheoretical maximum、damage rule、UI機能、
  battle simulatorは本Taskへ取り込まない。
- `TSK-06.47`は`ready`、`TSK-06.5`は`blocked`のまま維持する。本Taskの完了を`TSK-06.5`の前提へ
  暗黙に追加しない。canonical outputが変わり、依存変更が必要になった場合だけTasksへ明示する。

## 3. 第1波: data-pipeline population family

### 3.1 現在の責務

`packages/data-pipeline/src/populationFunctionNormalization.ts::normalizePopulationFunctions`は、次の
判断を一つの再帰コンパイラで行っている。

| 現在の箇所 | 現在の判断 | 変更後のsemantic owner |
| --- | --- | --- |
| 67〜71行 | `enemyAll`、cell存在、rateの入口gate | population function eligibility stage |
| 75〜89行 | `subState`のtrait／条件／cell shape | remove-one candidate classifier |
| 112〜164行 | `addState`のbuff／cell／trait／condition shape | grant candidate classifier |
| 140〜143行 | actor reference、population read、state-only traitの除外 | population state catalogのtyped trait role |
| 155〜171行 | previous writerとcondition producerの後方依存 | population dependency slice compiler |
| 195〜207行 | root候補の選択とpartial slice rollback | population slice transaction owner |
| 97〜192行 | canonical operationとinput生成 | population operation/input builder |

直接の利用経路は`effectNormalization.ts::normalizeFunctions`だけである。生成されたoperationは
`battle-execution/src/populationFunctions.ts::applyPopulationFunctionToState`と
`preparationOc.ts::executePreparationOc`で適用され、`populationCounts.ts`のinput/equivalence semantics
とは別の責務である。

### 3.2 論理和の扱い

- 入口gate、remove shape、grant shapeは、単なるboolean helperへ置き換えず、候補分類のtyped段階で扱う。
- `actorTraitReferences || populationReadTraits || stateOnlyTraits`は、
  `targetStateNormalization.ts`が構築するpopulation trait roleのcanonical分類へ集約する。
- `previousSuccess`、cycle、producer不在、opaque inputのfail-closed条件は意味を持つため残す。
- `all`／`any`の条件走査、provenance互換性、stable comparator fallback、schema narrowingは削除しない。
- `isOneOf`、`processValues`、条件式だけを包む名前不明な汎用helperは追加しない。

### 3.3 第1波の実装境界

対象は次の順序とする。

1. `populationFunctionNormalization.ts`内でcell抽出、remove候補、grant候補、依存解決、operation/input生成を
   typedな内部段階へ整理する。公開関数の引数、返却`Map`、position、input key、operation順序は維持する。
2. `targetStateNormalization.ts`のcatalogを、population grant可否とtrait roleを返せる意味のある境界へ拡張する。
3. `npPopulationNormalization.ts`、`npCountNormalization.ts`、`markerNormalization.ts`は、完全に同じtrait
   identity／catalog分類だけを共有し、population count、buff instance、marker operationそのものは独立所有する。
4. `effectNormalization.ts`はtyped resultを組み立てるだけにし、raw population判断を再解釈しない。

追加または拡張する小fixtureは、remove target／targetState、grantのpreviousSuccess、condition producer、
cycle、actor／field／addTrait除外、trait／traitCount scope、mutation後read、operation position／input keyを対象とする。

### 3.4 population-count bounded unit（2026-09-20完了）

今回のbounded unitは、次の3ファイルだけを変更範囲とした。marker instance、NP transfer、HP、effect normalization全体、
battle operation compiler全体は対象外である。

| semantic | 現在／変更後のowner | 直接consumer |
| --- | --- | --- |
| raw Atlasのfunction type、scope、counting、basis、includePassive、mixed intrinsic／buff identity | `npPopulationNormalization.ts::classifyPopulationCount`、`populationCountInputs` | `effectNormalization.ts`、`npCountNormalization.ts`、`markerNormalization.ts`はcanonical outputのconsumerとして確認のみ |
| canonical scope、input legality、saturation、population event observation、live read | `populationCounts.ts::populationScopeSides`、`populationInputIssue`、`observePopulationEvent`、`readPopulationCount`、既存`populationCountSaturation` | `preparationOc.ts`、`operationCompiler.ts` |
| input definition domain、population tupleのequivalence／representative／dedupe | `rankingCanonicalInputs.ts::isPopulationInputDefinition`、`rankingCandidateSpace.ts::buildPopulationCandidateInputs` | `rankingWorldObservation.ts`、`scenario.ts`、calculator／ranking共通path |

反復unionの分類は、raw function/scope→`PopulationCountPlan`、event→`PopulationEventObservation`、candidate tuple→
`PopulationCandidateInputs`へ集約した。scope、input definition、operationの網羅的union switch、容量0／actor最大値、
未知writer／unsupported overlap、inBattleのmatching mutation拒否、local attacker／targetとquery coverageのboolean条件は
fail-closedまたは網羅性を表すため残した。`all`／`any`再帰、provenance、stable comparator fallback、schema narrowingは削除していない。

fixtureはAtlas scope 0〜4、actorTraits／buffInstances／inBattle、includePassive、mixed identity、grant／remove後live read、
input key／values／operation order、saturation／maximum、candidate equivalence／dedupe／cardinality／cap、calculator／ranking parity、
unsupported／invalid／inputRequiredのfail-closedを固定した。旧W6 recordと80条件×433 profileを比較し、canonical output、condition truth、
operation order、mutation後read、input inventory、candidate inventoryに差分がないことを確認した。詳細なmachine-readable結果は
`docs/evidence/tsk-06-48-population-closure.json`の`currentSemanticOwners`、`currentFixtures`、`currentProductionMatrix`を参照する。

### 3.5 dependent resource transfer／HP bounded unit（2026-09-20完了）

今回のbounded unitは、population-countのcanonical outputとordered executionを維持したまま、NP transferとHP transferの
raw dependent-function共通判定だけをdata-pipeline内へ収束した。現在の実装基点は`46f30a7`であり、直前population unitの
実装基点`49efe62`、W7 baseline、過去evidenceのplanning commitとは分離して記録する。

| semantic | 現在／変更後のowner | 直接consumer |
| --- | --- | --- |
| plain functionのraw key、empty metadata、script policy、cell envelope、child identity、nested value rate／keys | `dependentFunctionNormalization.ts::isPlainDependentFunction`／`parseDependentFunctionCell` | `npTransferNormalization.ts`、`hpNormalization.ts` |
| NP donor、cost／gain、Value／Value2、charge resistance、input cardinality／maximum | `npTransferNormalization.ts::normalizeNpTransfer` | `effectNormalization.ts`、`executionSemantics.ts`、`preparationOc.ts`、`npTransfer.ts` |
| HP scope、enemy-only phase irrelevance、selector、Value、input key／maximum | `hpNormalization.ts::normalizeHpTransfer` | `effectNormalization.ts`、`preparationOc.ts`、`preparationHp.ts` |

NP／HP固有のdomain union、canonical operation、input definition、donor消費、生存下限、receipt、candidate saturationは各packageの
ownerに残した。`effectNormalization.ts`の呼出し順、`DependFunc*`認識、operation/input順序は変更していない。canonical schema、
公開normalizer API、ranking独自semanticsは変更していない。HP childの欠落／非正値`funcId`だけは、NPと同じfail-closed identity境界へ
明示化した。

focused `47/47`、直接consumer `65/65`、NP／HP production audit・parity・path `27/27`、targeted lint、Prettier、typecheckを確認した。
影響matrixは80条件×433 profileを8 shardで実行し、34,640 outcomes、34,600 calculated、typed unavailable 40、unsupported／invalid／
inputRequired 0、parity 34,600/34,600となった。candidate generated／deduplicated 1,028,810、damage requests 967,810、distinct
damage inputs 233,100、最大3,435、cap 4,096で直前closureと一致した。matrix digestはelapsedMsを含む診断値のため、semantic digestと
直接同一視せず、固定production digest・operation/input inventory・support分類・順序・condition truth・candidate inventory・parityの
一致を再利用根拠とする。詳細は[transfer／HP closure](../evidence/tsk-06-48-transfer-hp-closure.json)を参照する。

hot pathの3サンプル診断は`4518.134／4367.958／4437.614ms`、中央値`4437.614ms`、rows 433、exclusions 0、結果digest不変だった。固定性能下限、candidate cap、timeout、既存ratchetは変更していない。

このbounded unitでTSK-06.48全体を完了とはせず、次はeffect normalization／execution-semantics境界とする。最終`pnpm quality`は未実施で、
`TSK-06.47=ready`、`TSK-06.5=blocked`を維持する。

### 3.6 effect normalization／execution-semantics bounded unit（2026-09-20完了）

今回の最小bounded unitは、`effectNormalization.ts::normalizeFunctions`が参照skillのoperation展開後に行っていた
未解決semantic supportの再分類を、`executionSemantics.ts::resolveExecutionSemanticSupport`へ集約した。開始時のGit HEADは
`128189f`であり、直前dependent resource transfer／HP unitの実装基点`46f30a7`とは別の基点として記録する。

| semantic | 現在／変更後のowner | 直接consumer |
| --- | --- | --- |
| canonical input、parameter／scriptのraw evidence、`Value2`の検出 | `effectNormalization.ts::normalizeCanonicalInputSemantics`／`classifyParameterSemantics`／`unresolvedFunctionScriptKeys` | `executionSemantics.ts::resolveExecutionSemanticSupport`、canonical effect record |
| target policy、contribution scope、route | `executionSemantics.ts::normalizeTargetPolicy`／`normalizeContributionScope` | `effectNormalization.ts`、specialized normalizers、`operationCompiler.ts` |
| composed canonical operationのsupport境界 | `executionSemantics.ts::resolveExecutionSemanticSupport` | `effectNormalization.ts`、`operationCompiler.ts`、ordered preparation |
| specialized operation／input domain | 各既存owner（NP／HP／population／marker） | `effectNormalization.ts`、battle-execution |
| ordered operation適用、condition、mutation後read | `preparationOc.ts`、resource／condition owners | `scenario.ts`、`rankingWorldObservation.ts`、ranking |

`effectNormalization.ts`にはraw evidenceの収集と、canonical input→context→specialized operation→condition→recordの合成順だけを残し、
execution semanticsのoperation family分類を再実装しない。support resolutionは参照operation展開後に一度だけ実行するため、参照先の
damage／modifier valuesのlevel selection、operation order、condition truthを変えない。公開normalizer API、canonical effect record、
canonical operation shape、input definition、schema versionは変更していない。

複合`||`の分類は、未解決evidenceをoperation supportへ変換するtyped判断を`resolveExecutionSemanticSupport`へ集約したものが
共通semantic ownerである。OC family、HP modifier／remove／HP resource、damage modifier／rate／ignoreの分類をeffect側から削除し、
`switch`による網羅的operation union分岐はowner内に残した。`canonicalInput.unsupported`、unresolved parameter／script key、HPにおける
secondary `Value2`のtriggerは意味を持つboolean semanticsとして残し、`removeHpModifiers`単独を`Value2`だけでdowngradeしない境界もfixtureで固定した。
`all`／`any`再帰、provenance、stable comparator、schema narrowing、raw Atlas vocabularyのdata-pipeline所有は変更していない。

対象外は、target／recipient／routeの新分類、NP／HP／population／markerのdomain再実装、`operationCompiler.ts`全体、battle-executionの
ordered transaction、calculation-applicationのcandidate／world／scenario semantics、schema変更、TSK-06.47 UI、TSK-06.5 theoretical
maximumである。data-pipelineはraw Atlasをcanonical IRへ解釈し、battle-executionはcanonical operationをorderedに適用し、
calculation-applicationはcalculator／ranking共通pathを使うというpackage間の意味論は維持した。

fixtureはOC／HP／damage／ignore／未関連operationのsupport分類、order保持、evidence complete時のno-downgrade、remove-only HP metadata、
canonical effect record／reference、直接consumerのcondition／mutation後read／rollback、calculator／ranking parity、candidate dedupe／
cardinality／cap、fail-closed outcomeを固定した。focused data-pipeline `23/23`、直接consumer `229/229`（14 files）、production semantic
inventory `14/14`、targeted lint／typecheck／Prettierを通過した。operation `15,257`、effect `13,875`、support分類、canonical input
definition、operation order、condition truth、mutation後read、candidate inventoryに差分はない。

そのため、既存の80条件×433 profile closureを再利用し、34,640 outcomes、34,600 calculated、typed unavailable 40、unsupported／invalid／
inputRequired 0、parity 34,600/34,600、candidate generated／deduplicated 1,028,810、damage requests 967,810、distinct 233,100、
最大3,435、cap 4,096を維持する。新しいbattle-execution／calculation-application hot pathを変更していないため、performance diagnosticは再実行せず、
candidate cardinality、timeout、既存ratchetを再利用した。差分、digest mismatch、support／condition／candidate inventory差分が出た場合だけ、
影響matrixを再実行する。詳細は[effect／execution closure](../evidence/tsk-06-48-effect-execution-closure.json)を参照する。

このbounded unitのhandoffは、Taskを`in_progress`、`TSK-06.47=ready`、`TSK-06.5=blocked`、最終`pnpm quality`未実施のまま維持した。
実装・記録のcommitは`00ad5db`である。次のbounded unitはbattle-executionのoperation compiler／ordered execution境界とし、その後に
calculation-applicationのcandidate／world／scenario境界を扱う。完了までの検証量と停止境界は、追加の[bounded completion plan](package-semantic-convergence-tsk-06-48-completion-plan.md)に分離して記録する。

## 4. 後続のパッケージ波

| 波 | パッケージ／主対象 | 所有する意味 | 実装境界 |
| --- | --- | --- | --- |
| 2 | data-pipeline: `npTransferNormalization.ts`、`hpNormalization.ts` | dependent child shapeとtransfer domain | `plainFunction`をNP側の偶然のownerにせず、共有する判断だけをtyped descriptor化 |
| 3 | data-pipeline: `effectNormalization.ts`、`executionSemantics.ts` | effect recordの段階合成、target／route分類、composed operation support境界 | canonical input→context→specialized operation→condition→recordの順序と、参照展開後のsupport resolutionを明示。raw targetの異なる意味は無理に統合しない |
| 4 | battle-execution: `populationFunctions.ts`、`populationCounts.ts`、`preparationOc.ts` | population state transition、input legality、ordered preparation step | execution側でAtlas vocabularyを解釈せず、population stepだけを明示的なdomain ownerへ収束 |
| 5 | battle-execution: `operationCompiler.ts`、`preparationTransaction.ts` | canonical operationからBattleOperation／projectionへの変換 | resource、state、context、damageのtyped operation familyを整理するが、transaction順序は変更しない |
| 6 | calculation-application: `rankingCandidateSpace.ts`、`rankingWorldObservation.ts`、`scenario.ts` | candidate domain、world observation、scenario composition | data-pipeline／executionの出力が安定した後だけ着手し、candidate cardinalityに影響する変更は独立に証明する |
| 7 | master-data／schema | canonical contract | 既存unionで表現できない場合だけ変更。変更時はADR-008に従いversion、consumer、旧経路削除を同一変更へ記録 |

## 5. 不変条件とproduction closure

各波で次を保持する。

- 34,640 outcomes、34,600 calculated parity、typed unavailable 40。
- unsupported／invalid／inputRequired 0、candidate最大3,435、cap 4,096、timeout不変。
- condition truth、operation order、mutation後read、input definition、calculator／ranking parity不変。
- raw Atlas vocabularyはdata-pipelineだけが解釈し、ranking policyはexecution semanticsを再実装しない。

W6／W7およびbounded unitのproduction closureは、canonical output digest、operation/input inventory、support分類、順序、parityが
完全一致する場合だけ再利用する。digest、operation、condition、support status、candidate inventoryのいずれかが
変わる、または意味論に疑義が出る場合は、影響するproduction matrixを再実行し、canonical input・program・
mutation・read位置単位で差分を説明する。

## 6. 性能とテストの方針

この計画では、複雑性削減を理由にした絶対的な速度向上、固定wall-clock下限、候補数削減を目標にしない。
hot pathへ直接影響する波だけ、同一環境の比較可能な診断値を記録する。性能改善が観測されなくても、意味論と
複雑性のownerが明確になっていれば受入対象とする。既存のcandidate cap、timeout、性能ratchetは緩和しない。

テストは変更したsemantic familyのfocused fixtureを中心とする。既存の有効なproduction／parity／quality artifactを
同条件で重複実行せず、canonical outputまたは意味論に差分が出た場合だけ必要なmatrixへ拡張する。新しい全体oracle、
全パッケージの網羅suite、独立benchmarkを無条件には追加しない。コード変更波では影響範囲のlint／typecheckとfocused
testを行い、最後に必要な`pnpm quality`を一度実行する。計画書だけの変更ではdocs検証だけを行い、production／E2E／
全体qualityは実行しない。

## 7. 正本と停止境界

- Taskの進捗・依存は`docs/tasks/development-redesign-tasks.md`が所有する。
- 本計画はsemantic boundaryと検証方針を所有し、runtime evidenceを先取りしない。
- 2026-09-20に計画確認済みとしてTSK-06.48を`in_progress`へ変更し、第1 bounded unitのbefore baselineを
  `fd0ac2d`（W7 code baseline `0c12261`、production closure digestは06-46 JSON）へ固定する。反例は
  partial slice rollback、cycle／producer不在、previousSuccess、actor／field／addTrait除外、mutation後readとする。
- 第1波の実装、focused検証、必要なproduction確認、evidence更新、final qualityは別の実装段階で行う。
- 第1 bounded unitの完了後は、canonical output／operation／input inventoryとW7 closureの一致を確認できた場合だけ
  production closureを再利用し、差分または意味論上の疑義がある場合だけ影響行列を再実行する。
- 第1 bounded unitのhandoff、実施した検証、未達条件、次のbounded unitはTSK-06.48のTaskとactive evidenceへ追記する。
- population-count bounded unitは`49efe62`を開始基点として完了した。focused 81/81、production 144/144、80×433 matrix、
  targeted lint／Prettier／typecheckを通過し、最終`pnpm quality`は未実施である。次はdependent resource transfer／HP familyで、
  marker／NP transfer以外のsemantic familyへ無断拡張しない。
- dependent resource transfer／HP bounded unitは現行HEAD `46f30a7`を実装基点として完了した。共通dependent-function descriptor、
  NP／HP domain owner、直接consumer、focused／production matrix、candidate inventoryは[transfer／HP closure](../evidence/tsk-06-48-transfer-hp-closure.json)へ記録した。次のbounded unitはeffect normalization／execution-semanticsであり、TSK-06.48は`in_progress`を維持する。
- effect normalization／execution-semantics bounded unitは開始時HEAD `128189f`で完了し、実装・記録を`00ad5db`へcommitした。`effectNormalization.ts`の参照展開後support再分類を
  `executionSemantics.ts::resolveExecutionSemanticSupport`へ集約し、focused `23/23`、直接consumer `229/229`、production semantic inventory
  `14/14`、operation／input／support／order／condition／candidate parity差分0を確認した。80×433 closureは既存evidenceを再利用し、machine-readable結果を
  [effect／execution closure](../evidence/tsk-06-48-effect-execution-closure.json)へ記録した。次はbattle-execution operation compiler／ordered execution境界で、
  TSK-06.48は`in_progress`、`TSK-06.47=ready`、`TSK-06.5=blocked`、最終`pnpm quality`未実施を維持する。残り2 bounded unitの
  対象・停止条件・過度な性能ゴール／テストを求めない方針は[bounded completion plan](package-semantic-convergence-tsk-06-48-completion-plan.md)を正本とする。
- battle-execution operation compiler／ordered execution bounded unitは、開始HEAD `ad786f0`とproduction code基点`00ad5db`を分離して監査した。`compileEffectCached`／`compileEffect`、`compileExecutionPlan`、`executePreparationOc`、resource query／suffix closure、candidate transaction rollbackのownerは一意であり、OC kind列挙の反復もcompiler projection、preparation program、runtime binding、preparation gateでtyped outputが異なるため統合しなかった。production sourceの変更はなく、`isOneOf`、`processValues`、条件wrapper、汎用helperは追加していない。
- focused battle-execution／直接application `158/158`、candidate／world／resource audit `34/34`、targeted eslint、`pnpm typecheck`を通過した。operation `15,257`、effect `13,875`、canonical input／support分類、order、condition truth、mutation後read、calculator／ranking／portable parityに差分はなく、既存の80条件×433 profile closureを再利用した。34,640 outcomes、34,600 calculated、typed unavailable 40、unsupported／invalid／inputRequired 0、candidate 1,028,810／最大3,435／cap 4,096を維持した。machine-readable結果は[TSK-06.48 battle-execution closure](../evidence/tsk-06-48-battle-execution-closure.json)、flow差分は[ranking policy candidate flow](../evidence/ranking-policy-candidate-flow-tsk-06.md)へ記録した。次はcalculation-application candidate／world／scenario boundaryであり、TSK-06.48全体の最終`pnpm quality`は未実施である。

### 3.7 calculation-application candidate／world／scenario bounded unit（2026-09-20完了）

開始時HEADは`ee9f00fbdfa56a3293d9ba1000a5068388cd15c8`、直前bounded unitの開始HEADは`ad786f014d89263fed04d1217260b1f2463edaba`、最新のproduction code基点は`00ad5db`として分離した。scenario、ranking static semantics、world observation、candidate space、ranking executionの定義・参照・直接consumerを監査し、calculator／ranking／portableが同じscenario／ordered execution pathを使い、rankingがdamage／resource semanticsやraw Atlas vocabularyを再実装していないことを確認した。

| semantic | 現在／変更後のowner | 直接consumer |
| --- | --- | --- |
| 利用者意図、canonical input、typed rejected／invalid／unsupported／inputRequired outcome | `scenario.ts::resolveScenario`／`prepareCalculationScenarioWithPolicy` | calculator、ranking、portable |
| ranking static operation／condition／input projection | `rankingStaticSemantics.ts::compileStaticRankingSemantics` | ranking program／condition inventory、ranking policy |
| preparation／OC source inclusion | 同`compileStaticRankingSemantics`内の`preparationSources` | runtime input definition、condition、stack witness construction |
| ordered mutationの観測 | `rankingWorldObservation.ts::compileRankingWorldObservationPlan`／`observeRankingWorld` | world domain／quotient、candidate space |
| canonical input domainとpopulation tupleのequivalence／representative | `rankingCanonicalInputs.ts`／`rankingCandidateSpace.ts` | candidate materialization、ranking policy scenario |
| candidate実行 | `rankingPolicyScenario.ts::compileRankingExecutionPlan`、`rankingExecution.ts::executeRankingScenarios`、battle-execution executor | calculator／ranking parity、portable execution |

唯一のproduction変更は、`rankingStaticSemantics.ts`で3箇所に反復していた`effectChangesPreparation(effect) || hasOcConditionReader(effect)`を`preparationSources`へ一度だけ収束したことだった。これは同一source inventoryのcategory 1反復union分類であり、package横断の汎用helperにはしていない。canonical operation→static projection、BattleOperation→world observation、canonical input definition→有限domain、resolved execution→typed outcomeはcategory 2のtyped変換として残した。operation／condition／input definition／statusの網羅union、`isPopulationInputDefinition`のschema narrowing、stable comparator fallbackはcategory 3として残し、`uncertainOcCell ||= ...`、`all`／`any`／`not`、unresolved mutation、`!prior || deviation`、有限product／cap、unsupported／invalid／inputRequired／unavailableのfail-closed結合はcategory 4として残した。`isOneOf`、`processValues`、条件wrapper、servant ID／label分岐、raw Atlas解釈、ranking独自damage／resource semantics、candidate cap緩和は追加していない。

公開application API、canonical effect／operation、input definition／input key、support分類、operation order、condition truth、mutation後read、candidate dedupe／cardinality／cap、calculator／ranking parityは変更していない。data-pipelineがraw Atlasをcanonical IRへ変換し、battle-executionがcanonical operationを順序付きtransactionとして適用し、calculation-applicationがscenario意図と有限candidateを組み立てる依存方向を維持した。既存のcandidate／world／scenario focused fixtureを6 files／38 testsで実行し、candidate生成、representative、dedupe、cardinality、cap、typed outcome、world observation、condition／mutation、共通ordered execution parityを確認した。matrixはcanonical output、effect 13,875、operation 15,257、input／support分類、order、condition、mutation-after-read、candidate inventory、parityに差分がないため再利用した。

80条件×433 profileは34,640 outcomes、34,600 calculated、typed unavailable 40、unsupported／invalid／inputRequired 0、parity 34,600、candidate generated／deduplicated 1,028,810、damage requests 967,810、distinct 233,100、最大3,435／cap 4,096を維持した。ranking static candidate compilation pathを変更したため、hot-path診断を3回実行し、`6280.810／6061.904／6069.754ms`、中央値`6069.754ms`、rows 433、exclusions 0、result digest `a9cee3d7a5ec35a30f9ef2b2fdc97ab0c00aa27d6593ba70e02eb4f0f6c5626f`を記録した。前回診断との差は受入条件やratchetにせず、意味論差分の不在を優先する。詳細は[TSK-06.48 calculation-application closure](../evidence/tsk-06-48-calculation-application-closure.json)を参照する。

このbounded unitでTSK-06.48のproduction／semantic実装範囲は閉じたが、完了扱いにはせず、最終`pnpm quality`と最終記録整合を残す。TSK-06.48は`in_progress`、TSK-06.47は`ready`、TSK-06.5は`blocked`を維持する。最終quality後にBlocking／Deferredとhandoffを再記録し、追加のrefactorは行わない。
