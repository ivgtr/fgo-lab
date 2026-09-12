---
title: "FGO Lab 開発プロンプト運用ガイド"
document_version: "1.2.0"
status: "Guideline"
created_at: "2026-08-30"
updated_at: "2026-09-12"
related_documents:
  - "AGENTS.md"
  - "docs/guides/systematic-review-guidelines.md"
  - "docs/requirements/development-execution-efficiency-requirements.md"
---

# FGO Lab 開発プロンプト運用ガイド

本書は依頼を書くときの参考であり、通常作業で毎回読む手順書ではない。
目的、重要な制約、参照する正本、完了条件、必要な停止境界を伝える。
原因・所有層・実装方法が未確定なら、症状と期待結果を示して判断を任せる。
Task IDや長いチェックリストは、小さな依頼の前提にしない。

## 依頼例

小さな修正:

```text
READMEの誤字を修正してください。関連する参照と書式を確認し、既存の無関係な変更は保持してください。
```

調査だけ:

```text
ランキングと計算機でこの入力の結果が異なる原因を調べてください。
現行要件と共通実行経路を根拠に、原因・影響範囲・修正方針を報告してください。今回は実装しないでください。
```

実装まで:

```text
TSK-xxの受入条件を満たすまで実装・検証してください。
正本は既存Taskと参照先の要件・flow noteです。現在の不足を確認し、設計と手順は再判断してください。
通常の技術判断は任せます。未規定の製品判断や依頼外の範囲拡張だけ相談してください。
```

レビュー対応:

```text
提示された指摘を修正し、同じ原因が成立する直接経路と反例を確認して検証まで進めてください。
既存のflow noteとTaskへ差分を更新し、完了済みの検証証拠は条件が変わらなければ再利用してください。
```

明示的な記録・独立承認が必要なレビューでは、そのreview recordと判定者を指定する。
通常の修正依頼に専用review skillや独立承認の工程を追加する必要はない。

## 設計の再判断と継続

同じ原因の再発、個別ID分岐、意味の二重管理、説明できないdamage差分やcandidate増加は、
局所patchを重ねずに所有モデルと反例を見直す根拠になる。
再指摘の回数や複数の設計案だけを理由に、依頼を「調査のみ」へ変更しない。
技術的不確定事項を解消したら、承認済みの実装と検証を続ける。
独立した改善は既存Taskへ短く記録し、元の成果に必要な作業を進める。
製品要件を変える必要がある場合は依存する変更だけを保留する。

## 正本と引継ぎ

- 不変条件・責務: [AGENTS.md](../../AGENTS.md)
- 意味論・構造変更のflow closureとcause analysis: [体系レビューガイド](systematic-review-guidelines.md)の該当節
- 実装順序と現在地: [development redesign Tasks](../tasks/development-redesign-tasks.md)
- command、委譲、session上限とhandoff: [実行効率要件](../requirements/development-execution-efficiency-requirements.md)
- 検証commandとphase gate: [README](../../README.md)

引継ぎは成果・未達条件・変更境界・証拠path・次の操作を正本へ残し、promptではそのpathと今回の差分だけを示す。
全会話、全ログ、flow matrix、完了済み計画を再掲しない。session分割で依頼全体の完了条件を縮めない。

## 参考

[OpenAIの記事](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)を踏まえ、
適用条件と完了条件を残し、固定手順・重複した資料・不要な停止を減らした。
短縮だけでは選択精度や所要時間の改善を証明できない。
