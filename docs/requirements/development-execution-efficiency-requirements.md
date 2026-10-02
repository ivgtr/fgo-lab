---
title: "FGO Lab 開発実行効率要件・統合実装計画"
document_version: "1.3.1"
status: "Active"
approved_at: "2026-10-02"
updated_at: "2026-10-02"
implementation_tasks: "docs/tasks/development-redesign-tasks.md"
created_at: "2026-08-30"
related_documents:
  - "docs/requirements/test-strategy-redesign.md"
  - "docs/requirements/ranking-self-and-conditional-effects-requirements.md"
  - "docs/tasks/development-redesign-tasks.md"
  - "docs/adr/004-calculation-accuracy.md"
  - "docs/adr/008-refactoring-contract.md"
---

# FGO Lab 開発実行効率要件・統合実装計画

## 1. 目的

本書は、テスト戦略再設計とランキング自己バフ・条件効果統合を、ダメージ計算品質を落とさず、実装時のモデル呼び出し、コンテキスト再送、ツール出力、待機pollingを制御して進めるための横断設計書である。

個々のテストを減らすことや、Codexの表示上のtoken値だけを小さくすることは目的ではない。目的は次の3点である。

1. production inventory、calculator/ranking parity、fail-closed、UI不変条件を維持したまま、検証の重複と低価値な出力を除く。
2. 一つの長大な開発threadへ調査、実装、テストログ、画像を蓄積し続けず、repository内の正本から次phaseを再開できるようにする。
3. テスト基盤変更とランキング意味論変更を、一つのTasks正本から実行できる境界を定義する。

## 2. 利用者成果と不変条件

### 2.1 利用者成果

開発実行効率を改善しても、calculatorとrankingが返すdamage、precision、適用効果、execution reason、unsupported／invalid判定、共有・保存、UI操作に、根拠のない差分を生じさせない。

### 2.2 不変条件

- damage correctnessをtoken、wall-clock、ログ量より優先する。
- calculatorとrankingは同じapplication facadeとordered execution pathを使用する。
- production全件監査をsample、changed files、通常条件だけへ縮小しない。
- missing、ambiguous、contradictory、partially applicableな意味を数値fallbackへ変換しない。
- Atlas/raw vocabularyの解釈はdata pipelineだけが所有する。
- ランキングpolicyはexecution semanticsを再実装しない。
- ログのtruncateやartifact生成失敗でtest failureを成功へ変えない。
- 実行効率のためにassertion、inventory、candidate cap、timeout、複雑性ratchetを緩和しない。
- servant ID、名称、label、raw keyを実行制御やテスト選択の分岐へ追加しない。

## 3. 観測baseline

2026-08-30にローカルのCodex session transcriptをread-onlyで集計した。token値はsessionが記録した累計であり、API課金額またはplanの消費量と同義とはみなさない。cached inputを分離して解釈する。

| session | task | model call | compaction | input tokens | cached比率 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-08-25〜28の長期thread | 54 | 8,732 | 61 | 1,371,676,925 | 98.5% |
| 2026-08-28の長期thread | 21 | 3,787 | 27 | 575,178,423 | 98.6% |
| 2026-08-30の短期thread | 5 | 32 | 0 | 1,667,946 | 93.2% |

最大sessionでは8,606回のtool orchestrationがあり、内訳は`exec_command` 4,786回、`apply_patch` 2,033回、`write_stdin` 1,647回、`view_image` 68回であった。完全一致する重複callは1,138回あり、同一processを1秒間隔で20〜30回pollする例を含む。

同sessionのtool resultには約28.6 MBのtextと約29.8 MBのimageが保存されていた。個々のcommandでは30,000〜50,000 tokenの出力上限や、複数fileの全範囲表示が使われていた。

一方、新しいthreadの初回model inputは約18,500 tokensであった。projectの`AGENTS.md`は約3 KBで主因ではない。固定contextには、built-in instructionsに加え、global skills metadata、plugins、permissions、蓄積された承認済みcommand prefixが含まれる。

このbaselineから、支配的な増幅式を次と定義する。

```text
total input
  ≈ model call count
    × (fixed prefix + retained conversation + retained tool results)
```

したがって、成功ログだけを短くしても、1秒polling、細粒度patch、長期thread、巨大なsource／image出力を維持すれば十分な改善にならない。

## 4. 責務境界

### 4.1 Repositoryが所有するもの

- canonical test runnerとcompact／diagnostic出力契約
- unit／production／E2Eの重複しないsuite分類
- full log、JSON、JUnit、trace、screenshotのartifact契約
- production audit model、digest、parity、performance ratchet
- エージェントが使用する標準commandと最小限の`AGENTS.md` guidance
- phase完了時に次threadへ渡せるcanonical handoff record

### 4.2 Sessionが所有するもの

- 関連fileだけを範囲指定して読むこと
- 独立したread-only調査を一つのtool orchestrationへbatchすること
- command出力上限、long-running processのyieldとpoll間隔
- `/status`、`/compact`、new threadの使用判断
- 失敗時にbounded summaryから必要なartifactだけを追加取得すること
- 承認範囲と実行権限の切り分け、正式な権限審査の利用、失敗原因・必要入力・成立範囲のHandoffへの記録

### 4.3 Operator環境が所有するもの

- `~/.codex/config.toml`のmodel、compaction、tool output上限
- projectで不要なglobal skills、plugins、MCP、承認済みcommand prefixの整理
- account／plan固有のusage limit確認
- システムの所有者・permissions、SSH設定・認証情報と接続先の提供権限

operator設定や個人のsession履歴をproduct testの入力にしない。repositoryは推奨値を文書化できるが、利用者のglobal設定を自動変更しない。

sandbox内のmetadata表示・アクセス拒否はその実行環境の観測であり、実環境の設定不正の証明ではない。承認済み操作がsandbox境界で失敗した場合は、提供されている正式なsandbox外実行審査（`require_escalated`等）で必要なmetadata確認・同じ操作を行う。設定・認証情報・入力を変えて拒否を迂回せず、審査が拒否した場合は理由と未達操作を記録する。正式な実行手段がない場合も、その制約を明示する。

環境修復を利用者へ依頼する前に、権限境界、接続／認証失敗、提供元の固定入力不足を実結果から区別する。システム設定の変更は根拠と明示承認を要する。固定revisionを提供元が持たない場合は必要なcommit／path／identityを示して停止し、取得元変更を暗黙のfallbackにしない。変更が明示承認された場合は、同じ固定identityをGitの取得経路で検証し、別checkout取得と外部remoteでの提供・取得の保証を区別して正本へ残す。

## 5. Canonical development execution path

```text
phase requirement
  -> bounded discovery
  -> typed implementation slice + representative path
  -> focused semantic tests
  -> scoped review + final quality (including production inventory/parity)
  -> bounded result summary + full artifact
  -> canonical handoff record
  -> next phase or new thread
```

変更境界、守る契約、必要な検証を説明できたら実装へ進む。複数層の変更は、関係する入力、実行、通信、表示、保存復元・入力修復の代表経路を早期に接続する。全体理解や全経路の事前完成は要求しない。

不具合発見時は共通原因と直接の生成・利用経路を確認し、未達条件の解消に必要な工程へ戻る。再調査は関連変更・新しい反例・根拠不足で見直す必要がある範囲に限り、有効なbaselineと証拠は継承する。無関係な既存不具合や別sessionの変更は自動的に修正対象へ含めず、影響と検証上の障害を記録する。必須ゲートが失敗したまま完了とはしない。

同条件で有効な検査結果はartifact manifestから再利用し、追加の診断目的なく再実行しない。ただしREADMEの必須qualityとCIの検査は省略しない。局所診断は失敗原因や変更境界に絞り、最終qualityの前に全件検証一式を重複実行しない。

製品実装の最終qualityは、既知の対象内Blockingを解消し、必要な局所検証と差分レビューを終えてから開始する。qualityで新しい不具合が見つかった場合は影響範囲の修正・局所検証へ戻り、差分が固まってから最終qualityを再実行する。成功した最終差分、対象内Blocking 0、正本記録の一致が揃えば終了し、新しい根拠のない再レビューを追加しない。

### 5.1 Command出力契約

`docs/requirements/test-strategy-redesign.md`の出力仕様を、テストだけでなく開発用の長時間commandにも適用する。

- 成功時は原則10行以内。
- assertion failureは原則200行または32 KiBの小さい方まで。
- full stdout／stderrとstructured resultはartifactへ保存する。
- source検索は該当行と必要な前後だけを返し、repository全体や巨大JSONを表示しない。
- 通常のtool output budgetは4,000 tokens以下を目安とし、12,000 tokens超は明示した診断目的がある場合だけ使用する。
- screenshot／traceは失敗またはUI invariant確認に必要な代表状態だけをmodel contextへ読み込む。

### 5.2 Long-running process契約

- 初回実行は30秒までtool側で待機する。
- 継続中の空pollは原則30秒以上の間隔とする。
- 進捗がないprocessを1秒単位でpollしない。
- 一つのprocessに対する同時waiterを作らない。
- CIやtest runnerがmachine-readable progressを持つ場合、modelへ逐次転送せずartifactへ記録する。
- timeout、signal、cancellationは子processへ伝播し、終了確認のための無制限pollを行わない。

### 5.3 Edit契約

- mechanicalな一括変更は一つのbounded patchまたはformatterへ集約する。
- semantic変更は所有module単位のreviewable patchにする。
- patch失敗時に同一patchを無条件で再送せず、対象行と現在差分を一度確認する。
- 各小patchのたびにfull qualityを実行せず、focused testからphase gateへ段階的に拡大する。

### 5.4 Thread／compaction契約

依頼された成果と現在の未達条件を維持する。判断の確定、代表経路の検証完了などの区切りで、進捗は既存Task、系統の判断・実行経路は既存flow noteへ差分を更新する。完了時やcompaction直前だけの記録に依存せず、小patchやtool callごとの更新は要求しない。
新しい依存経路や再指摘の発見だけで実装依頼を終了しない。通常の技術判断は依頼の中で解消し、session上限に達した場合は未完了として引き継ぐ。

FGO Labのsession上限は60分でcheckpoint、90分で新しいsemantic family・子調査を開始せず、現在のatomic actionを終えて引き継ぐ。
checkpointは成果、変更family、確定判断と根拠、有効な検証証拠、未達条件、次の操作を既存正本へ更新する。TaskのHandoffからflow noteとartifactを参照し、内容を複製しない。再検討されやすい棄却案だけは理由を残す。
引継ぎはcommitまたは差分、worktree状態、未完了gate、artifact manifest、次のcommandを残す。圧縮・再開後は記録と現在差分を照合し、未達条件から続ける。関連変更・新しい反例・根拠不足がなければ完了済み調査を再実行しない。

### 5.5 単独実行と例外的な調査

通常の診断・計画・実装・テスト・統合・レビュー判定は親が担当する。
子は同時に1つまで、独立した限定的な読み取り専用調査に限る。起動は必須でない。
起動前に独立した質問と単独では不足する理由、対象path、比較境界、返す根拠、時間予算を示し、全会話は渡さない。
子は編集・artifact作成・test/build・外部変更・承認・再委譲をしない。結論、不確実性、必要なfile/symbolだけを返す。
親の独立作業を終えてから合流し、同じ待機を短周期で繰り返さない。通知を利用し、予算超過時は調査を中止・縮小するか親で完了する。
モデル・read-only設定の正本は`.codex/config.toml`と`.codex/agents/fgo-readonly-researcher.toml`とする。

### 5.6 並行sessionと検証対象

独立したsessionで並行編集する場合は別worktreeを使う。同じworktreeの読み取り専用調査には分離を要求しない。すでに共有worktreeに差分がある場合は、担当範囲外の変更を移動・上書きせず、共有fileへの同時編集を避けて担当範囲だけ統合する。

最終qualityは統合後のworktreeで実行し、HEADと対象差分を特定できる状態を保つ。実行中は検証対象のsource、test、設定、文書を編集しない。対象変更が必要になった場合は実行を安全に終了または中断し、修正後の差分で検証する。実行中に対象が変わった結果を最終差分の成功証拠にせず、変更前と同条件と説明できる局所証拠だけを再利用する。無関係な改善を先送りできても、最終qualityの失敗は無視しない。

成功後にTask／flowへ検証結果の記録だけを追記する場合は、実装・検証入力・期待値・設定が同一であることを確認し、READMEの文書検証で閉じる。実行結果を参照するHandoffの更新だけを理由に全体qualityを再実行しない。testが読むevidenceやdigestの変更は記録のみの変更に含めず、影響する検証を行う。

## 6. 設定推奨値

初期値として次を推奨するが、modelやCodex更新後は実測で調整する。

```toml
model_auto_compact_token_limit = 48000
model_auto_compact_token_limit_scope = "total"
tool_output_token_limit = 4000
```

この値をrepositoryのdamage correctness契約にはしない。設定の有無にかかわらず、runnerのbounded outputとartifact保存は同じでなければならない。

global skills／plugins／permissionsはFGO作業に必要なものだけを有効にする。skills metadataはprogressive disclosureでも固定prefixを消費するため、別domain専用skillを同じprofileへ無制限に追加しない。

## 7. Phase gateとthread handoff

製品実装phaseは次のうち変更に適用する条件を満たして閉じる。文書・指示のみの変更はREADMEの文書検証範囲を使い、意味論matrixやproduction計測を追加しない。

1. user-visible outcomeとsemantic familyを記録した。
2. focused testsが通過した。
3. 変更範囲に必要なproduction inventory、parity、fail-closed gateを通過した。
4. 意図的なdamage差分をcanonical input、witness、ordered plan、governing ruleで説明した。
5. stdout上限とartifact completenessを確認した。
6. performanceとcandidate数に未説明の退行がない。
7. staged diffまたはhandoff対象diffを確認し、無関係なuser変更を含めていない。

handoff recordには次だけを残す。

- phaseと受入条件
- commitまたはdiff identity
- 確定判断・根拠の正本pathと今回のdelta
- canonical schema／digest version
- 実行済みcommandとartifact manifest
- damage／inventory／parity差分
- 未完了項目と次の最小command

raw test log、全source listing、全screenshotをhandoff本文へ貼らない。

## 8. 計測とratchet

### 8.1 Product quality gate

必須かつblockingとする。

- production inventory
- canonical digest
- calculator/ranking parity
- fail-closed、partial commit、inert control、stale mutation
- damage差分説明
- UI invariant
- wall-clock、parse、candidate、damage request

### 8.2 Development execution indicator

modelやCodex versionに依存するため、当面は観測指標とし、product testを失敗させるhard gateにはしない。

- phaseごとのmodel call数
- phaseごとのinput／cached input／output／reasoning
- `write_stdin`回数と最小poll間隔
- tool resultのtext／image bytesと最大値
- compaction回数
- handoffなしに継続したtask数
- 最終quality開始後に実装修正へ戻った回数と理由
- 同じ原因の再発見、圧縮・再開後の確定事項の再調査とその根拠

初期目標:

- 空pollは30秒未満0件。
- 同一callの無条件再送0件。
- success summary 10行以内。
- failure summary 200行かつ32 KiB以内。
- 通常tool output 4,000 tokens以下。
- phase完了後に別semantic familyを同一threadへ追加しない。

exact token総量は、model、tool schema、cache、managed instructionsで変動する。過去値との比較は同一Codex version、model、設定で行い、cached inputを分離する。

実装フローの改善は次の変更で既存session logとartifactから確認する。新しい計測基盤や毎回の集計報告は要求せず、必要な不具合修正と根拠のない再調査を区別する。

## 9. 停止条件

次を検出した場合は局所対応を重ねず、原因と設計・inventoryを見直す。技術的に解消できる問題は同じ依頼の中で修正・検証する。

- compact化のためにtestやproduction assertionを省略する必要がある。
- ranking実装のためにcalculatorと別executorが必要になる。
- audit高速化のためにsample化または異なる期待値生成器が必要になる。
- runnerがdomain semantics、servant ID、effect labelを解釈し始める。
- 一つのcandidateで矛盾するworld、resource、TargetContextを成立させる。
- candidate数またはtest時間の増加理由をcanonical inputで説明できない。
- compaction後に完了済み調査を繰り返す。
- tool failureに対して同じpatch、command、pollを反射的に再送する。
- bounded summaryでは原因が分からず、毎回full log全体をmodel contextへ戻す必要がある。

影響するsemantic familyと必要な証拠を既存正本へ更新して再開する。製品要件や実質的な依頼範囲の変更が必要な場合だけ利用者へ確認し、依存しない作業は続ける。

## 10. 完了条件

- `test-strategy-redesign`の受入条件を満たす一つのcanonical quality pathがある。
- `ranking-self-and-conditional-effects-requirements`の完了条件を満たす一つのranking execution pathがある。
- production masterのload、compile、scan、damage requestが測定され、無説明の重複がない。
- agent向け成功／失敗出力がboundedで、完全artifactを失わない。
- 1秒polling、無条件retry、巨大なfull-source出力が標準workflowからなくなっている。
- phaseごとにcanonical handoffからnew threadを開始できる。
- global Codex設定がなくてもrepositoryの品質判定は同じである。
- token効率改善を理由とするdamage、inventory、parity、fail-closed、UI品質の緩和がない。

## 11. Contract catalog

| Contract ID | Governing sections | Contract |
| --- | --- | --- |
| `DX-CMD-001` | 5、6 | bounded command、30秒以上のempty poll、artifact参照により無条件再実行と巨大出力を避ける。 |
| `DX-ART-001` | 6、7 | compact summaryと完全artifactを両立し、failureやstderrを失わない。 |
| `DX-HANDOFF-001` | 5.4、7 | 作業途中とphase closureの確定判断、commitまたは差分、canonical evidence、残課題、次commandを正本から再開可能にする。 |
| `DX-PERF-001` | 8 | product quality指標をblocking、model call／poll／tool outputを観測指標として分離する。 |
| `DX-FINAL-001` | 10 | canonical quality／ranking pathとrepository内handoffだけでproject closureできる。 |

## 12. Revision log

| Version | Reason／Contract | Approval | Impacted Tasks | Baseline impact |
| --- | --- | --- | --- | --- |
| 1.1.0 | phase closureとproject closureをstable Contract IDで参照可能にした | retained: 実行効率とproduct qualityの意味は不変 | TSK-02.1〜09 | none: 観測baselineとratchet値は不変 |
| 1.2.0 | 指示見直し依頼に基づき、技術的な再判断から実装を継続する境界、文書変更の比例検証、単独実行とsession上限の正本を整理。実行コード・既存Contract IDは不変 | approved 2026-09-12 | 全Taskの作業運用。個別受入条件とclosure matrixは不変 | none: damage／digest／artifact schemaは不変 |
| 1.3.0 | 実装フロー改善の依頼に基づき、調査・再検証の範囲、最終qualityの開始と終了、途中checkpoint、並行sessionの作業分離を明確化（`DX-CMD-001`、`DX-HANDOFF-001`、`DX-PERF-001`） | approved 2026-09-19 | 全Taskの共通実行手順。既存Contractの適用先と個別Done gate・closure matrixは不変 | none: 作業運用の変更のみ。damage／digest／artifact schema、product検証・ratchetは不変 |
| 1.3.1 | sandbox内観測を実環境の不正と断定した誤判断の再発防止。§4のSession／Operator責務へ正式な権限審査・原因分類・取得元変更の判断を統合（`DX-CMD-001`、`DX-HANDOFF-001`） | approved 2026-10-02: 利用者の指示整理・取得元変更判断 | 全Taskの共通運用、TSK-09.1／09のHandoff。既存Contract ID・Done gateは不変 | none: 固定baseline・意味論・artifact schema・quality／ratchet不変 |
