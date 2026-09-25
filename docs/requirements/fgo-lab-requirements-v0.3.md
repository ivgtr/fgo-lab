---
title: "FGO Lab プロダクト要件定義書"
document_version: "0.3.9"
status: "Active"
approval: "approved"
approved_at: "2026-09-26"
created_at: "2026-08-24"
updated_at: "2026-09-26"
supersedes: "FGO Lab requirements v0.2.2 (docs/archive/README.md recovery index)"
ui_baseline: "docs/requirements/ui-design-spec.md v1.4.1 approved"
---

# FGO Lab プロダクト要件定義書

## 0. 文書の位置づけ

本書は、要件書v0.2.2を起点に行ったUI・機能の壁打ち結果を統合した、実装範囲の正本である。v0.2.2は検討履歴として残すが、実装判断には使用しない。

文書の責務を次のように分ける。

- 本書: プロダクト目的、機能範囲、データ境界、非機能要件、受入条件
- `docs/requirements/ui-design-spec.md`: 承認済みの情報構造、操作モデル、レスポンシブ、画面受入条件
- `docs/tasks/development-redesign-tasks.md`: 唯一の実装順、依存関係、進捗、phase handoff
- `docs/requirements/damage-calculation-review.md`: 計算式調査、実装境界、検証基準、配信方針
- `docs/requirements/damage-effect-execution-requirements.md`: 条件、状態変化、補正を順序付きで実行する計算要件とUI不変条件

比較デモとoptions文書はローカルな検討履歴であり、実装要件または正本として使用しない。

本書と旧要件書が衝突する場合は本書を優先する。本書とUI仕様が衝突する場合、機能範囲とデータ境界は本書、画面構造と操作モデルはUI仕様を優先し、片方だけを変更せず両文書を更新する。

要件の優先度は次のとおりとする。

- R1: 初期公開に必要
- R2: R1公開後に、利用実績と正確性を確認して個別判断
- 対象外: 現在のプロダクト目的に含めない

## 1. プロダクト概要

FGO Labは、Fate/Grand Orderのサーヴァント、概念礼装、支援条件、育成状態を端末内で管理し、宝具ダメージの目安、サーヴァント間の火力順位、育成目標までの必要素材を確認する非公式Webツールである。

中心となる価値は次の三つである。

1. 所持状態を毎回入れ直さず、短い操作で宝具ダメージの目安を確認できる。
2. 共通条件で全サーヴァントまたは所持サーヴァントを比較し、未認識だった候補を発見できる。
3. 現在値と育成目標の差から、必要素材の総量と使用先を把握できる。

## 2. 解決する課題

- 既存のダメージ計算機は単発計算には使えるが、所持状態を保存できず再入力が多い。
- バフ入力が効果量の羅列になりやすく、どのサーヴァントのどのスキルを使ったか分かりにくい。
- セレクトボックスだけの入力は自由度が低く、細かなレベルや例外値の変更が面倒である。
- 宝具レベルごとの差を一画面で比較しにくく、育成判断へつながりにくい。
- 所持サーヴァント全体を同じ条件で比較する手段がなく、育成候補を発見しにくい。
- 複数サーヴァントの育成目標に必要な素材総数と使用先を横断して確認しにくい。

## 3. ゴールと非ゴール

### 3.1 R1のゴール

- 初回セットアップ後、アカウント作成なしで主要機能を利用できる。
- 所持・育成状態、概念礼装、支援条件、計算履歴を端末内へ自動保存できる。
- DB由来のサーヴァント、スキル、礼装、画像を使いながら、レベル等を細かく変更できる。
- 宝具NP1〜5の平均・最低・最大を同時に比較できる。
- 全サーヴァントと所持サーヴァントの火力ランキングを切り替えられる。
- 育成目標までの必要素材を、素材別台帳と使用先内訳で確認できる。
- 全ローカルデータをJSONでバックアップ・復元できる。
- 計算結果を画像またはURLで、個人の所持情報を含めず共有できる。
- マスターデータ取得後は、主要機能をオフラインでも利用できる。
- UIは将来の複数言語追加を妨げない構造とし、R1では日本語だけを提供する。

### 3.2 対象外

- 敵HPに対する撃破判定、撃破率、不足・余剰の表示
- 複数条件を横列で並べるシナリオ比較
- 前の宝具レベルとの差分・増加率の表示
- FGOアカウントの認証情報、引き継ぎ情報、通信内容の取得
- ユーザーアカウント、クラウド保存、端末間同期
- 共有ID、共有データ保存API、ユーザー投稿型の公開ライブラリ
- 完全な戦闘シミュレーター、自動周回、自動編成探索
- R1でのNP回収、3Wave、通常攻撃、クリティカル、即死等の専用UI
- R1での素材所持数との差し引き、周回場所の推薦

対象外機能は、必要性が新たに確認された場合に要件書を改訂してから着手する。実装しやすいという理由だけで計算コアへ先行追加しない。

## 4. 対象ユーザーと主要タスク

### 4.1 対象ユーザー

- 所持サーヴァントで出せる宝具ダメージの目安を短時間で知りたいユーザー
- 宝具レベル、礼装レベル、支援条件を変えて育成判断をしたいユーザー
- 全体または手持ちの火力順位から、新しい育成候補を探したいユーザー
- 複数の育成目標について、必要素材の総量を把握したいユーザー
- 計算結果を画像やURLで共有したいユーザー

### 4.2 主要タスク

1. サーヴァントと礼装を登録・更新する。
2. 支援サーヴァントと使用スキルを条件として保存する。
3. 攻撃役、礼装、支援、攻撃対象を選び、宝具ダメージを見る。
4. NP1〜5の結果から宝具育成の目安を得る。
5. 共通条件で火力ランキングを表示し、候補を絞り込む。
6. 育成目標を設定し、必要素材の合計と使用先を確認する。
7. 全データをバックアップ・復元する。
8. 計算結果を画像またはURLで共有する。

## 5. ページ構成

ページ名称は日本語を正とする。

| ページ | 主な役割 | R1 |
|---|---|---:|
| 初回セットアップ | ローカルDB作成、マスターデータ取得、索引構築、検証 | 必須 |
| ホーム | 前回計算と主要機能への入口 | 必須 |
| ダメージ計算 | 宝具条件入力、特攻確認、NP1〜5結果 | 必須 |
| 火力ランキング | 全体／所持の共通条件比較 | 必須 |
| 所持・育成管理 | サーヴァントの現在値と育成目標 | 必須 |
| 概念礼装 | 使用する礼装コピーの登録・編集 | 必須 |
| 支援条件 | 支援元と使用スキルの保存・編集 | 必須 |
| 育成計画 | 必要素材の素材別台帳と使用先内訳 | 必須 |
| データ管理 | バックアップ、復元、データ版確認、初期化 | 必須 |

PCは文字付き左ナビ、スマートフォンは下部ナビを基本とする。初回セットアップ中は通常ナビを表示しない。

## 6. 機能要件

### 6.1 初回セットアップ

| ID | 要件 |
|---|---|
| FR-SET-001 | 初回アクセス時は通常画面を表示せず、セットアップ専用画面を表示する |
| FR-SET-002 | ローカルDB作成、マスターデータ取得、検索索引構築、基本画像取得、整合性検証の進捗を表示する |
| FR-SET-003 | 完了した処理、実行中の処理、失敗した処理を色だけに依存せず識別できる |
| FR-SET-004 | 失敗時は再試行でき、互換性検証済みの前回正常版がある場合だけ続行できる。同梱fixtureは診断・開発用とし、本番active版へ昇格しない |
| FR-SET-005 | セットアップ完了後はホームへ自動遷移する |
| FR-SET-006 | 初回以外の起動でも、ホーム表示前にマスターデータの更新確認を行う |
| FR-SET-007 | 新版がある場合は、必須ファイル取得、検証、検索索引構築、active版切替が完了するまでホームを表示しない |
| FR-SET-008 | 起動時更新の完了条件に全画像の取得を含めず、画像はactive版切替後に遅延取得する |
| FR-SET-009 | オフラインまたは取得失敗時は、互換性検証済みの前回正常版がある場合だけ、その版と最終更新時刻を明示して続行できる |
| FR-SET-010 | 前回正常版が現アプリと非互換、破損、または必須最低版未満の場合はホームへ進めず、再試行・アプリ更新・復旧を案内する |

### 6.2 ホーム

| ID | 要件 |
|---|---|
| FR-HOME-001 | 前回の計算を唯一のPrimaryとして表示する |
| FR-HOME-002 | 履歴がない場合は、ダメージ計算開始と所持登録の順序を案内する |
| FR-HOME-003 | 所持状況、育成計画、火力ランキング、短い説明を優先度の異なるモジュールとして配置する |
| FR-HOME-004 | すべてのモジュールを均等に強調しない |
| FR-HOME-005 | 機能追加時もPrimaryは一件だけに保つ |

### 6.3 所持・育成管理

| ID | 要件 |
|---|---|
| FR-SVT-001 | 初期状態では全サーヴァントをNP0・未所持として一覧表示する |
| FR-SVT-002 | NP1以上への変更を所持登録、NP0への変更を未所持への変更として扱う |
| FR-SVT-003 | 全件／所持のみを切り替え、名称、クラス等で検索・絞り込みできる |
| FR-SVT-004 | PCは横長一覧と右詳細、スマートフォンは一覧と詳細サブページで構成する |
| FR-SVT-005 | 一覧は検索、絞り込み、選択を担当し、編集UIを置かない |
| FR-SVT-006 | 現在値と育成目標を別タブまたは別状態として編集できる |
| FR-SVT-007 | レベル、再臨、NP、スキル、アペンド、フォウ等をマスターデータに従って編集できる |
| FR-SVT-008 | Lv90／100／120、スキル10等のショートカットを提供する |
| FR-SVT-009 | 妥当な変更を都度自動保存し、一操作単位でUndoできる |
| FR-SVT-010 | 育成目標との差から必要素材を省略せず表示する |
| FR-SVT-011 | サーヴァント画像とスキル画像をDBから表示し、画像失敗時も名称で操作できる |

### 6.4 概念礼装

| ID | 要件 |
|---|---|
| FR-CE-001 | 全礼装の所有率方式ではなく、利用する礼装を登録する方式とする |
| FR-CE-002 | 同一礼装を含め、一枚ごとにコピーIDを持つ物理コピーとして管理する |
| FR-CE-003 | 礼装ごとにレベル、限界突破等を編集し、レベルからATKを導出する |
| FR-CE-004 | 同一礼装の複数コピーを隣接して表示し、個別に編集・登録解除できる |
| FR-CE-005 | ダメージ計算では登録済みコピーと全礼装DBの両方から選択できる |
| FR-CE-006 | 礼装画像をDBから表示し、画像失敗時も名称で操作できる |

### 6.5 支援条件

| ID | 要件 |
|---|---|
| FR-SUP-001 | 支援サーヴァントを支援元として追加し、その配下へ使用スキルを縦に配置する |
| FR-SUP-002 | 支援元は所持サーヴァントと全サーヴァントDBの両方から選択できる |
| FR-SUP-003 | スキル名、画像、効果、対象、条件、デメリット、レベルをDBから表示する |
| FR-SUP-004 | スキルは削除だけでなく使用中／未使用を切り替え、支援元の文脈を保持する |
| FR-SUP-005 | 支援条件を保存し、名前、構成要約、最終使用時刻から検索できる |
| FR-SUP-006 | 保存済み条件の呼び出しはセレクトボックスではなく検索モーダルを使う |
| FR-SUP-007 | 同じ呼び出しモーダルを支援条件管理とダメージ計算で共用する |
| FR-SUP-008 | ダメージ計算へ展開後の変更を、保存済み、変更、追加、削除予定として全件表示する |
| FR-SUP-009 | 計算画面での変更を保存元の支援条件へ暗黙反映しない |
| FR-SUP-010 | 支援元数、使用スキル数、効果種類別の概要と内訳を確認できる |

### 6.6 ダメージ計算

| ID | 要件 |
|---|---|
| FR-CALC-001 | クイック操作と直接入力を同じ計算状態の表示方法として切り替えられる |
| FR-CALC-002 | 攻撃役は所持サーヴァントと全サーヴァントDBの両方から選択できる |
| FR-CALC-003 | 礼装は登録済みコピーと全礼装DBの両方から選択できる |
| FR-CALC-004 | サーヴァントLv、礼装Lv、NP、OC、各スキルLvを変更できる |
| FR-CALC-005 | NPレベルは選択式とし、細かな数値は数値入力とショートカットを使い分ける |
| FR-CALC-006 | 自身スキルと自バフを攻撃役の近くへ配置し、短い操作で追加・変更できる |
| FR-CALC-007 | 攻撃対象のクラス、属性、耐性を設定できる。条件付き特性は専用エディタを設けず、適用内容の成立宣言として入力できる |
| FR-CALC-008 | 特攻の適用／不適用と、その判定根拠を表示する |
| FR-CALC-009 | NP1〜5を縦に並べ、各行へ平均、最低、最大を表示する |
| FR-CALC-010 | 現在入力中のNPレベル一行だけを、色以外の手段も使って強調する |
| FR-CALC-011 | 平均を主結果とし、最低・最大は省略せず視覚的に弱める |
| FR-CALC-012 | 敵HP、撃破率、不足・余剰、前NPレベルとの差を表示しない |
| FR-CALC-013 | 計算内訳、仮定、警告、データ版、エンジン版を確認できる |
| FR-CALC-014 | DBにない値や検証用途の値を直接入力でき、自動値と区別して表示する |
| FR-CALC-015 | 最低と最大は乱数900／1099、平均は900〜1099の最終floor済み200結果の算術平均として算出する |
| FR-CALC-016 | 未知Function、未対応handler、解決不能な条件を0として計算せず、結果精度と理由を表示する |

### 6.7 火力ランキング

| ID | 要件 |
|---|---|
| FR-RANK-001 | 初期状態は全サーヴァントを共通育成値で比較する |
| FR-RANK-002 | 全サーヴァントと所持サーヴァントを切り替えられる |
| FR-RANK-003 | クラス、宝具範囲、宝具カード、レアリティ等で絞り込める |
| FR-RANK-004 | 標準比較は自然上限、Fou+1000、skill Lv10、OC1、属性等倍、HP100%、礼装・支援なし等の単一fixed policyを全候補へ適用する |
| FR-RANK-005 | 各候補の自身スキル、自バフ、特攻条件を候補ごとに解決する |
| FR-RANK-006 | 順位、平均ダメージ、主要条件を一覧し、行から根拠と内訳を確認できる |
| FR-RANK-007 | 所持戦力は保存済みLv・NP Lv・Fou・skill Lvを使い、未所持へ標準値をfallbackしない |
| FR-RANK-008 | 計算をWorker等へ分離し、計算中も入力とスクロールを阻害しない |
| FR-RANK-009 | 複数条件を横に並べるシナリオ比較は設けない |
| FR-RANK-010 | 単発計算と同じ計算コア、効果解決、丸め規則を使用し、ランキング専用の簡易式を持たない |
| FR-RANK-011 | `unsupported`な候補を通常順位へ混在させず、対象外理由を確認できる |
| FR-RANK-012 | 標準比較と所持戦力を別modeとし、保存値のない候補へ標準値をfallbackしない |
| FR-RANK-013 | 変更可能な計算条件は比較mode、NP Lv、class等倍／有利、自己buff、特攻なし／成立、外部fieldなし／成立の6項目だけとし、廃止条件をhidden stateやlegacy URLとして残さない |
| FR-RANK-014 | 計算条件と表示filterを別stateとし、filter変更だけでは全候補を再計算しない |
| FR-RANK-015 | 閉じた行は順位・対象・主damage・主要属性だけを表示し、一度に一行だけcanonical evidenceの詳細を展開する |
| FR-RANK-016 | 採用したportable calculation requestを計算機へ引き継ぎ、再計算したdamage・effect・condition・procを一致させる |
| FR-RANK-017 | 条件、filter、sortを単一URL modelで共有可能にし、展開行等の一時UI stateとは分離する |
| FR-RANK-018 | 特攻成立はcanonical `powerMod`／`npSpecial`の成立可能scenarioを同一executorで有限探索し、一騎一行の最大damageと採用TargetContextを返す |

### 6.8 育成計画

| ID | 要件 |
|---|---|
| FR-PLAN-001 | 明示的に計画中としたサーヴァントだけを集計対象にする |
| FR-PLAN-002 | 現在値と育成目標の差から必要素材を計算する |
| FR-PLAN-003 | 再臨、スキル、アペンド、レベル、QP、種火、聖杯、コイン、通常素材を省略せず集計する |
| FR-PLAN-004 | 素材を縦に並べる素材別台帳を主表示とする |
| FR-PLAN-005 | 素材ごとに必要総数と、サーヴァント・用途別の使用先内訳を表示する |
| FR-PLAN-006 | 素材検索、カテゴリ、ゲーム内順／必要数順／素材名順を提供する |
| FR-PLAN-007 | サーヴァントを選択すると、所持・育成管理の対象サーヴァントの育成目標へ遷移する |
| FR-PLAN-008 | 計画から外しても現在値と育成目標を削除しない |
| FR-PLAN-009 | R1では所持素材との差し引きを行わず、必要総数だけを表示する |
| FR-PLAN-010 | R1のレベル育成は「星5種火・クラス一致・成功ボーナスなし」を既定かつ唯一の計算条件とする |
| FR-PLAN-011 | 採用した種火条件を、種火必要数とQPの近くへ常時表示する |

### 6.9 ローカル保存とデータ管理

| ID | 要件 |
|---|---|
| FR-DATA-001 | ユーザーデータはIndexedDBへ保存し、サーバーへ送信・保存しない |
| FR-DATA-002 | ユーザーアカウント、ログイン、クラウド同期を設けない |
| FR-DATA-003 | 妥当な編集を都度自動保存し、保存ボタンを主要フローへ置かない |
| FR-DATA-004 | 全ユーザーデータを`UserDataBackup`として版付きJSONへexportできる |
| FR-DATA-005 | import前にファイル形式、サイズ、schema版、参照整合性を検証する |
| FR-DATA-006 | import前に件数と変更内容をプレビューし、既存データのバックアップを作成する |
| FR-DATA-007 | R1のimportは全置換を既定とし、完了検証後に切り替え、失敗時は元データを維持する |
| FR-DATA-008 | 未知の新しいschema版は破壊的に読み込まず、更新案内または明示的な拒否を行う |
| FR-DATA-009 | 初期化は対象を明示し、確認後に実行する。マスターデータだけの再取得と全ユーザーデータ削除を分ける |
| FR-DATA-010 | Chaldea／CSV／OCRによる外部形式の取込はR2で個別判断する |
| FR-DATA-011 | 保存schemaは複数の`LocalProfile`を保持でき、すべてのプロフィール依存データへ`profileId`を持たせる |
| FR-DATA-012 | `ProfileCollection`へ`activeProfileId`を保持する。R1のUIは一つの有効プロフィールだけを扱い、切替UIは設けない |
| FR-DATA-013 | `UserDataBackup`は全プロフィールと有効プロフィールIDを欠落なく含める |

### 6.10 結果共有

バックアップと共有を混在させない。共有には全ユーザーデータを含む`UserDataBackup`を使用しない。

| ID | 要件 |
|---|---|
| FR-SHARE-001 | 共有単位を画面全体ではなく結果カードとする |
| FR-SHARE-002 | 結果カードを端末内でPNG等の画像へ変換・保存できる |
| FR-SHARE-003 | 直接保存またはWeb Shareが使えない端末では、端末に合った保存方法の短いヘルプを表示する |
| FR-SHARE-004 | 計算条件を`CalculationShareSnapshot`へ変換し、URLフラグメントへ符号化できる |
| FR-SHARE-005 | URLフラグメントは通常のHTTPリクエストへ含めず、共有データ保存APIを必要としない |
| FR-SHARE-006 | 安全なURL長を超える場合は、共有専用の計算条件JSONまたは画像保存を案内する |
| FR-SHARE-007 | 共有専用JSONとURLへプロフィールID、所持一覧、内部メモを含めない |
| FR-SHARE-008 | 共有スナップショットへ正規化済み計算入力、共有時の結果、schema版、データ版、エンジン版を含める |
| FR-SHARE-009 | 対応するデータ版とエンジン版が利用可能な場合は再計算し、共有時結果との一致を検証する |
| FR-SHARE-010 | 対応版を利用できない場合は共有時結果を履歴値として表示し、現行版で暗黙に置き換えない |
| FR-SHARE-011 | 現行版で再計算する場合は、版の違いと結果差を明示してユーザー操作で実行する |

### 6.11 計算ドラフトと履歴

入力の自動保存と計算履歴への追加を別処理にする。一つの入力変更から複数の履歴を作らない。

| ID | 要件 |
|---|---|
| FR-HIST-001 | 編集中の入力はプロフィールごとに一件の`CalculationDraft`へ上書き保存する |
| FR-HIST-002 | 計算画面を新規に開くと`calculationSessionId`を発行し、同一セッション内の変更では履歴件数を増やさない |
| FR-HIST-003 | 同一セッション内では最新の妥当な入力と結果だけをドラフトへ保持する |
| FR-HIST-004 | 画面離脱、新しい計算の開始、共有の実行のいずれかで、妥当な最新結果を一件の`CalculationHistoryEntry`として確定する |
| FR-HIST-005 | 確定後の履歴はimmutableとし、サーヴァント育成値や支援条件の更新で書き換えない |
| FR-HIST-006 | 正規化済み入力、データ版、エンジン版から`inputFingerprint`を作り、直前履歴と同一なら新規追加せず最終利用時刻だけ更新する |
| FR-HIST-007 | R1ではプロフィールごとに直近20件を保持し、古い順に自動削除する |
| FR-HIST-008 | 履歴を開く場合は履歴自体を編集せず、新しいドラフトへ入力をコピーする |
| FR-HIST-009 | ブラウザ終了等でセッションを確定できなくてもドラフトを復元でき、途中編集を複数履歴として復旧しない |
| FR-HIST-010 | 名前付け、ピン留め、履歴件数変更はR1に含めない |

## 7. データ境界と契約

### 7.1 データの四区分

| 区分 | 内容 | 保存・配信 |
|---|---|---|
| マスターデータ | サーヴァント、礼装、スキル、画像、素材、計算定数 | 静的配信から取得しIndexedDBへキャッシュ |
| ユーザーデータ | 所持、育成目標、礼装コピー、支援条件、保存計算 | IndexedDBのみ |
| `UserDataBackup` | 全ユーザーデータの移行・復旧用JSON | ユーザーがローカルファイルとして管理 |
| `CalculationShareSnapshot` | 一件の計算を表示・再現する許可リストデータ | URLフラグメントまたは共有専用JSON |

### 7.2 共通の版

- `schemaVersion`: IndexedDB、バックアップ、共有スナップショットの構造版
- `masterDataVersion`: 計算に使用したマスターデータ版
- `engineVersion`: 数式、丸め、特殊処理の版
- `appVersion`: UIとapplication layerの版

未知版は0や既定値で補完しない。移行できる場合だけ明示的に移行し、できない場合は内容を壊さず拒否する。

### 7.3 主なユーザーデータ

- `LocalProfile`
- `ProfileCollection`
- `ServantBuildCurrent`
- `ServantBuildTarget`
- `CraftEssenceCopy`
- `SupportTemplate`
- `CalculationDraft`
- `CalculationHistoryEntry`
- `RankingQuery`
- `GrowthPlanSelection`

アペンド、スキル、装備枠等を固定長とせず、マスターデータに従う。

### 7.4 Portable calculation identity（approved 2026-09-01）

`PortableCalculationRequest`は、damage、precision、operation outcome、復元後に許可するcommandを一意に決め、
workspace、fingerprint、draft、history、share、backupを横断できる唯一の版付きportable calculation identityである。
scenarioやversionを並行fieldとして扱わず、次のdiscriminated contractへ収束させる。

```ts
type CanonicalContributionIntent = 'standard' | 'excludeVoluntarySkillModifiers';

interface CalculationVersionContext {
  schemaVersion: 41;
  masterDataVersion: string;
  engineVersion: string;
}

type PortableCalculationRequest =
  | {
      versionContext: CalculationVersionContext;
      scenario: Extract<CalculationScenario, { mode: 'resolved' }>;
      executionIntent:
        | {
            kind: 'resolved';
            origin: 'calculator';
            initialNpGauge: 10000;
            contribution: 'standard';
          }
        | {
            kind: 'resolved';
            origin: 'ranking';
            initialNpGauge: number;
            contribution: CanonicalContributionIntent;
          };
    }
  | {
      versionContext: CalculationVersionContext;
      scenario: Extract<CalculationScenario, { mode: 'manual' }>;
      executionIntent: { kind: 'manual' };
    };
```

schema v41のresolved／manual requestは`versionContext.schemaVersion: 41`を必須とし、
resultの`versions.schemaVersion`と一致させる。新requestのfingerprintは、このfieldを含むrequest全体から算出する。
v40 requestのversion contextはmaster／engineの2 fieldのまま歴史的identityとして保持し、保存済みrequest・result・fingerprintを
自動でv41へ書き換えない。v40からの明示再計算でのみ、元のscenario／execution intentを使ってv41 requestと新identityを生成する。
この構造版fieldはdamage式の版ではないため、identity変更のためだけにengineVersionを上げない。

- `standard`はcanonical executionで適用可能な寄与を通常どおり含める。
- `excludeVoluntarySkillModifiers`は、任意skill由来のdamage modifierだけを反実仮想として除外する。
- conditional effectの成立world、ordered command、choice、canonical inputはscenarioが保持する。
- `DamageContributionProjection`、`Set`、operation ID、compiled operation、resolved state、derived
  resource stateをrequest、draft、history、share、backupへ保存しない。
- `calculation-application`だけがrequestとcurrent masterからtyped contribution intentを
  `DamageContributionProjection`へcompileする。Web、workspace、repositoryはoperationを分類しない。
- 新しいcalculator requestはconstructorがcurrent version context、`origin: calculator`、
  `initialNpGauge: 10000`、`standard`を省略不能な値として生成する。
- ranking applicationのpure constructorはselected candidateとcurrent version contextから`origin: ranking`のrequestを
  生成する。Webはversion、開始NP、contributionを別fieldとして組み立てない。
- manual scenarioは`manual` intentだけを許可する。resolved用の開始NPやcontribution intentをmanual inputへ
  推測適用せず、異なる組合せをschemaで拒否する。

rankingから引き継いだresolved intentは、calculatorでscenarioを編集しても暗黙に変更しない。calculatorは
「ランキングから引き継いだ条件」、開始NP、contribution intentを結果近傍へ常時表示するが、開始NP editorや
contribution editorは追加しない。利用者が明示的な「通常の計算条件へ戻す」commandを実行した場合だけ、同じ
scenarioと同じversion contextから`calculator + 10000 + standard`の新requestを生成する。NP level変更等で保持中の開始NPがcapacityを超えた場合、
暗黙resetせず`invalid: initialNpGaugeExceedsCapacity`として閉じ、通常条件へ戻すactionを提示する。

fingerprintとapplication実行入口は`PortableCalculationRequest`だけを受け取り、master／engine versionを別引数で
identityへ追加しない。実行時に渡されたmaster snapshot／engine implementationのversionはrequestの
`versionContext`と完全一致しなければならない。`CalculationResult.versions`の`masterDataVersion`／`engineVersion`も
requestと完全一致させ、draft、history、shareのparse時と実行後に不一致を拒否する。同じpayloadでもmasterまたは
engineが異なるrequestは別identity／fingerprintである。

current schema envelope内のrequest／result version fieldは長さを制限した非空のopaque stringとしてparseし、
`ENGINE_VERSION` literalへの一致をschema parse条件にしない。これにより以前のengineで作成したcurrent-schema recordを
version一致の履歴値として検証できる。実行可否はapplicationが利用可能なmaster／engine inventoryと照合して決め、
過去engineのdual runtimeを要求または暗黙fallbackしない。

requestのsemantic validationとversion availabilityは次を区別する。

- schema不正、scenario参照欠落、request／result version不一致、実行対象master／engineとのversion不一致、
  NP capacity超過、intentとscenario mode／originの矛盾:
  `invalid`。damageを返さず、既定値へfallbackしない。
- requestとmasterは整合するが、current engineが既知のcanonical semanticsを実行またはprojectionへcompile
  できない: `unsupported`。0 damageやstandard contributionへfallbackしない。
- request／resultは整合するが一致するmaster snapshotまたはengine implementationを現在のアプリが保持しない:
  recovery state `historicalOnly: versionUnavailable`。保存resultだけを履歴値として表示できるが実行・編集しない。

fingerprintはrequest全体だけから生成する。同じscenarioでもversion、origin、開始NP、contribution intentが異なれば
別identityである。`CalculationDraft`、`CalculationHistoryEntry`、
`CalculationShareSnapshot`はscenario fieldを並行保持せずrequestを直接保持し、`UserDataBackup`は各profile内の
同じdraft／history contractを包含する。

app更新後の復元とversion遷移は次の一方向commandだけを許可する。

- draft restore／history copyは保存requestとresultを改変せず復元する。一致するversionが利用可能なら同じidentityで
  実行でき、利用不能なら`historicalOnly`として表示する。history copyがversionをcurrentへ暗黙更新してはならない。
  ここでいうold historyは新portable schemaで保存された以前のmaster／engine recordであり、schema 32 historyは移行時に破棄する。
- shareはrequest／result version一致を検証し、一致するruntimeがなければ履歴値だけを表示する。不一致snapshotは
  履歴値も信頼せず拒否する。
- 「現在のバージョンで再計算」は利用者の明示commandとして、scenarioとexecution intentを保持し、
  `versionContext`だけをcurrent master／engineへ置換した新requestを生成する。current masterで参照／capacity／semanticsを
  再検証し、失敗時は元の履歴値を維持したまま`invalid | unsupported`を返す。成功時も旧request／history／shareを
  上書きせず、新draft／resultとして保存する。
- 「通常の計算条件へ戻す」はversion upgradeとは別commandであり、同じ利用可能versionのranking intentだけを
  `calculator + 10000 + standard`へ置換する。二つの遷移を暗黙に合成しない。

schema 32から次版への移行は一方向かつtransactionalに行う。保存済み`ProfileCollection`とschema 32の
`UserDataBackup`について、profile ID／name／timestamps、servant builds、targets、craft essence copies、support
templates、active profile IDをstrictに検証して維持し、正しいrequestを復元できない旧draft／historyだけを破棄する。
変換後のcurrent schema全体を検証してからcurrent形式だけを保存し、v32 domain objectとcurrent objectをruntimeで
併存・同期しない。exact schema 32 backupは同じisolated migratorでcurrent形式へ変換してからimportできるが、
任意の古い版とfuture版は拒否する。旧schemaのshareはprofile dataを含まず安全なrequestへ変換できないため拒否する。
current schemaのrequestに対応するversionがない場合は上記`historicalOnly`とし、保存済みresultをD-06どおり
「共有時の履歴値」と明示して表示できるが現行計算結果として扱わない。migration／parse失敗時はuser storeをclearせず、
元recordを維持して復旧可能なtyped failureを返す。

本節は2026-09-01に設計承認済みである。runtime実装と検証はTSK-06.1の未完了項目として別に閉じる。

## 8. 計算エンジン要件

### 8.1 基本契約

```text
CalcInput + MasterDataSnapshot + EngineVersion
                         ↓
                 deterministic calculate
                         ↓
CalcResult + Breakdown + Assumptions + Warnings + Trace
```

- UI、IndexedDB、HTTP、上流データ形式から独立した純粋なドメインパッケージとする。
- 同じ入力、マスターデータ版、エンジン版から常に同じ結果を返す。
- ゲーム挙動に必要な32-bit相当演算、丸め順、上限、下限、加算・乗算順を固定する。
- 不明な値や未対応処理を0として扱わない。
- 結果状態を`exact`、`approximate`、`unsupported`で表す。
- 適用した補正、対象判定、特攻判定、仮定、警告を追跡できる。
- データだけで表現できない処理はhandler IDと専用テストを必須とする。

### 8.2 R1の計算範囲

- レベルATK、フォウ、礼装ATK、クラス攻撃補正
- クラス相性、属性相性
- 宝具倍率、カード補正、攻撃・防御補正
- カード性能、宝具威力、特攻付与、特攻宝具
- 特殊威力、耐性、防御無視、固定値
- パッシブとR1で採用する恒常補正
- 対象、特性、強化状態、宝具前後効果、OC、NP1〜5
- ダメージ乱数の最低、平均、最大

乱数は整数900〜1099の離散分布とし、平均は各乱数で最終floorまで行った200結果の算術平均とする。詳細な根拠、効果発動順、特殊Functionの分類、比較先と品質ゲートは`docs/requirements/damage-calculation-review.md`を正とする。

敵HP、撃破確率、NP回収、スター、Wave遷移、通常攻撃・クリティカル専用計算はR1契約へ含めない。

### 8.3 正確性

- 一次資料、公開データ、ゲーム内実測、独立計算を根拠として記録する。
- 外部ツールの表示値は差分調査に利用できるが、計算仕様や唯一の正解にはしない。
- 出典、期待値、データ版、エンジン版、レビュー担当をゴールデンケースへ記録する。
- 未対応handlerを含む結果を`exact`として表示しない。
- 全攻撃宝具をFunction種別へ分類し、未知Functionと未対応handlerをデータ更新ごとに検出する。
- AppMedia等の単一実装の出力を唯一の正解値にせず、一次根拠、独立計算、差分照合を組み合わせる。

### 8.4 効果実行とUI不変条件

- 条件判定、状態変化、補正付与、宝具ダメージを、マスター由来の順序付き操作として一つの計算状態へ適用する。
- 自身、パッシブ、礼装、支援、魔術礼装、宝具前効果、宝具特殊Functionは同じ条件評価器と実行経路を使用する。
- UIの効果on/offは成立条件の宣言であり、カード不一致、付与対象不一致、順序、値欠損、未対応handlerを迂回しない。
- UIはreason文字列、表示名、サーヴァントIDから効果の表示可否または操作可否を推測しない。
- 内部の破壊的移行後も、ダメージ計算画面の入力項目、操作順、結果表、内訳導線、共有導線を維持する。
- 誤計算修正による数値、適用効果、内訳、precisionの変化は旧出力との互換対象にしない。
- 詳細な目標契約と受入条件は`docs/requirements/damage-effect-execution-requirements.md`を正とする。

## 9. マスターデータ要件

R1では少なくとも次を扱う。

- Servant、レベル別Stat、Trait、地域公開状態
- Skill、Passive、NoblePhantasm、Function、計算条件
- CraftEssence、レベル別ATK、限界突破状態
- MysticCodeと計算に使う効果
- ClassRelation、AttributeRelation、GameConstant
- 強化・公開状態のReleaseMapping
- 育成段階、スキル、アペンド、レベルに必要な素材・QP等
- 日本語名称、読み、検索用別名
- UIで使用するラスター画像とfallback情報

R1が提供するゲームデータと表示言語はJP・日本語を正とする。地域、ゲームデータ言語、UI localeは別フィールドとして扱い、UI文言をドメインロジックやマスターIDへ埋め込まない。

マスターデータは上流形式を直接UIへ渡さず、内部モデルへ正規化する。各版に作成日時、出典、上流版、チェックサムを持たせる。公開前に参照整合性、未知関数、計算影響差分を検証する。

初回取得後は計算ごとに外部APIへ接続しない。更新失敗時は互換性検証済みの前回正常版で継続できる。画像欠落時も名称と数値で主要機能を利用できる。

## 10. UI・デザイン要件

詳細は`docs/requirements/ui-design-spec.md`を正とし、本書では横断原則を定める。

### 10.1 視覚原則

- 既存案から視覚効果を30%削減した状態を出発点とする。
- 一画面で最重要操作だけを強くし、それ以外を意図的に静かにする。
- 一画面では一つのデザイン比喩だけを使う。
- 装飾には機能上または世界観上の理由を持たせる。
- 均等なカード、均等な余白、均等な強調、過度な左右対称を避け、操作順で構成する。
- 新しさよりFGO Lab固有の用途と識別性を優先する。
- 意味のないグラデーション、全面ガラス、全面シャドウ、カード内カードを使わない。
- シアンとマゼンタの安易なサイバー表現、全角同一丸み、全見出しのアイコン装飾を使わない。
- 空白を装飾や説明文で埋めない。
- サイト全体の表現へSVGを使用せず、文字、罫線、CSS形状、DBのラスター画像を使う。

### 10.2 操作原則

- 保存ボタンではなく妥当な変更の自動保存を基本とする。
- 自動保存にはUndoと、失敗状態の明示を組み合わせる。
- 選択肢が少なく固定されたNPレベル等はselectを使用できる。
- サーヴァント、礼装、支援条件等の大規模選択は検索モーダルを使う。
- 数値は直接入力とショートカットを併用し、すべてをselectにしない。
- 一覧と編集の役割を混ぜない。

## 11. 非機能要件

### 11.1 アクセシビリティ

- 画面幅320px以上で主要情報と操作を欠落させない。
- キーボードだけで主要タスクを完了できる。
- 明瞭なフォーカス、ラベル、エラー関連付け、フォーカス復元を提供する。
- 色だけで選択、状態、カード種別、現在行を表現しない。
- 操作領域は44pxを基準とする。
- 主要画面の重大なaxe違反を0件とする。
- コントラストをWCAG 2.2 AA相当で維持する。

### 11.2 性能

- 単一宝具再計算は対象端末のp95で100ms以内を目標とする。
- 火力ランキングはWorker等へ分離し、Long Taskで操作を阻害しない。
- サーヴァント一覧は仮想化、画像遅延読込、分割索引を使用できる。
- 初期JavaScript、LCP、INP、検索、ランキングの予算をCIで継続計測する。
- 初回データダウンロードと通常起動を分け、通常起動で全画像を読み直さない。
- 通常起動でも更新確認と必要な構造化データの更新完了をホーム表示前に待つ。更新がなければactive版を直ちに利用する。

### 11.3 言語と地域

- R1で配信するUI文言は日本語のみとする。
- UI文言はキーで管理し、コンポーネントへ日本語文字列を判定条件として埋め込まない。
- 数値、日時、単位、複数形、文言順をlocale formatter経由で表示する。
- マスターデータの地域とUI言語を分離する。R1のゲームデータ地域はJPとする。
- 翻訳追加で保存schema、計算fingerprint、マスターIDが変化しないようにする。

### 11.4 対応環境とオフライン

- Chrome、Edge、Firefox、Safariの現行および直前主要版を対象とする。
- iOS SafariとAndroid Chromeを対象とする。
- PWAでなく通常ブラウザでもR1機能を利用できる。
- マスターデータ取得後は、保存、計算、ランキング、育成計画、exportをオフラインで利用できる。

### 11.5 セキュリティとプライバシー

- HTTPSで配信する。
- importファイルとURL共有データのschema、サイズ、深さ、件数を検証する。
- 文字列をHTMLとして描画せず、XSSを防ぐ。
- URLの展開・解凍に上限を設け、過大入力でブラウザを停止させない。
- 所持一覧、プロフィール名、内部メモを共有スナップショットへ含めない。
- FGOの引き継ぎ番号、パスワード、セッショントークンの入力欄を作らない。
- R1では利用状況分析やエラー情報を外部送信しない。診断情報は端末内表示と、ユーザー操作による匿名化exportを基本とする。

### 11.6 可用性と復旧

- IndexedDB書込失敗、容量不足、プライベートモードを検知して説明する。
- migrationとimportは、事前バックアップ、検証用領域への読込、整合性確認、切替の順で行う。
- 失敗時は元データを維持し、途中状態を通常データとして開かない。
- マスターデータ更新失敗時は前回正常版へ戻せる。
- 前回正常版へのfallbackは互換性検証後だけ許可し、使用中の版と更新失敗を常時確認できるようにする。

### 11.7 配信

- R1はNext.js App Routerで構築し、routeごとのServer Component、metadata、事前生成を基本とする。request-time dataが必要なrouteだけSSRへ切り替える。
- 第一配信先をVercelとし、各主要画面の直接URLとURLフラグメント共有を成立させる。
- IndexedDBのユーザーデータはサーバーへ送らず、profile、Web Worker、Canvas、共有fragmentの処理はClient Component境界に残す。
- 画像は構造化データと配信単位を分離し、画像配信を停止しても名称、数値、fallbackで主要機能を利用できる。

## 12. テストと品質保証

| 種別 | 必須対象 |
|---|---|
| Schema | IndexedDB、`UserDataBackup`、`CalculationShareSnapshot`のparse、round-trip、migration、未知版拒否 |
| 計算単体 | 補正、丸め、相性、特性、対象、上限、負値 |
| Golden | 単体／全体、B/A/Q、NP1〜5、OC、強化前後、相性、特攻、耐性、特殊宝具 |
| Property | 決定性、単調性、境界、乱数範囲 |
| Differential | エンジン版・マスターデータ版の変更影響 |
| Data | 欠損参照、重複ID、不正値、未知関数、素材合計 |
| Repository | IndexedDB migration、容量失敗、rollback、Undo |
| E2E | 初回、登録、支援、計算、ランキング、育成、再起動、オフライン |
| 可搬性 | backup export→初期化→importの完全round-trip |
| 共有 | URL round-trip、旧版表示、個人情報除外、URL上限、画像fallback |
| A11y | キーボード、読み上げ、フォーカス、コントラスト、axe |
| Performance | 初回取得、通常起動、検索、単一計算、ランキング、低性能端末 |
| Security | import、URL展開、XSS、過大入力、共有許可リスト |

## 13. R1受入条件

### 13.1 機能

- [ ] 初回セットアップ完了後にホームへ遷移できる。
- [ ] 通常起動で新版がある場合、検証・切替完了前に旧版のホームが表示されない。
- [ ] オフライン起動では互換性のある前回正常版を使い、使用版と最終更新時刻を確認できる。
- [ ] 非互換または破損した前回版ではホームへ進めない。
- [ ] 全サーヴァントがNP0で始まり、NP1以上で所持として保存される。
- [ ] 現在値と育成目標、礼装コピー、支援条件を自動保存・Undoできる。
- [ ] 所持DBと全DBの両方から攻撃役、礼装、支援役を選べる。
- [ ] サーヴァントLv、礼装Lv、NP、OC、スキルLvを変更できる。
- [ ] 特攻の適用・不適用理由を確認できる。
- [ ] NP1〜5の平均・最低・最大を縦一覧で確認できる。
- [ ] 敵HP、撃破率、前NPレベルとの差が主結果に現れない。
- [ ] 全体／所持を切り替えて火力ランキングを絞り込める。
- [ ] 育成計画の素材総数と使用先内訳が一致する。

### 13.2 保存・共有

- [ ] ブラウザ再起動後とオフラインで保存状態を再現できる。
- [ ] 一つの計算セッションで複数項目を編集しても履歴が一件だけ増える。
- [ ] 同じ入力を連続して確定しても重複履歴が作られない。
- [ ] 履歴確定前にブラウザを閉じても、ドラフトとして一件だけ復元できる。
- [ ] 全ユーザーデータのbackup export→初期化→importで同じ状態へ戻れる。
- [ ] import失敗時に元データが失われない。
- [ ] 結果カードを画像として保存できるか、保存方法のヘルプを確認できる。
- [ ] URLまたは共有専用JSONから計算条件と共有時結果を表示できる。
- [ ] 共有物にプロフィールID、所持一覧、内部メモが含まれない。
- [ ] 対応版がない共有結果を、現行版の結果として誤表示しない。

### 13.3 品質

- [ ] R1ゴールデンケースが100%成功する。
- [ ] マスターデータの参照整合性エラーが0件である。
- [ ] 未対応処理を含む結果が`exact`にならない。
- [ ] 主要ブラウザ、320px、キーボード、オフラインの必須フローが通る。
- [ ] 重大なアクセシビリティ違反が0件である。
- [ ] 画像を取得できなくても名称と数値で主要機能を利用できる。
- [ ] 条件付き効果と状態変化が順序付きの単一実行経路で解決される。
- [ ] 内部計算移行の前後で、ダメージ計算画面の入力項目、操作順、結果形式、共有導線が維持される。
- [ ] 新旧resolver、別NP条件経路、UI側のreason文字列判定が残っていない。

## 14. R2候補

R2は一括したリリースではなく、利用実績と正確性基盤を確認して個別に要件化する。

- NP回収、3Wave、クエスト検索、逆算
- 通常攻撃、クリティカル、チェイン、コマンドコードの専用UI
- 即死、スリップ、ブレイク、ガッツ等の特殊計算
- Chaldea／CSV取込、OCR
- 素材所持数、不足計算、周回候補
- 多地域対応
- 種火種類、クラス一致、成功ボーナス、キャンペーン倍率を比較する育成計算機

ユーザーアカウント、クラウド保存、端末間同期、ユーザー投稿型公開ライブラリはR2候補に含めない。

## 15. 法務・ライセンス

- R1は個人開発・非営利を前提とし、Vercelで一般公開できる。公開物は上流API／静的exportの返却値を正規化した版付きミラーであり、出典、取得日時、変換内容を表示する。
- Fate/Grand Orderおよび権利者とは無関係の非公式ファンツールであることを明記する。
- 公式サービスと誤認させる名称、ロゴ、ドメイン、画面を避ける。
- Atlas AcademyをR1の上流候補として採用し、構造化データ、名称、サーヴァント・礼装・スキル等の画像を版付き静的ミラーから取得・端末内キャッシュする。
- Atlas Academyへの負荷を抑えるため、静的exportまたは版付き成果物を取得し、計算ごとの外部API呼び出しや画像の反復取得を行わない。出典とODC-BY 1.0表記を記録する。
- 上流データと画像の利用条件が明確でないこと自体はR1実装・非営利公開の停止条件にしない。ただし、明確なソフトウェアライセンス条件は遵守する。
- 権利者または上流から指摘を受けた場合に画像だけを速やかに停止・削除できるよう、画像manifest、配信先、feature switchを構造化データから分離する。画像を使用できない場合も成立するfallbackを維持する。
- 計算とデータ更新の実装根拠は、Atlasの公開仕様、版付きmanifest、独立golden、FGO Labの要件に限定して追跡する。
- データ出典、取得日時、変換内容、計算根拠を記録する。
- 広告・課金・寄付等の収益化、公式と誤認しうる提供形態、第三者による再パッケージ配布へ用途を変更する場合は、データ・画像・商標・公式規約を改めて審査し、要件書を改訂するまで実施しない。

## 16. 実装前に確定すること

| ID | 項目 | 既定方針 |
|---|---|---|
| D-01 | 上流データのキャッシュ、公開、クレジット | Atlas Academy由来データを正規化した版付き静的ミラーとして配信できる。出典、取得日時、変換内容、ODC-BY表記を保持する |
| D-02 | ゲーム画像・アイコンの利用範囲 | Atlas Academy由来画像を構造化データと分離して採用し、遅延取得、画像なしfallback、指摘時の画像単独停止を併用する |
| D-03 | Web構成と配信先 | Next.js App Routerを採用し、Vercelを第一配信先にする。browser固有データはClient Component境界に保持する |
| D-04 | importの統合／置換 | R1はプレビュー後の全置換とする |
| D-05 | URL圧縮方式と最大長 | URLフラグメントを使い、超過時は共有専用JSONへ誘導する |
| D-06 | 過去マスターデータ版の保持 | 対応版なしでも共有時結果を履歴値として表示する |
| D-07 | 計算式と実測レビュー | `damage-calculation-review.md`を基準に、Atlas一次根拠、独立golden、AppMedia／Chaldea差分検証を行う |
| D-08 | 共有画像の生成方式 | 同一オリジンまたはローカルBlob化した画像だけを描画する |

## 17. 参照資料

- `docs/requirements/ui-design-spec.md`
- `docs/tasks/development-redesign-tasks.md`
- `docs/requirements/damage-calculation-review.md`
- `docs/requirements/damage-effect-execution-requirements.md`
- `docs/evidence/README.md`
- `docs/requirements/ranking-self-and-conditional-effects-requirements.md`
- `docs/requirements/test-strategy-redesign.md`

## 18. Contract catalog

| Contract ID | Governing sections | Contract |
| --- | --- | --- |
| `CALC-PORTABLE-001` | 6.9〜6.11、7、8、11.6、12、13.2 | version contextを内包する`PortableCalculationRequest`を唯一のportable calculation identityとし、result version、fingerprint、draft、history、share、backup、明示version遷移、安全な一方向migrationを同じcontractへ収束させる。 |

## 19. Revision log

| Version | Reason／Contract | Approval | Impacted Tasks | Baseline impact |
| --- | --- | --- | --- | --- |
| 0.3.9 | v41 resolved／manual requestのversion contextにschemaVersionを必須化し、v40 manual requestと新identityの衝突を解消（`CALC-PORTABLE-001`） | approved 2026-09-26: user confirmed the staged-plan contract | TSK-08、TSK-09.1／09の依存確認 | v41 portable fingerprintとTSK-06.5 matrix mergedDigestは意図的に変わる。旧v40 request／result／fingerprintと旧digestを履歴として保持し、S4 1,590 identity、34,640 outcomes、ranking条件fingerprint、candidate status／eligibility、production output／canonical input、TSK-07 cache／stale-responseを別定義の保護対象として検証する |
| 0.3.8 | version context／originを内包するportable calculation identity、明示version遷移、schema 32 migrationを追加（`CALC-PORTABLE-001`） | approved 2026-09-01: design review at `245d1ee`; approval commitはsemantics不変 | TSK-06.1、TSK-07〜09 | docs phaseはnone。implementationでschema／engine version、fingerprint、draft／history／share／backup schemaが破壊的に変わる。damage digestは不変を期待するが実装時に検証する |
