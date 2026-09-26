---
title: "FGO Lab テスト・ランキング再設計 Tasks"
document_version: "1.7.76"
status: "Active"
created_at: "2026-08-30"
updated_at: "2026-09-27"
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
| TSK-06.411 | Resolved attacker level-stat fail-closed | done | TSK-06.41 | resolved scenario／master ATK join／recovery |
| TSK-06.412 | Profile servant-record identity fail-closed | done | TSK-06.41 | profile map identity／persistence／shared consumers |
| TSK-06.42 | Ranking population, level, and NP-level basis cutover | done | TSK-06.411, TSK-06.412 | comparison scenario／owned data／URL・worker identity |
| TSK-06.43 | Canonical maximum stack quantity | done | TSK-06.42 | satisfied quantity witness／stack maximum semantics |
| TSK-06.44 | Initial OC selection and canonical OC boost closure | done | TSK-06.43 | initial OC／own OC boost／shared execution／UI handoff |
| TSK-06.45 | All attack-NP execution closure | done | TSK-06.44 | 433/433、422/422、80条件34,640 outcomes、stable owned、U0〜U5 closure |
| TSK-06.46 | Ranking world candidate architecture and oracle hardening | done | TSK-06.45 | world責務分割／transition-aware同値性／独立oracle／implementation convergence |
| TSK-06.47 | Contribution decision UI cleanup | done | TSK-06.46 | logical effect presentation／per-contribution decisions |
| TSK-06.48 | Package semantic complexity convergence | done | TSK-06.46 | package別semantic owner／population・dependent resource／HP・effect/execution family convergence |
| TSK-06.5 | Ranking theoretical maximum and production closure | done | TSK-06.47 | final candidate／maximum／legacy-removal proof |
| TSK-07 | Web／worker一括切替 | done | TSK-06.5 | ranking UI／handoff／cache |
| TSK-08 | Production audit最終収束とfailure diagnostics | in_progress | TSK-07 | test strategy T3/T4／ranking test gate |
| TSK-09.1 | Documentation evidence／archive finalization | blocked | TSK-08 | documentation maintenance DOC-P4〜P6 |
| TSK-09 | Performance、運用移行、旧経路削除 | blocked | TSK-09.1 | test strategy T5／全完了条件 |

```text
TSK-00.1 -> TSK-00.2 -> TSK-00.3 -> TSK-00.4 -> TSK-00 -> TSK-01 -> TSK-02 -> TSK-02.1 -> TSK-03 -> TSK-04 -> TSK-05 -> TSK-06 -> TSK-06.1 -> TSK-06.2 -> TSK-06.3 -> TSK-06.4 -> TSK-06.41
TSK-06.41 -> TSK-06.411
TSK-06.41 -> TSK-06.412
TSK-06.411 + TSK-06.412 -> TSK-06.42 -> TSK-06.43 -> TSK-06.44 -> TSK-06.45 -> TSK-06.46 -> TSK-06.47 -> TSK-06.5 -> TSK-07 -> TSK-08 -> TSK-09.1 -> TSK-09
TSK-06.46 -> TSK-06.48（TSK-06.47／TSK-06.5とは独立したpackage convergence follow-up）
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
- calculator intentはranking policyを流用せず、保持したscenarioで成立した寄与を通常評価する。
  resetは同じscenario／version contextを保持したまま、execution intentだけを`calculator + initialNpGauge 10000 + standard`へ
  置換し、request、result、fingerprint、durable draftを一transactionで公開する。target／field facts、canonical inputs、
  stochastic facts、ordered actions／choice、effect decisionsは削除せず、ranking policy／intentをhidden stateとして残さない。
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
  TSK-06.5 was `ready`; requirement v0.10.0 inserted TSK-06.42〜06.47. TSK-06.42 Step 1 subsequently found
  the shared resolved-level ATK fallback and servant-build record identity gap, and inserted TSK-06.411／06.412 as
  independent `ready` prerequisites.

### TSK-06.411: Resolved attacker level-stat fail-closed

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
  Contract matrix、Handoff、final qualityが完了しており、TSK-06.411の依存条件を満たす。
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
- Step 2 entry condition: このplanning commitを含むHEAD、TSK-06.411 `ready`、planning Blocking 0、
  TSK-06.41 `done`を再確認し、開始commitでTSK-06.411だけを`in_progress`へ変更する。production／test codeの
  新規差分があれば開始しない。
- Allowed worktree: 本Step開始時から存在する
  `docs/README.md`、`docs/evidence/README.md`、`docs/evidence/ranking-policy-candidate-flow-tsk-06.md`、
  `docs/evidence/servant-build-record-identity-flow-tsk-06-47.md`、および
  `docs/tasks/development-redesign-tasks.md`のTSK-06.412／06.42 planning hunksだけ。これらをrevert、
  stage、commitしない。
- Step 2 start: `e86e3ec013e139d88fbdbabebed4029fe0d94d68`、`main`でentry conditionを再確認し、
  TSK-06.411だけを`in_progress`へ変更した。production／test codeの開始前差分は0。
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
  `N/A`、TSK-06.412／06.42／07 scope `Deferred`、Blocking 0。TSK-06.42はTSK-06.412待ちのため`blocked`を維持する。
- Next entry condition: TSK-06.412のStep 1 planning handoffを確定し、そのentry conditionとallowed worktreeを
  満たす独立sessionで開始する。

### TSK-06.412: Profile servant-record identity fail-closed

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

- Step 1 baseline: `07b260147c8c27e1047043d081478ebdbc0fbcff`、`main`。TSK-06.41／06.411は`done`、
  PIR-001はreviewer承認後にcommit済み、TSK-06.42は本Task待ちのため`blocked`を維持する。
- Step 1 scope: production／test code変更0。正本
  `docs/evidence/servant-build-record-identity-flow-tsk-06-47.md`へoutcome、profile schema／persistence owner、
  producer／consumer／writer／migration inventory、counterexample、実装単位、検証順を確定し、planning Blocking 0。
  product requirement改訂と追加ADRは不要。
- Confirmed delta: current v34とlegacy v32／v33のbuild／target mapはrecord valueだけを検証し、keyとembedded
  `servantId`の矛盾を許す。通常profile-domain writerは一致を維持し、current load／migration output／backup
  importはcurrent schemaへ収束するため、v35への一度のbumpとv34 migration inputで一つのfail-closed invariantを
  適用する。consumer側のrepair／alternate lookupは追加しない。
- Step 2 entry condition: このplanning commitを含むHEAD、TSK-06.412 `ready`、planning Blocking 0、
  TSK-06.41／06.411 `done`、TSK-06.42 `blocked`を確認し、開始commitでTSK-06.412だけを`in_progress`へ変更する。
  production／test codeの開始前差分があれば開始しない。
- Allowed worktree: なし。別Taskのsource、test、fixture、snapshot、baseline、configuration差分を同じ実装境界へ
  入れない。以後のuser changeがあれば保持して新しい境界を明記する。
- Planned verification: schema／migration、profile-domain writer、repository load、calculator／portable recovery、
  ranking readerのfocused diagnosticからunit、productionへ拡張し、phase completionは`pnpm quality`だけで閉じる。
  詳細なstate-by-pathと完了分類はcanonical flow noteを参照する。
- Step 2 start: `e78fd1414f1ae2ca333e9d12087ba6f83dc056a9`、clean `main`で依存条件とplanning Blocking 0を
  再確認し、`17b26ce`でTSK-06.412だけを`in_progress`にした。
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
  Blocking 0。TSK-06.412は`done`、両prerequisiteが完了したTSK-06.42を`ready`へ進める。

### TSK-06.42: Ranking population, level, and NP-level basis cutover

Depends on: TSK-06.411, TSK-06.412

- [x] 旧`comparisonMode: standard | owned`を削除し、母集団`all | owned`、レベル基準
      `naturalLimit | uniformLevel90 | ownedLevel`、宝具レベル基準`specified(NP1〜5) | owned`を
      application所有の直交するcanonical selectionへ破壊的に切り替える。application command reducerだけを通常writerとし、
      six-field selection全体をvalid／request-level invalidへcompileする。
- [x] `owned`母集団はprofile-domainのcanonical ownership fact（NP1〜5）だけでentryを絞り、自然上限／Lv.90統一／
      保有レベルと指定NP／保有宝具Lvをentryごとに独立解決する。NP0／record欠落はunownedで、保存record自体は変更しない。
      key／embedded identityの整合はTSK-06.412を消費し、ranking内へ第二のvalidatorを追加しない。
- [x] downstreamのstatic semantics、NP capacity、candidate construction／selectionへresolved numeric NP levelを一度だけ渡し、
      basisやsaved buildを再読させない。levelもexact `atkByLevel`だけを使用し、TSK-06.411のfail-closed ownerへ収束させる。
- [x] `ownedLevel`／owned NPはowned母集団だけで有効とする。NP0／missing buildはどのNP basisでもowned母集団へ列挙せず、
      fabricated exclusionを作らない。allとの不正組合せ、malformed worker payload、ATK欠落を標準値へfallbackしない。
- [x] ranking scenarioの`attacker.source`をpopulationから導出せず`master`に固定し、Fou ATK+1,000、skill Lv10、OC1等の
      共通条件を維持する。ownedからコピーするのは選択したlevel／NP levelだけとし、detailに各provenanceを保持する。
- [x] UI名称を`全サーヴァント | 保有サーヴァント`、`自然上限 | Lv.90統一 | 保有レベル`、
      `NP1〜NP5 | 保有宝具レベル`へ統一し、`参考サイト基準`、`標準比較`、`所持戦力`をcurrent contractへ残さない。
- [x] `setPopulation(all)`を明示atomic commandとし、保持中の`ownedLevel`だけを`naturalLimit`、owned NPだけをspecified NP1へ
      置換する。URL／worker／portableから同じillegal productを受けた場合はnormalizeせずrequest-level invalidにする。
- [x] URLを新keyへ一括切替し、全新key欠落だけをdefaultとする。unknown calculation value、旧`rMode`、partial／illegal productは
      typed invalidとしてworkerを起動せず、Webは明示reset commandだけを提示する。旧reader／serializerを残さない。
- [x] worker request／responseへruntime validationとtyped invalid responseを追加し、summary／detail stale guardとcache keyを
      master／version／validated servant-build context＋canonical six-field selectionのidentityへ切り替える。context交換時は
      conditions／summary／detail cacheをatomicにclearする。cache value／lifetime／cardinalityは変更せずTSK-07へDeferredする。
- [x] `RankingProfileInput`を実際に読むvalidated servant-build mapへ限定する。共通条件でnone固定の保存礼装／support templateを
      worker context、fingerprint、recalculation triggerへ含めず、保存値をranking semanticsへ混入させない。
- [x] `RankingPolicyDetail`、portable ranking intent、portable fingerprintへsix-field selectionとresolved level／NP provenanceを
      含める。portable replayはpinned scenarioを実行し、mutable profileからowned値を再解決しない。
- [x] schema／engine versionを一度だけ更新し、identity不変な旧calculator／manual snapshotだけを移行する。旧ranking draftは破棄、
      historyはhistorical-only、旧shareはrejectとし、不足するaxesを推測してexecutable requestへ変換しない。
- [x] direct Web writer `rankingHandoff`を含むrow → detail → portable request → calculator immediate replayを各basis familyで固定する。
      notice／normal reset interaction、cache lifetime、responsive／a11yはTSK-07へDeferredする。
- [x] low-rarity自然上限、自然上限Lv.90、Lv.90統一、低いowned level、specified／owned NP、NP0、no-build、empty owned population、
      profile mutation後のpinned replay、invalid URL／worker／portableをstate-by-path fixtureへ固定する。record identity反例は
      TSK-06.412のfixtureを参照し、重複させない。
- [x] production 469 servants／422 attack servants／433 AttackProfilesについて自然上限／Lv.90 ATK可用性をshared inventoryで確認し、
      owned axesは一つのstable profile fixtureから合法product、NP0／no-build membership proof、invalid productを監査する。
      full maximumはTSK-06.5へDeferredする。

Implementation and verification order (Step 1 revalidated at `255464b`):

詳細設計・state-by-path matrixの正本はcanonical flow noteの
「Revalidated Step 1 handoff at `255464b`」。下記はその実行単位であり、新しい計画文書は作らない。

| Unit | Depends on | Ownership / deliverable | Bounded verification before proceeding |
| --- | --- | --- | --- |
| 42-A | Step 2 entry | 変更前のshared production auditを3回計測後、schemaの共有selection shape、applicationのvalidated selection／command／resolverを定義。既存record schemaをworkerから再利用可能にし、`isOwned`とATK ownerは変更しない | 合法product、非法product、atomic population transition、NP0／missing、selected値だけのコピー。共通06.411／06.412 fixtureを再利用 |
| 42-B | 42-A | `rankingPolicy`／`rankingRows`／`rankingCandidateSpace`の全scenario構築、static semantics／capacity／candidate selection／summary／direct detail／NP matrixをresolved basisへ統一。row/detailへselectionとprovenanceを保持 | `pnpm test:diagnostic -- rankingPolicy`、`-- rankingRows`、`-- rankingProfileOutcome`を各々実行。owned NPとglobal指定値が違う反例、baseline/materialized path、NP1〜5完全実行 |
| 42-C | 42-B | detail → portable constructor／execute／replace／recover／upgradeとCalculatorRouteのscenario-change attempt、schema v36／engine 31.0.0、v34/v35 ranking historical migration。repository／backup／share／draft／history writerを同じ契約へ切替 | `pnpm test:diagnostic -- portableCalculation`、`-- packages/schema/src/index.test.ts`、`-- repository`、`-- share`、`-- rankingHandoff`を各々実行。pinned replay、旧/current/mixed、failed attemptのno-write |
| 42-D | 42-B, 42-C | URL六keyのstrict read/write、application command dispatch、六controlとsummary、worker request/response validation、context/selection/request identity、summary/detail cache guard。detailはcanonical entryから解決 | `pnpm test:diagnostic -- rankingState`、`-- rankingWorkerRuntime`、`-- useRanking`、`-- RankingConditions`を各々実行。invalid URLのfilter/popstate/reset、stale response、cache hit/miss identity、礼装/support変更時no-reinitialize |
| 42-E | 42-C, 42-D | 同じstable owned fixtureでrow/detail/request/calculator parityと合法basis productを統合検証。shared production inventoryと性能を変更前に対応付ける | `pnpm test:diagnostic -- Ranking.integration`、`-- productionAudit`、続けて`pnpm test:unit`と`pnpm test:production`。候補数、damage入力、差分理由、3回medianを記録 |
| 42-F | 42-E | 旧runtime type/key/fallback/readerの削除監査、flow statusとcontract evidenceを更新、完了handoff | `pnpm quality`だけを最終phase gateにし、その後に別Vitest／validate:evidenceを追加しない。Blocking 0を確認してdone |

各unitで必要な関連fixtureを更新するが、unit完了をTask完了としない。全masterはshared audit一つへ集約し、
caseごとの再compileや未証明のcross-NP cacheを導入しない。42-Dはcache identityだけを変更し、lifetime/cardinalityはTSK-07。
旧keyの削除監査はproduction reader/writerを対象とし、旧入力をrejectするguard、migration、反例fixtureの文字列を0件要求しない。

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

Handoff: Step 1 only, 2026-09-05

- 調査基点: `main` / `255464b2dc6219df7be0032bd46d45d279bbb30c`、開始worktree clean。
  AGENTS、systematic review guide、関連requirements、ranking／portable／06.411／06.412 flow noteをコードへ照合した。
- 06.411のexact ATK invalidと06.412のraw-key保存／record identityは実装済み。旧計画の未完了記述は
  canonical flow noteの最新deltaで上書きし、worker ingressと新basisの接続検証だけを本Taskへ残す。
- 今回の追加はdetail entry対応／遅延response、strict URLのpartialとdefault writer整合、v35基点の移行、
  portable provenance整合の反例。根拠と前回inventoryの不足は同じflow noteへ一度だけ記録した。
- Step 2 entry: 次の明示的な実装依頼を受け、このhandoffと`255464b`の祖先関係、TSK-06.42 `ready`、
  TSK-06.411／06.412 `done`、planning Blocking 0を確認する。許容開始差分は未commitの場合の
  `docs/evidence/ranking-policy-candidate-flow-tsk-06.md`と本Task正本の今回Step 1変更だけ。
  source／test／configuration／fixture／snapshot差分は許容しない。後発ユーザー変更は保持し、開始境界を再記録する。
  planning差分を必要に応じてcommitした後、Taskだけを`in_progress`にする開始commitを作ってから実装する。
- 完了条件: 上記Done gate、42-A〜Fの証拠、共有production inventory、calculator parity、fail-closed、性能、
  controls／summary整合、`pnpm quality`、runtime Blocking 0。全攻撃NP numeric closure／最大stack／寄与表示／
  full maximum／cache lifetime／responsive polishは既存後続Taskへ残す。
- 今回は文書2件のみを更新し、Taskは`ready`を維持。実装・テスト・設定・snapshot変更なし、テスト／品質gate／
  benchmarkは未実行。仕様上の未確定事項はなく、実装検証はすべてStep 2へDeferred。

Handoff: Step 2 completed, 2026-09-06

- 開始境界: `255464b` → Step 1文書commit `ab48586` → 開始status commit `b4e0356`。
  Step 1後の明示的な継続依頼を受けて実装を開始し、開始時のsource／test／configuration／snapshot差分は0。
  無関係なユーザー変更の削除・退避は行っていない。
- 42-A〜F完了。semantic owner、changed flow、反例と診断帰属の正本はcanonical flow noteの
  「Step 2 implementation delta」。schema v36／engine 31.0.0へ切替済み。
  母集団・level・NP basisを独立解決し、固定条件とprovenanceをrow／detail／portable／calculatorで共有する。
- 最終integration reviewで見つかった`CalculatorRoute.saveScenarioDraft`のconstructor例外経路を
  同じflow noteへ追加し、application-owned scenario-change attemptでinvalid時のno-writeを検証した。
  URL／worker／portableの不正状態を推測値へ補完するreaderはなく、旧keyはreject／明示resetだけに残る。
- `pnpm quality` PASS、283.32s。unit 453、production 117、Playwright 25成功、skip／retry／warning／
  unexpected consoleすべて0。artifact: `.test-results/2026-09-05T15-00-56-136Z-16-805668`。
  format／lint／typecheck／runner／docs／master validation／buildも通過。最終gate後にVitestや
  `validate:evidence`を追加せず、完了記録の文書整合とstaged diffだけを確認する。
- Production inventoryと数値damageは不変。audit traceのschema版表示815箇所とgoldenのengine envelopeだけを更新。
  candidate 6,360／deduplicated 3,949／requests 1,924／distinct 1,298は不変、compile medianは
  5,479 → 5,224 ms（同一command各3回、-4.6%）。owned axesはsmall stable fixtureで別途検証した。
- runtime Blocking 0、仕様上の未解決事項なし。旧ranking draftは破棄、historyはhistorical-only、旧shareはreject。
  全攻撃NP numeric closure、maximum stack、寄与表示、full maximum、cache lifecycle／notice／responsive polishは
  既存TSK-06.45／06.43／06.47／06.5／07へDeferredのまま。
- 次の実行単位は`ready`のTSK-06.43。本Taskの実装commitとclean worktreeを開始基点として記録し、
  Task・関連requirements・canonical flow noteを再読する。後続実装は別の明示依頼から開始する。

Handoff: post-implementation review completed, 2026-09-06

- PIR-001（worker response payload検証不足）は修正後の主reviewer／独立reviewer双方が`Resolved`と確認し、
  判定は`Approved`。TSK-06.42は`done`、runtime Blocking 0。詳細と再発範囲の正本はcanonical flow noteの
  「PIR-001 implementation delta」。damage rule、snapshot、production digestの変更はない。
- 再レビューの`pnpm quality` PASS、241.59s、unit 458／production 117／Playwright 25、skip／retry／warning／
  unexpected console 0。artifact: `.test-results/2026-09-05T15-45-37-350Z-15-81df04`。
- 次は`ready`のTSK-06.43。この承認済み修正のcommitとworktree状態を開始境界として記録し、Task、関連requirements、
  canonical flow noteを再読する。着手前にstack quantity familyのproducer／consumer／recovery経路を監査し、
  同じflow noteへ計画とstate-by-path反例を追加する。
- 実行順序はtyped IRのbaseline／maximum／quantity source定義 → applicationの有限witness選択 →
  shared executionとglobal constraint検証 → detail／portable／calculator parity。
  count 0／1／maximum、比較演算、上限欠落・矛盾、複数familyの共存を扱い、production代表の平景清4／ワンジナ10を
  inventoryで確認する。servant固有runtime分岐、一般turn simulation、candidate上限緩和は行わない。
- 検証は小さい反例fixture、共有production inventory、変更前後各3回のhot-path／candidate計測、最終`pnpm quality`。
  TSK-06.43の実装は未着手。現行番号での後続順序は06.43 → 06.44 → 06.45 → 06.46 → 06.47 → 06.5 → 07。

### TSK-06.43: Canonical maximum stack quantity

Depends on: TSK-06.42

Review completed（2026-09-06）: **Approved**。独立再レビューとroot確認でPIR-001–003はすべてResolved、
新material findingなし、flow Blocking 0。最終レビューgateは`pnpm quality` PASS（234.94s）、
artifact `.test-results/2026-09-05T19-31-18-851Z-15-53be95`。unit495／production119／Playwright25、
skip／todo／retry／warning／unexpected console 0。TSK-06.43をdone、TSK-06.45をreadyへ更新した。
canonical flow noteの「review approval and next-task handoff」が承認・次作業の永続要約を所有する。
以下のStep 2／実装検証は履歴として保持する。

Step 2 completed: user explicitly approved implementation after Step 1. HEAD remains `26eae69`; only the two approved planning documents were modified at the boundary.

- [x] stack可能なdamage増幅条件の回数、baseline、canonical maximum、quantity sourceをdata pipeline所有のtyped IRで
      表現する。servant ID、名称、effect label、raw trait keyによるapplication／Web分岐を禁止する。
- [x] `条件効果: 通常のみ`はcanonical baseline countを使用し、`成立込み`は宣言済みmaximum countを有限quantity
      witnessへ含める。一般の`traitCount`／quantity conditionを一律`atLeast: 1`または最大値へ丸めない。
- [x] maximum stackをskill再使用／turn経過の一般simulationとして扱わず、準備phase開始時のtyped stack-count
      assumptionとしてscenario evidenceへ保持する。上限欠落、矛盾、support範囲外はtyped invalid／unsupportedにする。
- [x] maximum countもtarget／field／choice／他quantityと同じglobal constraint validationを通し、共存不能な
      局所最大の合算、exclusive branch同時適用、executor外のdamage補正を禁止する。
- [x] production代表として平景清「復讐の怨念」4 stack、ワンジナ「精霊の怒り」10 stackをfixture／inventoryで確認する。
      代表名はtest evidenceに限定し、runtime semanticsはcanonical maximum countから導出する。
- [x] count 0／1／maximum、`atLeast | atMost | equal`、上限欠落、複数stack family、baseline包含、
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

Handoff: Step 2 completed（2026-09-06）。`pnpm quality` PASS、269.27s。

- 最終artifact: `.test-results/2026-09-05T17-54-49-795Z-15-ce11fd`。
  unit 481／production 119／Playwright 25件成功、skip／todo／retry／warning／unexpected console 0。
  artifact整合性エラー0、flow Blocking 0。A0–A5完了。

- Step 1確認後の明示的な実装依頼を受け、HEAD `26eae69`と、承認済みの2文書のみ変更済みという開始境界を再確認した。
  既存変更を保持し、製品コード・focused tests・generated master・version境界を一括更新した。
- 実装・production inventory・意図した入力／数値差分・反例・性能の正本は
  `docs/evidence/ranking-policy-candidate-flow-tsk-06.md`の「TSK-06.43 — Step 2 implementation and verification」。
  NP stackとmodifier stackを同じ物理sourceへ結び、回数を準備開始前に一度だけseedする。
- master manifest schema 44／scenario schema 37／engine 32.0.0。最大回数・由来を表示し、calculator／ranking／
  without-area／portable replayへ保持する。旧schema 36ランキング履歴はhistorical-onlyとして復元する。
- 平景清4回／ワンジナ10回はcanonical IRから倍率2を算出。通常時の422 calculator outcomeは変更なし。
  最大値の欠落による推測6は削除し、対象の選択はunsupportedへ変更した。
- 全列挙と小さい独立oracleで縮約の十分条件を固定。通常条件のcandidate／damage-request countersは維持、
  compile中央値6,349.82ms → 5,940.15ms。4,096上限・timeout・complexity ratchetは緩和していない。
- 仕様判断の未解決事項はない。成立込みの有限上界超過はtyped unsupportedを保持し、部分的な最大値を返さない。
  これは既存のsupport境界であり、全攻撃宝具のnumeric closureと最終全policy最大値は引き続き06.45／06.5が所有する。

依存順の実装単位（A0–A5完了、詳細証跡はcanonical flow note参照）:

| Unit | Depends on | 所有範囲／実施内容 | 単位の完了条件 |
| --- | --- | --- | --- |
| A0 境界・基準計測 | 明示的なStep 2依頼 | HEAD／worktree／AGENTS／正本delta再確認。既存変更を保持し、変更前のaffected production suiteとhot pathを同一環境で計測 | 06.43 Step 1文書差分以外の開始差分を説明。master hash、3回のcompile timingとcounters、candidate上界を記録 |
| A1 canonical quantity IR | A0 | master-data／schema／data-pipeline。有限特性集合とstack instanceを型で分離し、source／baseline／maximum／support evidenceを供給。NPとeffectStackCountの二重model・推測fallbackを解消 | 全production source分類、全OC/NP cell、missing／conflict／aggregate source focused fixture、共有inventoryが閉じる。旧仕様の数値を温存するためのfallbackなし |
| A2 finite application witness | A1 | static semantics／canonical input domain／candidate certificate。live sourceを集め、共有sourceをdedupし、baselineを包含する有限回数候補を既存productへ統合 | 0／1／max、比較演算とnested条件、複数familyの独立oracle一致。4,096以下のcomplete certificate、超過時fail-closed、上限緩和なし |
| A3 shared execution closure | A1, A2 | scenario preparation、global constraints、count readers／writers、preapply／rollback、NP damageとprojection、policy再適用 | assumptionを準備前に一度seed。add/remove/suppress/form変更を一度だけ適用。calculator／ranking／without-areaで同一count・damage input・outcome、invalid／unsupported fallbackなし |
| A4 evidence・commands・portable cutover | A3 | application commands、最小count/origin表示、worker response schema、portable request、draft/history/share/backupとversion/cache境界 | countと出典が表示・保存・復元される。canonical-only／old-only／mixed payload fixture、同条件計算機・replay parity、拒否時の旧request/result保持。寄与UI全体の整理は06.47 |
| A5 production・性能・完了監査 | A1–A4 | shared production auditとfocused fixtureを確定。意図したdamage差分をcanonical inputsとruleで記録。flow noteの現Task Deferredを閉じる | production欠落0、代表4/10回、一般quantity非回帰、candidate／hot-path説明、Blocking 0、`pnpm quality`成功 |

検証・性能計測計画:

- A0で`pnpm test:diagnostic -- packages/calculation-application/src/productionAudit.test.ts`を3回実行し、
  各`.test-results/`の`production-audit-calculation-application.json`からread／parse／compile時間、load／compile回数、
  candidate／damage-request／cache countersを採取する。A5で同条件3回、中央値を比較する。production suite時間も前後記録する。
  現在のartifactにないstack cardinality別counterはA1–A2の共有auditへ追加し、未計測を0としない。
- 各unitは`pnpm test:diagnostic -- <affected-test-file>`で意味論を診断し、`pnpm test:unit`または
  `pnpm test:production`へ拡張する。対象はpipeline normalization、NP damage／condition／constraint／preparation、
  candidate space／world witness／canonical inputs、scenario／portable、Web worker／handoff／detail tests。
  full masterはcaseごとに再読込せず、一つのproduction inventory/digestを共有する。
- A2では小さい独立exhaustive oracleとcertificate境界を先に固定。A5でprofile別の追加quantity cardinalityと
  complete product、実materialization数、damage requestsを比較する。既存2,880／4,096は過去の観測値であり、
  今回の最大値の代用にしない。説明できない10%超退行、candidate爆発、cap／timeout／complexity ratchet緩和は受入不可。
- 最終phase gateは`pnpm quality`だけ。後ろへ`validate:evidence`や追加Vitestを重ねない。UIのcount／originと同条件引継ぎを
  component／必要なE2Eで確認し、全体寄与表示、全攻撃NP numeric、最終four-policy maximumを本Task完了と混同しない。
- Step 1ではこれらのtest／benchmark／qualityを実行せず、文書整合性だけを確認する。runtime pass・性能非退行の主張はしない。

Step 1 verification: `pnpm test:docs`（6 tests＋repository integrity）と`git diff --check`が成功。変更は上記2文書のみ。

Handoff (Step 1 only): 計画文書更新まで。未解決の仕様質問なし。実装・最終damage／性能測定・runtime flow closureは未実施。
本Taskを完了し、次の実行単位06.45をreadyへ更新した。後続実装は未着手で、別の依頼を受けて開始する。

### TSK-06.44: Initial OC selection and canonical OC boost closure

最新判定（2026-09-08）: 独立再レビューApproved、PIR-001／002 Resolved、Blocking 0。
最終qualityはunit637／production119／Playwright26成功。承認根拠は既存flow noteの
「独立再レビュー承認・commit handoff」。以下のChanges required／再レビュー待ちは経緯として保持する。
06.44はdone、後続06.45はready。



2026-09-08再レビュー: Changes required。採用PIR-001／002の修正・最終qualityを完了し、ready-for-re-review。
unit637／production119／Playwright26成功。以前の完了記録は初回実装の証拠であり、
現在の判定はこの追記とflow noteのPIR deltaを正本とする。独立再レビュー前に承認扱いにしない。

Depends on: TSK-06.43

2026-09-08の完了依頼で過去の保留を解除し、要件と実装を再評価した。
初期OC intent、lossless OC IR、共通executorのinstance／NP-use receiptを維持し、
準備のread-point、portable quantity witness、NP変更command、根拠の表示名を同じ所有境界で閉じる。
基点は`c555e4ff9a208f8da01e56130fbd49e63848e192`。既存の未commit変更を保持し、stage／commitは行っていない。
実装・focused／unit／productionと全80条件32,640件のparityは検証済み。
最新性能測定と最終`pnpm quality`も成功し、受入条件を満たしてdone。
現在地と判断・証拠の正本はflow note「実装引継ぎの再評価（2026-09-08）」とする。
以下の単位表は実装責務の索引であり、過去の停止記録は現行の承認待ちを意味しない。

Implementation units（本Task内の依存順。独立した並行計画を作らない）:

| Unit | Depends on | 変更責務 | 検証方法・単位完了条件 |
| --- | --- | --- | --- |
| A0 再現可能baseline計測 | 更新Step 1確認 | flow noteの確定仕様・母集団・source program設計をentry contractとして照合し、実装直前のaffected production suite／ranking hot pathを計測する。raw167件／公開97件、writer199件のfamily分類92/2/73/32、付与率modifier29件を既存共有auditへ固定する。仕様を選ぶ調査はStep 1で完了しており、本単位へ延期しない。 | policy/NP/開始gauge/profile、candidate/request/distinct input数、時間、damage入力とHEAD/master digest/commandをartifact化。旧開始NP探索は旧baselineとして区別。入力digestや分類が計画時から変わった場合だけ差分を再調査する。 |
| A1 Lossless OC IR | A0 | master-dataのeffect unionとdata-pipelineの正規化へ専用OC grant／lifecycle／recipient／condition／stackingとOC付与率modifier（29 effects）のclamp前rate・caster/recipient selectorを導入。rate量はfixed／既存HP expressionをlosslessに保持する（OC-RATE-HP-001）。汎用stateMutation経路から切替。master/fixture/versionの必要な更新を含む。 | focused normalization/schema tests、全raw value cellsとCE通常/LBの対応、公開全source共有inventory。missing/conflicting/unknown semanticsをrejectまたは明示unsupportedにし、runtimeのraw reader0件。Count -1/1/3/4、Value1/2、Rate1000/5000の補正差、production-zero sourceも反例化。 |
| A2a Execution context and source program | A1 | battle-execution内でworld/input facts＋policyを準備前へ渡し、OC全cellsを保持するsource programをcompileする。付与率modifier自身の付与/解除も同じbounded sliceへ含め、既存condition/activation ownerを準備でも使い、OCのunknown-as-no-mutation経路を除去。CE constantを初期lifetime、外部skillを既存terminal NP前phaseへ配置。 | field/recipient/mixed conditionの準備・通常経路truth一致。unknownはtyped recovery。terminal passiveの初期formへの遡及0、constant二重付与0。static source cacheとruntime stateを分離。 |
| A2b NP-use transaction and receipts | A2a | command interpreterがgauge/boost/rate instances/formのwriteを唯一所有。OC付与時のcaster/recipient実効率とproc witnessを評価。HP依存rateは利用時に読み、結果に影響する未表現HP変更はunsupported、修正可能なHP不足はinputRequiredとする。rate付与→HP変更→OC付与、解除、別source、rollback/retryを接続前の小fixtureで固定する。NP本体処理前にOCを確定し、各NPの全cellsをreceiptで選び、action終端で参加instanceだけを消費。OC/rate非交差32件/敵92件をproofで除外し、OC直接2件/rate prerequisite73件のselectorをboundedに扱う。 | flow noteの数値反例表どおり、cap飽和でも全参加count消費、NP-before付与は当該NPへ不適用、途中再付与は未消費。CE immutable、skill removable、unknown live resistanceはunsupported。成功率0/1000/中間のoutcomeを区別。sibling invalid/required-inputでcommand全体rollback。 |
| A2c Application/projection convergence | A2b | sourceCollectionと通常operation loopへcommit receiptを渡し、OC/gaugeを書き直さない。scenarioのMath.maxと準備NPのterminal OC再利用を削除。policy再適用/without-areaは共通prepare入口から元request＋新policyを再評価し、古い使用stateを再利用しない。 | calculator/rankingの同じsource program・condition owner・command interpreter・damage projectionへの合流。fresh executionとのinput/outcome/receipt一致。preapply/clone/retryで再付与・先消費・stale OC0。 |
| A3 Fixed initial intent and finite planner | A2c | schema ranking selectionとapplication basis/command/comparison policy/candidate space/admission/static semantics/stack reduction/cache。初期OCを一つの開始gaugeへ変換し探索軸を削除。NP変更とpopulation→allのNP1復帰をatomicに処理。OC-only／NP charge-onlyの間接寄与とHP→rate query→OC outcomeを共有dependencyで判定し、rate付与位置だけをreader位置としない。 | 指定NP×OCの不正request拒否、保有混在capacity不足unavailable、四policyで開始gauge固定。小domain全探索oracleでOC-dependent condition/quantity/ordered planと最適候補一致。既存static7,255 programs／profile最大60を超える行動は追加せず、candidate bound4096を緩和しない。insensitive no-opを増やさない。完成input同一性なしにNP列cacheを共有しない。 |
| A4 Portable / persistence / UI atomic cutover | A3 | schema versionとengine/master identity、portable intent/basis、draft/history/backup/share migration、URL、worker protocol/cache/stale判定、Web controls/summary/detail/calculator replay/resetを同じcutoverへ揃える。通常resolvedは初期OC1〜3、manualは最終OC1〜5を維持する計画に従う。 | initial OC/開始NP/発動時OCと根拠のreplay parity。old-only/canonical-only/mixed contradictoryを全境界で検証。旧requestは曖昧補完せず履歴表示と再生成を区別。NP/population変更command、reset、stale worker、異OC fingerprintを確認。desktop/390px/320px/keyboardのUI invariantsを満たす。 |
| A5 Production closure and handoff | A4 | 共有production inventory/parityとdamage変更証跡、性能差を確定し本flow noteのDeferredを閉じる。06.45へ新baselineと既存残存mechanismを渡す。 | 自然上限/Lv90×四policy×NP1〜5×合法OCおよび保有混在fixtures。calculator/ranking/portable input・outcome・OC receipt一致、NP5再最適化とNP1採用scenarioのNP5列を区別。A0比のcandidate/suite/hot-path差を説明し、最終pnpm quality成功、Blocking/Task内Deferred0。 |

A0→A1→A2a→A2b→A2c→A3→A4→A5の順で実装する（flow noteのA2はA2a〜c全体を指す）。A1〜A4の中間stateを製品完了とは扱わず、
version cutoverの不整合を残したまま公開しない。各単位は下記Done gateを弱めない。
Focused verificationは`pnpm test:diagnostic -- <affected-filter>`、複数suiteのbounded実行は
`pnpm test:agent`または`pnpm test:unit`／`pnpm test:production`を使用する。
小fixtureを先行させ、全masterのload/normalize/compileは共有inventoryへ集約する。
A0の性能baselineは同一environment・同一policy/NP/OC・同じ測定方法でA5と比較し、
旧探索の削除による件数減とOC加算の新寄与による増加を分ける。

- [x] requirements v0.10.2 §4／9を実装する。flow inventoryと反例の正本は
      `docs/evidence/ranking-policy-candidate-flow-tsk-06.md`の06.44 deltaとし、開始時に直接reader／writerを全検索して更新する。
- [x] pipelineでOC加算family全体を再集計し、段階、recipient、条件、duration／countをlosslessなcanonical IRへ正規化する。
      skillだけでなくNP／passive／既存calculatorの礼装経路を監査する。ランキングに外部支援入力は追加しない。
- [x] executorでgauge由来base OC、OC加算、実効OC、NP使用時の消費を分離する。準備／変身NP／攻撃NP、
      clone／rollback／retryを同じtransactionへ閉じ、欠落semanticsの無効果扱いを削除する。
- [x] applicationに初期OC intentとcapacity validationを追加し、成立込みの開始NP候補探索を削除する。
      own OC boostの間接damage寄与をaction admissionとfinite dependency proofへ含め、四policyで評価する。
- [x] Web条件・計算基準・detail、URL、worker、cache／fingerprint、portable request／calculator replay／resetを
      同じversion cutoverで更新する。旧requestを初期OC1へ読み替えず明示拒否し、再生成commandを提示する。
- [x] focused fixtures → shared production inventory／parity → affected suites／hot path before-afterの順に検証する。
      NP5で再最適化した結果と、NP1採用scenarioのNP5列を区別し、数値差をcanonical inputとruleで記録する。

Done gate:

- 初期OC1／2／3とresolved NP capacity、四policy、保有混在、発動時OC表示がrequirements §9.1を満たす。
- flow noteの全06.44行がVerifiedまたは理由付きN/AとなりBlocking／Task内延期0件。OC加算production familyの
  未分類・無効果fallback 0件、calculator／ranking／portableのdamage・outcome・OC evidence parity差分0件。
- 初期OCを探索次元として増やさず、OC状態依存のcandidate reductionをfocused oracleで反証する。
  production件数、damage差分、candidate数、suite／hot-path時間の変化を説明し、未説明の10%超退行や上限緩和がない。
- `pnpm test:diagnostic -- <affected-filter>` → `pnpm test:unit`／`pnpm test:production` → `pnpm quality`。
  UIはdesktop／390px／320px、keyboard、変更command、stale worker rejectionを確認する。
- 06.45の既存trigger／dependent resource問題を本Taskの完了と混同せず、最新baselineと残存理由を引き継ぐ。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-IR-001` | Apply | OC family shared production inventory／canonical admission fixtures | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-EXEC-001` | Apply | OC timing／count／rollback focused tests | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-POLICY-001` | Apply | fixed initial OC／capacity／four-policy oracle | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-UI-001` | Apply | selection／basis／detail／responsive UI tests | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `UI-CALC-001` | Apply | calculator OC notice／replay／reset UI tests | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-HANDOFF-001` | Apply | portable replay／version rejection／reset tests | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-CACHE-001` | Apply | URL／worker／cache identity and stale rejection tests | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-AUDIT-001` | Apply | `pnpm test:production`＋`audit-oc-matrix.ts` legal initial OC matrix and parity | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-PERF-001` | Apply | affected production suite／ranking hot path before-after | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `DOC-REV-001` | Apply | `pnpm test:docs` | requirements v0.10.2／registry／Handoff |

Handoff: （2026-09-08）単独実装とA5検証を完了。A1〜A4の実経路とversion cutoverを接続し、
共有production全119 testsと全80条件32,640件のparity差分0を確認済み。
最終`pnpm quality`はunit621／production119／Playwright26、warning・unexpected console・retry 0で成功。
artifact: `.test-results/2026-09-08T03-10-01-607Z-15-c1fff1`。06.44 scoped Blocking／Deferred 0。
性能とcanonical input差分は既存flow noteと同noteから参照する機械証拠へ確定した。06.45はready。
過去の保留・途中監査はflow noteに履歴として保持する。次のStep 1調査記録も履歴である。

- 前回のStep 1完了報告は、writer到達性とOC lifecycleをA0へ送った点で早計だった。利用者指摘を受け同じflow noteを再調査し、設計判断を確定した。
- manualの最終OC1〜5維持は確認済み。resolvedは初期OC1〜3＋導出発動時OCへ統一する計画。新しい外部OC intent／最大化設定は追加しない。
- writer199件は全raw value variantで分類一致（OC instance直接分類は敵92/非交差105/解除2、rate prerequisiteを含むfamily分類は敵92/直接2/rate73/非交差32）。NP本体処理前のOC確定とaction終端の消費、policy変更時の共通prepare再実行を選択し、A2a〜cに責務を分けた。
- OC付与率modifier29件も調査済み。通常Rate1000とmystic Rate5000が成功率低下後に異なる例を固定し、generic guaranteedの情報落ちをA1/A2で除去する。
- 計画時にstatic programs7,255／最大60、baseline admission2,034／satisfied6,722、直接modifierなしのOC skill13件を確認。性能の実測比較だけをA0/A5へ残し、候補設計の選択は延期していない。
- raw167件と公開97件を分離し、変身NPの使用時cell、constant CEの消費、policy再適用、population command、保存migrationを追加反例へ展開した。
- Step 1の`pnpm test:docs`（6 tests＋integrity）と`git diff --check`は成功。pnpm qualityはA5のphase完了gateであり、Step 1をruntime完了としない。

- 基点は06.43完了commit `c555e4f`。既存レビュー承認を改変せず、追加調査の検出漏れと再発範囲をflow noteへ記録した。
- 実装順は上記A0〜A5。具体reader／writer、確定事項と未解決事項は既存flow noteだけで管理する。
- 後続は06.45 → 06.46 → 06.47 → 06.5 → 07。06.45開始値は本Task完了後に再集計する。

### TSK-06.45: All attack-NP execution closure

Depends on: TSK-06.44

最終フォローアップ（`654634075f0acf245a48e2d54fc1ce526f2ac0ac`基点）: **独立非HPとU5を閉じ、U0〜U5、80条件34,640 outcomes、stable owned、最終qualityまで完了。Blocking 0、Task内Deferred 0。** 開始clean。BP完了時の成功qualityと性能をbeforeとして再利用した。

| 成果／未達 | 現在地 | 判定 |
| --- | --- | --- |
| calculator／ranking | 422/422、433/433 | BP縦断単位で残る通常拒否を解消。U5の80合法条件・stable owned closureとは区別する |
| U3-Qの対象5profile | NP2成立込みの候補上限を解消。306200×2各2860、502600は43、1001800は912、2501600は2064 | cap4096とスキル順序を保持。合法tuple／全read同値性とOC非依存proofを使用 |
| count7profileの受入 | 通常NP1/2/5・NP2四policyの49条件はcalculated、calculator/ranking/portable一致 | 小型oracle・rollback・修復・支援source・実画面、quality unit790/production122/E2E26成功 |
| NP/charge transfer3profileの受入 | 21条件calculated、calculator/ranking/portable一致、rollback/修復・実画面・quality成功 | scoped Blocking0 |
| 全Taskの結果 | critical-star全production経路、全80合法条件／stable ownedのU5 closure | 34,600 calculated／typed unavailable 40、nonnumeric 0、parity差分0 |

攻撃NP buff count、target/individual count、NP/charge transfer、HP、独立marker／admission、BP縦断に加え、critical starsと全体U5を完了した。通常433/433・422/422だけでなく、80条件・stable owned・回復・性能・最終qualityを完了根拠とする。

最終`pnpm quality`はunit 841／production 143／E2E 29、skip／todo／retry／warning／unexpected console 0で成功。artifact `.test-results/2026-09-19T21-07-48-452Z-15-1f2e41`、manifest SHA-256 `a6d892985cfe34f977c36d5581878ac9fb677a4e36b95c38800f5133ad12b8b1`。production stepは84,677→109,147ms（+28.90%）で、closure test 4件とshared audit assertion追加、既定5秒timeoutを維持するproduction worker 4固定によるwall time差。ranking hot pathは5,233.421→5,231.173ms（-0.04%）で、cap／timeout／性能ratchetの緩和なし。

UI componentは変更していないが、engine 47.0.0表示と固定world fact／選択witnessの現在結果によりVRT 4枚を更新。desktop／390px／320pxのfocused 5/5と最終E2E 29/29で確認した。

実装責務、証跡と全Taskの未達gateは[canonical checkpoint](../evidence/ranking-policy-candidate-flow-tsk-06.md#canonical-checkpoint2026-09-13フォローアップ)。

進行判断（既存U番号と完了条件を維持）:

1. **U2-D.countのtarget／individual count7profileは完了**。U3-Qの候補重複と502600の対象別解除結果を共通経路で接続した。49条件・全件inventory・UI・最終qualityと基点比較の記録を同じcheckpointへ収束した。ID分岐、cap緩和、無条件のmarker付与は行わない。
2. **終了判定は対象profileの実経路**。初期入力、選択sourceとvariant、併存する拒否理由、後続実行まで確認し、before/afterの対応数・damage・未達理由を記録する。非攻撃NPの追加対応やfixture成功だけではこの単位を閉じない。新しい後続failureが出たら同対象の原因を閉じ、説明なく別familyへ移らない。各単位に必要な小型fixture・production・回復・性能を確認する。
3. **count・NP/charge transfer単位の完了後、残るmarker/admission・HP transfer・HP/BPを依存順に収束**させる。共通のinstance/actor stateに関わる直接writerは対応単位へ含め、件数順にIDごとの修正へ分割しない。全program候補積はU3-Q、全profile/条件/ownedと共通回復/UIはU4/U5で閉じる。
4. **未確定resource処理はChaldeaの該当実装を参考仕様として採用する（2026-09-13利用者承認）**。固定commitの処理本体・呼出元・関連testを読み、既存canonical IR/application/executionへ対応させる。HP数値3件の具体的規則は既存証跡のreferenceContractへ固定した。実測不足だけで実装を停止せず、既存の根拠を一から再発見しない。明示された製品要件、入力検証、対象/時点、rollback/parityは維持する。参照元にない処理や明確な矛盾は該当branchの差だけを示して技術判断し、全Taskの再承認待ちへ戻さない。
5. **再開と検証を重複させない**。現在のqualityと永続before/final証拠を使い、同条件の成功済み検証を開始時に繰り返さない。消失した旧/tmp一式の復元は次の目的にしない。新しい数値・実行差分に必要な証拠だけ取得し、session境界では閉じた実経路・残件・次の操作を同じcheckpointへ更新する。


- [x] 77be416時Step 1: 要件確認→現状調査→採用設計と理由→既存単位の入力/責務/完了条件照合→Task/flow更新。
- [x] 77be416時Step 2開始: 計画承認、HEAD/Git/master照合済み。Step 1の2文書の未コミット変更を保持し、U0-R beforeとU1-Rへ着手。

- [x] 初回Step 1: 基点`e354764`のclean treeで調査した（以下2項も初回証拠）。
- [x] Step 1: shared production suiteとdefault matrixでranking393/433、calculator420/422を再確認する。
- [x] Step 1: 未対応40 profilesをlegal programのoperationへjoinし、意味論のfamily、所有権、回復経路、
      設計上の未確定点を記録して、以下の検証可能な実行単位に分割する。

- [x] 前回Step 1: AGENTS／現行要件／Task／最新flow／e354764＋未コミット差分を照合し、HP・OC・BP・依存量・admissionの直接経路を再調査した。
- [x] 前回Step 1: 最大HP・回復量／減少量buffのinventory漏れ、二段階実行とread時点、量候補の不足を同じflowへ追記し、採用設計・技術gate・実行順を更新した。
- [x] 前回Step 1: 最新要件と全13,875格納effectを再確認し、HP0 reachabilityを全NPのreaderへ追加。量query・transaction・admissionの責務、技術gate、state-by-path反例、回復経路と実行単位を更新した。

- [x] U2-D.count攻撃buff count単位（2026-09-13）: 1000900/3392・1101600/21113、併存20955と後続8808を接続。既存stack入力とinstance state、recipient/live read、NP/OC、結果分類、rollback/retry、portable・UI回復を閉じた。ranking413→415/433、calculator420/422。最終quality成功、scoped Blocking0。target/individual count・transferを含むU2-D全体は未完了。

- [x] U2-D.transfer player NP／enemy charge3profile（2026-09-13、`b1759b7`基点）: 304000・1102300・2500400と1102300の直接併存markerを共通実行へ接続。21条件parity、非zero入力、oracle、rollback/修復、portable/UI、全件inventory・性能・最終qualityを完了。ranking425/433、calculator420/422、scoped Blocking0。HP transferとTSK全体は別未完。

- [x] U2-D.count target/individual count7profile＋該当U3-Q/U4（2026-09-13、`0cf5a36`からの本count完了commit）: 通常NP1/2/5・NP2四policyの49条件を40 calculated／9 unsupportedから全calculatedへ改善。候補上限5profileと502600の対象別結果→marker→countを接続し、parity・最大候補の同値性・rollback/修復・実画面・性能比較・最終qualityを完了。ranking421→422/433、calculator420/422、scoped Blocking0。TSK全体の残りは下記U2/U3/U4/U5で維持する。

- [x] U0-D/U2-D先行単位: current-NP比例増加のcanonical量式、normal/LB/NP cell選択、ordered共通reducerとOC依存区間、rollback／retryを実装。NP1/2×4policyでcalculator／ranking／portable parityを検証した。詳細は既存flowのcurrent-NP proportional gain delta。U0-D／U2-D全体を完了としない。

- [x] U1-R／U3-A先行単位: bounded trigger scopeをcompiler・preparation・OC依存・form到達性・admissionへ共通適用。通常攻撃専用triggerをNP programで実行せず、既存numeric結果を保ってranking394→411/433。HP／actor／amountのread契約やadmission全体は未完了。検証と回復経路は[Step 2 trigger delta](../evidence/ranking-policy-candidate-flow-tsk-06.md#step-2再開u1-rのbounded-trigger契約実装中)を参照。

- [x] U1-H先行単位: HP lossのzero／oneIfAliveをresource別unionへ保持。旧shape・矛盾拒否、CE通常／LBの意味一致、ordinary／OCへの保持、全HP量表の監査を実装。HP実状態・最大値modifierは未実装。詳細は[HP下限IR delta](../evidence/ranking-policy-candidate-flow-tsk-06.md#step-2継続hp減少下限のir境界2026-09-08)。

- [x] 77be416時Step 1: ef45befの要件・全格納effect・直接実行／回復経路を再確認。未接続stateとread責務を特定し、count selectorの旧分割を修正。設計・反例・branch gate・Step 2開始条件を既存正本へ更新。

- [x] 製品判断（2026-09-09）: 初期0%も死亡・攻撃不可。正値HPの表示0%は攻撃可。実行接続はU2-H。
- [x] 入力・設計方針（2026-09-09）: バフ量ベースの段階指定、対象ベースの汎用設計。BP開始point入力案を撤回し、flow deltaへ対象/domain混同と段階→実量の検証課題を記録。実装・実行検証は未完了。
- [x] U0-R実装前監査: 22 exclusionsを実admission/選択programへjoin。contextReferenceのみ8、dependentResourceAmountのみ10、両方4。36 source occurrencesを変身後raw actor込みで36/36対応。修正後の全execution成功とは区別する。
- [x] U0-B/D追加根拠: raw全sourceでtransfer6 occurrences/60 cells、専用charge抵抗producer0、直接BP capacity buff writer1 occurrence/25 cellsが終端damage後であることを確認。disjoint transferの更新順同値性を14,080状態で確認し、未知childは更新前拒否とする設計を採用。間接trait writerも追い、各function後の特性→capacity→point clamp更新を採用。吸収量も対象別の制約として既存inline入力へ投影する。根拠・適用制限は既存flowの実装直前deltaを参照。
- [x] U0-Hの観測待ち3件の採用規則: Chaldea固定commitの最大HP付与/解除、回復double演算、buff整数permille/NP連続比率を参照契約として記録した。3900の回復とmaxHP減少時の現在HP減算を採用。ゲーム実測済みではなく、全HP familyとruntime接続の完了でもない。
- [x] U3-A先行単位: 共通unavailable結果をcalculator/ranking/portableへ接続し、NP不足／容量不足の独自再分類を削除。schema39/engine38、UIとv38回復までquality成功。HP guardに先立つ依存単位で、admission全体の完了ではない。
- [x] U1-R/U0-R先行単位: actor/domain/source input ownerを分離したread descriptor、ordinary/OC consumer、partial observerを実装しquality成功。actor/clock proof全体と全cell実行は未完了。
- [x] U0-H先行単位: 初期最大HPの合計safe integer検査を実装。focused20→unit753→quality成功。初期割合の整数化は設計のみ、live HPと死亡guardは未実装。

#### Step 2の実行単位（Task内、順序・依存関係の正本）

既存U0〜U5のidentityを維持する。U2-H／U2-D／U3は下記の子単位へ分け、親単位を個別に
完了扱いしない。依存欄は技術依存。実装権限は受領済みで、D1〜D8の設計判断は確定した。
残る技術gateは根拠と反例で解消する。既存計画の承認や設計の選択を実行検証完了へ読み替えない。
U0-R/U1-Rの共有join・read契約は各縦断単位の前提であり、これだけをphase完了にしない。
HPはU0-H/U1-H/U2-H.1〜3と該当U3-A/U4を一つの完了境界とする。初期intent→実量更新→
clock別query→NP-use/terminal生存guard→共通結果→repair/portable/reset/装備変更まで検証する。
BP・count・transferも対応するU0/U1/U2と該当U3/U4を縦断して閉じる。技術依存がない単位はHPを待たない。
内部focused検証の細分化は許可するが、先行部品の成功を親単位やTask全体の完了へ置き換えない。
自己レビューでclock producerの欠落を確認したため、詳細反例と技術gateは上記flow deltaへ更新した。
追加監査で、productionにない遷移の数値一般化を実装開始の必須条件にしていたレビュー不足を修正。
直接BP容量buffは終端damage後。間接trait writerは実行対象で、更新順と解除を検証する。未知transfer子処理はfail-closedの実装・回復fixtureへ割り当てる。
HP数値3件はChaldea参照契約を採用済み。2026-09-19にHP系、2026-09-20に独立marker／admissionとBP縦断単位を完了した。下表の完了は各縦断単位に限定し、独立した非HP回復・U5は残す。

| 単位 | 依存・入力となる確定契約 | 実装内容／責務 | 完了を判定する証拠 |
| --- | --- | --- | --- |
| U0-R: 母集団joinとbefore | Step 2依頼・Git照合 | 既存shared auditで全source／normal・LB・NP cellをselected legal program→ordered first reader→outcomeへjoin。terminal HP0 guardもreaderとする。全masterの別loaderは作らない | F1〜F3/C12。基点77be416（親ef45bef）の411/433・420/422と残22件の併存原因を固定。未選択variant・既にcalculated・production0を分ける。production suiteとranking hot pathの同環境・非並行before測定 |
| U1-R: read/write・trigger契約 | U0-Rの関連分類 | execution内のfocused moduleにactor／resource query／phase／position／variant付きreadとwrite、非干渉proofを集約。pipelineのsource/recipient/buff ownerの相対参照と、actor trait/instance traitのproducerも同時に修正。OC、通常resource、compiler、admissionが同じ分類を消費 | C1/C2/C7/C9。直接damage・condition・amount・OC率・NP/HP到達性・form／解除、nested boolean、名前なしtrait/markerを網羅。既存trigger proofを再利用し未知scopeはschema拒否。source全体のunknownで誤除外せず、部分的なno-reader判定を残さない。**独立marker範囲とBP範囲完了（2026-09-20）。** |
| U0-H: HP数値契約 | U0-RのHP cell分類 | 初期permille整数化、HP query別の精度、safe／通常loss、固定／割合、modifier／変換、maxHP付与・解除・form切替をcanonical入力と採用した参考実装へ結ぶ | C3/C7。丸め位置・selector・下限・最大値解除後currentを式で記録。Chaldea該当実装を参考契約とする。初期0%は死亡と確定。実測未取得を開始gateにしない **完了（2026-09-19）。** 最新HandoffとHP validation参照。 |
| U1-H: HP IR | U0-Hで確定したbranch、U1-R | resource別closed amount、loss下限、最大値／量modifier instance、actor/recipientとselectorをpipelineで正規化。NP用unit・subject拒否を他resourceへ無条件流用しない | 全HP cellの意味保存、safeと通常の区別、ParamAdd/ParamMax・OnField・条件付きinstance・解除のfocused fixtures。曖昧・部分metadataはartifact fail-closed **完了（2026-09-19）。** 最新HandoffとHP validation参照。 |
| U2-H.1: initial seedとquery | U0-Hのquery契約、U1-R | 既存initialHp resolverを準備入口へ接続。world quantity assertionとの初期intent重複も処理し、actor別absolute HP／ratio-only／不足を区別してcurrent／maximumから生存、閾値、値式、表示を別queryで導出 | C3/C9。HP1/11000の精度差、0とmissing、外部source ratioのみのread／絶対量read、礼装なしparity。seed再利用による戦闘補正二重加算0 **完了（2026-09-19）。** 最新HandoffとHP validation参照。 |
| U2-H.2: HP transition | U1-H、U2-H.1 | fixed／percent gain/loss、量modifier／変換、最大値instance付与・除去を既存共通transaction draftへ組み込む。全command拒否時にNP・HP・OC・contextとreceiptをrollback | C3/C6/C7/C8。loss下限・heal clamp・端数・最大値解除、source/recipient違い、条件false／proc failure／unknown、途中拒否→retry。新ターン・被攻撃simulatorは作らない **完了（2026-09-19）。** 最新HandoffとHP validation参照。 |
| U2-H.3: ordered pathと攻撃可否 | U2-H.2、U1-R | skill／transform／terminal／automaticのstateをordinary実行へreceiptで渡す。HP write markerをlive queryへ置換。HP0のtyped到達不能をapplication結果まで接続 | C1/C7/C8/C9。HP→条件→NP→OC、付与時／利用時read、terminal HP0・HP正値表示0%、拒否時NP/OC/receipt非消費、preapply二重適用0。NP-only後置passの再削除は不要（実装済み） **完了（2026-09-19）。** 最新HandoffとHP validation参照。 |
| U0-B: BP契約 | U0-RのBP分類。HP実装には非依存 | API定義を固定する取込設計、actor/domain、point/capacity/phase/rate、absentとpoint0、バフ量ベースの段階intentと初期basis・読取時点の対応を確定 | C4。取得hash照合、初期capacity trait、特性付与／解除→capacity再計算→point clamp→後続read、同phase異pointで後続結果が変わる反例、異対象同domain／同対象異domain。全関連read/outcomeの同値性なしに代表pointを選ばない。3300200の最終閾値をcapacityと推定しない **BP範囲完了（2026-09-20）。** |
| U1-B → U2-B: BP IRと更新 | U0-B、U1-R、actor別共通state/query入口（HPの数値契約には非依存） | canonical domainとactor別point／capacityを同じdraftへ追加し、phase/rateをlive導出。addQuantityへのpoint直足し、事前sourceQuantityとの二重解釈を削除 | C4/C7/C8。51 write cells実行＋終端damage後capacity25 cellsのscope証拠、recipient条件、全normal/LB/NP cell、point変化後read、trait由来capacity変更／解除、未知の直接前置capacity buffの拒否とrollback。HP transition全体を依存にしない **BP範囲完了（2026-09-20）。** |
| U0-D: 残る5依存量契約 | U0-Rの依存分類。current-NP量式は完了済み | target／individual／buff計数とtransferを別に確定。selectorと重複計数、donor resource、read snapshot／child commit／抵抗・clampの根拠を記録 | C5/C6。16 occurrence、全cell、量不足／child失敗の非同値反例。現行admit対象の未確定branchを完了へ隠さない |
| U1-D → U2-D.count: 計数量 | U0-Dのcount契約、U1-R | recipientと計数scopeを分離したtyped selectorをIRへ保持。既存population／stackで表現できるqueryだけ再利用し、不足する付与特性instanceを同ownerへ拡張。target人数・individual一致数・buff instance数を別量式として共通NP mutationへ渡す | C5/C8/C9。count0/1/cap、同actor複数一致、解除後count、source違い、既存input修復、normal/LB/NP cell。HP/BPを読まないbranchはそれらの実装完了を待たない |
| U1-D → U2-D.transfer: 依存transfer | U0-Dのtransfer契約、U1-R、HPを読むbranchはU2-H.2 | pipelineでnested childを解決し、同じsource transactionにsnapshot／gain／child結果を保持。enemy charge・player NP・HPを分離 | C6/C8。gain算定量とchild実減少量の差、clamp、既知parent不発。未知の抵抗／自己donor／child procを更新前拒否し、semantic invalid・循環／欠損と区別。対象別量制約の修復とrollback/retry **NP／chargeは既存完了、HPも2026-09-19完了。** |
| U3-A: admissionとoutcome | U1-Rから着手可、完了はU2各branch | applicationがprogram-bound proofとpolicyを合成。optional／structural／automaticを区別し、到達不能・不使用・未知をprofileへ正しく集約 | **完了。** critical-starを含む全production経路、typed reachability、unknown sibling／非選択variantを検証。合法条件のunsupported／invalid／inputRequired 0 |
| U3-Q: 有限quantity候補 | U2各branch、U3-A、D1/D2/D3/D7 | 対象/domain/時点付き初期intentへordered境界の逆像を生成。効果量の組合せから合法な共有stateを解決し、単独効果の最大値を合成しない。amount-only reader／非単調更新を含め、小domainは独立全探索。repair／policy reapplyは既存constructorへ戻す | **完了。** schema-legal小型全探索、baseline保持、最大profile 3,435/4,096、全80条件で候補切捨て0。cap／timeout／ratchet緩和0 |
| U4: identityと回復／UI | U3、各branchのstate契約 | portable／draft／history／worker／cacheをcanonical initial intentへcutover。旧runtime ratio/phase writerを除去。schema／engine／必要なmaster版を同期 | **完了。** repair／policy off-on／without-area／reset／保存復元／upgrade失敗時保持／stale worker／全resource rollbackを同じconstructor・executionで検証。UI変更なし、既存E2Eを維持 |
| U5: 全production数値closure | U4 | 全profile／全variant／80合法条件／stable owned basisをshared auditで検証。現在数値のprofileも含め全damage差を入力・順序・ruleで説明 | C12とDone gate全項目。default433/433・422/422、現行unsupported/invalid/inputRequired0。typed unavailableの全数説明、before比の未説明10%超退行0、最終pnpm quality成功、Task内Deferred／Blocking0 |

- [x] U0の資料・inventory・before測定を完了する（全source／variant／cell、selected program、first reader、state mutation、outcome、recoveryを既存family証跡とcritical-star production joinで閉じた）。
- [x] U0／HP条件: ランキングは選択Lvのmaster HP＋固定HPフォウ1000、通常計算機はさらに装備礼装HPを加算する条件を要件へ反映した。HPフォウ編集UIなし。
- [x] U1／HPデータ: servant／CEのraw HP成長表をcanonicalへ保持し、装備ID・Lv・限界突破から初期最大HPを解決する。欠損の0補完・ATK推定なし。共有inventoryで全対応Lvを検証済み。
- [x] U0-R先行: HP buffの全source・normal/LB cell監査を既存shared inventoryへ追加した。first reader全joinは未完了。
- [x] U0-R追加先行: current structural program 7,255件のsource timelineとpartial reader／HP guard／opaque観測を同じshared auditへ実装。既存ordinary projectionと数値recordsを保持。actor・clock・全cell実行・calculator追加sourceを含むfirst-reader全joinは未完了。
- [x] U2-H先行: NP-only後置passを削除し、NP／OCを共通source transactionへ統合した。順序・確率失敗・rollback／repair・OC別cellを検証。HP実状態の接続完了とは扱わない。
- [x] U2／HP実行接続: actor別HPを共通transaction・条件／値式／NP係数・生存guardへ接続。HP transfer、最大HP変更・解除、失敗時の全resource rollbackまで検証済み（2026-09-19）。
- [x] U3〜U4／HP回復経路: HP候補最大値・入力修復・保存／portable・workerと装備／Lv／NP／OC／form／reset再解決を検証。未装備・明示HP0・不足・不正入力・staleを区別し、desktop／390px／320px実画面を確認（2026-09-19）。
- [x] 独立marker／admissionのU1-R／U2／U3-A／U3-Q／U4（2026-09-20）: 4系統5profileと直接共有する経路の生成→付与・解除／form→時点別読取→候補最大値→damage→回復を接続。35受入・60交差・220共有条件、独立oracle、全resource rollback、実画面、最終qualityを完了。対象内Blocking0。以下の全体チェックは未完了を維持する。
- [x] U0-B／U1-B／U2-Bと該当U1-R／U3-A／U3-Q／U4（2026-09-20）: 705300と共有3300200の定義→actor state→transaction→live read→候補最大値→portable／UIを接続。14条件、全BP cell inventory、独立oracle、全resource rollback、E2E-054、最終qualityを検証。対象内Blocking0。
- [x] U0-D: BP以外のdependent read／commit順を全体closureで再確認し、未所有経路0。独立非HPはcritical-starの5 lineage／174 selected-program mutation／16 writer-reader関係を共通transactionへjoinした。
- [x] U1のIR／read contractを完了した。pipeline以外のraw Atlas解釈、ID／名前／label／raw key runtime分岐0。
- [x] U2のordered transactionを完了した。command失敗時のNP／HP／BP／OC／form／instance／context／receipt一括rollback、前command保持、retry二重適用0。
- [x] U3のapplication／ranking共通経路を完了した。typed unreachable以外のunknown candidateを最大値へ採用せず、小型独立全探索と全productionで最大値を確認。
- [x] U4のidentity／回復／UI不変条件を完了した。UI component変更なし。stable owned、portable／worker／保存復元／reset／upgrade拒否を既存実経路で確認し、engine／scenario evidence差のVRT 4枚を更新。
- [x] U5のproduction／performance／quality gateを完了した。80条件34,640 outcomes、stable owned、parity差分0、candidate hot path退行なし、production wall time差は説明済み、最終quality成功。

実行中の実HPが0になった場合は攻撃不可とする（2026-09-08利用者確認）。表示割合の丸めで0%になったHP正値とは区別する。
初期最大HPと初期0%の製品条件は確定済み。初期0%も死亡・攻撃不可で、分析値として許容しない。
BP開始point入力への変更を承認待ちにしない。バフ量段階から対象別実量への対応と、吸収元／受取先の依存readを技術調査する。
既存入力で閉じない製品上の不足が残った場合だけ具体例を示し最小範囲を確認する。HP・BP・依存量の技術調査は継続する。
U1〜U4は一つのsemantic cutoverの内部検証単位。途中のmaster/schemaと旧consumerを混在させた状態を
公開・完了扱いしない。sessionを分ける場合はflowへ現在のatomic単位と次のactionだけをcheckpointする。
各単位は小型fixtureを`pnpm test:diagnostic -- <affected filter>`で確認し、影響に応じ
`pnpm test:unit`／`pnpm test:production`へ拡大する。phase終了gateは`pnpm quality`のみ。
全masterをcaseごとにcompileせずshared auditを使い、quality後に別のVitest／validate:evidenceを追加しない。

Done gate:

- current published masterの全playable AttackProfileがdefault rankingで`calculated`となり、433 rows／0 exclusionsである。
- default calculatorは422／422 `calculated`で、unsupported／invalid／inputRequired 0件である。
- 自然上限／Lv.90統一 × 四policy × NP1〜5 × capacity内の初期OCとstable owned fixturesで、現行masterのunsupported／invalid／inputRequired 0件。
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
| `RK-UI-001` | Apply | U4: typed input repair／7入力／自動再計算／responsive invariants | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-HANDOFF-001` | Apply | U4: portable canonical basis／reset／upgrade／calculator replay | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-CACHE-001` | Apply | U4: resource basis identity／stale worker rejection／evidence-free cache | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-AUDIT-001` | Apply | `pnpm test:production` 433／433 ranking、422／422 calculator、production nonnumeric outcome 0 | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-PERF-001` | Apply | affected production suite／ranking hot path before-after | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `DOC-REV-001` | Apply | `pnpm test:docs` | approved ranking requirement v0.10.3 |

Handoff: count7profile単位の実装・検証完了（2026-09-13）

- 基点HEAD `0cf5a36`、開始clean。master20260913.12/schema52、portable schema40、engine42.0.0。基点の成功qualityと49条件をbeforeとして継承。
- 候補生成の空quantity重複と人数配置の同値化、対象別function結果→marker→countを実装。通常ranking421→422/433、calculator420/422。49条件のparity、小型oracle、rollback・入力修復、支援sourceとE2E実画面を検証。
- 最終`pnpm quality`成功: unit790／production122／E2E26、warning・unexpected console・retry0、273.759秒。run `2026-09-12T19-46-29-367Z-46-6620ae`。既存calculatedの数値差0件、新規502600 NP2平均21,635.495。ranking hot path中央値3,429.159→3,715.939ms（+8.36%）、production38,663→52,140ms。旧拒否候補の探索と四policy parityを追加した受入testの増加を証跡へ記録。cap/timeout/性能ratchet緩和なし。
- 対象count単位の未達gateなし、scoped Blocking0。TSK全体のmarker/transfer/HP/BP/全条件・owned／全体回復/UIは未完了。
- 正本は[checkpoint](../evidence/ranking-policy-candidate-flow-tsk-06.md#canonical-checkpoint2026-09-13フォローアップ)と既存population-count3証跡、固定Chaldea source契約。次回の開始操作は残ranking11／calculator2件を既存U2-D.transfer・marker/admission・HP/BPの直接reader/writerへ対応させること。今回の成功quality・同条件before・49記録を再利用し、別familyは今回の完了範囲へ混ぜない。
- Git: 検証時は`0cf5a36`＋dirty。2026-09-13の利用者依頼に従い、このHandoffを含むcommitへ今回の実装・test・VRT・証跡を収録する。利用者変更の上書きなし。
- 次の実装候補はU2-D.transferのplayer NP／enemy charge。対象304000・1102300・2500400の選択sourceを現行inventoryへ再joinし、1102300の併存markerも直接経路として扱う。donor snapshot、receiver加算、donor減算、後続NP/OCを共通transactionへ接続し、四policy・rollback/修復・portable parity・候補数/性能で受け入れる。HP transfer（204300・403600）、その他marker/HP/BPと全Task closureは別単位で残す。

Handoff: NP／charge transfer単位の実装・検証完了（2026-09-13）

- 基点`b1759b7`、開始clean。304000・1102300・2500400のtransferと直接併存marker、初期入力／ranking／共通transaction／portable／UIを接続。donor snapshot・算定gain・receiver実増分・donor実減少を分離し、未解決writer／aliasはfail closed。
- 通常NP1/2/5・NP2四policyの21条件は全calculated、calculator/ranking/portable一致。小型oracle、clamp・不足・複数donor、rollback／入力修復と3profile実画面を検証。対象内の残拒否・未達gateなし、scoped Blocking0。
- 最終`pnpm quality`成功: unit802／production124／E2E26、warning・unexpected console・retry0。run `.test-results/2026-09-12T20-50-16-144Z-15-170467`。master20260913.16/schema53、engine43.0.0、portable schema40。
- ranking422→425/433、calculator420/422。既存ranking数値差0件、calculator3件は新たに適用された攻撃50%／Buster20%／防御ダウン20%で説明。候補6476→6500、damage要求2332→2351。hot path中央値3,715.939→3,542.927ms（-4.66%）、production52,140→49,139ms。cap/timeout/性能ratchet緩和なし。
- 正本は[checkpoint](../evidence/ranking-policy-candidate-flow-tsk-06.md#canonical-checkpoint2026-09-13フォローアップ)とnp-transferのsource／validation／delta／performance。残ranking8／calculator2、HP transfer204300・403600、その他marker／HP／BP、全条件・owned／全体回復/UIは別未完。次は既存U2/U3の残reader/writerへ対応させ、成功済み同条件証拠を再利用する。TSK全体in_progress、06.47 blockedを維持。
- 次の作業候補はU2-D.transferのHP transfer（204300・403600）。選択source・nested child・併存拒否理由を現行inventoryへ対応させ、必要なU2-H.2のHP実state／最大HP／生存・下限を直接経路に限って接続する。採用済みChaldea固定commitの該当処理・呼出元・testを使い、donor snapshotからのgain、receiver実回復、donor実減少を区別する。
- 次単位の受入は対象profileの通常NP1/2/5・NP2四policy、calculator/ranking/portable一致、合法候補の最大damage、上限・不足・複数donor・rollback/修復、必要なUI実画面。damage・候補数・影響production／性能を今回証跡と比較する。他のmarker／HP／BP、全条件・owned／全体回復/UIとTask全体の完了へ広げない。既存計画は現行要件で再判断する。
- Git: 検証時は`b1759b7`＋今回差分。2026-09-13の利用者依頼に従い、このHandoffを含むcommitへ実装・test・VRT・証跡を収録する。利用者変更の上書きなし。

Handoff: HP系全体の実装・検証完了（2026-09-19、基点645a3ee）

- **U0-H／U1-H／U2-H.1〜3／HP transfer／HPに関係するU3-A・U3-Q・U4は完了、今回範囲のBlocking0。TSK-06.45全体は未完了。** 初期入力からHP更新・時点別読取・攻撃可否・damage・修復／保存復元・実画面まで同じapplication／executionへ接続した。
- 通常NP1/2/5・NP2四policyの204300／403600／702500計21条件はcalculated、calculator／ranking／portable一致。選択source・nested child・併存拒否を解消し、HP0、入力不足、未知writer／alias／抵抗をtyped outcomeとして区別した。最小HP対象の不明ratioは初期最大HPの修復後に再実行し、NP係数への整数permille fallbackを除去した。
- 小型fixtureで不足／上限／端数／複数donor／最大HP変更・解除／form／生存境界／全resource rollback／HP→NP・OC／内部最大値を検証。E2E-052は実際の3サーヴァント選択、HP0／負donorの修復、保存再読込、装備・Lv・NP・OC・form・resetを実行。E2E-050は土方NP1／NP2の実行時HP92%、E2E-051はOC3のNP効果worker転送を確認した。
- 最終`pnpm quality`成功: unit826／production130／E2E27、warning・unexpected console・retry0、336.078秒。run `.test-results/2026-09-19T13-54-00-780Z-45-f19bd9`。master20260913.27/schema54、engine44.0.0、portable schema40。
- ranking425→427/433、calculator420→421/422。既存424 rankingの数値は不変、702500のNP1平均49,647.410→53,457.900はNP上限と独立したHP減少のadmission／NP係数読取による。calculator403600のNP1平均23,505.15→30,556.84は併存防御ダウン30%の適用、702500はHP更新後の連続NP係数によりunsupported→80,187.10。calculator既定相性は403600が2、702500が1.5で、ranking等倍とは別条件。
- 候補生成6,500→6,516、dedup4,035→4,043、damage要求2,351→2,377、distinct1,445→1,451。HP dependency追加で通常scenario候補は2,412→2,434。ranking中央値4795.091ms、645a3ee収録3,542.927ms比+35.34%、同環境で再現した基点4,081.067ms比+17.50%。各warm1＋serial3、非並行。処理追加と環境変動を分けて記録し、cap4096・timeoutの緩和なし。CPU profileのranking本体inclusive時間（warmup＋3回）は16,638→19,413ms（+16.7%）で、HP依存解析／共通準備・条件state／GCの増加を確認。区間外のhash処理を遅延理由に含めず、feature別の厳密な時間配賦とはしない。
- 共有HP inventory486 source／7,470 cell。990 calculator条件（987 calculated、独立BPの3条件のみtyped unsupported）、108 ranking条件、900 normal/LB礼装条件、211支援・選択branchのcalculator／portable一致。自己／支援、自然上限／Lv.90、NP1/2/5・合法初期OC、四policy・ownedを検証した。HP sourceが既にcalculatedの経路も含む。
- 証跡: [source](../evidence/tsk-06-45-hp-source.json)／[validation](../evidence/tsk-06-45-hp-validation.json)／[delta](../evidence/tsk-06-45-hp-delta.json)／[performance](../evidence/tsk-06-45-hp-performance.json)。固定Chaldea commitの該当実装・呼出元・関連test／定数をhash固定し、HP全cellのsource・recipient・利用時点を記録。実測不足を承認待ちへ戻していない。
- Git: 比較基点は`645a3ee`、現在HEADは並行作業の規約更新commit `9a866b7`（Serena設定`600af5c`を含む）。今回実装・test・VRT・master・正本更新は、2026-09-19の利用者依頼により本Handoffと同じcommitへ収録。Serena設定／AGENTS／README変更を保持し、HP差分へ混ぜていない。最終quality後は文書・証跡のみを更新し、docs・JSON/hash・差分を検証済み。

Handoff: 独立marker／admissionの実装・検証完了（2026-09-20、基点538b83a）

- **対象4系統5profileと直接必要な共有経路のU1-R／U2／U3-A／U3-Q／U4は完了、対象内Blocking0。TSK-06.45全体はin_progress。** canonical marker／actor trait／buff instance／contextReferenceのowner、live reader、program-bound admission、合法順序の最大値と回復を同じapplication／executionへ接続した。
- 35条件は33 calculated、青子の自己バフ除外2条件は変身後NP不足のtyped unavailable。60条件は54 calculated／6 unavailable、共有220条件は213 calculated／対象外BP7 unsupported。採用scenario、初期不足の修復、calculator／ranking／portable一致を記録。小型oracle・rollback／retry・form常時instance失効とactive保持・E2E-053の実画面／保存再読込／NP・OC修復を検証した。
- 最終`pnpm quality`成功: unit834／production133／E2E28、warning・unexpected observation・retry0、324.726秒。run `.test-results/2026-09-19T15-59-14-750Z-15-7cc0c3`。master20260919.4/schema55、engine45.0.0、portable schema40。
- ranking427→432/433、calculator421/422。damage差のcanonical input／更新順／rule、採用scenario、候補増加と性能比較は[checkpoint](../evidence/ranking-policy-candidate-flow-tsk-06.md#canonical-checkpoint2026-09-13フォローアップ)とmarker [source](../evidence/tsk-06-45-marker-source.json)／[validation](../evidence/tsk-06-45-marker-validation.json)／[delta](../evidence/tsk-06-45-marker-delta.json)／[performance](../evidence/tsk-06-45-marker-performance.json)が正本。候補6516→6658、dedup4043→4182、要求2377→2591、distinct1451→1485。ranking中央値4795.091→4999.986ms（+4.27%）、production71,083→72,209ms。前回HP実装の増加は538b83aに含まれ、今回増分へ混ぜない。cap4096・timeout緩和なし。
- Git: 検証時は開始cleanの`538b83a`＋今回差分。2026-09-20の利用者依頼により、今回の実装・test・master・証跡を本Handoffと同じcommitへ収録する。quality後は結果記録だけを更新し、文書検証で閉じた。成功済みbefore・固定Chaldea契約は継承し、再実行しない。
- 次の操作は下記BP生成→利用→回復のsource／reader／capacity条件を現行inventoryへ対応させること。今回のmarker機構をBP実量の代用にせず、未知をfail closedのまま維持する。U5は別の全体closure gateとして残す。

Handoff: BP縦断単位の実装・検証完了（2026-09-20、基点0d279c0）

- **U0-B／U1-B／U2-BとBPへ直接必要なU1-R／U3-A／U3-Q／U4は完了、対象内Blocking0。TSK-06.45全体はin_progress。** Atlas BP定義をpipelineでcanonical domainへ変換し、actor×domainのpoint／capacity state、live phase／rate、trait・instance・form後の再評価、条件・効果量・damageを共通transactionへ接続した。
- 705300の通常NP1/2/5・NP2四policyは7/7 calculated、最大44,251／59,002／73,752と33,715／106,204／21,612／48,628。3300200も7/7 calculated、calculator最大33,725／44,920／56,115、ranking最大27,279／54,419／18,987／37,834。残る拒否0、capacity推定なし。
- 失敗commandはBP・HP・NP・OC・form・instance・context・receiptをrollbackし、前commandを保持。未知witnessを捨てずfail closed、選択NP Lvで最大値を比較する。portable／保存は初期phase intentだけを保持し、E2E-054で段階2、NP2/OC2、保存再読込、攻撃役変更resetを実画面確認した。
- 候補2660→2665、dedup2660→2665、damage要求2591→2596、distinct1485→1489、preparation plan3628→3640。ranking中央値5227.846→5233.421ms（+0.107%）。production step72,209→84,677msはBP受入6testとmaster／inventory ratchet追加を含む。cap4096・timeout・性能ratchetの緩和なし。
- 最終`pnpm quality`成功: unit840／production139／E2E29、skip／todo／retry／warning／unexpected console 0、369.017秒。run `.test-results/2026-09-19T18-26-32-399Z-15-4b8408`、manifest SHA256 `4a8ad3e5e01c8965d41697ad97a0a63054cb61fca28d7c05730b1ba0f04570dd`。master20260920.3/schema56、engine46.0.0。
- 正本は[checkpoint](../evidence/ranking-policy-candidate-flow-tsk-06.md#canonical-checkpoint2026-09-13フォローアップ)とBP [source](../evidence/tsk-06-45-bp-source.json)／[validation](../evidence/tsk-06-45-bp-validation.json)／[delta](../evidence/tsk-06-45-bp-delta.json)／[performance](../evidence/tsk-06-45-bp-performance.json)。次は下記U5／独立非HP経路だけを未達条件から再開し、BPの成功済み同条件を再実行しない。

Handoff: TSK-06.45全体完了（2026-09-20、基点6546340）

- **U0〜U5完了、Task内Blocking 0／Deferred 0。** critical-starの全production経路は5 lineage、174 selected-program mutation、16 writer-reader関係で既存共通transactionへjoinした。別executorやID分岐は追加していない。
- `audit-oc-matrix.ts`はmasterをworkerごとに一度だけload／compileし、80条件を8 shardで監査した。34,640 outcomesは34,600 calculated／40 `unavailableUnderPolicy`、unsupported／invalid／inputRequired 0。40件は全て2501400・自己バフ除外・`insufficientNpGauge`で、両level basis・両conditional policy・合法NP/OC 10組の全数。calculator／ranking／portable parityは34,600/34,600、差分0。
- stable ownedは保有母集団、自然上限／Lv.90／保有Lv、指定／保有NP Lv、NP0、build／ATK欠落、canonical zero、OC capacity、pinned replay、forged／mixed／旧version拒否と旧request/result保持を検証。UI componentは変更なし。engine 47.0.0表示と固定world fact／選択witnessの現在結果に合わせVRT 4枚を更新し、desktop／390px／320pxを確認した。既存E2Eの保存復元・reset・stale worker・回復実経路を再利用した。
- 候補はschema-legal小型全探索とproduction certificateを照合。最大productは2801300の3,435/4,096。80条件合計generated／deduplicated 1,028,810、damage request 967,810、distinct input 233,100、cache hit 734,710。cap／timeout／ratchet緩和なし。
- 06.44 matrixの32,640 calculated／1,960 unsupported／40 unavailableは、現行34,600 calculated／unsupported 0／同じtyped unavailable 40へ収束した。1,960件の数値化は既存count／transfer／HP／marker／BP deltaが説明済みで、本最終closureはdamage式を変更せず重複計上しない。
- ranking hot pathはbefore中央値5,233.421msに対し、warm-up後5,785.606／5,178.735／5,231.173ms、中央値5,231.173ms（-0.04%）。production matrix artifactは`.test-results/tsk-06-45-production-closure`、digest `fec70e2662234685a06819122dedc93a476dc1aba93c904b456388228de46d5b`、manifest SHA-256 `7c2b72b567cd1afae1ee64b9f001002ba136dd637f59411116531602c8127871`。
- master `20260920.3`／master schema56／portable schema40は不変。候補列挙とtyped reachabilityの実行意味が変わるためengineのみ47.0.0へ更新した。最終`pnpm quality`のartifact／件数／hashは実行結果記録として下記machine evidenceへ保持する。
- 正本は[canonical checkpoint](../evidence/ranking-policy-candidate-flow-tsk-06.md#canonical-checkpoint2026-09-13フォローアップ)と[production closure machine evidence](../evidence/tsk-06-45-production-closure.json)。TSK-06.45をdone、依存先TSK-06.46をreadyとする。commitは作成していない。

### TSK-06.46: Ranking world candidate architecture and oracle hardening

Depends on: TSK-06.45

TSK-06.45の現行master production closureを変更前baselineとして再利用し、world候補生成、ordered observation、
同値縮約、代表選択、finite certificateの責務を分離する。後続Taskへ進む前に、初期condition truthだけの縮約では
保証できないmutation後のmaximum completenessを独立oracleで反証し、発見した同familyの不具合と性能要因を閉じる。
新しいdamage rule、UI機能、battle simulator、cap／timeout緩和は対象外とする。

Implementation units:

| Unit | Depends on | 変更責務 | 検証方法・単位完了条件 |
| --- | --- | --- | --- |
| W0 ownership・baseline | TSK-06.45 evidence | `rankingWorld`／candidate space／condition read scope／ordered mutation／certificateのproducer・owner・consumerを確定。34,640 outcomes、candidate inventory、hot path、production file別時間を再利用可能なbeforeとして固定 | 既存artifact hashと対象commitを照合。production再実行は新しい疑義がある条件だけ。誤っていたproduction worker 4固定の説明を実設定とfile別時間へ訂正 |
| W1 world domain | W0 | conditionから必要な物理scopeを収集し、target initial／targetState、exclusive trait、class／attribute／family、external assumption、source-owned state、effect-local decisionを純粋なdomainへ分離 | initial／state／combined、positive／negative、traitCount、all／any／not、production-zeroを小fixtureで固定。effect-localをworld factへ変換しない |
| W2 ordered observation | W1 | programのread positionと`addTrait`／`removeTrait`／`suppressInitialTrait`をtyped observationとして抽出し、executionと同じscope semanticsを消費 | mutation前後、複数read、form／choice、condition false／unknownを網羅。servant ID／名前／label／raw key分岐0 |
| W3 transition-aware quotient | W2 | 全ordered observationで結果が等しいworldだけを同値classへまとめ、その後にassumption数、baseline deviation、stable keyで代表を選ぶ | 初期truth同値・mutation後非同値を縮約しない。baseline保持、unknown保持、materialization件数とcertificate一致 |
| W4 independent oracle | W3 | plannerの生成domainを再利用せず、target／targetState全bit state、短い全program、canonical inputを直接列挙する小型oracleを作る | outcome集合、最大damage、採用scenario再実行、unavailable／invalid／unsupportedがplannerと一致。HP／BP／count／transfer、choice、form、conditional costの非単調反例を既存family oracleと接続 |
| W5 performance・production closure | W4 | profileで確認した箇所だけを最適化し、observation compile、canonical indexing、memoization、制約早期適用を検討。全productionを再監査 | 80条件34,640 outcomes、parity、typed unavailable、damage差を再固定。cap4096／timeout不変。性能は比較値を記録するが固定下限を合否条件にしない。最終`pnpm quality`成功 |
| W6 implementation convergence | W5 | W0〜W5の正しさを維持したまま、candidate pipelineの式・分岐・lookup・中間表現を意味のある小単位へ収束する。ネスト三項演算子、同じunion判定の反復、loop内の定義探索、多段collection変換、到達不能／常時空の中間状態を対象とし、単なる別fileへの移動は行わない | 完了: 名前付きsemantic owner、execution共有判定、常時空／到達不能／反復lookup／未使用引数の削除をfocused 82 tests、80条件closure、最終`pnpm quality`で確認 |
| W7 logical-disjunction convergence | W6 | 対象production codeと直接のcanonical semantic ownerに残る複合`||`を、同じunion分類の反復、異なる判断の短絡合成、正当なboolean semanticsへ分類する。target mutationの採否とstep生成、target trait scope、combined actor scopeを名前付きdomain境界へ集約し、構文だけを隠す汎用helperは追加しない | 完了: typed mutation observation、共有scope semantics、直接consumer移行、focused fixture、lint／typecheck、production 144/144、最終`pnpm quality`を確認。残す`||`は網羅的union分岐またはboolean semanticsとしてevidenceに記録 |

Minimum counterexample:

```text
initial target trait = false
initial targetState trait = true
combined target condition = true
ordered remove targetState trait
later combined target condition = false contribution
```

現行のinitial truthだけのsignatureでは、永続target traitと除去可能なtargetStateを同値にできない。この反例を
単独patchにせず、同じscope × mutation × read-position familyの最小oracleとして扱う。

Done gate:

- world domain、ordered observation、同値class、representative、certificateのsemantic ownerが分離される。
- 同値判定は全read時点で同じ結果となるworldだけを縮約し、mutation後に非同値となる候補を保持する。
- 独立oracleがplanner生成物を入力にせず、outcome集合、最大値、baseline、非数値分類を照合する。
- unknown candidateのcalculated化、局所最大の合成、source-owned stateの外部fact捏造が0件である。
- TSK-06.45の34,640 outcomes、34,600 parity、typed unavailable 40を維持するか、差分をcanonical input・program・mutation・read時点で全数説明する。
- candidate cap 4,096とtimeoutを緩和しない。ranking hot pathとproduction suiteは比較可能な観測値と差分理由を残すが、固定の性能下限を完了条件にしない。
- 対象production codeのネスト三項演算子が0件で、入力origin、trait count比較、all／any簡約、population input分類が名前付きの網羅的判断として読める。
- `compileProgramDomain`はdomainの合成を担当し、transition trait抽出、canonical input分類、代表選択の詳細をinlineで再解釈しない。同じdefinitionの反復検索と同じunion判定の複製が0件である。
- extractionは行数移動ではなく、呼出側がdomain operationの順序を読める境界を作る。未使用引数、到達不能branch、常時空の互換fieldを残さず、observerとexecutionで同じ意味を再実装する場合は共通ownerへ戻すか独立性が必要な根拠を記録する。
- 対象production codeで同じscope／operation unionを分類する複合`||`の反復が0件である。`all`／`any`などcanonical owner内の網羅的union分岐、真のboolean条件、stable comparator fallbackは一律禁止せず、残置理由をW7 evidenceへ記録する。
- flow closureの対象cellがVerifiedまたは理由付きN/Aで、Blocking／Task内Deferred 0。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-POLICY-001` | Apply | focused world-domain／transition-aware quotient／independent oracle | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-EXEC-001` | Apply | ordered trait mutation・read-position parity | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-AUDIT-001` | Apply | 80-condition production closure and calculator／ranking／portable parity | `docs/evidence/tsk-06-46-production-closure.json` |
| `RK-PERF-001` | Apply | comparable ranking hot path and production file-level before／after | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |

Handoff: W0〜W6のcorrectness／production closureをbefore baselineとして保持した。W7では、`rankingWorldObservation`のtarget mutation採否とstep生成を`targetMutationObservationStep`へ、target／combined trait scope分類を`battle-execution/conditionSemantics`の`traitConditionScopeSemantics`へ集約し、condition evaluator、provenance、activation、OC input、operation compiler、effective contributionの再分類を除去した。remove target／targetState、suppress target、attacker／field／addTrait除外、trait／traitCount、mutation後readをfocused fixtureで固定した。observer／executionのsemantic output、candidate cardinality、operation順序はW6と一致したため80条件closureを再利用し、ranking hot pathは診断観測のみ追加した。focused 191 assertions、lint／typecheck、production 144/144、最終`pnpm quality`を完了した。残す`||`はall／any等のcanonical exhaustive union、true boolean semantics、stable comparator fallback、schema narrowingであり、詳細は[W7 evidence](../evidence/tsk-06-46-production-closure.json)へ記録した。Blocking／Task内Deferredは0、TSK-06.46は`done`、TSK-06.47は`ready`。

### TSK-06.47: Contribution decision UI cleanup

Depends on: TSK-06.46

- [x] rowはdistinct `presentationGroupId`によるlogical effect countを維持し、detailは同じgroup配下で各contributionの
      self／condition／areaView decisionとfinal applied outcomeを独立表示する。
- [x] raw `contributionId`、内部enum、operation IDを利用者向け文言として表示せず、canonical presentation metadataと
      exhaustiveなtyped reason-to-label mappingから短い日本語label／説明を生成する。
- [x] policy除外、条件不成立、確率失敗、実行不能、invalid、unsupportedを一つの「計算外」へ潰さず、
      action／state／condition evidenceをfilterせず保持する。
- [x] stack count assumptionを成立条件へ回数付きで表示し、同一logical effectの内部contribution分割を重複計数しない。
- [x] detail開閉、寄与表示切替、一覧filterでdamageを再計算せず、desktop／390px／320pxの密度、overflow、keyboard、
      accessible name、expanded state、focus orderを維持する。

Done gate:

- [x] row count、badge、detail decision、damageが同じeffective contribution集合から導出される。
- [x] raw identity／内部enum露出0件で、各policy axisとfinal outcomeを失わない。
- [x] logical effectとinternal contributionの階層が明確で、NP base sentinelをeffect件数へ含めない。
- [x] component／E2Eでcollapsed／expanded、除外／適用混在、stack count、responsive／a11yを固定する。
- [x] flow closure: `docs/evidence/ranking-policy-candidate-flow-tsk-06.md`のTSK-06.47 deltaがBlocking 0。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-UI-001` | Apply | focused row／detail／badge component tests and Playwright | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-POLICY-001` | Apply | contribution decision／final outcome presentation parity | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-CACHE-001` | Apply | focused worker test and E2E-050; existing calculation cache `profileResults` reuse without cache lifetime／URL change | Handoff |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |

Handoff: TSK-06.46のworld candidate semantic owner、production parity、quality gate完了を前提に着手可能。UIのlogical effect／per-contribution presentationだけを対象とし、ranking damage semantics、candidate generation、execution ownerは再実装しない。

Current bounded-unit handoff（2026-09-21）: UI presentation ownerへgroup／decision／outcomeのtyped日本語mapping、寄与filter、responsive／keyboard表示を接続した。既存calculation cacheの`profileResults`をdetail requestから再利用し、初回detail開閉、寄与filter、一覧filter、再開閉でdamage計算を発生させない。focused unit、typecheck、対象eslint、E2E-050（desktop detail、Enter操作、390px／320px expanded overflow、handoff）と最終`pnpm quality`を通過した（unit 884／production 144／Playwright 29、retry／unexpected console 0、artifact `.test-results/2026-09-20T15-48-05-943Z-15-da4a84`）。詳細は[TSK-06.47 contribution UI closure](../evidence/tsk-06-47-contribution-ui-closure.json)と[ranking policy candidate flow](../evidence/ranking-policy-candidate-flow-tsk-06.md)を参照する。canonical output／digest／support／candidate inventory／parityはTSK-06.48 closureを再利用できる。TSK-06.47は`done`、TSK-06.48は`done`、TSK-06.5は実装開始前の`blocked`だった。06.47 closure時点の実装commitは未作成だったが、現在のcompletion baselineは`197ff30247a09c5f0280b039cb88a7ec7c33a3a4`であり、TSK-06.5の新規commitは作成しない。

### TSK-06.48: Package semantic complexity convergence

Depends on: TSK-06.46

Plan: [package semantic convergence plan](package-semantic-convergence-tsk-06-48.md)

- [x] package全体の機械的分割ではなく、semantic family × package境界で複雑性を収束させる。
- [x] 第1波はdata-pipelineのpopulation familyとし、`normalizePopulationFunctions`のAtlas shape、dependency slice、
      canonical operation／input生成、population trait catalogのownerを分離する。
- [x] dependent resource transfer／HP bounded unitでは、plain dependent-functionの共通shapeをdata-pipeline内のtyped descriptorへ収束し、NP／HP固有のdomain、canonical operation、input definition、ordered execution、candidate semanticsは既存ownerへ残す。
- [x] effect normalization／execution-semantics bounded unitでは、参照operation展開後の未解決support再分類をexecution semantics ownerへ収束し、canonical effect／operation／input、ordered execution、condition、candidate semanticsは変更しない。
- [x] battle-execution operation boundaryでは、canonical operation compiler、ordered preparation、resource read closure、candidate rollbackのowner重複がないことを確認し、production sourceを変更せずfocused consumer fixtureと既存production closureを再利用した。
- [x] calculation-application candidate／world／scenario boundaryでは、scenario／world observation／candidate domain／common execution pathのowner重複を監査し、ranking static semantics内のpreparation source分類だけを局所inventoryへ収束した。
- [x] 第2波以降はdependent resource、effect normalization、battle-execution、calculation-applicationの順に、
      前段のcanonical outputが安定した場合だけ着手する。
- [x] `isOneOf`、`processValues`、条件式wrapper、単なるfile split／行数移動を追加しない。
- [x] absolute speedup、固定wall-clock下限、candidate削減を目標にせず、hot pathへ影響する場合だけ診断値を記録する。
- [x] focused testは変更したsemantic familyに限定し、既存production／parity／quality artifactを無条件に重複実行しない。

Done gate:

- 対象familyごとに現在owner、変更後owner、削除する重複分類、意図的に残す論理和がplanへ記録されている。
- 第1波のpopulation fixture、fail-closed条件、operation order、mutation後read、input keyの境界が実装前に確定している。
- code変更時はcanonical output、operation／input inventory、condition truth、parity、candidate capへの影響を説明できる。
- performanceは影響時の比較可能な診断値だけを記録し、固定性能ゴールを受入条件にしない。
- focused verification、必要時のproduction matrix、lint／typecheck、最終qualityの適用条件がevidenceへ記録される。
- `TSK-06.47`と`TSK-06.5`の既存owner／依存を暗黙に変更しない。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-IR-001` | Apply | symbol inventory／owner boundaryの差分レビュー、`git diff --check` | `docs/tasks/package-semantic-convergence-tsk-06-48.md`／`docs/evidence/tsk-06-48-effect-execution-closure.json` |
| `RK-EXEC-001` | Apply | effect support／ordered operation／condition／mutation-after-read／candidate parity focused fixture | `docs/evidence/tsk-06-48-effect-execution-closure.json` |
| `RK-AUDIT-001` | Apply | production semantic inventory、必要条件を満たす既存80条件×433 profile closureの再利用 | `docs/evidence/tsk-06-48-effect-execution-closure.json`／`docs/evidence/tsk-06-48-transfer-hp-closure.json` |
| `RK-PERF-001` | Apply | candidate domain／hot path変更なし、candidate cap／timeout／ratchet不変の確認 | `docs/evidence/tsk-06-48-effect-execution-closure.json` |
| `DOC-CLOSE-001` | Apply | `pnpm test:docs` | `docs/tasks/package-semantic-convergence-tsk-06-48.md`／Handoff |
| `DOC-LINT-001` | Apply | `pnpm test:docs` | Handoff |
| `DX-HANDOFF-001` | Apply | `pnpm test:docs` | Handoff |

Handoff: 2026-09-20に計画確認済みのため`in_progress`を維持する。population-count bounded unitの開始基点は`49efe62`で、TSK-06.46 W7のcanonical closureをbefore baselineとして保持する。TSK-06.47は`ready`、TSK-06.5は`blocked`を維持する。population-count bounded unitでは、data-pipelineのselector／scope／counting／basis／includePassive／input builder、battle-executionのscope／legality／saturation／live-read、calculation-applicationのcandidate tuple／equivalence／representative ownershipを明確化した。focused 81/81、production 144/144、80条件×433 profile matrix、34,640 outcomes／34,600 parity、candidate 1,028,810／最大3,435／cap 4,096、targeted lint／Prettier／typecheckを確認し、旧W6 record差分0、semantic digest不変を[TSK-06.48 population closure](../evidence/tsk-06-48-population-closure.json)へ記録した。hot-path診断は3サンプル中央値5,748.844msで、固定性能下限は設けない。次のbounded unitはdependent resource transfer／HP semantic familyとした。最終quality未実施の途中段階ではTSK-06.48をdoneへ変更しない。

Current bounded-unit handoff（2026-09-20）: 現行HEAD `46f30a7`を実装基点として、`dependentFunctionNormalization.ts`を共通semantic ownerに追加し、NP／HP normalizerの重複したplain function／cell／child shape分類を削除した。NPのplayer NP／enemy charge、HPのselectedEnemy／otherEnemy／allEnemies、scope、input key、Value／Value2、donor混在、resistance、condition、proc、alias、unknown metadataは各domain ownerに残し、effect normalizationの呼出し順、canonical operation、input definition、ordered execution、mutation後read、calculator／ranking parityは変更していない。focused 47/47、直接consumer 65/65、NP／HP production audit・parity・path 27/27、80条件×433 profile matrixを確認し、34,640 outcomes／34,600 calculated／typed unavailable 40／unsupported・invalid・inputRequired 0／parity 34,600、candidate 1,028,810／最大3,435／cap 4,096を維持した。machine-readable結果は[TSK-06.48 transfer／HP closure](../evidence/tsk-06-48-transfer-hp-closure.json)、flow差分は[ranking policy candidate flow](../evidence/ranking-policy-candidate-flow-tsk-06.md)へ記録した。

Current bounded-unit handoff（2026-09-20、effect normalization／execution-semantics）: 開始時Git HEADは`128189f`で、`effectNormalization.ts::normalizeFunctions`の参照operation展開後support再分類を`executionSemantics.ts::resolveExecutionSemanticSupport`へ移した。raw Atlasのcanonical input／parameter／script evidence解釈、target／route分類、NP／HP／population／markerのspecialized ownerはdata-pipelineに残し、battle-executionはcanonical operationをorderedに適用し、calculator／rankingは同じapplication／execution pathを使用する。public API、canonical effect record／operation／input definition、operation order、condition truth、mutation後read、candidate inventory、calculator／ranking parityに差分はない。focused data-pipeline 23/23、直接consumer 229/229（14 files）、production semantic inventory 14/14、targeted lint／Prettier／typecheckを通過した。operation 15,257、effect 13,875、34,640 outcomes／34,600 calculated／typed unavailable 40／unsupported・invalid・inputRequired 0／parity 34,600、candidate 1,028,810／最大3,435／cap 4,096は既存closureを再利用した。machine-readable結果は[TSK-06.48 effect／execution closure](../evidence/tsk-06-48-effect-execution-closure.json)、flow差分は[ranking policy candidate flow](../evidence/ranking-policy-candidate-flow-tsk-06.md)へ記録した。TSK-06.48は`in_progress`、TSK-06.47は`ready`、TSK-06.5は`blocked`、最終`pnpm quality`は未実施、実装・記録commitは`00ad5db`である。次のbounded unitはbattle-execution operation compiler／ordered execution boundaryである。残り2 bounded unitの計画と、過度な性能ゴール／テストを求めない検証方針は[TSK-06.48 bounded completion plan](package-semantic-convergence-tsk-06-48-completion-plan.md)へ記録した。

Completed bounded-unit handoff（2026-09-20、battle-execution operation compiler／ordered execution）: 開始時HEADは`ad786f0`、production code基点は`00ad5db`であり、docs-onlyのHEAD advanceと混同しない。`operationCompiler.ts::compileEffectCached／compileEffect`、`executionPlan.ts::compileExecutionPlan`、`preparationOc.ts::executePreparationOc`、`resourceQueries.ts`／`resourceSemantics.ts`、`candidateExecution.ts::executeOrderedScenarioCandidate`のsemantic ownerは一意だった。compiler projection、preparation program、runtime binding、preparation gateの反復OC union分類はtyped outputが異なるため残し、production sourceの機械的refactorは行っていない。focused battle-execution／直接application `158/158`、candidate／world／resource audit `34/34`、targeted lint／typecheckを通過し、operation 15,257、effect 13,875、80条件×433 profileの34,640 outcomes／34,600 calculated／typed unavailable 40／unsupported・invalid・inputRequired 0／parity 34,600、candidate 1,028,810／最大3,435／cap 4,096を維持した。machine-readable結果は[TSK-06.48 battle-execution closure](../evidence/tsk-06-48-battle-execution-closure.json)、flow差分は[ranking policy candidate flow](../evidence/ranking-policy-candidate-flow-tsk-06.md)へ記録する。TSK-06.48は`in_progress`、TSK-06.47は`ready`、TSK-06.5は`blocked`、最終`pnpm quality`は未実施、次はcalculation-application candidate／world／scenario boundaryとする。

Completed bounded-unit handoff（2026-09-20、calculation-application candidate／world／scenario）: 開始時HEADは`ee9f00f`、production code基点は`00ad5db`、変更は`packages/calculation-application/src/rankingStaticSemantics.ts`だけである。`scenario.ts::resolveScenario／prepareCalculationScenarioWithPolicy`が利用者意図・canonical input・typed outcomeを、`rankingWorldObservation.ts`がBattleOperationのordered結果観測を、`rankingCanonicalInputs.ts`／`rankingCandidateSpace.ts`がcanonical input domain・population tupleのequivalence／representative・dedupe／capを、`rankingPolicyScenario.ts`／`rankingExecution.ts`が共通ordered executionを所有する。rankingにdamage／resource semantics、raw Atlas vocabulary、別compiler、別candidate generatorの重複ownerはなかった。

`rankingStaticSemantics.ts::compileStaticRankingSemantics`内の`effectChangesPreparation(effect) || hasOcConditionReader(effect)`の3箇所反復だけを`preparationSources`へ局所収束した。これはcategory 1の反復union分類であり、category 2のtyped変換、category 3の網羅union、category 4のcondition／uncertainty／mutation／finite admission／typed fail-closedは残した。public API、canonical effect／operation／input key、support分類、order、condition truth、mutation-after-read、calculator／ranking parity、candidate inventoryに差分はない。focused 6 files／38 tests、targeted eslint、typecheck、Prettier、git diff、docs integrityを確認対象とし、matrix再実行不要の根拠と診断値は[TSK-06.48 calculation-application closure](../evidence/tsk-06-48-calculation-application-closure.json)へ記録する。80×433 closureは34,640 outcomes／34,600 calculated／typed unavailable 40／unsupported・invalid・inputRequired 0／parity 34,600、candidate generated／deduplicated 1,028,810／最大3,435／cap 4,096を維持する。hot-path診断中央値は`6069.754ms`だが、固定受入条件・ratchetではない。

最終`pnpm quality`はartifact `.test-results/2026-09-20T13-57-20-457Z-15-8ba814`で成功した。unit 883、production 144、Playwright 29、warnings／unexpected console／retry 0、duration 408.29秒、manifest SHA-256 `82e55ed669cfa31f0b53cf6716479c36d63140d69a848af737e4dd4348b1e1fc`である。実装・記録commitは`3e98828`。技術的Blockingと残りbounded unitはなく、Done gate 1〜5を満たしたためTSK-06.48を`done`へ遷移する。TSK-06.47は`ready`、TSK-06.5は`blocked`を維持し、追加のrefactorや別Taskへの拡張は行わない。

### TSK-06.5: Ranking theoretical maximum and production closure

Depends on: TSK-06.47

- [x] requirement v0.10.2までにcutoverしたcanonical comparison／contribution／action admission／outcome／portable runtimeを変更せず、
      production全skillのstatic semanticsと、action × initial resource × ordered path × AttackProfileの
      candidate-local eligibility inventoryを最終固定する。
- [x] 自己バフありでは選択policy上の実効寄与を持つ任意skillをadmitし、表現済みデメリットを全operation込みで実行する。
      通常のみ／成立込みの各合法initial stateで完遂不能なcandidateだけを落とし、compatibleな特攻／条件効果／field／costを
      一つの合法scenarioで最大化することを全数監査する。
- [x] 排他的player choiceが一branchだけを選び、cost、後続state、attack NP到達可能性込みの最終平均damage最大branchと
      small exhaustive oracleで一致することをproduction inventoryへ固定する。
- [x] conditional-only skill、unconditional＋conditional sibling、NP消費／増加、beneficial／detrimental state、trait grant、
      form transition、branchごとにcostが異なるplayer choice、action後にattack NPへ到達不能となるpathのfocused fixtureを
      production occurrence／0件ratchetへ接続する。
- [x] candidate soundness、small exhaustive finite maximum oracle、自然上限／Lv.90統一 × 四policy × NP1〜5 × 合法初期OC、
      stable owned fixture、production contamination／omission、portable／calculator parity、candidate数／performanceを
      最終baselineとして再固定する。
- [x] 旧operation-ID projection、旧portable reader、compatibility flag、parallel compiler、旧policy fallbackがproduction／
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
- TSK-06.42の母集団／レベル／宝具Lv、TSK-06.43のmaximum stack、TSK-06.44の初期OC、TSK-06.46のworld候補proof、TSK-06.47のpresentationを含む最終matrixが閉じる。
- TSK-06.45で現行masterの全playable攻撃宝具が計算可能となり、unsupported／invalid／inputRequired順位外0件を維持する。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-IR-001` | Apply | canonical source-program／step-operation／candidate-local role production inventory; nested IR is consumed unchanged | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-EXEC-001` | Apply | production transaction／resource reachability ratchet＋focused regression | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-POLICY-001` | Apply | four-policy contamination／omission and theoretical-maximum oracle | `docs/evidence/ranking-policy-candidate-flow-tsk-06.md` |
| `RK-AUDIT-001` | Apply | `audit-oc-matrix.ts`／`merge-oc-matrix.ts` final level basis × four-policy × NP1〜5 × legal initial OC maximum／eligibility／damage delta inventory | `docs/evidence/tsk-06-5-production-closure.json` |
| `RK-HANDOFF-001` | Apply | final selected scenarioのportable replay／minimal Web handoff regression | `docs/evidence/portable-calculation-identity-flow-tsk-06-1.md` |
| `RK-PERF-001` | Apply | ranking hot pathを変更前後各3回 | `docs/evidence/tsk-06-5-production-closure.json` |
| `DOC-REV-001` | Apply | `pnpm test:docs` | approved ranking requirement v0.10.2 |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |

Handoff: 2026-09-21にproduction全数inventory／finite maximum／parity／legacy-removal／quality／docs gateを完了した。static semanticsは469 servants／433 AttackProfiles／7,255 source programs／15,172 source uses／36,275 semantic programs／347,595 operations／485,895 conditions／4,930 input definitions、unsupported／invalid program 0、digest `a1dc814fb04c5ed67ea86606590bf317fb37639ccbe77efa028b6401f3a24f2d`で閉じた。candidate-local admissionは33,760 observations／580,400 dispositions（optional 496,398、structuralRequired 11,840、policyNoOp 705,522、unsupported 0）、candidateはgenerated／deduplicated／upper bound 1,028,810、最大3,435／cap 4,096、calculated 967,810／unreachable 55,090／unsupported 5,910／invalid・inputRequired 0、digest `27671eea7012e2b145ceb6575c498e8261a23ac3f949dfaa12a554bf83a76f18`である。80条件×433 profileは34,640 outcomes／34,600 calculated／typed unavailable 40／unsupported・invalid・inputRequired 0／parity 34,600、qualityはunit 884／production 144／Playwright 29、warnings／retry／unexpected console 0、artifact `.test-results/2026-09-20T17-46-02-843Z-15-496d83`で成功した。machine-readable evidenceは[TSK-06.5 production closure](../evidence/tsk-06-5-production-closure.json)、flowは[ranking policy candidate flow](../evidence/ranking-policy-candidate-flow-tsk-06.md)を参照する。TSK-06.47／06.48は`done`を維持し、TSK-07は`blocked`のまま、このinventory／digest／handoffを唯一の入力として再開する。新規commitは作成しない。

### TSK-07: Web／worker一括切替

Depends on: TSK-06.5

- [x] requirement v0.9.6時点のランキング条件を5項目へ切り替える（historical cutover）。
- [x] worker protocol、URL、cache key、detail evidenceを同じcontractへ切り替える。
- [x] 旧special attack／field入力、reader、fallbackを削除する。
- [x] Webをcanonical presentation modelの描画とcommand dispatchへ限定する。
- [x] TSK-06.42の比較条件とTSK-06.44の初期OC追加によるv0.10.2の7入力を前提にnotice、cache lifetime、
      stale response rejection、responsive／a11yを再検証する。旧5-field fingerprintを互換pathとして残さない。
- [x] TSK-06.41でVerifiedとなったselected ranking → calculator immediate handoffを前提に、二軸noticeと
      result／effect parityのUI表示を再検証する。
- [x] calculatorの「通常の計算条件へ戻す」が同じscenario／version contextを保持し、execution intentだけを
      `calculator + initialNpGauge 10000 + standard`へ置換することを再検証する。target／field facts、canonical inputs、
      stochastic facts、ordered actions／choiceなどscenarioの状態は保持し、ranking policy／intentはrequestのhidden stateへ
      残さない。
- [x] 二軸intentを含むfingerprintでsummary／detail cacheとstale response rejectionを閉じ、worker detail 0件、
      React active detail最大1件を実装・検証する。
- [x] Webの順位外表示を5 outcome classへ切り替え、`inputRequired`、`unsupported`、`invalid`、
      `unavailableUnderPolicy`を別文言で表示する。`inputRequired`だけは同じAttackProfileのnormal calculatorを開き、
      `invalid`は原因別reset／reload、`unsupported`は非回復として扱い、いずれも数値rowを生成しない。

Done gate:

- 新旧policy、URL、worker protocolをruntimeで併存させていない。
- selected candidateの二軸版付きWeb handoff／immediate parityをcurrent schemaで回帰させず、noticeが両軸を表示する。
- ranking由来noticeが両policy軸を表示し、通常条件resetが同じscenario／version contextのままexecution intent、result、
  fingerprintをatomicに置換する。
- true normal reset後にscenarioのworld facts／inputs／stochastic／actions／choiceが保持され、ranking policy／intentだけが
  requestから除去される。result／fingerprintはcalculator identityへ切り替わる。
- `inputRequired`／`unsupported`／`invalid`／`unavailableUnderPolicy`が別表示され、numeric fallback rowが0件である。
- worker summaryはevidence-free、worker detail cacheは0、React detailは最大1件である。
- desktop、390px、320pxでoverflowがない。
- keyboard、accessible name、expanded state、focus orderを維持する。
- stale responseが表示へ反映されない。

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-UI-001` | Apply | focused component test、`pnpm test:e2e` | `docs/evidence/tsk-07-notice-reset-closure.json` |
| `RK-HANDOFF-001` | Apply | TSK-06.41 minimal handoff regression＋two-axis notice／interaction E2E | `docs/evidence/tsk-07-notice-reset-closure.json` |
| `RK-CACHE-001` | Apply | worker／React cache cardinality、stale detail tests | `docs/evidence/ranking-web-worker-cutover-tsk-07.md` |
| `UI-CALC-001` | Apply | context notice／two-axis normal reset／focus E2E | `docs/evidence/tsk-07-notice-reset-closure.json` |
| `RK-AUDIT-001` | Apply | worker／calculator／ranking parity check | `docs/evidence/tsk-07-notice-reset-closure.json` |
| `TS-PERF-002` | N/A: UI／reset publication only; worker／candidate hot path unchanged | - | `docs/evidence/tsk-07-notice-reset-closure.json` |
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
  semanticsはTSK-06.43、contribution decision表示はTSK-06.47が所有する。TSK-07はこれらを再実装せず、
  notice／recovery interaction／bounded cache／responsive／a11yの最終closureだけを所有する。
- Current bounded-unit handoff (2026-09-21): `RK-CACHE-001`を実装し、worker summary cacheをcontext内の直近成功1件
  （rows＋typed exclusionsのみ）へ制限した。worker detail cacheは0件とし、detailはsummaryのcurrent fingerprintと
  entryを検証してrequestごとにmaterializeする。Reactはrequest ID／fingerprint／entry IDを一つだけ保持し、close、
  row置換、条件／context変更後の古いdetail／errorを適用しない。7入力fingerprint、candidate／calculator／ranking／
  portable outputは不変で、worker detailは既存summaryと同じarea-support境界を使用する。focused 11/11、直接consumer
  33/33、typecheck、対象lint／format、E2E-050 2/2、hot-path 3サンプル（中央値5,779.623ms、rows 433、exclusions 0）を
  通過した。最終`pnpm quality`もunit 885／production 144／Playwright 29、retry 0、warnings 0、unexpected console 0、
  artifact `.test-results/2026-09-20T18-30-46-341Z-15-f4fdde`で成功した。machine-readable結果は[TSK-07 cache closure](../evidence/tsk-07-cache-closure.json)、flow deltaは
  [ranking Web／worker cutover](../evidence/ranking-web-worker-cutover-tsk-07.md)へ記録した。これはRK-CACHE-001完了時点の
  historical handoffであり、最終統合closureでTSK-07は`done`へ更新した。上記のnotice／normal
  reset bounded unitの差分は次のhandoffへ記録する。five-outcome全画面表示、responsive／a11y全体、TSK-08は未達である。

- Current bounded-unit handoff (2026-09-21): 二軸ranking noticeとcalculator handoff parityを現行schemaで再検証し、
  `CalculationContextNotice`は開始NP、`selfBuffs`、`conditionalEffects`、versionを表示する。明示的normal resetは
  retained scenario executorをexecute-before-publishで呼び、calculator intent／開始NP100%／新fingerprintへ
  atomicに切り替える。同じscenario／version contextを保持し、target／field facts、canonical inputs、activation／stochastic facts、
  ordered choice/actions、effect decisions、candidate evidenceはscenarioに残したまま、ranking policy／intentだけをrequestから除去する。
  reset失敗時は旧request／result／
  fingerprintを保持し、typed errorをnoticeへ表示する。CalculatorRouteのmutation identityで古い非同期commitの
  workspace再公開を拒否し、成功時はresult focusへ戻す。RK-CACHE-001のworker summary 1件／detail 0件／React detail
  1件とrequest／fingerprint／entry stale rejectionは維持する。focused 42 tests、typecheck、対象lint／format、
  E2E-050／E2E-051（各2/2）を通過した。machine-readable結果は[TSK-07 notice/reset closure](../evidence/tsk-07-notice-reset-closure.json)、
  flow deltaは[ranking Web／worker cutover](../evidence/ranking-web-worker-cutover-tsk-07.md)へ追記した。これは統合前の
  historical handoffであり、TSK-06.5／06.47／06.48は`done`のまま、commitは作成していない。次のbounded unitは5 outcome表示／recoveryであり、
  full `pnpm quality`は`.test-results/2026-09-20T19-18-55-246Z-73-bbda97`でunit 886／production 144／Playwright 29、
  retry 0、warnings 0、unexpected console 0として通過した。responsive／a11y全体、TSK-08は未達である。

- Current bounded-unit handoff (2026-09-21): 順位外のcanonical exclusionがAttackProfile、required input、reason、typed
  recoveryを保持するようにし、`calculated`だけがnumeric rowを生成する境界をworker payload／React表示まで維持した。
  `inputRequired`は同じAttackProfileをapplicationのpreparation plannerで解決して通常calculator intentを構築し、
  `unsupported`／`unavailableUnderPolicy`は原因表示だけ、`invalid`は原因分類に応じたresetまたはreloadだけを提示する。
  detail errorもstatusを保持し、同じprofile handoff、reload、再試行のcommandを混同しない。worker summary最大1件、
  worker detail 0件、React active detail最大1件、request／context／fingerprint／entry stale rejectionは維持した。
  focused 37 tests、typecheck、対象lint／formatを通過し、machine-readable結果は[TSK-07 outcome closure](../evidence/tsk-07-outcome-closure.json)、
  flow deltaは[ranking Web／worker cutover](../evidence/ranking-web-worker-cutover-tsk-07.md)へ追記する。production candidate inventory、
  support status、数値output、calculator／ranking／portable parity、fingerprintは不変条件を満たして再利用する。
  これは統合前のhistorical handoffであり、TSK-06.5／06.47／06.48は`done`、TSK-08は未開始、commitは作成していない。全responsive／a11y closureと
  最終`pnpm quality`はTSK-07統合closureで実行する。

- Current bounded-unit handoff (2026-09-21): desktop、390px、320pxのranking row／expanded detail／順位外exclusion／required
  input／recovery command／calculator noticeを、既存のsemantic ownerのまま横overflowなく表示できるようにした。rowの
  `aria-expanded`／`aria-controls`、servant＋NPを含むaccessible name、typed exclusionのstatus／reason、required-input listと
  recovery buttonの`aria-describedby`、calculator noticeのheading／version／reset descriptionを追加し、既存のglobal
  `:focus-visible`を維持した。invalid reset後は`role=status`へfocusを戻し、keyboard Enter、focus order、390px／320pxの
  expanded detail／長いreason／複数buttonをE2Eで確認した。`calculated`だけのnumeric row、4つのtyped exclusion、同じ
  AttackProfile handoff、二軸notice／normal reset、worker summary 1件／detail 0件／React detail 1件、stale gateは不変である。
  変更はpresentation／CSS／test／E2Eに限定し、application、worker protocol、canonical fingerprint、candidate inventory、
  production output、calculator／ranking／portable parityへ影響しない。machine-readable結果は[TSK-07 responsive／accessibility closure](../evidence/tsk-07-responsive-accessibility-closure.json)、
  historical flowは[ranking Web／worker cutover](../evidence/ranking-web-worker-cutover-tsk-07.md)へ追記する。focused 10 tests、
  direct consumer 55 tests、typecheck、対象lint／format、E2E-050 2/2、E2E-051 2/2、E2E-014／015／016 4/4、E2E-002 2/2
  （overview／expanded detail axe serious／critical）を通過した。`pnpm test:docs`と最終`pnpm quality`は通過し、最終quality artifactは
  `.test-results/2026-09-21T03-55-07-915Z-15-120d12`、unit 890／production 144／Playwright 29、retry 0、warnings 0、unexpected console 0
  である。これは統合前のhistorical handoffであり、TSK-06.5／06.47／06.48は`done`、TSK-08は開始していない。性能診断、
  candidate削減ratchet、固定wall-clock目標、timeout緩和はUI-onlyのため設定しない。

- Final integrated closure (2026-09-21): portable reset now preserves the retained scenario and version context and
  changes only execution intent to `calculator + initialNpGauge 10000 + standard`; the calculator execution boundary
  derives effective OC1 from that intent while the scenario remains unchanged. Reset, scenario edit, current history copy,
  historical regeneration, version upgrade, ranking handoff, finalizer, navigation, undo, and profile import all share the
  App-owned calculation mutation gate. A stale fingerprint or durable-write completion is rejected before workspace/session/
  route publication, and the durable profile queue publishes request/result/fingerprint/draft as one replacement. The
  focused reset fixture verifies scenario/version retention and failure retention; four stale-publication order cases cover
  scenario edit, reset, current history copy, and historical regeneration. Changed source/test paths are
  `packages/schema/src/index.ts`, `packages/calculation-application/src/{portableCalculation.ts,scenario.ts}`,
  `packages/battle-execution/src/sourceCollection.ts`, `apps/web/src/app/{App.tsx,CalculatorRoute.tsx,RankingRoute.tsx,
  rankingHandoff.ts,portableDraft.ts}`, `apps/web/src/features/calculator/Calculator.tsx`, and their focused/E2E tests.
  Focused tests (34), E2E-050 (2/2), E2E-051 (2/2), typecheck, targeted lint/format, and `pnpm test:docs` passed.
  Final `pnpm quality` passed with unit 895, production 144, Playwright 29, retry 0, warnings 0, unexpected console 0;
  artifact `.test-results/2026-09-21T05-40-21-470Z-15-a881eb`. Production inventory, candidate count, support status,
  calculator/ranking/portable parity, fingerprint contract, cache cardinality, and worker stale gates remain unchanged.
  TSK-07 is `done`; TSK-08 is `ready`; no commit was created.

### TSK-08: Production audit最終収束とfailure diagnostics

Depends on: TSK-07

- [x] TSK-06.5が生成した唯一の全AttackProfile × NP1〜5 × 四policy inventory／digestを、data-pipelineと
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

Handoff:

Current bounded-unit handoff（2026-09-21、production parity diagnostics／artifact reachability）:

開始HEADは`34828eaa03500d3688ab7af7f9a39d3a1649d639`、既存の利用者差分は`apps/web/next-env.d.ts`だけである。TSK-06.5のinventory／digest／candidate／production output／parity、TSK-06.3のparent／child manifest・checksum・bounded summary、TSK-07のworker／cache／stale mutation evidenceを再利用条件として固定した。

今回のbounded unitは、`packages/calculation-application/src/productionParityDiagnostics.ts::compareProductionParity`をsemantic ownerとし、`productionClosureAudit.ts::auditProductionClosure`のcalculator／portable比較へ接続した。失敗は`executionNotExecutable`と`canonicalMismatch`のtyped reasonへ分類し、`conditionKey`・profile identity・path・canonical identity・`firstCanonicalAuditDifference`のidentity／path／expected／actualを保持する。expected／actualの完全値はartifactへ残し、runnerのsummaryは既存の上限を維持する。public API、canonical input、fingerprint、candidate inventory、production output、calculator／ranking／portable parityの成功値は変更していない。

runnerはFGO reasonを解釈せず、genericな`artifact-declarations.json`を読み、宣言artifactの相対path・形式・存在・bytes・SHA-256を既存`verifyArtifactFiles`へ渡す。outside path、欠落、改変は`artifact_failure`へfail closedする。intentional failure fixtureはcanonical field差分とnon-executable status差分を一件ずつ固定した。

focused／unit／production、runner fixture、typecheck、targeted lint／format、docs、最終`pnpm quality`を通過した。最終qualityはunit 895／production 144／Playwright 29、warnings／unexpected console／retry 0、artifact `.test-results/2026-09-21T06-56-31-238Z-15-f189f7`、manifest SHA-256 `d431fd4a87b46772606027a151d077bedc0912628589aff3074f896ec08b2bd3`である。diagnostic artifactは`unit/production-closure-parity-diagnostics.json`、SHA-256 `c8573b8951847b2280f05d20334b4352b1c8a182e0d86ce66dd48740a3dbe65c`で、machine-readable evidenceは[TSK-08 parity diagnostics](../evidence/tsk-08-parity-diagnostics.json)へ記録した。

未達は、TSK-06.5の全80条件inventory／digestをdata-pipelineとcalculation-applicationの共有audit modelへ接続すること、全production parity／unsupported／invalid／partial commit／inert control／stale mutationのratchet化、Deferredのlegacy aggregate auditor（`quantityConditions`前提）とold loader／scan／candidate list／duplicate fixtureの削除である。次のbounded unitは、既存producerを一つに保ったままfull matrixとpackage audit modelの到達性を接続する。candidate生成、damage semantics、canonical input、別digest正本、別generator、TSK-09系は開始しない。

差分がcanonical identity、support status、candidate inventory、production output、parityへ及んだ場合は、このTaskを停止し、canonical owner・影響範囲・再実行範囲とTSK-06.41／TSK-06.5 reopen要否をevidenceへ記録する。TSK-06.5／06.47／06.48／TSK-07は`done`、TSK-09.1／09は`blocked`のまま維持する。

Current bounded-unit handoff（2026-09-21、TSK-06.5 source／shared audit model connection）:

開始HEADは`5d82e380593987a602af2214dd35d9e220fd1b1a`、利用者差分は`apps/web/next-env.d.ts`だけである。TSK-06.5の`docs/evidence/tsk-06-5-production-closure.json`を唯一のsource referenceとして検証・投影する`@fgo-lab/master-data/production-audit`の共有modelを追加した。`createTsk065ProductionAuditSource`はstatic semantics digest、candidate eligibility digest、80条件×433profileのmatrix digest／outcome／parityを再計算せず保持し、candidate／damage semanticsのproducerにはなっていない。

既存`compileDataPipelineProductionAudit`と`compileCalculationApplicationProductionAudit`のartifactへ、同じsource referenceとproducer identityを持つ`connectProductionAuditBoundary`のboundary modelを接続した。`audit-oc-matrix.ts`（single run）と`merge-oc-matrix.ts`（sharded run）は`connectProductionAuditMatrix`でTSK-06.5のmatrix digest、eligibility digest、outcome、parity、condition/profile countを比較し、最初のcanonical field差分でfail closedする。runnerは引き続きgeneric artifact declaration／checksumだけを扱い、FGO reasonを解釈しない。

public API、canonical input、fingerprint、candidate inventory、production output、calculator／ranking／portable parity、TSK-06.5／TSK-06.41 statusに差分はない。intentional failure fixtureはsource invalid、master version mismatch、duplicate canonical identity、matrix condition／digest mismatchを固定した。machine-readable evidenceは[TSK-08 shared audit model](../evidence/tsk-08-shared-audit-model.json)、boundary artifactは`.test-results/2026-09-21T14-55-36-672Z-15-ce7f10`内の`production-audit-data-pipeline.json`／`production-audit-calculation-application.json`を参照する。

focused 6、direct consumer 3、runner 53、production 144、typecheck、targeted lint／Prettier、`pnpm test:docs`、最終`pnpm quality`は成功している。qualityはunit 897／production 144／Playwright 29、warnings／unexpected console／retry 0、artifact `.test-results/2026-09-21T14-48-58-184Z-15-00d5e2`、manifest SHA-256 `764c0ff9b0068cd0a6da45ebfb743f03843ffe646d3f3095c4c0401134d7d2d`である。production matrixは既存TSK-06.5 artifactを再計算せず、接続関数とfuture single／merge producer pathへ接続したため、性能計測、candidate ratchet、timeout緩和は追加していない。

未達は全production parity／unsupported／invalid／partial commit／inert control／stale mutationのratchet化と、Deferredのlegacy aggregate auditor（`quantityConditions`前提）・old loader／scan／candidate list／duplicate fixtureの整理・削除である。次の作業者は`packages/master-data/src/productionAudit.ts`のsource／boundary／matrix connector、両packageのproduction audit test、`audit-oc-matrix.ts`／`merge-oc-matrix.ts`、および本evidenceを最初に確認する。source digest、inventory、support status、production output、parity、first difference、artifact checksumに差分が出た場合は停止し、影響範囲とTSK-06.41／TSK-06.5 reopen要否を記録する。TSK-06.5／06.47／06.48／TSK-07は`done`、TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。

Current bounded-unit handoff（2026-09-22、typed full-production parity gate）:

開始HEADは`be27827e7b3e9c488d425a2c8aa4e2b9dfe7592e`、利用者差分は`apps/web/next-env.d.ts`だけである。`productionParityDiagnostics.ts::evaluateProductionParityGate`を追加し、TSK-06.5の`tsk-06.5:production-matrix`とfull audit summaryをcanonical順序で比較する。結果は`passed | failed`のtyped unionで、`matrixMismatch`／`parityFailure`、canonical identity、first difference、全parity failureを保持する。single／merge consumerはmanifestを書いてから非0終了するため、failureのbounded summaryと完全artifactを失わない。candidate生成、damage semantics、canonical input、fingerprint、production成功値、calculator／ranking／portable parityの意味は変更していない。

既存TSK-06.5 shard artifactを再計算なしでmerge consumerへ接続したところ、master bytesのSHA-256はshard identityと一致し、matrix digest `c70909a19909b838b9b645a95567136d9875252cfd36170481834854c1d05120`、outcome 34,640、parity 34,600／failure 0も一致した。一方、merge境界はshardごとのadmissions／candidates digestを保持するだけでtop-level `eligibility.digest`を生成せず、first canonical differenceは`tsk-06.5:production-matrix:eligibilityDigest`（expected `27671eea7012e2b145ceb6575c498e8261a23ac3f949dfaa12a554bf83a76f18`、actual missing）となった。source digestを代入する、候補／damage semanticsを再計算する、別producerを追加することはせず、明示したstop conditionでbounded unitを停止した。詳細は[TSK-08 parity ratchet](../evidence/tsk-08-parity-ratchet.json)、停止artifactは`.test-results/tsk-08-parity-gate-stopped/manifest.json`（SHA-256 `c8f0c6147a947591d9d072890528c5868b931e3347d488b63fa57e82b64ff7bd`）を参照する。

focused 1、typecheck、targeted source lint／Prettier、`pnpm test:docs`、`pnpm test:runner` 53件、`pnpm test:production` 27 files／144 testsは成功した。productionは初回並列実行で既存data-pipeline ratchet 10件が一時失敗したが、同一file単独14/14と再実行27/27で再現せず、今回差分の直接経路ではないことを確認した。full parity ratchetは未完了であり、`pnpm quality`はこのblocking merge boundaryを解消する次bounded unit後に実行する。

停止時点のcanonical ownerは`rankingEligibilityAudit.ts::RankingEligibilityAuditAccumulator`、影響範囲はmerge artifactのeligibility digest接続だけである。TSK-06.41／TSK-06.5のreopenは不要。次の作業者は`merge-oc-matrix.ts`のeligibility materialization、各shardのtop-level audit、`tsk-08-parity-gate-stopped/manifest.json`を最初に確認し、records-preserving digestを同一sourceへ接続できない場合は再度停止する。残りのunsupported／invalid／partial commit／inert control／stale mutation、legacy cleanup、TSK-09系、性能／timeout緩和は未着手である。

Current bounded-unit handoff（2026-09-23、records-preserving eligibility digest／full-production parity）:

開始HEADは`be27827e7b3e9c488d425a2c8aa4e2b9dfe7592e`。既存TSK-08差分、evidence／Tasksの未コミット更新、および利用者変更`apps/web/next-env.d.ts`を保持した。`RankingEligibilityAuditAccumulator`がcandidate eligibilityの既存ordered record streamを8つのcanonical condition partition別hasherへ流し、full single runは8 partition digestを結合し、既存8-shard runは各partition digestをそのままmergeする構造にした。shard 0を現在のproducerで実行し、candidate eligibility digest `446bb1a34bdf95d579216ec0533027969881c9aeb2349813ce087a0b6fcfe266`が保存済みTSK-06.5 shard 0と一致した。10条件すべてでcondition record digest、candidate inventory、outcome、parity countの差分は0件である。fresh shardのaggregate audit digestは新たな`elapsedMs`測定を含むため過去shardと異なるが、matrix source digestは変更していない。

`merge-oc-matrix.ts`はcanonical partition 0..7のmanifest一式とmaster checksumを検証し、既存candidate digestを`combineRankingEligibilityPartitionDigests`で結合する。master-dataの`productionAuditMatrixRecords`がsingle／merge双方のactual `eligibility.candidates.digest`をTSK-06.5 `eligibilityDigest`へ投影し、connectorとtyped gateで共有する。既存TSK-06.5の8 shardを読み直してcandidate／damage計算を行わずにfull gateがpassedとなり、matrix digest `c70909a19909b838b9b645a95567136d9875252cfd36170481834854c1d05120`、eligibility digest `27671eea7012e2b145ceb6575c498e8261a23ac3f949dfaa12a554bf83a76f18`、outcome 34,640、calculated／parity 34,600、unavailable 40、parity failure 0がsourceと一致した。通過manifestは`.test-results/tsk-08-parity-ratchet/merge/manifest.json`、SHA-256 `30101b9690355603def36d404cd1b0297d8b9a5a6ad089f0a1377be85d8d4aa4`である。

single／merge scriptは計算済みgate failureと、master checksumなどの早期failureをmanifestへ保存してから非0終了する。checksum fixtureではexpected `2d9f1b19ed40452fda3571932ee1e37bf9fe85fdfa903404c853d7cde269e46a`／actual `c8f0c6147a947591d9d072890528c5868b931e3347d488b63fa57e82b64ff7bd`を含むfailure manifestを保存した（`.test-results/tsk-08-parity-ratchet/failure-checksum/manifest.json`、SHA-256 `3e3878c1f0ac1b2030bfcc07234fc27a59e5c06a8c5bcd4e8178e1f78114384f`）。focused fixturesはeligibility digestの欠落／不一致、matrix digest不一致、partition欠落／重複、全parity failureを保持する。runnerは引き続きgeneric artifact reachability／checksumだけを検証する。

source eligibility／matrix digest、static/candidate inventory、support status、production damage record、calculator／ranking／portable parityに意図した差分はない。focused 8 tests、`pnpm test:production` 27 files／144 tests、`pnpm test:runner` 53 tests、`pnpm typecheck`、target source lint／format、`pnpm test:docs` 6 testsが成功した。最終`pnpm quality`もunit 898／production 144／Playwright 29、retry／warnings／unexpected console 0で成功し、artifact `.test-results/2026-09-23T09-10-02-161Z-15-3e8208`、manifest SHA-256 `fc5b7162a26150d14130aea4d6ebfb818bb0e5c6a79257d3769bdc247e52843b`である。qualityのNext typegen後に開始時の`apps/web/next-env.d.ts`利用者差分を復元し、`pnpm exec tsc -b --pretty false`も通過した。machine evidenceは[TSK-08 parity ratchet](../evidence/tsk-08-parity-ratchet.json)である。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。

single unsharded 80-condition auditも試行したが、12条件後にfull gate前で意図的に中断した。個別の`satisfied`条件が135,616ms／152,410msを要し、全80条件を逐次再実行するより、同じ全conditionを含む8-shard merge gate成功と実producer shard／focused testを採用した。このpartial runはsuccess evidenceではなくmanifestもない。生成済みcondition recordは`.test-results/tsk-08-parity-ratchet/single/`に残り、machine evidenceにも未完了として明記した。

次のbounded unitはunsupported／invalid／partial commit／inert control／stale mutationの全件ratchetである。legacy aggregate auditor／old loader／scan／candidate list／duplicate fixtureの整理、性能比較、TSK-09系は今回開始していない。TSK-06.41／TSK-06.5 reopen、TSK-06.5 source digest更新は不要。

Current bounded-unit handoff（2026-09-23、final-profile outcome ratchet）:

開始HEADは`f31029209205d4becdff2d13fb2b2553e5fa0486`、worktreeはcleanで、`apps/web/next-env.d.ts`はignore済みだった。slice Aとして`evaluateProductionFinalOutcomeGate`を追加し、最終profileのunsupported／invalid／inputRequiredを個別typed failure、canonical identity、first differenceで判定する。single／merge consumerはratchet結果を既存`audit`の外の`executionRatchets.finalProfileOutcomes`へ保存するため、TSK-06.5 matrix digestには混入しない。candidate-level statusとcandidate eligibility digest、production resultは変更していない。

focused testは3/3、target ESLint／Prettier、`pnpm typecheck`が成功した。最後のfocused artifactは`.test-results/2026-09-23T13-38-32-692Z-15-93482d/manifest.json`（SHA-256 `da5e3544b9a5c4907db57e55f7cfbe157f1bc4419e1bb28f3d9be7e0eda51a2c`）。既存TSK-06.5の8 shardを再mergeし、final outcome gate pass、matrix digest `c70909a19909b838b9b645a95567136d9875252cfd36170481834854c1d05120`、eligibility digest `27671eea7012e2b145ceb6575c498e8261a23ac3f949dfaa12a554bf83a76f18`、34,640 outcomes／34,600 parity／final unsupported・invalid・inputRequired 0を確認した。manifest `.test-results/tsk-08-slice-a-merge/manifest.json`のSHA-256は`2622d2b3a1a4df0f3c26ad4cc523285c6d5009507432b6198e2a160123ec1b56`。Node `DEP0205` deprecation warningが1件出たがmergeは成功した。

fixture assertionの失敗artifactも保持する。canonical first-differenceのkey順期待誤りは`.test-results/2026-09-23T13-29-09-120Z-15-2b2fec/manifest.json`（SHA-256 `1498f1267265cdcc11d402ab0c91c9f2e8a23bc03f2e52342a919306959b53f8`）、aggregate status数に対応するprofile identity不足は`.test-results/2026-09-23T13-34-53-639Z-45-6edbec/manifest.json`（SHA-256 `b0097708ad944afb30940ef68ed71207bc848ccd48569e8612b2ab59d7835dfd`）、duplicate identity fixtureの期待failure list不足は`.test-results/2026-09-23T13-36-46-233Z-45-d6a627/manifest.json`（SHA-256 `7bd4612da23fd82274ae7a1a646018582488b43ddcf1a639d21f07d19b81e173`）である。各manifestはcomplete runner artifactとdiagnostic artifactのchecksumを保持する。詳細は[machine evidence](../evidence/tsk-08-parity-ratchet.json)にある。

未達はpartial commit／receipt、inert control、stale mutationのowner観測とfixture、全ratchetのfresh full-production接続、全件merge、要求されたproduction／runner／docsと最終qualityである。ここでTSK-08全体または全ratchetを完了扱いにしない。次は既存battle-execution transactionとordered operation経路へ限定observerを接続する。TSK-06.5 source digest／inventory／support status／production output／parityは変更しない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。

Current bounded-unit handoff（2026-09-23、preparation command/action/receipt consistency and rollback recovery）:

開始HEADは`94ce2e02605aac9a84c97ee513df854a21b0a687`。既存`auditProductionClosure` recordの`scenario.preNoblePhantasmPlan`と`appliedPreparationActions`を既存production observerへ接続した。semantic ownerは`preparationTransaction.ts::planPreparationResourceTransaction`／`reducePreNoblePhantasmAction`と`ocState.ts::isConsistentNpOcUseReceipt`で、別producer／別ownerは追加していない。計画commandとapplied actionの順序・内容、NP actionのcanonical action ID、receiptのgauge／base OC／内部整合性、適用後gaugeを照合し、productionではcalculated 34,600 profile全件を期待する。gateとcondition artifact metadataはcanonical TSK-06.5 `audit`の外にある。candidate-level statusは変更・再解釈せず、slice Aのfinal-profile unsupported／invalid／inputRequired gateも独立させた。

部分適用fixtureはBP／HP／NP／context／receiptを書いた後のunsupported operationで拒否し、結果が元stateと値・参照の両方で一致することを確認する。その後の`currentGaugeRatio` readは復元された10,000 gaugeを読み、500‰のgainで15,000になる（部分適用が残れば16,500）。成功fixtureはskillからattack NPへの順序、command/action一致、receipt action ID／適用内容、NP全消費を照合した。production record接続はfocused test内の既存audit 1条件／1 calculated profileでpassした。これは全production証拠ではない。

`audit-oc-matrix.ts`はcondition recordのpath／bytes／SHA-256をmanifestへ記録する。mergeはcanonical shard割当ての80 condition、condition key、path、JSON、identity、bytes、SHA-256を既存generic verifierで検証し、欠損・checksum mismatchを非0終了する。古いTSK-06.5 shardを入力した欠損宣言／意図的SHA mismatch fixtureは`.test-results/tsk-08-slice-b-checksum-failure/manifest.json`（SHA-256 `e2bf072f62f23b099971551fb72cf3077c6b5796abf7b3b1f81a5821498b6c0b`）に完全結果を保存した。matrix digestは`c70909a19909b838b9b645a95567136d9875252cfd36170481834854c1d05120`のままだが、このmergeはartifact宣言とpreparation ratchetがないため失敗しており、成功証拠ではない。

focused 66 tests、target ESLint／Prettier、`pnpm typecheck`は成功した。focused runner manifestは`.test-results/2026-09-23T14-15-07-094Z-15-e79d6c/manifest.json`（SHA-256 `442fa78295d694ba6e1c9fd040c51d308fc37b2e34b707916fd044a2139ec15c`）、preparation transaction diagnosticは`production-preparation-transaction-diagnostics.json`（SHA-256 `1b24d86d5981294fb9a7937b827ed3651288e151c14ed193872c0884fa153b8b`）である。初回recovery fixtureの入力不足／500‰期待値誤りの失敗manifestもmachine evidenceにpathとchecksumを保持した。TSK-06.5 digest／inventory／support status／production output／parityに差分はない。未達はproduction全件のfresh shard／merge、inert control、stale mutation、およびproduction／runner／docs／quality gateである。TSK-08は`in_progress`、TSK-09.1／09は`blocked`のまま維持する。次は既存production controlのon/offがoperationまたはdamageへ届く経路を、area-policy alternate detailも含めて接続する。

Previous bounded-unit handoff（2026-09-24、inert-control event identityの再計画で停止）:

開始HEADは`5d9540f403f9d2be9ed2e67b770f8339db17ed7e`でworktreeはcleanだった。inert-control試行は`productionParityDiagnostics.ts`のtyped gate、既存`productionMasterInventory.test.ts`からのordered-event observation、production closure gate fixture、selected／`withoutAreaAlternate` execution fixtureを変更した。変更は未検証のためstage／commitしていない。`apps/web/next-env.d.ts`は引き続きignore済み。

focused command `pnpm test:diagnostic -- packages/calculation-application/src/productionClosureAudit.test.ts packages/calculation-application/src/productionMasterInventory.test.ts packages/calculation-application/src/scenario.test.ts`は32.59秒で44 tests中42 pass／2 fail。`pnpm typecheck`はfocused command前にpassした。area alternate fixtureはselectedとwithout-areaのordered event、canonical input、effective contributionを両方確認してpassした。production inventory gateは1590 projectionを収集したが、73 diagnosticsでfailした。reason数は`userControlOperationEventMissing` 50、`userControlNpSpecialInputNotChanged` 19、`userControlDidNotReachOperationOrDamage` 2、`userControlInputBindingUnsupported` 2。summaryはselected profile 1590、without-area alternate 0、direct input difference 1557、operation outcome difference 1421、event projection outcome difference 1547、damage result difference 1549である。これらは未解決診断で成功証拠ではない。

最初のcanonical identityは`production:control-inventory:owner:101700:profile:default:path:selectedProfile:projection:np:["101700",0,"101703"]:5336:class:alterEgo:operation:np:["101700",0,"101703"]:5336:damage:contribution:np:["101700",0,"101703"]:5336:damage:npSpecial:enabled:operation-event`。typed reasonは`userControlOperationEventMissing`。first differenceは`contributionId`で、control projection側の期待値は`np:["101700",0,"101703"]:5336:damage:npSpecial`。同じoperation IDのordered eventは`np:["101700",0,"101703"]:5336:damage:npBase`を持つため、現在のobserverはtyped projection-to-event relationを確定できていない。control projectionの`:npSpecial`とoperation eventの`:npBase`を同一contributionとみなさず、effective contributionの`resolvedValue`も根拠にしない。

他のdiagnosticには、owner `106600`のsynthetic trait-count projectionでon／off両方の`npSpecialMultipliers`が`[1.1,1.1,1.1,1.1,1.1]`の例、owner `1000100`の`attackBuff` controlとowner `3300200`の`ignoreDefense` controlでoperation event／damage input／rowsが変わらない例、owners `205000`／`505600`の`actor-form` projectionにdamage input bindingがない例がある。意味上の分類やfallbackは行わず、次の調査対象として残す。

test runnerは診断テスト失敗後に宣言済み`production-inert-control-diagnostics.json`の欠損も検出し、run全体を`artifact_failure`にした。完全な失敗結果は`.test-results/2026-09-23T14-56-22-736Z-15-aa9e93/manifest.json`（SHA-256 `6a3ff15cc1500f7460e47bb35d26ad10e867b41ace14e099bb8eef287664bbeb`）、`vitest.json`（`9d9fbbeb4cdd03f355fdb5464526282d4c7e78d81d4bb80ad639cc4dbe7c3b09`）、`stderr.log`（`033d7e3e73ff539f2758a6f3ea99adeea31ce2c3c25c28ebf1edb3fd4914e894`）に保存されている。manifestは完全なstdout／stderr artifactも宣言し、欠損diagnostic artifactをfailureとして記録する。別個の`production-inert-control-diagnostics.json`は生成されておらずchecksumはない。

次の最小調査は、`candidateExecution.ts`／`projection.ts`のordered event projection生成と`effectiveContributions`、`npDamageOperation.ts::applyNpDamageOperation`の`npSpecialMultipliers`への伝達を読み、synthetic `:npSpecial` projection、operation eventの`:npBase`、selected execution inputの関係をtyped identityのまま確定すること。その後、上記19／2／2 diagnosticsを各canonical identityとfirst differenceから分類する。これらのowner／意味を確定するまで再実装、範囲拡張、成功扱いをしない。次の実行はコード調査と改訂bounded planの提示であり、TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。TSK-06.5 matrix digest比較はこの試行では行っていない。

Current bounded-unit handoff（2026-09-24、実装前調査完了・記録専用slice）:

ユーザー承認範囲は調査、限定診断、Taskに紐づく記録、文書検証とcommitである。製品実装計画の承認ではない。開始HEADは`aa032edf2c5f08833026beda982f6d2806b0a0fb`。前回から残る`productionParityDiagnostics.ts`、`productionMasterInventory.test.ts`、`productionClosureAudit.test.ts`、`scenario.test.ts`の4ファイル（969 additions／10 deletions）は、HEAD・差分SHA-256・各ファイルSHA-256を診断前後で照合し保持した。今回commitはこのTask、evidence index、`tsk-08-parity-ratchet.json`と、版番号を同期する文書registryだけを対象にする。`apps/web/next-env.d.ts`はignore済みのまま保持する。

[機械証跡](../evidence/tsk-08-parity-ratchet.json)の最新`boundedUnits`が、4 ratchetの0件定義、production母集団／除外、producer／owner／consumer、直接の保存・消費経路、composition／alternate／mutation／recovery fixture、変更候補、失敗artifact契約、sliceと検証計画を所有する。全73 diagnostic identityを40 controls／33 ownersへ対応付け、既存applicationが選んだexecutionをプロセス内の観測hookで採取した（11.190秒）。追加18観測（12.160秒）でHP／BP成立経路、7件のcount修復、form再有効化、NP evaluatorの実readを確認した。追跡ソースと実行結果を変更していない。以前のdirty source snapshotは保存されていないため、今回の診断を前回sourceの認証や成功証拠へ置き換えない。

確定した分類は次のとおり。50件のevent欠損診断は25 synthetic projectionsのon/offであり、`:npSpecial`と`:npBase`を別identityのまま選択されたinput／readへ接続する必要がある。7件のstack/world assertion矛盾はtyped unsupportedで、count修復後にcalculatedへ復帰した。HPは500‰から準備回復後752‰を読み、成立入力ではon/off差が出る。BPも成立時にignoreDefense operation差が出る。null modifierのform control 2件はform／variantで観測し、非攻撃NPへの変更によるunsupportedと復帰を隠さない。

**実装上のBlockingは3 familyで確定した。** `TSK-08-INV-B1`はstateTraitの10 controlsで、offのprojection／effective contributionが非適用なのに特攻multiplierが残る。原因はNP evaluatorが無効化されたlocal decisionとは別に自然traitをOR評価する経路である。`TSK-08-INV-B2`はowner `2501400`のmagicBulletで、toggleのattacker world factがform変換時に消え、選択NPはon/off共通のattackerState count 3を読む。`TSK-08-INV-B3`はowner `403400`のtargetRarityで、quantity-only条件をtoggleが設定できずnullと中立multiplierが残る。これらは既存control／projection／execution ownerの責務であり、audit側の分類緩和、別owner、numeric fallbackでは解決しない。現在の「damage semantics／canonical input／source不変」の境界内で0件成功とは扱えない。調査の未完了として同じ調査を繰り返すのでなく、製品修正の別途bounded planが必要なBlockingとして残す。

partial commitは成功receiptの適用内容と、途中失敗時の正確なrollback＋recovery readを別々に検証する。preparation command全体のrollback、candidateExecutionのgroup rollback、group開始前のform／variant preapplyを同じ境界としない。stale mutationは同じcandidateのcanonical seed → typed mutation before/after → 後続readを観測し、`battle:criticalStars`の69 → cap 99 → read 99を正確に扱う。TSK-07のstale response証拠を置換しない。without-areaは`rankingPolicyCandidates.ts`の実際のalternate detail／input／effective contributionsを観測する。前回inventoryのalternate 0は網羅証拠ではない。

完全な診断artifact 76件と観測scriptをchecksum照合し、archiveへ保存して中身も照合した。archiveは`.test-results/tsk-08-investigation-record-20260924/complete-diagnostic-artifacts.tar.gz`（SHA-256 `25b9966bb6ea66dbfcdbcbe7cd1785929ba18316a0b31039da00f16b166ac12b`）。canonical identity、typed diagnostic reason、共有`firstCanonicalAuditDifference`によるfirst difference、完全な各観測とchecksumは`.test-results/tsk-08-preplan-control-followup-20260924/findings.json`（`264dd4c32b288805fd08109e74c8a47e478dc0080b4d56bcd31825ac84196639`）と`artifact-manifest.json`（`329a166796c3a648787b68be6fc30a82365b793ddd4c743da99a5bd15836b05e`）へ接続する。reasonの追加案は診断用で、production union実装ではない。前回73件、44 tests中42 pass／2 fail、欠損によるartifact_failureは失敗のまま保持する。

既存8-shard merge成功とeligibility digestはparity限定で再利用する。前回4 shardの92／92／140／140はshard単位で、manifestが参照するのは各10 conditions、合計40である。237〜258秒は調査した重いconditionの時間で、shard全体ではない。condition時間合計は約479／498／748／770秒だった。将来fresh full監査が必要なら8 canonical shardsを最大4並列・2 wave（概算16〜26分）で実行する。既知Blockingがある現時点では再実行しない。

次は記録されたC1（artifact／選択execution）、C2（rollback／read continuity）、C3（inert semantic gate）、C4（fresh全件接続）の計画レビューと、B1〜B3の製品修正境界の承認である。各sliceは独立に実装・検証・記録が揃ってからcommitする。製品実装後はfocused、target lint／format、typecheck、production／runner／docs、最終source確定後のqualityを必要とする。今回の文書sliceはREADME所定のformat／docs／参照・artifact整合で閉じる。`pnpm test:docs`はregistry版同期後に成功（6 tests、docs integrity passed）。初回2回のregistry不一致は失敗logとchecksumを残した。完全artifact・参照・既存4ファイル差分の照合も成功し、結果は機械証跡に記録した。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持し、TSK-08全体もinert-control実装も完了扱いにしない。

Current bounded-unit handoff（2026-09-24、S1 final-profile shard gate）:

ユーザー承認済みのbounded planからS1を実装・検証した。指定HEAD `71056afb1f4b98634f61f53465645b28a55fe985`を基点に`/tmp`のisolated cloneで作業した。元worktreeの未検証4ファイル差分（SHA-256 `6f061eeab8572bc47e996b69a1be680da4a42f7ad44d131b8a9a0cc473209348`）とignore済み`apps/web/next-env.d.ts`は変更していない。

`productionFinalOutcomeShardDifference`を共有audit diagnostics ownerへ追加し、`merge-oc-matrix.ts`が各shardのgate欠損、status／identity／firstDifference／failures形状不正、gate内expected／actual不一致を既存`finalProfileOutcomes`へcanonical identity failureとして渡す。既存のunsupported／invalid／inputRequired明細は保持する。`productionClosureAudit.test.ts`では、一つのartifact declaration ownerから全production diagnosticsを宣言し、runnerがJSON・bytes・SHA-256を確認した。machine evidenceは[TSK-08 parity ratchet](../evidence/tsk-08-parity-ratchet.json)のboundedUnitsを参照する。

focused `pnpm test:diagnostic -- packages/calculation-application/src/productionClosureAudit.test.ts`は1 file／4 tests／skip 0で成功した。最終manifest `.test-results/2026-09-23T17-00-42-404Z-15-aebd6d/manifest.json`（SHA-256 `f97ed3c8c505a80158643daccbe25b8b37a0070f416ec5e9ae0ed1314319acf4`）がfinal-profile diagnostics（`production-final-outcome-diagnostics.json` SHA-256 `a1bba2e74d5a7885f2b5bf3b93a4ffb3e205222f2e8613e95c348eb2da750662`）を含み、artifact verification errors 0である。target lint、format、typecheckも成功した。修正前のfixture期待値・passed gate形状の誤りと、filterによるskipをrunnerが拒否した完全manifestはmachine evidenceにchecksum付きで保持した。

TSK-06.5のsource／eligibility／matrix digest、candidate status、production output、parity、damage semantics、canonical input、cacheは変更していない。S1はmerge fail-closed closureのみであり、inert control、partial commit／recovery、stale mutation、全production ratchetの成功を主張しない。B1〜B3は引き続きblocking。次はS2でselected target／BP witness executionとactual without-area detailを同一実行から運び、再実行を観測に使わない。次のS3ではtransaction rollbackとread continuityを接続する。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。S1 implementation／evidence commitは本commit。

Current bounded-unit handoff（2026-09-24、S2 selected execution observation transport）:

S1 commit `0f7b549f912010ccaf9bdb29db93ec6885d4f5db`を開始点とし、承認済みplanのS2を実装した。`executeOrderedScenarioWithAuditObservation`は通常の`executeOrderedScenario`を観測用allocationで包まず、実際のcandidate comparisonが選んだexecutionからtyped operation eventとraw target candidate identityを採取する。candidate index／identityの不整合、candidate list欠損はfail-closedである。`prepareCalculationScenarioWithPolicy`は実際に選ばれたBP witnessを同じprepared executionへ保持し、`evaluatePreparedCalculationScenario`まで同じobservation referenceを運ぶ。`calculateRankingCandidateSet`はselected detailと実際のwithout-area alternateを同一candidate keyへ結び、input／effective contributionの参照を保持する。戻り値のpublic plan／candidate executionからobserver payloadを除去し、通常のexecution result、canonical input、profile selection、cache identityは変えない。

既存production BP pathでowner `3300200` phase-1 requestはwitness point 5を選び、candidate 0は`pretender`／`beast`だった。公開inputのtargetは従来どおりrelative/redactedの`null`／`unknown`で、ordered effect適用後のfinal battle-point phaseは2である。area fixtureは別scenarioを再実行せず、同じranking calculation内のselected detailとwithout-area alternateのcandidate key、input、effective contribution、party-wide ordered eventを個別に照合した。

focused command `pnpm test:diagnostic -- packages/calculation-application/src/scenario.test.ts packages/calculation-application/src/productionBattlePointPaths.test.ts`は2 files／42 tests／skip 0で成功し、最終manifest `.test-results/2026-09-23T18-11-46-568Z-28-9c974f/manifest.json`（SHA-256 `408f1f637f9c8539c176ee5c08da8bf84ea770490d7079edb8ae17b7562ce633`）にvitest、artifact declarations、`selected-execution-observation.json`のchecksumがある。選択execution artifactのSHA-256は`bd13f4183b6ff3f35b7c0b6332dc944127ec9a95a6a1ef64695c486d4a656ea8`。`pnpm typecheck`、対象11 TypeScript filesのESLint／Prettier check、`pnpm test:runner` 53 tests、`pnpm test:docs` 6 testsもpassした。最終コードの実測はfocused runner 25.131秒、typecheck 18.274秒、lint 8.874秒、format check 1.387秒だった。

S2は73件の診断を再分類せず、production user-control inventoryも再実行していない。unsupported／invalid／inputRequiredのfinal-profile 0件、40 controls／33 ownersの分類、B1 stateTrait 10 controls、B2 owner `2501400` magicBullet、B3 owner `403400` targetRarityは従来のBlocking状態を保つ。S2 focused testとは別にclosure／inert synthetic fixture 5 testsもpassしたが、対象3 source/test filesの変更は未commitのS4差分に残り、production inventory成功を意味しない。以前のBP期待値誤りとinert fixtureのcanonical expected/actual不一致の完全manifestはmachine evidenceにchecksum付きで残す。

開始時4 dirty pathのうち`scenario.test.ts`は、selectedとwithout-areaを実際の同一candidate calculationから観測するfixtureへ置き換え、このS2 commitへ含める。残る未stage差分は`productionParityDiagnostics.ts`、`productionMasterInventory.test.ts`、`productionClosureAudit.test.ts`だけで、combined diff SHA-256 `12f588406b96ad9115c09a6d4188fe113595f10dd3ab42e339cf5a429d9ac4ef`。この3ファイルはS4用に保ちS2へ混入させない。ignore済み`apps/web/next-env.d.ts`はSHA-256 `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`のローカル状態を保持し、stageしない。machine evidenceは[TSK-08 parity ratchet](../evidence/tsk-08-parity-ratchet.json)の最新S2 `boundedUnits`を参照する。

次はS3でpreparation command／action／receipt、execution group rollback、同一candidateのmutation前後とrecovery readを別transaction boundaryとして検証する。`battle:criticalStars`は69 → cap 99 → read 99を正確に扱い、TSK-07 stale-response evidenceを変更しない。TSK-06.5の34,640 outcomes／34,600 calculated-parity／40 unavailableとfinal-profile unsupported／invalid／inputRequired各0、source／eligibility digest、inventory、production output、parity、damage semantics、canonical input、cacheは変更していない。known B1〜B3が残るためfresh full productionと最終qualityはまだ実行しない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`のまま維持する。S2 implementation／evidence commitは本commit。

Current bounded-unit handoff（2026-09-24、S3 selected execution-group rollback and same-candidate mutation/read recovery observation）:

S2 commit `c43bf64ad3b0c3634fce951a8ae977529bfb0f30`から、execution observerだけを拡張した。`executeOrderedScenarioWithAuditObservation`が同じcandidate executionから、pre-group context resolution、実際の`effectTransactionKey`ごとのordered group、group内で一時適用されたoperation IDs、typed issue、mutationのbefore／attemptedAfter／afterTransaction、rollback後のbattle state／damage input一致を運ぶ。`condition.ts::evaluateCondition`は実際の`inputQuantity` leafが`liveInputQuantity`から読んだ値をoperation／sequence／group indexとともに記録する。通常の`executeOrderedScenario`経路にはtrace配列やread callbackを作らない。手書きS4 fixture互換のため`candidateState`型はoptionalだが、production ratchetでは欠損を成功や0件として扱わずfail-closedにする。

同一candidateのschema-legal fixtureでは`battle:criticalStars`の69 + 40がcap後99となり、後続readerの実readが99でcondition satisfiedになることを記録した。rollback fixtureでは先行modifierのtentative application後にunrepresentable star operationがtyped `unsupportedOperation`を返し、group全体のsemantic state／damage inputがgroup開始時へ復元された。別skill actionの後続groupは同じcandidateで20を読んだ。複数effectが同skill action内にある場合は実際の共通`transactionGroupId`で同一groupになることも失敗artifactから確認し、recovery readは別actionへ置いた。preparation command/action/receiptの同条件証拠は以前のbounded unitから再利用し、再実行していない。

focused commandは2 files／51 tests／skip 0で成功した。manifest `.test-results/2026-09-23T18-48-04-213Z-15-e6038a/manifest.json`のSHA-256は`cef696af4ed7e0c25a3b7261fd2dec1c5e5bed68236de4f247f7966dc7cf8a9b`。mutation/read artifact `tsk-08-star-mutation-read.json`は`e371a9ec025b858baa7094cfb71ad3e19455084c5241b5aae7c28fbf4df34344`、execution-group rollback artifact `tsk-08-execution-group-rollback.json`は`f4c7d9a13f9d630d97a5b580538fe286fde7075a320270d671256313c5dc94a3`。workspace `tsc -b`と既存Next生成型を使ったWeb `tsc --noEmit`、対象ESLint／Prettierは成功した。`pnpm test:runner`、`pnpm typecheck`、`pnpm test:docs`のwrapperは依存status確認中にexternal pnpm SQLite storeを開けずscript開始前に失敗したため、runner testは同じ`node --test`引数を直接実行して53/53成功、typecheckはworkspace buildとWeb `tsc`を直接実行して成功、docs testは`node --test scripts/docs-integrity.test.mjs`の6/6と`node scripts/docs-integrity.mjs`を直接実行して成功した。Next typegenは行わず、ignore済み`apps/web/next-env.d.ts`はSHA-256 `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`の状態を保持した。未stageのS4用3ファイルはcombined diff SHA-256 `12f588406b96ad9115c09a6d4188fe113595f10dd3ab42e339cf5a429d9ac4ef`のまま保護している。

失敗したfocused attemptのmanifestとchecksumもmachine evidenceに保持した。最初のrecovery-read fixtureは同一transaction group内にreaderを置いており、group rollback前の読取だった。後続のidentity assertion失敗はexplicit `transactionGroupId`をfallback identity経由で検索したfixtureの誤りだった。いずれも最終focused artifactに置換せず、試行artifactとして記録した。

S3はproduction inventoryを再実行しておらず、73 diagnostics／40 controls／33 owners／18 follow-up observations、B1〜B3のBlocking、TSK-06.5の80 × 433 = 34,640 outcomes（34,600 calculated/parity、40 unavailable、final-profile unsupported／invalid／inputRequired各0）を変更・再解釈していない。TSK-06.5 digest／inventory／production output／parity、candidate status、canonical input、damage semantics、cache、TSK-07 stale-response evidenceも変更なし。`pnpm test:production`は既知B1〜B3があるため実行せず、`pnpm quality`も全source slice未完了のため延期した。機械証跡は[TSK-08 parity ratchet](../evidence/tsk-08-parity-ratchet.json)の最新S3 `boundedUnits`を参照する。

次は残る3つのS4差分を現行要件と照合し、既存production user-control inventoryからselected／without-area executionとこのmutation/group traceをcanonical identity単位で接続する。missing trace、typed reason／first difference欠損、failure artifact／checksum不一致はfail-closedにする。B1〜B3を分類緩和で消さず、state／ownership／damage semanticsの変更衝突が見つかったら影響作業を止めて再計画する。TSK-08は`in_progress`、TSK-09.1／09は`blocked`のまま維持し、TSK-08全体の完了は主張しない。S3 implementation／evidence commitは本commit。

Current bounded-unit handoff（2026-09-24、S4 production control/mutation consumer review; stopped for replan）:

S3は`bf10aed9f1d94914835845e1b42cf31db6588565`でcommit済み。保存していたS4用3ファイルを現行のinventory／alternate／mutation／artifact要件に照合したところ、production observationsが`selectedProfile`だけで、`withoutAreaAlternate`の代表fixtureがgateにないこと、gateがS3の`candidateState`／実際のmutation・read・rollback observationを消費していないこと、期待値に過去baselineの1590を固定していること、production failure artifactをassertion前に保存する経路がないことを確認した。これらは監査側の緩和や分類では解決できないためS4範囲を止めた。

canonical identity、typed finding reason、first difference、コード根拠は[TSK-08 parity ratchet](../evidence/tsk-08-parity-ratchet.json)の最新stopped-for-replan recordと`.test-results/tsk-08-s4-replan-review-20260924/inspection-findings.json`（SHA-256 `d19816cf88f9067b40a3fde55477af411c4a1564b4f321404b1e60688ff29ca5`）に記録した。このJSONはコードレビューfinding artifactであり、test outputやproduction audit成功証拠ではない。以前のfocused failureではmanifest `6a3ff15cc1500f7460e47bb35d26ad10e867b41ace14e099bb8eef287664bbeb`、Vitest report `9d9fbbeb4cdd03f355fdb5464526282d4c7e78d81d4bb80ad639cc4dbe7c3b09`、stderr `033d7e3e73ff539f2758a6f3ea99adeea31ce2c3c25c28ebf1edb3fd4914e894`を検証した。宣言済み`production-inert-control-diagnostics.json`は欠損しており、logsから成功証拠として補完していない。

今回、S4 source変更後のfocused test／full productionは実行していない。commit可能なS4 implementation sliceはない。未検証差分3ファイルは未stageのままcombined diff SHA-256 `12f588406b96ad9115c09a6d4188fe113595f10dd3ab42e339cf5a429d9ac4ef`を保持している。独立に再利用できる証拠はS2の同一candidate selected／without-area observation transportとS3の69→99→実読99／rollback recovery observer fixtureであり、いずれもproduction control/mutation gate成功の証拠ではない。73 diagnostics／40 controls／33 owners／18追加観測およびB1〜B3は調査結果・Blockingのまま維持し、fresh production zero countは主張しない。

次のbounded planでは、(1)既存production inventoryからfresh user-control identity populationを導出し、全identityを照合する、(2)production alternate count 0に依存せず、実際のselected detailとwithout-area detail／input／effective contributionsを各々の同一candidate executionへ結ぶ代表fixtureを置く、(3)S3 observerの同じcandidate `candidateState`をproduction stale-mutation consumerへ接続し、69→99→read 99とrollback/recovery値を直接比較する、(4)canonical failure一覧をassertion前に一つのartifact ownerが保存し、runnerが存在／bytes／SHA-256を検証する、という独立境界を検討する。各sliceはfocused checksと記録を揃えてから個別commitする。既存B1〜B3、TSK-06.5 status/digest／output/parity、damage semantics／canonical input、TSK-07 cache/stale-responseを変更しない。まず改訂計画を確認してからS4 source差分へ戻る。TSK-08は`in_progress`、TSK-09.1／09は`blocked`のまま維持する。

#### Next-worker planning and slice contract

最初に`git rev-parse HEAD`とtracked／staged／ignored stateを確認し、S4未検証差分を保つ。handoff記録前のHEADは`0798e565cd664d62fdee2f15b28a51b07f4a0301`、現在のS4差分は`productionParityDiagnostics.ts`、`productionMasterInventory.test.ts`、`productionClosureAudit.test.ts`の3ファイル、combined SHA-256 `12f588406b96ad9115c09a6d4188fe113595f10dd3ab42e339cf5a429d9ac4ef`である。`scenario.test.ts`はS2 commit済み。観測したHEAD／差分がこの記録と異なる場合は上書き・消去せず、計画に差分内容とidentityを記録する。`apps/web/next-env.d.ts`はignore済み生成物としてSHA-256 `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`のローカル状態を保持し、追跡しない。

最初の回答は、現行コード・要件・再利用可能な証拠に基づくbounded implementation planだけとする。計画提示前はsource／test編集、テスト実行、stage／commit、Task status変更をしない。計画をユーザーが確認した後は、同じsessionで承認範囲を続け、同一範囲を再承認させない。計画では各ratchetの0件定義、数えるproduction母集団と除外、既存inventoryの確認事実とschema-legal代表fixture、producer／semantic owner／consumerの直接生成・保存・消費経路、forward／composition／alternate／mutation前後／rollback・recovery不変条件、canonical identity／typed reason／canonical first difference／完全failure artifactとchecksum、変更候補pathと既存差分の扱い、独立sliceの順序・commit境界・完了条件・再利用証拠・追加検証と実測に基づく所要時間をコード根拠付きで示す。過去計画を固定手順とせず、同条件で完了済みの調査・診断を繰り返さない。

計画にないstate、ownership、mutation、recovery、alternate path、意味論、または不変条件との衝突が判明したら影響範囲の作業を停止する。推測の分類、fallback、範囲拡張で解決しない。再計画前に、発見事項から独立して完全実装・検証・artifact・evidence・handoffが一致するsliceだけcommitする。不完全sliceをcommit可能に見せるため記録や検証を省略しない。commit可能なsliceがなければ理由を明記する。既存evidence／handoffへcanonical identity、typed reason、first difference、完全artifact path／checksum、未達条件、commit済みslice、未commit差分checksumを記録し、最小追加調査後に改訂planを提示して確認を待つ。各sliceは差分レビュー後にその範囲だけcommitする。commitは許可、pushは禁止。

計画・実装で参照する正本は`AGENTS.md`、`README.md`、`docs/README.md`、[systematic review guidelines](../guides/systematic-review-guidelines.md)、[test strategy](../requirements/test-strategy-redesign.md)のTS-AUDIT-001／TS-OUT-001／TS-ART-001、[ranking requirements](../requirements/ranking-self-and-conditional-effects-requirements.md)のRK-AUDIT-001とexecution／cache、[damage execution requirements](../requirements/damage-effect-execution-requirements.md)のcontrol／outcome／projection、[execution efficiency requirements](../requirements/development-execution-efficiency-requirements.md)、[TSK-06.5 closure](../evidence/tsk-06-5-production-closure.json)、[shared audit model](../evidence/tsk-08-shared-audit-model.json)、[parity diagnostics](../evidence/tsk-08-parity-diagnostics.json)、本Task handoffと[parity ratchet evidence](../evidence/tsk-08-parity-ratchet.json)である。要件判断に必要な直接producer／保存／consumer経路は現在のコードで確かめる。

- final-profile statusはcandidate-level eligibility/statusと区別する。TSK-06.5の80 conditions × 433 profiles = 34,640 outcomes、34,600 calculated／parity、40 unavailable、final-profile unsupported／invalid／inputRequired各0を維持し、candidate status／eligibility digestを変えない。
- partial commitでは成功時command／action／receiptのidentityと適用内容、途中失敗時の正確なrollbackと後続recovery readを別々に検証する。preparation command、execution内group、group開始前form／variant preapplyを同じtransaction境界にしない。
- inert controlは既存production user-visible control inventoryと実際のon/off経路を使い、別producer／semantic ownerを追加しない。synthetic NP-special `:npSpecial`とordered event `:npBase`は同一視せず、projection-level outcomeとoperation-level outcomeを区別する。`resolvedValue: null`は正当な場合がある。trait-count compositeを単一projection値と集約multiplierの単純一致で判定しない。
- stale mutationは同一candidateのread→mutation→後続readを連続して観測し、`criticalStars` 69→cap 99→実read 99を値で照合する。selected executionを再実行で代用しない。target／BP witness選択とwithout-area alternateのdetail／input／effective contributionをそれぞれ同じexecutionへ結ぶ。alternate production count 0は網羅証拠ではない。
- B1（stateTraitの10 controlsでoff projection／effective contribution非適用後もNP-special multiplierが残る）、B2（owner `2501400` magicBulletのtoggle world factがform変換で失われ、選択NPのattackerState countがon/off共通3）、B3（owner `403400` targetRarityでquantity-only条件をtoggleできずnull／中立multiplierが残る）はBlockingのまま維持する。これらがdamage semantics／canonical input等の不変条件変更を要する場合、通常audit接続planの承認を変更許可と解釈せず別途再計画する。
- 完全なcanonical failure一覧はassertion前に一つのdiagnostic ownerが保存し、generic runnerが宣言されたartifactの存在／bytes／SHA-256を検証する。runnerはdomain reasonを解釈しない。digest mismatch、first difference欠損、完全failure artifact欠損、bytes／checksum不一致をfail-closedにする。TSK-06.5のsource digest、inventory、support status、production output、calculator／ranking／portable parity、candidate generation、damage semantics、canonical input、fingerprintと、TSK-07 stale response／cache evidenceを変更しない。ratchet metadata／failure summaryをTSK-06.5比較へ混ぜない。

調査・証拠の再利用範囲も維持する。73 diagnostics／40 controls／33 ownersと追加18観測は調査完了であり、製品修正、fresh production zero count、ratchet成功ではない。完全artifact `.test-results/tsk-08-investigation-record-20260924/complete-diagnostic-artifacts.tar.gz` のSHA-256は`25b9966bb6ea66dbfcdbcbe7cd1785929ba18316a0b31039da00f16b166ac12b`。individual findings、manifest、historical inspectionはmachine evidence記載のchecksumと照合し、不一致／欠損を成功と推測しない。S1 `0f7b549f912010ccaf9bdb29db93ec6885d4f5db`、S2 `c43bf64ad3b0c3634fce951a8ae977529bfb0f30`、S3 `bf10aed9f1d94914835845e1b42cf31db6588565`は個別sliceのcommit済み証拠である。既存8-shard merge／eligibility digestはparity限定で新ratchet成功を含まない。過去4 shardの92／92／140／140はshard単位診断数、237〜258秒は重いcondition時間でshard全体の時間ではない。fresh full auditは既知B1〜B3解消とfocused verification後に限り、canonical 8 shardsを最大4並列・2 waveで実行する（既存概算16〜26分）。既知Blocking中に繰り返さない。S4 review artifact `.test-results/tsk-08-s4-replan-review-20260924/inspection-findings.json` SHA-256 `d19816cf88f9067b40a3fde55477af411c4a1564b4f321404b1e60688ff29ca5`はコードレビューfindingで、test／production audit成功証拠ではない。以前欠損した`production-inert-control-diagnostics.json`をlogsから補完しない。

承認後の各製品sliceでは、対応するfocused tests、target lint／format、typecheckを行い、必要なfailure artifact／checksum、machine evidence、Task handoffが一致してからそのsliceだけcommitする。`pnpm test:production`はB1〜B3が解消しfocused verificationを通るまで実行しない。全slice確定後、必要な`pnpm test:runner`、`pnpm test:docs`と一度の`pnpm quality`をREADME／execution-efficiency規約に従い配置する。長時間full auditが必要なら最大4並列・2 waveのcanonical 8 shardsを用い、逐次unsharded rerunはしない。文書のみのsliceはREADMEのdocs gateを使い、Prettier ignoreによるno-opを成功扱いしない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`のまま維持し、TSK-08全体もinert-control実装も完了扱いにしない。

今回の記録専用sliceは、対象4文書のPrettier check、JSON parse、`node --test scripts/docs-integrity.test.mjs`（6/6）、`node scripts/docs-integrity.mjs`、`git diff --check`が成功した。`pnpm test:docs`は依存status確認中、docs script開始前に`ERR_SQLITE_ERROR: unable to open database file`で失敗した。完全log `.test-results/tsk-08-handoff-20260924/pnpm-test-docs.log` SHA-256 `0db23aa6bfe0cf4b1e606e3aea841b192c1d81c2c3f31c65f4578cfb05ef4a60`へ保存し、直接のdocs test／integrity実行を代替検証とした。製品test／production auditは実行していない。

Current bounded-unit handoff（2026-09-24、通常production inventory／opt-in audit分割）:

ユーザー承認に基づき、全件の特殊control走査を通常qualityから外すテスト配置sliceを実装した。通常productionには既存の全master target-state inventory testを残し、candidate値／fail-closed全servant scan、全support projection on操作、全equipment／mystic-code projection on操作を`productionMasterControlAudit.test.ts`へ移した。loopの母集団は維持し、sampling／production population変更はない。`test:audit`／`--suite=audit`だけが1 workerのaudit projectを実行し、`test`／`test:agent`／`check`／`quality`には含まれない。三suiteの排他・全test file網羅とquality外をrunner contractで検証する。既存の2つのE2E inventory markerは移動先を指すようmanifestとcanonical digestを更新した。

2026-09-23 artifact `.test-results/2026-09-23T09-10-02-161Z-15-3e8208/production/vitest.json`では、移した3 loopは17.791秒、6.540秒、18.716秒、通常に残したinventory testは3.153秒だった。移動した検査の全件値は削っていない。今回のfocused ordinary inventoryは1 test／1 pass、test 1.844秒、process 2.42秒である。JSON `.test-results/tsk-08-suite-partition-20260924/production-master-inventory.json` SHA-256 `8f4cba539449c6f2a6ba1105ed3b298d0bdc3d7575f91addbcde927ff322f569`、log SHA-256 `07f34ab07e36095dfea2ae6d1a518ba2d235d790cf37ba20c180e51b5995e414`。43.048秒は旧run内の3 loop合計に基づく通常suiteからの見込み削減であり、post-change production/quality全体の実測とは扱わない。

runner／suite／E2E contractsは54/54 pass（`.test-results`にJSON artifactを保存する必要のないNode test contract）。E2E marker migration digestは`5c040ecb460b73f5a5bed5a86dc0036ff875357c3c4742973bb989a822b61487`。docs integrity testsは6/6 pass、`node scripts/docs-integrity.mjs` pass、対象ESLint／Prettier pass、`./node_modules/.bin/tsc -b --pretty false` pass。`pnpm exec prettier`はscript起動前にexternal pnpm SQLite storeを開けず`ERR_SQLITE_ERROR`となり、既存node_modulesの直接binaryで検証した。`.test-results/tsk-08-suite-partition-20260924`の個別result/log checksumと検証値は[TSK-08 parity ratchet](../evidence/tsk-08-parity-ratchet.json)の最新boundedUnitを参照する。`pnpm test:audit`、`pnpm test:production`、`pnpm quality`は未実行。B1〜B3が残り、移動先のS4 consumerも未検証である。

suite-placementの実装・検証・handoffは同一のlocal commitに含めた。commit後、S4 test内容を`/tmp/tsk08-s4-productionMasterInventory-before-split.ts`（SHA-256 `f230265bbaa2f38accc6a3bec6ca297cf1ee8034fb5c9e054a44fe8979308931`）から`productionMasterControlAudit.test.ts`へ再配置した。現在の未検証S4 worktree差分は3 pathで、combined SHA-256 `d1866b3b5bd0594a8457b8681b3d26b70bdcc8199971f608b4b9daabdf144011`。完全なpatchは`.test-results/tsk-08-s4-reapplied-20260924/worktree.diff`（同じSHA-256）へ保存した。各file content SHA-256は`productionParityDiagnostics.ts`: `6ea1ec053b88a9bf2e1a79da60c4b30f8472fc1281fd37b69c30a2b769116e95`、`productionClosureAudit.test.ts`: `70d08ce5054c6eb1d250cf19a423702cb115775e92f590779fbfdbfb1654f604`、`productionMasterControlAudit.test.ts`: `431f6d72c9d222d60acb66516501c74fcad118bf2775be57f98ad05c5781bafb`である。これは新しい差分identityであり、元のcombined diff hashとは別物。S4は未検証で、suite-placement commitへ含めていない。`apps/web/next-env.d.ts`はignore済みでchecksum `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`を保持し、stageしていない。

今後は既存S4 review findingに従って限定scopeのconsumer接続planへ戻る。B1〜B3はBlockingのままとし、`test:audit`／`test:production`／`quality`を実行せず、TSK-08全体を完了扱いにしない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。

Previous bounded-unit handoff（2026-09-24、failure artifact保存契約の設計・commit境界確定）:

当時の依頼はcommit境界の解消と保存契約の具体化までであり、実装開始前だった。後続handoffでユーザーがこのbounded persistence planの実装を承認した。HEADは`ee80ef9fe6c2e30c68f95b0097e5a6f36c578926`。上記3 pathのS4 source diffはSHA-256 `d1866b3b5bd0594a8457b8681b3d26b70bdcc8199971f608b4b9daabdf144011`のまま保持する。source／test編集、test実行、stage／commitは行っていない。設計の正本は[parity ratchet evidence](../evidence/tsk-08-parity-ratchet.json)の最新`boundedUnits` recordとする。

commit境界はユーザー回答「保存経路に限定し、依存部分のcommit・完了は保留」で確定した。productionの観測採取、control型、`auditProductionUserControlObservations`は未コミットS4に含まれ、保存接続だけのHEAD上の独立commitは成立しない。これらのgate実装を今回の検証済み差分として取り込まない。今後保存基盤の独立部分を実装・検証できても、production接続はS4依存解消まで未コミットとし、今回依頼されたend-to-end sliceの完了には数えない。保留解除にはS4 producer／gateについて別途承認・検証されたbaselineが必要である。基盤単独commitも今回の設計作業では行わない。

保存契約案は、test定義時のVitest metadataに必須artifact一覧を置き、共有writerが確定したUTF-8 bytesの長さ／SHA-256を同じtestのmetadataへ記録して、既存JSON reporterの`vitest.json`からgeneric runnerへ渡す。既存3writerによる`artifact-declarations.json`上書きを廃止し、runnerの`verifyArtifactFiles`を唯一のbytes／checksum verifierとして使う。これはインストール済みVitest 4.1.11の`TestOptions.meta`とJSON reporterの`assertionResults.meta`を読んだ設計根拠で、実行成功証拠ではない。必要file、payloadの欠損値表現、保存順序、重複・欠損・書込失敗時の動作、focused verification matrixは上記evidenceを参照する。

productionの完全性は既存producerが生成したfailure／observation全件の保存を意味し、fresh control population、without-area alternate、stale-mutation consumerの未達は引き続き残る。B1〜B3の分類緩和、TSK-06.5 digest／inventory／outcome／parity、damage semantics／canonical input／fingerprint、TSK-07 cache／stale-responseへの変更はない。`quality`は内部で`test:production`を実行するため、現在の禁止を迂回せず、従来の全source slice確定後のゲートに残す。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。この保存案は後続ターンで実装承認済み。実装中に見つかったSet payloadのため、最新handoffでserializer再計画を停止・確認待ちとしている。 文書はJSON parse、既存evidenceの値保持、docs integrity、`git diff --check`を静的確認した。強制Prettierで既存table書式が変わりintegrityが失敗したため、formatterだけの変更を除去して再確認した。test suiteは未実行で、文書commitの完了ゲートを通過したとは扱わない。


Current bounded-unit handoff（2026-09-24、実装中のSet payload発見で保存経路を停止）:

開始HEADは`ee80ef9fe6c2e30c68f95b0097e5a6f36c578926`。ユーザー承認後、failure artifact保存基盤、既存writer移行、generic runner接続の未完実装を作成した。focused実行で既存producer payloadに提案serializerが表現できない値が出たため、影響する実装を停止した。

実体は`productionBattlePointPaths.test.ts`の705300 recordに含まれる`calculator[0].portable.execution.effectiveContributions.effectivePresentationGroupIds`の`Set`である。`productionAuditArtifacts.ts::encodeLossless`はnon-plain objectを`artifact_non_plain_object`で拒否する。この値を落とすと選択execution traceの完全payloadを失うため、JSON.stringify、配列化だけの無記録変換、domain assertion緩和はしない。これはartifact transport failureで、canonical identity／FGO typed reason／firstDifferenceは生成されていない。これらの値は`null`として記録し、診断を捏造しない。

`node --test scripts/test-runner.test.mjs`は41/41 passし、実Vitest JSON reporterからwriter receiptがrunnerへ到達するfixtureのartifactは1806 bytes、SHA-256 `96abaf906fdf585ca9302ce3add4504ebacd29ad2a8c53b3c11bccaf1e137379`だった。scenario suiteは汎用`runCapturedTest`で36/36 passし、manifest `.test-results/2026-09-24T09-48-50-961Z-2-a6ac51/manifest.json` SHA-256 `197ddbc4f116d6eaf622161f06e6d5f40559c8cb71acbddf9fbeee2e35f9e222`、star artifact SHA-256 `f8ad68a3956875ba000e7857b8f70bd663daf29099cc3317b6eb5a252343a39d`、rollback artifact SHA-256 `eb11b4c66a4e454b550eb8e7278f92b42dbca0a0da492856776cb31e11e773a6`である。Battle Point fileは7 tests中2 pass／5 fail、manifest outcomeは`artifact_failure`。manifest `.test-results/2026-09-24T09-48-57-848Z-2-3e3adb/manifest.json` SHA-256 `95a29e9e4761503c0d8b46c8bad2c5da22f7b09c0a00a06dde13be4884b4c01b`、Vitest report SHA-256 `a79a0ca8814a1e9fe78d261c3777c3b825e203a1e3aa755cf74f6b688d8b12c0`。失敗した5件はwriterが保存前に拒否し、必要receipt／artifactが欠けた。これは保存契約が正しくfail-closedした証拠であり、producer移行の成功証拠ではない。

最初のfocused runner呼び出しはVitest前にexternal SQLite storeを開けず、`ERR_SQLITE_ERROR: unable to open database file`で停止した。以後は既存`node_modules/.bin/vitest`と同じ`runCapturedTest`を使った。target ESLintと`tsc -b --pretty false`は通過した。`productionClosureAudit.test.ts`のfocused runはS4 user-control fixtureを含むため実行していない。

このfindingにより共通writerのserializerが対象producer payloadを保存できず、scenario単独成功も責務全体を閉じない。停止時点では独立したcandidate treeの検証が完了しておらず、実装のstage／commitは行っていない。次作業者はコードから責務単位の独立性を再評価する。元のS4 patch `.test-results/tsk-08-s4-reapplied-20260924/worktree.diff`はSHA-256 `d1866b3b5bd0594a8457b8681b3d26b70bdcc8199971f608b4b9daabdf144011`で保持。今回作業後のS4 3-path combined diffはSHA-256 `47e26adcd339c71b992aea40136513fdde3a85b78bf59fcc94781e59f2183791`。`productionParityDiagnostics.ts`内容は元のSHA-256 `6ea1ec053b88a9bf2e1a79da60c4b30f8472fc1281fd37b69c30a2b769116e95`のまま。ignored `apps/web/next-env.d.ts`はSHA-256 `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`で維持。実装source diff（tracked source/script部分）はSHA-256 `8e8737a1349f5b52a3f0a41c0e76b45428c656787570bafdb2e9e39bb7285861`、新規writer／testの個別hashはmachine evidenceに記録した。

改訂案はartifact-only serialization envelopeにSetの明示的なencodingを加え、memberとiteration order、nested undefined／null／absentを保つことに限定する。まず関連writer payloadに他の未対応runtime shapeがないかread-onlyで範囲調査し、Setのversioned round-trip fixtureと実Battle Point writer／reporter／generic runnerを確認する。別のunsupported shapeが広いframeworkやdomain projectionを要求したら再停止する。S4依存のproduction接続はbaseline承認まで未コミットのまま維持する。この改訂案は確認待ちであり、確認までserializer／producer migrationを再開しない。文書検証は`node --test scripts/docs-integrity.test.mjs`（6/6）、`node scripts/docs-integrity.mjs`、JSON parse、`git diff --check`が成功した。docsはPrettier対象外のまま維持した。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。

引継ぎ確定（文書だけのlocal commit）: ユーザーは既存Task／evidenceの記録と依頼文作成を承認した。今回commitは`docs/README.md`、`docs/evidence/README.md`、`docs/evidence/tsk-08-parity-ratchet.json`、このTaskの4 pathだけとし、未完実装・S4の9 source/script pathは未コミットで保持する。これは保存基盤・production接続・TSK-08全体の完了commitではない。開始HEADと文書4 pathだけの隔離候補でdocs test 6/6とdocs integrityを確認し、既存table書式・JSON・参照・`git diff --check`も確認した。source patchの隔離復元は9/9 file hash一致、既存artifactのbytes／SHA-256も一致した。

未追跡writer／testを含む全source差分と一時領域の実行証拠は、ローカルartifact `.test-results/tsk-08-persistence-handoff-20260924/manifest.json`（SHA-256 `7584c6032f880245a322b930bf3a5f0b5ed5615b3b6fde1980b9cfc2364bfc33`）へ保存した。`pending-source.diff`（SHA-256 `e8d9699b3d6e999933482153816e38bc884b9ec292f872d3f9e78a1d0727ba4c`）は開始HEADに対する7 tracked＋2 untracked fileの完全patchである。ignored artifactのためGit commitだけでは未完実装を復元できない。同じworktreeで再開するか、このdirectoryを別環境へ引き渡し、checksumを確認する。既存dirty treeへのpatch再適用は禁止。

次作業者はまず現行コードからproducer → 保存owner → metadata／reporter → generic verifier → manifestを追い、payload境界、Set以外の関連shape、HEADだけで成立するfile／hunk、S4依存部分、最初の代表経路、focused検証・所要時間・停止条件を計画する。SetのsetPaths化やversion変更は技術案であり、実装方法を固定しない。計画確認前はsource／test編集・source test実行・実装のstage／commitを行わない。確認後は同じsessionで承認範囲を進め、確実な依存・期待値から実装する。実writer／reporter／runner／manifestを早期に接続し、責務単位の実装・必要な検証・artifact・evidence・handoffが揃い、未コミットS4へ依存しないcandidate treeを確認した部分からlocal commitする。

計画にない条件、owner、保存／回復経路、意味論、依存、または不変条件との衝突が見つかったら、影響作業を止める。推測・分類緩和・fallback・範囲拡張で解決せず、findingで検証根拠が無効になっていない独立完成部分があれば先に検証・差分を確認してcommitする。不完全ならcommitせず理由を記録する。既存Task／evidenceへ事実・根拠symbol・実在するidentity／reason／first difference・artifact／checksum・未達・commit済み範囲・残存diff identityを更新し、改訂計画を提示して確認を待つ。通常の承認範囲内の技術判断では再承認を求めない。push、full production／audit／qualityは禁止のまま。


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

以下は製品実装に適用する。文書・指示だけの変更はREADMEの文書検証範囲で閉じ、production監査や全体qualityを追加しない。途中記録と再開は実行効率要件5.4節に従う。

1. Task indexから`ready`なTaskを一件選び、依存TaskのDone gateとHandoff、Contract closure matrixを確認する。
2. 作業開始時のHEAD、作業ツリー、対象family、利用者成果、domain invariant、semantic ownerを確認する。
3. 開始commitで対象Taskを`in_progress`へ変更し、Handoffの`Next command`に最初のbounded commandを記録する。
4. 対象production familyの変更前baselineとfail-closed条件を確認する。同条件で有効な証拠は継承し、不足する範囲だけ監査する。変更境界と必要な検証を説明できたら実装へ進む。
5. 一つの責務単位で実装し、関係する小さいsemantic testから検証する。複数層の変更は代表経路を早期に接続し、部品の成功と利用者経路の完成を区別する。
6. 既知の対象内Blockingを解消し、必要な局所検証と差分レビューを終えてからREADMEの最終qualityへ進む。production inventory、calculator/ranking parity、UI、performanceは適用契約に従って確認し、全件検証を事前に重複実行しない。開始条件と検証対象の固定は実行効率要件5節に従う。
7. 未達条件や不具合があれば、共通原因と影響範囲の解消に必要な工程へ戻る。有効なbaseline・確定判断・証拠は継承し、手順4から一律に繰り返さない。新しい例外familyは局所分岐を追加せず、既存責務と対象範囲から修正境界を再判断する。Done gateに必要な経路を対象外へ移さない。
8. 判断や実装の区切りで既存Task／flowを更新し、Handoffへ確定判断の参照先、有効な検証、残課題、次の操作を残す。これは手順7の完了を待たず、実行効率要件5.4節に従って行う。
9. 対象fileだけをstageし、staged diff、file list、必要な検証結果を確認してcommitする。Handoffへ実装commitまたは対象差分、canonical evidence、次のentry conditionを記録する。最終差分の必須ゲートが成功し、対象内Blocking 0と記録の一致が揃えば、新しい根拠のない再レビューを追加しない。
10. completion commitで対象Taskを`done`、直接の後続Taskを`ready`へ変更する。

### 4.2 中断・再開手順

- authority競合、damage根拠不足、部分適用可能な意味論、想定外のruntime増加を検出したら変更を拡張せず停止する。
- Handoffへblocking condition、確認済み事実、未確定事項、影響path、安全な再開commandを記録する。
- 次のsessionはTask、Handoff、記録済みcommitまたは差分、canonical evidenceを現在のworktreeと照合し、未達条件から再開する。関連変更・新しい反例・根拠不足がなければ確定済みの調査を繰り返さない。
- 一時的なraw logや巨大なtool outputをHandoffへ貼らず、必要なpath、digest、要約だけを残す。


Previous bounded-unit handoff（2026-09-25、保存責務だけを独立して検証）:

ユーザーが現行コードからの計画を確認し、保存実装・focused検証・独立責務のlocal commitを承認した。開始HEAD `86c0e5b737658c16ff7d3f3d4b7b548662212d3f`、7 tracked＋2 untracked、stagedなし、snapshot 39 entries／source 9 filesのhashを照合した。snapshotをdirty treeへ再適用していない。今回の正本は`tsk-08-parity-ratchet.json`のbounded unit「S4-independent failure artifact persistence and existing writer migration」。以前の停止記録は履歴として保持する。

このhandoffを含むcommitの独立責務は、artifact専用version 2のSet／Map／undefined保存、metadata宣言・intended bytes／SHA-256 receipt、既存generic verifier接続と3 writerの一括移行。旧`artifact-declarations.json`上書き経路を廃止した。保存完了後もdomain assertion failureを失敗のまま保持する。705300の全result比較・元timeoutを維持し、3300200の生成済みexecution、全failureと対応観測を保存する。snapshotの`firstDifference:null`や正当な`resolvedValue:null`はfailed gateへ読み替えない。

検証はHEADからの隔離candidateで実施し、`productionParityDiagnostics.ts`と`productionMasterControlAudit.test.ts`はHEADと同一、closureの未検証user-control import／helper／fixtureは除外した。workspace依存もcandidate内へ解決した。source candidate tree `d78faf7c13f396a43b3b03fde933ad12bb751425`、7 file hashとpatchはmachine evidenceを参照。runner 45/45のうち非変更43件を再利用し、最終fixtureの影響2件を再実行して2/2。unit 46/46のうちscenario 36／HEAD-only closure 4を再利用し、最終artifact fixtureは6/6。最終Battle Point 7/7、7 artifactのbytes／SHA-256検証成功、26.54秒。target TypeScript lint／typecheck、7 file format、runner構文検査が成功した。`.mjs`は既存ESLintの型情報設定対象外であるため、config緩和せず構文・format・contract testsで検証した。文書も隔離candidateでdocs tests 6/6、docs integrity、JSON／既存evidence保持、diff検査が成功した。禁止されたfull production／audit／qualityは実行していない。

完全な検証artifact、途中失敗、最終source patchは`.test-results/tsk-08-persistence-20260925/archive-manifest.json`（SHA-256 `d6d6424805b698ec730019d32bf65dff4354a8614b231a33cd93400dffe5c60f`）へ保持した。607 manifest artifact entriesのbytes／hashは一致し、実reporterのreceiptから期待checksumを検証した。保存fileを期待checksumの生成元にはしていない。これはignored local artifactで、Gitだけには含まれない。

S4依存の3 pathは未コミットで保持する。diagnosticsの型・gate、master-controlの観測採取とproduction保存接続、closureの追加user-control fixtureは今回の成功証拠に含めない。fixtureの宣言／保存pathを`production-inert-control-fixture.json`へ揃えた変更も残存差分側である。残存patch SHA-256 `df928b3fbeb0ef8bbadf8cd72ce1d6707c06a28ff6b9b3303fe8d171996092ff`、個別file hashはmachine evidenceに記録した。別途承認・検証されたS4 baselineができるまで、production接続のcommit・完成は保留する。型抽出、fallback、休眠hookによる依存隠蔽はない。

B1のstateTrait 10 controls、B2の2501400 magicBullet、B3の403400 targetRarityはBlockingのまま。TSK-06.5の80×433＝34,640 outcomes、34,600 calculated／parity、40 unavailable、final unsupported／invalid／inputRequired各0とdigest、candidate／damage／canonical input／fingerprint、TSK-07 evidenceは変更していない。複数ratchet、fresh control population、without-area alternate、production stale-mutation consumer、TSK-08全体は未達。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。次の操作は残存S4の別途承認・baseline検証であり、保存テストでS4意味論を検証済みとは扱わない。pushは行わない。

Current bounded-unit handoff（2026-09-25、S4 gateと小さいsemantic fixture）:

ユーザーが現行コードからの計画を確認して実装を承認した。開始HEADは`6c07c0dcd2f9a9710fee02b1aee5611584918c87`。3 tracked差分、空index、前回archive／残存patch／3 file hash、ignore済み`apps/web/next-env.d.ts`を照合し、残存patchを再適用していない。今回の正本は`tsk-08-parity-ratchet.json`の最新bounded unit「S4 typed observation gate and independent semantic fixture baseline」。

独立責務は`productionParityDiagnostics.ts::auditProductionUserControlObservations`と直接helperの型付き観測・fail-closed判定、`productionClosureAudit.test.ts`の小さいsemantic fixtureである。実producerは`scenario.ts::prepareCalculationScenarioWithPolicy`、`battle-execution/engine.ts::auditOperationEvents`、`effectiveContributions.ts::effectiveContributionsForOperation`、未コミットの`productionMasterControlAudit.test.ts::userControlSideObservation/controlDamageInputBinding`まで確認した。gateは選択候補の元event、projection、contribution、入力binding、計算結果を結び、欠損／明示undefined／null、正常な非適用、unresolved／ambiguous、invalid／unsupported／inputRequiredを区別する。正当な`resolvedValue:null`とpassed時の`firstDifference:null`を保持する。fixtureのwithoutAreaAlternateはschema-legal gate経路でありproduction coverageではない。

HEADからの隔離candidateには上記2 source fileだけを適用し、production採取・保存接続のfileはHEADのままにした。candidate内のworkspace package link解決、typecheck、focused unit 5/5（skip／todo 0）、target ESLint／Prettierを確認した。fixture artifactはassertion前に保存し、generic runnerのmanifest 9 artifactsと4 writer receiptsのbytes／SHA-256が一致した。machine evidenceは`.test-results/tsk-08-s4-gate-20260925/gate-evidence.json`（SHA-256 `821a65a30047e4bb731278c9434e1f6c0b9f2a457702d3d3c5c841ff26d3369e`）、focused manifestは同directoryの`focused-run/manifest.json`（SHA-256 `6152b8212ff429aa374eb2b5099b8c83770ccf71ef514e4fb457755a31a70b5c`）。保存基盤の既存証拠は再利用し、S4意味論の証拠へ読み替えていない。禁止された全件production／audit／qualityは実行していない。

`productionMasterControlAudit.test.ts`の観測採取・production gate呼出・保存接続は未コミット、未検証で保持する。残存producer差分SHA-256は`b528362377c1f086eeef4dad1eadda3b0088aa2059ff56ef1826d53e9b5fa96e`。fresh control population、complete identity set、production without-area alternate、stale-mutation consumer、B1〜B3は未達。TSK-06.5の80×433＝34,640 outcomes、34,600 calculated／parity、40 unavailable、final異常各0と既存digest、candidate／damage／canonical input／fingerprint、TSK-07 evidenceは変更していない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`。次のsessionではこのgate baselineに対して実producerとproduction保存接続を検証し、今回のfixture成功をproduction採取の証明にしない。pushは行わない。

Current bounded-unit handoff（2026-09-25、S4 production観測・failure artifact接続）:

開始HEADは`b473fe8324af0285ebd7d0e63eedd183b6a69711`、index空、tracked dirtyは`productionMasterControlAudit.test.ts`のみで引継ぎ差分SHA-256 `b528362377c1f086eeef4dad1eadda3b0088aa2059ff56ef1826d53e9b5fa96e`と一致した。ignore済み`apps/web/next-env.d.ts`と既commit gate evidence SHA-256 `821a65a30047e4bb731278c9434e1f6c0b9f2a457702d3d3c5c841ff26d3369e`を保持した。ユーザーは現行コードに基づくproducer／保存接続計画を承認した。

`productionMasterControlAudit.test.ts`は実計算とordered operation eventsからenabled／excluded観測を作り、今回の`effectControls`／`effects`から観測生成前に期待identityを独立列挙する。freshなselected-profile母集団は1,590件、実観測1,590件、identity coverage failureは0件。`productionParityDiagnostics.ts` gateには件数が同じidentity入替えを検出する比較を追加し、`productionClosureAudit.test.ts`の小fixtureに反例を追加した。保存はgate assertion前で、writer receiptとgeneric runnerのbytes／SHA-256照合が一致した。隔離candidateはHEADから3 source pathだけを適用し、workspace package linkはcandidate内を解決する。typecheck、対象ESLint／Prettier、小fixture 5/5は成功した。`pnpm`はVitest前にexternal SQLite storeエラーで停止したため、同じgeneric runnerに既存Vitestを直接指定した。machine evidence `.test-results/tsk-08-s4-producer-20260925/producer-evidence.json`のSHA-256は`98d10745d4c26818f5a5e6ed81bcb62793f605c12babbc27ede5d1159223cfa4`。詳細は最新`tsk-08-parity-ratchet.json` bounded unitを正本とする。

隔離candidateのfocused producer testはS4 gateで失敗したが、55,824,551 bytesのfailure artifactはreceiptのSHA-256 `a780c6dabfbb1e2262b83bbe1397b210b2befb0c677b43b62997394ad3afc08f`と一致し、runnerのartifact errorは0。gate failureは47件（観測矛盾19、計算結果非calculated 14、NP特殊入力不変12、operation／damage未到達2）。最初の実差分は`101700`のNP特殊効果excluded側`effective`でexpected `false`／actual `true`。他に`106600`のenabled `unsupported`、`200300`のNP特殊入力不変、`1000100`の未到達がある。これはB1〜B3だけで説明済みとせず、共有contribution／controlの未計画意味論familyとして影響作業を停止する。gate分類の緩和や製品修正は行わない。保存成功はgate成功を意味しない。

次の操作は、ユーザー確認を得た改訂bounded planで保存済み観測とgoverning ruleから47件を分類し、shared NP contributionとcontrolのownershipを判断すること。B1 stateTrait 10 controls、B2 2501400 magicBullet、B3 403400 targetRarityはBlockingを維持する。without-area alternate production接続、stale-mutation consumer、他ratchet、全件production／audit／quality、TSK-08全体収束は未達。TSK-06.5の80×433＝34,640 outcomes、34,600 calculated／parity、40 unavailable、final異常各0と既存digest、candidate／damage／canonical input／fingerprint、TSK-07 evidenceは変更していない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持し、pushは行わない。

Current bounded-unit handoff（2026-09-25、S4 B1の明示offとNP特殊倍率）:

開始HEAD `8de6890fd758239ed5a636db2e2f6966b88e2b2b`、tracked worktree／index空、ignore済み`apps/web/next-env.d.ts`を照合した。保存済みproduction artifact SHA-256 `a780c6dabfbb1e2262b83bbe1397b210b2befb0c677b43b62997394ad3afc08f`と要約 `98d10745d4c26818f5a5e6ed81bcb62793f605c12babbc27ede5d1159223cfa4`は一致した。要約の実pathは`.test-results/tsk-08-s4-producer-20260925/producer-evidence.json`である。47 failureのtyped reason／identity／first differenceを保存実値から分類し、B1の10 controlsを今回の対象と確定した。全分類と47 identityは[TSK-08 parity ratchet](../evidence/tsk-08-parity-ratchet.json)の最新bounded unitおよびignored `b1-evidence.json`を参照する。

B1の実値は`200300`等10 ownerで、off後のprojection `notApplied`／effective `false`にもかかわらずNP特殊倍率が残る。代表`200300`のexcluded入力は旧`[2,2,2,2,2]`、修正後`[1,1,1,1,1]`、NP1平均は`72786.53`から`36393.03`へ変化し、基礎NP倍率とtarget stateを保持する。governing ruleはdamage execution §3.2のoff＝計算から除外、条件付きNPの基礎ダメージ実行である。`npDamageExecution.ts`が明示offを特殊寄与の包含判定へ反映し、`scenario.test.ts`の小fixtureが状態特性の存在と特殊寄与の非適用を同時に確認する。servant ID分岐、数値fallback、gate分類変更はない。

HEADから今回の2 source fileだけを適用した隔離candidateのpatch SHA-256は`02b0da799b845b8495091cefa7116ed1c284e41d638c4a11fe2f9d7104c2a9d2`でmain差分と一致した。focused scenario 36/36、NP damage 5/5、ranking contribution 3/3、typecheck、対象ESLint／Prettier成功。単独producerは既知の別Blockingによりgate失敗を維持したが、47→37件、消えたfailure identityはB1の10件だけ、新規0件、fresh expected／observed identity各1,590件で集合も不変。最終artifact 55,807,315 bytes／SHA-256 `d96319836f98fa74a5ef5f67aae318ff9542340bacb2da43be83a6d92da19856`はreceipt／generic runnerと一致した。実測producerは前回16.48秒、初回candidate 20.18秒、再実行17.17秒で、初回の22.4%増は再現せず、二回目は4.2%増。candidate数やinventory生成は変更していない。`pnpm`はscript前にexternal SQLite storeで失敗したため、既存Vitestを同じgeneric runnerへ直接指定した。機械証跡は`.test-results/tsk-08-s4-b1-20260925/b1-evidence.json`（SHA-256 `baa600817209bd3ee366a68c1d21ecc8408beccc8960488b1127af6a5faaa1d1`）。

B1はこの限定経路で解消した。B2 `2501400`、B3 `403400`と観測矛盾19、非calculated 14、NP特殊入力不変2、operation／damage未到達2の計37件はBlockingのまま。without-area alternate、stale-mutation consumer、他ratchet、全件production／audit／qualityは実行していない。TSK-06.5の80×433＝34,640 outcomes、34,600 calculated／parity、40 unavailable、final unsupported／invalid／inputRequired各0と既存digest、candidate status／eligibility、production output、canonical input、fingerprint、TSK-07 evidenceは変更しない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。次は残る37件の別familyを実値で選び、改訂bounded planから再開する。pushしない。

Current bounded-unit handoff（2026-09-25、S4 traitCount NP特攻の実効寄与）:

開始HEAD `c3bd8740630268be4e9d683bb6f23523b836a080`、tracked worktree／index空、ignore済み`apps/web/next-env.d.ts`、指定済み3 artifact hashの一致を確認した。保存済み37件を実identityと現行コードから再分類し、traitCount型NP特攻のworld assumption projectionと共有effective contributionの不一致19件を今回のfamilyとした。最初の`101700` excluded側はprojection `notApplied`、NP特殊入力`[1,1,1,1,1]`に対してeffective `true`だった。`npDamageCompilation.ts::traitCountProjections`が複数条件を一つのNP damage operation／contribution IDへ結び、`effectiveContributionsForOperation`がNP本体projectionのoutcomeをNP特殊寄与へ流していた。damage execution §3.2／§8.12に従い、`candidateResult.ts`から最終projectionとdamage inputを渡し、`effectiveContributions.ts`でworld assumption群の適用・unsupportedと実際のNP特殊入力から共有寄与を確定する。条件ごとのprojectionと基礎NP実行は保持し、gateのtyped reason／期待値は変えていない。

HEADから今回の3 source fileだけを載せた隔離candidateでsemantic fixtureを含むunit 44/44、`tsc -b`、対象ESLint／Prettierが成功した。単独実producerのS4 gateは別familyのため失敗を維持するが、37→18件、消えたfailure identityは対象19件のみ、新規0件。fresh expected／observed identityは各1,590件で集合不変、input binding／damage result／projection／operation event差分0、effective contribution差分19件。最終artifactは55,785,324 bytes／SHA-256 `5d88217bc7d157f93353c120f14f41603e79a26e50f298d3cd98825a8e848c3b`、manifest SHA-256 `c7363734f81cb077eefefbdbb5a0cc9c9d9fd4686d4562aacd7d891cc4e26d72`でreceipt／generic runner一致、artifact error 0。`pnpm`はscript前にexternal SQLite storeで失敗したため同じgeneric runnerと既存Vitestへ切り替えた。全identityと差分の機械証跡は`.test-results/tsk-08-s4-traitcount-20260925/traitcount-evidence.json`（SHA-256 `32fb2af696b85eb64f245433b95a7fe6e6b23e1dbc3f009cd15bb1b77e412976`）。

このfamilyは限定経路で解消した。残る18件は非calculated 14、B2 `2501400` magicBulletとB3 `403400` targetRarityを含むNP特殊入力不変2、operation／damage未到達2でBlockingのまま。without-area alternate、stale-mutation consumer、他ratchet、全件production／audit／quality、TSK-08全体収束は未達。TSK-06.5の80×433＝34,640 outcomes、34,600 calculated／parity、40 unavailable、final unsupported／invalid／inputRequired各0と既存digest、candidate status／eligibility、production output、canonical input、fingerprint、TSK-07 cache／stale-response evidenceは変更していない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。次の操作は保存済み18件の別familyを実値で選んで改訂bounded planを提示すること。pushしない。

Current bounded-unit handoff（2026-09-25、S4 stack-owned state trait操作）:

開始HEAD `94a15a61aac9226229c3df7474017578ef2e50f5`、tracked worktree／index空、ignore済み`apps/web/next-env.d.ts`と指定済み3 artifactのbytes／SHA-256を照合した。保存済み18件のうち、owner `106600`、`204300`、`305700`、`604800`、`1101700`、`2300400`、`2801100`の7 identityを選んだ。first differenceは`106600` enabled damage outcomeのexpected `calculated`／actual `unsupported`。実issueは`targetState:buffBurn`のworld fact trueとcanonical stack count 0の`traitPolarity` conflictで、他6件も対応するstate trait／countで同じ制約衝突を示した。`effectDecision.ts::applyEffectPresentationDecision`がworld factだけを設定していた一方、`seedStackQuantities`はcount 0を物理stateへ固定していた。damage-effect-execution §8.8とADR 012のcount所有権に従い、typed scope／traitがexactに一致する`effectStackCount`を持つ表示操作だけをcanonical inputへ送る。一致しないfactは従来のfact commandへ残し、曖昧・表現不能なcountはfail closedにする。gateの期待値・分類、executionの制約検証は変更していない。

HEAD archiveへ今回の`effectDecision.ts`、`stackQuantityFixture.ts`、`stackQuantity.test.ts`だけを載せた独立candidateで、semantic fixtureを含むunit 15/15、`tsc -b`、対象ESLint／Prettierが成功した。実producer gateは別familyのため失敗を維持するが18→11件で、消えたfailureは選択7 identityのみ、新規0件。fresh expected／observedは各1,590件で集合不変、変更観測は選択7件のみ。7件ともenabled／excludedは`calculated`、NP特殊入力は変化した。最終artifact `.test-results/tsk-08-s4-stack-owned-20260925/producer-final/production-inert-control-production.json` は55,684,557 bytes／SHA-256 `cdb23b0f04d9ad204a0d0ed5213744b82fe0f35617e1bf467e1b6c78646b729d`、manifest SHA-256 `712c26d4c7a2c46c51a0f61d1ad5e90641156381871eb432df6b818bd001f9a9`、receipt error 0。全差分と残存identityは同directoryの`../stack-owned-evidence.json`（SHA-256 `c6e47e4ddf3f34637e95701385ab4dfa1674cd5439c1a34ed5d227927d9991ab`）を参照する。`pnpm`はscript前にexternal SQLite storeで失敗し、既存Vitestと同じgeneric runnerへ切り替えた。

このfamilyの限定経路は解消した。残る11件は非calculated 7、B2 `2501400` magicBullet／B3 `403400` targetRarityを含むNP特殊入力不変2、operation／damage未到達2でBlocking。without-area alternate、stale-mutation consumer、他ratchet、全件production／audit／quality、TSK-08全体収束は未達。TSK-06.5の80×433＝34,640 outcomes、34,600 calculated／parity、40 unavailable、final unsupported／invalid／inputRequired各0と既存digest、candidate status／eligibility、production output、canonical input、fingerprint、TSK-07 cache／stale-response evidenceは変更していない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。次は残る11件の別familyを実値から選んで計画する。pushしない。

Current bounded-unit handoff（2026-09-25、S4 共有targetState毒stack条件）:

開始HEAD `064385c85e7462c23b8d750df67a4cc0c27ee431`、tracked worktree／index空、ignored `apps/web/next-env.d.ts`、指定3 artifactのbytes／SHA-256一致を確認した。11件の実値からowner `506000`の `2673550:23549` と `2674650:23547` のpowerMod controlを選んだ。両identityのfirst differenceはenabled damage outcomeの期待`calculated`／実際`unsupported`で、`targetState:buffPoison`の初期count 0と選択された状態条件が`traitPolarity`衝突を起こした。後者の値式には共有`stack:targetState:buffPoison`入力があり、前者にも同じ肯定状態条件がある。applicationの`applyEffectPresentationDecision`はこのeffect-local条件とpeerのstack入力を結んでいなかった。damage-effect-execution §8.8／§8.12、ADR 013に従い、typedなscope／traitと一意にmergeできるstack入力だけを操作する。enabledでは物理countを正値へ送り、effect-local成立も保持する。disabledは当該effectを外して共有countを保持し、無効な明示countは補正せず拒否する。複数条件・否定・曖昧対応からcountを推測しない。executionの矛盾検出やgate分類は変更していない。

HEAD archiveへ今回の`effectDecision.ts`、`stackQuantityFixture.ts`、`stackQuantity.test.ts`だけを載せた独立candidateで、共有入力を持つ効果／持たない効果、enabled／excluded、既存正値、複合・否定・曖昧条件、矛盾、無効入力のsemantic fixtureを含むunit 13/13と関連3/3、`tsc -b`、対象ESLint／Prettierが成功した。実producer gateは別familyのため失敗を維持するが11→9件で、消えたfailureは選択2 identityのみ、新規0件。fresh expected／observed identityは各1,590件で集合不変、変更観測は選択2件のみ。enabled `powerMod`は23549が0→0.3、23547が0→0.2、両方`calculated`になり、excludedは両方`calculated`／`powerMod` 0のまま。最終artifact `.test-results/tsk-08-s4-shared-poison-20260925/producer-final/production-inert-control-production.json` は55,653,544 bytes／SHA-256 `e81df02a156005183f280548b8b8b0fffe7f437802d41d6b2c460e98c3d4603d`、manifest SHA-256 `c4eab685dc6985246895b1c6c7724646d99a797a79eb00411c1d2448c738a932`、receipt error 0。全identity・差分と独立candidateのsource hashは同directoryの`../shared-poison-evidence.json`（SHA-256 `995b889341caa6d8784f67f8c618712422c91d59fb516b170233f818a7531792`）を参照する。`pnpm`はscript前にexternal SQLite storeで失敗し、同じgeneric runnerと既存Vitestへ切り替えた。

このfamilyの限定経路は解消した。残る9件は非calculated 5、B2 `2501400` magicBullet／B3 `403400` targetRarityを含むNP特殊入力不変2、operation／damage未到達2でBlocking。without-area alternate、stale-mutation consumer、他ratchet、全件production／audit／quality、TSK-08全体収束は未達。TSK-06.5の80×433＝34,640 outcomes、34,600 calculated／parity、40 unavailable、final unsupported／invalid／inputRequired各0と既存digest、candidate status／eligibility、production output、canonical input、fingerprint、TSK-07 cache／stale-response evidenceは変更していない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。次は残る9件の別familyを実値から選び、改訂bounded planを提示する。pushしない。

Current bounded-unit handoff（2026-09-25、S4 structural control診断のみ）:

開始HEAD `400a952d390c5e3cda8e1489dd7230ef929ca570`、tracked worktree／index空、ignored `apps/web/next-env.d.ts`、指定3 artifactのbytes／SHA-256一致を確認した。残る9件からowner `505600`の`2619550:532:0:actor-form`と`2619550:532:0:np-variant`を1 familyとして選んだ。両方のtyped reasonは`userControlDamageOutcomeNotCalculated`、first differenceはexcludedの期待`calculated`／実際`unsupported`。実masterの`skillUse`効果`532:0`は同じactionに`transformActorForm`と`selectNoblePhantasmVariant`を含み、基底`505600/505601`は`nonAttack`、遷移先`505700/505701`は`attack`。enabledでは両operationが`applied`でNP Lv1平均`63235.92`の`calculated`、excludedでは両方`notApplied`となり`invalidNoblePhantasmVariant:np:base:nonAttackDamage`でfail closedになる。NP variant入力も遷移先から基底へ変化する。実値の小さいfixture／identityは`.test-results/tsk-08-s4-structural-control-20260925/structural-control-diagnostic.json`（bytes／SHA-256は同unitのmachine evidence）に保存した。

直接経路は`productionMasterControlAudit.test.ts`のcontrol列挙→`applyEffectControlPresentationDecision`→ordered executorの形態・variant選択→`productionParityDiagnostics.ts`の両側`calculated`要求である。`operationCompiler.ts`は同じ`skillUse`効果を`2619550:action`のtransactionへcompileし、`variantSelection.ts`は非攻撃の基底宝具をdamageへ使わず拒否する。damage-effect-execution §4.3は利用者の成立宣言で対象・順序・handlerを上書きせず、ranking要件の`structuralRequired`はprofileと完全なordered pathから導出する。従って除外側を数値へfallbackしたり、issue名だけでS4 gateを緩和したりしない。一方、calculatorの選択AttackProfileがこのactionに依存する時、control offをどのtyped outcomeとして扱い、操作自体を許すかは既存のS4 both-calculated契約と要件から一意に決まらない。製品実装、gate分類変更、source／test編集は行っていない。再適用の逐次recoveryも未検証である。

同条件で有効な実producer観測1,590 expected／observedと9 failureを再利用し、新規producer／source testは実行していない。独立したHEAD＋文書2ファイルcandidateでdocs test 6/6、docs integrity、bounded-unit／status JSON検査が成功し、ignored診断artifactは10,972 bytes／SHA-256 `35d5133e364fca96a05c13686188f9883d806ea468f03296cf2558c08eb8831c`と再照合した。残る7件は別原因候補であり、B2 `2501400` magicBullet、B3 `403400` targetRarityもBlockingのまま。次はstructural control offの利用者可視outcomeとS4 gateのtyped proofを要件・application command・execution recoveryの境界で決め、schema-legalな正例／非攻撃基底／再適用fixtureを作ってから実装計画を提示する。without-area alternate、stale-mutation consumer、他ratchet、全件production／audit／quality、TSK-08全体収束は未達。TSK-06.5の34,640 outcomes・既存digest等とTSK-07 evidenceは変更していない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持し、pushしない。

Current bounded-unit handoff（2026-09-25、S4 505600構造controlの実装境界停止）:

開始HEAD `d9ae3e239a1f8e84c5e87568d923e22314aec4f8`、tracked worktree／index空、指定4 artifactのSHA-256と指定2件のbytesが一致した。計画はユーザー確認済み。実装前の直接経路調査で、計算機の`resolvedScenarioSchema`に選択AttackProfile identityがなく、`resolveScenarioPreparationOutcome`が攻撃NPを選んだ後、`compileExecutionPlan`は初期形態の基底variantからordered executionを構成すると確認した。offで`validateCandidateSelections`が非攻撃基底を拒否し、そのissueが`assembleCandidateResult`から`unsupported`へ伝わる。準備で選んだprofileとoff時に維持すべきprofileの同一性を、現行requestだけから証明できるかは未確認である。`nonAttackDamage`一律の`unavailable`化は明示的な不正選択と正常な除外を混同するため、承認計画の製品変更を開始せず停止した。

追加の読み取り診断は`.test-results/tsk-08-s4-structural-control-20260925/structural-boundary-diagnostic.json`（3143 bytes、SHA-256 `222d79641401de7d2f28039e0d6a69234dd76e613cb159787eb476b55a7c9da3`）。source／test編集、source testは行っていない。source差分identityは空。HEAD archiveと今回の文書2ファイルだけの独立candidateでdocs tests 6/6、docs integrity、JSON status、差分検査が成功した。次は別の攻撃variantを持つschema-legal fixtureで、準備receipt／選択command／ordered selection／off／再onを一度だけ追い、既存の型付き計画から選択AttackProfileを一意に証明できるか確定する。一意ならexecution→application→S4 proofの境界を改訂し、一意でなければscenario／portable identity変更とfingerprint影響を提示する。この改訂診断計画への確認を待つ。9件全体、B2／B3、他ratchetはBlockingを維持し、TSK-08は`in_progress`、TSK-09.1／09は`blocked`。TSK-06.5／TSK-07の保護対象に変更はない。全件production／audit／qualityとpushは行っていない。詳細は[parity ratchet evidence](../evidence/tsk-08-parity-ratchet.json)の最新bounded unitを参照する。

Current bounded-unit handoff（2026-09-25、S4 505600構造controlの読み取り診断）:

ユーザーはこのsessionで製品実装を進めず調査を主とするよう指定した。開始HEAD `6cbc4b40c06428fc725e5e8cec169170c5f16da3`、tracked worktree／index空。実masterの同一plan・controlでon→off→onを追うと、準備stateの選択variantは全段階で`505700/505701`、ordered variantは`505700/505701`→非攻撃基底`505600/505601`→`505700/505701`、結果は`calculated`（NP1平均`63235.92`）→`unsupported`（`invalidNoblePhantasmVariant:np:base:nonAttackDamage`）→`calculated`。portable変更／回復は両方committedである。

published masterに別の攻撃形態・variantとchoiceを追加したignored診断fixtureは`masterSnapshotSchema`を通過した。同じchoiceのon／off／再onは`attackProfileForTerminalState`の同一profile keyを保ち、別choiceは異なるprofile keyと攻撃NPへ到達した。さらに独立した構造actionを順に使うfull schema-legal fixtureでは、後段controlのoff後も準備profileは後段の攻撃NPのまま、ordered executionは前段の別攻撃NPへ切り替わり、NP1平均は`32474.71`→`48664.825`で両側`calculated`だった。variant owner単位の診断でも、最後の選択off時に前の攻撃variantが残り得る。したがって現行S4 gateの両側`calculated`だけでは選択profileの連続性を証明できない。

前handoffの「明示AttackProfile fieldがないため新request identityが必要」という懸念は、具体的な合法planについては解消した。`resolveAttackerFormExecution`の単一terminal stateと`attackProfileForTerminalState`から意図したprofileを導ける。一方、実行側が別攻撃variantへ移った場合のtyped outcomeとgate proof、未解決／曖昧／明示不正を混同しない境界は未決である。別profileを数値成功として表示し続ける修正も、issue文字列による`unavailable`例外も採用しない。

ignored機械資料は`.test-results/tsk-08-s4-structural-control-20260925/structural-control-research.json`（5885 bytes、SHA-256 `6b7df7136bd00d61b297a757ca334407af8089d96aed4a86dda616fc8ea555ce`）。各診断script／結果のbytesとSHA-256、symbol、反例の範囲は同資料に記録した。製品／test／gate／outcome分類は変更せず、source testとproduction producerも再実行していない。次の実装sessionでは、準備terminal profileとordered actual selectionを比較するtyped proofを設計し、非攻撃基底、別攻撃variant、明示不正／未解決、portable recoveryを小fixtureと実producerで検証する。今回のsessionでは実装しない。保存済み9件とB2／B3はBlocking、TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。TSK-06.5とTSK-07の保護対象に変更はなく、全件production／audit／quality、pushは行わない。詳細は[parity ratchet evidence](../evidence/tsk-08-parity-ratchet.json)の最新bounded unitを参照する。

Current bounded-unit handoff（2026-09-25、S4 505600構造controlの製品差分停止）:

開始HEAD `332e8c92fa19843df546903a03ecc2706d261ef5`、tracked worktree／index空、指定2 artifactのbytes・SHA-256一致を確認した。承認されたowner `505600`の同一効果`2619550:532:0`の2 controlについて、準備terminal AttackProfileとordered executionの実profileを型付きで照合する差分を作った。小さい合法fixtureではon `calculated`、非攻撃基底へのoffは`unavailable:selectedAttackProfileHasNoAttack`、前段の別攻撃variantへのoffは`unavailable:selectedAttackProfileChanged`で数値行なし、portable off／再onはcommitted／`calculated`へ回復した。明示不正canonical inputは`unsupported`のまま。UIは結果型を文章に写し、rankingは逸脱したdamageをcacheしない。S4 gateは両側`calculated`ではなく、準備profile・実行profile・transaction非適用・非数値理由のtyped proofを要求する。

最終focused producerでは1,590 expected／observed、failureは保存済み9→7、対象2 identityだけ除去、新規failure 0だった。一方、**対象外のowner `205000`、効果`2281675:532:0`の形態／NP選択control 2件も同じ一般則で変わる**。onはNP1平均`88414.945`の`calculated`（`205000/205001`）、offは従来`48259.59`の`calculated`（`205000/205002`）だが、候補差分では別profileへの逸脱として`unavailable:selectedAttackProfileChanged`、数値行なしになる。今回の2 controlだけへID・issue名で限定することは不変条件に反するため、承認範囲外の製品挙動変更として製品差分のstage／commitを停止した。候補で変わった対象外semantic observationはこの2件だけであり、他の7 gate failureは残る。

source／test差分は未stage・未commitで残す。tracked binary diff SHA-256 `9167825aed66a689e6ee80598808c6bb1a0f95fbfe06c8696d2ca15fa88ef8b4`、新test `productionStructuralControl.test.ts`は4,762 bytes／SHA-256 `1d68e699dd8854063ee4227252e9389ce8a7ec9f01d4ab507ca4de9dc35312f0`。focused unitはgeneric runnerで76/76、producerは対象外7件で予定どおりfailed、両manifestのartifact error 0。`pnpm typecheck`はscript前にexternal SQLite storeで失敗し、既存node_modulesのtsc／ESLintでpackage／webの型検査と対象lintを実行した。機械証跡は`.test-results/tsk-08-s4-structural-control-20260925/structural-control-implementation-evidence.json`（3,503 bytes、SHA-256 `423771afa17262fdaa29712370c5d9f446519d82cb03b7b9dc482673e22df59b`）。forward／recovery、別経路、schema-legal反例と未達の詳細は[parity ratchet evidence](../evidence/tsk-08-parity-ratchet.json)の最新bounded unitを正本とする。

次の操作は、同じAttackProfile連続性規則をowner `205000`の2件にも適用する範囲拡張を確認すること。承認されれば現在の製品差分を保持し、205000をfocused受入へ追加してHEAD＋差分の独立candidateで最終ゲートを行う。2件への厳密限定を維持するなら、ID分岐なしで別攻撃variantへの誤った数値を防ぐ改訂設計が必要である。HEADの製品実装は未変更でS4 9件がBlocking、候補のみ7件。B2／B3、他ratchet、TSK-08全体は未達。TSK-06.5の34,640 outcomes・34,600 calculated／parity・40 unavailable・final unsupported／invalid／inputRequired各0とdigest等、TSK-07 evidenceを変更していない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持し、全件production／audit／qualityとpushは行わない。

Current bounded-unit handoff（2026-09-25、S4 owner 205000への波及を読み取り調査）:

ユーザー指定により、このsessionは製品実装を進めない。開始HEAD `aeb78e877231d0e3f2f2bae541964b64d5081e43`、index空。前sessionの未commit source／test差分はbytes identityを含めて保持した。保存済み実producerのowner `205000`、効果`2281675:532:0`の形態／NP選択control 2件では、onは攻撃variant `205000/205001`でNP1平均`88414.945`、offは両構造operationが`notApplied`となり、別の攻撃variant `205000/205002`へ到達してbaselineでは`calculated`／`48259.59`である。保持中の一般則候補では、準備terminal profileは前者のまま、ordered actual profileは後者へ変わるため、offは`unavailable:selectedAttackProfileChanged`／0行となる。候補producerはこの2観測だけが対象外の意味差分で、S4 failure 9→7、新規failure 0という保存済み結果を再利用し、producerは再実行していない。

契約上、ADR 024はscenarioへinitial formとordered commandを保存し、resolved NP／ranking identityを保存しない。`sourceCollection.ts::resolveAttackerFormExecution`はeffect offとは独立に準備planのterminal stateを導き、`attackProfile.ts::attackProfileForSelection`がその形態・variantをprofileへ写す。`Calculator.tsx::changeEffect`は`effectDecision.ts::applyEffectControlPresentationDecision`からeffect除外commandを送り、別profileへの明示選択commandは送らない。ordered executorでは同一effect内の両構造operationが非適用となる。ranking要件§3.1／§5.1は別profileの数値混成を禁止し、damage-effect-execution §3.2は確定効果offを比較用除外として許す。したがって別profileの数値を**元の選択profileの結果として返すことはできない**。ただし通常calculatorの要件は、構造効果off時に準備profileを固定するか、結果に合わせて別profileへ明示的に選択し直すかを明文化していない。現候補の`unavailable`は前者を採る設計判断であり、後者を望むならapplicationのprofile再選択commandとS4 gateのtyped proofが必要になる。ID例外や「両側calculated」だけのgateでは解決しない。`rankingPolicy.ts`が生成するscenarioの`effectDecisions`は空で、自己バフ二軸は別のcontribution policyで処理するため、今回のoff分岐が既存ranking結果へ直結する経路は見つからなかった。ただし保護対象の34,640 outcomeは再計算しておらず、不変性の最終証明ではない。

調査資料 `.test-results/tsk-08-s4-structural-control-20260925/owner-205000-readonly-research.json`（7,983 bytes、SHA-256 `761a1f779c652ce1f8d37e0a28f5b8b948871a4f0ecc3d70f6aa7a2888c75977`）へ対象2件のbaseline／候補status・profile canonical ID・operation outcomeを限定抽出した。次の実装sessionでは、通常calculatorの選択profile契約を確定してから205000のoff／再on portable回復、同profile alternate path、明示不正／未解決入力、ranking／UI表示を小fixtureと実producerで検証する。今回source／test編集・source test・producer再実行・製品差分のstage／commit・pushは行わず、調査文書だけをlocal commitする。HEAD製品にはS4 9件、候補には7件のBlockingが残り、B2／B3、TSK-08全体、TSK-09.1／09と保護対象ratchetは前handoffどおりである。詳細は[parity ratchet evidence](../evidence/tsk-08-parity-ratchet.json)の最新bounded unitを参照する。

Current bounded-unit handoff（2026-09-25、S4 505600／205000の構造control 4件）:

開始HEAD `840587e9325b027a3b50ad3ae4668ffc97b598b7`、index空。保持中tracked source／test binary diff SHA-256 `9167825aed66a689e6ee80598808c6bb1a0f95fbfe06c8696d2ca15fa88ef8b4`、新testと指定2 ignored資料のbytes／SHA-256は引継ぎと一致した。通常calculatorでは準備planのterminal AttackProfileを選択結果とし、effect offはその包含を変える。別profileへの選択commandがないため、offで別攻撃variantへ移った数値を元profileの結果として返さない。ADR 024、damage-effect-execution §3.2、ranking §3.1／§5.1、`Calculator.changeEffect`のcommandから判断した。保持中の一般則候補を採用し、owner `205000`の2 controlも今回の承認範囲へ含めた。servant IDによるruntime分岐はない。

実値は505600のon `505700/505701`／NP1平均`63235.92`、offは非攻撃基底で`unavailable:selectedAttackProfileHasNoAttack`／0行。205000のon `205000/205001`／`88414.945`、offは別攻撃`205000/205002`へ移るため`unavailable:selectedAttackProfileChanged`／0行。旧`48259.59`は別profileの値である。両効果とも形態／NP選択の2 operationはoff時`notApplied`で、portable off／再onはcommittedされ、再onは元数値へ回復した。schema-legalな前段別攻撃variantの反例は両側raw `calculated`（`32474.71`→`48664.825`）でもprofileが異なるため、S4 gateは準備・実行profileの一致または型付き非数値理由、transaction非適用、0行を確認する。同profile alternateは`calculated`を許す。明示不正・未解決入力は既存のtyped `unsupported`／`inputRequired`を優先し、曖昧・追加issueを`unavailable`へ丸めない。

独立candidateはHEAD archiveに今回のtracked source／test差分と新testだけを載せた。focused unitは46/46、workspace `tsc -b`とWeb `tsc --noEmit`、対象11 source／test fileのESLint／Prettierが成功した。focused producerは1,590 expected／observed、保存済み候補と同一artifact SHA-256 `5fd4e7f00f7c6f39ba3ea0a6f6134704a7a274ae10f48de1536ab8a77e8130d7`、failure 7件は既知の対象外identityのみで新規0。`pnpm test:diagnostic`はscript前にexternal SQLite storeで失敗したため、既存Vitestを同じgeneric runnerで実行した。artifactのbytes・SHA-256、4 identityのtyped値、forward／recovery／alternate／production外schema-legal反例は[parity ratchet evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitとignored `.test-results/tsk-08-s4-structural-control-20260925/four-control-final-evidence.json`（4,644 bytes、SHA-256 `7590f3106e1814516cb6840b216eb6c65c1d63111252ca176f06952eaa6fc63c`）を参照する。

今回の4件は閉じたが、残るS4 7件、B2／B3、他ratchetはBlockingのまま。TSK-06.5の34,640 outcomes・34,600 calculated／parity・40 unavailable・final unsupported／invalid／inputRequired各0と既存digest、candidate status／eligibility、production output、canonical input、fingerprint、TSK-07 cache／stale-response evidenceは変更しない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。全件production／audit／qualityとpushは行わない。次は残存7 identityを既存Taskの別bounded unitとして扱う。

Current bounded-unit handoff（2026-09-25、S4 B2 `2501400` magicBullet読取調査）:

開始HEAD `7b97e220a0d0eeb3b73907f9e5b53b28c0e995c8`、tracked worktree／index空。利用者指定により今回は製品実装・source test・producer再実行を行わない。保存済みon/off artifactの対象は`np:["2501500",0,"2501501"]:5337:trait:magicBullet`のworld assumption controlで、onだけ`attacker:magicBullet=true`を持つ。準備planはskill 1→3→変身NP→skill 2→攻撃NP。onの初期形態`2501400/0`ではattacker count 1だが、選択形態`2501500/0`への遷移後は0になる。offも0。終端attackerState countは両方3で、選択NP `2501500/2501501`、両方`calculated`／NP1平均`48109.855`、`npSpecialMultipliers`は全level `1.3`のまま。gate reasonは`userControlNpSpecialInputNotChanged`で、投影が`applied`でもdamage inputへの到達は証明しない。

直接原因は`traitCountProjections`がattacker world factを生成し、`effectDecision.applyEffectDecisionCommand`がscenarioへ保存する一方、`candidateSelection.validateCandidateSelections`が初期stateの固定事実と照合してfactを適用した**後**、`variantSelection.applySelectedNoblePhantasmContext`が`state.applyActorFormTransition`でattacker固有trait／countを置換する順序にある。`candidateExecution`は事前適用済みoperationを再適用せず、`npDamageExecution`は消失後のattacker＋attackerState countを読む。ADR 024、damage-effect-execution §8.6／§8.8／§8.12.6に照らし、選択終端形態の固定事実、明示negative、同transactionのadd／remove／suppress、same-form／alternate path、rollback／再onの矛盾と順序を確かめるまで、world factの単純な再適用は採用しない。今回の5,407 bytesのignored診断資料とSHA-256、source symbol、観測値、最小fixture matrixは[parity ratchet evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitを参照する。

次の操作は、このmatrixだけのschema-legal小fixtureでpre-group state、fixed facts、typed outcome、projection、NP特殊入力を照合し、execution候補構築／制約検証の順序を決めてから実装計画を提示すること。S4の残りはB2／B3と他5件の計7件でBlocking、TSK-08は`in_progress`、TSK-09.1／09は`blocked`。TSK-06.5のoutcome／digest等とTSK-07 evidenceは変更せず、全件production／audit／qualityとpushは行わない。

Current bounded-unit handoff（2026-09-25、S4 B2 magicBullet境界の追加診断）:

開始HEAD `f104e4776291575cf53976fa99a569427a5f2e12`、tracked worktree／index空、前回ignored診断は5,407 bytes／SHA-256 `8ba3fc957ff9b83e238815ac006e366160d667d26fa40a87561af773e23c6b60`で一致。利用者確認後も製品source／test編集と実producer再実行は行わず、ignoredの小診断だけを実行した。保存済み実producerのon/offは終端attacker `magicBullet` count 0、attackerState count 3、`calculated`、NP特殊入力全level `1.3`、projection両側`applied`のままである。

診断は保存済みcompile済みoperationとschemaを通したscenario world assertionを使い、攻撃直前attackerState count 3を小stateに合成した。肯定fact＋形態変更は初期count 1→終端0でon/offともNP特殊入力`1.3`。さらに対象ownerだけを抽出したpublished masterをschemaに通し、終端固有true、同transactionのadd／remove／suppress、同一形態の選択＋remove／suppressを実際のcompilerから生成して候補検証へ接続した。終端固有true対明示negativeは初期検証を通るが終端固定事実では`conflict`、typed issueなしで診断用入力`1.1`。初期形態だけのtrue対negativeは初期検証で`constraintConflict`。形態変更なしの肯定factはcount 1。同一形態の事前適用removeは`attackerState` mapをfalseにしてcount 1を残し、通常ordered removeのcount削除と異なる。同一形態の`suppressInitialTrait`は初期layerの条件false・attacker count 1・診断用入力`1.1`で、conditionとtraitCount readerの意味が分かれる。異なる合法NP variant選択、選択不正／事前適用transaction失敗のtyped issueと入力非生成、off→再onのworld assertion復元も記録した。診断用倍率は小stateの入力値であり、修正後の実damage結果ではない。

重要な訂正として、add／removeを`attacker`へ直接作用させる初回小fixtureは製品compilerから到達しない。schema合法なadd／removeのscopeは`attackerState`、suppressだけが`attacker`初期layerである。初期negativeとstate add、初期positiveとstate removeは別layerなので固定事実の矛盾とみなさない。根拠はADR 024の形態固有trait切替、ADR 009 E3.3の外部actor fact＝initial layer、damage-effect-execution §8.8の固定事実・commit済みmutationの統合制約／原子的commit、§8.12.6のcontrol到達契約。安全な実装境界は、外部assertionのprovenanceを形態固有traitと分けること、初期と終端で必要な固定事実を検証すること、事前適用とordered mutationでcount／predicateを一致させること、失敗した選択transactionのstate・input・operation outcomeを一緒に戻すことである。`candidateExecution`の非事前適用transform経路も同じ遷移規則を使う必要がある。単純なfact再適用やprojectionによるgate緩和は採用しない。

ignored資料は`.test-results/tsk-08-b2-magic-bullet-20260925/deep-diagnostic.json`（18,877 bytes、SHA-256 `f140911146d09103db4cf58629d70ce08838d55c24f74d63b4c376041626a51c`）。再現用の抽出master／fixture／configと結果のbytes・SHA-256、各caseのstate・制約・typed issue・projection・NP特殊入力は[evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitへ記録した。ignored診断はVitest 2/2、HEAD＋今回の文書2ファイルだけの独立candidateでdocs test 6/6、docs integrity、対象Prettier、JSONとchecksum照合に成功した。次はこの境界を製品実装計画として提示し、確認後にB2と同じ直接経路だけを修正する。B2を含む残り7件はBlocking、TSK-08は`in_progress`、TSK-09.1／09は`blocked`。保護対象TSK-06.5／TSK-07の値・digest等は変更せず、全件production／audit／qualityとpushは行わない。

Current bounded-unit handoff（2026-09-25、S4 B2 `2501400` magicBullet製品修正）:

開始HEAD `169d8d1465529e7eb572c491c88eecd5968bab5b`、tracked worktree／index空。利用者確認後、battle-executionのcanonical stateに外部attacker assertionの由来を保持し、形態固有traitの置換後も外部factを残す。選択形態の固有traitと外部factの矛盾をtransaction前にtyped conflictとし、選択後の固定事実／条件も再検証する。事前適用とordered実行のremove／suppressは同じmap・count更新を使い、ordered形態遷移でも同じ固定事実を検証する。application command、ranking policy、UI、S4 gateの意味は変更しない。根拠と反例は[evidence](../evidence/tsk-08-parity-ratchet.json)の今回bounded unitを参照する。

focused semantic fixtureは肯定fact＋形態変更、終端固有true対negative、初期だけのtrait対negative、同一形態のremove／suppress、選択transaction失敗、off→再onを確認した。保存済みcompiler診断で合法scopeはadd／removeが`attackerState`、suppressが`attacker`初期layerであることを再利用し、attacker直接add／removeは根拠にしていない。実producerは対象B2のonで選択形態`2501500/0`・NP `2501500/2501501`、NP特殊倍率全level `1.4`、NP1平均`51810.655`、offで`1.3`／`48109.855`、両側`calculated`を観測した。S4 failureは7件から6件へ減り、B2は消えた。残るB3と他5件はBlockingで、全件production／audit／qualityは実行しない。

検証artifactのpath・bytes・SHA-256、独立candidateのtypecheck／対象lint・format／文書検証、既存architecture ratchetのHEAD由来失敗と今回差分の境界は[evidence](../evidence/tsk-08-parity-ratchet.json)に記録する。TSK-06.5の34,640 outcomes、34,600 calculated／parity、40 unavailable、final unsupported／invalid／inputRequired各0と既存digest、candidate status／eligibility、production output、canonical input、fingerprint、TSK-07 cache／stale-response evidenceは変更しない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持し、pushしない。次は残る6件を別のbounded unitで計画する。

Current bounded-unit handoff（2026-09-25、S4 B3 `403400` targetRarityの事前読取調査）:

開始HEAD `66e006690ed224d64194f6953df9496906f62f8f`、tracked worktree／index空。B3一件だけを次の計画対象として、保存済みproducerとon/off観測、現行の直接生成・利用symbolを読み直した。製品source／testは編集せず、source test・producerは再実行していない。対象は`np:["403400",0,"403401"]:3854:damage`のNP特殊入力control。onのeffect decisionは`operationEnabled=true`／`conditionSatisfaction=evaluate`、offはfalse／evaluateで、両側ともworld factなし、`baseInput.targetRarity=null`。NP条件は`targetRarity==1 OR ==2`、倍率パラメータは`correctionPermille=1500`。保存済み実producerは両側`calculated`、NP特殊倍率全level `1`、NP1平均`24202.825`、onの表示controlはactiveだがprojectionは`notApplied`／`unresolved`であり、S4 reasonは`userControlNpSpecialInputNotChanged`である。

現行コードではquantity-only条件は`conditionAllowsEffectLocalDecision`の対象外なので、`applyEffectPresentationDecision`は成立宣言を作らずoperationのon/offだけを保存する。calculatorの基底入力はtarget rarityをnullに置き、NP evaluatorはnullを中立倍率へ解決する。一方rankingには具体的なrarity world factをmaterializeする経路がある。この差の製品上の扱い、2つの適格rarityでの入力所有権、onかつ未解決時のtyped outcomeはまだ決めていない。数値を捏造せず、既存のquantity／effect-local／canonical input契約とUIの実操作を照合した**コード起点の実装計画を先に提示し、確認を待つ**。安全な変更境界が決まらなければ、必要最小の診断計画に切り替える。根拠symbol、artifact identity・checksum、未決事項は[evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitとignored `.test-results/tsk-08-b3-rarity-20260925/preplan.json`を参照する。

B3と他5件はBlockingのまま。TSK-08は`in_progress`、TSK-09.1／09は`blocked`。TSK-06.5／TSK-07の保護対象は変更せず、全件production／audit／qualityとpushは行わない。次の作業者はこのB3一件と同じ原因の直接経路だけを1セッションの対象とする。

Current bounded-unit handoff（2026-09-25、S4 B3 `403400` targetRarity製品修正）:

開始HEAD `43437070691726bd9972c69d12f5cf125681f59b`、tracked worktree／index空。計画確認後、quantity-only条件のonをeffect-local成立宣言として保存し、NP特殊decisionをcandidateの統合制約へ登録した。利用者の操作はrarity 1／2のどちらかを捏造せず、条件に合う全rarityでNP1〜5入力が一意な場合だけ特殊倍率を確定する。明示rarityとの矛盾・範囲外、枝ごとに倍率が異なる場合はtyped fail-closedとし、nullをfalseや数値fallbackへ変換しない。rankingの具体rarity fact生成は維持した。

小fixtureはnullのon/off、rarity 1／2・対象外・範囲外、quantity-onlyとtrait混合のany／all／not、off→再on、保存復元、calculator／ranking、非一意倍率を確認した。実producer 1,590 controlではB3のonが`calculated`／projection `applied`／NP特殊入力全level `1.5`／NP1平均`36304.49`、offが`calculated`／`notApplied`／全level `1`／`24202.825`。前artifactのfailure 6件と今回5件のidentity差分はB3の除去1件、追加0件である。残る5件は別bounded unitのBlockingであり、全件production／audit／qualityとpushは行わない。

focused 60/60、独立HEAD＋今回差分candidateのroot・web typecheck、対象lint／format、focused 60/60を確認した。`pnpm`はscript前に外部SQLite storeで失敗したため、既存node_modulesと同じgeneric runnerへ切り替えた。artifactのbytes・SHA-256、文書検証、既存architecture行数テストのHEAD由来2件との境界は[evidence](../evidence/tsk-08-parity-ratchet.json)へ記録する。TSK-06.5の34,640 outcomes、34,600 calculated／parity、40 unavailable、final unsupported／invalid／inputRequired各0と既存digest、candidate status／eligibility、production output・canonical input・fingerprint、TSK-07 cache／stale-response evidenceは変更しない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`。次は残る5件を別のbounded unitで計画する。


Current bounded-unit handoff（2026-09-25、S4 owner `2301100` 3 controlの読み取り診断）:

開始HEAD `d08108a5d79c887b64d354b4ba5ece58cadd9865`、tracked worktree／index空。保存済み実producer（61,521,901 bytes、SHA-256 `8def9c53552cdfb6ec6f82e041a3437cd28ea0b001fbe73cda31960372db2875`）を照合した。3件のonは同じ`selected-form`の`exclusiveTrait:attacker:npCardForm`で`unsupported`、offは`calculated`。data pipelineがactive-only recipient trait条件を正規化し、commandは`operationEnabled=true`／`assumeSatisfied`を送る。passive 2534650:22871が先に付与する`traitId:3122`と、3件が要求する`traitId:3121`はcanonical排他groupで衝突する。22874のArts条件は観測経路で成立している。candidate検証後の対象event／projectionはon/offとも`notApplied`、effective contributionはfalse、damage input bindingは同値。保存済みgateの`damage-outcome`分類だけで原因を確定せず、直接issueを採取した。

UI既定calculator scenarioはskill slot 2のchoice 1を含み、画面にはchoice 0への切替chipがある。applicationの`setPreparationSkillChoice`でchoice 0を明示選択すると、宝具variantは`2301198`となる。この実経路で3件ともon/offが`calculated`、対象event・projectionは`applied`／`notApplied`、入力差分とNP1平均差分を持つ。off→再on、JSON schema保存復元も一致した。rankingの`conditionalEffects=satisfied`では114候補中、同じchoice 0＋skill slot 3の候補を確認し、3件とも`applied`／`calculated`。元のproducer既定scenarioはslot 2を含まず宝具variant `2301101`であり、月下の有効経路とはAttackProfileが異なる。

確定した共通原因は、S4 producerが日輪の固定状態だけで3件のon/offを採取し、到達可能な月下profile上の操作応答と混同していることである。executorのtyped conflictは妥当であり、chip操作からchoiceやtraitを捏造しない。次の**承認待ち計画**は、canonicalな準備候補とAttackProfile identityを使って対象controlの到達可能な同一scenario on/offをS4 producerへ接続し、日輪側のtyped conflictも別の反例として保持すること。件数・candidate数・時間の差分を測り、単なるgate除外、数値fallback、ID／label分岐を行わない。audit ownership変更の境界が確認されるまで製品source／test／gateを変更しない。根拠symbol、ignored診断artifactのbytes・SHA-256、実identityと値は[evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitを参照する。

診断用のignored Vitest 1/1のみ実行し、製品source／testは未編集。full producer／audit／qualityは未実行。残るowner 1000100／3300200の2件、他ratchet、TSK-08全体の収束は対象外。TSK-08は`in_progress`、TSK-09.1／09は`blocked`、保護されたTSK-06.5／TSK-07 evidenceは維持する。資料だけを検証してlocal commitし、pushは行わない。

Current bounded-unit handoff（2026-09-25、S4 owner `2301100` 3 controlの到達可能profile監査実装）:

開始HEAD `6a03aa1ba8980ca96ebe55a800b64162639339ce`、tracked worktree／index空、指定ignored診断のbytes・SHA-256一致。実装commitは`b11abc97ec09c509b8cb16269c06fb3f8460c0b1`。確認済み計画に従い、S4 producerが既定scenarioの`selected-form`型付き衝突を検出した場合、既存plannerのcanonical準備候補から到達可能な単一AttackProfileを持つcontrol応答を採取する。候補のprofile keyは準備terminal stateから独立に導出し、同一scenarioのon/offを既存application／ordered executionで比較する。元の日輪scenarioのon `unsupported`／off `calculated`、対象event・projectionの両側`notApplied`、入力同値、enabled数値行なしもgateに残す。準備choiceやtrait factをchipから暗黙生成せず、ID／label分岐、数値fallback、gate除外はない。data pipeline、application command、executor、calculator／ranking policy、UI製品コードは変更しない。

独立HEAD archive＋今回source／test差分candidateでroot／Web typecheck、対象ESLint／Prettier、focused unit 14/14成功。小fixtureは固定traitの月下true・日輪false・未固定での明示成立宣言、active-only provenance、非Arts cardの`impossible`と実入力非寄与、競合fact／choice、off→再on、JSON保存復元、calculatorとrankingの別経路を確認した。UIは月下choice 0の候補→選択中の表示と、準備choice専用commandを確認した。実producerの1,590 expected／observedは不変。対象3件はslot 1→slot 2 choice 0→slot 3、宝具variant `2301198`でon/offが両側`calculated`、event／projection・effective contribution・実damage input・NP1平均が対応して変わった。日輪variant `2301101`の型付き衝突も保持。S4 failureは5→2で除去は対象3件のみ、新規0。準備候補は対象ownerで22生成／14終端、最終監査所要時間は30,494→32,522 ms（+2,028 ms、+6.7%）。先行candidateの36,009／37,213 msも記録し、実行時間のばらつきを区別する。`pnpm`は外部SQLite storeでscript前に失敗し、既存node_modules＋同じgeneric runnerへ切り替えた。architecture行数テストは7/9、HEADから無変更の`engine.ts`と`candidateSelection.ts`の2件が失敗し、以前の`candidateExecution.ts`という箇所名とは現HEADで異なる。artifactのbytes・SHA-256、対象identity・値、検証manifestは[evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitとignored `.test-results/tsk-08-2301100-final-20260925/final-evidence.json`を参照する。

残るowner `1000100`／`3300200`の2件、他ratchet、TSK-08全体の収束は今回の対象外Blocking。TSK-06.5の34,640 outcomes・34,600 calculated／parity・40 unavailable・final unsupported／invalid／inputRequired各0と既存digest、candidate status／eligibility、production output／canonical input／fingerprint、TSK-07 cache／stale-response evidenceは変更しない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`。全件production／audit／qualityとpushは行わない。次は残る2 identityを別bounded unitとして扱う。

Current bounded-unit handoff（2026-09-25、S4 owner `1000100` HP live-readの限定診断）:

開始HEAD `f289a0d5cf8c546e6da25f2b3240df6e6dcba812`、tracked worktree／index空。最新producerの1,590 identityと2 failures、および記載されたproducer／関連4 artifactのbytes・SHA-256を照合した。今回の承認範囲は診断と資料commitだけで、製品source／test、S4 producer／gateは変更していない。ignored診断Vitestは最終1/1、warning 0。`pnpm test:docs`は外部SQLite storeでscript前に停止したため、同じdocs検証本体を直接実行して6/6とintegrity、対象Prettierに成功した。実identity、on/off実値、artifactとrunner manifestのbytes・SHA-256は[evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitを参照する。

対象attackBuffのcanonical条件は攻撃役HP `0〜500‰`で、projectionは`attackerHpPermille`を要求する。S4 producerは初期入力を`500‰`へ設定するが、既定の準備planにある宝具前HP回復 `3,000`（occurrence `446:0`）の後、実readは`8,950/11,901 = 752‰`となる。このためon/offともoperation／projectionが`notApplied`、実attackBuff入力`0.3`、NP1平均`48,824.155`で同値になる。初期`249‰`も回復後`501‰`で不成立。初期`240‰`は回復後`5,856/11,901 = 492‰`となり、同一scenarioのon/offでoperation／projectionが`applied`／`notApplied`、effective true／false、attackBuff入力`0.604`／`0.3`、NP1平均`60,194.84`／`48,824.155`に分かれた。初期`200‰`でも成立を確認した。effect chip commandはHP事実を生成していない。観測経路の原因はS4監査の**初期HP witnessとordered read時点の混同**であり、executor修正の根拠ではない。

次の承認待ち実装計画は、このcontrolのcanonical HP条件から有限な初期witness候補を選び、準備後のlive readと同一AttackProfileのon/offで成立を検証してS4 producerへ接続すること。既存`rankingHpInitialBoundaries`の候補責務を評価し、候補数・時間・1,590 identityへの影響を測ってから採用する。`240`の固定規則、ID／effect ID／label分岐、chipによるHP生成、数値fallback、部分適用、gate除外は使わない。`2301100`の月下到達候補と日輪型付き衝突を回帰条件に残す。`3300200`のbattle point phase条件は別原因・別bounded unitとして扱う。他ratchetもBlockingのため、TSK-08は`in_progress`、TSK-09.1／09は`blocked`。全件production／audit／qualityとpushは未実施。次操作は`1000100`の実装境界について利用者確認を得ること。

Current bounded-unit handoff（2026-09-25、S4 owner `1000100` HP witness監査実装）:

開始HEADは`82246cb43687d4878d2c4d2db69fdfe1e1d6afdc`、tracked worktree／indexは空。承認された範囲でS4 producerだけがcanonical HP条件を持つcontrolに有限な初期HP候補を作り、既存の準備・ordered executionでlive read、同一AttackProfile、同一scenarioのon/off、operation／projection／effective contribution、damage input・最終resultを検証して採用する。既存`rankingHpInitialBoundaries`はrankingの静的source列とworld候補を所有するため監査の選択済み準備planへ直接流用せず、初期1〜1000‰の有限域で境界候補を優先し、必要時は全域を検証する。候補の状態・条件・結果を推測せず、未成立はS4 gate failureとして残す。製品executor・calculator／ranking semantics・UI・保存schema・S4 gate判定は変更していない。

独立HEAD archive＋今回差分candidateでfocused unit 39/39、root／Web typecheck、対象ESLint／Prettierが成功。小fixtureは初期500→live752、249→501の条件不成立、240→492の成立、on/offのevent／projection／effective contribution／damage input／最終damage、JSON保存復元とoff→再onを確認した。対象producerは1,590 expected／observedを維持し、HP controlは初期1‰・準備後3,011/11,901＝253‰を3候補評価で採用。on/offのoperation・projectionは`applied`／`notApplied`、effectiveはtrue／false、attackBuff入力0.699／0.3、NP1平均63,748.185／48,824.155。`2301100`の月下3件と日輪の型付き衝突も残る。S4 failureは2→1で、残る1件はowner `3300200`の`userControlDidNotReachOperationOrDamage`。producer全file所要時間は先行32,522 msから32,820 msへ変化（+298 ms、+0.9%）し、実行時間のばらつきの範囲。候補生成は最大1,000初期値／対象HP control、実評価は3件。`pnpm`は外部SQLite storeでscript前に停止したため、既存node_modulesと同じgeneric runnerを使用した。artifactとbytes／SHA-256は[evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitとignored `.test-results/tsk-08-1000100-final-20260925/producer-verified/`を参照する。

owner `3300200`のphase条件と他ratchetは別原因のBlockingとして残す。TSK-06.5の34,640 outcomes、既存digest・candidate status／eligibility・production output／canonical input／fingerprint、TSK-07 cache／stale-response evidenceは変更しない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`。全件production／audit／qualityとpushは行わない。次は`3300200`を別bounded unitとして診断し、その後に他ratchetと最終ゲートへ進む。今回差分と資料だけをlocal commitする。

Current bounded-unit handoff（2026-09-26、S4 owner `3300200` 実装前の読み取り調査）:

開始HEADは`c0b353b03dd9de303983ee36a1a92ddd95a72678`、index空。tracked差分16件、untracked 2件を保持し、製品source／test編集、source test／producer実行、stage／commitは行っていない。差分の内容とSHA-256、既存artifactの照合値、symbol別の判断は[TSK-08 parity ratchet](../evidence/tsk-08-parity-ratchet.json)の最新bounded unitを正本とする。今回の成果は実装の成功証拠ではなく、後続実装のためのコード・既存artifact調査である。

対象IRはNP variant `3300201`のoccurrence `1588:0`、`ignoreDefense`、canonical requirement `battlePointPhase atLeast 7`／subject domain `3300200`。pipelineの`normalizeQuantityConditions`→masterの`BattlePointDomain`→scenarioの`battlePointWitnesses`／`prepareCalculationScenarioWithPolicy`→ordered `evaluateCondition`／`candidateExecution`→operation event／projection／effective contribution→`foldDamageInput`→calc-coreという直接経路を確認した。domain `3300200`はpoint scale、phase `0..10`の11段階、threshold `-1,0,10,...,90`、capacityはnull。scenario quantity schemaも`0..10`である。既定S4はphase 0で対象が届かず、先行producerの1,590 identity中この1件だけ`userControlDidNotReachOperationOrDamage`。暫定probeは初期phase 7／選択point 65、準備後point 70／phase 8、同じ既定plan・敵防御力0.3のon/offでevent・projection `applied/notApplied`、effective `true/false`、最終`ignoreDefense true/false`、NP1平均`50,121.67/37,626.165`を観測した。ただしrunnerは予期しないconsole観測による`contract_failure`で、phase 8は準備後stateの算出値であって対象operationの実readではない。既存operation resultの`condition: satisfied`も数値readを証明しない。

後続実装の監査契約は、条件leafのcanonical subject/domainと`0..10`のscenario domainから有限候補を組み、候補pointを一つ選んだ後、**onもoffも同じ明示`initialBattlePointPoints`で再実行**すること。現在のdomainではphase候補最大11、初期point候補はabsent `-1`と`0..90`の最大92値。準備後readだけで代用せず、audit-onlyの`evaluateCondition` callbackをquantity readへ拡張し、operation sequence／group／operation ID／subject domain／actor／point／phase／評価値を同じ選択candidateのtraceへ載せる。trace欠損、複数domain、schemaで表せないphase、候補不成立、曖昧target、typed invalid／unsupportedはfail closedにする。audit producerとS4 gateは対象readからevent／projection／effective contribution／damage input／resultまで同一identityで照合する。`32`という暫定上限、owner ID／effect ID／label分岐、gate除外、manual final inputだけの比較を採用しない。

敵防御力はresolved scenarioの独立入力とし、effect chipでは変更しない。`createDefaultResolvedScenario`、`damageResolutionInputForNoblePhantasm`、`setEnemyDefenseBuff`、rankingの固定scenario、Calculatorの入力・修復を一本の経路で検証する。calc-coreは`ignoreDefense`時にdefenseBuffを攻撃補正から除く。schemaVersionはscenario／result変更により41へ更新するが、暫定v40 migratorの旧result版書換えは歴史的identityと矛盾するため採用しない。v40の旧request／旧result／旧fingerprintは検証して履歴値として保持し、draft・history・share・backup・起動時移行を同じhistorical-only契約へ接続する。shareに保存fingerprint fieldはないため旧requestから算出し、暗黙再計算せず履歴値として表示する。旧draftはhistory上限20件へ押し込まず独立に保護し、明示再計算の成功時だけ敵防御力0を含む新request、新fingerprint、新resultを作る。失敗時は原recordを保持する。起動時移行はADR-002どおり旧recordの事前backup、staging検証、単一transaction切替を要する。既存v33〜38 historical recordは、既に保存された形を再書換えしない。旧runtimeや互換fallbackは追加しない。`regenerateHistoricalCalculatorRequest`は現在、元scenarioを引き継がず既定requestを作るため、v40の明示再計算には直接流用できない。`startup`／`CalculationWorkspace`／`CalculatorRoute`／`HomeRoute`まで代表実経路をつなぎ、旧結果を現行計算のheadlineとして表示しない。

保存経路の実装判定を固定する。v40 resolved／manual draftはどちらも旧request・result・fingerprintを独立の歴史的draftとして保持し、現行draftは自動生成しない。v40 current historyは同じ三点とhistory ID／時刻をimmutableのhistorical-only entryへ保つ。既存v40内のv33〜38 historical entryは、その時点で保存されたfieldをそのまま保つ。v40 shareは旧request・resultを読み取り専用で表示し、明示再計算まで現行workspaceへ流さない。v40 backupは全件検証と復元前backupの後、profileの原本・歴史的計算を一括切替する。再計算は元のresolved scenario／execution intentを使ってcurrent masterに対する新requestを検証し、成功時だけ新identityを別draftへ保存する。manualはmanual intentのまま新requestを作る。失敗時は旧record・表示を維持し、`invalid`／`unsupported`／version unavailableを区別する。`ENGINE_VERSION`は既存damage semanticsが変わらない限り48のままで、監査readの追加だけで上げない。

portable fingerprintは`workspace-domain`がrequest全体をcanonicalizeしてSHA-256化し、ranking条件fingerprintとは別である。v41の新request identityとTSK-06.5 `mergedDigest`は意図的に変わる。旧`mergedDigest`は履歴に保持し、新digestは対象内Blocking解消後のcanonical 8-shard matrix／mergeで測定して明示更新する。34,640 outcomes、status／eligibility、production output／canonical inputは別定義の保護対象として比較する。matrixの既存所要時間見積りは8 shardを最大4並行×2 waveで16〜26分、S4 focused producerは先行32,820 ms／未確定probe31,780 msである。probeはphase候補1評価であり、追加read観測と保存移行後の候補数・時間はまだ実測値ではない。

後続実装は小fixtureで境界・準備前後・実read・on/off・rollback／失敗・保存復元・明示再計算を先に接続し、実producerの1,590 identityとowner `2301100`月下／日輪、`1000100` HP witnessを回帰確認する。未追跡の`productionBattlePointControlWitness.test.ts`はcanonical条件に`subjectId`があるのに期待値が省略しており、そのまま成功fixtureとみなさない。独立HEAD＋対象差分candidate treeで局所検証し、artifact bytes／SHA-256と候補数・所要時間を記録する。対象内Blockingが残る間は全件production／audit／qualityを実行しない。`pnpm`の外部SQLite storeでscript前に失敗した場合は同じgeneric runnerへ切り替える。既知architecture行数テストのHEAD由来2件は差分起因と混同しない。60分checkpoint、90分以降新semantic family開始なし、pushなし。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。

この資料更新の`pnpm test:docs`は依存status確認中に外部SQLite storeを開けずscript前に失敗した。同じdocs検証本体を既存node_modulesから直接実行し、`node --test scripts/docs-integrity.test.mjs`は6/6、`node scripts/docs-integrity.mjs`と対象Prettier、JSON parse、`git diff --check`は成功した。製品source testとproducerは実行していない。

実装前セルフチェック（2026-09-26、同じbounded unitの計画補正）:

- 先の「最大92初期point」はcanonical legal domainの上限ではない。`battlePointResource.ts::reconcileBattlePointActor`はcapacity nullの非負整数pointに上限を設けず、phase 10はpoint 90以上を表す。`battlePointPhaseCandidates`が返すabsent `-1`＋point `0..90`の92値は**現行plannerの有限witness集合**であり、全legal stateの列挙ではない。phase候補はschemaの`0..10`、このdomainで11件。対象監査はcanonical条件からphaseを列挙し、plannerの各有限witnessを順に実行し、対象operationの実readと全段差分を満たすものだけ採用する。見つからなければtyped gate failureを残し、phase 10の合法pointを不当にinvalidとは扱わない。対象の単一domainなら上限は92 concrete準備評価＋選択後on/off各1再実行（実装で生成数・評価数を別記録）。複数domainの直積、条件leafのsubject/domain曖昧、schema域外phaseは黙って切り詰めずtyped failureとする。実測probeはphase 7の1候補選択で31,780 ms、先行producer32,820 msであり、最大94評価の時間をこの2値から線形推定して成功予算とはしない。最終候補の実評価数とproducer時間を記録する。
- 現行`ProductionUserControlGateInput.expectedIdentities`には条件read要件がなく、`battlePointWitness`もoptionalなので、traceを単に追加しても欠落時にgateが通り得る。producerのcanonical IR inventoryから対象identityに必要な`battlePointPhase` leaf・subject・comparison・値を**期待契約**として渡し、gateはその期待と両側のordered read traceを照合する。観測にはcandidate identity、準備planと初期point、operation sequence／group／ID、actor／domain、read時point／phase／評価値を載せる。条件木の`all`／`any`／`not`は実際に評価したleafと集約結果を結び、対象operation event・typed outcome・projection・effective contribution・damage input・rowsへ同一identityで接続する。期待readの欠落、別candidate、複数または曖昧な対象read、on/offのplan・明示point・scenario（effect decisionだけ除く）・敵防御力・AttackProfileの不一致はfail closed。offだけの明示再実行は不可。監査callbackはordered evaluatorの観測だけを増やし、条件評価やdamage semanticsを複製しない。
- v40移行は旧request／result／fingerprintの**値をそのまま保持する型付きhistorical snapshot**を新profile schemaへ追加し、current draftと別のhistorical draft slotを設ける。旧draftを20件上限のhistoryへ移さず、旧current historyはID・時刻を含め同型のhistorical entryへ移す。既存v33〜38 historical entryは保存されている形を保つ。v40 resolved/manualの両方をhistorical-onlyにし、旧resultの`versions.schemaVersion=40`と旧fingerprintを変更しない。v40 resultは旧版の既知の全構造とrequest/result version一致を検証する。未知fieldは原JSONのまま保持し、Zod parseで得た投影を保存値へ上書きしない。指紋検証も原requestのcanonical JSONを対象にする。無効なrecordやfingerprint不一致は原recordを残したtyped migration failureとし、部分移行しない。旧shareは同じhistorical snapshotを表示し、保存fieldのないfingerprintのみ原requestから導出する。旧backupの全profile検証後、ADR-002に従い復元前backup→staging再検証→単一transactionで切替える。起動時v40も同じ手順で、失敗時は旧IndexedDB recordを残す。再計算は旧requestのresolved scenario／manual intentを新schemaの明示requestへ変換し、現行masterで検証・実行が成功した場合だけ新fingerprint／resultを**別のcurrent draft**へ保存する。失敗は旧snapshotを維持し、入力修正可能・条件不成立・invalid・unsupported・version unavailableを区別する。旧engineの互換実行は作らず、歴史的結果をHomeの現行damage headlineに使わない。CalculatorRouteの既存historical regenerate（既定scenario生成）はこの用途に流用しない。UIの敵防御力は入力途中の文字列を保持し、有効な有限値`-500..500%`だけcommandへ渡す。空欄や範囲外を0に変換しない。
- TSK-06.5の8 shard producerは旧digest比較前にartifactを出せるが、`merge-oc-matrix.ts`は旧`mergedDigest`とのparity gateで失敗し、失敗manifestへ新audit digestとfirst differenceを保存する。対象内Blocking解消後に同一sourceの8 shardを作り、初回mergeの**意図したschemaVersion差分だけ**を確認し、34,640 outcomes、candidate status／eligibility digest、production output／canonical inputなど別定義のidentityを比較する。旧digestを履歴として残し、測定した新digestをTSK-06.5 evidenceへ明示登録した後、同じ8 shardのmergeを再実行してgate成功を確認する。shardを再計算しない。matrix 16〜26分＋mergeは既存見積りで、実測後に補正する。

セルフチェックの停止境界: 上記はコードから定められる実装契約で、新しい実行診断は計画決定に不可欠ではない。実装時に旧v40 payloadの完全検証方式やcanonical IRの期待read抽出で未規定の製品意味論・契約衝突が判明した場合だけ、影響作業を止め、実差分と改訂案を提示する。現時点では確認前なので製品source／test、producer、stage／commitに進まない。

段階計画（2026-09-26、同じ`3300200` bounded unit内の通過判定）:

| 段階 | 完了時に残すもの | 次へ進む条件 |
| --- | --- | --- |
| 0. 契約と基線（今回） | HEAD／16 tracked＋2 untracked／空index、採否理由、直接symbol経路、有限witness集合とlegal domainの区別、v40保持契約、旧artifactのbytes・SHA-256を既存Task／evidenceへ記録する。 | 読み取り調査とdocs検証を終え、実装計画の利用者確認を待つ。製品編集・producer・stage／commitはしない。 |
| 1. v41の利用者実経路 | `schema`、`scenario`／command／ranking、portable保存、repository／share／backup／startup、Calculator／DataPage／Homeの候補差分を採否判断して接続する。小fixtureで敵防御力の独立性、resolved/manualの旧identity保持と新identity生成、失敗時原record、入力修復、UIからの明示再計算を確認する。 | schemaVersion 41のrequest/result整合、旧v40 draft・history・share・backup・起動時復元、旧v33〜38 historical保持、ADR-002 transaction、対象型検査・局所テスト・UI実経路が通る。旧matrix digest差分は後段の測定対象として明記し、成功扱いしない。 |
| 2. S4の実readと対象producer | executorにaudit-only read観測、S4 producerにcanonical期待readと有限witness選択、gateに欠落を検出する照合を接続する。小fixtureと実producerで同一AttackProfile・scenario・敵防御力・明示point・準備planのon/offを、対象read→typed event／projection→effective→damage input→resultまで追う。 | target gate成功、1,590 control identity維持、`2301100`月下／日輪と`1000100` HP回帰、対象外の新failure 0。候補生成／実評価数、所要時間、producer artifact bytes／SHA-256を先行32,820 ms・未確定31,780 msと比較する。対象内Blockingが残る間は全件production／audit／qualityを実行しない。 |
| 3. identity ratchetと引継ぎ | 対象内Blocking解消後、独立HEAD＋今回差分candidate treeで局所再検証する。TSK-06.5の8 shard→初回mergeの意図したv41 digest差分採取→34,640 outcomes／candidate status・eligibility／production output・canonical input照合→旧digest履歴と新digest登録→同じshardのmerge再実行、という順で検証する。既存Task／evidenceに成果・未達・次操作・artifact bytes／SHA-256を反映する。 | 差分レビューと必要gateが通り、対象内Blockingがなければ依頼範囲のみlocal commitする。pushしない。他ratchetが残るのでTSK-08 `in_progress`、TSK-09.1／09 `blocked`を保つ。 |

この表は実装順序と停止点であり、途中段階をTSK-08完了とは呼ばない。60分で既存handoffへcheckpoint、90分以降は次のsemantic familyを始めない。時間境界に達したら完了済みの通過条件と未達条件を記録して引き継ぎ、未検証の段階を成功扱いしない。通常の技術判断に段階ごとの再承認は求めない。

段階別セルフチェック（2026-09-26、上表を実装開始条件として再監査）:

| 段階 | 判定 | 補正した実装入口・停止点 |
| --- | --- | --- |
| 0 | 完了 | HEAD・worktree・index、source経路、保存済みartifactの照合と資料検証まで。実装承認は未取得。 |
| 1 | **契約確認待ち** | 現行要件§7.4の`CalculationVersionContext`はmaster／engineだけであり、v40とv41の**manual requestはscenarioもintentも同形**である。resultのschemaVersionだけ41へ変えてもportable request全体のSHA-256は同じで、要求された「新requestと新identity」を満たせない。推奨改訂はv41 requestの`versionContext.schemaVersion: 41`を必須にし、resolved/manual・calculator/rankingの全constructor、parse、result version一致、portable保存／cache境界へ適用すること。旧v40 requestは元の2 fieldを保持し、旧fingerprintを元JSONで検証する。これは現行要件の型記述を変えるため、影響実装を開始する前に改訂契約の確認が必要。engineVersionをidentity変更のためだけに上げず、manual scenarioに無関係な防御力fieldを加えない。 |
| 1 | 補正済み | v40 historical entryへ`request`をトップレベルで追加すると、現行`workspace-domain::finalizeHistory`と`Calculator`の`'request' in entry`が編集可能なcurrent entryと誤認する。旧三点は`disposition: historicalOnly`の`legacySnapshot`内へそのまま保持し、history選択・finalize・dedupe・startup・Homeをtyped dispositionで判定する。v40 draftは別のhistorical draft slot、v33〜38 entryは保存済みresult版をそのまま検証して保持する。v40 shareは同じread-only view、backup／起動時移行はADR-002の事前backup・staging・単一transactionを実行し、失敗時は原recordを残す。旧Zod parseの投影で原request/resultを上書きしない。 |
| 1 | 補正済み | 明示再計算の`executed`は`calculated`のほか`inputRequired`／`unavailable`を含むので、それぞれ型付きcurrent draftとして保持できる。`unsupported`／`invalid`は旧snapshotを維持して拒否する。条件不成立は正常な`notApplied`でありinvalidへ寄せない。UIの入力途中の空欄・範囲外は修正可能な文字列状態のまま保存commandに渡さない。代表fixtureはv40 manualとresolved、現行master有無、旧fingerprint一致／不一致、旧draft＋20件history、v33〜38、share／backup／起動時失敗、明示再計算、UI表示を通す。暫定`v40Migration.test.ts`の「旧draftを新requestへ自動置換」は採用しない。 |
| 2 | 条件付きで明確 | 段階1のv41 requestが通った後、canonical operation条件から期待readをS4 inventoryへ載せる。ordered evaluatorはoffでもconditionを評価しているので、両側の実readを採取できる。gateは期待readが任意field欠落で通らないこと、同一明示point／plan／AttackProfile／敵防御力、target eventからresultまでの差を確認する。小fixtureでphase 6/7、phase 10のpoint 90超、準備変異後の読値、欠落trace、wrong candidate、invalid／unsupportedを検証し、実producerの生成数／実評価数と所要時間を測る。 |
| 3 | 条件付きで明確 | 段階2で対象内Blockingが消えた場合だけ8 shardを作る。初回mergeは旧TSK-06.5 digestとの意図的な差で非0になり、failure manifestから新digestを採る。旧digestを履歴へ残して新digestを現行期待値にし、同じshardで再mergeする。34,640 outcome、candidate status／eligibility、output／canonical input、TSK-07 cache／stale evidenceを別identityとして照合し、独立candidate tree・artifact bytes／SHA-256・差分レビュー後にlocal commitする。 |

修正する段階境界: 段階1は保存版・identity・利用者実経路の一まとまり、段階2は監査証明、段階3はratchet更新である。90分以降は次段階を開始しない。途中で時間境界に達した場合は既存handoffへ通過済み条件と未達を残す。段階1のrequest version markerは現行要件との**実質的契約衝突**なので、元の表の「確認後すぐ実装可能」という含意を撤回し、改訂契約の確認まで製品実装を停止する。その他の段階はこの依存を除き、新たな診断を計画決定の前提としない。

契約確認の追記（2026-09-26）: 利用者は段階1の`versionContext.schemaVersion: 41`を含む改訂案を了承した。現行の[product requirements v0.3.9](../requirements/fgo-lab-requirements-v0.3.md)と[ADR-028](../adr/028-canonical-source-program-and-finite-ranking-domain.md)に承認済み契約を記録した。上記セルフチェックの「契約確認待ち」は判断時点の履歴であり、後続作業の停止条件ではない。ただし今回の了承は製品実装の計画確認を省略しない。次の作業者はHEADと全既存差分を照合し、直接symbolに基づく**各段階の実装計画・既存暫定差分の採否・局所検証・停止点**を先に提示して利用者確認を待つ。確認後は同じ作業を継続し、通常の技術判断で確認を取り直さない。計画に必要な新しい実行診断が不可欠なら、最小診断と判断・停止境界を先に示し、診断だけ承認された場合は製品実装へ進まずignored artifact、Task／evidence、bytes／SHA-256を残して資料だけlocal commitする。実装中に未規定の製品意味論または実質的な契約衝突が出た場合だけ影響作業を止めて改訂計画を示す。今回の資料commitは既存の製品暫定差分を含めず、TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。

実装checkpoint（2026-09-26、owner `3300200`）: 利用者の段階計画確認後、v41のresolved/manual request identity、独立敵防御力とneutral ranking、旧v40 draft/history/share/backupのhistorical-only保持、ADR-002のstaging・事前backup・単一transaction、明示再計算、Calculator／Home／DataPage表示と入力修復を接続した。S4はcanonical条件のdomain IDとordered operation readを照合し、同じ初期point／準備plan／敵防御力のon/offでoperation outcomeからdamage resultまで確認した。最終局所unit 121/121、独立HEAD＋対象差分candidate 127/127、package／Web typecheck、対象lint、S4 producer 3/3・gate 1,590 identity通過。owner `3300200`は初期60→準備後65、phase 7、候補生成92・実評価1、on/off実readともpoint 65／phase 7、NP1平均47,344.965／35,543.595、producer 35,570 ms（先行32,820 ms）だった。owner `2301100`月下／日輪と`1000100` HP witnessも同じgateで維持した。phase 0/6/7/10とpoint 91の小fixtureも通過。artifact詳細・bytes／SHA-256は[TSK-08 parity ratchet evidence](../evidence/tsk-08-parity-ratchet.json)の最新bounded unitに記す。

identity ratchet停止点: 独立candidateの8 shard中、先行4 shardは34,640件全体へ進む前に既存`preparation-transactions` gateで同じ`resourceAfter.gauge`不一致（期待0、実2,000）となった。旧TSK-06.5の同一`106500` production recordもNP消費前20,000→NP消費後・ダメージ前2,000を記録し、`ocOutcomes`に`npBeforeDamage`のtyped resource mutationがある。旧matrixとの先行40条件・17,320 record比較ではstatus差0だが、owner `705300`の12条件でcanonical input／damage rows／witness／actionが変わった。代表条件の`npDamageBuff`は0.6→0.4、NP1平均は72,441.165→65,541.965。shard 0のcandidate生成は105,164→101,140、calculated候補は99,336→95,312で、candidate digestも変わる。HEAD単独は旧値と一致し、今回差分から`operationCompiler.ts`だけ旧版に戻した独立treeでも旧値に戻る。canonical `battlePointPhase`のsubject IDを保持して実際のdomainを読む修正が`705300`のranking choiceを変えるため、単なるv41 schemaVersion digest差ではない。残り4 shard、digest更新、再merge、全件qualityは停止した。改訂案は、`705300`のcanonical live read・選択・candidate inventory・damageを個別証明し、保護されたcandidate／output ratchet改訂の製品判断を得ること、別のpreparation gateでNP消費後・ダメージ前のresource mutationをtyped transactionに基づき検証して固定0前提を直すこと、その後に同一sourceの8 shardを再生成し、34,640 outcomesとcandidate／output／input identityを別々に照合して初回mergeと再mergeを行うこと。今回の承認範囲を超える保護対象改訂なので、影響作業を止めて利用者に改訂計画を提示した。TSK-08は`in_progress`、TSK-09.1／09は`blocked`、pushなし。

調査専用handoff（2026-09-26、追加実装・producerなし）: `rankingQuantityWorld.ts::leaves`は`subjectId===undefined`の条件だけを独立quantity候補へ変換する。旧`operationCompiler.ts::compileEffectCondition`がcanonical `battlePointPhase`のsubject IDを落としていたため、旧rankingはdomainに紐づかないscalar phaseをcandidate axisに載せていた。現在はsubject IDを保持するので、この軸が消え、`scenario.ts::battlePointWitnesses`が対象domainの初期point witnessを作り、executionが準備後のlive pointを読む。candidate 4,024件減と705300の選択差はこの直接経路に整合するが、旧候補がすべて到達不能だったことや新winnerの正しさは未証明。`battleState.battlePointPhase`が保存scalar、ranking world、domain初期point witnessの三役を担う点が設計上の混線である。次段階では初期point／phaseの利用者意図をdomain keyedのtyped commandで表し、有限witnessと準備後live readを別型・別責務にする。複数domainの曖昧さ・合法point上限なしをfail closedで扱う。ranking policyは合法初期worldの選択だけを行い、subject付き条件を独立phase factへ戻さない。705300の最小fixtureで旧／新candidateの到達可能性、選択、canonical input、damage、candidate status／eligibilityの差を証明してから、保護digest改訂の対象を確定する。

106500の正本経路は`preparationTransaction.ts::planPreparationAction`が`applyNpResourceTransaction`のconsumeAllを先に適用し、`preparationOc.ts::executePreparationOc`へ消費後stateを渡し、`preparationAttackNp.ts`が最終`resourceAfter`を記録する。旧／新production recordはいずれも最終gauge 2,000で、固定0の`productionParityDiagnostics.ts::auditProductionPreparationTransactionObservations`だけが矛盾する。§7.1で対象外の通常攻撃NP回収とは別の、NP消費後・ダメージ前のcanonical effectである。次段階ではexecutionのtransaction境界にbefore／consume後／各typed operation outcome／finalの順序付きreceiptを作り、auditはそのauthoritative receiptの連続性・rollback・最終stateとの一致を検証する。auditにNP増加式を複製しない。consumeのみ0、consume＋適用gain 2,000、条件不成立／proc失敗でgainなし、拒否時は全体rollbackの小fixtureが通過条件。現行`AppliedPreparationAction`はbefore／after／OC outcomeだけでconsume後snapshotを持たないため、固定0比較を消すだけでは証明にならない。

再開順: (1) 上記二つの意味論を小fixtureと実経路で固定し、必要ならv41未commit契約のdomain keyed入力を破壊的に整理する。(2) 旧v40 record原本保持・S4 1,590 identity・TSK-07保護を確認する。(3) 独立candidate treeで8 shardの初回merge差を採取し、34,640 outcome、候補status／eligibility、production output、canonical input、portable/schema fingerprint、matrix digestを別定義で照合する。(4) 旧digestを履歴に残して意図した新digestを更新し同shardを再merge、artifact bytes／SHA-256、候補数・時間、Task／evidenceと依頼範囲のみのlocal commitを確認する。対象内Blockingが残る間は全件production／audit／qualityを始めない。この調査checkpointでは追加のsource／test編集・producer・stage／commit・pushを行わず、TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。

実装checkpoint（2026-09-26、約60分、owner `3300200`）: 承認済み計画の対象内Blockingは局所検証で解消した。`705300`の旧scalar phase候補はcanonical domainのtrait 10042適格性を欠き、実rankingのchoice 1は`npDamageBuff` 0.4／NP1平均65,541.965。choice 2を同じexecutionへ再投入しても旧0.6／72,441.165にはならない。`106500`はexecutionのconsume後0→順序付きmutation→最終2,000のreceiptと監査の連続性・rollbackを固定した。v41 resolved開始pointはdomain keyed入力とし、複数domain／不正point／到達不能段階をinvalidで閉じ、UI・portable再実行へ接続した。S4実producer 3/3・1,590 identityと`2301100`月下／日輪・`1000100` HP、TSK-07 worker 10/10を保持した。

独立HEAD `0d65127009ec0f6f033335d32c23b7163b8eef90`＋対象差分candidateの8 shardは80条件・34,640 outcome、34,600 calculated/parity・40 unavailable、final unsupported／invalid／inputRequired各0、preparation transaction gate全件通過。旧sourceでの初回mergeは期待どおりdigest差で停止し、旧digestをTSK-06.5 evidenceのrevision historyへ残したうえで、matrix `cb23821f72d614c9e7d2abe03c040d2473c39c25e30d5e7d86f8c32aaf02a7b9`、eligibility `68e41503a7663fa32607cbe1b26f670c0940f33f4f0a3d07b4268a5a5d914759`へ改訂し同じshardを再mergeして通過した。旧／新status差0、version差を除いたoutput／canonical input差は`705300`の各20件だけ、候補生成1,028,810→988,570（差40,240）で最大profile 3,435はcap 4,096内。portable v40／v41 fingerprintはresolved/manual別、matrix digestとは別identityとして固定した。定義、時間、全manifestとproducerのbytes／SHA-256は[TSK-08 parity ratchet evidence](../evidence/tsk-08-parity-ratchet.json)の最新bounded unitを正本とする。

残作業: 最終quality相当のunit／production／型・lint・format／docs／build／E2Eを閉じ、初期v40 fixtureとsuite登録の修正を含む最終差分を独立candidateへ同期して確認する。現時点の全unit初回は916/928で、10件は新しいv41 fieldを古いfixtureに残したため修正中、2件は変更外の`engine.ts`／`candidateSelection.ts`行数architecture ratchetでHEAD由来と判明している。production全件は実行中。`pnpm`は外部SQLite storeでscript前に失敗したため既存node_modulesとgeneric runnerへ切替済み。今回の単位はTSK-08全体の完了ではなく`in_progress`、TSK-09.1／09は`blocked`、pushなし。

最終検証checkpoint（2026-09-26、owner `3300200`）: 最終sourceで8 shardを再生成し、34,640 outcome・34,600 calculated/parity・40 unavailable、final invalid／unsupported／inputRequired各0、候補eligibility digest `68e41503a7663fa32607cbe1b26f670c0940f33f4f0a3d07b4268a5a5d914759`を再確認した。先行runとの80条件・34,640 record比較はstatus、canonical input、production output、scenario、candidate inventoryの差が各0。matrix digestの差は80条件の測定`elapsedMs`だけであり、測定値をsummaryに残したままdigest対象から外した。最終matrix digest `04415e8ab05dfcb5afa58210176357fb095e0b5faeed2aa4815273b00be68fc4`で同一shardの再mergeが通過した。旧`c70909a...`と中間`cb23821...`はrevision history／[evidence](../evidence/tsk-08-parity-ratchet.json)に保存した。

全production 155/155、audit 3/3、全E2E 29/29、root／Web typecheck、production build、ESLint、Prettier、docs integrity／6件、runner契約59件、master validateが通過した。全unitは926/928で新規失敗0、残る2件は開始HEADから無変更の`engine.ts` 134行>80行と`candidateSelection.ts` 181行>180行のarchitecture ratchet。追加UI入力による4 screenshotを更新して通常モードで再検証した。件数、elapsed、manifest／artifactのbytes・SHA-256は[evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitを正本とする。今回の単位をTSK-08全体の完了とはせず、`in_progress`、TSK-09.1／09は`blocked`、pushなし。

次sessionの限定handoff（2026-09-26、参照実装commit `a3241095be383348b6aa8d3b3199309b435b15b8`）: 次は既存architecture ratchetの2件だけを修復し、unit／qualityの阻害を解消する。`engine.ts::executeOrderedScenarioWithAuditObservation`はcandidate execution／comparisonからselected・unresolved・ambiguousの監査観測を組み立て、public exportから`scenario.ts`の通常／監査実行入口へ接続する。`candidateSelection.ts::resolveCandidateSelections`と`validateCandidateSelections`は選択解決と制約検証・初期state保持を所有し、`candidatePreparation.ts`が利用する。行数を削るための圧縮やthreshold緩和ではなく、実責務から抽出境界を計画する。普通の実行と監査実行のresult、同じcandidate identity／index、operation順序、fail-closed、preapply／rollback／recovery参照を保持する。計画を先に提示して確認を待ち、その後は実装・局所検証・既存Task／evidence更新・依頼範囲local commitまで続ける。未完了のwithout-area／stale-mutation production consumer closureとlegacy cleanupは別sessionとし、S4の解消済み問題を再開しない。今回の先行調査は読み取りと資料更新だけで、製品source／test編集・source test・producerは実行していない。evidence先頭の古い未達／次作業記述をこの現行境界へ整理した。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。

Current bounded-unit checkpoint（2026-09-26、battle-execution architecture）:

開始HEAD `08f3ac78d7a97afe2a0a16dfb93b912129b03dc9`、index／tracked worktree／untracked filesは空。静的照合で、2件目のarchitecture testが`candidateSelection.ts`で停止し、後続`candidateExecution.ts` 838行>400行を隠していたと確認した。利用者は追加ファイルを含む改訂計画を承認した。engineはexecution／comparison orchestration、観測組立ては`executionAuditObservation`、選択解決は`candidateSelection`、制約・world fact／variant適用・terminal form検証は`candidateSelectionValidation`へ分離。executorはordered transaction loopを保持し、operation context／result／state auditを各責務へ移した。改行分割でengine 80/80、selection 83/180、executor 389/400。新moduleにもarchitecture上限を追加し、既存thresholdは維持した。

既存局所検証86/86、architecture 9/9、追加の通常／監査parity・identity・rollback fixtureは最初の7/7が通過。26関数の本体token列が開始HEADとすべて一致し、通常hot path、operation順序、allocationの条件を保持した。先行bounded unitの28 artifactはpath／bytes／SHA-256一致。最終form／variant preapplyを含む局所unit 94/94、対象lintと局所差分レビューが通過した。必須quality／監査検証を閉じることが次操作。詳細とartifactは[既存evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitを正本とする。`pnpm`は外部SQLite storeでscript前に停止したため、既存node_modulesと同じgeneric runnerへ切替。8 shard再生成は具体的なidentity疑義がない限り行わない。without-area／stale-mutation production consumer closure、legacy cleanup、TSK-09は対象外。TSK-08は`in_progress`、TSK-09.1／09は`blocked`、pushなし。

最終quality途中の参照修復: format／lint／typecheck通過後、runner契約58/59で`E2E-A054-BP-REPLAY`の旧testタイトル参照が停止した。先行実装`a3241095`が実testを「phase intent」から「starting point」へ改名し、移行manifestだけ旧名だった。製品意味論とassertionは変更せず、`e2e/assertions.json`のreplacementTestとその固定digestを現行定義へ同期した。69件・exact marker・削除／誤再割当て拒否は維持し、局所runner契約5/5で確認。最終qualityをこの統合差分で再開する。

quality再開時の実行負荷調整: 全unit 936/936、runner 59/59、format／lint／型／docsは通過。production 154/155の1件は既定5秒に対し5,139msで停止し、同一sourceの単独診断は3,510msで成功（先行runは4,827ms）。数値assertionの不一致は観測されず、並列負荷による時間制限超過と判断した。timeout・閾値・検査対象を変更せず、8 CPU affinityで既存50%設定を4 production workerへ制限してfull qualityを再実行する。並列条件が異なるため所要時間を制御された性能改善とは扱わない。

Current bounded-unit completion（2026-09-26、battle-execution architecture）:

3ファイルの超過を責務分離で解消し、architecture 9/9と局所semantic 94/94を通過した。最終qualityはunit 936/936、production 155/155、E2E 29/29（retry 0）、format／lint／root・Web型／runner 59/59／docs 6/6・integrity／master／buildがすべて成功、warning・unexpected console 0。監査suiteも3/3、S4 expected／observed 1,590、failure 0。先行S4との全observation・identity・battle-point read・preparation inventory・gateが一致し、月下／日輪、HP witness、battle-point live readを維持した。最終quality実行前後で固定した16ファイルのbytes／SHA-256はすべて一致。以後は結果記録だけを更新し文書検証で閉じる。

productionのinventory／digest／runtime counterは先行runと一致し、candidate 6,673／deduplicated 4,194、damage request 2,596／distinct 1,489、master read／parse／compile各1。全production所要時間68,273→86,849ms、compile 21,533→16,322ms、witness 4,827→3,857msだが、先行6 worker／最終4 workerという負荷差があり、制御された性能改善とは解釈しない。26関数の本体token一致、性能ratchet成功、candidate／request増加なしを確認した。8 shardは再生成せず既存matrix／eligibility digestを維持する。検証command、失敗runと回復、artifact path／bytes／SHA-256は[evidence](../evidence/tsk-08-parity-ratchet.json)の`Battle-execution architecture responsibility closure`を参照する。

このsource／test／資料差分だけをlocal commitし、pushしない。今回のarchitecture bounded unitにBlockingは残らないが、TSK-08全体は`in_progress`、TSK-09.1／09は`blocked`を維持する。次のwithout-area／stale-mutation production consumer closureとlegacy cleanupは別bounded unitとして計画し、解消済みS4を再開しない。

次sessionの限定handoff（2026-09-26、参照実装commit `a9364893e6edde4b6c2816b89d03e03da111845d`）:

次の1セッションは**without-area production consumer closureだけ**を扱う。`rankingPolicyCandidates.ts::calculateRankingCandidateSet`は選ばれたcandidateKeyと、detail作成に実際に使ったselected／without-area executionの観測・input・effective contributionを既に返す。`scenario.test.ts`の既存schema-legal代表fixtureはこれらの参照とoperation／projection／contribution identityを確認する。一方、`productionMasterControlAudit.test.ts`はselected-profile母集団を生成し、`withoutAreaAlternateCount: 0`で通る。`productionParityDiagnostics.ts::auditProductionUserControlObservations`にpath unionがあることや、transport fixtureの成功をproduction consumer closureとみなさない。実alternateから共有consumer／gate／代表fixture／宣言済みartifactへの経路を完成させ、欠落・誤candidate・誤参照・identity不一致をfail closedにする。published master母集団と代表fixtureの母集団は分け、両側の期待identityを各生成元から導出する。固定1,590やfixtureのproduction母集団混入で通さない。without-areaはparty-wide final damage寄与を除外してもoperation／projectionがappliedのままになり得るため、既存責務からgateの証明契約を計画する。

最初に現在差分を照合し、直接symbolに基づく段階的計画（責務・候補file・通常／監査の実経路・代表と否定fixture・不変条件・通過条件・停止点・証拠再利用条件）を提示して確認を待つ。確認前は製品source／test／文書を編集せずsource test／producer・stage／commitを行わない。確認後は同じbounded unitを実装・局所検証・必要な最終quality／監査・Task／evidence更新・範囲限定local commitまで継続する。既存transportの抽出方法やgate拡張を本handoffで固定しない。未規定の製品意味論または実質的な契約衝突だけ影響作業を止めて改訂計画を示す。

stale-mutationの実値・後続read・rollback／recovery consumer closure、legacy cleanup、TSK-09は別session。解消済みS4／architectureを再開せず、8 shardは具体的なidentity疑義がない限り再生成しない。先行quality unit 936／production 155／E2E 29、audit 3、S4 1,590、matrix／eligibility digestは[evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitとhandoffPreparation.nextSessionを参照し、同条件で有効な証拠を再利用する。本準備はコード読み取りと資料更新だけで、製品編集・source test／producerは実行していない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`、pushなし。


Current bounded unit（2026-09-26、without-area ranking consumer）:

前回の限定handoffは本sessionで承認され、実ranking alternateから共有consumer／gate／代表fixture／宣言済みartifactへの接続を実装した。captureだけに実execution参照を保持し、selected／alternateの生成元とdetail、input、effective contribution、operation／projection／contribution identity、resultを照合する。operation／projectionのappliedと、areaViewによる最終寄与除外を分ける。published masterとschema-legal fixtureは別母集団・別gate・別artifactとし、期待identityは各生成元から導出する。fixtureをproduction inventoryへ加えず、1,590を新しい将来期待件数にしない。

Flow closure、直接symbol、局所検証、否定fixture、完全artifact、既存証拠の再利用条件は[evidence](../evidence/tsk-08-parity-ratchet.json)の`Without-area ranking shared audit consumer closure`を正本とする。今回の対象内Blockingは0。最終qualityとauditが成功し、結果記録後の文書検証と範囲限定local commitで閉じる。通常rankingのcapture外emitted codeと、抽出したselected-profile adapterの本体がbaselineと一致した。107 artifact（80 condition artifactを含む）のbytes／SHA-256が一致し、8 shardは再生成しない。

stale-mutationの実値・後続read・rollback／recovery consumer closureとlegacy cleanupは対象外。S4／architectureは再開しない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`、pushなし。


Without-area bounded-unit completion（2026-09-26）:

実rankingのschema-legal代表fixtureが共有consumer／gateを通過し、14の生成元・参照チェックがすべてtrue、45の否定ケースがtyped reason／canonical identity／first difference付きで拒否された。完全な正例・否定diagnosticはassertion前に保存され、局所43/43と最終qualityの両方で宣言・bytes／SHA-256検証が成功。同fixture artifactは15,681,829 bytes、SHA-256 `851632815d6039baa1903c9620d673d89f712fdbf690cfe973814f8ecdbb497f`で一致した。旧pathタグだけのalternate正例は、実生成元欠落を拒否する否定fixtureに変更した。

最終qualityはunit 936/936、production 155/155、E2E 29/29（retry 0）、format／lint／型／runner 59/59／docs 6/6・integrity／master／buildが成功し、warning・unexpected console 0。auditも3/3、S4のexpected／observed 1,590、failure 0。S4 artifact全体が先行architecture unitとbyte単位で一致し、月下／日輪、HP witness、battle-point live readを保持した。published masterのselected-only alternate件数0は代表alternateの証拠とせず、別母集団の実ranking fixtureで証明した。

production counterは先行qualityと一致し、candidate 6,673／deduplicated 4,194、damage request 2,596／distinct 1,489、master read／parse／compile各1。所要時間86,849→90,784ms（同じ4 worker条件）だが非制御の観測であり、candidate／request増加はない。8 shardと80 condition artifactはchecksumを照合して再利用し、再生成していない。最終quality後に固定17ファイルすべてのbytes／SHA-256一致を確認し、以後は3文書の結果記録だけを更新する。command・receipt・flow closureは既存[evidence](../evidence/tsk-08-parity-ratchet.json)の最新bounded unitを参照する。

次の最小操作は、このbounded unitを再実装せず、別sessionでstale-mutation実値・後続read・rollback／recovery consumer closureまたはlegacy cleanupの限定計画を作ること。今回の結果をTSK-08全体のclosureとは呼ばない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。この検証済み範囲だけをlocal commitし、pushしない。


Committed criticalStars forward bounded unit（2026-09-26、開始HEAD `b75e9574af4328d68a0ebbd202b2dc2499ddb183`）:

利用者が段階計画を確認し、今回の実装を承認した。`productionMasterControlAudit.test.ts`の既存on/off実executionとprepared canonical programを共有consumer／gateへ接続した。`productionCriticalStarsAudit.ts`はcanonical operation／condition leaf／targetから期待identityを導出し、元executionのevent／mutation receipt、同じselected candidateのgroup／read、利用側のprojection／effective contribution／canonical input／resultを照合する。計算式はexecutionに残し、同一addressの介在書込みをoperation順序で辿る。通常source・公開API・選択・operation順序・damage／outcomeは変更しない。

実schema-legal fixtureの69→capped99→read99、同一group／別groupのgain→loss→read84、all/notの複数readが同じ共有gateを通った。4正例と207否定ケースをassertion前に完全保存し、否定はtyped reasonだけでなく欠落・identity・順序・実値・利用・参照の該当failure pathを要求する。rolledBackやattempted値のみをcommitted成功には使わない。rollback／復元値／recovery read自体のconsumer closureは別unitへDeferredする。

局所43/43・型／対象lintとpublished audit3/3が成功。published母集団は1,590 expected／observed control identitiesを保持し、canonical programから24 forward contracts／48 sidesを導出した。122 committed mutation／410 saved readなどは今回の観測件数であり将来期待数にしない。新forward情報だけを除いたS4 artifactは先行版とbyte単位で一致し、月下／日輪・HP witness・battle-point live readを保持する。without-areaの14 source check／45否定ケースとartifact SHA-256を維持し、8 shard／80 condition artifactを含む107 receiptが一致したため再生成しない。詳細・flow closure・artifact path／bytes／SHA-256は[evidence](../evidence/tsk-08-parity-ratchet.json)の最新bounded unitを正本とする。

対象内Blockingは0。最終qualityはunit936/936、production155/155、E2E29/29（retry0）、format／lint／root・Web型検査／runner／docs・integrity／master／buildが成功し、warning・unexpected console0。監査3/3も最終実装の証拠として有効。9固定入力のbytes／SHA-256がquality後も一致し、criticalStars／without-areaの代表artifactは局所版と最終quality版でbyte単位一致した。production counterも先行版と一致し、candidate／request増加・ratchet緩和はない。以後はTask／evidence／evidence indexの結果記録だけを更新し、文書検証・最終差分照合の後、この依頼範囲だけをlocal commitする。pnpmの外部SQLite store失敗は記録し、既存node_modulesとgeneric runnerを利用した。60分checkpoint、90分以降の新family開始なし、pushなし。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。

次sessionへ残す範囲はrollback／復元値／recovery read consumer closure、addQuantity／HP／battle-point／trait／formの別mutation family、legacy cleanup。今回をstale-mutation全体やTSK-08全体のclosureとは呼ばず、解消済みwithout-area／S4／architectureを再開しない。


次sessionの限定handoff（2026-09-26、参照製品commit `a941aabef4968b59fe11a5ebb4fa2b22e9cc9ecc`）:

次の1セッションは**criticalStarsのrollback済みgroupから実復元値、順序付き後続recovery inputQuantity readへ届く共有監査consumer closure**だけを扱う。別mutation family、legacy cleanup、stale-mutation全体／TSK-08全体、TSK-09.1／09は対象外。解消済みcommitted criticalStars forward／without-area／S4／architectureを再開しない。先行製品unitのquality936/155/29、audit3、4正例／207否定、without-area14 source check／45否定とartifact receiptを条件付きで再利用する。

読み取りでは`candidateExecution.ts`のgroup-start state／input復元、group全operationのunsupported化、`candidateStateAudit.ts`の復元address afterTransaction／rollbackProof／attempted appliedOperationIdsを確認した。既存`scenario.test.ts`のrollback fixtureはamount nullで、保存値は20→attempted20→restored20。後続readをvalue20で検索し、firstDifference:nullのsnapshotを保存しているだけである。変化した値の復元や共有gateの成功を証明していない。新fixtureでは実canonical executionで値が変わった後にgroupが失敗し、group-start値へ復元される経路と後続readを確認する。期待readerは値とは独立に導出し、同一addressの複数attempted write／介在committed writeを順序から扱う。

このfixtureの最終resultは正しくunsupported。既存forward consumerと非structural user-control gateのcalculated条件を緩めたり、rolledBackをcommitted成功へ混ぜたりしない。診断gateの成功と製品のtyped failureを区別し、失敗groupの寄与破棄、復元値、後続readerのevent／projection／effective contribution、canonical inputと最終outcomeを同じ実executionで照合する。具体的なmodule／gate設計は現コードから計画する。直接symbol、保存fixtureと調査artifactのpath／bytes／SHA-256は[evidence](../evidence/tsk-08-parity-ratchet.json)の`handoffPreparation.nextSession`を正本とする。先行forward準備は同evidenceの`completedCriticalStarsForwardPreparation`へ移して保持した。

最初の成果物は段階的実装計画。責務・候補file・通常／監査の実経路・期待identityの生成元・代表／否定fixture・不変条件・通過条件・停止点・証拠再利用条件を示し、利用者確認を待つ。確認前はsource／test／文書を編集せず、source test／producer・stage／commitを行わない。確認後は同じbounded unitの実装・局所検証・必要な最終quality／監査・既存Task／evidence更新・依頼範囲local commitまで続ける。通常の技術判断で再承認を求めず、未規定の製品意味論や実質的な契約衝突だけ影響作業を止めて改訂計画を示す。

この先行準備はコードと既存artifactの読み取り・checksum照合・資料更新だけで、source test／producer・監査／qualityを新しく実行していない。8 shard再生成は具体的なidentity疑義がある場合だけ判断する。60分checkpoint、90分以降の新family開始なし、pushなし。TSK-08はin_progress、TSK-09.1／09はblockedを維持する。


Current criticalStars rollback／復元値／ordered recovery-read bounded unit（2026-09-26、開始HEAD `838a3268b5a3f2eb3db54fee58507b9a3bfcab43`）:

利用者が段階計画を承認した。専用の共有監査consumer／typed gateを実canonical生成・同じselected executionへ接続し、既存forwardと非structural user-controlのcalculated成功契約を保持した。実fixtureは20→attempted60→rollback20→read20、事前commit後の30への復元、同addressの70→55の複数attempt、復元直後read30と介在commit後read35、複合conditionと不成立readerを扱う。元executionのproof／receiptを使い、寄与破棄、event／projection／effective contribution／canonical inputと最終unsupportedを照合する。監査passedを製品calculatedへ変換しない。

局所43/43、5実正例／469否定ケースが成功し、否定は該当checkPathとtyped reason・canonical first differenceを要求した。完全diagnosticはassertion前に保存され、宣言／bytes／SHA-256検証が成功。通常sourceと既存fixture本体はbyte単位で不変、forwardは既存2関数の内部exportだけを追加。107 receiptとforward／without-area artifactが一致し、8 shardは再生成しない。対象内Blockingは0。必要なauditとREADME必須quality、最終入力照合、結果記録・文書検証・範囲限定local commitが未達。詳細とflow closureは既存[evidence](../evidence/tsk-08-parity-ratchet.json)の`CriticalStars rollback restored-value ordered recovery shared audit consumer closure`を正本とする。

別mutation family、legacy cleanup、一般retry／UI recovery、TSK-08全体とTSK-09.1／09は対象外。解消済みforward／without-area／S4／architectureを再開しない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`、pushなし。


CriticalStars rollback／復元値／ordered recovery-read bounded-unit completion（2026-09-26）:

共有consumer／専用typed gateが実5正例・469否定ケースを通り、20→attempted60→rollback20→read20、事前commit後のgroup-start30、失敗group内の70→55の複数attempt、復元直後read30と介在commit後read35、不成立readerとall/notの複数readを確認した。failed groupの寄与は破棄され、attempted appliedOperationIdsはcommit証拠にならず、後続reader成立後も製品resultはunsupportedのまま。通常／captureのinput・effects・effective contribution・typed resultは各代表で一致した。canonical生成元・元receipt／proof・参照から利用側まで同じgateへ届き、監査でexecutionやquantity／condition／damageを再実装しない。

局所43/43、最終quality unit936/936・production155/155・E2E29/29（retry0）、audit3/3が成功。format／lint／型／runner／docs・integrity／master／buildも成功、warning・unexpected console0。全9固定入力のbytes／SHA-256がquality後も一致した。rollback diagnosticは38,506,253 bytes、SHA-256 `30a111c30b57df5547be79052970cc710c4f97a1fed8bb6f95f08d9f4c5a1d77`で局所版と最終quality版が一致し、assertion前保存とrunner宣言・receipt検証を閉じた。forwardの4正例／207否定とwithout-area14 source check／45否定もartifact byte単位で一致した。

S4 artifact全体が先行forward版とbyte単位で一致し、月下／日輪・HP witness・battle-point live readを保持した。ただしS4のcommitted criticalStars receiptをrollback coverageとはみなさず、schema-legal独立母集団で復元契約を証明した。107 receipt／80 condition artifact／matrix・eligibility digestを照合して再利用し、8 shardは再生成しない。production counterは先行と一致し、candidate／damage request増加とratchet／timeout緩和はない。production時間83,454→84,262msは同じ4 worker条件での非制御観測である。

対象内Blockingと必要な製品gateは残らない。以後は3文書の結果記録だけを更新し、文書検証・最終差分照合・範囲限定local commitで閉じる。command、失敗診断と回復、source責務、flow matrix、artifact path／bytes／SHA-256は既存[evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitを正本とする。60分checkpoint前に製品gateを完了し、新familyを開始していない。

次sessionは、別途依頼された未達unitの限定計画から始める。今回のcriticalStars rollback／復元値／ordered recovery-readを再実装せず、解消済みforward／without-area／S4／architectureを再開しない。別mutation family、legacy cleanup、一般retry／UI recovery、TSK-09.1／09は今回の対象外で、今回をstale-mutation全体やTSK-08全体のclosureと呼ばない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`、依頼範囲だけlocal commit、pushなし。

記録更新後の書式、docs 6/6・integrity、diff whitespaceが成功した。最終quality後の変更はTask／evidence／evidence indexの結果記録だけで、source／test／設定／registry／protected evidenceは不変。この7ファイルの検証済み差分だけをlocal commitし、当該commitを今回の参照identityとする。pushなし。


旧4段階と現在の到達点の整理（2026-09-26、製品参照commit `be8b604eeaa954587ce7f8a71b1f4604daca38f3`）:

以前のセルフチェック表は判断時点の履歴として保持する。現在の停止条件は次のとおりであり、「manual requestのschema版なし／契約確認待ち」を再開しない。

| 段階 | 現在の判定 |
| --- | --- |
| 0. 契約と基線 | 既存契約と基線は確立済み。次の限定unitは新しいコード起点の実装計画を提示し、利用者確認を待つ。 |
| 1. v41の利用者経路 | requestの必須`versionContext.schemaVersion: 41`は要件／ADRで承認され、manual／resolvedに実装済み。旧V40 requestとfingerprintを保持し、明示再計算で別V41 requestを生成する。resultだけ版を変える案は現行実装ではない。 |
| 2. S4の実read証明 | domain別battle-pointの実read・同条件on/off・共有gateは検証済み。月下／日輪、HP witnessを保持。S4のcommitted starsはrollbackやscalar addQuantity consumptionの証拠ではない。 |
| 3. matrixと引継ぎ | 8 shardのidentity改訂／再mergeとeligibility照合は記録済み。後続unitは条件一致とchecksum照合で再利用している。旧root／中間digestを最新revisionへ混同しない。 |

直接symbolと最新revision digestは[evidence](../evidence/tsk-08-parity-ratchet.json)の`handoffPreparation.currentStageReconciliation`を参照する。TSK-08全体には別familyとlegacy cleanupが残るため`in_progress`、TSK-09.1／09は`blocked`を維持する。

先行handoff履歴（committed addQuantity scalar→ordered NP consumption、9f460567で完了）:

1セッションの対象は、canonical `contextMutation/addQuantity`のscalar `battlePointPhase`のcommitted実変化から、順序付き`executeNpDamage`の実scalar消費、同じselected executionのevent／projection／effective contribution／canonical input／typed result、共有監査consumer／gate、実schema-legal代表・否定fixture、宣言済みdiagnostic artifactへの接続までとする。addQuantity rollback／recovery、domain別battlePoint resource mutation、HP／trait／form、legacy cleanup、一般retry／UI recovery、TSK-08全体、TSK-09.1／09は対象外。解消済みcriticalStars forward／recovery、without-area、S4、architectureを再開しない。

読み取りで、`applyOrderedQuantityMutation`がscalar値とclamp／欠落failureを所有し、既存captureが`quantity:battlePointPhase`のmutation receiptを生成することを確認した。`quantityOperationIsNotRelevant`はtiming・subject・NP damage targetから非適用を決める。`applyNoblePhantasmDamage`は実state scalarをNP damage contextへ渡す。一方、既存`battlePointPhaseReads`はsubject/domain別のpoint／phaseであり、no-subject scalarのreadや実NP消費を証明しない。source requirementのdomain条件を無理にscalar条件へ変えず、canonical NP生成と実利用symbolから観測責務を計画する。監査で加算／clamp／condition／damageを複製せず、capture外のallocationや監査専用再実行を加えない。

最初の成果物は段階的実装計画。変更責務・候補file、通常／監査の実経路、canonical writerと実readerの期待identity母集団、実receipt／消費値の生成元、代表とまとめた否定fixture、不変条件、gate／artifact通過条件、停止点、既存証拠再利用条件を示して利用者確認を待つ。確認前はsource／test／文書を編集せず、source test／producer・stage／commitを行わない。確認後は同じunitの実装・局所検証・必要な最終quality／監査・既存Task／evidence更新・依頼範囲local commitまで続け、通常の技術判断で再承認しない。未規定の製品意味論や実質的契約衝突だけ影響作業を止め、改訂計画を示す。

この整理は資料変更のみ。新しい実行診断・source test／producerは実行していない。直前unitの22 artifact receiptをpath／bytes／SHA-256照合し一致したが、新unit成功証拠にはしない。対象内Blocking解消前に全件production／audit／qualityを先行せず、局所fixtureと差分レビューの後でREADME必須qualityと影響監査を閉じる。8 shardは具体的identity疑義がある場合だけ追加検証を判断する。60分でcheckpoint、90分以降は新familyを始めず、pushは禁止。直接symbol・fixture matrix・証拠条件は同evidenceの`handoffPreparation.nextSession`を正本とする。


Current bounded-unit checkpoint（committed addQuantity scalar→ordered実NP consumption、計画承認後）:

HEAD `4ef4572d09df52f9f4cff3ed299db28c94d8c3e2`、index／tracked／untrackedは開始時に空。利用者が段階計画を承認した。同じcanonical生成・selected executionにcapture専用の実scalar消費receiptを追加し、共有scalar consumer／gateへevent／projection／effective contribution／canonical input／typed resultを接続した。加算・scalar clamp・NP clamp・condition・damageの意味論はexecution ownerに残し、通常経路へ観測allocationや追加再実行を入れていない。

局所fixtureは6 committed成功と5非適用／null境界、352検査別否定が通過。先行関係局所5 file／62 testも通過した。schema-legal masterから、同group／別skill transactionの複数write、変更後の実NP消費、上下限clampとNP側clampを生成する。published canonical addQuantityは独立inventoryで0件を記録し、S4 domain live readをscalar coverageへ読み替えない。既存22 artifact receiptはbytes／SHA-256一致。新artifactと全詳細は[evidence](../evidence/tsk-08-parity-ratchet.json)のcurrentBoundedUnitを正本とする。

対象内Blockingは0。最終局所62 test・type／lint・差分レビュー、影響audit3/3、README必須quality unit937／production155／E2E29（retry0）が成功した。warning／unexpected console0、必須gate全exit0。最終140 artifact receiptのpath／bytes／SHA-256が一致し、新scalar診断は局所版とquality版でbyte単位一致。既存forward／recovery／without-area／S4は新scalar観測collectionだけを除いた全envelopeが一致し、月下／日輪・HP witness・domain live read・production counterを保持した。最終8 source／test checksumは固定入力と一致した。以後は既存4文書の結果記録だけを更新し、文書検証と依頼範囲local commitで閉じる。addQuantity rollback／recovery、domain resource mutation、他mutation family、legacy cleanup、一般retry／UI recoveryは対象外。TSK-08は`in_progress`、TSK-09.1／09は`blocked`、pushなし。


Committed scalar addQuantity bounded-unit completion（2026-09-26）:

共有consumer／gateが6 committed実変化・実NP消費、5非適用／null境界、352検査別否定を通過した。監査成功とcalculated成功を区別し、null scalarはunsupportedを維持する。published canonical writer母集団0とschema-legal fixtureを独立に記録した。診断はassertion前保存し、宣言／bytes／SHA-256検証を閉じた。加算／clamp／condition／damageの再実装、通常観測allocation、監査専用再実行はない。性能は限定kernelでscalar中央値+4.4%／standard+7.5%、全scenarioの速度評価ではない。通常経路・candidate／request数・閾値・timeoutを維持した。

必要な製品gateは残らない。最終quality後は結果記録だけを更新し、文書検証・差分照合後に12対象ファイルだけlocal commitする。当該commitを参照identityとする。60分境界前にcheckpointと製品gateを閉じ、新familyを開始していない。今回をstale-mutation全体やTSK-08全体のclosureとは呼ばない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`、pushなし。詳細は既存evidence最新bounded unitが正本。


Step再確認と次sessionの限定handoff（2026-09-26、製品基線`9f4605675b24472eb15a8772f6444cc82e71f5d3`）:

旧4段階の契約待ちは履歴。V41／S4／matrix改訂は検証済みで、committed scalar addQuantity→実NP消費も6 committed・5境界・352否定、quality unit937／production155／E2E29（retry0）、audit3、warning／unexpected console0で完了した。直前unitのlocal commitも完了し、worktreeは開始時clean。次はscalar addQuantityのrollback／group-start復元→後続ordered実NP消費→同じselected executionの利用側証拠／unsupported result→共有診断consumer／gate／宣言artifactだけに限定する。別familyやlegacy cleanupを同sessionへ追加しない。

直接コードでは元executionがgroup-start state／inputを復元し、scalar mutation afterTransactionとrollbackProofを生成する。新scalarNpConsumptionsは実NP evaluatorの実消費値と出力を保持する。現scalar consumerのcommitted／notRelevant／nullScalar境界はchanged rollback復元を証明しない。既存criticalStars recoveryは別addressとread空間の証拠で、scalar coverageへ読み替えない。失敗groupの寄与を復活させず、後続NPが成立しても製品unsupportedを維持する。

最初は現symbolから段階計画を提示し利用者確認を待つ。確認前は読み取り・checksumだけ、source／test／文書編集・source test／producer・stage／commitなし。確認後は同じ限定unitを実装・局所検証・対象Blocking解消・必要な最終audit／README quality・正本更新・local commitまで継続する。通常判断で再承認せず、未規定意味論／実質的契約衝突だけ根拠と改訂計画を示す。

代表は実際に変化したattemptと復元、事前commit後のgroup-start、複数attemptとclamp、復元後の介在commitを必要な組合せで扱う。期待writer／失敗group／後続NP identityはcanonical生成と順序から値と独立に導出する。失敗triggerはschema-legalな既存typed failureをfixture補助として選ぶ。addQuantity amountは整数でnullは不可。skillUse effectsはskill単位action groupだが、compileEffect内unsupported resourceはapplicableより先に出るため、生成順序とgroup境界を計画・代表で確認する。現時点で新しい実行診断は行わず、具体fixture成立を検証済みとはしない。module分割／hookは固定しない。直接symbol、否定分類、未確認点とartifact receiptは[evidence](../evidence/tsk-08-parity-ratchet.json)の`handoffPreparation.nextSession`を正本とする。

今回は資料整理のみ。直前の140 artifact receiptをpath／bytes／SHA-256照合し一致したが、新scalar recovery成功証拠ではない。source／test／producer／audit／qualityの新規実行なし。資料の書式・docs／integrity・差分検査で閉じ、この資料commitを次担当者の参照identityにする。対象内Blocking中に全件検証を先行しない。8 shardはidentity疑義時のみ。60分checkpoint、90分以降新familyなし。TSK-08は`in_progress`、TSK-09.1／09は`blocked`、pushなし。


Current scalar addQuantity rollback／group-start復元／ordered実NP消費 bounded-unit checkpoint（2026-09-26、開始HEAD `3a4e09e99939322a622f3982a7cdf2bf3033fd46`）:

利用者が段階計画を承認した。開始index／tracked／untrackedは空。canonical生成と同じselected executionの元receipt／proof／実NP消費を共有scalar consumerと専用復元gateへ接続し、既存forwardのcalculated成功条件を維持した。別effectのschema-legal percent criticalStars既存typed failureは同skill groupのfixture補助だけに使用し、そのfamilyのconsumerや意味論を変更しない。通常execution／canonical生成／relevance／NP evaluatorは不変。

5実代表・440検査別否定が局所成功し、事前commit後のgroup-start、複数attemptと上下限clamp、復元後の介在commitとNP側clamp、失敗group寄与破棄、後続NP利用と最終unsupportedを確認した。通常／captureが一致し、forward gateは復元代表を成功へ受け入れない。完全診断をassertion前に保存し、宣言artifact検証が成功した。既存140 receiptは一致、forward診断は先行unitとbyte単位一致。関連局所40test成功、対象内Blocking0。必要な最終audit／README qualityと最終入力・artifact照合、結果記録・文書検証・依頼範囲local commitが未達。flow／責務／diagnosticと失敗回復は既存[evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitを正本とする。

60分前checkpoint。別mutation family、failure意味論修正、legacy cleanup、一般retry／UI recovery、TSK-08全体とTSK-09.1／09は対象外。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持し、pushなし。


Scalar addQuantity rollback／group-start復元／ordered実NP消費 bounded-unit completion（2026-09-26）:

専用共有gateが5実代表・440検査別否定を通過し、2→attempt5→rollback2→実NP2、事前commit後のgroup-start4、同addressの複数attemptと上下限clamp、復元4後のcommit9→NP raw9／実consumed4を確認した。失敗groupのinput／寄与を破棄し、後続NPのevent／projection／effective contribution／canonical inputと元typed unsupported resultを照合する。通常／captureは一致し、診断passedを製品calculatedへ変換しない。加算／clamp／condition／damage／rollbackを監査で再実装せず、通常executionと既存production collectorは不変。

局所40testと最終対象2test、型／lint／差分レビューが成功。影響audit3/3、README必須quality unit938/938・production155/155・E2E29/29（retry0）、全必須stepが成功し、warning／unexpected console0。全13固定入力がquality後も一致した。新復元診断は局所版とquality版がbyte単位一致し、assertion前保存と宣言／receipt検証を閉じた。既存scalar forward・criticalStars forward／recovery・without-area・S4 envelopeもbyte単位一致し、月下／日輪・HP witness・domain live readとproduction counterを保持した。142宣言receipt、96固有artifactのbytes／SHA-256を照合し不一致0。件数は今回の実manifest由来で将来期待値にはしない。8 shardはidentity疑義がなく再生成しない。詳細・flow closure・artifact path／bytes／SHA-256は既存[evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitを正本とする。

対象内Blockingと必要な製品gateは残らない。quality後は4既存文書の結果記録だけを更新し、文書検証・最終差分照合後、この9対象fileだけlocal commitして当該commitを参照identityとする。60分前にcheckpointと製品gateを完了。別family、failure意味論修正、legacy cleanup、一般retry／UI recoveryは対象外で、stale-mutation全体やTSK-08全体のclosureとは呼ばない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持し、pushなし。次は別途依頼された未達unitの限定計画から始め、完了済みunitを再開しない。

記録更新後のdocs6/6・integrity・diff whitespaceが成功した。最終対象format／参照照合後に9対象fileだけlocal commitし、そのcommitを今回の参照identityとする。quality後の変更は結果記録だけで、全13固定入力は不変。pushなし。


Step再確認と次sessionの限定handoff（2026-09-26、製品参照commit `dd7b396b4090be0b72d0044c263eac816829330a`）:

旧4段階の契約待ちは履歴。V41／V40保持と明示再計算、S4、matrix改訂は検証済み。criticalStars forward／rollback recovery、scalar addQuantity committed forward／rollback復元→実NP消費も完了し、直前unitの9file local commitとclean worktreeを確認した。最新quality938/155/29（retry0）・audit3、warning／unexpected console0を保持する。TSK-08には他mutation consumerとlegacy整理が残り`in_progress`、TSK-09.1／09は`blocked`のまま。

次の1セッションは**攻撃役skill preparationのcommit済みfixed domain battlePoint gain／loss→元actor／domain receipt→終端の同domain live condition read／実NP消費→同じselected executionの利用側証拠・calculated result→共有consumer／gate／宣言artifact**だけに限定する。domain rollback／復元consumer、capacity変更、form／eligibility切替、補助actor writer、HP／trait／form、failure意味論修正、legacy cleanup、一般retry／UI recovery、TSK-08全体とTSK-09.1／09は対象外。完了済みunitやS4／architectureを再開しない。

読み取りでは`applyBattlePointOperation`の元point receipt、`executePreparationOc`のaction／source occurrence／operationIndex identity、`PreparedOrderedScenario.battlePoints`と`appliedPreparationActions`の元参照、`damageResolutionInputForNoblePhantasm`のdomain phase→scalar変換、captureのdomain live readと実NP receiptを確認した。preparationがwriterを適用し、compilerはcommit済みeffectを証拠として保持するため、damage loopのwriter applied eventを要求して二重適用させない。`preparationEffects`は成立結果でfilterされるので、その成功集合やreceiptだけを期待writer母集団にしない。command／master／canonical sourceから値と独立に導出する。NP gaugeのresourceTransaction、criticalStars／scalar mutation receiptをdomain BPの証拠へ読み替えない。

domain point／phase／base scalar／NP consumedは別の観測責務で、phase計算・加算・clamp・condition・damageを監査へ複製しない。既存元参照・snapshotだけで変換のcontinuityを閉じられるか、capture専用の最小観測が必要かは次担当者が直接symbolから判断する。module／hook／fixture数値は固定しない。本準備では新fixtureやproducerを実行せず、具体的な新consumer成立を検証済みとはしない。既存96固有artifact receiptはpath／bytes／SHA-256一致、既存domain transport3artifactも照合したが、新domain mutation coverageにはしない。詳細・未確認点とreceiptは既存[evidence](../evidence/tsk-08-parity-ratchet.json)の`handoffPreparation.nextSession`を正本とする。

最初の成果物は段階的実装計画。責務・候補file、通常／captureの実生成・preparation・実行・利用経路、期待identity／母集団、元receipt／conversion／read／NP消費のowner、必要代表と検査別否定、不変条件・artifact通過条件、停止点・証拠再利用・最終検証を提示し利用者確認を待つ。確認前は読み取り・checksumだけ、source／test／文書編集・source test／producer・stage／commitなし。確認後は同じunitの実装・局所検証・Blocking解消・必要な最終audit／README quality・既存Task／evidence更新・範囲限定local commitまで続ける。通常判断で再承認せず、未規定製品意味論／実質契約衝突だけ根拠symbolと改訂計画を示す。

今回の変更は既存4文書の整理だけ。8 shardは具体的identity疑義時のみ。60分checkpoint、90分以降新familyなし、pushなし。資料のdocs／integrity／書式・差分検証後にdocumentation-only local commitし、そのcommitを次担当者の参照identityとする。

本資料整理のdocs6/6・integrity・対象書式・diff whitespaceが成功した。製品source／test／設定は`dd7b396`から不変。この4文書だけlocal commitし、依頼プロンプトから当該commitを参照する。


Committed fixed domain BP preparation forward bounded-unit checkpoint（2026-09-26、開始HEAD `668457454cdc8320ddae2edc87a708ecdd8f35c7`）:

利用者が段階計画を承認した。開始index／tracked／untrackedは空。攻撃役skillのcanonical fixed gain／lossから、元committed transition・changed actor／domain receipt、終端の同domain live condition read、元phase→scalar変換と実NP消費、同じselected executionのevent／projection／effective contribution／canonical input／calculated resultを専用共有consumer／gateへ接続した。capture限定の元観測を既存observationへ内部参照で対応付け、公開／serialized shapeと通常allocationを保持する。writerの保持projectionとdamage寄与を区別し、ordered loopへ二重適用しない。加算／clamp／phase／condition／damageを監査へ再実装しない。

5代表・426検査別否定と宣言artifact検証、通常／capture・calculator／ranking parityが成功した。point／phaseの相違、同skill複数write、介在skillを含む複数commit、上下限／容量clamp、NP raw5／実consumed3を確認した。関連既存76test、型／lint／差分レビューが成功し、対象内Blocking0。published masterのwriter宣言と自然な同domain NP契約、schema-legal fixtureの母集団を独立に扱う。最終影響audit／README quality、入力・artifact・保護証拠とcounterの照合、結果記録／文書検証／範囲限定local commitが未達。flow・fixture・失敗診断・path／bytes／SHA-256は既存[evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitを正本とする。

60分前checkpoint。domain rollback／復元／recovery、capacity変更、form／eligibility切替、補助actor writer、別family、failure意味論修正、legacy cleanupと一般retry／UI recoveryは対象外。TSK-08は`in_progress`、TSK-09.1／09は`blocked`のまま。既存criticalStars／scalar forward・recovery、without-area、S4／architectureを再開せず、8 shardは再生成しない。pushなし。

公開exportの差分確認で、観測getter／型をscenarioの一括exportへ追加しないよう、観測attachmentだけを内部moduleへ抽出した。source／testの最終6入力を固定し、再局所5／421と型／lintが成功。5宣言diagnosticは抽出前とbyte単位一致。先行audit3は成功したが、最終sourceの影響auditを閉じてからqualityへ進む。既存公開observation shape、通常allocation、semanticsは不変。

最終sourceの影響audit3/3・warning0・宣言artifact検証が成功した。published writer3宣言に対し自然な同domain NP契約は0で、期待生成元を示した独立inventory／gateを保存した。これはschema-legal5代表のconsumer成功と別の証拠。6固定sourceが一致し、README必須qualityを開始する。実行中はsource／test／設定／文書を変更しない。

canonical比較のkey順同値契約に合わせconsumerのnull非保証を修正した。同値key順入替の成功と値不変receipt5否定を追加し、最終局所5／426・型／lintが成功。先行qualityはunit943／production155／buildまで成功したが意図的中断exit130で、最終成功にはしない。修正後の6入力を再固定し、影響auditと必須qualityを取り直す。同unit内、60分前のcheckpoint更新。


Committed fixed domain BP preparation forward bounded-unit completion（2026-09-26）:

最終差分の5代表・426検査別否定、通常／capture・calculator／ranking parity、影響audit3/3、README必須quality unit943／production155／E2E29（retry0）が成功した。warning／unexpected console0、全必須gate exit0、対象内Blocking0。268宣言照合／212固有artifact receiptはpath／bytes／SHA-256一致、最終6入力も固定checksum一致。新domain診断5件は局所版／quality版でbyte単位一致、既存forward／recovery／without-area／S4の7保護artifactとdomain transport3件も一致した。月下／日輪・HP witness・domain live readとproduction counterを保持した。published writer3宣言／自然な同domain NP契約0はschema-legal成功5代表と独立inventoryで記録し、実在しないreaderを追加しない。

60分境界前に製品gateとcheckpointを閉じた。以後は既存4文書の結果記録のみ更新し、文書検証・最終差分／stage照合後に6 source／testと4文書だけlocal commitする。当該commitを今回の参照identityとする。必要な製品gateは残らない。次の最小操作は記録の文書検証と範囲限定local commitで、次unitは別途限定する。domain rollback／復元consumer、capacity変更、form／eligibility、補助actor writer、別family、failure意味論修正、legacy cleanup、一般retry／UI recoveryは未実装の対象外。今回をstale-mutation全体やTSK-08全体のclosureとは呼ばず、TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。pushなし。詳細は既存evidence最新bounded unitを正本とする。

最終結果記録のdocs6/6・integrity・対象書式・差分whitespace検証も成功した。必要な実装／検証は残らず、最終stageの10対象を照合してlocal commitで閉じる。


Step再確認と次sessionの限定handoff（2026-09-26、製品参照commit `ad9d216c5dfdd3f90da91dbf0f01417ac4095e46`）:

直前のcommitted fixed domain BP preparation forward unitは10file local commit済み、開始HEAD／index／tracked／untrackedはclean。5代表・426否定、quality943/155/29（retry0）、audit3、warning／unexpected console0を確認した。旧4段階の契約待ちは履歴で、V41／V40保持と明示V41再計算、S4、matrix改訂を再開しない。Step0は基線／契約成立、Step1はV41実装検証済み、Step2はS4・criticalStars／scalar forward／recoveryと今回domain committed forward共有consumer検証済み、Step3は改訂matrix／eligibility digest照合済み。TSK-08には他mutation consumerとlegacy整理が残り`in_progress`、TSK-09.1／09は`blocked`を維持する。

次の1セッションは**攻撃役skill preparationのfixed domain BP gain／lossが実changed attemptとなった後、元executePreparationOc actionが非commitとなる経路の隔離→元action-start BP state保持→同じscenario preparation拒否／既存typed result→共有consumer／gate／宣言artifact**に限定する。既存forwardは厳格なまま保持する。domain recovery／再送command／UI retry、damage-loop rollback、capacity変更、form／eligibility、補助actor writer、初期／終端passive action失敗、OC ready後のstructural拒否family、HP／trait／gauge等の意味論、failure分類修正、legacy cleanupとTSK-08全体は対象外。

直接コードでは`executePreparationOc`のlocal currentへ実BP receiptが追加され、非commit時は`structuralState:args.state`を返す。`executeOcAction`のrejectは元OC stateと空outcomesを返し、failed BP attemptを外へ残す契約ではない。`planPreparationResourceTransaction`は非commitを既存codeへ写し、skill reducerは元stateを返す。先行committed skillがある場合のaction-startと初期値を区別する。`resolveAttackerFormExecution`は拒否でbreakし、applicationはdomain phase変換とordered execution前にrejectedとなる。その同じselected scenarioに後続NP／recovery readは存在しないので、架空のevent／input／NP消費を要求せず、元typed resultと後続実行の不在を閉じる。

既存capture transitionとforward attachmentはchanged failed attemptやrejected prepared/resultを証明しない。最小authoritative captureとtransportが必要か、既存責務の拡張か焦点抽出かは次担当者が現symbolから計画する。加算／clamp／phase／rollback／condition／damageは監査へ複製しない。期待writer／action／attempt到達境界はcanonical command／master／source順から値と独立に導出し、成功receiptやexecutedEffects／空outcomes／既存candidate rollbackProofへ読み替えない。既存BP／HP／trait atomicity testの別途reducer再送は通常scenarioのrecovery consumer成立証拠ではない。

本資料準備は読み取りと既存artifact checksum照合のみ。212固有artifact receiptと最終6 source／testのbytes／SHA-256が一致したが、新非commit consumerやattempt変化の成功証拠ではない。source test／producer／audit／qualityは新規実行していない。母集団・planning questions・否定検査群・再利用条件・receipt詳細は[evidence](../evidence/tsk-08-parity-ratchet.json)の`handoffPreparation.currentStageReconciliation`と`nextSession`を正本とする。新しい計画書は作らない。

最初の成果物はコードからの段階的実装計画で、利用者確認を待つ。確認前はコード／既存artifactの読み取り・checksumのみ、source／test／文書編集、source test／producer、stage／commitなし。確認後は同じunitの実装・局所検証・Blocking解消・最終影響audit／README quality・既存記録更新・範囲限定local commitまで続け、通常判断で再承認しない。未規定製品意味論／実質契約衝突だけ影響作業を止め、根拠symbolと改訂計画を示す。実行診断が計画に不可欠なら最小診断／判断／停止境界を示して先に確認し、診断だけの承認を製品実装へ読み替えない。

資料4文書だけを検証・local commitし、そのcommitを依頼文の参照identityとする。既存8 shardは具体的identity疑義時のみ。60分checkpoint／90分以降新familyなし、pushなし。

本資料整理のdocs6/6・integrity・対象書式・diff whitespaceが成功した。過去bounded unitと直前forwardの最終検証／receipt記録を保持し、製品source／test／設定は`ad9d216`から不変。この4文書だけlocal commitして、依頼プロンプトから当該commitを参照する。


Current bounded-unit checkpoint（fixed domain BP non-commit preparation attempt隔離、計画承認後）:

開始HEAD `f40eaa117fabc7104f384db5b5afcc6fbc392502`、index／tracked／untrackedは空。元ownerのchanged attempt receipt／到達prefix／native非commitをcaptureし、元action-start保持、元reducer拒否、同じselected scenarioのpreparation拒否と実typed resultへ内部transport・共有consumer／gateを接続した。phase witness選択時のwrapperコピーと直接typed result経路にも元captureを保持する。通常のallocation、command／candidate選択・operation順、加算／clamp／condition／phase／damage／failure分類は維持する。

6 changed代表・3明示境界、807検査別否定、最終局所9/9と関係局所115/115、型／対象lint／差分レビューが成功。宣言diagnosticはassertion前に完全保存し、該当typed reason／checkPath／canonical first differenceとrunner receipt検証を閉じた。値が同じでも元receipt／state／typed result参照を置換した否定を含む。先行212receiptを保持し、詳細・flow matrix・artifactとsource checksumは[evidence](../evidence/tsk-08-parity-ratchet.json)の最新bounded unitを正本とする。

対象内Blockingは0。影響audit、README必須quality、最終artifact／counter照合、結果記録・文書検証と依頼範囲local commitが未達。domain recovery／再送・UI recovery、candidate rollback、capacity mutation、form／eligibility、補助actor、初期／終端passive failure、OC ready後のstructural拒否、別familyとlegacyは対象外。先行forward／recovery／S4／without-area／architectureを再開せず、今回をstale-mutation全体／TSK-08全体のclosureと呼ばない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`、pushなし。

最終影響audit3/3が成功し、published宣言writer3／selected canonical writer10は全てcommitted境界だった。実noncommit coverageは独立schema-legal6代表で証明する。必須qualityはdocs registry差分を修正後、unit951/952で先行commit代表の完全diagnostic保存が既存timeoutを超え、宣言artifact欠落で停止した。timeout／検査数を変えず、完全復元一致を確認する重複値共有形式に改めた。再局所9/9・807否定と型／lintが成功、診断はassertion前保存を維持する。60分境界前checkpoint更新、最終quality中は入力を固定する。詳細の失敗manifest・復元契約・receiptは既存evidenceへ記録した。


Fixed domain BP non-commit preparation attempt bounded-unit completion（2026-09-26）:

元changed attempt／複数write到達prefix／native非commitから元action-start BP保持、元reducer拒否、同じselected scenarioのrequired input／trace／実typed application resultまで、内部capture・共有consumer／gateへ接続した。6 changed代表・3明示境界・807検査別否定、通常／capture・calculator／rankingと直接typed result parity、影響audit3/3、README必須quality unit952／production155／E2E29（retry0）が成功。warning／unexpected console0、対象内Blocking0。公開／serialized shape、通常allocation、command／candidate／operation順、damage／outcome分類と既存forwardの成功条件を維持した。

完全diagnostic9件はassertion前保存・厳密復元一致・宣言／bytes／SHA-256検証を閉じ、局所／quality版がbyte一致した。先行committed BP5診断とscalar／criticalStars／rollback／without-area／S4保護artifact、production counterが不変。最終10source／config／test checksum一致、matrix／eligibility digestと既存212receiptを保持した。published writer3／selected writer10はcommitted境界で、schema-legal changed6代表と独立に記録する。timeout／threshold／検査数は変更していない。path／bytes／SHA-256、失敗qualityの原因と解消、全checkPath・flowの正本は既存evidence最新bounded unit。

必要な製品gateは残らず、以後は結果4文書の検証・最終差分照合と14対象だけlocal commitで閉じる。次のsemantic unitは別途限定する。domain recovery／再送／UI、candidate rollback、capacity mutation、form／eligibility、補助actor、passive failure、OC ready後のstructural拒否、別familyとlegacyは未実装の対象外。今回をstale-mutation全体／TSK-08全体のclosureと呼ばない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`のまま。pushなし。

結果記録のdocs6/6・integrity・対象書式・差分whitespaceが成功した。最終186宣言／124固有current artifact receipt、10固定入力、7保護artifact／5先行forward診断／9新診断とproduction counterは照合一致。既存212receiptの保持条件も維持する。14対象のstage差分を照合し、当該記録を含むlocal commitを今回の参照identityとして閉じる。pushなし。


Step再確認と次sessionの限定handoff（2026-09-26、製品参照commit `0a479fdaf4fab28e37798374ae6e2f5f3faf68ba`）:

直前のfixed BP元changed attempt非commit隔離unitは14file local commit済み。開始HEAD／index／tracked／untrackedはclean。6 changed代表・3境界・807否定、quality952/155/29（retry0）、audit3、warning／unexpected console0を保持する。Step0は基線／契約成立、Step1はV41とV40保持・明示再計算実装済み、Step2はS4・stars／scalar forward／recovery・fixed domain committed forwardと元noncommit attempt→同scenario typed拒否まで検証済み、Step3は改訂matrix／eligibility digest照合済み。旧4段階の契約待ちは履歴で再開しない。他mutation consumerと後段legacyは残り、TSK-08は`in_progress`、TSK-09.1／09は`blocked`。

次の1セッションは**攻撃役skillのcanonical battlePointCapacityModifierが実capacity／modifier state変更をcommitし、同domainの後続fixed gain／loss・実live read・phase変換・実NP消費／damage利用へ届く共有consumer／gate／schema-legal代表・否定／宣言artifact接続**に限定する。form／trait／eligibilityは固定し、既存capacityの加算・clamp・reconcile・phase意味をownerから観測する。容量writerのnoncommit／rollback／recovery、modifier失効・除去・新lifetime、補助actor／passive／NP writer、別family、一般retry／UI recovery、failure分類修正、legacyとTSK-08全体は対象外。固定writeは変更capacityの実consumerとしてだけ扱い、完了済みfixed forward／attemptやscalar／stars／S4／without-area／architectureを再開しない。

直接コードではcapacity操作も元applyBattlePointOperationがreceiptとidentity／amount／lifetime／traitsを持つmodifier listを更新し、後段reconcileは元domain定義とmodifier listから状態を調整する。元per-write afterとreconcile後の保持値を同一と仮定しない。既存captureはcapacityの元writeも採取できるが、共有forward／attemptの期待writerはfixed resourceMutationだけ。operationCompilerは容量operationをordered生成とretained writer markerの対象にしていないので、架空のwriter event／projection／寄与を作らず、元preparation証拠と実reader／NP利用をどう結ぶか先に計画する。監査で加算／clamp／phase／condition／damageを再実装しない。

canonical published JSONにはNP由来capacity operation1件、攻撃役skill由来0件を読み取った。これは次consumer成功ではなく、origin-qualified母集団とschema-legal代表を独立にする根拠。過去件数を将来期待値へ固定せず、NP writerをこのsliceへ広げない。本資料準備は読み取り／checksumだけで、先行212 receipt（保存artifact206と先行source6のGit blob）・current124 artifact、現10固定入力をidentity別に照合した。更新済みsourceを過去checksumのまま不変とは扱わない。詳細件数、published identity、path／bytes／SHA-256、直接symbolと未検証点は既存[evidence](../evidence/tsk-08-parity-ratchet.json)の`handoffPreparation.currentStageReconciliation`／`nextSession`を正本とする。新source test／producer／audit／qualityは実行していない。

最初の成果物は段階的実装計画。現symbolから責務・候補file、通常／captureの生成→apply→reconcile→commit→実reader／NP／application利用、canonical期待母集団とidentity、action-start／中間／reconcile後保持state、writer保持と寄与の区別／二重適用不在、代表・検査別否定、gate／完全artifact／証拠再利用条件・停止点・最終検証を示し、利用者確認を待つ。過去consumerやhook／module／具体値を最善解に固定しない。確認前は読み取り・checksumのみ、source／test／文書編集・source実行・stage／commitなし。確認後は同じunitの実装から必要な最終quality／影響audit、既存Task／evidence更新・範囲限定local commitまで継続し、通常判断で再承認しない。未規定意味論／実質契約衝突だけ根拠symbol・差分・改訂計画で影響作業を止める。

本整理は既存4文書だけを検証・local commitして参照identityを作る。8 shardは具体的identity疑義時のみ。次sessionは60分checkpoint／90分以降新familyなし。pushなし。

本整理のdocs6/6・integrity・対象書式・差分whitespaceが成功した。保存artifact330固有path、先行source6の宣言commit blobと現source10を各identityで照合し、error0。製品source／test／設定は`0a479fd`から不変。この4文書だけlocal commitし、そのcommitを次作業者の参照文書identityとして依頼する。


Current bounded-unit checkpoint（committed attacker-skill capacity、計画承認後）:

元capacity apply／receiptと実source-end・reconcile・native commit／reducer保持から、canonical先行modifierを持つ同domain後続fixed write、実live read／phase／scalar／ordered NP消費と同じselected executionのevent／projection／effective contribution／canonical input／typed resultまで、共有consumer／gateへ接続した。容量writer用の架空ordered marker／projection／寄与を作らず、writer保持とdamage利用を区別する。通常allocation・公開／serialized shape・元算術／clamp／phase／failure分類と既存fixed gateを保持する。

5 changed代表・4明示境界、1491検査別否定、63局所test・関係195test、型／対象lint／差分レビューが成功。全63宣言diagnosticをassertion前に完全保存し、lossless復元一致・typed reason／checkPath／canonical first differenceとrunner receipt検証を閉じた。先行fixed forward5／426・非commit6 changed／3境界／807否定の14診断はbyte単位一致。単独paired容量scenarioの通常+1.03%／capture+1.82%、実input／result／effects／contributions一致を確認。詳細・flow・source／artifact checksumは既存[evidence](../evidence/tsk-08-parity-ratchet.json)最新bounded unitを正本とする。

60分境界前checkpoint。対象内Blocking0、最終影響audit／README quality、保護artifact／counter・固定入力照合、結果記録／文書検証・範囲限定local commitが未達。capacity非commit／rollback／recovery、失効・除去、新lifetime、form／trait／eligibility切替、補助actor／passive／NP容量writer、一般retry／UI、別family、legacyは対象外。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持し、今回をTSK-08全体やstale-mutation全体のclosureと呼ばない。pushなし。


Current bounded-unit final gate（committed attacker-skill capacity）:

容量modifier commit→元reconcile保持→同domain後続fixed writeの実clamp／live read／phase・scalar／ordered NP消費・damage利用を共有consumer／gateと宣言artifactへ接続した。5 changed代表・4明示境界・1491否定、影響audit3、README quality1015/155/29（retry0）、warning／unexpected console0が成功。367宣言／242固有receipt、固定source/test10件、容量diagnostic63件の局所／quality一致、先行fixed forward5／非commit9診断、保護artifact7／既存audit4／domain transport3とproduction counterを照合しerror0。matrix／eligibility digestを保持し8 shard再生成なし。詳細は既存evidence最新bounded unitとfinal-reconciliationを正本とする。

初回qualityは未変更data-pipeline scope ratchet1件が5082msで失敗した。対象7入力は先行製品commitとbyte一致、限定診断の当該assertionは2264msで成功したが全件gate成功として扱わず、同じ固定入力・既存timeout／threshold／4worker設定の必須qualityを再実行して全件成功した。比較条件の制限と失敗manifestもevidenceへ保持した。

source/test10件の製品local commitは`5ce926a8498139534b82e0f5b570260b2025cf09`。以後は結果4文書の検証・範囲限定local記録commitだけで閉じる。容量noncommit／rollback／recovery、失効・除去、新lifetime、form／trait／eligibility切替、補助actor／passive／NP容量writer、別family・legacyは対象外。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持し、TSK-08全体／stale-mutation全体のclosureではない。pushなし。

結果4文書のdocs6/6・integrity・対象書式・差分whitespaceが成功した。製品commit `5ce926a`の10 blobと固定入力を照合一致、対象内Blocking0、必須gateと記録が一致。4記録だけlocal commitして今回のcommitted容量unitを閉じる。次semantic unitは未選択。TSK-08 `in_progress`／TSK-09.1・09 `blocked`を維持し、pushなし。


Step再確認と次sessionの限定handoff（2026-09-26、製品参照commit `5ce926a8498139534b82e0f5b570260b2025cf09`、完了記録 `677f7d9`）:

committed攻撃役skill容量modifier unitはlocal製品／記録commit済み。開始HEAD／index／tracked／untrackedはclean。Step0は基線／契約成立、Step1はV41 requestのschemaVersionとV40保存・明示V41再計算実装検証済み。Step2はS4・stars／scalar forward／recovery・fixed BP forward／元非commit隔離に加え、容量modifier commit→元reconcile保持→同domain fixed実clamp／live read・phase・scalar／ordered NP消費・damage利用の共有consumerが完了した。Step3は改訂matrix／eligibility digest照合済み。旧4段階の契約待ちは履歴で再開しない。他mutation consumer／後段legacyは残り、TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。

次の1セッションは**攻撃役skill canonical battlePointCapacityModifierの実changed attempt→同action元noncommit→action-start capacity／point／modifier list／receipt／executedEffects保持→元reducer拒否→同じselected scenarioの実prepared／application typed拒否**の共有consumer／gate、schema-legal代表・検査別否定、宣言完全artifactへ限定する。同domain fixed gain／lossは失敗prefix内の実容量consumer、先行committed skillは元action-startを作る前提として扱う。成功する再実行／domain recovery・一般retry／UI、候補damage loop rollback、失効／除去、新lifetime、form／trait／eligibility切替、別actor／passive／NP容量writer、初期／終端passive失敗、OC ready後structural拒否、別family・failure分類修正・legacyとTSK-08全体は対象外。完了済みのforward／fixed非commit／scalar／stars／S4／without-area／architectureを再開しない。

元captureは容量writeのbefore／after／receipt・operation/source・status、到達prefix、native非commit、attempted／returnedを取得し、別capture-only timelineは実sourceEnd／reconcile／commitを保持する。既存fixed非commit consumerのcanonical期待writerはfixedだけで、capacity-clampという既存fixture名もfixed writeのclampである。committed容量programはexecutable専用、canonical capacity selectionは独立に生成可能。published gateのmissing-selection拒否と元production-controlのexecutable契約を緩めず、次consumerのcanonical母集団とproducer／gate接続を計画する。拒否経路には実phase変換／NP／damageが生成されないため、必要なのは不在／漏出防止と同scenario typed拒否であり、架空writer event／NP利用や成功recoveryを作らない。

本資料準備は読み取り・checksumだけ。保存artifact575固有path、historical6の宣言commit blob、直前固定source/test10の`5ce926a` blobとcurrent一致、今回必要なcurrent source/config/test19を照合しerror0。canonical published JSONは攻撃役skill容量operation0、対象外NP1で、これを新consumer成功や将来期待件数へ変換しない。品質基線はquality1015/155/29（retry0）、audit3、warning／unexpected console0、容量5 changed／4境界／1491否定／63診断、先行fixed5／426と非commit6 changed／3境界／807否定。詳細・現行counter・matrix／eligibility digest・path／bytes／SHA-256・symbol・未検証点と再利用条件は既存[evidence](../evidence/tsk-08-parity-ratchet.json)の`handoffPreparation.currentStageReconciliation`／`nextSession`を正本とする。新source test／producer／audit／qualityは実行していない。

最初の成果物は現コードに基づく段階的実装計画。責務／候補file、通常・captureのcanonical生成→元apply／reconcile→native非commit→action-start保持→reducer／実typed result、command/master/source/choice/action/transaction/actor/domainのreceipt非依存の母集団・identity、valueSetIndex／valueIndexとmodifier identity／amount／lifetime／traits、初期値と先行commit後action-start・中間／最終保持state、到達prefixとdownstream不在、schema-legal代表／検査群、既存gate／lossless宣言artifact／証拠再利用・停止点／最終検証を示し、利用者確認を待つ。既存consumerやhook／module／具体値を最善解に固定しない。確認前はread-onlyだけで製品source／test／文書編集・source実行・stage／commitなし。確認後は同unitの実装・局所／最終quality・影響audit・既存記録更新・範囲限定local commitまで通常判断で再承認せず続ける。未規定製品意味論／実質契約衝突だけ根拠symbol・差分・改訂計画で影響作業を止める。

本整理は既存4文書の検証・local commitだけで参照文書identityを作る。診断実行が計画決定に不可欠なら、最小診断／得る判断／停止境界を先に示して承認を待ち、診断だけの承認から製品実装へ進まない。60分checkpoint／90分以降新familyなし。8 shard再生成は具体的identity疑義時のみ。pushなし。

本整理のdocs6/6・integrity・対象書式・差分whitespaceが成功。保存575path／historical6 blob／直前10固定blob・current／今回19入力の照合error0。製品source／test／設定は`5ce926a`から不変。既存4文書だけをlocal commitし、そのcommitを次作業者の参照文書identityとして依頼する。


Current bounded-unit checkpoint（attacker-skill capacity元noncommit隔離、計画承認後）:

元capacity changed attempt／receipt／modifier／到達prefixから、native noncommit・元action-start保持・元reducer拒否と同selected wrapper／prepared／実application typed拒否まで共有consumerへ接続した。通常runtime owner／capture／公開・serialized shapeは不変。容量timelineは実write／sourceEnd／reconcile順を観測し、監査で算術やwriter再実行を行わない。先行commitのreceipt容量40と実reducer reconcile後90を区別し、failed action-start90とmodifier list／committed prefixを保持する。

5 changed代表・6明示境界、新176testと既存fixed forward／非commit・committed容量を含む最終局所253/253、warning0が成功。全176宣言diagnosticはassertion前保存・厳密なon-disk lossless復元一致を確認した。否定件数、検査群、manifest、固定4入力、flow deltaと回復履歴は既存evidence最新bounded unitを正本とする。既存gate／807否定とproducerのexecutable契約を維持する。

60分前checkpoint。最終型／lint／性能・差分レビュー、影響audit／README必須quality、保護artifact／counter照合、結果記録・文書検証と範囲限定local commitが未達。今回の容量noncommit隔離のみを閉じ、domain recovery／再送／一般retry／UI・他familyやTSK-08全体へ広げない。TSK-08は`in_progress`、TSK-09.1／09は`blocked`、pushなし。

最終局所253/253・型／対象lint・差分レビューが成功し、対象内Blocking0。新5 changed／6境界・1854否定・176宣言diagnosticの完全保存／復元を確認し、先行fixed forward5／非commit9／committed容量63の77診断はbyte単位一致。元runtime owner8入力は先行製品commitとbyte一致で、同parsed masterの通常／capture paired baseline／currentはobservable一致。時間差の測定限界と独立tsx loaderのDEP0205はevidenceへ明記した。4 source/testを固定し、影響auditとREADME必須qualityへ進む。実行中は検証入力を変更しない。

最終影響audit3/3・warning0・宣言artifact検証が成功。既存audit diagnosticはbyte単位一致し、新published容量attempt gateは現canonical攻撃役skill容量宣言0／selected0・対象外NP1を独立inventoryとして記録した。成功filterで非commit selectionを落とさず、既存committed gate／producerのexecutable要求を保持する。schema-legal5 changed代表の成功とは別の証拠。README必須qualityを開始し、入力を固定する。

今回の容量changed attempt→native非commit→元action-start／modifier／committed prefix保持→同selected scenario実typed拒否のbounded unitは必須gate成功。quality1191／production155／E2E29（retry0）、audit3、warning／unexpected console0。910宣言／1196固有receipt、176完全diagnostic／1854否定、既存保護artifact・counter・matrix／eligibility digestの最終照合error0。4製品source/testのlocal commit `2b0af87`。最終quality後は結果文書のみ更新し、文書検証と記録local commitで閉じる。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持し、domain recovery／TSK-08全体のclosureとはしない。pushなし。

結果文書の6検査・docs integrity・書式・diff checkも成功。製品commitの後続として既存4文書だけを記録local commitし、本sessionの依頼範囲を完了する。次semantic unitは未選定であり、本記録を追加範囲の承認とは扱わない。


Step再確認と次sessionの限定handoff（2026-09-26、製品参照commit `2b0af873254d6c71969f4b1915c708f117156533`、完了記録 `420ebcec9ebaf60f7e18ae00d8c9e842a7405a39`）:

直前の容量changed attempt非commit隔離unitは製品／記録local commit済み、開始HEAD／index／tracked／untrackedはclean。Step0は基線／契約成立、Step1はV41 request schemaVersionとV40保存・明示V41再計算実装検証済み。Step2はS4、stars／scalar forward・recovery、fixed BP forward／元非commit隔離、committed容量→実reconcile保持→同domain fixed clamp／live read・phase・ordered NP／damageに加え、容量changed attempt→native非commit→元action-start／modifier／committed prefix保持→同selected scenario実typed拒否の共有consumer／gateまで検証済み。Step3は改訂matrix／eligibility digest照合済み。旧契約待ちは履歴。TSK-08は`in_progress`、TSK-09.1／09は`blocked`を維持する。

次の1セッションは**攻撃役skillのcanonical固定HP gain／loss（resourceMutation/hp、amount.kind=fixed、unit=fixed、recipient=sourceSelf、selection省略またはdirect）が実HP変更をcommitし、元reducer保持値から同selected scenarioの実HP condition read／projection・effective contributionとhpRatioLow NP実消費／canonical damage input／calculated resultへ届く共有consumer／gate・schema-legal代表／検査別否定・宣言完全artifact**に限定する。各経路のform／traits／eligibility、最大HP／modifier環境は固定する。初期値・先行commit後action-start・operation別before／afterとattempted／actual receipt・最終保持値を区別する。監査側でHP加減算、clamp／floor、permille／continuous ratioやdamageを再実装しない。

HP非commit／rollback／recovery・一般retry／UI、percent／transfer／他recipient選択、HP modifier／除去・最大HP／base変更・heal rate／noHealing意味論、別actor／passive／NP HP writer、form／trait／eligibility切替、candidate rollback、HP value expression family、gauge／OC等の別family・failure分類修正・legacy／TSK-08全体は対象外。完了済みBP／容量／scalar／stars／S4／without-area／architectureを再開しない。HP current0でNP拒否等は既存境界として記録し、新非commit consumerへ広げない。

元executeHpOperation／transitionHpのreceiptはaction／occurrence／actor・before／after・attempted／actualを持つがoperationIndexは持たない。reducerのapplied actionにはhpBefore／hpAfterがある。元candidate seedはprepared.hpからHP量を生成する。既存HP witnessは実selected candidateを読むが、新writer→reader→NP監査接続ではない。現在のConditionReadAuditはinputQuantity／battlePointPhaseのみ、NP observerもscalar消費で、hpRatioLow実ratio消費を証明しない。必要な最小観測とtransport、責務拡張／焦点consumerの選択は次担当者が直接symbolから計画する。既存captureやmodule分割を最善解に固定せず、元writer／reader再実行や架空eventを足さない。成功receipt／activation／native成功filterに依存しないcanonical期待母集団とproducer／gateを設計し、既存production-controlのexecutable契約を保持する。

本資料準備は読み取り・checksumのみ。保存1196receipt、直前製品4source/testのGit blob／current、関連25source/configを照合しerror0。publishedトップレベルservant.skillsのHP宣言121件、sourceSelf／direct／固定値・固定単位64件は静的inventoryでありselected／committed／新consumerの成功や将来固定期待件数ではない。先行quality1191/155/29（retry0）、audit3、warning／unexpected console0、容量attempt5 changed／6境界／1854否定／176診断、committed容量5／4／1491、fixed forward5／426・非commit6／3／807を保持する。詳細symbol、population、receipt、counter、matrix／eligibility digest、再利用条件と計画項目は既存evidenceのhandoffPreparation.currentStageReconciliation／nextSessionを正本とする。新source test／producer／audit／qualityは実行していない。

次担当者の最初の成果物は現コードからの段階的実装計画。利用者確認前は製品source／test／文書の編集、新source test／producer／audit／quality、stage／commitを行わず、読取・既存artifact／published JSONのchecksumは可。新実行診断が計画に不可欠なら最小診断・得る判断・停止境界を先に示して別途確認する。確認後は同作業の実装・局所検証・差分レビュー・影響audit／必須quality・既存Task／evidence更新・範囲限定local commitまで進め、通常判断の再承認は不要。未規定意味論／実質的契約衝突時だけ影響作業を止め、symbol・差分・改訂計画を提示する。60分checkpoint／90分以降新familyなし、push禁止。8 shardは具体的identity疑義時のみ。


Current bounded-unit completion（committed attacker-skill fixed HP forward、2026-09-27）:

製品local commit `6d571bdd9a43e34566e23fcde35aa5fbd386faca`。開始HEAD `3e19f1a85190262b0915d62dcba82e4e1b4404ff`、index／tracked／untrackedは空。元HP applyのsource／operationIndex／receipt参照、native commit、reducerのaction-start／committed prefix／保持HPをcapture限定で既存transition transportへ接続した。元candidate seed、実HP条件readの整数permilleと実返値tag、元hpRatioLow branchのcontinuous ratio／evaluation／input、同selected executionのprojection／effective contribution／calculated resultを共有consumer／gateへ接続。元HP／condition／NP／damage算術と公開／serialized shapeを維持した。

schema-legal6 connected changed代表・7明示境界、1606否定（source1528／published78）と104宣言完全diagnosticが成功。各診断をassertion前に全保存し、path／bytes／SHA-256、保存後lossless deep-strict復元を検証。保存された4241 failureのcanonical first differenceと責務別389 checkのtyped reason／checkPathも既存比較器で一致。publishedはform-qualified宣言66、selected378、対象内operationの実変更28、実HP reader／hpRatioLow NP consumer0を独立に照合し、readerなし・HP環境変更・他HP writer・NP HP writerを境界として残した。架空published candidate／reader／NPは作らない。

最終12source/testのGit blob／currentとgate入力checksumが一致。局所HP104、architecture9、既存BP5／426否定、影響audit3、README必須quality1295 unit／155 production／29 E2E（retry0）、warning／unexpected console0が成功し、対象内Blocking0。先行固定BP forward426／元非commit807、committed容量1491／元noncommit容量1854、S4／HP witness／domain live read／scalar／stars／without-areaとcounterを保持。保護292診断の291はbyte一致、既存parity診断1件はelapsedMs1箇所だけ変動し非時間部分一致。matrix／eligibility digestと34600 parityは適合条件を照合して再利用し、8 shardを再生成しない。

全件auditの初回は無関係graph重複で中断し成功証拠としなかった。HP scopeの完全診断へ絞って再検証。初回qualityの既存250行上限違反はHP adapterを新設済みHP観測moduleへ戻し、candidateStateAudit.tsを元231行に復元して解消。後続TS2589は既存BP audit返値型の明示1箇所だけで解消し、意味論・assertion・否定fixtureを維持した。timeout／閾値／gate緩和・test除外はない。性能比較はnormal／captureの元calculated観測が一致し、別module graph／loaderの影響から速度改善とは主張しない。

60分前checkpointを既存Task／evidenceへ保存し、90分以降は同unitの証拠照合・記録・local commitだけを継続した。引継ぎ1196receiptは1193一致・依頼内3source変更を新checksumとして区別。新485＋継承910宣言、1777 unique保存receiptの最終照合error0。詳細・直接symbol・path／bytes／SHA-256・失敗履歴・再利用条件は既存evidence最新bounded unit／finalReconciliationを正本とする。

Step0契約／基線、Step1 V41 requestとV40保存・明示V41再計算、Step2先行unitと今回の限定committed HP forward、Step3改訂matrix／eligibility照合を保持。旧契約待ちは履歴。TSK-08は`in_progress`、TSK-09.1／09は`blocked`。今回をHP recovery、stale-mutation全体、TSK-08全体のclosureと呼ばない。次のbounded unitは未選択で、別sessionの限定計画から始める。pushなし。
