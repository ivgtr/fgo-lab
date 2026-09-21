---
title: "FGO Lab evidence report index"
document_version: "1.4.47"
status: "Active"
updated_at: "2026-09-21"
---

# Evidence report index

このindexはtracked report 46件（Markdown）とmachine-readable evidenceの役割、後継、関連commitを記録する。TSK-00.3で旧ignored report 15件を内容監査し、damage差分、canonical input、production inventory、digestを失わないため全件をtracked evidenceへ昇格した。reportの統合・削除可否はTSK-09.1で再監査する。`canonical`は現行契約の数値・inventory・digestを直接支える証跡、`supporting`は途中段階または局所判断の追跡資料、`superseded`は後継reportがある資料を表す。

| Report | Status | Evidence role | Successor | Related commit |
| --- | --- | --- | --- | --- |
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
| [ranking-policy-candidate-flow-tsk-06](ranking-policy-candidate-flow-tsk-06.md) | Active | canonical: source program／finite certificate／application policy／outcome。TSK-06.45 U0〜U5、TSK-06.46 W0〜W7、TSK-06.47 UI bounded unit、TSK-06.5 production eligibility／maximum closureを保持。機械証跡は[TSK-06.5 production closure](tsk-06-5-production-closure.json)ほか各bounded unitへリンクする | TSK-06〜08 | TSK-06.5 done、TSK-06.47／06.48 done |
| [tsk-06-5-production-closure](tsk-06-5-production-closure.json) | Complete | machine-readable: production static semantics／candidate-local admission／finite candidate eligibility、80-condition × 433-profile maximum matrix、typed outcomes、calculator／ranking／portable parity、legacy-removal audit、quality gate | TSK-06.5 | `197ff30` baseline／no new commit |
| [tsk-07-cache-closure](tsk-07-cache-closure.json) | Complete | machine-readable: RK-CACHE-001 summary value／lifetime／cardinality、worker detail 0、React active detail 1、fingerprint／request stale rejection、focused／direct-consumer／E2E evidence | TSK-07 | `597d779` baseline／no new commit |
| [tsk-07-notice-reset-closure](tsk-07-notice-reset-closure.json) | Complete | machine-readable: two-axis ranking notice／calculator handoff parity、atomic normal reset、field-by-field hidden-state removal、new baseline fingerprint、reset failure and stale publication rejection | TSK-07 | `f9c56da` baseline／no new commit |
| [tsk-07-outcome-closure](tsk-07-outcome-closure.json) | Complete | machine-readable: five typed outcome presentation、numeric-row boundary、exact AttackProfile normal-calculator recovery、typed invalid reset/reload、unsupported／policy-unavailable non-recovery、focused consumer checks | TSK-07 | `3ec65cd` baseline／no new commit |
| [tsk-07-responsive-accessibility-closure](tsk-07-responsive-accessibility-closure.json) | Complete | machine-readable: desktop／390px／320px responsive containment、accessible names／roles／keyboard／focus、five-outcome recovery presentation、stale/cache identity preservation、integrated quality evidence | TSK-07 | `b9c323a` baseline／no new commit |
| [tsk-06-47-contribution-ui-closure](tsk-06-47-contribution-ui-closure.json) | Complete | machine-readable: logical effect group／per-contribution policy decisions／typed presentation labels／responsive and keyboard evidence／detail cache reuse／quality gate | TSK-06.47 | done／historical closure had no commit; current baseline `197ff30` |
| [tsk-06-48-population-closure](tsk-06-48-population-closure.json) | Complete | canonical: TSK-06.48 population-function／trait catalogとpopulation-count selector／live-read／candidate ownership、production record parity、candidate inventory | TSK-06.48 final closure | `49efe62`／TSK-06.48 complete |
| [tsk-06-48-transfer-hp-closure](tsk-06-48-transfer-hp-closure.json) | Complete | canonical: TSK-06.48 dependent-function descriptor、NP／HP transfer domain ownership、ordered execution preservation、production matrix／candidate inventory／parity | TSK-06.48 final closure | `46f30a7`／TSK-06.48 complete |
| [tsk-06-48-effect-execution-closure](tsk-06-48-effect-execution-closure.json) | Complete | canonical: TSK-06.48 effect composition／execution support owner、canonical operation／input／support preservation、direct consumer order／condition／parity、reused production closure | TSK-06.48 final closure | `128189f`／TSK-06.48 complete |
| [tsk-06-48-battle-execution-closure](tsk-06-48-battle-execution-closure.json) | Complete | canonical: TSK-06.48 battle-execution operation compiler／ordered preparation／resource read／rollback owner audit、direct consumer parity、reused production closure | TSK-06.48 final closure | `ee9f00f`／TSK-06.48 complete |
| [tsk-06-48-calculation-application-closure](tsk-06-48-calculation-application-closure.json) | Complete | canonical: TSK-06.48 scenario intent／canonical input、ranking static source inventory、world observation、candidate equivalence／representative／dedupe／cardinality／cap、common execution parity、reused production closure、final quality | TSK-06.48 complete | `3e98828`／TSK-06.48 complete |
| [resolved-attacker-level-stat-flow-tsk-06-46](resolved-attacker-level-stat-flow-tsk-06-46.md) | Active | canonical: resolved servant／level ATK join、numeric-zero fallback removal、calculator／ranking／portable recovery。path名は旧Task番号を保持 | TSK-06.411、06.42〜08 | TSK-06.42 Step 1 planning |
| [servant-build-record-identity-flow-tsk-06-47](servant-build-record-identity-flow-tsk-06-47.md) | Complete | canonical: build／target map key and embedded servant identity coherence、profile persistence／recovery fail-closed。path名は旧Task番号を保持 | TSK-06.412、06.42〜08 | `911753c`／TSK-06.412 completion |
| [ranking-adverse-action-diff-tsk-06-41](ranking-adverse-action-diff-tsk-06-41.json) | Complete | machine-readable: full 433-profile join with 348 direct result changes＋85 rank-only changes; inputs／actions／resources／NP1〜5 damage／ranks／reasons | TSK-06.41〜06.5 | `bb1df1b` before／after audit |
| [ranking-web-worker-cutover-tsk-07](ranking-web-worker-cutover-tsk-07.md) | Active | canonical: five-item cutover retained; true reset、five-outcome Web表示、handoff／cache await TSK-06.5 | TSK-07〜09 | TSK-06.4／06.41 planning reopening |
| [portable-calculation-identity-flow-tsk-06-1](portable-calculation-identity-flow-tsk-06-1.md) | Active | canonical: discriminated portable identity／persistence／recovery／exact-subject reset; TSK-06.41 Blocking 0 | TSK-06.1〜08 | TSK-06.41 completion |
| [e2e-responsibility-flow-tsk-06-2](e2e-responsibility-flow-tsk-06-2.md) | Complete | canonical: E2E assertion ownership、browser-specific inventory、VRT／a11y、before／after 3-run、worker採否 | TSK-06.2〜09 | TSK-06.2 completion |
| [test-observability-flow-tsk-06-3](test-observability-flow-tsk-06-3.md) | Complete | canonical: quality parent／child outcome、exact browser infrastructure identity、artifact／CI recovery flow | TSK-06.3〜09 | TSK-06.3 follow-up completion |

TSK-00.3の分類根拠と移動前hashは[ignored documentation disposition](ignored-documentation-disposition.md)に記録する。

## Documentation maintenance evidence

- [Documentation inventory](documentation-inventory.md): TSK-00.1開始時のtracked／ignored／reference baseline
- [Ignored documentation disposition](ignored-documentation-disposition.md): TSK-00.3の37件分類、移動前hash、quarantine検証
