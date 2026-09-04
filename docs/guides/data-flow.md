---
title: "FGO Lab canonical data flow"
document_version: "1.0.0"
status: "Guideline"
updated_at: "2026-08-30"
governing_decisions:
  - "docs/adr/001-workspace.md"
  - "docs/adr/002-local-storage.md"
  - "docs/adr/003-master-delivery.md"
  - "docs/adr/011-canonical-effect-execution-semantics.md"
  - "docs/adr/029-next-vercel-routing.md"
---

# FGO Lab canonical data flow

本書は現行実装の依存方向と状態所有を説明する。product behaviorはrequirements、採用判断はADR、実装順序はTasksを正とし、本書はそれらを上書きしない。

## Master data

```text
Atlas static export
  -> data-pipeline (raw Atlas vocabularyの唯一の解釈境界)
  -> versioned normalized master + manifest + inventory
  -> Vercel static master artifact
  -> web startup adapter
       -> manifestだけで版を確認し、初回／版更新時だけcandidateを取得
       -> byte length・SHA-256／schema／参照整合性検証
       -> IndexedDB staging
       -> active pointerのtransaction切替
       -> 互換性確認済みの直前正常版fallback
```

構造化master、ユーザーデータ、画像cacheは別領域とする。画像取得失敗はmaster activationを失敗させず、名称表示へfallbackする。candidateは検証完了前にapplicationから参照しない。

## Calculation and ranking

```text
Web UI / ranking policy
  -> scenario command / canonical input
  -> calculation-application
       -> battle-execution (ordered, transactional operations)
       -> calc-core (pure damage kernel)
       -> evidence / result projection
  -> canonical calculation result
  -> Web presentation
```

`schema`はportable contract、`master-data`は正規化済みmasterの検証・参照、`battle-execution`はcanonical stateへの順序付きoperation、`calc-core`は純粋な数値計算、`calculation-application`はscenarioの組立と実行接続を所有する。raw Atlas key、名称、サーヴァントIDによる意味分岐をexecution／UIへ持ち込まない。

Calculatorとrankingは同じ`calculation-application`／`battle-execution`／`calc-core`経路を使う。ranking workerは実行場所を分離するだけで、独自のdamage semanticsを所有しない。

## User and workspace state

```text
User event
  -> React view
  -> App-owned command
       -> profile-domain / workspace-domain pure transition
       -> useProfileCollection serialized write queue
       -> IndexedDbProfileRepository

CalculationWorkspace
  -> scenario / validated share snapshot / contribution projection
  -> calculation-application
```

`ProfileCollection`のブラウザ内所有と書込直列化は`useProfileCollection`へ集約する。画面componentはプロフィールを直接保存しない。master、永続profile、計算workspace、共有snapshot、導出結果、UI一時状態を一つのglobal stateへ混在させない。

## Portable and external boundaries

```text
ProfileCollection <-> UserDataBackup <-> local file
CalculationScenario + Result <-> allowlisted CalculationShareSnapshot
                                  -> URL fragment / share-only JSON / local image
```

共有snapshotへprofile ID、所持一覧、メモ等を含めない。外部送信を必要とするユーザーデータ経路は持たず、URL fragmentとローカルfile／imageだけをportable boundaryとする。
