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

## 共有と所有

同じcanonical master・sourceの静的解決を再利用します。runtime入力、activation、操作順は実行contextで束縛します。同じsemantic contextの完了済みordered prefixを共有し、各branchの書込み用state／draftとtransactionのcommit／rollbackを分離します。数値や使用済みskill maskだけで状態を同一視しません。

rankingは全候補を順序付きで評価・選択し、summaryに不要な完全結果を一時保持しません。detailは要求時に取得します。master・policy・入力の更新、初期化失敗では旧contextと旧detailを拒否します。完了・拒否・観測例外の後にrequest用の共有状態を解放します。

## 保存・共有

master、永続profile、計算workspace、導出結果、UI一時状態は別に所有します。profileの書込みはrepository adapterへ集約し、直列化します。masterの取得byte列・schema・版・参照整合性を検証してからactive snapshotを切り替えます。

ユーザーデータはIndexedDB、バックアップはローカルファイル、計算結果の共有は限定したsnapshotを使います。共有snapshotへ所持一覧やメモを含めません。画像cacheと構造化masterは分離し、画像取得に失敗した場合は名称表示を使います。
