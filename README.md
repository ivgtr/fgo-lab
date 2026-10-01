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

製品実装phaseの完了は`pnpm quality`で判定します。文書・指示だけの変更は、書式、`pnpm test:docs`、変更した参照・設定・配置を確認して閉じます。コード・実行設定にも影響する場合は対応するゲートを使います。規約は[AGENTS.md](AGENTS.md)を正本とし、`CLAUDE.md`も同じ内容を参照します。

Atlas JPのraw exportを`data/raw/`へ配置した場合、`pnpm --filter @fgo-lab/data-pipeline normalize <version>`で配信用マスターを再生成できます。rawファイルはリポジトリへコミットしません。

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

commitが未取得ならrepository提供者へそのrevisionを指定して取得します。取得できない場合は停止し、最新revision・別SHA・旧bundleで補わないでください。worktreeへの取得と依存installを終えてから、下のcommandをそのcheckout内で実行します。元run禁止の実利用は09.11で受入済みですが、その受入はインストール済み依存を共有した別rootのreplay／実mergeです。ネットワーク取得や新規依存installまで受入済みとは扱いません。

現在のproducerの回帰は既存の `audit-oc-matrix.ts` を8 shardで実行し、同じ出力directoryを `merge-oc-matrix.ts` へ渡します。mergeは全production record／aggregateを期待値と比較し、actual本文のtransaction／gateも検査します。baselineを更新する場合は、独立した期待値の承認と全意味値・inventory／digestの移行照合が必要です。

保存readerの再現だけを行う場合は、次のcommandを新しい出力directoryで実行します。replayはbaselineから実merge用の入力を構成し、damage producerの再実行とは区別します。

```sh
node --import ./packages/data-pipeline/node_modules/tsx/dist/loader.mjs packages/calculation-application/scripts/replay-production-baseline.ts .test-results/baseline-replay
node --import ./packages/data-pipeline/node_modules/tsx/dist/loader.mjs packages/calculation-application/scripts/merge-oc-matrix.ts .test-results/baseline-replay
node scripts/production-baseline-acceptance.mjs matrix .test-results/baseline-replay .test-results/baseline-negative
node scripts/production-baseline-acceptance.mjs six .test-results/baseline-six
node scripts/production-baseline-isolation.mjs /tmp/fgo-baseline-new-checkout .test-results/baseline-isolation.json
```

小さいpartition fixtureは同じbaselineの保存入力を再現するためのinventoryです。六クラスの意味規則と実runner、保存readerのmutation反例は同じrevisionの既存test／acceptance commandが所有します。途中の出力directoryは成功証拠に使わず、再実行は新しい出力先を指定してください。

A0〜A9の移管先・固定identity・期間・入手／不足時操作・原証跡の限界は[判断台帳の現行保持契約](docs/evidence/tsk-09-1-documentation-closure.md#step-2-保持契約の収束)を参照してください。判断はGit記録に保持し、raw log／trace／run receiptは[調査artifact policy](docs/requirements/test-strategy-redesign.md#9-artifact仕様)（CI14日・local最新10完了run）に従います。手動名directoryがcleanup対象外でも、永久保管や別環境の取得保証にはなりません。raw不足時は過去runのbyte再監査・照合付き再利用を主張せず、必要な契約をfresh commandで検証します。小fixtureやdigestを固有原入力・出自の代替にしないでください。旧全履歴bundleの取得・復元は現行readerの再開に不要です。
