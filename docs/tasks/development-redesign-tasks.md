---
title: "FGO Lab テスト・ランキング再設計 Tasks"
document_version: "1.3.0"
status: "Active"
created_at: "2026-08-30"
updated_at: "2026-08-30"
source_requirements:
  - "docs/requirements/test-strategy-redesign.md"
  - "docs/requirements/ranking-self-and-conditional-effects-requirements.md"
  - "docs/requirements/development-execution-efficiency-requirements.md"
source_plans:
  - "docs/tasks/documentation-maintenance-phases.md"
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
| TSK-00.1 | Documentation source normalization | done | - | documentation maintenance DOC-P0〜P3 |
| TSK-00.2 | Canonical documentation layout cutover | done | TSK-00.1 | documentation maintenance DOC-P3.1 |
| TSK-00.3 | Ignored documentation disposition and quarantine | done | TSK-00.2 | documentation maintenance DOC-P3.2 |
| TSK-00.4 | Documentation entrypoint and archive compaction | done | TSK-00.3 | documentation maintenance DOC-P3.3 |
| TSK-00 | Baseline固定 | in_progress | TSK-00.4 | 全要件書 |
| TSK-01 | Compact runnerとagent command契約 | blocked | TSK-00 | test strategy T1／execution efficiency |
| TSK-02 | Suite分類とcanonical quality gate | blocked | TSK-01 | test strategy T2 |
| TSK-03 | 共有production audit foundation | blocked | TSK-02 | test strategy T3／ranking production audit |
| TSK-04 | Ranking canonical IR cutover | blocked | TSK-03 | ranking layer ownership／移行方針 |
| TSK-05 | Transactional preparation execution | blocked | TSK-04 | ranking execution／NP resource |
| TSK-06 | Ranking policyとcandidate planner | blocked | TSK-05 | ranking condition／candidate planning |
| TSK-07 | Web／worker一括切替 | blocked | TSK-06 | ranking UI／移行方針 |
| TSK-08 | Production audit最終収束とfailure diagnostics | blocked | TSK-07 | test strategy T3/T4／ranking test gate |
| TSK-09.1 | Documentation evidence／archive finalization | blocked | TSK-08 | documentation maintenance DOC-P4〜P6 |
| TSK-09 | Performance、運用移行、旧経路削除 | blocked | TSK-09.1 | test strategy T5／全完了条件 |

```text
TSK-00.1 -> TSK-00.2 -> TSK-00.3 -> TSK-00.4 -> TSK-00 -> TSK-01 -> TSK-02 -> TSK-03 -> TSK-04 -> TSK-05 -> TSK-06 -> TSK-07 -> TSK-08 -> TSK-09.1 -> TSK-09
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

- [ ] test file、suite、CI step、master load、digest inventoryを記録する。
- [ ] 現行`RankingConditions`、AttackProfile、condition／resource familyをproduction全件で監査する。
- [x] calculator/rankingのdamage、entry、policy差分baselineを固定する。
- [x] 成功／失敗ログ量、model call、polling、tool outputの測定方法を固定する。

Done gate:

- product semanticsを変更していない。
- baseline再現command、commit SHA、dirty state、artifact pathが記録されている。
- mainまたは変更前baselineと比較せず、failureを既存問題と断定していない。

Handoff:

- Start baseline: `a49591996cd0951cc82109c252d96e2fd3991fd9`、clean worktree
- Commit: `09486bf` (start)、`aa7529b` (baseline evidence)、本completion commit
- Artifacts: `docs/evidence/test-ranking-baseline-tsk-00.md`、production audit／parity／ranking canonical tests、execution inventory snapshot、versioned calculator／ranking PNG 11件
- Inventory／digest: Vitest 77 files／397 tests、Playwright 4 files／96 project cases、published master 33,850,263 bytes、calculator parity 422 records、ranking 433 entries、production condition 10 kinds、resource独立stateなし。full digestと再現commandはbaseline evidenceに記録
- Verification: `pnpm test`は3回とも77 files／397 tests passed、wall-clock中央値82.01秒、成功出力10行／242 bytes。local parallel E2Eは60 passed／32 skipped／4 failed、同4 pathsのChromium 1 worker再実行は4 passed。failureを既存問題とは断定せず、CIのNode 24／1 worker／2 retriesとも区別。product／test／snapshot／master差分0
- Next command: test strategy／execution efficiencyのapproval gateを確認後、`git status --short && git rev-parse HEAD`でTSK-01のbaseline identityを開始する

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

Handoff: 未記録

## 4. 更新規則

- taskを開始するcommitで対象を`in_progress`へ変更する。
- 同時に複数taskを`in_progress`へしない。
- Done gateを満たす前に`done`へ変更しない。
- blocking conditionは対象taskのHandoffへ記録し、要件を推測で緩和しない。
- task分割が必要な場合は`TSK-xx.y`を追加し、元taskのDone gateを変更しない。
- 実装順変更は依存関係と理由を本書へ反映し、各要件書へ順序説明を複製しない。

### 4.1 Task実行手順

1. Task indexから`ready`なTaskを一件選び、依存TaskのDone gateとHandoffを確認する。
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
