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
