---
title: "FGO Lab document governance contract"
document_version: "1.0.0"
status: "Guideline"
updated_at: "2026-08-30"
---

# FGO Lab document governance contract

本書は、要件の正本をTasksへ複製せず、Task単位で適用条件を閉じるための文書運用契約を定める。product semanticsや受入条件は各requirementsが所有し、TasksはContract IDへの適用判断、検証command、artifact、延期先だけを所有する。

## Contract catalog

| Contract ID | Requirement |
| --- | --- |
| `DOC-REV-001` | Active／Proposedな要件改訂はversion、変更理由、承認状態、影響Task、baselineへの影響を同じ変更で記録する。 |
| `DOC-CLOSE-001` | 未完了TaskはContract closure matrixを持ち、適用、N/A、延期先のいずれかを一意に記録する。 |
| `DOC-LINT-001` | registry version、Task status／依存、Contract ID、closure matrix、evidence登録をcanonical quality pathで静的検証する。 |

## Contract closure matrix

各未完了Taskは次の列を持つmatrixをTask本文へ置く。

| Contract ID | Disposition | Verification command | Artifact |
| --- | --- | --- | --- |
| stable ID | `Apply`、`N/A: <理由>`、`Deferred: <TSK-ID>`のいずれか | 完了判定に使うbounded command。延期時は`-` | tracked evidence pathまたは`Handoff`。延期時は延期先Task |

- `Apply`は検証commandとartifactを必須とする。
- `N/A`は差分または責務境界から適用されない理由を必須とし、未実装や未計測の言い換えに使わない。
- `Deferred`は依存順上の後続Taskだけを指せる。現在TaskのDone gateに必要な契約は延期できない。
- runtime counter導入前のphaseは未計測を明記し、`0`、非増加、passへ読み替えない。
- matrixは要件本文を再定義しない。Contract IDの意味が不足する場合は要件を改訂してからTaskを更新する。

## Phase closureとproject closure

Phase closureは、そのTaskのmatrixで`Apply`とした契約、Done gate、Handoffが閉じた状態を指す。Project closureは全source requirementsのfinal contractが閉じ、延期された契約が0件になった状態を指す。phase完了時にproject全体の完了条件を満たす必要はないが、適用不能な項目を暗黙に省略してはならない。

## Requirement revision

Activeまたはapproval gateを持つ要件を改訂する場合、同じ変更で次を記録する。

1. `document_version`と`updated_at`
2. 変更理由と変更したContract ID
3. `approval: retained | required | approved`と、`approved`の場合の`approved_at`
4. 影響するTaskとclosure matrixの変更
5. baseline／digest／artifact schemaへの影響。影響がなければ理由付きで`none`

承認前の意味論を実装してはならない。誤記、リンク、registryだけの変更で承認を維持する場合も、semantic contractが不変である理由をrevision logへ残す。過去versionを実装後に改変して整合させず、新versionとして影響Taskを明示する。

## Revision log

| Version | Reason／Contract | Approval | Impacted Tasks | Baseline impact |
| --- | --- | --- | --- | --- |
| 1.0.0 | Task closure、要件改訂、docs lintの運用契約を新設（`DOC-REV-001`、`DOC-CLOSE-001`、`DOC-LINT-001`） | approved 2026-08-30 | TSK-02.1以降 | none: product／damage semanticsと計測baselineは変更しない |
