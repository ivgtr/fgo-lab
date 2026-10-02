---
title: "FGO Lab 文書体系整備 Phase計画"
document_version: "1.3.4"
status: "Active"
created_at: "2026-08-30"
updated_at: "2026-10-02"
execution_tasks: "docs/tasks/development-redesign-tasks.md"
governing_documents:
  - "AGENTS.md"
  - "docs/requirements/fgo-lab-requirements-v0.3.md"
  - "docs/adr/008-refactoring-contract.md"
---

# FGO Lab 文書体系整備 Phase計画

## 1. 目的

本計画は、FGO Labのrequirements、ADR、Tasks、evidence、guideを、fresh cloneから一意に辿れる文書体系へ収束させる。ファイル数の削減自体を目的とせず、実装者が現在の正本、採用済み判断、実装順、完了証跡を誤認しない状態を作る。

文書整備は次の二段階で実行する。

- blocking maintenance: product／test／ranking実装を開始する前に、入口、正本参照、active task ownerを閉じる。
- closure maintenance: 新しい意味論とquality pathが確定した後に、phase report、旧計画、archive、automationを最終整理する。

実行順序と進捗は`docs/tasks/development-redesign-tasks.md`が所有し、本書は各Phaseの対象、判断規則、成果物、Done gateを所有する。

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
| tracked Markdown | 56 |
| working treeに存在するMarkdown | 87 |
| ignored／untracked Markdown | 31 |
| tracked reports | 16 |
| ignored／untracked reports | 15 |
| active tracked文書から参照されるuntracked target | 8 files |
| ADR files | 25 |
| ADR index掲載 | 23 |

主な不整合:

- `docs/requirements/fgo-lab-requirements-v0.3.md`が、trackedされないUI仕様、旧implementation plan、damage review、options文書を正本または関連資料として参照している。
- `docs/requirements/damage-effect-execution-requirements.md`がtrackedされない`docs/requirements/ui-design-spec.md`をUI baselineとして参照している。
- `docs/requirements/damage-effect-execution-requirements.md`はstatusがE3.2のまま、旧migration planはE4 complete／E5 not started、新Tasksはactiveであり、進捗の正本が複数ある。
- `docs/adr/README.md`はADR-024／025を掲載しておらず、各ADRのstatus表記も統一されていない。
- `docs/reports/*`のignore規則と、既にtrackedされているreport集合が一致していない。
- supersededな旧product requirementsが現行requirementsと同じtop-levelに全文で残る。
- `docs/README.md`が存在せず、tracked文書全体の入口がない。

baseline値は削除件数の目標ではない。Phase完了時は、件数差よりも正本参照のclosureとevidence保存を優先する。

上記件数はTSK-00.1開始時のGit inventoryで再計測し、計画初版の55／86から56／87へ訂正した。ignored／untracked 31件と参照対象8件は不変である。

## 4. 目標文書モデル

```text
docs/README.md
docs/requirements/
  現在のproduct／calculation／ranking／test契約
docs/adr/
  採用時点のarchitecture decisionとsupersession
docs/tasks/
  唯一のactive実装順序、依存、進捗、handoff
docs/evidence/
  canonical input、damage差分、inventory、digest、commit
docs/guides/
  prompt、contributor、運用上の非product guidance
docs/archive/
  historical decision indexと、current tree保持が必要なsnapshot
docs/licenses/
  data source、license、attribution
Git history
  indexから復元可能なGit-only全文snapshot
```

このtreeはtracked文書の物理配置を表す。ignored／untracked local資料はDOC-P3.1で移動せず、DOC-P5の内容監査まで現状を保持する。

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

### 4.6 Archive

- `docs/archive/README.md`がdecision chain、snapshot status、canonical successor、復元情報を所有する。
- 本文内のstatusはsnapshot当時の値であり、現在の進捗や実装順序を所有しない。
- unique evidenceまたはpath契約があるsnapshotだけをcurrent treeへ保持する。
- current実装に不要で復元可能な全文はGit historyへ置き、初期navigationとrepo-wide searchから外す。

### 4.7 Frontmatter status vocabulary

`status`は文書kindごとに次のcase-sensitiveな値だけを使用する。この語彙はfrontmatterの文書statusを対象とし、Tasks本文のtask進捗（`ready | blocked | in_progress | done`）やarchive indexが記録するsnapshot当時のstatusとは区別する。

| Document kind | Allowed status |
| --- | --- |
| Requirement | `Active | Proposed | Superseded` |
| Registry／sub-index／license registry | `Active` |
| Tasks／phase plan／task plan | `Active | Complete` |
| Evidence | `Active | Complete | Superseded` |
| Historical | `Active | Complete | Superseded` |
| ADR | `accepted | superseded` |
| Guide | `Guideline` |

DOC-P6の静的checkは、文書path／registry kindからkindを一意に決定し、この集合以外の値、kind不明、status欠落をfail-closedで拒否する。

DOC-P6実装前baseline（HEAD `7d4041a`）では、`docs/`配下のtracked Markdown 74件のうちfrontmatterの`status`欠落が42件、許可語彙へ未収束の独自statusが4件ある。独自値は次の3種類である。

| Existing status | Files |
| --- | ---: |
| `Complete - Awaiting User UX Confirmation` | 2 |
| `Complete - Review Findings Corrected` | 1 |
| `Superseded by E4.1.3 activation witness closure` | 1 |

当時の計画では欠落42件と独自status 4件をDOC-P6実装時に正規化する予定だった。このbaselineはTSK-00.4を再開せず、TSK-00の開始を妨げなかった。現在はTSK-09.1 STEP 4がmetadataの意味を確定・移管し、STEP 5がその検査を実装する。現在集合の移管元・保持する意味・判定deltaは[既存判定台帳STEP 4](../evidence/tsk-09-1-documentation-closure.md#step-4-doc-p5metadata移管)を正本とする。

### 4.8 Kind別metadataとroot契約

kindはpathとregistryの明示分類から一意に決める。`docs/README.md`と各責務directoryの`README.md`はregistry／sub-index、`docs/licenses/`はlicense registryである。`docs/tasks/`のcanonical ledgerはTasks、文書整備計画はphase plan、完了済みTSK-06.48計画2件はtask planとする。`docs/evidence/`のMarkdownはEvidence、JSONはmachine evidenceであり別形式である。kind不明・分類矛盾は拒否し、ファイル名から未知kindを推定して既定値へ変換しない。

| Kind | 必須metadataと意味 |
| --- | --- |
| docs Markdown共通 | 空でない`title`、4.7のcase-sensitiveな`status`。これらは文書の役割を表し、Task進捗・ゲーム内outcome・採取runの成功とは別である |
| Requirement、registry／sub-index／license registry、Tasks／phase plan／task plan、Guide | `document_version`と`updated_at`。既存の承認gate・参照fieldも保持する。今回の更新日を過去の承認・採取日へ代入しない |
| ADR | 本文・indexと一致する`accepted | superseded`。本文に採用時の日付がある場合は`date`をそのまま移管。日付記録のないADR-020〜025は`date`を捏造せず、accepted判断の導入を確認した40桁Git commitを`recorded_commit`へ保持する。これは採用日・承認日時ではない。superseded ADRには既存置換系列の`superseded_by`をADR IDで明示する |
| Evidence／Historical | `title`と`status`。既存のdate／created_at／updated_at、文書版、input／rule／damage／inventory／digest／schema・master・engine版／commit／未対応scopeを保持する。元にない採取日・文書版は一律必須化せず、歴史identityを現在値で補わない |

metadata移管時の`historical_status`は、元frontmatterまたは本文状態の原文字列をそのまま保持する空でないscalarである。未知の現行`status`を許容するfieldではなく、検査器はこの値から現在statusを復元・補完しない。`status_scope`は、移管した文書statusが成立する実装・採取・検証scopeと限界を説明する空でないscalarである。両fieldを追加する対象と根拠は判定台帳の個別rowに固定する。Evidenceの`superseded_by`は一件に確定したtracked後継pathだけを記録し、系列だけの場合は既存indexの案内を維持する。

`Complete`は記載scopeの記録完了であり、UX承認済み、現HEADでの全件検証成功、project closureを含意しない。元`Awaiting User UX Confirmation`、本文の確認待ち、`Verified`、`Implementation`、review修正の意味は履歴fieldと本文へ分離する。Task doneからUX承認を推定しない。archive indexのsnapshot status、ADR採用本文、machine JSONのdomain statusへMarkdown語彙を適用しない。

rootには一般docsのfrontmatter契約を適用しない。専用kindは[root登録表](../README.md#repository入口と規約)が所有し、`README.md`＝開発入口、`AGENTS.md`＝作業規約、`CLAUDE.md`＝aliasとする。READMEとAGENTSはtracked本文・役割に必要なdocs入口参照、CLAUDEはGit mode120000のsymlink・link値`AGENTS.md`・tracked解決先を検査する。aliasに別の本文・status・versionを持たせない。

STEP 4はこの契約と明示移管を所有する。STEP 5は全tracked登録・link構文・kind別metadata・root／aliasを既存検査ownerで実装し、未知status・欠落・不一致をfixtureで拒否する。現行6testの成功を、この新しい全件検査の完成とは扱わない。

STEP 5の実装は既存`docs-integrity-lib.mjs`をownerとする。Git indexの全Markdownとmachine evidence JSONを母集団とし、registry→sub-index→親noteの有効な参照から登録到達を判定する。Markdown／YAML／HTMLは既存Prettier parserで読み、未知kind／field、必須値の欠落・重複・矛盾、未対応参照構文を拒否する。現在参照のpath fieldと、版付きの歴史citation・本文literal・Git復元locatorを区別し、歴史statusやmachine JSONのdomain statusを現行metadataへ変換しない。

`pnpm test:docs`はfixtureと実CLI、現tracked集合の検査を既存quality／CI入口から実行する。CLI単独は`node scripts/docs-integrity.mjs`、明示したGit fixtureを検査するときだけ`--root=<path>`を使う。成功は2行、失敗は代表5件・省略数・artifact pathを表示し、長いreasonもbyte上限で制限する。全診断JSON・完全診断log・bytes／SHA receipt付きmanifestは既存`.test-results/<run-id>/`へ保存し、quality内では既存`FGO_QUALITY_RUN_DIR/docs/`へ接続する。保存失敗は非zeroとし、別保存先へ補完しない。retentionと不足時操作は[テスト戦略§9](../requirements/test-strategy-redesign.md#9-artifact仕様)の既存契約に従う。

Revision: v1.3.3（2026-10-02）は利用者承認済みSTEP 4に基づくkind／metadata・root契約とDOC-P5／P6責務の明示。既存status語彙・product／damage／baseline／digest／artifact schemaは不変。検査実装はTSK-09.1 STEP 5、統合・取得受入はSTEP 6に残す。

Revision: v1.3.4（2026-10-02）は利用者承認済みSTEP 5の検査owner・参照分類・CLI診断保存の操作を接続する。STEP 4のmetadataの意味・許可status・保持判断と既存quality step／CIは不変。STEP 5の受入結果は[既存判定台帳](../evidence/tsk-09-1-documentation-closure.md#step-5-doc-p6検査実装)、別checkout／history取得はSTEP 6が所有する。

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

- active実装順序は`docs/tasks/development-redesign-tasks.md`だけが所有する。
- 旧migration planの未完了E5はTasksへ移管され、旧計画のstatusが実態と一致する。
- current requirementsのstatusから着手可否を判断できる。
- ADR-001〜025がclickable indexへ全件掲載される。
- ADR statusが定義済みvalueへ正規化され、superseded decisionを追跡できる。

DOC-P0〜P3は`TSK-00.1`として実行し、完了するまでproduct／test／ranking baselineの`TSK-00`を開始しない。

### DOC-P3.1: Canonical physical layout cutover

DOC-P0〜P3で確定したauthorityを、fresh cloneで役割がpathから判定できる物理配置へ移す。これは文書内容の再設計ではなく、tracked正本の一括path cutoverである。

移動先:

- current requirements: `docs/requirements/`
- active Tasks／phase plan: `docs/tasks/`
- inventory／report index／tracked reports: `docs/evidence/`
- contributor／prompt guidance: `docs/guides/`
- superseded requirements／complete plans: `docs/archive/`
- ADRとlicense: 既存の`docs/adr/`、`docs/licenses/`を維持

実行規則:

- basename変更はauthority衝突の解消に必要な場合だけ行う。
- 移動前にcode、CI、README、frontmatter、Markdown、command例、公開URLのincoming referenceを監査する。
- 全tracked参照を同じcutoverで新pathへ更新し、old pathとの二重正本を残さない。
- Git履歴から追跡できる移動を優先し、内容変更やformat変更を混在させない。
- ignored／untracked local資料は移動、削除、tracked化しない。
- 外部path契約が判明した場合は、compatibility stubを推測で追加せず停止条件として扱う。

Done gate:

- trackedな`docs/`直下は`README.md`と責務別directoryだけである。
- tracked文書のkindをpathから判定でき、registry分類と一致する。
- 全tracked local linkが新pathで解決し、旧pathをcanonical sourceとして参照しない。
- root README、docs registry、ADR／evidence sub-index、frontmatterが新pathと一致する。
- product semantics、damage rule、status、evidence内容に差分がない。
- TSK-00が新pathとclean worktreeをbaseline identityとして使用できる。

DOC-P3.1は`TSK-00.2`として実行する。DOC-P5は移動済みhistorical／evidenceの保持、統合、削除判断を担当し、物理配置の初回cutoverを担当しない。

### DOC-P3.2: Ignored documentation disposition and quarantine

DOC-P3.1で意図的に保持したignored 29 Markdown＋8 HTMLを内容監査し、fresh cloneの正本体系とlocal-only資料の物理境界を閉じる。filename、旧status、incoming linkの有無だけでは判定しない。

分類と処理:

- `Canonical delta`: 現行requirements／ADRに存在しない意味論を特定し、authorityと受入条件を決めて正本へ統合する。元資料をそのままactive正本へ昇格しない。
- `Retained evidence`: canonical input、damage差分、production inventory、digest、version、commit等を持つ資料を`docs/evidence/`へtracked化する。
- `Historical decision`: 後継正本から復元できない判断経緯を持つ資料を`docs/archive/`へtracked化し、active task ownerではないことを明示する。
- `Local-only`: 実装要件・保持evidence・判断履歴を所有しない比較demo、作業prompt等だけを`.local-docs/docs/<元のdocs/以下の相対path>`へ内容不変で移動する。

実行規則:

- 処遇前に全37件のpath、bytes、SHA-256を固定する。
- architecture／review、旧plan、UI options／demo、damage／master reportをfamily単位で現行正本と比較する。
- statusが`In Progress`等でも、後続実装、commit、現行Tasksへの責務移管を確認して現行性を判定する。
- canonical統合後に元資料をevidence、archive、local-onlyのどれとして保持するか記録する。
- local-only移動は相対pathを保持し、移動前後のSHA-256を照合する。物理削除は行わない。
- 処遇完了後、`docs/`配下の個別・glob ignoreを削除し、`.local-docs/docs/**`だけをignoreする。

Done gate:

- 29 Markdown＋8 HTMLを全件分類済みである。
- canonical deltaの未移管とdamage evidenceの未判定が0件である。
- local-only資料の移動前後SHA-256が一致し、ignored資料の削除が0件である。
- `docs/`を対象にするignore規則が0件である。
- active tracked文書からlocal-only資料への参照が0件である。
- TSK-00のbaselineが最終的な正本体系だけを対象にできる。

DOC-P3.2は`TSK-00.3`として実行し、完了するまで`TSK-00`を開始しない。

### DOC-P3.3: Entrypoint and archive compaction

TSK-00.3完了時点の`docs/README.md`は73行／10,894 bytesで、registry約35項目のうち18項目をarchive個別文書が占める。`docs/archive/`は18文書／5,013行／335,535 bytesで、複数世代のplanとdecision snapshotを保持する。履歴保持自体ではなく、それらを唯一の初期入口へ個別列挙し、repo-wide searchの標準対象へ残すことを解消する。

責務:

- `docs/README.md`: current authorityと責務別sub-indexだけを案内する。
- `docs/archive/README.md`: historical decision chain、snapshot status、canonical successor、復元情報を所有する。
- Git history: current実装に不要な全文snapshotのblobを保持する。
- `docs/evidence/README.md`: damage差分、canonical input、inventory、digest、commitを持つevidenceを引き続き所有する。

Git-only判定条件:

1. current requirements／ADR／Tasksへ有効な判断と未完了作業が移管済みである。
2. intentional damage差分、production inventory、digest等のcanonical evidenceがevidence側へ保持される。
3. active tracked文書、code、CI、公開URLからarchive本文へのpath契約がない。
4. source commit、Git blobまたはSHA-256、canonical successorをarchive indexへ記録できる。
5. 削除後も判断の採用順と現在authorityをarchive indexから再構成できる。

対象family:

- product requirement evolution
- damage execution／condition／dependency／unsupported／quality plan chain
- implementation／demo restoration ledger
- UI research／options decision chain
- master delivery／data-flow upstream decision

実行規則:

- filename、行数、旧statusだけでGit-only化しない。
- `Ready for Implementation`／`In Progress`はsnapshot当時のstatusとして扱い、現在statusはarchive indexが所有する。
- canonical deltaを発見した場合は、削除せずrequirements／ADR／Tasksのauthority競合として停止する。
- unique evidenceを発見した場合は、canonical input、rule、version、commitとともにevidenceへ移してからGit-only化を再判定する。
- damage evidence 31件の統合・削除は本Phaseへ含めず、DOC-P4／TSK-09.1へ残す。
- tracked文書のHEADからの除去は、staged deletion listとrecoverabilityを検証してfamily単位でcommitする。

Done gate:

- `docs/README.md`がarchive／evidence個別文書を列挙せず、8 KiB以下である。
- current requirements、active Tasks、ADR、evidence、archive、guide、licenseへ一意に到達できる。
- archive 18件すべてにretain／Git-only、current successor、source commit、blob／SHA-256、判定理由がある。
- 未移管Task、canonical delta、未判定damage evidenceが0件である。
- Git-only文書をarchive indexの情報だけから復元できる。
- README縮小前後のlines、bytes、registry row、概算token差分を記録する。
- tracked local linkとregistryが閉じ、product semanticsとdamage evidenceに差分がない。

DOC-P3.3は`TSK-00.4`として実行し、完了するまで`TSK-00`を開始しない。DOC-P4〜P5は実装後に増えたevidenceと残存archiveを再監査し、DOC-P3.3のGit-only判定を理由なく再実行しない。

## 6. Closure maintenance

### DOC-P4: Evidenceとphase reportの収束

TSK-00.3完了時点でtracked化された31件のreportを、正しさの証拠として必要な情報から再監査する。ignored reportは0件であり、local quarantine 9件はcanonical evidenceを持たないと判定済みである。

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

## 7. 実行手順

Task共通の開始、検証、handoff、commit手順は`docs/tasks/development-redesign-tasks.md`の更新規則に従う。本書では文書整備固有の順序だけを定義する。

### 7.1 Blocking maintenanceの進め方

1. `TSK-00.1`のentry conditionと作業ツリーを確認し、開始commitでstatusを`in_progress`へ変更する。
2. DOC-P0をread-onlyで実行し、開始HEAD、文書inventory、参照関係、tracking状態、evidence候補を固定する。
3. DOC-P1で`docs/README.md`とregistryを追加する。この時点では既存文書のauthorityを推測で変更しない。
4. DOC-P2でuntracked canonical referenceを一familyずつ解消する。UI、damage、optionsを同じ変更へ混在させない。
5. DOC-P3でstatus、version、Task owner、ADR indexを収束させる。採用済みADRの判断変更が必要なら新ADRへ切り出す。
6. fresh clone相当のtracked file集合を基準に、local link、registry、ADR index、formatを検証する。
7. DOC-P0〜P3のDone gateを確認し、Handoffへ変更path、修復参照、保持evidence、検証command、次のentry conditionを記録する。
8. completion commitで`TSK-00.1`を`done`、`TSK-00.2`を`ready`へ更新する。

### 7.2 Canonical physical layout cutoverの進め方

1. TSK-00.1のHandoffとregistryを確認し、`TSK-00.2`を`in_progress`へ変更する。
2. tracked文書だけを対象にmove mapとincoming reference inventoryを固定する。
3. requirements、Tasks、evidence、guides、archiveの順に、責務familyごとのbounded commitで移動と参照修復を行う。
4. 各familyでtracked link、frontmatter、registry、root READMEを検証し、旧path参照を残さない。
5. 全family移動後にfresh clone相当のtracked treeを検証し、Handoffへmove mapと検証結果を記録する。
6. completion commitで`TSK-00.2`を`done`、`TSK-00`を`ready`へ更新する。

### 7.3 Ignored documentation dispositionの進め方

1. TSK-00.2のHandoffを確認し、`TSK-00.3`を`in_progress`へ変更する。
2. ignored資料のpath、bytes、SHA-256を固定し、family単位でcanonical delta、evidence、history、local-onlyへ分類する。
3. canonical deltaとevidenceをtracked責務へ収束させ、local-onlyだけを`.local-docs/docs/`へ隔離する。
4. hash、削除0件、ignore、link、registryを検証し、completion commitで`TSK-00.3`を`done`、`TSK-00.4`を`ready`へする。

### 7.4 Entrypoint and archive compactionの進め方

1. TSK-00.3のHandoffを確認し、`TSK-00.4`を`in_progress`へ変更する。
2. README、archive、evidenceのlines、bytes、registry rowとarchive 18件のincoming referenceを固定する。
3. archive indexを先に作り、familyごとのsuccessor、source commit、blob／SHA-256、snapshot statusを記録する。
4. canonical deltaとunique evidenceがないfamilyだけをGit-only化し、各commitでrecoverabilityとtracked linkを検証する。
5. `docs/README.md`をcurrent authorityとsub-indexだけへ縮小し、変更前後のcontext指標を記録する。
6. completion commitで`TSK-00.4`を`done`、`TSK-00`を`ready`へ更新する。

### 7.5 Closure maintenanceの進め方

1. `TSK-08`のDone gateと、新ranking semantics／test quality pathが確定済みであることを確認する。
2. `TSK-09.1`を`in_progress`へ変更し、tracked／ignored reportと旧計画のinventoryを再取得する。
3. DOC-P4でcanonical evidenceへ必要情報を統合する。統合先の検証前に元reportを削除しない。
4. DOC-P5でsuperseded／complete／historical／local-onlyを分類し、参照を後継正本へ切り替える。
5. tracked文書の移動・削除は参照検証後に行う。ignored local資料の物理削除は本Taskに含めず、別の明示承認を得る。
6. DOC-P6の静的checkを追加し、失敗fixtureと成功時のcompact outputを確認する。
7. docs integrity checkと影響範囲のquality gateを実行し、damage evidence、inventory、digestが保持されていることを確認する。
8. Handoffを記録し、completion commitで`TSK-09.1`を`done`、`TSK-09`を`ready`へ更新する。

### 7.6 変更単位

- 一つのcommitは、一つのDOC-Pまたは一つの明確な文書familyへ限定する。
- inventory、registry、reference修復、archive整理、automationを同じcommitへ束ねない。
- 各commit前に対象pathだけをstageし、`git diff --cached --check`とstaged name listを確認する。
- formatのみの変更をsemanticな文書変更へ混在させない。
- 途中で停止する場合も、未確定事項と安全な再開commandをTasksのHandoffへ残す。

## 8. Phase handoff

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

## 9. 停止条件

次の場合は整理を停止し、対象文書のauthorityを確認する。

- 二つのtracked requirementsが異なるproduct behaviorを正本としている。
- ignored文書だけに現行UIまたはdamage ruleが存在する。
- report削除によりintentional damage差分の根拠が失われる。
- ADRの現行化に、採用済みdecision本文の書換えが必要になる。
- 旧計画の未完了項目が新Tasksへ移管されていない。
- 文書名変更がruntime、CI、公開URL、外部linkへ影響する。
- local ignored資料の物理削除が必要になる。

停止時は、競合するauthority、参照元、実装との一致、選択肢、推奨正本を提示してから再開する。

## 10. 完了条件

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
