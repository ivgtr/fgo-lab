---
title: "FGO Lab evidence report index"
document_version: "1.0.0"
status: "Active"
updated_at: "2026-08-30"
---

# Evidence report index

このindexはtracked report 16件の役割、後継、関連commitを記録する。reportの統合・削除可否はTSK-09.1で再監査するため、TSK-00.1では削除しない。`canonical`は現行契約の数値・inventory・digestを直接支える証跡、`supporting`は途中段階または局所判断の追跡資料、`superseded`は後継reportがある資料を表す。

| Report | Status | Evidence role | Successor | Related commit |
| --- | --- | --- | --- | --- |
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

ignoredなlocal report 15件は[documentation inventory](../documentation-inventory.md)に列挙している。内容監査とcanonical evidenceへの統合前に、tracked昇格または物理削除を行わない。
