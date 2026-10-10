# FGO Lab

Fate/Grand Orderの宝具ダメージを計算し、条件を揃えた火力ランキングや所持・育成状態を確認する非公式・非営利のWebアプリです。

## 主な機能

- 宝具の最低・平均・最大ダメージと、適用効果・計算内訳の表示
- 共通条件または保存した育成状態によるランキング、ランキングから計算機への引継ぎ
- 所持サーヴァント、育成状態、育成目標の管理
- 計算結果の共有と、端末内データのバックアップ・復元

ユーザーデータはブラウザのIndexedDBに保存します。端末間の自動同期はありません。ブラウザのデータ削除に備えてバックアップを保存してください。初回のマスターデータや画像の取得には通信を使います。

計算は宝具ダメージの比較を対象とします。複数ターンの戦闘全体を再現するものではありません。計算できない入力や未対応の効果は理由を表示します。育成素材の集計・管理画面には未完了の範囲があるため、素材計画はゲーム内の必要量も確認してください。

[使い方](docs/usage.md) · [計算方法](docs/calculation.md) · [文書一覧](docs/README.md)

## ローカルで起動

Node.js 24以上、pnpm 11を使用します。pnpmの版はpackage.jsonのpackageManagerに指定しています。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

本番用のビルドと確認:

```sh
pnpm build
pnpm preview
```

Next.jsの成果物はapps/web/.nextに生成します。開発・デプロイ手順は[開発ガイド](docs/development.md)、検証コマンドと固定入力は[テストガイド](docs/testing.md)を参照してください。

## 品質確認

```sh
pnpm quality
```

format、lint、型検査、検証基盤、unit／productionテスト、master検査、本番build、desktop／mobile E2Eを実行します。失敗時の詳細は表示されたArtifactsのmanifestとlogに保存します。変更に応じた追加監査は[テストガイド](docs/testing.md)で説明します。

## データと権利

構造化ゲームデータと戦闘仕様の出典はAtlas Academyです。[データ出典と画像の扱い](docs/licenses/data-sources.md)を参照してください。Fate/Grand Orderおよびゲーム内の名称・画像等の権利は各権利者に帰属します。本プロジェクトは公式サービスと関係ありません。
