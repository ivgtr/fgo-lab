---
title: "TSK-06.48 bounded completion plan"
document_version: "1.0.2"
status: "Active"
created_at: "2026-09-20"
updated_at: "2026-09-20"
task: "TSK-06.48"
parent_plan: "docs/tasks/package-semantic-convergence-tsk-06-48.md"
baseline_commit: "00ad5db"
---

# TSK-06.48 bounded completion plan

## 1. 目的と停止境界

TSK-06.48は、W0〜W7と既完了のpopulation、dependent resource／HP、effect normalization／execution-semantics
bounded unitで確立したcanonical output、ordered execution、ranking candidate、production closureを維持したまま、
残る直接consumerのsemantic owner境界だけを確認する。開始基点は`00ad5db`とし、直前のeffect／execution bounded unitの
基点`128189f`、さらに前のdependent resource／HP基点`46f30a7`と混同しない。

この計画の完了点は、次の2 bounded unit、必要な記録更新、最終`pnpm quality`までである。これを超えて、コードベース全体の
機械的な整理、汎用helper追加、性能最適化、UI改善、theoretical maximum実装へ拡張しない。

## 2. bounded unit A: battle-execution operation boundary

### 対象

- `packages/battle-execution/src/operationCompiler.ts`
- `packages/battle-execution/src/preparationOc.ts`
- `packages/battle-execution/src/preparationTransaction.ts`
- `packages/battle-execution/src/resourceSemantics.ts`
- `packages/battle-execution/src/resourceQueries.ts`
- 上記の直接consumer focused test

### 判断すること

- canonical operationから`BattleOperation`／runtime projectionへの変換をbattle-executionだけが所有しているか。
- operation order、condition truth、transaction rollback、mutation後read、resource queryの時点が一意か。
- operation family、route、support statusをoperation compilerまたはruntimeがraw Atlas vocabularyから再分類していないか。
- calculatorとrankingが同じordered execution経路を通り、resource／damage semanticsを独自実装していないか。

### 変更境界

重複分類がコード根拠で確認できた場合だけ、既存のbattle-execution ownerへ集約する。重複がなくcanonical operationをそのまま
orderedに適用している場合は、コードを変更せず、owner確認・focused fixture・evidence更新でbounded unitを閉じる。
schema、public API、operation shape、input definition、raw Atlas解釈のdata-pipeline ownerは変更しない。

### A実施結果（2026-09-20）

開始時HEADは`ad786f014d89263fed04d1217260b1f2463edaba`、production code基点は直前コード変更の`00ad5dbeccd91813c04a6f53a53633576e2c9b26`と分離した。対象symbolの定義・参照・直接consumerを監査した結果、canonical operationからruntime projection、ordered preparation、resource read closure、candidate rollbackのownerは重複していなかった。OC operationの論理和はcompiler support、preparation program、runtime binding、preparation gateのtyped outputが異なるため、分類を共通helperへ移していない。

production sourceは変更せず、focused battle-execution／直接application `158/158`、candidate／world／resource audit `34/34`、targeted lint、typecheckを通過した。canonical output、operation／input inventory、support分類、operation order、condition truth、mutation後read、calculator／ranking parity、candidate inventoryに差分がないため、既存の80条件×433 profile closureを再利用する。machine-readable結果は`docs/evidence/tsk-06-48-battle-execution-closure.json`である。Prettier、`git diff --check`、docs integrityは記録更新後に実行する。

このbounded unitでTSK-06.48全体を完了とはせず、次はcalculation-application candidate／world／scenario boundaryとする。最終`pnpm quality`、TSK-06.47、TSK-06.5のstatusは変更しない。

## 3. bounded unit B: calculation-application boundary

### 対象

- `packages/calculation-application/src/scenario.ts`
- `packages/calculation-application/src/rankingWorldObservation.ts`
- `packages/calculation-application/src/rankingCandidateSpace.ts`
- 必要な範囲の`rankingStaticSemantics.ts`と直接consumer focused test

### 判断すること

- scenarioは利用者の意図とcanonical inputを所有し、effect／resource／damage semanticsを再実装していないか。
- ranking world observationはbattle-executionの結果を観測するだけで、独自のmutation／condition semanticsを持っていないか。
- candidate生成、equivalence、representative、dedupe、cardinality、capがcanonical inputとordered executorに一致するか。
- calculator／ranking／portableが同じapplication／execution経路を使い、candidateの都合でunsupported、invalid、inputRequiredを
  calculatedへ変換していないか。

### 変更境界

application側に重複したsemantic判断がある場合だけ、既存のcanonical input／battle-execution結果を参照する名前付き境界へ整理する。
rankingへdamage／resource semantics、raw key／servant ID／label分岐、別compiler、別candidate generatorを追加しない。
candidate capを緩和せず、schema変更は既存unionで表現できない実証がある場合だけ別Taskへ戻す。

### B実施結果（2026-09-20）

開始時HEADは`ee9f00fbdfa56a3293d9ba1000a5068388cd15c8`、直前A bounded unitの開始HEADは`ad786f0`、production code基点は`00ad5db`である。監査の結果、scenarioは利用者意図とcanonical input、ranking worldはordered execution結果の観測、candidate spaceはcanonical input domainの有限化、ranking executionは共通scenario／ordered executorの実行を所有していた。ranking側にdamage／resource semantics、raw Atlas vocabulary、別compiler、独自candidate generatorの重複ownerはなかった。

変更は`packages/calculation-application/src/rankingStaticSemantics.ts`の最小1ファイルに限定した。`effectChangesPreparation(effect) || hasOcConditionReader(effect)`を3箇所で繰り返していたため、`compileStaticRankingSemantics`内の`preparationSources` inventoryへ一度だけ集約し、runtime input definitions、condition collection、stack witness exclusionが同じsource集合を参照するようにした。これはcategory 1の局所反復union分類だけを削除したもので、package横断helper、`isOneOf`、`processValues`、条件wrapperは追加していない。

canonical effect／operation／input definition／input key、support分類、operation order、condition truth、mutation後read、candidate representative／dedupe／cardinality／cap、calculator／ranking parity、public APIは不変である。data-pipelineのraw Atlas解釈、battle-executionのordered transaction／rollback／resource read、calculation-applicationのscenario／candidate／world compositionという責務境界も維持した。category 2のtyped変換、category 3の網羅union、category 4の`all`／`any`／`not`、不確実性、mutation deviation、有限product／cap、typed fail-closedは意図的に残した。

focused testは6 files／38 testsが成功し、candidate／world／scenario、condition truth、mutation後read、candidate equivalence／representative／dedupe／cardinality／cap、calculator／ranking parity、typed outcomeを確認した。canonical output、effect 13,875、operation 15,257、input／support分類、candidate inventoryに差分がないため、34,640 outcomes／34,600 parity／typed unavailable 40／unsupported・invalid・inputRequired 0、candidate最大3,435／cap 4,096を含む80条件×433 profile closureを再利用した。ranking static compilation pathを変更したため、比較可能な診断値として3サンプル`6280.810／6061.904／6069.754ms`、中央値`6069.754ms`、rows 433、exclusions 0、result digest `a9cee3d7a5ec35a30f9ef2b2fdc97ab0c00aa27d6593ba70e02eb4f0f6c5626f`を記録した。これは受入条件やratchetではない。

machine-readable結果は[TSK-06.48 calculation-application closure](../evidence/tsk-06-48-calculation-application-closure.json)、flow差分は[ranking policy candidate flow](../evidence/ranking-policy-candidate-flow-tsk-06.md)である。B bounded unitの実装範囲は閉じたが、TSK-06.48は`in_progress`のまま、最終`pnpm quality`と最終記録整合を残す。`TSK-06.47=ready`、`TSK-06.5=blocked`、candidate cap／timeout／性能ratchetは変更しない。

## 4. 共通の不変条件

- 34,640 outcomes、34,600 calculated parity、typed unavailable 40。
- unsupported／invalid／inputRequired 0、candidate最大3,435、cap 4,096。
- canonical output、operation／input inventory、support分類、operation order、condition truth、mutation後read不変。
- calculator／ranking parity不変、raw Atlas vocabularyはdata-pipelineだけが解釈する。
- `TSK-06.48=in_progress`、`TSK-06.47=ready`、`TSK-06.5=blocked`を維持する。

既存closureは、canonical output、digest、operation／input inventory、support status、condition truth、candidate inventoryに差分がなく、
意味論上の疑義がない場合だけ再利用する。いずれかに差分または疑義があれば、影響するproduction matrixだけを再実行し、差分を
canonical input、ordered program、mutation、read位置で説明する。

## 5. 検証方針

各bounded unitでは、変更したsemantic familyの小さいfixture、直接consumerのfocused test、targeted lint、typecheck、Prettierを行う。
既存の有効なproduction／parity／quality artifactを同条件で無条件に再実行しない。コード変更がなく、既存evidenceの再利用条件を
満たす場合は、監査結果と再利用根拠を記録して停止する。

この計画では、過度な性能ゴールやテスト量を受入条件にしない。

- wall-clock改善、固定性能下限、candidate削減、timeout短縮を要求しない。
- hot pathを変更した場合だけ、比較可能な診断値を記録する。性能値は意味論の受入条件ではなく、候補数・timeout・ratchetを緩和しない。
- bounded unitごとの全体suite、独立benchmark、全E2E、全production matrixの反復実行を要求しない。
- production matrixと最終`pnpm quality`は、2 bounded unitの変更・局所検証・差分レビューが完了した後に一度だけ必要性を判断する。
- 新しいテストは、owner境界、fail-closed、ordered execution、parity、候補同値性を反証する最小fixtureに限る。

## 6. 完了条件とhandoff

次を満たした時点でTSK-06.48を完了とする。

1. battle-executionとcalculation-applicationのsemantic owner、変更有無、対象外がTaskとevidenceに記録されている。
2. canonical output、operation／input inventory、support分類、order、condition、mutation後read、candidate inventory、parityの差分が
   ないか、差分があれば全数説明されている。
3. focused verification、必要なproduction確認、targeted lint／typecheck／Prettier、docs integrityが成功している。
4. 最終`pnpm quality`が一度成功し、TSK-06.48内のBlocking／Deferredが残っていない。
5. Task、flow evidence、machine-readable evidence、docs registryが同じ停止境界を参照し、commit前のworktree差分が説明可能である。

完了後は、TSK-06.47とTSK-06.5の依存を暗黙に変更せず、追加のrefactorは具体的な不具合、意味論差分、性能回帰、または新要件が
発生した場合だけ別Taskとして計画する。
