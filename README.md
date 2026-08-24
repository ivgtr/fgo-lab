# FGO Lab

Fate/Grand Orderの所持・育成状態を端末内で管理し、宝具ダメージ、火力順位、必要素材を確認する非公式・非営利の静的Webアプリです。ユーザーデータはブラウザのIndexedDBだけに保存します。

## 開発

```sh
pnpm install
pnpm dev
```

Node.js 24以上、pnpm 11を対象とします。`pnpm build`はGitHub Pages向けの静的成果物を`apps/web/dist`へ生成します。

品質ゲート:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:master
pnpm benchmark:calc
pnpm test:e2e --project=chromium --project=mobile-chromium
pnpm build
```

Atlas JPのraw exportを`data/raw/`へ配置した場合、`pnpm --filter @fgo-lab/data-pipeline normalize <version>`で配信用マスターを再生成できます。rawファイルはリポジトリへコミットしません。

現在の実装状況と公開前の未完ゲートは[docs/reports/r1-implementation-status.md](docs/reports/r1-implementation-status.md)を参照してください。

Fate/Grand Orderおよび権利者とは関係ありません。データ出典とライセンス境界は[docs/licenses/data-sources.md](docs/licenses/data-sources.md)を参照してください。
