---
title: "FGO Lab documentation registry"
document_version: "1.5.20"
status: "Active"
updated_at: "2026-09-01"
---

# FGO Lab documentation registry

ここをfresh cloneからの唯一の文書入口とする。実装順序と進捗は[development redesign Tasks](tasks/development-redesign-tasks.md)だけが所有する。要件は利用者成果と受入条件、ADRはarchitecture判断と承認状態、evidenceはcanonical input・inventory・digest・commitを所有し、互いの責務を上書きしない。historical snapshot本文は現在の実装判断に使用しない。

## Start here

- Product scopeと横断受入条件: [FGO Lab product requirements](requirements/fgo-lab-requirements-v0.3.md)
- UI contract: [UI design specification](requirements/ui-design-spec.md)
- Damage contract: [damage calculation review](requirements/damage-calculation-review.md) と [damage effect execution requirements](requirements/damage-effect-execution-requirements.md)
- 実装順序と進捗: [development redesign Tasks](tasks/development-redesign-tasks.md)
- architecture判断と承認状態: [ADR index](adr/README.md)
- 検証証跡: [evidence index](evidence/README.md)
- 判断履歴とGit-only snapshot: [historical documentation index](archive/README.md)
- 現行の依存方向: [canonical data flow](guides/data-flow.md)
- 要件改訂とTask closure: [document governance contract](guides/document-governance.md)
- 構造的・意味論的レビュー: [systematic review guidelines](guides/systematic-review-guidelines.md)

`Proposed` requirementは意味論が固定されていても未承認であり、各rowのapproval gateより前に実装してはならない。baseline取得や文書整備など、その意味論を実装しない先行Taskは進められる。

## Registry

| Path | Kind／status | Authority／scope |
| --- | --- | --- |
| [docs/README.md](README.md) | registry／Active v1.5.20 | 唯一のdocumentation navigation entry |
| [FGO Lab product requirements](requirements/fgo-lab-requirements-v0.3.md) | requirement／Active v0.3.8／approved | product目的、機能範囲、portable calculation identity、データ境界、横断受入条件 |
| [UI design specification](requirements/ui-design-spec.md) | requirement／Active v1.4.1／approved | 画面構造、versioned calculator recovery、responsive、a11y、UI受入条件 |
| [damage calculation review](requirements/damage-calculation-review.md) | requirement／Active v1.0.1 | damage式の一次根拠、float32境界、検証方針 |
| [damage effect execution requirements](requirements/damage-effect-execution-requirements.md) | requirement／Active v1.2.1 | condition、state mutation、ordered damage execution、UI不変条件 |
| [ranking requirements](requirements/ranking-self-and-conditional-effects-requirements.md) | requirement／Active v0.8.0／approved | ranking policy、portable handoff、bounded evidence cache、candidate、parity |
| [test strategy redesign](requirements/test-strategy-redesign.md) | requirement／Active v1.2.0 | test suite、runner、quality gate、diagnostics |
| [development execution efficiency](requirements/development-execution-efficiency-requirements.md) | requirement／Active v1.1.0 | bounded output、artifact、handoff、command efficiency |
| [development redesign Tasks](tasks/development-redesign-tasks.md) | Tasks／Active v1.5.20 | 唯一の実装順序、依存、status、handoff |
| [documentation maintenance phases](tasks/documentation-maintenance-phases.md) | phase plan／Active v1.3.2 | 文書整備固有の判断規則とDone gate |
| [ADR index](adr/README.md) | sub-index／Active | 採用済みarchitecture／semantic decision |
| [evidence index](evidence/README.md) | sub-index／Active v1.4.15 | damage／production／documentation evidence |
| [historical documentation index](archive/README.md) | sub-index／Active v1.0.0 | historical decision chain、現在status、Git-only復元情報 |
| [canonical data flow](guides/data-flow.md) | guide／Guideline v1.0.0 | master、calculation／ranking、user stateの依存方向 |
| [document governance contract](guides/document-governance.md) | guide／Guideline v1.0.1 | Contract ID、Task closure、要件改訂、ADR lifecycle、docs lint |
| [prompt engineering guidelines](guides/prompt-engineering-guidelines.md) | guide／Guideline v1.1.2 | bounded execution flow、delta反証計画、開発promptとhandoffの運用。product semanticsは所有しない |
| [systematic review guidelines](guides/systematic-review-guidelines.md) | guide／Guideline v1.0.0 | 構造的findingのfamily監査、レビュー抽象度、汎用反例matrix、FGO Lab固有のreview観点 |
| [data source licenses](licenses/data-sources.md) | license registry／Active | data source、license、attribution |

`Proposed`から`Active`への変更は、要件本文の承認とTasksのapproval gate更新を同じ変更で記録する。ADRの判断を置換する場合は既存本文を現行化せず、新ADRと`superseded_by`を追加する。
