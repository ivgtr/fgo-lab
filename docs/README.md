---
title: "FGO Lab documentation registry"
document_version: "1.5.226"
status: "Active"
updated_at: "2026-10-08"
---

# FGO Lab documentation registry

ここをfresh cloneからの唯一の文書入口とする。実装順序と進捗は[development redesign Tasks](tasks/development-redesign-tasks.md)だけが所有する。要件は利用者成果と受入条件、ADRはarchitecture判断と承認状態、evidenceはcanonical input・inventory・digest・commitを所有し、互いの責務を上書きしない。historical snapshot本文は現在の実装判断に使用しない。

## Start here

- Product scopeと横断受入条件: [FGO Lab product requirements](requirements/fgo-lab-requirements-v0.3.md)
- UI contract: [UI design specification](requirements/ui-design-spec.md)
- Damage contract: [damage calculation review](requirements/damage-calculation-review.md) と [damage effect execution requirements](requirements/damage-effect-execution-requirements.md)
- 実装順序と進捗: [development redesign Tasks](tasks/development-redesign-tasks.md)
- architecture判断と承認状態: [ADR index](adr/README.md)
- 再設計の最終受入: [TSK-09 final acceptance](evidence/tsk-09-final-acceptance.md)
- R1全体受入の残条件: [TSK-11の範囲照合・finding](tasks/development-redesign-tasks.md#tsk-11-既存最終受入の範囲照合と残条件の確定)。育成素材未達はTSK-12、rankingの最終製品判断・改修前調査は[TSK-13](tasks/development-redesign-tasks.md#tsk-13-ranking最終製品判断と改修前調査)と要件§20、実装はTSK-14へ対応付ける。既存quality成功から新方針／R1全体受入を推定しない
- Ranking高速化の現行確認・具体計画（調査・計画完了）: [TSK-15](tasks/development-redesign-tasks.md#tsk-15-ranking高速化の実装確認と計画策定)。要件§21のJS非増加・master更新追従を守り、具体計画は承認済みで、TSK-15.1で実装・必要検証を進める
- 検証証跡: [evidence index](evidence/README.md#読み分けと現行の受入先)から現行契約・最終受入・固有履歴・残作業を区別して辿る
- 判断履歴とGit-only snapshot: [historical documentation index](archive/README.md)
- 現行の依存方向: [canonical data flow](guides/data-flow.md)
- 要件改訂とTask closure: [document governance contract](guides/document-governance.md)
- 構造的・意味論的レビュー: [systematic review guidelines](guides/systematic-review-guidelines.md)

`Proposed` requirementは意味論が固定されていても未承認であり、各rowのapproval gateより前に実装してはならない。baseline取得や文書整備など、その意味論を実装しない先行Taskは進められる。

## Repository入口と規約

rootは一般docsのfrontmatterを要求しない専用kindである。metadata契約は[文書整備phase](tasks/documentation-maintenance-phases.md#48-kind別metadataとroot契約)が所有する。

| Path | Kind／metadata契約 | Authority／scope |
| --- | --- | --- |
| [README.md](../README.md) | 開発入口／tracked本文・docs参照 | 開発commandと文書検証gate |
| [AGENTS.md](../AGENTS.md) | 作業規約／tracked本文・docs参照 | repository作業の規約正本 |
| [CLAUDE.md](../CLAUDE.md) | alias／mode120000・link先AGENTS.md | 規約正本へのsymlink。独立本文・status・versionを持たない |

## Registry

| Path | Kind／status | Authority／scope |
| --- | --- | --- |
| [docs/README.md](README.md) | registry／Active v1.5.226 | 唯一のdocumentation navigation entry |
| [FGO Lab product requirements](requirements/fgo-lab-requirements-v0.3.md) | requirement／Active v0.3.10／approved | product目的、機能範囲、portable calculation identity、データ境界、横断受入条件 |
| [UI design specification](requirements/ui-design-spec.md) | requirement／Active v1.5.2／approved | 画面構造、ranking comparison controls、versioned calculator recovery、responsive、a11y、UI受入条件 |
| [damage calculation review](requirements/damage-calculation-review.md) | requirement／Active v1.0.1 | damage式の一次根拠、float32境界、検証方針 |
| [damage effect execution requirements](requirements/damage-effect-execution-requirements.md) | requirement／Active v1.2.4 | condition、state mutation、ordered damage execution、UI不変条件 |
| [ranking requirements](requirements/ranking-self-and-conditional-effects-requirements.md) | requirement／Active v0.11.2／approved | §20の最終製品判断、共通／保存育成、通常自前確定／理想、合法NP補完、source-program／portable／candidate／parity、§21の高速化制約 |
| [test strategy redesign](requirements/test-strategy-redesign.md) | requirement／Active v1.3.5 | 有限CI入力の取得・更新・差戻し、入力と診断artifactの保持、canonical qualityとTSK-14限定受入 |
| [development execution efficiency](requirements/development-execution-efficiency-requirements.md) | requirement／Active v1.3.1 | 権限境界と正式審査、取得元の判断、bounded output、artifact、実装修正と検証の範囲、session分離・上限、handoff |
| [development redesign Tasks](tasks/development-redesign-tasks.md) | Tasks／Active v1.7.200 | 唯一の実装順序、依存、status、handoff |
| [TSK-06.48 package semantic convergence plan](tasks/package-semantic-convergence-tsk-06-48.md) | task plan／Complete v1.0.10 | 固有のsemantic owner判断・検証範囲・性能・テスト境界を保持する完了計画。本文のTask状態は履歴 |
| [TSK-06.48 bounded completion plan](tasks/package-semantic-convergence-tsk-06-48-completion-plan.md) | task plan／Complete v1.0.5 | A／B bounded unitのowner audit・停止境界・限定的検証を保持する完了計画。現在の順序はTasksへ |
| [documentation maintenance phases](tasks/documentation-maintenance-phases.md) | phase plan／Active v1.3.4 | 文書整備の判断規則・kind別metadata・root／alias契約・DOC-P6診断操作とDone gate |
| [ADR index](adr/README.md) | sub-index／Active v1.0.0 | 採用済みarchitecture／semantic decision |
| [evidence index](evidence/README.md) | sub-index／Active v1.4.151 | damage／production／documentation evidence、現行受入と固有履歴の導線 |
| [historical documentation index](archive/README.md) | sub-index／Active v1.0.2 | historical decision chain、現在status、Git-only復元情報 |
| [canonical data flow](guides/data-flow.md) | guide／Guideline v1.0.0 | master、calculation／ranking、user stateの依存方向 |
| [document governance contract](guides/document-governance.md) | guide／Guideline v1.0.3 | Contract ID、Task closure、要件改訂、ADR lifecycle、docs lint・完全診断とmetadata正本への参照 |
| [prompt engineering guidelines](guides/prompt-engineering-guidelines.md) | guide／Guideline v1.2.0 | 依頼例、継続境界、正本への参照。product semanticsは所有しない |
| [systematic review guidelines](guides/systematic-review-guidelines.md) | guide／Guideline v1.1.0 | flow closure記録、構造的findingのfamily監査、レビュー抽象度、汎用反例matrix、FGO Lab固有のreview観点 |
| [data source licenses](licenses/data-sources.md) | license registry／Active v1.0.0 | data source、license、attribution |

`Proposed`から`Active`への変更は、要件本文の承認とTasksのapproval gate更新を同じ変更で記録する。ADRの判断を置換する場合は既存本文を現行化せず、新ADRと`superseded_by`を追加する。
