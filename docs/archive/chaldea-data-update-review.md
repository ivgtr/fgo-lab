# Chaldea DB更新方式の調査とFGO Labへの適用

更新日: 2026-08-24  
調査対象commit: `93bb7cbcc0c40566cc9a28c1cf81f97239e7c6fd`  
位置づけ: ADR-003「マスターデータ配信」の判断材料

## 結論

Chaldeaの更新方式は、次の設計原則を参考にできる。

- ユーザーデータとゲームデータを別領域にする。
- 版manifestを最初に取得し、必要なファイルだけを更新する。
- データ側から最小アプリ版を要求できるようにする。
- 有効なローカル版をfallbackとして保持し、更新失敗時も互換性を確認して利用を継続する。
- 構造化データと画像キャッシュを分離する。
- 更新データを全体として読み込み・検証してから利用する。

FGO Labではコードを移植せず、Web／IndexedDB向けに次の改善を加えて独自実装する。

- MD5ではなくSHA-256を使う。
- 更新ファイルをstaging領域へ書き、全体検証後にactive manifestポインタだけをtransactionで切り替える。
- 既存のactive版を更新中もfallback可能な状態で保持する。
- 画像は計算開始条件にせず、別キャッシュとして遅延取得する。
- 更新取得と有効化を分離し、検証前のcandidate版を通常機能から参照させない。

## 公開実装から確認できた構造

### 1. ローカル優先とfallback

起動処理は有効なローカルデータを利用でき、オンライン更新に失敗した場合はローカルキャッシュへfallbackする。ネイティブ版ではローカル読込後にバックグラウンド更新する分岐もある。

参照:

- [startup_load_page.dart](https://github.com/chaldea-center/chaldea/blob/main/lib/app/modules/home/bootstrap/startup_load_page.dart)
- [Chaldea APP Settings](https://docs.chaldea.center/guide/app_setting)

### 2. 版manifestとアプリ互換性

`DataVersion`はtimestamp、UTC表記、`minimalApp`、ファイル一覧を持つ。各`FileVersion`はkey、filename、size、timestamp、hash、縮小版情報を持つ。データが要求する最小アプリ版より古い場合は更新を止める。

参照:

- [gamedata.dart](https://github.com/chaldea-center/chaldea/blob/main/lib/models/gamedata/gamedata.dart)
- [gamedata_loader.dart](https://github.com/chaldea-center/chaldea/blob/main/lib/app/tools/gamedata_loader.dart)

### 3. ファイル単位の差分取得

loaderはmanifest内の各ファイルについてローカルファイルを確認し、不足またはhash不一致のファイルを取得する。取得数を制限しながら並行処理し、進捗をファイル数から算出する。

FGO Labでは次を変更する。

- hash検証を設定任意にせず常時行う。
- manifest自身も信頼できる配信元とHTTPSを前提にする。
- 圧縮後hashと展開後schema検証を分ける。
- ファイル数だけでなくbytes単位の進捗を表示する。

### 4. 全体組立後の検証

Chaldeaは取得ファイルを一つの`GameData`へ組み立て、主要データの存在を検証してから更新ファイルを書き込む。破損したデータをそのままアプリ状態へ採用しない考え方は利用できる。

FGO Labでは複数ファイル書込途中の障害まで扱うため、次の二領域を持つ。

```text
master_active
  activeManifestVersion -> v2026xxxx

master_staging
  candidate manifest
  candidate normalized records
  validation report
```

staging版のschema、参照整合性、件数、checksum、計算ゴールデンテストが成功した場合だけ、`activeManifestVersion`を一回のtransactionで切り替える。失敗したstaging版は通常のrepositoryから参照しない。

### 5. 構造化データと画像の分離

Chaldeaの設定・ディレクトリ構造はゲームデータと画像等のassets cacheを分け、画像キャッシュだけを削除できる。過去のdataset配布でもtextとiconが別assetだった。

参照:

- [Chaldea APP Settings](https://docs.chaldea.center/guide/app_setting)
- [旧chaldea-dataset README](https://github.com/chaldea-center/chaldea-dataset)

FGO Labも次の順にする。

1. 計算・検索に必要な構造化データ
2. 一覧の基本表示に必要な小画像
3. 表示時に取得するその他画像

画像取得失敗をDB更新失敗として扱わず、名称fallbackを維持する。

## FGO Labの推奨更新フロー

### 初回セットアップ

1. bootstrap manifestを取得する。
2. `minimalAppVersion`とschema版を確認する。
3. JP／日本語のR1必須ファイル一覧と総bytesを確定する。
4. ファイルをstagingへ取得し、SHA-256を検証する。
5. 正規化、schema検証、参照整合性、未知関数検出を行う。
6. 検索索引をstagingへ構築する。
7. active版をtransactionで切り替える。
8. ホームへ遷移する。
9. 基本画像とその他画像を優先度順に遅延取得する。

### 通常起動

1. active版を読み、fallback可能か互換性を確認する。
2. ホーム表示前にmanifestを確認する。
3. 更新がなければactive版でホームへ進む。
4. 新版があればstagingへ取得し、SHA-256、schema、参照整合性、索引を検証する。
5. 検証成功後にactive版を切り替え、ホームへ進む。
6. オフラインまたは更新失敗時は、互換性のあるactive版がある場合だけ、版と最終更新時刻を明示して続行する。
7. active版が非互換または破損している場合は、専用画面で再試行、アプリ更新、復旧を案内する。

### 失敗時

- manifest取得失敗: 互換性のあるactive版だけを、使用版と失敗を明示して継続利用する。
- ファイル取得失敗: stagingを不完全として保持または破棄し、active版は変えない。
- hash不一致: 一度だけ別キャッシュキーで再取得し、再失敗時は更新を停止する。
- schema・参照検証失敗: candidate版とvalidation reportを記録し、activeにしない。
- 容量不足: 必要bytesを示し、画像cache削除と再試行を案内する。

## 多言語を想定する境界

R1のUIは日本語、ゲーム地域はJPとするが、次を別の値として保存する。

- `uiLocale`: R1は`ja`
- `gameRegion`: R1は`JP`
- `masterDataLocale`: R1は`ja-JP`
- `masterDataVersion`

マスターIDと計算fingerprintへ表示文字列を含めない。翻訳ファイルは構造化データ本体と分離し、将来の言語追加だけで計算データを再取得しなくてよい構造を目標とする。

## ライセンス上の境界

Chaldea本体はAGPL-3.0で公開されているため、ソースコードを複製・翻案して組み込む場合はライセンス条件の確認が必要である。

参照:

- [Chaldea repository](https://github.com/chaldea-center/chaldea)
- [Chaldea LICENSE](https://github.com/chaldea-center/chaldea/blob/main/LICENSE)

本調査では公開された動作とデータ更新上の一般的な設計パターンだけを参考にし、Dart実装を移植しない。R1は個人・非営利用途としてAtlas Academyを主な上流候補に採用する。現在の`chaldea-data`は複数ソースが混在して追跡と正規化が難しいため、権利判断ではなく運用上の単純性を理由に主データソースへ採用しない。将来Chaldeaのコードを利用する場合はAGPL-3.0への準拠を明示的に決定する。

## ADR-003で決めること

- manifestの配信元と署名・hashの信頼境界
- 一ファイルの分割単位と初回必須データ量
- staging版を保持するか失敗時に削除するか
- 起動時更新のtimeoutと、前回正常版へfallbackを提示する条件
- Service Worker cacheとIndexedDBの責務分担
- 過去版を端末と配信元へ何版保持するか
