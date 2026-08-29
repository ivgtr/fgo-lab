---
title: "FGO Lab evidence report index"
document_version: "1.1.0"
status: "Active"
updated_at: "2026-08-30"
---

# Evidence report index

このindexはtracked report 31件の役割、後継、関連commitを記録する。TSK-00.3で旧ignored report 15件を内容監査し、damage差分、canonical input、production inventory、digestを失わないため全件をtracked evidenceへ昇格した。reportの統合・削除可否はTSK-09.1で再監査する。`canonical`は現行契約の数値・inventory・digestを直接支える証跡、`supporting`は途中段階または局所判断の追跡資料、`superseded`は後継reportがある資料を表す。

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

TSK-00.3の分類根拠と移動前hashは[ignored documentation disposition](ignored-documentation-disposition.md)に記録する。
