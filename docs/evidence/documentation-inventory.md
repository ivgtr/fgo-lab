---
title: "TSK-00.1 documentation inventory"
document_version: "1.0.0"
status: "Complete"
created_at: "2026-08-30"
baseline_head: "e4cb665c1dbc6abbbc8291ffc6f44656251453cd"
implementation_task: "docs/tasks/development-redesign-tasks.md TSK-00.1"
---

# TSK-00.1 documentation inventory

## Baseline identity

TSK-00.1開始commit `e4cb665c1dbc6abbbc8291ffc6f44656251453cd` を基準とする。開始commit直後のworking treeはcleanだった。

| Scope | Count |
| --- | ---: |
| tracked Markdown under `docs/` | 56 |
| ignored／untracked Markdown under `docs/` | 31 |
| working tree Markdown under `docs/` | 87 |
| tracked ADR files including index | 26 |
| tracked reports | 16 |
| ignored／untracked reports | 15 |
| active tracked documents referencing untracked canonical `.md` targets | 8 targets |

計画初版の55／86は再計測で1件不足していたため、[documentation maintenance phases](../tasks/documentation-maintenance-phases.md)のbaselineも56／87へ訂正した。削除候補の判定に件数、更新日、incoming link数だけを使用していない。

## Tracked inventory and classification

全tracked Markdownは次のregistry単位で判定した。

| Registry unit | Files at baseline | Kind／status | Incoming registration | Outgoing authority |
| --- | ---: | --- | --- | --- |
| [Documentation registry](../README.md)のtop-level文書 | 13 | requirements、Tasks、plans、guide、license | root READMEおよび本inventory | 各rowのauthority／scopeに限定 |
| [ADR index](../adr/README.md) | 25 ADR + index | decision／accepted | documentation registry | ADR内の採用時点の根拠。実装順序を所有しない |
| [Evidence report index](README.md) | 16 reports | evidence／CompleteまたはSuperseded | documentation registry | canonical input、inventory、digest、関連commit。実装順序を所有しない |
| [Data source registry](../licenses/data-sources.md) | 1 | license／Active | documentation registry | data provenance。実装順序を所有しない |

TSK-00.1で新たに正本化する`ui-design-spec.md`と`damage-calculation-review.md`、および三つのindex／inventoryはbaseline件数に含めない。完了時のtracked集合は[Documentation registry](../README.md)を正とする。

## Untracked canonical reference closure

開始時にactive tracked文書から正本または実装資料として参照されていた8 targetを、文書family全体で次のように判定した。

| Untracked target at baseline | Incoming active source | Decision | Canonical successor／retained evidence |
| --- | --- | --- | --- |
| `docs/requirements/ui-design-spec.md` | product requirements、damage execution requirements | 内容監査後にtracked UI requirementへ昇格 | `docs/requirements/ui-design-spec.md` v1.4.0 |
| `docs/requirements/damage-calculation-review.md` | product requirements | 計算式根拠を保持するためtracked requirementへ昇格 | `docs/requirements/damage-calculation-review.md` v1.0.1、ADR-004 |
| `docs/implementation-plan.md` | product requirements、UI specification | active実装順序から除外。local履歴として保持 | `docs/tasks/development-redesign-tasks.md` |
| `docs/home-ui-options.md` | product requirements | canonical参照から除外。local比較履歴として保持 | `docs/requirements/ui-design-spec.md` §19 |
| `docs/my-chaldea-ui-options.md` | product requirements | canonical参照から除外。local比較履歴として保持 | `docs/requirements/ui-design-spec.md` §17 |
| `docs/craft-essence-ui-options.md` | product requirements | canonical参照から除外。local比較履歴として保持 | `docs/requirements/ui-design-spec.md` §17.6〜17.7 |
| `docs/support-template-ui-options.md` | product requirements、UI specification | canonical参照から除外。local比較履歴として保持 | `docs/requirements/ui-design-spec.md` §7、§15〜16 |
| `docs/growth-plan-ui-options.md` | product requirements | canonical参照から除外。local比較履歴として保持 | `docs/requirements/ui-design-spec.md` §18 |

UI specification内のignored HTML demo参照も正本から除外した。比較資料とHTMLは物理削除せず、TSK-09.1の再判定対象に残す。

## Ignored／untracked Markdown inventory

次の31件は開始時にworking treeへ存在したが、tracked正本とは仮定しなかった。

| Family | Paths | TSK-00.1 decision |
| --- | --- | --- |
| architecture／review | `docs/architecture/data-flow.md`、`docs/chaldea-data-update-review.md`、`docs/game-tool-ui-research.md` | local-only。TSK-09.1で内容監査 |
| current canonical candidates | `docs/requirements/ui-design-spec.md`、`docs/requirements/damage-calculation-review.md` | 内容監査後にtracked昇格 |
| old implementation／quality plans | `docs/implementation-plan.md`、`docs/damage-condition-application-plan.md`、`docs/damage-effect-dependency-plan.md`、`docs/damage-quality-convergence-plan.md`、`docs/demo-feature-restoration-plan.md`、`docs/next-implementer-prompt.md` | local historical。active task ownerにしない |
| UI options | `docs/home-ui-options.md`、`docs/my-chaldea-ui-options.md`、`docs/craft-essence-ui-options.md`、`docs/support-template-ui-options.md`、`docs/growth-plan-ui-options.md` | local decision history。UI正本は`docs/requirements/ui-design-spec.md` |
| reports | `docs/reports/damage-condition-application.md`、`damage-effect-dependency-audit.md`、`damage-effect-execution-e0.md`、`damage-effect-execution-e1.md`、`damage-effect-execution-e2.md`、`damage-effect-execution-e3.md`、`damage-effect-routing-audit.md`、`damage-quality-q0.md`〜`damage-quality-q5.md`、`master-data-2026-08-24.md`、`r1-implementation-status.md` | local evidence candidate 15件。TSK-09.1でcanonical input、digest、commit、後継を監査 |

## Report retention boundary

tracked report 16件は[Evidence report index](README.md)にevidence role、successor、関連commitを記録した。ignored report 15件を含め、TSK-00.1ではreport／archiveを削除・統合していない。intentional damage差分、production inventory、calculator／ranking parity、digestの保持判定はTSK-09.1へ渡す。
