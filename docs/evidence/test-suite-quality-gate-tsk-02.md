---
title: "TSK-02 canonical test suites and quality gate evidence"
document_version: "1.0.2"
status: "Complete"
created_at: "2026-08-30"
updated_at: "2026-08-30"
baseline_commit: "d817efb944d8a22ca1ab1c96017ad63b7a9b1c4b"
implementation_task: "docs/tasks/development-redesign-tasks.md TSK-02"
---

# TSK-02 canonical test suites and quality gate evidence

## 1. Outcome and invariant

Local、CI、Pagesは`pnpm quality`を唯一の完了入口とし、format、lint、typecheck、runner／Suite／workflow contracts、unit、production、published master validation、build、Chromium／mobile Chromium E2Eを同じ順序と意味集合で実行する。test infrastructureはFGO domain語彙を解釈せず、production master全件監査、calculator／ranking parity、fail-closed、golden、evidenceをproduction suiteから省略しない。

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
| runner contracts | `pnpm test:runner` | capture、artifact、Suite partition、workflow入口 |
| unit phase | `pnpm test:unit` | production masterを使わない高頻度feedback |
| production phase | `pnpm test:production` | inventory、golden、parity、evidence |
| full Vitest diagnosis | `pnpm test:agent` | 77 filesを一processで確認 |
| canonical completion | `pnpm quality` | local／CI／Pages共通の唯一の完了gate |

`quality`はformat、lint、typecheckに続いて`test:runner`を必須実行し、capture／artifact、Suite partition、CI／Pages入口の10 Node contractsを検証する。その後にunit／productionを一度ずつ実行する。`validate:evidence`はproduction project内の2 filesだけをrunner経由で実行する診断aliasとして残し、`quality`からは呼ばない。`validate:master`は重複していたmaster-data／data-pipeline Vitestを外し、manifest checksum、schema、artifact validationを行うCLIだけを所有する。production suiteが同じVitest contractを一度実行する。

## 4. Gate and production evidence

同一Node 26.3.1、pnpm 11.20.0、Vitest 4.1.11、master `20260829.8`環境で変更後のsplit gateを3回測定した。

| Run | unit | production | 合計 |
| --- | ---: | ---: | ---: |
| 1 | 4.591秒 | 79.466秒 | 84.057秒 |
| 2 | 4.709秒 | 81.755秒 | 86.464秒 |
| 3 | 4.562秒 | 85.776秒 | 90.338秒 |

変更後中央値86.464秒は、同じ環境で取得したTSK-01変更前wrapped 83.34／84.06／84.28秒（中央値84.06秒）に対して+2.404秒／+2.86%である。二つのVitest process startupを明示した構造差であり、10%以上または5秒以上の構造変更ratchetには到達しない。

このphaseではruntime master read／parse counterを実装しておらず、静的な20 files／42 source referencesをruntime回数または非増加の根拠にはしない。共有production audit modelがcounterを所有するT3から、runtime read／parse、compile、candidate生成、damage requestをblocking指標とする。T2は既存のcanonical assertionsからpreparation 422 servants／6,508 generated／4,009 deduplicated／3,559 terminal、ranking damage request 3,744／distinct input 1,644／hit 2,100、calculator parity 422、ranking 433を引き渡す。これらのassertion source、test identity、master、digestに差分はない。

### 4.1 Output and detailed timing

compact commandをUTF-8でcaptureし、末尾LFを含むstdout bytesと物理行を測定した。

| Command／outcome | stdout | stderr | Artifact |
| --- | ---: | ---: | --- |
| `pnpm test:unit` success | 6行／185 bytes | 1行／52 bytes（pnpm command表示） | `.test-results/2026-08-30T06-48-19-774Z-22-b0ce0e` |
| `pnpm test:production` success | 6行／193 bytes | 1行／58 bytes（pnpm command表示） | `.test-results/2026-08-30T06-48-24-453Z-490-f2df37` |
| unit missing-filter diagnostic failure | 10行／393 bytes | 0行／0 bytes | `.test-results/2026-08-30T06-49-48-345Z-9-8bd114` |

成功summaryはfile／test／skip／warning、duration、artifact pathを保持して10行ratchet内である。failure summaryもstatus、集計、diagnostic、完全artifact pathを保持して10行／393 bytesであり、上限200行／32 KiB内である。failure artifactにはmanifest、Vitest JSON、stdout、stderrが残る。

Vitest default reporterを同じ環境で各Suite一回実行し、worker累積時間をwall-clockと分離して記録した。

| Suite | Files／tests | wall-clock | transform | import | tests | environment | Slowest file |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| unit | 54／282 | 7.70秒 | 8.65秒 | 20.30秒 | 2.06秒 | 37.90秒 | `AppliedEffects.accessibility.test.tsx` 223ms |
| production | 23／115 | 70.71秒 | 4.44秒 | 11.55秒 | 238.38秒 | 3ms | `rankingProduction.test.ts` 69.528秒 |

setupは両Suiteとも0msだった。transform、import、tests、environmentはparallel worker累積値で、3-run wall-clock中央値と加算比較しない。productionの次点は`productionMasterInventory.test.ts` 27.013秒、`executionSemanticsProduction.test.ts` 26.146秒、`targetContextProduction.test.ts` 21.060秒であり、TSK-03の共有audit収束対象へ引き渡す。

Auditorは次を再確認した。

- semantic inventory digest: `5da30c87c74e36e1e9ca0ae7f4686df88259c8c3d6aa99cc2ec05650609d55d4`
- resource occurrence／inventory digest: `20480d1c70b0537bf89e40d902f783af94814a85e349fd358f21f25f4f968e71`／`fc183b614f6a36cc5c3a21d5933017fd2798939a61974b3a6f862af2cac68529`
- production master load references: 20 files／42 occurrences
- calculator default parity: 422 records、ranking default: 433 rows、production condition: 10 kinds（production suite assertionsで維持）
- PNG baseline: 11 files、digest `537f27408450edaa6d0bc96e134e16751f7c7f0c00e8f788525fd56f99cbcee6`

Suite分類とrunner／workflow変更を含むaggregate digestは`0a326da93671ab724a7b050011a0354522416567c07a3febb1b9ccd09df67c53`へ更新した。product inventory／damage digestの変更ではない。

## 5. E2E execution

最初のlocal `quality`は既定6 workersでChromium 4 casesがbrowser session closeまたは画面待機timeoutになったため中断した。同じ4 casesをChromium 1 workerで再実行すると4／4 pass、1.4分だった。この比較に基づき、`test:e2e`はCIの従来設定と同じ1 workerへ固定した。test selectionはChromium／mobile Chromiumの4 files／96 project casesから変更していない。

review修正後の最終`pnpm quality`ではrunner contracts 10／10、unit 5.11秒（artifact `.test-results/2026-08-30T06-13-14-401Z-197-e4a4dc`）、production 80.64秒（artifact `.test-results/2026-08-30T06-13-20-053Z-665-cf76ab`）、published master valid、build成功、E2E 64 passed／32 project-specific skipped、10.3分だった。production suite内のevidence testsを含む397 Vitest contractsが通っており、damage、ranking、test assertion、snapshot、master差分は0である。

Playwrightのlocal HTML artifactは`playwright-report/index.html`、run stateは`test-results/.last-run.json`である。CIは成功／失敗にかかわらず`playwright-report/`をartifact名`playwright-report`、retention 14日でuploadする。screenshotは失敗時だけ`test-results/<case>/test-failed-1.png`へ保存し、traceはlocalで失敗時、CIで初回retry時に`test-results/<case>/trace.zip`へ保存する設定である。

最終runの一つ前は`unsupportedConvergenceGolden` 1 testが5.272秒でtimeoutし、qualityが非0終了した。同じfileのfocused production runは3／3 pass、7.15秒だった。TSK-00でも同じfileのfull-suite timeoutとfocused passが記録され、今回のdiffに当該test／product sourceは含まれないことを比較した。timeout値やassertionは変更せず、上記canonical gateの再実行成功を最終結果とした。
