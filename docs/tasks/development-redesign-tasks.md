---
title: "FGO Lab テスト・ランキング再設計 Tasks"
document_version: "1.7.2"
status: "Active"
created_at: "2026-08-30"
updated_at: "2026-09-05"
source_requirements:
  - "docs/requirements/fgo-lab-requirements-v0.3.md"
  - "docs/requirements/ui-design-spec.md"
  - "docs/requirements/test-strategy-redesign.md"
  - "docs/requirements/ranking-self-and-conditional-effects-requirements.md"
  - "docs/requirements/development-execution-efficiency-requirements.md"
source_plans:
  - "docs/tasks/documentation-maintenance-phases.md"
governance_contract: "docs/guides/document-governance.md"
---

# FGO Lab テスト・ランキング再設計 Tasks

## 1. 役割

本書は、5つの要件書にまたがる実装順序、依存関係、進捗、phase handoffを所有する。意味論、品質要件、受入条件の正本は各source requirementsであり、本書では再定義しない。各未完了TaskのContract closure matrixは正本のContract IDに対する適用判断、検証command、artifact、延期先だけを所有する。

状態は次だけを使用する。

- `ready`: 依存taskが完了し、着手可能
- `blocked`: 依存taskまたは設計判断待ち
- `in_progress`: 現在実装中。常に最大1件
- `done`: Done gateとhandoffを記録済み

Task開始時に状態とbaseline identityを更新し、完了時にcommit、artifact manifest、inventory／digest差分、次taskの開始条件を記録する。raw test log、全source listing、全screenshotは本書へ貼らない。

flow closureはcanonical state、outcome classification、または複数のexecution／write pathを変更する未完了Task／sub-itemだけに適用する。それ以外は`Flow closure: N/A: <理由>`の一行で閉じる。対象範囲はsemantic familyの直接reader／writerと、damage、precision、operation outcome、required input、UI commandを変える経路に限定し、間接依存はこれらを変換する場合だけ含める。

flow closure noteはfamilyごとにtracked正本を一つだけ置く。Tasksはpath、status、未解決項目、prompt／handoffは正本pathと今回のdeltaだけを記録する。初回inventory後はbaselineから変更または新規発見されたproducer、consumer、writer、recovery、反証cellだけを再監査する。各対象を`Verified`、`N/A: <理由>`、`Deferred: <TSK-ID>`、`Blocking: <理由>`に分類し、`Blocking` 0件を完了条件とする。

通常はnoteのself-check後に同じsessionで実装へ進む。ownershipが複数案に分かれる、product requirementを拡張する、`Blocking`なwrite pathが残る、schema-legal stateの期待outcomeを決められない場合だけ計画レビューを要求して停止する。reviewで新しい経路が判明した場合は局所patchより先に正本noteのdeltaを更新するが、手戻り回数自体はfailure metricにしない。

## 2. Task index

| ID | Task | Status | Depends on | Primary source |
| --- | --- | --- | --- | --- |
| TSK-00.1 | Documentation source normalization | done | - | documentation maintenance DOC-P0〜P3 |
| TSK-00.2 | Canonical documentation layout cutover | done | TSK-00.1 | documentation maintenance DOC-P3.1 |
| TSK-00.3 | Ignored documentation disposition and quarantine | done | TSK-00.2 | documentation maintenance DOC-P3.2 |
| TSK-00.4 | Documentation entrypoint and archive compaction | done | TSK-00.3 | documentation maintenance DOC-P3.3 |
| TSK-00 | Baseline固定 | done | TSK-00.4 | 全要件書 |
| TSK-01 | Compact runnerとagent command契約 | done | TSK-00 | test strategy T1／execution efficiency |
| TSK-02 | Suite分類とcanonical quality gate | done | TSK-01 | test strategy T2 |
| TSK-02.1 | Documentation contract closure gate | done | TSK-02 | document governance／early DOC-P6 |
| TSK-03 | 共有production audit foundation | done | TSK-02.1 | test strategy T3／ranking production audit |
| TSK-04 | Ranking canonical IR cutover | done | TSK-03 | ranking layer ownership／移行方針 |
| TSK-05 | Transactional preparation execution | done | TSK-04 | ranking execution／NP resource |
| TSK-06 | Ranking policyとcandidate planner | done | TSK-05 | ranking condition／candidate planning |
| TSK-06.1 | Portable calculation request and identity | done | TSK-06 | product portable data／ranking handoff |
| TSK-06.2 | E2E responsibility and execution closure | done | TSK-06.1 | test strategy Web component／E2E ownership |
| TSK-06.3 | Test observability and artifact closure | done | TSK-06.2 | test strategy T4 execution observability |
| TSK-06.4 | Ranking policy semantic design closure | done | TSK-06.3 | source-program／finite domain／ADR-028 design closure |
| TSK-06.41 | Ranking contribution and portable atomic cutover | done | TSK-06.4 | contribution／action admission／outcome／portable runtime |
| TSK-06.46 | Resolved attacker level-stat fail-closed | done | TSK-06.41 | resolved scenario／master ATK join／recovery |
| TSK-06.47 | Profile servant-record identity fail-closed | done | TSK-06.41 | profile map identity／persistence／shared consumers |
| TSK-06.42 | Ranking population, level, and NP-level basis cutover | ready | TSK-06.46, TSK-06.47 | comparison scenario／owned data／URL・worker identity |
| TSK-06.43 | Canonical maximum stack quantity | blocked | TSK-06.42 | satisfied quantity witness／stack maximum semantics |
| TSK-06.45 | All attack-NP execution closure | blocked | TSK-06.43 | trigger relevance／dependent resource／production coverage |
| TSK-06.44 | Contribution decision UI cleanup | blocked | TSK-06.45 | logical effect presentation／per-contribution decisions |
| TSK-06.5 | Ranking theoretical maximum and production closure | blocked | TSK-06.44 | final candidate／maximum／legacy-removal proof |
| TSK-07 | Web／worker一括切替 | blocked | TSK-06.5 | ranking UI／handoff／cache |
| TSK-08 | Production audit最終収束とfailure diagnostics | blocked | TSK-07 | test strategy T3/T4／ranking test gate |
| TSK-09.1 | Documentation evidence／archive finalization | blocked | TSK-08 | documentation maintenance DOC-P4〜P6 |
| TSK-09 | Performance、運用移行、旧経路削除 | blocked | TSK-09.1 | test strategy T5／全完了条件 |

```text
TSK-00.1 -> TSK-00.2 -> TSK-00.3 -> TSK-00.4 -> TSK-00 -> TSK-01 -> TSK-02 -> TSK-02.1 -> TSK-03 -> TSK-04 -> TSK-05 -> TSK-06 -> TSK-06.1 -> TSK-06.2 -> TSK-06.3 -> TSK-06.4 -> TSK-06.41
TSK-06.41 -> TSK-06.46
TSK-06.41 -> TSK-06.47
TSK-06.46 + TSK-06.47 -> TSK-06.42 -> TSK-06.43 -> TSK-06.45 -> TSK-06.44 -> TSK-06.5 -> TSK-07 -> TSK-08 -> TSK-09.1 -> TSK-09
```

## 3. Tasks

### TSK-00.1: Documentation source normalization

- [x] `docs/tasks/documentation-maintenance-phases.md`のDOC-P0 inventoryを固定する。
- [x] DOC-P1として`docs/README.md`と文書registryを追加する。
- [x] DOC-P2としてactive tracked文書からignored／untracked canonical targetへの参照を閉じる。
- [x] DOC-P3としてstatus、version、Task owner、ADR indexを収束させる。

Done gate:

- fresh cloneでcurrent requirementsとactive Tasksを一意に辿れる。
- active tracked Markdownからuntracked `.md`への参照0件。
- active実装順序を本Tasksだけが所有する。
- ADR-001〜025とstatusをindexから確認できる。
- report／archiveの削除は行わず、TSK-09.1の判定inventoryへ残している。

Handoff:

- Commit: `e0abdc8` (DOC-P0)、`2a18be4` (DOC-P1)、`02d4b98` (DOC-P2)、`08880c1` (DOC-P3)、本completion commit
- Registry: `docs/README.md`、`docs/evidence/documentation-inventory.md`、`docs/adr/README.md`、`docs/evidence/README.md`
- Repaired references: UI baselineとdamage reviewをtracked正本化。旧implementation planとhome／my chaldea／craft essence／support／growth optionsのcanonical参照をTasksまたはUI正本へ収束
- Retained evidence: tracked report 16件とignored local report 15件を削除せず、TSK-09.1の判定inventoryへ保持
- Verification: fresh-clone相当のtracked集合で61 Markdown登録、active canonical untracked参照0、ADR file／index各25、`in_progress` 1件を確認
- Original next command: `git status --short && git rev-parse HEAD`でTSK-00のbaseline identityを開始する
- Current next task: TSK-00.1完了後の体系見直しにより、TSK-00.2を先行する

### TSK-00.2: Canonical documentation layout cutover

Depends on: TSK-00.1

- [x] tracked文書の移動mapと、code／CI／README／Markdown／外部公開pathを含むincoming referenceを固定する。
- [x] current requirementsを`docs/requirements/`、Tasks／phase planを`docs/tasks/`、evidenceを`docs/evidence/`、guideを`docs/guides/`へ移す。
- [x] tracked historical requirements／completed plansを`docs/archive/`へ移し、ADR、license、入口READMEは責務別directoryに維持する。
- [x] root README、registry、frontmatter、全tracked local link、command例を新pathへ一括切替する。
- [x] old pathとの二重正本やcompatibility copyを残さず、fresh clone相当のtracked treeを検証する。

Done gate:

- fresh cloneの`docs/`直下は`README.md`と責務別directoryだけで、tracked文書が無分類に混在しない。
- Requirements／ADR／Tasks／Evidence／Guides／Archive／Licensesをpathから判定できる。
- 全tracked Markdownのlocal link targetがtracked新pathに存在する。
- current requirements、active Tasks、ADR／evidence indexを`docs/README.md`から一意に辿れる。
- 文書内容のproduct semantics、damage rule、status、evidence、Git上の履歴を変更していない。
- ignored／untracked local資料を移動、削除、tracked化していない。
- runtime、CI、公開URL、外部linkに旧path契約がある場合は推測でstubを作らず、影響と選択肢をHandoffへ記録して停止する。

Handoff:

- Start baseline: `c1cc433cc0c2f2f7613d99a8c0b0feb9d42b4db9`、clean worktree
- Commit: `f7cb45f` (start)、`86ed536` (requirements)、`1b50421` (Tasks)、`ef467cb` (evidence)、`bca4344` (guide)、`2e7e8b4` (archive)、`5d861f8` (baseline evidence path correction)、`797f5bd` (completion)、`71df2e6` (local-only count correction)、本handoff metadata commit
- Move map: current requirements 7件を`docs/requirements/`、Tasks／phase plan 2件を`docs/tasks/`、inventory／index／report 18件を`docs/evidence/`、guide 1件を`docs/guides/`、historical requirement／complete plan 5件を`docs/archive/`へ移動。ADR 26件、license 1件、`docs/README.md`は既存責務directory／入口に維持
- Incoming references: tracked code／CI／GitHub Pages／外部公開pathに旧path契約0件。root READMEは`docs/README.md`だけを公開入口として参照。tracked Markdown、frontmatter、command例、registry、`.gitignore`の旧tracked pathを同一family commitで切替
- Repaired references: current canonical pathの旧参照0件。TSK-00.1 inventoryの旧pathはbaseline evidenceとして明示的に保持し、canonical successorだけを新pathへ更新。compatibility copy／stubなし
- Verification: tracked `docs/` 61 Markdownは直下`README.md`と7責務directoryだけ。全tracked 63 Markdownのlocal link解決、registry 20 unit、ADR 25件、evidence report 16件、`in_progress` 0件を確認。TSK-00.2開始時点のignored／untracked Markdown 29件とHTML 8件は未移動・未削除・未track
- Next command: `git status --short && git rev-parse HEAD`でTSK-00のbaseline identityを開始する

### TSK-00.3: Ignored documentation disposition and quarantine

Depends on: TSK-00.2

- [x] ignored 29 Markdown＋8 HTMLのpath、bytes、SHA-256と開始HEADを固定する。
- [x] architecture／review、旧plan、UI options／demo、damage／master reportをfamily単位で現行正本と比較する。
- [x] 各資料を`Canonical delta | Retained evidence | Historical decision | Local-only`へ分類し、canonical deltaとdamage evidenceの未判定を0件にする。
- [x] canonical deltaはauthorityと受入条件を確定して現行requirements／ADR／guideへ統合し、evidence／historicalは責務directoryへtracked化する。
- [x] local-onlyだけを`.local-docs/docs/<docs以下の相対path>`へ内容不変で移動し、個別・広域の`docs/` ignoreを単一quarantine規則へ置換する。

Done gate:

- 29 Markdown＋8 HTMLが全件分類され、判定理由とsuccessor／retention roleをinventoryから確認できる。
- 移動対象の移動前後SHA-256が一致し、ignored資料の削除が0件である。
- canonical deltaの未移管とdamage evidenceの未判定がともに0件である。
- local-only資料は元の相対pathを保持して`.local-docs/docs/`にだけ存在する。
- `docs/`を対象にするignore規則が0件で、新規の未登録文書をGit statusが検出できる。
- active tracked文書からlocal-only資料への参照が0件である。
- TSK-00が最終的なtracked正本体系だけをbaseline対象にできる。

Handoff:

- Start baseline: `256c2d2c`、clean worktree
- Inventory: `docs/evidence/ignored-documentation-disposition.md`
- Commit: `c19d273` (start／inventory)、`1b419a8` (historical)、`1d2ee71` (evidence)、`c2d9863` (canonical data flow)、`cd1500a` (quarantine policy)、本completion commit
- Disposition: Canonical delta 1、Retained evidence 15、Historical decision 12、Local-only 9。baseline source 37件はarchive 13、evidence 15、local quarantine 9へ内容hashを保って処遇
- Verification: baseline 37件のdestination SHA-256一致、local-only 9件、削除0件、`docs/`対象ignore 0件、tracked local link／registry／ADR／evidence index closure、active canonicalからlocal-only参照0件を確認
- Original next command: `git status --short && git rev-parse HEAD`でTSK-00のbaseline identityを開始する
- Current next task: TSK-00.3完了後のentrypoint監査により、TSK-00.4を先行する

### TSK-00.4: Documentation entrypoint and archive compaction

Depends on: TSK-00.3

- [x] `docs/README.md`、`docs/archive/`、`docs/evidence/`のfile数、lines、bytes、registry rowと初回読込範囲をbaseline化する。
- [x] `docs/README.md`をcurrent authorityと責務別sub-indexだけへ縮小し、archive個別文書とprocess inventoryをStart here／root registryから外す。
- [x] `docs/archive/README.md`を追加し、historical文書をdecision family、snapshot status、canonical successor、source commit、blob／SHA-256で索引化する。
- [x] archive 18件を内容監査し、未移管Task、canonical delta、保持すべきdamage／production evidenceを0件まで判定する。
- [x] Git-only条件を満たす全文snapshotはcurrent treeから除き、復元情報だけをarchive indexへ保持する。
- [x] damage evidence 31件は本Taskで統合・削除せず、`docs/evidence/README.md`配下へ維持してTSK-09.1へ渡す。

Done gate:

- `docs/README.md`がcurrent requirements、active Tasks、ADR／evidence／archive index、guide、licenseだけを案内し、archive／evidence個別文書を列挙しない。
- `docs/README.md`が8 KiB以下で、変更前後のlines、bytes、registry row、概算token差分をHandoffへ記録している。
- historical decision chainと現在のsuccessorを`docs/archive/README.md`から一意に判定できる。
- archive本文の旧`Ready for Implementation`／`In Progress`を現在statusと誤認しない。
- Git-only化した文書はsource commit、blob／SHA-256、canonical successorから復元できる。
- product semantics、active Task、damage evidence、production inventory、digestを失っていない。
- tracked local link、registry、ADR／evidence／archive indexが閉じている。

Handoff:

- Start baseline: `d37f52e`、clean worktree。`docs/README.md` 1件／73行／10,907 bytes／registry 35 rows、`docs/archive/` 18件／5,013行／335,535 bytes、`docs/evidence/` 34件／3,704行／235,915 bytes
- Entrypoint before／after: 初回読込対象の`docs/README.md`を73行／10,907 bytes／35 registry rowsから46行／4,318 bytes／16 rowsへ縮小。bytes÷4の概算tokenは2,727から1,080（-1,647、-60.4%）。archive個別18件とprocess inventory 2件はrootから外し、責務別sub-indexから必要時だけ読む。
- Archive disposition: product requirement 1、damage plan 7、implementation／demo ledger 2、UI decision 6、master／data-flow decision 2の全18件をGit-only化。current treeの`docs/archive/`はindex 1件／77行／10,825 bytes。未移管Task 0、canonical delta 0、移管対象の固有damage／production evidence 0。
- Git-only recovery map: [archive index](../archive/README.md)の18 rowsにcurrent status、canonical successor、source commit、blob、SHA-256を記録。`git show <source-commit>:docs/archive/<path>`と`git cat-file blob <blob>`の双方を全18件で照合した。
- Evidence preservation: damage evidence 31件のblobは`d37f52e`から全件不変。`docs/evidence/`は34件／3,709行／236,284 bytesでTSK-09.1へ引き渡す。
- Commits: `157ad3f` (start)、`2c029e1` (archive index)、`1a50bc5` (entrypoint／authority refs)、`501e0e4`／`5baa08e`／`7ac6683`／`399e271`／`bc8fa06` (family compaction)、本completion commit
- Verification: archive recovery 18/18、tracked Markdown 76件のlocal link broken 0、root 4,318 bytes（8 KiB以下）、root registry 16 rows、archive個別pathへのactive参照0、damage evidence 31/31 blob不変、`git diff --check`成功。
- Next command: `git status --short && git rev-parse HEAD`でTSK-00のbaseline identityを開始する。

### TSK-00: Baseline固定

Depends on: TSK-00.4

- [x] test file、suite、CI step、master load、digest inventoryを記録する。
- [x] 現行`RankingConditions`、AttackProfile、condition／resource familyをproduction全件で監査する。
- [x] calculator/rankingのdamage、entry、policy差分baselineを固定する。
- [x] 成功／失敗ログ量、model call、polling、tool outputの測定方法を固定する。

Done gate:

- product semanticsを変更していない。
- baseline再現command、commit SHA、dirty state、artifact pathが記録されている。
- mainまたは変更前baselineと比較せず、failureを既存問題と断定していない。

Handoff:

- Start baseline: `a49591996cd0951cc82109c252d96e2fd3991fd9`、clean worktree
- Commit: `09486bf` (start)、`aa7529b` (baseline evidence)、`91526ec` (initial completion)、`0c84de2` (first review reopen)、`7e53083` (reproducible／resource audit)、`5c921b5` (reviewed completion)、`3a2936b` (second review reopen)、`dc798b3` (aggregate digest contract)、本completion commit
- Artifacts: `docs/evidence/test-ranking-baseline-tsk-00.md`、`packages/data-pipeline/scripts/audit-tsk00-baseline.mjs`、production audit／parity／ranking canonical tests、execution inventory snapshot、versioned calculator／ranking PNG 11件
- Inventory／digest: Vitest 77 files／397 test identities、Playwright 4 files／96 project cases、published master 33,850,263 bytes、calculator parity 422 records、ranking 433 entries、production condition 10 kinds。resource候補1,507 occurrencesはraw family未分類0、NP gauge 743、enemy NP turn 758、Battle Point 6。canonical未分類はunit 743、consumption mode 79、capacity 422 servants、NP use／OC 727 variants。auditorがpath／sort／LF／JSON規則、8 individual digests、stable artifact digest `a6523fd55828b97a09e86e30e2844040e64e9d9b87c989c01fbced338437ffc2`を固定
- Verification: auditor `--check`、focused contract suite 9 files／26 tests、`pnpm validate:evidence` 10 tests、対象Prettier、tracked Markdown link、`git diff --check`成功。Vitest成功run 3回のwall-clock中央値82.01秒／成功出力10行だが、レビューrunは3 timeout、修正runは2 timeoutで対象も変動し、各timeout対象のfocused runは9／9、6／6 pass。397 passを安定baselineとせず、failureをTSK-00起因または既存flakyとも断定しない。product code／test expectation／snapshot／master差分0
- Next command: test strategy／execution efficiencyのapproval gateを確認後、`git status --short && git rev-parse HEAD`でTSK-01のbaseline identityを開始する

### TSK-01: Compact runnerとagent command契約

Depends on: TSK-00

- [x] process、capture、structured report、summaryを所有するfocused runnerを実装する。
- [x] `test:agent`と`test:diagnostic`を追加する。
- [x] success、assertion failure、timeout、signal、reporter failureをrunner testで固定する。
- [x] full log、manifest、`.test-results/` ignoreを実装する。
- [x] 30秒以上のpoll間隔とbounded command outputを短いrepository guidanceへ追加する。

Done gate:

- 成功時10行以内。
- 失敗時200行か32 KiB以内で、完全artifactへ到達できる。
- exit code、stderr、timeoutを失わない。
- test集合、damage、ranking期待値に差分がない。

Handoff:

- Start baseline: `8943f19f5c3e143780cd9fcd3689124cfedbc29f`、clean worktree。`test-strategy-redesign` v1.1.1と`development-execution-efficiency-requirements` v1.0.1を2026-08-30に承認し、両方を`Active`へ変更してから着手した。
- Review reopen baseline: `fabf7ae8690837b67f559bb9dda396e263582161`、clean worktree。CI artifact未保存、spawn error時のmanifest欠落、stdout warning未集計、summary上限のoff-by-one／oversized lineを未完了として再開した。
- Commit: `fabf7ae` (initial completion)、本review completion commit。
- Implementation: `scripts/test-runner.mjs`とfocused libraryがprocess、10分timeout、SIGINT／SIGTERM伝播、stdout／stderr capture、Vitest JSON、代表5 failure、200行／32 KiB summary、last 100 lines、version／Git identity付きmanifestを所有する。`pnpm test`と`test:agent`はcompact、`test:diagnostic`はverbose＋同一JSON artifact、`test:runner`は基盤契約だけを実行する。
- Review resolution: CIは`pnpm test`直後に`if: !cancelled()`と`include-hidden-files: true`で`.test-results/`を14日間uploadする。spawn errorも`runner_failure`としてstdout／stderr／manifestをfinalizeし、stdoutとstderrのwarningを集計する。summaryは埋込み改行をphysical lineへ正規化し、artifact pathを保持したまま200行／32 KiB以下へUTF-8境界でtruncateする。
- Runner／CI contracts: Node test 8／8でsuccess、assertion failureのexit code 7、timeout、SIGTERM、reporter output欠落、spawn error、巨大summary境界、CI hidden artifact uploadを固定した。失敗状態は非0終了でmanifest上も区別し、stdout-only warningはmanifest／summaryとも1件、巨大fixtureは200行／32 KiB以下になることを確認した。
- Artifacts: `.test-results/2026-08-30T04-50-52-861Z-15-6e4486/manifest.json`。review修正後のfull runは77 files／397 tests、skip／todo／warning 0、82.35秒、compact summary 6行（pnpm script表示を含め7行）。full JSON、stdout、stderrと`runner.error`を含むmanifestを保持した。
- Inventory／damage parity: Vitest 77 files／既存397 identity、test file／name digest `71ffa6f7835799adbcdb306eb3484c2796c61b2e453414840547e59f54453e3b`／`756e5e31d206bc4632df25da0fd2728fbd198a94603dca4bd858f0f633259251`は不変。semantic inventory、resource occurrence／inventory、production test file、PNG baseline digestもTSK-00と一致し、product source、test expectation、snapshot、master差分0。CI／runner contractを含むaggregate digestだけを`c82e0fbc3ecfc7129358fbcf3def4e33528aadb9d9ac30cd4ca47e3e3dfa95ef`へ更新した。
- Performance: 同じJSON reporter／397 test集合を3回ずつ測定し、direct wall-clock 83.76／84.39／85.00秒（中央値84.39秒）、wrapped 83.34／84.06／84.28秒（中央値84.06秒）。差は-0.33秒／-0.39%で、2%または1秒のratchet内。
- Verification: review修正後に`pnpm test:runner` 8／8、`pnpm lint`、`pnpm typecheck`、対象Prettier、baseline auditor `--check`、full `pnpm test` 397／397、`git diff --check`成功。workflowはcontract test、Prettier、staged diffで検証し、外部GitHub Actions runとapplication／Playwright非変更のためE2E本体は未実行。
- Next command: `git status --short && git rev-parse HEAD`でTSK-02のbaseline identityを開始する。

### TSK-02: Suite分類とcanonical quality gate

Depends on: TSK-01

- [x] 重複しない`test:unit`と`test:production`を定義する。
- [x] `quality`をlocal／CI／Pagesのcanonical入口にする。
- [x] `validate:evidence`と`validate:master`の重複実行を整理する。
- [x] focused testからphase gateへ拡大するcommand matrixを実装する。

Done gate:

- 必要な現行test contractが一度ずつ実行される。
- production inventory、calculator/ranking parity、evidenceを省略していない。
- local、CI、Pagesの意味集合が一致する。

Handoff:

- Start baseline: `d817efb944d8a22ca1ab1c96017ad63b7a9b1c4b`、clean worktree。
- Review reopen baseline: `5b38f6bed60bd7a2d407e2969d3ebca2056ea31f`、clean worktree。Task index不整合、`quality`からのrunner contracts省略、単回／runtime未計測を非増加としたperformance evidenceを未完了として再開した。
- Second review baseline: `de03dfa009eeee96e51ce86d910f1058eb1a7093`、clean worktree。compact成功／失敗出力、transform／import／test／environment／file timing、Playwright artifact pathの報告不足を未完了として再開した。
- Implementation: `scripts/test-suites.mjs`を一つの分類正本とし、Vitest projectとbaseline auditorが共有する。unit 54 files／282 tests、production 23 files／115 testsで、全77 files／397 identitiesを重複0／未分類0で分割した。productionはpublished master consumer、inventory／parity、golden／differential、evidenceを所有する。
- Canonical gate: local、CI、Pagesは`pnpm quality`だけを呼び、format、lint、typecheck、runner／Suite／workflow contracts、unit、production、published artifact CLI validation、build、Chromium／mobile Chromium E2Eを同じ意味集合で実行する。`validate:evidence`はfocused診断だけに残し、`validate:master`から重複Vitestを削除した。
- Inventory／damage parity: master `20260829.8`、test file／name、semantic inventory、resource occurrence／inventory、calculator 422 parity、ranking 433 rows、production condition 10 kinds、PNG 11 filesのidentity／digestは不変。Suite／runner／workflow contractを含むaggregate digestだけを`0a326da93671ab724a7b050011a0354522416567c07a3febb1b9ccd09df67c53`へ更新した。
- Performance: 同一Node／pnpm／Vitest／master環境の変更後3 runはunit＋productionが4.591＋79.466＝84.057秒、4.709＋81.755＝86.464秒、4.562＋85.776＝90.338秒（中央値86.464秒）。TSK-01変更前wrapped 83.34／84.06／84.28秒（中央値84.06秒）比+2.404秒／+2.86%で、構造変更の10%または5秒ratchet内。runtime master read／parse counterはまだ存在しないため非増加とは判定せず、静的20 files／42 referencesと既存candidate 6,508 generated／4,009 deduplicated、damage requests 3,744／distinct 1,644のcanonical ratchetをTSK-03へ渡す。
- Output／detailed timing: compact successはunit 6行／185 bytes、production 6行／193 bytes、missing-filter failureは10行／393 bytesで完全artifactへ到達できる。default reporter計測はunit 7.70秒（transform 8.65、import 20.30、tests 2.06、environment 37.90、slowest file 223ms）、production 70.71秒（transform 4.44、import 11.55、tests 238.38、environment 3ms、slowest file 69.528秒）。Playwright HTMLは`playwright-report/index.html`、CI artifactは`playwright-report/`、run stateは`test-results/.last-run.json`。
- E2E: local既定6 workersで4 Chromium casesがsession close／timeoutとなり、同じ4 casesは1 workerで4／4 passした。この比較からcanonical `test:e2e`をCIと同じ1 workerへ固定し、4 files／96 project casesの集合は維持した。
- Evidence／verification: `docs/evidence/test-suite-quality-gate-tsk-02.md`。review修正後の最終`pnpm quality`はrunner 10／10、unit artifact `.test-results/2026-08-30T06-13-14-401Z-197-e4a4dc`（54／282、5.11秒）、production artifact `.test-results/2026-08-30T06-13-20-053Z-665-cf76ab`（23／115、80.64秒）、master valid、build、E2E 64 passed／32 project-specific skipped（10.3分）まで成功した。auditor `--check`、`git diff --check`も成功した。Initial completion: `5b38f6b`、review resolution: 本commit。
- Next command: `git status --short && git rev-parse HEAD`でTSK-02.1のbaseline identityを開始する。

### TSK-02.1: Documentation contract closure gate

Depends on: TSK-02

- [x] source requirementsへstable Contract IDとrevision logを追加する。
- [x] 未完了TaskへContract closure matrixを追加し、phase closureとproject closureを分離する。
- [x] registry version、Task status／依存、Contract ID、closure matrix、evidence登録を検証するdocs lintを追加する。
- [x] docs lintをTSK-09.1から前倒しし、`quality`のblocking stepにする。

Done gate:

- TSK-03以降が会話履歴なしに適用契約、検証command、artifact、延期先を一意に復元できる。
- 要件改訂がversion、理由、承認、影響Task、baseline影響を欠いたまま完了できない。
- registry、Task依存、unknown Contract ID、matrix欠落、未登録evidenceをfixtureでfail-closedに検出する。
- docs lintがcanonical `quality`でproduction suiteより前に実行される。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `DOC-REV-001` | Apply | `pnpm test:docs` | Handoff |
| `DOC-CLOSE-001` | Apply | `pnpm test:docs` | Handoff |
| `DOC-LINT-001` | Apply | `pnpm test:docs` | Handoff |
| `TS-QUAL-001` | Apply | `pnpm test:runner && pnpm test:docs` | Handoff |
| `TS-PERF-002` | Apply | `pnpm test:docs`を同一環境で3回 | Handoff |
| `DX-ART-001` | Apply | `pnpm test:docs` | Handoff |
| `DX-HANDOFF-001` | Apply | `pnpm test:docs` | Handoff |

Handoff:

- Start baseline: `e5d0ead1093afa6f99c7b67a4a4898c6cd6089d7`、`main`、clean worktree。product source、test expectation、snapshot、masterは変更対象外。
- Implementation: `docs/guides/document-governance.md`と3 source requirementsがstable Contract ID、phase／project closure、revision logを所有する。未完了Taskは適用／N/A／延期先、検証command、artifactをmatrixで閉じる。`scripts/docs-integrity*.mjs`はregistry version／status、frontmatter重複、current revision、Task dependency／status、unknown Contract ID、matrix、deferred descendant、evidence count／登録をfail-closedに検証する。
- Canonical gate: `test:docs`をproductionより前の`quality`へ追加し、runner contractのcanonical command expectationも同時更新した。初回`quality`はこのexpectationが旧文字列のままのためrunner 9／10で停止し、変更対象内のfixtureを更新後に再実行した。
- Performance: `pnpm test:docs`の3 runは0.64／0.62／0.61秒（中央値0.62秒）。追加step単体は構造変更閾値の5秒未満で、production master read／parse counterは本Taskの対象外かつTSK-03導入前のため`not measured (counter introduced in TSK-03)`とする。
- Verification: 最終`pnpm quality`はformat、lint、typecheck、runner 10／10、docs 5／5、unit 54 files／282 tests（7.13秒、artifact `.test-results/2026-08-30T09-58-13-940Z-230-d76ef0`）、production 23 files／115 tests（84.41秒、artifact `.test-results/2026-08-30T09-58-21-608Z-698-681d67`）、master validation、build、E2E 64 passed／32 project-specific skipped（10.7分）まで成功した。product source、test expectation、snapshot、master、damage semanticsの変更0。
- Commit: 本completion commit。
- Next command: `git status --short && git rev-parse HEAD`でTSK-03のbaseline identityを開始する。

### TSK-03: 共有production audit foundation

Depends on: TSK-02.1

- [x] package境界ごとにmaster load／compileを一回へ収束させる。
- [x] 複数assertionが共有するread-only typed inventoryを作る。
- [x] 現行digestと最初のcanonical差分を報告するformatterを作る。
- [x] master load、compile、candidate、damage request数を計測する。

Done gate:

- 新ランキング意味論を先取りしたparallel runtime modelを作っていない。
- 現行inventoryとdigestが一致する。
- production全件監査をsample化していない。
- TSK-04のproduction auditを一回の共有compileから開始できる。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `TS-AUDIT-001` | Apply | `pnpm test:diagnostic -- <production-audit-filter>`、`pnpm test:production` | `docs/evidence/shared-production-audit-tsk-03.md` |
| `TS-PERF-002` | Apply | production gateを変更前後各3回 | `docs/evidence/shared-production-audit-tsk-03.md` |
| `TS-REPORT-001` | Apply | runtime counter manifest check | `docs/evidence/shared-production-audit-tsk-03.md` |
| `RK-AUDIT-001` | Deferred: TSK-08 | - | TSK-08 |
| `RK-IR-001` | N/A: Proposed ranking semanticsを実装せず監査基盤だけを作る | `git diff --check` | Handoff |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |
| `TS-FINAL-001` | Deferred: TSK-09 | - | TSK-09 |
| `RK-FINAL-001` | Deferred: TSK-09 | - | TSK-09 |

Handoff:

- Start baseline: `030d6e20a3d26465acc91a794dc7b08847482275`、`main`、clean worktree。利用者成果はproduction全件監査の意味とdamage結果を変えず、TSK-04が共有済みtyped inventoryを一回のcompileから再利用できること。semantic ownerはdata-pipelineのcanonical IR監査とcalculation-applicationのscenario／execution監査。production全件、現行inventory／digest、calculator／ranking経路、fail-closedを不変とし、Proposed ranking semanticsは実装しない。
- Implementation: data-pipelineはraw vocabulary／canonical operation／damage function／normalization exclusion、calculation-applicationはavailable actions／used input／applied effects／issues／trace／exhaustive outcome／現行policyを別のread-only audit modelで所有する。stable canonical recordのdigestとfirst identity／field diffだけをmaster-data subpathで共有する。runnerはdomainを解釈せずartifactのcounter contractだけをmanifestに登録する。
- Inventory／digest: master `20260829.8`、schema 31、engine `27.0.0`。data-pipelineは469 servants／13,875 effects／14,623 operations／630 damage functions／6 typed exclusions、digest `a6766e7ecce70f876515a1fbf01e599b5d3fdff5b0adf4d1d41f7fe77e0f517e`。applicationは422／422 calculated、3,559 plans、433 ranking rows、invalid／unsupported／inputRequired 0、digest `8dcffe8a09c91ce1d9ee3f6cd1626c7d70c7d1f3f56f41f55be064f70dcf82e3`。既存semantic／resource／PNG／damage差分0。
- Counters／performance: 両境界ともread 1／parse 1／compile 1。applicationはcandidate 6,508 generated／4,009 deduplicated、damage request 3,744／distinct 1,644。変更前3 attemptは82.83／84.41秒pass、88.40秒collector failure（中央値84.41秒）、変更後は82.69／84.87／83.72秒全pass（中央値83.72秒、-0.82%）。完全artifactとfailureの詳細は`docs/evidence/shared-production-audit-tsk-03.md`。
- Verification: focused 2／2、runner 11／11、unit 55 files／284 tests、production 25 files／117 tests、TSK-00 auditor、master validationが成功。`pnpm quality`はproduction artifact `.test-results/2026-08-30T10-44-02-256Z-714-f6632a`、build、E2E 64 passed／32 skipped（10.4分）まで成功した。
- Commits: `840cf08` (start)、`07b63c0` (implementation)、本completion commit。
- Next command: `git status --short && git rev-parse HEAD`でTSK-04のbaseline identityを固定し、`compileCalculationApplicationProductionAudit`のAttackProfile／preparation／scenario recordsからcanonical IR cutoverを開始する。旧loader／scanの最終削除はTSK-08のままとし、parallel runtime modelを作らない。
- Review correction baseline: `c77e707`、clean worktree。TSK-03の`RK-AUDIT-001` disposition、runtime counter blocking gate、duplicate canonical identity fail-closedの3件を再オープンする。damage／ranking semantics、新policy、IR、UIは変更対象外。
- Review next command: `pnpm test:runner`のfixtureへmissing／empty／invalid counter artifactを追加し、production suiteの必須boundary／counter contractをfail-closedにする。
- Review resolution: `RK-AUDIT-001`は全AttackProfile、4 policy、NP1〜5、calculator／ranking parity、invalid／unsupportedを不可分に閉じる契約のため、現行`current-default`だけを保持するTSK-03では適用せずTSK-08へ延期した。TSK-03が所有するのは一回のshared compile、canonical inventory／digest、runtime counter foundationまでで、新ranking意味論は追加していない。
- Blocking counters: `10c5af3`でproduction gateにcalculation-application／data-pipeline各1 artifactと必須counter名を要求した。missing artifact、空counter、必須counter欠落、負数をrunner fixtureで`contract_failure`へ収束させ、最終production manifest `.test-results/2026-08-30T11-17-22-488Z-750-adb768`はrequired contract errors 0、read／parse／compile各1、candidate 6,508／4,009、damage request 3,744／1,644を記録した。
- Canonical formatter: digest／difference／formatterの入口で空または重複identityを例外終了させ、`[{x:1},{x:2}]`と`[{x:2}]`を`audit_match`と誤報しない。unit fixtureで3経路を固定した。
- Review verification: focused formatter 3／3、runner 15／15、unit 55 files／285 tests、production 25 files／117 tests、TSK-00 auditor、master validationが成功。最終`pnpm quality`はunit artifact `.test-results/2026-08-30T11-17-17-318Z-275-31a8c1`、上記production artifact、build、E2E 64 passed／32 skipped（9.9分）まで成功し、damage／inventory digest差分0。
- Review commits: `273b1a3` (reopen)、`10c5af3` (contract enforcement)、本review completion commit。
- Next command: `git status --short && git rev-parse HEAD`でTSK-04のbaseline identityを固定し、`RK-AUDIT-001`のfull matrixはTSK-08まで未充足として維持したままcanonical IR cutoverを開始する。
- Second review baseline: `b5ec5de`、clean worktree。必須counter名の存在確認だけでは値のratchetにならず、producerのread／parse／compile固定値も実測ではないためTSK-03を再オープンする。canonical lifecycle実測とcandidate／damage request baselineのblocking比較以外は変更対象外。
- Second review next command: production audit testのread／parse／compile呼び出しを計測wrapperへ収束し、runner contractを境界ごとのexact baselineへ変更する。
- Second review resolution: `a06532a`でproducerからread／parse／compileの固定値を削除し、各production audit testが共有measurement wrapper経由で実際のread、parse、compile callbackを順序付きで一度ずつ実行・計数するようにした。runner contractは必須名の配列からcanonical値のobjectへ変更し、両boundaryの全counterをsafe integerかつ完全一致で比較する。
- Planning note: 後続Taskでblocking metricを導入する場合、受入条件を(1) artifact／必須fieldの存在、(2) producer固定値ではない実測ownership、(3) canonical baseline比較と不一致fixture、の3責務に分け、すべてを独立に検証してからgreenとする。
- Counter ratchet: calculation-applicationはread／parse／compile 1／1／1、candidate 6,508／4,009、damage request 3,744／1,644、data-pipelineは1／1／1、0、0をblocking baselineとする。read 2、parse 2、compile 3、candidate 6,509、damage request 3,745の各fixtureは`counter_mismatch`の`contract_failure`となる。最終production artifact `.test-results/2026-08-30T11-42-58-084Z-795-473969`はexpected／actual全項目一致、contract errors 0。
- Second review verification: measurement diagnostic 4／4、runner 16／16、unit 55 files／286 tests、production 25 files／117 tests、TSK-00 auditor、master validationが成功。最終`pnpm quality`はunit artifact `.test-results/2026-08-30T11-42-53-005Z-320-aa9497`、上記production artifact、build、E2E 64 passed／32 skipped（10.1分）まで成功した。production audit digest、semantic／resource／PNG／damage差分0。
- Second review commits: `5a32bbb` (reopen)、`a06532a` (measured exact ratchet)、本completion commit。
- Next command: `git status --short && git rev-parse HEAD`でTSK-04 baselineを固定する。counter baselineを変更する場合は値の差分理由と新canonical inventoryを同一Handoffで承認する。

### TSK-04: Ranking canonical IR cutover

Depends on: TSK-03

- [x] AttackProfile identityをcanonical化する。
- [x] player choiceとstochastic outcomeをtyped semanticsへ分離する。
- [x] 残る各stateful semantic familyについて一意なflow closure noteを作り、全scoped pathをVerified／N/A／Deferredへ収束させる。
- [x] condition requirement、provenance、target、recipient、contribution scopeをcanonical化する。
- [x] NP capacity、resource requirement、gain／loss／all-consume、base OCをcanonical化する。
- [x] 旧schema reader、raw fallback、compatibility flagを削除する。

Done gate:

- data pipelineだけがAtlas/raw vocabularyを解釈する。
- executionへraw key、raw target、raw buff typeを渡していない。
- 新旧IRをruntimeで併存させていない。
- 全production occurrenceがtyped inventoryへ分類されるか、型付きでfail-closedになる。
- flow closure noteの正本pathが記録され、scoped consumer／state mutation／recovery pathの`Blocking`が0件になる。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-IR-001` | Apply | `pnpm test:diagnostic -- <pipeline-and-schema-filter>`、`pnpm test:production` | `docs/evidence/canonical-selection-semantics-tsk-04.md` |
| `RK-AUDIT-001` | Deferred: TSK-08 | - | TSK-08 |
| `TS-PERF-002` | Apply | affected production gateを変更前後各3回 | `docs/evidence/canonical-selection-semantics-tsk-04.md` |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |
| `RK-EXEC-001` | Deferred: TSK-05 | - | TSK-05 |
| `RK-POLICY-001` | Deferred: TSK-06 | - | TSK-06 |
| `RK-UI-001` | Deferred: TSK-07 | - | TSK-07 |

`RK-AUDIT-001`は四policy、NP1〜5、calculator／ranking parity、invalid／unsupportedを不可分に閉じるため、policy実装前のTSK-04では適用せずTSK-08へ延期する。TSK-04のcanonical IR inventory／digestは`RK-IR-001`で検証する。

Handoff:

- Start baseline: `907a2299900c40d9dce7d1e6f53cbb5f644ce9dc`、`main`、clean worktree。利用者成果はAttackProfileが到達planやrepresentative formの選択に依存せず、servant lineage、canonical ActorFormProfile、attack Noble Phantasm variantの同一identityへ収束すること。semantic ownerはdata-pipelineのraw vocabulary解釈とcanonical IR、calculation-applicationのscenario command／execution。target scope／cardはcanonical属性だが単独identityにせず、曖昧・矛盾・部分適用は数値へfallbackしない。production inventory／digest、calculator／ranking parity、damage結果、TSK-03 counter ratchetを不変baselineとし、`RK-AUDIT-001`のfull matrixはTSK-08まで未充足として維持する。
- Identity cutover: ActorFormProfile identityはrepresentative formを廃止し、lineage、form-qualified skill slot／variant、passive variant、intrinsic trait、base NP variant、reachable attack NP variantの構造化semanticsへ置換した。AttackProfile identityはlineage、canonical ActorFormProfile、attack NP variant IDだけを所有し、form-qualified execution ref、card、scope、labelは属性へ分離した。profile対応0件／複数件、lineage矛盾、variant矛盾、到達不能variantは例外終了する。
- Inventory／digest: AttackProfile 433件をshared production auditの独立canonical recordへ追加し、ranking entryとのidentity不一致と重複をblocking errorにした。application digestは`ae10885eca8be39e17419770e7b76b082e7577085b783f108ea1476489034456`。servants 422、plans 3,559、ranking rows 433、calculated 422、invalid／unsupported／inputRequired 0、runtime counter 1／1／1、6,508／4,009、3,744／1,644はbaseline一致。20 policy digestとstate-trait digestはentry identity変更分だけを更新し、代表damage assertionは不変。
- Identity verification: focused 3 files／15 tests、unit 55 files／289 tests、production 25 files／117 tests、typecheckが成功。production artifact `.test-results/2026-08-30T12-42-52-966Z-15-3675b6`。TSK-00 stable artifactはtest 406件、test-name digest `4300f95dd41efe236abcb3d4ee64039222eaf7cb2989da51dce149f9984e9ddd`、artifact digest `16fdc5a4183c84c12208cad320e9121e38aa753299b754ab3914c7a96497ea3f`へ更新した。
- Commits: `4609add` (start)、本identity cutover commit。
- Identity review baseline: `434004441f40846f3406ecbdcb3b20faa1f0c4e5`、clean worktree。同一raw NP ID、同値なform fields、異なるform-qualified ref／cardを持つ合法schema fixtureで`attackProfileKey`衝突を再現した。ranking集約後のrows／details重複検査では検出不能であり、identity矛盾のfail-closed条件を再オープンした。
- Identity review resolution: data-pipelineがactor form／nameを除くNP ID、priority、card、scope、damage、effect semanticsのSHA-256を`canonicalId`として全attack variantへ発行する。master schema 38は同一canonical IDのsemantic一致と同一semanticsのcanonical ID一致を双方向に要求する。ActorFormProfile reachable identityとAttackProfile identityはこのcanonical IDだけを消費し、form-qualified refはexecution属性に限定した。review fixtureは同semantic／別refを同一identityとして許可し、card差分へ別IDを与えれば別profile、同じIDを再利用すればschema errorになる。
- Review inventory／digest: published master `20260830.3`、33,900,969 bytes、SHA-256 `dd22fba1aafdd38df98278438f2b6c9f403afed9780155fb2d616c5dc493fc15`。data-pipelineは626 canonical attack-NP variant identitiesをranking前に監査し、digestは`83e010c27894945a21d0413d2376d5964c634dc1f1aeb3d4ad58efc5475fcb1b`。application digestは`5c54c334d01059fc233428eab5d2e59d19c1ddc6b01045a5715a4ec096004bd0`。AttackProfile／ranking rows 433、damage function 630、servants／plans／outcome、runtime counter 1／1／1、6,508／4,009、3,744／1,644はbaseline一致。canonical serializationはobject keyをUTF-16 code-unit順で再帰sortし、schema parse後の全626 ID再計算差分0。canonical IDとversionを除くmasterはreview baselineとbyte-equivalentなJSONである。
- Review verification: focused schema／identity 2 files／19 tests、unit 55 files／291 tests、production 25 files／117 tests、typecheck、master validation、TSK-00 auditorが成功。最終production artifact `.test-results/2026-08-30T13-23-57-632Z-15-78afa1`。stable artifactはtest 408件、semantic digest `b1e41a5c8251cdb04041a33ac7ee96f6d24166aef568b7796b368426115b6b9c`、test-name digest `3945581ad402e76048e84082163f06925be5cf2770a9d79aeae204cb7daf614c`、artifact digest `d6b4e8821902b9522f8b026679f3f5f9d49b08918bf88b84d88622ec03336e48`へ更新した。
- Review commit: `c6f86c3`。
- Base-variant review baseline: `c6f86c391934715ce7892032c98422468b6d0cb4`、clean worktree。ActorFormProfileのbase NP identityだけがraw NP IDを保持し、同一raw ID／異なるpriorityを持つform-qualified nonAttack variantsを統合することを合法schema fixtureで再現した。
- Base-variant resolution: `canonicalId`をattack専用fieldからattack／nonAttack共通variant fieldへ引き上げ、kind、raw NP ID、priority、effectsとattack固有card／scope／damageからdata-pipelineが発行する。ActorFormProfileのbase／reachable、AttackProfileのselected identityをcanonical IDへ統一し、form-qualified refはexecution属性だけに残した。schemaは全variantでID／semanticsの双方向一意性を要求し、applicationはbase ref欠落／重複を例外終了する。
- Base-variant inventory／digest: published master `20260830.4`、33,909,150 bytes、SHA-256 `803e61e73a9ce278b803d50bd4de037ee8565291ee4e361d9933f5aade9594e6`、schema 39。raw 727 NP variantsは706 canonical identitiesへ収束し、data-pipeline digestは`96c0795337dbf34308c67a6c9ae1f938d6503fe424cead81116a99d596f15323`、application digestは`bcedb95a4aac751f1925c1186db4435a39591f3ad6d29aad6bd5edc4c3f1836d`。AttackProfile／ranking rows 433、damage function 630、servants／plans／outcome、runtime counter 1／1／1、6,508／4,009、3,744／1,644はbaseline一致。
- Base-variant verification: focused schema／ActorFormProfile 2 files／21 tests、unit 55 files／293 tests、production 25 files／117 testsが成功。最終production artifact `.test-results/2026-08-30T13-44-19-739Z-15-01a7c4`。stable artifactはtest 410件、semantic digest `d8edd868f34275a079879d9ec8468b31562ef45edc921e675c0ff8840227bfa4`、test-name digest `a463f44c72fa2d809ef35866c183ed29fd22484594f00124509d4131c2b881a5`、artifact digest `bd37d3d416b13eec725e6e274ef3403ce0d794d3c2cc885b4a6c3ec59bbfbd50`へ更新した。
- Base-variant review commit: 本review correction commit。
- Selection baseline: `d280bb3a5cfb409347e0f74df8e4dd1a16e1fba9`、clean worktree。利用者成果は利用者が選ぶ入力と確率的に決まる結果を別union memberとして表し、曖昧・矛盾・部分適用を数値へfallbackしないこと。semantic ownerはraw vocabularyを解釈するdata-pipelineと、canonical selectionだけを消費するapplication／execution。damage correctness、calculator／ranking parity、production counterを不変とする。
- Selection cutover: master effectの`choice`／`procSelection`を単一のexhaustive `SelectionSemantics`へ置換し、`playerChoice`はcanonical choice group、`stochasticOutcome`はbinary／success-count outcome groupとして分離した。scenario commandはraw familyを廃止してcanonical group／candidate keyを受け取り、executionはmissing、guaranteedとの矛盾、proc kindとの不一致、部分適用を`invalidStochasticOutcome`としてoperation単位で無効化する。
- Selection inventory／digest: published master `20260830.5`、schema 40、33,362,482 bytes、SHA-256 `5ca2a62e10c59af87cc143164e3375b8e204f94ecb1126c659601c5fd3796c0c`。13,875 effect中raw player choice 88／canonical 88、probabilistic 49／canonical 49（binary 44、success-count 5）、unclassified／overlap 0。data-pipeline digestは`ead6e8483212bbb3daa24d742e40f5077b352b8a051ffa35eb3f9a7c4befd60b`、application digestは`047d988cb6deb721b08494b04bf1614084aa544a22dc3955c8f131ce83b67231`。422／422 calculator、433 ranking rows、runtime counter 1／1／1、6,508／4,009、3,744／1,644を維持し、representative damage assertionとexecution parityの数値差分0。
- Selection performance: production 3 runはbaseline 79.44／79.35／79.90秒（中央値79.44秒）、変更後79.34／79.39／77.62秒（中央値79.34秒）。差分-0.10秒／-0.13%でratchet内。詳細は`docs/evidence/canonical-selection-semantics-tsk-04.md`。
- Selection verification: focused 4 files／40 tests、unit 55 files／295 tests、production 25 files／117 tests、typecheck、published master validation、TSK-00 auditorが成功。最終`pnpm quality`はproduction artifact `.test-results/2026-08-30T14-51-08-537Z-795-647647`、build、E2E 64 passed／32 skipped（10.3分）まで成功した。master schema 40、scenario schema 32、engine 28.0.0へbreaking cutoverし、旧selection reader／runtime fallbackは残していない。
- Selection commit: 本selection semantics cutover commit。
- Selection execution review baseline: `c70835b3dd31adc40acc20f2c598287d3f090cd3`、clean worktree。binary failureがactivationを通過し、invalid stochastic semanticsを`EffectDecision`へ変換していたため`decisionKey: null`のoperationを停止できないことを再現し、第2項を再オープンした。
- Selection execution review resolution: operation単位の`ResolvedStochasticOutcome`を`success`／`failure`／`invalid`で保持し、effect inclusion decisionとは別にactivationへ渡す。binary default failure、success-count member index、invalidをdecision identityに依存せず解決し、contribution projectionもfailure／invalidを上書きしない。旧`resolveDecisionsWithStochasticOutcomes`と`duplicateEffectDecision`契約は削除した。
- Selection execution review verification: matrix／integration 5 files／26 tests、unit 55 files／298 tests、production 25 files／117 testsが成功。production artifact `.test-results/2026-08-30T15-36-45-202Z-15-95cb5b`でdamage／calculator-ranking parity／runtime counter差分0。成功production 3 run中央値82.96秒はbaseline比+3.52秒／+4.43%でratchet内。最終`pnpm quality`はunit artifact `.test-results/2026-08-30T15-42-29-371Z-320-6c836c`、production artifact `.test-results/2026-08-30T15-42-33-894Z-795-ea6f54`（72.60秒）、master validation、build、E2E 64 passed／32 project-specific skipped（9.3分）まで成功した。
- Selection execution review commit: 本review correction commit。
- Selection execution family review baseline: `d3e12fef188eba730732975a70cdf945692395bd`、clean worktree。NP variant transactionのpreapplyがtrait mutationのstochastic failure／invalidを迂回し、Caesar success-count範囲外がcanonical `inputRequired`ではなく`unsupported`へ分類される反証を再現して、第2項を再オープンした。
- Selection execution family resolution: preapply対象全体を`OperationActivation.enabled`で絞り、通常operation loopと同じ適用判定へ統一した。resolved stochastic stateへ修正可能な`inputRequired`を追加し、semantic `invalid`から分離した。activationはstochastic判定前のsource／effect inclusionを保持し、candidate resultはvisibleかつstochastic以外が有効なoperationからmissing definitionを回収する。
- Selection execution family verification: preapply failure／invalidのadd／remove／suppress trait非適用とCaesar最大値+1の`inputRequired` recoveryをfixture化した。focused 9 files／55 tests、unit 55 files／299 tests、production 25 files／118 testsが成功。production artifact `.test-results/2026-08-30T16-29-24-499Z-15-06322a`は71.18秒で直前quality 72.60秒から増加せず、damage／calculator-ranking parity／runtime counter差分0。test-name digestは`6abb0076f48d0db8f88d953bd6b97a241752a2e17cef14fd4732433aea732dde`、stable artifact digestは`fa8a2fe3c4c3e8b0144a1024d26b4a0d92f5efce1153bb0bd462309e4edc4c51`。
- Selection execution family quality: 最終`pnpm quality`はunit artifact `.test-results/2026-08-30T16-33-49-913Z-320-822115`、production artifact `.test-results/2026-08-30T16-33-54-342Z-795-195ec2`（72.00秒）、master validation、build、E2E 64 passed／32 project-specific skipped（9.4分）まで成功した。
- Selection execution family review commit: 本review correction commit。
- Planning correction baseline: `6c36607ac552792b9b6680bb4e49d936fbd2d66f`、clean worktree。selection reviewで見つかったpreapply迂回とcanonical input recovery消失を、個別findingではなくforward／recovery／alternate mutation pathの計画漏れとして一般化した。今後は各未完了familyの実装前にflow closure noteとstate × path反証matrixを作り、未確認経路とproduction occurrence 0を明示してから実装へ進む。
- Planning scope correction baseline: `3300791c368fc8ff11ecfc8d0a68ab9cfaff46a5`、clean worktree。flow closureをstateful semantic changeへ限定し、familyごとの正本一意性、初回後のdelta監査、Verified／N/A／Deferred／BlockingとBlocking 0件の停止条件を追加した。通常はself-check後に実装へ進み、ownership分岐、requirement拡張、Blocking writer、期待outcome未確定の場合だけ計画レビューへ止める。
- Next command: condition requirement、provenance、target、recipient、contribution scopeについて一つのcanonical flow closure noteを作り、observable outcome、forward／recovery flow、alternate write path、state × path反証matrixをscoped inventory化する。Blocking 0件をself-checkできれば同じsessionでdata-pipeline発行のcanonical semanticsへcutoverし、停止条件に該当する場合だけ計画レビューを要求する。NP resource semanticsと旧reader／fallback削除までTSK-04を継続し、すべてを閉じるまでTSK-05へ進まない。
- Final family closure: condition／target／provenanceは`docs/evidence/condition-target-provenance-flow-tsk-04.md`、NP resourceは`docs/evidence/np-resource-semantics-flow-tsk-04.md`、旧経路削除は`docs/evidence/legacy-runtime-removal-tsk-04.md`を正本とし、全pathを`Verified`／`N/A`／`Deferred: TSK-05〜07`へ分類した。各noteは`Blocking: 0`であり、schema-legal production-negative fixture、restore/reapply、ranking alternate path、transaction rollbackを含む。
- Final cutover: master schema 42／`20260831.10`はcondition requirement tree、trait provenance、canonical route、NP capacity／requirement／fixed-or-unsupported transitionだけを発行する。旧condition/route schema、execution-side raw normalizer、compatibility fixture adapterを削除し、strict schemaとarchitecture ratchetで旧単独／新旧混在artifactを拒否する。
- Final inventory／digest: master 29,902,484 bytes、SHA-256 `76848894dc47f5c3783463d821d7f6dd0b016406e8fe20aafd381848dd4308d8`。NP gauge 743件はfixed 729／dependent typed unsupported 14／unclassified 0、`NP_HIGHER`は7 occurrences／6 skill identities。data-pipeline digest `e116e91fad16fb6348826f26b5e29fc4db5239e26b49c1c8cad50eb0dd5c2fc2`、application digest `2980e6abfbf8685f64dee737a3390defdd077642df55d0690609c0675c2727d8`。
- Final parity／counter: HEADと変更後をstable servant／NP identityで比較したfield 2 × class 2 × special 2 × NP1〜5の40 matrixはdamage、applied effect count、special outcomeが全件一致。422／422 calculator、433 ranking rows、runtime counter 1／1／1、6,508／4,009、3,744／1,644を維持した。canonical quantity bindingで攻撃者自身のsubject IDをexecution stateへ正しく束縛する反証を追加した。
- Final performance／verification: production 25 files／119 testsの3 runは68.92／69.17／68.23秒、中央値68.92秒で直前72.00秒比-4.28%。unit 56 files／310 tests、typecheck、lint、docs gate、production、published master validation、build、E2Eを最終`pnpm quality`で検証する。
- Completion commit: 本TSK-04 completion commit。TSK-05は本完了まで`blocked`を維持し、完了後に`ready`へ遷移した。resource-aware preparation plan integrationは`RK-EXEC-001`としてTSK-05が所有し、TSK-04へ先取りしていない。
- Next command: TSK-05開始baselineをclean HEADで固定し、condition／choice／resource／state mutationを一つのordered transactional preparation planへ統合するflow deltaを作る。
- Legacy nested-schema review baseline: `e176360c7550d3c8f09b4d3ac99a8854198cc84d`、clean worktree。完全なcanonical `damageModifier` operationへ矛盾する旧route fieldを加えても、非strictなnested operation schemaが未知keyを除去してparse成功するため、`docs/evidence/legacy-runtime-removal-tsk-04.md`を`Blocking: 1`へ再オープンした。TSK-05は修正完了まで`blocked`へ戻す。
- Legacy nested-schema review resolution: `effectExecutionOperationSchema`の全9 union memberをstrict化し、old-only reject／canonical-only accept／mixed contradictory rejectの交差fixtureを追加した。focused 2 files／24 tests、最終`pnpm quality`（unit 56 files／311 tests、production 25 files／119 tests、master validation、build、E2E 64 passed／32 skipped）が成功し、production inventory、damage、calculator／ranking parity、runtime counterのratchetを維持した。legacy noteは`Blocking: 0`、TSK-04は`done`、TSK-05は`ready`へ復帰した。

### TSK-05: Transactional preparation execution

Depends on: TSK-04

- [x] condition、choice、resource、state mutationをordered operationとして実行する。
- [x] form transition、NP variant、non-attack NP、attack NPを一つのplanで扱う。
- [x] executable stateとrejected stateを型で分ける。
- [x] action全体をatomic commitし、partial commitを拒否する。

Done gate:

- execution preconditionをranking policyが上書きしない。
- partial commit 0件。
- focused semantic fixturesとproduction family inventoryが通る。
- calculator経路に意図しないdamage差分がない。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-EXEC-001` | Apply | `pnpm test:diagnostic -- <execution-filter>`、`pnpm test:production` | `docs/evidence/<tsk-05-report>.md` |
| `RK-AUDIT-001` | Apply | partial commit／invalid inventory check | `docs/evidence/<tsk-05-report>.md` |
| `TS-PERF-002` | Apply | affected production gateを変更前後各3回 | `docs/evidence/<tsk-05-report>.md` |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |
| `RK-POLICY-001` | Deferred: TSK-06 | - | TSK-06 |
| `RK-UI-001` | Deferred: TSK-07 | - | TSK-07 |

Handoff:

- Baseline: clean `69f8207e6252f8991b42ee7c55b578dba3c5f359`。flow closure正本は
  `docs/evidence/transactional-preparation-flow-tsk-05.md`、全pathをVerified／N/A／Deferredへ
  分類しBlocking 0で実装開始・完了した。
- Implementation: condition／choiceでpreparation mutation対象を確定し、NP requirement、ordered
  resource mutation、trait／form／variantをimmutable action-start stateから検証して一括commitする。
  attack NPも同じtransactionでbase OC導出後に全消費する。曖昧条件、修正可能入力、矛盾、unsupported、
  insufficient gaugeはtyped rejectionとして分離し、ranking policyはpreconditionを上書きしない。
- Inventory: preparationは`6,376 / 3,957 / 3,446`、rejectはunsupported resource 64／insufficient
  gauge 6。calculator 422/422、ranking 433、failure 0、runtime `1 / 1 / 1`、damage cache
  `3,629 / 1,623`。意図的damage差分はunsupported resourceと固定loss順序のcanonical ruleへ限定した。
- Structural review resolution: preparationの`inputRequired`をrequired-input付きapplication outcomeまで
  保持し、preparation input変更時はpersisted commandとcurrent masterからsource collection／plan／executionを
  全再生成する。確率activationはpreparationと通常executorへ同じresolved outcomeを渡し、plannerのresource
  semantics／NP levelを全direct readerの必須identityとcache keyにした。damage-only inputの既存rematerializeは
  preparation stateを変え得ないため`N/A`とし、resource-only repairの実application fixtureで逆経路を反証した。
- Review verification: focused transaction 12/12、scenario facade 20/20、planner identity 2/2、activation
  handoff 11/11、unit 58 files／327 tests、production 25 files／119 tests。calculator/ranking 855 recordsの
  outcome／used input／applied effects／issuesは不変、runtime counterとdamage cacheも不変。production digest
  `beb6f9f13b74acd52d0c384095a1fe82b8194a8d2cb500781e55b959d98cfe4b`はstochastic identityとinput traceを
  記録する。85% workerでの3 runは81.81／82.42／82.11秒（median 82.11秒、baseline比+2.98%）、既存5秒
  timeoutは緩和していない。
- Completion gate: 最終`pnpm quality`はformat／lint／typecheck、runner 16/16、docs 5/5、unit 327、
  production 119、master validation、build、E2E 64 passed／32 skippedまで成功した。calculator snapshot 3件の
  差分はengine `28.0.0`から`29.0.0`へのfooter更新だけで、targeted／full E2Eとも成功した。Blocking 0、
  TSK-05は`done`、TSK-06は`ready`へ遷移した。
- Second review reopen: 上記完了遷移を撤回する。non-attack formのstructural input待ちが
  `DamageResolutionInput`生成前に公開outcomeへ到達しない、preparation対象外の確率effectをsuccessとして
  pre-resolveする、範囲／step違反inputがmutation後に拒否される、非repairable rejectionがgeneric issueと
  throwへ崩れる4 pathを正本で`Blocking`へ戻した。resource-only recoveryとcache／NP level移行はVerifiedの
  まま維持するが、指定4交差fixtureとapplication unionが閉じるまでTSK-05は`ready`、TSK-06は`blocked`。
- Second review resolution: executable／rejectedを`ScenarioPreparationOutcome`で`DamageResolutionInput`
  生成前に分離し、non-attack formからinput-dependent transitionを修復後にcalculator／ranking双方で全再適用
  した。preparationで評価しないordinary stochastic effectは`null`を保持し、minimum／maximum／step違反は
  mutation前にrequired inputへ戻す。insufficient／unsupported／ambiguous／invalidは公開resultの
  `preparation:<code>`へ区別して伝搬する。focused 54/54、proc production 8/8、unit 338、production 119。
  4,735 production recordsのうちcalculator/ranking core 855件はoutcome／input／effects／issues差分0、digest
  `80a63a7be083c68dc80c844aa99a891d5fa4cfe2491e0c69cb0358d71d990f25`はordinary stochastic ownershipの
  `null`化を記録する。92% workerの3 runは81.95／75.04／75.34秒（median 75.34秒、baseline 79.73秒以下）、
  timeout／suite／runtime counterは不変。最終`pnpm quality`成功後、Blocking 0、TSK-05を`done`、TSK-06を
  `ready`へ遷移した。
- Third review resolution: rejected branchからpresentation attack NP fallbackを削除し、
  `ResolvedCalculationInput`／`PreparedCalculationScenario`／`CalculationExecution`をdamage inputなしの
  discriminated unionまで貫通した。calculator UIはrejected状態からmanual damage commandを生成せず、
  repairable canonical inputだけを更新する。preparation activationは`procOutcome`と`conditionOutcome`を
  分離し、resource／form mutation可否だけを合成する。guaranteed success／stochastic success × condition
  falseとattack NP variantなしのschema-legal fixtureを追加した。focused 55/55、unit 339、production 119、
  final quality（runner 16、docs 5、master validation、build、E2E 64 passed／32 skipped）が成功した。
  4,735 production records中の差分はcondition-false traceを訂正したpreparation 32件だけで、calculator／
  ranking records差分は0。digestは`e9441e4f35eb74af80a79967ee20ea735687a899cc2b6f606ea3db5ae0297e7f`。
  production worker capはquality内で再現した5秒timeoutを解消するため75%へ下げ、timeout／suiteは不変。
  Blocking 0、TSK-05は`done`、TSK-06は`ready`。
- Fourth review reopen: productionだけに75% worker capを設定した一方、unit／productionを同じ既定
  `sequence.groupOrder`へ残したため、複数projectを選ぶ標準runnerがVitest設定検証で0 testsのまま失敗した。
  suite別の`quality`経路だけを最終確認し、cap導入後の`test:agent`／複数project focused diagnosticを
  再実行しなかったことがmissed detectionである。unitとproductionを別groupへ分離し、最終設定で両経路が
  実testを実行するまでBlocking 1、TSK-05は`ready`、TSK-06は`blocked`へ戻す。
- Fourth review resolution: unitを`sequence.groupOrder: 0`、productionを`groupOrder: 1`へ分離し、
  productionの75% capと既存5秒timeoutを維持した。設定契約testを追加し、最終設定の複数project focused
  diagnosticは3 files／55 tests、`test:agent`は83 files／458 testsを実行して成功した。`pnpm test`は
  `test:agent`と同じcompact runner commandである。最終`pnpm quality`成功後、Blocking 0、TSK-05を
  `done`、TSK-06を`ready`へ復帰した。
- Deferred: satisfied-policy start-gauge／scenario-fact candidate generationは`RK-POLICY-001`として
  TSK-06が所有する。

### TSK-06: Ranking policyとcandidate planner

Depends on: TSK-05

- [x] 自己バフと条件効果の四policy組合せをcompileする。
- [x] finite preparation plan、TargetContext、condition candidateを生成する。
- [x] baseline包含とstable tie-breakを実装する。
- [x] `calculated | unavailableUnderPolicy | invalid`を型で分離する。
- [x] calculatorと同じcanonical executorからdamageを生成する。

Done gate:

- effect subsetの`2^N`探索がない。
- 一つの数値が一つのAttackProfile、scenario、ordered plan、TargetContextを持つ。
- calculator/ranking canonical parityが成立する。
- candidate数とdamage request数の上限をsemantic inputから説明できる。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-POLICY-001` | Apply | `pnpm test:diagnostic -- <ranking-policy-filter>`、`pnpm test:production` | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-AUDIT-001` | Apply | candidate／damage request／parity inventory check | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-PERF-001` | Apply | ranking hot pathを変更前後各3回 | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `TS-PERF-002` | Apply | production gateを変更前後各3回 | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |
| `RK-UI-001` | Deferred: TSK-07 | - | TSK-07 |

Handoff:

- Canonical flow note: `docs/evidence/ranking-policy-candidate-flow-tsk-06.md`。structural reviewで
  flow closureを再オープンし、leaf polarity／`traitCount`／combined target read scope／negative
  target predicate／exclusive trait／self-generated state transitionを反例行列へ追加した。第三
  reviewではprovenanceのvariant適用範囲がconsumerごとに分裂した機構を記録し、leaf-level
  source matrixで閉じた。第四reviewではmixed ownershipのnested compositionをfocused fixture
  とproduction 0件ratchetで閉じた。
- Ownership: battle-executionの`traitConditionEvaluationSource`が`trait | traitCount` leaf全体を
  受けて`worldFacts | effectLocalDecision`を返し、canonical evaluator、
  `targetConditionWitnessSpace`、production監査が同じvariant適用範囲を共有する。現要件で生成
  されない`traitCount.provenance`は型から削除した。application planner／監査は条件真偽や
  damage semanticsをranking側で再実装しない。
- Correctness: 1102300 included:satisfied NP1は`target`／`targetState`の
  `superGiant=false` witnessを選び、`powerMod 0.3 -> 0.5`、平均damage
  `80,857.34 -> 88,558.08`。同4状態のcalculator総当たり最大値とplanner選択値が一致する。
- Completeness/soundness: focused 6 files／55 tests、production world-fact-only target condition
  13,026件
  （205騎・program展開単位）すべてにcanonical true witnessあり。canonical default provenance
  1,743件（負trait 49件）を正式母集団へ含め、exclusive正負混在に矛盾0、
  mixed ownershipは0件／0騎。`any`のworld-true witness、`all`／`not(effectLocal)`の非捏造、
  `present:true/false`、targetPredicate、traitCount三比較、nested boolean、field不存在、405900
  self-generated target stateを固定した。
- Inventory/performance: 三騎satisfied-policyは404から1,056 candidates、最大production profileは
  2,880／4,096。ranking hot path中央値64.70秒（修正前60.91秒比+3.79秒／+6.22%）、最終production
  gate中央値80.77秒（75.50秒比+5.27秒／+6.98%、21 production tests追加込み）で10% ratchet内。
- Verification: `pnpm test:unit` 60 files／352 tests、`pnpm test:production` 27 files／150 tests。
  final `pnpm quality`成功（E2E 64 passed／32 skipped）。
- Closure: Blocking 0、TSK-06 `done`、TSK-07 `ready`。UI／worker／URL cutoverはTSK-07へ
  Deferred、cross-level cache最適化はTSK-08へDeferred。

### TSK-06.1: Portable calculation request and identity

Depends on: TSK-06

- [x] `CALC-PORTABLE-001`、`RK-HANDOFF-001`、`RK-CACHE-001`、`UI-CALC-001`のownershipとcanonical型をproposalとして固定する。
- [x] calculator編集時のintent遷移、manual mode、invalid／unsupported分類を一意に決める。
- [x] schema 32のprofile／backup migration、旧schema share／任意の旧版／future版の拒否方針を一意に決める。
- [x] UI design spec v1.4.1とportable calculation identity familyのcanonical flow noteへproposalを記録する。
- [x] product requirements v0.3.8／ranking v0.8.0／UI spec v1.4.1のapprovalを記録し、同じapproval commitでADR-027をacceptedとして新規登録、ADR-016をsupersededへ変更する。
- [x] approved contractに従ってportable request、application compiler、workspace、schema、migrationを実装する。
- [x] draft／history／share／backup／fingerprint／migration／version transition matrixを検証する。

Done gate:

- version contextを内包する`PortableCalculationRequest`だけがdamageと復元commandを一意に決めるportable identityである。
- projection、`Set`、operation ID、derived stateを永続化せず、applicationだけがcurrent masterからcompileする。
- normal calculator、manual mode、selected ranking candidateのpure request constructor、calculatorのreset／version upgradeが明示contractどおり動作する。
- safe profile dataを失わず旧draft／historyだけを破棄し、旧schema shareと対象外schemaをfail-closedにする。
- runtimeへ旧schema reader、scenario-only fingerprint、parallel request modelを残さない。
- TSK-06.1所有pathがBlocking 0になり、実Webのranking handoff／noticeを含め、cacheだけをTSK-07へDeferredした状態でhandoffできる。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `CALC-PORTABLE-001` | Apply | focused schema／workspace／repository／share tests after approval | `docs/evidence/portable-calculation-identity-flow-tsk-06-1.md` |
| `RK-HANDOFF-001` | Apply | production ranking→calculator parity／notice／reset E2E | `docs/evidence/portable-calculation-identity-flow-tsk-06-1.md` |
| `RK-CACHE-001` | Deferred: TSK-07 | - | TSK-07 |
| `UI-CALC-001` | Apply | focused calculator version／reset／recovery component tests after approval | `docs/evidence/portable-calculation-identity-flow-tsk-06-1.md` |
| `DOC-REV-001` | Apply | `pnpm test:docs` | requirements／ADR／registry diff |
| `DOC-CLOSE-001` | Apply | `pnpm test:docs` | canonical flow note／Handoff |

Handoff:

- Start baseline: `c5511221c0fc2ec1baabaa4838b3c7c396b20f43`、clean worktree。
- Design ownership: product requirements owns `CALC-PORTABLE-001`; ranking requirements own `RK-HANDOFF-001` and `RK-CACHE-001`.
- Design decision: request embeds master／engine version context. Resolved intent is origin + initial NP + two-variant contribution; manual is manual only. Fingerprint and execution accept the request identity without parallel version arguments.
- Version transition: restore／history copy preserves the pinned identity; unavailable versions are historical-only. Only explicit current-version recalculation creates a new identity, and request／result version mismatch is rejected.
- Migration: exact schema 32 preserves builds／targets／CE／support and discards draft／history; exact v32 backup uses the isolated migrator; old-schema share and other old／future schema fail closed.
- Canonical flow note: `docs/evidence/portable-calculation-identity-flow-tsk-06-1.md`。product decision alternatives 0。TSK-06.1 pathはBlocking 0、evidence-free cache／stale detailだけをTSK-07へDeferredした。
- Approval gate: approved 2026-09-01 after design review at `245d1ee`。product requirements v0.3.8、ranking v0.8.0、UI spec v1.4.1をapprovedとし、ADR-027をacceptedで登録、ADR-016をsupersededへ変更した。承認commitはsemanticsを変更していない。
- Runtime boundary: `historicalOnly`はapplication／workspaceのrecovery stateに限定しengineの数値resultへ混ぜない。`origin`をbattle executionの分岐条件にしない。
- Runtime implementation: schema 33の`PortableCalculationRequest`へapplication entrypoint、workspace、fingerprint、draft／history／share／backupを収束。projection／operation ID／compiled stateは永続化せずapplicationがtyped intentから再compileする。scenario-only fingerprintとparallel persistence fieldは削除した。
- Migration result: exact schema 32 profile／backupだけをisolated migratorで受け、profile identity／timestamps／build／target／CE／support／active profileを維持しdraft／historyを破棄する。失敗時は`profile_parse_failed`を返しuser storeをclearしない。旧share、その他の旧版、future版は拒否する。
- Parity: 4 ranking policyすべてのselected candidateをpure constructorから再実行してresult完全一致。draft／history copy／shareはpinned identityを維持し、利用不能版は`historicalOnly`、明示upgradeだけが新requestを作る。
- Verification: focused portable/schema/workspace/repository/share/recovery成功、unit 65 files／362 tests、production 24 files／111 tests。production inventory／counter不変、schema traceだけv32→v33、digest `cc14841f8852c50ca432176f61fad141ce8abde955082a5d9191ccc1c945cf86`。同条件compile 9.450s→9.250s（-2.1%）。final `pnpm quality`成功。
- Review reopening: failed version upgradeのtransactionality、projection compilerの二重owner、実装済みWeb handoff／ranking noticeのscope分類不足を同一familyのBlocking 3として記録した。以前の計画がschema cutoverのdirect Web writerをTSK-07へ分離したscope inventory不足であり、承認済みcontractは変更しない。
- Review fix: applicationのtransactional upgrade commandは成功時だけ新request／resultをcommitし、invalid／unsupportedでは旧pairとtyped attemptを保持する。self／area policyを受ける共有compilerへranking／portable／presentation auditを収束し、portableはprepare once後にprojectionを適用する。production Web E2Eでself-buff除外のranking result parity、notice、通常条件reset、upgrade成功focus、unsupported失敗後の旧値保持／focus／retry／未上書きを検証した。
- Review verification: final `pnpm quality`成功（unit 66 files／370 tests、production 24 files／111 tests、E2E 66 passed／34 skipped）。production audit payload／digest／inventory／counterは不変。pre-fix 18.837秒に対するpost-fix 3 runは18.219／19.178／19.689秒（-3.3%〜+4.5%）。
- Current closure: TSK-06.1／06.2／06.3はBlocking 0で`done`。evidence-free cache／stale detailを所有する
  TSK-07は`ready`、TSK-08はTSK-07待ち。

### TSK-06.2: E2E responsibility and execution closure

Depends on: TSK-06.1

Review reopening baseline: `99966f7a8c6300904c590aff5d8e02ab8466a918`、clean worktree。
assertion-level台帳の意味的一致を同一family全体で再監査し、E2E-030〜043の必須outcome集合を
一度case側の`assertionIds`とassertion台帳の双方向一致へ展開した。

Canonical observation reopening baseline: `8abcc369081ad77610a3cbcee8e182475ab3770a`、clean worktree。
二つの可変ID listと46/61件だけのguardrailではsemantic closureにならず、E2E-A031もhelper testへ誤付替え
されていたためBlocking 1へ戻した。全61 observationを単一manifest、digest、replacement expectation marker、
削除／誤付替えnegative fixtureへ収束し、case relationはmanifestから導出する。

AST ownership reopening baseline: `29563fe6f1d1688c3bc435ade5788f8c6ffe623b`、clean worktree。
source block正規表現がmultiline `it.each`を越境し、chained markerを直前のsingle-proc testへ誤帰属したため
Blocking 1へ戻した。全61 replacementをTypeScript AST test nodeのexact titleと完全ID境界で所有し、同じ
multiline付替えをnegative fixtureへ固定する。

- [x] TSK-06.1完了HEADを固定し、同一環境・1 worker・retryなしのfull E2Eを3回測定して中央値を記録する。
- [x] 48個の明示的な`test()`定義と、viewport loop展開後50 cases／projectをstable case IDで台帳化する。
- [x] 全caseへsemantic owner、E2E固有failure、project owner、移行先、代替test、実測cost、closure statusを記録する。
- [x] component／application／battle-execution側の不足をsmall fixtureで先に閉じ、対応する意味論E2Eを削除または代表経路へ統合する。
- [x] desktop／mobile／VRT／a11yのproject ownershipをPlaywright設定とtest metadataへ移し、project-specific runtime skipをなくす。
- [x] 本物のranking worker／package接続は代表1経路へ限定し、loading／filter／detail／density／VRTではschema-validなtest-side response fixtureを使う。
- [x] prepared stateをspikeして268 MB costを理由に棄却し、通常setupとfresh contextのbrowser接続を維持する。
- [x] 変更後full E2Eを同一条件で3回測定し、その後1／2／4 workersをretryなし各3回で比較してcanonical worker数を決める。

Done gate:

- 各残存E2Eが、browser API、service worker、IndexedDB、real worker、responsive layout、VRT、a11yのいずれかに固有なfailureを一行で説明できる。
- HP、NP variant、actor count、probabilistic effect、condition、個別servant damageの正本がapplication／battle-executionにあり、E2Eで組合せを再列挙していない。
- UI command dispatch、typed input error、selection、loading、filter、detail presentationの不足がcomponent integrationで閉じてからE2Eを削除している。
- generated case、project ownership、実行、skipを別々に集計し、project-specific runtime skipは0件である。
- 本物の433件ranking完全計算はfull E2Eあたり代表1回で、fixture経路をpackage接続の証拠として扱っていない。
- setup再利用はtest codeだけに閉じ、productionへtest-only branch、master bypass、共有page stateを追加していない。
- calculator／ranking parity、production inventory、fail-closed、VRT、a11yに意図しない差分がない。
- 変更後3-run中央値は変更前より30%以上短縮する。未達時は原因と追加scopeをBlockingとして閉じるまでworker並列度を上げない。
- 1／2／4 workersの各3-runでfailure／timeout／session closeと中央値を比較し、3回全成功かつ実益がある最小worker数を採用する。条件を満たさなければ1 workerを維持する。
- Flow closure: N/A: production canonical state、damage execution、outcome classification、writer／recovery pathを変更せず、test ownershipとtest execution pathだけを変更するため。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `TS-QUAL-001` | Apply | E2E case metadata contract、`pnpm test:e2e`、`pnpm quality` | `docs/evidence/e2e-responsibility-flow-tsk-06-2.md` |
| `TS-ART-001` | Apply | Playwright HTML／trace／screenshot／measurement manifest check | `docs/evidence/e2e-responsibility-flow-tsk-06-2.md` |
| `TS-PERF-002` | Apply | full E2E変更前後各3回、1／2／4 workers各3回 | `docs/evidence/e2e-responsibility-flow-tsk-06-2.md` |
| `TS-REPORT-001` | Apply | case／project／skip／duration／setup／ranking counter report | `docs/evidence/e2e-responsibility-flow-tsk-06-2.md` |
| `RK-UI-001` | Apply | focused component integration、代表ranking worker E2E、VRT | `docs/evidence/e2e-responsibility-flow-tsk-06-2.md` |
| `RK-AUDIT-001` | Apply | `pnpm test:production` calculator／ranking parity and inventory check | `docs/evidence/e2e-responsibility-flow-tsk-06-2.md` |
| `RK-CACHE-001` | Deferred: TSK-07 | - | TSK-07 |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |
| `DOC-CLOSE-001` | Apply | `pnpm test:docs` | canonical flow note／Handoff |

Handoff:

- Canonical note: `docs/evidence/e2e-responsibility-flow-tsk-06-2.md`。開始HEADは`6d7608c`、
  worktreeの既存documentation変更を保持した。50 legacy cases＋setup、61 key assertionsを台帳化し、
  単一migration manifestのdigest／件数、全replacement AST test node内の完全ID markerをrunner contractで
  固定した。case relationはmanifestから導出し、削除、通常`it`誤付替え、multiline `it.each`越境の誤付替えを
  negative fixtureで拒否する。
- Ownership: semantic E2Eはcomponent／application／executionへ先に移管した。残存25 generated testsはsetup 1、
  desktop 15、mobile 9、skip 0。本物の433-row rankingは1件だけで、canonical factoryから作るfake Workerは
  VRT専用、loadingはcomponent integration ownerである。
- Performance: before中央値682.239秒、after workers 1中央値236.442秒（-65.3%）。workers 2は
  147.025／147.457／172.376秒で3/3成功、workers 4は3/3で同じ4 timeoutを再現したため、canonical
  config正本のworkers 2を採用した。268,097,500-byte prepared stateは不採用・削除済み。
- Scope correction: repository-wideなadaptive measurement変更はTSK-06.2から分離し、test strategyを
  v1.2.0、TSK-07〜09を従来の3-run契約へ戻した。本Taskの取得済み12 full runsだけをevidenceとして保持する。
- Parity／visual: production 24 files／112 tests、calculator 422、ranking／AttackProfile 433、digest
  `cc14841f8852c50ca432176f61fad141ce8abde955082a5d9191ccc1c945cf86`とruntime counterは不変。
  VRT 9/9、a11y 4/4、新規mobile baseline 7枚を目視した。
- Verification: final `pnpm quality`成功（runner 22／22、unit 70 files／377 tests、production 24／112、
  E2E 25／25・skip 0・2.6分）。ClosureはBlocking 0、Deferred 1。TSK-07はevidence-free cache／stale detailだけを所有して
  いたが、後続test strategy reviewでexecution observabilityをTSK-06.3へ分離した。TSK-06.2の責任移管は再開せず、
  当時はTSK-06.3を`ready`、TSK-07をその完了待ちとした。現在はTSK-06.3完了によりTSK-07が`ready`である。

### TSK-06.3: Test observability and artifact closure

Depends on: TSK-06.2

Planning baseline: `7717022bd9062b0156240f1f6a1b025e1a707037`、clean worktree。
TSK-06.2のE2E責任移管はBlocking 0のまま再開しない。後続reviewで、Vitest warningが集計されても成功扱いに
なること、unexpected consoleのtest単位許可契約がないこと、Playwright結果がVitestのrun manifestから分離して
いること、CIが`.test-results/`欠落を許容することを、test strategy T4の未完了execution observabilityとして確認した。

- [x] 一回のcanonical quality invocationへ一つのparent run identityを与え、unit／production／Playwrightの
      child manifestと完全artifactを参照できるようにする。
- [x] Playwrightのproject別pass／failure／skip／retry、HTML、trace、screenshotを構造化resultから登録し、
      HTMLやconsole表示の文字列parseを正本にしない。
- [x] warning、deprecation、unhandled error、unexpected test／browser consoleを構造化して収集し、baseline 0からの
      増加を`contract_failure`へ収束させる。許可出力はtest単位の完全一致、理由、期限を必須にする。
- [x] manifest記載artifactの存在と完全性をrunner側で検証し、reporter failure、artifact欠落、CI upload failureを
      child test成功で覆い隠さない。
- [x] unit／production／Playwrightについて、success、assertion failure、timeout／signal、reporter failure、
      warning／console、skip／todo、artifact欠落をstate-by-path negative fixtureで固定する。
- [x] compact consoleは成功時の名前／進捗を省略したまま、件数、warning、outcome、完全artifact pathを隠さない。
- [x] coverage threshold、Vitest／Playwright coverage merge、`userEvent`全面移行、production audit model変更を
      本Taskへ含めない。

Done gate:

- parent manifestだけから各child command、version、commit／dirty state、duration、outcome、file／test／skip／todo／
  warning数と全artifactへ到達でき、manifest記載fileの欠落が0件である。
- warningまたはunexpected consoleが1件でもある未許可fixture、Playwright skip増加、reporter／artifact欠落、
  upload failureがそれぞれ非0終了し、正常系はbaseline 0を維持する。
- 許可consoleはtest単位の完全一致、理由、期限を持ち、global regex、path、test title、message prefixだけの
  広いallowlistを持たない。
- CIはtest実行開始後の完全artifactを成功／失敗とも保存し、保存失敗をinfra failureとして報告する。
- local、CI、Pagesは引き続き`pnpm quality`だけをcanonical phase gateとして呼び、unit／production／E2Eの
  意味集合と終了コードを変えない。
- TSK-06.2の61 observation、残存25 E2E、VRT／a11y、production inventory、calculator／ranking parity、
  damage digest、runtime counterに意図しない差分がない。
- runner／artifact統合の変更前後を同一環境3回で測定し、test strategyのoverhead／構造変更ratchetを満たす。
- Flow closure: test outcome classificationとartifact write／CI recovery pathが対象。canonical parent／child manifestを
  唯一のownerとし、success、test failure、timeout／signal、reporter failure、warning／console、skip／todo、
  artifact／upload failureの全pathを`Verified`、`N/A`、`Deferred`、`Blocking`へ分類してBlocking 0とする。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `TS-OUT-001` | Apply | warning／console／bounded summary negative fixture、`pnpm test:runner` | `docs/evidence/test-observability-flow-tsk-06-3.md` |
| `TS-ART-001` | Apply | parent／child manifest、Playwright artifact、CI upload failure check | `docs/evidence/test-observability-flow-tsk-06-3.md` |
| `TS-RUN-001` | Apply | exit／timeout／signal／reporter／artifact failure fixture | `docs/evidence/test-observability-flow-tsk-06-3.md` |
| `TS-QUAL-001` | Apply | canonical entrypoint contract、`pnpm quality` | `docs/evidence/test-observability-flow-tsk-06-3.md` |
| `TS-PERF-001` | Apply | runner overheadを変更前後各3回 | `docs/evidence/test-observability-flow-tsk-06-3.md` |
| `TS-PERF-002` | Apply | canonical gateを変更前後各3回 | `docs/evidence/test-observability-flow-tsk-06-3.md` |
| `TS-REPORT-001` | Apply | parent manifest counter／artifact report | `docs/evidence/test-observability-flow-tsk-06-3.md` |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |
| `DOC-CLOSE-001` | Apply | `pnpm test:docs` | canonical flow note／Handoff |

Handoff:

- Start baseline: `1ab4b3e3fbd6a76e467d3f931b4a64c5c74b4345`、clean worktree。canonical noteは
  `docs/evidence/test-observability-flow-tsk-06-3.md`。
- Ownership: `quality-runner`のparent manifestを唯一のrun ownerとし、unit／production／Playwright childは
  structured reporter result、完全log、observation、suite固有artifactだけを所有する。HTML／console文字列parse、
  並行manifest、新旧runnerは残していない。TSK-08向けopaque typed detail境界を維持した。
- Failure closure: runner contract 33／33。success、assertion、timeout、signal、reporter、warning／deprecation／
  console、skip／todo／retry、child／parent artifact欠落、manifest write、CI source／upload failureを非0へ固定した。
  Playwright resource fallbackだけを5 test identityの完全message、理由、`2026-12-01`期限で許可し、正常runは
  warning 0／unexpected console 0を維持する。
- Final artifact: `.test-results/2026-09-01T11-46-26-409Z-15-e3f859/manifest.json`。10 steps、3 children、
  42 verified files、欠落／checksum error 0。unit 70 files／377 tests、production 24／112、Playwright 25／25、
  skip／todo／retry 0。成功summary 8行／241 bytes。failure run
  `.test-results/2026-09-01T10-57-02-946Z-44-880cd9`は113 filesにHTML、trace、screenshot、diffを保持した。
- Production invariants: master `20260831.10`、application digest
  `cc14841f8852c50ca432176f61fad141ce8abde955082a5d9191ccc1c945cf86`、422 calculator／433 ranking、
  data-pipeline digest `e116e91fad16fb6348826f26b5e29fc4db5239e26b49c1c8cad50eb0dd5c2fc2`は不変。
  read／parse／compile 1／1／1、candidate 6,376／3,957、damage request 6,913／1,599も不変。TSK-06.2の
  61 observation、25 E2E、VRT／a11y source／snapshotに意味差分なし。
- Performance: runner変更前1.85／1.29／1.19秒（中央値1.29秒）、変更後1.85／1.82／1.78秒
  （中央値1.82秒、+0.53秒）で1秒overhead ratchet内。quality変更前246.79／243.04／243.30秒
  （中央値243.30秒）、変更後261.69／264.44／263.57秒（中央値263.57秒、+20.27秒／+8.33%）。
  structured reporter、全event保存、42 file checksum検証の説明済み増加で10%構造ratchet内。
- Verification: `pnpm test:runner`、`pnpm test:docs`、`pnpm test:unit`、`pnpm test:production`、focused
  `pnpm test:e2e -- --grep ...`、performance用`pnpm quality` 3／3、completion `pnpm quality`、`git diff --check`。
  legacy TSK-00 aggregate
  auditorは変更外の`quantityConditions` assumptionで停止し、同script／master／product sourceにbaseline差分が
  ないため本Taskの証拠には用いず、canonical production child artifactでinventory／digestを確認した。
- Review resolution: browser raw eventをresource、test-server infrastructure、applicationへ一意に分類した。
  `locationUrl`を完全identityへ戻し、Vite lifecycleとE2E-023 WebSocket failureをtyped event／exact countで検証する。
  external expected snapshot取込もcanonical repository snapshotへ限定した。最終parent
  `.test-results/2026-09-01T15-55-17-653Z-15-2f687a/manifest.json`は42 artifactを検証し、Playwright raw
  336 eventをallowance 126／resource correlation 88／infrastructure 122へ完全分割した。
- Review verification: runner 49／49、unit 70 files／377 tests、production 24／112、Playwright 25／25。
  post-commit runner 3-run中央値2.43秒は実Chromium fixture追加による説明済み+1.14秒。quality中央値284.47秒は
  開始時比+16.92%だが、同じfinal observer logicの直前中央値263.74秒、最終run 272.48秒であり、lint／unit／productionも
  同時に遅い環境driftである。test／worker／retry、production inventory、calculator／ranking parity、両digest、
  runtime countersは不変。
- Completion commit: 本commit。Flow closureはBlocking 0、Deferred 1（TSK-08 typed domain reason）。
  Next command: `git status --short && git rev-parse HEAD`でTSK-07を再開する。
- Infrastructure failure identity reopening baseline: `7ff8e1348dbbe77bdb22954fa91229c92faddc45`、clean
  worktree。E2E-023 scope内の`/@vite/client` errorをmessageに関係なく`consoleError`へ縮約し、typed
  WebSocket errorとは件数だけで相関していたため、期待errorを未知messageへ同数置換してもsuccessになった。
  前回reviewはtyped WebSocket相関とexact countまでを反例化したが、同数のclass置換を recurrence scopeへ
  含めなかった。TSK-06.3をBlocking 1へ戻し、TSK-07は依存待ちとする。raw WebSocket URL／error textから
  browser notificationを完全一致で導出し、Vite connection failureを別のtest-owned exact classにする。
  Vite 8.2.2のagent判定による環境差を止めるため、`forwardConsole: false`をruntime contractとE2E server config
  で固定し、未知message、既知class置換、missing／extraをすべてfail closedにするまで完了扱いへ戻さない。
- Infrastructure failure identity resolution: 無型`consoleError`を削除し、test-owned exact WebSocket error textと
  raw typed URLからbrowser notification全文を導出して一対一照合する。Vite connection failureはruntime base URLから
  完全messageを構築する別classとし、unknown同数置換、既知class置換、両classのmissing／extra、別error text、
  application sourceの同文言、旧counter fieldをrunner fixtureで拒否した。runtime contractの
  `forwardConsole: false`をE2E Vite configが直接消費し、resolved configと実artifactのsecondary forwarding error 0を確認した。
- Follow-up verification: runner 49／49、focused E2E-023 2／2、full E2E 25／25、unit 70 files／377、production
  24／112。quality 3-runは255.57／253.16／252.45秒（中央値253.16秒）で3／3成功し、開始時中央値243.30秒比
  +4.05%で10% ratchet内。全runは42 artifactのbytes／SHA一致、warning／unexpected／skip／todo／retry 0、
  browser raw 335 = allowance 126＋resource correlation 88＋infrastructure 121である。production inventory、
  calculator 422／ranking 433、両digest、runtime counterは不変。Flow closureはBlocking 0、Deferred 1。
  TSK-06.3は`done`、TSK-07は`ready`へ戻す。Follow-up completion commit: 本commit。

### TSK-06.4: Ranking policy semantic design closure

Depends on: TSK-06.3

Independent design audit result: **Blocking 0**. Canonical note:
`docs/evidence/ranking-policy-candidate-flow-tsk-06.md`のauthoritative current delta。portable identity／recoveryは
`docs/evidence/portable-calculation-identity-flow-tsk-06-1.md`。前proposalのglobal contribution／dependency graph、
B1〜B4 owner分割、static skill verdict、および初回監査案の`transaction.consequences`／
`steps[].mutations`／`eligibility`同期fieldは棄却し、実装指示に使用しない。

Current work:

- [x] fixed product outcomeからdomain invariant、atomicity、owner、outcome dominance、portable identityを独立導出する。
- [x] HEADとplanning diffを分け、raw producer → master IR → action／condition planner → ordered execution → damage →
      selection → row／badge／detail → portable／UI recoveryを監査する。
- [x] current proposal、operation-ID exception案、action summary＋nested effect／contribution案、
      discriminated source-program案をcorrectness、complexity、migration、performance、test costで比較し、
      source-program案を推奨designとする。
- [x] **A1:** production全sourceのstep operationをlosslessに分類する。現masterでは1,427 servant
      active skill中1,244がpayloadを
      失った`nonDamage`を含む。resource、HP、state、form、field、bounded-phase-irrelevant、unsupportedのclosed unionと、
      selected branch単位のtransactionを確定し、passive／CE／support／mystic／NPの共有executor経路も
      分類してraw function名をruntimeへ漏らさない。9,123 effect occurrencesはresource 1,164、state／field 5,213、
      unsupported 21、bounded-phase-irrelevant 2,725、未分類0件。
- [x] **A2:** bounded active servant skill domainをschemaとplannerで一致させる。現schema 0〜20、planner 1〜3、
      productionは1〜3のみだが、active skill／passive／mystic codeが同じ`MasterSkill`を共有する。source別schemaを
      分け、active slotを1〜3にするか承認済みのより大きい範囲にするかを確定する。0件productionだけで
      Verifiedにしないschema fixtureを持つ。active／mystic slotを1〜3、passive／NP／CEをslotなしとするsource別schema、
      effects／choice上限はrequirement 7.1で確定。
- [x] **A3:** action option／choice／worldのfinite domainを閉じる。schemaは一skill内の複数choice groupと
      事実上無境界のeffect数を許すが、plannerは一groupのみを表現し固定4,096 capで失敗する。複数groupを
      producerで拒否するか完全なaction-option productとするかを決め、schema maximumのcomplete enumerationまたは
      sound dominance pruningをperformance gate内で証明する。player-choice groupは高々一つとしてproducer rejection、
      profile／policy／NP Lv別の完全上界4,096以下をprepared-context certificateにする。current最大2,880でcap緩和なし。
- [x] **A4 product decision:** `selfBuffs=excluded × conditionalEffects=satisfied`でも、attack-NP contributionの
      conditionだけを成立させるoptional skill actionはadmitしない。`structuralRequired` actionは別に保持し、
      mutation後のattack-NP contributionをcondition policyで評価する。fixtureはTSK-06.41へDeferred。
- [x] A1〜A3後、`CanonicalSourceProgram(action | automatic) → CanonicalExecutionStep →
      CanonicalStepOperation`の最小IR、candidate-local admission、concrete contribution evaluation、lazy input read、
      nested execution result、effective contribution setを確定する。
- [x] source／step operation／slot／choice product／NP base-special split／mixed sibling／retained mutation／exclusive branch／
      five outcome／portable
      migrationのstate-by-path matrixを再監査し、Blocking 0ならだけTSK-06.4をdoneにする。
- [x] A1〜A3とmatrix closure後、source-program／policy／portableのADR-028をacceptedで追加し、矛盾する
      ADR-019／027を同じ変更でsupersededにする。

Current done gate:

- A1〜A3とADR replacement gateを含むcanonical flow noteのBlockingが0で、production inventoryとschema-legal
  fixtureが役割分担している。
- semantic ownerはpipelineのlossless source-program／step-operation IR、applicationのcandidate-local policy、battle executionのordered transaction／
  condition／effective result、portable application identity、Web presentationへ一意に分かれる。
- global dependency graph、consequence／mutation要約の二重owner、eligibility同期field、operation-ID exception、
  static skill safety verdict、parallel compiler、compatibility fieldを採用しない。
- TSK-06.41のcutover対象とTSK-06.5の証明対象に循環がなく、未実装runtimeをVerifiedにしない。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-IR-001` | Apply | operation／source-schema inventory review | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md`、ADR-028 |
| `RK-EXEC-001` | Apply | transaction／lazy-read／outcome matrix review | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-POLICY-001` | Apply | four-policy／action-admission／finite-certificate design review | ranking requirements v0.9.5、ADR-028 |
| `CALC-PORTABLE-001` | Apply | identity／migration／recovery matrix review | `docs/evidence/portable-calculation-identity-flow-tsk-06-1.md`、ADR-028 |
| `DOC-REV-001` | Apply | `pnpm test:docs` | requirements v0.9.5、ADR-028、flow notes、Task registry |

Handoff:

- Audit baseline: `45878789e77160b0beba0e6c203e72756c5a0383`。runtime code変更なし。
- A1〜A3 closureの詳細、confirmed facts、inferences、counterexamples、alternatives、recommendation、flow matrixはcanonical
  note最上部を参照する。
- TSK-06.41はready。TSK-06.5、TSK-07以降は依存待ち。candidate cap／timeout緩和、raw-key runtime分類、adapter追加で閉じない。

#### Rejected pre-audit checklist — non-normative review history

- [ ] B1 contribution ownership、B3 profile outcome、B4 action admissionは
      `ranking-policy-candidate-flow-tsk-06.md`、B2 portable identity／persistence／recoveryは
      `portable-calculation-identity-flow-tsk-06-1.md`で閉じる。B1／B2はcompiled projection interfaceだけを共有し、
      B4はB1のpolicy結果を消費して再分類しない。
- [ ] policyで除外可能なdamage contributionと、同一operation内で分離が必要なNP base sentinelを母集団にし、
      contribution、dependency node、consumer edgeを分離した多対多graphを決める。edgeはoperation／mutation／
      contribution consumerとrole集合を持ち、基礎ATK、class相性など
      policy不変のbase inputは`N/A: policy invariant`として棚卸しし、汎用provenance engineへ広げない。
- [ ] dependency originをactivation requirement、value dependency、stochastic dependency、resource
      dependency、world／state dependency、intrinsic／unconditionalへ分類し、`operation.condition`、
      NP special condition、value expression、modifier rate、ignore効果、NP damage spec内部を全数監査する。
- [ ] dependency edgeへconsumer roleだけでなくordered `readPoint`を持たせ、同じexpressionをmutation前後で
      同一truthへ潰さない。contribution／presentation group／composition／dependency IDのcanonical生成規則、
      uniqueness、deterministic ordering、version変化範囲を確定する。
- [ ] originと独立に`dependencyRole: executionPrecondition | retainedMutation |
      contributionApplicability | contributionValue`を付与し、projection後のrequired-input liveness matrixを確定する。
      execution precondition／保持mutationに到達するinputは必須、除外済みcontributionだけに到達するinputはdead、
      両方へ到達するinputは必須とする。applicationの`PotentialInputPlan`とordered executorの
      `ActualInputReadOutcome`を分け、execution前にmutation後truthを推測してexact live setを作らない。
- [ ] canonical IR → compiled projection → live input plan → execution result → effective contribution set →
      damage／presentation aggregationを別discriminated unionにし、unsupported-with-value、excluded-but-required、
      failed-but-effective、false-but-appliedを型で表現不能にする。
- [ ] contributionごとにdamage inputのfield／NP level slotと、加算／最大値／乗算／上書き／boolean ORの
      compositionを確定する。production 0件のdependency originも0件ratchetとschema-legal fixtureの両方を持つ。
- [ ] `all`／`any`／`not`はcurrent world truthとrequirement classificationを別結果にし、`unknownTruth`、
      `unsupportedSemantics`、`invalidExpression`を別unionへ固定する。三値truth compositionとsemantic
      fail-closedを別matrixで確定する。
- [ ] omitted／deduplicated stateの`CandidateDisposition`、materialized candidate execution、profile resultを別型にし、
      外部outcomeを`calculated | unavailableUnderPolicy | inputRequired | invalid |
      unsupported`へ分け、profile-level outcome dominance matrixを確定する。最大値の完全性を証明できない
      repairable input／semantic invalid／implementation unsupportedを、低い既知数値や候補なしで隠さない。
- [ ] well-formed unsatisfiable、candidate factsの排他矛盾、malformed IR、planner invariant violation、unsupportedを
      別outcomeへ固定する。候補除外proofは`RankingCandidateSpace`だけがtyped reasonとして発行し、aggregatorへ
      独自の到達可能性／上界推測を持たせない。
- [ ] ownerを「pipelineがcanonical dependency／contribution／action cost IRを発行、executionがtruth／value／outcomeを
      評価、applicationがActionAdmissionPlanとself／condition／areaの独立projectionをcompile」と固定する。
      ranking、portable、auditは同じ
      application compilerを呼び、executionはcompile済みtyped projectionだけを消費する。
- [ ] projectionを単一の`included | excludedBy...`にせず、self／condition／areaViewを独立に保持する。同じ寄与が
      selfとconditionの両方から除外される反例を閉じ、effective判定をexecution＋三軸から一度だけ導出する。
- [ ] portable intentを自己バフ軸と条件効果軸へ分け、通常calculatorの明示default、ranking constructor、
      schema version、fingerprint、draft／history／share／backup、migration、upgrade、resetを一つのbreaking
      identity cutoverとしてranking requirements v0.9.1と整合する実装可能な状態へする。
- [ ] schema 33をintent別に処理する。manualはcurrent manual、calculatorは`normalCalculator`へ決定的に移行し、
      rankingはcondition policy欠落のため
      historical-only、不正／混成はrejectまたはsnapshot破棄とし、保存先ごとのproduct outcomeを承認する。
- [ ] 「通常の計算条件へ戻す」はtrue normal resetとしてapplicationのbaseline constructorからscenarioを再構築する。
      attacker／AttackProfile subject以外のranking由来target／field facts、conditional inputs、stochastic outcome、
      ordered actions／choice、evidenceを除去するfield-by-field dispositionを承認する。
- [ ] presentation matrixで、rowの実効logical effect group件数、全execution effectを保持するdetail、effective
      contributionだけから導出するbadge、policy除外でも保持するaction／state／evidenceを別contractにする。
- [ ] `contributionId`と`presentationGroupId`を分け、1 logical effectの複数bucket／minimum-delta分割を1件表示に保つ。
      intrinsic NP base sentinelは表示件数へ含めないproduct contractを承認する。
- [ ] B4 static action semanticsを`safeDeterministic | conditionalTradeoff | outOfScope | unsupported`、
      AttackProfileごとのroleを`structuralRequired | optional`へ分ける。通常のみはsafeかつ無条件の実効寄与を持つ
      無デメリットの任意actionだけ、成立込みはNP消費等の
      表現可能なtradeoffを拡張し、conditional-only actionは通常候補へ残さない。
- [ ] policy上no-opの任意actionはplannerだけが`noEffectiveContributionUnderPolicy` proofで除外する。
      mixed sibling、branch transaction、cost commit、resource到達可能性をcontribution projectionと別matrixで承認する。

Design done gate:

- 二つのcanonical flow noteがB1〜B4のowner、別Blocking count、相互interfaceを一意に示す。
- contribution／outcome familyはgraph母集団／edge／read point、ID、stage union、input liveness、truth／semantic
  composition、outcome dominance、independent policy axes、presentation groupingの未決定が0件である。
- action admission familyは通常safe action、conditional tradeoff、conditional-only no-op、mixed sibling、
  branch transaction、candidate-local reachabilityの未決定が0件である。
- portable familyは二軸identity、schema 33 intent別disposition、true normal reset、全persistence／recovery
  outcomeの未決定が0件である。
- TSK-06.41で変更するruntime pathは`Deferred: TSK-06.41`であり、未実装pathをVerifiedにせずdesign closureと
  implementation closureを混同しない。
- ranking requirements v0.9.1の5 outcome、four-policy action admission、NP消費tradeoff、independent projection、
  schema 33 intent別migration、required-input liveness、composition、reset、presentation groupingを正本とする。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-IR-001` | Apply | contribution／dependency graph、stage union、production／schema-legal inventory self-check | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-EXEC-001` | Apply | liveness／execution transition／transaction matrix self-check | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-POLICY-001` | Apply | matrix self-check／requirements approval | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `CALC-PORTABLE-001` | Apply | intent別migration／recovery matrix self-check | `docs/evidence/portable-calculation-identity-flow-tsk-06-1.md` |
| `DOC-REV-001` | Apply | `pnpm test:docs` | approved requirements revision and two flow-note interface alignment |

Handoff: rejected matrix is superseded by the current audit handoff above; A1〜A4 and ADR replacement are closed.

### TSK-06.41: Ranking contribution and portable atomic cutover

Depends on: TSK-06.4

Current status: `done`. The checked checklist below records the v0.9.5 cutover; requirement v0.9.6's explicit
IRL-003／005／006 delta is closed by the product-correction completion below.

Entry condition: TSK-06.4 A1〜A3とADR replacement gateを含むBlocking 0。以下はcurrent audit recommendationに基づく
cutover境界であり、
rejected graph型を復活させない。

- [x] `CanonicalSourceProgram(action | automatic) → CanonicalExecutionStep → CanonicalStepOperation`へ
      destructive cutoverし、action transaction、passive／intrinsic／CE／support／mysticのautomatic source、
      state／field／resource mutation、normal modifier、
      rate、ignore、NP base／specialを一つのordered resultへ収束する。consequence要約やeligibility同期fieldを作らない。
- [x] `nonDamage` 9,124 operations／9,123 effect occurrencesをresource、state／field、typed unsupported、
      bounded-phase-irrelevantへ再compileし、未分類0件を共有production inventoryでratchetする。raw function名をruntime
      unionまたはadmission branchへ残さない。
- [x] active／passive／NP／CE／mysticをrequirement 7.1のsource別schemaへ破壊的に切り替え、slot 4、複数
      player-choice group、source別effect／candidate上限超過のschema-legal fixtureをproducerでfail-closedにする。
- [x] `AttackProfile × four policies × NP1〜5`の`FiniteRankingDomainCertificate`をprepared-context constructionで生成し、
      complete upper bound ≤4,096とmaterialized count一致を検証する。独立した512 preparation-state capとpartial
      `candidateLimitExceeded` resultを削除し、small exhaustive oracleを追加する。
- [x] candidate-local action admissionをfinite domain構築前に実装する。自己バフありは無条件・確定的・無デメリットで
      実効寄与を持つ任意action optionだけをbaselineへadmitし、成立込みはcompatibleな特攻／条件効果／field／
      表現可能なcostを一つの合法scenarioへ重ねる。
- [x] 排他的player choiceはbranchを合算せず、cost、後続state、attack NP到達可能性を反映した最終平均damageが
      最大の合法branchを一つ選ぶ。conditional-only actionはbaselineへ残さず、mixed siblingの無条件寄与は保持する。
- [x] ranking、portable replay、production auditが同じapplication compilerを呼び、ordered executionはそのtyped
      projectionを消費する。damage、selection、row count、badgeを一つのeffective contribution集合から導出する。
- [x] ordered action precondition／step activation／included contribution evaluationのlazy read、canonical source／step／
      contribution／presentation identity、self／condition／areaView decisionを実装し、dependency graph、単一除外理由、
      operation-ID fallbackを残さない。
- [x] portable schema／fingerprint／persistence／migration／recoveryを二軸intentへ破壊的に切り替え、旧current
      schema readerやscenario/world factsからのcondition policy推測を残さない。
- [x] schemaを読む全direct reader／writerとreset production commandを同時に切り替え、selected rankingからcalculatorへの
      最小Web handoff parityを閉じる。notice、recovery interaction、cache、responsive／a11yだけをTSK-07へDeferredする。
- [x] operation-ID projection、旧portable reader、旧policy fallback、compatibility flag、並行compilerを同じcutoverで
      削除し、新旧runtimeを併存させない。旧behaviorへ戻すIR adapterを必要とする別runtime準備Taskを作らず、
      production entrypointは常に一つとする。
- [x] focused schema-legal action／effect／contribution／liveness matrix、production occurrence／digest、presentation state、
      per-contribution completeness、portable／calculator execution parity、performanceを閉じる。
- [x] focused candidate soundnessとsmall exhaustive oracleをcutover gateとして閉じる。全production四policy × NP1〜5の
      最終inventory／digest／performance固定はTSK-06.5へDeferredし、本Taskの値をfinal baselineと呼ばない。

Reopened implementation delta (2026-09-04, requirement v0.9.6):

- [x] `unsafeBaselineEffect`相当のstatic adverse vetoを削除し、自己バフありでは選択policy上の実効寄与だけでoptional
      actionをadmitする。negative modifier、HP／NP loss、detrimental state、trait removalを個別の除外branchへ移さず、
      全consequenceをordered executorへ渡す（IRL-006）。
- [x] action option × policy × 合法initial stateごとに全operation、後続action、攻撃宝具をtransactionalに実行し、完遂不能な
      具体candidateだけを`unreachable`にする。少なくとも一つのcandidateが完遂可能ならactionを候補集合へ残し、最終平均
      damageで比較する。`policyNoOp`は実効寄与なし、`unsupported`は未表現semanticsだけに限定する（IRL-006）。
- [x] resource closureをcritical starsだけでなくHP／BPにもordered suffix基準で閉じる。mutation前だけにreaderがある場合は
      `noDamageReader`、mutation後にreaderがある場合はcanonical stateを更新して読むかtransaction全体をtyped unsupportedに
      し、production-negative familyは明示0件ratchetを持つ（IRL-003）。
- [x] portable resetはmutableな`currentScenario`ではなくretained requestのexact attacker identityからsubject／buildを解決し、
      requestとUI selectionがずれるproduction fixtureで、成功時のatomic replaceと失敗時のdurable／memory／reload不変を
      検証する（IRL-005）。
- [x] focused state-by-path matrixを追加する: costなし、HP cost後も到達、NP costで100%候補だけ不能、capacity内の高い開始NPで
      到達、negative modifier、detrimental state、conditional-only、unconditional＋conditional sibling、unknown cost、
      player-choice branch。候補／damage／rank差分をcanonical inputと規則で記録する。
- [x] shared production inventoryで、fixed／dependent HP・NP cost、negative modifier、detrimental state、trait removalを
      action option × policy × initial state × ordered pathへ分類し、`admitted`／`policyNoOp`／`unreachable`／`unsupported`の
      件数とdigestを固定する。production 0件familyは0件ratchet＋schema-legal fixtureで閉じる。
- [x] 変更前後の`Servant × AttackProfile` ranking entry、採用action、開始resource、damage、順位をdiffし、新規／消失memberを
      「新たに完遂可能なadverse action」「具体candidateのresource不足」「policy寄与なし」「unsupported」のcanonical reasonで
      全件説明する。説明不能なmember差分をBlockingとし、candidate上界とhot pathの10%超の未説明増加を許容しない。

Done gate:

- `通常のみ`でもconditionを成立させたoperation、state mutation、field mutation、ordered action、
  evidenceは維持されるが、それらのconditional damage contributionはdamage inputへ入らない。
- `成立込み`は各入力candidateで一つの合法scenarioに共存する寄与だけを使い、排他的choiceを同時適用せず、
  execution preconditionを迂回しない。特攻、条件効果、field、表現可能costを同時評価し、eligible candidate集合の
  production最終最大値はTSK-06.5で閉じる。
- 自己バフあり・通常のみでadmitされる任意skillは無条件・確定的な実効寄与を持ち、表現済みデメリットを理由に落とされない。
  全transactionと攻撃宝具を完遂できない具体candidateだけが`unreachable`であり、conditional-only action、未解釈costの
  数値fallback、根拠のないpolicy no-op actionが0件である。
- `powerMod`／`npSpecial`のkind、servant ID、名称、labelによる一律除外または個別補正がない。
- 本Taskが受け取るcandidate集合で通常のみのconditional contribution混入0件、成立込みの合法な
  per-contribution欠落0件である。全AttackProfileの最終maximum／順位はTSK-06.5で再固定する。
- damage値、順位、effective logical effect count、「特攻」badgeが同じeffective contribution集合と一致し、
  detailはその集合に加えてpolicy除外済みexecution effect／action／state／evidenceも明示状態付きで保持する。
- profile resultは5 outcome classを保持する。`calculated`が支配できるのは`RankingCandidateSpace`のtyped
  `CandidateDispositionProof`で既にunavailableとなった候補だけで、残る`inputRequired`／`invalid`／`unsupported`は
  必ず数値profileをblockする。集約器は到達可能性や数値上界を推測しない。
- rowの件数はdistinct effective `presentationGroupId`を数え、NP base sentinelを除外する。1 logical effectの内部的な
  contribution分割で件数を変えない。detailは全execution effectと各contributionのself／condition／areaView decisionを
  独立に保持し、action／state／evidenceをfilterしない。badgeだけを隠す修正は禁止する。
- NP base、special multiplier、通常modifier、modifier rate、ignore効果が同じaction／effect／contribution flowへ
  収束し、operation ID単位の例外やcomponent kind単位の一律除外がない。
- activation、value、stochastic、resource、world／state、intrinsicの全readerとstep operationがproduction
  inventoryへ分類され、未分類／重複ownerが0件である。
- required inputはaction precondition、step activation、included contribution evaluationのordered readerでactual readを
  決める。除外済みcontributionの
  applicability／valueだけを読むinputは要求せず、execution precondition／保持mutationにも到達するinputは要求し、
  precondition迂回と偽の`inputRequired`がともに0件である。
- nested action／step／operation／contributionの反例をfixture化し、同じinput／conditionを共有するincluded／excluded contribution、
  retained mutation、operation内mixed component、mutation前後の同一expressionでconsumer再解釈が0件である。
- source／action option／step／contribution／presentation group IDは一意でdeterministicに並び、array index、label、
  runtime iteration orderに依存しない。
- portable requestだけで自己バフpolicyと条件効果policyが一意になり、同じscenarioを両policyで共有しても
  fingerprint、draft／history／share／backup、replay resultが混同されない。
- schema 33 manualはcurrent manual、calculatorはcurrent calculator intentへ決定的に移行し、rankingはmatching resultだけ
  historical-only、不正／混成はrejectまたはsnapshot破棄する。
  どのoriginでもscenario／world／damageから欠落したranking condition policyを推測しない。
- calculator intentはranking policyを流用せず、scenarioで成立した寄与を通常評価する。
  resetはapplication baseline constructorでranking由来world facts／inputs／stochastic／actions／choice／evidenceを
  除去し、scenario、開始NP、intent、result、fingerprintを一transactionで置換する。
- normal modifier loop、NP damage内部倍率、state-derived reader、without-area projection、portable
  recompilation、invalid／unsupported recoveryの全pathでstate-by-path matrixの`Blocking`が0件になる。
- current schemaのdirect reader／writer、draft／history／share／backup、reset command、minimal Web handoffに旧intent、
  operation-ID projection、compatibility adapter、parallel compiler、dual runtimeが0件である。
- calculator／ranking／ranking-origin portable calculation parityを維持し、全damage差分をcanonical
  requirement、witness、ordered planで説明できる。
- profile blocker diagnosticsはoutcome class別count、stable digest、classごとのbounded representativesを保持し、
  candidate全件をportable result／UI／audit artifactへ展開しない。
- candidate数、damage request数、production suite／ranking hot pathの差分がsemantic dimensionから説明され、
  A3で承認したschema maximumのcomplete上界から外れず、未説明の10%超退行やcandidate cap緩和がない。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `CALC-PORTABLE-001` | Apply | focused schema／fingerprint／persistence／migration／recovery tests | `docs/evidence/portable-calculation-identity-flow-tsk-06-1.md` |
| `RK-IR-001` | Apply | canonical source／step-operation／contribution／presentation inventory and fixtures | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-EXEC-001` | Apply | typed stage transition／liveness／ordered execution／rollback tests | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-POLICY-001` | Apply | `pnpm test:diagnostic -- <ranking-contribution-policy-filter>` | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-AUDIT-001` | Apply | `pnpm test:production` contribution occurrence／contamination／omission／parity inventory; final four-policy maximum is TSK-06.5 | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-HANDOFF-001` | Apply | pure constructor／portable replay／minimal production Web handoff parity | `docs/evidence/portable-calculation-identity-flow-tsk-06-1.md` |
| `RK-CACHE-001` | Deferred: TSK-07 | - | TSK-07 |
| `RK-UI-001` | Apply | focused row／detail／badge projection tests | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `UI-CALC-001` | Apply | focused normal-intent／reset／upgrade recovery tests | `docs/evidence/portable-calculation-identity-flow-tsk-06-1.md` |
| `RK-PERF-001` | Apply | ranking hot pathを変更前後各3回 | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `TS-PERF-002` | Apply | affected production gateを変更前後各3回 | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `DOC-REV-001` | Apply | `pnpm test:docs` | approved portable two-axis identity revision and Task／flow-note alignment |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |

Handoff:

- Baseline: `4587878`、`main`、planning開始時clean worktree。実装code変更なし。
- User-visible outcome: `通常のみ`は条件成立のための操作／state／evidenceをdetailへ保持しつつ条件付きdamage寄与を
  除外し、残った寄与だけがdamage、順位、effective logical effect count、「特攻」badgeへ現れる。
- Governing invariant: ranking requirements 5.2、7.2、11.1、17章の「通常のみでconditional
  contribution混入0件」。これは承認済みcontractの未充足であり、UI局所修正では閉じない。
- Canonical flow families: `docs/evidence/ranking-policy-candidate-flow-tsk-06.md`がsource program、application
  policy／outcomeを所有し、`docs/evidence/portable-calculation-identity-flow-tsk-06-1.md`がportable identityを所有する。
  両者は同じapplication facadeを呼び、compiled graphやprojection IDを永続化しない。
- Review gap: TSK-06はcandidate soundness／maximum／execution parityをcondition policy closureとして扱い、
  `conditionalContribution`からprojection、damage input、row／badgeまでのconsumer inventoryと混入0件
  assertionを欠いた。TSK-06.1の共有projection compilerもself skill／areaだけを分類し、このgapを保持した。
- Implementation stop: TSK-06.4でA1〜A3とADR replacement gateを含むdesign Blockingが0になり、runtime pathが
  TSK-06.41／06.5へ明示的に
  DeferredされるまではTSK-06.41を開始しない。TSK-06.41はcontribution／action admission／outcome／portableを
  一つのruntime semantic cutoverとして閉じ、TSK-06.5は新しい意味論を追加せずfinal maximum／four-policy closureを所有する。
- action admissionのproduct／designはTSK-06.4、実装はfinite domain構築前にTSK-06.41が所有する。
  TSK-06.5はcandidate soundness／finite maximum／四policy production inventoryの最終証明だけを所有する。
- TSK-06.5、TSK-07、TSK-08、TSK-09.1、TSK-09はこのTaskのBlocking 0まで待機する。

Completion:

- Start: clean `b07ca1ddb4fae01d67e38321e7a7c496b9592a64`. Canonical flow notes are
  `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` and
  `docs/evidence/portable-calculation-identity-flow-tsk-06-1.md`; every TSK-06.41 runtime path is Verified,
  `N/A`, or explicitly Deferred and Blocking is 0.
- Runtime cutover: source-specific schema 43, portable schema 34, engine 30.0.0, one ordered application
  compiler／executor, per-contribution self／condition／area decisions, candidate-local action admission, typed
  five-class profile outcomes, exact schema-33 migration, transactional reset, and direct Web handoff. Legacy
  operation-ID projection, independent 512-state cap, current old intent, compatibility path, and parallel
  runtime are absent.
- Production: master 13,875 effects／14,623 operations; preparation 6,360 generated／3,949 deduplicated／3,438
  terminal; ranking 576 candidates／575 damage requests／556 distinct inputs; 433 AttackProfiles／432 rows plus
  one typed insufficient-NP exclusion. Application digest
  `8f52a96e2e49e5917e61dc49253a102127a6a3fda21029d1c0f17933bf985b57`; pipeline digest
  `916403ecd681dc6b2c4655bd3c052bd8527db3eeac0d54dd1b1a2d18641c02e8`.
- Performance: canonical production runner 38.01／40.24／38.74 s, median 38.74 s against start 38.47 s
  (+0.70%). The 2,880／4,096 maximum, candidate cap, project timeout, and worker configuration are unchanged.
- Verification: focused candidate／executor 47／47, portable／schema／UI fixtures, unit 73 files／380 tests,
  production 24 files／113 tests, and focused Playwright 3 projects／10 tests passed. Final `pnpm quality`
  passed with unit 380, production 113, Playwright 25, skip／todo／retry／warning／unexpected-console 0;
  artifact `.test-results/2026-09-02T06-07-59-655Z-44-fc4f13`. TSK-06.41 is `done`; TSK-06.5 is `ready`.
- Completion verification correction: the unused-by-production but schema-legal
  `preserveScenarioOvercharge` compatibility option and its runtime branch were deleted. NP2／200% start now has
  a focused application fixture proving executor-derived base OC2, and the legacy symbol scan is 0件. Production
  inventory／digests are unchanged. TSK-06.41 remains `done`; TSK-06.5 remains `ready`.
- Implementation review closure: IRL-001〜005 are closed in the canonical owners. AttackProfile-bound
  condition classification is shared by admission and contribution inclusion; HP／BP／trait-count NP value
  dependencies enter policy and witness construction; damage-relevant HP／star／BP mutations execute or become
  typed unsupported under one action transaction; profile blockers retain deterministic class diagnostics;
  portable reset constructs and executes the current-version baseline before durable／memory publication.
  Focused schema-legal fixtures and production ratchets cover all five findings. Application inventory is 419
  calculated／3 typed unsupported calculator scenarios and 432 ranking rows; application digest is
  `d9b41f224697dcd4addae97681492721b4a60d534192d11163bbaf4c48811695`. Final four-policy maximum remains
  Deferred to TSK-06.5 and cache／notice interaction remains Deferred to TSK-07. TSK-06.41 remains `done`;
  TSK-06.5 remains `ready`.
- Re-review correction (2026-09-04): the broader recurrence matrix reopened IRL-001／003／005. Terminal-form
  intrinsic traits and program-proved choice／trigger facts are not yet bound by baseline admission;
  critical-star mutations with downstream readers are incorrectly erased as terminal input; and the Web
  reset resolver substitutes a default servant for a missing exact subject. Canonical flow deltas and
  counterexamples are recorded in both evidence notes before implementation. Current status is
  `Blocking 3`; TSK-06.41 is reopened and TSK-06.5 must wait.
- Re-review correction completion: IRL-001／003／005 are closed with Blocking 0. The shared classifier binds
  card／variant／terminal traits／program-proved choice and trigger facts; fixed critical-star gain／loss mutates
  ordered canonical state and unrepresentable transitions roll back their transaction; Web reset requires one
  exact request subject before the application attempt. Douman adds one explained default candidate
  (669 total; 668 requests; 631 distinct inputs), while the 4,096 bound, 433 profiles／432 rows, and 419
  calculated／3 unsupported calculator inventory remain unchanged. Missing-subject reset preserves memory,
  durable request／result／fingerprint, and reload state; exact-subject reset succeeds. TSK-06.41 is `done` and
  TSK-06.5 is `ready`. Final `pnpm quality` passed 402 unit／114 production／25 Playwright tests with
  skip／todo／retry／warning／unexpected-console 0; parent artifact
  `.test-results/2026-09-04T13-13-54-906Z-15-6f35e3`.
- Product correction reopening (2026-09-04): requirement v0.9.6 supersedes the disadvantage-free baseline
  admission rule. Current code still drops represented adverse actions before candidate execution (IRL-006),
  HP／BP resource closure does not use the required ordered suffix／state transition (IRL-003), and Web reset
  resolves from mutable scenario state rather than the retained request subject (IRL-005). Current status is
  `Blocking 3`; TSK-06.41 is `ready`, and TSK-06.5 is `blocked` until these runtime paths and focused
  counterexamples close. Canonical matrix: `docs/evidence/ranking-policy-candidate-flow-tsk-06.md`.
- Product correction completion (2026-09-04): IRL-003／005／006 are closed with Blocking 0. Optional action
  admission no longer rejects represented adversity; four-policy production admission is ratcheted by digest
  `bb43fa1ff4df8e68ce460829cba253459ebc2e1a7e053a7ce782529018d6e101`, while concrete baseline execution
  records 12 typed `insufficientNpGauge` candidates. HP／BP resource relevance uses the ordered suffix, so
  calculator `300100` becomes calculated while downstream-reader `702500`／`705300` remain typed unsupported.
  Portable reset resolves only the retained request subject inside the application boundary. Current-default
  ranking evaluates 1,936 candidates／1,924 damage requests／1,298 distinct inputs and emits 393 rows plus 40
  typed unsupported profiles. The full 433-profile join in
  `docs/evidence/ranking-adverse-action-diff-tsk-06-41.json` records 348 direct result changes plus 85
  rank-only changes with actions, resources, NP1〜5 damage, ranks, and reasons. Audit digest is
  `e0677f9362ef8f9a50e312693a1c8cc5fcc11e22be31b4d7c39f268ad41bbc78`; the unchanged 4,096 bound contains
  the 3,840 largest satisfied product. The affected audit median is 7.167 s versus 4.697 s (+52.6%), explained
  by 2.88× damage requests from the required semantic population. Final four-policy production maximum remains
  Deferred to TSK-06.5. Final `pnpm quality` passed with 406 unit／116 production／25 Playwright tests and
  skip／todo／retry／warning／unexpected-console 0; artifact
  `.test-results/2026-09-04T15-08-22-027Z-15-a59fec`. At this historical boundary TSK-06.41 was `done` and
  TSK-06.5 was `ready`; requirement v0.10.0 inserted TSK-06.42〜06.44. TSK-06.42 Step 1 subsequently found
  the shared resolved-level ATK fallback and servant-build record identity gap, and inserted TSK-06.46／06.47 as
  independent `ready` prerequisites.

### TSK-06.46: Resolved attacker level-stat fail-closed

Depends on: TSK-06.41

- [x] `calculation-application`のshared resolved-scenario preparationで
      `servant.atkByLevel[String(selectedLevel)]`のpresenceを一度だけ解決し、欠落をdiscriminated
      `invalid: attackerLevelStatUnavailable`へ切り替える。presentな0は有効値とし、resolved
      `explicitOverrides.attackerAtk`はjoin成功後だけ適用する。manualの明示ATKは変更しない。
- [x] direct calculator、prepared ranking candidate／profile aggregation、portable
      execute／recover／reset／version upgradeが同じapplication invalidを消費する。invalidはordered execution、
      damage cache、row／detail／handoff、draft／history writeへ到達させず、unsupportedやgeneric throwへ畳み込まない。
- [x] Web calculatorのinvalid recoveryを維持し、ranking handoff失敗時にdraftをpublishせず、
      `HomeRoute`のnon-calculated → numeric `0`をnullable／explicit unavailable presentationへ切り替える。
      ranking precheck、level interpolation、servant ID／名称分岐は追加しない。
- [x] positive／present-zero／missing／missing＋resolved override、calculator／ranking parity、portable
      execute／recover／reset／upgrade retained-state、ranking handoff no-write、home no-zeroをsmall fixtureへ固定する。
- [x] shared production auditの一回のmaster load／parse／compileで、422 attack servantsの自然上限／Lv.90と
      calculator／rankingが実際に参照するunique servant-level pairを監査し、missing 0をratchetする。
      candidate／damage-request counterと3-run performance medianをStep 1 baselineから維持する。

Done gate:

- resolved servant／level pairにcanonical ATKがない全経路が同じtyped invalidとなり、numeric input／row／
  home headline、0 ATK fallback、近傍level補間、override repairを返さない。presentなcanonical 0とmanual明示ATKは維持する。
- calculator、ranking、portable replayが同じscenario preparationを使用し、invalid candidateをdamage cacheへ入れず、
  failed execute／recover／reset／upgrade／handoffがretained memory／durable request／resultを変更しない。
- production availabilityとschema-legal positive／zero／absenceをshared inventory／small fixtureで分担し、
  individual servant correction、resolved alternate lookup、outcome collapseが0件である。
- shared auditのcandidate 6,360／deduplicated 3,949／damage request 1,924／distinct 1,298に未説明差分がなく、
  application compile medianが5,358 msから10%または5秒以上悪化しない。
- flow closure: `docs/evidence/resolved-attacker-level-stat-flow-tsk-06-46.md`がBlocking 0。

Implementation and verification order:

1. application-owned exact level-stat joinとtyped invalidを`scenario.ts`のdamage input構築前へ置き、
   public result shapeを変える場合だけschema／engine versionとexhaustive readerを一度で切り替える。
2. ranking aggregation／cache、portable execute／recover／reset／upgrade、production auditを同じoutcomeへ収束させる。
3. calculator draft／history、direct ranking handoff、Home summaryのwrite／numeric fallbackを閉じる。
4. `pnpm test:diagnostic -- scenario`、`rankingProfileOutcome`、`portableCalculation`、
   `"HomeRoute|rankingHandoff"`、`productionAudit`の順で診断し、unit、productionへ拡張する。
5. production auditを同一環境で3回測定し、legacy scanとflow noteを更新後、`pnpm quality`だけでphaseを閉じる。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `CALC-PORTABLE-001` | Apply | portable execute／recover／reset／upgrade／no-write focused tests | `docs/evidence/resolved-attacker-level-stat-flow-tsk-06-46.md` |
| `RK-EXEC-001` | Apply | exact-key positive／zero／absence／override and pre-execution invalid tests | `docs/evidence/resolved-attacker-level-stat-flow-tsk-06-46.md` |
| `RK-POLICY-001` | Apply | shared preparation／ranking invalid aggregation／calculator parity tests | `docs/evidence/resolved-attacker-level-stat-flow-tsk-06-46.md` |
| `RK-HANDOFF-001` | Apply | direct handoff no-write plus portable retained-state tests | `docs/evidence/resolved-attacker-level-stat-flow-tsk-06-46.md` |
| `RK-AUDIT-001` | Apply | shared production natural／Lv.90／referenced-level availability inventory | `docs/evidence/resolved-attacker-level-stat-flow-tsk-06-46.md` |
| `RK-PERF-001` | Apply | `pnpm test:diagnostic -- productionAudit`を同一環境で3回 | `docs/evidence/resolved-attacker-level-stat-flow-tsk-06-46.md` |
| `UI-CALC-001` | Apply | calculator invalid recovery／Home no-zero focused tests | `docs/evidence/resolved-attacker-level-stat-flow-tsk-06-46.md` |
| `TS-PERF-002` | Apply | shared auditのbefore／after 3-run medianとexact counter比較 | `docs/evidence/resolved-attacker-level-stat-flow-tsk-06-46.md` |
| `DOC-CLOSE-001` | Apply | `pnpm test:docs` | canonical flow note／Handoff |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |

Handoff:

- Step 1 baseline: `907f2514f0f1c06d30d9d39419ba843a35ca043e`、`main`。TSK-06.41はDone gate、
  Contract matrix、Handoff、final qualityが完了しており、TSK-06.46の依存条件を満たす。
- Step 1 scope: production／test code変更0。正本は
  `docs/evidence/resolved-attacker-level-stat-flow-tsk-06-46.md`。user-visible outcome、owner、
  full producer／reader／writer／recovery inventory、state-by-path counterexample、実装単位、検証順を確定し、
  planning Blocking 0。product requirement改訂と追加ADRは不要。
- Confirmed delta: shared expressionの`?? 0`に加え、resolved overrideが欠落pairをmaskする順序と、
  `HomeRoute`が非数値outcomeをnumeric 0へ変換するreaderを同じrecurrence scopeへ追加した。
  別semantic familyの新規problemは確認していない。
- Production／performance baseline: master `20260902.02`は469 servants／422 attack servants、
  natural／Lv.90 missing 0、Lv.120まで421、MashだけLv.90まで。shared audit 3回のapplication compileは
  5,358／5,491／5,081 ms（median 5,358 ms）、bounded command median 9.99 s。candidate 6,360、
  deduplicated 3,949、damage request 1,924、distinct 1,298。
- Step 2 entry condition: このplanning commitを含むHEAD、TSK-06.46 `ready`、planning Blocking 0、
  TSK-06.41 `done`を再確認し、開始commitでTSK-06.46だけを`in_progress`へ変更する。production／test codeの
  新規差分があれば開始しない。
- Allowed worktree: 本Step開始時から存在する
  `docs/README.md`、`docs/evidence/README.md`、`docs/evidence/ranking-policy-candidate-flow-tsk-06.md`、
  `docs/evidence/servant-build-record-identity-flow-tsk-06-47.md`、および
  `docs/tasks/development-redesign-tasks.md`のTSK-06.47／06.42 planning hunksだけ。これらをrevert、
  stage、commitしない。
- Step 2 start: `e86e3ec013e139d88fbdbabebed4029fe0d94d68`、`main`でentry conditionを再確認し、
  TSK-06.46だけを`in_progress`へ変更した。production／test codeの開始前差分は0。
- Implementation: `e16e5b0`。application-only typed invalidによりschema／engine versionを変更せず、exact
  level-stat join、ranking cache前invalid aggregation、portable retained-state、handoff no-write、Home nullable
  presentationを一つのcanonical pathへ収束した。別semantic familyの新規problemは0。
- Inventory／performance: natural 422／422、Lv.90 422／422、実参照unique pair 422／422、missing 0。
  candidate 6,360／deduplicated 3,949／damage request 1,924／distinct 1,298は不変。application digest
  `57cb6fd87d3ddf019a56aea3674b42a6f444e44e294e2243275a5e8becb364a9`。3-run compile median
  5,209 msはStep 1比-2.8%。詳細artifactはcanonical flow noteに記録した。
- Verification: focused scenario 37、ranking outcome 4、portable 11、Home 1、handoff 1、unit 78 files／426、
  production 24 files／116がpass。combined Home／handoff filterはrunnerのliteral filter仕様により個別実行した。
  Final `pnpm quality`はunit 426、production 116、Playwright 25、skip／todo／retry／warning／
  unexpected-console 0でpass。artifact `.test-results/2026-09-05T06-10-14-911Z-15-1eec02`。
- Completion classification: canonical flow noteはimplemented path `Verified`、manual／downstream numeric family
  `N/A`、TSK-06.47／06.42／07 scope `Deferred`、Blocking 0。TSK-06.42はTSK-06.47待ちのため`blocked`を維持する。
- Next entry condition: TSK-06.47のStep 1 planning handoffを確定し、そのentry conditionとallowed worktreeを
  満たす独立sessionで開始する。

### TSK-06.47: Profile servant-record identity fail-closed

Depends on: TSK-06.41

- [x] `localProfileSchema`の`servantBuilds`／`servantTargets` record keyと各embedded `servantId`を一つのprofile
      identity invariantとして検証し、不一致をcurrent load、v32／v33／v34 migration、backup importでtransactionalにrejectする。
      key修正、embedded ID修正、alternate lookup、record削除によるrepairは行わない。
- [x] `profile-domain.updateServantBuild`／`updateServantTarget`を通常writerとして維持し、全patch後もkeyとembedded IDが
      一致することを固定する。契約変更に対するschema versionを一度だけ更新する。
- [x] calculator default／subject change、portable reset、ranking、profile UI、support pickerがvalidated profileだけを消費し、
      選択したmaster servantへ別identityのlevel／NP／Fou／skillsを適用できないことを確認する。
- [x] 一致するNP1〜5、NP0 retained build、不一致build／targetのcurrent load／migration／backup／calculator recoveryをsmall
      fixtureで固定する。NP0はrecordを保持した未所持であり、このTaskでownership semanticsを変更しない。

Done gate:

- schema-legalだったbuild／target keyとembedded-IDの不一致が全profile trust boundaryで同じinvalidとなり、保存データを自動変更しない。
- normal writer、load／migration／backup、calculator／portable recovery、ranking／profile readersに独立したrepair／fallbackが0件である。
- NP0 record保持と`isOwned === false`が一致し、TSK-06.42が同じcanonical ownership factを再利用できる。
- flow closure: `docs/evidence/servant-build-record-identity-flow-tsk-06-47.md`がBlocking 0。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-POLICY-001` | Apply | profile identity／ranking input focused tests | `docs/evidence/servant-build-record-identity-flow-tsk-06-47.md` |
| `RK-HANDOFF-001` | Apply | calculator default／portable reset retained-state tests | `docs/evidence/servant-build-record-identity-flow-tsk-06-47.md` |
| `RK-AUDIT-001` | Apply | writer／reader search plus schema-legal mismatch fixture | `docs/evidence/servant-build-record-identity-flow-tsk-06-47.md` |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |

Handoff:

- Step 1 baseline: `07b260147c8c27e1047043d081478ebdbc0fbcff`、`main`。TSK-06.41／06.46は`done`、
  PIR-001はreviewer承認後にcommit済み、TSK-06.42は本Task待ちのため`blocked`を維持する。
- Step 1 scope: production／test code変更0。正本
  `docs/evidence/servant-build-record-identity-flow-tsk-06-47.md`へoutcome、profile schema／persistence owner、
  producer／consumer／writer／migration inventory、counterexample、実装単位、検証順を確定し、planning Blocking 0。
  product requirement改訂と追加ADRは不要。
- Confirmed delta: current v34とlegacy v32／v33のbuild／target mapはrecord valueだけを検証し、keyとembedded
  `servantId`の矛盾を許す。通常profile-domain writerは一致を維持し、current load／migration output／backup
  importはcurrent schemaへ収束するため、v35への一度のbumpとv34 migration inputで一つのfail-closed invariantを
  適用する。consumer側のrepair／alternate lookupは追加しない。
- Step 2 entry condition: このplanning commitを含むHEAD、TSK-06.47 `ready`、planning Blocking 0、
  TSK-06.41／06.46 `done`、TSK-06.42 `blocked`を確認し、開始commitでTSK-06.47だけを`in_progress`へ変更する。
  production／test codeの開始前差分があれば開始しない。
- Allowed worktree: なし。別Taskのsource、test、fixture、snapshot、baseline、configuration差分を同じ実装境界へ
  入れない。以後のuser changeがあれば保持して新しい境界を明記する。
- Planned verification: schema／migration、profile-domain writer、repository load、calculator／portable recovery、
  ranking readerのfocused diagnosticからunit、productionへ拡張し、phase completionは`pnpm quality`だけで閉じる。
  詳細なstate-by-pathと完了分類はcanonical flow noteを参照する。
- Step 2 start: `e78fd1414f1ae2ca333e9d12087ba6f83dc056a9`、clean `main`で依存条件とplanning Blocking 0を
  再確認し、`17b26ce`でTSK-06.47だけを`in_progress`にした。
- Implementation: `911753c`。schema v35の一つのprofile identity refinementへcurrent load／replaceと
  v32／v33／v34 migration／backup importを収束した。v34 draft／historyは破棄せずcurrent result envelopeへ移行し、
  mismatchはkey／embedded IDの選択・修復・削除なしで同じinvalidとなる。通常writer、NP0 retained／unowned、
  calculator／portable／ranking／Web readerには第二validatorやalternate lookupを追加していない。
- Verification: focused 9 files／95 tests、unit 78 files／435 tests、production 24 files／117 testsがpass。
  production inventoryは422 attack servants／433 profiles／420 calculated／2 unsupported／393 ranking rows、candidate
  6,360／deduplicated 3,949／damage request 1,924／distinct 1,298で不変。schema version由来のaudit digestだけを
  `fa9148dc060b7585c22cbb1b933a8f731718167a0e5cd2053bbdadb7a655362a`へ更新した。最終`pnpm quality`は
  unit 435、production 117、Playwright 25、skip／todo／retry／warning／unexpected-console 0でpass。artifact
  `.test-results/2026-09-05T08-09-19-780Z-15-ce996e`。
- Completion: canonical flow noteは全runtime pathを`Verified`、`N/A`、またはTSK-06.42へ明示的に`Deferred`し、
  Blocking 0。TSK-06.47は`done`、両prerequisiteが完了したTSK-06.42を`ready`へ進める。

### TSK-06.42: Ranking population, level, and NP-level basis cutover

Depends on: TSK-06.46, TSK-06.47

- [ ] 旧`comparisonMode: standard | owned`を削除し、母集団`all | owned`、レベル基準
      `naturalLimit | uniformLevel90 | ownedLevel`、宝具レベル基準`specified(NP1〜5) | owned`を
      application所有の直交するcanonical selectionへ破壊的に切り替える。application command reducerだけを通常writerとし、
      six-field selection全体をvalid／request-level invalidへcompileする。
- [ ] `owned`母集団はprofile-domainのcanonical ownership fact（NP1〜5）だけでentryを絞り、自然上限／Lv.90統一／
      保有レベルと指定NP／保有宝具Lvをentryごとに独立解決する。NP0／record欠落はunownedで、保存record自体は変更しない。
      key／embedded identityの整合はTSK-06.47を消費し、ranking内へ第二のvalidatorを追加しない。
- [ ] downstreamのstatic semantics、NP capacity、candidate construction／selectionへresolved numeric NP levelを一度だけ渡し、
      basisやsaved buildを再読させない。levelもexact `atkByLevel`だけを使用し、TSK-06.46のfail-closed ownerへ収束させる。
- [ ] `ownedLevel`／owned NPはowned母集団だけで有効とする。NP0／missing buildはどのNP basisでもowned母集団へ列挙せず、
      fabricated exclusionを作らない。allとの不正組合せ、malformed worker payload、ATK欠落を標準値へfallbackしない。
- [ ] ranking scenarioの`attacker.source`をpopulationから導出せず`master`に固定し、Fou ATK+1,000、skill Lv10、OC1等の
      共通条件を維持する。ownedからコピーするのは選択したlevel／NP levelだけとし、detailに各provenanceを保持する。
- [ ] UI名称を`全サーヴァント | 保有サーヴァント`、`自然上限 | Lv.90統一 | 保有レベル`、
      `NP1〜NP5 | 保有宝具レベル`へ統一し、`参考サイト基準`、`標準比較`、`所持戦力`をcurrent contractへ残さない。
- [ ] `setPopulation(all)`を明示atomic commandとし、保持中の`ownedLevel`だけを`naturalLimit`、owned NPだけをspecified NP1へ
      置換する。URL／worker／portableから同じillegal productを受けた場合はnormalizeせずrequest-level invalidにする。
- [ ] URLを新keyへ一括切替し、全新key欠落だけをdefaultとする。unknown calculation value、旧`rMode`、partial／illegal productは
      typed invalidとしてworkerを起動せず、Webは明示reset commandだけを提示する。旧reader／serializerを残さない。
- [ ] worker request／responseへruntime validationとtyped invalid responseを追加し、summary／detail stale guardとcache keyを
      master／version／validated servant-build context＋canonical six-field selectionのidentityへ切り替える。context交換時は
      conditions／summary／detail cacheをatomicにclearする。cache value／lifetime／cardinalityは変更せずTSK-07へDeferredする。
- [ ] `RankingProfileInput`を実際に読むvalidated servant-build mapへ限定する。共通条件でnone固定の保存礼装／support templateを
      worker context、fingerprint、recalculation triggerへ含めず、保存値をranking semanticsへ混入させない。
- [ ] `RankingPolicyDetail`、portable ranking intent、portable fingerprintへsix-field selectionとresolved level／NP provenanceを
      含める。portable replayはpinned scenarioを実行し、mutable profileからowned値を再解決しない。
- [ ] schema／engine versionを一度だけ更新し、identity不変な旧calculator／manual snapshotだけを移行する。旧ranking draftは破棄、
      historyはhistorical-only、旧shareはrejectとし、不足するaxesを推測してexecutable requestへ変換しない。
- [ ] direct Web writer `rankingHandoff`を含むrow → detail → portable request → calculator immediate replayを各basis familyで固定する。
      notice／normal reset interaction、cache lifetime、responsive／a11yはTSK-07へDeferredする。
- [ ] low-rarity自然上限、自然上限Lv.90、Lv.90統一、低いowned level、specified／owned NP、NP0、no-build、empty owned population、
      profile mutation後のpinned replay、invalid URL／worker／portableをstate-by-path fixtureへ固定する。record identity反例は
      TSK-06.47のfixtureを参照し、重複させない。
- [ ] production 469 servants／422 attack servants／433 AttackProfilesについて自然上限／Lv.90 ATK可用性をshared inventoryで確認し、
      owned axesは一つのstable profile fixtureから合法product、NP0／no-build membership proof、invalid productを監査する。
      full maximumはTSK-06.5へDeferredする。

Implementation and verification order:

1. `rankingContracts`とfocused application moduleでraw six-field input、validated selection、atomic command、
   per-entry `ResolvedRankingBasis`を確定し、TSK-06.47のvalidated build／ownership contractだけを入力にする。
2. `rankingPolicy`／`rankingRows`でpopulationとlevel／NP provenanceを一度解決し、`rankingStaticSemantics`、
   `rankingComparisonPolicy`、candidate construction／selectionからglobal basis readを削除する。
3. detail、portable ranking intent、schema migration／draft／history／backup／share recoveryを同じidentityへ切り替える。
4. URL control／serializer、worker runtime validation、context／selection fingerprint、summary／detail cacheとstale guardを切り替え、
   最後に旧type、URL key、reader、fallbackを検索で0件にする。
5. `pnpm test:diagnostic -- rankingPolicy`、`pnpm test:diagnostic -- rankingState`、
   `pnpm test:diagnostic -- rankingWorkerRuntime`、`pnpm test:diagnostic -- portableCalculation`の順でfocused failureを診断し、
   `pnpm test:unit`、`pnpm test:production`へ拡張する。phase completionは`pnpm quality`だけで閉じる。

Done gate:

- 母集団、レベル基準、宝具レベル基準のsemantic ownerがapplicationに一つだけあり、Web／workerがbuild条件を推測しない。
- owned母集団でも自然上限／Lv.90統一と指定NPが選択でき、保有レベル／保有NPだけを個別に反映できる。
- profile-domainとrankingのowned判定がNP1〜5へ一本化され、NP0／missing buildはrecordを変更せず全owned basisで母集団外となる。
- 保存済みFou／skill Lvを反映しないことがscenario source、型、表示、fixtureで一致し、現在戦力という過大な表示をしない。
- URL／worker／cache key／portable fingerprintが6入力を含み、cache／stale guardがcontext変更とselection変更を区別する。
  旧`comparisonMode`／scalar global `npLevel`の
  reader／writer／fallback、generic invalid error、旧URL keyが0件である。
- saved craft essence／support templateの変更だけではranking workerを再初期化せず、固定none条件とruntime identityが一致する。
- illegal product／malformed worker input／ATK欠落が数値fallbackにならず、invalid URLはworkerを起動せず、explicit commandだけが合法stateへ遷移する。
- selected row、detail、portable request、calculatorが同じresolved level／NP scenarioを再実行し、profile変更後もpinned replayが変わらない。
- schema bump、profile／history migration、share rejectionが不足axisを推測せず、旧ranking runtimeとの互換pathが0件である。
- TSK-07へDeferredするcache lifecycle／notice／reset／responsive scopeが明記され、TSK-06.42に第二のownerを残さない。
- flow closure: `docs/evidence/ranking-policy-candidate-flow-tsk-06.md`のTSK-06.42 deltaがBlocking 0。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-POLICY-001` | Apply | command／resolver／per-entry NP consumer／invalid-state tests | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-UI-001` | Apply | controls／invalid URL／worker runtime six-input contract tests | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-HANDOFF-001` | Apply | selected row／portable immediate replay／pinned profile-mutation parity | `docs/evidence/portable-calculation-identity-flow-tsk-06-1.md` |
| `RK-CACHE-001` | Apply | six-field fingerprint／stale summary-detail identity; value／lifetime closure remains TSK-07 | `docs/evidence/ranking-web-worker-cutover-tsk-07.md` |
| `RK-AUDIT-001` | Apply | stable owned product fixture＋shared production natural／Lv.90 inventory | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |

Handoff: 未記録

### TSK-06.43: Canonical maximum stack quantity

Depends on: TSK-06.42

- [ ] stack可能なdamage増幅条件の回数、baseline、canonical maximum、quantity sourceをdata pipeline所有のtyped IRで
      表現する。servant ID、名称、effect label、raw trait keyによるapplication／Web分岐を禁止する。
- [ ] `条件効果: 通常のみ`はcanonical baseline countを使用し、`成立込み`は宣言済みmaximum countを有限quantity
      witnessへ含める。一般の`traitCount`／quantity conditionを一律`atLeast: 1`または最大値へ丸めない。
- [ ] maximum stackをskill再使用／turn経過の一般simulationとして扱わず、準備phase開始時のtyped stack-count
      assumptionとしてscenario evidenceへ保持する。上限欠落、矛盾、support範囲外はtyped invalid／unsupportedにする。
- [ ] maximum countもtarget／field／choice／他quantityと同じglobal constraint validationを通し、共存不能な
      局所最大の合算、exclusive branch同時適用、executor外のdamage補正を禁止する。
- [ ] production代表として平景清「復讐の怨念」4 stack、ワンジナ「精霊の怒り」10 stackをfixture／inventoryで確認する。
      代表名はtest evidenceに限定し、runtime semanticsはcanonical maximum countから導出する。
- [ ] count 0／1／maximum、`atLeast | atMost | equal`、上限欠落、複数stack family、baseline包含、
      calculator／ranking／portable replay parityをcounterexample matrixへ固定する。

Done gate:

- satisfied stack countのproducerはdata pipeline、scenario選択はapplication、評価はbattle executionに一意化される。
- 平景清4 stack／ワンジナ10 stackが個別補正なしでcanonical IRから計算され、detailに回数とassumption由来が表示される。
- 通常のみのbaseline count、成立込みのmaximum count、一般quantity conditionが混同されない。
- unsupported／invalid maximumがbaseline数値へfallbackせず、一つの合法scenarioに共存する寄与だけを計算する。
- candidate productとhot-path差分をquantity cardinalityで説明し、4,096上限の緩和やtruncateを行わない。
- flow closure: `docs/evidence/ranking-policy-candidate-flow-tsk-06.md`のTSK-06.43 deltaがBlocking 0。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-IR-001` | Apply | pipeline stack-quantity IR inventory／schema-legal fixtures | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-EXEC-001` | Apply | count boundary／constraint／fail-closed executor tests | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-POLICY-001` | Apply | baseline versus satisfied maximum tests | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-AUDIT-001` | Apply | production stack occurrence／maximum digest and representative damage | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-PERF-001` | Apply | candidate／damage-request delta and hot path ×3 | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |

Handoff: 未記録

### TSK-06.44: Contribution decision UI cleanup

Depends on: TSK-06.45

- [ ] rowはdistinct `presentationGroupId`によるlogical effect countを維持し、detailは同じgroup配下で各contributionの
      self／condition／areaView decisionとfinal applied outcomeを独立表示する。
- [ ] raw `contributionId`、内部enum、operation IDを利用者向け文言として表示せず、canonical presentation metadataと
      exhaustiveなtyped reason-to-label mappingから短い日本語label／説明を生成する。
- [ ] policy除外、条件不成立、確率失敗、実行不能、invalid、unsupportedを一つの「計算外」へ潰さず、
      action／state／condition evidenceをfilterせず保持する。
- [ ] stack count assumptionを成立条件へ回数付きで表示し、同一logical effectの内部contribution分割を重複計数しない。
- [ ] detail開閉、寄与表示切替、一覧filterでdamageを再計算せず、desktop／390px／320pxの密度、overflow、keyboard、
      accessible name、expanded state、focus orderを維持する。

Done gate:

- row count、badge、detail decision、damageが同じeffective contribution集合から導出される。
- raw identity／内部enum露出0件で、各policy axisとfinal outcomeを失わない。
- logical effectとinternal contributionの階層が明確で、NP base sentinelをeffect件数へ含めない。
- component／E2Eでcollapsed／expanded、除外／適用混在、stack count、responsive／a11yを固定する。
- flow closure: `docs/evidence/ranking-policy-candidate-flow-tsk-06.md`のTSK-06.44 deltaがBlocking 0。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-UI-001` | Apply | focused row／detail／badge component tests and Playwright | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-POLICY-001` | Apply | contribution decision／final outcome presentation parity | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-CACHE-001` | N/A: detail interactionは既存request-on-demand contractを消費し、cache lifetime変更はTSK-07 | - | TSK-07 |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |

Handoff: 未記録

### TSK-06.45: All attack-NP execution closure

Depends on: TSK-06.43

- [ ] current baselineをAttackProfile 433件中393 calculated／40 `unsupportedActionAdmission`、default calculator
      422 scenarios中420 calculated／2 unsupportedとして固定し、40件がすべて攻撃宝具であることと、非攻撃宝具47騎を
      混在させていないことをshared production inventoryで再確認する。
- [ ] action admissionを`triggerScope × damageRelevant × timing × recipient/resource reader`で監査し、command-card attack限定や
      damage非関連のoperationをattack-NP profile全体のunsupportedへ昇格させない。現在の40 profilesのうち、この誤分類に
      属する25 profilesをservant ID／名称分岐なしでcanonical relevance判定へ収束させる。
- [ ] 残る15 profilesのdependent amount family（target NP合計、target別NP、個別NP合計、target別HP、個別NP buff合計、
      NP倍率）をclosed typed expression／resource readへ分類し、ordered executionとrollbackで評価する。完全なturn進行、AI、
      敵行動を導入せず、宝具直前の有限phaseに必要なstateだけを追加する。
- [ ] default calculatorで残るHP-dependent 1 scenarioとbattle-point-dependent 1 scenarioについて、選択levelに対応するHP basis、
      current／maximum HP、battle pointのcurrent value／phase thresholdをdata pipelineがcanonical stateとして供給し、
      application commandが必要inputを構築し、executorが唯一のreaderになるようforward／recovery flowを閉じる。
- [ ] 全playable attack-NP variantがdamage functionへjoinし、calculatorとrankingが同じapplication compiler／ordered executorを
      通ることを確認する。欠落値、矛盾値、将来の未知operationはtyped `unsupported`でfail-closedにし、現行productionの
      数値fallbackや理由付き順位外として残さない。

Done gate:

- current published masterの全playable AttackProfileがdefault rankingで`calculated`となり、433 rows／0 exclusionsである。
- default calculatorは422／422 `calculated`で、unsupported／invalid／inputRequired 0件である。
- 自然上限／Lv.90統一 × 四policy × NP1〜5とstable owned fixturesで、現行masterのunsupported／invalid／inputRequired 0件。
  `unavailableUnderPolicy`はtyped reachability proofがある場合だけ許容し、production occurrenceを全数説明する。
- trigger relevanceとdependent resourceのschema-legal focused fixturesが、誤分類、mutation順序、rollback、欠落inputの
  fail-closedを反証する。
- servant ID、名称、label、raw Atlas keyによるruntime branch 0件。calculator／ranking damage・outcome・evidence parity差分0件。
- production suite／ranking hot pathの変更前後を測定し、未説明の10%超退行、candidate explosion、cap／timeout緩和が0件。
- flow closure: `docs/evidence/ranking-policy-candidate-flow-tsk-06.md`のTSK-06.45 deltaがBlocking 0。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-IR-001` | Apply | playable attack variant／trigger relevance／dependent resource production inventory | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-EXEC-001` | Apply | ordered HP／NP／battle-point mutation、rollback、reachability focused tests | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-POLICY-001` | Apply | relevance-aware action admission and four-policy parity | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-AUDIT-001` | Apply | `pnpm test:production` 433／433 ranking、422／422 calculator、production nonnumeric outcome 0 | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-PERF-001` | Apply | affected production suite／ranking hot path before-after | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `DOC-REV-001` | Apply | `pnpm test:docs` | approved ranking requirement v0.10.1 |

Handoff: 未記録

### TSK-06.5: Ranking theoretical maximum and production closure

Depends on: TSK-06.44

- [ ] requirement v0.10.1までにcutoverしたcanonical comparison／contribution／action admission／outcome／portable runtimeを変更せず、
      production全skillのstatic semanticsと、action × initial resource × ordered path × AttackProfileの
      candidate-local eligibility inventoryを最終固定する。
- [ ] 自己バフありでは選択policy上の実効寄与を持つ任意skillをadmitし、表現済みデメリットを全operation込みで実行する。
      通常のみ／成立込みの各合法initial stateで完遂不能なcandidateだけを落とし、compatibleな特攻／条件効果／field／costを
      一つの合法scenarioで最大化することを全数監査する。
- [ ] 排他的player choiceが一branchだけを選び、cost、後続state、attack NP到達可能性込みの最終平均damage最大branchと
      small exhaustive oracleで一致することをproduction inventoryへ固定する。
- [ ] conditional-only skill、unconditional＋conditional sibling、NP消費／増加、beneficial／detrimental state、trait grant、
      form transition、branchごとにcostが異なるplayer choice、action後にattack NPへ到達不能となるpathのfocused fixtureを
      production occurrence／0件ratchetへ接続する。
- [ ] candidate soundness、small exhaustive finite maximum oracle、自然上限／Lv.90統一 × 四policy × NP1〜5、
      stable owned fixture、production contamination／omission、portable／calculator parity、candidate数／performanceを
      最終baselineとして再固定する。
- [ ] 旧operation-ID projection、旧portable reader、compatibility flag、parallel compiler、旧policy fallbackがproduction／
      test fixture／schemaから0件であることを確認し、発見時はadapterを追加せずTSK-06.41のcanonical ownerへ戻して削除する。

Done gate:

- TSK-06.41のruntime semanticsを再実装せず、production inventoryとoracleが同じapplication compiler／ordered
  executorを観測する。
- action semanticsとconditional costがraw key、effect label、modifier符号、servant IDではなくcanonical typed IRで定義される。
- skill全体と個別contributionの境界、sibling operationのtransactionality、resource preconditionが一意である。
- self-buff action eligibilityとconditional contribution projectionが直交し、同じ意味を二つのownerが再判定しない。
- production全skillのstatic semanticsを分類し、candidate-local inventoryはaction × policy × initial resource ×
  ordered path × AttackProfileでadmitted／policyNoOp／unreachable／unsupportedを集約して差分を説明できる。
- 通常のみのconditional-only action、両condition modeの成立可能なadverse action欠落、排他的branch同時適用がすべて0件である。
- compatibleな特攻／条件効果／fieldの欠落と、共存不能な局所最大の合算がともに0件である。
- calculator／ranking parityとTSK-06.41のoperation／state preservation invariantを維持する。
- TSK-06.41 cutover後のcandidate soundness、finite maximum oracle、四policy production inventoryが最終値として閉じる。
- TSK-06.42の母集団／レベル／宝具Lv、TSK-06.43のmaximum stack、TSK-06.44のpresentationを含む最終matrixが閉じる。
- TSK-06.45で現行masterの全playable攻撃宝具が計算可能となり、unsupported／invalid／inputRequired順位外0件を維持する。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-IR-001` | Apply | canonical source-program／step-operation／candidate-local role production inventory; nested IR is consumed unchanged | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-EXEC-001` | Apply | production transaction／resource reachability ratchet＋focused regression | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-POLICY-001` | Apply | four-policy contamination／omission and theoretical-maximum oracle | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-AUDIT-001` | Apply | `pnpm test:production` final level basis × four-policy × NP1〜5 maximum／eligibility／damage delta inventory | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-HANDOFF-001` | Apply | final selected scenarioのportable replay／minimal Web handoff regression | `docs/evidence/portable-calculation-identity-flow-tsk-06-1.md` |
| `RK-PERF-001` | Apply | ranking hot pathを変更前後各3回 | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `DOC-REV-001` | Apply | `pnpm test:docs` | approved ranking requirement v0.10.1 |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |

Handoff: 未記録

### TSK-07: Web／worker一括切替

Depends on: TSK-06.5

- [x] requirement v0.9.6時点のランキング条件を5項目へ切り替える（historical cutover）。
- [x] worker protocol、URL、cache key、detail evidenceを同じcontractへ切り替える。
- [x] 旧special attack／field入力、reader、fallbackを削除する。
- [x] Webをcanonical presentation modelの描画とcommand dispatchへ限定する。
- [ ] requirement v0.10.0の6入力はTSK-06.42で破壊的に切り替え、その完了状態を前提にnotice、cache lifetime、
      stale response rejection、responsive／a11yを再検証する。旧5-field fingerprintを互換pathとして残さない。
- [ ] TSK-06.41でVerifiedとなったselected ranking → calculator immediate handoffを前提に、二軸noticeと
      result／effect parityのUI表示を再検証する。
- [ ] calculatorの「通常の計算条件へ戻す」が開始NP、自己バフpolicy、条件効果policyを同時に通常値へ戻し、
      target／field facts、conditional inputs、stochastic outcome、ordered actions／choice、candidate evidenceも
      application baseline constructorのfield-by-field dispositionどおり除去し、hidden ranking stateを残さないことを
      再検証する。
- [ ] 二軸intentを含むfingerprintでsummary／detail cacheとstale response rejectionを閉じ、worker detail 0件、
      React active detail最大1件を実装・検証する。
- [ ] Webの順位外表示を5 outcome classへ切り替え、`inputRequired`、`unsupported`、`invalid`、
      `unavailableUnderPolicy`を別文言で表示する。`inputRequired`だけは同じAttackProfileのnormal calculatorを開き、
      `invalid`は原因別reset／reload、`unsupported`は非回復として扱い、いずれも数値rowを生成しない。

Done gate:

- 新旧policy、URL、worker protocolをruntimeで併存させていない。
- selected candidateの二軸版付きWeb handoff／immediate parityをcurrent schemaで回帰させず、noticeが両軸を表示する。
- ranking由来noticeが両policy軸を表示し、通常条件resetがbaseline scenario、開始NP、origin、両軸、result、
  fingerprintをatomicに置換する。
- true normal reset後にranking由来world facts／inputs／stochastic／actions／choiceがscenarioへ残らず、result／
  fingerprint／cacheが新baseline identityへ切り替わる。
- `inputRequired`／`unsupported`／`invalid`／`unavailableUnderPolicy`が別表示され、numeric fallback rowが0件である。
- worker summaryはevidence-free、worker detail cacheは0、React detailは最大1件である。
- desktop、390px、320pxでoverflowがない。
- keyboard、accessible name、expanded state、focus orderを維持する。
- stale responseが表示へ反映されない。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-UI-001` | Apply | focused component test、`pnpm test:e2e` | `docs/evidence/ranking-web-worker-cutover-tsk-07.md` |
| `RK-HANDOFF-001` | Apply | TSK-06.41 minimal handoff regression＋two-axis notice／interaction E2E | `docs/evidence/ranking-web-worker-cutover-tsk-07.md` |
| `RK-CACHE-001` | Apply | worker／React cache cardinality、stale detail tests | `docs/evidence/ranking-web-worker-cutover-tsk-07.md` |
| `UI-CALC-001` | Apply | context notice／two-axis normal reset／focus E2E | `docs/evidence/ranking-web-worker-cutover-tsk-07.md` |
| `RK-AUDIT-001` | Apply | worker／calculator／ranking parity check | `docs/evidence/ranking-web-worker-cutover-tsk-07.md` |
| `TS-PERF-002` | Apply | build変更前後各3回／変更後E2E 1回 | `docs/evidence/ranking-web-worker-cutover-tsk-07.md` |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |
| `TS-ART-001` | Apply | Playwright manifest／artifact check | `docs/evidence/ranking-web-worker-cutover-tsk-07.md` |

Handoff:

- Start baseline: `b325ef55a2b8ed094eee1f69464615e058d3018b`、clean worktree
- Canonical flow note: `docs/evidence/ranking-web-worker-cutover-tsk-07.md`。Requirement v0.9.6時点でTSK-06から
  DeferredされたUI／worker／URL／detail evidenceを一つの5項目contractへ切り替え、
  producer、reader、writer、request ordering、stale rejection、cache、recoveryをBlocking 0で閉じた。
- Ownership: application ranking policyがscenario selectionとtyped exclusion、worker runtimeが
  fingerprint／complete-result cache、Webがpresentation／command dispatchを所有する。filter、sort、
  display metricはworker requestに含まず、damage semanticsは変更していない。
- Cutover: old special attack／fieldの入力、URL reader、worker protocol、fallback、legacy facade／
  candidate／matrix／scenario runtimeを削除した。old `rSpecial`／`rField`は解釈せずserialize時に除去し、
  compatibility flag／dual runtimeはない。
- Correctness: worker生成detailをcalculatorで再実行してresult／effect parityを固定し、default
  productionは433 rows／0 exclusions、satisfiedは424 rows／9 typed exclusions。request IDとcanonical
  fingerprintの両方でstale summary／detailを表示前に拒否する。
- UI/artifact: 5 controlのaccessible name、keyboard focus order、expanded state、およびdesktop／390px／
  320pxのcollapsed／expanded overflowをcomponent／E2Eと7枚のreview済みsnapshotで固定した。
- Performance: build中央値2.08秒から1.87秒（-10.1%）。変更後full E2E性能計測は指示どおり1回、
  64 passed／32 skipped、693.31秒。詳細とbaseline比較はcanonical flow noteに記録した。
- Verification: focused 8 files／14 tests、unit 62 files／350 tests、production 24 files／111 tests、
  runner 17 tests、final `pnpm quality`成功。production source scanで旧reader／fallback／runtime path 0件。
- Historical completion: five-field cutover commit and verification remain valid for their original scope。
- Structural review reopening: portable identityとWeb handoff／noticeはTSK-06.1でBlocking 0へ閉じた。TSK-07の未完了scopeは`RK-CACHE-001`のevidence-free cache value／lifetime／cardinalityとstale detail rejectionだけである。TSK-06.2はBlocking 0で完了し、execution observabilityを閉じるTSK-06.3の完了後にTSK-07を再開する。
- TSK-06.4／06.41 planning delta: TSK-06.1の一軸portable evidenceはhistorical verificationとして保持する。
  二軸schemaのdirect Web writerとminimal handoff parityはTSK-06.41、notice／reset interaction／cache／UI品質は
  TSK-07が所有し、schema cutover後のproduction writerを未検証のまま後段へ渡さない。
- Requirement v0.10.0 planning delta: 母集団／レベル／宝具Lvの6-input cutoverはTSK-06.42、maximum stack
  semanticsはTSK-06.43、contribution decision表示はTSK-06.44が所有する。TSK-07はこれらを再実装せず、
  notice／recovery interaction／bounded cache／responsive／a11yの最終closureだけを所有する。

### TSK-08: Production audit最終収束とfailure diagnostics

Depends on: TSK-07

- [ ] TSK-06.5が生成した唯一の全AttackProfile × NP1〜5 × 四policy inventory／digestを、data-pipelineと
      calculation-applicationの共有audit modelへ接続する。別generatorや並行digest正本を作らない。
- [ ] parity、unsupported、invalid、partial commit、inert control、stale mutationをratchet化する。
- [ ] TSK-06.3の共通manifest／artifact ownerを再実装せず、domain typed reason、canonical identity、
      first canonical diffをbounded summaryと完全artifactへ登録する。
- [ ] 旧loader、scan、candidate list、重複fixtureを削除する。

Done gate:

- 全damage差分をcanonical input、witness、ordered plan、governing ruleで説明できる。
- digest mismatchから最初のcanonical差分へ到達できる。
- 大量失敗でも出力上限を守り、完全結果を失わない。
- production inventory、calculator/ranking parity、fail-closed gateが通る。
- semantic inventoryのproducerはTSK-06.5から一つだけで、TSK-08はmanifest／first-diff／bounded diagnosticsを
  追加してもcandidateやdamage semanticsを再計算しない。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `TS-AUDIT-001` | Apply | `pnpm test:production` | `docs/evidence/<tsk-08-report>.md` |
| `TS-OUT-001` | Apply | intentional failure fixture／`pnpm test:runner` | `docs/evidence/<tsk-08-report>.md` |
| `TS-ART-001` | Apply | manifest／complete artifact check | `docs/evidence/<tsk-08-report>.md` |
| `RK-AUDIT-001` | Apply | full policy matrix／parity／fail-closed check | `docs/evidence/<tsk-08-report>.md` |
| `RK-PERF-001` | Apply | production rankingを変更前後各3回 | `docs/evidence/<tsk-08-report>.md` |
| `TS-PERF-002` | Apply | production gateを変更前後各3回 | `docs/evidence/<tsk-08-report>.md` |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |

Handoff: 未記録

### TSK-09.1: Documentation evidence／archive finalization

Depends on: TSK-08

- [ ] `docs/tasks/documentation-maintenance-phases.md`のDOC-P4としてevidenceとphase reportを収束させる。
- [ ] DOC-P5としてsuperseded文書、complete plan、ignored local資料、`.gitignore`を整理する。
- [ ] DOC-P6としてtracked reference、registry、frontmatter、ADR、Tasksの静的checkを追加する。

Done gate:

- intentional damage差分、canonical input、semantic rule、inventory、digestを失っていない。
- tracked report集合とtracking policyが一致する。
- superseded／complete／historical文書をcurrent contractと誤認しない。
- docs integrity checkがcanonical quality pathで成功する。
- ignored local資料のmaterialな物理削除は、別の明示承認なしに行っていない。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `DOC-REV-001` | Apply | `pnpm test:docs` | `docs/evidence/<tsk-09-1-report>.md` |
| `DOC-CLOSE-001` | Apply | `pnpm test:docs` | `docs/evidence/<tsk-09-1-report>.md` |
| `DOC-LINT-001` | Apply | `pnpm test:docs` | `docs/evidence/<tsk-09-1-report>.md` |
| `DX-ART-001` | Apply | evidence／archive inventory check | `docs/evidence/<tsk-09-1-report>.md` |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |
| `TS-FINAL-001` | Deferred: TSK-09 | - | TSK-09 |
| `RK-FINAL-001` | Deferred: TSK-09 | - | TSK-09 |

Handoff: 未記録

### TSK-09: Performance、運用移行、旧経路削除

Depends on: TSK-09.1

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

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `TS-FINAL-001` | Apply | `pnpm quality`、final performance comparison | `docs/evidence/<tsk-09-report>.md` |
| `RK-FINAL-001` | Apply | full production／UI acceptance matrix | `docs/evidence/<tsk-09-report>.md` |
| `DX-FINAL-001` | Apply | canonical handoff restart check | `docs/evidence/<tsk-09-report>.md` |
| `TS-PERF-002` | Apply | canonical gateを変更前後各3回 | `docs/evidence/<tsk-09-report>.md` |
| `RK-PERF-001` | Apply | ranking hot pathを変更前後各3回 | `docs/evidence/<tsk-09-report>.md` |
| `DOC-LINT-001` | Apply | `pnpm test:docs` | `docs/evidence/<tsk-09-report>.md` |

Handoff: 未記録

## 4. 更新規則

- taskを開始するcommitで対象を`in_progress`へ変更する。
- 同時に複数taskを`in_progress`へしない。
- Done gateを満たす前に`done`へ変更しない。
- blocking conditionは対象taskのHandoffへ記録し、要件を推測で緩和しない。
- task分割が必要な場合は`TSK-xx.y`を追加し、元taskのDone gateを変更しない。
- 実装順変更は依存関係と理由を本書へ反映し、各要件書へ順序説明を複製しない。
- 要件改訂は[document governance contract](../guides/document-governance.md)の`DOC-REV-001`に従い、影響Taskのclosure matrixを同じ変更で更新する。
- phase完了は当該TaskのmatrixとDone gateのclosureであり、project全体の最終条件を暗黙に満たしたことにしない。

### 4.1 Task実行手順

1. Task indexから`ready`なTaskを一件選び、依存TaskのDone gateとHandoff、Contract closure matrixを確認する。
2. 作業開始時のHEAD、作業ツリー、対象family、利用者成果、domain invariant、semantic ownerを確認する。
3. 開始commitで対象Taskを`in_progress`へ変更し、Handoffの`Next command`に最初のbounded commandを記録する。
4. production familyをread-onlyで監査し、変更前baselineとfail-closed条件を固定する。
5. 一つの責務単位で実装し、関係する小さいsemantic testから検証する。
6. production inventory、calculator/ranking parity、UI、performanceをTaskのriskに応じて検証する。
7. 対象fileだけをstageし、staged diff、file list、format、必要なtest結果を確認してcommitする。
8. Done gateを満たすまで手順4〜7を繰り返す。新しい例外familyを発見した場合は局所分岐を追加せず、modelまたはTask分割を再検討する。
9. Handoffへ実装commit、canonical evidence、検証commandと結果、残課題、次のentry conditionを記録する。
10. completion commitで対象Taskを`done`、直接の後続Taskを`ready`へ変更する。

### 4.2 中断・再開手順

- authority競合、damage根拠不足、部分適用可能な意味論、想定外のruntime増加を検出したら変更を拡張せず停止する。
- Handoffへblocking condition、確認済み事実、未確定事項、影響path、安全な再開commandを記録する。
- 次のsessionは会話履歴ではなく、Task、Handoff、記録済みcommit、canonical evidenceから再開する。
- 一時的なraw logや巨大なtool outputをHandoffへ貼らず、必要なpath、digest、要約だけを残す。
