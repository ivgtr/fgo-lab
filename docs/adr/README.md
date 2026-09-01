# Architecture Decision Records

ADRは採用時点のarchitecture判断を記録する。statusは`accepted`または`superseded`とし、重要な契約変更は承認時に新しいADRで置き換えて相互に参照する。承認前のproposalはrequirementsとflow noteで管理し、ADR indexへ登録しない。現在、ADR-015のselection契約をADR-026が、ADR-016のranking／presentation契約をADR-027が置き換える。

| ADR | Status | 判断 |
| --- | --- | --- |
| [001](001-workspace.md) | accepted | pnpm workspace、Vite、React、静的配信 |
| [002](002-local-storage.md) | accepted | IndexedDB repositoryとtransactional migration |
| [003](003-master-delivery.md) | accepted | SHA-256 manifest、staging、atomic active切替 |
| [004](004-calculation-accuracy.md) | accepted | float32境界とfail-closed計算契約 |
| [005](005-data-images.md) | accepted | Atlas由来データ・画像と画像単独停止 |
| [006](006-portable-data.md) | accepted | backupと匿名share snapshotの分離 |
| [007](007-static-routing.md) | accepted | GitHub Pages base pathとhash routing |
| [008](008-refactoring-contract.md) | accepted | 現行要件へ収束させるリファクタリング契約 |
| [009](009-condition-decision-fact-semantics.md) | accepted | condition、decision、factの意味論分離 |
| [010](010-effect-occurrence-and-operation-semantics.md) | accepted | effect occurrenceとoperationの原子性 |
| [011](011-canonical-effect-execution-semantics.md) | accepted | canonical effect execution semantics |
| [012](012-battle-context-and-reference-semantics.md) | accepted | battle contextと参照operationのcanonical化 |
| [013](013-effect-context-input-presentation.md) | accepted | 特殊入力のeffect近接presentation |
| [014](014-effect-interaction-and-series-presentation.md) | accepted | effect interactionとseries presentation |
| [015](015-effect-inclusion-activation-and-proc-semantics.md) | superseded | effect inclusion、activation、旧proc selection semantics |
| [016](016-ranking-canonical-scenario-and-presentation.md) | superseded | ranking canonical scenarioと一覧presentation。ADR-027が置換 |
| [017](017-canonical-target-context.md) | accepted | canonical target context |
| [018](018-ranking-comparison-policy.md) | accepted | ranking comparison policy |
| [019](019-ranking-contribution-and-execution-plan.md) | accepted | ranking contribution and execution plan |
| [020](020-ranking-condition-provenance-and-field-policy.md) | accepted | ranking condition provenance and field policy |
| [021](021-canonical-activation-witness.md) | accepted | canonical activation witness |
| [022](022-activation-structure-cleanup.md) | accepted | activation structure cleanup |
| [023](023-canonical-noble-phantasm-variants.md) | accepted | canonical noble phantasm variant selection |
| [024](024-pre-noble-phantasm-plans-and-attack-profiles.md) | accepted | 宝具前有限planとAttackProfile ranking |
| [025](025-canonical-target-state-damage-semantics.md) | accepted | target-state mutationとdamage execution |
| [026](026-canonical-selection-semantics.md) | accepted | player choiceとstochastic outcomeのcanonical分離 |
| [027](027-portable-calculation-request-and-ranking-presentation.md) | accepted | 版付きportable calculation identity、ranking presentation、evidence-free cache |
