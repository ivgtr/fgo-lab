---
title: "FGO Lab document governance contract"
document_version: "1.0.3"
status: "Guideline"
updated_at: "2026-10-02"
---

# FGO Lab document governance contract

本書は、要件の正本をTasksへ複製せず、Task単位で適用条件を閉じるための文書運用契約を定める。product semanticsや受入条件は各requirementsが所有し、TasksはContract IDへの適用判断、検証command、artifact、延期先だけを所有する。

## Contract catalog

| Contract ID | Requirement |
| --- | --- |
| `DOC-REV-001` | Active／Proposedな要件改訂はversion、変更理由、承認状態、影響Task、baselineへの影響を同じ変更で記録する。 |
| `DOC-CLOSE-001` | 未完了TaskはContract closure matrixを持ち、適用、N/A、延期先のいずれかを一意に記録する。 |
| `DOC-LINT-001` | registry version、Task status／依存、Contract ID、closure matrix、evidence登録、ADR statusをcanonical quality pathで静的検証する。 |

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

## ADR lifecycle

ADRは採用済み判断だけを登録し、statusは`accepted | superseded`に限定する。承認前proposalをADR file／indexへ
`proposed`等の局所statusで登録せず、approval requiredなrequirementsとcanonical flow noteで保持する。判断承認時は、
新ADRを`accepted`で追加し、置換対象ADRを`superseded`へ変更し、相互linkとADR indexを同じcommitで更新する。
`pnpm test:docs`はindexとADR本文のstatus語彙および一致をfail-closedに検証する。

## Revision log

Kind別metadata・case-sensitive status、元statusの意味移管、root入口／規約／symlink aliasの専用契約は[文書整備phase 4.7〜4.8](../tasks/documentation-maintenance-phases.md#47-frontmatter-status-vocabulary)を正本とする。STEP 4で本文・採用判断・承認記録を根拠に明示移管し、STEP 5で既存docs検査へ接続する。ADR本文の採用判断と歴史snapshotを現在値へ書き換えず、machine evidenceのdomain statusへMarkdown語彙を適用しない。移管済みmetadataの存在と、検査器の全件coverage完成を区別する。

DOC-P6の現行実行・完全診断保存・不足時操作は[phase 4.8](../tasks/documentation-maintenance-phases.md#48-kind別metadataとroot契約)を参照する。検査のfield集合は既存metadata契約の型を明示し、未知fieldを捨てて成功にしない。新fieldが必要な場合は意味を所有する正本と検査を同じ変更で更新する。現在参照、歴史citation、literal、期限付きartifactの説明を区別し、失敗時はCLIが示す完全診断のpath／reasonから該当義務を修正する。

| Version | Reason／Contract | Approval | Impacted Tasks | Baseline impact |
| --- | --- | --- | --- | --- |
| 1.0.3 | 承認済みSTEP 5の全tracked登録・構文／metadata検査とCLI診断保存への導線を接続（`DOC-LINT-001`）。未知fieldの扱いと参照分類を明示 | retained: STEP 4の文書契約・ADR lifecycle・product承認は不変。利用者がSTEP 5計画を承認 | TSK-09.1 STEP 5〜6。別checkout受入・全体ApplyはSTEP 6 | none: docs inspectorのみ。damage／baseline／digest／固定evidence schema・quality step／CIは不変 |
| 1.0.0 | Task closure、要件改訂、docs lintの運用契約を新設（`DOC-REV-001`、`DOC-CLOSE-001`、`DOC-LINT-001`） | approved 2026-08-30 | TSK-02.1以降 | none: product／damage semanticsと計測baselineは変更しない |
| 1.0.1 | 既存ADR lifecycleの`accepted | superseded`限定とstatus lintを明文化（`DOC-LINT-001`） | retained: lifecycle semanticsは既存documentation maintenance契約から不変 | TSK-06.1以降 | none: docs validation only |
| 1.0.2 | STEP 4のkind別metadata・元status・root／alias契約の正本と、STEP 5検査実装の境界を接続（`DOC-REV-001`、`DOC-LINT-001`） | approved 2026-10-02: 利用者がSTEP 4計画へOK。ADR lifecycle・product承認は不変 | TSK-09.1 STEP 4〜6。全体Applyの完了はSTEP 6 | none: 文書metadataと案内のみ。damage／baseline／digest／artifact schema・検査実装は不変 |
