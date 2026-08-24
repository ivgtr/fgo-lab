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
