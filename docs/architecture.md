# アーキテクチャ

## Workspaceと責務

| 領域 | 責務 |
| --- | --- |
| apps/web | Next.js UI、ブラウザadapter、Worker、表示と入力操作 |
| apps/data-audit | rawと公開APIの独立照合、証明書の発行と公開 |
| packages/schema | canonical master、保存・共有、計算入力の型と検証 |
| packages/data-pipeline | Atlas/raw語彙の解釈とcanonical masterの生成 |
| packages/master-data | 正規化済みmasterの検証・参照と監査の共通境界 |
| packages/atlas-monitor | 監査・watchdogの通知と重複防止 |
| packages/calculation-application | scenarioの組立、ranking方針・候補選択、計算実行の接続 |
| packages/battle-execution | canonical stateへの順序付きtransaction、条件・状態・効果の実行 |
| packages/calc-core | 純粋なダメージ数値計算 |
| packages/profile-domain・workspace-domain | 所持・育成と計算workspaceの状態遷移 |

## Masterと計算

```text
Atlas API + 監査証明書 → browser Workerのdata-pipeline
  → versioned canonical master → master-data validation
  → IndexedDB active → web startup / Worker

UI command / ranking candidate
  → calculation-application → battle-execution → calc-core
  → canonical result → summary / detail / calculator presentation
```

data-pipelineだけがraw語彙を解釈します。UIやexecutionはservantのID・名前から規則を推測しません。calculatorとrankingは同じ実行経路を使い、Workerは実行場所を分離します。

## Atlas直接取得と自動更新

製品の取得契約と検証状況は[Atlas更新記録](atlas-data-update.md)を正本とします。製品コードは大型masterの配信を外し、独立監査が発行する小容量の証明書とAtlas APIの応答を使います。証明書の公開先と監視ジョブは実環境で未稼働です。

```text
Atlas raw Git + 公開API実装 → Actionsで固定・再生・公開応答と照合
  → 小容量の証明書 → browserがAtlas API本文を直接取得
  → Workerのdata-pipelineでcanonical化とdigest検証
  → IndexedDB activeの原子的切替 → calculator / ranking
```

- 起動・オンライン復帰・表示復帰・利用中の周期確認で証明書を読み、世代が同じなら大型本文の取得・変換・保存を省きます。世代が進んだら13 exportと発見した追加skillをAtlasから取得し、全bytes・参照閉包・canonicalを照合します。
- rawの意味解釈はdata-pipeline、scenarioはcalculation-application、順序付き状態適用はbattle-execution、数値計算はcalc-coreが所有します。新サーヴァント・礼装・既知規則はデータで受け入れ、未知field・効果・係数・矛盾は監査で拒否します。
- 成功候補だけを端末内activeへ切り替えます。取得・検証に失敗したら互換性を再確認した旧activeと利用者データを保持し、失敗と利用中の版を表示します。初回失敗時は計算を開始しません。
- Actionsは6時間ごとに完全監査して証明書を更新し、同一原因のIssueを重複させません。独立したwatchdogは監査heartbeatの停止を検知します。端末側も毎回bytesとcanonicalを検証します。[最終gate](testing.md)と公開環境の確認が完了条件です。

## 共有と所有

同じcanonical master・sourceの静的解決を再利用します。runtime入力、activation、操作順は実行contextで束縛します。同じsemantic contextの完了済みordered prefixを共有し、各branchの書込み用state／draftとtransactionのcommit／rollbackを分離します。数値や使用済みskill maskだけで状態を同一視しません。

rankingは全候補を順序付きで評価・選択し、summaryに不要な完全結果を一時保持しません。detailは要求時に取得します。master・policy・入力の更新、初期化失敗では旧contextと旧detailを拒否します。完了・拒否・観測例外の後にrequest用の共有状態を解放します。

## 保存・共有

master、永続profile、計算workspace、導出結果、UI一時状態は別に所有します。profileの書込みはrepository adapterへ集約し、直列化します。masterの取得byte列・schema・版・参照整合性を検証してからactive snapshotを切り替えます。

ユーザーデータはIndexedDB、バックアップはローカルファイル、計算結果の共有は限定したsnapshotを使います。共有snapshotへ所持一覧やメモを含めません。画像cacheと構造化masterは分離し、画像取得に失敗した場合は名称表示を使います。
