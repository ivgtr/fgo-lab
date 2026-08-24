# FGO Lab

Fate/Grand Orderの所持・育成状態を端末内で管理し、宝具ダメージ、火力順位、必要素材を確認する非公式・非営利の静的Webアプリです。ユーザーデータはブラウザのIndexedDBだけに保存します。

## 開発

```sh
pnpm install
pnpm test
pnpm dev
```

Node.js 24以上、pnpm 11を対象とします。`pnpm build`はGitHub Pages向けの静的成果物を`apps/web/dist`へ生成します。

Fate/Grand Orderおよび権利者とは関係ありません。データ出典とライセンス境界は[docs/licenses/data-sources.md](docs/licenses/data-sources.md)を参照してください。
