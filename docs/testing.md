# テストと固定回帰入力

## 基本コマンド

| 確認対象 | コマンド | 用途 |
| --- | --- | --- |
| 局所の変更 | pnpm test:diagnostic -- <file> | 対象を指定した診断 |
| 通常unit | pnpm test:unit | 通常unitと完全状態の診断group |
| Published master | pnpm test:production | 登録済みproductionテストによる固定入力の検証 |
| 登録された広範囲の監査 | pnpm test:audit | HP・BP・control等の全経路監査 |
| UI・通信・保存復元 | pnpm test:e2e -- <file> | Playwrightによる実caller検証 |
| 文書 | pnpm test:docs | Markdown・参照・公開文書の到達検査 |
| ブラウザー観測基盤 | pnpm test:browser-observer | 実Chromiumによるconsole・popup・resource観測と添付保存 |
| GitHub Actions | pnpm quality:ci | format・lint・型・検証基盤・unit・production・master・build |
| 最終gate | pnpm quality | format・lint・型・検証基盤・unit・production・master・build・desktop／mobile E2E |

pnpm checkはqualityの一部です。damage、master、scenario、execution、rankingの変更では、最終qualityのproductionを通します。登録auditや全matrixが変更した契約を所有する場合は追加します。文書だけの変更はtest:docsと変更参照の確認で閉じます。

テストを足す前に、既存のテストが検出する失敗と、新たに守る利用者の振る舞いを確認します。十分な検出能力と低い維持費を両立できる層をunit・統合・E2Eから選び、同じ保証を機械的に重ねません。削除・統合する場合は、保証を引き継ぐテストか、保証が不要になった根拠を確認します。件数・行数・カバレッジだけを品質目標にしません。

通常unitは最大4worker、診断の長時間2ファイルは2workerで並行実行し、残りの完全状態診断とproductionは1workerで実行します。分類はscripts/test-suites.mjs、順序と予算はvitest.config.tsが所有します。auditは通常qualityに含めません。

published masterを使う新しいテストは、責務に応じてscripts/test-suites.mjsのproductionまたはauditへ明示的に登録します。完全な実行診断を書き出すテストはunit-diagnostics、production、auditのいずれかへ登録します。runnerは固定masterの直接読込み（パス変数・JSON importを含む）と、診断artifactの書込み（単純な別名を含む）を検査します。間接的なhelper利用など、検出対象外の責務も登録時に確認してください。

GitHub ActionsのPR・mainへのpush・手動実行はquality:ciを使い、ブラウザーを起動しません。test:runnerはNodeだけの検証基盤テストで、実ブラウザーの観測fixtureはtest:browser-observerへ分離しています。unitとproductionに加えてmasterと本番buildも確認します。実ブラウザーの表示・Worker通信・保存復元はこのCIの検証範囲に含まれないため、その経路を変更した場合は対象のtest:e2e、公開前は観測fixtureとE2Eを含むqualityをローカルで実行します。CIとローカルは同じrunner・失敗分類・artifact検査を使います。

E2Eの共通fixtureはAtlas APIへの想定外の要求を遮断し、Atlas画像を固定応答で返します。Atlas本文を検証するE2Eは保存済みfixtureを応答として使い、外部Atlasへ通信しません。

## ローカルのブラウザー検証

初回はChromiumとOS依存を準備してから、test:browser-observerやtest:e2eを実行します。

```sh
pnpm exec playwright install --with-deps chromium
```

Linuxの画像比較ではNoto CJKとNoto Color Emojiも準備します。Ubuntuでの準備:

```sh
sudo apt-get update
sudo apt-get install -y fonts-noto-cjk fonts-noto-color-emoji
```

## 固定入力

通常検証に必要なmaster、semantic fixture、raw入力、回帰baselineはrepositoryに保持します。内部の作業記録や過去の調査runを取得する必要はありません。

- raw HP条件は[固定入力宣言](../packages/data-pipeline/test-inputs/raw-hp-v1/manifest.json)と同directoryのgzip2件を使います。宣言・raw・published masterの組合せを検査します。
- historical productionの比較入力は[回帰source宣言](../packages/calculation-application/baselines/production-v1/source.json)と[manifest](../packages/calculation-application/baselines/production-v1/manifest.json)、80条件のgzip本文です。
- 小さい意味論ケースはpackages/test-fixturesで管理します。

回帰sourceの形式はproduction-audit-source-v1、保存本文の形式はproduction-regression-v1です。全34,640 outcomeの意味recordとinventory／digest、元manifestの出自を固定します。旧比較条件の保存形式を、現行のranking選択へ変換して実行しません。固定旧入力のreceipt／identity検査と、現行producerの成功条件は別に扱います。

監査source宣言は現形式だけを受け入れ、古い作業記録を入力にしません。過去の監査出力はその生成revisionで診断し、現在の検証は新しい出力先へ実行します。歴史的な固定baselineの専用readerと、現行監査出力の受入経路を混ぜません。

不足・破損時は同じrepository revisionから同じpathの入力を取得してください。別SHA、旧調査directory、小fixture、再生成した期待値で補いません。回帰値の更新は、独立した根拠と全意味値・inventory／digestの移行確認を必要とします。

## 全matrixと保存入力の検査

現行producerを全production条件で確認する場合、8shardを完了してから実mergeへ渡します。次の逐次例はCLIと割当ての説明です。正式な速度比較は同じ環境・入力・並列条件の8shard／最大4並列・2wave、独立3processの中央値を使います。

```sh
matrix_complete=yes
for shard in 0 1 2 3 4 5 6 7; do
  if ! FGO_AUDIT_SHARDS=8 FGO_AUDIT_SHARD="$shard" node --import ./packages/data-pipeline/node_modules/tsx/dist/loader.mjs packages/calculation-application/scripts/audit-oc-matrix.ts .test-results/matrix-new; then
    matrix_complete=no
    break
  fi
done
if [ "$matrix_complete" = yes ]; then
  node --import ./packages/data-pipeline/node_modules/tsx/dist/loader.mjs packages/calculation-application/scripts/merge-oc-matrix.ts .test-results/matrix-new
fi
```

出力先には未使用のpathを指定します。途中失敗したdirectoryを正常なmerge入力として使いません。保存readerの拒否反例と固定入力の検査:

```sh
node scripts/production-baseline-acceptance.mjs matrix .test-results/matrix-new .test-results/baseline-negative
node scripts/production-baseline-acceptance.mjs six .test-results/baseline-six
node scripts/production-baseline-isolation.mjs /tmp/fgo-baseline-checkout .test-results/baseline-isolation.json
```

isolationには未使用のcheckout出力先を指定します。必要なsource・固定入力をそこへコピーし、既存のインストール済み依存を共有して、元の調査runを読まずに全80条件を検査します。新しい依存installやネットワーク取得の検証とは区別します。保存baselineのreplayや旧入力の検査を、新しいdamage producerの成功として扱いません。

## 失敗とartifact

表示されたArtifactsのmanifest.jsonから、失敗step／child、完全stdout・stderr、構造化結果、trace・screenshotへ進みます。production診断はcanonical identity、typed reason、first differenceと完全diagnostics、入力receiptのbytes／SHAを確認します。表示の省略を失敗の削除と解釈しません。skip・todo・予期しないwarning／console・retry・artifact保存失敗を成功に変えません。

完全診断はJSON gzipで保存する場合があります。manifestの保存bytes／SHA、expectedDecodedBytes／expectedDecodedSha256で圧縮実体と展開内容を検査します。必要な1件だけをgzip -dcで新しい出力先へ展開し、巨大な本文をconsoleへ出さないでください。

CIは失敗時に.test-resultsを保存し、保持期間は14日です。成功時は大型の診断artifactをuploadしません。localの自動cleanupは最新10完了runを保持します。固定回帰入力と一時診断artifactは別に扱います。

## 性能比較

source、master・入力、Node、workload、並列条件を固定して前後各3回を比較します。Worker・共有chunk・遅延chunk・公開JSを含む全配信JSは同じ通常build・gzip条件で合算し、chunk移動を削減に数えません。初回rankingと全matrix監査の時間・max RSSを分け、観測付き測定を通常実行の速度へ代入しません。cap・timeout・ratchet・期待値を測定成功のために変更しません。
