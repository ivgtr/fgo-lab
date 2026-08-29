---
title: "FGO Lab 文書体系整備 Phase計画"
document_version: "1.0.0"
status: "Active"
created_at: "2026-08-30"
updated_at: "2026-08-30"
execution_tasks: "docs/development-redesign-tasks.md"
governing_documents:
  - "AGENTS.md"
  - "docs/fgo-lab-requirements-v0.3.md"
  - "docs/adr/008-refactoring-contract.md"
---

# FGO Lab 文書体系整備 Phase計画

## 1. 目的

本計画は、FGO Labのrequirements、ADR、Tasks、evidence、guideを、fresh cloneから一意に辿れる文書体系へ収束させる。ファイル数の削減自体を目的とせず、実装者が現在の正本、採用済み判断、実装順、完了証跡を誤認しない状態を作る。

文書整備は次の二段階で実行する。

- blocking maintenance: product／test／ranking実装を開始する前に、入口、正本参照、active task ownerを閉じる。
- closure maintenance: 新しい意味論とquality pathが確定した後に、phase report、旧計画、archive、automationを最終整理する。

実行順序と進捗は`docs/development-redesign-tasks.md`が所有し、本書は各Phaseの対象、判断規則、成果物、Done gateを所有する。

## 2. 利用者成果と不変条件

### 2.1 利用者成果

- fresh cloneで、実装に必要な正本文書がすべて利用できる。
- `docs/README.md`から、現行requirements、ADR、Tasks、evidence、guideへ到達できる。
- 実装順序は一つのTasks文書だけが所有する。
- superseded／complete／historicalな文書をactive requirementと誤認しない。
- damage差分、canonical input、governing semantic rule、inventory、digestを履歴整理後も確認できる。

### 2.2 不変条件

- activeなtracked文書からignored／untracked文書を正本として参照しない。
- damage correctnessの根拠、意図的damage差分、production inventory、calculator/ranking parity証跡を失わない。
- ADRを現在の実装に合わせて書き換えず、置換時は新ADRと`superseded_by`で履歴を残す。
- 文書整理のためにproduct semantics、schema、engine、UI behaviorを変更しない。
- obsolete判定はファイル名、更新日、incoming linkの有無だけで行わない。
- 削除前に、現行参照、Git履歴、後継正本、保持すべきcanonical evidenceを確認する。
- ignoredなローカル資料を、内容監査なしにtracked正本へ昇格しない。
- archiveやreportをAGENTS.mdへ大量列挙し、初期contextを増やさない。

## 3. 2026-08-30 baseline

read-only監査で次を確認した。

| 指標 | baseline |
| --- | ---: |
| tracked Markdown | 55 |
| working treeに存在するMarkdown | 86 |
| ignored／untracked Markdown | 31 |
| tracked reports | 16 |
| ignored／untracked reports | 15 |
| active tracked文書から参照されるuntracked target | 8 files |
| ADR files | 25 |
| ADR index掲載 | 23 |

主な不整合:

- `docs/fgo-lab-requirements-v0.3.md`が、trackedされないUI仕様、旧implementation plan、damage review、options文書を正本または関連資料として参照している。
- `docs/damage-effect-execution-requirements.md`がtrackedされない`docs/ui-design-spec.md`をUI baselineとして参照している。
- `docs/damage-effect-execution-requirements.md`はstatusがE3.2のまま、旧migration planはE4 complete／E5 not started、新Tasksはactiveであり、進捗の正本が複数ある。
- `docs/adr/README.md`はADR-024／025を掲載しておらず、各ADRのstatus表記も統一されていない。
- `docs/reports/*`のignore規則と、既にtrackedされているreport集合が一致していない。
- supersededな旧product requirementsが現行requirementsと同じtop-levelに全文で残る。
- `docs/README.md`が存在せず、tracked文書全体の入口がない。

baseline値は削除件数の目標ではない。Phase完了時は、件数差よりも正本参照のclosureとevidence保存を優先する。

## 4. 目標文書モデル

```text
docs/README.md
  |- Requirements
  |    現在のproduct／calculation／ranking／test契約
  |- ADR
  |    採用時点のarchitecture decisionとsupersession
  |- Tasks
  |    唯一のactive実装順序、依存、進捗、handoff
  |- Evidence
  |    canonical input、damage差分、inventory、digest、commit
  `- Guides
       prompt、contributor、運用上の非product guidance
```

### 4.1 Requirements

- 現在の利用者成果、domain invariant、受入条件を所有する。
- filenameに過去版を残す必要がある場合も、docs indexでcurrentを一つにする。
- implementation orderやphase progressを所有しない。
- ignoredなdesign optionやcomparisonを正本として参照しない。

### 4.2 ADR

- 採用時点の判断、背景、選択、結果を保持する。
- statusは`accepted | superseded`へ収束させる。
- 置換時は元ADRを編集して現行化せず、新ADRと相互linkを追加する。
- `docs/adr/README.md`は全ADRへのclickable indexとstatusを持つ。

### 4.3 Tasks

- activeな実装順序と状態を一つだけ保持する。
- requirementsやADRの内容を複製しない。
- complete後は最終handoffを残し、別のactive task ledgerを作らない。

### 4.4 Evidence

- intentional damage changeはcanonical inputとgoverning semantic ruleを持つ。
- inventory、digest、version、commit、検証commandを保持する。
- 会話経緯、raw test log、重複した途中経過だけのreportは正本にしない。
- 複数reportを統合する場合、後継evidenceから元commitを追跡可能にする。

### 4.5 Guides

- prompt engineeringやcontributor workflowなど、product semanticsではない運用を扱う。
- guideはrequirementsを上書きしない。
- docs indexから必要時だけ読めるようにし、AGENTS.mdへ全文を複製しない。

## 5. Blocking maintenance

### DOC-P0: Inventoryと判定規則の固定

成果物:

- tracked／ignored／untracked Markdown inventory
- 文書ごとのkind、status、current／superseded、incoming／outgoing reference
- active文書が参照するuntracked target一覧
- reportごとのcanonical evidence、後継文書、関連commit
- 本計画開始時のHEADとclean／dirty state

Done gate:

- 全tracked Markdownが判定対象に含まれる。
- incoming link 0だけを削除根拠にしていない。
- ignored local fileを正本と仮定していない。
- 削除または統合候補ごとに後継正本と保持evidenceを示せる。

### DOC-P1: `docs/README.md`と文書registry

`docs/README.md`を唯一のnavigation entryとして追加する。

最低限の列:

- path
- kind
- status
- authority／scope
- supersedes／superseded by
- implementation task
- evidence role

Done gate:

- 全tracked Markdownがregistryへ直接、またはADR／evidence sub-index経由で登録される。
- current requirementsとactive Tasksを一意に判定できる。
- root READMEまたはAGENTS.mdからdocs indexへ一つの短いlinkがある。
- archive／historical文書を初回読込対象にしていない。

### DOC-P2: Canonical reference closure

active tracked文書からignored／untracked targetへの正本参照を解消する。

判断順:

1. 現在もproduct contractか確認する。
2. 必要なら既存tracked requirements／ADRへ統合する。
3. 独立した責務なら新しいtracked requirementsとして確定する。
4. 単なる比較・検討履歴ならcanonical referenceから除外する。
5. 旧pathが必要なら短いsupersession stubまたはdocs indexで履歴を示す。

対象family:

- UI baseline
- implementation order
- damage calculation evidence
- home／my chaldea／craft essence／support／growth options

Done gate:

- active tracked Markdownからuntracked `.md`への参照0件。
- fresh clone上で全canonical link targetが存在する。
- UI、damage formula、implementation orderのauthorityがそれぞれ一つである。
- ignored comparison／optionsを実装要件として使用していない。

### DOC-P3: Status、version、Task owner、ADR indexの収束

対象:

- product／damage／ranking／test requirementsのstatusとversion
- 旧damage migration planのE5と新Tasksの責務重複
- `docs/adr/README.md`の024／025欠落
- ADR statusとsupersession metadata
- Proposed requirementsを前提にActive Tasksを進める際のapproval gate

Done gate:

- active実装順序は`docs/development-redesign-tasks.md`だけが所有する。
- 旧migration planの未完了E5はTasksへ移管され、旧計画のstatusが実態と一致する。
- current requirementsのstatusから着手可否を判断できる。
- ADR-001〜025がclickable indexへ全件掲載される。
- ADR statusが定義済みvalueへ正規化され、superseded decisionを追跡できる。

DOC-P0〜P3は`TSK-00.1`として実行し、完了するまでproduct／test／ranking baselineの`TSK-00`を開始しない。

## 6. Closure maintenance

### DOC-P4: Evidenceとphase reportの収束

tracked 16件、local ignored 15件のreportを、正しさの証拠として必要な情報から監査する。

保持判定:

- active requirements／ADRから参照される。
- intentional damage差分とcanonical inputを持つ。
- production inventory／digest／version／commitを持つ。
- 後続reportまたはtest fixtureから復元できない判断を持つ。

統合可能なreportは、canonical evidence documentへ次を移してから整理する。

- governing semantic rule
- before／after canonical inputとdamage
- inventory／digest
- schema／master／engine version
- implementation／verification commit
- remaining unsupported／invalid scope

Done gate:

- 保持reportとhistorical reportの判定理由がregistryにある。
- damage変更の根拠を削除していない。
- tracked report集合と`.gitignore`方針が一致する。
- 中間reportを削除しても、Git履歴と統合evidenceから判断を再構成できる。

### DOC-P5: Superseded文書とignored local資料の整理

対象:

- supersededな旧product requirements
- completeなstructure／unsupported／zero-unsupported plan
- 完了済み旧migration ledger
- comparison／options／review／HTMLなどのignored local資料
- `.gitignore`の個別例外と既track済みfileの不一致

原則:

- superseded全文をcurrent requirementsと同じ入口へ置かない。
- 実装に不要な履歴はGit commitから参照する。
- path継続が必要な場合は短いstubと後継linkだけを残す。
- ignored local資料の物理削除は、対象一覧を確認してから別の明示承認で行う。

Done gate:

- docs top-levelにactive、superseded、local-onlyが無分類で混在しない。
- complete planをactive task ledgerと誤認しない。
- `.gitignore`が将来のtracking policyを説明できる。
- materialな削除対象とrecoverabilityを記録している。

### DOC-P6: Documentation integrity automation

CIまたは`pnpm` commandへ、domain semanticsを解釈しない静的checkを追加する。

必須check:

- tracked Markdown内のlocal link targetがtrackedされている。
- 全tracked文書がdocs registryに登録されている。
- required frontmatterとstatus vocabularyが文書kindに一致する。
- ADR indexとADR file集合が一致する。
- active Tasksが最大一つで、`in_progress` taskが最大一件である。
- active requirementsがignored canonical sourceを参照しない。

Done gate:

- broken link、未登録文書、ADR index欠落をfixtureで検出できる。
- check成功時の出力がcompactである。
- failure時は対象pathとreasonをboundedに表示する。
- docs checkがproduct testやproduction auditを重複実行しない。

DOC-P4〜P6は`TSK-09.1`として、新ranking semanticsとtest quality pathの確定後、最終運用移行前に実行する。

## 7. Phase handoff

各Phase完了時に次をTasksへ記録する。

- status
- commit
- changed document registry entries
- added／removed／moved paths
- repaired references
- retained／consolidated evidence
- docs integrity commandとresult
- next Phaseのentry condition

raw document dumpや全Git logをhandoffへ貼らない。

## 8. 停止条件

次の場合は整理を停止し、対象文書のauthorityを確認する。

- 二つのtracked requirementsが異なるproduct behaviorを正本としている。
- ignored文書だけに現行UIまたはdamage ruleが存在する。
- report削除によりintentional damage差分の根拠が失われる。
- ADRの現行化に、採用済みdecision本文の書換えが必要になる。
- 旧計画の未完了項目が新Tasksへ移管されていない。
- 文書名変更がruntime、CI、公開URL、外部linkへ影響する。
- local ignored資料の物理削除が必要になる。

停止時は、競合するauthority、参照元、実装との一致、選択肢、推奨正本を提示してから再開する。

## 9. 完了条件

- fresh cloneでcurrent requirements、ADR、Tasks、evidence、guideが閉じている。
- `docs/README.md`から全tracked文書の役割とstatusを判定できる。
- active tracked文書からignored／untracked canonical targetへの参照が0件である。
- active task ledgerが一つで、旧phase計画が進捗正本として残っていない。
- ADR index、status、supersessionが実fileと一致する。
- report tracking policyと`.gitignore`が一致する。
- superseded／complete／historical文書をcurrent contractと誤認しない。
- intentional damage差分、canonical input、semantic rule、inventory、digestを追跡できる。
- docs integrity checkがCIまたはcanonical quality pathで実行される。
- 文書整備によるproduct semantics、damage、schema、engine、UI behaviorの変更がない。
