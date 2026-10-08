---
title: "FGO Lab テスト戦略 再設計計画・仕様書"
document_version: "1.3.5"
status: "Active"
approved_at: "2026-10-08"
updated_at: "2026-10-08"
created_at: "2026-08-30"
refactoring_contract: "docs/adr/008-refactoring-contract.md"
calculation_contract: "docs/adr/004-calculation-accuracy.md"
implementation_tasks: "docs/tasks/development-redesign-tasks.md"
---

# FGO Lab テスト戦略 再設計計画・仕様書

## 1. 目的

本書は、FGO Labのテストを、ダメージ計算の正しさを最優先に維持しながら、実行時間、診断可能性、エージェントが消費するログ量を制御できる構造へ再設計するための計画兼仕様書である。

主目的は次の4点とする。

1. 成功時に大量の低価値なログを出さず、テスト結果を10行以内で判定できるようにする。
2. 失敗時は原因特定に必要な構造化情報を表示し、完全ログと機械可読レポートを失わない。
3. 小さなsemantic fixtureとproduction全件監査の目的を分離し、全マスターの再読込・再走査・再計算を意味単位で集約する。
4. calculatorとrankingの同一実行経路、fail-closed、production inventory、性能を省略不能な品質ゲートとして維持する。

本書はテスト出力だけを局所修正する計画ではない。テストの所有責務、実行単位、成果物、CIゲート、性能ratchetを一つの戦略へ収束させる。

## 2. 最優先の利用者成果と不変条件

### 2.1 利用者成果

テスト戦略の変更後も、利用者が単発計算とランキングで受け取るダメージ値、precision、適用効果、警告、unsupported理由、UI上の状態に、意図しない差分を生じさせない。

### 2.2 不変条件

次をすべて満たさない変更は完了扱いにしない。

- `calc-core`のfloat32境界、丸め、clamp、乱数900〜1099、NP1〜5の契約を維持する。
- missing、ambiguous、contradictory、partially applicableな意味を数値fallbackへ変換せず、typed invalidまたはunsupportedとしてfail-closedにする。
- calculatorとrankingは同じapplication facadeとordered execution pathを使用する。
- effect occurrence内のoperationは順序付きかつtransactionalに実行し、部分commitを許さない。
- data pipelineだけがAtlas/raw語彙を解釈し、テスト基盤やUIがID、名前、label、raw keyからゲームルールを推測しない。
- production inventoryとcanonical digestを、ログ削減や高速化を理由に省略しない。
- UIはcanonical stateを表示し、テスト都合の別計算経路を持たない。
- 意図的なダメージ差分は、最終値だけでなくcanonical inputと支配するsemantic ruleを記録する。

## 3. 現状baseline

2026-08-30に、ルートの`pnpm test`を非TTY環境で実測した。

| 指標 | 現状値 |
| --- | ---: |
| test files | 77 |
| tests | 397 |
| 成功時出力 | 10行 / 242 bytes |
| wall-clock duration | 76.83秒 |
| 累積test time | 259.68秒 |
| import time | 50.45秒 |
| production master | 約33 MB |

主要な長時間suiteは次のとおりである。ファイル時間は並列実行を含むため合計値とwall-clockは一致しない。

| suite | ファイル時間 | 現在の主な責務 |
| --- | ---: | --- |
| `rankingProduction.test.ts` | 74.62秒 | production ranking、policy、digest |
| `productionMasterInventory.test.ts`／`productionMasterControlAudit.test.ts` | 46.20秒 | 2026-09-23 production artifact内訳: 通常に残すtarget-state inventory 3.15秒、全candidate値scan 17.79秒、support on操作 6.54秒、equipment／mystic-code on操作 18.72秒 |
| `executionSemanticsProduction.test.ts` | 28.18秒 | canonical execution semantics |
| `targetContextProduction.test.ts` | 23.42秒 | production target context |
| `unsupportedConvergenceGolden.test.ts` | 13.37秒 | unsupported収束golden |
| `rankingConditionInventory.test.ts` | 13.02秒 | ranking condition inventory |

現行`package.json`の`test`は`vitest run`を直接実行し、reporterや出力契約を明示していない。今回の10行出力は非TTY時のVitest挙動であり、TTY、CI、将来のVitest更新、失敗件数に対して安定したプロジェクト契約ではない。

また、複数のproduction test fileが`apps/web/public/master/master.json`を個別に読込・parse・走査している。ファイル内Promise cacheは存在するが、ファイル境界を越える正本にはなっていない。`pnpm test`の後に`pnpm validate:evidence`を実行するCI経路は、対象2ファイルを再実行している。

## 4. 対象範囲と非対象

### 4.1 対象範囲

- Vitest unit、property、golden、inventory、production parity test
- Playwright smoke、baseline、accessibility test
- テスト実行ラッパーとreporter
- ローカル、エージェント、CI、Pages公開前の品質ゲート
- テスト結果、完全ログ、JSON/JUnit、Playwright trace、screenshotの保存
- production masterの読込、監査モデル生成、digest計算の重複整理
- suite別実行時間とログ量のratchet

### 4.2 非対象

- ダメージ式、effect semantics、ranking policyそのものの変更
- テスト本数を減らすこと自体を目標とした統合
- production全件監査のsample化
- 失敗を成功扱いにするretry、許容差拡大、snapshotの無条件更新
- FGO Labを一般的なbattle simulatorへ拡張するためのテスト基盤
- 現在のプロダクト要件にないブラウザ、地域、ゲーム機能の先行追加

## 5. テスト分類と所有責務

### 5.1 Semantic fixture test

小さな型付きfixtureを使い、一つの意味規則または状態遷移を検証する。

主な所有者:

- `packages/schema`: invalid stateとexecutable stateの境界
- `packages/calc-core`: 数式、演算順、float32、乱数、NP level
- `packages/battle-execution`: condition、operation、順序、transaction、rollback
- `packages/calculation-application`: command、scenario解決、calculator/ranking共通facade
- `packages/profile-domain`、`packages/workspace-domain`: 純粋な状態遷移
- `apps/web`: canonical stateの表示とcommand dispatch

要件:

- 一件の失敗から支配するsemantic ruleが分かる名前を付ける。
- servant IDや名前をruntime分岐の理由にしない。実データ代表を使う場合も、期待値はtyped familyとcanonical inputで説明する。
- ログ削減のために無関係な規則を一つの巨大な`it`へ結合しない。
- invalid、unsupported、inputRequired、calculatedを数値snapshotだけで区別しない。

### 5.2 Golden／differential test

外部根拠または承認済みcanonical fixtureに対し、入力、damage rows、precision、evidenceを固定する。

要件:

- goldenに出典、case ID、版を持たせる。
- 差分発生時は、入力差、意味規則差、丸め差、master差を分類する。
- 最終damage値だけのsnapshot更新を禁止する。
- 意図的な変更では`engineVersion`または該当schema／artifact versionの更新要否を確認する。

### 5.3 Production audit test

全production masterを走査し、未知意味、件数、到達可能性、calculator/ranking parity、digestを検証する。

要件:

- production全件を対象とし、代表sampleへ縮小しない。
- package境界ごとに一つの共有監査モデルを作り、同じmasterの再読込と同じ派生集合の再計算を集約する。
- data pipeline監査はcanonical IR生成とraw vocabulary coverageを所有する。
- application監査はscenario、execution result、calculator/ranking parity、policy inventoryを所有する。
- 監査結果は、件数、typed failure inventory、canonical digestを持つ。
- digest不一致時に、最初の不一致identityとcanonical field差分を取得できるようにする。
- `expect`を全件loop内で無制限に出力せず、差分を収集して上限付きで報告する。
- 広い全件走査、全ownerのon/off展開、通常利用経路では出現しない特殊状態の組合せは、通常のunit／production suiteへ入れず、明示実行するopt-in audit suiteへ置く。通常suiteには共有inventoryの基本整合と、小さい代表fixtureを残す。
- opt-inへ移した検査もproduction全件をsample化しない。完全な母集団を保ち、通常suiteとaudit suiteの境界をrunner contractで検証する。

### 5.4 Architecture test

依存方向、禁止されたraw語彙、ranking専用damage経路、ID分岐などを検出する。

要件:

- 文字列検索だけを正しさの根拠にせず、可能な箇所はmodule boundary、型、公開APIで閉じる。
- architecture testは実行結果のparity testを置き換えない。

### 5.5 Web component／E2E test

UI表示、アクセシビリティ、永続化接続、calculator/rankingの利用者経路を検証する。

要件:

- UIがID、名前、labelからゲームルールを推測していないことを維持する。
- E2Eはunit testで十分な組合せを再列挙せず、利用者経路とpackage間接続を検証する。
- screenshotは失敗時のみ、traceは初回retryまたは失敗時に保持する。
- calculator/rankingのdamage parityはapplication production testを正本とし、E2Eは代表経路を確認する。

## 6. 目標実行構造

```text
package scripts / CI
        |
        v
canonical test runner
  |- suite selection
  |- process / timeout / exit code ownership
  |- stdout + stderr capture
  |- structured reporter output
  |
  +-> semantic fixtures
  +-> production audits
  +-> web component tests
  +-> Playwright E2E
        |
        v
result formatter
  |- success summary <= 10 lines
  |- bounded failure summary
  `- artifact manifest
```

実行ラッパーはテスト基盤の副作用境界とする。FGO domain packageをimportせず、servant、effect、damage、rankingの意味を解釈しない。domain固有の診断はテストまたはproduction audit modelが構造化結果として提供する。

## 7. コマンド仕様

最終的なルートscriptを次へ収束させる。名称変更が必要な場合も、同じ責務分離を維持する。

| command | 対象 | 用途 |
| --- | --- | --- |
| `pnpm test` | Vitest全件 | 開発者の標準ゲート。成功時compact |
| `pnpm test:unit` | production auditを除くVitest | 高頻度のローカル確認 |
| `pnpm test:production` | production audit、golden、parity | 全マスター品質ゲート |
| `pnpm test:audit` | 明示登録された全件／特殊経路audit | 高コストのcontrol、owner、transaction走査。通常qualityの外で必要時に実行 |
| `pnpm test:agent` | `pnpm test`と同じ集合 | エージェント向け固定出力 |
| `pnpm test:diagnostic` | 指定suiteまたは全件 | verboseな対話診断 |
| `pnpm test:runner` | Node runner／Suite／workflow contracts | canonical test基盤の自己検証 |
| `pnpm test:e2e` | Playwright | Chromium／mobile接続確認 |
| `pnpm test:a11y` | Playwright `@a11y` | accessibility確認 |
| `pnpm check` | static、runner／docs、unit、build | 高頻度のローカル統合確認。完了判定には使わない |
| `pnpm quality` | 下記canonical gate | CIとローカルの共通入口 |
| `pnpm results:clean` | `.test-results`のcanonical run | 最新10完了runを残す明示的なローカル整理 |

`test:unit`と`check`は開発中のfeedbackであり、単独では完了判定に使用しない。damage semantics、master、scenario、execution、rankingに触れた変更は、必ず`test:production`を含む`quality`を実行する。opt-in auditが該当する受入条件を所有する作業では、そのauditも明示実行してartifactとともにhandoffへ記録する。`check`と`quality`は同じquality runnerとstep定義を使い、quick profileはfull profileのstrict subsetとする。

**TSK-14に限る2026-10-08の受入例外:** 利用者は最終受入も代表ケースだけに絞ることを選択した。[TSK-14](../tasks/development-redesign-tasks.md#tsk-14-ranking最終方針の実装と正本収束)では、変更ownerへ対応する既存の小fixtureと代表のUI／worker経路、型・静的検査、文書整合を最終差分で確認し、`pnpm quality`／全production・全audit・80条件／別savedの再実行を完了条件にしない。監査command自体の対象集合・assertion・runner設定は縮小しない。既採取の全件原証拠はそのsource identityの保証として再利用し、最終差分がそれ以後に変更した意味へは全件保証を主張しない。対象外の不具合を無視せず、代表ケースの失敗は同じ直接familyを調べて修正する。この例外を他Task、CI、公開前のproject closureへ自動適用しない。

`quality`の実行集合は重複させない。

```text
format:check
lint
typecheck
test:runner
test:docs
test:unit
test:production
validate:master
build
test:e2e
```

`test:runner`はcapture／artifact契約に加え、unit／production／opt-in auditの排他的分類とlocal／CI／Pagesの同一quality入口を検証するため、canonical gateから省略しない。opt-in auditは`test:agent`と`quality`の既定stepから除き、`test:audit`で単独起動する。`validate:evidence`は対象を絞った診断コマンドとして残してよいが、同じfileを実行済みの`quality`から再度呼ばない。`validate:master`はtest fileと異なるpublished artifact検査だけを独立stepとして実行し、master-data／data-pipelineのVitestを再実行しない。

## 8. 出力仕様

### 8.1 成功時

標準出力は10行以内とし、最低限次を含む。

```text
PASS test:agent
Files: 77 passed
Tests: 397 passed, 0 skipped
Duration: 76.83s
Warnings: 0
```

要件:

- case名、成功assertion、worker進捗を逐次表示しない。
- ANSI progress更新を、ログ収集時に大量の物理行へ展開させない。
- test数、file数、skip／todo、wall-clock、警告数を隠さない。
- 意図しないskipまたはtodoはCIで失敗させる。明示的に許可する場合は根拠と期限を持たせる。

### 8.2 失敗時

標準出力は、原則200行または32 KiBの小さい方を上限とする。

表示順:

1. 実行command、終了状態、file／test集計
2. 失敗suiteとtest名
3. assertion message、expected／actual差分
4. domain testが提供したcanonical identityとtyped reason
5. 代表stack
6. 省略件数とartifact path

既定では最初の5失敗を表示する。同じ原因コードを持つ失敗は件数を集約する。原因コードがない失敗を文字列類似度だけで自動統合しない。

### 8.3 異常終了

timeout、signal、worker crash、out-of-memory、reporter crashでは、最後の100行とartifact pathを表示する。assertion failureがなくても成功扱いにしない。

### 8.4 警告とconsole出力

- stdoutとstderrを両方保存する。
- deprecation、unhandled rejection、resource leak、unexpected console出力を成功ログから黙って破棄しない。
- 許可されたconsole出力はテスト単位で根拠を明示する。
- CIでは新規警告を失敗または明示的なratchet差分として扱う。

## 9. Artifact仕様

各実行は一意なrun directoryを持ち、少なくとも次を保存する。

```text
.test-results/<run-id>/
  manifest.json
  vitest.json
  stdout.log
  stderr.log
  junit.xml          # CIで必要な場合
  playwright/        # E2E実行時
```

`manifest.json`は次を持つ。

- commandとsuite分類
- startedAt、duration、exit status
- Node、pnpm、Vitest、Playwright version
- commit SHAとdirty worktree有無
- file／test／skip／failure／warning数
- artifact file一覧
- 出力がtruncateされたか

要件:

- `.test-results/`はgit管理対象外とする。
- ローカル整理は明示的な`pnpm results:clean`だけが行い、canonical timestamp形式のdirect childだけを対象とする。最新10完了run、実行中run、手動命名した計測／evidence directoryは削除しない。保持数は正の整数で上書きできる。
- CIは失敗時に完全artifactを必ず保存する。現行workflowのuploadは`always()`、保持期間は14日とする。
- Playwright HTML report、trace、screenshotは現在の設定を維持する。
- artifact保存失敗をテスト成功で覆い隠さない。CIではinfra failureとして非0終了する。
- secret、環境変数全体、ユーザーのローカルデータをartifactへ記録しない。

調査artifactと回帰入力の保持責務を分ける。承認済み期待値1セット、意味規則の小fixture、再開command、採用判断・固定identityはrepositoryに保持し、現行consumerの利用期間は取得可能にする。期待値の更新は独立した承認と移管照合・判断記録を伴う。不足・破損は同じrevisionの固定入力を再取得し、変更producerによる再生成、旧形式、別保存先探索による補完をしない。

完全log／trace／実行receiptは上記CI14日・local最新10完了runの調査policyに従う。localは日数期限ではなく、明示cleanup時の有限run数である。手動名directoryのcleanup対象外や現在の存在は永続保管・外部取得の保証ではない。原byteが不足したら当時の全byte再監査・照合付き再利用は主張せず、Gitの受入判断と必要に応じたfresh検証を区別する。参照だけを原run全体の恒久保存義務へ変換しない。

固有入力・raw cells・原採取／独立receiptの内容はdigest・件数・再現fixtureだけで代替しない。必要な固有能力は個別にretainまたは意味を保持した移管先を決め、必要能力・固定identity・不足時操作・限界を判断記録へ残す。現行・後続の必須consumer／契約がなく原内容・出自の再監査能力だけを手放す場合は、保持判断の変更理由・対象identity・具体的な能力損失を明示した承認と記録を必要とする。これは原内容を移管済み・代替済みとする判断ではなく、物理削除の承認も兼ねない。必須義務が不明なら不足保留とする。`data/raw/`の入力はrun cleanupの対象外であり、本節のCI日数を原raw exportの寿命へ適用しない。TSK-09.1のA0〜A9・旧bundle・原入力不足の具体的な処遇契約は[判断台帳](../evidence/tsk-09-1-documentation-closure.md#step-2-保持契約の収束)と、その09.12節末尾の[09.13最終処遇判断](../evidence/tsk-09-1-documentation-closure.md#0913-不使用方針による最終処遇判断)を正本とする。09.13で旧bundleのHP原内容保持を解除したが、bundle外OC inventory／raw exportsの契約は変更しない。

通常CIの固定入力は、意味を所有するpackageの有限宣言と共有保存集合で供給する。Task追加・参照closure・調査runの存在だけでは保存集合を追加しない。追加／置換時は直接consumer、既存master／fixtureで不足する能力、固有内容・出自／固定identity、重複、取得／不足時操作、owner・参照期間・処遇条件を既存Taskへ記録し、保持範囲の拡張・取得元変更・能力損失を明示判断する。参照終了時は他consumer・保持参照を確認し、宣言除外だけで物理削除可能としない。

入力の保存量はpath数、distinct内容、圧縮bytes、復元bytes、metadataを分ける。Gitの現行集合と履歴に残る増加も区別し、path置換を履歴からの削減としない。診断artifact、依存・checkout・buildの容量と混ぜず、削減率を採用の完了条件にしない。現行raw HPの具体的な有限宣言・master対応と操作は[README](../../README.md#開発)、取得／更新／差戻しの受入と保証限界は[TSK-10](../tasks/development-redesign-tasks.md#tsk-10-ci入力ライフサイクルの設計と運用収束)が所有する。

## 10. 終了コードとprocess契約

- test runnerの非0終了をラッパーが0へ変換しない。
- stdout／stderrのcapture、pipe、reporterの成否に関係なく、test failureを保持する。
- test failure、timeout、signal、wrapper内部失敗を`manifest.json`で区別する。
- wrapper内部失敗時は非0終了し、「テスト結果を判定不能」と表示する。
- failure summary生成に失敗しても、完全ログの保存を試み、元のfailureを成功へ変えない。
- Ctrl-CまたはCI cancellationを子processへ伝播し、孤立workerを残さない。

## 11. Production audit再設計仕様

### 11.1 正本

production master全体の派生情報を、package境界ごとの共有audit modelへ集約する。

```text
canonical master
  |- data-pipeline audit model
  |    |- raw vocabulary coverage
  |    |- canonical operation inventory
  |    `- normalization digest
  |
  `- calculation-application audit model
       |- default scenarios
       |- projections / controls / activation witnesses
       |- execution outcomes / issues / traces
       |- calculator/ranking parity
       `- canonical damage and policy digests
```

data pipelineとapplicationを一つの巨大moduleへ統合しない。Atlas語彙の解釈とapplication scenarioの実行は別のsemantic familyであり、それぞれの境界内でmasterの読込・parse・派生集合を一回へ近づける。

### 11.2 Audit modelの要件

- canonical型だけを公開し、raw external keyをapplication側へ渡さない。
- available actions、used inputs、applied effects、execution issuesを別fieldで保持する。
- calculated、inputRequired、unsupported、invalidをexhaustive unionで保持する。
- calculator/ranking parityは同一scenario identity、canonical input、execution trace、NP1〜5 rowsで比較する。
- ranking policy差はdamage semantics差と別inventoryにする。
- failure detailは全件保持してartifactへ出せるようにし、console表示だけを上限付きにする。
- full masterを各test caseでreload、recompile、recalculateしない。

### 11.3 Digest契約

digest対象は安定したcanonical順序へ正規化する。object insertion order、worker完了順、locale依存表示文字列をdigestへ含めない。

digest変更時に必要な記録:

- 変更前後のdigest
- master、schema、engine version
- 最初の不一致canonical identity
- canonical input差分
- governing semantic rule
- calculator/ranking parityへの影響
- 意図的変更か不具合か

digestの更新だけで差分を承認してはならない。

## 12. CI仕様

### 12.1 Pull request／main

- `pnpm quality`を唯一のcanonical入口とする。
- unitとproductionは、同じtest fileを重複実行しないinclude規則を持つ。
- production gateはdamage関連変更だけに条件分岐して省略しない。当面は全PRで実行する。
- failure summaryをjob logへ表示し、完全reportをartifactへ保存する。
- concurrency cancellationは許可するが、成功済みでないgateを成功扱いにしない。

通常qualityに必要な入力とconsumerは同じ承認済みsource revisionで取得する。raw全内容・保存／復元identity、published master／manifest、consumer内固定identity・出自、依存する判定宣言を更新・差戻しのレビュー単位にする。欠落・破損・未知宣言・不正値・identity矛盾・部分更新を停止として扱い、同固定入力の再供給後に必要consumerから新出力で再開する。producerの既存宣言読取失敗を初回生成・別保存先で補わず、別版・latest・小fixture・expected再生成を復旧手段にしない。filesystem書込の中断は未受入として検査で拒否する。

更新手順の検証は新しいデータ・expectedの採用と分ける。固定baselineの供給契約、opt-in audit／matrix／replay、完全診断の保持policyも通常CI入力と区別する。別checkoutの取得・実consumer受入を将来更新・外部origin供給・hosted CI成功へ自動昇格させない。

### 12.2 Pages公開

- PR／mainと同じunit、production、evidence、typecheck、build契約を再利用する。
- deploy workflow独自の短縮test集合を作らない。
- 公開対象buildと検証したmaster／engine／schema versionが一致することをmanifestで確認する。

### 12.3 Sharding

wall-clock短縮が必要になった場合だけ導入する。shardはsemantic familyまたは安定したfile集合で分け、同じproduction master全件計算を複数shardへ複製しない。shard結果は機械可読reportをmergeしてから一つの成功／失敗判定を作る。

## 13. 性能と複雑性ratchet

ログ削減と実行高速化を別指標として測定する。

必須指標:

- 成功時stdout行数とbyte数
- 失敗時表示上限と省略件数
- wall-clock duration
- suite／file duration
- transform、import、test、environment time
- production masterのread／parse回数
- production scenario、candidate、damage request、distinct input件数
- calculator/ranking parity件数

判定:

- 成功時出力が10行を超えた場合はratchet failureとする。
- ラッパー導入によるwall-clock overheadは、同じ実行集合の中央値比較で2%または1秒の大きい方を超えない。
- 構造変更前後は同一環境で最低3回測定し、中央値を記録する。
- 10%以上または5秒以上の未説明なwall-clock増加を完了条件違反とする。
- candidate数、damage request数、production parse回数の増加を、単なるマシン差として無視しない。
- 意味論変更ではdamage correctnessとparityを性能より優先するが、性能退行を未記録のまま完了扱いにしない。

計測基盤の導入順序は次のとおりとする。

- T0〜T2は成功／失敗出力、wall-clock、suite／file時間を測定し、構造変更前後を同一環境で最低3回比較する。production masterのsource参照file／occurrence、既存production assertionが固定するscenario、candidate、damage request、distinct input、parity件数を記録する。
- runtimeのmaster read／parse、compile、candidate生成、damage request counterは共有production audit modelが所有可能になるT3で導入し、T3以降のblocking指標とする。T0〜T2では静的source参照数をruntime回数とみなさず、未計測を0件または非増加と表現しない。
- T3のcounter baselineはT2の同じproduction master、test identity、静的source参照、canonical count ratchetと照合する。counter導入を理由にproduction全件監査をsample化しない。

## 14. 実装フェーズ

### T0: Baseline固定

成果物:

- unit、production、E2Eのfile inventory
- 現行の行数、byte数、時間、警告、master読込箇所
- 重複実行しているCI step一覧
- production auditが保証するsemantic ruleとdigest一覧

完了条件:

- 本書3章の値を再現できるcommandが記録されている。
- 変更対象と無関係な既存問題を、mainまたは変更前baselineとの比較なしに断定していない。

### T1: Compact runner

成果物:

- process、capture、structured report、summaryを所有するfocused runner
- `test:agent`と`test:diagnostic`
- success、assertion failure、timeout、signal、reporter failureのrunner test
- `.test-results/`のignoreとmanifest schema

完了条件:

- 成功時10行以内で、test数、時間、警告が分かる。
- 失敗時に代表5件と完全artifact pathが分かる。
- 終了コード、stderr、timeoutを失わない。
- test集合と期待値を変更していない。

### T2: Suite分類とcanonical quality gate

成果物:

- unitとproductionの重複しないinclude規則
- `test:unit`、`test:production`、`quality`
- CIとPagesの共通実行契約
- `validate:evidence`、`validate:master`の重複整理

完了条件:

- `quality`で現行397 tests以上の必要契約が一度ずつ実行される。
- calculator/ranking parity、production inventory、evidenceが必須gateに残る。
- ローカル、CI、Pagesで異なる意味集合を持たない。

### T3: Production audit収束

成果物:

- data-pipeline共有audit model
- calculation-application共有audit model
- canonical diff formatter
- 旧重複loader、scan、parallel candidate listの削除

完了条件:

- package境界内で同じmasterと同じ派生集合をtestごとに再生成しない。
- 現行production inventory、calculator/ranking parity、fail-closed件数、digestsが一致する。
- 変更前後のwall-clock、import time、parse回数を比較している。
- 小さなsemantic fixtureの失敗局所性を悪化させていない。

### T4: Failure diagnosticsとartifact統合

成果物:

- typed reason別のbounded failure summary
- CI artifact upload
- Playwright reportとの共通manifest
- warning、skip、todo ratchet

完了条件:

- digest mismatch、schema invalid、unsupported増加、parity failureを意図的に発生させ、各診断がcanonical identityまで到達する。
- 大量失敗でも標準出力上限を守り、完全結果を失わない。

### T5: 運用移行

成果物:

- READMEの品質ゲート更新
- contributor向けtest選択表
- CI baselineと運用手順
- 廃止したcommand、reporter、重複経路の削除記録

完了条件:

- 新旧runnerや互換flagが併存していない。
- 実装担当者とエージェントが標準commandだけで同じ判定を得られる。

## 15. 検証行列

| 変更領域 | unit | production | parity | E2E | performance |
| --- | --- | --- | --- | --- | --- |
| schema | 必須 | 必須 | 条件付き | share／persistence影響時 | parse影響時 |
| data pipeline | 必須 | 必須 | canonical IR影響時 | master表示影響時 | 必須 |
| calc-core | 必須 | 必須 | 必須 | 代表calculator | benchmark必須 |
| battle-execution | 必須 | 必須 | 必須 | 利用者操作影響時 | candidate数必須 |
| calculation-application | 必須 | 必須 | 必須 | calculator／ranking影響時 | 必須 |
| web presentation | 必須 | canonical state影響時 | damage経路影響時 | 必須 | build／E2E時間 |
| test runnerのみ | runner test | 全件非退行 | 全件非退行 | E2E reporter確認 | overhead必須 |

「条件付き」は省略を推奨する意味ではない。変更が当該境界へ到達しないことを依存方向または差分で説明できる場合だけ省略できる。

## 16. 受入条件

次をすべて満たした時点で再設計完了とする。

1. 成功時の`test:agent`出力が10行以内である。
2. 失敗時の表示が上限内で、完全ログと構造化結果を参照できる。
3. test runner、pipe、reporter failureが終了コードを隠さない。
4. unitとproductionの目的、include規則、CI上の実行回数が明示されている。
5. production masterの再読込・再走査がpackage境界内の共有auditへ収束している。
6. production inventory、canonical digest、calculator/ranking parityが変更前と一致するか、意図的差分として根拠付きで承認されている。
7. missing、ambiguous、contradictory、partial semanticsのfail-closed testが残っている。
8. Playwright trace、screenshot、HTML reportが失敗時に取得できる。
9. 現行比の時間、import、parse、ログ量を測定し、未説明の退行がない。
10. 旧runner、重複CI step、不要な互換scriptが削除され、一つのcanonical quality pathになっている。

## 17. 禁止事項

- ログを減らすためだけに独立したsemantic testを巨大loopへ統合する。
- production auditそのものをsample、changed files、通常値だけへ縮小して全件保証を主張する。TSK-14の代表ケースによる限定受入は§7の例外として保証範囲を明示する。
- failureを`tail`だけで診断し、構造化resultを保存しない。
- stdoutだけを保存してstderrを破棄する。
- pipe後の終了コードをラッパー自身の成功で上書きする。
- 大量失敗を無制限に標準出力へ流す。
- warning、skip、todoを成功サマリーから完全に隠す。
- digest不一致を新digestへの置換だけで解消する。
- test基盤へservant ID、名前、label、Atlas raw keyによる分岐を追加する。
- calculatorとrankingで別の期待値生成器または簡易damage式を持つ。
- 性能改善のためにfail-closed、transaction、parity assertionを緩和する。

## 18. 実装時に記録する報告内容

各フェーズの報告には次を含める。

- 変更した責務と削除した旧経路
- 実行したcommandと対象suite
- file／test／skip／warning数
- 成功時行数とbyte数
- wall-clock、import、test、environment time
- production master read／parse回数
- production inventoryとdigest
- calculator/ranking parity
- fail-closed、partial commit、inert controlの件数
- Playwright結果とartifact path
- 意図的なdamage差分がある場合のcanonical inputとsemantic rule

テスト成功だけを根拠に完了を宣言せず、production inventory、calculator/ranking parity、fail-closed、性能、要求されたUI不変条件を変更範囲に応じて確認する。

T0〜T2でruntime counterが存在しない項目は`not measured (counter introduced in T3)`と記録する。これはphase reportの有効な状態だが、project完了条件やT3以降のblocking指標を満たしたことにはならない。

## 19. Contract catalog

| Contract ID | Governing sections | Contract |
| --- | --- | --- |
| `TS-OUT-001` | 8 | 成功時10行以内、失敗時bounded summaryと完全結果を保持する。 |
| `TS-ART-001` | 9 | manifest、完全log、JSON／JUnit、Playwright artifactを規定pathとretentionで保存する。 |
| `TS-RUN-001` | 10 | child failure、timeout、signal、reporter failureを成功へ変換しない。 |
| `TS-QUAL-001` | 7、12、T2 | unit／production／opt-in auditを重複なく分類し、runner contractを含む通常`quality`をlocal／CI／Pagesの唯一の入口にする。opt-in auditはquality外の明示入口を持つ。 |
| `TS-AUDIT-001` | 11、T3 | package境界ごとに共有production audit modelとruntime read／parse／compile／candidate／damage request counterを所有する。 |
| `TS-PERF-001` | 13、T1 | runnerだけの変更は同一集合の中央値で2%または1秒の大きい方をoverhead上限とする。 |
| `TS-PERF-002` | 13、T2〜T5 | 構造変更は同一環境3回の中央値で比較し、10%以上または5秒以上の未説明増加を拒否する。 |
| `TS-REPORT-001` | 13、18 | phaseで利用可能な指標を記録し、未導入counterは未計測と明示して後続導入Taskへ追跡する。 |
| `TS-FINAL-001` | 16 | 16章の10項目をproject closureで全て満たす。 |

## 20. Revision log

| Version | Reason／Contract | Approval | Impacted Tasks | Baseline impact |
| --- | --- | --- | --- | --- |
| 1.3.5 | TSK-14の最終受入だけを代表ケースへ限定する例外を§7／17に明記し、既存全件監査のsource identityと新差分の保証を分ける（`TS-QUAL-001`のtask適用境界） | approved 2026-10-08: user explicitly chose representative cases for final acceptance | TSK-14。通常CI／他Task／project closureは従来の全件gateを維持 | none for runtime／master／expected／fixture／全件audit実装。TSK-14最終run集合は小fixture＋代表UI／workerへ縮小し、新しい最終HEADの全production保証は主張しない |
| 1.3.4 | 有限CI入力のowner・保存追加判断・容量分類・同revisionの更新／差戻し・fail-closed／再開を明示（TS-ART-001、TS-QUAL-001、TS-RUN-001）。raw宣言は既存pathのv2にmaster対応・固定capture出自を追加 | approved 2026-10-03: user OK confirmed TSK-10 implementation plan | TSK-10のApply matrixとREADME運用。先行完了Taskの意味受入は維持 | none for damage／baseline／expected／fixture／全母集団・timeout／CI14日・local最新10run。CI raw metadata／consumer検査だけ改訂、gzip2件とpublished本文は不変 |
| 1.3.3 | 必須consumer／契約のない歴史原内容の再監査能力を手放す承認・記録と物理処遇の分離を明示。09.13のHP保持解除を同期（TS-ART-001） | approved 2026-10-02: user OK confirmed TSK-09.13 full-disposal judgment plan | TSK-09.13、TSK-09.1 STEP 3〜6、TSK-09 | none: 現行baseline・fixture・expected・damage・CI14日・local最新10runは不変。旧HP原byteの再監査能力を手放す |
| 1.3.2 | 09.11移管結果からrepositoryの回帰入力／fixture／判断記録と調査artifactの保持責務・不足時の能力制限を明示（TS-ART-001） | approved 2026-10-01: user confirmed TSK-09.1 STEP 2 plan | TSK-09.1 STEP 2、TSK-09 | none: CI14日・local最新10完了run、実行経路・expected・damageは不変 |
| 1.3.1 | 全件／特殊経路の高コストauditを排他的なopt-in suiteへ分け、通常のunit／production gateに代表fixtureと共有inventory整合を残す（TS-QUAL-001、TS-AUDIT-001） | approved 2026-09-24: user requested specialized sweeps stay out of ordinary tests | TSK-08、今後のproduction audit配置 | full production population／通常quality gateは不変。TSK-08 control auditは明示実行へ移動 |
| 1.3.0 | quick feedback profileとbounded local artifact retentionを追加し、full quality集合を維持 | approved 2026-09-04 | test execution observability follow-up | none: production／E2E／damage gateは不変 |
| 1.2.0 | phase／project closure、性能閾値、未計測counterをstable Contract IDへ収束 | retained: semantic／test集合は不変 | TSK-02.1〜09 | none: TSK-02計測値と397-test identityは不変 |
| 1.1.2 | `quality`へrunner contractを追加し、T0〜T2のruntime counterを未計測として明確化 | approved 2026-08-30 | TSK-02〜03 | TSK-02 evidenceで再測定 |
