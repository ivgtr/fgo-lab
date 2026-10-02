---
title: "TSK-09.1 documentation closure decision ledger"
document_version: "1.4.11"
status: "Active"
created_at: "2026-10-01"
updated_at: "2026-10-02"
baseline_head: "0a787e8efd144242e5858c0e3da8b8ed0a4ab6fe"
implementation_task: "docs/tasks/development-redesign-tasks.md TSK-09.1"
---

# TSK-09.1 documentation closure decision ledger

STEP 1の判定台帳、STEP 2の保存実験、採用した保持範囲、STEP 3の導線・role判定、STEP 4のDOC-P5・metadata移管とSTEP 5のDOC-P6検査を記録する。進捗・依存・次操作は[Tasks](../tasks/development-redesign-tasks.md)が所有する。本書は対象集合、保持する意味、未確定事項の解消ownerを所有し、別計画書へ複製しない。09.11・09.12・09.13はdone、STEP 1〜5完了。保持契約はA表と[09.13最終処遇判断](#0913-不使用方針による最終処遇判断)が正本で、STEP 2受入・09.12部分保持案は採用時の履歴。HP原内容・出自の再監査能力は手放したがfixture移管ではなく、物理処遇も未実施。現在の判定deltaは末尾の[STEP 6](#step-6-統合受入handoff)。STEP 6の別checkout文書受入は成立し、原PNG／archiveの固定history取得・復元は追補で成立。固定baseline revisionは利用者が明示承認した主repositoryからGit取得・別worktree照合を完了。全Done gate／Applyを閉じ、09.1 done／09 ready・未着手。最終closureは末尾追補に記録し、外部originのbaseline提供未保証と区別する。全履歴bundle方式・非公開転送・pin前提は初回実験の履歴で、現在の実行順を所有しない。

STEP 5の実装・反証・診断保存と受入deltaは[末尾のDOC-P6記録](#step-5-doc-p6検査実装)へ接続する。STEP 4のmetadata意味移管・保全と09.11／09.13の判断は維持し、STEP 5の検査成功をSTEP 6の別checkout／history取得や09.1全体の完了へ昇格しない。

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

次のA集合は**保持する意味と直接入力の現行契約**である。STEP 1の原証跡集合Kと09.11の移管結果を入力に、承認されたSTEP 2で収束した。原pathへの参照は原byteの無期限保持を要求しない。期間・取得保証・不足時の能力制限は下表と[STEP 2保持契約](#step-2-保持契約の収束)を合わせて読む。Kの定義と後続のbundle契約は当時の保存実験として保持する。

| ID／保持する意味・owner | 移管先・固定identity | 参照期間・現在の取得保証 | 入手・再開／不足時の対応・再利用限界 |
| --- | --- | --- | --- |
| A0 全承認済み期待値／source declaration・baseline reader | `tsk-06-5-production-closure.json::productionMatrix.canonicalRecords` → `packages/calculation-application/baselines/production-v1/manifest.json`＋80gzip。index376249 bytes／SHA `50cbcb378d8743a9a678df5415eae93e269ffcc12514ed18344ee6a2e074534a`、本文はindexの圧縮／展開receipt。originは元commit `60dea89944a884bbbe40464eb1ae7e65cb77ad4e`・manifest394462 bytes／SHA `879af462bd3209ffaf18365a25598bbcf07e008b6164991d65355ad55cb1a95a` | 現行consumerの利用期間。固定revision dd1a0ebを利用者が承認した主repositoryからGit取得する契約（README手順・末尾STEP 6最終追補）。外部originの同revision提供は未保証。更新時は独立承認済み期待値へ移管し判断を残す。元manifest／80本文の存在は長期取得保証にしない | 同じrevisionのsource・master・baselineを取得して実readerへ。欠落・破損はtyped非zero、固定identityの再取得。新producer・別SHA・元run・bundleで補わない。replayは保存reader受入でありfresh damage成功ではない |
| A1 正式before／after性能・damage比較／TSK-08・09.11測定owner | `tsk-08-parity-ratchet.json::approvedClosureImplementation.finalAcceptance` のformalRuns／performance／matrixReferences／protectedRecords、元source・環境の関連記録。本書09.11の変更reader3＋3・sample・Node版。原runごとのpath／receiptを維持 | 判断・元3＋3の条件はGit履歴の参照期間。原matrix／shard／ranking JSON／logは調査policy。原run全体の永続取得保証はない | 同じrevisionの判断記録を読む。原byte照合は元runとreceiptが揃う間だけ。raw不足後も当時の測定判断は残すが、原byte再照合・同条件fresh成功は主張しない。最新normal／reader3＋3で正式性能を代替しない |
| A2 六失敗クラス／transaction・parity・control owner | `productionClosureAudit.test.ts`、`productionHpPublishedDependencyCoverage.test.ts` の小fixture＋`production-baseline-acceptance.mjs six`。元captureは同machine evidenceのclassJoin.finalFailureProbes6件（run・path・bytes／SHA・非zero・typed理由） | 契約・故障検出を利用する期間はrepositoryのfixture／commandを保持。元production capture／runner manifest／logは調査policy | 同じrevisionのsixを新directoryで実行しrunnerの完全artifactを読む。fixture不足はrevision再取得。原capture不足は過去runの照合未成立とし、必要ならfresh sixへ。同じ故障familyの再現を原captureのbyte／identity再現へ代入しない |
| A3 primitive・published固有内容／raw data・shared audit・独立receipt owner | 現行schema-legal／native／published fixtureと七宣言のmachine evidenceを保持。OC inventoryのrawOc／metadata／published joinはbundle外の原位置retainを維持。HP primitiveInventory／publicProofs／独立disk receipt5件の原byteは09.13で保持義務を解除。固定identity・理由は末尾09.13追補 | 意味規則／採用判断はGit参照期間。HP原内容7object・33alias・原宣言40件の再監査能力は移管せず手放す。原runの物理処遇は対象外、既存調査policyは不変。OC／raw exportsの契約を変更しない | 現行／後続の必須入力はA0・fixture・判断記録。旧HP原path／receiptはhistorical locatorで再開条件にしない。原内容・出自がfixture／digestで代替されたとは言わない。OC原入力不足は指定identityの取得不能を明示し、別版／別pathで補わない |
| A4 saved-reader構造・gate反例／matrix acceptance owner | `productionRegressionBaseline.test.ts`＋実merge11反例のmutation定義。本書09.11受入と同machine evidenceのserializedGateClosure.finalAcceptanceは元41反例・偽成功／generic失敗・不正JSON／SHA不一致を記録 | reader契約の利用期間はrepositoryのtest／commandとGit判断記録。元raw8shard／condition／probe registry／完全診断は調査policy | matrix commandを新artifactで実行。元不正JSON／null宣言／SHA不一致は原文・宣言と観測の区別を保つ。raw不足後は歴史findingとし、現testから過去bugのbyteを再監査したとは言わない |
| A5 nonfinite・normal／value-domain・writer／reader owner | 現行value-domain test、大量失敗生成、A0全期待値／inventory／digest、実merge。元reader5／writer1024／normal3run／merge-after3runの条件は同machine evidenceのnonfinite最終受入と本書 | 意味契約を利用する期間はtest／baseline／判断記録。過去normalの全コピーと1024件の診断は調査policy | 新artifactへ正常／非有限値／大量失敗を生成し完全保存する。過去raw不足は当時のbyte照合不能と明示。原normal3run・正式測定・保存入力replayを別条件として扱い、1024件のコピーを恒久fixtureにしない |
| A6 適用auditの条件付き再利用／登録audit owner | 同machine evidenceの`implementationSelfReview.nonfiniteBodyReview.repairPlan.finalAcceptance.registeredAuditReuse`、登録5file→不変10function、88test判断。元manifestは`.test-results/2026-09-30T17-32-03-143Z-15-fa5942/manifest.json` | 登録suite／採用判断はGit参照期間。原run／到達proof／全receiptは調査policy。cleanup候補であることを長期保持保証へ読み替えない | 元run・全receiptが揃いsource／入力／到達条件が一致する範囲でのみ照合付き再利用。不足後は歴史受入記録。将来Taskがfresh auditを必要と判断したら`pnpm test:audit`へ。pin／bundle復元を必須にしない |
| A7 quality・失敗帰属／quality runner | 本書09.11最終受入（1603／157／29・全10step・warning0）と同machine evidenceのTSK-08最終受入／earlierAttempt。元09.11 manifest287630 bytes／SHA `049250ded638c25c2af38642b05858b773b7fed21daa5a8716f32379abbef048` | 成否・帰属・source条件の判断はGit参照期間。完全log／trace／親子manifest／receiptは調査policy | 失敗を成功で上書きしない。原親子graph不足後はbyte再監査不能とする。新しい製品／quality経路変更は新qualityで検証。同条件の文書記録変更へ09.11 qualityを再実行せず、今回の文書ゲートで閉じる |
| A8 歴史画像／E4 report | [PNG3件の固定identity・復元操作](#e4歴史画像の復元)。現画像への後継置換なし | 元画像の判断を参照する期間は指定Git履歴を取得可能にする。STEP 3でindex→E4→復元表とlocal Git identityを照合。STEP 6追補で正式sandbox外実行による3commit取得と全21原物の復元をVerified | 指定commit・元path・blob・bytes／SHAが全部一致した原画像だけを復元。取得不能・不一致では停止し必要historyを明示。現mobile画像や旧bundle・再生成で補わない |
| A9 判定・調査・移管receipt／本台帳・Task | 結論とsource／条件／移管identityは本書・TaskのGit記録。STEP 1、初回STEP 2、09.11、今回の詳細は各`.test-results/`。旧bundle固定index SHAは履歴節、prototypeは固定bytesの実験資料（Git取得commitは09.12節） | 判断の参照期間はGit記録。詳細は調査policy。手動名directory／約486 MB bundleの現在存在に永続保証・fresh clone必須入力の責務はない | registry→Task→本書から再開。調査raw不足は結論の出自・実行記録とbyte照合の能力を区別し、必要な局所commandだけ新artifactへ。bundle保管先選び・転送・復元から現行回帰を再開しない |

Kの定義はSTEP 1開始HEADの原A0〜A7（下記seed全件）から次の規則で得る（A8／tracked golden／masterは別集合）。**seedの実pathは後の全件表へ固定**する。

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

### E4歴史画像の復元

以下のpath・source commit・blob・bytes・SHA-256はSTEP 1で固定した原identityを保持する。STEP 3で[E4 report](damage-effect-execution-e4.md)の切れた3linkを本表へ接続する。現mobile画像は別baselineであり代替ではない。本表はGitからの復元情報で、原bundle／runの取得を必要としない。

| 歴史画像（kind＝PNG、owner＝E4 UX evidence、参照＝E→E4 report） | 復元source commit／blob | Bytes／SHA-256・後続STEP |
| --- | --- | --- |
| `e2e/ranking-baseline.spec.ts-snapshots/ranking-390px-chromium-linux.png` | `6d7608caf16fa8e677509ee5c0ae0ba3044ac700`／`95b9402f881404fd0432bb5e84d10f4e7236f502` | 57957／`f9dacecf89385ec609e8d36ea6391bb2b3b12316d53a7518fd9b3bf137675291`; 固有履歴、後継なし（元画像の同一復元）、STEP 3 |
| `e2e/ranking-baseline.spec.ts-snapshots/ranking-320px-chromium-linux.png` | `6d7608caf16fa8e677509ee5c0ae0ba3044ac700`／`26f525580a814ede3df40140ee87280167100297` | 40246／`7ed21de737a2271f853574d75288dd1608b9568a9e619aeeb01f4db399479f76`; 固有履歴、後継なし（元画像の同一復元）、STEP 3 |
| `e2e/ranking-baseline.spec.ts-snapshots/ranking-row-320px-chromium-linux.png` | `6d7608caf16fa8e677509ee5c0ae0ba3044ac700`／`6424b7308b66ea5b86df301927aad46b81db685f` | 4533／`e2b2a1d21aa871d9d4b232d1653d43a9d26d328ee53ae4e7d241bc6375d738c9`; 固有履歴、後継なし（元画像の同一復元）、STEP 3 |

historyがある環境では、指定commitと元pathの対応、blob type／bytesを確認し、新しい一時directoryへ復元してSHA-256を本表と照合する。次は390px画像の操作例で、残る2件も各rowの固定値を使う。

```sh
git cat-file -e 6d7608caf16fa8e677509ee5c0ae0ba3044ac700^{commit}
git rev-parse 6d7608caf16fa8e677509ee5c0ae0ba3044ac700:e2e/ranking-baseline.spec.ts-snapshots/ranking-390px-chromium-linux.png
git cat-file -t 95b9402f881404fd0432bb5e84d10f4e7236f502
git cat-file -s 95b9402f881404fd0432bb5e84d10f4e7236f502
e4_restore_dir=$(mktemp -d /tmp/fgo-e4-images.XXXXXX)
git cat-file blob 95b9402f881404fd0432bb5e84d10f4e7236f502 > "$e4_restore_dir/ranking-390px-chromium-linux.png"
wc -c "$e4_restore_dir/ranking-390px-chromium-linux.png"
sha256sum "$e4_restore_dir/ranking-390px-chromium-linux.png"
```

shallow cloneやhistory不足で最初のcommit確認が失敗したら、復元未成立として停止する。必要入力はこの固定commitとその3pathのGit object。取得可能なrepositoryの`origin`から`git fetch --no-tags origin 6d7608caf16fa8e677509ee5c0ae0ba3044ac700`で指定historyを取得し、最初から照合する。remoteが固定commitを提供しない、blob不足、bytes／SHA不一致の場合はその原因と必要objectを記録し、別commit・別path・現画像・旧bundle・再生成へ切り替えない。今回はlocal Git objectの一致と導線を受け入れ、ネットワーク取得・別checkout受入はSTEP 6へ残す。

## Metadataの意味と未確定事項

STEP 1時点のdocs MarkdownのFM／status欠落42件（ADR本文22＋index1、evidence18、license1）と語彙外8件を開始snapshotとして保持する。STEP 4開始時も対象は同じで、個別移管結果は末尾のSTEP 4が所有する。語彙外の原値は上の各rowに保持した。`Complete - Awaiting User UX Confirmation`2件、`Complete - Review Findings Corrected`1件、`Superseded by E4.1.3 activation witness closure`1件、`Verified`3件、`Implementation`1件。残るapproval／UX確認とphaseの完了、flow検証と文書statusを別の意味として扱う。文書version欠落や追加必須fieldはSTEP 4でkindの契約から確認し、暗黙の既定値を追加しない。

| ID | 未確定事項／保持する意味 | 解消owner | 必要な証拠・次の操作 |
| --- | --- | --- | --- |
| U1 | routing noteのindex導線と現在のrole。本文はVerified flow／固有性能を持ち、Tの調査言及だけでは登録経路としない | STEP 3 Verified | Eからsupporting歴史測定として登録、本文冒頭で現行ADR-029／data-flow／UI契約・直接ownerへ接続。測定後継なしのretain理由と四commit範囲を確定。Implementation metadataはU3へ |
| U2 | 古いindex status／phase checkpointと最終受入の区別。TSK-08 root doneだがindexは途中in_progress説明を保持、flowのTSK-07 blocked等は履歴 | STEP 3 Verified | Fの最新finalAcceptance／Taskへ接続。初期2machine evidenceはbounded完了、resolved-attackerはStep 2／PIR-001までComplete。ranking／portableは現行意味説明と履歴のActiveを維持。旧E／Q値・checkpointを現HEAD値へ置換しない |
| U3 | 42欠落／8語彙外、kind別必須metadataの移管。採用判断・当時のUX確認・Verifiedの意味 | STEP 4明示移管、STEP 5全件検査・反証、STEP 6別checkout文書検査Verified | STEP 4個別表の意味・E0〜E2履歴・license／ADR本文を保持。STEP 5で未知値・欠落・重複・矛盾をfail closedに検査 |
| U4 | root入口・AGENTS・CLAUDE aliasの検査契約と全Markdown構文 | STEP 4契約確定、STEP 5構文／alias・Task／CLI検査、STEP 6別checkout Verified | symlink、reference-style／anchor／HTML／code fence、UTC timestamp／最終区間、bounded大量error・完全保存・保存失敗を恒久fixtureと実CLIで反証。別checkoutはSTEP 6 |
| U5 | STEP 2の保持分類・移管契約を収束。A0〜A9の現行表、A3固有内容のretain理由と原入力不足、Kの履歴境界を明示 | TSK-09.11／STEP 2 Verified（文書処遇はSTEP 3以降） | 同じ意味値・inventory／digestと実consumer証拠を継承。A3の固有原内容は原位置にretainし、移管済み・削除可能とは扱わない。K全件の復元を保持最小性へ代入しない |
| U6 | STEP 2の固定identity・入手／不足時拒否・原rawの期間と限界を接続。09.11の元run禁止replay／実mergeを同条件で継承 | STEP 2・STEP 6の取得／別checkout文書再開Verified、project closureはTSK-09 | 利用者が主repository提供元を明示承認。独立shallowへのfile transport固定revision取得→同revisionの新worktreeで宣言・80gzip・master・fixture・直接owner一致。外部originはnot our refで提供未保証。09.11実consumer／性能は元source・入力・条件で継承し、新規実行へ代入しない |
| U7 | 歴史画像3linkとGit-only18snapshotのfresh復元条件 | STEP 3画像導線 Verified。STEP 4既存Git-only処遇継承。STEP 6文書導線・正式sandbox外Git取得／21原物復元Verified | E→E4→本表の元commit／path／blob／bytes／SHAで同一byteを確認。shallow cloneの固定history取得／不足時停止を明示。現mobile画像への代入なし。18snapshotの内容処遇を継承し、追補で別checkoutの固定history取得・commit／path／blob／bytes／SHA一致を実証 |

上表はSTEP 1で列挙した未確定事項の解消記録である。最新のSTEP 6でU1〜U7は成立範囲・取得保証の限界を明示して解消し、必須不明・未移管・対象内Blockingは0。原物の物理処遇やTSK-09のproject closureを先取りしない。

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

以下は初回実験で仮定した旧保存契約であり、現在の保持期間・取得方式を所有しない。当時も未確定の保管先による寿命保証は未成立だった。K₁は当時の全参照復元対象で、観測SHA単位objectと元run／path／宣言をindex・変更しない原manifest／receiptで対応付けた。現在の契約は冒頭A表と末尾STEP 2保持契約を参照する。

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

以下は09.11完了時の引継ぎsnapshotである。現在の保持契約は冒頭A表と末尾のSTEP 2保持契約を正本とし、下表の「09.1へ残す」は当時の次操作として読む。元証跡・prototype・bundleは削除していない。

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

旧全履歴bundle `.test-results/tsk-09-1-step2-20261001/bundle-k1` はローカルのbyte保存・復元実験証跡として現存する。現状は2017 file、index・membershipを含む総容量485542196 bytes（約486 MB）。長期回帰baselineとしては採用せず、現行readerの入力や元runなしでの回帰検証に必要な取得物へ含めない。物理削除・cleanup・外部公開・転送は行わない。09.11完了時点では固有根拠と保持期間の個別処遇を09.1 STEP 2へ残した。現在の判定は末尾STEP 2受入を参照し、旧bundleの削除可能や無期限保持保証とは判定しない。


## STEP 2 保持契約の収束

利用者が現コード・正本に基づく計画と成果物イメージを確認し、同じsessionの文書更新・検証・Handoffまで承認した。開始HEADは`dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4`。tracked差分なし、未追跡の3prototypeを保持。開始identity・原証跡照合は`.test-results/tsk-09-1-retention-closure-20261001/start-input.json`。変更境界は本書、Tasks、root README、テスト戦略§9、registry／evidence indexの6文書。実行コード・CI／cleanup・製品testが読むmachine evidence・baseline／fixtureを変更しない。

### 保持期間と保証の責務

repositoryは現行baseline1セット・小fixture・command・判断記録を所有する。取得単位は同じrevisionのsource declaration／master／baseline／fixtureであり、原runのpathを復元して利用する方式ではない。判断の参照期間はGit記録を保持し、原採取commit・source／環境・異なるrunの区別を残す。現在のfile／Git object存在は外部入手や無期限保存の保証とは別である。未取得revisionはrepository提供者へrevisionを指定して取得する。取得できなければ停止し、最新revisionや代替expectedで補わない。

実行artifactは[テスト戦略§9](../requirements/test-strategy-redesign.md#9-artifact仕様)を適用する。CI uploadは14日、localは明示cleanupがtimestamp形式のdirect childに対して最新10完了runと実行中runを残す。手動名directoryはこのcleanupの対象外だが、一般削除／端末障害への保管保証ではない。「期限付き」はCIの期間とlocalの有限run数を指し、新しい日数を設定しない。

生成責務は既存ownerにある。`productionRegressionBaseline.ts`は固定宣言・圧縮／展開receipt・schema・値・coverageを検査し、`verifyProductionMatrixRecords`／実mergeは全record／aggregate比較とactual本文のtransaction／gate観測を行う。replayは保存入力を構成し、acceptanceは故障fixture／mutationを実CLIへ接続する。runner／qualityは完全log・構造化結果・親子receiptを保存し、cleanupは既存の有限run選別だけを行う。文書分類をruntimeへ重複実装せず、prototype・pin・保存サービスを接続しない。

`data/raw/`はrun cleanup対象ではない。個別入力の必要性・同一性を確認する前に処遇せず、新たな保存日数や永続取得保証を作らない。今回の原証跡・bundle・prototypeの保持は「削除してよい」の判定を含まない。後続の処遇で固有入力を削る場合は、残す意味と失われる再監査能力を個別に確認する。原byteが不足した際に他の保存先・raw版・SHAを探索して成功を補完しない。

### A3 固有内容と原入力の境界

本小節はSTEP 2採用時の保持判断の履歴である。HP原位置retainは末尾09.13追補で解除し、OC inventory／raw exportsの契約だけを維持する。固有原内容にはcanonical-only fixtureと同値な後継がないため、当時は**原位置にretain**した。移管済みや重複とは分類しない。保持契約の収束はこの個別retainと能力制限の確定までで、原byteの無期限再監査・別環境への原入力移送を完了条件にしない。

| 固有内容 | 固定identity／今回確認した実体 | 保持する能力／不足時の限界 |
| --- | --- | --- |
| OC planningの原cell・metadata・public join | `.test-results/tsk-06-48-a0/oc-inventory.json`、989349 bytes／SHA `7b191e653a3637de8ba8b83ace7ea959f7a57845488a34c7277708cbaf88c484`。head `c555e4ff9a208f8da01e56130fbd49e63848e192`、masterVersion `20260906.01`。rawOc167件／cells632、publishedOc97、rates29、writers199／context7、原path・function metadata・parameter／LB cellsを持つ | 保存された具体的cells・metadata joinの閲覧と検査を保持する。現fixtureの件数やdigestだけでは代替不能。全raw exportのbyte列・全metadataを保存したsnapshotではないため、これだけから原採取の再実行・完全出自を証明しない |
| OC採取の四raw export | 上inventoryのdigestsはnice_servant `1abf690ac22bcdd427788e0ff545320af491ee9f90fbc08a56af9603a217118f`、nice_equip `bb339ac726f8201243410ec82b85a14496e6a8dace54b226071b556604fc27e5`、nice_mystic_code `ce6560440673fad4f36f8e08a97b20b4b5d9e2e0e1c5f262943bbf47d8b857cf`、referenced_skills `afdc02f3251dd901c133745203889a0c1c4d23409da17d24634140b5e75107f6` | 前三入力は現在fileのSHA一致。referenced_skillsの現在SHAは`0c4e082b5968fc337df597ad7abb1a844d2ac2078f09a7e14ad7d518d9e4e47c`で不一致。固定入力は現在の原位置から取得未成立で、当時の全raw採取再現も未成立。固定identityを採取ownerへ指定して取得できなければ、その能力を主張しない。別版への置換・探索はしない |
| OC採取の旧published masterとnormalize入力 | 上headの`apps/web/public/master/master.json`は30127202 bytes／SHA `6e96b3f11fdbdef82997be12c84076d4236651d23f4ee7662a4b66a6a272c8f8`、Git object一致。現行master SHAはA0の`2d9f1b19ed40452fda3571932ee1e37bf9fe85fdfa903404c853d7cde269e46a`で別入力。normalized-master CLIは四rawに加え`nice_item.json`を必要とする | 指定historyを取得して旧masterを新pathへ取り出しSHA照合できる。現行masterで過去joinを代替しない。normalizeは原raw・nice_item・source・保存snapshot／baselineが同条件で揃う場合だけ新artifactで実行する。nice_itemの当時の固定identityは上planning記録にないため、現fileの存在だけで完全normalize再現を主張しない |
| HP primitive／pathsの独立disk receipt | `tsk-08-parity-ratchet.json::approvedClosureImplementation.finalAcceptance.independentHpDiskReceipts`5件。元timestamp runのcell inventory／calculator／ranking／CE／support pathsについて原path・bytes／SHAを照合、5/5一致。primitiveInventoryは15858817 bytes／SHA `e75e1a6df8f357761d3c18300b52c7194b6f64010578df1884ac7832089054b2` | runner宣言とは別のdisk実体、元入力・consumer path・原採取identityの検査を保持。新fixtureは意味規則を検証するが原入力の代替ではない。raw不足時は独立disk再照合と原path再監査を撤回し、Gitの当時の受入判断を残す |
| HP published operation／dependency proof | 同finalAcceptance.publicProofs2件。元path・bytes／SHAと一致しoriginalArtifactとの同一性宣言を維持。operation3745283 bytes／SHA `8c7f21e35155f09c13c9e065e5bbb89cf5931a81239875373a069312d28cacb0`、dependency13843717 bytes／SHA `da5f0bed664c31b46226bd881d1cfa0caa1b076739e1b8c6b864aef61af707fe` | 当時のpublished requestとnative／consumerの具体joinを保持。今回確認は指定2fileの実receiptであり、全originalArtifactの再照合ではない。消失後の出自再監査をfixture成功へ代入しない |

raw OC原cellsとpublic metadata joinを持つ保存inventory、HPの5＋2原内容は存在しreceipt一致で、処遇はretainに確定した。旧referenced_skills／nice_itemの完全原入力再現は現在保証しない。これは現行baseline／reader入手の不足ではなく歴史採取能力の明示限界であり、意味内容を捨てた・出自を新fixtureへ移管したとの扱いはしない。将来この能力を必須とするTaskでは固定原入力の取得がBlockingとなる。

### 固定revisionからの入手と再開

取得手順は[root READMEのProduction回帰baseline](../../README.md#production回帰baseline)を用いる。現在の取得identityは`dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4`、source declaration SHA `650a360b6176126d2b02414f303c08e8d7e80b2ce548ddc538770c4c96be9f08`。partition fixtureは69065 bytes／SHA `cb3187313f96ea45c22dcbce4c2a0ecb1e8f2be179932bfbc5604c58b0c7bfa7`でbaselineManifestSha256へ結合する。full recordの二重baselineではない。

固定revisionの取得→依存install→新出力でreplay→実merge→必要なmatrix／six反例、という操作を既存commandで行う。期待値の原byte再監査が目的なら必要な原path・receiptを取得して照合し、replayと混同しない。途中directoryを成功証拠にせず、同じ新出力への上書きを避ける。現在producerの回帰が目的なら既存auditのcanonical8shard→mergeを使うが、本STEPで再実行しない。

入手・利用の実証は09.11の`isolation-receipt.json`を継承する。source／published master／baseline／fixtureを別rootへコピーし、元runのread／open／stat等を禁止したreplay／実merge成功、originalRunReads0・34640record・inventory／digest一致である。インストール済み依存は共有したため、ネットワークからの公開取得・新規依存install・処遇後の全文書checkout受入を今回成立したとは主張しない。文書処遇後の導線を辿る受入はU6のSTEP 6分へ残す。

### 反証と証拠再利用

| 反証する主張 | 今回の根拠と判定 |
| --- | --- |
| 参照pathは全部恒久保存しなければならない | A0の現行入力、A2／A4／A5のfixture、A1／A6／A7／A9のGit判断、A3の固有retain、A8のGit復元を区別。K参照closure／旧bundleは恒久baselineではない |
| digest／判断記録が固有入力・出自まで証明する | A3の原cells／metadata／HP pathsを個別receiptで確認。旧raw不一致を成功に補完せず、完全採取再現は未成立と記録 |
| raw消失後も全byte再監査できる | 原path・実体・receiptが揃う期間だけ照合を主張。消失後は歴史判断とfresh fixtureを区別し、元run再監査の主張を撤回 |
| 手動名directory／CI uploadが永久保証になる | CI14日、local最新10完了run、手動名対象外を確認。現在の存在・cleanup除外・外部取得・保持保証を別に判定 |
| 元run／旧形式／暗黙fallbackが入手経路になる | 現行readerの固定source→専用baseline、replay→実merge、元run禁止の別root受入を継承。旧bundle／prototypeを接続しない |
| 保存reader受入がfresh damage／全project成功になる | saved-body replay、原全値移管比較、producer回帰、性能条件、最終quality、文書ゲートを区別。09.1全体・09の完了は主張しない |

開始時に09.11 source18/18、indexの80gzip圧縮receipt、published master、8 proof、quality親manifest、A3原内容7件、旧bundle indexと容量、歴史PNG3blobを確認した。展開本文・全歴史receipt graphの再hashは行わず、09.11実mergeによる展開receiptと全意味値比較の有効証拠を継承する。docsだけのdeltaはREADMEの説明と保持・処遇記録で、製品testが読むmachine JSON・期待値・実行設定・検証入力は不変。fixture／反例・normal3/3・元run禁止受入・reader3＋3・qualityの実行証拠は[09.11最終受入](#tsk-0911-最終受入)を参照する。

既存証拠の有効条件は関連source・master・入力・期待値・fixture・到達対象・設定が一致することである。rawがある場合の照合付き再利用と、raw不足後のGit歴史受入記録を区別する。新変更・反例・identity不一致が発生した範囲だけfresh局所検証へ戻り、同条件の全matrix／全audit／qualityを繰り返さない。補助probeの最初の作成commandは環境保護hookに拒否され未実行。読取対象を有限allowlistと固定形式に限定したprobeで上記照合を保存し、秘密値を取得していない。

Flow closure: N/A: 保持契約・文書再開の収束のみ。canonical state／outcome・実行／書込経路は不変。反証は上表の保存能力と固有入力に限定する。

### STEP 2 受入

**判定: STEP 2完了、対象内Blocking0。09.1全体はin_progress、09はblocked。** 承認された6文書へA0〜A9の保持する意味・固定identity・移管先／retain理由・参照期間・取得／不足時操作・限界を反映した。旧bundle契約は履歴へ限定し、A0の現行入力を旧path復元から切り離した。A3の固有内容は原位置にretainし、旧referenced_skills／nice_itemの完全原入力再現を成立へ補完していない。この歴史能力の制限は現行回帰の入手条件を妨げず、後続の削除・処遇を承認する判断でもない。

| STEP 2の条件／関連Contract | 判定・有効な証拠 | 残る全体義務 |
| --- | --- | --- |
| 全意味値・inventory／digest・移管元を保持 | Verified: 09.11のmigration原receipt、80条件／34640record・aggregate一致、固定source18件／80gzipの開始照合 | 新しい期待値承認・意味変更は範囲外 |
| 固定identity・入手／再開・不足時拒否／DX-ART-001 | Verified: A表・README・A3個別retain、09.11の元run禁止別rootreplay／実mergeと11反例・六クラスを継承。部品／文書検査だけを実利用の根拠にしない | 処遇後の別checkout文書導線はU6／STEP 6 |
| 固有根拠と原byteの期間・限界／DOC-CLOSE-001 | Verified: OC原inventory内容・入力差、HP5＋2実receipt、A8元3blobを確認。原byteの永続保証・完全原採取再現を主張しない | U1／U2／U7のrole・successor・歴史導線はSTEP 3、metadataと実処遇はSTEP 4 |
| 文書契約・registry整合／DOC-REV-001・DOC-LINT-001 | Verified: `pnpm test:docs`6/6・docs integrity、6文書の書式、変更14参照・anchor／tracked target・A0〜A9全10row、差分境界を確認 | DOC-P6全tracked構文／kind／negative fixtureはSTEP 5／6未達。既存6test成功へ代入しない |
| identity・判断・証拠・次操作／DX-HANDOFF-001 | Verified: start-input、review-before-record、最終差分検証とTask Handoff、09.11 source／入力同一条件の継承 | 09.1全体ContractとTS-FINAL-001／RK-FINAL-001は未完了 |

初回文書ゲートは6test成功後にregistryのevidence index版同期漏れ1件でexit1となった。元logは`docs-before-record.{stdout,stderr}.log`へ保持し、修正後の`docs-pre-record.{stdout,stderr}.log`は6/6・docs integrity成功。書式logと`review-before-record.json`は38保全receipt・6文書境界・追加14参照・固定revisionのbaseline／fixture82file・10保持row・継承proofを確認する。HandoffへU1の未登録routing noteを直接参照した結果記録後の検査も、登録不足1件でexit1になった。`docs-final.{stdout,stderr}.log`に保持する。STEP 3の登録を先行せず、Handoffから台帳U1の対象rowを辿る再開操作へ修正した。U1は未解決のままで、対象を検査から除外したり登録済みと扱ったりしていない。修正後の最終文書・書式・差分ゲートで閉じる。詳細と最終差分identityは`.test-results/tsk-09-1-retention-closure-20261001/manifest.json`から辿る。調査manifestは長期正本やreader入力にしない。

09.11の全値移管・実merge／反例・元run禁止受入・性能・qualityは同条件証拠を継承した。READMEの説明を除くsource17/17、直接owner・CI／cleanup・入力／fixture・machine evidenceは不変で、全matrix生成・全audit・qualityを再実行していない。今回の検証は原proof・identityと文書差分の照合で、展開本文／全歴史graphのfresh再hashやネットワーク取得の新成功を主張しない。

U5とU6のSTEP 2分はVerified。未達はU1／U2／U7のSTEP 3処遇、U3／U4とU7のSTEP 4〜6、U6の処遇後checkout導線、09のproject closure。STEP 3の具体的再開はTask Handoffを正本とし、今回は実行しない。原証跡・旧bundle・未追跡3prototypeを保持し、cleanup／物理削除／外部公開・転送／commit／pushは行っていない。


## 旧bundleの縮小・廃棄判断（TSK-09.12）

以下は09.12完了時の判定と検証の履歴である。現在の処遇条件は本節末尾の09.13追補を参照し、旧部分保持package・移管手順を現行再開条件へ戻さない。

**09.12完了時の判定: 判断完了、対象内Blocking0。A3のHP固有内容7object・全33原pathと出自metadataを別保存して取得受入後に旧bundle全体を廃棄する部分保持案。文書・局所反証の必須ゲートは成功。物理処遇・移管・取得受入は未実施。** 利用者は2026-10-02に現行コード・正本・固定入力に基づく計画へ「OK」で、限定調査・必要な補助実装・文書更新・検証・Handoffを承認した。削減量を目的にせず、原内容と能力から判断した。09.1 STEP 3〜6と09は実行していない。

### 不使用方針による追補の境界（TSK-09.13、定義時の履歴）

利用者の「旧バンドルはそもそも使わない方向」「改めて先にTASK整理」により、部分保持packageの作成・移管を既定の次操作とする方針を変更した。現行・後続の直接consumerと保持義務からA3の必要性を再判断し、過去の原内容・出自の再監査能力を手放せる範囲を確定する。進捗・計画確認gate・完了条件は[Task 09.13](../tasks/development-redesign-tasks.md#tsk-0913-旧bundle非依存確認廃棄条件確定)が所有する。

定義時は順序整理のみで、以下のA3 retainを取り消しておらず、全廃棄可能とも判定していなかった。現在の保持解除・能力損失・廃棄条件は末尾09.13追補が所有する。09.12の全entry／共有object・容量・identityと局所反証を継承し、新しい根拠が必要な判定deltaだけ調べる。原内容を不要と判断する場合は能力損失を明示し、digest・判断記録・小fixtureを原内容の代替として成功へ繰り上げない。移管は具体的な保持義務が残る場合だけ実処遇の前提とし、全廃棄が成立する場合は要求しない。原bundle・原run・既存調査artifactは保持する。

### 開始identity・直接経路と証拠の有効範囲

HEADは`dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4`。定義manifestに対して既存6文書差分・未追跡3prototypeのbytes／SHAが一致し、保存した開始snapshotは`.test-results/tsk-09-12-disposition-20261002/start-input.json`。別の編集sessionはprocess名・worktreeの観測範囲では検出しなかった。in_progress最大1件を守るため、判断中だけ09.1を完了済みSTEP 2と未達STEP 3〜6を保持したreadyへ置き、09.12をin_progressにした。判断受入後は09.1をin_progressへ戻す。09はblockedのまま。

原bundleは`.test-results/tsk-09-1-step2-20261001/bundle-k1`。index2927670 bytes／SHA `b2e59bb66822b337a2a300524fb77c9c1403b9152619ddd8b0c0dbfea89f1a7a`、membership3501481 bytes／SHA `b73fca0d9b1db83efa93caa1f4c3687d5e2594b99f5c31ad6fae65f25e8d6eb4`。9,856entry、2,015object、metadataを含む2,017file／485542196 bytesを確認した。全圧縮objectのbytes／SHAと実file集合が固定indexに一致する。

| 現在成立する経路 | 保持する能力と判断への含意 |
| --- | --- |
| `tsk-06-5-production-closure.json`のsource declaration→`productionRegressionBaseline.ts::readProductionBaselineManifest／Condition`→`production-matrix-records.ts::verifyProductionMatrixRecords`→`merge-oc-matrix.ts` | 固定repository baselineの全80条件・34640recordを受け入れる。manifest不足・破損はtyped失敗。旧bundle・元run・別版へfallbackしない。A0原manifest／本文のbyte再監査は別能力 |
| `replay-production-baseline.ts`→同baseline・partition fixture→新8shard／condition出力→実merge | 保存本文readerの再開。damage producerを再実行した成功や歴史rawの復元とは区別。現行baselineの取得に旧bundleは不要 |
| `evidence-preservation.mjs::packEvidence`→観測SHAごとのgzip・原path別entry・宣言差分、`readPreservationIndex／verifyBundle／restoreEvidence`→新root | 原byteを正規化せず保存し、固定metadata・圧縮／展開receiptを検証して原pathへ復元するlocal prototype。K1全履歴のbyte復元能力は現在このbundleで保持できる。別環境の取得契約・長期保存サービスとしては採用しない |
| `evidence-preservation-references.mjs::collectOwnedReferences／checkRestoredReferences` | quality子manifestのbase、reconciliationのrepository-relative path、コピーされたshardのbaseを区別する。固定A0・全K1を要求する後者のCLIは部分保持案の受入には使わない |
| `test-results-cleanup-lib.mjs::planTestResultsCleanup`、CI upload | canonical timestamp direct childの最新10完了run／running保護、手動名対象外、CI14日。原runの存在や手動名directoryの対象外は独立保持保証にならず、cleanupは実行しない |

09.11 source17件（STEP 2で説明を変更したREADMEを除く）、直接owner9件、baseline／fixture82file、proof8件が固定receiptと一致した。全値移管、正常3/3、六クラス、実merge11反例、元run禁止の別rootreplay／実merge、reader3＋3、quality1603／157／29を同条件で継承する。K0全byte復元とK1同一entryの継承＋884追加、41,240参照／未解決0も継承。今回は全圧縮identity、必要な7本文と直接宣言owner8fileを確認し、全9,856path復元・全matrix・全audit・qualityは繰り返していない。ネットワーク取得・新規依存installの成功を追加していない。

### 全entry／共有objectの対応と判定

A0〜A9の現行契約を使う。元machine evidenceの意味ownerの固定pointer（formalRuns、classJoin、primitiveInventory、publicProofs、独立receipt、serializedGateClosure、nonfinite受入、audit、quality、調査記録）とA0移管先の`origin`から全89seedを対応付け、既存41,240edgeをforwardに辿った。全9,856entryに根拠root／pointer／到達ownerを持たせ、観測SHAで全2,015objectとその全aliasへ結合した。dirnameだけで意味を決めず、同一entryの複数A所属を保持する。rootからの所属と、同byteobjectの保持理由は別であり、aliasを同じ採取runとして統合しない。

以下の「失う能力」は、原runに依存しない旧bundleからの復元・再監査能力を指す。元runと固定receiptが揃う間の条件付きbyte照合は可能だが、今回全entryについて独立した保管・外部取得保証は成立していない。原bundleが唯一のbyte実体かを全件断定せず、必要なA3原位置の存在確認と保証済み取得先を区別する。

| 集合 | 判定・保持する結果 | この案の実処遇後に失う能力／不足時対応 |
| --- | --- | --- |
| A0 | 原81pathは削減候補。専用baseline80本文・index、source／master／fixtureは固定revisionから取得 | 原manifest形式と原runの全byte再監査は失う。回帰入力不足は同revisionを再取得し、旧bundle・新producerで補わない |
| A1 | 原正式3＋3の判断・条件・性能はGitへ保持。旧matrix／shard／ranking／logは削減候補 | 元測定byte照合を失う。当時の正式測定とfresh／replayの条件を混同しない |
| A2 | 六クラスの意味fixture・command・判断を保持。capture／完全runは削減候補。A3同byteobjectのaliasは保持 | 六原captureのbyte照合・当時のrunner graph再監査を失う。必要なら同revisionでfresh六クラスへ |
| A3 | 以下の固有内容7object・全33aliasと原宣言40件を保持。OC inventoryはbundle外の原位置retain。HP proof coverage等のその他調査出力は削減候補 | 保存した原cells／consumer paths／published payloadは閲覧・検査できる。除外する完全manifest／run／環境logのbyte再監査は失う。原採取の完全再実行は現在も未成立 |
| A4 | 現行reader test・実merge反例定義・歴史findingを保持。過去raw／破損JSON／宣言SHA不一致／registry／完全診断は削減候補 | 過去bugの実byte再監査を失う。現testで過去不正JSONの原文を再現したとは主張しない |
| A5 | value-domain test・全expected・fresh生成command・採用判断を保持。旧normalコピー・1024診断・reader5反例は削減候補 | 元normal／writer／readerのbyte照合を失う。fresh生成と原runの再現を区別する |
| A6 | audit suiteと登録／到達／再利用条件はGitへ保持。旧run／reachability／receiptは削減候補 | 全原receiptによる照合付き再利用を失う。原run不足後は歴史受入記録、必要な新Taskではfresh auditへ |
| A7 | quality成功・失敗・帰属とsource条件はGitへ保持。完全log／trace／親子graphは削減候補 | 成功・失敗双方の全byte再監査を失う。新qualityの成功で過去失敗を上書きしない |
| A8 | bundleに0entry。指定Gitの歴史PNG保持契約は不変 | 別checkoutのhistory取得・link処遇は09.1 STEP 3／6未達。今回新成功へ繰り上げない |
| A9 | 本台帳／Taskの判断と固定identityを保持。全調査履歴は削減候補。部分保持用の新metadataは以下に固定 | 元調査receipt package全体のbyte再監査を失う。新artifactは判断補助で、現行reader入力や恒久正本にはしない |

保持は固有内容・出自と必要な到達を基準にする。削減候補は現行回帰へ移管済みの旧入力、または能力損失を明示できる調査byteであり、参照だけを永久保持義務へ変換しない。所属・receipt・到達が不明なら不足保留とする。今回の未分類entry／object・不足保留は0。これは外部取得・移管が済んだという意味ではない。

### A3の保持object・固定identity

各objectは`objects/<下表SHA>.gz`。全33原path・圧縮receipt・各source pointerは補助artifactの`proposed-index.json`、`retention-provenance.json`へ固定した。SHA一致はbyteの同一性だけを表し、独立採取の回数・run identityを同一視しない。

| 内容 | 原本文bytes | 圧縮bytes | 原path数 | 原本文SHA256 |
| --- | ---: | ---: | ---: | --- |
| HP cell inventory | 15858817 | 249227 | 5 | `e75e1a6df8f357761d3c18300b52c7194b6f64010578df1884ac7832089054b2` |
| calculator paths | 76442496 | 3048482 | 5 | `1b6489abcec764eef5c8fca000a68f4c166315bbedd632871a7efadd0bd3b0f7` |
| ranking paths | 454523 | 13042 | 5 | `0ccf3fcf069eda94872f00455af55263e26e85462c6d89324ad026e42590a2da` |
| craft essence paths | 2633580 | 52030 | 5 | `be4c70c99862441030e3379a8f306f20d9310542191f39371a047786fabac729` |
| support paths | 1201235 | 37683 | 5 | `8be7cf6f603a61d407f488aa2c6cb40667a38307f3fc3fb2365f06f1d8c120f7` |
| published operation | 3745283 | 76320 | 4 | `8c7f21e35155f09c13c9e065e5bbb89cf5931a81239875373a069312d28cacb0` |
| published dependency | 13843717 | 387603 | 4 | `da5f0bed664c31b46226bd881d1cfa0caa1b076739e1b8c6b864aef61af707fe` |

HP内容の原位置7fileとbundle外OC inventory989349 bytes／SHA `7b191e653a3637de8ba8b83ace7ea959f7a57845488a34c7277708cbaf88c484`の一致も確認した。ただし原runの現存を独立した保持先の保証へ使わない。特にtimestamp原runはcleanup候補となり得る。OC inventory・raw exportsは今回の処遇対象へ加えず、前節A3のretainと`referenced_skills`不一致／`nice_item`当時identity不足を継承する。原raw再採取は再実行していない。

retain条件は、保存された原cells・metadata／public join、独立HP内容、元consumer path・原宣言を検査できることである。小fixture・件数・digestだけへ置換する案は不成立。7本文は圧縮／展開bytes／SHAをfresh確認し、artifact path値の追加参照が0件だった。原位置不足時は固定identityを指定して取得し、取得できなければ該当原内容の再監査を未成立とする。能力を捨てるならA3 retain判断の変更と具体的損失を別途明示し、本案の削減候補へ暗黙に含めない。

### 容量・共有到達と三案の比較

| 指標 | 現在の全保持 | 部分保持案 | 削減候補object／path分 |
| --- | ---: | ---: | ---: |
| 原path数 | 9856 | 33 | 9823 |
| distinct object数 | 2015 | 7 | 2008 |
| 圧縮object bytes | 479113045 | 3864387 | 475248658 |
| 全path復元bytes | 45838222236 | 553309255 | 45284912981 |
| distinct object展開bytes | 9046896940 | 114179651 | 8932717289 |
| metadata bytes | 6429151 | 66859 | 新旧metadataは別集合 |
| package file bytes | 485542196 | 3931246 | 新package受入後の差は481610950 |

部分保持metadataは提案index9320＋membership11851＋provenance45688 bytes。新保存実体・移管log・取得検証artifact、固定repository checkout2392104 bytesのmachine sourceや依存環境、filesystem overheadはpackage比較に含めない。file bytesをdisk占有量とは呼ばない。全33pathを復元する場合は553309255 bytes、object内容を一回ずつ扱う場合は114179651 bytesであり、両者を混同しない。

- 全保持はK1の全原byte復元・歴史graph再監査を残すが、現行回帰には不要な全履歴と485542196 bytesを保持し続ける。外部取得保証と原raw不足も解決しないため採用しない。
- 部分保持はA3の固有内容と原path／宣言の検査能力を残し、不要な全履歴再監査能力を明示して手放せる。33aliasを残しても圧縮object量は増えず、元path対応を保つ利益があるため採用する。
- 無移管の全廃棄はA3内容を原runの現在存在に依存させるため不成立。別保存の取得受入後に旧bundleを全廃棄することは本部分保持案の最終操作であり、固有内容自体の全廃棄ではない。

全2,015objectの到達pathを列挙し、保持pathが一つでも使うobjectはretainとした。保持objectの全alias33件を残すため、共有objectを削減できると誤判定しない。候補2,008objectは保持pathからの到達0である。

### 参照整合・反証と能力損失

部分保持index／membershipは33path・7objectで相互coverage一致、object未宣言・余剰object・dangling target0。保持原fileからの既存manifest参照edgeは0、7本文内のartifact path参照も0。元runner／reconciliationのうち保持本文を直接宣言する8ownerから原宣言40件を抽出し、原文のpath／bytes／SHA／baseとsource pointerを`retention-provenance.json`へ残した。40件のactive targetはすべて33保持pathへ到達する。

同metadataの`owner／ownerReceipt`は、除外する元manifestの**historical locator**であり復元・取得依存ではない。元manifest本文を保持したとは主張せず、除外と能力損失を同metadataにも明示する。原宣言の内容を保つことと、原manifest全文・完全graphのbyte再監査を保つことは別である。固定machine sourceはrevision `dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4`、2392104 bytes／SHA `bdb8ca0aae586ed52356a4a589b32239232561d2becf12539e1d6f03aac0a329`から取得する。

元41,240edgeはすべて除外ownerの歴史graphとして処遇表へ記録し、縮小後の有効な復元参照として残さない。不正JSON1file、null宣言2観測、宣言SHA全0と観測SHAが違う1target／4edgeは元のまま記録し、削減候補にした。将来失う原反例byteを現test成功で代替したとは言わない。

独立checkerは全entry／objectのcoverageと容量保存則、A3全alias／原宣言targetを検査し、memory内の6反例（共有objectだけ除去、aliasだけ除去、membership target追加、原宣言のtarget欠落、宣言SHA置換、未知index項目）を拒否した。初回checkerはrepository-relative原宣言を相対baseへ誤結合して失敗した。原参照ownerの既存規則に合わせて修正し、初回stderrを保持して最終成功と区別した。別path探索・別版・fallbackは追加していない。最初の文書ゲートは6test成功後に09.12のContract表未認識でexit1となった。既存parserが厳密な`Handoff:`を表の終端として要求するため、checkpointの見出しをその既存形式へ直した。parser実装や09.1 STEP 5は変更していない。

### 別の明示依頼で実施する処遇手順と停止境界

以下は09.12完了時の部分保持案に対する条件付き手順の履歴であり、09.13で非採用とした。現在の実施指示・再開条件ではない。現行の全廃棄条件は末尾09.13追補を使う。全廃棄が成立する場合にこの移管手順を要求せず、部分保持が必要と判明した範囲だけ更新して適用する。物理削除はどちらの判定でも別の明示依頼まで行わない。

保持期間はA3の原内容・出自検査能力を参照する期間とし、新しい日数期限を設けない。新保存先の候補は未使用の`.test-results/tsk-09-12-a3-retained-20261002/`。local実体の保持owner・バックアップ／外部取得先・取得権限は未契約であり、実処遇依頼で必要な取得環境とともに指定する。手動名のcleanup対象外を永続保証へ読み替えない。移管先が決まらず必要能力の取得を受け入れられない間は、原bundleをそのまま保持する。

1. 実処遇依頼で、保持33path／7object、候補9823path／2008object、上の能力損失、保存先・owner・取得環境を指定する。元run・OC inventory・raw exportsは削除対象にしない。
2. 原index／membership・対象7objectと、以下の提案metadata identityを再確認する。不足・SHA不一致・原raw取得不能を別版／別pathで補わず停止する。調査artifactが不足した場合は本節の固定原identityから新artifactへ処遇表を再構成して照合し、既存正本のidentityを黙って置き換えない。
3. 未使用の新保存先へ7gzipをbyteのままexclusive copyし、提案indexを`index.json`、membershipを`membership.json`、provenanceを`retention-provenance.json`として保存する。原bundleのmetadata・gzipを編集・再圧縮しない。これは今回未実施。
4. 固定prototype収録commit `39844a1c622cd9ba13cd5f558ec9b50ea9339bb3`から下記SHAの3scriptを取得し、下のverify／restoreを実行する。回帰入力・source declarationの取得revisionは基準`dd1a0eb`のままとし、prototypeの収録commitと区別する。これは既存local byte検証mechanismの限定利用であり、汎用サービス・product経路への採用ではない。source declarationも上の固定revision／SHAを取得する。元bundle・原runへアクセスできない別root／環境で新保存先だけから取得し、圧縮／展開receipt、33原path、原宣言40target、source identityを照合する。取得・復元・出自照合の完全receiptを保存する。
5. 移管・取得受入成功と必要な保持契約を確認してから、旧bundle全体の廃棄を別の明示依頼の対象として実施する。new packageの不足時は固定packageを保持ownerへ再取得要求し、元run探索や別SHAで補わない。取得不能ならHP原内容再監査は未成立と記録する。

固定提案metadata（まだ新保存実体ではない）:

| file | bytes | SHA256 |
| --- | ---: | --- |
| `proposed-index.json`→新`index.json` | 9320 | `8f19d6c0cd037eef76047cff58ab97310396bb7e745081ac056b200978f629ae` |
| `proposed-membership.json`→新`membership.json` | 11851 | `6675ef0283b04ac2381abfb4c433a828f3c7f06740e9391cf75142832b428c3e` |
| `retention-provenance.json` | 45688 | `5464d5a3fb33cc49ebc56840fbe948a27b3d18673a1cd27fe57e44758c6d02b2` |

取得後の検証command例（今回実行していない。保存先／復元先は未使用pathへ固定する）:

```sh
node scripts/evidence-preservation.mjs verify .test-results/tsk-09-12-a3-retained-20261002 8f19d6c0cd037eef76047cff58ab97310396bb7e745081ac056b200978f629ae
node scripts/evidence-preservation.mjs restore .test-results/tsk-09-12-a3-retained-20261002 8f19d6c0cd037eef76047cff58ab97310396bb7e745081ac056b200978f629ae /tmp/fgo-tsk-09-12-a3-restored
sha256sum .test-results/tsk-09-12-a3-retained-20261002/retention-provenance.json
```

prototype bytesの固定identityはpreservation12065 bytes／SHA `e9ab1f4a493f0ff33a76bf0662d2d02a10396382490ece5caa4fbca05a9681ec`、references6897 bytes／SHA `422f4d17be5cf1920ba524ac7aadf6295637163a57aebf965291f9add39e7769`、test7049 bytes／SHA `d841c880d920b4ccbccfc1f37b142771da50befd00d88cf8c1d5ff4ac1ec7220`。判断時は未追跡だったが、後続の利用者依頼「資料などはコミットして掃除」により、同bytesの3fileをcommit `39844a1c622cd9ba13cd5f558ec9b50ea9339bb3`へ収録した。local Git objectから3/3のbytes／SHA一致を確認した。取得先repositoryにこのcommitがなければ指定commitの取得を依頼して停止し、別版で補わない。ネットワーク取得・移管後の別root受入は未実施で、現行baselineはこれらに依存しない。

原bundleの書換え・間引き・移動・再圧縮・物理削除、原run削除、results:clean、外部公開・転送は今回の停止境界外。現行baseline・expected・damage／ranking／state／outcome、旧prototype・raw exports・他の調査directoryを変更せず、commit／push、09.1 STEP 3〜6、09へ進まない。

### 調査成果・検証・Handoff

補助コードは新調査artifact内の`analyze.mjs`と`check-proposal.mjs`だけ。全entryの根拠・宣言／観測・共有object処遇、容量・参照と反例を検査する必要があり追加した。製品code・保存／cleanup設定は変更不要だった。原物を変更せず、完全結果は`.test-results/tsk-09-12-disposition-20261002/`へ保存した。

- `root-map.json`、`entry-dispositions.json`、`object-dispositions.json`: 全entry／objectの根拠・保持／削減候補、全alias。
- `object-identity.json`、`a3-content-inspection.json`、`reference-dispositions.json`: 全圧縮receipt、7本文の展開receipt・追加参照、全edge・元破損／宣言差分と処遇。
- `proposed-index.json`、`proposed-membership.json`、`retention-provenance.json`、`summary.json`: 一つの部分保持案、metadata固定identity、容量、未実施条件。
- `proposal-verification.json`、`reuse-identity.json`、完全stdout／stderr: 独立反証6件、原位置8file、source／baseline／owner／proofの同条件照合。初回checkerのbase解決失敗も保持。
- `manifest.json`: 最終文書・書式・参照／状態・差分のgate、開始／最終identity、原物未変更、未移管・物理未実施と次操作。

最終文書受入は`pnpm test:docs`6/6・docs integrity、4文書のPrettier、差分・参照／状態照合で閉じた。最初のContract表未認識とcheckerのbase誤結合は失敗logを保持し、成功で上書きしていない。結果記録後も同じ入力・原物を保持し、最終receiptは上記manifestを参照する。

後続の資料整理（2026-10-02）: 判断文書と保存規約は`a6b7b5e`へ収録済み。未追跡3prototypeは既存調査probe2件と実処遇の検証手順が直接参照するため、原path・bytesを保持した検証資料としてcommit `39844a1c622cd9ba13cd5f558ec9b50ea9339bb3`へ収録した。追加した保存実体は3file／26011 bytesで、新しい実装やproduct経路への接続はない。完全調査結果と補助probeは既存のignored `.test-results/`に置き、別のtmp directory・広いignore規則は増やさない。原bundle／原runは移管検証が未達のため維持し、削除・移動・再圧縮・results:cleanは実行していない。過去のmanifest／SHA・未追跡という判断時記録は書き換えず、取得条件の更新を本節とTaskへ記録する。

Flow closure: N/A: 原調査artifactの処遇判断のみ。canonical state／outcome・製品execution／write経路は不変。判断完了と物理処遇未実施を分け、最終進捗と次操作は[TSK-09.12 Handoff](../tasks/development-redesign-tasks.md#tsk-0912-旧bundleの縮小廃棄判断限定調査)を正本とする。


### 09.13 不使用方針による最終処遇判断

**採用判断: 旧bundle全体の廃棄条件確定、A3のHP原内容を別保存する義務を解除。09.13判断完了・対象内Blocking0、物理処遇は未実施。** 利用者が2026-10-02に提示計画へ「OK」で、全廃棄判断・限定調査・必要な補助実装・6文書更新・局所検証・Handoffを承認した。09.12の部分保持案をbyte重複やfixture移管の成功として変更したのではなく、現在必要な能力から歴史原内容の再監査を手放す判断へ変更した。新しい部分保持package、pin、外部取得契約を作らない。

#### 入力identityと直接consumer

開始HEADは`ce9cea06712642d67b51e0d1a8997d4a58077967`。利用者のTask整理による4文書差分を入力として保存し、上書きせず追補した。入力snapshotと既存差分は`.test-results/tsk-09-13-nondependence-20261002/start-input.json`／`pre-existing-document-diff.patch`。観測範囲で別編集sessionは検出せず、一覧のin_progress0から09.13だけをin_progressにした。観測は排他lockの保証ではない。

固定baseline取得revisionは`dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4`、prototype収録commitは`39844a1c622cd9ba13cd5f558ec9b50ea9339bb3`。現行HEADと混同しない。旧index2927670 bytes／SHA `b2e59bb66822b337a2a300524fb77c9c1403b9152619ddd8b0c0dbfea89f1a7a`、membership3501481 bytes／SHA `b73fca0d9b1db83efa93caa1f4c3687d5e2594b99f5c31ad6fae65f25e8d6eb4`は不変。09.12全entry／object／参照対応・body inspection等10成果物の固定receiptと、source17・直接owner9・baseline／fixture82・proof8の計116identityは一致した。prototype3件も固定commitのbytes／SHAと一致する。

| 直接経路 | 現行入力・不足時動作 | 旧bundleとの関係 |
| --- | --- | --- |
| `productionRegressionBaseline.ts::readProductionBaselineManifest／Condition` → `production-matrix-records.ts::verifyProductionMatrixRecords` → `merge-oc-matrix.ts` | source declarationが指定するrepository baselineと80gzip、指定outputの8shard／condition本文、published master。固定receipt・schema・identity・coverageと全値／gateを検査。不足・破損は失敗／非zero、完全診断を指定outputへ保存 | bundle・元run・別版探索なし。baselineの`origin`は原採取を示すhistorical locatorで取得先ではない |
| `replay-production-baseline.ts::replay` | 同baselineとpartition fixtureから新directoryへ保存入力を構成。原runを読まない。不足・不一致は停止、途中directoryを成功証拠にしない | 保存reader再開は非依存。damage producerの再実行や歴史採取の復元ではない |
| `productionHpPaths.test.ts` | published masterからHP cells／calculator／ranking／CE／support経路を生成し、新artifactへ出力 | HP5原本文を読まない。現行監査は原内容・原runの再現とは異なる |
| `productionMasterControlAudit.test.ts` | published masterと元control requestを現processで生成し、operation／published dependencyを新artifactへ保存・読み戻し検査 | 保存済み旧2本文は入力ではない。旧request／native／consumer joinのbyte再監査は別能力 |
| `audit-oc-planning-baseline.mjs` | 明示raw4fileとpublished masterから新OC inventoryを生成 | 既存OC inventoryは入力ではないが、歴史raw cells／metadata joinの固有内容。bundle外契約は不変 |
| `evidence-preservation.mjs`、同references／test | 明示membership・新bundle、または明示bundle／固定SHA／新root。testは小さい一時fixtureを作る。referencesの全K1 CLIは元A0／全graphを要求 | prototype比較・歴史復元の明示経路のみ。通常quality／matrix／再開へ接続しない。旧K1照合commandはhistorical operationで、今後の通常検証へ使わない |
| `planTestResultsCleanup`、`clean-test-results.mjs`、CI | timestamp direct childの最新10完了run／running保護、手動名対象外、CI14日 | bundle・原runの現存とcleanup除外は独立取得保証ではない。実行・設定変更なし |

09.1 STEP 3〜6はrole／後継・意味規則・metadata・tracked参照・固定baselineの入手／文書再開を閉じる。TSK-09は同条件証拠と未達の対応、必要なproduction／parity／UI／fail-closed／性能／qualityを閉じる。どちらも旧HP原byteの再監査を必須成果にしていない。STEP 2のHP retainをそのまま継承する文言は本追補へ同期する。後続Taskが歴史原内容を新たに必須とする場合は範囲の再判断が必要で、fresh監査・fixture・digestで原内容を補わない。

#### A3の保持解除と失われる固有能力

| 内容 | 主な原内容・出自の能力 | 09.13判定 |
| --- | --- | --- |
| HP cell inventory | 当時の15858817 bytesのprimitive cells・sources・metadata、7470 cell／486 sourceの原内容再監査 | 保持解除。現行監査入力ではなく、歴史原内容の再監査を手放す |
| calculator paths | 当時の76442496 bytesのcalculator入力・consumer path・結果の再監査 | 同上 |
| ranking paths | 当時の454523 bytesのranking入力・consumer path・結果の再監査 | 同上 |
| craft essence paths | 当時の2633580 bytesのCE入力・consumer path・結果の再監査 | 同上 |
| support paths | 当時の1201235 bytesのsupport入力・consumer path・結果の再監査 | 同上 |
| published operation | 当時の3745283 bytesのrequest／選択operation／attemptの具体joinとoriginalArtifact同一性の再監査 | 同上 |
| published dependency | 当時の13843717 bytesのpublished request／native／consumerの具体joinとoriginalArtifact同一性の再監査 | 同上 |
| bundle外OC inventory・raw exports | rawOc167／632 cell、metadata／public join、採取head／raw identity。不一致referenced_skills・当時nice_item identity不足は解消していない | 原位置retain／個別処遇保留を維持。今回の廃棄集合に含めない |

上7objectの本文・圧縮SHAと全33aliasは09.12の固定表が所有する。本追補は独立disk receiptの検査能力、33pathの採取／run identity、原宣言40件との照合能力を解除する。全33aliasを同一採取として統合せず、全到達が保持不要になったことから7共有objectを廃棄候補とする。残る原runの現在存在を移管先・独立保証へ使わない。HP原位置の将来取得・移管義務も解除するが、原run自体の物理処遇は依頼対象外であり、既存調査policyと原物を変更しない。

固有原内容は小fixture・件数・digest・Git判断記録で代替できない。原内容のbyte列は移管しておらず、その閲覧・検査・出自再照合を今後保証しない。Gitに保持するのは採用判断、当時の条件・固定identity・inventory／digest・意味規則の所在である。原byteが別途残る期間の条件付き照合と、旧bundleからの独立復元能力を区別する。

保持基準は現行／後続の具体consumer・必須契約・必要能力があること。廃棄基準は移管済み回帰入力、または再監査能力の手放しを明示承認した歴史調査内容である。不明な所属・receipt・到達・必須義務があれば不足保留とし、全廃棄判定を停止する。今回の判定deltaの未分類／不足保留は0。

#### 全処遇対応・最終形・参照

09.12の全9856entry／2015object対応表を改変せず固定入力として再利用した。`.test-results/tsk-09-13-nondependence-20261002/disposition-delta.json`は旧表の固定receipt、変更33entry／7object、原宣言40件のhistorical化、全coverage・容量を保持する。旧9823path／2008objectの候補判断は継承し、A0〜A2／A4〜A9の能力損失は09.12表と同じ。A3だけをretainから廃棄候補へ変更し、最終保持path／objectは0。元graph41240edgeは全てhistoricalで、現行の復元targetにしない。

| 項目 | 元bundle | 物理処遇後のbundle保持集合 |
| --- | ---: | ---: |
| path | 9856 | 0 |
| distinct object | 2015 | 0 |
| 圧縮object bytes | 479113045 | 0 |
| 復元path bytes（alias含む論理量） | 45838222236 | 0 |
| distinct展開object bytes | 9046896940 | 0 |
| index＋membership metadata bytes | 6429151 | 0 |
| 実file bytes／file数 | 485542196／2017 | 0／0 |

これはbundle内集合の能力判断であり、原runの解放量・現disk使用量を示さない。09.12提案metadata66859 bytes／7gzipの新保存は採用しない。旧提案index／membership／provenanceは09.12比較資料として元ignored directoryに残すが、処遇後の有効な取得物・保持集合ではない。

最終形に残す有効入力は同revisionのsource declaration／published master／専用baseline／fixtureと現在のcommand。判断の正本は本台帳、進捗・次操作はTask、契約はテスト戦略§9、入口はREADME／registry／evidence indexとする。既存machine evidence・prototype3件はGitの比較・検証資料として保持し、現在の通常入力にしない。bundle外OC inventory／raw exports・歴史PNG契約は変更しない。

旧bundle／原run／旧部分保持metadataのpath、機械snapshotの`origin`・`originalArtifact`・原宣言は過去の所在と固定identityを示すhistorical locatorである。消失後の取得保証・現在のbyte検査targetではない。snapshotの本文を現在値へ書き換えず、roleは本追補で明示する。処遇後も旧bundleの復元を要求するcurrent Handoff・有効参照を残さない。09.12手順とprototype全K1 CLIは旧能力の履歴へ限定する。既存docs6testはJSON内historical locator全件の生存を保証する検査ではなく、今回の参照役割照合と区別する。

#### 別の明示依頼による物理処遇条件

対象は`.test-results/tsk-09-1-step2-20261001/bundle-k1`全体のみ。固定index／membership SHA、全2015圧縮object receipt、2017file集合・485542196 bytes、旧表と本判定deltaを入力にする。原run、親directoryの他receipt、OC inventory／raw exports、09.12／09.13調査directory、prototypeは対象に含めない。

1. 別依頼が対象と全履歴／HP固有原内容・出自再監査の能力損失を明示して承認する。09.13の判断受入だけでは削除しない。
2. 現行Task／consumer・保持契約に変更がないことと、固定index／membership・全圧縮receipt・file集合を読取照合する。保持pathから共有objectへの到達0、有効参照target0を確認する。不一致・未知file・未解決の必須義務があれば停止し、対象identityと必要操作を示す。別版・別pathへ探索して補完しない。
3. 確認したbundle directory全体だけを物理除去する。間引き・再圧縮・新packageへの移管、原run削除、`results:clean`を併用しない。
4. 対象の不存在、現行baseline／fixture／source／master・対象外実体の不変、current参照・再開手順・保持集合の一致を確認し、処遇receiptとTaskの実施状態を記録する。

全廃棄案には保持義務が残る移管対象がないため、別rootの7本文取得・33path復元／40target受入は要求しない。新しい必須consumerが判明した場合だけ全廃棄条件を停止し、具体能力・固定identity・保存owner／取得契約・元bundle／原run禁止の移管受入条件を再判断する。全廃棄のために最小packageを先に作らない。

#### 証拠の再利用・反証・受入とHandoff

原圧縮object2015件・全file集合・index／membershipを今回照合し、09.12の全entry／object対応と7本文inspection・原宣言target／全alias対応を固定identityから継承した。全bundle展開・全歴史graph再hashはしていない。09.11全値移管・正常3/3・実merge11反例・六クラス・元run禁止別root・reader3＋3・quality1603／157／29、STEP 2と09.12の局所受入は同条件の成立範囲で再利用した。新規ネットワーク取得・依存install・fresh damage成功へ繰り上げない。

今回の補助probeは新ignored directory内の`audit.mjs`と`review.mjs`だけ。既存機構は旧bundleの完全復元や部分保持案を検査するもので、保持義務解除後の全対応・能力損失・参照役割を照合しないため、今回の有限判定deltaの検査に必要だった。product・prototype・保存／cleanup設定は変更不要。`update-documents.py`／`record-acceptance.py`は6文書の一回限りの編集・受入記録補助で、恒久採用しない。完全結果とlog・receiptは同directoryに保存する。用途は09.13判断の診断、参照期間は判断・別依頼での対象照合に使う期間。参照終了時は既存調査policyの個別処遇候補とし、今は削除・移管しない。正本への再開は調査directoryの存在を前提にしない。

反証はmandatory原入力の廃棄、共有pathだけ保持したobject除去、objectだけ保持した全alias除去、historical locatorのactive target化、旧bundleを要求する再開、別SHA置換、fixtureを代替原入力とする主張、原byte廃棄後のbyte再監査主張、能力損失の省略、判断への物理削除混入の10件を拒否した。これと直接consumer／後続義務の照合を分け、fixtureや検査器だけから義務不存在を推論しない。

原byteが消失した後は過去の全receiptを使う新しいbyte照合を主張しない。Gitの当時の受入判断と、現在必要な契約の検証を区別する。source／入力／expected／fixture／到達条件／設定が同じで原receipt・byteが利用可能な範囲だけ照合付き再利用できる。不足があれば該当主張を撤回し、必要な契約へ限定したfresh commandを新artifactで実行する。fresh結果は歴史原内容の復元ではない。固定baseline不足は同revision再取得で停止・再開し、旧bundle・新producerでexpectedを補わない。OC原raw不足・不一致も既存限界のまま。

局所ゲートは処遇delta／参照役割・能力損失・Task状態・停止境界の照合、`pnpm test:docs`、対象6文書のPrettier、`git diff --check`。製品実装をしていないため全matrix／audit／qualityを追加しない。判定delta・consumer／参照役割・6文書境界・固定identity・Task状態の局所検査、文書6/6・docs integrity、対象書式・差分ゲートは成功。受入記録更新後も同じ文書・書式・参照・差分のゲートで閉じる。初回probeはrunner原宣言40件にsource宣言7件を合算した検査誤りで停止し、両集合を分離して成功した。初回reviewは2392104 bytesの固定Git source取得で既定buffer上限を超えて停止し、固定宣言bytesに限定した上限で成功した。失敗logを残し、原入力の変更・別版／別pathによる補完はしていない。最終receiptは同directoryの`manifest.json`から辿る。

Flow closure: N/A: 原調査artifactの必要性・処遇条件と能力損失の判断のみ。canonical state／outcome・製品execution／write経路は変更しない。最終Task状態、未達と09.1 STEP 3の次操作は[TSK-09.13 Handoff](../tasks/development-redesign-tasks.md#tsk-0913-旧bundle非依存確認廃棄条件確定)が所有する。判断完了と物理処遇未実施を分け、09.1の再開に物理削除を要求しない。09.13はdone、09.1はSTEP 1・2完了を維持してready、09はblocked。未達は09.1 STEP 3〜6・09と別依頼での物理処遇であり、09.13判断上の未解決ではない。

## STEP 3 DOC-P4導線・role収束

### 開始条件と変更境界

利用者は現行コード・正本・現在差分に基づく8文書計画へ「OK」と回答し、STEP 3の修正・必要な局所検証・文書更新・Handoffを承認した。開始HEADは`ce9cea06712642d67b51e0d1a8997d4a58077967`。入力の6文書差分はREADME、docs registry、evidence index、本台帳、テスト戦略、Taskで、09.13結果と先行Task整理を保持する。worktree一覧にはmainと既存prunable3件、可視processでは別編集sessionを検出しなかったが排他保証ではない。Task indexのin_progress0から09.1だけをin_progressへ変更した。固定baselineの取得revision`dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4`と現在HEADは別identityである。

開始文書snapshot・既存diff・保全identityと今回のreceiptは新ignored directory `.test-results/tsk-09-1-doc-p4-20261002/`に置く。変更はdocs registry／evidence index／本台帳／Task、routing note、E4、ranking-policy note、portable identity noteの8 Markdownだけ。root READMEとテスト戦略の入力差分は追加編集しない。全machine evidence JSON、固定baseline、製品・検査器・quality／CI・prototype・保存実体は不変。metadata一括移管、archive／Git-only処遇、STEP 5検査器拡張、STEP 6統合受入は実行しない。

### 直接経路と判定delta

| 対象 | 根拠・今回確定したrole／導線 | 保持する固有内容と限界 |
| --- | --- | --- |
| U1 routing note | [ADR-029](../adr/029-next-vercel-routing.md)・[data-flow](../guides/data-flow.md)・[UI契約](../requirements/ui-design-spec.md)と現行`layout → App`のpathname／lazy view／navigation、`startup → repository`のbyte・SHA／schema・参照検証／transaction activation／receipt読込、`sw.js`のpayload除外を照合。Eからsupporting歴史移行証拠として登録し、本文冒頭から現行契約へ接続 | Next移行`c216284`、cache`2a818bd`、startup`2c1a978`、route split`907f251`の配信量・検証時間・Verified flow・421／116／25は当時の測定。後続契約はこれらのbefore／afterを再現せず、測定を置換する後継なし。現receiptは`master-snapshot-v43.1`で、本文の旧測定／E2E番号を現HEAD受入へ代入しない。Implementation FMの移管はU3／STEP 4 |
| U2 TSK-08 root／初期2machine evidence | root doneだけでなく`currentReviewReference`と`implementationSelfReview.nonfiniteBodyReview.repairPlan.finalAcceptance`のpassed／Blocking0／mandatoryDeferred0／全義務／quality1588・157・29を照合。indexからそのpointerへ接続。初期diagnostics／shared-modelはbounded-unit-completeで、局所Complete・supporting歴史checkpointとして案内 | 元JSONのunresolved／nextBoundedUnit、units[0]〜[52]、capacity／give／transfer／HP宣言、失敗・性能・input／digest／commitをそのまま保持。正常0件／非empty fixture／未観測recoveryをroot doneで同義にしない。最終受入後の保存reader移行は09.11として別受入へ接続 |
| U2 resolved-attacker | 本文Step 2の`e16e5b0`、exact ATK join／zero fallback除去、quality426・116・25とPIR-001 handoff transaction追補を確認。計画時だけのindex Activeから本文Completeへ整合 | 元master`20260902.02`、422pair、failure scope、Step 1計画とStep 2／PIR-001を保持。現在のmaster inventoryへ書き換えない |
| U2 ranking／portable flow、旧E／Q | 採用された意味説明を現契約に接続するActive roleを維持。冒頭からrequirements、Task、TSK-08最終受入／09.11へ接続。indexのcanonicalは当該scopeの一次証跡と定義し、旧E／Qは歴史値と明示 | TSK-06.5当時のTSK-07 blocked、TSK-06.41 authoritative currentという当時の呼称、旧Unsupported／Deferred／数値／version／commitを保持。Task doneや本文Completeだけで機械置換しない |
| U7 E4画像 | E→E4→[原画像復元表](#e4歴史画像の復元)へ3linkを修正。本台帳の元commit／path／blob／bytes／SHAとlocal Git objectを照合し、shallow／不足時の指定history取得・停止操作を明示 | 3原画像のidentity・E4のviewport測定・damage／inventoryは不変。現mobile画像で代替せず、画像を現treeへ追加しない。別checkoutのhistory取得はSTEP 6、Git-only18snapshot処遇継承はSTEP 4のまま |

U1・U2・U7画像以外の全件判定はSTEP 1を継承した。E／Q reportと各bounded証拠は固有input／rule／damage delta／inventory／digest／version／commit／未対応scopeを持つので各本文をretainする。routingも固有測定があり統合不要。indexの途中status説明は元checkpointへの導線に収束し、元machine evidenceを編集しない。元本文と固有根拠を丸ごと統合・削除する必要はなく、削除件数を成果にしない。48 Markdown表rowは元47rowにrouting1rowを加えた登録件数で、tracked本文数の削減ではない。残る文書は既存親noteとSTEP 1台帳の経路を継承し、全対象をindexへ重複登録しない。

### 証拠の継承と局所検証境界

[docs-integrity-lib](../../scripts/docs-integrity-lib.mjs)の`validateRepository`はContract catalog／Revision log、version付きregistry行、ADR登録／status、Task依存／in_progress最大1／Contract closure、Task参照evidence／index件数を検査する。既存6testとCLIを`package.json::test:docs`が実行し、qualityのdocs stepが同commandを使う。全tracked link／kind別FMを検査する仕組みはまだなく、STEP 5で修正するTask区間parser／bounded出力も不変。今回のdocs成功をDOC-P6全件成立に読み替えない。

固定expectedの直接経路はTSK-06.5 JSONの`productionMatrix.canonicalRecords` → `verifyProductionMatrixRecords` → `readProductionBaselineManifest`／80gzip。376249 bytes／SHA `50cbcb378d8743a9a678df5415eae93e269ffcc12514ed18344ee6a2e074534a`、originは`60dea89944a884bbbe40464eb1ae7e65cb77ad4e`／394462 bytes／SHA `879af462bd3209ffaf18365a25598bbcf07e008b6164991d65355ad55cb1a95a`。現consumerは原run／旧bundleをfallbackに使わない。17の09.11実装・入力fileと全44 machine evidence JSON、今回確認した直接ownerは開始identityへ保全する。80本文の全hash・reader受入は繰り返さない。

09.11の全値・inventory／digest移管、正常3/3・実merge11反例・六クラス・元run禁止別root・reader3＋3・quality1603／157／29と09.13の非依存／全廃棄判断を、同条件の成立範囲で継承する。製品／入力／expected／fixture／到達条件／設定に変更がないため、全matrix／audit／quality／bundle復元は追加しない。原byte不足後もGitの歴史受入判断は参照するが、原全receiptによる新しいbyte照合や現HEADのfresh damage成功を主張しない。固定baseline不足は指定revision再取得、画像不足は指定history取得で停止・再開し、別版／別path／旧bundle／再生成で補わない。

補助`audit.mjs`は今回変更した登録集合・role／受入pointer・歴史pointerの所在・画像identity・参照と保全境界だけを検査する一回限りのprobe。全Markdown inspectorの代替ではなく、STEP 5へ恒久採用しない。`update-index.py`は長いindex行を限定更新する編集補助、`record-acceptance.mjs`は最終identity・log receipt・差分を記録する補助。標準検査が今回の意味・Git画像identityを所有しないため補助probeを置く。用途はSTEP 3の受入診断、参照期間は判断確認・次STEPでの入力照合に使う期間、参照終了時は既存調査artifact policyの個別処遇候補。directoryの存在を再開必須入力や永久保存保証にせず、今回削除・移管しない。開始snapshotの2補助commandとpointer抽出の1読取commandは環境ファイル保護hookに拒否され実行されなかった。対象を明示したコピー・SHA commandと局所probeで必要な照合を行い、保護設定を変更していない。

### STEP 3受入

**判定: STEP 3完了、対象内Blocking0。09.1全体はin_progress、09はblocked。** U1／U2／U7画像の今回deltaを根拠付きで閉じ、indexから現行契約・最終受入・固有履歴・残作業を区別して辿れる。各reportをretainし本文統合・削除は不要。成果は上の判定表・既存画像identity／復元表とTask Handoffで、独立した計画書は追加しない。

局所probeは登録48row＝元47＋routing1、変更参照／anchor、旧indexの歴史pointer保全とJSON内の所在、画像3件のcommit-path／blob／bytes／SHA、6否定例、73file保全・09.11 source17/17を確認した。6否定例はrouting未登録、最終受入入口の途中pointer化、初期bounded証拠の全体受入への昇格、原画像SHA変更、現mobile画像への代替、旧bundle必須化を拒否する。初回probeは最終受入のReport行だけを検査し、案内表のpointer改変を見逃してexpected exceptionで停止した。案内表とReport行の両方を検査して反例を拒否し、初回failure logを保持した。製品・原入力を変更して成功へ補完したものではない。

`pnpm test:docs`6/6・docs integrity、対象8文書Prettier、変更参照／登録／identity・差分境界、`git diff --check`で閉じる。受入記録更新後も同じ文書ゲートを最終差分へ適用する。全件matrix／audit／quality／reader受入／bundle復元は再実行していない。これはDOC-P4の文書導線受入であり、DOC-P6全件・fresh clone／shallow history取得やproject最終受入ではない。

最終receiptと差分identityは`.test-results/tsk-09-1-doc-p4-20261002/manifest.json`。次は[09.1 Handoff](../tasks/development-redesign-tasks.md#tsk-091-documentation-evidencearchive-finalization)からSTEP 4の計画を提示して確認を待つ。未達はU3／U4、U6／U7のSTEP 6分、STEP 4〜6と09。Git原画像の不足・不一致は上の固定history／object取得から再開し、別byteで補わない。09.13で手放したHP原内容の再監査能力をfixture移管済みとせず、旧bundle処遇を再開条件に戻さない。commit／push、cleanup・保存実体の処遇・外部公開／転送は実施していない。


## STEP 4 DOC-P5・metadata移管

### 開始identity・承認と変更境界

利用者は現行コード・正本・差分に基づくSTEP 4計画へ「OK」と回答し、対象metadata・scope案内・局所検証・文書更新・Handoffまで承認した。開始HEADは`ce9cea06712642d67b51e0d1a8997d4a58077967`、指定10文書だけに未commit差分、staged差分なし。STEP 3の8文書SHAとworktree全diff SHA `bc0783ce92f88728df089a4fd8e90e64ccb6f204cff03c14153e6237ec0b3d3b`は既存manifestと一致。可視processでは別編集sessionを検出せず、mainと既存prunable3worktreeを確認したが排他保証ではない。09.11／09.12／09.13 done、09.1だけin_progress、09 blockedを維持する。取得revision `dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4`は現HEADとは別identityである。

今回の差分はmetadata／scope案内56文書、registry／evidence index／phase／governance／本台帳／Taskの6文書。追加62 Markdownの変更で、root README・テスト戦略・E4・ranking／portableの先行差分はそのまま保持する。移動・削除・stub・新たなGit-only化は必要ない。AGENTS／CLAUDE、archive index、Local-only実体、machine JSON、baseline／fixture、検査器／quality／CI、原bundle・原run・prototype・OC inventory／raw exportsは変更しない。

### 直接経路・契約と判断delta

`scripts/docs-integrity-lib.mjs::validateRepository`はContract catalog／Revision log、version付きregistry行、ADR集合／status、Task依存／in_progress最大1／closure、Task参照evidence／index件数を検査する。`test:docs`が既存6testとCLIを実行し、qualityのdocs step、CIの一回のqualityへ接続する。FM parserは全kind／fieldを検査するものではなく、ADR status readerは既存FM／本文形式を読む。今回は検査実装や旧語彙fallbackを追加していない。全tracked link／kind／FM、Task区間parser、bounded error出力の不足はSTEP 5へ残す。

`master-data/productionAudit.ts::createTsk065ProductionAuditSource`はmachine JSONの`status: complete`とcanonicalRecordsを検査する。`replay-production-baseline.ts`／`merge-oc-matrix.ts`とproduction testは同JSON、固定baseline、partition／semantic fixtureを読む。TSK-08 JSONの`done`・bounded／domain statusもMarkdown語彙の対象外である。処遇候補Markdownのmetadataをproduction inputと混同せず、これらのbyte・path・consumerは保持する。ADR本文statusは採用判断と既存ADR検査、archive snapshot statusは歴史locatorの説明が所有する。

| 判断 | 採用した処遇・根拠 | 未達との区別 |
| --- | --- | --- |
| U3 | FM欠落42・語彙外8を現在集合と個別本文／indexに照合し、下表の現行kind語彙へ明示移管。原statusはhistorical_status、成立範囲はstatus_scopeへ。E0〜E2のFM Completeとindex Supersededも同じ役割分離で収束 | Completeは記録scopeの完了。UX確認待ち・Verified・Implementation・Review修正は残し、Task doneをUX承認証拠にしない。STEP 5の恒久検査実装は未達 |
| 日付なしADR6件 | ADR-020〜025の導入commitでaccepted判断を確認。採用日時は記録されていないのでdateを追加せず、固定recorded_commitを明示。本文に日付のあるADRは元Dateを移管 | Git author dateを承認日時へ代入しない。これは原資料の不足を別日付で補完するfallbackではなく、記録identityと採用日を区別するkind契約 |
| U4 | root README＝開発入口、AGENTS＝作業規約、CLAUDE＝alias。一般docs FMは不要。docs registryの専用登録とphase 4.8が必要metadata契約を所有 | mode120000、link値AGENTS.md、tracked解決先を現在照合。symlinkを本文へ展開しない。構文／aliasの恒久fixtureはSTEP 5 |
| 完了計画2件 | task plan／Completeで現位置retain。TSK-06.48のfamily別owner判断、bounded unit A／Bの範囲・測定・基点・停止境界が固有内容。registryと本文冒頭から現在Tasksへ案内 | 固有内容を完全に置換する後継や移動を要するconsumerはない。本文のready／blocked／未実施は履歴。移動件数を成果にしない |
| U7 archive18件 | STEP 1のsource commit-path／blob／SHA全18一致と、現在も同一のarchive index・処遇理由を継承。kind Historical、Git-only。未移管Task／canonical delta／固有damage evidenceなしという既存判断を覆す新根拠はない | 新たな全文監査・復元・削除をしない。原本文statusはsnapshot当時の値。STEP 6のhistory取得・別checkout成功は主張しない |
| U7 原画像3件 | STEP 3の元commit／path／blob／bytes／SHAとE→E4→原画像復元表を保持。原image・viewport測定の固有履歴は現画像で代替しない | 同条件のSTEP 3局所照合を継承し、画像再取得・現tree追加やSTEP 6受入をしない |
| tracking／Local-only9件 | .gitignoreにdocs ignoreなし。docs追加はGit statusに現れ、.local-docs/docs/**だけが隔離先。既存9件のSHA一致と内容判定を継承。HTML8／旧prompt1のcomparison履歴を現行契約に昇格しない | 新しい根拠がなく再分類不要。index／親note登録は維持。資料実体・ignore設定・物理処遇を変更しない |
| A表／09.13 | 旧bundle非依存・全廃棄条件、HP7object／33alias／40原宣言の原内容・出自再監査能力を手放した判断を維持。fixture移管ではなく物理処遇は未実施 | 旧bundle・旧部分保持packageの取得／復元／移管／削除を開始条件・通常検証へ戻さない。bundle外OC inventory／raw exportsの原契約を維持 |

kind・必須fieldと履歴fieldの意味は[文書整備phase 4.7〜4.8](../tasks/documentation-maintenance-phases.md#47-frontmatter-status-vocabulary)、改訂責務は[governance](../guides/document-governance.md)が所有する。全docs Markdownはtitle／status、現行requirements・indexes・Tasks／plans・guides・licenseはversion／updated_atを持つ。Evidence／HistoricalやADRに架空の文書版・採取日・承認日を作らない。本文のinput／rule／damage／inventory／digest／version／commit／未対応scopeは保持する。root専用kindを一般Markdownへfallbackしない。

### 個別metadata移管表

前段のSTEP 1表は開始snapshotとして保持する。以下は今回のdeltaだけで、原値の意味は各本文と歴史fieldが保持する。日付のないADRのrecorded_commitは固定Git導入identityであり採用日ではない。

| 対象／kind | 移管元・意味の所在 | 移管先／保持理由 |
| --- | --- | --- |
| [001-workspace.md](../adr/001-workspace.md)／ADR | FM欠落。元本文・既存index | "superseded"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [002-local-storage.md](../adr/002-local-storage.md)／ADR | FM欠落。元本文・既存index | "accepted"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [003-master-delivery.md](../adr/003-master-delivery.md)／ADR | FM欠落。元本文・既存index | "accepted"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [004-calculation-accuracy.md](../adr/004-calculation-accuracy.md)／ADR | FM欠落。元本文・既存index | "accepted"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [005-data-images.md](../adr/005-data-images.md)／ADR | FM欠落。元本文・既存index | "accepted"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [006-portable-data.md](../adr/006-portable-data.md)／ADR | FM欠落。元本文・既存index | "accepted"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [007-static-routing.md](../adr/007-static-routing.md)／ADR | FM欠落。元本文・既存index | "superseded"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [008-refactoring-contract.md](../adr/008-refactoring-contract.md)／ADR | FM欠落。元本文・既存index | "accepted"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [009-condition-decision-fact-semantics.md](../adr/009-condition-decision-fact-semantics.md)／ADR | FM欠落。元本文・既存index | "accepted"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [010-effect-occurrence-and-operation-semantics.md](../adr/010-effect-occurrence-and-operation-semantics.md)／ADR | FM欠落。元本文・既存index | "accepted"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [012-battle-context-and-reference-semantics.md](../adr/012-battle-context-and-reference-semantics.md)／ADR | FM欠落。元本文・既存index | "accepted"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [013-effect-context-input-presentation.md](../adr/013-effect-context-input-presentation.md)／ADR | FM欠落。元本文・既存index | "accepted"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [014-effect-interaction-and-series-presentation.md](../adr/014-effect-interaction-and-series-presentation.md)／ADR | FM欠落。元本文・既存index | "accepted"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [017-canonical-target-context.md](../adr/017-canonical-target-context.md)／ADR | FM欠落。元本文・既存index | "accepted"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [018-ranking-comparison-policy.md](../adr/018-ranking-comparison-policy.md)／ADR | FM欠落。元本文・既存index | "accepted"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [020-ranking-condition-provenance-and-field-policy.md](../adr/020-ranking-condition-provenance-and-field-policy.md)／ADR | FM欠落。元本文・既存index | "accepted"。recorded_commit `0487e90e21766431cf8d790555c0841db2ef9eca`。採用日未記録 |
| [021-canonical-activation-witness.md](../adr/021-canonical-activation-witness.md)／ADR | FM欠落。元本文・既存index | "accepted"。recorded_commit `d1f375a44dbaf570397e0ce13ce4c398ae41317d`。採用日未記録 |
| [022-activation-structure-cleanup.md](../adr/022-activation-structure-cleanup.md)／ADR | FM欠落。元本文・既存index | "accepted"。recorded_commit `fd536f8236ce6e5a08cf25f9b7ba80f28c775fc4`。採用日未記録 |
| [023-canonical-noble-phantasm-variants.md](../adr/023-canonical-noble-phantasm-variants.md)／ADR | FM欠落。元本文・既存index | "accepted"。recorded_commit `5844afca744dac03aaf1c6cef2d49ec76e7a59c9`。採用日未記録 |
| [024-pre-noble-phantasm-plans-and-attack-profiles.md](../adr/024-pre-noble-phantasm-plans-and-attack-profiles.md)／ADR | FM欠落。元本文・既存index | "accepted"。recorded_commit `57c0546eb88a9781cbce61771f1e3472f5f64cd7`。採用日未記録 |
| [025-canonical-target-state-damage-semantics.md](../adr/025-canonical-target-state-damage-semantics.md)／ADR | FM欠落。元本文・既存index | "accepted"。recorded_commit `3c8be663d6a3798332b538fdaa032f89b9730c4b`。採用日未記録 |
| [029-next-vercel-routing.md](../adr/029-next-vercel-routing.md)／ADR | FM欠落。元本文・既存index | "accepted"。ADR本文Status／Dateとindexを明示移管。採用本文を保持 |
| [015-effect-inclusion-activation-and-proc-semantics.md](../adr/015-effect-inclusion-activation-and-proc-semantics.md)／ADR | superseded | superseded。本文のselection部分置換をmetadataへ。残るinclusion等の契約は本文を保持 |
| [README.md](../adr/README.md)／sub-index | FM欠落。元本文・既存index | "Active"。現行sub-index／license registryのFM。更新日は今回のmetadata移管日 |
| [data-sources.md](../licenses/data-sources.md)／license registry | FM欠落。元本文・既存index | "Active"。現行sub-index／license registryのFM。更新日は今回のmetadata移管日 |
| [damage-condition-application.md](damage-condition-application.md)／Evidence | FM欠落。元本文・既存index | "Complete"。schema 9／engine 7のconditional application変更と監査の記録 |
| [damage-effect-dependency-audit.md](damage-effect-dependency-audit.md)／Evidence | FM欠落。元本文・既存index | "Superseded"。469／420 production unsupported baselineの歴史記録。E0以降の後継はevidence indexが案内する |
| [damage-effect-execution-e3-8.md](damage-effect-execution-e3-8.md)／Evidence | FM欠落。元本文・既存index | "Complete"。E3.8 implementation-unsupported 0と当時のIR移管の記録 |
| [damage-effect-execution-e3-9.md](damage-effect-execution-e3-9.md)／Evidence | FM欠落。元本文・既存index | "Complete"。E3.9 HP threshold／特殊入力の当時の完了記録 |
| [damage-effect-execution-e3-10.md](damage-effect-execution-e3-10.md)／Evidence | FM欠落。元本文・既存index | "Complete"。E3.10 proc semanticsの当時の完了記録。現行proc契約を再定義しない |
| [damage-effect-execution-e3-11.md](damage-effect-execution-e3-11.md)／Evidence | FM欠落。元本文・既存index | "Complete"。E3.11 attacker controlの完了記録。本文にあるE3.12での置換範囲を保持 |
| [damage-effect-execution-e3-12.md](damage-effect-execution-e3-12.md)／Evidence | FM欠落。元本文・既存index | "Complete"。E3.12 chained activation／自身の適用内容の当時の完了記録 |
| [damage-effect-execution-e4-1-5.md](damage-effect-execution-e4-1-5.md)／Evidence | FM欠落。元本文・既存index | "Complete"。E4.1.5 activation facts／production inventoryの完了記録。E5未着手は当時の状態 |
| [damage-effect-execution-e4-1-attack-profiles.md](damage-effect-execution-e4-1-attack-profiles.md)／Evidence | FM欠落。元本文・既存index | "Complete"。E4.1 ActorForm／AttackProfileとinventory／digestの完了記録。E5未着手は当時の状態 |
| [damage-effect-routing-audit.md](damage-effect-routing-audit.md)／Evidence | FM欠落。元本文・既存index | "Complete"。当時のrouting実装結果・検証の完了記録。本文の実装完了・確認待ちをUX承認済みへ読み替えない |
| [damage-quality-q0.md](damage-quality-q0.md)／Evidence | FM欠落。元本文・既存index | "Complete"。Q0調査・目標契約の採用記録。本文のapprovedを保持し、現行契約の承認を所有しない |
| [damage-quality-q1.md](damage-quality-q1.md)／Evidence | FM欠落。元本文・既存index | "Complete"。Q1 normalization／fail-closed移管の当時の完了記録 |
| [damage-quality-q2.md](damage-quality-q2.md)／Evidence | FM欠落。元本文・既存index | "Complete"。Q2 kernel golden／benchmark baselineの当時の完了記録 |
| [damage-quality-q3.md](damage-quality-q3.md)／Evidence | FM欠落。元本文・既存index | "Complete"。Q3 all-source resolution／production auditの当時の完了記録 |
| [damage-quality-q4.md](damage-quality-q4.md)／Evidence | FM欠落。元本文・既存index | "Complete"。Q4 evidence precision／external differentialの当時の完了記録 |
| [damage-quality-q5.md](damage-quality-q5.md)／Evidence | FM欠落。元本文・既存index | "Complete"。Q5 scenario facade／history／shareの実装・検証記録。本文の完了（確認待ち）をUX承認済みへ読み替えない |
| [master-data-2026-08-24.md](master-data-2026-08-24.md)／Evidence | FM欠落。元本文・既存index | "Superseded"。2026-08-24採取masterのsource checksum／artifact digest／469・420 inventoryの歴史記録 |
| [r1-implementation-status.md](r1-implementation-status.md)／Evidence | FM欠落。元本文・既存index | "Superseded"。schema 1／engine 1のinternal previewとperformanceの歴史記録。exact public release gate未成立は当時の状態 |
| [damage-effect-execution-e3.md](damage-effect-execution-e3.md)／Evidence | "Complete - Awaiting User UX Confirmation" | "Superseded"。E3実装・検証の歴史記録。元UX確認待ちを保持し、後続Task doneからUX承認を推定しない |
| [damage-effect-execution-e3-2.md](damage-effect-execution-e3-2.md)／Evidence | "Complete - Awaiting User UX Confirmation" | "Complete"。E3.2実装・検証scopeの完了記録。UX確認待ちは元記録のままで、承認済みとは判定しない |
| [damage-effect-execution-e3-3.md](damage-effect-execution-e3-3.md)／Evidence | "Complete - Review Findings Corrected" | "Complete"。E3.3実装・検証とReview closureで記録された修正の完了。現HEADの検証ではない |
| [damage-effect-execution-e4-1-2.md](damage-effect-execution-e4-1-2.md)／Evidence | "Superseded by E4.1.3 activation witness closure" | "Superseded"。E4.1.2 provenanceの歴史記録。activation witnessとchoice由来damageの未完成範囲は本文のまま保持 |
| [condition-target-provenance-flow-tsk-04.md](condition-target-provenance-flow-tsk-04.md)／Evidence | "Verified" | "Complete"。本文のTSK-04 condition／target／provenance flow検証scopeの完了記録。現HEADの全受入ではない |
| [np-resource-semantics-flow-tsk-04.md](np-resource-semantics-flow-tsk-04.md)／Evidence | "Verified" | "Complete"。本文のTSK-04 NP gauge検証scopeとTSK-06.44 interface deltaの記録。後続resource scopeを完了扱いにしない |
| [legacy-runtime-removal-tsk-04.md](legacy-runtime-removal-tsk-04.md)／Evidence | "Verified" | "Complete"。本文のTSK-04 legacy runtime除去・strict schema反証scopeの完了記録。現HEADの全受入ではない |
| [web-routing-flow-next-migration.md](web-routing-flow-next-migration.md)／Evidence | "Implementation" | "Complete"。Next移行・master配信・route splitの4 commitに属する実装・測定記録。現HEADの性能・受入を所有しない |
| [damage-effect-execution-e0.md](damage-effect-execution-e0.md)／Evidence | "Complete" | "Superseded"。E0 baseline採取の完了を履歴として保持。現行execution契約はrequirements／ADRが所有する |
| [damage-effect-execution-e1.md](damage-effect-execution-e1.md)／Evidence | "Complete" | "Superseded"。E1 ordered execution contract記録の完了を保持。production未接続は当時の境界 |
| [damage-effect-execution-e2.md](damage-effect-execution-e2.md)／Evidence | "Complete" | "Superseded"。E2 central switch実装・検証の完了を保持。schema／engine／inventoryは当時の値 |
| [package-semantic-convergence-tsk-06-48.md](../tasks/package-semantic-convergence-tsk-06-48.md)／task plan | "Complete" | "Complete"。Complete計画の歴史scope案内を追加。固有判断・元測定はretain |
| [package-semantic-convergence-tsk-06-48-completion-plan.md](../tasks/package-semantic-convergence-tsk-06-48-completion-plan.md)／task plan | "Complete" | "Complete"。Complete計画の歴史scope案内を追加。固有判断・元測定はretain |

### 証拠再利用・局所検証と不足時操作

開始diff、個別移管元FM／本文SHA、移管表、局所probe・log／receiptは新ignored directory `.test-results/tsk-09-1-doc-p5-20261002/`へ置く。補助migrate.py／update-records.pyは承認対象の一回限りの編集、audit.mjsはmetadata意味・原本文保全・今回参照・root／alias・固定locator保全の診断、record-acceptance.pyは受入identity／logの記録に使う。format-check.mjsはdocsを除外する既存Prettier policyとは別に、追加・変更FMのYAML書式とMarkdown構文を既存formatterで確認する。既存検査がmetadata全件・意味分離を所有しないため今回の有限deltaに必要であり、継続consumerはない。恒久コードへ採用しない。参照期間は本判断確認・STEP 5入力照合に使う期間、参照終了時は既存調査artifact policyの個別処遇候補。directoryの存在を再開条件・永久保存保証にせず、今回は移動・削除しない。

STEP 1のGit-only18／Local-only9判定、STEP 3の103変更参照・23歴史pointer・画像3件・6反例、09.11 source17／全値移管・正常3/3・実merge11反例・六クラス・元run禁止別root・reader3＋3・quality1603／157／29、09.13の非依存・全廃棄判断は同条件の成立範囲で継承する。製品source／input／expected／fixture／settings／保存集合に変更がなく、全matrix／audit／quality／reader受入／全bundle復元は再実行しない。Gitの歴史受入判断は原byte不足後も残すが、新しい全byte照合・原内容移管・fresh damage成功へ昇格しない。

不足・不一致があれば対象path・field・固定identity・必要入力を記録し、元本文／承認記録または指定Git objectの取得と照合から再開する。採用日・UX承認の根拠不足をTask done・Git日時で補わない。固定baseline不足は取得revision、画像・snapshot不足は既存表の固定history／objectを必要入力とし、別版／別path／旧bundle／再生成で補わない。STEP 4の受入は次節に記録し、既存6testをDOC-P6全件完成としない。

### STEP 4受入

**判定: STEP 4完了、対象内Blocking0。09.1全体はin_progress、09はblocked。** U3明示metadata移管、U4 root／aliasの必要metadata判断、U7 Git-only18処遇継承を閉じた。完了計画2件と固有Evidenceは現位置retain、archive／tracking／Local-onlyの既存処遇を継承し、移動・削除・stub・新Git-only化は不要である。

局所probeは承認62文書（metadata／scope56＋既存正本6）、56文書の原本文保全と原metadataの意味保存、99 docs Markdownのmetadata形状（欠落・語彙外0）、初回98参照／anchorと受入記録後の最終101参照、root mode120000／AGENTS解決先、archive index不変と18row、画像3件の既存locator、Task状態を照合した。原本文SHAはFM区切り追加だけを除き、計画2件の新scope案内とroutingのSTEP 4待ち案内の更新だけを明示的に戻して比較している。原ADR判断、E／Qの数値・version・commit・未対応scopeは不変。移管したFMも元fieldの値を保持した。

11反例は未知status、FM欠落、status欠落を歴史fieldから補完、未知kind、UX確認待ちの承認済み化、Verifiedの現HEAD受入化、ADR本文status不一致、alias本文化、未承認metadata field、原画像のmobile代替、旧bundle必須化を拒否した。これは有限deltaの保全・意味の反証で、STEP 5の恒久fixture／全構文検査ではない。

`pnpm test:docs`6/6・docs integrity、追加・変更62 FMのPrettier YAML checkと62 Markdown parser読取、今回参照・意味照合、`git diff --check`が成功。`.prettierignore`はdocsを除外するため、標準Prettierの成功だけを本文書式の証拠にせず、上の追加書式probeで確認した。歴史本文の全面formatはしない。STEP 3の保護receipt73file（machine JSON44・09.11 source17等）も再照合一致。対象62の原本文／既存差分の保全と最終deltaをreviewし、結果記録後の最終文書ゲートで閉じる。metadata形状の確認をDOC-P6全登録・全link構文・CLI bounded errorや別checkout成立へ読み替えない。

最終receipt、開始差分、STEP 4単独diff、対象metadata／意味・参照／反例とsource保全の証拠は`.test-results/tsk-09-1-doc-p5-20261002/manifest.json`。全matrix／audit／quality／reader受入／bundle復元は追加していない。ネットワーク取得・新規依存install・原byteの新しい全照合・fresh damage成功は主張しない。旧bundleや原runの処遇、cleanup、外部公開／転送、commit／pushは実施していない。

STEP 4時点の未達はSTEP 5の既存docs inspector／test／CLI拡張と、STEP 6の統合・別checkout／固定history取得（U6／U7）、TSK-09。現在の成果・未達・次操作は下記STEP 5と[09.1 Handoff](../tasks/development-redesign-tasks.md#tsk-091-documentation-evidencearchive-finalization)が所有する。不足時は前節の固定identityと必要入力から該当義務だけ再開し、旧bundle取得・物理処遇を開始条件へ戻さない。

## STEP 5 DOC-P6検査実装

開始HEADは`ce9cea06712642d67b51e0d1a8997d4a58077967`、67文書の未commit差分SHA-256は`e15042cbfe164ab6949ae23b62db54578fd7d892322db730bf71c85067086898`。指定identityに一致し、コード・設定の先行差分なし、Task indexのin_progressは09.1だけ。確認可能なworktree／processに並行編集・検証なし。利用者が読み取り調査から提示したSTEP 5計画へ「OK」と回答した範囲で実装する。取得revision`dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4`は現HEADと区別し、別checkout取得は行わない。

### 実装判断と直接経路

| 対象／既存owner | STEP 5のdeltaと保持する境界 |
| --- | --- |
| `docs-integrity-lib.mjs::validateRepository` | error配列APIを保持し、同ownerの`inspectRepository`が一度構築するGit index・本文・登録到達・診断を使用。全tracked Markdown102件、machine JSON44件を母集団とする。JSON本文のdomain statusは解釈しない |
| 登録とkind | registry→sub-index→登録済み親noteの有効なlocal参照を辿る。親note経由JSONを正当な登録として通し、未知kind・分類矛盾・重複宣言・未到達を拒否。root3件は専用kind、CLAUDEはindex mode／blobと実symlinkの両方を照合 |
| 構文と参照分類 | 既存PrettierのMarkdown／YAML／HTML parserを使用。inline／reference-style、画像、heading／明示anchor、escaped／percent-encoded path、HTML entityを解決。定義欠落・重複、broken／untracked、repo外解決、不正encoding・未知scheme・未対応構文を拒否。fence／inline code／escaped literalは現在参照に数えない |
| metadata | kind別の必須field・case-sensitive statusと現行field／型を検査。scalar・sequence・quoted escape・block scalarを意味を保って読み、未知field・欠落・空値・重複・矛盾を拒否。historical_statusから現行値を補完しない。元status／status_scope・版付きsource／ui_baseline等の歴史citationを現在版へ改変しない |
| ADR | index集合・ID／path・status、FM／明示本文status・date、置換先／宣言の整合・cycleを検査。採用日未記録6件のrecorded_commitは固定40桁の記録であり、Git日時へ変換・新しいhistory取得をしない |
| Tasks／Contract／evidence | active Tasks最大1、indexのin_progress最大1。Complete task planはactive ledgerへ数えない。index未知値・重複、依存／cycle、本文Current status・Depends on、Handoff、Contract ID／matrix／延期先を検査。UTC timestampで切れる`\\Z`と最終区間の不具合を修正し、実文書末尾を使用。code fenceの偽Taskをliteralとして除外 |
| CLI／artifact | `docs-integrity.mjs`で代表5件・省略数・byte上限付きpath／reasonを表示し、全診断JSONと完全診断logを保存。既存atomic manifest writerとbytes／SHA receipt検査を再利用。standalone timestamp run、qualityの既存FGO_QUALITY_RUN_DIR配下docsへ接続。保存失敗／内部失敗は非zero、保存先fallbackなし |
| quality／CI | package.jsonのtest:docs→quality docs step→CI pnpm qualityを維持。quality runner／共有receipt owner・step／workflow・依存packageは変更しない。CLIが既存parent directory指定を消費する実経路をfixtureで検査する |

現tracked本文ではinline link・anchor・JSON／PNG参照を確認した。reference-style・HTML・image構文は現集合にないため小fixtureで反証する。Markdown文法上の通常のbracket textを未定義linkへ推定せず、明示した壊れたlink／image／reference候補は拒否する。HTML srcset・dynamic／style reference等、現在の検査が解釈しない構文は成功から除外せずerrorにする。外部HTTP(S)／mailto linkのremote到達性は本静的検査の対象外である。

本文のGit-only locator・期限付き調査artifactの説明は現在linkではない。現在linkにした対象にはtracked要件を適用する。source等の歴史citation、archive snapshot status、ADR採用本文、machine evidenceのdomain statusをMarkdown現在値へ変換しない。`.env`／秘密値を含む`.env.*`は内容を読まず拒否し、公開用`.env.example`は区別する。

### 検証と再利用境界

小fixtureと実CLIで、正常な親note JSON登録・root alias・各構文とkind metadata、broken／untracked／未登録・未知kind／status／field、必須値欠落・重複・矛盾、alias本文化／誤target、Task多重active／in_progress・UTC timestamp／最終区間、依存・Handoff・closureを確認する。実CLIの成功・代表failure・1024failure・長いreason・保存失敗を通し、完全診断とreceiptを照合する。Git fixtureは一時的なindexを作るだけでcommitせず、別checkout／固定history取得受入ではない。fixtureの原入力は恒久test内の小さな文字列が所有する。

初回反証でADR旧fixtureのFMなし依存、自己Taskへの延期、空Apply欄、HTML entityの原文字列扱いを検出した。現在の文書契約に沿ったfixture入力と実装へ修正し、拒否する元の6検査契約は維持する。文書の意味・許可語彙は緩めない。受入の最終結果は次節へ記録する。

全件受入ではevidence indexのrouting note行が空行で表から分離され、Markdown AST上のreport表47行と宣言48件が不一致になった。既存のraw行regexはこの差を検出しなかった。空行だけを除いて同じ5列の表へ接続し、rowのstatus／role・固有測定・後継案内は不変。reference-style indexと孤立rowを小fixtureで反証する。新しい文書処遇・意味変更は行わない。

STEP 4の62 FM／56原本文保全・元statusの意味保存、STEP 1のGit-only18／Local-only9、STEP 3の画像3件locator、09.11 source／全値移管／実caller・性能／quality、09.13の非依存・全廃棄条件を、変更していない成立範囲で継承する。本STEPでSTEP 1の内容判定・STEP 4受入・全matrix／audit／damage性能／全quality／reader／bundle復元を再実行しない。machine evidence・source／input／expected／baseline・prototype・OC／raw・既存調査directoryは変更しない。

### Artifactの用途と期間

新ignored directory `.test-results/tsk-09-1-doc-p6-20261002/`は本STEPの開始diff／file identity、局所失敗・最終log、実CLI process receipt／診断、書式・差分・保全の受入manifestを置く。用途はSTEP 5判断の再確認とSTEP 6への入力照合、参照期間はそれらの確認に使う期間。参照終了時は既存調査artifact policyの個別処遇候補とし、手動名directoryを恒久保持保証にしない。既存調査directory・原runを編集せず、追加のbundle／全履歴コピー・外部転送・cleanupを行わない。

同directoryの補助`acceptance.mjs`は今回の6 FM書式・非owner SHA保全・実CLI receipt照合、開始patchからのSTEP 5単独diffと最終manifest作成だけを担当する。一時的な比較fileは新しい専用tempに作成し、終了時にそのfileだけを片付ける。恒久のdocs inspectorや保存ownerへ採用せず、継続consumerはない。用途・参照期間・参照終了時の処遇条件は上記directoryと同じである。

通常CLIの完全診断は既存timestamp run policy、quality内は既存親run policyに従う。CLIの保存機構を新設せず、既存receipt／manifest ownerを使う。受入用の実CLI結果と一時fixtureは区別し、保存失敗時はcallerのprocess receiptが非zeroと原因を保持する。

### STEP 5受入

**判定: STEP 5完了、対象内Blocking0。09.1はin_progress、09はblocked。** 最終sourceの`pnpm test:docs`は28/28（元6契約を保持）と現tracked全検査が成功。全102 Markdown・44 machine evidenceが登録到達・参照・kind metadataの検査対象となり、active ledgerは1、in_progressは09.1だけ。参照件数と最終doc identityは受入manifestの実CLI診断を正本にする。

実CLIは成功・代表failure・1024failure・40,000文字のreason・保存先がfileの5経路を確認した。代表failure／大量failureはexit1、全1024診断と最終pathをJSON／完全logに保存、consoleは代表5件＋1019省略＋artifact pointer。長いreasonもbyte上限内、完全値は保存済み。保存失敗はexit1・原因と不完全保存先を表示し、別directoryへの書込なし。各正常保存のmanifest exitとprocess exit、全receiptのbytes／SHA・診断件数を照合した。未commitの一時Git fixtureにはcommitを作らず、manifestでunbornと明示した。

3scriptのPrettier、6正本FMの明示YAML書式・Markdown解析、先行差分保全、`git diff --check`と差分レビューを確認した。docsを除外する標準Prettierだけを文書検証へ代入しない。quality parent／quick subset／local・CI・Vercel共通入口の既存5契約も成功。quality runner・共有保存owner・package／workflowはbyte不変で、全quality・product suite・audit・性能を重複実行していない。

受入manifestは`.test-results/tsk-09-1-doc-p6-20261002/manifest.json`。開始diff・最終STEP 5単独diff／全diff identity、開始SHAからの非owner保全、最終source／6文書identity、docs／format／quality契約log、実CLIの完全診断・process receipt、通常timestamp runの最終manifestを対応付ける。accepted fixture sourceは不変なので、結果記録だけの更新後は実CLIと文書書式・差分検査で閉じ、同じ28fixtureを無条件に再実行しない。

未達はSTEP 6の統合・別checkout／固定history取得（U6／U7）、09.1全体Apply、TSK-09。次操作は[09.1 Handoff](../tasks/development-redesign-tasks.md#tsk-091-documentation-evidencearchive-finalization)から開始／最終identityと本受入を照合し、STEP 6計画へ引き継ぐこと。本STEPでSTEP 6を実行していない。保存失敗や新しい検査不一致は完全診断のpath／reasonと固定identityから該当義務だけ再開し、未知値の除外・別path／別版／旧bundle・再生成で補わない。原保存実体の処遇、cleanup、外部公開／転送、commit／pushなし。


## STEP 6 統合受入・Handoff

### 開始identity・承認と直接owner

利用者が現コード・正本・差分から提示したSTEP 6計画へ「OK」と回答した。開始HEADは`ce9cea06712642d67b51e0d1a8997d4a58077967`、70 tracked filesの未commit差分SHA-256は`a1e1f403fb50f21daf416d598f16dbfb04c4e8cd04fb05d94113e87ec15cb65a`でSTEP 5 manifestと一致。main index SHA-256は`b1a6079afaade010d070ce782490d669b17273d8d8c9003cb95e6774f4103daa`、staged差分なし、in_progressは09.1だけ。可視の並行編集・検証なし、実体のない3worktree登録は未処遇。開始patch・865 tracked filesのpath／mode／bytes／SHAを新受入directoryの`start-input.json`へ固定した。

現行`inspectRepository`はGit indexから全Markdown・machine evidence集合を構築し、registry→sub-index→親noteの有効参照で登録到達を判定する。kind／metadata、ADR、Task／Contractを同ownerで検査し、`validateRepository`はerror配列APIを保つ。直接consumerは既存testとCLI。CLIは既存atomic manifest writer／artifact receiptを使い、standalone timestamp runとqualityのdocs childへ完全診断を保存する。packageのtest:docs→quality docs step→CI pnpm qualityはbyte不変。history locator・recorded_commitは現在参照や採用日へ変換しない。

baselineの実ownerは`productionRegressionBaseline.ts`（固定宣言、圧縮／展開receipt、shape／値／coverage）、`production-matrix-records.ts`／実merge（全record／aggregate、actual transaction／gate）、replay（保存入力）、acceptance／既存test（六クラス／reader反例）。今回それらのsource・入力・fixture／expected・依存lockfileを変更していない。

### 独立checkoutと取得失敗（初回履歴）

`/tmp/fgo-lab-tsk091-step6-20261002`へ主repositoryをfile transport経由で`git clone --no-local --depth=1 --no-tags`した。新しい独立object storeにalternatesはなく、主worktree／indexを使い回さない。開始binary patchをcheckoutのindexだけへ適用し、HEAD・`git diff HEAD --binary`のSHAと全865 path／mode／bytes／SHA一致を確認した。CLAUDEはmode120000・link値AGENTS.mdを維持する。ignored run・bundle・調査directoryはコピーしない。初回は第三者依存だけ既存node_modulesを共有したが、pnpmのworkspace配置整合が拒否したためそのcheckout側symlinkだけを外し、専用storeへのfrozen installを実行した。最終gateではcheckout内の依存とworkspace linkを使い、主worktreeの依存を参照しない。

初期shallow checkoutでは次の固定4commitがすべて`git cat-file -e <commit>^{commit}`でexit128となり、必要history不足・復元未成立を確認した。ローカルcloneのoriginを設定済みrepository originへ接続し、最初にbaseline固定revisionを`git fetch --depth=1 --no-tags origin dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4`で取得しようとしたが、45msでexit128。原因は`Bad owner or permissions on /etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf`でSSH初期化できないこと。同じtransportが初期化不能のため残るhistory fetchを反復せず未実施とした。別認証・SSH設定の迂回・local objectコピー・旧bundleへの切替は行わない。

| 必要入力 | 閉じる能力／現在の不足 |
| --- | --- |
| `dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4` | 固定取得revisionのcommitとsource／master／baseline／fixture一式。現HEAD treeの入力一致は確認できるが、このrevisionのremote取得・checkoutは未成立 |
| `1b419a8c1d807b79061a299629c9df3e78e5e496`、`2e7e8b4a27b8dd73711b9f9a286134eae2c47596` | [archive18行](../archive/README.md)の元path／blob／bytes／SHAに対応する固定history。初期不足、取得・別checkout復元未成立 |
| `6d7608caf16fa8e677509ee5c0ae0ba3044ac700` | [PNG3件](#e4歴史画像の復元)の固定commit・元path・blob・bytes／SHA。初期不足、取得・別checkout復元未成立 |

通常の技術修正としてREADMEの固定fetch・停止／再開案内、archiveのcommit-path照合・bytes・shallow不足時の取得／停止操作を既存ownerへ補足した。archive18件のbytesは既存local固定blob／SHAから確認し、全commit／path／blob／SHA・本文status・処遇／後継は保った。この照合はlocal identityだけであり、新しいhistory取得・復元の成功ではない。SSHシステム設定の修復は環境ownerの操作であり、repository文書・検査の不整合ではない。製品判断や新しい保存機構で解決しない。

### 成立範囲と証拠再利用

別checkoutで取得した現HEAD tree内のsource declaration SHAは`650a360b6176126d2b02414f303c08e8d7e80b2ce548ddc538770c4c96be9f08`。baseline manifestは376249 bytes／SHA `50cbcb378d8743a9a678df5415eae93e269ffcc12514ed18344ee6a2e074534a`、80gzipは全圧縮receipt一致・合計30282857 bytes、宣言された展開bytesは462616316。master SHAは`2d9f1b19ed40452fda3571932ee1e37bf9fe85fdfa903404c853d7cde269e46a`。partition fixtureは69065 bytes／SHA `cb3187313f96ea45c22dcbce4c2a0ecb1e8f2be179932bfbc5604c58b0c7bfa7`でmanifest SHAへ結合する。これは原runなしの現HEAD tree取得・入力同一性であり、固定revisionのremote取得、新しい全展開本文検査／reader実行／damage成功ではない。

09.11 source18対象のうち説明変更済みREADMEを除く17対象と、STEP 5の3script SHAを照合した。09.11の8proof（全値移管、six、11実merge反例、元run禁止isolation、本文調査、source、性能before／after）は元manifestのbytes／SHAと一致。変更reader3process中央値117289.816502→123094.810542ms（+4.95%）は元条件の測定で、damage／全matrix性能へ代入しない。元run禁止の保存入力replay／実merge・34640 record、正常3/3、六クラス、品質1603／157／29は同条件の既存受入として継承する。quality親manifestの照合と原633宣言の当時の成功は、新しい全graph byte再監査と区別する。

STEP 1の内容判定・STEP 4の意味移管／本文保全、STEP 5の代表／1024failure・長いreason／保存失敗、09.13の非依存・保持解除・物理処遇未実施を同条件で維持する。全matrix／audit／damage性能／product quality／reader受入／bundle復元を再実行しない。HP固有原内容・出自の再監査能力は手放した判断であり、fixture移管ではない。OC inventory／raw exports・prototype・Local-only・既存調査directoryは未変更。

### 文書再開と最終gate

最終成果をcheckoutへ反映し、registryから現行契約、sub-index／親note経由JSON、TSK-08の最新finalAcceptanceと歴史checkpoint、09.11最終受入、09.13判断、09.1残項目／09、baseline／fixtureの固定宣言と再開command、archive／原PNG locatorを実link／anchorで辿る。直接indexにないだけで未登録とせず、現在linkとinline codeの歴史locatorを区別する。全tracked対象の判定は既存inspectorが所有し、受入用の代表経路記録を新しい検査ownerへ昇格しない。

別checkoutで`pnpm test:docs`は28/28（既存6契約を保持）と全tracked検査が成功、102 Markdown／44 machine evidence／888参照・active ledger1。実CLIの診断／完全log／manifest receiptを確認した。`navigation.mjs`は22の実link／anchor、TSK-08最終受入pointer、親note経由JSON、Task状態、baseline固定fetch command、ADR採用日未記録のrecorded_commitとdate非捏造を確認した。書式は5文書のFM YAML／Markdown parserとroot READMEの明示Prettierで成功。参照件数と結果記録後の最終identity・保全／差分・CLIは受入manifestを正本とする。docsがPrettier ignore対象であるため、変更したFMの明示YAML書式とMarkdown parser、root READMEの明示書式を使用する。共有依存構成の初回`pnpm test:docs`は`ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`（workspace配置変更）でexit1、test本体未実行。拒否を迂回せず共有symlinkを外し、`pnpm install --frozen-lockfile --store-dir=/tmp/fgo-lab-tsk091-step6-pnpm-store`で289packageを取得してexit0（8.5秒）、Node v26.3.1／pnpm11.20.0、lockfile・全tracked source不変を確認した。この新規依存installの成功は独立したlocal checkoutとpackage取得の能力を実証し、固定baseline revision／Git SSH remote取得成功とは別である。

### Artifactと未達時の再開（初回履歴）

新ignored `.test-results/tsk-09-1-step6-20261002/`の用途はSTEP 6判断・統合受入とTSK-09の証拠照合。開始／最終patch・tracked identity、clone／適用／不足／fetch process、source／proof再利用receipt、導線・書式／保全・docs完全log／診断、manifestを所有する。参照期間はその確認に使う期間、終了後は既存調査artifact policyによる個別処遇候補。新CLI timestamp runも独立checkout内に生成し、receiptを受入manifestから参照する。専用pnpm storeは今回の依存install／検証と残る再開に使う一時cacheで、参照終了時の個別処遇候補とし、保存サービスや恒久入力にしない。手動名directoryのcleanup対象外を永続保証にしない。checkoutは現行tracked集合の一時検証入力、歴史復元byteは今回まだ作成していない。baseline／bundle／全履歴の新しい恒久保持集合はない。

補助`acceptance.py`と導線／書式receipt codeは今回の比較・process capture・記録だけを担当し、恒久採用しない。用途・参照期間・処遇条件は上記artifactと同じ。Git object storeはHEAD treeと必要な固定historyだけを取得する計画で全historyコピーを行わず、現在は初期shallowのみ。既存の保存／清掃ownerは変更しない。環境保護hookが除外判定／環境map操作を含む初期commandを実行前に拒否したため、それらを証拠へ数えず、ファイル名一覧で確認した環境ファイルを含まないtracked対象と通常のprocess継承で実行した。保護解除や秘密値の参照・記録はない。

以下のSSH設定修復を前提とした再開案はsandbox内表示による誤判断で撤回し、現在の必要入力・再開操作は末尾追補を正本とする。当時の再開案は環境ownerによるSSHシステム設定権限の修復と、originの固定4commit提供を前提にした。新sessionはTask Handoff・本節・受入manifest・HEAD／差分を照合し、保存された独立checkoutの同一性を確認する。失敗した固定baseline fetchから再開し、成功後に同revisionの新worktreeで固定入力を照合する。続いてarchive2commitとPNG commitをdepth1で取得し、各正本のcommit／path／blob／bytes／SHAを新しい一時pathへ復元・照合する。取得不能・不一致なら該当入力と原因を残して停止し、過去成功・local objectを新しい取得成功へ代入しない。終了条件はこれらの取得／復元と最終集合の必要な文書gate、全Apply／Done gate／Handoff一致。対象変更がなければ今回の有効な文書・圧縮receipt・source・既存実caller証拠を再利用する。

**初回判定（履歴）: STEP 6未完了。固定revision／history取得のBlockingが残るため09.1はin_progress、09はblockedを維持した。** 別checkoutの文書再開・全件検査は成立した。残る固定取得／復元は環境・入力不足のBlockingであり、文書検査やlocal identityの成功へ置換しない。TS-FINAL-001／RK-FINAL-001のDeferredはTSK-09、DX-FINAL-001を含むproject全条件も同Taskの受取義務。09.11実caller・性能の有効範囲、今回の別checkout受入と固定取得未達を分けて渡し、TSK-09は開始しない。results:clean、原物の移動削除、外部公開／転送、commit／pushは行わない。


### STEP 6追補: sandbox境界と固定history取得

利用者からsandboxを超えるシステム設定修復依頼の誤りを指摘された。sandbox内の`nobody:nogroup`表示だけを実環境の所有者不正と判断したのは誤りであり、ユーザーへ出したchown依頼とSSH設定修復を必要条件にした案を撤回する。正式な`require_escalated`実行の審査を通したmetadata確認では、実体はroot:root・644で正常。システム設定・所有者・認証情報は変更せず、承認済みの同じorigin・固定SHAのGit取得を正式なsandbox外実行へ接続した。これは別認証・設定回避や別入力へのfallbackではない。

baselineの`git fetch --depth=1 --no-tags origin dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4`はSSH／remote接続まで進み、exit128・`upload-pack: not our ref`。現在の不足はoriginがこの固定revisionを提供しないことであり、SSH設定権限やユーザーの端末修復ではない。別SHA・別path・旧bundle・再生成・暗黙の取得元切替で補わず、commit／push・外部公開は行わない。

独立したhistory義務は同じoriginからarchive2commitとPNG commitをdepth1／no-tagsで取得しexit0。初期shallow不足の証拠に対し、正式なGit取得後の全18snapshot・原PNG3件を新しい一時復元pathへ取り出した。各commit存在・元path→blob・blob type／bytes、復元byteのSHAを正本と照合し21/21一致、復元bytes438271。原PNG3件57957／40246／4533 bytesは元identityを保ち、現mobile画像やfixtureで置換していない。U7の取得／復元はVerified。これはlocal object存在の推定ではなく、別object storeのshallow checkoutへの実remote取得・新path復元である。

追補の新ignored `.test-results/tsk-09-1-step6-acquisition-20261002/`はmetadata／正式Git processのtool返却結果・受入receipt、固定21原物の一時復元・照合、開始／最終差分とsource、結果記録後のdocs gateを所有する。用途・参照期間はSTEP 6 closure／TSK-09照合で使用する期間、参照終了後は既存policyによる個別処遇候補。実取得receiptと原物の検証を失わず、歴史原物の恒久保持集合や全履歴bundleへ昇格しない。旧STEP 6 directory／manifestは初回partialの履歴として不変、既存調査directory・原run／bundle等も未処遇。復元集合は21path／21distinct byte object、圧縮bytes0・復元bytes438271で、metadata／logは追補manifestに分けて記録する。これはU7の未達取得・復元を閉じる一時入力であり、元snapshot処遇・本文意味の再監査ではない。

新しい製品／検査／quality変更はなく、先行受入28fixture・22導線・書式・圧縮baseline receipt／実caller・性能はsource／条件一致の範囲で再利用する。追補の正本更新後は最終集合のCLI・書式／参照・差分／保全を行い、成功結果・固定identityを新manifestへ記録する。

**取得元変更承認前の判定（履歴）: STEP 6未完了、U7取得／復元Verified、U6の固定baseline revision取得だけ未達。09.1 in_progress／09 blockedを維持する。** 必要入力はoriginが提供する`dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4`のcommitとそのsource／master／baseline／fixture一式。提供可能な取得元の契約を変更する場合はユーザーの明示判断を得て正本へ記録し、読込失敗の暗黙fallbackにしない。提供された後はHEAD／差分・両受入manifestとcheckout同一性を確認し、正式なsandbox外Git取得→同revisionの新worktree→固定入力receipt照合から再開する。U7の21原物復元や未変更の全matrix／reader受入を繰り返さず、残るDone gate／Apply／Handoffと最終文書gateを閉じた場合だけ09.1 done／09 readyへ更新する。今回TSK-09開始、commit／push・物理処遇は行わない。

### STEP 6最終追補: 取得元契約と再発防止

利用者は主repositoryを正式なbaseline取得元とする変更を明示承認し、AGENTS等の構成を考えた再発防止の記録を指示した。固定commit／path／bytes／SHA・expected・fixtureは変更せず、外部origin取得不能を別版で補う処理は追加しない。提供元を`file:///home/ivgtr/pj/fgo-lab/fgo-lab`としたGit fetchを独立shallow checkoutで実行しexit0。同repository内の別worktreeを`dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4`に作り、HEAD一致・cleanを確認した。主repositoryのobject directoryコピー・alternates・旧ignored run／bundleコピーを成功条件にしていない。外部originからのbaseline取得は依然not our refで未保証、別環境で主repositoryが利用不能なら同一revisionを提供できる取得元と権限の明示判断を必要入力とする。

固定revisionのsource declaration SHA `650a360b6176126d2b02414f303c08e8d7e80b2ce548ddc538770c4c96be9f08`、manifest376249 bytes／SHA `50cbcb378d8743a9a678df5415eae93e269ffcc12514ed18344ee6a2e074534a`、80圧縮receipt30282857 bytes、master SHA `2d9f1b19ed40452fda3571932ee1e37bf9fe85fdfa903404c853d7cde269e46a`、fixture69065 bytes／SHA `cb3187313f96ea45c22dcbce4c2a0ecb1e8f2be179932bfbc5604c58b0c7bfa7`とmanifest SHA joinを全照合し一致。reader・replay・matrix records・acceptanceの4直接ownerも現成果とbyte一致。U6は固定取得／checkout入力照合と文書再開としてVerified。全展開462616316 bytesのreader／実caller意味受入は09.11の同条件証拠を継承し、新しい全matrix・reader実行とは扱わない。U7は前追補の外部originからの3固定commit取得と18snapshot／原PNG3件復元21/21を継承し、今回のfile transport取得へ読み替えない。

再発防止はAGENTSの「成果・作業範囲と実行権限」に作業承認／実行権限の区別・sandbox観測からの断定禁止・正式審査と拒否時操作をまとめ、既存保持節に取得元変更と保証範囲の判断を統合した。[実行効率要件§4](../requirements/development-execution-efficiency-requirements.md#4-責務境界)はSession／Operator責務と具体的な原因分類・確認手順を所有する。個別SSH失敗・誤判断撤回・取得元承認は本台帳が所有し、AGENTSに事故log・環境固有path・新しい承認要求を複製しない。要件v1.3.1は利用者指示による運用明確化で、既存Contract ID／Done gate・product意味論・quality／CIは不変。

最終受入の新ignored `.test-results/tsk-09-1-step6-final-20261002/manifest.json`は取得元承認・固定Git取得process、baseline入力とowner receipt、開始／最終差分・865 tracked identity、別checkoutへの最終反映・文書gate／書式／差分／保全を所有する。用途はSTEP 6 closureとTSK-09の証拠照合、参照期間はその判断に用いる期間、参照終了後は既存policyに沿う個別処遇候補。前2受入directoryはpartial／訂正履歴として不変。新しいbaseline worktreeは既存tracked入力の一時検証checkoutで、fixture移管先・恒久保存・全履歴保持を新設しない。metadata／patchとcheckoutのpath数・bytesはmanifestで分ける。補助検証codeも同じ寿命で恒久採用しない。物理処遇・cleanupは未実施。

既存28fixture・STEP 5実CLI反例／bounded完全保存、09.11の17不変source・8proof・実merge正常3/3／11反例・六クラス・元run禁止34640 record・reader3＋3中央値+4.95%・quality1603／157／29を有効なsource／入力／条件で再利用する。今回の変更は既存8文書（規約・実行効率・root README・registry・archive index・evidence index・台帳・Task）で、先行70差分・主index・3検査script・baseline／fixture／JSON・quality／CIを保護する。依存は独立checkoutの既存frozen installを使い、追加install・全matrix／audit／damage性能／product quality／全bundle復元を行わない。最終sourceに対する文書検査・明示FM書式／Markdown解析・root書式・参照・差分／保全を最終manifestへ記録して完了判定する。

最終文書gate前の候補検査はHandoffを履歴見出しへ変更したため2件の契約failureを検出した。現行Handoffを復帰し、検査を緩和せず修正後の独立checkout CLIが102 Markdown／44 machine evidence・全登録146・active ledger1で成功。失敗と修正後の完全診断・manifestを別receiptとして保存し、失敗を成功へ代入しない。8文書の明示FM YAML／Markdown解析・root Prettier、差分／保全も成功。最新状態の記録後は最終source同一性・実CLI・導線と書式を再確認し、最終manifestをその結果の正本とする。

| 09.1 Done gate／Apply | 最終成立根拠・実証境界 |
| --- | --- |
| input・rule・inventory・digest保全 | STEP 4の固有本文／metadata意味・原JSON・baseline／fixtureと09.11 sourceを保全。865 tracked比較と主index不変、先行70差分を維持 |
| tracked集合とtracking policy | STEP 1〜4判定を継承、独立checkoutの全102 Markdown／44 JSONを検査。CLAUDEはmode120000・AGENTSへのsymlink |
| 現行契約と固有履歴の区別 | registry→sub-index／親note→最終受入・残Task・固定locatorの実導線、歴史status・recorded_commitは意味不変 |
| baseline・fixture・判断記録の取得／再開 | U6: 承認した主repositoryから固定Git取得／別worktree入力一致。U7: 外部originから固定3commit取得・21原物復元一致。原run／旧bundle非依存・不足時停止／必要入力・取得元未保証を明記 |
| canonical docs gate | 既存test:docs→quality→CI接続は不変。28fixture／STEP 5実CLI反例を同条件継承、最新独立checkoutの実CLI完全診断／receipt成功 |
| 全登録・参照・kind別metadataと反証 | STEP 5の6既存契約を保持した28fixture、正常／代表／大量failure・完全診断保存／保存失敗を継承。最新tracked集合の登録・link・metadata成功 |
| ignored資料の物理処遇 | 原run／bundle・既存調査・OC／raw／prototype／Local-onlyは未変更・未削除。09.13は保持解除の判断、物理処遇を受入へ代入しない |
| `DOC-REV-001` | Verified: 8文書・要件v1.3.1の承認／Revision log・registry・Task整合。既存Contract ID／Done gate不変 |
| `DOC-CLOSE-001` | Verified: A0〜A9、STEP 1〜5、U1〜U7・全Done gate、取得元判断・保証限界・TSK-09受取を対応付け |
| `DOC-LINT-001` | Verified: 28fixtureの有効範囲、独立checkout実CLI・明示書式／参照／最終差分検査 |
| `DX-ART-001` | Verified: 固定入力の取得／復元receipt、調査artifactの用途・identity・期間・処遇条件。09.11 raw不足時の主張撤回と09.13能力損失を維持 |
| `DX-HANDOFF-001` | Verified: HEADと未commit差分・source、再利用証拠、U6／U7実証範囲・必要入力と再開操作を既存Task／受取Handoffへ接続 |
| `TS-FINAL-001`／`RK-FINAL-001` | Deferred: TSK-09。09.11実caller・性能・qualityと今回の文書／取得受入を成立範囲で渡し、project全対応表・必要な最終quality／性能・thread再開は受取先が所有 |

**最終判定: STEP 6完了、09.1全Done gate・Apply成立、必須不明／未移管／対象内Blocking0。09.1 done、09 ready・未着手。** これは未commit成果とHandoffのclosureで、completion commitは作らない。次sessionはTaskの受取Handoff・最新manifestとHEAD／差分／checkout identityを照合し、TSK-09の未達対応表から必要な操作を選ぶ。原証拠が不足・sourceや入力が変わった範囲は既存成功の再利用を止め、指定identityの取得または必要なfresh契約検証から再開する。主repository提供元が利用不能なら同一固定revisionの提供元・権限判断が必要。旧bundle・別SHA・再生成・システム設定修復を暗黙の再開手順にしない。
