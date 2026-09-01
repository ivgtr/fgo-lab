---
title: "TSK-06.3 test observability and artifact flow"
status: "Complete"
updated_at: "2026-09-02"
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

### Review reopen delta (`4ff56a3`)

前回reviewでは、個々のchild failure、built-in `page`、実在fileの列挙をそれぞれ中心経路の証拠として扱い、
同じownerに属するprocess／manifest composition、page生成経路、declared／physical artifact compositionへ
recurrence scopeを広げなかった。これは前回flow inventoryと反例matrixの不足である。

1. 発生機構 — 確認済み: parentはfailed stepがあってもchild `outcome`を返すため、非0／signalと`success`
   manifestの組合せを成功へ戻せる。fixtureはparent signalと一致したchild failureだけだった。
2. 実装時のズレ — 推論: child manifestの存在確認をprocess resultとの整合確認と同一視した。根拠は
   `classifyQualityOutcome()`がstep code／signalとchild `exit`をcompositionしないことにある。
3. 検出を逃れた理由 — 確認済み: `step nonzero + manifest success`、`step signal + manifest success`、
   `step zero + manifest failure`の3交差cellがなかった。
4. 再発範囲 — 推論: parent／child process、manifest outcome、manifest exitの全組合せ。parent reconciliationを
   唯一のownerにし、矛盾をtyped non-successへ固定する。

browser観測はbuilt-in `page`だけへlistenerを付け、console typeを3種へ限定していた。bare
`browser.newContext()`／`context.newPage()`がa11y／smokeに残り、popup／将来contextも同じ漏れを再発できる。
全contextを一つのobserver APIから生成し、default／manual／popupの全page、全application console method、
page error、typed request failureを同じevent schemaへ収束させる。generic resource console messageの許可は削除し、
resource URL／type／failure／exact countを許可identityに含める。

attachment観測はphysical directory listingだけをrequired集合としており、structured reportが宣言したpathを
producerとして使っていなかった。declared pathのmissing、run directory外、bytes／SHA mismatchをreport由来の
required集合として検証し、directory scanは追加fileの保存だけに限定する。

| Review state | Process／manifest path | Browser path | Attachment path | Reopen classification |
| --- | --- | --- | --- | --- |
| step nonzero／signal + manifest success | contradiction fails closed | N/A | N/A | Verified |
| step zero + manifest failure | contradiction fails closed | N/A | N/A | Verified |
| default page console | N/A | all console variants captured | N/A | Verified |
| manual context／page console | N/A | same observer API and event schema | N/A | Verified |
| popup／future page | N/A | context-level page observer | N/A | Verified |
| resource failure | N/A | URL／resourceType／failure／count exact | N/A | Verified |
| declared attachment missing／outside／changed | N/A | N/A | declaration drives required set | Verified |
| production／damage family | unchanged | unchanged | unchanged | N/A: no scoped reader／writer |

Correction classificationはVerified 20、N/A 2、Deferred 1、Blocking 0である。ownershipはparent
reconciliation、browser observer／test-server classifier、report-declared artifact verifierへ一意に収束し、
要件改訂や別semantic familyへの波及はない。

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
FGO domain reasonを解釈しない。allowance schemaは`runner + testId + kind + 完全message + detail + reason +
expiresAt`を必須とし、browser consoleでは`locationUrl`と`pageId`もidentityへ含める。regex／prefix、期限切れ、
warning allowanceを拒否する。test-owned page load／failure宣言から生成する82 exact recordsはReact 30 identityと
resource failure 52 identityだけで、Vite eventをallowanceへ含めない。

`pnpm test:runner`は49／49で、Vitest／Playwrightのsuccess、assertion failure、timeout、signal、reporter
failure、warning／deprecation、console、skip／todo／retry、artifact欠落を固定した。parent child manifest欠落／
改竄、artifact precedence、atomic manifest write failureも同じsuiteで固定した。CI／Pagesは`always()`で一つの
`.test-results/` familyをuploadし、`if-no-files-found:error`かつ`continue-on-error`なしのため、source欠落または
upload action failureはjob成功にならない。

最終parentは`.test-results/2026-09-01T15-55-17-653Z-15-2f687a/manifest.json`。unit 70 files／377 tests、
production 24／112、Playwright 25／25、skip／todo／retry／warning／unexpected console 0、10 steps／3 children／
42 verified files、artifact error 0である。Playwright raw 336 eventはallowance 126、typed resource correlation
88、test-server infrastructure 122へ完全分割され、分類後もraw JSONLとmanifestの双方に残る。VRT failureを意図的に観測した
`.test-results/2026-09-01T10-57-02-946Z-44-880cd9`は113 filesを登録し、Playwright childの78 filesに
HTML、actual／expected／diff screenshot、failure screenshot、error context、traceを保持した。

## Performance and product invariants

同一Node 26.3.1／pnpm 11.20.0、2 workers、retry 0、同masterで測定した。

| Measure | Run 1 | Run 2 | Run 3 | Median | Baseline delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| runner before | 1.85s | 1.29s | 1.19s | 1.29s | - |
| runner after | 2.43s | 2.50s | 2.41s | 2.43s | +1.14s |
| quality before | 246.79s | 243.04s | 243.30s | 243.30s | - |
| quality after | 284.47s | 285.66s | 272.48s | 284.47s | +41.17s／+16.92% |

runnerの旧集合には実browser fixtureがなく、現在はdefault／manual／popupを実Chromium processで検証するため、
同一実行集合に対するwrapper overhead比較ではない。post-commit Node test durationは1.816／1.870／1.816秒で、
実browser fixtureを含む構造変更のwall-clock増加は+1.14秒と説明できる。

post-commit quality中央値は開始時比+16.92%だが、同じ最終observer logicの直前3-run中央値は263.74秒
（+8.40%）だった。post-commit runのstep分解ではPlaywrightだけでなくlint、unit、productionも同時に遅く、
最終runは272.48秒まで戻った。test 25／25、worker 2、retry 0、raw event 336、candidate／damage request countは
全runで不変であり、継続したbrowser／quality実行による環境全体のwall-clock driftと分類する。structured reporter、
全event保存、unit／production／Playwright child artifact検証とparent側42-file checksum再検証の説明済みコスト以外に
実行集合、timeout、assertionを緩和していない。

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

このprior completion classification（Verified 13、N/A 1、Deferred 1、Blocking 0）はreviewで反証され、
現在のreopen classificationに置き換えられた。

## Review correction delta and final closure

reviewで追加された反証cellのうち、parent／child process resultとmanifest outcome／exitの矛盾はparent
reconciliationへ収束し、nonzero＋success、signal＋success、zero＋failureをnegative fixtureで`Verified`とした。
browser page ownerはdefault、manual context、popupを同じobserver APIへ収束し、全console type、pageerror、
request failureを取得するfixtureを追加した。resource consoleは`message.location().url`を常時保存し、全event収集後に
test identity＋URL＋countで相関するため、resource／consoleの到着順を入れ替えたfixtureも`Verified`である。

external attachmentはexpected PNGかつrepository内のcanonical `e2e/*.spec.ts-snapshots/` regular fileだけを
run-local pathへcopyする。source kind、repository-relative source、copy path、bytes、SHA-256をreportへ残し、任意外部file、
snapshot root外、missing、copy failure、destination collision、copy後改変をnegative fixtureで`Verified`とした。
build／preview移行は`N/A: build/preview migration changes the E2E execution family`とし、Vite dev-server、専用E2E
mode、fresh Playwright-owned processを維持する。base URLは一つのruntime contractからconfigとallowanceを導出する。

allowance generatorは観測から新規URLを承認せず、test-owned exact declarationと観測event／countの完全一致だけを
canonical artifactへ出力する。React診断、Atlas exact URL、E2E-025 manifest failureの宣言は一致する。Vite 8.2.2は
`server.hmr: false`でもCSS moduleから`/@vite/client`を読み込んだ。2026-09-01のfresh 4174 full runは25／25 test成功、
293 browser eventを記録し、generatorは未宣言のVite client event 79件（connecting 38、connected 37、offline時の
WebSocket関連error 4）を拒否した。Vite eventをallowanceへ戻す、consoleをobserverで抑制する、generated client文字列を
書き換える案はいずれもunexpected consoleを成功として見逃すため採用しない。

最終設計はVite client eliminationを要求しない。raw browser eventをresource console、`/@vite/client`由来の
test-server infrastructure、application consoleへ分類する。Vite debug lifecycleはexact source／message／page／countと
connecting→connected順序を検証し、E2E-023 offline failureはPlaywright WebSocket open／error／close eventと
test-owned exact countへ相関する。未知Vite warning／error、application sourceからの同名message、connected-only／重複、
別testのWebSocket failure、count不一致、runtime version／client path不一致はfail closedである。runtime contractは
base URL、server kind、Vite version、client／WebSocket path、HMR update無効を所有し、apps/webから解決される
`bin.vite` packageとversionをconfig、generator、runnerが照合する。

このclassificationは後続reviewの同数置換反例で一度再オープンされた。parent manifest `Verified`、browser
page／popup／resource observer `Verified`、attachment `Verified`、build／preview移行
`N/A: build/preview migration changes the E2E execution family`、legacy aggregate audit `Deferred: TSK-08`は
維持し、以下のfollow-upでtest-server infrastructure failure identityも`Verified`へ戻した。

## Infrastructure failure identity reopening

Confirmed mechanism: `serverCandidate()`はE2E-023のfailure scopeで`/@vite/client`由来の全errorをmessageに
関係なく一つの`consoleError`へ分類する。`webSocketFailureMatches()`は同じpageのexpected WebSocket error
件数だけを確認するため、期待WebSocket failureを残してconsole errorを未知messageへ同数置換してもownedになる。
実artifactでも4 console errorのうち2件はbrowser WebSocket notification、1件はVite connection failure、
1件はconsole forwardingの二次failureであり、異なるclassを一つのcounterへ縮約していた。

Implementation mismatch: raw artifactと`locationUrl`は保持できている一方、外部的に意味の異なるfailure classを
compose前に定義せず、typed WebSocket eventとconsole notificationを一対一・完全messageで照合していない。
またVite 8.2.2の`forwardConsole`未指定値は`determineAgent().isAgent`から決まるため、Codex環境と通常CIで
同一testのevent集合が変わり得る。

Missed detection: 前回reviewはtyped WebSocket相関とexact countを要求したが、同じcountを保った未知message置換と
既知class間置換をstate-by-path matrixへ含めなかった。追加するminimum guardrailは、typed WebSocket URL／error textから
導出したbrowser notificationとの一対一完全一致、test-owned exact Vite connection failure class、unknown／class substitution／
missing／extraのnegative fixture、runtime contractとE2E Vite config双方の`forwardConsole: false`一致である。

| State | Path | Required result | Status |
| --- | --- | --- | --- |
| typed WebSocket error＋対応するbrowser notification | E2E-023 offline | URL／error textから導出したmessageを一対一でownしraw双方を保持 | Verified: focused／full raw artifact |
| typed WebSocket error＋未知Vite errorの同数置換 | classifier counterexample | unknownを残しcontract failure | Verified: runner negative fixture |
| browser notificationとVite connection failureの既知class置換 | classifier counterexample | missing／extra classをcontract failure | Verified: runner negative fixture |
| expected class missing／extra | classifier counterexample | countではなくexact class identityでcontract failure | Verified: runner negative fixture |
| `forwardConsole`のagent／CI差 | E2E server startup | runtime contractとVite configでfalseを固定・検証 | Verified: resolved config＋raw artifact |

## Follow-up implementation and verification

`consoleError` counterとgeneric Vite error candidateを削除した。E2E-023は
`Error in connection establishment: net::ERR_INTERNET_DISCONNECTED`をtest-owned typed WebSocket failureとして
exact count 2で宣言する。受理した各raw WebSocket errorの完全URLとerror textからbrowser notification全文を構築し、
test identity、page URL／ID、`/@vite/client` location、type、messageの完全identityで一対一照合する。
Vite connection failureは`vite_connection_failure`という別classを宣言し、canonical runtime base URLからVite 8.2.2の
完全messageを構築する。raw console／WebSocket eventは分類後もmanifestから削除しない。

`forwardConsole: false`はruntime contractが所有し、`apps/web/vite.config.ts`のE2E modeがその値を直接消費する。
runtime validatorはtrue／missingを拒否し、fixtureはViteのresolved server configで`enabled: false`を確認する。
実E2E-023 artifactでは従来の二次`Failed to send error to Vite server`は0件になった。React diagnosticのoptimizer
locationはconfig変更後のstable exact pathへtest-owned declarationを更新し、full raw artifactとの完全一致だけから
82 allowance entries（expected count合計126）を再生成した。

Verificationはrunner 49／49、focused E2E-023 2／2、full E2E 25／25、unit 70 files／377 tests、production
24 files／112 tests。canonical quality 3-runは255.57／253.16／252.45秒（中央値253.16秒）で3／3成功し、
開始時中央値243.30秒比+4.05%で10% ratchet内である。各parentは10 steps、unit／production／Playwright
3 child success、42 artifactを持ち、全bytes／SHA一致、artifact error 0。warning、unexpected、skip、todo、retryは0。
Playwright raw 335件はallowance 126、resource correlation 88、test-server infrastructure 121へ完全分割された。
final parentは`.test-results/2026-09-01T16-42-05-999Z-15-538f7c/manifest.json`。

Production application digest `cc14841f8852c50ca432176f61fad141ce8abde955082a5d9191ccc1c945cf86`、
data-pipeline digest `e116e91fad16fb6348826f26b5e29fc4db5239e26b49c1c8cad50eb0dd5c2fc2`、
calculator 422／ranking 433、inputRequired／unsupported／invalid 0、read／parse／compile 1／1／1、candidate
6,376／3,957、damage request 6,913／1,599は3 runすべてで不変。production／damage semantic family、
TSK-06.2の61 observation、build／preview familyに変更はない。

Final classificationはparent manifest `Verified`、browser page／popup／resource observer `Verified`、test-server
infrastructure ownership `Verified`、attachment `Verified`、build／preview移行
`N/A: build/preview migration changes the E2E execution family`、legacy aggregate audit `Deferred: TSK-08`、
Blocking 0である。
