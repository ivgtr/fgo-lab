# FGO Lab

Fate/Grand Orderの所持・育成状態を端末内で管理し、宝具ダメージ、火力順位、必要素材を確認する非公式・非営利のNext.js Webアプリです。ユーザーデータはブラウザのIndexedDBだけに保存します。

要件、ADR、実装Tasks、evidence、開発guideの正本は[文書index](docs/README.md)から辿れます。

## 開発

```sh
pnpm install
pnpm dev
```

Node.js 24以上、pnpm 11を対象とします。`pnpm build`はNext.jsの本番成果物を`apps/web/.next`へ生成し、`pnpm preview`で本番サーバーを起動します。

## デプロイ

VercelプロジェクトのRoot Directoryを`apps/web`に設定してデプロイします。ワークスペース内パッケージを参照するため、Root Directory設定の「Include source files outside of the Root Directory」を有効にします。フレームワークはNext.jsとして自動検出されます。

品質ゲート:

```sh
pnpm quality
```

変更中は`pnpm test:diagnostic -- <filter>`、`pnpm test:unit`、`pnpm test:production`の順に対象を広げます。`pnpm quality`はformat、lint、typecheck、runner／Suite／workflow contracts、重複しないunit／production Vitest、published master検証、build、Chromium／mobile Chromium E2Eを一度ずつ実行する、local／CI／Vercel共通の完了ゲートです。`validate:evidence`と`validate:master`は対象を絞った診断にも使用できます。

Atlas JPのraw exportを`data/raw/`へ配置した場合、`pnpm --filter @fgo-lab/data-pipeline normalize <version>`で配信用マスターを再生成できます。rawファイルはリポジトリへコミットしません。
