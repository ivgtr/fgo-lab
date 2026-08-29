# データフロー

```text
Atlas static export -> data pipeline -> versioned master artifact -> IndexedDB master repository
                                                                      |
User input -> application service -> IndexedDB user repository -> calc-core -> view model
                                      |
                                      +-> UserDataBackup (local file only)
CalcInput + CalcResult -> allowlist builder -> URL fragment / share-only JSON / local image
```

外部送信するユーザーデータ経路は持たない。画像cacheはmaster構造化データおよびユーザー領域から独立する。

## Webアプリの依存方向

```text
画面コンポーネント
  ↓ props / user events
App（画面遷移とユースケースの接続）
  ├─→ calculation / specialTraits（純粋な計算・表示モデル）
  ├─→ profile-domain（プロフィールの純粋な状態遷移）
  ├─→ useProfileCollection（プロフィール状態・Undo・書き込み直列化）
  │      └─→ IndexedDbProfileRepository
  └─→ startup（起動・マスター更新のI/O調整）
         ├─→ master repository
         └─→ profile repository
```

`ProfileCollection`のブラウザ内所有者は`useProfileCollection`だけとする。画面はプロフィールを直接保存せず、純粋な状態遷移を同Hookの更新キューへ渡す。計算入力、構成選択、支援条件、共有スナップショットは`App`の単一`CalculationWorkspace`が所有し、計算画面はprops経由で参照・更新する。
