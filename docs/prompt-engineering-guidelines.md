---
title: "FGO Lab 開発プロンプト運用ガイド"
document_version: "1.0.0"
status: "Guideline"
created_at: "2026-08-30"
updated_at: "2026-08-30"
related_documents:
  - "docs/development-redesign-tasks.md"
  - "docs/requirements/development-execution-efficiency-requirements.md"
  - "AGENTS.md"
---

# FGO Lab 開発プロンプト運用ガイド

## 1. 目的

本書は、FGO LabでCodexへ調査、実装、レビュー対応を依頼するときに、一つのsessionを必要以上に長期化させず、damage correctnessと設計品質を維持するための利用者向けガイドである。

プロンプトの短さ自体は目的ではない。必要な制約を落とした短い依頼より、次の境界が明確な依頼を優先する。

- 今回達成する一つのoutcome
- 対象となるsemantic family
- 変更してよい範囲
- 維持するdomain invariant
- 完了を判定するverification
- 実装を止めて設計へ戻る条件

OpenAI Docsでは、promptにGoal、Context、Constraints、Done whenを含めること、複雑な作業は先にplanすること、chatを一つのcoherent outcomeへ限定することが推奨されている。本書はそれをFGO Labの開発工程へ具体化する。

## 2. 最重要原則

### 2.1 一つのsessionは一つのcoherent outcomeに限定する

良い単位:

- `TSK-04`のcanonical IR cutoverを完了する
- target state mutationのpartial commit再発を直す
- compact runnerの終了コード契約を実装する
- 一つのreview finding familyを解消する

大きすぎる単位:

- ランキングを完成させ、見つかった問題もすべて直し、UIも改善する
- 全テストを高速化し、失敗も調査し、設計も整理する
- このプロジェクトを最後まで完成させる

関連していても、semantic ownerまたは完了条件が変わった時点で別outcomeとみなす。

### 2.2 永続情報をpromptへ再掲しない

次は毎回長文で貼らず、正本をpathで指定する。

- repository-wide invariant: `AGENTS.md`
- product semantics: requirements／ADR
- 実装順序と進捗: `docs/development-redesign-tasks.md`
- 実行効率契約: `docs/requirements/development-execution-efficiency-requirements.md`
- 完了済み変更: commit
- 完全なtest結果: artifact manifest

promptには、今回特に重要な制約だけを短く再掲する。正本文書の内容を別表現で大量に複製すると、差異とcontext増加の両方を生む。

### 2.3 症状ではなく期待するcanonical outcomeを書く

「ボタンが押せない」「ランキング値がおかしい」だけで終えず、次を示す。

- どのcanonical stateまたはoperationになるべきか
- 何が同時成立してはいけないか
- calculated／unsupported／invalidのどれが正しいか
- calculatorとrankingで何が一致すべきか

実装箇所や修正方法を断定する必要はない。原因未確定なら、疑わしいfileはcontextとして示し、設計判断は調査結果に委ねる。

### 2.4 調査と実装の権限を明確にする

原因や所有層が不明な場合は、最初の依頼を調査だけにする。

```text
まず変更せず、production family、canonical state、実行順、calculator/ranking parityを監査してください。
原因、影響件数、所有すべきsemantic family、単一の修正方針を報告し、実装は停止してください。
```

原因と設計が既に確定している場合は、実装、検証、commitまでを同じoutcomeとして依頼してよい。

## 3. バグ発見時のsession分岐

```text
bug finding
  |- 同じoutcome・同じsemantic familyの初回指摘
  |    `-> 現sessionでbounded correction
  |
  |- 独立した症状または別semantic owner
  |    `-> Tasksへ追加してnew session
  |
  `- 同じfamilyで構造的な再発
       `-> 実装停止 -> design audit -> 正本更新 -> new implementation session
```

### 3.1 現sessionで続けてよい場合

次をすべて満たす場合だけ、現在のsessionで修正を続ける。

- 元のoutcomeが変わらない。
- 同じsemantic familyと所有moduleに属する。
- 既存の設計を否定せず、実装漏れまたは局所的な不変条件違反である。
- 追加するverificationが元のDone gateへ収まる。
- 新しいproduction familyの全数監査を必要としない。

依頼はfinding一件に限定し、前回prompt全体を貼り直さない。

### 3.2 即座にnew sessionへ分ける場合

- schemaの問題からUI設計へ論点が移った。
- calculator修正中に独立したranking policy問題を発見した。
- performance調査中にdamage semantics差分を発見した。
- 元taskの完了条件を満たした後で新しい改善を思いついた。
- 別の正本文書、別のTask ID、別のownership boundaryが主対象になる。

現在sessionでは、再現条件と推奨Taskだけをhandoffへ記録する。ついでに修正させない。

### 3.3 実装を停止して設計監査へ戻す場合

次のいずれかを検出したら、同じsessionでpatchを重ねない。

- 同じsemantic familyで2回目のreview差し戻しが発生した。
- 新しいservant別例外、ID分岐、label判定が必要に見える。
- 一件直すと別のproduction familyが壊れる。
- 新旧model、fallback、同期fieldを追加しないと直せない。
- calculatorとrankingの一方だけを変える必要があるように見える。
- damage差分をcanonical inputとgoverning ruleで説明できない。
- candidate数、test時間、実行経路が予想外に増える。

この場合のoutcomeは「バグ修正」から「設計監査」へ変わっている。現在sessionでは調査結果と正本文書の更新までに限定し、実装は更新後のTaskを使ってnew sessionで開始する。

## 4. 初回実装promptの型

```text
Task:
- docs/development-redesign-tasks.md の TSK-xx を実装してください。

Goal:
- <利用者に見える一つの成果>

Canonical sources:
- <requirements / ADR / Task>

Current baseline:
- HEAD: <commit>
- <inventory / digest / artifact manifest>

Scope:
- 主対象: <package / semantic family>
- 必要な依存変更は同じcanonical modelへ収束する範囲で許可する

Invariants:
- damage correctness最優先
- calculator/rankingは同じexecution path
- ambiguous stateはfail-closed
- ID、名称、label、raw keyによるruntime分岐禁止

Do not:
- 新旧経路やcompatibility flagを併存させない
- production監査をsample化しない
- Task外の改善へ広げない

Done when:
- <TaskのDone gateを参照>
- focused testsと必要なproduction gateが成功
- inventory、digest、parity、performance差分を説明
- requested filesだけをcommit

Execution:
- 成功ログはcompact commandを使用
- full logはartifactへ保存
- long-running processは30秒未満で空pollしない
- 停止条件を検出したらpatchせず報告する
```

Taskと正本文書に既にある説明を全文転載しない。promptは「どのTaskを、どのbaselineから、どの範囲で開始するか」を補う。

## 5. Review finding対応promptの型

### 5.1 同じsessionで直すfinding

```text
前回Taskのreview findingです。outcomeとsemantic familyは変更しません。

Finding:
- <観測された不具合>

Reproduction:
- canonical input: <入力>
- actual: <結果>
- expected: <結果>

Governing invariant:
- <破られている規則>

Scope:
- このfindingの原因、同じproduction family、回帰test、必要な設計修正に限定

Done when:
- reproductionが正しいtyped outcomeになる
- 同familyのproduction inventoryを確認
- calculator/ranking parityを維持
- unrelatedなdamage差分がない

同じfamilyで別の構造問題が見つかった場合は実装を止め、設計監査へ切り替えてください。
```

### 5.2 設計監査へ戻すfinding

```text
同じsemantic familyで再発したため、実装を停止してください。

変更せずに確認すること:
- 症状を生むcanonical stateとordered operations
- production全件の同family occurrence
- 現在のownershipと重複model
- 前回修正が局所化した理由
- 一つのcanonical modelへ収束する破壊的変更案
- damage、parity、candidate、test costへの影響

成果物:
- requirements／ADRの調査結果
- docs/development-redesign-tasks.mdの再計画

実装、fallback、個別case分岐、commitは行わないでください。
```

## 6. New session用handoff prompt

new sessionでは過去の会話要約を長文で貼らず、repository stateから再開する。

```text
docs/development-redesign-tasks.md の TSK-xx を開始してください。

Starting point:
- HEAD: <commit>
- Worktree: <clean / listed user changes>
- Previous task: TSK-yy done
- Artifact manifest: <path>
- Inventory／digest: <identity>

Read first:
- <必要なrequirements / ADRだけ>

Do not redo:
- <完了済み監査と検証>

First action:
- Taskのentry conditionと現在実装が一致するかread-onlyで確認し、不一致なら実装せず報告する
```

handoffに必要なのは会話の経緯ではなく、現在のcanonical state、検証証跡、未完了Taskである。

## 7. Verification依頼の書き方

「全部テストして」だけでは、重複実行と巨大ログを招きやすい。変更範囲と段階を指定する。

```text
1. 変更したsemantic familyのfocused tests
2. package boundaryのtypecheck／lint
3. Taskのproduction inventory／parity gate
4. phase完了時だけcanonical quality gate
```

追加ルール:

- 同じcommitと同じcommandの成功artifactがある場合、理由なく再実行しない。
- 失敗時はbounded summaryを先に確認し、不足するartifact部分だけを読む。
- failureが実装差分由来か不明なら、mainまたは変更前baselineと比較してから判断する。
- test数だけでなく、inventory、digest、parity、candidate、damage request、UI invariantをDone判定に使う。

## 8. 避けるprompt pattern

### 8.1 無制限の継続

避ける:

```text
問題がなくなるまで全部直して続けてください。
```

改善:

```text
TSK-xxのDone gateまで実装してください。別semantic familyの問題を見つけたら、再現とTask案だけを記録して停止してください。
```

### 8.2 調査、設計、実装、全レビューの混在

避ける:

```text
原因を調べ、設計を見直し、全部実装し、他の問題も探して修正してください。
```

改善:

```text
まず変更せず、原因、production件数、所有family、修正方針を報告してください。実装可否はその結果で判断します。
```

### 8.3 前回promptの全文再掲

避ける:

- requirements、レビュー履歴、ログを毎回すべて貼る。

改善:

- 正本path、commit、artifact、今回のfinding差分だけを示す。

### 8.4 実装方法の先回り

避ける:

```text
このif文へservant IDを追加して直してください。
```

改善:

```text
このcanonical inputが誤ったoutcomeになります。同じsemantic familyを監査し、ID分岐なしで所有modelを修正してください。
```

### 8.5 成功テストだけをDoneにする

避ける:

```text
テストが通ったらcommitしてください。
```

改善:

```text
focused／production testsに加え、inventory、calculator/ranking parity、fail-closed、performance、UI invariantを変更範囲に応じて確認してからcommitしてください。
```

## 9. Sessionを閉じる判断

次のいずれかでsessionを閉じ、Tasksとhandoffを更新する。

- TaskのDone gateを満たした。
- review findingを解消し、元outcomeが完了した。
- semantic ownerが変わる新しい問題を発見した。
- 同じfamilyで2回目の構造的差し戻しが発生した。
- `/status`でcontextが大きく増え、追加のproduction logや画像調査が必要になった。
- `/compact`後も完了済み調査を繰り返し始めた。

同じ問題の途中で機械的にnew sessionへ移る必要はない。正しい単位はtoken数だけでなく、coherent outcomeとcanonical handoffの有無で判断する。

## 10. Prompt送信前チェックリスト

- [ ] outcomeは一つか。
- [ ] Task IDまたはreview finding identityがあるか。
- [ ] 正本をpathで示し、全文を複製していないか。
- [ ] actualとexpectedをcanonical inputで説明したか。
- [ ] semantic familyと変更範囲を示したか。
- [ ] 維持するinvariantを書いたか。
- [ ] Done whenがtest成功以外も含むか。
- [ ] 別問題を発見した場合の停止条件があるか。
- [ ] full logではなくartifact pathを渡しているか。
- [ ] 現sessionで続ける理由、またはnew sessionにする理由が明確か。

## 11. 公式参考資料

- [OpenAI Docs: Best practices](https://learn.chatgpt.com/guides/best-practices)
- [OpenAI Docs: Prompting](https://learn.chatgpt.com/docs/prompting)
- [OpenAI Docs: Long-running work](https://learn.chatgpt.com/docs/long-running-work)
- [OpenAI Docs: AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
