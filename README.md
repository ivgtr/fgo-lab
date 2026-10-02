# FGO Lab

Fate/Grand Orderの所持・育成状態を端末内で管理し、宝具ダメージ、火力順位、必要素材を確認する非公式・非営利のNext.js Webアプリです。ユーザーデータはブラウザのIndexedDBだけに保存します。

要件、ADR、実装Tasks、evidence、開発guideの正本は[文書index](docs/README.md)から辿れます。

## 開発

```sh
pnpm install
pnpm dev
```

Node.js 24以上、pnpm 11を対象とします。`pnpm build`はNext.jsの本番成果物を`apps/web/.next`へ生成し、`pnpm preview`で本番サーバーを起動します。

`pnpm`は実行前にlockfileと`node_modules`の整合を確認し、不一致なら理由を表示して停止します。依存関係の変更後は`pnpm install`でlockfileとインストール済み依存関係を同期してください。書き込み可能な領域がリポジトリと`/tmp`だけの開発環境では、`pnpm install --store-dir=/tmp/fgo-lab-pnpm-store`を使います。CIでは同期済みlockfileを`--frozen-lockfile`で検証します。SQLite storeへの書き込み失敗をテスト失敗として扱わず、storeの場所と依存状態を確認してください。

## デプロイ

VercelプロジェクトのRoot Directoryを`apps/web`に設定してデプロイします。ワークスペース内パッケージを参照するため、Root Directory設定の「Include source files outside of the Root Directory」を有効にします。フレームワークはNext.jsとして自動検出されます。

品質ゲート:

```sh
pnpm quality
```

変更中は`pnpm test:diagnostic -- <filter>`で対象を絞り、必要に応じて`pnpm test:unit`または`pnpm test:production`へ広げます。全件・特殊経路を広く走査する明示登録済みauditは`pnpm test:audit`で実行し、通常の全体テスト`pnpm test:agent`と`pnpm quality`には含めません。TSK／受入条件がauditを要求する作業では、その結果も記録します。`pnpm quality`はformat、lint、typecheck、runner／Suite／workflow contracts、重複しないunit／production Vitest、published master検証、build、Chromium／mobile Chromium E2Eを一度ずつ実行する、local／CI／Vercel共通の完了ゲートです。`validate:evidence`と`validate:master`は対象を絞った診断にも使用できます。qualityに含まれる検査を成功後に追加実行しません。

検査の選択と完全診断:

`test:unit`は通常unitと完全状態の診断検査をどちらも実行します。前者は最大4 worker、後者はその後の独立groupで1 workerです。published masterを検査するproductionも、suiteごとの大きな入力graphが競合しないよう1 workerで実行します。診断検査をopt-inへ移したり、5秒のtest制限・assertionを緩めたりしません。分類は`scripts/test-suites.mjs`、順序と予算は`vitest.config.ts`が所有し、CLIの`--suite=unit`／既定全件から両groupへ到達します。新しい完全状態writerの配置はrunnerの分類検査で確認します。

| 変更・確認する対象                                   | 最初に使うcommand                        | 完了・追加条件                                                                              |
| ---------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| 局所の関数、component、入力修復                      | `pnpm test:diagnostic -- <file>`         | 対象を指定した診断。skip等を含む失敗はmanifestの判定を確認                                  |
| 通常の開発中確認                                     | `pnpm test:unit`、`pnpm check`           | checkはqualityのstrict subset。完了判定はquality                                            |
| damage、master、scenario、execution、ranking、parity | 対象の`test:diagnostic`                  | 最終`pnpm quality`のproductionを必須とする                                                  |
| 登録された全owner／control／特殊準備経路             | `pnpm test:audit`                        | そのauditが変更・TSKの受入条件を所有する場合に追加。品質成功だけからaudit成功を推定しない   |
| 全production条件の新しいproducer                     | 下記8 shard→実merge                      | master、生成・監査・意味値境界を変更し、全matrixが受入に必要な場合。通常qualityとは別の証拠 |
| 保存baselineのreader／実merge                        | 下記replay→merge／反例                   | 保存・受入経路を変更した場合。新しいdamage producerの成功には数えない                       |
| UI・通信・保存復元・keyboard／a11y                   | 対象の`pnpm test:e2e -- <file>`          | 実callerで確認し、最終qualityのdesktop／mobileを通す                                        |
| 文書・指示だけ                                       | `pnpm test:docs`と明示書式／変更参照確認 | docsは通常Prettier対象外。Markdown構文、frontmatter、表、参照を別途検査する                 |

localとCIは同じ`pnpm quality`を一度実行します。CI固有のbrowser install、fonts、reporter、retry設定は準備・診断用であり、runnerはskip、todo、予期しないwarning／console、retry、artifact不足を成功へ変えません。CIは失敗時も`.test-results/`をuploadし、保持期間は14日です。Vercelへの公開前にもこの完了ゲートを使います。現workflowがVercel上の自動実行まで保証するという意味ではありません。

失敗時は表示されたArtifacts pathの`manifest.json`からoutcome、exit、失敗step／child、完全stdout／stderr、構造化結果へ進みます。qualityでは`steps/<step>.stdout.log`／`stderr.log`とchild manifest、Vitestでは`vitest.json`／観測結果、Playwrightでは`playwright.json`、HTML report、宣言されたtrace／screenshotを確認します。production診断はcanonical identity、typed reason、first differenceを入口に、対応する完全diagnosticsと入力receiptのbytes／SHAを辿ります。bounded表示の省略件数を失敗の削除と解釈せず、artifact保存失敗・reporter failureは非zeroのまま原因を解消してください。同じcommandを無条件にretryせず、source・入力・環境の差と失敗原因を記録し、必要な局所commandから新しい出力先で再開します。

共通writerの完全診断は`<logical-name>.json.gz`に保存します。manifestの`format: json-gzip`、保存bytes／SHAと`expectedDecodedBytes`／`expectedDecodedSha256`が、圧縮実体と展開後JSONの固定identityです。runnerは両方とJSON構文を検査し、復元不足・破損・未知の宣言を失敗にします。診断が必要な1件だけを`gzip -dc -- <artifact>.json.gz > <new-output>.json`で新しい保存先へ展開できます。展開先はその診断期間だけの作業結果として扱い、巨大な本文をそのままconsoleへ出しません。test内部のdisk読取は既存artifact ownerの`readStoredProductionAuditArtifact`／`decodeStoredProductionAuditArtifact`を使います。plain JSONのin-memory codec、固定baselineのgzip reader、CI rawの固定供給はそれぞれの既存責務で、別形式や別保存先を探索して補いません。

pnpmがscript開始前に停止した場合は依存整合とstore書込を確認し、上の固定installへ戻ります。sandbox内の拒否だけから実環境の設定不正を推定せず、承認範囲の同じ操作を正式な権限審査で確認します。認証・接続、提供元の固定入力不足、bytes／SHA不一致は区別し、別認証・別版・別pathで補いません。

製品実装phaseの完了は`pnpm quality`で判定します。文書・指示だけの変更は、書式、`pnpm test:docs`、変更した参照・設定・配置を確認して閉じます。コード・実行設定にも影響する場合は対応するゲートを使います。規約は[AGENTS.md](AGENTS.md)を正本とし、`CLAUDE.md`も同じ内容を参照します。

通常productionの「damage relevanceで除外する前のraw HP条件」検査は、[data-pipelineの固定CI入力宣言](packages/data-pipeline/test-inputs/raw-hp-v1/manifest.json)と同directoryの全raw圧縮2件を読みます。Git checkoutで取得でき、可変な`data/raw/`や外部のlatest取得には依存しません。宣言・圧縮／復元bytes・SHAを照合してから元の全母集団を走査します。欠落・未知field・不一致・破損は失敗として停止し、同じsource revisionの入力を再取得して `pnpm test:diagnostic -- --suite=production packages/data-pipeline/src/executionSemanticsProduction.test.ts` から再開してください。別版・別path・小fixture・expected再生成で補いません。

CI入力はTask別保存を増やさず、意味を所有するpackageの有限宣言と唯一の保存集合を共有します。現在のraw直接consumerは上記1件、入力は2件だけです。追加／更新時は、直接consumer、既存master／fixtureで閉じない必要能力、固定identity・出自、重複、取得方法、保持owner・参照期間・処遇条件を既存Task／evidenceへ記録し、保存範囲の拡張を明示判断します。raw全体、調査run、bundleを自動追加せず、既存宣言で足りるTaskは新しい保存集合を作りません。今回の採用と容量・限界は[最終受入正本](docs/evidence/tsk-09-final-acceptance.md)を参照してください。

Atlas JPのraw exportを`data/raw/`へ配置した場合、`pnpm --filter @fgo-lab/data-pipeline normalize <version>`で配信用マスターを再生成できます。可変な`data/raw/`のrawファイルはGit管理しません。上記の固定CI入力は、それと責務を分けた全原内容の圧縮保存です。

## Serena（任意の開発補助）

[uv](https://docs.astral.sh/uv/getting-started/installation/)を用意し、製品依存とは分離してインストールします。

```sh
uv tool install --python 3.13 serena-agent==1.7.0
```

Codexへの接続は`.codex/config.toml`、TypeScript探索の設定は`.serena/project.yml`で管理します。リポジトリを信頼した状態でルートからCodexを起動し、`/mcp`でSerenaの接続を確認してください。設定追加後の既存sessionは再起動が必要です。Appなどで自動選択されない場合は、このリポジトリをSerenaのprojectとしてactivateします。

`.serena/`内では、共通の探索設定を持つ`project.yml`だけをGit管理対象とします。端末固有の上書きは`project.local.yml`に置き、memory・cache・logを含むその他のファイルはGit対象外です。Serena本体は各開発環境へインストールします。

全体onboardingは省略し、[文書index](docs/README.md)から今回の変更に必要な既存のTask／flowを参照します。ローカルmemoryは任意の参照補助であり、新しいcloneでの利用に必要ありません。生成master・rawデータをSerenaの探索から除外し、それらの確認には既存の検索・検証commandを使います。

## Production回帰baseline

承認済み期待値は `packages/calculation-application/baselines/production-v1/` の固定indexと80条件別gzip本文です。34,640 outcomeの全意味recordを保持し、`tsk-06-5-production-closure.json::productionMatrix.canonicalRecords` が形式・bytes・SHA・master identityを固定します。repositoryと依存関係から利用でき、過去のlocal runの復元は不要です。不足・破損時は同じrepository revisionのbaselineを再取得し、期待値を再生成して補わないでください。

固定入力を取得する際は、source declaration・published master・baseline・fixtureを同じrevisionで揃えます。09.11の移管済み取得identityは`dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4`です。既存repositoryでcommitの存在を確認し、新しいworktreeで取得する例は次のとおりです。pathは未使用の場所を指定してください。

```sh
git cat-file -e dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4^{commit}
git worktree add --detach /tmp/fgo-lab-baseline-dd1a0eb dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4
cd /tmp/fgo-lab-baseline-dd1a0eb
pnpm install --frozen-lockfile
```

commitが未取得なら、取得権限のあるrepository提供元の`origin`から次の固定revisionを取得し、最初のcommit確認から再開します。

```sh
git fetch --depth=1 --no-tags origin dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4
```

STEP 6では、利用者の明示判断により主repositoryを固定baselineの提供元としました。別object storeのshallow checkoutで、次のGit取得を行い、上の新worktree手順へ進みます。pathはその提供元が利用可能な環境のものです。

```sh
git fetch --depth=1 --no-tags file:///home/ivgtr/pj/fgo-lab/fgo-lab dd1a0ebc8723e8b12a2f75a7ab3256b8dc33b5a4
```

これは同じ固定commitの別checkout取得を実証した契約です。外部originはこのrevisionを`not our ref`で拒否しており、外部remoteからのbaseline取得は保証していません。主repositoryが利用できない環境では、同じ固定revisionを提供できる取得元・権限の明示判断が必要です。黙って取得元を切り替えず、提供元不足をシステム設定修復へ読み替えないでください。

remoteが固定revisionを提供しない、Git／SSH設定・認証・接続が失敗する、取得後に固定bytes／SHAが一致しない場合は、原因と必要なrevision・入力を記録して停止します。最新revision・別SHA・local objectコピー・旧bundle・期待値再生成で取得成功を補わないでください。worktreeへの取得と依存installを終えてから、下のcommandをそのcheckout内で実行します。元run禁止の実利用は09.11で受入済みですが、その受入はインストール済み依存を共有した別rootのreplay／実mergeです。ネットワーク取得や新規依存installまで受入済みとは扱いません。 STEP 6の別checkout受入と固定取得の成立範囲・不足時再開は[判定台帳](docs/evidence/tsk-09-1-documentation-closure.md#step-6-統合受入handoff)を参照してください。

現在のproducerの回帰は既存の `audit-oc-matrix.ts` を8 shardで実行し、同じ出力directoryを `merge-oc-matrix.ts` へ渡します。mergeは全production record／aggregateを期待値と比較し、actual本文のtransaction／gateも検査します。baselineを更新する場合は、独立した期待値の承認と全意味値・inventory／digestの移行照合が必要です。

全matrixを新しく生成する場合の実入口は次のとおりです。`tsk09-matrix-new`は例であり、実際には未使用のpathを指定します。8 shardをすべて成功させてからmergeします。性能比較では同じ環境・入力・workloadと並列条件を使い、標準の8 shard／最大4並列・2 waveを維持します。次の逐次例はcommandとshard割当ての説明で、正式性能測定の並列条件を代替しません。

```sh
matrix_complete=yes
for shard in 0 1 2 3 4 5 6 7; do
  if ! FGO_AUDIT_SHARDS=8 FGO_AUDIT_SHARD="$shard" node --import ./packages/data-pipeline/node_modules/tsx/dist/loader.mjs packages/calculation-application/scripts/audit-oc-matrix.ts .test-results/tsk09-matrix-new; then
    matrix_complete=no
    break
  fi
done
if [ "$matrix_complete" = yes ]; then
  node --import ./packages/data-pipeline/node_modules/tsx/dist/loader.mjs packages/calculation-application/scripts/merge-oc-matrix.ts .test-results/tsk09-matrix-new
fi
```

途中失敗したdirectoryを正常入力として再利用せず、失敗manifest・完全logを保存します。source declarationの期待値は固定baselineだけです。producer出力から承認済みexpectedを再生成しません。

保存readerの再現だけを行う場合は、次のcommandを新しい出力directoryで実行します。replayはbaselineから実merge用の入力を構成し、damage producerの再実行とは区別します。

```sh
node --import ./packages/data-pipeline/node_modules/tsx/dist/loader.mjs packages/calculation-application/scripts/replay-production-baseline.ts .test-results/baseline-replay
node --import ./packages/data-pipeline/node_modules/tsx/dist/loader.mjs packages/calculation-application/scripts/merge-oc-matrix.ts .test-results/baseline-replay
node scripts/production-baseline-acceptance.mjs matrix .test-results/baseline-replay .test-results/baseline-negative
node scripts/production-baseline-acceptance.mjs six .test-results/baseline-six
node scripts/production-baseline-isolation.mjs /tmp/fgo-baseline-new-checkout .test-results/baseline-isolation.json
```

小さいpartition fixtureは同じbaselineの保存入力を再現するためのinventoryです。六クラスの意味規則と実runner、保存readerのmutation反例は同じrevisionの既存test／acceptance commandが所有します。途中の出力directoryは成功証拠に使わず、再実行は新しい出力先を指定してください。

A0〜A9の移管先・固定identity・期間・入手／不足時操作・原証跡の限界は[判断台帳の現行保持契約](docs/evidence/tsk-09-1-documentation-closure.md#step-2-保持契約の収束)を参照してください。判断はGit記録に保持し、raw log／trace／run receiptは[調査artifact policy](docs/requirements/test-strategy-redesign.md#9-artifact仕様)（CI14日・local最新10完了run）に従います。手動名directoryがcleanup対象外でも、永久保管や別環境の取得保証にはなりません。raw不足時は過去runのbyte再監査・照合付き再利用を主張せず、必要な契約をfresh commandで検証します。小fixtureやdigestを固有原入力・出自の代替にしないでください。旧全履歴bundleの取得・復元は現行reader、今後の入力・再開・通常検証に使いません。[09.13最終処遇判断](docs/evidence/tsk-09-1-documentation-closure.md#0913-不使用方針による最終処遇判断)でHP原内容・出自の再監査能力を手放し、旧bundle全体を廃棄候補としました。小fixtureへの原内容移管ではありません。物理処遇は未実施で別の明示依頼を必要とし、bundle外OC inventory／raw exportsの契約は維持します。

## Task／threadの再開

[文書入口](docs/README.md)→[Tasks](docs/tasks/development-redesign-tasks.md)→対象Taskの最新Handoff→canonical evidenceの順に読みます。まずHEAD、未commit binary diff、index、並行sessionとin_progress最大1件を照合し、記録したsource／入力identityと異なる範囲の再利用を止めます。先行差分を新checkoutへ反映した場合も、反映後のidentityを確認します。前threadの会話やglobal Codex設定を検証入力にしません。

必要なbaseline・fixtureは同じ固定revisionの取得手順、判断記録はGitの正本を使います。raw logがない場合は歴史判断を保持し、当時のbyte再照合を主張せず今回必要な契約をfresh検証します。取得不能なら不足するrevision／path／権限判断と次の操作をHandoffへ残して停止します。TSK-09の全最終条件・実consumer・再利用境界・最終受入は[最終受入正本](docs/evidence/tsk-09-final-acceptance.md)を参照してください。
