---
title: "TSK-06.3 test observability and artifact flow"
status: "Complete"
updated_at: "2026-09-01"
---

# TSK-06.3 test observability and artifact flow

## Outcome, invariants, and family owner

一回の`pnpm quality`から一つのparent run identityを得て、そのmanifestだけからunit、production、
Playwrightの構造化outcomeと完全artifactへ到達できるようにする。warning、unexpected console、
skip／todo、reporter failure、artifact欠落、CI upload failureは、test assertionがpassしていても成功へ
分類しない。

この変更のsemantic familyはtest execution observabilityである。damage、production audit、ranking、
E2E observationの意味を所有しない。canonical ownerはquality parent manifestとし、各suiteのchild
manifestはparentから与えられたidentity／directoryへだけ書く。Vitest／Playwright reporterはrunnerが
消費する構造化eventとresultのproducerであり、HTMLやconsole表示は判定の正本にしない。CIはparent
directoryを一単位としてuploadし、upload stepの失敗をinfra failureとして保持する。

不変条件:

- local、CI、Pagesのcanonical入口と意味集合は`pnpm quality`一つである。
- unitとproductionは排他的で、production inventory、calculator／ranking parity、damage digest、runtime
  counterを縮小しない。
- TSK-06.2の61 observation、25 E2E、VRT／a11y責任を変更しない。
- structured resultを欠く実行は判定不能であり、plausibleな成功へfallbackしない。
- allowlistはtest identity、event kind、完全message、理由、期限の一組だけを許し、global regex、path、
  title、prefix単独の一致を許さない。
- TSK-08はrunner manifestのtyped diagnostic boundaryを拡張できるが、runnerはFGO domain reasonを解釈しない。

## Entry audit

開始HEADは`1ab4b3e3fbd6a76e467d3f931b4a64c5c74b4345`、worktreeはcleanである。
変更前のproduction familyをread-onlyで監査した結果は次のとおり。

| Role | Current path | Confirmed behavior | Entry classification |
| --- | --- | --- | --- |
| quality producer | `package.json`のshell chain | child commandを直列実行するがparent identity／manifestを作らない | Blocking: parent ownerなし |
| Vitest process owner | `scripts/test-runner.mjs`／`test-runner-lib.mjs` | exit、timeout、signal、JSON、stdout／stderr、runtime counterをchild manifest化 | Verified |
| Vitest warning classifier | `warningCount()` | stdout／stderrの文字列一致を数えるがwarning 1でもsuccess | Blocking: structured event／ratchetなし |
| Vitest console classifier | Vitest JSON＋capture | test単位のunexpected console／許可契約を持たない | Blocking: identity付きeventなし |
| Playwright process owner | `playwright test` direct | HTMLと`test-results`は作るがVitest manifest family外 | Blocking: child manifestなし |
| Playwright reporter | `playwright.config.ts` | HTML／GitHubだけでproject別resultをparentへ渡さない | Blocking: structured registrationなし |
| artifact verifier | Vitest runner | manifestへ既知file名を列挙するが、write後の存在／完全性を再検証しない | Blocking: artifact failureを分類不能 |
| CI recovery | `.github/workflows/ci.yml` | `!cancelled()`でuploadするが`.test-results/`欠落をignoreし、Playwrightを別upload | Blocking: missing／upload failure closureなし |
| Pages recovery | `.github/workflows/pages.yml` | quality後にdeployするがtest artifact uploadなし | Blocking: test開始後のfailure artifactを保存しない |

親子flowは次へ収束させる。他のownership案や別semantic familyへの波及は確認されなかった。

```text
pnpm quality
  -> quality parent runner (identity, repository/version snapshot, ordered children)
       -> non-test quality steps (exit/outcome)
       -> Vitest unit child runner -> JSON + structured events + logs + child manifest
       -> Vitest production child runner -> same + production audit artifacts
       -> Playwright child runner -> structured reporter result + HTML/trace/screenshot + child manifest
       -> verify every declared artifact
       -> atomically finalize parent manifest and compact summary
  -> CI/Pages upload the one parent run directory; upload failure remains a failed step/job
```

## State-by-path matrix and guardrail

| State | Vitest unit／production | Playwright | Parent／CI recovery | Target classification |
| --- | --- | --- | --- | --- |
| success, zero observations | structured pass counts、complete artifacts | project別pass、HTML | all child references valid | Verified |
| assertion failure | preserve child exit and JSON failures | preserve failed tests／errors | parent `test_failure`、upload still runs | Verified |
| timeout | terminate process group、typed timeout | same | parent nonzero、partial artifacts retained | Verified |
| signal／cancellation | preserve signal | preserve signal | parent nonzero; CI cancellation is not success | Verified |
| reporter failure／invalid result | `reporter_failure` | `reporter_failure` | parent nonzero、logs retained | Verified |
| warning／deprecation／unhandled error | identity付きstructured event | structured process／browser event | unallowed count > 0 is `contract_failure` | Verified |
| unexpected test／browser console | exact test identity＋complete message | exact test identity＋complete message | no broad allowlist; expired permission fails | Verified |
| skip／todo baseline increase | JSON counts | project別skipped count | any unexpected nonzero is `contract_failure` | Verified |
| retry／flaky | N/A: canonical Vitest retry 0 | project別retry count and outcome | retry is reported; unexpected retry fails | Verified |
| child artifact absent／empty／invalid | verify declared files | verify result／HTML and declared attachments | `artifact_failure` overrides child success | Verified |
| parent manifest write failure | child result may exist | child result may exist | runner nonzero; result indeterminate | Verified |
| CI upload source missing | same directory | same directory | `if-no-files-found:error` | Verified |
| CI upload action failure | child may pass | child may pass | upload step/job remains nonzero | Verified |
| TSK-08 domain typed reason | reporter may include opaque typed detail | reporter may include opaque typed detail | parent preserves, does not interpret | Deferred: TSK-08 |
| coverage／merge／userEvent／audit model | no change | no change | no change | N/A: explicit TSK-06.3 boundary |

Entry auditのBlockingはすべて同じparent／child manifest ownerとreporter boundaryで解消可能であり、
ownershipの複数案、要件改訂、別semantic familyへの波及はないため実装へ進む。完了時に各cellのfixture、
production run、artifact pathを追記し、Blocking 0を再確認する。

## Verification order

1. 変更前runner overhead 3 runとcanonical quality 3 runを同一環境で記録する。
2. runner／reporter／workflow negative fixturesを`pnpm test:runner`で固定する。
3. `pnpm test:diagnostic -- <filter>`で必要なfailureを診断し、`pnpm test:unit`、
   `pnpm test:production`へ拡大する。
4. parent manifestからPlaywright outcome／HTML／artifactへ到達するfocused E2Eを確認する。
5. 変更後runner overhead 3 run、canonical quality 3 runを同一環境で記録する。
6. phase completion gateは一回の`pnpm quality`だけを実行し、manifest completeness、inventory／parity／
   digest／runtime counter、staged diffを確認する。

## Implementation and closure evidence

`scripts/quality-runner.mjs`が一意なparent directoryを作り、従来の10 stepsを同じ順で実行する。
unit／productionは既存Vitest process ownerを共有し、Playwrightも同じcapture／exit／timeout／artifact verifierへ
接続した。各childはJSON reporter result、structured observation、Node warning JSONL、stdout、stderr、suite固有
artifactを持ち、parentはchild manifestに記録されたbytes／SHA-256を再検証してから自身の全fileを再登録する。

Vitest consoleはreporter event、Node warning／deprecationはpreload event、Playwright project resultはcustom
reporter、browser warning／error／pageerrorはauto fixtureから取得する。runnerはevent kindとidentityを保持するだけで、
FGO domain reasonを解釈しない。allowance schemaは`runner + testId + kind + 完全message + reason + expiresAt`
を必須とし、regex／prefix、期限切れ、warning allowanceを拒否する。現行5 recordsはVRT／downloadが意図的に
確認するAtlas image fallbackだけに限定し、25-test runで同じ完全一致event 86件を許可する。

`pnpm test:runner`は33／33で、Vitest／Playwrightのsuccess、assertion failure、timeout、signal、reporter
failure、warning／deprecation、console、skip／todo／retry、artifact欠落を固定した。parent child manifest欠落／
改竄、artifact precedence、atomic manifest write failureも同じsuiteで固定した。CI／Pagesは`always()`で一つの
`.test-results/` familyをuploadし、`if-no-files-found:error`かつ`continue-on-error`なしのため、source欠落または
upload action failureはjob成功にならない。

最終parentは`.test-results/2026-09-01T11-46-26-409Z-15-e3f859/manifest.json`。unit 70 files／377 tests、
production 24／112、Playwright 25／25、skip／todo／retry／warning／unexpected console 0、10 steps／3 children／
42 verified files、artifact error 0である。成功summaryは8行／241 bytes。VRT failureを意図的に観測した
`.test-results/2026-09-01T10-57-02-946Z-44-880cd9`は113 filesを登録し、Playwright childの78 filesに
HTML、actual／expected／diff screenshot、failure screenshot、error context、traceを保持した。

## Performance and product invariants

同一Node 26.3.1／pnpm 11.20.0、2 workers、retry 0、同masterで測定した。

| Measure | Run 1 | Run 2 | Run 3 | Median | Baseline delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| runner before | 1.85s | 1.29s | 1.19s | 1.29s | - |
| runner after | 1.85s | 1.82s | 1.78s | 1.82s | +0.53s |
| quality before | 246.79s | 243.04s | 243.30s | 243.30s | - |
| quality after | 261.69s | 264.44s | 263.57s | 263.57s | +20.27s／+8.33% |

runnerはabsolute 1秒overhead内、qualityは10%構造ratchet内である。quality差はstructured reporter、
全event保存、unit／production／Playwright child artifact検証とparent側42-file checksum再検証を追加した
説明済みコストであり、test集合、worker、retry、timeout、assertionを緩和していない。

production artifactはmaster `20260831.10`、schema 33、engine `29.0.0`、application digest
`cc14841f8852c50ca432176f61fad141ce8abde955082a5d9191ccc1c945cf86`、calculator 422、AttackProfile／
ranking 433、calculated 422、inputRequired／unsupported／invalid 0を保持する。data-pipeline digest
`e116e91fad16fb6348826f26b5e29fc4db5239e26b49c1c8cad50eb0dd5c2fc2`も不変。runtimeは両boundaryの
read／parse／compile 1／1／1、application candidate 6,376／3,957、damage request 6,913／1,599で不変である。
TSK-06.2の61 observation、25 E2E、VRT／a11y sourceの意味、snapshot、product source、masterに差分はない。

追加でlegacy TSK-00 aggregate auditorを実行したが、変更外の`quantityConditions` assumptionでproduction
artifact読込中に停止した。auditor script、master、product sourceは開始HEADから差分がなく、この失敗を
TSK-06.3由来ともpassとも扱わない。本Taskの必須inventory／digest／parityはcanonical production child
manifestと共有production audit artifactで確認した。legacy aggregate auditorの収束はDeferred: TSK-08。

Completion classificationはVerified 13、N/A 1、Deferred 1、Blocking 0である。
