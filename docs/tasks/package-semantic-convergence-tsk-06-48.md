---
title: "TSK-06.48 パッケージ別semantic complexity convergence計画"
document_version: "1.0.0"
status: "Active"
created_at: "2026-09-20"
updated_at: "2026-09-20"
task: "TSK-06.48"
baseline_commit: "0c12261"
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

## 4. 後続のパッケージ波

| 波 | パッケージ／主対象 | 所有する意味 | 実装境界 |
| --- | --- | --- | --- |
| 2 | data-pipeline: `npTransferNormalization.ts`、`hpNormalization.ts` | dependent child shapeとtransfer domain | `plainFunction`をNP側の偶然のownerにせず、共有する判断だけをtyped descriptor化 |
| 3 | data-pipeline: `effectNormalization.ts`、`executionSemantics.ts` | effect recordの段階合成、target／route分類 | canonical input→context→specialized operation→condition→recordの順序を明示。raw targetの異なる意味は無理に統合しない |
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

W6／W7のproduction closureは、canonical output digest、operation/input inventory、support分類、順序、parityが
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
- 実装開始時はTSK-06.48を`in_progress`へ変更し、最初に第1波のbaselineと反例を記録する。
- 第1波の実装、focused検証、必要なproduction確認、evidence更新、final qualityは別の実装段階で行う。
- 本コミットではsource、test、production artifact、engine／schema versionを変更しない。
