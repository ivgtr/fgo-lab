---
title: "FGO Lab 全体実装 引き継ぎプロンプト"
document_version: "1.0.0"
created_at: "2026-08-24"
---

# 次の実装者へ渡すプロンプト

以下をそのまま次の実装担当エージェントへ渡す。

---

あなたはFGO LabのR1全体実装を担当してください。計画の提案だけで終了せず、実装、テスト、文書更新、適切な単位のコミットまで自律的に進めてください。ユーザーによる判断が本当に必要になるまでは、通常の技術選択や軽微なUI調整について逐次確認を求めないでください。

作業ディレクトリは `/home/ivgtr/pj/fgo-lab/fgo-lab` です。

## 1. 最初に必ず読む正本

作業開始前に、次のファイルを省略せず最後まで読んでください。

1. `docs/fgo-lab-requirements-v0.3.md`
2. `docs/ui-design-spec.md`
3. `docs/implementation-plan.md`
4. `docs/damage-calculation-review.md`
5. `docs/chaldea-data-update-review.md`

文書の責務と優先順位は次の通りです。

- 機能範囲、データ境界、非機能要件: `fgo-lab-requirements-v0.3.md`
- 画面構造、操作モデル、レスポンシブ、アクセシビリティ: `ui-design-spec.md`
- 実装順、依存関係、完了条件、品質ゲート: `implementation-plan.md`
- 計算式、丸め、特殊Function、検証方法: `damage-calculation-review.md`
- データ更新、安全な切替、上流調査: `chaldea-data-update-review.md`

`docs/*-ui-options.md`と`docs/*.html`の比較デモは、判断履歴、情報階層、操作順を理解する補助資料です。デモの仮データ、仮計算値、装飾をそのまま製品コードへ移植しないでください。旧要件書`docs/fgo-lab-requirements.md`は履歴であり、現行要件の根拠にはしません。

文書間に矛盾があれば、まず正本の責務に従って解消可能か確認してください。軽微な矛盾は妥当な判断をADRへ記録し、影響する正本文書を同じコミットで更新して進めてください。プロダクト範囲や承認済みの操作モデルが変わる場合だけ停止条件に従ってください。

## 2. 現在のリポジトリ状態

引き継ぎ時点では、ドキュメントと比較デモのみがあり、アプリケーションコードと初回コミットはまだありません。開始時に必ず`git status`、`git log`、全ファイル一覧を再確認し、この記述より新しい変更があれば現状を優先してください。

既存ファイルはユーザーの成果物です。無関係な変更を削除、上書き、reset、checkoutしないでください。

## 3. 実装の到達点

`implementation-plan.md`のM0〜M9をR1として実装してください。最低限、次を実際に動作させます。

- 静的Webアプリの骨格、GitHub Pages向けproduction build
- 初回セットアップと、起動時のマスターデータ更新完了待ち
- 版付きマスターデータの取込、正規化、検証、manifest、staging、atomic切替、rollback
- ローカルプロフィール、複数プロフィールを想定したschema
- 所持・育成管理、NP0=未所持、現在値、育成目標、必要素材
- 使用する物理コピーだけを登録する概念礼装管理
- 支援条件テンプレートと、ダメージ計算でも共用する検索モーダル
- 宝具ダメージ計算、NP1〜5の平均・最低・最大、特攻判定、内訳、警告
- 全サーヴァント／所持サーヴァントの火力ランキング、フィルター、Worker計算
- 素材別台帳としての育成計画、使用先内訳と対象サーヴァントへの遷移
- IndexedDB自動保存、Undo、migration、バックアップimport/export
- session単位で重複しない計算履歴
- URLフラグメント共有、共有専用JSON、結果カードの画像保存
- 日本語UI。ただしlocaleとゲーム地域を分離した多言語対応可能な構造
- キーボード操作、320px以上、WCAG 2.2 AA相当、主要画面のaxe重大違反0件
- オフラインfallback、画像なしfallback、画像配信だけを停止できる構造
- CI、単体、golden、property、integration、E2E、a11y、performanceの基盤

R2のNP回収、3Wave、通常攻撃・クリティカル専用UI、クラウド保存、認証、SSRは実装しないでください。

## 4. 技術選択

開始時にアプリコードが存在しない場合は、SSRを導入せず、GitHub Pagesへ静的配信できる構成を選んでください。既定候補は次です。

- pnpm workspace
- Vite
- React + TypeScript strict
- Vitest + Testing Library
- Playwright
- IndexedDBはrepository interface越しに利用
- Web Workerでランキング計算

これはライブラリの固定リストではありません。より小さく安全な構成があればADRに理由を書いて採用できます。ただし、Next.jsやVercel前提、サーバーAPI、SSRを将来用という理由で追加してはいけません。依存を追加する前に、標準APIや既存依存で十分でないか確認してください。

## 5. アーキテクチャ上の必須条件

`implementation-plan.md`の依存方向を守ってください。特に以下は必須です。

### Viewとロジックを分離する

- React componentへ計算式、素材集計、履歴重複排除、master変換、IndexedDB処理を書かない。
- Viewは表示用の型またはview modelを受け取り、ユーザー操作をcommand/eventとして返す。
- React hookは画面ライフサイクルとapplication serviceの接続に限定し、ドメインルールの正本にしない。
- IndexedDB、fetch、URL、File API、Canvas、Workerはadapterまたはrepositoryの境界へ隔離する。
- 上流Atlas形式をViewと計算コアへ直接渡さず、版付き内部モデルへ正規化する。
- 計算コア、schema、profile-domain、workspace-domainからReactやブラウザAPIをimportしない。

### 純粋関数を切り出す

少なくとも以下は、I/Oを持たない純粋関数として単体テストできるようにしてください。

- float32演算、floor、clamp、バフ集約
- クラス・属性相性、対象・特性・特攻判定
- Function解決と宝具ダメージ計算
- 乱数900〜1099の最低、最大、200結果平均
- NP1〜5の一括計算
- 育成の現在値→目標値差分と素材集計
- 計算入力の正規化とfingerprint生成
- session境界での履歴確定と重複排除判定
- import/exportと共有snapshotのschema変換・検証
- フィルター、ソート、ランキング用の導出処理

現在時刻、乱数、ID生成、locale、永続化は引数またはinterfaceから注入し、テストで固定できるようにしてください。

### 状態を混ぜない

- マスターデータ
- 永続ユーザーデータ
- フォームの編集中draft
- URL由来の共有snapshot
- UIだけの一時状態
- 入力から導出される計算結果

これらを一つの巨大なglobal storeへ入れないでください。導出可能な結果を永続stateの正本として二重管理しないでください。

## 6. 計算精度は最優先ゲート

UIを広げる前に、`damage-calculation-review.md`に従ってM3を完成させてください。

- Atlas Academyの文書とJPデータを一次根拠に独立実装する。
- ChaldeaのAGPLコードをコピー、翻案、移植しない。挙動比較だけに使う。
- AppMediaは標準ケースの比較先であり、唯一の正解にしない。
- 水着リリスの報告済み比較入力は、最低61,944／最大75,640を比較oracleとして維持する。
- JavaScript倍精度の最後に一度floorする簡易式にしない。定義した演算境界で`Math.fround`相当を適用する。
- 乱数900〜1099を全件、最終floorまで評価する。
- 特殊処理をサーヴァントIDの散在したif文で実装せず、正規化済み入力とFunction種別の対応精度分類へ集約する。
- 全攻撃宝具のFunction分類を100%にする。
- 未知Function、条件不足、未対応handlerを0扱いしない。
- `exact`、`approximate`、`unsupported`を結果契約に含める。
- `unsupported`を通常ランキングへ混ぜない。
- 単発計算とランキングで同じeffect resolver、buff aggregator、damage kernelを使う。
- 適用順、適用元、上限、仮定、不適用理由をBreakdown／Traceで追跡可能にする。

外部実装との差は適当な許容誤差で隠さず、丸め、入力仮定、マスターデータ版、相手側の簡略化、FGO Labの不具合のどれかへ分類してください。差を説明できなければ`exact`として出荷しないでください。

## 7. 実装の進め方

まず短い実行計画を作り、そのまま着手してください。計画を提示してユーザー応答を待つ必要はありません。

次の順序を基本にし、各段階を「動作する縦断スライス＋テスト」で閉じてください。

1. リポジトリ保護、`.gitignore`、docs baseline、workspace、CI、ADR
2. schema、版契約、最小fixture、repository interface
3. データpipelineと初回セットアップ
4. float32プリミティブ、1騎の計算、全Function inventory、計算コアM3
5. アプリシェル、ホーム、プロフィール、draft/history
6. 所持・育成管理、概念礼装
7. 支援条件、ダメージ計算、共有
8. Workerを使う火力ランキング
9. 育成計画
10. import/export、offline、migration、画像停止fallbackを含むM9統合
11. 全品質ゲート、GitHub Pages build、文書・運用手順の完成

一画面の見た目だけを先に作り込まず、データ契約、ロジック、保存、エラー、テストまで通してから次の機能へ進んでください。

## 8. UI実装の判断基準

`ui-design-spec.md`は承認済みです。比較デモを完成見本として丸写しせず、実データと操作順に合わせてブラッシュアップしてください。

- 最初に視覚効果を30%減らす。
- 全領域を目立たせず、一画面のPrimaryを一つにする。
- 均等なカード、均等な強調、カード内カードを避ける。
- 意味のないgradient、全面glass、全面shadow、過剰な丸みを使わない。
- 装飾ではなく、視線誘導、操作順、比較性を優先する。
- AppMediaの結果表の読みやすさ、Chaldea.center風の育成値入力、承認済みデモの情報構造を参照する。
- サイト全体の表現用SVGは使わない。DB由来のラスター画像を使い、欠落時も名称で操作可能にする。
- PCとSPを別実装にせず、同じ意味構造をresponsive layoutで表現する。

文言、列幅、loading／error表現等は、情報階層を変えない範囲で実装者が改善して構いません。

## 9. `.gitignore`と生成物

依存導入やbuildの前に`.gitignore`を作成してください。実際の構成に合わせ、少なくとも次を検討してください。

- `node_modules/`
- `dist/`、`build/`
- `coverage/`
- `playwright-report/`、`test-results/`
- tool cache、temporary files、logs
- `.env`と秘密情報。ただし安全な`.env.example`は追跡可能
- OS固有ファイルと、共有する理由のないeditor設定
- 上流APIから取得した巨大なraw cache、ローカルDB dump、一時画像

lockfile、migration、schema、再現に必要な小さいfixture、ライセンス情報、生成手順は追跡してください。生成物を無差別にignoreせず、再現可能性とGitHub Pages配信方法を考えて決めてください。`.vscode/`は共有する明確な理由がなければignoreし、既存設定を勝手に削除しないでください。

秘密情報、個人データ、巨大なAPIレスポンスをコミットしないでください。commit前にstaged diffとファイルサイズを確認してください。

## 10. コミット方針

適宜コミットを入れてください。最後に全実装を一括コミットするのは禁止です。

- 開始時に履歴とworktreeを確認する。
- 引き継ぎ時点のように初回コミットがない場合は、`.gitignore`と正本文書を確認した上で、まず再現可能なbaseline commitを作る。
- 1コミットは一つの説明可能な変更単位にする。
- schema変更、migration、計算式変更、UI変更を理由なく一つへ混ぜない。
- 機能コミットには対応するテストを含める。
- コミット前に少なくともformat、lint、typecheck、対象test、`git diff --check`を実行する。
- 失敗中の状態を通常コミットしない。既知の段階的制約がある場合は文書化する。
- `git status`とstaged diffを確認し、対象ファイルだけをstageする。
- ユーザーの無関係な変更をコミットしない。
- commit amend、rebase、reset、既存履歴の書換え、remote pushは明示的な必要性や許可なしに行わない。
- Conventional Commitsに近い明瞭なメッセージを使う。

コミット例:

```text
docs: establish R1 implementation baseline
chore: scaffold static web workspace and CI
feat(schema): add versioned local data contracts
feat(data): add atomic master data update pipeline
feat(calc): implement float32 NP damage kernel
test(calc): cover special NP function inventory
feat(profile): add servant and craft essence management
feat(calculator): add support templates and NP result sheet
feat(ranking): calculate servant ranking in a worker
feat(growth): add material ledger and target breakdown
test(e2e): cover offline backup and sharing flows
chore: prepare GitHub Pages release workflow
```

コミット数を合わせる必要はありません。レビュー可能性とbisect可能性を優先してください。

## 11. 検証と完了報告

各マイルストーンで`implementation-plan.md`の完了条件を確認し、チェック結果を短く記録してください。最終的に次を実行可能なpackage scriptsへ揃えてください。

- format check
- lint
- TypeScript typecheck
- unit／golden／property tests
- integration tests
- Playwright E2E
- axeを含むa11y checks
- production build
- calculation benchmark
- master data validation／Function inventory

ネットワークやブラウザ等の環境制約で実行できない検証がある場合、未実行を成功扱いせず、理由、再現コマンド、期待結果を記録してください。

最終報告には次だけを簡潔にまとめてください。

- 実装した機能とR1の到達状況
- 主要なアーキテクチャ判断
- 計算精度の検証結果と未対応件数
- 実行したテストと結果
- 作成したコミット一覧
- ローカル確認方法
- GitHub Pages公開前にユーザーが行う操作
- 残課題、既知制約、ユーザー確認が必要な点

## 12. 自律実装を止める条件

次の場合だけ、根拠と選択肢を整理してユーザーへ確認してください。

1. 承認済みの画面目的、情報構造、操作モデルを変更しないと実装できない。
2. 一次根拠と複数の比較実装が矛盾し、どの結果を`exact`とするか製品判断が必要である。
3. データ消失を伴う破壊的操作、既存履歴の書換え、ユーザーデータの削除が必要である。
4. remote push、GitHub Pagesの実公開、外部アカウント、credential、secretが必要である。
5. 明示的なソフトウェアライセンス条件により、予定した実装を合法的に採用できない。
6. R1範囲を大きく増減させる必要がある。

次は停止理由にしないでください。

- ライブラリ選定、ファイル命名、内部component分割等の通常の技術判断
- 情報階層を変えない文言、余白、列幅、loading／error表現の調整
- 失敗したテストや計算差分の初回発見
- 実装が長い、難しい、または複数マイルストーンにまたがること
- ユーザー確認があると安心というだけの理由

停止条件に該当しない問題は、調査、修正、代替案、テストを尽くして継続してください。

## 13. ユーザー確認フェーズ

ユーザーへ通常の確認を求めるのは、M0〜M9が統合され、ローカルでR1の主要フローを確認できる状態になってからです。この時点では実公開を行わず、次を準備してください。

- production buildが成功している
- ローカルpreviewの起動方法が一つのコマンドで分かる
- 初回セットアップから主要画面までの確認手順がある
- 計算golden／differential結果と特殊Function inventoryが読める
- PC／SPの主要画面を確認できる
- 既知制約が画面または文書で確認できる
- GitHub Pages workflowが準備済みで、実公開だけが未実行である

そこでユーザーに、UIの最終ブラッシュアップと公開可否を確認してもらってください。ユーザー確認前でも、停止条件に該当しない実装、テスト、修正、コミットは最後まで進めてください。

---
