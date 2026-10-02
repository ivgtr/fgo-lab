---
title: "FGO Lab evidence report index"
document_version: "1.4.151"
status: "Active"
updated_at: "2026-10-02"
---

# Evidence report index

このindexはtracked report 49件（Markdown表）とmachine-readable evidenceの役割、後継、関連commitを記録する。TSK-00.3で旧ignored report 15件を内容監査し、damage差分、canonical input、production inventory、digestを失わないため全件をtracked evidenceへ昇格した。TSK-09.1 STEP 3では固有内容を各本文にretainし、統合・削除を必要としないと判断した。理由と今回のdeltaは[判定台帳STEP 3](tsk-09-1-documentation-closure.md#step-3-doc-p4導線role収束)が所有する。

`canonical`は記載されたscopeの一次証跡、`supporting`は途中段階・局所判断・固有測定の追跡資料を表す。旧E／Q系列のcanonicalな数値も当該phaseの歴史値であり、現HEADの値ではない。Statusは文書／証拠の役割と成立範囲を示し、Task進捗は[Tasks](../tasks/development-redesign-tasks.md)だけが所有する。`Superseded`でも元input／rule／差分を失わず、Successorは現行契約・後続受入への案内であり元byteや歴史判断の代替ではない。

STEP 4の明示metadata移管は[既存判定台帳](tsk-09-1-documentation-closure.md#step-4-doc-p5metadata移管)を参照する。`historical_status`は元状態、`status_scope`は文書statusの成立範囲を保持し、`Complete`からUX承認・現HEADの全受入を推論しない。E0〜E3の元phase完了・UX確認待ち、Verified flow、Implementationの意味は各本文に残す。machine evidenceのdomain statusはこのMarkdown語彙の対象外である。

STEP 5の検査実装・参照分類・CLI診断保存と受入は[同台帳のDOC-P6記録](tsk-09-1-documentation-closure.md#step-5-doc-p6検査実装)を参照する。machine evidenceのdomain statusと歴史snapshotは変更せず、親noteを含む登録経路を検査する。[STEP 6](tsk-09-1-documentation-closure.md#step-6-統合受入handoff)は専用frozen install後の独立checkoutで28fixture／全tracked検査・22文書導線を受け入れた。追補で原PNG／archiveの固定history取得・全21原物の復元を受入。U6は明示承認した主repositoryから固定revisionをGit取得し、別worktreeの入力を照合。外部originのbaseline提供未保証を残し、09.1は全Done gate／Apply成立でdone、09はready・未着手。最終closureは台帳末尾・Taskへ接続する。

## 読み分けと現行の受入先

| 読む目的 | 入口と成立範囲 |
| --- | --- |
| 現行契約 | [product](../requirements/fgo-lab-requirements-v0.3.md)、[damage execution](../requirements/damage-effect-execution-requirements.md)、[ranking](../requirements/ranking-self-and-conditional-effects-requirements.md)、[UI](../requirements/ui-design-spec.md)、[ADR index](../adr/README.md)、[data flow](../guides/data-flow.md)。evidenceから新しい意味論を推論しない |
| 現行回帰入力 | [TSK-06.5 production closure](tsk-06-5-production-closure.json)の`productionMatrix.canonicalRecords` → repository内`production-v1/manifest.json`と80gzip。固定取得revisionは`dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4`、現行作業HEADとは別。取得・不足時操作は[保持契約](tsk-09-1-documentation-closure.md#step-2-保持契約の収束) |
| 最終受入 | [TSK-08 parity ratchet](tsk-08-parity-ratchet.json)の`implementationSelfReview.nonfiniteBodyReview.repairPlan.finalAcceptance`（1588／157／29）。その後の保存reader移行は[09.11最終受入](tsk-09-1-documentation-closure.md#tsk-0911-最終受入)（1603／157／29）。件数は別source・別受入の歴史記録であり、現HEADでのfresh成功を表さない |
| 固有履歴 | 下表のE／Q report、flowの採用delta、[routing測定](web-routing-flow-next-migration.md#performance-evidence)、[E4原画像復元](tsk-09-1-documentation-closure.md#e4歴史画像の復元)。後続受入があっても元input／rule／測定を置換しない。Git-only文書は[archive index](../archive/README.md) |
| 保持判断と残作業 | [09.13最終処遇判断](tsk-09-1-documentation-closure.md#0913-不使用方針による最終処遇判断)と[09.1 Task／Handoff](../tasks/development-redesign-tasks.md#tsk-091-documentation-evidencearchive-finalization)。HP原内容・出自の再監査能力は手放した。fixture移管ではなく物理処遇も未実施。旧bundle／旧部分保持packageを取得・再開・通常検証の必須入力に戻さない。bundle外OC inventory／raw exportsの契約は維持 |

raw log／trace／receiptは[テスト戦略§9](../requirements/test-strategy-redesign.md#9-artifact仕様)の調査artifactである。原byte不足後はGitの歴史受入と現在必要な契約のfresh検証を区別し、全receiptによる新しいbyte照合を主張しない。

## Report inventory

| Report | Status | Evidence role | Successor | Related commit |
| --- | --- | --- | --- | --- |
| [TSK-09 final acceptance](tsk-09-final-acceptance.md) | Active | canonical: 全最終Contract・checklist／Done gate、有限caller、contributor検査・完全診断、固定入力／thread再開、性能再利用、最終qualityとHandoff | TSK-09。成立条件と残作業は本文の最終判定 | `ce9cea0`開始＋先行73件・本Task未commit差分 |
| [TSK-09.1 documentation closure decision ledger](tsk-09-1-documentation-closure.md) | Active | canonical: A0〜A9保持契約・保存実験履歴・09.13最終処遇判断、STEP 3の導線／role判定とSTEP 4の個別metadata移管・保持判断。STEP 1〜5完了を保持。STEP 6の別checkout文書／入力照合・U7原物21件取得復元とU6の承認済み提供元からの固定baseline取得・保証限界は末尾を参照。09.12部分保持案は履歴、09.13でHP7object／33alias／40原宣言の原内容・出自再監査能力を手放した。fixture移管ではない。各STEP受入・残作業は台帳末尾とTaskへ | TSK-09.1 STEP 6→TSK-09の最終Contract受取。物理処遇を開始条件にしない | `ce9cea0`開始＋既存8文書差分、取得revision`dd1a0eb`、prototype資料`39844a1`。bundle／原run未処遇 |
| [damage-condition-application](damage-condition-application.md) | Complete | supporting: schema 9／engine 7 conditional application change | damage execution requirement | `db0bb53` |
| [damage-effect-dependency-audit](damage-effect-dependency-audit.md) | Superseded | supporting: 469／420 production unsupported baseline | E0以降のexecution inventory | `3dd4be9` |
| [damage-effect-execution-e0](damage-effect-execution-e0.md) | Superseded | supporting: pre-migration inventory／UX baseline | E1 | `9f7c836` |
| [damage-effect-execution-e1](damage-effect-execution-e1.md) | Superseded | supporting: ordered execution contract | E2 | `1726d7c` |
| [damage-effect-execution-e2](damage-effect-execution-e2.md) | Superseded | supporting: schema 11／engine 8 central switch | E3 | `48b69a1` |
| [damage-effect-execution-e3](damage-effect-execution-e3.md) | Superseded | canonical: 469／420 production audit and 17-case ratchet | E3.2以降 | `40b577c` |
| [damage-effect-routing-audit](damage-effect-routing-audit.md) | Complete | supporting: actor routing／condition audit and implementation result | ordered execution E0以降 | `7735d2e` |
| [damage-quality-q0](damage-quality-q0.md) | Complete | canonical: raw Function／effect inventory and target contracts | Q1 | `31131c5` |
| [damage-quality-q1](damage-quality-q1.md) | Complete | supporting: normalization／fail-closed migration | Q2 | `74d08f9` |
| [damage-quality-q2](damage-quality-q2.md) | Complete | canonical: kernel golden／benchmark baseline | Q3 | `d225296` |
| [damage-quality-q3](damage-quality-q3.md) | Complete | supporting: all-source resolution and production effect audit | Q4 | `a463934` |
| [damage-quality-q4](damage-quality-q4.md) | Complete | canonical: evidence precision and external differential | Q5 | `eaed00b` |
| [damage-quality-q5](damage-quality-q5.md) | Complete | supporting: scenario facade／history／share convergence | execution E0以降 | `7331082` |
| [master-data-2026-08-24](master-data-2026-08-24.md) | Superseded | canonical: source checksums、artifact digest、469／420 inventory | later production inventory reports | `1276757` |
| [r1-implementation-status](r1-implementation-status.md) | Superseded | supporting: schema 1／engine 1 release and performance baseline | damage quality Q0以降 | `8022775` |
| [activation-structure-cleanup-e4-1](activation-structure-cleanup-e4-1.md) | Complete | supporting: executable state boundary | E4.1系列 | `ded9806` |
| [damage-effect-execution-e3-2](damage-effect-execution-e3-2.md) | Complete | supporting: condition／decision／fact redesign | E3.3以降 | `1bd28ce` |
| [damage-effect-execution-e3-3](damage-effect-execution-e3-3.md) | Complete | supporting: unified constraint validation | E3.4以降 | `9387f66` |
| [damage-effect-execution-e3-4](damage-effect-execution-e3-4.md) | Complete | canonical: unsupported semantics inventory | E3.8 | `8730c91` |
| [damage-effect-execution-e3-8](damage-effect-execution-e3-8.md) | Complete | canonical: implementation-unsupported 0 | E3.9以降 | `1b8c260` |
| [damage-effect-execution-e3-9](damage-effect-execution-e3-9.md) | Complete | canonical: HP threshold series | E3.10以降 | `3cd068e` |
| [damage-effect-execution-e3-10](damage-effect-execution-e3-10.md) | Complete | canonical: proc semantics | E3.11以降 | `ad8187e` |
| [damage-effect-execution-e3-11](damage-effect-execution-e3-11.md) | Complete | canonical: attacker control ownership | E3.12 | `e9d1c1a` |
| [damage-effect-execution-e3-12](damage-effect-execution-e3-12.md) | Complete | canonical: chained activation | E4 | `4fc7e59` |
| [damage-effect-execution-e4](damage-effect-execution-e4.md) | Complete | canonical: ranking integration、parity、digest | E4.1系列 | `b861241` |
| [damage-effect-execution-e4-1](damage-effect-execution-e4-1.md) | Complete | canonical: NP variant inventory | E4.1 follow-ups | `49bb6db` |
| [damage-effect-execution-e4-1-2](damage-effect-execution-e4-1-2.md) | Superseded | supporting: condition provenance | E4.1.3 | `d1f375a` |
| [damage-effect-execution-e4-1-3](damage-effect-execution-e4-1-3.md) | Complete | canonical: activation witness closure | E4.1.4 | `cbc600c` |
| [damage-effect-execution-e4-1-4](damage-effect-execution-e4-1-4.md) | Complete | canonical: activation witness deduplication | E4.1.5 | `59d0bc7` |
| [damage-effect-execution-e4-1-5](damage-effect-execution-e4-1-5.md) | Complete | canonical: activation facts | TSK-03／08 inventory | `66bc848` |
| [damage-effect-execution-e4-1-attack-profiles](damage-effect-execution-e4-1-attack-profiles.md) | Complete | canonical: AttackProfile inventory／digest | TSK-03／04／08 | `9314a1d` |
| [test-ranking-baseline-tsk-00](test-ranking-baseline-tsk-00.md) | Complete | canonical: test／CI／ranking／performance baseline | TSK-01〜09 | TSK-00 completion |
| [test-suite-quality-gate-tsk-02](test-suite-quality-gate-tsk-02.md) | Complete | canonical: Suite classification／quality gate／performance／artifact | TSK-03〜09 | TSK-02 completion |
| [shared-production-audit-tsk-03](shared-production-audit-tsk-03.md) | Complete | canonical: shared production inventory／digest／measured exact counter ratchet／performance | TSK-04〜09 | `07b63c0`／`10c5af3`／`a06532a`／TSK-03 completion |
| [canonical-selection-semantics-tsk-04](canonical-selection-semantics-tsk-04.md) | Complete | canonical: player choice／stochastic outcome inventory、runtime activation／input recovery、fail-closed、parity、performance | TSK-04〜08 | TSK-04 selection completion |
| [condition-target-provenance-flow-tsk-04](condition-target-provenance-flow-tsk-04.md) | Complete | canonical: condition／target／recipient／provenance／contribution flow closure | TSK-04〜08 | TSK-04 Phase 1 |
| [np-resource-semantics-flow-tsk-04](np-resource-semantics-flow-tsk-04.md) | Complete | canonical: NP capacity／requirement／gain-loss／all-consume／base OC | TSK-04〜08 | TSK-04 Phase 2 |
| [legacy-runtime-removal-tsk-04](legacy-runtime-removal-tsk-04.md) | Complete | canonical: old schema reader／raw fallback／dual runtime branch removal | TSK-04〜08 | TSK-04 Phase 3 |
| [transactional-preparation-flow-tsk-05](transactional-preparation-flow-tsk-05.md) | Complete | canonical: ordered condition／choice／NP resource／state／form／variant action transaction、typed outcome、full recovery | TSK-05〜08 | `69f8207e` baseline／second review resolution |
| [ranking-policy-candidate-flow-tsk-06](ranking-policy-candidate-flow-tsk-06.md) | Active | canonical: source program／finite certificate／application policy／outcomeの意味説明と固有delta。TSK-06.45〜06.5の歴史closure／測定を保持。ActiveはTask未完了を意味しない | 現行ranking契約、TSK-06.5固定baseline、TSK-08最終受入、保存readerは09.11 | 元各bounded unitのcommit／versionは本文。TSK-06.5 completion baseline `197ff30` |
| [tsk-06-5-production-closure](tsk-06-5-production-closure.json) | Complete | machine-readable: production static semantics／candidate-local admission／finite candidate eligibility、80-condition × 433-profile maximum matrix、typed outcomes、calculator／ranking／portable parity、legacy-removal audit、quality gate | TSK-06.5 | `197ff30` baseline／no new commit |
| [tsk-07-cache-closure](tsk-07-cache-closure.json) | Complete | machine-readable: RK-CACHE-001 summary value／lifetime／cardinality、worker detail 0、React active detail 1、fingerprint／request stale rejection、focused／direct-consumer／E2E evidence | TSK-07 | `597d779` baseline／no new commit |
| [tsk-07-notice-reset-closure](tsk-07-notice-reset-closure.json) | Complete | machine-readable: two-axis ranking notice／calculator handoff parity、scenario/version-preserving intent-only reset、failure retention、workspace stale-publication rejection | TSK-07 | `f9c56da` baseline／no new commit |
| [tsk-07-outcome-closure](tsk-07-outcome-closure.json) | Complete | machine-readable: five typed outcome presentation、numeric-row boundary、exact AttackProfile normal-calculator recovery、typed invalid reset/reload、unsupported／policy-unavailable non-recovery、focused consumer checks | TSK-07 | `3ec65cd` baseline／no new commit |
| [tsk-07-responsive-accessibility-closure](tsk-07-responsive-accessibility-closure.json) | Complete | machine-readable: desktop／390px／320px responsive containment、accessible names／roles／keyboard／focus、five-outcome recovery presentation、stale/cache identity preservation、integrated quality evidence | TSK-07 | `b9c323a` baseline／no new commit |
| [tsk-08-parity-diagnostics](tsk-08-parity-diagnostics.json) | Complete (bounded unit) | supporting: typed parity reason／canonical identity／first diff／checksum reachabilityの初期局所受入。JSONのunresolved／nextBoundedUnitは当時のcheckpointとして保持 | shared-audit-model→parity-ratchetの最終受入。全体進捗はTasks | `34828ea` baseline／元局所closure |
| [tsk-08-parity-ratchet](tsk-08-parity-ratchet.json) | Complete (TSK-08 acceptance) | canonical: 全TSK-08義務・R08-NONFINITE修正の最終受入は`implementationSelfReview.nonfiniteBodyReview.repairPlan.finalAcceptance`、root status=done・Blocking0・mandatoryDeferred0。正常80条件／34640 outcome、typed完全診断、性能・quality1588／157／29。units[0]〜[52]・旧checkpoint・失敗・宣言／scopeは固有履歴として同JSONに保持 | 現行契約はrequirements／ADR。保存reader移行は09.11、保持解除は09.13、残作業は09.1 STEP 6固定取得／09 | 元製品baseline`60dea89`、最新受入source HEAD`6de5e17`。歴史digest・各元commitは本文、現行取得revision`dd1a0eb`と区別 |
| [tsk-08-shared-audit-model](tsk-08-shared-audit-model.json) | Complete (bounded unit) | supporting: TSK-06.5 source reference／package boundary model／full-matrix first diff／reachabilityの初期局所受入。元digest・未達scopeは当時のcheckpoint | parity-ratchetの最終受入。固定expected consumer移行は09.11 | `5d82e38` baseline／元局所closure |
| [tsk-06-47-contribution-ui-closure](tsk-06-47-contribution-ui-closure.json) | Complete | machine-readable: logical effect group／per-contribution policy decisions／typed presentation labels／responsive and keyboard evidence／detail cache reuse／quality gate | TSK-06.47 | done／historical closure had no commit; current baseline `197ff30` |
| [tsk-06-48-population-closure](tsk-06-48-population-closure.json) | Complete | canonical: TSK-06.48 population-function／trait catalogとpopulation-count selector／live-read／candidate ownership、production record parity、candidate inventory | TSK-06.48 final closure | `49efe62`／TSK-06.48 complete |
| [tsk-06-48-transfer-hp-closure](tsk-06-48-transfer-hp-closure.json) | Complete | canonical: TSK-06.48 dependent-function descriptor、NP／HP transfer domain ownership、ordered execution preservation、production matrix／candidate inventory／parity | TSK-06.48 final closure | `46f30a7`／TSK-06.48 complete |
| [tsk-06-48-effect-execution-closure](tsk-06-48-effect-execution-closure.json) | Complete | canonical: TSK-06.48 effect composition／execution support owner、canonical operation／input／support preservation、direct consumer order／condition／parity、reused production closure | TSK-06.48 final closure | `128189f`／TSK-06.48 complete |
| [tsk-06-48-battle-execution-closure](tsk-06-48-battle-execution-closure.json) | Complete | canonical: TSK-06.48 battle-execution operation compiler／ordered preparation／resource read／rollback owner audit、direct consumer parity、reused production closure | TSK-06.48 final closure | `ee9f00f`／TSK-06.48 complete |
| [tsk-06-48-calculation-application-closure](tsk-06-48-calculation-application-closure.json) | Complete | canonical: TSK-06.48 scenario intent／canonical input、ranking static source inventory、world observation、candidate equivalence／representative／dedupe／cardinality／cap、common execution parity、reused production closure、final quality | TSK-06.48 complete | `3e98828`／TSK-06.48 complete |
| [resolved-attacker-level-stat-flow-tsk-06-46](resolved-attacker-level-stat-flow-tsk-06-46.md) | Complete | canonical: exact level-ATK joinとnumeric-zero fallback除去の採用根拠。Step 1計画だけでなくStep 2実装closureとPIR-001 handoff transaction追補を保持 | 現行product／UI契約、TSK-08最終受入、後続保存readerは09.11 | 実装`e16e5b0`／TSK-06.411 completion。元path名は旧Task番号 |
| [servant-build-record-identity-flow-tsk-06-47](servant-build-record-identity-flow-tsk-06-47.md) | Complete | canonical: build／target map key and embedded servant identity coherence、profile persistence／recovery fail-closed。path名は旧Task番号を保持 | TSK-06.412、06.42〜08 | `911753c`／TSK-06.412 completion |
| [ranking-adverse-action-diff-tsk-06-41](ranking-adverse-action-diff-tsk-06-41.json) | Complete | machine-readable: full 433-profile join with 348 direct result changes＋85 rank-only changes; inputs／actions／resources／NP1〜5 damage／ranks／reasons | TSK-06.41〜06.5 | `bb1df1b` before／after audit |
| [ranking-web-worker-cutover-tsk-07](ranking-web-worker-cutover-tsk-07.md) | Complete | canonical: five-item cutover、scenario/version-preserving reset、five-outcome Web表示、handoff／cache／responsive closure | TSK-07 | TSK-07 integrated closure／no new commit |
| [portable-calculation-identity-flow-tsk-06-1](portable-calculation-identity-flow-tsk-06-1.md) | Active | canonical: discriminated portable identity／保存・復元／exact-subject resetの採用根拠とTSK-06.41歴史delta。Activeは現在のTask進捗ではない | 現行product／UI契約、TSK-07 cutover、TSK-08最終受入 | TSK-06.41 completionと各元commitは本文 |
| [e2e-responsibility-flow-tsk-06-2](e2e-responsibility-flow-tsk-06-2.md) | Complete | canonical: E2E assertion ownership、browser-specific inventory、VRT／a11y、before／after 3-run、worker採否 | TSK-06.2〜09 | TSK-06.2 completion |
| [test-observability-flow-tsk-06-3](test-observability-flow-tsk-06-3.md) | Complete | canonical: quality parent／child outcome、exact browser infrastructure identity、artifact／CI recovery flow | TSK-06.3〜09 | TSK-06.3 follow-up completion |
| [web-routing-flow-next-migration](web-routing-flow-next-migration.md) | Historical migration evidence | supporting: Next移行のroute／master receipt責務、当時のVerified flow、配信量・master検証時間。測定を代替する後継なし。元Implementation metadataはSTEP 4へ | 現行ruleはADR-029／data-flow／UI契約、現行受入は上の案内。元測定は本noteにretain | Next`c216284`、cache`2a818bd`、startup`2c1a978`、route split`907f251` |

TSK-00.3の分類根拠と移動前hashは[ignored documentation disposition](ignored-documentation-disposition.md)に記録する。

## Documentation maintenance evidence

- [Documentation inventory](documentation-inventory.md): TSK-00.1開始時のtracked／ignored／reference baseline
- [Ignored documentation disposition](ignored-documentation-disposition.md): TSK-00.3の37件分類、移動前hash、quarantine検証

## 歴史checkpointへの導線

旧indexに掲載したfixed HP committed forward／noncommit、unit52 capacity／give／coverage／transferは[parity ratchet](tsk-08-parity-ratchet.json)の`boundedUnits[46]`〜`[52]`と各checkpointに保持する。`6d571bdd`・`e95c971a`・`ea7290d`・`51aad93`・`1cc3482`、当時のinventory／digest／bytes／SHA・失敗・未対応scopeは元記録を読む。当時のTSK-08 in_progress／09系blockedと次session指示は歴史状態であり、現在の次操作ではない。

以下のpointerはすべて同JSON内。旧indexの固有checkpointと作業指示への導線を保持し、現在の次session指示には使わない。

| 歴史対象 | 固定pointer／所在 |
| --- | --- |
| capacity／入力lifecycle／give／coverage／transfer | `boundedUnits[52].capacityAttemptMaterializationCheckpoint`、`boundedUnits[52].productionAuditInputLifecycleCheckpoint`、`boundedUnits[52].giveCommittedForwardCheckpoint`、`boundedUnits[52].giveNativeNoncommitCheckpoint`、`boundedUnits[52].hpCoverageReconciliationCheckpoint`、`boundedUnits[52].hpTransferEvidenceReconciliationCheckpoint` |
| HP proof／Published／support／control／noHealing | `boundedUnits[52].hpRemainingProofReconciliationCheckpoint`、`boundedUnits[52].hpPublishedDependencyProofCheckpoint`、`boundedUnits[52].hpPublishedDependencyRemainderCheckpoint`、`boundedUnits[52].hpPublishedSupportValueExpressionCheckpoint`、`boundedUnits[52].controlAuditArtifactCheckpoint`、`boundedUnits[52].hpNoHealingNativeCheckpoint` |
| 当時のHP調査指示・後続result参照 | `handoffPreparation.nextSession.hpRemainingProofReconciliationSession`、`handoffPreparation.nextSession.hpPublishedDependencyProofSession`、`handoffPreparation.nextSession.hpPublishedDependencyRemainderSession`、`handoffPreparation.nextSession.hpPublishedDependencyOwnerPathSession`、`handoffPreparation.nextSession.hpSupportValueReadSession`、`handoffPreparation.nextSession.ceConditionOwnerSession` |
| 残義務の再設計と当時の実装指示 | `remainingWorkSummary.remainingWorkRedesign`、`handoffPreparation.nextSession.tsk08RedesignedClosureSession` |
| 候補HP条件leaf identityの設計・限定実装・再照合 | `postCandidateLeafIdentityDesignCheckpoint`、`postCandidateLeafIdentityImplementationCheckpoint`、`postCandidateLeafIdentityStepRecheckHandoff` |

全体の最終受入は上記`implementationSelfReview.nonfiniteBodyReview.repairPlan.finalAcceptance`。旧checkpointを削除・現在値へ変換せず、root doneだけを根拠に個々の非empty fixture／published 0件／未観測recoveryを同じ意味へ統合しない。現在の残作業と再開操作は[Tasks](../tasks/development-redesign-tasks.md)を読む。
