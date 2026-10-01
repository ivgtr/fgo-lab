---
title: "TSK-09.1 documentation closure decision ledger"
document_version: "1.3.0"
status: "Active"
created_at: "2026-10-01"
updated_at: "2026-10-01"
baseline_head: "0a787e8efd144242e5858c0e3da8b8ed0a4ab6fe"
implementation_task: "docs/tasks/development-redesign-tasks.md TSK-09.1"
---

# TSK-09.1 documentation closure decision ledger

STEP 1の判定台帳、STEP 2の保存実験、採用した保持範囲を記録する。進捗・依存・次操作は[Tasks](../tasks/development-redesign-tasks.md)が所有する。本書は対象集合、保持する意味、未確定事項の解消ownerを所有し、別計画書へ複製しない。利用者指定によりTSK-09.11の専用baseline・再現fixture移行を最初に実施する。09.11はdone、09.1はready、STEP 2は09.11の成果から再開し、STEP 3〜6とTSK-09は未実施である。以下の全履歴bundle方式・非公開転送・pin前提は初回実験の履歴で、現在の実行順を所有しない。

## 境界と入力の同一性

STEP 1開始HEADは`0a787e8efd144242e5858c0e3da8b8ed0a4ab6fe`、worktreeはclean。先行調査HEAD `1fa4d18f4ed316b95e3da0a952a0b9919a36070a`との変更はTask／registryだけで、先行probeの101 Markdownを現在bytes／SHAと照合したところ同じ2件だけが異なった。98 docs Markdown、44 evidence JSON、補助入口3件の対象集合は同一である。本書追加後はdocs Markdown99件、index表のreport47件、evidence本文50件（index除外）、JSON44件、補助入口3件になる。

正本は[registry](../README.md)、[DOC-P4〜P6とkind語彙](../tasks/documentation-maintenance-phases.md)、[旧inventory](documentation-inventory.md)、[旧disposition](ignored-documentation-disposition.md)、[evidence index](README.md)、[archive index](../archive/README.md)。旧inventoryの56／31やphase planの74／4は当時のbaselineであり、現在件数へ置き換えない。

STEP 1の変更は本書・evidence index・Task／registryの記録のみ。削除・移動、metadataの一括変換、product／docs inspector／machine JSONの変更、artifact保存方式・cleanup・公開、全matrix／audit再生成、commit／pushは実施しない。READMEの文書ゲートを用いる。

## 台帳の読み方と判定規則

- **現行根拠**: 現行のauthority、採用済み不変条件、受入または実consumerの固定入力。過去versionの数値を現HEADの数値と呼ぶ意味ではない。
- **固有履歴**: 当時のinput／rule／差分／inventory／version／commit／棄却案を持つ。Complete／Superseded、後継の存在だけで重複にしない。
- **重複**: 同じ意味・identity・範囲・復元経路を後継で完全に説明できる場合だけ。今回、文書単位の無条件削除候補は0件。局所の途中status記述はSTEP 3の収束対象であり、本文全体の重複判定ではない。
- **要追加確認**: 保持すべき意味は認められるが、導線・現行性・保存寿命・metadata解釈が未確定。U表に担当STEPと必要な証拠を割り当てる。

下表は入力集合の全142件とroot3件を一件ずつ記録する。本書の追加rowはkind＝evidence、owner＝判定根拠、入力＝Markdown＋上記FM、入口＝E、分類＝現行根拠、後継なし（判定台帳のowner）。kind／owner／入力形式は各表の共通契約を継承し、各rowはmetadata、親経路、分類理由、後継を持つ。`FM∅`はfrontmatterなし、`status∅`／`v∅`はfieldなしで、意味の欠落とは判定しない。FMの列はstatus、document_versionとその他の実在key名を記録する。titleは各本文、値・配列・本文の移管元は固定HEADの当該fileで一意に復元できる。未記載の値を推定して補わない。各rowのmetadata／index roleは開始HEADのsnapshotであり、今回更新するregistry／Task／evidence indexの新versionは差分とTask Handoffで追跡する。

参照経路の略記: `D`＝docs/README、`E`＝D→evidence/README、`A`＝D→adr/README、`P`＝E→ranking-policy-candidate-flow-tsk-06、`T`＝D→development-redesign-tasks。root README→D、root AGENTS→D、CLAUDE→AGENTS（symlink）。親pathは相対pathの解決元であり、basenameだけの一致を到達性の証拠にしない。routing noteを除く141対象へ現入口からlocal Markdown linkで到達する候補を再確認した。これはanchor・全Markdown構文を含むDOC-P6検査の成功主張ではない。

## Root／入口／alias

| 対象 | Kind／owner／入力形式 | Metadataと参照経路 | 分類・保持する意味／後継 |
| --- | --- | --- | --- |
| [README.md](../../README.md) | 開発入口／repository運用／Markdown本文 | FM∅。root→D、AGENTS。pnpm command・gate | 現行根拠。開発・文書ゲートの入口。後継なし（この責務のowner） |
| [AGENTS.md](../../AGENTS.md) | 作業規約／repository運用／Markdown本文 | FM∅。D、README、実行効率・体系レビューへのlink | 現行根拠。利用者指示との優先・停止境界。後継なし（規約正本） |
| [CLAUDE.md](../../CLAUDE.md) | alias／AGENTS／Git mode120000 symlink | 内容重複fileではなくlink先`AGENTS.md`。status／versionを二重保有しない | 現行根拠。STEP 5はtracked symlinkと解決先を検査。後継＝AGENTS |

root3件はdocs本文のkind語彙を黙って当てはめない。STEP 5で専用の入口／規約／alias契約を実装し、既存本文にFMを追加するかはSTEP 4で必要性とownerを判断する（U4）。

## Registry／要件／Task／guide／license

Kindは配置とregistry rowが決定する。入力はMarkdown＋存在するFM、ownerはregistry＝navigation、requirement＝受入契約、Task＝順序・進捗、phase plan＝文書処遇規則、guide＝運用／依存方向、license＝provenance。完了したTSK-06.48 planも固有の責務・bounded unit履歴を保持し、Task statusを上書きしない。

| 対象 | Kind／owner | Metadata移管元 | 入口／親 | 分類・根拠・保持する意味 | 後継／未確定owner |
| --- | --- | --- | --- | --- | --- |
| [docs/README.md](../README.md) | registry／navigation | Active; v1.5.186; title,updated_at | root→D | 現行根拠。FGO Lab documentation registry | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/archive/README.md](../archive/README.md) | sub-index／navigation／Git復元 | Active; v1.0.0; title,updated_at | D | 現行根拠。Historical documentation index | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/guides/data-flow.md](../guides/data-flow.md) | guide／運用／依存方向 | Guideline; v1.0.0; title,updated_at,governing_decisions | D | 現行根拠。FGO Lab canonical data flow | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/guides/document-governance.md](../guides/document-governance.md) | guide／運用／依存方向 | Guideline; v1.0.1; title,updated_at | D | 現行根拠。FGO Lab document governance contract | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/guides/prompt-engineering-guidelines.md](../guides/prompt-engineering-guidelines.md) | guide／運用／依存方向 | Guideline; v1.2.0; title,created_at,updated_at,related_documents | D | 現行根拠。FGO Lab 開発プロンプト運用ガイド | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/guides/systematic-review-guidelines.md](../guides/systematic-review-guidelines.md) | guide／運用／依存方向 | Guideline; v1.1.0; title,created_at,updated_at,related_documents | D | 現行根拠。FGO Lab 体系的レビューガイド | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/licenses/data-sources.md](../licenses/data-sources.md) | license registry／provenance | FM∅; 本文 status記述なし; index／採用本文を解釈 | D | 現行根拠。データ出典台帳 | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/requirements/damage-calculation-review.md](../requirements/damage-calculation-review.md) | requirement／受入契約 | Active; v1.0.1; title,created_at,updated_at | D | 現行根拠。FGOダメージ計算 実装調査・検証方針 | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/requirements/damage-effect-execution-requirements.md](../requirements/damage-effect-execution-requirements.md) | requirement／受入契約 | Active; v1.2.4; title,created_at,updated_at,source_requirements,ui_baseline,refactoring_contract | D | 現行根拠。FGO Lab ダメージ効果実行エンジン移行要件 | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/requirements/development-execution-efficiency-requirements.md](../requirements/development-execution-efficiency-requirements.md) | requirement／受入契約 | Active; v1.3.0; title,approved_at,updated_at,implementation_tasks,created_at,related_documents | D | 現行根拠。FGO Lab 開発実行効率要件・統合実装計画 | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/requirements/fgo-lab-requirements-v0.3.md](../requirements/fgo-lab-requirements-v0.3.md) | requirement／受入契約 | Active; v0.3.9; title,approval,approved_at,created_at,updated_at,supersedes,ui_baseline | D | 現行根拠。FGO Lab プロダクト要件定義書 | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/requirements/ranking-self-and-conditional-effects-requirements.md](../requirements/ranking-self-and-conditional-effects-requirements.md) | requirement／受入契約 | Active; v0.10.3; title,approval,approved_at,updated_at,created_at,related_adrs,implementation_tasks | D | 現行根拠。ランキング自己バフ・条件効果統合仕様 | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/requirements/test-strategy-redesign.md](../requirements/test-strategy-redesign.md) | requirement／受入契約 | Active; v1.3.1; title,approved_at,updated_at,created_at,refactoring_contract,calculation_contract,implementation_tasks | D | 現行根拠。FGO Lab テスト戦略 再設計計画・仕様書 | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/requirements/ui-design-spec.md](../requirements/ui-design-spec.md) | requirement／受入契約 | Active; v1.5.1; title,approval,approved_at,updated_at | D | 現行根拠。FGO Lab UI設計仕様 | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/tasks/development-redesign-tasks.md](../tasks/development-redesign-tasks.md) | Tasks／順序・進捗 | Active; v1.7.157; title,created_at,updated_at,source_requirements,source_plans,governance_contract | D | 現行根拠。FGO Lab テスト・ランキング再設計 Tasks | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/tasks/documentation-maintenance-phases.md](../tasks/documentation-maintenance-phases.md) | phase plan／文書処遇規則 | Active; v1.3.2; title,created_at,updated_at,execution_tasks,governing_documents | D | 現行根拠。FGO Lab 文書体系整備 Phase計画 | 後継なし（当該authorityの終端）; metadata要件の追加確認はSTEP 4 |
| [docs/tasks/package-semantic-convergence-tsk-06-48-completion-plan.md](../tasks/package-semantic-convergence-tsk-06-48-completion-plan.md) | task plan／TSK-06.48責務履歴 | Complete; v1.0.4; title,created_at,updated_at,task,parent_plan,baseline_commit | D | 固有履歴。TSK-06.48 bounded completion plan | Tasks TSK-06.48＋各closure; 処遇はSTEP 4 |
| [docs/tasks/package-semantic-convergence-tsk-06-48.md](../tasks/package-semantic-convergence-tsk-06-48.md) | task plan／TSK-06.48責務履歴 | Complete; v1.0.9; title,created_at,updated_at,task,baseline_commit,current_worktree_base,previous_bounded_unit_base | D | 固有履歴。TSK-06.48 パッケージ別semantic complexity convergence計画 | Tasks TSK-06.48＋各closure; 処遇はSTEP 4 |

## ADR（29本文＋index）

Kind＝ADR、owner＝採用時のarchitecture／semantic decision、入力＝Markdownの本文statusまたはFM、A経由。statusの解釈責務はADR index／`validateAdrIndex`が現在持つ。22本文とindexのFM欠落を、採用済み判断の欠落と扱わない。STEP 4はbodyのaccepted／supersededと置換系列を保存してmetadataへ移す。後継なしのaccepted rowは採用判断の終端であり、後継を捏造しない。

| 対象 | Metadata移管元 | 分類・固有の判断 | 後継／入口 |
| --- | --- | --- | --- |
| [docs/adr/001-workspace.md](../adr/001-workspace.md) | FM∅; 本文 superseded | 固有履歴。置換前の採用判断・制約を保持（workspace） | A; ADR-029; U3／STEP 4 |
| [docs/adr/002-local-storage.md](../adr/002-local-storage.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（local-storage） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/003-master-delivery.md](../adr/003-master-delivery.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（master-delivery） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/004-calculation-accuracy.md](../adr/004-calculation-accuracy.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（calculation-accuracy） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/005-data-images.md](../adr/005-data-images.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（data-images） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/006-portable-data.md](../adr/006-portable-data.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（portable-data） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/007-static-routing.md](../adr/007-static-routing.md) | FM∅; 本文 superseded | 固有履歴。置換前の採用判断・制約を保持（static-routing） | A; ADR-029; U3／STEP 4 |
| [docs/adr/008-refactoring-contract.md](../adr/008-refactoring-contract.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（refactoring-contract） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/009-condition-decision-fact-semantics.md](../adr/009-condition-decision-fact-semantics.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（condition-decision-fact-semantics） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/010-effect-occurrence-and-operation-semantics.md](../adr/010-effect-occurrence-and-operation-semantics.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（effect-occurrence-and-operation-semantics） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/011-canonical-effect-execution-semantics.md](../adr/011-canonical-effect-execution-semantics.md) | accepted; v∅; title,date | 現行根拠。採用済み判断・制約を保持（canonical-effect-execution-semantics） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/012-battle-context-and-reference-semantics.md](../adr/012-battle-context-and-reference-semantics.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（battle-context-and-reference-semantics） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/013-effect-context-input-presentation.md](../adr/013-effect-context-input-presentation.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（effect-context-input-presentation） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/014-effect-interaction-and-series-presentation.md](../adr/014-effect-interaction-and-series-presentation.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（effect-interaction-and-series-presentation） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/015-effect-inclusion-activation-and-proc-semantics.md](../adr/015-effect-inclusion-activation-and-proc-semantics.md) | superseded; v∅; title,date | 現行根拠＋固有履歴。selectionは置換済みだがinclusion／activation／condition／presentation契約の参照は本文に明示して継続 | A; ADR-026; U3／STEP 4 |
| [docs/adr/016-ranking-canonical-scenario-and-presentation.md](../adr/016-ranking-canonical-scenario-and-presentation.md) | superseded; v∅; title,date,superseded_by | 固有履歴。置換前の採用判断・制約を保持（ranking-canonical-scenario-and-presentation） | A; ADR-027→ADR-028; U3／STEP 4 |
| [docs/adr/017-canonical-target-context.md](../adr/017-canonical-target-context.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（canonical-target-context） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/018-ranking-comparison-policy.md](../adr/018-ranking-comparison-policy.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（ranking-comparison-policy） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/019-ranking-contribution-and-execution-plan.md](../adr/019-ranking-contribution-and-execution-plan.md) | superseded; v∅; title,date,superseded_by | 固有履歴。置換前の採用判断・制約を保持（ranking-contribution-and-execution-plan） | A; ADR-028; U3／STEP 4 |
| [docs/adr/020-ranking-condition-provenance-and-field-policy.md](../adr/020-ranking-condition-provenance-and-field-policy.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（ranking-condition-provenance-and-field-policy） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/021-canonical-activation-witness.md](../adr/021-canonical-activation-witness.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（canonical-activation-witness） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/022-activation-structure-cleanup.md](../adr/022-activation-structure-cleanup.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（activation-structure-cleanup） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/023-canonical-noble-phantasm-variants.md](../adr/023-canonical-noble-phantasm-variants.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（canonical-noble-phantasm-variants） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/024-pre-noble-phantasm-plans-and-attack-profiles.md](../adr/024-pre-noble-phantasm-plans-and-attack-profiles.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（pre-noble-phantasm-plans-and-attack-profiles） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/025-canonical-target-state-damage-semantics.md](../adr/025-canonical-target-state-damage-semantics.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（canonical-target-state-damage-semantics） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/026-canonical-selection-semantics.md](../adr/026-canonical-selection-semantics.md) | accepted; v∅; title,date | 現行根拠。採用済み判断・制約を保持（canonical-selection-semantics） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/027-portable-calculation-request-and-ranking-presentation.md](../adr/027-portable-calculation-request-and-ranking-presentation.md) | superseded; v∅; title,date,approved_at,supersedes,superseded_by | 固有履歴。置換前の採用判断・制約を保持（portable-calculation-request-and-ranking-presentation） | A; ADR-028; U3／STEP 4 |
| [docs/adr/028-canonical-source-program-and-finite-ranking-domain.md](../adr/028-canonical-source-program-and-finite-ranking-domain.md) | accepted; v∅; title,date,approved_at,amended_at,supersedes | 現行根拠。採用済み判断・制約を保持（canonical-source-program-and-finite-ranking-domain） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/029-next-vercel-routing.md](../adr/029-next-vercel-routing.md) | FM∅; 本文 accepted | 現行根拠。採用済み判断・制約を保持（next-vercel-routing） | A; 後継なし（accepted終端）; U3／STEP 4 |
| [docs/adr/README.md](../adr/README.md) | FM∅; 本文29判断の登録／status | 現行根拠。sub-index／navigation owner | D→A; 後継なし; U3 |

## Evidence Markdown（index＋49本文）

Kind＝evidence（READMEだけsub-index）、owner＝canonical input／rule／検証証跡、入力＝Markdown＋FMまたは本文metadata。後継列は開始HEADのindexが記録した系列であり、それ自体を最新の進捗と認定しない。旧E／Q reportは当時の数値・移行差分・未対応scopeの固有履歴。現行flowは採用した責務の根拠を保持し、本文の古いblocked／途中状態はU2で最新Taskへ接続する。未登録のrouting noteはU1。

| 対象 | Metadata移管元 | 入口／親 | 分類・根拠・保持する意味 | 後継／次owner |
| --- | --- | --- | --- | --- |
| [docs/evidence/README.md](README.md) | Active; v1.4.134; title,updated_at | D | 現行根拠。role／successor／commitのnavigation | 後継なし（sub-index owner） |
| [docs/evidence/activation-structure-cleanup-e4-1.md](activation-structure-cleanup-e4-1.md) | Complete; v∅; title,date | E | 固有履歴。supporting: executable state boundary; index Complete／commit `ded9806` | E4.1系列; STEP 3・4（U2／U3） |
| [docs/evidence/canonical-selection-semantics-tsk-04.md](canonical-selection-semantics-tsk-04.md) | Complete; v∅; title,updated_at | E | 現行根拠。canonical: player choice／stochastic outcome inventory、runtime activation／input recovery、fail-closed、parity、performance; index Complete／commit TSK-04 selection completion | TSK-04〜08; 途中statusはU2、metadataはU3 |
| [docs/evidence/condition-target-provenance-flow-tsk-04.md](condition-target-provenance-flow-tsk-04.md) | Verified; v∅; title,updated_at | E | 現行根拠。canonical: condition／target／recipient／provenance／contribution flow closure; index Complete／commit TSK-04 Phase 1 | TSK-04〜08; 途中statusはU2、metadataはU3 |
| [docs/evidence/damage-condition-application.md](damage-condition-application.md) | FM∅; 本文 status記述なし; index／採用本文を解釈 | E | 固有履歴。supporting: schema 9／engine 7 conditional application change; index Complete／commit `db0bb53` | damage execution requirement; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-dependency-audit.md](damage-effect-dependency-audit.md) | FM∅; 本文 status記述なし; index／採用本文を解釈 | E | 固有履歴。supporting: 469／420 production unsupported baseline; index Superseded／commit `3dd4be9` | E0以降のexecution inventory; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e0.md](damage-effect-execution-e0.md) | Complete; v∅; title,created_at,master_data_version,baseline_commit | E | 固有履歴。supporting: pre-migration inventory／UX baseline; index Superseded／commit `9f7c836` | E1; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e1.md](damage-effect-execution-e1.md) | Complete; v∅; title,created_at,source | E | 固有履歴。supporting: ordered execution contract; index Superseded／commit `1726d7c` | E2; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e2.md](damage-effect-execution-e2.md) | Complete; v∅; title,created_at,schema_version,engine_version,master_data_version | E | 固有履歴。supporting: schema 11／engine 8 central switch; index Superseded／commit `48b69a1` | E3; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e3-10.md](damage-effect-execution-e3-10.md) | FM∅; 本文 status記述なし; index／採用本文を解釈 | E | 固有履歴。canonical: proc semantics; index Complete／commit `ad8187e` | E3.11以降; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e3-11.md](damage-effect-execution-e3-11.md) | FM∅; 本文 status記述なし; index／採用本文を解釈 | E | 固有履歴。canonical: attacker control ownership; index Complete／commit `e9d1c1a` | E3.12; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e3-12.md](damage-effect-execution-e3-12.md) | FM∅; 本文 status記述なし; index／採用本文を解釈 | E | 固有履歴。canonical: chained activation; index Complete／commit `4fc7e59` | E4; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e3-2.md](damage-effect-execution-e3-2.md) | Complete - Awaiting User UX Confirmation; v∅; title,created_at,schema_version,engine_version,master_data_version | E | 固有履歴。supporting: condition／decision／fact redesign; index Complete／commit `1bd28ce` | E3.3以降; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e3-3.md](damage-effect-execution-e3-3.md) | Complete - Review Findings Corrected; v∅; title,created_at,schema_version,engine_version,master_data_version | E | 固有履歴。supporting: unified constraint validation; index Complete／commit `9387f66` | E3.4以降; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e3-4.md](damage-effect-execution-e3-4.md) | Complete; v∅; title,created_at,schema_version,engine_version,master_data_version | E | 固有履歴。canonical: unsupported semantics inventory; index Complete／commit `8730c91` | E3.8; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e3-8.md](damage-effect-execution-e3-8.md) | FM∅; 本文 status記述なし; index／採用本文を解釈 | E | 固有履歴。canonical: implementation-unsupported 0; index Complete／commit `1b8c260` | E3.9以降; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e3-9.md](damage-effect-execution-e3-9.md) | FM∅; 本文 status記述なし; index／採用本文を解釈 | E | 固有履歴。canonical: HP threshold series; index Complete／commit `3cd068e` | E3.10以降; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e3.md](damage-effect-execution-e3.md) | Complete - Awaiting User UX Confirmation; v∅; title,created_at,schema_version,engine_version,master_data_version | E | 固有履歴。canonical: 469／420 production audit and 17-case ratchet; index Superseded／commit `40b577c` | E3.2以降; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e4-1-2.md](damage-effect-execution-e4-1-2.md) | Superseded by E4.1.3 activation witness closure; v∅; title,date | E | 固有履歴。supporting: condition provenance; index Superseded／commit `d1f375a` | E4.1.3; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e4-1-3.md](damage-effect-execution-e4-1-3.md) | Complete; v∅; title,date | E | 固有履歴。canonical: activation witness closure; index Complete／commit `cbc600c` | E4.1.4; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e4-1-4.md](damage-effect-execution-e4-1-4.md) | Complete; v∅; title,date | E | 固有履歴。canonical: activation witness deduplication; index Complete／commit `59d0bc7` | E4.1.5; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e4-1-5.md](damage-effect-execution-e4-1-5.md) | FM∅; 本文 status記述なし; index／採用本文を解釈 | E | 固有履歴。canonical: activation facts; index Complete／commit `66bc848` | TSK-03／08 inventory; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e4-1-attack-profiles.md](damage-effect-execution-e4-1-attack-profiles.md) | FM∅; 本文 status記述なし; index／採用本文を解釈 | E | 固有履歴。canonical: AttackProfile inventory／digest; index Complete／commit `9314a1d` | TSK-03／04／08; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e4-1.md](damage-effect-execution-e4-1.md) | Complete; v∅; title,date | E | 固有履歴。canonical: NP variant inventory; index Complete／commit `49bb6db` | E4.1 follow-ups; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-execution-e4.md](damage-effect-execution-e4.md) | Complete; v∅; title,date | E | 固有履歴。canonical: ranking integration、parity、digest; index Complete／commit `b861241` | E4.1系列; STEP 3・4（U2／U3） |
| [docs/evidence/damage-effect-routing-audit.md](damage-effect-routing-audit.md) | FM∅; 本文 実装完了・確認待ち | E | 固有履歴。supporting: actor routing／condition audit and implementation result; index Complete／commit `7735d2e` | ordered execution E0以降; STEP 3・4（U2／U3） |
| [docs/evidence/damage-quality-q0.md](damage-quality-q0.md) | FM∅; 本文 approved | E | 固有履歴。canonical: raw Function／effect inventory and target contracts; index Complete／commit `31131c5` | Q1; STEP 3・4（U2／U3） |
| [docs/evidence/damage-quality-q1.md](damage-quality-q1.md) | FM∅; 本文 complete | E | 固有履歴。supporting: normalization／fail-closed migration; index Complete／commit `74d08f9` | Q2; STEP 3・4（U2／U3） |
| [docs/evidence/damage-quality-q2.md](damage-quality-q2.md) | FM∅; 本文 complete | E | 固有履歴。canonical: kernel golden／benchmark baseline; index Complete／commit `d225296` | Q3; STEP 3・4（U2／U3） |
| [docs/evidence/damage-quality-q3.md](damage-quality-q3.md) | FM∅; 本文 complete | E | 固有履歴。supporting: all-source resolution and production effect audit; index Complete／commit `a463934` | Q4; STEP 3・4（U2／U3） |
| [docs/evidence/damage-quality-q4.md](damage-quality-q4.md) | FM∅; 本文 complete | E | 固有履歴。canonical: evidence precision and external differential; index Complete／commit `eaed00b` | Q5; STEP 3・4（U2／U3） |
| [docs/evidence/damage-quality-q5.md](damage-quality-q5.md) | FM∅; 本文 完了（確認待ち） | E | 固有履歴。supporting: scenario facade／history／share convergence; index Complete／commit `7331082` | execution E0以降; STEP 3・4（U2／U3） |
| [docs/evidence/documentation-inventory.md](documentation-inventory.md) | Complete; v1.0.0; title,created_at,baseline_head,implementation_task | E | 固有履歴。当時の移行・検証記録 | Task／現行要件; STEP 3・4（U2／U3） |
| [docs/evidence/e2e-responsibility-flow-tsk-06-2.md](e2e-responsibility-flow-tsk-06-2.md) | Complete; v∅; title,updated_at | E | 現行根拠。canonical: E2E assertion ownership、browser-specific inventory、VRT／a11y、before／after 3-run、worker採否; index Complete／commit TSK-06.2 completion | TSK-06.2〜09; 途中statusはU2、metadataはU3 |
| [docs/evidence/ignored-documentation-disposition.md](ignored-documentation-disposition.md) | Complete; v1.2.0; title,created_at,baseline_head,implementation_task | E | 固有履歴。当時の移行・検証記録 | Task／現行要件; STEP 3・4（U2／U3） |
| [docs/evidence/legacy-runtime-removal-tsk-04.md](legacy-runtime-removal-tsk-04.md) | Verified; v∅; title,updated_at | E | 現行根拠。canonical: old schema reader／raw fallback／dual runtime branch removal; index Complete／commit TSK-04 Phase 3 | TSK-04〜08; 途中statusはU2、metadataはU3 |
| [docs/evidence/master-data-2026-08-24.md](master-data-2026-08-24.md) | FM∅; 本文 status記述なし; index／採用本文を解釈 | E | 固有履歴。canonical: source checksums、artifact digest、469／420 inventory; index Superseded／commit `1276757` | later production inventory reports; STEP 3・4（U2／U3） |
| [docs/evidence/np-resource-semantics-flow-tsk-04.md](np-resource-semantics-flow-tsk-04.md) | Verified; v∅; title,updated_at | E | 現行根拠。canonical: NP capacity／requirement／gain-loss／all-consume／base OC; index Complete／commit TSK-04 Phase 2 | TSK-04〜08; 途中statusはU2、metadataはU3 |
| [docs/evidence/portable-calculation-identity-flow-tsk-06-1.md](portable-calculation-identity-flow-tsk-06-1.md) | Active; v∅; title,updated_at | E | 現行根拠。canonical: discriminated portable identity／persistence／recovery／exact-subject reset; TSK-06.41 Blocking 0; index Active／commit TSK-06.41 completion | TSK-06.1〜08; 途中statusはU2、metadataはU3 |
| [docs/evidence/r1-implementation-status.md](r1-implementation-status.md) | FM∅; 本文 status記述なし; index／採用本文を解釈 | E | 固有履歴。supporting: schema 1／engine 1 release and performance baseline; index Superseded／commit `8022775` | damage quality Q0以降; STEP 3・4（U2／U3） |
| [docs/evidence/ranking-policy-candidate-flow-tsk-06.md](ranking-policy-candidate-flow-tsk-06.md) | Active; v∅; title,updated_at | E | 現行根拠。canonical: source program／finite certificate／application policy／outcome。TSK-06.45 U0〜U5、TSK-06.46 W0〜W7、TSK-06.47 UI bounded unit、TSK-06.5 production eligibility／maximum closureを保持。機械証跡は[TSK-06.5 production closure](tsk-06-5-production-closure.json)ほか各bounded unitへリンクする; index Active／commit TSK-06.5 done、TSK-06.47／06.48 done | TSK-06〜08; 途中statusはU2、metadataはU3 |
| [docs/evidence/ranking-web-worker-cutover-tsk-07.md](ranking-web-worker-cutover-tsk-07.md) | Complete; v∅; title,updated_at | E | 現行根拠。canonical: five-item cutover、scenario/version-preserving reset、five-outcome Web表示、handoff／cache／responsive closure; index Complete／commit TSK-07 integrated closure／no new commit | TSK-07; 途中statusはU2、metadataはU3 |
| [docs/evidence/resolved-attacker-level-stat-flow-tsk-06-46.md](resolved-attacker-level-stat-flow-tsk-06-46.md) | Complete; v∅; title,updated_at | E | 現行根拠。canonical: resolved servant／level ATK join、numeric-zero fallback removal、calculator／ranking／portable recovery。path名は旧Task番号を保持; index Active／commit TSK-06.42 Step 1 planning | TSK-06.411、06.42〜08; 途中statusはU2、metadataはU3 |
| [docs/evidence/servant-build-record-identity-flow-tsk-06-47.md](servant-build-record-identity-flow-tsk-06-47.md) | Complete; v∅; title,updated_at | E | 現行根拠。canonical: build／target map key and embedded servant identity coherence、profile persistence／recovery fail-closed。path名は旧Task番号を保持; index Complete／commit `911753c`／TSK-06.412 completion | TSK-06.412、06.42〜08; 途中statusはU2、metadataはU3 |
| [docs/evidence/shared-production-audit-tsk-03.md](shared-production-audit-tsk-03.md) | Complete; v1.0.2; title,created_at,updated_at,baseline_commit,implementation_task | E | 固有履歴。canonical: shared production inventory／digest／measured exact counter ratchet／performance; index Complete／commit `07b63c0`／`10c5af3`／`a06532a`／TSK-03 completion | TSK-04〜09; STEP 3・4（U2／U3） |
| [docs/evidence/test-observability-flow-tsk-06-3.md](test-observability-flow-tsk-06-3.md) | Complete; v∅; title,updated_at | E | 現行根拠。canonical: quality parent／child outcome、exact browser infrastructure identity、artifact／CI recovery flow; index Complete／commit TSK-06.3 follow-up completion | TSK-06.3〜09; 途中statusはU2、metadataはU3 |
| [docs/evidence/test-ranking-baseline-tsk-00.md](test-ranking-baseline-tsk-00.md) | Complete; v1.4.0; title,created_at,updated_at,baseline_commit,implementation_task | E | 固有履歴。canonical: test／CI／ranking／performance baseline; index Complete／commit TSK-00 completion | TSK-01〜09; STEP 3・4（U2／U3） |
| [docs/evidence/test-suite-quality-gate-tsk-02.md](test-suite-quality-gate-tsk-02.md) | Complete; v1.0.2; title,created_at,updated_at,baseline_commit,implementation_task | E | 現行根拠。canonical: Suite classification／quality gate／performance／artifact; index Complete／commit TSK-02 completion | TSK-03〜09; 途中statusはU2、metadataはU3 |
| [docs/evidence/transactional-preparation-flow-tsk-05.md](transactional-preparation-flow-tsk-05.md) | Complete; v∅; title,updated_at | E | 現行根拠。canonical: ordered condition／choice／NP resource／state／form／variant action transaction、typed outcome、full recovery; index Complete／commit `69f8207e` baseline／second review resolution | TSK-05〜08; 途中statusはU2、metadataはU3 |
| [docs/evidence/web-routing-flow-next-migration.md](web-routing-flow-next-migration.md) | Implementation; v∅; title,created_at,updated_at | 登録経路なし（U1）; Tの調査言及のみ | 要追加確認。route／master validation receipt／固有性能測定とVerified flow | ADR-029／data-flow／UI contract。測定履歴を代替する後継なし; U1 |

後継欄のE／Q番号は上表の同名phase reportへのaliasである。`系列`／`以降`／`later`など一件に定まらない元index記述は確定後継ではなくU2の照合対象とする。元の固有履歴を完全に置換する後継がない場合は当該fileを意味の保持先とし、現行ruleは要件／ADR、最新受入はFへ参照する。

上表の旧index role `canonical`は当該phaseの一次証跡を表す。過去E3.10のproc判断や旧schemaのinventoryを現契約へ適用する許可ではない。現行ruleは要件／採用済みADR、現行受入はTSK-08 finalAcceptanceが所有する。本文statusがない18 evidenceにも、結果節、version／commit、採用判断があるため一括Complete化しない。

## Machine evidence JSON（44件）

Kind＝machine evidence、owner＝rowのTaskが採用したaudit／差分／検証。入力は各既存JSON schemaであり、Markdown status vocabularyの対象ではない。以下のstatusはdomain値の原文を保持する。JSONのkey／pointerをmetadata移管元とし、status欠落をMarkdownへ変換して埋めない。JSONを読むproduct testは変更しない。

| 対象 | Owner | 入力metadata／保持pointer | 入口／親 | 分類・意味／後継 |
| --- | --- | --- | --- | --- |
| [docs/evidence/oc-execution-diff-tsk-06-48.json](oc-execution-diff-tsk-06-48.json) | TSK-06.44 | status=verified; baselineCommit=c555e4ff9a208f8da01e56130fbd49e63848e192; schemaVersion=38; engineVersion=33.0.0; masterDataVersion=20260906.03; root pointers baselineCommit,masterDataVersion,masterSha256,schemaVersion,engineVersion,rules,calculatorInputChanges,rankingInputChanges,rawDigests,ocFamilyInventory,np5BaselineCutover,verificationHead,performance,qualityGate | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/ranking-adverse-action-diff-tsk-06-41.json](ranking-adverse-action-diff-tsk-06-41.json) | TSK-06.41 | ; root pointers  | E | 固有履歴。machine-readable: full 433-profile join with 348 direct result changes＋85 rank-only changes; inputs／actions／resources／NP1〜5 damage／ranks／reasons。後継＝TSK-06.41〜06.5 |
| [docs/evidence/tsk-06-45-attack-buff-count-delta.json](tsk-06-45-attack-buff-count-delta.json) | TSK-06.45 | baselineCommit=ab5d77d; root pointers baselineCommit | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-attack-buff-count-final.json](tsk-06-45-attack-buff-count-final.json) | TSK-06.45 | head=83b4db2eed9520e38749f11f7196be263ca8880f; root pointers masterHash,versions | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-bp-delta.json](tsk-06-45-bp-delta.json) | TSK-06.45 | baselineCommit=0d279c04345b21a296bd3c7340931420be721110; root pointers baselineCommit,damage,candidateDelta,markerAndHpBaseline | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-bp-performance.json](tsk-06-45-bp-performance.json) | TSK-06.45 | ; root pointers baseline,delta,candidateDelta,productionAndQuality | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-bp-source.json](tsk-06-45-bp-source.json) | TSK-06.45 | baseCommit=0d279c04345b21a296bd3c7340931420be721110; referenceCommit=9fa75655c07ecd76168b1ccf5b8232e8d64664cf; root pointers sources,adoptedContract,sharedInventory,master | P | 固有履歴。採用source／governing rule。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-bp-validation.json](tsk-06-45-bp-validation.json) | TSK-06.45 | status=complete within the BP vertical scope; no blocking remains; baseCommit=0d279c04345b21a296bd3c7340931420be721110; root pointers scope,quality,blockingWithinScope,remainingOutsideScope | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-count-execution-delta.json](tsk-06-45-count-execution-delta.json) | TSK-06.45 | baselineCommit=07ddfe1; root pointers baselineCommit | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-hp-delta.json](tsk-06-45-hp-delta.json) | TSK-06.45 | baselineCommit=645a3ee852e2bb383068c350d3d5c4d29f74f0cd; root pointers baselineCommit,governingRules | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-hp-observation-gates.json](tsk-06-45-hp-observation-gates.json) | TSK-06.45 | status=implementedAndVerifiedAgainstReference; root pointers inputs,sourcesChecked | P | 固有履歴。採用source／governing rule。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-hp-performance.json](tsk-06-45-hp-performance.json) | TSK-06.45 | head=9a866b7b7b2b506e49b64a32dbc9f6f852ca95db; root pointers masterHash,versions,baseline | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-hp-source.json](tsk-06-45-hp-source.json) | TSK-06.45 | baseCommit=645a3ee; referenceCommit=9fa75655c07ecd76168b1ccf5b8232e8d64664cf; root pointers constantSource,contracts,inventory,selectedRawSources | P | 固有履歴。採用source／governing rule。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-hp-validation.json](tsk-06-45-hp-validation.json) | TSK-06.45 | status=completeWithinHpScope; baseCommit=645a3ee; root pointers scope,baselineEvidence,quality,flowClosure,remainingOutsideScope,blockingWithinScope,sourceConditionBoundary,sharedSupportInventory | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-marker-delta.json](tsk-06-45-marker-delta.json) | TSK-06.45 | baselineCommit=538b83a; root pointers baselineCommit,finalQuality | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-marker-performance.json](tsk-06-45-marker-performance.json) | TSK-06.45 | head=538b83a0fc2d7cb1f166d61bdeb28984197fe6b2; root pointers masterHash,versions,baseline,deltaMs,deltaPercent,quality | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-marker-source.json](tsk-06-45-marker-source.json) | TSK-06.45 | baseCommit=538b83a; referenceCommit=9fa75655c07ecd76168b1ccf5b8232e8d64664cf; root pointers masterHash,contracts,sharedInventory | P | 固有履歴。採用source／governing rule。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-marker-validation.json](tsk-06-45-marker-validation.json) | TSK-06.45 | status=completeWithinIndependentMarkerScope; baseCommit=538b83a; root pointers scope,source,damageRules,remainingGate,taskRemaining,qualityAttempts,quality,closure | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-np-count-source.json](tsk-06-45-np-count-source.json) | TSK-06.45 | ; root pointers adoptedContract,adoptionSources | P | 固有履歴。採用source／governing rule。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-np-transfer-delta.json](tsk-06-45-np-transfer-delta.json) | TSK-06.45 | baselineCommit=b1759b7; root pointers baselineCommit | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-np-transfer-performance.json](tsk-06-45-np-transfer-performance.json) | TSK-06.45 | head=b1759b7437908412e40c5ab8eccc624c9640b978; root pointers masterHash,versions,baseline | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-np-transfer-source.json](tsk-06-45-np-transfer-source.json) | TSK-06.45 | commit=9fa75655c07ecd76168b1ccf5b8232e8d64664cf; root pointers inventory | P | 固有履歴。採用source／governing rule。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-np-transfer-validation.json](tsk-06-45-np-transfer-validation.json) | TSK-06.45 | status=complete within NP/charge transfer scope; TSK-06.45 remains in_progress; baseCommit=b1759b7437908412e40c5ab8eccc624c9640b978; root pointers scope,baselineEvidence,referenceContract,remaining,sourceJoin,flowClosure,positiveInputAndPortableRepair,quality | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-population-count-delta.json](tsk-06-45-population-count-delta.json) | TSK-06.45 | baselineCommit=0cf5a36; root pointers baselineCommit,damageInterpretation | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-population-count-performance.json](tsk-06-45-population-count-performance.json) | TSK-06.45 | head=0cf5a367d4d0cb786140ce257f0af36d8a4db2a0; root pointers masterHash,versions,baseline | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-population-count-validation.json](tsk-06-45-population-count-validation.json) | TSK-06.45 | baseCommit=0cf5a367d4d0cb786140ce257f0af36d8a4db2a0; root pointers scope,baseline,quality,versions,masterSha256,performance,scopedBlocking,verification | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-production-closure.json](tsk-06-45-production-closure.json) | TSK-06.45 | status=verified; root pointers baseline,versions,damageDelta,performance,focusedVerification,qualityGate,closure | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-resource-before.json](tsk-06-45-resource-before.json) | TSK-06.45 | head=07ddfe1aa8e427c513542b52c6a0fa3add8f784b; root pointers masterHash,versions | P | 固有履歴。採用source／governing rule。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-45-resource-final.json](tsk-06-45-resource-final.json) | TSK-06.45 | head=07ddfe1aa8e427c513542b52c6a0fa3add8f784b; root pointers masterHash,versions | P | 固有履歴。採用source／governing rule。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-46-production-closure.json](tsk-06-46-production-closure.json) | TSK-06.46 | status=done; root pointers baseline,performanceObservation,versions,focusedVerification,qualityGate,closure | P | 固有履歴。before／after damage・候補・性能・検証のscope別記録。後継＝TSK-06.5 sourceとTSK-08のF（元差分／scopeは置換しない） |
| [docs/evidence/tsk-06-47-contribution-ui-closure.json](tsk-06-47-contribution-ui-closure.json) | TSK-06.47 | status=complete; root pointers baseline,verification | E | 固有履歴。machine-readable: logical effect group／per-contribution policy decisions／typed presentation labels／responsive and keyboard evidence／detail cache reuse／quality gate。後継＝TSK-06.47 |
| [docs/evidence/tsk-06-48-battle-execution-closure.json](tsk-06-48-battle-execution-closure.json) | TSK-06.48 | status=bounded_unit_complete; root pointers baseline,sourceDiff,canonicalContract,semanticInventory,verification,performanceObservation,remainingUnits | E | 固有履歴。canonical: TSK-06.48 battle-execution operation compiler／ordered preparation／resource read／rollback owner audit、direct consumer parity、reused production closure。後継＝TSK-06.48 final closure |
| [docs/evidence/tsk-06-48-calculation-application-closure.json](tsk-06-48-calculation-application-closure.json) | TSK-06.48 | status=complete; root pointers baseline,sourceChange,canonicalContract,semanticInventory,verification,performanceObservation,qualityGate,remainingUnits | E | 固有履歴。canonical: TSK-06.48 scenario intent／canonical input、ranking static source inventory、world observation、candidate equivalence／representative／dedupe／cardinality／cap、common execution parity、reused production closure、final quality。後継＝TSK-06.48 complete |
| [docs/evidence/tsk-06-48-effect-execution-closure.json](tsk-06-48-effect-execution-closure.json) | TSK-06.48 | status=bounded_unit_complete; root pointers baseline,canonicalContract,semanticInventory,verification,performanceObservation,remainingUnits | E | 固有履歴。canonical: TSK-06.48 effect composition／execution support owner、canonical operation／input／support preservation、direct consumer order／condition／parity、reused production closure。後継＝TSK-06.48 final closure |
| [docs/evidence/tsk-06-48-population-closure.json](tsk-06-48-population-closure.json) | TSK-06.48 | status=bounded_unit_complete; root pointers baseline,verification,remainingUnits | E | 固有履歴。canonical: TSK-06.48 population-function／trait catalogとpopulation-count selector／live-read／candidate ownership、production record parity、candidate inventory。後継＝TSK-06.48 final closure |
| [docs/evidence/tsk-06-48-transfer-hp-closure.json](tsk-06-48-transfer-hp-closure.json) | TSK-06.48 | status=bounded_unit_complete; root pointers baseline,canonicalContract,verification,performanceObservation,remainingUnits | E | 固有履歴。canonical: TSK-06.48 dependent-function descriptor、NP／HP transfer domain ownership、ordered execution preservation、production matrix／candidate inventory／parity。後継＝TSK-06.48 final closure |
| [docs/evidence/tsk-06-5-production-closure.json](tsk-06-5-production-closure.json) | TSK-06.5 | status=complete; root pointers baseline,performance,verification | E | 現行根拠。static／candidate／matrix source、固定canonicalRecords。後継なし（実consumer入力）; A0／STEP 2 |
| [docs/evidence/tsk-07-cache-closure.json](tsk-07-cache-closure.json) | TSK-07 | status=complete; root pointers baseline,cacheContract,verification | E | 固有履歴。machine-readable: RK-CACHE-001 summary value／lifetime／cardinality、worker detail 0、React active detail 1、fingerprint／request stale rejection、focused／direct-consumer／E2E evidence。後継＝TSK-07 |
| [docs/evidence/tsk-07-notice-reset-closure.json](tsk-07-notice-reset-closure.json) | TSK-07 | status=complete; root pointers baseline,verification | E | 固有履歴。machine-readable: two-axis ranking notice／calculator handoff parity、scenario/version-preserving intent-only reset、failure retention、workspace stale-publication rejection。後継＝TSK-07 |
| [docs/evidence/tsk-07-outcome-closure.json](tsk-07-outcome-closure.json) | TSK-07 | status=complete; root pointers baseline,verification | E | 固有履歴。machine-readable: five typed outcome presentation、numeric-row boundary、exact AttackProfile normal-calculator recovery、typed invalid reset/reload、unsupported／policy-unavailable non-recovery、focused consumer checks。後継＝TSK-07 |
| [docs/evidence/tsk-07-responsive-accessibility-closure.json](tsk-07-responsive-accessibility-closure.json) | TSK-07 | status=complete; root pointers baseline,verification,performance | E | 固有履歴。machine-readable: desktop／390px／320px responsive containment、accessible names／roles／keyboard／focus、five-outcome recovery presentation、stale/cache identity preservation、integrated quality evidence。後継＝TSK-07 |
| [docs/evidence/tsk-08-parity-diagnostics.json](tsk-08-parity-diagnostics.json) | TSK-08 | status=bounded-unit-complete; root pointers baseline,diagnosticContract,verification | E | 固有履歴。共有boundary／診断設計、当時のclosure。後継＝TSK-08 ratchetのF; U2 |
| [docs/evidence/tsk-08-parity-ratchet.json](tsk-08-parity-ratchet.json) | TSK-08 | status=done; root pointers baseline,canonicalSource,verification,postNpBeforeDamageValueReadCheckpoint,postInertClosureClaimReviewCheckpoint,remainingWorkSummary,approvedClosureImplementation,step4AuditIntegrityAndDigestDiagnostics,serializedGateClosure | E | 現行根拠。最終受入＋固有checkpoint履歴。最終pointer＝F（後述）。後継なし（受入owner）; index途中statusはU2 |
| [docs/evidence/tsk-08-shared-audit-model.json](tsk-08-shared-audit-model.json) | TSK-08 | status=bounded-unit-complete; root pointers baseline,canonicalSource,verification | E | 固有履歴。共有boundary／診断設計、当時のclosure。後継＝TSK-08 ratchetのF; U2 |

## Damage根拠と実consumer

`F`＝`docs/evidence/tsk-08-parity-ratchet.json::implementationSelfReview.nonfiniteBodyReview.repairPlan.finalAcceptance`。製品受入commitは`959f89e`、検証manifestのHEADは`6de5e17`＋当時のdirty source。現開始HEADでF.sourceIdentity.finalSourceの10 source SHAが10/10一致することを再確認した。F以外のroot／boundedUnitsの古いstatusは固有履歴であり、現Task進捗にしない。

| 保持する意味 | 正本／入力形式 | 生成・利用・検査経路／扱い |
| --- | --- | --- |
| damage input・順序・governing rule | damage calculation review、damage execution requirements、ranking requirements、ADR-004／011／024／028、`packages/calculation-application/src/evidence.ts`、golden6 JSON | pipelineがraw解釈、application／executionが入力と順序、calc-coreが式。`evidenceInventory.test.ts`がrequired subjectsとcase IDを照合。reportの当時の変更理由は固有履歴として併存 |
| 小さいsemantic fixture | `packages/test-fixtures/golden/{np-damage-v1,np-functions-v1,ordered-effect-execution-v1,master-normalization-v1,mlb-only-effects-v1,external-differentials-v1}.json` | calculation-application/srcから`../../test-fixtures`の相対参照経由。tracked原本でfresh checkoutから参照可能。caseId、canonical input、expected damageを保持。再生成しない |
| published input／version | `apps/web/public/master/{manifest,master}.json`、`packages/schema/src/index.ts` | master version `20260920.3`、master SHA `2d9f1b19ed40452fda3571932ee1e37bf9fe85fdfa903404c853d7cde269e46a`。current scenario schema41／engine48.0.0。historical reportのschema／engineをこれに書換えない。raw再取得・normalizeは本STEP外 |
| inventory／digest／固定expected | `tsk-06-5-production-closure.json::{staticSemantics,admission,candidateEligibility,productionMatrix}` | `master-data/productionAudit.ts::createTsk065ProductionAuditSource`は既採用sourceを検証・投影し、新しいinventoryを生成しない。両package productionAudit.test／matrix CLIが同じ入力を使用 |
| canonical body・条件ごとのinput／records | 09.11専用baselineの固定manifest、80 condition gzip（A0原manifest＋本文は移管原証拠） | `audit-oc-matrix.ts`→8 shard、`merge-oc-matrix.ts`→`verifyProductionMatrixRecords`。固定manifest bytes／SHA、source identity、80件のcoverage／receipt、body／summary／matrixを受け入れ、代替expectedを生成しない |
| 最新matrix・parity・支持範囲 | F.normalMatrix／F.obligationClosure、各record／diagnostic | 80条件×433 profiles＝34,640 outcomes、calculated34,600／policy unavailable40、parity34,600／failure0、generated988,570。digest `04415e8ab05dfcb5afa58210176357fb095e0b5faeed2aa4815273b00be68fc4`。TSK-06.5の元inventoryと区別。全再計算なし |
| 六失敗クラス・七宣言・raw履歴 | `approvedClosureImplementation.classJoin.finalFailureProbes`、同finalAcceptance、serializedGateClosure、F | parity／unsupported／invalid／partialCommit／inertControl／staleMutationの実行faultと破損saved readerを混同しない。raw OC167／632 cells、公開join、歴史9digest、native/reject/rollback/explicit repairの成立範囲を保存 |
| 最終qualityと検証commit | F.quality、F.sourceIdentity、source-identity／reconciliation JSON | unit1588／production157／E2E29、warnings／retry／unexpected console0。F.receiptReconciliationは4604宣言照合成功。本STEPはsource同一性とmanifestを再確認し、大容量本文の再hashやquality再実行はしない |

## 必須artifactと保存判断の有限集合

次のA集合は**必須の意味・直接入力**である。STEP 1はこれを支える実在artifactの保護集合Kを固定し、STEP 2が保存先・保持期間・最小実体・重複の扱い・復元prototypeを決める。Kの全raw fileをGitへ保存すべきだとは判定していない。

| ID | Kind／owner／入力形式・metadata | 必須の実体と参照経路 | 分類・保持する意味／後継・担当 |
| --- | --- | --- | --- |
| A0 | canonical expected／TSK-06.5 source＋matrix reader／JSON manifest＋condition body | `.test-results/tsk-08-final-acceptance-20260930/performance-canonical/baseline-1-matrix/manifest.json`→productionArtifacts.conditionRecords80件 | 現行根拠。manifest394462 bytes／SHA `879af462bd3209ffaf18365a25598bbcf07e008b6164991d65355ad55cb1a95a`、body宣言計462712642 bytes。manifest一致と80件存在を再確認。後継なし（固定expected）。全本文hashはFの照合を条件付き再利用。STEP 2／TSK-09実caller |
| A1 | 正式before／after性能とdamage比較／TSK-08／matrix・shard・receipt JSON、log | approvedClosureImplementation.finalAcceptanceのformalRuns／matrixReferences／protectedRecords、performance-canonical保存manifest | 固有履歴。正式3＋3、候補／damage／環境／script hashを保持。Fのfresh3runとは別条件。F.performanceが参照する根拠であり数値だけへの置換不可。STEP 2 |
| A2 | 六失敗クラス／transaction・parity・control owner／runner manifest、raw capture、failure JSON、stdout／stderr | classJoin.finalFailureProbes6件→各artifacts。原診断と独立manifest bytes／SHA | 現行根拠＋固有履歴。意図した非zero／typed理由と実faultを保存。後継Fは成立範囲を再利用し元captureを代替しない。STEP 2 |
| A3 | 元primitive／published proof／TSK-08 shared audit／inventory・paths JSON＋独立disk receipt | approvedClosureImplementation.finalAcceptanceのprimitiveInventory／publicProofs／independentHpDiskReceipts5件 | 現行根拠。runner宣言と独立disk receiptを区別、HP／OC／give／七宣言のschema-legal／published／native／recoveryを保存。件数への置換不可。STEP 2 |
| A4 | saved-reader構造・gate反例／matrix acceptance owner／probe registry＋raw8shard＋condition＋log | serializedGateClosure.finalAcceptance→`.test-results/tsk-08-gate-closure-20261001/probe-results.json`41件と完全診断、retainedProof | 現行根拠＋固有履歴。元偽成功／generic失敗も保持。破損入力をnormal gameplayと扱わない。STEP 2 |
| A5 | nonfinite writer／reader・latest normal／productionAuditValue等／JSON＋raw text | F.realCaller（reader5、writer1024）、F.normalMatrix3run×80＋8shard、merge-after3run、source-identity・audit-reachability・reconciliation | 現行根拠。value domain／first leaf path／原入力／全issue、before comparison／digest／writeの拒否を保存。後継なし（最終受入）。STEP 2 |
| A6 | 適用auditの条件付き再利用／登録audit owner／runner manifestとartifact | `.test-results/2026-09-30T17-32-03-143Z-15-fa5942/manifest.json`、F.registeredAuditReuse.proof | 現行根拠。88tests、登録5file→不変10functionの到達証明。current cleanupの削除候補。単なるaudit成功文字列へ代替不可。STEP 2、pin運用はTSK-09 |
| A7 | 最終qualityと失敗帰属／quality runner／親子manifest・各receipt・log・browser artifact | F.quality→`.test-results/2026-10-01T06-40-04-438Z-16-7a153c/manifest.json`、unit／production／playwright子run。earlierAttemptも保持 | 現行根拠＋固有履歴。成功manifest287630 bytes／SHA `87a76cf851e0aa141800c7383ed00030d899ec1dcc67ffcc85f1ba91f6ddc53a`、633 declarations／2333025843 logical bytes。5s timeout失敗を成功へ上書きしない。STEP 2 |
| A8 | 歴史画像／E4 report／PNG＋Git object metadata | E4の消えたchromium画像3件。下記Git復元表 | 固有履歴。当時の画像を別baselineの現mobile画像で置換しない。STEP 3 |
| A9 | 判定・検証probe／本STEP／JSON inventory・membership・log＋receipt | `.test-results/tsk-09-1-step1-20261001/`と先行probe。持続する結論は本書／Taskへ記録 | 固有履歴。probe自体は長期正本でなく、Kの唯一の定義にも使わない。STEP 2で必要な補助結果の保持を判断 |

Kの定義は開始HEADの上記A0〜A7から次の規則で得る（A8／tracked golden／masterは別集合）。**seedの実pathは後の全件表へ固定**する。

1. F、approvedClosureImplementation.finalAcceptance、classJoin.finalFailureProbes、serializedGateClosure.finalAcceptanceにある実file参照、A0固定manifestとA4 probe-resultsをseedとする。
2. seedおよびそこから辿るmanifest／reconciliation／probe-resultsのrepository-relative `.test-results/` file参照を加える。本文説明、directory名、数値・code snippetはfile参照としない。
3. manifest top-levelのartifacts／productionArtifacts.conditionRecords、shardInputs／conditionInputs／rawConditionInputs／artifactVerificationのverified receipt、reconciliationのabsolute artifactReceipts／manifestReceiptsとownReceiptsを加える。receiptはpath／bytes／SHAを組として保持する。
4. quality親のchildrenは`children.<suite>.manifest`のdirnameを子artifactの基準にする。コピーされたshard本文やquality summaryにある相対宣言を、そのコピーの保存directoryへ再解決しない。破損入力に含まれる宣言と実verified receiptも別の証拠として保持する。
5. 同じ規則で増えるmanifest参照を有限固定点まで辿る。large condition本文は読まず、そこから参照集合を拡張しない。未知形式／未解決参照は成功へ補完せずU5へ送る。

STEP 1のK（K₀）は8972 distinct paths、manifest／shard manifest 513、bytes／SHA宣言を持つdistinct paths 8876。宣言logical bytesのpath単位合計は41461988557（hardlink／共有内容の重複を含む。disk量ではない）。存在欠落0、宣言file size差0。本文hash全照合は再実行していない。nested receiptの責務を区別して列挙したもので、repository全artifactの無条件保持ではない。

意図的な反例として`tsk-08-gate-closure-20261001/raw-shard-json/manifest-shard-7.json`は不正JSON原文であり、通常schemaのmanifestへ変換しない。`actual-receipt-mismatch/naturalLimit-included-baseline-np5-oc1.json`は壊した宣言SHAと観測SHAが異なる。これは元反例の意味であり、receiptを一つのSHAへ正規化しない（U5）。

### K seed全件（入力集合の固定）

以下は全seed。kind／owner／分類／解釈責務はA表とdirnameの所属を継承する。各fileのbytes／SHAの所在は、その受入pointerとmanifest／reconciliation receipt。`receipt／元本文`は本STEPで新しいhash値を作らず元metadataを保持することを表す。保存先は全件ignored localで、fresh checkoutからの入手・復元契約は未成立。STEP 2が担当し、現在の存在をGit／CIの保存証拠へ読み替えない。

| Seed path | 入力形式／現在bytes | 固定identityの所在 |
| --- | --- | --- |
| `.test-results/2026-09-30T02-41-45-811Z-2-20d7d6/production-hp-operation-evidence.json` | json／3745283 | 受入pointer／元本文metadata（U5） |
| `.test-results/2026-09-30T02-41-45-811Z-2-20d7d6/production-hp-published-dependency.json` | json／13843717 | 受入pointer／元本文metadata（U5） |
| `.test-results/2026-09-30T09-52-17-936Z-17-081333/manifest.json` | json／259369 | SHA `dc3639df72f32c4788a7bd09f3d23433319759988b82bc023251ddc9255b15f6` |
| `.test-results/2026-09-30T10-09-17-834Z-19-3c35ee/manifest.json` | json／3761 | SHA `7888b99be42289d9e10c41e1359d66cd0cd15c0c9eeb5ccc0e3fd7e5081b60e9` |
| `.test-results/2026-09-30T10-09-21-104Z-105-515a39/manifest.json` | json／5304 | SHA `742c2c6250542a9d56fb398aea96019da62b0bd72a22ce6aea7e2d24436b3d39` |
| `.test-results/2026-09-30T10-09-24-744Z-191-9d9b54/manifest.json` | json／5304 | SHA `a81a066425d47bce4890e5262d13512f33babde1d6179c2ae8b03967bdaa4adf` |
| `.test-results/2026-09-30T10-09-28-140Z-277-0b4339/manifest.json` | json／5304 | SHA `70b5c7cf4258c5a4c059f2cf395a2d21cd6e26bbefa4108022be0abec186d4e4` |
| `.test-results/2026-09-30T10-09-31-657Z-363-6ab213/manifest.json` | json／5304 | SHA `cece785061e27f20c784fe989a16ff14db1efabf77aa9f8d16c953c838da9b0a` |
| `.test-results/2026-09-30T10-09-35-160Z-449-b4c62c/manifest.json` | json／6508 | SHA `14783608a707ea2d2f302ea58b7126be7854015fc61fabb6aee47b5b54a1413e` |
| `.test-results/2026-09-30T10-12-04-316Z-535-914653/manifest.json` | json／24528 | SHA `5f089b71d88e98d5e3987a6bc0a826376c452d31a98b9522df3f122f39891499` |
| `.test-results/2026-09-30T10-12-04-316Z-535-914653/production-hp-operation-evidence.json` | json／3745283 | bytes／SHA receipt |
| `.test-results/2026-09-30T10-12-04-316Z-535-914653/production-hp-published-dependency.json` | json／13843717 | bytes／SHA receipt |
| `.test-results/2026-09-30T10-17-22-002Z-16-d2d261/manifest.json` | json／272499 | SHA `b2005ad413a30c061fae936f4eedcc16342d3cf5ef061b1345de03f972120264` |
| `.test-results/2026-09-30T10-26-25-346Z-15-4af76b/manifest.json` | json／3336 | SHA `050b7113cd7787ac2a562bd609faa279588d42f9b153fb6bfc2dd86188d3d65a` |
| `.test-results/2026-09-30T10-27-19-669Z-15-a66591/hp-calculator-paths.json` | json／76442496 | 受入pointer／元本文metadata（U5） |
| `.test-results/2026-09-30T10-27-19-669Z-15-a66591/hp-cell-inventory.json` | json／15858817 | 受入pointer／元本文metadata（U5） |
| `.test-results/2026-09-30T10-27-19-669Z-15-a66591/hp-craft-essence-paths.json` | json／2633580 | 受入pointer／元本文metadata（U5） |
| `.test-results/2026-09-30T10-27-19-669Z-15-a66591/hp-ranking-paths.json` | json／454523 | 受入pointer／元本文metadata（U5） |
| `.test-results/2026-09-30T10-27-19-669Z-15-a66591/hp-support-paths.json` | json／1201235 | 受入pointer／元本文metadata（U5） |
| `.test-results/2026-09-30T10-27-19-669Z-15-a66591/manifest.json` | json／3923 | SHA `905eba01d637aa9d30a9eb47f5977b1c949bdcee7f2ddf2c8c7ac72c237ba2ea` |
| `.test-results/2026-09-30T10-28-44-838Z-16-86ccc0/manifest.json` | json／285884 | SHA `66558345a33b86be5f7a2d1e299307faa3a916a6b387d61aa2f7bed388b4ed78` |
| `.test-results/2026-09-30T10-28-44-838Z-16-86ccc0/playwright/manifest.json` | json／92380 | SHA `8f6e14e2b84631ed43fcb04c119f4c332a989139177b4d6f3bea0f7928147304` |
| `.test-results/2026-09-30T10-28-44-838Z-16-86ccc0/production/hp-calculator-paths.json` | json／76442496 | bytes／SHA receipt |
| `.test-results/2026-09-30T10-28-44-838Z-16-86ccc0/production/hp-cell-inventory.json` | json／15858817 | bytes／SHA receipt |
| `.test-results/2026-09-30T10-28-44-838Z-16-86ccc0/production/hp-craft-essence-paths.json` | json／2633580 | bytes／SHA receipt |
| `.test-results/2026-09-30T10-28-44-838Z-16-86ccc0/production/hp-proof-coverage.json` | json／1688747 | bytes／SHA receipt |
| `.test-results/2026-09-30T10-28-44-838Z-16-86ccc0/production/hp-ranking-paths.json` | json／454523 | bytes／SHA receipt |
| `.test-results/2026-09-30T10-28-44-838Z-16-86ccc0/production/hp-support-paths.json` | json／1201235 | bytes／SHA receipt |
| `.test-results/2026-09-30T10-28-44-838Z-16-86ccc0/production/manifest.json` | json／7111 | SHA `06eddf0101d1ff11bbcb6045a406256b8621662877c74541e69c889e2baa4e95` |
| `.test-results/2026-09-30T10-28-44-838Z-16-86ccc0/steps/runner.stdout.log` | log／5289 | bytes／SHA receipt |
| `.test-results/2026-09-30T10-28-44-838Z-16-86ccc0/unit/hp-execution-class-witnesses.json` | json／1760095 | bytes／SHA receipt |
| `.test-results/2026-09-30T10-28-44-838Z-16-86ccc0/unit/hp-oc-rate-live-reads.json` | json／2190565 | bytes／SHA receipt |
| `.test-results/2026-09-30T10-28-44-838Z-16-86ccc0/unit/hp-recovery-command-edges.json` | json／16364 | bytes／SHA receipt |
| `.test-results/2026-09-30T10-28-44-838Z-16-86ccc0/unit/manifest.json` | json／133346 | SHA `c8737b1505c0600d8095b0d964299238c66ddda74256f48d943d79c0feedc2a2` |
| `.test-results/2026-09-30T17-32-03-143Z-15-fa5942/manifest.json` | json／24527 | SHA `5937f086ac5b21c53d224c6f17a007afd6f3990e2cd1f6c9b4dd2f4023c931b4` |
| `.test-results/2026-10-01T01-13-10-089Z-15-cc2d68/manifest.json` | json／287630 | SHA `9277ef4c06099da8a1f6483312318ac67e2a37f878d15fac9175ab85fd1a4b82` |
| `.test-results/2026-10-01T06-04-24-870Z-46-821a73/manifest.json` | json／4811 | SHA `5c100a011d4412668fd35da42b7d351ded0820567302d951a8dd376ee4edd614` |
| `.test-results/2026-10-01T06-28-09-516Z-41-1c89de/manifest.json` | json／261115 | SHA `f66f32e6c70149a8ce058d216a9b0dfc2d3ad94d2d739c49d2ec034c24ba8766` |
| `.test-results/2026-10-01T06-40-04-438Z-16-7a153c/manifest.json` | json／287630 | SHA `87a76cf851e0aa141800c7383ed00030d899ec1dcc67ffcc85f1ba91f6ddc53a` |
| `.test-results/tsk-08-final-acceptance-20260930/final-docs.stderr.log` | log／81 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/final-docs.stdout.log` | log／527 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/final-reconciliation.json` | json／620020 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/historical/baseline.json` | json／11582 | bytes／SHA receipt |
| `.test-results/tsk-08-final-acceptance-20260930/performance-canonical/baseline-1-matrix/manifest.json` | json／394462 | SHA `879af462bd3209ffaf18365a25598bbcf07e008b6164991d65355ad55cb1a95a` |
| `.test-results/tsk-08-final-acceptance-20260930/performance-canonical/baseline-1-ranking.json` | json／1483 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/performance-canonical/baseline-2-matrix/manifest.json` | json／394483 | SHA `c0622470fa3ca89b1781f9c47fd4e8e935337f3cec135b4de6c491ab9505ef54` |
| `.test-results/tsk-08-final-acceptance-20260930/performance-canonical/baseline-2-ranking.json` | json／1506 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/performance-canonical/baseline-3-matrix/manifest.json` | json／394468 | SHA `52c41526c36c73d7ec6a1ba26ead075635e29395a1281621dead9855efe5110a` |
| `.test-results/tsk-08-final-acceptance-20260930/performance-canonical/baseline-3-ranking.json` | json／1497 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/inertControl.stderr.log` | log／127 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/inertControl.stdout.log` | log／2331 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/invalid.stderr.log` | log／137 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/invalid.stdout.log` | log／1788 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/parity.stderr.log` | log／120 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/parity.stdout.log` | log／1882 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/partialCommit.stderr.log` | log／137 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/partialCommit.stdout.log` | log／1079 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/performance-canonical/candidate-1-matrix/manifest.json` | json／395187 | SHA `d78449fabdaf43a916e0d8ea5b2e65b10bb0c7349e52aac0e7863d10b38611d3` |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/performance-canonical/candidate-1-ranking.json` | json／1492 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/performance-canonical/candidate-2-matrix/manifest.json` | json／395200 | SHA `26c729951e41afdada22ff7a68b24d1c0b6c1a3c97089bf62462d9f00261452c` |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/performance-canonical/candidate-2-ranking.json` | json／1504 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/performance-canonical/candidate-3-matrix/manifest.json` | json／395180 | SHA `a537a6597c85e78d66349081cbacadfa6d7178d83589bfb7bc25782fa9e1c7e7` |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/performance-canonical/candidate-3-ranking.json` | json／1505 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/six-class-probes.json` | json／10593 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/staleMutation.stderr.log` | log／137 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/staleMutation.stdout.log` | log／1525 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/unsupported.stderr.log` | log／137 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-final-acceptance-20260930/structural-final/unsupported.stdout.log` | log／1804 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-gate-closure-20261001/documentation-receipts.json` | json／1088 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-gate-closure-20261001/final-reconciliation.json` | json／223607 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-gate-closure-20261001/probe-results.json` | json／603728 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-nonfinite-closure-20261001/audit-reachability.json` | json／3632 | bytes／SHA receipt |
| `.test-results/tsk-08-nonfinite-closure-20261001/candidate-1-matrix/manifest.json` | json／899601 | SHA `5fad8733a2edaf37d479456409157d9e764f718f19e4565c34d70cb78acd5e3d` |
| `.test-results/tsk-08-nonfinite-closure-20261001/candidate-2-matrix/manifest.json` | json／899631 | SHA `bbc01d31e73b57e77886261e0231b01a1d3eaffc776e9b03df35f600d16cd0b2` |
| `.test-results/tsk-08-nonfinite-closure-20261001/candidate-3-matrix/manifest.json` | json／899569 | SHA `137c57af6a0cc4cafe23c61da75e6c352c908373c677ef426fc20bd2a1536965` |
| `.test-results/tsk-08-nonfinite-closure-20261001/documentation-receipts.json` | json／2122 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-nonfinite-closure-20261001/merge-after-1/manifest.json` | json／891328 | SHA `74405c54c1bf922fad3f5d78d135a374ccb89d96be2776f95fad9af6dcc66cba` |
| `.test-results/tsk-08-nonfinite-closure-20261001/merge-after-2/manifest.json` | json／891328 | SHA `74405c54c1bf922fad3f5d78d135a374ccb89d96be2776f95fad9af6dcc66cba` |
| `.test-results/tsk-08-nonfinite-closure-20261001/merge-after-3/manifest.json` | json／891328 | SHA `74405c54c1bf922fad3f5d78d135a374ccb89d96be2776f95fad9af6dcc66cba` |
| `.test-results/tsk-08-nonfinite-closure-20261001/producer-performance.json` | json／8154 | bytes／SHA receipt |
| `.test-results/tsk-08-nonfinite-closure-20261001/quality-timeout-attribution.json` | json／1589 | bytes／SHA receipt |
| `.test-results/tsk-08-nonfinite-closure-20261001/reader-expected-overflow/manifest.json` | json／103739942 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-nonfinite-closure-20261001/reader-nullable-object/manifest.json` | json／103739901 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-nonfinite-closure-20261001/reader-overflow/manifest.json` | json／103739959 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-nonfinite-closure-20261001/reader-signed-zero/manifest.json` | json／103739805 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-nonfinite-closure-20261001/reader-summary/manifest.json` | json／103739523 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-nonfinite-closure-20261001/reconciliation.json` | json／25845 | 受入pointer／元本文metadata（U5） |
| `.test-results/tsk-08-nonfinite-closure-20261001/source-identity.json` | json／4195 | bytes／SHA receipt |
| `.test-results/tsk-08-nonfinite-closure-20261001/writer-fault/manifest-shard-0.json` | json／294701 | SHA `25a72d0d54f8ba989e7740d309edb5b32fc8b724a6b6cfeb1ddef6db1bad5165` |

### Archive／quarantine／歴史画像

既存Git-only18 snapshotはarchive indexが一件ずつkind＝Historical、旧本文status、decision chain、successor、source commit／blob／SHAを所有する。全18件のsource commitのblobと本文SHAを再照合し一致。本文の履歴を重複とは判定せず、既存Git-only処遇をSTEP 4へ継承する。Git objectがlocalにあることとshallow checkoutでの復元可否は別で、STEP 6でsource history取得条件を確認する。

quarantine9件はkind＝Local-only comparison／prompt、owner＝旧UI調査／旧作業指示、入力＝HTML8＋Markdown1、metadata＝[disposition](ignored-documentation-disposition.md)のoriginal path／bytes／SHA／理由、参照＝旧inventory→disposition。本STEPでも全9件存在・元SHA一致。canonical evidenceではなく、固有のローカル比較履歴として分類する。採用判断の後継はUI contract、作業promptの後継はTask／prompt guide。仮data付きdemoの実体を置換する後継は不要で、fresh checkoutの必須入力にしない。移動・削除しない。

| 歴史画像（kind＝PNG、owner＝E4 UX evidence、参照＝E→E4 report） | 復元source commit／blob | Bytes／SHA-256・後続STEP |
| --- | --- | --- |
| `e2e/ranking-baseline.spec.ts-snapshots/ranking-390px-chromium-linux.png` | `6d7608caf16fa8e677509ee5c0ae0ba3044ac700`／`95b9402f881404fd0432bb5e84d10f4e7236f502` | 57957／`f9dacecf89385ec609e8d36ea6391bb2b3b12316d53a7518fd9b3bf137675291`; 固有履歴、後継なし（元画像の同一復元）、STEP 3 |
| `e2e/ranking-baseline.spec.ts-snapshots/ranking-320px-chromium-linux.png` | `6d7608caf16fa8e677509ee5c0ae0ba3044ac700`／`26f525580a814ede3df40140ee87280167100297` | 40246／`7ed21de737a2271f853574d75288dd1608b9568a9e619aeeb01f4db399479f76`; 固有履歴、後継なし（元画像の同一復元）、STEP 3 |
| `e2e/ranking-baseline.spec.ts-snapshots/ranking-row-320px-chromium-linux.png` | `6d7608caf16fa8e677509ee5c0ae0ba3044ac700`／`6424b7308b66ea5b86df301927aad46b81db685f` | 4533／`e2b2a1d21aa871d9d4b232d1653d43a9d26d328ee53ae4e7d241bc6375d738c9`; 固有履歴、後継なし（元画像の同一復元）、STEP 3 |

## Metadataの意味と未確定事項

docs MarkdownのFM／status欠落42件（ADR本文22＋index1、evidence18、license1）と語彙外8件を現在集合で再確認した。語彙外の原値は上の各rowに保持した。`Complete - Awaiting User UX Confirmation`2件、`Complete - Review Findings Corrected`1件、`Superseded by E4.1.3 activation witness closure`1件、`Verified`3件、`Implementation`1件。残るapproval／UX確認とphaseの完了、flow検証と文書statusを別の意味として扱う。文書version欠落や追加必須fieldはSTEP 4でkindの契約から確認し、暗黙の既定値を追加しない。

| ID | 未確定事項／保持する意味 | 解消owner | 必要な証拠・次の操作 |
| --- | --- | --- | --- |
| U1 | routing noteのindex導線と現在のrole。本文はVerified flow／固有性能を持ち、Tの調査言及だけでは登録経路としない | STEP 3 | ADR-029／現在guide／UI契約と本文のrule・測定を対応付け、適切な親またはindexへ登録。元測定に後継がない理由とversion／commit範囲を残す |
| U2 | 古いindex status／phase checkpointと最終受入の区別。TSK-08 root doneだがindexは途中in_progress説明を保持、flowのTSK-07 blocked等は履歴 | STEP 3 | F／Taskの現在statusへ参照を結び、元checkpoint・固有deltaを残す。resolved-attacker flowのFM Complete／index Active等のrole差を判断し、単純な最終Complete置換をしない |
| U3 | 42欠落／8語彙外、kind別必須metadataの移管。採用判断・当時のUX確認・Verifiedの意味 | STEP 4→STEP 5 | 本台帳の各移管元本文・ADR status／index／承認記録を照合し、意味の保持先を確定してから明示metadataへ移す。licenseのprovenance／ADR本文を現行化しない。negative fixtureで未知値・欠落を拒否 |
| U4 | root入口・AGENTS・CLAUDE aliasの検査契約と全Markdown構文 | STEP 4（必要metadata判断）→STEP 5 | symlinkとtracked解決先、reference-style／anchor／HTML／code fence、kind責務のfixtures。Task区間parserのUTC timestamp／最終区間不具合、bounded大量errorを既存ownerで修正。本STEPでinspectorを直さない |
| U5 | 09.11の移管・検証能力はVerified。全参照復元集合Kと必要な保持を分離し、A0〜A9の移管先・期間・限界を本書の現行保持表へ記録した。元不正JSON／SHA不一致は保持 | TSK-09.11 done→09.1 STEP 2（文書処遇は未実行） | 現行期待値1セットの全意味値・inventory／digest一致、六失敗クラスと受入反例、判断記録への移管、固有根拠のretain理由を確認。Kの復元成功を検証上の最小性の証明にしない |
| U6 | 09.11の元run禁止受入はVerified。repositoryのbaseline・fixtureだけから取得／実mergeでき、不足時は固定identityの再取得・typed拒否。調査artifactは期限付きで恒久baselineと分離 | TSK-09.11 done→09.1 STEP 2・6（契約／導線は未実行）、project closureはTSK-09 | baseline／fixture／記録の固定identity・入手・不足時拒否を接続し、元runなしの実consumerで確認。完全logは既存policyで保持し、全履歴bundleの非公開保管やpin機能を方式として必須にしない。rawの参照期間と再利用の限界を明示し、cleanupは実行しない |
| U7 | 歴史画像3linkとGit-only18snapshotのfresh復元条件 | STEP 3（画像）／STEP 4（既存処遇継承）／STEP 6（checkout受入） | 上のcommit／blob／SHAとarchive indexから同一byteへ到達させる。shallow cloneは必要historyを明示取得し、現mobile画像への代入をしない |

未確定事項はSTEP 1の分類・集合確定を妨げないが、TSK-09.1の全体Done gateを未達にする。処遇や保存検証の成功を先取りしない。

## STEP 1検証と次操作

今回の局所照合は、tracked対象142＋root3、先行probe差分2文書、source10/10、expected manifest bytes／SHA・80file存在、quality manifest SHA／metadata、quarantine9/9、archive18/18、歴史画像3blobである。artifact全本文の再hash、production matrix／audit／qualityの再実行、fresh restoreは行わず、Fのreceipt照合・受入を上記source同一性の条件で再利用した。

補助probe／完全log／receiptは`.test-results/tsk-09-1-step1-20261001/manifest.json`へ記録する。初回inventory commandは環境保護hookで拒否され未実行。明示tracked Markdown／JSON集合とprotected path拒否を持つprobeへ限定し、秘密値は参照していない。artifact列挙で観測された不正JSONはA4の破損反例として原文を保持し、検証成功へ変換していない。

文書ゲートは`pnpm test:docs`6/6・docs integrity成功、対象4文書のPrettierと差分検査も成功した。参照／対象全件の局所照合と最終receiptはTask Handoffから辿れる。本書はSTEP 1の対象／判定の正本であり、DOC-P4〜P6の完了宣言ではない。次はSTEP 2でA0〜A7とK、保存寿命の衝突、U5／U6を入力に保存・復元単位を決定する。STEP 3以降、TSK-09はこのsessionでは開始しない。


## STEP 2: 保存・復元prototypeと未達条件

**当時の判定: local検証成立、STEP 2未完了。** 利用者は保存方式の説明後に「今回はlocal検証まで行い、STEP 2を未完了で引き継ぐ」と指定した。当時の非公開保管方式とその未達・次操作は以下に履歴として保持する。現在はTSK-09.11の移行を最初に行い、同じbyte復元を再実行したり保管先選びから再開したりしない。原証跡を公開Git／リリース成果物へ収録せず、bundle転送・物理削除・cleanupも実施していない。

### 入力照合と保存集合の修正

開始HEADは`0a787e8efd144242e5858c0e3da8b8ed0a4ab6fe`。STEP 1の4文書は未commitで、tracked差分3件とuntracked台帳1件を保持して開始した。開始時のbytes／SHA・worktreeは`.test-results/tsk-09-1-step2-20261001/start-input.json`。STEP 1 membershipの固定SHAは`a123c81e04f30c561699e98c9c6eac26c7643b0f112ac5d1d9b170b0ab3fb753`、TSK-06.5 sourceは`82ea687c74f9868ea3804435a1b583f4ad6f85b79af428a2c3850dfb5ffa45f9`、TSK-08 sourceは`bdb8ca0aae586ed52356a4a589b32239232561d2becf12539e1d6f03aac0a329`。製品source／machine evidence／CI／runnerを変更していないため、STEP 1のsource同一性、TSK-08のdamage／性能／audit／quality証拠は同じ有効範囲で継承する。

STEP 1のKを**K₀**と呼ぶ。K₀の全8,972 pathを保存・復元した後、直接receipt ownerを使った参照検査で620 distinct target／2,220参照が保存集合外と判明した。原因は、reconciliation top-level `verified`の相対receiptを展開していないことと、20 MBを超えるfailure manifestの参照展開を省いたこと。前者の正常`after-1〜3` manifestからさらに264 pathへ到達した。大きなcondition本文からは参照集合を増やさず、manifestのreceiptだけを解釈する。

**K₁＝K₀＋884 path＝9,856 path**は当時の全参照復元対象集合である。既存seedの参照をすべて復元する範囲を固定したもので、将来の検証に必要な最小保持集合であることは未確認だった。以前の「最小保存集合」という評価は、参照closureと検証目的の最小性を混同していたため訂正する。新規対象は同じA0〜A7 seedの依存closureであり、repository全artifactへの拡張ではない。追加path全件・owner／pointer／base／targetは`membership-delta.json`、K₁全件は`membership-k1.json`とbundle内`membership.json`に固定する。元STEP 1 membershipとseed89件は変更せず、seedの追加もない。schema不正原文・宣言SHAと観測SHAを含む元manifestを再保存／正規化していない。

| 集合／尺度 | 確認値 | 意味 |
| --- | ---: | --- |
| K₀宣言logical bytes | 41,461,988,557 | STEP 1の8,876宣言pathの合計。disk量でも必要保存容量でもない |
| K₀観測logical bytes | 42,130,288,513 | manifest等も含む8,972 pathの元bytes合計 |
| K₁宣言logical bytes | 45,169,922,280 | 9,760宣言path。元の破損宣言を保持 |
| K₁観測logical bytes | 45,838,222,236 | 9,856 path、manifest名のJSON585件を含む。元pathを全復元する際のfile bytes |
| 同一観測SHAを共有した実体 | 2,015 object／9,046,896,940 bytes | 内容identityだけを共有。path／run／成功・失敗／正式性能・最新normalのidentityは統合しない |
| gzip object合計 | 479,113,045 bytes | 原文をgzip level6で圧縮した実測保存bytes |
| bundle全file bytes／disk割当 | 485,542,196／490,434,560 bytes | index2,927,670＋membership3,501,481＋objects。後者は今回の`du -s -B1`であり他環境のdisk量を保証しない |

### 保存方式と反証

| 方式 | 容量・入手・寿命の判定 | 採否 |
| --- | --- | --- |
| 元ignored local directory／最新10run保持 | 元bytesは存在するが別環境の入手元にならず、cleanupにpinがない。再利用auditは削除候補。STEP 2 directoryはtimestamp正規表現の対象外だが、一般の削除・端末障害への保持契約ではない | 長期保存の完了証拠には採用しない。cleanupは実行しない |
| Gitによる原file復元 | 現在のGitには必須ignored原fileがない。K₁全pathを無条件追加すると約45.8 GBのlogical入力を持ち込む | 不採用 |
| Gitによる圧縮・共有bundle復元 | 実測約486 MBのfile集合まで縮小できるが、既存Git objectはloose213.02 MiB／pack19.57 MiBであり相応の履歴増加になる。公開履歴に原log・環境情報を残す方針は利用者のリリース方針と合わない | bundleのGit収録は行わない。容量だけをGit不適の根拠にしない |
| 現行CI artifact | upload設定は14日。現local証跡に対応するCI run id／download成功は確認していない。14日経過後も固定expectedが生きるため寿命を保証できない | 不採用。期限の短い転送用途と長期保管を区別する |
| 固定SHAを持つ非公開保管bundle | K₁全coverageと原bytesを約486 MBで渡せる。元directoryがなくても復元できる。別環境の場所・権限・保持ownerは別途必要 | 技術方式として採用、現時点は許可済みlocal prototypeのみ。実入手元の契約は未成立 |

原logにセンシティブ情報が含まれないとの判定は行っていない。リリース成果物／公開Gitから除外することと、検証用の非公開証跡を完全廃棄することは別の操作である。公開用の加工版を将来作る場合も原bytes／SHAを保持する必須証跡の代わりにはしない。完全廃棄は固定consumerの代替・参照移管と明示承認を要し、今回の保存prototypeでは行わない。

### 保存対象・期間・取得／不足時の責務

以下は必要な保持期間の契約条件であり、未確定の保管先でその期間が既に保証されたとの主張ではない。A0〜A7を支える最小byte実体はK₁の観測SHA単位object、元run／path／宣言はindexと変更しない原manifest／receiptが所有する。

| 意味 | 保存対象／保持期間 | 入手・復元／不足時の明示操作 |
| --- | --- | --- |
| A0 固定expected | 固定manifest＋80 condition body。固定consumerが参照する全期間、廃止／移管後も当該受入の検証に必要な期間 | GitのTSK-06.5 sourceを起点にK₁ bundleから元pathへ復元。bytes／SHAまたは80件coverageが欠ければ停止し、保管ownerへ固定indexの再取得を依頼する。expected再生成で補わない |
| A1 正式性能 | 元正式3＋3runのmatrix／shard／receipt／log／ranking JSON、source／環境identity。その受入を現行根拠として参照する期間＋廃棄承認まで | K₁から元run別に復元。Fのfresh normal／merge性能で元正式測定を代替しない。欠けるrunは測定成立の主張を撤回して再取得 |
| A2 六失敗クラス | 六runner manifest、raw capture／failure／全stdout・stderr・receipt。当該意味論の反例を受入根拠にする期間＋廃棄承認まで | 各失敗runの原path・元非zeroを保持。成功runへ統合せず、欠落は該当クラス未検証として再取得 |
| A3 primitive／published | 元inventory／paths／独立HP disk receipt／runner宣言。同じ受入・公開proofを参照する期間＋廃棄承認まで | 元receipt ownerのpathへ復元。件数やrunner宣言だけで独立disk receiptを代替しない |
| A4 gate反例 | probe registry、raw8shard／condition／完全診断、retainedProof、reconciliationが参照するnormal after3run。同じreader／gateの反例を参照する期間＋廃棄承認まで | K₁で今回の不足884の該当部分も保存。不正JSON、null宣言、偽成功・generic失敗を原文のまま復元。修復して成功に変えない |
| A5 nonfinite／最新normal | reader5・writer1024の入力／issue／log／receipt、normal3runとmerge-after3run、source-identity／audit-reachability／reconciliation。同じ最終受入を参照する期間＋廃棄承認まで | 大きなfailure manifestのreceiptも展開して元pathへ復元。正式性能や正常recordで破損入力を置換しない |
| A6 再利用audit | 固定audit runner manifest＋全artifact・到達証明。条件付き再利用を主張する期間＋廃棄承認まで | K₁で元timestamp runを再構成。元runがcleanup候補でもbundleから復元できる。pin運用はTSK-09、欠落は再利用成功を主張せず再取得 |
| A7 quality・失敗帰属 | 成功・earlierAttemptの親子manifest、全receipt／step log／browser artifact。当該最終受入・失敗帰属を参照する期間＋廃棄承認まで | 親のchild manifestから子directoryを基準に復元。5s timeout失敗を成功manifestへ上書きしない |
| A9 必要な補助証跡 | K₀ membership、開始input identity、K₁ delta／membership／保存・復元・参照receipt／prototype操作／検証log。STEP 2とTSK-09の復元受入を辿る期間＋廃棄承認まで | STEP 2 receipt packageとK₁ bundleを一緒に取得。残りの先行inventory補助probeは結論の唯一のownerにせず、Gitの本台帳を参照 |

実体の共有は**観測bytes／SHAが同じfile内容だけ**に限定する。復元先はpathごとの独立fileで、hardlinkとして復元しない。異なるpathのfixtureを後で壊しても他runの入力を壊さないためである。圧縮で元byte列を変更せず、JSON.parseは参照検査にだけ使用し、原入力を書き戻さない。declared SHAは元receipt、observed SHAは保存indexで別管理する。

### 固定identityと復元操作

prototype ownerは[scripts/evidence-preservation.mjs](../../scripts/evidence-preservation.mjs)（opaque byte保存・復元）、[reference checker](../../scripts/evidence-preservation-references.mjs)（既存receiptの基準directory）、[局所test](../../scripts/evidence-preservation.test.mjs)。runner／quality／cleanup／実matrix callerへは接続していない。

local取得元は`.test-results/tsk-09-1-step2-20261001/bundle-k1/`。**index SHA＝`b2e59bb66822b337a2a300524fb77c9c1403b9152619ddd8b0c0dbfea89f1a7a`**を本台帳に固定する。bundleは`index.json`、元metadata bytesを持つ`membership.json`、`objects/<observed-sha256>.gz`の自己完結集合で、親bundle／元local directoryを復元時に参照しない。indexは全path→元bytes／観測SHA、圧縮objectのbytes／SHA、membershipのSHA、元宣言との差を持つ。SHAだけからpathやrunを推測しない。

復元操作は、承認された非公開の入手元からbundle全体とSTEP 2 receipt packageを取得し、固定index SHAを渡して新しい専用rootへ復元すること。現時点ではその入手元は未確定で、以下はlocalで成立した操作である。全件展開には約45.8 GBのfile bytesに加えてfilesystem余裕が必要で、約486 MBの保存容量と混同しない。

```sh
node scripts/evidence-preservation.mjs verify .test-results/tsk-09-1-step2-20261001/bundle-k1 b2e59bb66822b337a2a300524fb77c9c1403b9152619ddd8b0c0dbfea89f1a7a
node scripts/evidence-preservation.mjs restore .test-results/tsk-09-1-step2-20261001/bundle-k1 b2e59bb66822b337a2a300524fb77c9c1403b9152619ddd8b0c0dbfea89f1a7a .test-results/tsk-09-1-restored-new
node scripts/evidence-preservation-references.mjs .test-results/tsk-09-1-step2-20261001/bundle-k1 b2e59bb66822b337a2a300524fb77c9c1403b9152619ddd8b0c0dbfea89f1a7a .test-results/tsk-09-1-restored-new docs/evidence/tsk-06-5-production-closure.json
```

復元先が既に存在する場合は拒否する。欠落／圧縮破損／index・membership・元bytesのSHA違いは非zeroで停止し、別の保存先・SHA・認証情報で補わない。必要操作は同じ固定identityの再取得と新rootでの再実行。中断によるpartial rootは成功証拠へ使わず、今回削除しない。実checkoutへ入力を接続してmatrix callerを動かす最終受入はTSK-09で行う。

### 有効な検証と未達

- 保存coverage: K₀8,972＋追加884＝K₁9,856 path、欠落0、観測と元宣言の差は既知SHA破損1pathだけ。K₁の全object・全pathはindexにあり、親archive依存なし。保存receiptは`pack-k1-receipt.json`。
- 復元: `restore-receipt.json`でK₀全件を圧縮・元bytes／SHAともstream照合。K₁では同一index entryの8,972件の証拠を再利用し、原directoryを読まない`restore-k1-additions.mjs`で追加884件をexclusive書込・元bytes／SHA照合した。元K₀の復元fileはこの間変更していない。最終集合receiptは`restore-k1-receipt.json`。全件再生成・同条件の全件検証を重複させていない。
- 参照: `reference-k1-final-receipt.json`で41,240本／未解決0、固定expected manifest bytes／SHAと80条件、quality親子、reconciliation、コピーされたshardを元consumer基準で照合。null宣言2箇所と不正JSON1fileを既知反例として保存し、SHA不一致は同じ破損1pathの4宣言に残る。K₀の不足反証は`reference-k0-receipt.json`に保持。代表だけの成功に留めず集合全体を照合したが、別端末の取得成功や実matrix CLI成功は主張しない。
- 局所negative fixture: 不正JSON／空logのbyte保持、同byte・異path、既存rootへの上書き拒否、圧縮破損／固定index違い／coverage不足／欠落object／未知metadata／path traversal／環境path／symlink拒否、原directoryなしのarchive拡張、親子／copied shardの解決責務を6testで確認。
- 局所6testと`pnpm test:docs`6test／docs integrity、対象7fileのPrettier、`git diff --check`が成功。文書・差分ゲートの最終結果と全receiptは`.test-results/tsk-09-1-step2-20261001/manifest.json`。packageの入手元はlocalのみであり、それ自体を長期保存の保証としない。

**当時の未達／次操作（旧方針）:** U5のbyte共有・破損宣言・local全coverageと復元は確認済みだったが、非公開入手元・取得権限・保持責任者・寿命は未確定だった。保管先へbundleを移送する次操作は現在の方針として採用しない。U5／U6は上の現在表の移管・検証能力としてTSK-09.11から解消する。原証跡は保持し、転送・削除・STEP 3を先行しない。

**当時のTSK-09への運用義務（旧方針）:** pin／非公開保管・bundle復元運用を後続へ渡す計画だった。現在は09.11でbaseline／実readerを移行し、09.1の入手・保持手順と09の全体受入へ有効な証拠を継承する。原証跡のリリース混入防止、移管前の保持、物理削除の承認境界は維持するが、pin機能・非公開保管サービスを標準の追加実装にしない。

## TSK-09の存在意義とSTEP依存の再評価

2026-10-01、利用者の依頼により実装を止め、TSK-09と09.1の境界を再評価した。Taskの目的・依存・次操作は[TasksのTSK-09再評価記録](../tasks/development-redesign-tasks.md)が所有する。以下は現在の証拠と未確定事項であり、STEP 2やproject closureの完了宣言ではない。

- STEP 2の`manifest.json`は`status: incomplete`、K₁の復元receiptは`restored`、参照receiptは`passed`・41,240参照・未解決0で、local検証と別環境取得の未達を区別している。今回、全復元・hash照合・production／qualityを再実行していない。
- `scripts/quality-runner-lib.mjs`とsuite構成にはmatrix CLIの実行がない。固定expectedの原bytesを読む直接経路は`merge-oc-matrix.ts`→`verifyProductionMatrixRecords`であり、一般的な品質判定と専門matrix受入を分けて扱う。consumerが現在も固定入力を必要とすることは、local限定だけでは変わらない。
- 最終Contractの照合は必要だが、非公開保管サービス・pin機能・性能短縮・追加削除はそれ自体が利用者成果ではない。保存・寿命を守る方法、変更が必要な経路、再利用可能な受入証拠から必要な作業を選ぶ。
- STEP 3の導線整理とGit歴史画像の案内は原証跡の非公開転送に依存しない。原証跡の処遇と、保存・復元が別環境でも成立したとの主張は別の境界に残す。限定先行の判断と依存更新はTaskへ置く。
- 当初はlocal限定の恒久性を確認しようとしたが、保存対象を正しいと仮定した二択では不十分だった。現在は利用者指定により検証目的から保持範囲を決め、09.11の移行を最初に実施する。原byteの恒久再監査と、元runなしの検証再開を区別し、移管成立前の原証跡・固定identityを保持する。

## 検証目的から定める保持範囲の設計提案

利用者の「実装者として適切な範囲を考察する」依頼に対する設計判断を、最初に対応する範囲として採用した。実装順と完了条件の正本は[TasksのTSK-09.11](../tasks/development-redesign-tasks.md)。順序は09.11→09.1 STEP 2→STEP 3〜6→09である。約479 MBのgzip object／約486 MBのbundleを長期保存の前提にせず、将来必要な検証能力から保持対象を選び直す。今回の変更はTask定義・依存・保持判断の記録だけで、移行実装・外部保存・物理削除は未実施。既存の受入・固定identity・原証跡を保持している。

| 検証目的 | 適切な保持範囲と境界 |
| --- | --- |
| 全productionの回帰と差分診断 | 現行の期待値を1セット保持する。80条件×433 profileの34,640 outcome全件、canonical input／scenario／witness／damage／準備action／effect／area contribution、outcome分類、条件・集約inventory／digestとversion identityを対象とする。集約digestだけに縮めず、profile identity／field pathまで差分を説明できることを維持する。元の固定manifest＋80本文は移行元として保存し、専用baselineへ移管する際は意味を持つ全recordを保持する。 |
| 六失敗クラスと保存受入の反例 | 小さいsemantic fixtureとreader／writer／実CLIの再現testを保持する。非有限数、null／欠落／未知field、不正JSON、receipt不一致、transaction／gate不一致等を明示expectedで拒否する。大量失敗は小さいfixtureから生成して完全保存・bounded出力を検証し、1024件や各full matrixの過去コピーを恒久fixtureにしない。既存unit fixtureの存在だけで実CLIが完成したとは扱わない。 |
| 過去の受入・性能判断の説明 | Gitのreport／machine evidenceにルール、意図的差分、master／schema／engine／source identity、実行command、対象集合、結果・counter／digest、測定方法・環境・各sampleと中央値、確認した限界を残す。性能の正式before／afterと最新normalを区別する。過去の全byteをいつでも再監査できるという主張は保持範囲が支える場合だけ行う。 |
| 実行失敗の詳細調査 | 実行時は完全log／診断／trace等を現行artifact ownerで保存し、既存のCI14日・local最新10完了run等の調査用policyと分離しない。不要になった後の恒久保存を一律に要求せず、rawが利用できる期間の条件付き再利用と、履歴の受入記録を区別する。今回cleanup・物理削除は行わない。 |
| 不可逆な固有根拠 | 小さいfixtureやreportへ移管できない固有入力・採用判断だけを個別に保持判定する。Kの全manifest参照を必要性の代わりに使わず、移管先・失われる能力を記録する。 |

固定readerは`production-matrix-records.ts`でexpectedのmanifest・80本文を検査し、全record比較、aggregate比較、actual本文からのtransaction／gate観測を行う。移行はこの能力を守るための専用baseline schema／readerと受入で閉じる。原log・端末path・過去runのreceipt graphを公開fixtureへ収録する案、値を削ってdigestだけ残す案、変更後producerでexpectedを再生成する案、旧／新形式fallbackで共存させる案は採らない。baselineの期待値は承認済み元データから一方向に移管し、現schemaで元値を検査してから保存表現へ変換する。数値・null・欠落・unknownや意図的破損を都合よく正規化しない。

baselineはゲーム検証用データと出自の固定metadataに限定する。初回移行はrecordの意味fieldを削らず、1セット化と実行metadataの分離を先に行う。保存表現と公開可否は対象の実測容量・混入fieldを確認して決め、容量削減率や最終MB値は現時点で主張しない。今回、個別subsetの圧縮容量測定は環境保護hookで拒否され未実施であり、追加検証成功として扱わない。圧縮を使う場合も専用baselineを明示schemaで読み、汎用の過去run復元サービスを新たに作らない。

移行の受入は①承認済み元80条件／34,640 recordと全意味値・inventory／digest一致、②値の差・欠落・非有限数・coverage／identity不正・格納破損をtyped拒否し完全診断、③実mergeで正常入力と代表反例を確認、④元local runなしでbaselineを入手して同じ検証へ到達、⑤変更したreaderの性能と直接consumerの必要な最終ゲートを確認、とする。generator・damage意味論を変更しない移行へ全matrix再生成を無条件に追加しない。

採用したTask構成では、09.11が固定baseline・reader・再現fixtureと実受入を所有し、09.1が保持契約・導線・処遇を所有し、09が標準手順と全最終Contractを収束させる。STEP 2のbundle成功はbyte保存の実験結果として残し、戦略の採用根拠とはしない。damage・inventory・parity・fail-closed・最終品質とDOC-P4〜P6の保持する意味は不変で、各requirementの最終Contractは緩和しない。次の操作は09.11の直接producer／reader／source declarationと意味fieldを確認し、専用baselineの移行境界から実装・必要な検証を進めること。

## TSK-09.11 実装境界と反証（2026-10-01）

開始HEADは `0a787e8efd144242e5858c0e3da8b8ed0a4ab6fe`。既存4文書と3prototype scriptの未commit差分を保持する。入力は `tsk-06-5-production-closure.json::productionMatrix.canonicalRecords` の固定manifest（394462 bytes／SHA `879af462bd3209ffaf18365a25598bbcf07e008b6164991d65355ad55cb1a95a`）と宣言された80本文。producerは変更せず、期待値を再生成しない。

保存ownerは専用baseline reader、source declarationはmaster-data、実受入consumerは `verifyProductionMatrixRecords` → `merge-oc-matrix.ts`。baselineは全record、時間以外の全summary／aggregate／inventory／digest、master identity、元commitとmanifest receiptを所有する。実行時間・worktree状態・原path・log・過去receipt graphは元証跡と本台帳の判断記録に分離する。actualのtransaction／gateは引き続きactual本文から観測する。

| 反証 | 境界・必要な確認 |
| --- | --- |
| 参照されているだけで全履歴を保存 | A0だけを現行期待値へ移管。A1〜A9は固有判断／再現fixture／調査期間に分け、原byteの永久再監査は主張しない |
| digestだけで原因を説明不能 | 全34640 recordを保持し、canonical profile identity／field pathの全差分診断を実mergeで確認 |
| 変更producerで期待値再生成 | 元receiptとidentityを固定して検査後に一方向抽出。元全意味値比較・inventory／digest一致を別受入として記録 |
| schema・値・coverage・storage・gateの混同 | 固定構造、有限数／signed zero／欠落、80条件と433 profile、圧縮bytes／本文bytesの各hash、本文transactionと宣言gateを別段階で拒否 |
| 元local runやfallbackへ依存 | 現行専用形式のみ。repositoryのbaselineから取得し、不足はtyped失敗。元runへのアクセスを禁止した別rootの実mergeで確認 |
| 巨大容量を圧縮だけで隠す | 462712642 bytesの元本文から意味recordだけでも462616316 bytes。過去receiptの除外と1セット化を先に確定。80条件別gzipは30282857 bytes（測定済み）、条件単位読込で全matrixを常駐させない。意味field削減は今回行わない |

配置は `packages/calculation-application/baselines/production-v1/`、固定indexと80gzip本文をrepository成果物として取得できるようにする。外部公開・転送・cleanupは行わない。反例は既存の小さい六クラスfixtureを実runnerへ接続し、保存受入は実mergeの正常／値差／欠落／非有限数／未知field／coverage／identity／格納破損／transaction・gateと大量失敗を生成して確認する。変更readerの同条件before／after各3process、必要な局所／直接consumer／最終ゲートを閉じる。

現状: 実測と変更境界を確定、実装・受入は未完了。対象内未達はbaseline生成とreader接続、実CLI反例、元run禁止受入、性能と最終ゲート。

### 移管結果と局所受入

- 専用baseline: `packages/calculation-application/baselines/production-v1/manifest.json`、376249 bytes／SHA `50cbcb378d8743a9a678df5415eae93e269ffcc12514ed18344ee6a2e074534a`。本文80gzipは30282857 bytes、展開後462616316 bytes。全meaning recordを保持し、条件ごとの時間だけをaggregate／summaryから分離した。元identityのcommitは `origin.head`、master・command・matrixは `identity`、worktree状態はこの節の移管原identityと元証跡に残す。source declarationは現行 `production-regression-v1` のみを受け入れる。
- 元80条件／34640 record: `.test-results/tsk-09-11-20261001/migration-receipt.json`。全元receipt、現schemaとvalue domain、profile coverage／outcome／record digestを検査後に保存し、展開した全recordを元値とdeep比較・canonical比較した。aggregateは時間を除く全fieldを保持し、matrix digest `04415e8ab05dfcb5afa58210176357fb095e0b5faeed2aa4815273b00be68fc4`、candidate eligibility digest `68e41503a7663fa32607cbe1b26f670c0940f33f4f0a3d07b4268a5a5d914759` は一致。新producerの生成は呼んでいない。
- 保存入力再現: `baselines/replay-partitions.json`（69065 bytes）に元8partitionのadmissions／candidatesとeligibility digestだけを保存し、baselineのshard digest列・static inventoryとの一致を確認した。全recordsの2セット目やrun receipt graphではない。`replay-production-baseline.ts` は全recordを検査して保存入力を作り、actual gateは既存の本文観測ownerで構成する。保存readerの受入に使い、damage producerの独立回帰成功には代入しない。
- 局所: `productionRegressionBaseline.test.ts`、変更したintegrity／sourceの直接consumerを含む74test、warning0。成功manifestは `.test-results/2026-10-01T12-40-20-475Z-18-87967c/manifest.json`。old-only／canonical-only／mixed、unknown、null／absent、有限数、signed zero／NaN1024件、圧縮破損と展開本文receipt、coverage／identity／pathを確認した。
- 六失敗クラス: 小さい既存fixtureと `production-baseline-acceptance.mjs six` を接続。parity、unsupported、invalid、partialCommit、staleMutation、inertControlすべてexit1・`test_failure`、全40 artifact receipt一致・bounded表示。`.test-results/tsk-09-11-20261001/six-probes/acceptance.json`。inertControlは小さいoperation／bound input fixture、HP／OCの4クラスは実commandとnative transaction／live HP read fixtureを使う。過去のproduction故障run自体のbyte再現とは区別する。
- 実merge反例11件: `.test-results/tsk-09-11-20261001/matrix-probes/acceptance.json`。値差・欠落・unknown・nullの4profileをそれぞれ `canonicalInput` のfield pathまで診断、非有限数を比較前に拒否、profile／condition coverage・identity・baseline unknown・圧縮破損＋本文欠落を拒否した。本文の準備actionを減らし、record／shard digestとreceiptを更新した反例は `shardGateBodyMismatch` を出し、宣言だけのgate成功を受け入れない。unknown1024件は1024 typed failureを完全保存、stdout＋stderrは5行・545 bytes。全反例はexit1、保存済みmanifest／raw inputのreceipt error0。
- 同条件実mergeの性能: Node v26.3.1、同じactual80本文／8shard、他の重い検証を同時実行せず別process各3回。before117289.817／130370.152／115599.205 ms、after122956.471／123094.811／124184.096 ms、中央値117289.817→123094.811 ms（+5804.994 ms、+4.95%）。`.test-results/tsk-09-11-20261001/{before,after}-performance.json`。両側3/3が正常で全inventory／digest・outcomeは不変。gzip展開、圧縮／展開receipt、現schemaの追加検査を含む変更reader全体の費用で、damage性能や正式全matrixの測定へ代入しない。閾値・timeout・candidate boundを緩和していない。既存tsx loaderのNode26 deprecationはbefore／afterとも同じ。

現在の未達: 元run禁止の別root受入、最終差分レビュー・必須quality／docs、Taskと本台帳の最終一致。TSK-09.11はin_progress、09.1はblocked。09.1 STEP 2と09は実行していない。

### 保持対象の移管先・期間・再利用の限界（09.11の成果）

以下は09.11の保存・受入結果である。09.1 STEP 2の全処遇判定は再開後に行い、元証跡・prototype・bundleは削除していない。

| 対象 | 移管先・保持期間 | 原byteと再利用の限界 |
| --- | --- | --- |
| A0 現行期待値 | 専用baseline1セットと固定source declaration。現行回帰consumerが参照する全期間、更新時は独立した承認済み期待値へ移管して判断記録を残す | 元manifest／80本文は移管原証拠として維持。原byteの再監査は存在・receipt一致を確認できる期間だけ。元path復元を現行回帰の必須条件にしない |
| A1 正式性能 | `tsk-08-parity-ratchet.json` のformalRuns／環境／sample／中央値／source identityと本台帳の変更reader3＋3。判断の参照期間はGit記録を保持 | 過去正式測定と最新normal／今回reader測定は別条件。rawが期限切れなら過去受入記録として説明し、全byte再照合や同条件のfresh性能成功を主張しない |
| A2 六クラス | 小さい既存semantic fixture、実runnerのsix command、typed理由と本台帳。対応する契約・故障検出を利用する期間 | 過去production故障captureは固有履歴として原位置に維持。再現fixtureは同じ故障familyを検出し、過去runのbyte／identityを捏造しない |
| A3 primitive／published固有根拠 | 現行schema-legal／native／published fixtureと七宣言・inventory／digestの既存machine evidence。採用根拠の参照期間 | raw OC167／632や公開join、独立HP disk receiptの出自は既存証拠を維持する。今回canonical dataや公開producerを変えていない。原receiptだけが証明する採取・出自を新fixtureの件数へ代入しない。移管前の固有入力処遇は09.1 STEP 2へ残す |
| A4 保存reader・gate反例 | 現行baseline test、実merge11反例と小さいmutation定義。reader契約の利用期間 | 元の偽成功・不正JSON・null宣言・SHA不一致は歴史findingとして原証拠と判断記録に保持。現在の正常受入へ代入しない。fixtureから過去bugのbyteを再監査できるとは主張しない |
| A5 nonfinite／normal | 現行value domain test、大量失敗生成、実mergeの有限値・非有限値・normal、全期待値・inventory／digest | 1024件や全matrixの過去コピーを恒久fixtureにしない。完全診断は各実行artifactに保存し、原normal3run・正式測定との差を記録で維持 |
| A6 適用audit | 登録suite／到達対象と88testの受入判断は既存machine evidence。意味論・生成構造を変えない今回に全auditを追加しない | 原runと全receiptが存在し条件が一致する間だけbyte照合付き再利用を主張できる。期限切れ後は歴史受入記録とし、将来Taskがfresh auditを必要と判断した場合に取得する。pin機能・bundle復元を追加しない |
| A7 quality | 今回の最終quality結果と既存最終受入・失敗帰属をGit判断記録へ保持。完全log／traceは既存CI14日・local最新10完了runの調査policy | 5s失敗・earlyAttemptを成功で上書きしない。期限切れ後に親子graphの原byte再監査を保証しない。09.11の必須ゲート成功と09全体closureを区別 |
| A8 歴史画像 | 既存Git object identity／復元表を維持 | 別baseline画像で置換しない。09.1 STEP 3の導線処遇は未実行 |
| A9 今回調査・移管receipt | source／条件ごとの一致・性能・実CLI・別root・qualityの結論とidentityを本台帳へ保持。詳細は既存調査artifact policy | `.test-results/tsk-09-11-20261001/` は調査receiptで恒久baselineの入力にしない。手動名directoryの現在の存在を永続保証とせず、処遇は09.1へ渡す |

不足時は固定source declarationと同じrepository revisionのbaselineを再取得する。別path・bundle・代替SHAを探索するfallbackや新producerによる期待値補完はない。調査rawが不足する場合は該当byte再監査・条件付き再利用の主張を撤回し、必要なら対応するfresh commandを新artifactへ実行する。過去期待値そのものを変更しない。

### 最終ゲート前checkpoint

別root受入は `.test-results/tsk-09-11-20261001/isolation-receipt.json`、元runのread／open／stat等を禁止した状態でreplay／実merge exit0、34640 record、inventory／digest一致、originalRunReads0。コード・master・baseline・fixtureは別rootにコピーし、インストール済み依存だけを共有した。ネットワークでの公開取得や過去runの復元成功は主張しない。全80本文を検査し、端末path・raw log名の混入0は `baseline-content-inspection.json`。3prototypeは開始snapshotとbyte一致で保持。

依存は既存と同じZod4.5.4をcalculation-applicationへ明示し、lockfileの当該importerだけを変更。初回の別store指定はTTYなしの再構成拒否、default storeはSQLite open failureだったため、インストール済みmetadataが示す書込可能な `/tmp/tsk08-pnpm-store` を使い、frozen lockfileで同期した。認証・環境ファイルは参照していない。lint修正はschema構造を明示し、型上のunsafe配列・deprecated callを除去した。null auditのschema反例を加え、最終局所75test・warning0とlintが成功。manifestは `.test-results/2026-10-01T13-00-34-545Z-47-bd5c32/manifest.json`。有効な11実merge反例・6クラス・reader3＋3は同じ意味・入力・digestの証拠として継承し、全matrix生成や全auditは行っていない。

対象内の保存／実consumer Blockingは解消。残る完了条件は最終quality、結果receiptの照合・差分レビュー、Task／Handoff・本台帳の整合。09.11はin_progress、09.1はblockedのまま最終ゲートへ進む。

### TSK-09.11 最終受入

**判定: done、対象内Blocking0。09.1はready、STEP 2以降は未実行。** 承認済み元80条件・34640 outcomeの全意味値、inventory／digestを保持した期待値1セット、再現fixture、判断記録、期限付き調査artifactへ移行した。実装受入時点では原証跡・3prototype・bundleを保持し、commit／cleanup／物理削除／外部公開・転送は行っていない。新producerによる期待値再生成、damage／ranking／製品state・outcome意味論の変更、全matrix再生成・全auditの追加はない。

最終README qualityは `.test-results/2026-10-01T13-08-40-080Z-15-cbd2fe/manifest.json`、287630 bytes／SHA `049250ded638c25c2af38642b05858b773b7fed21daa5a8716f32379abbef048`。全10step exit0、unit1603・production157・E2E29、warning／unexpected console／retry0、633宣言のartifact検査error0。局所75test、実merge正常3/3・反例11、六失敗クラス6、元run禁止の別root、原全値・inventory／digest一致は上の各receiptを参照する。quality実行中にsource／baseline／設定／文書を変更していない。

差分レビューは保存・受入の直接生成／利用経路に限定し、旧expected形式・fallbackなし、全record／aggregate診断、actual本文からのtransaction／gate観測、typed非zeroと完全artifact、80条件／433 profile coverageを確認した。schemaのnull auditも局所反例で拒否する。新producer・製品executionへのscope逸脱なし。Flow closureはexecution semantics不変のためN/A、保存readerの構造反証は本台帳のmatrix・実CLIでVerified。変更readerの中央値+4.95%と保存容量は実測として記録し、未変更damage経路の性能やfresh全matrixの成功へ代入していない。

実装18fileの最終identityは `.test-results/tsk-09-11-20261001/source-identity.json` のdigest `3491612aac41d147b270c3de5514817994255525d65d29b52ba2c0f348480925`。quality後も18/18 SHA一致。baseline本文は固定indexの80宣言がauthorityであり、成功した各実mergeが圧縮／展開receiptを検査済み。結果追記はTask／台帳／indexだけに限定し、最後に文書検査で閉じる。開始時の4文書の関連差分は保持・更新し、3prototypeはbyte一致。実装受入時点では未commitのworktree成果物を成果とした。外部への公開取得や原byteの無期限再監査は主張しない。

09.1 STEP 2の次操作: この保持表とU5／U6、Tasksの09.11 Handoffを読み、既存A0〜A9の処遇契約と導線へ移管結果・期間・条件付き再利用の限界を反映する。A3等の固有根拠の原byteを処遇する場合は、失われる能力と保持先を個別に確認する。09.11の受入を同条件で再実行せず、STEP 2の未移管／Blockingを閉じてからSTEP 3へ進む。TSK-09は引き続きblockedで、project最終Contractは未完了である。

集約受入manifestは `.test-results/tsk-09-11-20261001/manifest.json`（status done、8 proofのbytes／SHA、quality全10step、source一致と停止境界）に保存した。結果追記後の `pnpm test:docs` は6test／docs integrity成功、`git diff --check` 成功。今後この調査manifestが利用できなくても、現行回帰のauthorityはrepository内の固定baselineであり、本台帳の受入記録と区別する。

### 利用者依頼によるcommitと旧bundleの現状（2026-10-01）

実装受入後の利用者依頼により、09.11の実装・固定baseline・再現fixture・関連する正本更新を本commitへ収録する。開始時の4文書の関連記録も移行判断の出自として保持する。未変更の3prototypeは開始snapshotとbyte一致し、未追跡のままcommit対象外。必要なquality証拠のsource18fileは不変であり、今回の追記は文書検査で確認する。

旧全履歴bundle `.test-results/tsk-09-1-step2-20261001/bundle-k1` はローカルのbyte保存・復元実験証跡として現存する。現状は2017 file、index・membershipを含む総容量485542196 bytes（約486 MB）。長期回帰baselineとしては採用せず、現行readerの入力や元runなしでの回帰検証に必要な取得物へ含めない。物理削除・cleanup・外部公開・転送は行わない。原byteの再監査に必要な固有根拠と保持期間の個別処遇は09.1 STEP 2の未達として継続し、削除可能や無期限保持保証とは判定しない。
