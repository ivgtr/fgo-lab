---
title: "FGO Lab 実装計画書"
document_version: "0.11.0"
status: "Ready for Implementation"
created_at: "2026-08-23"
updated_at: "2026-08-24"
source_requirements: "docs/fgo-lab-requirements-v0.3.md v0.3.4"
ui_baseline: "docs/ui-design-spec.md v1.3.8"
ui_baseline_status: "Approved"
---

# FGO Lab 実装計画書

## 1. この計画書の役割

本書は、確定したプロダクト構造を、実装順、成果物、依存関係、完了条件へ変換した実行計画である。

機能範囲とデータ境界は `docs/fgo-lab-requirements-v0.3.md`、承認済みの画面構造と操作モデルは `docs/ui-design-spec.md` を正とする。両者が衝突する場合は片方だけを上書きせず、要件書とUI仕様を同時に更新する。旧要件書v0.2.2は検討履歴であり、実装判断には使用しない。

参照デモは完成見本ではなく、情報階層、操作順、レスポンシブ、状態遷移を確認する資料である。

- `docs/home-ui-comparison.html`
- `docs/my-chaldea-ui-comparison.html`
- `docs/craft-essence-ui.html`
- `docs/support-template-ui-comparison.html`
- `docs/ui-comparison.html`
- `docs/growth-plan-ui.html`
- `docs/chaldea-data-update-review.md`
- `docs/damage-calculation-review.md`

## 2. 実装開始時点で確定していること

### 2.1 プロダクト構造

- 初回は通常画面を表示せず、ローカルDB作成、マスターデータ取得、検索データ構築、基本画像取得、整合性検証を行う。
- 初回セットアップ完了後は、B案のモジュラーホームへ自動遷移する。
- ホームは前回の計算を一件だけのPrimaryとし、所持状況、育成計画、火力ランキング、簡単な説明を優先度の異なるモジュールで配置する。
- PCは文字付き左ナビ、SPは下部ナビを基準とする。
- SVGイラストやSVGアイコンへ依存せず、文字、罫線、CSSの単純形状、DBのラスター画像で構成する。

### 2.2 管理機能

- 所持・育成管理は全サーヴァントをNP0・未所持で開始し、NP1以上への変更を所持登録とする。
- PCは横長一覧と右詳細、SPは一覧と詳細サブページとする。一覧は検索、絞り込み、選択だけを担当する。
- 現在値と育成目標を分け、Lv90／100／120、スキル10等のショートカット、自動保存、Undoを提供する。
- 概念礼装は全件所有率方式ではなく、使用する物理コピーを一枚ずつ登録する。同一礼装もコピーID単位で個別管理する。
- 支援条件は所持・育成管理と同じ一覧＋詳細を主画面にし、右詳細内へB案の支援元スタックを採用する。DB由来の支援役とスキルを保存し、呼び出しはダメージ計算と共通の検索モーダルを使う。

### 2.3 計算・比較・育成

- ダメージ計算の主目的は撃破判定ではなく、条件ごとのダメージ目安を知ることである。
- 宝具結果はNP1〜5を縦に並べ、各行に平均、最低、最大を表示する。現在のNPレベルだけを強調する。
- 敵HP、撃破率、不足、余剰、前NPレベルとの差は主結果へ表示しない。
- 攻撃対象のクラス、属性、特性から特攻の適用可否を判定し、適用／不適用の根拠を表示する。
- 比較は複数シナリオ表ではなく火力ランキングへ一本化する。全サーヴァントと所持サーヴァントを切り替える。
- 育成計画は明示的に計画中としたサーヴァントだけを対象にし、現在値と目標値の差を素材別台帳へ合計する。
- 所持素材との差し引きは行わず、必要総数を表示する。

### 2.4 実装時に調整するもの

次は機能判断を変えない範囲で、本実装と実データを使って調整する。

- 色、罫線、余白、タイポグラフィ
- ホームモジュールの正確な列幅、高さ、説明文、表示件数
- DB画像の最終表示サイズと画像失敗時のfallback
- 支援条件名を入力するタイミング
- 同一支援役を複数追加した場合の補助表記
- PC／SPの細かなブレークポイント

### 2.5 旧要件書v0.2.2からの主要変更履歴

次は新要件書v0.3.0へ反映済みである。実装時の上書き規則ではなく、判断履歴として残す。

| 初期要件 | 承認済み変更 |
|---|---|
| 敵HPに対する撃破可能性を主結果にする | 敵HPと撃破判定を主画面から除き、ダメージ目安を表示する |
| 条件違いを複数列で比較する | 比較を火力ランキングへ一本化する |
| 前NPレベルとの差を表示する | NP1〜5の平均、最低、最大だけを縦に比較する |
| 育成計画をPhase 2とする | 素材別台帳をR1ローカルコアへ含める |
| 通常攻撃・クリティカル専用UIを初期公開へ含める | R1は承認済みの宝具UIを先に完成し、共通計算プリミティブを再利用して後続判断する |
| 任意クラウド同期とアカウントを設ける | ユーザーデータは端末内だけに保存し、移行・バックアップはJSON import/exportで行う |
| 共有IDと共有APIを設ける | 計算条件をURLフラグメントへ格納し、サーバー保存なしで共有する |
| ホームの具体構造が未定 | 優先度付きモジュラーホームを採用する |

## 3. リリース単位

本計画ではクラウドアカウント、端末間同期、ユーザーデータ保存APIを設けない。初期公開と将来拡張の二段階に分ける。

### R1：ローカルコア

アカウント作成なしで、初回セットアップから主要機能を一通り利用できる状態。

- 初回セットアップ、ホーム、全体ナビゲーション
- 所持・育成管理
- 概念礼装管理
- 支援条件管理
- 宝具ダメージ計算、特攻判定、NP1〜5結果
- 火力ランキング
- 育成計画
- IndexedDB自動保存、Undo、版付き`UserDataBackup`のimport/export
- オフライン再利用
- 一件のドラフトと、重複排除されたプロフィール別直近20件の計算履歴
- 結果カードの画像保存と保存方法のヘルプ
- 許可リスト化した計算条件のURLフラグメント共有
- 複数プロフィールを保持できる保存schema。ただしR1のUIは一つの有効プロフィールだけを扱う
- JPマスターデータと日本語UI。UI文言は翻訳可能なキーで実装する

### R2：将来拡張

利用状況と正確性基盤を確認してから個別に着手する。

- NP回収、3Wave、クエスト検索、逆算
- 通常攻撃、クリティカル、チェイン、コマンドコードの高度UI
- 即死、スリップ、ブレイク、ガッツ等の特殊計算
- Chaldea／CSV取込、OCR
- 素材所持数と不足計算、周回候補
- 種火種類、クラス一致、成功ボーナス、キャンペーン倍率を比較する育成計算機
- 多地域展開
- 日本語以外のUI言語

R1の計算コアでは宝具計算に実際に必要な汎用演算だけを作る。通常攻撃、クリティカル、NP回収等の機能を、将来利用を理由に先行実装しない。

## 4. 実装原則

1. 版付きの契約から作る。保存、import/export、共有URL、結果の全境界へ`schemaVersion`、`masterDataVersion`、`engineVersion`を含める。
2. 計算コアは純粋関数とし、React、IndexedDB、HTTP、上流データ形式へ依存させない。
3. 最初に小さな縦断スライスを通す。1騎、1礼装、1宝具、1敵で選択、計算、保存、再読込まで成立させる。
4. 不明な値を0として扱わない。欠損、未対応、地域不一致は`approximate`または`unsupported`として返す。
5. 自動保存はコマンド単位でUndo可能にする。破壊的な移行や暗黙上書きを行わない。
6. 画像がなくても操作可能にする。画像URLや外部配信元をドメイン契約へ含めない。
7. 基本モードを先に完成させ、詳細補正や特殊handlerを後から追加する。
8. 画面を横に作り広げず、一つの利用フローをデータ、計算、保存、テストまで縦に完成させる。

## 5. 目標アーキテクチャ

```text
apps/web
  UI / PWA / application services / import-export and URL-share adapters
apps/data-pipeline
  raw import / normalize / validate / diff / publish
packages/schema
  versioned persistence and portable schemas
packages/calc-core
  deterministic calculation / breakdown / warning / trace
packages/master-data
  normalized models / snapshot reader / release resolver
packages/profile-domain
  profile collection / servant builds / CE copies / growth targets / migration
packages/workspace-domain
  support templates / calculation draft and history / ranking queries / undo
packages/ui
  accessible primitives / i18n keys / tokens / responsive components
packages/test-fixtures
  legal minimal fixtures / golden cases / builders
```

依存方向を次に固定する。

```text
schema <- calc-core <- application <- web UI
schema <- master-data <- application
schema <- profile-domain <- application
schema <- workspace-domain <- application
data-pipeline -> immutable master artifacts -> master-data
web UI -> repository interfaces -> IndexedDB
web UI -> import-export / URL-share interfaces -> local file / URL fragment
```

## 6. 中心となるデータ契約

### 6.1 版

| 版 | 対象 | 互換性責務 |
|---|---|---|
| `schemaVersion` | IndexedDB、import/export JSON、共有URL | migrateまたは明示的に拒否する |
| `masterDataVersion` | ゲームデータ | immutableに公開し、前版へ戻せる |
| `engineVersion` | 数式、丸め、特殊handler | 結果と保存計算へ記録する |
| `appVersion` | UI、application layer | ローカル診断、変更履歴、問い合わせへ使う |

### 6.2 主要エンティティ

- `MasterManifest`
- `MasterDataSnapshot`
- `ProfileCollection`
- `LocalProfile`
- `ServantBuildCurrent`
- `ServantBuildTarget`
- `CraftEssenceCopy`
- `SupportTemplate`
- `CalculationDraft`
- `CalculationHistoryEntry`
- `RankingQuery`
- `GrowthPlanSelection`
- `CalcInput`
- `CalcResult`
- `UserDataBackup`
- `CalculationShareSnapshot`

編集中の入力はプロフィールごとに一件の`CalculationDraft`へ上書きする。同じ`calculationSessionId`内の編集は履歴を増やさず、離脱、新しい計算、共有のいずれかで一件だけ`CalculationHistoryEntry`へ確定する。確定履歴は解決済み入力と結果を保持し、後の育成更新で書き換えない。直前履歴と`inputFingerprint`が同じ場合は新規追加せず、最終利用時刻だけを更新する。

共有URLは許可リストから作った匿名スナップショットをURLフラグメントへ符号化し、プロフィールID、所持一覧、メモを含めない。共有データをサーバーへ保存しない。

## 7. 実装マイルストーン

各マイルストーンは、前段の成果物を利用する動くソフトウェア、テスト、移行またはfallbackを完了条件に含める。工数は上流データの実容量と計算根拠を確認した後にIssue単位で見積もる。

### M0：着手ADRとライセンス境界

成果物:

- ADR-001 ワークスペースとWeb構成
- ADR-002 ローカル保存とmigration
- ADR-003 マスターデータ配信
- ADR-004 計算精度と根拠
- ADR-005 非営利公開のデータ・画像取得範囲と画像停止手順
- ADR-006 import/exportとURL共有のデータ境界
- ADR-007 静的配信、GitHub Pagesのbase path、route fallback
- ソフトウェアライセンス台帳、データ出典台帳、データフロー図、最小fixture

完了条件:

- Atlas Academy由来の構造化データと画像を取得でき、失敗時は名称とfixtureで診断できる。
- 宝具計算の代表ケースについて一次根拠、独立計算、レビュー担当を記録できる。
- AppMedia、Chaldea、Atlasの役割と、コードを複製しない比較手順が明文化されている。
- AGPL等の明確なソフトウェアライセンス違反を防ぐ境界と、画像単独停止、収益化時の再審査条件が明文化されている。

### M1：歩く骨格

成果物:

- workspace、CI、lint、型検査、単体テスト、build
- 最小schemaとrepository interface
- 1騎、1礼装、1宝具、1敵のfixture
- Web選択→計算→IndexedDB保存→再読込
- UIトークン、フォーム、ダイアログ、トースト、フォーカス管理

完了条件:

- ブラウザ再起動とオフラインで同じ結果を再現できる。
- 結果へ三つの版、地域、警告が記録される。
- 320px、キーボード、主要ブラウザのスモークテストがCIで動く。

### M2：マスターデータと初回セットアップ

成果物:

- Raw取込、正規化、検証、差分、publish、rollback
- `minimalAppVersion`、ファイルごとのサイズとSHA-256を含む版付きmanifest
- 既存ファイルとの差分取得、同時取得数制限、staging領域での組立
- 全体検証後のactive manifestポインタ切替
- Servant、Stat、Skill、NP、Passive、CE、Function、Trait、Relation、Constantの正規化モデル
- チェックサム付きmanifest
- IndexedDBのマスターデータ領域と検索索引
- 初回セットアップUI
- 基本画像の遅延キャッシュと画像なしfallback
- UI locale、ゲーム地域、マスターデータ言語の分離。R1配信値は`ja`／`JP`

完了条件:

- `Raw -> Normalize -> Validate -> Manifest`を再現可能なコマンドで実行できる。
- 参照整合性エラーが0件で、未知関数が一覧化される。
- 初回セットアップ完了後だけホームへ遷移する。
- 更新失敗時に互換性のある前回正常版へ戻れる。fixtureは診断・開発用とし、本番active版へ昇格しない。
- 通常起動でもmanifestを確認し、新版がある場合は取得、検証、索引構築、active版切替が完了するまでホームを表示しない。
- 更新がない場合は既存active版から直ちに起動できる。
- オフラインまたは更新失敗時は、互換性のある前回正常版がある場合だけ版と最終更新時刻を明示して続行できる。
- staging版の検証失敗時にactive版が変化しない。

### M3：計算コア v1

実装順:

1. 32-bit相当演算、floor、clamp、固定小数表現
2. レベルATK、フォウ、礼装ATK、クラス補正
3. クラス・属性相性、カード、攻防、宝具、特攻、特殊、固定値
4. 対象、特性、地域、強化状態、タイミング、重複規則
5. 宝具前後効果、OC、NP1〜5
6. 離散乱数分布、最低、平均、最大
7. Breakdown、Assumption、Warning、Trace
8. データで表現できない特殊処理のhandler registry

乱数は900〜1099の200通りを最終floorまで評価し、平均はその算術平均とする。詳細な式、比較対象、効果順、特殊Function、検証行列は`docs/damage-calculation-review.md`を正とする。

計算コアは敵HP、撃破確率、NP回収、Wave遷移をR1契約へ含めない。必要性が確認され要件書を改訂するまで、将来用モジュールも先行実装しない。

完了条件:

- 出典付きゴールデンケースが完全一致する。
- JPの全攻撃宝具がFunction種別へ分類され、未知Functionが0件である。
- R1対応対象では未対応handlerが0件である。
- 標準ケースのAppMedia差分と特殊ケースのChaldea差分を、丸め、仮定、データ版のいずれかで説明できる。
- 同一入力の結果が決定的である。
- 未対応handlerを含む結果が`exact`にならない。
- 単一計算の性能予算をCIで継続計測できる。

### M4：アプリシェル、ホーム、ローカルプロフィール

成果物:

- モジュラーホーム、PC左ナビ、SP下部ナビ
- 履歴あり／なしのPrimary切替
- DB更新、自動保存、オフライン状態
- ローカルプロフィール作成
- 複数`LocalProfile`を保持できる`ProfileCollection`と`activeProfileId`
- データ管理ページ
- 一件の`CalculationDraft`と、プロフィール別直近20件の`CalculationHistoryEntry`
- command log、自動保存、Undo、版付きJSONのexport
- import前の検証、内容プレビュー、自動バックアップ、失敗時rollback
- migration前バックアップと書込失敗時の回復導線

完了条件:

- 履歴なしではダメージ計算開始と所持登録の順序が分かる。
- 履歴ありでは3操作以内に前回条件を開ける。
- Optional説明モジュールを追加してもPrimaryが一件に保たれる。
- 画像なし、320px、キーボードだけで主要ナビゲーションを利用できる。
- `UserDataBackup`のexport→初期化→importで同じローカル状態へ戻る。
- import検証または切替に失敗しても元データが失われない。
- 一つの計算セッションで複数項目を編集しても履歴が一件だけ増える。
- 同じ入力を連続確定した場合は履歴を重複追加しない。

### M5：所持・育成管理と概念礼装

成果物:

- 全サーヴァント横長一覧、検索、分類フィルター、仮想化
- NP0未所持、NP1〜5所持の状態遷移
- PC右詳細、SP詳細サブページ
- 現在値／育成目標、ショートカット、自動保存、Undo
- スキルとアペンドの可変長保存
- 概念礼装の物理コピー登録、同一礼装の独立管理、ATK導出

完了条件:

- 初回0件、所持のみ0件、NP1への所持登録をE2Eで確認できる。
- ショートカットを一操作としてUndoできる。
- 同一礼装の片方だけを編集または登録解除できる。
- UI仕様§17の受入条件を満たす。

### M6：支援条件と宝具ダメージ計算

成果物:

- 所持・育成管理を踏襲した一覧＋詳細と、詳細内の支援元スタック
- 支援条件の検索モーダル、作成、編集、呼び出し
- DB由来の自身スキル、支援スキル、魔術礼装効果
- 保存済み、変更、追加、削除予定の差分表示
- クイック操作／直接入力の同一計算状態
- 攻撃対象のクラス、属性、特性、耐性
- 特攻の適用／不適用根拠
- NP1〜5の平均、最低、最大結果表
- 結果の内訳、仮定、警告、データ版
- 結果カードの共有可能なレイアウト
- 結果カードのローカル画像保存と、端末別の保存ヘルプ
- 計算条件を許可リスト化しURLフラグメントへ符号化・復元する共有機能

完了条件:

- 保存済み支援条件を展開し、全付与元と全効果を確認できる。
- ダメージ計算での変更がテンプレート本体へ暗黙保存されない。
- 敵HP、撃破率、前NPレベルとの差を表示しない。
- 共有URLを開くと、サーバー上の共有データなしで同じ条件を復元できる。
- URL長の上限を超える場合は共有を失敗させず、画像保存または`CalculationShareSnapshot`専用JSONを案内する。`UserDataBackup`は案内しない。
- 対応するデータ版またはエンジン版がない場合は共有時結果を履歴値として表示し、現行版で暗黙に再計算しない。
- UI仕様§4〜11と§16のダメージ計算受入条件を満たす。

### M7：火力ランキング

成果物:

- 全サーヴァント／所持サーヴァント切替
- クラス、宝具範囲、宝具カード、レアリティの分類フィルター
- 共通の攻撃対象、礼装、支援条件
- 各候補の自バフと特攻条件の個別解決
- Web Worker実行、fingerprintキャッシュ、途中結果
- 行ごとの内訳と自動適用根拠

完了条件:

- 同じ共通条件で候補を比較できる。
- フィルターだけの変更では不要な再計算をしない。
- 計算中も入力と表スクロールを阻害しない。
- UI仕様§12と§16のランキング受入条件を満たす。

### M8：育成計画

成果物:

- 現在値と目標値の差分計算
- 明示的な計画対象フラグ
- 再臨、スキル、アペンド、レベル、QP、種火、聖杯、コイン、通常素材の集計
- 素材別台帳と使用先内訳
- 素材検索、カテゴリ、ゲーム内順／必要数順／素材名順
- 星5種火・クラス一致・成功ボーナスなしの固定条件と常時表示
- PC 70:30、SP一覧／内訳遷移
- 所持・育成管理の対象サーヴァント・育成目標タブへの直接遷移

完了条件:

- 全計画対象の必要素材を省略せず表示できる。
- 素材合計と使用先内訳が一致する。
- 計画から外しても現在値と目標値を失わない。
- UI仕様§18の受入条件を満たす。

### M9：R1統合とローカル公開ゲート

成果物:

- 初回セットアップから各主要機能までのE2E
- 通常起動の更新待機、更新なし、オフラインfallback、非互換停止のE2E
- PWA、オフライン、更新、migration、版付き`UserDataBackup`のexport/import
- 画像保存、保存ヘルプ、URLフラグメント共有
- A11y、性能、セキュリティ、画像fallback
- 既知問題、データ版、エンジン版、非公式表記
- 内部配布または限定公開

公開ゲート:

- ゴールデンケース100%、参照整合性エラー0件
- 重大なアクセシビリティ違反0件
- 保存消失、誤計算、データ更新失敗の停止・復旧手順がある
- 320px、主要ブラウザ、低性能端末、オフラインの必須フローが通る
- 所持一覧や自由記述をログへ送らない
- importの不正形式、未知版、途中失敗から元データへ戻せる
- 共有URLへプロフィールID、所持一覧、メモが混入しない

### M10：R2拡張

R2は一括実装しない。NP回収、3Wave、通常／クリティカル専用UI、特殊計算、Chaldea／CSV取込、OCR、素材不足、育成計算機、多地域、追加UI言語を個別ADR、個別マイルストーン、個別受入条件へ分割する。クラウドアカウント、端末間同期、ユーザーデータ保存API、ユーザー投稿型公開ライブラリは将来拡張にも含めず、必要性が新たに確認された場合だけ要件書を改訂する。

## 8. 依存関係と並行化

```text
M0 ADR・ライセンス
  ├─ M1 歩く骨格
  └─ M2 データ・初回セットアップ
       └─ M3 計算コア

M1 + M2 ─> M4 シェル・ホーム・プロフィール
M2 + M4 ─> M5 所持・育成・礼装
M3 + M5 ─> M6 支援・ダメージ計算
M6 ─> M7 火力ランキング
M2 + M5 ─> M8 育成計画
M4〜M8 ─> M9 R1公開ゲート
M9以降 ─> M10 個別拡張
```

M2のデータパイプラインとM1のアプリ骨格は並行できる。M7ランキングとM8育成計画も、M5完了後は別作業として並行できる。計算根拠の確定と上流データの容量・変換仕様は、R1完成のクリティカルパスである。データ・画像の包括的な権利確認は個人開発・非営利公開のR1を停止させない。画像への指摘は画像単独停止で対応し、収益化または再パッケージ配布へ変更する時点で再審査する。

## 9. 最初の縦断スライス

最初の実装は静的デモの移植ではなく、次を一つの流れで成立させる。

1. 合法なfixtureを版付きmanifestから読み込む。
2. 初回セットアップを完了してローカルプロフィールを作る。
3. 1騎をNP1・Lv90として所持登録する。
4. 1枚の概念礼装を登録する。
5. 攻撃役と礼装を選び、1宝具のNP1〜5を計算する。
6. 平均、最低、最大と簡単な内訳を表示する。
7. 条件をIndexedDBへ保存する。
8. ブラウザ再起動後、ホームから前回条件を開いて同じ結果を再現する。
9. オフラインでも同じ流れを実行する。

この縦断スライス完了後に、支援、特攻、全データ、ランキング、育成計画を順次広げる。

## 10. テスト戦略

| レイヤー | 内容 | 実行タイミング |
|---|---|---|
| Schema | profile collection、draft/history、parse、round-trip、migration、未知版拒否 | 全PR |
| Calc unit | 補正、丸め、対象、特性、上限 | 全PR |
| Golden | 出典付き期待値の完全一致 | calc/data変更PR、公開前 |
| Property | 単調性、境界、乱数範囲、決定性 | 全PRまたはnightly |
| Differential | engine/data新旧版の全対象比較、AppMedia標準ケース、Chaldea特殊ケースとの差分分類 | calc/data変更PR |
| Data | 参照、ID、値域、公開日、未知関数 | データ取込ごと |
| Repository | IndexedDB migration、rollback、容量失敗 | 保存変更PR |
| Contract | import/export JSON、共有URLの版と個人情報除外 | 境界変更PR |
| Integration | profile→calc→save→reload | 全PR |
| E2E | 初回、登録、計算、履歴重複排除、ランキング、育成、オフライン、backup round-trip、URL共有 | main、公開前 |
| A11y | axe、キーボード、読み上げ、reduced motion | UI変更PR、公開前 |
| Performance | bundle、LCP/INP、計算、検索、Worker | main、公開前 |
| Security | import、XSS、URL復元、共有内容 | 入力・共有変更PR、公開前 |

ゴールデン値は上流実装の出力だけを正解にしない。一次根拠または実測、独立計算、レビュー担当、変更理由を記録する。

## 11. CI/CDとデータ公開

### 11.1 アプリCI

1. 依存関係、ライセンス、secret scan
2. format、lint、型検査、package boundary
3. unit、property、integration、contract
4. build、bundle budget、計算benchmark
5. Playwright smoke、axe
6. preview deployment

R1のproduction buildはGitHub Pagesのrepository subpathで動作させる。asset base path、直接URLのfallback、URLフラグメント復元をpreviewとE2Eで検証する。

IndexedDB migrationは事前バックアップ、transaction内変換、検証、切替の順で行い、失敗時は旧データを維持する。

### 11.2 データ公開

1. Raw取込とチェックサム記録
2. 正規化とschema検証
3. 参照整合性、未知関数検出
4. 前版との差分と計算影響レポート
5. golden、differential test
6. version directoryへimmutable publish
7. manifestを最後に切替
8. Canary確認後に一般化

構造化データと画像のmanifestを分ける。画像だけを停止しても名称・数値fallbackでアプリを継続できるfeature/config switchと運用手順を用意する。

問題時はmanifestを前版へ戻し、影響するデータ版とエンジン版を既知問題として表示する。

## 12. 横断品質ゲート

### 12.1 アクセシビリティ

- 44pxを基準とする操作領域、明瞭なフォーカス、ラベル、エラー関連付け
- 色以外でも選択、B/A/Q、状態を識別可能
- 仮想リストの件数、キーボード移動、フォーカス復元
- グラフを追加する場合は同じデータの表と要約を提供

### 12.2 性能

- 起動時に全データを読み込まず、地域、カテゴリ、検索索引を分割
- サーヴァント一覧の仮想化と画像遅延読込
- 火力ランキングはWorkerへ分離
- JS bundle、LCP、INP、単一計算、ランキングの予算をCIで計測

### 12.3 セキュリティ・プライバシー

- 共有スナップショット、バックアップ、匿名化診断exportの許可項目を別々に定義
- 自由記述をHTMLとして保存・描画しない
- JSON／CSVのschema、サイズ、行数を検証
- 所持一覧、プロフィール名、メモを共有物や匿名化診断exportへ含めない
- 引き継ぎ番号、パスワード、セッショントークンの入力欄を作らない

### 12.4 ローカル診断

- app、engine、master dataの版とerror codeを端末内の診断表示で関連付ける
- exact／approximate／unsupportedの状態と警告を端末内で確認できる
- データ取得、manifest、IndexedDB書込、migration、import/export失敗を端末内で記録する
- 外部送信は行わず、問い合わせ時だけユーザー操作で匿名化した診断情報をexportする

## 13. 要件・UIトレーサビリティ

| 領域 | マイルストーン | 主な検証 |
|---|---|---|
| 初回セットアップ・ホーム | M2、M4、M9 | setup、履歴あり／なし、PC／SP E2E |
| 所持・育成管理 | M2、M5 | repository、migration、管理E2E |
| 概念礼装 | M2、M5 | ATK導出、コピー単位保存E2E |
| 支援条件 | M2、M6 | DB効果解決、差分、共通モーダルE2E |
| ダメージ計算 | M3、M6 | golden、特攻、NP結果E2E |
| 火力ランキング | M3、M7 | 全体／所持、filter、Worker E2E |
| 育成計画 | M2、M5、M8 | 差分、素材合計、使用先遷移E2E |
| ローカル保存 | M1、M4、M9 | migration、Undo、offline E2E |
| データ可搬性・共有 | M4、M6、M9 | import rollback、画像保存、URL round-trip E2E |
| 計算ドラフト・履歴 | M4、M6、M9 | session境界、fingerprint重複排除、復元E2E |
| 言語・地域境界 | M1、M2、M9 | 翻訳キー、JP／ja fixture、locale非依存schema |
| データ運用 | M0、M2、M9 | pipeline CI、rollback drill |

各Issueは、対象領域、受入条件、schema／engine／data版、必要なテストを記載する。

## 14. 実装開始Issue

最初に作るIssueは次の順とする。

1. ADR-001〜006とライセンス台帳
2. workspace、CI、package boundary
3. schema version規約とmigration API
4. 最小fixtureと`MasterManifest`
5. IndexedDB master repositoryと複数対応`ProfileCollection`
6. 32-bit演算と丸めプリミティブ
7. 1騎・1宝具・1敵の`calculate()`とgolden test
8. 初回セットアップの状態機械
9. 1騎の所持登録と1枚の礼装登録
10. NP1〜5結果表
11. `CalculationDraft`、session単位履歴確定、ホームの前回計算Primary
12. 再起動・オフライン再現E2E
13. `UserDataBackup`のexport→初期化→import round-trip
14. `CalculationShareSnapshot`のURL／専用JSON round-tripと画像保存

Issue 1〜12で§9の縦断スライスを完成させる。Issue 13〜14でR1のデータ可搬性と共有境界を固定してから、M5〜M8を縦断機能単位に分解する。

## 15. 未決ADR

未決事項は実装全体を停止させない。既定方針でfixtureによる縦断スライスを進め、記載した期限までに確定する。

D-01とD-02は、R1を個人開発・非営利公開とする前提で解決済みである。Atlas Academy由来の構造化データと画像を採用し、版付き静的ミラーとして配信して端末内へキャッシュする。出典、取得日時、変換内容、ODC-BY表記を保持し、計算時の直接API依存は行わない。画像は構造化データと分離し、指摘時に画像だけを停止できるようにする。収益化へ用途を変更する場合は再審査する。

| ID | 未決事項 | 期限 | 既定方針 |
|---|---|---|---|
| D-03 | Webフレームワークの確定 | M0終了 | GitHub Pagesで静的export可能な構成。SSRを導入しない |
| D-04 | import時の統合／置換と競合確認 | M4終了 | プレビュー後の全置換、事前バックアップ必須 |
| D-05 | 共有URLの圧縮方式と安全な最大長 | M6終了 | URLフラグメント、上限超過時は画像または共有専用JSONへ誘導 |
| D-06 | 過去マスター版の保持期間 | M2終了 | 現行と直前正常版を最低保持 |
| D-07 | FGO計算式の詳細ADR化 | M0終了 | `damage-calculation-review.md`を基準に、Atlas一次根拠＋独立golden＋AppMedia/Chaldea差分検証 |
| D-08 | 画像保存、CORS、Web Share非対応端末のfallback | M6終了 | 同一オリジンまたはBlob化画像でPNGを生成し、端末別保存ヘルプを提供 |

## 16. 主要リスク

| リスク | 早期検知 | 対応 |
|---|---|---|
| 数式・丸めの誤り | golden、property、differential | calc-core隔離、出典付きケース、段階公開 |
| 特殊宝具の増殖 | unknown handler report | handler ID、警告、専用テストを必須化 |
| 非営利公開から収益化・再配布への無自覚な拡張 | 配信設定・README・リリースレビュー | 収益化と再パッケージ配布を変更管理対象にし、実施前に権利条件を再審査 |
| データ更新で結果が変化 | engine/data差分 | immutable版、変更履歴、rollback |
| 起動時更新が長時間終わらない | timeout・低速回線E2E | 進捗、再試行、互換性のある前回版へのfallbackを提供 |
| 一回の編集で履歴が増殖 | session/fingerprint E2E、履歴件数監視 | draftと確定履歴を分離し、同一session・同一fingerprintを重複追加しない |
| IndexedDB移行で消失 | migration fixture、failure injection | 事前backup、transaction、JSON export |
| バックアップJSONを共有用と誤認 | contract test、共有導線レビュー | `UserDataBackup`と`CalculationShareSnapshot`を別schema・別UIにする |
| 高機能化で主操作が埋没 | ホーム到達時間、完了率 | Primary一件、基本／詳細分離、R2分割 |
| ランキングでUI停止 | benchmark、Long Task | Worker、fingerprint cache、段階表示 |
| 共有への個人情報混入 | allowlist contract、fuzz | snapshot builderを唯一の共有経路にする |
| DB画像で共有画像を生成できない | canvas export E2E、画像失敗試験 | CORS確認、ローカルBlob化、名称fallback |

## 17. 実装開始判定

次を満たしているため、M0とfixtureベースのM1へ着手できる。

- 主要画面の機能構造が承認済みである。
- R1とR2の境界が定義されている。
- 最初の縦断スライスとIssue順が定義されている。
- 未決ADRに期限と安全な既定方針がある。
- データ・画像が未確定でも開発できるfallbackがある。

実データ公開と、正確性を`exact`として表示することは、対応するADR承認まで行わない。ユーザーデータを受信・保存するエンドポイントは作成しない。
