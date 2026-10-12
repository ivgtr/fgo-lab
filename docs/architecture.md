# アーキテクチャ

## Workspaceと責務

| 領域 | 責務 |
| --- | --- |
| apps/web | Next.js UI、ブラウザadapter、Worker、表示と入力操作 |
| packages/schema | canonical master、保存・共有、計算入力の型と検証 |
| packages/data-pipeline | Atlas/raw語彙の解釈とcanonical masterの生成 |
| packages/master-data | 正規化済みmasterの検証・参照と監査の共通境界 |
| packages/calculation-application | scenarioの組立、ranking方針・候補選択、計算実行の接続 |
| packages/battle-execution | canonical stateへの順序付きtransaction、条件・状態・効果の実行 |
| packages/calc-core | 純粋なダメージ数値計算 |
| packages/profile-domain・workspace-domain | 所持・育成と計算workspaceの状態遷移 |

## Masterと計算

```text
Atlas data → data-pipeline → versioned canonical master
  → master-data validation → web startup / Worker

UI command / ranking candidate
  → calculation-application → battle-execution → calc-core
  → canonical result → summary / detail / calculator presentation
```

data-pipelineだけがraw語彙を解釈します。UIやexecutionはservantのID・名前から規則を推測しません。calculatorとrankingは同じ実行経路を使い、Workerは実行場所を分離します。

## Atlas直接取得と自動更新の設計要件

現行実装は、事前に生成したcanonical masterとmanifestをWebアプリから配信します。以下は自前の大きいゲームデータ配信をなくし、Atlasの最新データへ自動追従するための設計要件であり、直接取得・自動更新・定期監視は未実装です。

目標の経路:

```text
Atlas export / 必要な追加参照 → browser取得 → data-pipelineをWorkerで実行
  → canonical masterの検証 → IndexedDBへの原子的な切替
  → calculator / rankingの共通計算経路
```

- UI・計算・変換コードと必要な小さい版情報を配信し、通常のデータ更新に自前masterの生成・uploadやアプリの再deployを要求しません。端末内のmaster保存と、開発用の固定回帰入力は保持します。
- 起動・オンライン復帰・利用中の更新確認から、取得・正規化・検証・active切替までを自動化します。未変更時は大きい本文を再取得しません。確認頻度は上流条件、更新遅延、実測費用で決めます。
- 新サーヴァント・礼装、既知の効果や係数の更新はデータから扱います。必要な参照先スキル等を入力から発見・解決し、重複・循環・参照不足を検査します。キャラクターごとの追加分岐や固定の補助データ一覧に依存しません。
- rawの解釈はdata-pipelineが所有し、Nodeとbrowser Workerで同じ入力から同じcanonical意味を生成します。未知のfield・効果・演算や矛盾を無視・変換・数値fallbackで補いません。新しいゲーム規則は、その意味を実装・検証してから受け入れます。
- 取得元版、各入力のhash、正規化器の版を記録します。複数exportと追加参照が整合する根拠を定め、版情報の取得前後一致や自己計算したhashだけで同一snapshotと認定しません。この取得契約は実装計画で確認する必要があります。
- 更新候補は全入力の取得・検証に成功した場合だけactiveへ切り替えます。失敗理由と利用中の版を表示し、互換性確認済みのactiveと利用者データを保持します。別の配信先への自動fallbackを設けず、途中の取得・変換を更新成功と扱いません。

定期監視はGitHub ActionsでAtlasの更新と新概念・未対応状態を検査し、根拠付きIssue等で通知する構成を目指します。製品と同じ受入契約を使い、上流・検査コードとも未変更なら軽い確認で終了します。未知の概念、受入不能、通信・監視障害を分け、同じ問題のIssueやcommentを増やしません。監視結果は各端末のactivationを保証しないため、端末側検証も維持します。

標準runnerと小さい状態記録を使い、変更時だけ必要な入力を取得・検査します。実行時間・転送量・artifact保持量を測定し、既存CIを含む利用枠で頻度を判断します。毎回の全quality実行や大きいmasterの恒久保存を前提にしません。scheduleの遅延・停止と最終成功時刻の確認も運用に含めます。[GitHub Actionsの料金](https://docs.github.com/en/billing/concepts/product-billing/github-actions)、[scheduleの制約](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。

完了条件は、既知の意味論による新データ追加が製品コード変更・大きい自前配信なしに、実UIとWorkerの計算まで到達することです。同じ固定入力でNode／Workerの生成結果を照合し、未知の意味・参照欠落・版混在・通信失敗・保存失敗の拒否と既存データ保持を確認します。監視には同じ問題の通知重複防止、検査コード変更時の再検査、実測費用の証拠が必要です。検証のgateは[テストガイド](testing.md)に従います。

## 共有と所有

同じcanonical master・sourceの静的解決を再利用します。runtime入力、activation、操作順は実行contextで束縛します。同じsemantic contextの完了済みordered prefixを共有し、各branchの書込み用state／draftとtransactionのcommit／rollbackを分離します。数値や使用済みskill maskだけで状態を同一視しません。

rankingは全候補を順序付きで評価・選択し、summaryに不要な完全結果を一時保持しません。detailは要求時に取得します。master・policy・入力の更新、初期化失敗では旧contextと旧detailを拒否します。完了・拒否・観測例外の後にrequest用の共有状態を解放します。

## 保存・共有

master、永続profile、計算workspace、導出結果、UI一時状態は別に所有します。profileの書込みはrepository adapterへ集約し、直列化します。masterの取得byte列・schema・版・参照整合性を検証してからactive snapshotを切り替えます。

ユーザーデータはIndexedDB、バックアップはローカルファイル、計算結果の共有は限定したsnapshotを使います。共有snapshotへ所持一覧やメモを含めません。画像cacheと構造化masterは分離し、画像取得に失敗した場合は名称表示を使います。
