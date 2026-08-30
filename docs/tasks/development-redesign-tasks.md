---
title: "FGO Lab テスト・ランキング再設計 Tasks"
document_version: "1.5.6"
status: "Active"
created_at: "2026-08-30"
updated_at: "2026-08-31"
source_requirements:
  - "docs/requirements/test-strategy-redesign.md"
  - "docs/requirements/ranking-self-and-conditional-effects-requirements.md"
  - "docs/requirements/development-execution-efficiency-requirements.md"
source_plans:
  - "docs/tasks/documentation-maintenance-phases.md"
governance_contract: "docs/guides/document-governance.md"
---

# FGO Lab テスト・ランキング再設計 Tasks

## 1. 役割

本書は、3つの要件書にまたがる実装順序、依存関係、進捗、phase handoffを所有する。意味論、品質要件、受入条件の正本は各source requirementsであり、本書では再定義しない。各未完了TaskのContract closure matrixは正本のContract IDに対する適用判断、検証command、artifact、延期先だけを所有する。

状態は次だけを使用する。

- `ready`: 依存taskが完了し、着手可能
- `blocked`: 依存taskまたは設計判断待ち
- `in_progress`: 現在実装中。常に最大1件
- `done`: Done gateとhandoffを記録済み

Task開始時に状態とbaseline identityを更新し、完了時にcommit、artifact manifest、inventory／digest差分、次taskの開始条件を記録する。raw test log、全source listing、全screenshotは本書へ貼らない。

未完了Taskまたは未完了sub-itemは、実装前にflow closure noteをHandoffまたは対応evidenceへ記録する。noteは(1) observable outcome分類、(2) raw producerからresult consumerまでのforward flow、(3) required input／error／retryのrecovery flow、(4) normal loop以外のpreapply、transaction、projection、commit／rollback、fallback、cache／aggregationの該当有無、(5) state × path反証matrix、(6) 未確認経路とproduction occurrence 0を含む。これは全cellのfixture化や一般battle simulator化を要求せず、現在Taskのsemantic familyに限定する。

reviewで新しいconsumer、write site、recovery pathが判明した場合、局所patchより先にflow closure noteと反証matrixを更新する。手戻り回数自体をfailure metricにせず、未確認範囲の矮小化、production不在を安全性とみなすこと、中心経路だけの成功を完了承認へ使うことを禁止する。

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
| TSK-04 | Ranking canonical IR cutover | in_progress | TSK-03 | ranking layer ownership／移行方針 |
| TSK-05 | Transactional preparation execution | blocked | TSK-04 | ranking execution／NP resource |
| TSK-06 | Ranking policyとcandidate planner | blocked | TSK-05 | ranking condition／candidate planning |
| TSK-07 | Web／worker一括切替 | blocked | TSK-06 | ranking UI／移行方針 |
| TSK-08 | Production audit最終収束とfailure diagnostics | blocked | TSK-07 | test strategy T3/T4／ranking test gate |
| TSK-09.1 | Documentation evidence／archive finalization | blocked | TSK-08 | documentation maintenance DOC-P4〜P6 |
| TSK-09 | Performance、運用移行、旧経路削除 | blocked | TSK-09.1 | test strategy T5／全完了条件 |

```text
TSK-00.1 -> TSK-00.2 -> TSK-00.3 -> TSK-00.4 -> TSK-00 -> TSK-01 -> TSK-02 -> TSK-02.1 -> TSK-03 -> TSK-04 -> TSK-05 -> TSK-06 -> TSK-07 -> TSK-08 -> TSK-09.1 -> TSK-09
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
- [ ] 残る各semantic familyについてforward／recovery／alternate mutation pathとstate × path反証matrixを実装前に記録する。
- [ ] condition requirement、provenance、target、recipient、contribution scopeをcanonical化する。
- [ ] NP capacity、resource requirement、gain／loss／all-consume、base OCをcanonical化する。
- [ ] 旧schema reader、raw fallback、compatibility flagを削除する。

Done gate:

- data pipelineだけがAtlas/raw vocabularyを解釈する。
- executionへraw key、raw target、raw buff typeを渡していない。
- 新旧IRをruntimeで併存させていない。
- 全production occurrenceがtyped inventoryへ分類されるか、型付きでfail-closedになる。
- 中心経路以外のconsumer／state mutation／recovery pathと未確認範囲がflow closure noteで明示される。

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
- Next command: condition requirement、provenance、target、recipient、contribution scopeについて、まずobservable outcome、forward／recovery flow、alternate write path、state × path反証matrix、未確認範囲をflow closure noteへ記録する。その後raw occurrenceと現runtime branchをinventory化し、noteのレビュー後にdata-pipeline発行のcanonical semanticsへcutoverする。NP resource semanticsと旧reader／fallback削除までTSK-04を継続し、すべてを閉じるまでTSK-05へ進まない。

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

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-EXEC-001` | Apply | `pnpm test:diagnostic -- <execution-filter>`、`pnpm test:production` | `docs/evidence/<tsk-05-report>.md` |
| `RK-AUDIT-001` | Apply | partial commit／invalid inventory check | `docs/evidence/<tsk-05-report>.md` |
| `TS-PERF-002` | Apply | affected production gateを変更前後各3回 | `docs/evidence/<tsk-05-report>.md` |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |
| `RK-POLICY-001` | Deferred: TSK-06 | - | TSK-06 |
| `RK-UI-001` | Deferred: TSK-07 | - | TSK-07 |

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

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-POLICY-001` | Apply | `pnpm test:diagnostic -- <ranking-policy-filter>`、`pnpm test:production` | `docs/evidence/<tsk-06-report>.md` |
| `RK-AUDIT-001` | Apply | candidate／damage request／parity inventory check | `docs/evidence/<tsk-06-report>.md` |
| `RK-PERF-001` | Apply | ranking hot pathを変更前後各3回 | `docs/evidence/<tsk-06-report>.md` |
| `TS-PERF-002` | Apply | production gateを変更前後各3回 | `docs/evidence/<tsk-06-report>.md` |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |
| `RK-UI-001` | Deferred: TSK-07 | - | TSK-07 |

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

Contract closure matrix:

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| `RK-UI-001` | Apply | focused component test、`pnpm test:e2e` | `docs/evidence/<tsk-07-report>.md` |
| `RK-AUDIT-001` | Apply | worker／calculator／ranking parity check | `docs/evidence/<tsk-07-report>.md` |
| `TS-PERF-002` | Apply | build／E2E gateを変更前後各3回 | `docs/evidence/<tsk-07-report>.md` |
| `DX-HANDOFF-001` | Apply | `pnpm quality` | Handoff |
| `TS-ART-001` | Apply | Playwright manifest／artifact check | `docs/evidence/<tsk-07-report>.md` |

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
