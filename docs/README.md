---
title: "FGO Lab documentation registry"
document_version: "1.1.0"
status: "Active"
updated_at: "2026-08-30"
---

# FGO Lab documentation registry

ここをfresh cloneからの唯一の文書入口とする。実装順序と進捗は[development-redesign-tasks.md](development-redesign-tasks.md)だけが所有する。要件は利用者成果と受入条件、ADRは採用時点の判断、evidenceはcanonical input・inventory・digest・commitを所有し、互いの責務を上書きしない。

## Start here

- 現行product scope: [FGO Lab product requirements](requirements/fgo-lab-requirements-v0.3.md)
- 現行UI contract: [UI design specification](requirements/ui-design-spec.md)
- 現行damage contract: [damage calculation review](requirements/damage-calculation-review.md) と [damage effect execution requirements](requirements/damage-effect-execution-requirements.md)
- 唯一のactive implementation ledger: [development redesign Tasks](tasks/development-redesign-tasks.md)
- 採用済み判断: [ADR index](adr/README.md)
- damage／ranking証跡: [evidence report index](reports/README.md)
- 文書監査baseline: [documentation inventory](documentation-inventory.md)

`Proposed` requirementは意味論が固定されていても未承認であり、各rowのapproval gateより前に実装してはならない。baseline取得や文書整備など、その意味論を実装しない先行Taskは進められる。

## Registry

| Path | Kind | Status | Authority／scope | Supersedes／superseded by | Implementation task | Evidence role |
| --- | --- | --- | --- | --- | --- | --- |
| [docs/README.md](README.md) | registry | Active v1.1.0 | 唯一のdocumentation navigation entry | - | TSK-00.1、TSK-00.2、TSK-09.1 | tracked文書の分類と入口 |
| [docs/documentation-inventory.md](documentation-inventory.md) | inventory | Complete | TSK-00.1開始時のtracked／ignored／reference baseline | - | TSK-00.1 | HEAD、件数、closure判断 |
| [docs/requirements/fgo-lab-requirements-v0.3.md](requirements/fgo-lab-requirements-v0.3.md) | requirement | Active v0.3.6 | product目的、機能範囲、データ境界、横断受入条件 | supersedes v0.2.2 | 全product Task | product contract |
| [docs/requirements/ui-design-spec.md](requirements/ui-design-spec.md) | requirement | Active v1.4.0 | 画面構造、操作モデル、responsive、a11y、UI受入条件 | local UI optionsの採用結論を統合 | TSK-07 | approved UI baseline |
| [docs/requirements/damage-calculation-review.md](requirements/damage-calculation-review.md) | requirement | Active v1.0.1 | damage式の一次根拠、float32境界、検証方針 | - | TSK-00、TSK-03、TSK-08 | calculation evidence policy |
| [docs/requirements/damage-effect-execution-requirements.md](requirements/damage-effect-execution-requirements.md) | requirement | Active v1.2.0 | condition、state mutation、ordered damage execution、UI不変条件 | 旧resolver契約を置換 | TSK-03〜TSK-08 | acceptanceとproduction inventory |
| [docs/requirements/ranking-self-and-conditional-effects-requirements.md](requirements/ranking-self-and-conditional-effects-requirements.md) | requirement | Proposed v0.6.1 | ranking policy、canonical scenario、candidate、parity | - | approval required before TSK-04 | production audit required |
| [docs/requirements/test-strategy-redesign.md](requirements/test-strategy-redesign.md) | requirement | Proposed v1.1.1 | test suite、runner、quality gate、diagnostics | - | approval required before TSK-01 | test／performance baseline contract |
| [docs/requirements/development-execution-efficiency-requirements.md](requirements/development-execution-efficiency-requirements.md) | requirement | Proposed v1.0.1 | bounded output、artifact、handoff、command efficiency | - | approval required before TSK-01 | execution measurement contract |
| [docs/tasks/development-redesign-tasks.md](tasks/development-redesign-tasks.md) | Tasks | Active v1.1.0 | 唯一の実装順序、依存、status、handoff | old implementation planとmigration E5を引継ぎ | TSK-00.1〜TSK-09 | commit／artifact handoff |
| [docs/tasks/documentation-maintenance-phases.md](tasks/documentation-maintenance-phases.md) | phase plan | Active v1.1.0 | 文書整備固有の判断規則とDone gate。実装順序は所有しない | - | TSK-00.1、TSK-00.2、TSK-09.1 | documentation baseline／layout／closure gate |
| [docs/fgo-lab-requirements.md](fgo-lab-requirements.md) | historical requirement | Superseded v0.2.2 | 初期product検討履歴。実装判断には使用しない | superseded by v0.3 | - | Git history only |
| [docs/damage-effect-execution-migration-plan.md](damage-effect-execution-migration-plan.md) | historical plan | Complete v1.3.0 | E0〜E4の完了履歴。active順序は所有しない | remaining E5 transferred to TSK-08／09.1／09 | - | phase resultと旧gate |
| [docs/damage-effect-execution-structure-plan.md](damage-effect-execution-structure-plan.md) | historical plan | Complete | execution ownershipとE3.5〜E3.7完了記録 | succeeded by active damage requirement／Tasks | - | canonical IR、MLB inventory／digest |
| [docs/damage-effect-unsupported-convergence-plan.md](damage-effect-unsupported-convergence-plan.md) | historical plan | Complete | exact-solvable familyと残存unsupportedの完了記録 | succeeded by zero-unsupported plan | - | unsupported inventory |
| [docs/damage-effect-zero-unsupported-plan.md](damage-effect-zero-unsupported-plan.md) | historical plan | Complete | implementation-unsupported 0の完了記録 | succeeded by active damage requirement／Tasks | - | production ratchet contract |
| [docs/prompt-engineering-guidelines.md](prompt-engineering-guidelines.md) | guide | Guideline v1.0.0 | 開発promptとhandoffの運用。product semanticsは所有しない | - | all Tasks | operational examples |
| [docs/licenses/data-sources.md](licenses/data-sources.md) | license registry | Active | data source、license、attribution | - | data updates | provenance evidence |
| [docs/adr/README.md](adr/README.md) | ADR sub-index | Active | ADR-001〜025のpath、status、decision | individual ADRを直接登録 | relevant semantic Tasks | accepted decision history |
| [docs/reports/README.md](reports/README.md) | evidence sub-index | Active v1.0.0 | tracked report 16件のstatus、role、successor、commit | individual reportsを直接登録 | TSK-09.1 retention review | canonical／supporting evidence |

## Status vocabulary

- Requirements／registry: `Active | Proposed | Superseded`
- Tasks／phase plan: `Active | Complete`
- Historical plan／report: `Complete | Superseded`
- ADR: `accepted | superseded`
- Guide: `Guideline`

`Proposed`から`Active`への変更は、要件本文の承認とTasksのapproval gate更新を同じ変更で記録する。ADRの判断を置換する場合は既存本文を現行化せず、新ADRと`superseded_by`を追加する。
