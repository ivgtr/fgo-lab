---
title: "TSK-02 canonical test suites and quality gate evidence"
document_version: "1.0.0"
status: "Complete"
created_at: "2026-08-30"
updated_at: "2026-08-30"
baseline_commit: "d817efb944d8a22ca1ab1c96017ad63b7a9b1c4b"
implementation_task: "docs/tasks/development-redesign-tasks.md TSK-02"
---

# TSK-02 canonical test suites and quality gate evidence

## 1. Outcome and invariant

Local、CI、Pagesは`pnpm quality`を唯一の完了入口とし、format、lint、typecheck、unit、production、published master validation、build、Chromium／mobile Chromium E2Eを同じ順序と意味集合で実行する。test infrastructureはFGO domain語彙を解釈せず、production master全件監査、calculator／ranking parity、fail-closed、golden、evidenceをproduction suiteから省略しない。

Product source、test assertion、snapshot、published master、damage／ranking semanticsは変更していない。masterはversion `20260829.8`、33,850,263 bytes、SHA-256 `c88fb68d2735f54151de3b965c1d80861cd922159119f47072f9e62ed1a4d9f1`のままである。

## 2. Canonical suite contract

`scripts/test-suites.mjs`を一つの分類正本とし、Vitest projectとTSK-00 auditorの両方が参照する。production suiteはpublished master consumer、production inventory／parity、承認済みgolden／differential、evidence integrityの23 filesを明示所有する。unit suiteは全Vitest includeからproduction 23 filesを除いた54 filesである。

| Suite | Files | Tests | File-list SHA-256 | Responsibility |
| --- | ---: | ---: | --- | --- |
| unit | 54 | 282 | `a009ae0c51f87fa0226cc3a9fe846cf2903cd22f3cd7827bf9b4a094e3525a6f` | semantic fixture、architecture、Web component |
| production | 23 | 115 | `10713e0924cb9c2369d61e656167a85b552bf91cb24073a6f221e6b45c2a336f` | master audit、inventory、golden、differential、parity、evidence |
| total | 77 | 397 | `71ffa6f7835799adbcdb306eb3484c2796c61b2e453414840547e59f54453e3b` | 重複0、未分類0 |

全test-name digestは`756e5e31d206bc4632df25da0fd2728fbd198a94603dca4bd858f0f633259251`でTSK-00／01から不変である。runner contractはproduction manifestの重複、存在しないpath、published master consumer、`Golden`／`Production`／`Differential`／`Inventory`／evidence fileのunit流出を失敗させる。

## 3. Canonical command matrix

| Scope | Command | Completion use |
| --- | --- | --- |
| focused diagnosis | `pnpm test:diagnostic -- <filter>` | 一つのfailureまたはsemantic family |
| unit phase | `pnpm test:unit` | production masterを使わない高頻度feedback |
| production phase | `pnpm test:production` | inventory、golden、parity、evidence |
| full Vitest diagnosis | `pnpm test:agent` | 77 filesを一processで確認 |
| canonical completion | `pnpm quality` | local／CI／Pages共通の唯一の完了gate |

`validate:evidence`はproduction project内の2 filesだけをrunner経由で実行する診断aliasとして残し、`quality`からは呼ばない。`validate:master`は重複していたmaster-data／data-pipeline Vitestを外し、manifest checksum、schema、artifact validationを行うCLIだけを所有する。production suiteが同じVitest contractを一度実行する。

## 4. Gate and production evidence

個別phase計測では`pnpm test:unit`は54 files／282 tests、4.71秒、warning 0、`pnpm test:production`は23 files／115 tests、81.75秒、warning 0で成功した。二process合計86.46秒はTSK-01 wrapped full-run中央値84.06秒より2.40秒／2.86%長い。これは排他的phase gateを二つのVitest processとして明示したstartup境界であり、test identity、master load数、candidate、damage requestを増やしていない。production共有load／compileによる短縮は依存Task TSK-03で扱う。

Auditorは次を再確認した。

- semantic inventory digest: `5da30c87c74e36e1e9ca0ae7f4686df88259c8c3d6aa99cc2ec05650609d55d4`
- resource occurrence／inventory digest: `20480d1c70b0537bf89e40d902f783af94814a85e349fd358f21f25f4f968e71`／`fc183b614f6a36cc5c3a21d5933017fd2798939a61974b3a6f862af2cac68529`
- production master load references: 20 files／42 occurrences
- calculator default parity: 422 records、ranking default: 433 rows、production condition: 10 kinds（production suite assertionsで維持）
- PNG baseline: 11 files、digest `537f27408450edaa6d0bc96e134e16751f7c7f0c00e8f788525fd56f99cbcee6`

Suite分類とrunner／workflow変更を含むaggregate digestは`ffc0eb340595c381e44d34d275d9c112ef43b1fd3b5d8609ed20ff8ec1d05940`へ更新した。product inventory／damage digestの変更ではない。

## 5. E2E execution

最初のlocal `quality`は既定6 workersでChromium 4 casesがbrowser session closeまたは画面待機timeoutになったため中断した。同じ4 casesをChromium 1 workerで再実行すると4／4 pass、1.4分だった。この比較に基づき、`test:e2e`はCIの従来設定と同じ1 workerへ固定した。test selectionはChromium／mobile Chromiumの4 files／96 project casesから変更していない。

最終`pnpm quality`ではunit 4.56秒（artifact `.test-results/2026-08-30T05-33-34-221Z-114-f3f5de`）、production 85.78秒（artifact `.test-results/2026-08-30T05-33-39-313Z-582-2f0836`）、published master valid、build成功、E2E 64 passed／32 project-specific skipped、10.3分だった。続けて`pnpm test:runner` 10／10、baseline auditor `--check`、`git diff --check`が成功した。production suite内のevidence testsを含む397 testsが通っており、damage、ranking、test assertion、snapshot、master差分は0である。
