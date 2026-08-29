---
title: "TSK-00.3 ignored documentation disposition"
document_version: "1.2.0"
status: "Complete"
created_at: "2026-08-30"
baseline_head: "256c2d2c"
implementation_task: "docs/tasks/development-redesign-tasks.md TSK-00.3"
---

# TSK-00.3 ignored documentation disposition

## Baseline identity

TSK-00.3開始時のHEADは`256c2d2c`、working treeはcleanだった。`git ls-files -oi --exclude-standard docs`で得たignored資料は29 Markdown＋8 HTMLの37件である。各rowを`path<TAB>bytes<TAB>sha256`としてpath順に連結したinventory digestは`9f7165987e2528ae135194259a721c9768931e27b46d06a107f54ef6b0b79415`である。

## Disposition registry

`Canonical delta`は元資料の無変更昇格を意味しない。現行code／requirements／ADRとの差を抽出してauthorityへ統合する。`Retained evidence`と`Historical decision`はtracked責務directoryへ移し、`Local-only`だけを`.local-docs/docs/`へ内容不変で移す。

| Baseline path | Bytes | SHA-256 | Classification | Destination／reason |
| --- | ---: | --- | --- | --- |
| `docs/architecture/data-flow.md` | 1,623 | `136dbd4effefecbb97c2c3cfa61b26550e038870c1f13f323ac2380d0d485f89` | Canonical delta | current codeとADR-001〜003を基準に依存方向を再記述し、canonical guideへ統合 |
| `docs/chaldea-data-update-review.md` | 8,035 | `5d2575218409b9b2ed4467121ab34228388e89694495ad882e46ca5e8dd1b517` | Historical decision | ADR-003の上流調査・license判断根拠としてarchive保持 |
| `docs/craft-essence-ui-options.md` | 2,011 | `493997d607f1d92017a3c9011b0792540ee4b73d181129dbe630f49be3828342` | Historical decision | UI requirement §17.6〜17.7の比較判断履歴 |
| `docs/craft-essence-ui.html` | 21,545 | `1e5e89eadf5a8b03b9080fdf3b2f12da26a8960abd601fb38f6328447374f596` | Local-only | 仮データを含む静的UI demo |
| `docs/damage-condition-application-plan.md` | 2,627 | `1dea2afc72efb5826cafe83f70fed75040559c9716170f350810a530938c8a1e` | Historical decision | 完了済みschema 9／engine 7移行順の履歴。対応reportをevidence保持 |
| `docs/damage-effect-dependency-plan.md` | 5,117 | `0156680fe87cf68bac29e44f3fa1fd8caafda5196a530d6ac3c06dd9d179cf7d` | Historical decision | 完了済みcontext producer／consumer収束計画 |
| `docs/damage-quality-convergence-plan.md` | 21,668 | `7afdddb8f467d4f05f96cb369883b17922128c347e8fc532e611d18945101a77` | Historical decision | Q0〜Q5.5完了履歴。残存Q6／Q7は現行Tasks TSK-04〜09へ移管済み |
| `docs/demo-feature-restoration-plan.md` | 27,604 | `248d7d95a93b88da024957e2ec29d89fa3eb1e6dc5c5f7b9c8b3321413ebfcd8` | Historical decision | 実装済みvertical sliceとUI判断の旧ledger。現行順序はTasksへ移管済み |
| `docs/game-tool-ui-research.md` | 6,469 | `cb317acc4f9b9a9327c4a61c4109a53d9b7f73c779d1d0160b7e90f4bfbf8728` | Historical decision | UI requirementの視覚方針に至った比較根拠 |
| `docs/growth-plan-ui-comparison.html` | 29,046 | `1956c7da7c846178e0a269829ed360ddc65b856ff2eeffd6ef6c9799ebcf8f60` | Local-only | 仮データを含む静的UI comparison |
| `docs/growth-plan-ui-options.md` | 3,866 | `f97e48bcee851a35816a4ba2f46f2b6b809a192ae661cf413bbd3975e8c98bf8` | Historical decision | UI requirement §18の比較判断履歴 |
| `docs/growth-plan-ui.html` | 21,306 | `930b17434eec78ed73ecf55376d8f5a651ff6f2e07cfb0aab26fb1306130e0eb` | Local-only | 仮データを含む静的UI demo |
| `docs/home-ui-comparison.html` | 46,428 | `0ffcc2526be35bd6a4f90ed8d1e84a7c30d9d39ace8496608c31f3e9760f5cb9` | Local-only | 仮データを含む静的UI comparison |
| `docs/home-ui-options.md` | 5,039 | `95fd9d0cf2b0991959d7c980085a28c71fe407a3f4946ef168f0194a86206669` | Historical decision | UI requirement §19の比較判断履歴 |
| `docs/implementation-plan.md` | 35,816 | `460b54957246ca69664c8a1c385643e4ec692d58693b94c41c079f01248ae7e3` | Historical decision | 旧M0〜M10 ledger。現行実装順序はdevelopment redesign Tasksだけが所有 |
| `docs/my-chaldea-ui-comparison.html` | 70,103 | `8a454871b7f50dee7638671e2cb90e947616a4e45f25067f825bc97fa2f10dbd` | Local-only | 仮データを含む静的UI comparison |
| `docs/my-chaldea-ui-options.md` | 9,961 | `09f61d361e0da9f5dd1d9ac3436fc96c4de620e365aed8f93283c561076023dd` | Historical decision | UI requirement §17の比較判断履歴 |
| `docs/next-implementer-prompt.md` | 17,550 | `0664f36136252842e34a62bf0c4a9fd3ef436f9a41a883e1278ce905be1056d2` | Local-only | pre-implementation時点の作業prompt。現行guide／Tasksを上書きしない |
| `docs/reports/damage-condition-application.md` | 1,644 | `0319340a33ee56c20912cfdfd1e638b7885d01481feab3362f71772cdb3a374f` | Retained evidence | schema 9／engine 7のintentional contract changeと検証記録 |
| `docs/reports/damage-effect-dependency-audit.md` | 4,394 | `430e3eee6ed723ecb099fdf612c673fee45f82caecff90e66827d042c49ca762` | Retained evidence | production 469／420件とunsupported reason familyの推移 |
| `docs/reports/damage-effect-execution-e0.md` | 4,490 | `82b89b6a483c594527a9596b662a4dd929263ceae5d85a9afe8b403329388ff5` | Retained evidence | migration前inventory、UX baseline、baseline commit |
| `docs/reports/damage-effect-execution-e1.md` | 2,619 | `ec2f64de7e79d67ac5e838d96d0348a1ddb8f9bc150ec7f1a66bdc2e09869ba3` | Retained evidence | ordered execution contractとfail-closed判断 |
| `docs/reports/damage-effect-execution-e2.md` | 3,195 | `66267afa215e5901e42934d6c9e0c1d8048ba9d2140839bab5cf0c6ea5ccb069` | Retained evidence | schema 11／engine 8 central switchと検証記録 |
| `docs/reports/damage-effect-execution-e3.md` | 4,643 | `f0494d443d561a81921e1a96b7cb47bc74969f9526650267b74573104d0a1eec` | Retained evidence | 469／420 production audit、17 fail-closed baseline、UX verification |
| `docs/reports/damage-effect-routing-audit.md` | 13,210 | `7e971c1e8fbcf48fe1c5d83cbf2d35fb41edd38910e6b7b4b1f9b926d937230c` | Retained evidence | routing／condition不具合、nested Function inventory、実装結果 |
| `docs/reports/damage-quality-q0.md` | 21,467 | `80d9f5b0af838b6b8d303e17532be1651545c7ea0cd2576dbc3972eb80496f0a` | Retained evidence | raw Function／effect inventoryとQ0 canonical input contract |
| `docs/reports/damage-quality-q1.md` | 4,978 | `a60218bae7d315991bbd70e05cd6a7f4b1a466444202b9428794e3f9682b1a6d` | Retained evidence | schema／master normalization commitsと検証記録 |
| `docs/reports/damage-quality-q2.md` | 5,658 | `60c36b1ef6d09ceebbf11d23e95d71ed45df3b1a0169907150fbf031bfb6239a` | Retained evidence | kernel、golden、benchmark、version差分 |
| `docs/reports/damage-quality-q3.md` | 8,496 | `ea5281fefc69caf0983d53e666d1b5841011b9c080d950493698c7100b8dce5d` | Retained evidence | source統合、全master effect audit、goldenとcommit |
| `docs/reports/damage-quality-q4.md` | 11,343 | `3e2b909da144a024848a759a389f28f6cd675cdb82ed5ab1b3bde242b2797105` | Retained evidence | evidence-based precision、external differential、inventory gate |
| `docs/reports/damage-quality-q5.md` | 10,714 | `9ce26f1950f77382dd6e3cc5ec0f8aa4d4d119f90ea6ab7939a1225f324b109b` | Retained evidence | facade、history／share contract、intentional engine差分 |
| `docs/reports/master-data-2026-08-24.md` | 1,650 | `dd915fae143aa97ce4b29fc562a869cf58b1a1eb22c493947470840decb2c2b5` | Retained evidence | source checksum、artifact digest、469／420 production inventory |
| `docs/reports/r1-implementation-status.md` | 3,600 | `2743d55f3ce11f1aefe5ae1c0fe54439b5e5e59335f802d3723a82f2b3f9f4c5` | Retained evidence | schema 1／engine 1時点のrelease gapとperformance baseline |
| `docs/setup-ui-comparison.html` | 11,346 | `ca5a24422a68e2eefb4cdd029b2efcb9d3d3b3891919d01fe4adc52373bece0a` | Local-only | 仮データを含む静的UI demo |
| `docs/support-template-ui-comparison.html` | 34,564 | `7b6fa7bee7b85074af02961725127d51b4289d5969c997d9d4a57ca2acc14087` | Local-only | 仮データを含む静的UI comparison |
| `docs/support-template-ui-options.md` | 15,037 | `877893617fcb774e50423dc58d1bc18402024ab9caa58c591a8c41ec2c537413` | Historical decision | UI requirement §7、§15〜16の比較判断履歴 |
| `docs/ui-comparison.html` | 93,868 | `df6f97e086474298b8e63cac8a3a21787f63226bf3ef9b5840629716d936e8c9` | Local-only | 仮値を含む入力方式比較demo |

## Audit result

| Classification | Files | Final treatment |
| --- | ---: | --- |
| Canonical delta | 1 | 元snapshotの同一SHAとGit復元情報を`docs/archive/README.md`へ保持し、現行code／ADRに基づく`docs/guides/data-flow.md`へ再構成 |
| Retained evidence | 15 | basenameを保って`docs/evidence/`へtracked昇格し、evidence indexへrole／successor／commitを登録 |
| Historical decision | 12 | TSK-00.3ではbasenameを保ってtracked昇格。TSK-00.4で全文をGit-only化し、`docs/archive/README.md`に現行authority、successor、blob／SHA-256を保持 |
| Local-only | 9 | 相対pathを保って`.local-docs/docs/`へ移動 |

### Canonical delta closure

旧`data-flow.md`のmaster／user／image分離、`ProfileCollection`の所有、書込直列化は現行codeとADR-001〜003に一致した。一方、旧図の`calculation / specialTraits -> calc-core`は、現行の`calculation-application -> battle-execution -> calc-core`とranking workerの共有実行経路を表していなかった。validな不変条件を保持しつつ、raw Atlas解釈境界、transactional execution、calculator／ranking parity、portable data境界をcanonical guideへ統合した。guideのSHA-256は`ae6e8129fed1e34343e2a2315253212c7833d1c0f383f235c5b3a163d7e4096e`である。

UI options 5件の採用判断はUI requirement §7、§15〜19へ既に統合済みだった。旧implementation／quality／restoration planの残存項目はactive Tasks TSK-04〜09とdamage execution requirementへ移管済みで、active実装順序の未移管は0件である。

### Evidence retention closure

15 reportは、intentional schema／engine差分、canonical input、implementation commit、golden／differential、production 469／420 inventory、unsupported ratchet、artifact／source SHA-256、performance baselineのいずれかを持つ。後続reportがある資料も中間差分を復元するsource evidenceとして保持し、damage evidenceの未判定は0件とした。

### Hash and quarantine closure

baseline 37件は、archive 13件（canonical delta元snapshot 1件を含む）、evidence 15件、`.local-docs/docs/` 9件の各destinationで移動前SHA-256と一致した。物理削除は0件である。`.gitignore`は`docs/`を対象にする11規則を削除し、`.local-docs/docs/**`の一規則へ集約した。これにより今後`docs/`へ追加された未登録fileはignoredにならず、Git statusへ現れる。
