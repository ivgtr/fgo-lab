---
title: "FGO Lab 開発実行効率要件・統合実装計画"
document_version: "1.0.1"
status: "Proposed"
approval_gate: "Required before TSK-01"
updated_at: "2026-08-30"
implementation_tasks: "docs/development-redesign-tasks.md"
created_at: "2026-08-30"
updated_at: "2026-08-30"
related_documents:
  - "docs/requirements/test-strategy-redesign.md"
  - "docs/requirements/ranking-self-and-conditional-effects-requirements.md"
  - "docs/development-redesign-tasks.md"
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

### 4.3 Operator環境が所有するもの

- `~/.codex/config.toml`のmodel、compaction、tool output上限
- projectで不要なglobal skills、plugins、MCP、承認済みcommand prefixの整理
- account／plan固有のusage limit確認

operator設定や個人のsession履歴をproduct testの入力にしない。repositoryは推奨値を文書化できるが、利用者のglobal設定を自動変更しない。

## 5. Canonical development execution path

```text
phase requirement
  -> bounded discovery
  -> typed implementation slice
  -> focused semantic tests
  -> production inventory/parity gate
  -> bounded result summary + full artifact
  -> canonical handoff record
  -> next phase or new thread
```

同じ検査を「調査command」「個別test」「quality」「CI」「Pages」で重複実行しない。各gateは一つの実行結果とartifactを正本にし、後続stepはmanifestを参照する。

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

同じthreadを使う単位は一つの実装phaseまたは一つのreview finding familyとする。次の場合はhandoffを記録し、`/compact`またはnew threadへ移る。

- phaseの受入条件を満たした。
- model inputが初回baselineの約3倍、または概ね48,000〜64,000 tokensを超えた。
- production log、画像、広範なsource調査を追加で必要とする。
- product requirement、semantic family、変更対象が前turnから変わった。

handoffはchat transcriptではなく、commit、worktree status、変更したcanonical contract、未完了gate、artifact manifest、次の開始commandを記録する。完了済み調査を次threadで再実行しない。

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

各phaseは次を満たすまで次へ進めない。

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

初期目標:

- 空pollは30秒未満0件。
- 同一callの無条件再送0件。
- success summary 10行以内。
- failure summary 200行かつ32 KiB以内。
- 通常tool output 4,000 tokens以下。
- phase完了後に別semantic familyを同一threadへ追加しない。

exact token総量は、model、tool schema、cache、managed instructionsで変動する。過去値との比較は同一Codex version、model、設定で行い、cached inputを分離する。

## 9. 停止条件

次を検出した場合は局所対応を追加せず、phaseを停止して設計とinventoryへ戻る。

- compact化のためにtestやproduction assertionを省略する必要がある。
- ranking実装のためにcalculatorと別executorが必要になる。
- audit高速化のためにsample化または異なる期待値生成器が必要になる。
- runnerがdomain semantics、servant ID、effect labelを解釈し始める。
- 一つのcandidateで矛盾するworld、resource、TargetContextを成立させる。
- candidate数またはtest時間の増加理由をcanonical inputで説明できない。
- compaction後に完了済み調査を繰り返す。
- tool failureに対して同じpatch、command、pollを反射的に再送する。
- bounded summaryでは原因が分からず、毎回full log全体をmodel contextへ戻す必要がある。

停止後は、影響するsemantic family、production件数、責務重複、damage差分、実行コスト、単一の収束案を提示してから再開する。

## 10. 完了条件

- `test-strategy-redesign`の受入条件を満たす一つのcanonical quality pathがある。
- `ranking-self-and-conditional-effects-requirements`の完了条件を満たす一つのranking execution pathがある。
- production masterのload、compile、scan、damage requestが測定され、無説明の重複がない。
- agent向け成功／失敗出力がboundedで、完全artifactを失わない。
- 1秒polling、無条件retry、巨大なfull-source出力が標準workflowからなくなっている。
- phaseごとにcanonical handoffからnew threadを開始できる。
- global Codex設定がなくてもrepositoryの品質判定は同じである。
- token効率改善を理由とするdamage、inventory、parity、fail-closed、UI品質の緩和がない。
