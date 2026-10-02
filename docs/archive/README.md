---
title: "FGO Lab historical documentation index"
document_version: "1.0.2"
status: "Active"
updated_at: "2026-10-02"
---

# Historical documentation index

このindexは、current treeからGit-onlyへ移したhistorical snapshotの判断系列、現在status、canonical successor、復元情報を所有する。snapshot本文中の`Ready for Implementation`／`In Progress`や未完了表現は記録当時の状態であり、現在のTask statusではない。現行の実装順序は[development redesign Tasks](../tasks/development-redesign-tasks.md)、product semanticsは[documentation registry](../README.md)が案内するcurrent requirementsだけを正本とする。

## Recovery

全rowのdispositionは`Git-only`である。`Source commit`は当該内容がtracked archiveへ導入されたcommit、`Blob`は除去直前のGit object、`SHA-256`は除去直前の本文hashである。`Bytes`は固定blobの本文bytesであり、snapshotの意味・当時statusを変更しない。commit／元pathとblobの対応、bytes／SHAをすべて照合して復元する。

```sh
git cat-file -e <source-commit>^{commit}
git rev-parse <source-commit>:docs/archive/<path>
git cat-file -t <blob>
git cat-file -s <blob>
git show <source-commit>:docs/archive/<path> > <new-temporary-path>
wc -c < <new-temporary-path>
sha256sum <new-temporary-path>
```

最初のcommit確認が失敗するshallow checkoutでは、復元未成立として停止する。必要入力は該当rowの固定source commit・元path・blobである。取得権限のあるrepository提供元を`origin`とし、`git fetch --depth=1 --no-tags origin <source-commit>`で固定commitを取得してから上の照合を再開する。remoteが固定commitを提供しない、Git／SSH設定・認証・接続が失敗する、object不足またはidentity不一致なら原因と必要入力を記録して停止する。別commit・別path・local objectのコピー・旧bundle・再生成で取得成功を補わない。復元は新しい一時pathへ行い、現行のtracked文書に戻さない。

STEP 6初回のsandbox内GitはSSH初期化で停止したが、実環境の所有者は正常で設定修復依頼を撤回した。正式なsandbox外Git実行では設定済みoriginから固定historyを取得し、別checkoutで全18件のcommit／path／blob／bytes／SHA一致・一時復元を受け入れた。固定baseline revision取得の別義務と、証拠・再開操作は[判定台帳STEP 6](../evidence/tsk-09-1-documentation-closure.md#step-6-統合受入handoff)を参照する。

Revision: v1.0.2（2026-10-02）は正式なsandbox外取得と別checkout全18件復元の成立範囲を訂正する。v1.0.1（2026-10-02）は利用者承認済みSTEP 6の固定bytes・shallow不足時の停止／取得／再照合操作を補足する。既存Git-only18件の処遇・本文・歴史status・後継・固定commit／path／blob／SHAは不変。

## Product requirement evolution

| Snapshot | Current status | Canonical successor | Source commit | Blob | Bytes | SHA-256 | Disposition rationale |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fgo-lab-requirements.md` v0.2.2 | Superseded | [product requirements v0.3](../requirements/fgo-lab-requirements-v0.3.md) | `2e7e8b4a27b8dd73711b9f9a286134eae2c47596` | `70affb4fafbb2f84d20f92d29e97d29fc4e01415` | 68478 | `83d0844a16e296dad0068aeea91c3aacf0fec3ac09a96ee6ba991362599e7d5a` | v0.3がscopeと受入条件を継承し、本文自身もsuccessorを宣言する。 |

Decision chain: v0.2.2 → v0.3。現在authorityはv0.3だけである。

## Damage execution, condition, dependency, unsupported, and quality

| Snapshot | Current status | Canonical successor | Source commit | Blob | Bytes | SHA-256 | Disposition rationale |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `damage-condition-application-plan.md` | Complete | [damage execution requirements](../requirements/damage-effect-execution-requirements.md), [condition evidence](../evidence/damage-condition-application.md) | `1b419a8c1d807b79061a299629c9df3e78e5e496` | `6b0049eb5be316e58bb3926d8f247e47aa96d516` | 2627 | `1dea2afc72efb5826cafe83f70fed75040559c9716170f350810a530938c8a1e` | schema／engine移行は完了し、ruleと結果をsuccessorが保持する。 |
| `damage-effect-dependency-plan.md` | Complete | [damage execution requirements](../requirements/damage-effect-execution-requirements.md), [dependency evidence](../evidence/damage-effect-dependency-audit.md) | `1b419a8c1d807b79061a299629c9df3e78e5e496` | `d9b236e843bffe7db4848c83d4a6336aa2a6866d` | 5117 | `0156680fe87cf68bac29e44f3fa1fd8caafda5196a530d6ac3c06dd9d179cf7d` | producer／consumer収束は完了し、production結果をevidenceが保持する。 |
| `damage-effect-execution-structure-plan.md` | Complete | [damage execution requirements](../requirements/damage-effect-execution-requirements.md), [ADR index](../adr/README.md), [evidence index](../evidence/README.md) | `2e7e8b4a27b8dd73711b9f9a286134eae2c47596` | `a771d05072d6ab11da4f7f27de84c56f98b1eab3` | 21505 | `d2eff1d7762121ff768617b4a3ba1562d0e7314c959460e4ea1957b8b26d7d7c` | canonical IR判断はADR／requirement、inventory／digestはevidenceへ移管済みである。 |
| `damage-effect-unsupported-convergence-plan.md` | Complete | [damage execution requirements](../requirements/damage-effect-execution-requirements.md), [routing evidence](../evidence/damage-effect-routing-audit.md) | `2e7e8b4a27b8dd73711b9f9a286134eae2c47596` | `d0c640ada3970a209f5b48d6826ef8cc842648fd` | 30615 | `19ee3924effb1210869c1574a1865717156c237093d453800409b6a52056e84d` | exact-solvable familyは実装済みで、残存分類とproduction監査はsuccessorへ移管済みである。 |
| `damage-effect-zero-unsupported-plan.md` | Complete | [damage execution requirements](../requirements/damage-effect-execution-requirements.md), [evidence index](../evidence/README.md) | `2e7e8b4a27b8dd73711b9f9a286134eae2c47596` | `7c82589225309aca51aefe596dfe359faa01d7bc` | 10519 | `d22cbbea37ac43f5b0d95d3cbb29f14526900c4f97e220959c2272b7c278d7d4` | implementation-unsupported 0は完了し、semantic contractとratchet evidenceをsuccessorが保持する。 |
| `damage-effect-execution-migration-plan.md` v1.3.0 | Complete | [active Tasks](../tasks/development-redesign-tasks.md) TSK-08／09.1／09, [damage execution requirements](../requirements/damage-effect-execution-requirements.md), [evidence index](../evidence/README.md) | `2e7e8b4a27b8dd73711b9f9a286134eae2c47596` | `62bbc5059dbbaae4486cd0bdf96c6e3ee5b86d36` | 59545 | `c4a6a8a9055f7f2f7fc8dbc8b8518c1600ff44974dc8895a15f0e6446538e5d3` | E0〜E4は完了し、唯一の残作業E5はactive Tasksへ明示移管済みである。 |
| `damage-quality-convergence-plan.md` | Superseded（snapshot status: `In Progress`） | [damage calculation review](../requirements/damage-calculation-review.md), [active Tasks](../tasks/development-redesign-tasks.md) TSK-04〜09, [Q0〜Q5 evidence](../evidence/README.md) | `1b419a8c1d807b79061a299629c9df3e78e5e496` | `0aab063dcec20a27ddfdecda5b27a8613f3545dc` | 21668 | `7afdddb8f467d4f05f96cb369883b17922128c347e8fc532e611d18945101a77` | Q0〜Q5.5の結果はevidence、Q6／Q7相当はactive Tasksが所有し、旧statusに現行性はない。 |

Decision chain: condition／dependency plans → execution structure → unsupported convergence → zero-unsupported → execution migration E0〜E4。quality plan Q0〜Q5.5は同系列のevidenceを補強し、残作業はactive Tasksへ合流した。未移管Task、canonical delta、未判定damage evidenceはいずれも0件である。

## Implementation and demo restoration

| Snapshot | Current status | Canonical successor | Source commit | Blob | Bytes | SHA-256 | Disposition rationale |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `implementation-plan.md` | Superseded（snapshot status: `Ready for Implementation`） | [active Tasks](../tasks/development-redesign-tasks.md), [product requirements](../requirements/fgo-lab-requirements-v0.3.md) | `1b419a8c1d807b79061a299629c9df3e78e5e496` | `f748029aa8e70922194cb28175f9309ff1a8452c` | 35816 | `460b54957246ca69664c8a1c385643e4ec692d58693b94c41c079f01248ae7e3` | 旧M0〜M10の順序はactive Tasksに置換され、product判断はcurrent requirementへ統合済みである。 |
| `demo-feature-restoration-plan.md` | Superseded | [UI design specification](../requirements/ui-design-spec.md), [active Tasks](../tasks/development-redesign-tasks.md) | `1b419a8c1d807b79061a299629c9df3e78e5e496` | `c7e58259e2f0769f2d03cc9f541a89ff06b9ebd1` | 27604 | `248d7d95a93b88da024957e2ec29d89fa3eb1e6dc5c5f7b9c8b3321413ebfcd8` | vertical sliceの採用結果はUI contract、未実装順序はactive Tasksが所有する。 |

Decision chain: initial implementation plan → demo restoration slices → current product／UI requirements + active Tasks。

## UI research and option decisions

| Snapshot | Current status | Canonical successor | Source commit | Blob | Bytes | SHA-256 | Disposition rationale |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `game-tool-ui-research.md` | Complete | [UI design specification](../requirements/ui-design-spec.md) | `1b419a8c1d807b79061a299629c9df3e78e5e496` | `17db3672c51a7734ae06a2fd8cc0256dba4c62d1` | 6469 | `cb317acc4f9b9a9327c4a61c4109a53d9b7f73c779d1d0160b7e90f4bfbf8728` | 比較調査から採用した視覚方針はUI contractへ統合済みである。 |
| `home-ui-options.md` | Complete | [UI design specification](../requirements/ui-design-spec.md) §19 | `1b419a8c1d807b79061a299629c9df3e78e5e496` | `c4146075a75727b1bc1db7da075b67707d9d6f22` | 5039 | `95fd9d0cf2b0991959d7c980085a28c71fe407a3f4946ef168f0194a86206669` | setup／homeの採用判断はUI contractへ統合済みである。 |
| `my-chaldea-ui-options.md` | Complete | [UI design specification](../requirements/ui-design-spec.md) §17 | `1b419a8c1d807b79061a299629c9df3e78e5e496` | `aaab7b7e6c69d0efee0709ff86a9eb6144f1036f` | 9961 | `09f61d361e0da9f5dd1d9ac3436fc96c4de620e365aed8f93283c561076023dd` | 所持・育成管理の採用判断はUI contractへ統合済みである。 |
| `craft-essence-ui-options.md` | Complete | [UI design specification](../requirements/ui-design-spec.md) §17.6〜17.7 | `1b419a8c1d807b79061a299629c9df3e78e5e496` | `9389daeb4821727b51c2e8d5ff1599a1e0314f1d` | 2011 | `493997d607f1d92017a3c9011b0792540ee4b73d181129dbe630f49be3828342` | 概念礼装管理の採用判断はUI contractへ統合済みである。 |
| `support-template-ui-options.md` | Complete | [UI design specification](../requirements/ui-design-spec.md) §7／§15〜16 | `1b419a8c1d807b79061a299629c9df3e78e5e496` | `1f9cb2c77fa8266c048e6819abbd5024dff9a6f7` | 15037 | `877893617fcb774e50423dc58d1bc18402024ab9caa58c591a8c41ec2c537413` | 支援条件の採用判断と入力契約はUI contractへ統合済みである。 |
| `growth-plan-ui-options.md` | Complete | [UI design specification](../requirements/ui-design-spec.md) §18 | `1b419a8c1d807b79061a299629c9df3e78e5e496` | `8e5c289bc0728de41ddd8521cde4f60a1b1fa391` | 3866 | `f97e48bcee851a35816a4ba2f46f2b6b809a192ae661cf413bbd3975e8c98bf8` | 育成計画の採用判断はUI contractへ統合済みである。 |

Decision chain: comparative research → feature-specific option decisions → UI design specification。現在のUI authorityはUI design specificationだけである。

## Master delivery and data flow

| Snapshot | Current status | Canonical successor | Source commit | Blob | Bytes | SHA-256 | Disposition rationale |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `chaldea-data-update-review.md` | Complete | [ADR-003](../adr/003-master-delivery.md), [data source licenses](../licenses/data-sources.md) | `1b419a8c1d807b79061a299629c9df3e78e5e496` | `4b6d792c2f19b20568225fc53d3c9df2548c6d5c` | 8035 | `5d2575218409b9b2ed4467121ab34228388e89694495ad882e46ca5e8dd1b517` | upstream調査の採用結論はADR、provenanceはlicense registryが保持する。 |
| `data-flow.md` | Superseded | [canonical data flow](../guides/data-flow.md) | `1b419a8c1d807b79061a299629c9df3e78e5e496` | `e8d65cc2b972b146a22d2989561903440172e592` | 1623 | `136dbd4effefecbb97c2c3cfa61b26550e038870c1f13f323ac2380d0d485f89` | pre-disposition snapshotのhashを保ち、現行code／ADRに基づくguideへcanonical deltaを統合済みである。 |

Decision chain: upstream delivery research → ADR-003、pre-disposition data-flow snapshot → canonical data-flow guide。

## Audit result

18 snapshotを全文監査し、current requirements／ADR／Tasksへの未移管Task 0件、canonical delta 0件、`docs/evidence/`へ移すべき固有damage／production evidence 0件と判定した。damage evidence 31件は統合・削除せず[evidence index](../evidence/README.md)配下で保持し、TSK-09.1へ引き渡す。
