---
title: "TSK-06.2 E2E responsibility and execution closure"
status: "Complete"
updated_at: "2026-09-01"
---

# TSK-06.2 E2E responsibility and execution closure

## Outcome, invariants, and ownership

利用者経路、browser API、package間接続、responsive layout、VRT、a11yの故障検出を維持しながら、
damage semanticsをbrowser上で再検証する重複を削除し、canonical quality gateのE2E時間を短縮する。

- calculation-application／battle-executionはHP、variant、count、proc、condition、ordered operation、
  production damageのsemantic ownerである。
- Web component testはcanonical stateの表示、command dispatch、typed input error、selection、loading、
  filter、detail presentationを所有する。
- Playwright E2Eはbrowser API、service worker、IndexedDB、real worker／package connection、navigation、
  layout、VRT、a11yだけを所有する。
- calculator／ranking damage parity、production inventory、fail-closed classificationを縮小しない。
- production runtimeへtest-only branch、servant ID／name分岐、簡易damage式、fixture fallbackを追加しない。

Flow closure: N/A: production canonical state、damage execution、outcome classification、writer／recovery
pathを変更せず、test ownershipとtest execution pathだけを変更するため。

## Confirmed entry state

Read-only entry auditは`6d7608caf16fa8e677509ee5c0ae0ba3044ac700`、`main`で実施した。
開始worktreeにはユーザーのdocumentation変更5件と未追跡の本noteがあり、cleanではなかった。これらを
未関連変更として保持し、TSK-06.2対象fileだけを追記する。TSK-06.1はBlocking 0で完了し、TSK-07は
evidence-free cache／stale detailだけを残している。

現行Playwrightは4 files、明示的な`test()`定義48件である。viewport loopを展開した
`playwright test --list`は1 projectあたり50 cases、Chromium／mobile Chromium合計100 project casesを
列挙する。TSK-02 evidenceの96 project casesおよび2026-09-01の約601秒reportは、TSK-06.1で追加された
portable recovery pathsより前のhistorical observationであり、現行baselineとは扱わない。現在のruntimeは
次の同一条件3-runで再測定した。

| Run | Start UTC | Wall | Passed | Skipped | Failed／flaky／timeout | Artifact |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | `2026-09-01T06:21:39.261Z` | 682.239s | 66 | 34 | 0 | `.test-results/tsk-06-2/baseline-run-1/results.json` |
| 2 | `2026-09-01T06:33:12.794Z` | 687.976s | 66 | 34 | 0 | `.test-results/tsk-06-2/baseline-run-2/results.json` |
| 3 | `2026-09-01T06:44:53.931Z` | 671.540s | 66 | 34 | 0 | `.test-results/tsk-06-2/baseline-run-3/results.json` |

中央値は682.239s。Node 26.3.1、pnpm 11.20.0、Playwright 1.62.1、Chromium／mobile
Chromium、1 worker、retry 0、server reuse設定同一、master `20260831.10`である。明示定義48件、
viewport生成後50 cases／project、100 project cases、runtime skip 34件。source path上の
`completeSetup()`呼出しはfull runあたり68回、433-row完全計算requestは18回である。後二者にはbaseline
runtime counterがないため、sourceとcase pathからの静的値であり、runtime実測値とは主張しない。

`package.json`のcanonical `test:e2e`は`--workers=1`、`playwright.config.ts`は全specを両projectへ展開し、
test本体の`test.skip()`でproject ownershipを選ぶ。`ranking-baseline.spec.ts`の`openRanking()`は各caseで
setup後に433件の計算完了を待ち、density caseは3 viewportで同じ完全計算を繰り返す。

## Structural finding

- **Mechanism:** semantic caseを`smoke.spec.ts`へ追加し、各caseでmaster setup、画面遷移、production servant
  選択、damage assertionを繰り返す。
- **Implementation mismatch:** `test-strategy-redesign.md`はdamage parityの正本をapplication production testとし、
  E2Eを利用者経路とpackage接続の代表経路へ限定するが、HP、variant、count、proc、condition、個別damageを
  Playwrightでも再列挙している。
- **Missed detection:** TSK-02は4 files／96 project casesを維持し、6 workersのsession close／timeoutに対する
  安定化を1 worker固定で閉じたが、各caseのE2E固有failureとsemantic ownerを完了条件にしなかった。
- **Earlier review gap:** case集合維持を品質非退行として扱い、同じsemantic familyをunit／production／component／
  E2E間のownership matrixへ展開しなかった。
- **Recurrence scope:** calculator input／condition、NP variant、actor／enemy count、probabilistic outcome、ordered
  effect、hidden state、production servant damage、ranking loading／policy／filter／detail／density、portable recovery。
- **Minimum guardrail:** 全caseにstable ID、owner、E2E固有failure、project owner、replacement、statusを持たせ、
  metadata欠落をcontract testで拒否する。E2E固有failureを一行で説明できないcaseはcomponent／application／
  executionへ移す。

### Structural review reopening: assertion-level closure and fixture ownership

- **Mechanism:** 旧source caseを一行へ分類し、case内に混在する複数のoutcome／接続assertionを分解しなかった。
- **Implementation mismatch:** metadata contractがIDと非空fieldだけを検査し、旧assertionから正確なreplacement
  testへの対応、fixtureのcanonical型、保持したbrowser outcomeを検証しなかった。
- **Missed detection / earlier review gap:** case-level inventoryをassertion-level closureと誤認し、master recovery、
  profile／support persistence、backup／history、ranking handoffの複合caseをstate-by-pathへ展開しなかった。
- **Recurrence scope:** master recovery、profile／support persistence、backup／history、ranking detail→calculator
  handoff→notice→normal reset、fixture summary／detail identity、loading presentation。
- **Minimum guardrail:** 各旧key assertionへstable assertion ID、outcome class、exact replacement test name、statusを
  持たせ、retained browser assertionはsource marker、transferred assertionは実在test titleをcontractで照合する。
  fixtureはNode側でcanonical factoryと共有fingerprintを使い、`satisfies RankingWorkerResponse`を通す。fake Workerは
  VRTだけに限定しpackage接続証拠へ数えない。

Confirmed factは上記sourceとreview指摘である。再監査後は50 legacy cases＋setup 1件を`cases.json`、
61 old observationsのcanonical migration manifestを`assertions.json`へ分離した。caseとの関係はmanifestの
`caseId`から導出し、case catalogに並行するassertion ID listを持たせない。

### Structural review reopening: assertion-set completeness

- **Mechanism:** assertion rowを追加してもcase側に期待集合がなく、別意味のreplacementやcase内outcomeの脱落を
  「test title文字列が存在する」検査で受理できた。
- **Implementation mismatch:** E2E-A033はCú Chulainn固有のHP-linear効果をTonelicoへ対応付け、E2E-A041は
  simple procだけでCaesar chained count、Sugiya independent rolls、Duryodhana OC linkageを代表していた。
- **Missed detection / earlier review gap:** 最初のreopeningでもcompound recovery／persistence／handoffだけを
  hard-coded guardrailへ追加し、calculator semantic cases E2E-030〜043を同じoutcome分解へ展開しなかった。
- **Recurrence scope:** E2E-030 direct controls／reset／mode separation／trait decision／selection、E2E-031
  component error／application fail-closed、E2E-032 Dante／Summer Wu inventory、E2E-033 own HP-linear、
  E2E-036〜040 command／transaction／typed input／semantic result、E2E-041 simple／chained／independent／OC／
  accessible presentation、E2E-043 OR semantics／responsive presentation。
- **Minimum guardrail attempted:** 全caseに必須`assertionIds`を置き、そのflatten集合とassertion record集合、
  recordの`caseId` owner、重複なしを双方向完全一致で検査した。しかし同時編集可能な二つのID listは旧observation
  集合を所有せず、replacement title内のexpectationも検査しないため、次のreopeningで廃止した。

### Structural review reopening: canonical observation ownership

- **Mechanism:** case catalogとassertion catalogを同時に短縮でき、部分的な46-ID guardrailも残り15件の削除を
  拒否しない。test titleの存在だけでは、対応するexpectationが旧observationを検証する保証にならない。
- **Implementation mismatch:** `E2E-A024-PUBLISHED`を両catalogから削除してもcase非空条件を満たした。
  `E2E-A031-FAIL-CLOSED`はhelperの`missingDefinitions` testへ付けられ、applicationの`inputRequired`、空rows、
  repair後の`calculated`復帰を検証していなかった。
- **Missed detection / earlier review gap:** 「期待集合がない」問題を別の手編集ID listで閉じ、semantic observation
  自体を一つのcanonical ownerにしなかった。exact test titleをsemantic closureと見なした点も不十分だった。
- **Recurrence scope:** E2E-008〜050の全61 old observations。E2E-030〜043やcompound caseだけに限定しない。
- **Minimum guardrail:** `assertions.json`だけをcanonical migration manifestとし、semantic JSON digest
  `740171263247e95b95571cf5fbadf375e1174c782ca8dd24e674fe9169ee8039`と61件をrunnerでratchetする。
  全replacement test blockのexpectation付近にassertion ID markerを置く。case relationは`caseId`から導出し、
  observation削除と既存の誤testへの付替えをnegative fixtureでそれぞれ拒否する。

### Structural review reopening: alternate test declarations

- **Mechanism:** source sliceの次test境界を正規表現で推測すると、複数行`it.each([ ... ])`を認識せず、直前の
  通常`it()` blockへ後続parameterized testのmarkerを混入させる。
- **Implementation mismatch:** `E2E-A041-ACCESSIBLE-CHAINED`を直前のsingle-proc titleへ付け替えても、
  chained markerまで取り込んだblock sliceが受理した。
- **Missed detection / recurrence:** 前回のnegative fixtureは通常`it()`同士だけで、既に要求していた全61
  replacementのalternate declaration pathを検証していなかった。scope拡張ではなく実装漏れである。
- **Minimum guardrail:** TypeScript ASTから通常`it/test`、modifier、単一行／複数行`it.each/test.each`の
  call expressionをtest nodeとして抽出し、manifest titleをexact matchする。markerはそのAST node内部だけで、
  前後が`[A-Z0-9-]`ではない完全ID境界を要求する。multiline `it.each`越境の誤付替えnegative fixtureを固定する。

### Setup storage-state spike

IndexedDB込み`storageState({ indexedDB: true })`は成功したが、生成JSONは268,097,500 bytes（`du`表示
256MiB）、setup単体31.9s、setup＋focused 3件は約1.9分であった。各context importが30秒timeoutを発生させ、
`.test-results/` artifactも肥大化するため不採用とし、production hookを追加せず従来のfresh test-side setupへ
戻した。setup projectは初回browser／IndexedDB接続証拠だけを所有する。

変更後artifactは3-run JSONを含め719,428 bytes（`du` 776KiB）で、prepared stateを含まない。通常caseも
`openTestHome()`からcanonical setupを行い、setup projectは初回接続自体を独立検証するだけでpage／IndexedDBを
共有しない。

## Scope inventory

| Family | Current owner mismatch | Target owner / E2E-specific failure | Entry classification |
| --- | --- | --- | --- |
| HP／Tonelico／HP threshold | browserがdamage semanticsを再assert | application golden／execution; E2Eなし | Verified |
| NP variant／exclusive sibling | browserがvariant semanticsを再assert | application／execution; componentはcommandだけ | Verified |
| actor／enemy count／proc／OR／hidden state | browserがcondition／outcomeを再assert | application／execution; componentはtyped inputだけ | Verified |
| production servant damage | browserが個別最終値を再assert | shared production inventory／golden | Verified |
| input／selection／loading／filter／detail | full app setupでpresentationを確認 | React integration; command／render failure | Verified |
| setup／offline／share／persistence／recovery | browser storage／API接続を確認 | representative E2Eをoutcome class別に保持 | Verified |
| ranking worker connection | 全caseで433件完全計算 | real worker代表1 E2E; package connection failure | Verified |
| ranking VRT／density | 完全計算後にlayoutだけを確認 | schema-valid test-side response＋browser layout | Verified |
| desktop／mobile ownership | 全fileを両projectへ展開後skip | config／metadataで単一project owner | Verified |
| a11y | mobile caseも両projectへ展開 | startup、desktop、representative mobileを一度ずつ | Verified |

各行はcase catalog、canonical migration manifest、実行結果へ展開済みで、AST node ownershipと完全ID境界を
含めBlockingは0件である。

## State-by-path counterexample matrix

| State / path | Component／application evidence | Required browser evidence | Planned classification |
| --- | --- | --- | --- |
| calculated normal calculator | canonical command＋damage parity | setup→calculator代表経路 | Verified |
| repairable required input | typed input error、no numeric fallback | N/A: browser APIを使わない | N/A: component owner |
| invalid／unsupported portable recovery | transactional application result＋UI recovery | IndexedDB restore／focus／retry代表経路 | Verified |
| offline reopen | repository state | service worker＋browser offline接続 | Verified |
| share round-trip | schema／adapter parse | clipboard／downloadの代表経路 | Verified |
| ranking summary | production 433 parity | real module workerの代表1経路 | Verified |
| ranking loading／filter／detail | component／hook command and presentation | N/A: fixture-backed VRT以外 | Verified |
| stale summary／detail | worker／React request identity | N/A: TSK-07 cache owner | Deferred: TSK-07 |
| desktop／390／320 layout | canonical presentation fixture | overflow／density／snapshot | Verified |
| keyboard／accessible name | component accessibility | representative desktop／mobile axe | Verified |

## Execution plan

1. TSK-06.1 completion HEADから1 worker、retryなしのfull E2Eを同一環境で3回測定する。
2. 明示的定義、loop-generated case、project expansion、runtime skipを分離したcase inventoryを作る。
3. 既存のapplication／execution／component testへ各semantic assertionを対応付け、不足fixtureだけを先に追加する。
4. E2E固有failureを持たないcaseを削除または代表journeyへ統合する。
5. test metadataへ`journey | vrt | a11y`、`desktop | mobile`、owner、failure、replacementを記録し、
   Playwright configとcontract testでproject ownershipを強制する。
6. real ranking workerは1経路に限定する。presentation／VRTはcanonical protocolでparse済みのtest-side responseを
   worker境界へ注入し、fixture経路をpackage connection evidenceに数えない。
7. Playwright setup projectとIndexedDBを含むstorage stateをfocused spikeで検証する。成立しない場合は
   production APIを増やさずtest-side seed fixtureを使う。migration／offline／initial setupはfresh contextを保つ。
8. focused test、unit、production、project別E2E、VRT目視、a11y、変更後full E2E 3回、`pnpm quality`の順で閉じる。
9. 最後に1／2／4 workersをretryなし各3回測定し、全run成功と実益を満たす最小値を選ぶ。

## Measurement and acceptance

各runはcommit、worktree、Node／pnpm／Playwright、master version、worker、retry、server reuse、開始終了時刻、
file／case／project duration、passed／failed／skipped、setup完了回数、433件ranking完了回数、artifact pathを持つ。

- primary comparisonは変更前後各3回のwall-clock中央値である。
- 変更後中央値は変更前より30%以上短縮する。約半分は目標であり、baseline再測定前に保証値としない。
- project-specific runtime skipは0件とする。
- full E2Eのreal 433-row ranking calculationは1回とする。
- worker候補は3回すべてfailure、timeout、session close 0件でなければ採用しない。
- production inventory、calculator／ranking parity、damage digest、fail-closed classificationの意図しない差分は0件とする。
- VRT更新はviewport、canonical fixture、差分理由を記録して目視確認する。

## Implementation and verification

- Current structure: 23 explicit `test()` definitionsから25 generated tests。setup 1、desktop 15、mobile 9、
  project-specific skip 0。台帳はlegacy 50 casesをretained 24、transferred 22、merged 4へ分類し、独立setup
  1件を加えた。各full runのsetup code pathは29回、fixture ranking calculationは6回、real 433-row
  calculationはE2E-050の1回である。後二者はsource path／test identityによる静的counterである。
- Fixture contract: Node側でsmall masterをruntime parseし、`createStaticAttackProfiles()`、canonical NP variant、
  shared `rankingConditionsFingerprint()`から`RankingWorkerResponse`を構築する。fake Workerは6つのVRT
  calculationだけに使い、loadingは`Ranking.integration.test.tsx`がtyped Worker responseで検証する。
- Assertion closure: 61 assertionsはold observation、outcome class、exact replacement file／test titleを持つ
  唯一のcanonical migration manifestである。全manifest digestと件数をratchetし、全replacementのTypeScript
  AST test node内に完全境界のassertion ID markerを必須とする。case relationはmanifestの`caseId`から導出する。
  observation削除、通常`it`誤付替え、multiline `it.each`越境の誤付替えをnegative runner fixtureで拒否する。

| Case | Required outcomes | Exact owners |
| --- | --- | --- |
| E2E-030 | direct controls／reset、direct-resolved分離、trait decision、selection／command | `Calculator.direct-inputs`、`scenario`、`AppliedEffects.integration` |
| E2E-031 | component error、missing→inputRequired／空rows→repair→calculated | `EffectInlineInput`、`scenario` |
| E2E-032 | Dante、Summer Wu、ordered production execution | `productionMasterInventory`、`productionExecutionParity` |
| E2E-033 | Cú Chulainn own HP-linear | `canonicalInputs`のproduction fixture |
| E2E-036〜040 | variant command／transaction／identity、exclusive fail-closed、typed count／semantic result | `AppliedEffects`、`variantSelection`、`attackProfile`、`effectDecision`、`scenario`、`canonicalActorCount`、`canonicalInputs` |
| E2E-041 | simple、Caesar chained、Sugiya independent、Duryodhana OC、single／chained a11y | `procEffectsGolden`、`AppliedEffects.accessibility` |
| E2E-043 | `any`／unknown composition、responsive presentation | `condition.property`、E2E-007 marker |
- Quick controls: absolute presetとincrement actionをtyped unionへ分離し、actionへ`aria-pressed`を付与しない。
  Fou 3000でdisabledな`+1,000`がpressedになる状態をcomponent testで拒否する。
- VRT: desktop 3＋mobile 7の10 PNG。新規mobile 320／390 calculator、selected effect、ranking page／row／
  fallbackを目視し、overflow、fixed navigation、selected state、fallbackを確認した。旧project suffix 8 PNGは
  削除した。`@vrt`はsetup込み9/9成功し、density上限は緩和していない。
- a11y: startup desktop、major desktop screens、mobile home／calculatorがsetup込み4/4成功した。
- Component／application: E2E-A031 focused application file 27/27、unit 70 files／377 tests、runner 22/22が成功した。
- Production: 24 files／112 tests。master `20260831.10`、application 4,735 records、servants 422、
  AttackProfile／ranking 433、calculator 422、invalid／unsupported／inputRequired 0。digest
  `cc14841f8852c50ca432176f61fad141ce8abde955082a5d9191ccc1c945cf86`、runtime counter
  read／parse／compile 1／1／1、candidate 6,376／3,957、damage request 6,913／1,599は不変である。

### Full-run comparison

| Phase | Run 1 | Run 2 | Run 3 | Median | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Before, workers 1 | 682.239s | 687.976s | 671.540s | 682.239s | 66 pass／34 skip × 3 |
| After, workers 1 | 238.626s | 233.832s | 236.442s | 236.442s | 25 pass／0 skip × 3 |

中央値の差は445.797秒で、65.3%短縮し、30% Done gateを満たした。measurement JSONは
`.test-results/tsk-06-2/{baseline,post}-run-{1,2,3}/results.json`にある。

### Worker reassessment

| Workers | Run 1 | Run 2 | Run 3 | Median | Decision |
| ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 238.626s | 233.832s | 236.442s | 236.442s | stable、比較baseline |
| 2 | 147.025s | 147.457s | 172.376s | 147.457s | 3/3成功、採用 |
| 4 | 156.741s | 154.594s | 154.702s | N/A | 3/3で21 pass／4 timeout、棄却 |

workers 4ではcalculator／ranking density、offline、master recoveryが同じ4 failureとして再現した。
workers 2はworkers 1より中央値37.6%短く全run成功したため、`playwright.config.ts`のcanonical
`workers`を2へ固定した。`package.json`は`playwright test`だけを呼び、測定時だけCLI overrideを使う。

Final `pnpm quality`はformat、lint、typecheck、runner 22、docs、unit 70／377、production 24／112、
master validation、build、E2E 25／25（2.6分、skip 0）まで成功した。unit artifactは
`.test-results/2026-09-01T09-55-11-222Z-327-ecf43a`、production artifactは
`.test-results/2026-09-01T09-55-21-308Z-914-cc2c95`である。repository-wideなadaptive測定契約は
TSK-06.2から分離し、test strategy v1.2.0とTSK-07〜09の既存3-run matrixへ戻した。

## Closure

Closure: Blocking 0, Deferred 1

- Verified: fixture contract、assertion-level closure、prepared state cost、project ownership、VRT、a11y、
  production parity／inventory、before／after 3-run、worker reassessment、quality。
- N/A: production flow closure。canonical state、damage execution、outcome、writer／recovery implementationは変更なし。
- Deferred: evidence-free cache value／lifetime／cardinalityとstale detail rejectionはTSK-07。

TSK-06.2は完了した。後続test strategy reviewでexecution observabilityをTSK-06.3へ分離したため、
現在はTSK-06.3が`ready`、TSK-07はTSK-06.3完了待ち、TSK-08はTSK-07完了待ちである。
