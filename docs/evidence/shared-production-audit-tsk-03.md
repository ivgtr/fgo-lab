---
title: "TSK-03 shared production audit foundation evidence"
document_version: "1.0.2"
status: "Complete"
created_at: "2026-08-30"
updated_at: "2026-08-30"
baseline_commit: "030d6e20a3d26465acc91a794dc7b08847482275"
implementation_task: "docs/tasks/development-redesign-tasks.md TSK-03"
---

# TSK-03 shared production audit foundation evidence

## 1. Outcome and invariants

production master全件から、data-pipelineとcalculation-applicationが別々のtyped read-only audit modelを一回だけcompileできる基盤を追加した。data-pipelineはraw vocabulary coverage、canonical operation、damage function、正規化除外を所有する。calculation-applicationはavailable preparation actions、used damage inputs、applied effects、execution issues／trace、`calculated | inputRequired | unsupported | invalid`、現行ranking policyを所有する。Atlas語彙をapplicationへ渡す新経路、Proposed ranking semantics、servant ID／name分岐、別damage executorは追加していない。

master `20260829.8`、schema 31、engine `27.0.0`は不変である。既存production監査を削除またはsample化せず、新しい共有audit 2 filesをproduction suiteへ追加した。既存semantic inventory、resource inventory、calculator default parity 422、ranking 433、candidate 6,508 generated／4,009 deduplicated、damage request 3,744／distinct 1,644、PNG 11 filesは変わっていない。既存product execution source、published master、既存damage assertion、snapshot、最終damage値への変更は0件である。

## 2. Shared audit models

| Boundary | Full inventory | Typed failure inventory | Canonical digest |
| --- | --- | --- | --- |
| data-pipeline | servants 469、CE 2,700、Mystic Code 28、effects 13,875、operations 14,623、damage functions 630、raw function 54／buff 133／parameter key 124 | canonical normalization exclusions 6 | `a6766e7ecce70f876515a1fbf01e599b5d3fdff5b0adf4d1d41f7fe77e0f517e` |
| calculation-application | attack servants 422、preparation plans 3,559、calculator scenarios 422、ranking rows 433 | calculated 422、inputRequired 0、unsupported 0、invalid 0、ranking failure 0 | `8dcffe8a09c91ce1d9ee3f6cd1626c7d70c7d1f3f56f41f55be064f70dcf82e3` |

`@fgo-lab/master-data/production-audit`はstable identity順とobject key順でcanonical JSONを生成し、SHA-256と最初のidentity／field差分を返す。formatter fixtureはrecord順／object insertion順でdigestが変わらないことと、`actor:2`の`rows[0]`差分を最初に報告することを確認する。空または重複identityはdigest生成と差分化の前にfail-closedとなるため、`[{x:1},{x:2}]`と`[{x:2}]`のような曖昧な入力を`audit_match`と誤報しない。production ratchetはdigestだけでなく上表のtyped inventoryを比較するため、件数差と最初のcanonical fieldへ到達できる。

application recordは各scenario identityについてavailable actions、used input、applied operation IDs、execution issues、ordered trace、NP1〜5 rowsを同じcompile結果に保持する。現行policyは`current-default`としてdamage semanticsと別fieldに置いた。全AttackProfile、4 policy、NP1〜5、calculator／ranking parity、invalid／unsupportedを不可分に要求する`RK-AUDIT-001`は、このfoundationでは満たした扱いにせずTSK-08へ延期した。TSK-04は`compileCalculationApplicationProductionAudit`の一回のshared compileと3,559 preparation planからAttackProfile canonical化を開始できる。

## 3. Runtime counters and artifacts

runnerは各run directoryを`FGO_TEST_ARTIFACT_DIR`としてproduction testへ渡し、`production-audit-*.json`のruntime counterをmanifestへ登録する。read／parse／compileはproducerの固定値ではなく、共有measurement wrapperが実際のcallback呼び出しを0から計数する。canonical production gateはcalculation-application／data-pipeline各1 artifactと、下表の全counterがsafe integerかつexact baselineに一致することを要求する。missing artifact、空counter、必須counter欠落、invalid counter、値の増減、未知counterはexit code 1の`contract_failure`として`pnpm test:production`と`pnpm quality`を停止する。runnerはcanonical counter名と値だけを扱い、FGO domain inventoryやdigestを解釈しない。

| Boundary | read | parse | compile | candidate | damage request |
| --- | ---: | ---: | ---: | ---: | ---: |
| data-pipeline | 1 | 1 | 1 | 0 | 0 |
| calculation-application | 1 | 1 | 1 | 6,508 generated／4,009 deduplicated | 3,744 total／1,644 distinct |

変更後3 runでcounterとdigestは全回一致した。最後の3 artifactsは`.test-results/2026-08-30T10-38-32-205Z-17-4206c8`、`.test-results/2026-08-30T10-39-54-933Z-355-2819cc`、`.test-results/2026-08-30T10-41-19-857Z-692-eae481`である。完全JSONはrun 1でcalculation-application 26,576,615 bytes、data-pipeline 12,936,826 bytesで、manifest、Vitest JSON、stdout、stderrとともにartifact listへ登録された。

focused diagnostic `.test-results/2026-08-30T10-37-41-645Z-194-dae33c`は2 files／2 testsを成功し、application compile 9.13秒、data-pipeline compile 2.04秒を含む完全resultを保持した。compact production successは従来どおり6行以内のsummaryからartifactへ到達できる。

## 4. Performance and production gate

同一Node 26.3.1、pnpm 11.20.0、Vitest 4.1.11、master `20260829.8`環境でproduction gateを変更前後各3 attempt測定した。

| State | Run 1 | Run 2 | Run 3 | Median |
| --- | ---: | ---: | ---: | ---: |
| before (`840cf08`) | 82.83秒 pass | 84.41秒 pass | 88.40秒 collector failure | 84.41秒 |
| after (`07b63c0`) | 82.69秒 pass | 84.87秒 pass | 83.72秒 pass | 83.72秒 |

変更前run 3は`unsupportedConvergenceGolden.test.ts`でVitest内部の`STACK_TRACE_ERROR`となり、artifact `.test-results/2026-08-30T10-21-44-300Z-648-76a419`に114 pass／1 structured failureを保持した。semantic期待値の不一致とは判定していない。3 attempt中央値同士では-0.69秒／-0.82%で、10%以上または5秒以上の構造変更ratchetに抵触しない。変更後3 runはすべて25 files／117 tests passした。

TSK-00 aggregate auditorはunit 55 files／286 tests、production 25 files／117 tests、全80 files／403 identities、重複0／未分類0へ更新した。semantic／resource／PNG digestは不変で、audit source、Suite、runner counter contractを含むstable aggregate digestだけを`3c39b40a4cbd5dcbea9d2476c09026a154dee2c5f5f6e5b7c19a98fca361c053`へ更新した。

## 5. Verification and handoff

- `pnpm test:diagnostic -- packages/data-pipeline/src/productionAudit.test.ts packages/calculation-application/src/productionAudit.test.ts`: 2／2 pass、artifact `.test-results/2026-08-30T10-37-41-645Z-194-dae33c`
- `pnpm test:diagnostic -- packages/master-data/src/productionAudit.test.ts`: 4／4 pass、artifact `.test-results/2026-08-30T11-37-53-621Z-243-c4e55b`。read／parse／compileの実呼び出し順と計数を含む
- `pnpm test:runner`: 16／16 pass。必須artifact／counterに加え、read／parse／compile／candidate／damage requestのbaseline不一致をblocking contractとして含む
- `node packages/data-pipeline/scripts/audit-tsk00-baseline.mjs --check`: pass
- `pnpm quality`: format、lint、typecheck、runner 16／16、docs 5／5、unit 55 files／286 tests（artifact `.test-results/2026-08-30T11-42-53-005Z-320-aa9497`）、production 25 files／117 tests（artifact `.test-results/2026-08-30T11-42-58-084Z-795-473969`、expected／actual exact counter match、contract errors 0）、master valid、build、E2E 64 passed／32 skipped（10.1分）まで成功
- Start commit: `840cf08`。Implementation commit: `07b63c0`。Initial completion: `c77e707`。First review: `273b1a3`、`10c5af3`、`b5ec5de`。Second review: `5a32bbb`、`a06532a`、TSK-03 completion commit
- TSK-04 entry: shared application auditのAttackProfile／preparation／scenario recordsを入力にし、Proposed IRへ一括cutoverする。旧監査loader／scanの最終削除はTSK-08のまま延期し、TSK-04でparallel runtime modelを作らない
