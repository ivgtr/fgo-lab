# 開発ガイド

## 準備と起動

Node.js 24以上、pnpm 11を使用します。package.jsonのpackageManagerとpnpm-lock.yamlを揃えます。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev`は固定世代の開発用証明書を同一originから取得します。`pnpm dev:local-certificate`も同じ起動方法です。ゲームデータ本文はAtlas APIから直接取得し、固定世代と違う応答はdigest不一致で拒否します。公開build・`pnpm preview`は公開証明書を参照し、証明書を取得できない間は初回取得に失敗します。ブラウザーの固定入力検証はPlaywright fixtureで行います。

pnpmは起動時にlockfileとnode_modulesの整合を確認します。依存更新後はpnpm installで同期してください。storeの書込みに失敗した場合は実際のpathと権限を確認し、必要なら書込み可能なstoreを指定します。依存準備の失敗をテスト結果として扱いません。

```sh
pnpm install --frozen-lockfile --store-dir=/tmp/fgo-lab-pnpm-store
```

## Buildとデプロイ

```sh
pnpm build
pnpm preview
```

apps/web/.nextへ本番成果物を生成します。VercelではRoot Directoryをapps/webとし、workspace packageを含めるため「Include source files outside of the Root Directory」を有効にします。公開前の確認はpnpm qualityを使います。

## データ更新

Atlasのraw解釈と変換はpackages/data-pipelineが所有します。製品ブラウザーはAtlas APIの本文を直接取得し、独立監査が発行した証明書と照合します。監査の実行・証明書公開・端末内masterの更新契約は[Atlas更新記録](atlas-data-update.md)を参照してください。固定回帰用masterと入力はpackages/test-fixturesに保持し、version・bytes・SHA・参照整合性を検査します。

```sh
pnpm validate:master
```

欠落・破損・版の不一致を、別版のデータや期待値の再生成で補いません。固定入力は同じrepository revisionから取得し、不足しているpathを明示します。ゲームの意味値を変える更新では、根拠となるmaster・規則、production inventory、calculator／ranking parityと不正入力の拒否を確認します。

## 変更の確認

局所テストから始め、変更した責務と直接consumerを確認してから最終gateへ進みます。通信・表示・保存復元を変更した場合は実callerで確認してください。検証コマンド、matrixと固定baselineは[テストガイド](testing.md)、package間の依存は[アーキテクチャ](architecture.md)を参照してください。

公開文書は現在の機能・制約と再現可能な手順を記述します。個人環境の設定、作業計画、調査runの履歴は公開cloneの依存にしません。
