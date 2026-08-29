---
title: "FGO Lab テスト・ランキング再設計 Tasks"
document_version: "1.0.0"
status: "Active"
created_at: "2026-08-30"
updated_at: "2026-08-30"
source_requirements:
  - "docs/test-strategy-redesign.md"
  - "docs/ranking-self-and-conditional-effects-requirements.md"
  - "docs/development-execution-efficiency-requirements.md"
---

# FGO Lab テスト・ランキング再設計 Tasks

## 1. 役割

本書は、3つの要件書にまたがる実装順序、依存関係、進捗、phase handoffを所有する。意味論、品質要件、受入条件の正本は各source requirementsであり、本書では再定義しない。

状態は次だけを使用する。

- `ready`: 依存taskが完了し、着手可能
- `blocked`: 依存taskまたは設計判断待ち
- `in_progress`: 現在実装中。常に最大1件
- `done`: Done gateとhandoffを記録済み

Task開始時に状態とbaseline identityを更新し、完了時にcommit、artifact manifest、inventory／digest差分、次taskの開始条件を記録する。raw test log、全source listing、全screenshotは本書へ貼らない。

## 2. Task index

| ID | Task | Status | Depends on | Primary source |
| --- | --- | --- | --- | --- |
| TSK-00 | Baseline固定 | ready | - | 全要件書 |
| TSK-01 | Compact runnerとagent command契約 | blocked | TSK-00 | test strategy T1／execution efficiency |
| TSK-02 | Suite分類とcanonical quality gate | blocked | TSK-01 | test strategy T2 |
| TSK-03 | 共有production audit foundation | blocked | TSK-02 | test strategy T3／ranking production audit |
| TSK-04 | Ranking canonical IR cutover | blocked | TSK-03 | ranking layer ownership／移行方針 |
| TSK-05 | Transactional preparation execution | blocked | TSK-04 | ranking execution／NP resource |
| TSK-06 | Ranking policyとcandidate planner | blocked | TSK-05 | ranking condition／candidate planning |
| TSK-07 | Web／worker一括切替 | blocked | TSK-06 | ranking UI／移行方針 |
| TSK-08 | Production audit最終収束とfailure diagnostics | blocked | TSK-07 | test strategy T3/T4／ranking test gate |
| TSK-09 | Performance、運用移行、旧経路削除 | blocked | TSK-08 | test strategy T5／全完了条件 |

```text
TSK-00 -> TSK-01 -> TSK-02 -> TSK-03 -> TSK-04
       -> TSK-05 -> TSK-06 -> TSK-07 -> TSK-08 -> TSK-09
```

## 3. Tasks

### TSK-00: Baseline固定

- [ ] test file、suite、CI step、master load、digest inventoryを記録する。
- [ ] 現行`RankingConditions`、AttackProfile、condition／resource familyをproduction全件で監査する。
- [ ] calculator/rankingのdamage、entry、policy差分baselineを固定する。
- [ ] 成功／失敗ログ量、model call、polling、tool outputの測定方法を固定する。

Done gate:

- product semanticsを変更していない。
- baseline再現command、commit SHA、dirty state、artifact pathが記録されている。
- mainまたは変更前baselineと比較せず、failureを既存問題と断定していない。

Handoff:

- Commit: 未記録
- Artifacts: 未記録
- Inventory／digest: 未記録
- Next command: 未記録

### TSK-01: Compact runnerとagent command契約

Depends on: TSK-00

- [ ] process、capture、structured report、summaryを所有するfocused runnerを実装する。
- [ ] `test:agent`と`test:diagnostic`を追加する。
- [ ] success、assertion failure、timeout、signal、reporter failureをrunner testで固定する。
- [ ] full log、manifest、`.test-results/` ignoreを実装する。
- [ ] 30秒以上のpoll間隔とbounded command outputを短いrepository guidanceへ追加する。

Done gate:

- 成功時10行以内。
- 失敗時200行か32 KiB以内で、完全artifactへ到達できる。
- exit code、stderr、timeoutを失わない。
- test集合、damage、ranking期待値に差分がない。

Handoff: 未記録

### TSK-02: Suite分類とcanonical quality gate

Depends on: TSK-01

- [ ] 重複しない`test:unit`と`test:production`を定義する。
- [ ] `quality`をlocal／CI／Pagesのcanonical入口にする。
- [ ] `validate:evidence`と`validate:master`の重複実行を整理する。
- [ ] focused testからphase gateへ拡大するcommand matrixを実装する。

Done gate:

- 必要な現行test contractが一度ずつ実行される。
- production inventory、calculator/ranking parity、evidenceを省略していない。
- local、CI、Pagesの意味集合が一致する。

Handoff: 未記録

### TSK-03: 共有production audit foundation

Depends on: TSK-02

- [ ] package境界ごとにmaster load／compileを一回へ収束させる。
- [ ] 複数assertionが共有するread-only typed inventoryを作る。
- [ ] 現行digestと最初のcanonical差分を報告するformatterを作る。
- [ ] master load、compile、candidate、damage request数を計測する。

Done gate:

- 新ランキング意味論を先取りしたparallel runtime modelを作っていない。
- 現行inventoryとdigestが一致する。
- production全件監査をsample化していない。
- TSK-04のproduction auditを一回の共有compileから開始できる。

Handoff: 未記録

### TSK-04: Ranking canonical IR cutover

Depends on: TSK-03

- [ ] AttackProfile identityをcanonical化する。
- [ ] player choiceとstochastic outcomeをtyped semanticsへ分離する。
- [ ] condition requirement、provenance、target、recipient、contribution scopeをcanonical化する。
- [ ] NP capacity、resource requirement、gain／loss／all-consume、base OCをcanonical化する。
- [ ] 旧schema reader、raw fallback、compatibility flagを削除する。

Done gate:

- data pipelineだけがAtlas/raw vocabularyを解釈する。
- executionへraw key、raw target、raw buff typeを渡していない。
- 新旧IRをruntimeで併存させていない。
- 全production occurrenceがtyped inventoryへ分類されるか、型付きでfail-closedになる。

Handoff: 未記録

### TSK-05: Transactional preparation execution

Depends on: TSK-04

- [ ] condition、choice、resource、state mutationをordered operationとして実行する。
- [ ] form transition、NP variant、non-attack NP、attack NPを一つのplanで扱う。
- [ ] executable stateとrejected stateを型で分ける。
- [ ] action全体をatomic commitし、partial commitを拒否する。

Done gate:

- execution preconditionをranking policyが上書きしない。
- partial commit 0件。
- focused semantic fixturesとproduction family inventoryが通る。
- calculator経路に意図しないdamage差分がない。

Handoff: 未記録

### TSK-06: Ranking policyとcandidate planner

Depends on: TSK-05

- [ ] 自己バフと条件効果の四policy組合せをcompileする。
- [ ] finite preparation plan、TargetContext、condition candidateを生成する。
- [ ] baseline包含とstable tie-breakを実装する。
- [ ] `calculated | unavailableUnderPolicy | invalid`を型で分離する。
- [ ] calculatorと同じcanonical executorからdamageを生成する。

Done gate:

- effect subsetの`2^N`探索がない。
- 一つの数値が一つのAttackProfile、scenario、ordered plan、TargetContextを持つ。
- calculator/ranking canonical parityが成立する。
- candidate数とdamage request数の上限をsemantic inputから説明できる。

Handoff: 未記録

### TSK-07: Web／worker一括切替

Depends on: TSK-06

- [ ] ランキング条件を5項目へ切り替える。
- [ ] worker protocol、URL、cache key、detail evidenceを同じcontractへ切り替える。
- [ ] 旧special attack／field入力、reader、fallbackを削除する。
- [ ] Webをcanonical presentation modelの描画とcommand dispatchへ限定する。

Done gate:

- 新旧policy、URL、worker protocolをruntimeで併存させていない。
- desktop、390px、320pxでoverflowがない。
- keyboard、accessible name、expanded state、focus orderを維持する。
- stale responseが表示へ反映されない。

Handoff: 未記録

### TSK-08: Production audit最終収束とfailure diagnostics

Depends on: TSK-07

- [ ] data-pipelineとcalculation-applicationの最終共有audit modelを完成させる。
- [ ] 全AttackProfile × NP1〜5 × 四policyのinventoryとdigestを固定する。
- [ ] parity、unsupported、invalid、partial commit、inert control、stale mutationをratchet化する。
- [ ] typed reason別のbounded summaryと完全artifactを統合する。
- [ ] 旧loader、scan、candidate list、重複fixtureを削除する。

Done gate:

- 全damage差分をcanonical input、witness、ordered plan、governing ruleで説明できる。
- digest mismatchから最初のcanonical差分へ到達できる。
- 大量失敗でも出力上限を守り、完全結果を失わない。
- production inventory、calculator/ranking parity、fail-closed gateが通る。

Handoff: 未記録

### TSK-09: Performance、運用移行、旧経路削除

Depends on: TSK-08

- [ ] 変更前後を同一環境で3回測定し、中央値を記録する。
- [ ] wall-clock、import、parse、candidate、damage request、stdout bytesを比較する。
- [ ] phaseごとのmodel call、poll回数、最大tool outputを参考指標として記録する。
- [ ] contributor向け文書をcanonical commandへ更新する。
- [ ] 旧runner、重複CI step、旧ranking policy、compatibility pathを削除する。

Done gate:

- テスト戦略、ランキング仕様、開発実行効率要件の完了条件をすべて満たす。
- 未説明のdamage、inventory、parity、UI、performance差分がない。
- 1秒polling、無条件retry、巨大なfull-source出力が標準workflowに残っていない。
- 新しいthreadがcanonical handoffだけから次作業を開始できる。

Handoff: 未記録

## 4. 更新規則

- taskを開始するcommitで対象を`in_progress`へ変更する。
- 同時に複数taskを`in_progress`へしない。
- Done gateを満たす前に`done`へ変更しない。
- blocking conditionは対象taskのHandoffへ記録し、要件を推測で緩和しない。
- task分割が必要な場合は`TSK-xx.y`を追加し、元taskのDone gateを変更しない。
- 実装順変更は依存関係と理由を本書へ反映し、各要件書へ順序説明を複製しない。
