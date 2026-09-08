---
title: "TSK-06 ranking policy and finite candidate flow closure"
status: "Active"
updated_at: "2026-09-08"
---

# TSK-06 ranking policy and finite candidate flow closure

## TSK-06.48 — initial OC and own OC boost closure (2026-09-08)

Current sequence: **06.43 done → 06.48 done → 06.45 ready → 06.44 → 06.5 → 07**.
Requirements v0.10.2 §4／9 own the approved product contract. This section owns the additional
flow inventory and counterexamples; it supersedes the next-task statement in the historical
06.43 approval below. Current implementation and verification are recorded in the 2026-09-08 section; earlier checkpoints below remain historical evidence.

### 独立再レビュー承認・commit handoff（2026-09-08）

独立再レビューの判定は **Approved**。PIR-001／002はreviewerがResolvedと判定し、
scoped Blocking 0、追加の採用指摘なし。以下の実装中記録は履歴として保持する。
レビュー正本: `/tmp/fgo-lab-review-tsk-06-48-20260908/review.md` のCurrent verdict。
レビュー対象はHEAD `5faf7ec`＋TSK-06.48全152ファイルのworktreeで、commit準備時に全SHA256一致を確認。
最終qualityは `.test-results/2026-09-08T04-05-59-492Z-15-5a229b` で成功
（unit637／production119／Playwright26、247.59秒、skip／todo／retry／warning／unexpected console 0）。
全80条件matrixと独立性能の再測定はせず、変更のない既存証拠を照合した。
06.48をdone、06.45をreadyへ戻す。解除耐性の明示unsupportedと06.45の既存残存範囲は変更しない。

### PIR-001／002 implementation delta（2026-09-08）

レビュー判定はChanges required。以下は実装者の現在地であり、指摘のresolution／approvalは独立再レビューが所有する。
PIR-001: `rankingBasis.applyRankingSelectionCommand`が容量でclampし、`initialOc.changeResolvedNpLevel`の
OC1補正と分岐していた。前回はcalculatorのNP×OC表のみを修正し、両commandとowned→specifiedを
同じ反例で比較していなかった。補正のownerをinitialOcへ統一し、UI→URL／workerまでを対象にする。
PIR-002: `CalculatorRoute.regenerateHistory`がrequestだけを更新し、`portableDraft`→
`finalizeHistory`のsession集約writerへ旧sessionを渡していた。前回のmigration／replay検証は
再生成→draft→共有／離脱確定のwriteを含んでいなかった。通常履歴copyと再生成の新session開始を
portableDraftで共有する。reset／scenario編集は同じsessionを維持する別commandである。

| Changed path / counterexample | Current status |
| --- | --- |
| calculator／ranking指定NP変更・owned→specified：NP5/OC3→NP2/3/4はOC1、合法OCは保持 | Verified: initialOc command parity fixture |
| UI再表示→URL／worker、population→all／reset、直接不正requestと保有混在 | Verified: UI／URL／worker fixtures、既存rankingBasis／schema tests |
| current／historicalOnly履歴選択×未確定／共有確定済みsession×共有／離脱finalizer | Verified: CalculatorRoute.history integration matrix |
| 再生成不可／保存失敗→既存draft・workspace・session保持、旧履歴不変 | Verified: missing subject／missing level route、portableDraft保存失敗fixture |
| 全80条件matrix／独立compile性能再測定 | N/A: command補正とsession identityのみ。既存証拠を保持しquality内production digest／parityで確認 |

実装者検証: 修正前にPIR-001のOC2とPIR-002のsession再利用を追加fixtureで再現した。
修正後focused25／unit637成功。`initialOcAfterNpLevelChange`が補正を共有し、
`startPortableDraft`が保存成功後だけworkspace／sessionを公開する。通常履歴のsource=historyと
同一fingerprintの連続履歴集約は既存どおり。Appの通常navigation／rankingHandoffは既に新sessionを
発行する別producerで、今回の修正は不要（既存handoff／startup testsをqualityで確認）。
最終`pnpm quality`成功: `.test-results/2026-09-08T03-58-37-257Z-15-d266cd`。
unit637／production119／Playwright26、warning・unexpected console・retry 0。
unit再確認は `.test-results/2026-09-08T03-56-54-889Z-15-997719`（637 tests）。
履歴test harnessはrender途中でなくcommit後のstateを観測し、登録finalizerの更新を待つ。
既存production digest／raw／master／80条件と性能証拠は変更なし。
実装者statusは`ready-for-re-review`。resolution／approvalは独立`$post-implementation-review`が所有し、
Taskはin_progress、06.45はblockedに維持する。

### 実装引継ぎの再評価（2026-09-08）

今回の完了依頼で過去の保留を解除。専用OC IR、executorのinstance／NP-use receipt、初期OC intentは
利用者の比較・再現目的に一致するため維持する。新しいHP実行モデルや探索軸は追加しない。
準備の不確定writeは実際のreaderとの交差で判定し、通常projectionはcommit済み成否を再解釈しない。
全経路parity、production差分・性能と最終qualityを確認し、06.48を完了した。

追加確認: portableの固定basis validatorが成立込みHP witnessまでHP100%へ限定していた。
過去の監査は一例の基点再現に留まり、同じquantity producerが書くBattle Pointを含む
通常／成立込み×calculator／portableの契約を閉じていなかった。通常policyでは固定値を検証し、
成立込みではschema検証済みのquantityを共通executorへ渡す。選択candidateの最大性をportableで
再探索する要件はなく、保存したcanonical入力とpolicyの再実行が責務である。
NP5・初期OC3→NP2変更でresolved calculatorがOC2へclampする差も確認した。
§9.1の明示command補正はOC1なので、利用可能な値の維持／容量不足時OC1をapplicationで統一する。
反例と全80条件production matrixで確認した。

実経路の追加検証: OC sourceのskillNameに内部IDを渡していたため、sourceを解決する既存commandから
表示名を必須で渡す。receiptとWeb共通presentationの責務を変えず、生成時の根拠を修正した。
性能監査ではcommand内の同一stateに対するcondition factsを共有し、pure damage sourceの不要な
preparation input解決、単一OC cellの不要なoperation重複排除を削除した。
状態変更時はfactsを再構築し、policy変更・入力修正では元requestから再prepareする契約を維持する。
各変更前後でproduction digest／小domain oracleを照合した。表示名修正だけはreceiptを含む
semantic keyを変えるためdigestが変わり、damage input／outcome差はない。

### Canonical checkpoint（2026-09-08 02:55 UTC、開始から約60分）

- 現在の結果: 初期OC intent／自前OC shared executionとUI cutoverを接続済み。全qualityは一度成功。
  80条件監査は53条件・21,363 selected resultsまで完了し、calculator／portable再現差分0。
- 変更family: OC grant／rate／lifecycle／NP-use receiptと直接のapplication・保存・UI経路。
  残存trigger／dependent resourceは06.45に維持し、新しいsemantic familyへ着手しない。
- 検証済み証拠: 下記IR／EXEC／APP／IDENTITY/UI、production119、unit621、Playwright26。
  default calculator420/422、ranking393/433、raw4 digest不変。性能増加はshared preparationと
  OC-dependent candidate増加をCPU profileで分解済み。最新3回計測をmatrix後に確定する。
- 次のaction: 実行中の `.test-results/tsk-06-48-a5/completed-matrix` を80条件まで完了し、
  canonical input差分・性能を既存正本に反映、最終qualityで完了判定する。
  実行HEADは`5faf7ecdbffcbe0c90d98e8a39f1e5b7ef4ef28d`、挙動比較baselineは`c555e4f`。
  間の2 commitsはagent運用文書。ユーザーの未commit差分を保持し、stage／commitなし。

### 検証証拠とclosure（2026-09-08）

状態別matrixの`Verified`は以下の証拠群を参照する。productionに存在しない組合せは
schema-legal fixtureで閉じ、全profileの数値化とは区別する。

- **IR**: `packages/data-pipeline/src/ocSemantics.test.ts`、`productionAudit.test.ts`、
  `packages/calculation-application/src/productionMasterInventory.test.ts`。raw OC167 occurrences／632 cells、
  公開boost97・rate grant29・remove75・nonintersection131・resistance60を共有inventoryで確認。
  rate grant868 cells／resistance514 cellsのうちCE LB継承3 cellsをrawとの対応に含める。
  lifecycle199＋既存context writer7、HP依存rate1 effect／25 cellsを全体分類に保持する。
- **EXEC**: `packages/battle-execution/src/ocState.test.ts`、`ocSourceProgram.test.ts`、
  `preparationTransaction.test.ts`。NP-useでのcell固定、capでも全参加count消費、constant lifetime、
  HP→rate query、条件・recipient・selector、同一command rollbackと次のcommandへの汚染防止を検証。
- **APP**: `packages/calculation-application/src/ocExecutionParity.test.ts`、`ocCandidateOracle.test.ts`、
  `initialOc.test.ts`、`rankingBasis.test.ts`。policy再適用・input修正・portable replayを同じ入口へ戻し、
  不正capacity拒否、明示commandのOC1補正、混在保有、OC-dependent quantityの有限oracleを検証。
  HP／Battle Point witnessは成立込みで再現し、通常basisへ偽装したrequestは拒否する。
- **IDENTITY/UI**: schema／portable／migration／workerの既存suiteとPlaywright E2E-051。
  resolved初期OC1〜3とmanual最終OC1〜5、初期／発動時OC表示、desktop／390px／320px、keyboard、
  NP／population command、reset、old-only／canonical-only／mixed payload、stale worker拒否を検証。
- **PRODUCTION**: `packages/calculation-application/scripts/audit-oc-matrix.ts`を一回のmaster parseで実行。
  自然上限／Lv90×四policy×NP1〜5×合法初期OCの80条件で、選択された全calculated結果について
  calculator／portableのcomplete input・damage result・applied actions（NP-use receiptを含む）を比較する。
  profile全体のunsupportedにはportable candidateが存在しないため、outcome理由を全数記録し、
  recovery／invalid／inputRequiredの経路は上記EXEC／APPの反例で検証する。
  80/80条件、32,640 selected results、input／result／receipt parity差分0で完了。

最初の全`pnpm quality`は `.test-results/2026-09-08T02-20-57-156Z-15-e38f5e` で成功。
unit621／production119／Playwright26、warning・unexpected console・retry 0。
最終matrix・性能証拠と不要引数の整理を含む最新差分も、
`.test-results/2026-09-08T03-10-01-607Z-15-c1fff1` の最終`pnpm quality`で成功（234.64秒）。
unit621／production119／Playwright26、skip・todo・retry・warning・unexpected console 0、
artifact integrity errors 0。06.48の全scoped pathはVerifiedまたは理由付きN/A、Blocking／Task内Deferred 0。
残存production unsupportedの数値化は06.45の既存受入条件であり、本Taskの延期へ読み替えない。

### Production差分と06.45へのbaseline（2026-09-08）

[機械可読の差分証拠](oc-execution-diff-tsk-06-48.json)にraw／master digest、canonical before/after
inputとrule、NP5独立選択差分、全80条件summaryと非数値outcomeの全profile・理由を保持する。
全34,640 profile outcomesはcalculated32,640／unsupported1,960／unavailableUnderPolicy40、
invalid／inputRequired 0。後者40件は自バフ除外時のtransform後NP不足であり、到達性の結果を維持する。

master `20260906.03`、master schema45／portable schema38／engine33。
master SHA-256は`65add07d7b3c81927fd147e632ceea0c22ed0f7cb7f95079db4c6fc750ed6098`。
raw4件はA0と同一。default（自然上限・自バフ込み・通常・NP1・初期OC1）は
calculator420/422 calculated、ranking393/433 calculatedで件数不変。
canonical NP identityのcutoverを対応付けた433 profilesで、calculatorの完成input差28件
（OC関連27、negative target state1）、rankingの完成input差17件を確認した。
入力差にはeffective OCのみ変わりdamageが変わらない場合も含む。
2301100のexclusive-state根拠によるattack buff差と、OC／NP buff差を別ruleで保持する。

自然上限・自バフ込み・初期OC1で、独立最適化NP5とNP1採用scenarioのNP5列は
通常7件／成立込み6件で異なる。これは同じNP5値であっても採用program／effective OC／完成inputが
異なるためであり、列cacheで代用しない。旧NP5 baselineは開始gaugeの暗黙探索を含むので、
新しい初期OC1／2／3と比較するときは条件変更と意味論変更を分ける。

06.45は未着手。通常NP1の40 unsupportedは`unsupportedActionAdmission`、calculatorの2件は
既存HP／Battle Point境界。成立込みNP1では40 admission＋8 finite-domain上限＋4 executionで
52 unsupported（381 calculated）。finite-domainの未知最大を4096で打切って数値化しない。
NP5・初期OC1では追加actionが到達可能になるため、通常は3 ambiguous condition＋1 HP＋1
attack-NP unavailable、成立込みは5 ambiguous conditionが追加される。
これらの5 profilesは401300／500400／702500／2300600／2800600で、IDは証拠索引だけに使用する。
NP5・初期OC3ではこの追加5件は消える。OCの未解釈fallbackではなく、既存execution制約が
実行可能なactionに現れた結果であり、全attack closureを受入条件とする06.45へ現在値を渡す。
同Taskの着手時は、このpolicy／NP／初期OC付きbaselineとproducer／reader／recoveryを照合する。

### 性能の確定（2026-09-08）

同じdefault shared audit commandを、`c555e4f` archiveと現行worktreeで各3回、他のsuite／matrixと
重ねず測定した。archive内のworkspace importを維持し、dependency installは行わない。

| 測定対象 | before | after | 判断 |
| --- | --- | --- | --- |
| shared compile中央値 | 5,545.516 ms | 6,924.666 ms | +24.87%。OC全cellsのdependency解析、準備condition／instance／receiptの新実行と候補増を含む |
| 同3回のcompile | 5,383.706／5,545.516／5,593.532 ms | 6,565.907／6,924.666／7,404.706 ms | 全回同一default digest・counters、測定対象を変更しない |
| affected production suite | A0 37.94 s | 初回full quality 39.731 s／最終31.163 s | 同suiteのgate時間を併記。hot-pathは上の独立3回計測で判定 |
| default candidate／damage request／distinct input | 1,936／1,924／1,298 | 2,153／2,096／1,329 | OCの間接寄与による追加候補。requests +8.94%、distinct +2.39% |
| preparation generated／deduplicated | 6,360／3,949 | 6,364／3,958 | ordered準備の母集団増は限定的 |

CPU sample比較はshared compile 4,745.773→6,382.127 msの測定で、追加costが
preparation facts／OC receiptとOC全cell dependency解析に現れることを確認した。
これは最終3回計測とは別の診断であり、sample時間をwall timeへ厳密加算しない。
同一command内facts共有、pure damage sourceの不要準備入力解決削除、単一OC cellの重複排除省略により
正しい実行を保ったまま追加costを縮小した。初期gauge探索軸を復活させるcache／shortcutは導入しない。

candidate上限4096、実行可能な最大space3840、static programs7,255／profile最大60、
preparation actions最大4／states最大56は不変。8 finite-domain unsupportedを隠すための上限緩和もない。
測定可能なhot-path増は残るが、上記の追加実行とwork countersに対応しており、一般battle simulatorや
別の最適化Taskへ範囲を広げない。raw／master／caseを変えて性能改善と見せる比較は行っていない。
全80条件の時間は機械証拠へ保持し、旧40条件の暗黙gauge探索の合計時間とは直接比較しない。

### Step 2 A0 baseline and execution stop (2026-09-06)

更新Step 1は利用者承認済み。開始HEADは`c555e4ff9a208f8da01e56130fbd49e63848e192`、
raw4件と公開masterのSHA-256は下記Step 1基点と全件一致。worktreeは計画文書6件だけが変更済みで、
その変更を保持した。承認済みのresolved初期OC1〜3／manual最終OC1〜5をrequirements §9.1とUI spec §9へ明記した。
本節の追加Blockingは、下記に履歴として保持するStep 1の「未決定0」という判定を更新する。

A0で計測済み:

- `pnpm test:diagnostic -- packages/calculation-application/src/productionAudit.test.ts`を3回実行。
  test時間7.528／7.524／7.623秒（中央値7.528秒）、shared compile時間5.520／5.641／5.619秒（中央値5.619秒）。
  runner全体時間10.00／10.07／10.02秒。これはcalculator＋default rankingの共有auditであり、
  ranking単独時間や全四policy／全NP条件の計測とは呼ばない。
- 3回ともaudit digest `8b487c1c5d5fae1a4be95652f846cb89226322cece373006db72a5f0b1091816`。
  generated preparation states6,360／deduplicated3,949、damage requests1,924／distinct inputs1,298。
  calculator422件中420 calculated／2 unsupported、ranking433 profiles中393 calculated／40 unsupported。
  master read／parse／compile各1回。既存default policy・NP1・開始100%の変更前baselineである。
- artifacts: `.test-results/2026-09-05T20-59-22-969Z-15-873d29`、
  `.test-results/2026-09-05T21-00-03-768Z-15-0b67c3`、
  `.test-results/2026-09-05T21-00-50-634Z-15-211251`。
  各`production-audit-calculation-application.json`にcanonical damage inputs／outcomes／countersを保持。
- `pnpm test:production`: 24 files／119 tests成功、37.94秒、warnings0。
  artifact `.test-results/2026-09-05T21-01-35-778Z-15-38e0ab`。
- 再現可能なraw／published inventory command:
  `node packages/data-pipeline/scripts/audit-oc-planning-baseline.mjs`。
  artifact `.test-results/tsk-06-48-a0/oc-inventory.json`はHEAD／worktree／入力digest／各source path／
  raw selector metadata／通常・LB cellsを保持する。raw OC167件／632 cells、公開OC97件、
  lifecycle writer199件、positive application rate modifier29件は計画と一致。

**OC-RATE-HP-001 — rate prerequisiteのHP依存reader（停止時点の記録／計画補足で解消）**

以下のBlocking表記は停止時点の履歴。利用者確認後のcontinuation contractが現在の分類を上書きする。
製品仕様の再承認事項ではなく、既存HP依存判定をrate利用時へ接続する実装項目として継続する。

1. 発生機構［確認済み］: 29 rate effectsのうち公開1 effect／25 cellsが`Value=0, RatioHPLow=400`を持つ。
   occurrenceは`servants[10].noblePhantasmVariantGroups[1].variants[0].effects[0]`、
   actor101300／NP101302／effect946:0、`timing=beforeDamage`。
   同じfuncId946の別skill occurrenceは公開cellsが固定200であり、funcIdだけのraw joinではこの差を判定できない。
   上記auditは公開occurrenceのcellsからHP依存1件を数え、rawの同ID別variantを混入しない。
2. 実装とのズレ［確認済み・推論を分離］:
   `data-pipeline/src/effectNormalization.ts:normalizeModifierValueExpressions`はこの形を既存の
   `inverseHpLinear`へ変換できる。しかし`executionSemantics.ts:normalizeExecutionSemantics`の
   rate effectは`stateMutation`へ落ちるため、公開executionに量expressionは残っていない［確認済み］。
   `battle-execution/src/resourceSemantics.ts:operationReadsResource`はcondition、NP special dependency、
   addModifier expressionだけを読む。`closeResourceMutationSemantics`は後続readerがなければ
   HP writerを`noDamageReader`へ変える。準備側`preparationContracts.ts`はHPをcontext値として持つが
   mutable resource stateはNPだけである［確認済み］。
   rateを準備側へ移して固定adjustmentへ焼くと、HP→rate→OCの読取時点とsuffix proofが欠落する［推論］。
3. 検出漏れ［確認済み］: 更新Step 1は29件のselector／clamp前Rate／付与・解除を閉じたが、
   rateの**量expression**別inventoryとHP writer→rate query→OC grantの反例がなかった。
   A0への延期事項として元から残していたものではなく、今回のoccurrence別artifact化で確認した追加境界である。
4. 再発範囲／最小guardrail［推論］: rate prerequisiteのfixed／inverseHpLinear／hpRangeLinearと、
   own／external source、grant時／query時、HP writerの前後、rollback／retry。
   pipelineは既存typed expressionをlosslessに保持し、source programのresource-read proofはrate queryも対象にする必要がある。
   full HP simulatorを追加する根拠にはしない。liveで未表現のHP writerをtyped unsupportedへ閉じる境界と、
   HPが不変の場合のrate evaluationを確定してからA1／A2a〜c／A3へ一括反映する。

読取時点の根拠は既存`battle-execution/src/projection.ts:resolveModifierValue`の現在HPによるexpression評価と、
Step 1で参照した公開実装の
[BuffData.getParam](https://github.com/chaldea-center/chaldea/blob/9fa75655c07ecd76168b1ccf5b8232e8d64664cf/lib/app/battle/models/buff.dart#L283)
（query時のowner HP読取）。ゲーム内の独立実測とは区別する。

追加反例: canonical rate expression `{kind:inverseHpLinear, basePermille:0, bonusAtZeroHpPermille:400}`、
OC base application rate1000、recipient resistance200。HP500permilleならadjustment200で実効率1000、
HP1000permilleならadjustment0で実効率800となる。rate grant後／OC grant前にHP gainがあるprogramで、
grant時の200を固定すると確定成功に化ける。HP writerを実行できない現行bounded resourceモデルでは、
この経路を成功扱いにせずunsupportedへ接続する必要がある。HP writerなし、readerより後のwriter、
rate解除後、外部source HP不明、command拒否後retryも同じ反例familyへ含める。

| Changed path | Status |
| --- | --- |
| pipeline rate amount expression → preparation rate query → HP resource suffix proof → OC outcome／rollback | Blocking: OC-RATE-HP-001。固定値に潰さないread contractとunsupported境界を計画へ反映する必要がある |
| 公開HP依存rateの当該NP OCへの影響 | N/A: このeffectはNP-use OC確定後のNP-before。現在のOCを遡及して変えない。production damage差分は未観測 |

停止時点でA0全条件matrix／writer分類の共有gate化は未完了、A1〜A5は未着手。
製品コード・master・schema versionは変更していない。上記audit scriptと正本文書のみを変更した。
`pnpm quality`はphase未完了のため未実行。Done gateやruntime closureの成立は主張しない。
停止時の文書検証は`pnpm test:docs`（6 tests＋integrity）と`git diff --check`が成功。
06.45の既存trigger／dependent resource問題は未変更で、開始値の更新は06.48完了後に行う。

### OC-RATE-HP-001 continuation contract（利用者確認後）

上の停止記録は履歴として保持する。既存モデル内の依存判定不足として継続し、製品仕様の再承認を要求しない。
rate量expressionは付与時に固定せず、OC付与に使う時点で評価する。不変HPを証明できれば計算し、
結果に影響する未表現HP writerは既存resourceSemanticsと同じunsupported、修正可能なHP不足はinputRequired。
rate付与operationだけをHP readerにしてはならず、active rate instanceの利用位置まで依存を追う。
新しいHP実行モデルは追加しない。

| State × path | Expected outcome | Status |
| --- | --- | --- |
| rate付与 → HP変更 → OC付与 | 利用時までにHP不変を証明できずunsupported、command rollback | Verified: EXEC / APP |
| HP変更なし／最後のrate利用後のHP変更 | 利用時の不変HPでrate評価。後続readerなしwriterは既存規則 | Verified: EXEC / APP |
| rate解除 → HP変更 → OC付与 | 除去済みrateのHP依存を復活させない | Verified: EXEC / APP |
| 別sourceのHP／不足input | source identityを分離し、修正可能な不足はinputRequired | Verified: EXEC / APP |
| rollback／retry | HP依存汚染・instance・receiptを同時復元 | Verified: EXEC / APP |
| candidate admission／reduction | HP→rate利用→OC outcomeを共有依存へ接続 | Verified: APP |

Current classification: OC-RATE-HP-001の計画補足はVerified、runtimeは上表のDeferred。Blocking 0。
再停止は既存outcome／所有境界で閉じられず、新しいHP実行モデルまたは製品判断が必要と具体的に判明した場合だけ。

### 利用者指示による整理時点（2026-09-06、追加実装を保留）

利用者の「整理が終わったら実装まで行かずに一度情報をまとめよう」に従い、追加の製品／testコード変更を停止。
全条件監査も中断し、途中manifestを保持した。これは新しい仕様問題による実装停止でもphase完了でもない。
HEADはc555e4ff、local master .03のSHA-256は65add07d7b3c81927fd147e632ceea0c22ed0f7cb7f95079db4c6fc750ed6098。
未commit変更は保持し、stage／commitなし。

- 確認済み: read-point反例100 tests、6 source phaseの付与成否→damage reader／portable replay 11 tests、
  NP1採用scenarioのNP5列とNP5再最適化を区別するoracleを含む2 tests、responsive／keyboard／command／reset E2E 11 tests。
  詳細artifactは下のcheckpointおよび `.test-results/2026-09-06T10-04-37-982Z-16-dfd85e`。
- 全条件監査: `.test-results/tsk-06-48-a5/readpoint-matrix/manifest.json`の12／80条件まで採取。
  この範囲のcalculator比較は一致。成立込み2条件のportableで各5 profiles、計10件の`ranking_basis_invalid`を記録。
  5 profiles全体の基点再現は未確認で、202500の1反例だけが下記の`baselineReproducedUnchanged`。
  中断した監査は成功扱いにしない。
- 最新unit全体は615成功／1失敗（2026-09-06T10-02-13-431Z-16-c6b9af）。失敗は、未読trait writeを即時拒否する旧fixtureの期待。
  意味を保つunknown NP lossのfixtureへ修正し、scenario focusedは成功したが、全unitの再実行は未実施。
  最新lintはtestコードの型付きfixture／matcherに4 errors（warnings 0）、未修正。
- Production focusedはinventory／candidate digest等の期待差分が残る。OC加算のinput差分27件と、敵negative state追加1件を
  `.test-results/tsk-06-48-a5/calculator-canonical-input-delta.json`へ保存。204300のQuick buff脱落は解消済み。
  数値・outcome差分の最終承認証拠とratchet整合は未完了。
- 未検証: 全経路parity、残りのstate-by-path、最終production inventory、候補／suite／hot pathのbefore-after、最新変更の全体検証。
  `pnpm quality`は未実行。Task Done gate／Task内Deferredは閉じない。

### Portable HP basis診断の帰属（A5監査中、未解決）

`included:satisfied / naturalLimit / NP1 / 202500`のHP0候補はrankingとcalculatorが計算可能だが、portableが
`scenarioInvalid: ranking_basis_invalid`となる。指定基点c555e4ffの隔離archiveで同じcommandを実行し、
同じHP0・同じ拒否を再現した。分類は`baselineReproducedUnchanged`。現行master .03/schema38/engine33と
基点master .01/schema37/engine32の差はOC切替に伴うもので、HP固定validatorの拒否条件は同じ。
証拠: `.test-results/tsk-06-48-a5/portable-basis-attribution.json`。
この比較は全profileの不変性を証明しない。06.48の変更によるdamage差分へ混ぜず、既存HP witnessの
portable basis契約の独立した引継ぎ候補として残す。A5の全経路parity gateは未成立のまま保持する。

### Step 2 implementation checkpoint（A0／A1とA2接続用fixture）

以下は中間検証であり、Step 2の完了記録ではない。現在はlocal公開master .03（schema45）、payload schema38、engine33、
calculator／ranking／portable／UIの切替を実装済み。HEADは基点c555e4ffのまま、既存の未commit計画変更を保持する。
以下のdraft段階の診断・停止履歴は保持し、解決済み原因と最新の未検証項目を区別する。
最新証拠: read-point反例100 tests成功（2026-09-06T09-53-42-457Z-16-2fba76）、
skill／terminal NP／passive／CE／support／mysticCodeの付与成否からdamage readerまでのparity 11 tests成功
（2026-09-06T09-58-16-649Z-16-9b50cd）、desktop／390px／320px／keyboard／command／resetのE2E 11 tests成功
（2026-09-06T09-54-17-966Z-15-9965b6、warnings/observations 0）。544 testsは接続前基盤の証拠として保持する。
全production／性能after、全条件portable parity、最終qualityは未完了。

- A2実経路診断（未完了）: draft masterでnaturalLimit／included／baseline／NP1を実行し、241 calculatedを観測。
  `.test-results/tsk-06-48-a2/draft-runtime`は接続漏れの診断artifactでありafter完了値ではない。
  OCを共通executorへ委譲した後も`canNormalizeDamageEffect`が通常modifierとして再度unsupportedを作る経路と、
  preparationで合成するactivation factsの重複・非正規順を確認した。前のfixtureはraw成功率・resource条件に集中し、
  OC-only effectのdependency consumerと複数commandでのactivation fact合成を未検証だった。
  normal/dependency compilation双方で委譲済みOCを二重処理せず、入力fact自体のvalidationを維持した上で
  command由来factを正規化して合成する。所有境界・outcomeの変更は不要。反例と再測定は未完了。
- A2 read-point closureの補足: terminal damage専用のcontext writeを準備条件として一律拒否すると、
  OCと非交差の敵への条件付き状態付与でもranking全体がunsupportedになった。terminal NPのOC readerに至る
  prefixだけを準備へ渡す。command間の不確定context writeは成功／不成立に丸めず、当該trait／quantityを
  後続のOC・resource・form条件が読む場合だけ既存unsupportedへ閉じる。Boolean compositionでは無関係な
  branchを全体のunsupportedへ昇格させない。既存の条件stateとtransactionが所有し、新しい製品outcomeは追加しない。
  この補足の実経路反例とproduction再照合は未検証。
- 保存切替のfocused証拠: schema／portable 2 files・35 tests成功
  （`.test-results/2026-09-06T07-17-24-635Z-15-f1cf13`）。schema33〜37の旧resolvedは最終OCを読み替えず
  history-onlyに保持し、旧draftを破棄する。544 unit成功は引き続き接続前基盤の証拠であり実経路完了ではない。
- 接続診断のread-point補足（2026-09-06）: removal-resistanceは未表現stateの「存在し得る」印であり、
  条件不明の付与時点で入力要求にしてはいけない。liveなOC/rate instanceと解除が交差する時点でのみ
  既存unsupported境界を適用する。`draft-runtime-dependencies`で、解除readerのない条件付きmarkerが
  target buff有無を要求する過剰停止を確認した。既存fixtureは確定markerとlive removalの交差だけを検証し、
  条件不明marker→readerなしを欠いていた。unknown/false marker × removalあり/なし × terminal receipt後を
  同じbounded ownerの反例へ追加する。新しいHP/state実行モデルやoutcomeは導入しない。
- Terminal NP本体のresource/context処理は、後続OC操作の前提になるprefixだけを準備へ渡す。
  当該NPのOCは既に確定し、最後のOC reader後のHP回復／NP再充填はOCを変更しない。
  通常damage側のbeforeDamage resource reader判定は既存ownerに残す。`304700`のafterDamage未解決HP対象と
  `901200`のafterDamage選択付き再充填をOC準備へ無条件に加えていた過剰停止を、このread-point境界で除去する。
- Rate条件のread-point補足: `2800100`の初期passive `7362:0`は付与先条件が不明で、後続OC付与がない
  default計算まで`preparationInputRequired`として候補生成をthrowしていた。数値readerのないrate付与の不明性を
  eagerな実行拒否へ昇格させた接続不足であり、HP依存量と同じく既存outcome／executor内で閉じる。
  付与時点の未解決conditionとlifetime／selectorを不確定writeとして保持し、実際に該当rateを読むgrantで
  inputRequired／unsupportedへ戻す。後続時点のfactsで過去の付与成否を確定せず、入力修正後は元requestを再prepareする。
  未読／OC付与／rate付与／確定解除／別recipient／form expiry／rollbackを追加反例とし、未検証のまま完了扱いにしない。

- 解除条件のread-point補足: production `106400`のterminal NPにあるnegative解除は、対象instanceがない場合にも条件入力を要求し、default候補を0件にしていた。付与率の未読反例だけでは解除対象なしを検出できなかった。共通OC state ownerでrecipient／selector／lifetimeの交差を判定し、空集合の解除はnotApplicable、live対象ありの不明条件は従来のinputRequired／unsupportedへ閉じる。未読rateを含む解除・constant・expired・別recipientの反例を追加し、候補欠落0を再照合する。所有境界と製品outcomeは変更しない。

- 排他stateの準備reader補足: `2301100`の2 profileで、canonical `npCardForm`の一方が初期passive／choiceで確定しても、他方を読むOC条件がintrinsic trait未指定によりunknownとなった（default ranking391件、旧393件）。既存normal condition readerにも同じ合成規則があるため、OC固有のfalse補完はせず共通condition ownerで既存exclusive groupの否定証拠を利用する。前のreader反例は正のstate付与と明示falseだけで、排他stateによる否定を欠いていた。排他兄弟あり／なし・無関係trait・rollbackを確認し、未確認の矛盾stateを成立扱いにしない。

- 支援sourceのOC reader補足: production support auditの`2301100:2536550`は支援自身へのOC付与条件を要求していたが、現在のbounded phaseに支援役のNP-useはない。OC boostのrecipientが攻撃役以外でも、有限rateの消費を通じた後続影響は残り得るため、単純な対象除外はしない。live有限rate参加がない場合だけnotApplicableを証明し、参加ありは通常の付与・入力・rollback規則を維持する。既存反例は別source rate量だけで、別source boostの未読と間接消費を欠いていた。

- OC移行時の併存context write補足: 全392 effectsのIR差分照合で、rate grant3 effects（occurrence `1128:0`、enemy recipient）の既存`addTrait buffNegativeEffect`が失われ、target-state inventoryが1411→1408になっていた。原因は`effectNormalization.ts`の敵state正規化からOC rate family全体を除外したこと。writer199件の既存context7件は保存したが、grant family29件と既存damage readerの交差を同じ監査へ含めていなかった。正規化はOC operationとdamage-reachable context operationを併存させる。OC rate ownerと既存context ownerを置換せず、成功時の一度適用／失敗時のrollbackを混在fixtureで確認する。3件の減少は意図的差分ではなく修正対象であり、同inventoryのratchetを下げない。

- 上記の混在反例で、common stochastic resolver自体はpreResolved成否を読む一方、consumer helperのguaranteed fast pathがreceiptのfailureを上書きする経路を確認した。OC raw rateを専用operationへ移した後は通常procがguaranteedでも実効付与率は0になり得る。fast pathよりcommitted outcomeを優先し、terminal NPのselectedEffectsにも共通executorの成否を保存して通常projectionへ渡す。前のcompiler fixtureはpreResolved値の保持だけを検証し、最終activation consumerを通していなかった。skill／terminal NP × rate0/1000 × damage-state readerで実経路を固定する。
- read-point伝播の追加監査（未検証）: 80条件の途中で、外側preparationTransactionがunknownなtrait-only writeを即時拒否し、HP binderがpartyOtherの書込先を即時unsupportedにする経路を確認。共通ledger内の後続reader判定だけを検証し、入口binderと外側transactionの早期拒否を監査しなかった点が前回の検出漏れ。productionの204300では後続HP readerのないpartyOther HP lossを含むskill全体が候補から落ち、既存Quick buffを失うため意図的damage差分には分類しない。最小guardrailは、HP書込範囲をsource除外／不明範囲までcanonicalに保持し、実際のsource HP readerでのみ交差判定すること、trait-only uncertaintyはledgerへ残し、form／variant／gaugeの即時決定と分離すること。反例はpartyOther×attacker/source reader、不明recipient×未読/読取、unknown trait write×未読/後続読取、rollback/retry。既存HP実行モデルやoutcomeを増やさずA2/A3の接続補完として扱う。80条件監査はsatisfiedで202500の実経路parity不一致を検出して停止したため、途中出力を完了証拠にしない。


- A0拡張matrix: 自然上限／Lv90 × 四policy × NP1〜5の40条件を採取。
  `.test-results/tsk-06-48-a0/valid-matrix-manifest.json`が有効artifact一覧の正本。
  `packages/calculation-application/scripts/audit-oc-matrix.ts`は全profileのcanonical input／outcome／actions／metricsを保存する。
  最初のrunの誤った`uniform90`は0 profilesだったため廃棄し、schema validationを追加した`uniformLevel90`の再採取分だけを採用。
  この拡張matrixの時間は他の診断と重なっており、isolated hot-path ratchetには上の3回baselineを使う。
  開始gauge探索を含む旧モデルの測定であり、変更後の固定開始NPの測定と混同しない。
- A1の診断用snapshot生成:
  `pnpm --filter @fgo-lab/data-pipeline exec tsx scripts/audit-oc-normalized-master.ts /tmp/tsk-06-48-master.json`。
  raw5 inputsを一度ずつ読み、全raw OC167 occurrences／632 cellsの段階・Rate・Turn・Countを照合してからsnapshotを生成する。
  未公開sourceを含むraw numeric/lifecycleのgateであり、source lifetime／recipientのgateは次のpublished照合と区別する。
- 公開occurrenceの照合:
  `node packages/data-pipeline/scripts/audit-oc-normalization.mjs /tmp/tsk-06-48-master.json .test-results/tsk-06-48-a0/oc-inventory.json .test-results/tsk-06-48-a0/normalized-oc-cells.json`。
  OC97／rate29、通常・LB計866 cells、generic writer199件の92/2/73/32分類が一致。
  追加されたcanonical operationはgrant97／rate29／remove75／nonintersection131。
  診断snapshot SHA-256は`794cf98300041d9db96e41a8897cee367bc97274f4a4a61c595c8240555ee238`。
- Writer inventoryの差分［確認済み］: 199は旧`stateMutation`だけの母集団だった。
  既に`contextMutation`を持つsubStateが別に7 effectsあり、A1ではその全context operationを保持してOC非交差proofを追加した。
  全206 lifecycle occurrences＝generic199＋既存context7。`contextWriters`を共有inventoryへ追加し、既存operationの完全一致をassertする。
  旧inventoryはgeneric kindで絞っていたため、raw function familyに属する既存typed pathを捕捉していなかった。
  所有境界と期待outcomeは変更せず、raw functionとcanonical operationの双方を照合するguardrailを追加した。
- Pipelineの追加反例: 未知stack rule／未知parameter／未解釈HP量を固定値へ落とさずunsupported。
  未命名selectorはfamily3種のidentityが全て得られた場合だけ非交差を証明し、不完全なidentityや同じidentityの不明名はunsupported。
  `NoCheckIndividualityIfNotUnit=1`はrecipient checkが空のsubStateだけ、空のcheckを省略しても結果が変わらない境界で認識する。
  非空checkや未知値は未解釈として残す。いずれもpipeline内の判定でありruntimeのraw key／ID分岐にはしない。
- 接続前fixture: OC cap、action終端消費、constant再付与防止、同一action再commit拒否、NP receipt後のcell選択、
  condition／policy共通owner、rate付与→HP変更→OC利用、最後の利用後の変更、解除、別source、rollback／retryを確認。
  HP500＋rate200−resistance200では1000、HP1000では800となる値を使い、clampで読取時点の差が隠れないことを検証する。
  HP formulaは既存projectionと共通化。source program cacheには全cellsとstatic conditionだけを置き、runtime stateを入れない。
- Focused verification: `ocSemantics`／`executionSemantics`／pipeline `index`／`ocSourceProgram`／`ocState`／
  `resourceSemantics`／`variantSelection`の7 files／81 tests成功、warnings0。
  artifact `.test-results/2026-09-06T02-07-10-137Z-15-b9fe6f`。
- 続くunit検証は88 files／544 tests成功、8.17秒、warnings0。
  artifact `.test-results/2026-09-06T02-12-16-583Z-15-39bd63`。
  途中のarchitecture検証ではstochastic ownerの115行上限へ抵触したため、実効率判定を`applicationRate.ts`へ分離し、
  ratchetを変更せず再検証した。policy除外rate instanceはHP量を数値へ使わず、物理的な参加回数を消費する反例も追加した。
  `tsc -b`、変更sourceのESLint、`pnpm test:docs`（6 tests＋integrity）が成功。
  最後のnormalization fixture整形後も20 focused tests成功（`.test-results/2026-09-06T02-13-06-661Z-15-93782e`）。

544 testsは接続前基盤の証拠であり、以下の実経路の完了証拠ではない。

現在の接続作業: 準備stateにOC instance／receiptを保持し、CE初期phase、form lifetime、支援phaseを共通sourceから構成中。
準備条件の独自評価は共通condition評価へ移し、入力範囲検証とproc outcomeを別に保持する。
接続中に入力検証迂回と要求由来source quantityの循環的な成立判定を検出したため、focused反例で修正確認中。
追加承認や新Taskは不要。実経路のparity・性能・UIが未検証である点は維持する。

未完了: 初期passive／CE lifetimeとexternal phaseの実経路配置、gauge／formとのcommand transaction統合、
application recoveryとpolicy再prepare、candidate dependency、portable／UI cutover、production parity／性能after。
上のHP state-by-path表は、これらの実経路へ接続するまでDeferredのままとする。`pnpm quality`は未実行、Done gateは未成立。

### Outcome, invariants and review gap

利用者が初期OC1／2／3を選び、通常のみ／成立込みで同じ開始NPを比較する。準備中の自前NP増減とOC加算は
共通executorが適用し、発動時OCをdetailへ返す。初期OCと発動時OCは別の値であり、OC加算はNP gaugeを増やさない。
外部支援・チェイン・最大化・自前OC個別toggleはランキングに追加しない。

Confirmed investigation at `c555e4f`:

- NP5・自然上限・等倍・自己バフあり・成立込みの433 profilesは370 calculated／63 unsupported。
  計算済み370件の発動時OCは1:181件、2:1件、3:188件。これは06.45のdefault baselineとは別条件である。
- 全370件の採用scenario／開始NP／policyを共通calculatorでreplayしたinputとNP1〜5列は一致し、
  NP5順位値もNP5列と一致した。列選択のずれではなく、成立込みの開始NP探索が比較前提を変えていた。
  `RankingConditions.tsx`の「OC1」表示とrequirements旧§4.2／9.1／9.2はこの探索と整合していなかった。
- published master内の`upChagetd` evidenceの調査inventoryは97 occurrences（skill38／36 servants、NP4、CE54、mystic code1）。
  canonical変換後は汎用stateMutationとなり、`packages/battle-execution/src/operationCompiler.ts`の
  preserveSemanticEffect／stateMutationOnly経路では加算段階を実効OCへ反映できていない。
- Typhon skill2の自己対象OC+2を明示実行しても、開始100%でOC1、300%でOC3のままだった。
  期待するOC3／5との差は表示だけでは解消しない。初期100%でも自前NP増加で発動時OCが上がる例もあり、
  初期OC1を最終OC1として固定する修正は誤りとなる。

Mechanism / mismatch: applicationが初期resourceを最大化候補へ含める一方でUIは固定OC1を表示し、
pipelineからexecutorへOC加算の量・識別が保たれない。共有replay一致だけでは同じ誤りを検出できない。
Missed detection: 06.43レビューはstack quantityとPIR-001〜003を閉じたが、NP1採用scenarioのNP5列と
NP5で再最適化した順位の区別、OC加算familyのlossless mappingと表示契約まで監査しなかった。
Recurrence scope: 全OC producer、action admission、準備／NP使用、finite dependency、portable／UI。
この追加調査だけでは06.43由来のregressionとは断定しない。既存レビューの承認履歴は保持する。

調査の一時artifactは `/tmp/fgo-np5-audit.json`、`/tmp/fgo-np5-replay.json`、
`/tmp/fgo-np5-oc-family.json`。実装開始時にHEAD／master digest／commandを伴う再現可能な共有inventoryへ置換し、
一時fileの存在を完了条件にしない。外部順位への一致はoracleにせず、初期OC、field、target相性、stack、
乱数固定値と平均値の差を分離する。OC以外の比較差を本Taskで一括補正しない。

### Step 1 implementation audit (2026-09-06)

基点は `c555e4ff9a208f8da01e56130fbd49e63848e192`。開始時点でTasks、ranking requirements、UI spec、
本note、NP resource note、docs READMEに利用者の未commit変更があり、その計画を仮説として照合した。
本Stepはread-only調査と正本文書更新のみ。上記370件replayは先行調査の記録であり、今回再実行した結果ではない。

#### Production population — confirmed

ローカルのraw JSON全階層を走査し、functionの`buffs[].type = upChagetd`をpathごとに数えた。
published masterは`atlasEvidence.buffTypes`を持つeffectをpathごとに数え、同じfunction IDでも別sourceを潰していない。
これはread-onlyのJSON inventoryであり、normalizeやdamage実行の成功証明ではない。

| Population | OC occurrences | Interpretation |
| --- | ---: | --- |
| `data/raw/nice_servant.json` | 44 | skill40、NP4。passive0 |
| `data/raw/nice_equip.json` | 122 | 強化／limit-break別raw sourceを含む |
| `data/raw/nice_mystic_code.json` | 1 | skill1 |
| `data/raw/referenced_skills.json` | 0 | 参照skill経由はproduction-negative |
| `apps/web/public/master/master.json` | 97 | skill38／36 servants、NP4、CE54、mystic1。raw167件とは母集団が異なる |

SHA-256（ファイルbytes）:

- servant raw: `1abf690ac22bcdd427788e0ff545320af491ee9f90fbc08a56af9603a217118f`
- equip raw: `bb339ac726f8201243410ec82b85a14496e6a8dace54b226071b556604fc27e5`
- mystic raw: `ce6560440673fad4f36f8e08a97b20b4b5d9e2e0e1c5f262943bbf47d8b857cf`
- referenced skills raw: `afdc02f3251dd901c133745203889a0c1c4d23409da17d24634140b5e75107f6`
- published master: `6e96b3f11fdbdef82997be12c84076d4236651d23f4ee7662a4b66a6a272c8f8`

公開97件すべてのexecutionは`stateMutation(add, polarity:unknown)`。recipientはpartyMember40／sourceSelf57。
全件proc guaranteed、triggerScope null。requirementはalways95／any2（recipient trait条件）。
NP4件は全て`timing:afterDamage`であり、`gameActivation:npBeforeDamage`と異なるtiming fieldを持つ。
OC加算の対象をskill38件だけへ縮めず、CEの通常／限界突破values、condition付きparty recipientも保持する。
raw全件ではValue1／2、Turn1／3／-1、Count1／3／4／-1が現れる。公開の通常parameterSetsではCount3、同じCE effectのlimitBreakParameterSetsではCount4を確認した。
この二つを別source occurrenceへ水増しせず、A1で同一effectの通常/LB cellsとして固定する。rawの-1を回数0や欠落に丸めない。
passive、NP-before、stochastic OC、参照skillは現在の公開OC付与母集団では0件であり、fixture＋0件ratchetを使う。

汎用lifecycle writerの公開inventoryは199 operations（remove193、move3、extendDuration2、shortenCount1）。
これはOCへ適用可能な件数ではない。recipientとselectorによる絞り込み前の直接writer母集団である。
`stateMutation`はselectorも持たず、現状masterだけでは全writerのOC非干渉を証明できない。
例えばshortenCountはraw TargetList、moveはDependFunc、removeはraw functionのtrait selectorをpipelineで解釈する必要がある。
Step 1再調査で全199件をrawへ対応させた。分類結果と実装境界は下記「Planning closure correction」に記録する。
汎用lifecycle全体の機能実装を199件すべてに要求する計画ではない。

#### Direct paths — confirmed code evidence and implementation ownership

以下のpathはpackageの`src/`相対。表のVerifiedは現行経路の調査済みを意味し、下のruntime closureを置換しない。

| Path | Current implementation / consequence | Investigation; implementation unit |
| --- | --- | --- |
| Raw → canonical | data-pipeline `executionSemantics.ts`のtypedStateFamilies fallbackはbuff identity／量／lifecycleを持たない。`effectNormalization.ts`はValue/Turn/CountをatlasEvidenceへ残すがmaster-data `index.ts`のstateMutation unionへは出さない。runtimeでrawを読み戻さず専用OC operationへ置換する。 | Verified; A0/A1 |
| Canonical → operation/projection | battle-execution `effectRouting.ts`はstateMutationのrecipientをnullにし、`operationCompiler.ts`はpreserveSemanticEffectまたはstateMutationOnlyへ落とす。`executionPlan.ts`は後者をretainedProjectionsへ移す。加算・正常な不適用・未対応を新typed operationで区別する。 | Verified; A1/A2 |
| Initial state → preparation | application `scenario.ts:resolveScenarioPreparationOutcome` → battle-execution `sourceCollection.ts:resolveAttackerFormExecution` → `preparationState.ts`／`preparationSkillReducer.ts`／`preparationTransformNpReducer.ts`／`preparationAttackNp.ts`。現在はNP resourceとbaseOverchargeのみ。OC grant stateとNP使用receiptを同じtransaction ownerへ追加する。 | Verified; A2 |
| NP-use → effect cells → damage | attack reducerはeffects空でresource全消費、transform reducerはcontext.overchargeでcellsを選ぶ。`sourceCollection.ts`はtransform effectsをterminal input.overchargeで再選択する。`scenario.ts`はMath.max(baseOvercharge ?? 1, scenario.overcharge)、`npDamageCompilation.ts`はその値で本体・条件・倍率をcompileする。各NP自身の使用時OCを固定し、攻撃NPのOCを変身NPへ遡及しない。 | Verified; A2 |
| Automatic/external sources | `sourceCollection.ts`はpassive、CE、support、mystic、NP-beforeを収集し、`executionPlan.ts`はphase順に並べる。現在CEは準備NPより後のphase。OCのconstant付与は最初のNP使用前に有効化する必要があり、既存phaseをそのままOC消費順に転用できない。外部skillの既存入力範囲と順序を明示し、新しい支援editorは作らない。 | Verified; A0/A2 |
| Conditions / recovery | `preparationTransaction.ts:effectChangesPreparation`はOCを読まない。preparationRequirementSatisfiedはfield/opponentをunknownにし、非構造のunknown effectを準備mutationへ含めない。OCをこの経路へ単に追加すると条件付き加算を黙って失う。materialized factsと共通condition ownerへ接続し、未解決はinputRequired/invalid/unsupportedへ戻す。 | Verified; A2 |
| Transaction / alternate writes | `preparationTransaction.ts`のresource plan、skill/transform/attack reducerのstate commit、`preparationState.ts:appendPreparationEffects`、`state.ts:cloneBattleState`、`candidateExecution.ts`のgroup clone/rollback、`candidateRollback.ts`、`variantSelection.ts`のpreappliedOperationIdsが直接対象。付与済みeffectと未消費instanceと使用receiptを区別し、projection replayで再付与しない。 | Verified; A2 |
| Policy reapplication | application `scenario.ts:reapplyPreparedCalculationPolicy`は既存orderedScenarioを再実行しpreparationを再解決しない。policy依存OCをbaseInputへ焼き込む設計ではstale OCになる。policyをexecution contextへ先に渡す。policy変更時は共通prepare入口から再評価し、使用済みreceiptを再利用しない。 | Verified; A2/A3 |
| Selection / commands / capacity | schema `rankingSelection.ts`は6条件、application `rankingBasis.ts`はNP basis変更とpopulation→allのowned→NP1修正を所有。両commandで必要ならinitial OC1変更もatomicにする。schema validationとmaster capacity検証を分け、保有混在はentry単位のcapacity不足を返す。 | Verified; A3/A4 |
| Candidate admission / finite proof | `rankingComparisonPolicy.ts`が成立込みのcapacity列からstartNpGaugeCandidatesを生成、`rankingCandidateSpace.ts`が探索次元化。`rankingActionAdmission.ts`のbaselineは4種の直接modifierだけを実効寄与扱いするため、OC-only/charge-onlyの間接寄与を逃す。`rankingStaticSemantics.ts`はpreserveSemanticEffect条件を除外する。NP gauge→base OCとboost→effective OCの両依存を共通semantic dependencyから読む。 | Verified; A3 |
| Reduction / numeric cache | `rankingStackDomain.ts`はNPの全OC/NP cellsを読むがgeneric preserved operationを依存から除外する。`rankingExecution.ts`／`preparedDamageInputCache.ts`は完成inputをkey化しnpLevelだけ正規化する。OC変化前のrequestや選択済みNP1 scenarioをNP5再最適化と同値扱いしない。 | Verified; A3/A5 |
| Portable / persistence / reset | schema `index.ts`のranking intentはinitialNpGaugeとpolicy/basisを別保持、calculator intentは10000固定。application `portableCalculation.ts`、`rankingPortableBasis.ts`、Web `app/rankingHandoff.ts`／`portableDraft.ts`とworkspace-domainがdraft/historyへ渡す。profile/backup migrationは古いrequestからcalculator10000を作る経路もある。旧OC modelを再実行可能な新requestへ暗黙変換しない。historicalOnly表示と再生成を区別する。 | Verified; A4 |
| URL / worker / UI | Web `rankingState.ts`のcomplete6キー判定、`rankingWorkerProtocol.ts`のrequest/detail payload、`rankingWorkerRuntime.ts`のfingerprint別cache、`useRanking.ts`のstale判定、application `rankingContracts.ts`等の比較identity、Web `RankingConditions.tsx`のOC1固定、`rankingDetailPresentation.ts`の開始NP、calculator `Calculator.tsx`のscenario.overcharge writerを一括切替する。 | Verified; A4 |
| Shared numeric execution | `rankingPolicyScenario.ts`が開始NPをpreparation optionへ渡し、`rankingExecution.ts`と`portableCalculation.ts`がapplication scenarioのprepare/evaluateへ合流する。calculator/ranking独自のOC計算は追加しない。 | Verified; A2–A5 |

#### Design decisions, unresolved contracts and review-gap delta

確定した設計方針:

- 初期OCはranking intent。開始NPへの変換とcapacityのownerはapplication＋既存canonical NP resource。
  gauge／boost instances／NP-use receipt（消費前gauge、base OC、適用boost、effective OC、消費根拠）を区別する。
  effective OCのownerはbattle-executionで、application/Webは値を足したりMath.maxしたりしない。
- 専用OC operationは段階のvalue cells、canonical recipient/requirement、duration/count、stacking根拠を持つ。
  -1などraw表記はpipelineで解釈し、無制限と有限をtyped unionにする。曖昧なセルを1へ補完しない。
- 準備の付与・実際のNP使用・消費・再付与を一つのordered stateへ閉じる。NP-before/afterを見かけの
  gameActivationだけで解釈しない。NP自身のOC依存効果は当該use receiptを読む。
- generic state removal/move/extend/shortenがactive OCへ到達する経路もfamily内に含む。未解釈writerを成功no-opにせず、
  canonical selectorでOCへ到達しない証明かbounded executionを必要とする。全buff simulatorへの拡張はしない。
- 加算stateとpolicy上の有効寄与は区別する。structuralRequired actionの実行事実を消さず、四policyで使用OCを再導出する。
  optional OC/NP charge actionは後続のOC-sensitive reader／NP到達性へ寄与する場合を検証し、無関係actionを無制限に増やさない。

#### Planning closure correction — user review after Step 1 report

前回報告の「Step 1完了」は訂正する。OC lifecycle、writer到達性、policy再適用の設計選択を未確定のまま
実装単位A0へ送ったため、実装範囲を確定する調査が終わっていなかった。利用者の指摘を受けて同じStep 1を再開し、
下記を製品コード変更なしで確認した。A0は実装直前の再現可能baseline計測に限定し、仕様選択の延期先にはしない。
manualの最終OC1〜5維持は利用者確認済み。resolvedは提案どおり初期OC1〜3と発動時OC表示へ統一する計画で、
最終入力のoverchargeはmanual/damage inputだけに残し、resolved requestの別名として残さない。

**1. Writer母集団の閉鎖［確認済み］**

rawのfunctionをfuncIdでjoinし、全候補のtarget、traitVals、TargetList、DependFuncを比較した。
9 occurrencesはraw value variantを複数持つが、下記OC到達性分類は全variantで一致する。unmapped0、分類矛盾0。
IDはaudit joinだけに使い、runtime分岐はcanonical recipientとtyped state selectorで行う。

| Disjoint partition | Count | OC stateへの到達性・実装責務 |
| --- | ---: | --- |
| targetが敵 | 92 | remove91＋extend1。今回のattacker OCを変更しない。partyOtherは支援originでattackerへ届き得るため、この区分には含めていない。 |
| selectorがOCと非交差 | 105 | remove100、move3、shorten1、extend1。removeは弱体/攻防/個別state等のselectorでbuffPositiveEffect単独のOCと非交差。moveはDependFuncのcurseまたはNP-charge-block selector。shortenはTargetList[2886]。extendは味方の毎turn系selector。 |
| 自身の強化解除 | 2 | `21513`（600300 skill）、`22699`（603500 NP-before）。removableなOC instanceに到達可能。使った後のreceiptは変更しない。 |

extend1はTarget=-1／TargetList[3060,3080,3081]でOCのbuff trait3004と非交差。
全167 raw OC付与のbuff定義は同じ形で、buffGroup0、maxRate5、valsはbuffPositiveEffectだけ、
script/ckSelfIndv/ckOpIndvは空。functionのfuncGroup/scriptも空。rawパラメータ632 cellsは全て
Rate/Turn/Count/Valueを持ち、追加はpresentationとrecipient checkの2キーだけだった。
これにより現行OCを「全beneficial state一般」として実装する必要はなく、OC familyへのselector適用だけを閉じられる。

解除2件のscope判定:

- skillの強化解除はNP使用前。現行rankingでは当該actorの自前OC付与がなく、新たなOC数値差は発生しない。
  calculatorの現在のphase順では支援/mystic skillはこの準備skillより後、CEはpassive sourceで解除対象外。
  schema-legalな「OC skill→解除→NP」はremovable instanceを消してbase OCへ戻るfocused fixtureで閉じる。
- NP-beforeの強化解除はNP-use receipt確定後。当該NPのOCは変わらない。将来のNPがあれば残存instanceに影響するが、
  このproduction actorのterminal attack後に次のNP readerはない。NP-afterの付与も同じく現在damageへ先取りしない。
- removal resistanceは当該NP-before解除の成功率を変えるが、確定済みOCと現在damageのOC入力を変えない。
  将来fixtureで「removal resistance→解除→未実行NP」がliveになる場合は、未表現resistanceを無視せず
  `unsupported`へ閉じる。全buff解除確率の新シミュレーターは作らない。removalのRateと既存procで確定できるfixtureは
  applied／stochastic failureに分け、相手対象・selector不一致・immutable sourceは正常な非適用とする。

**付与成功率を含む再発範囲［同じ調査で追加確認］**

199件の92/105/2分類は**OC instanceそのもの**への到達性。これだけでfamily全体の閉鎖とはしない。
付与率の直接transformerまで辿ると、公開masterにpositive buff対象のrate modifierが29 effectsある
（servant22、CE7）。内訳はgrant success up12、recipient success up12、recipient resistance up4、grant success down1。
rawのbuff定義からcaster側とrecipient側のselectorを分離する。これらも現状は量・対象役割を保持しないgeneric state等であり、
actor trait条件として再解釈してはならない。

- `21623`（703500 skill）は自身へのpositive buff resistance+1000、付与Rate5000。
  自前OCはないが、calculatorでこのskill後に支援OC（通常Rate1000）を付けると、補助なしでは成功率0になる。
  mystic OCのraw Rate5000なら低下後も確定となる。既存の`proc:guaranteed`だけを保持するとこの差を失う。
- `7362`はcaster側のgrant success down200だが、対象はraw intrinsic selectorで限定される。
  現行OC付与casterとのintersectionは0。名前やservant IDの例外ではなくcanonical caster identity predicateで非交差を証明する。
- recipient resistance upの残り3件は敵対象でattacker OCには届かない。positive avoidStateのattacker対象は0。
  空tvalsを持つraw avoidStateもckOpIndv[2852]で限定され、OC buff traitとは非交差。
- OC段階値に作用するbuffRate selectorは現行0（既存1件はNP damage buff限定）。将来のunknown value transformerはunsupported。

29 rate effectsのstate traitsはpositive、negative、buff-grant-success-upの3種。これまで非交差105件としたwriterのうち
73件はこの**rate prerequisite**へは届き得る。したがってfamily全体の保守的なwriter区分は
**敵92／OC直接2／rate prerequisite73／両者と非交差32 = 199**とする。
73件を無効果として除外しない。canonical selectorでOCとrate stateの両collectionを同じcommand内で除去できる設計にする。
producer/consumerはこのbounded sliceに限定し、任意の全buff state simulatorへ拡張しない。

採用設計:

- pipelineはOC付与と29 rate effectsについてrawの**clamp前application rate**、caster/recipient role、
  effect-family selector、signed additive adjustment、lifecycle、grant sourceをcanonical化する。
  intrinsic recipient条件と「どのbuff種の成功率を変えるか」のselectorを別fieldにする。
- command interpreterがsource/recipientの現在rate stateを読み、OC付与時の実効率を
  `clamp(baseApplicationRate + casterGrantAdjustment - recipientResistance, 0, 1000)`で導出する。
  constant passive付与はcanonicalなpassive application ruleで扱い、確率補正を遡及しない。
- rate modifierの付与自体も同じ入口を通す。補助rate stateが成立したと勝手に仮定しない。
  0は確率不成立、1000は確定、中間は既存canonical proc witnessの0/1入力へ接続し、入力がなければinputRequired。
  static source programはraw guaranteedだけから「必要proc入力なし」と早期決定しない。
- queryで使った有限rate stateの回数はcommand/action終端で一度だけ消費する。失敗したOC grantは正常な不成立であり、
  使用した補助stateまでtransaction rollbackしない。semantic invalid/inputRequiredによるcommand拒否とは区別する。
- removalはOC instanceとrate prerequisiteを同じtyped selectorで処理し、immutable/passiveを維持する。
  未対応live removal resistanceは明示unsupported（現在のOC数値を変えるproduction交差は0）。
- このrate familyを他の全damage buffの成功率修正へ広げる作業は本Taskで行わない。ただしOCへ至るrate調整の付与・解除は
  すべて同じbounded sliceに含む。非OC familyの既存問題を今回の数値補正へ混ぜない。

公開canonicalのbuffPositiveEffect参照106 effectsは汎用stateMutation86／enemyへのcontextMutation20で、
当該traitを読むdamageModifier/NP本体は0。OCを新しいactor trait書込として公開し、この誤ったselector解釈を活性化しない。
A1でOC/rate selectorをcanonical operationへ移し、scalar actor conditionへ戻さない。

**2. NP使用・stacking・lifecycle規則［根拠付き設計判断］**

ローカルrawに加え、以下の公開資料/公開実装をread-onlyで照合した。ゲーム実行の独立実測とは区別する。

- [Atlas fgo-docs / buff group and limits](https://github.com/atlasacademy/fgo-docs/blob/4d905267350e8078f46889ab19f6fc54f564a3ed/README.md#unstackable-buffs): group0は加算を共存可能、非zero groupは非重複。
- [Chaldea activateNP / getBuffValue](https://github.com/chaldea-center/chaldea/blob/9fa75655c07ecd76168b1ccf5b8232e8d64664cf/lib/app/battle/models/svt_entity.dart#L1732): OCをNP functionsより先に確定し、全該当buffを使用記録してから合算・capする。
- [Chaldea withAction](https://github.com/chaldea-center/chaldea/blob/9fa75655c07ecd76168b1ccf5b8232e8d64664cf/lib/app/battle/models/battle.dart#L237) / [BuffData useOnce](https://github.com/chaldea-center/chaldea/blob/9fa75655c07ecd76168b1ccf5b8232e8d64664cf/lib/app/battle/models/buff.dart#L589): action終端で使用済みinstanceの有限countだけを減らす。
- [Chaldea addState](https://github.com/chaldea-center/chaldea/blob/9fa75655c07ecd76168b1ccf5b8232e8d64664cf/lib/app/battle/functions/add_state.dart#L27) / [subState](https://github.com/chaldea-center/chaldea/blob/9fa75655c07ecd76168b1ccf5b8232e8d64664cf/lib/app/battle/functions/sub_state.dart#L26): passive sourceとactive buffを分離。raw CE122 sourcesは全てpassive型であり、同じOC buffでもskill付与と解除可能性が違う。

ここから採用するbounded executor規則:

1. 開始時にCE constantを一度だけ付与。form passiveはそのformのsource lifetimeで有効化し、terminal passiveを
   初期formへ遡及しない。OC/rateのgrant source identityと付与instance identityを区別し、再compileで回数を補充しない。
2. 既存calculatorのordered own commandsを実行。support/mysticの既存選択skillは現在の順序どおり
   own preparationの後、terminal attack NP-useの前に実行する。CE constantだけを実際の初期lifetimeへ移す。
   外部skillを変身NP前へ移す新しい順序editorは追加しない。
3. NPのexecution preconditionを検証後、全消費前gaugeからbase OCを導出する。
   その時点で有効なOC instanceを列挙し、policy上の寄与を分離してeffective OC=min(5, base OC+対象加算)を固定する。
   加算総和・clamp後段階・参加instance・policy除外instanceをreceiptへ記録する。
4. NP-before、NP本体、NP-afterのvalue/proc/condition cellsは**当該receipt**を読む。
   NP-beforeの新規OC付与は当該NPのOCを上げず、解除も確定済みOCを下げない。循環再計算は行わない。
5. NP action終端で、使用開始時に参加したinstanceの有限countを1だけ消費する。cap5で数値寄与が飽和していても
   参加した全instanceが消費対象。途中の新規付与は未使用なので消費しない。無制限countは減らさない。
   途中解除されたinstanceを復活させない。count0はinactive、Turn0は期限切れ、-1はunlimitedとして区別する。
6. command全体の失敗ではgauge、form、OC/rate grant、receipt、残countをrollbackする。receiptを確定結果としてUIへ出すのはcommit後。
   同一turnのためdurationを保存するがturn tickは行わない。

productionのgroup0をtyped `additive`へ正規化する。未検証のnonzero group、unknown stack rule、動的OC段階expression、
不足cellはsupported additiveへ丸めずinvalid/unsupported。これらを実装時の新しい設計判断にせず反例の期待outcomeとして固定する。

**3. 実行ownerとpolicy再適用［単一案へ確定］**

二段構成をそのまま二重実行に使わない。battle-executionの準備transactionを有限command interpreterとして拡張し、
NP gauge/OC/OC付与率/formのwriteとNP-use receiptを唯一所有させる。外側のapplicationは次の順序を共通入口として組み立てる。

`validated request + policy + resolved world/input facts → canonical source program → command interpreter → committed receipts → damage/effect projection → result`

- source programのstatic段階は全OC cellsを保持し、OCで変わる値/確率をOC1に早期固定しない。
  command interpreterは既存compileEffectCondition/condition/activation/stochastic ownerを呼ぶ。
  field/target/input factsは準備**前**に解決して渡し、rate状態はcommand順に更新する。preparationRequirementSatisfied独自のunknown-as-no-mutation経路を
  OC readerには使わない。unsupportedなlive inputはrequired-input/invalid/unsupportedとして戻す。
- 実行済みeffectはinstanceとreceiptで引き継ぎ、sourceCollection/通常operation loopはそのwriteを再適用しない。
  damage projectionは対応するNP receiptでcellを選ぶ。preapplyはform/variantの既存適用記録にOCのcommit記録を結び付ける。
  全変数をapplication orchestratorへ戻さず、battle-execution内のfocused moduleへ分ける。
- grant事実とcontribution inclusionを分離する。structural-required actionのresource/form mutationは維持する。
  使用時のphysical参加instanceとpolicy上加算へ含めるinstanceを別集合にし、除外された寄与を後続で復活させない。
  自己バフなしのoptional skillは現行source policyどおりadmitしない。baselineではconditional OC寄与を数値へ含めない。
- `reapplyPreparedCalculationPolicy`は共通prepare入口へ元request＋新policyを渡して再評価する経路に一本化する。
  cached baseInputへboostを焼き込んでprojectionだけ替える案は採用しない。immutable source programのcompile cacheは再利用可、
  使用済みstate/receipt cacheは再利用不可。without-areaも同じ規則を通す。

**4. 候補生成の責務とbound［計画時に確認済み］**

現行master一回parse、既存compileStaticRankingPreparationPrograms/compileCandidateLocalActionAdmissionを直接呼んだread-only audit:
422 attack servants／433 profiles、static programs7,255、1 profile最大60。
included baselineのadmitted programs2,034、included satisfied6,722。
attack servant範囲のOC skill source29件中13件は直接damageModifier/modifierRateChange/ignoreDefense/ignoreDamageCutを持たない。
これは「13件すべてが新しい最適解になる」という測定ではない。source単位の現行baseline admission漏れ候補である。

新規action/skill再使用/初期gauge探索は追加しない。既存static program全集合から、以下のcanonical依存を逆向きに辿る。

- NP body/effectの全OC cells（値、condition、proc）→ NP-use effective OC → boost grant/remove、gauge→base OC。
- OC grant→effective application rate→caster/recipient rate stateの付与/解除/条件。
- NP使用precondition／後続skill cost→gauge gain/loss。単なるcharge-onlyも、この到達性またはOC-sensitive readerを持つときだけ実効寄与候補。
- transitive condition/input/state writerと排他branchはprogramの順序で保持。unknown dependencyで削減を証明しない。

通常単一form・選択なしの3skillならpartial permutationは1+3+6+6=16。実測の最大60は既存form/branchを含む。
このstatic boundを増やさず、world/quantity domainは既存4,096 certificateへ合成する。OC-sensitive dependencyがある
quantityはmonotone/aggregate reductionを解除して完全な小domainを使う。全探索oracleはplan順序も比較する。
初期OCは一つの意図値でありdimension cardinalityを増やさない。source program/全cellsのdependency解析はcandidateごとに繰り返さず
master/program単位に共有する。policyごとのruntime時間はA0/A5で測るが、処理構造の選択をその測定へ先送りしない。

**5. 固定した反例期待値（実行testはStep 2）**

| Canonical input / path | Expected rule/outcome |
| --- | --- |
| initial100%, NP2、own gain100%、boostなし | gauge200%→base/effective OC2。initialOC1自体は不変 |
| initial300%、+2/count1を2 instances | base3、合算4、effective5。NP終端で両instance count0 |
| initial100%、+2/count1→transform NP→after grant+1/count1→gain100%→attack | transform OC3、元boost消費。attack OC2、新boostだけ消費。変身NPのcellsをattack OC2で読み直さない |
| initial100%、NP-before grant+2/count1 | 当該NP OC1、new instance未消費。次のNPがあれば加算可能 |
| initial100%、+2/count2→NP-before remove positive | 当該NP OC3。removableなら残instance除去、CE/passiveなら除去されず使用分count1。receiptは不変 |
| recipient resistance1000の後にOC付与、caster補助0 | base application rate1000なら不成立、5000なら確定。両者をguaranteedへ潰さない |
| recipient resistance1000、caster grant bonus200、OC baseRate1000 | 実効200。proc witnessなしはinputRequired、失敗ならinstanceなし、成功なら付与。policy baseline/satisfiedは同じ既存proc入力規則を使う |
| rate stateを解除→OC grant | 解除後stateで成功率を導出。解除不能なら保持。補助stateの付与が失敗した場合も未適用として読む |
| count1使用NPでsibling invalid、またはrequired input不足 | actionをcommitしない。gauge/instance/count/receiptを元に戻す |
| unchanged requestでpolicy再適用／without-area | fresh request executionとinput/outcome/receiptが一致。以前のOCを再利用しない |
| nonzero group／live unknown removal resistance／OC-sensitive unknown writer | additive/成功/OC1へfallbackせずunsupported。malformed/missing canonical cellはinvalid |

Planning closure: 上の調査・設計判断はVerified、未決定のowner/順序/production分類は0。
実装と実行testの証明は下のruntime matrixにDeferredとして残す。現在の数値結果を修正・検証したとの主張ではない。

追加のcause analysis（先行調査の共通原因へ追加するdelta）:

- 発生機構［確認済み］: OCをresource準備前後で数値だけ受け渡し、sourceCollectionが準備NPのOCをterminal OCで読む。
  operationCompilerの汎用state保持は量も回数も実行せず、policy再適用はその既存base inputを再利用する。
- 実装とのズレ［推論］: gauge由来base OC修正を全OC closureと捉えると、effect付与からNP使用receiptまでのowner不在が残る。
  根拠は上記scenario/preparation/sourceCollectionの異なるOC reader。
- 検出漏れ［確認済み］: 既存06.48計画は具体reader/writerが未記入で、変身NPのcell再選択、constant CEの初回消費、
  policy再適用、population変更によるNP1復帰、保存migrationの交差が明示されていなかった。
- 再発範囲［推論］: 同じpathを通る全OC付与とOC-sensitive効果。最小guardrailは下記追加matrixとStep 1の母集団対応表。
  特定servantの期待damageだけを修正単位にしない。既存06.43承認の取消やregression帰属は主張しない。

### Canonical flow inventory delta

NP gaugeの既存ownerは `docs/evidence/np-resource-semantics-flow-tsk-04.md` に維持し、
本節は選択初期OC／OC加算state／発動時OCという追加familyだけを所有する。
上のStep 1 inventoryで具体producer／consumerを固定した。以後は差分のみ更新する。外部sourceの監査は既存calculatorの共有経路を閉じるためである。

| Path / owner | Required delta | Status |
| --- | --- | --- |
| Pipeline → master/schema admission | 全skill／NP／passive／CE／mystic sourceのOC段階、recipient、condition、duration/count、stacking semanticsを根拠付きtyped IRへ保持。曖昧値・欠落値・未知対象を無効果扱いしない。 | Verified: IR |
| Application comparison → scenario | 選択初期OCを開始100／200／300%へ変換。指定NP capacity validationと保有混在のcapacity不足を区別。宝具Lv変更と初期OC修正をatomic commandで適用。 | Verified: APP |
| Application admission → finite candidates | 両condition modeで開始NP候補を1つに固定。own OC boostの間接寄与を判定し、適用条件／実効OC／NP倍率依存をdomain proofとdedup keyに含める。 | Verified: APP |
| Executor preparation → NP → damage | gauge由来base OCとactive OC boostを別stateとして保持。自己へ適用可能なrecipientをcanonical解決し、NP本体処理前のOC確定・上限・action終端の回数消費・変身NP・NP前後effectを順序通り評価。 | Verified: EXEC / APP |
| Transaction recovery → application | clone、rollback、failed command、retryでgauge／OC boost／countを同時復元。失敗後に加算残留、回数先消費、二重適用を起こさない。 | Verified: EXEC / APP |
| Request → URL／worker／cache／portable | versionと初期OC identityを同時切替。旧payloadの曖昧な開始NPをOC1で補完せず拒否し再生成commandへ戻す。異なるOCのcache混用・stale resultを拒否。 | Verified: IDENTITY/UI |
| Result → UI／calculator replay／reset | 初期OCと発動時OCを区別して表示し、採用開始NP／ordered plan／policyを同じexecutorで再現。normal resetは開始100%と通常policyへatomicに戻す。 | Verified: APP / IDENTITY/UI |
| Production audit → downstream baseline | 共有master一回でfamily inventory、NP5再最適化、合法OC matrix、parity／damage input差、candidate数とhot-pathを測定。06.45へpolicy付きbaselineを渡す。 | Verified: PRODUCTION / 性能の確定 |
| New external support／full turn simulator | ランキングの製品範囲外。既存calculator経路の正規化監査を理由に機能追加しない。 | N/A: no product requirement |

### State-by-path counterexamples and outcome classes

`calculated`、policy上のcapacity不足／到達不能 `unavailableUnderPolicy`、修正可能な必須input不足
`inputRequired`、矛盾input／IR `invalid`、意味未対応 `unsupported`を分離する。確率不成立やpolicyによる
不採用は成功した加算と区別したeffect evidenceで保持し、それだけでprofile全体をunsupportedにしない。

| State × path | Minimum guardrail | Status |
| --- | --- | --- |
| NP1／NP2〜4／NP5 × initial OC1〜3 | 境界内は同じ初期gauge、指定NPで境界外のrequestは拒否。保有混在は容量不足だけtyped unavailable。UI変更は修正値も表示。 | Verified: APP / IDENTITY/UI |
| baseline／satisfied × included／excluded | 全四policyで初期gauge不変。optional own boostのadmission／不採用とstructural-required actionを区別し、最大化名目で外部加算を混入しない。 | Verified: APP |
| own gauge gain／loss × boost0／+1／+2／cap超過 | 初期100%→自前charge→base OC2、初期300%＋2→OC5、NP不足、複数加算と上限を小fixtureで固定。 | Verified: EXEC / APP |
| skill／automatic／NP-before／NP-after × self／party-including-self／other-only | 対象・タイミング・確率・条件・期間／回数・重複制約を保持。自身へ不適用と未解釈を分離し、当該NP後の効果を先取りしない。 | Verified: EXEC / APP |
| transform NP → attack NP × count1／複数回 | 実際のNP使用だけで正しい回数消費。先行NPで使い切った加算を攻撃NPへ残さず、再付与も正しい順序で反映。 | Verified: EXEC / APP |
| failed transaction／rollback／clone／retry | gaugeとboost duration/countが同時復元。数値・outcome・evidenceを共通calculator／rankingで比較。 | Verified: EXEC / APP |
| missing／conflicting／unknown canonical semantics | 無効果・OC1・成功へfallbackせず明示停止。production-negativeもschema-legal focused fixtureで検証。 | Verified: IR / EXEC |
| OC-sensitive NP cells × quantity reduction／ordered plan | 小さい有限全探索oracleと採用候補一致。NP level列を再利用する場合はcomplete input同一性を証明。 | Verified: APP |
| URL／worker／cache／portable × OC change／old version／normal reset | identity衝突0、stale拒否、同一入力replay、旧request拒否後の再生成、reset後の非baseline state残留0。 | Verified: IDENTITY/UI |

Additional Step 1 counterexamples（既存matrixへのdelta、実装単位はTasks正本）:

| State × path | Minimum guardrail | Status |
| --- | --- | --- |
| transform OC1 → attack OC3 × OC-dependent value/proc | 各useのreceiptで異なるcellを評価。先行NPでCount1消費後、当該NP-after再付与だけを次の攻撃NPへ残す。 | Verified: EXEC / APP |
| constant CE count1／3／LB4 × transform→attack | constantをNP使用前に一度だけ付与し、変身NP消費を記録。effect projectionで再付与しない。raw LB4のmappingを検証する。 | Verified: IR / EXEC |
| conditional boost × field/recipientState／all/any/not／unknown × preparation/retry | materialized factsで通常loopと準備が同じtruthを読む。unknownをno-opや成功へ落とさずrequired-input recoveryへ接続。 | Verified: EXEC / APP |
| boost + sibling invalid × group rollback／preapply | gauge・instance・残回数・receiptをatomicに戻す。form/variant preapplyから加算を二重実行しない。 | Verified: EXEC / APP |
| remove/move/extend/shorten × active OC／unrelated state | canonical selectorで関連性を証明。OC対象writerを汎用stateMutation成功として捨てない。未対応は明示停止。 | Verified: IR / EXEC |
| policy reapply／without-area projection × conditional OC | prepared scenarioの再利用で以前のeffective OCが残らず、fresh executionとinput/outcome/receipt一致。 | Verified: APP |
| charge-only／OC-only × sensitive/insensitive NP／structural-required | baseline admissionも間接寄与を発見。unknown dependencyにendpoint reductionを使わず、小domain全探索oracleで採用plan一致。 | Verified: APP |
| owned NP5+initial3 → population all→NP1 | population commandもinitial1への修正を明示しatomic適用。直接不正requestは拒否、保有混在の低capacity行はunavailable。 | Verified: APP / IDENTITY/UI |
| old-only／canonical-only／mixed contradictory × parser/migration/backup/draft/history/share | parserのunknown-key除去で旧overchargeが失われたまま成功しない。historicalOnlyと再実行を分離し、再生成commandへ戻す。 | Verified: IDENTITY/UI |
| selected NP1 result matrix vs separately optimized NP5 × cache | 共通完成inputの一致だけでdamage matrixを再利用。NP5最適planとOCが異なる列をNP1採用scenarioの列から代用しない。 | Verified: APP / PRODUCTION（NP5独立選択差分） |
| turn progression／skill reuse／new ranking support | 同一turn有限準備の外。durationの保持をturn simulatorや支援UI追加へ拡大しない。 | N/A: outside approved product scope |

The current dispositions above supersede the planning-only status. Runtime counterexamples are
Verified by the evidence groups in the 2026-09-08 closure section. The 80-condition production matrix also passes with zero selected-result parity failures.
The performance comparison and final quality gate pass. All TSK-06.48 scoped paths are Verified
or justified N/A, with Blocking and task-local Deferred both zero.


## TSK-06.43 — review approval and next-task handoff (2026-09-06)

Independent re-review and root adjudication: **Approved**, PIR-001–003 all **Resolved**,
no new material finding, Blocking **0**. Reviewed HEAD was `26eae69` plus the complete
79-file implementation; all hashes matched the implementation response at review completion.

- PIR-001: preparation rejects stack-dependent resource/structural requirements before transaction
  commit through one shared typed support classifier; calculator/ranking/portable and all three
  state scopes, nested conditions, retry and transform-NP paths are covered.
- PIR-002: aggregate reduction observes executor-owned NP dependencies across all OC/NP cells,
  additional readers/writers and exclusive sources. Focused exhaustive oracles preserve maxima;
  unproved domains remain complete or explicitly unsupported.
- PIR-003: master admission rejects conflicting physical-source baselines across NP/effect/variant/CE
  definitions while permitting distinct reader caps. HEAD schema43 caches are rejected by schema44
  admission; no intermediate unpublished schema44 deployment is assumed.

Fresh reviewer verification: focused17 and production119 pass; final `pnpm quality` passes in
234.94s at `.test-results/2026-09-05T19-31-18-851Z-15-53be95`, unit495/production119/Playwright25,
zero skip/todo/retry/warning/unexpected console and artifact integrity errors. The complete 433-profile
candidate inventory, both representative maximum artifacts, audit digest and work counters equal
the initial review boundary. Stored controlled compile medians were independently checked:
5412.219ms → 5556.779ms (+2.67%), with unchanged counters. No fresh six-run performance benchmark
or separate manual browser session was run during re-review. Full append-only review history is
in the temporary external record `/tmp/fgo-lab-tsk-06.43-review-odmwuw5j/review.md`; this section
retains its completion evidence independently of that temporary file.

TSK-06.43 is done; TSK-06.45 is ready and unstarted. The next task reuses the existing 06.45
trigger/resource flow matrix below, verifies its default baseline against the committed master,
and closes relevance-aware admission, typed dependent amounts, HP/battle-point state and ordered
execution/recovery. Its default 433/433 ranking and 422/422 calculator goals must not be confused
with the satisfied-policy 385-ready/48-unsupported inventory measured for 06.43. Stack preparation
support and combined target-world/count conflicts remain explicit unsupported until their scoped
owners provide a proof; no numeric fallback or partial maximum is accepted. Later owners remain
06.44 contribution presentation, 06.5 final maximum and 07 Web/worker cutover.

The implementation/verification sections below are historical; their pending-review statements
are superseded by this approval.

## TSK-06.43 — accepted review findings implementation (2026-09-06)

PIR-001–003 were Accepted in the initial post-implementation review at HEAD `26eae69`.
The user authorized their implementation with「引き継いでください」. The reviewed 68 tracked
and eight untracked files still match the review snapshot; all existing changes are preserved.
The earlier Step 2 completion below is historical until this follow-up is verified and re-reviewed.

The inventory missed three direct boundaries: preparation target/field writers before stack-dependent
resource conditions, NP-body readers in aggregate domain reduction, and conflicting physical-source
defaults at master admission. These are schema-legal counterexamples, not observed production damage
regressions. Existing tests covered final attacker mutation, static aggregate readers with a standard NP,
and helper-level conflict rejection; they did not cross those boundaries.

| Delta / semantic owner | Required behavior and minimum counterexamples | Status |
| --- | --- | --- |
| PIR-001: battle-execution preparation support | All scopes and nested stack-dependent preparation requirements reject explicitly until preparation models all ordered writers. Never fund an attack using stale counts. | Verified: `stackPreparationSupport.test.ts` covers add/remove, 0/1/max, comparisons/composition, retry, transform-NP pre-consumption, calculator/ranking/portable; shared production inventory ratchets these requirements at zero. |
| PIR-002: executor dependency → application finite proof | Inspect NP-body dependencies across OC/NP cells as well as effect operations; preserve complete domains for shared readers, unknown live dependencies and exclusive sources. | Verified: `rankingStackDomain.test.ts` numeric stateTrait/traitExpression aggregate oracles, trait support boundary and nested/exclusive guards; complete production candidate inventory unchanged. |
| PIR-003: master admission | Reject conflicting defaults for one physical stack source before calculator initialization, while permitting different reader caps. | Verified: `stackMasterAdmission.test.ts` legal controls and conflicting NP/effect/variant/CE definitions; `stackInputDefaultsAgree` shared by master admission and execution merge. |

The PIR-001 support boundary is deliberately bounded: generic ordered battle simulation is outside
this task. Stack-dependent preparation activation becomes typed unsupported; ordinary stack modifiers
and NP damage remain supported. Source identity/default validation belongs to master-data, not Web.
No schema shape, candidate cap, snapshot tolerance or servant-specific runtime rule is added.
Verification: isolated production audit before/after ×3, focused semantic regressions, unit/production,
and `pnpm quality` as the final phase gate. Independent review retains finding resolution authority.

Implementation verification before the final gate: focused 17 tests pass
(`2026-09-05T19-09-04-373Z-44-25459c`), unit 495 pass
(`2026-09-05T19-09-43-491Z-15-c663f6`), final standalone production 119 pass in 34.68s
(`2026-09-05T19-17-08-150Z-15-4fad02`; same-boundary before 37.21s).
The complete `stack-candidate-domains.json` equals the pre-fix review artifact: 385 ready and
48 unsupported profiles, largest admitted bound 3,840, cap 4,096. Both representative maximum
artifacts (1101000/2501300), including scenario, policy, full input and NP1–5 output, are identical.
No production damage/input digest, generated master, screenshot or threshold was updated.

The expanded trait NP fixture exposes an existing support boundary: combined target-world witnesses
can conflict with independently assigned state counts. It remains explicit unsupported, with no
reduced numeric maximum. This follow-up does not implement that additional world-generation behavior.
The final phase gate and before/after timing records are appended to the external review record;
finding resolution and Task completion remain pending independent re-review.

## TSK-06.43 — Step 2 implementation and verification (2026-09-06)

Explicit implementation approval followed Step 1. HEAD remains `26eae69`; the two approved planning
notes were the only modified files at the Step 2 boundary. A0 baseline artifacts were captured before
product edits. The semantic cutover is **master manifest schema 44 / scenario schema 37 / engine 32.0.0**.
The published artifact is `20260906.01`, SHA-256
`6e96b3f11fdbdef82997be12c84076d4236651d23f4ee7662a4b66a6a272c8f8` (30,127,202 bytes).
Measured development artifact `20260906-tsk0643-3` differs only in its top-level version string;
substituting that string into the final bytes reproduces its SHA-256
`3ecb6b6b37bf5804ac1d6b56af3dfaea877d17ef3a2d193a762253ca825155c3` exactly.
Raw input and requirements are unchanged. Final `pnpm quality`: **PASS**, 269.27s, artifact
`.test-results/2026-09-05T17-54-49-795Z-15-ce11fd`. Unit 481 / production 119 / Playwright 25 pass;
skip/todo/retry/warning/unexpected-console counts are zero. Parent/child artifact verification has
zero errors. Production within the final gate took 46.95s. A0–A5 are complete; Blocking **0**.

### Implemented ownership and inventory delta

`master-data/stackQuantity.ts` defines physical stack identity `(scope, trait)`, baseline and the
reader's declared saturation bound. `stackQuantityNormalization.ts` is the only raw interpreter.
The 22 NP occurrences remain classified as 17 bounded stacks and five zero-cap finite trait sets.
The four old modifier occurrences become three supported aggregate readers (four atomic inputs) and
one typed unsupported missing-maximum reader. A legacy unbound input, positive-cap finite-trait tag,
duplicate source or contradictory source/cell/baseline is rejected. Different reader saturation caps
can share a physical source; the canonical input domain covers the largest live cap.

`stackLinear` reads the capped sum of constituent live counts. It is not a second independent
quantity and does not multiply aggregate capacity by the number of constituents. A self-source
stack on a support actor is explicitly unsupported when that actor's state is not represented;
it must not accidentally read the attacker's count. This adds one typed unsupported support
projection to the existing inventory. No runtime servant/name/raw-key branch was added.

Application resolves and validates `canonicalInputValues`, records baseline/maximum/witness origin,
and passes the initial count into both preparation and shared execution. The executor seeds once,
then owns add/remove/form/clone/rollback and current count reads. Ordinary actor counts, stochastic
successes and finite distinct-trait predicates retain their separate semantics. Web presents the
count and initial-assumption origin and rejects conflicting scenario/effect-input/candidate evidence.
Portable calculator replay preserves the scenario and contribution policy. Schema 36 ranking history
is historical-only on migration; current, old and mixed version boundaries are exercised by schema tests.

### Additional recurrence findings and minimum guardrails

The implementation inventory closed three boundaries missed by the initial central-path model:

- A boolean preparation key cannot distinguish counts 1 and 4. Preparation context and semantic
  state identity now preserve quantities; `preNoblePhantasmPlanner.test.ts` checks distinct counts
  with equal boolean presence. Existing transactional rejection and transform paths retain the
  cloned count state; `condition.property.test.ts` checks clone/add independence.
- A repeated-trait output array is bounded at 100 while a legal stack can exceed 100.
  `stackStateCounts` carries exact current quantities; the corresponding trait array carries
  presence once. The strict damage-input schema rejects disagreement. A 101-count fixture closes
  the output/worker boundary without increasing array or candidate limits. At the default production
  baseline, 18 complete inputs gain this metadata and three state arrays change representation;
  **all 422 calculator outcomes and damage rows remain unchanged**. Only the missing-cap reader's
  applied-effect evidence changes. The input-digest updates record this representational change.
- Full integer enumeration gives Wanjina an over-limit domain; independent enumeration of a
  two-source aggregate gives Habetrot 70,350 candidates. The initial plan required proof before
  reduction but had not separated aggregate observational equivalence from independent inputs.
  `rankingStackDomain.ts` owns two conservative proofs: an isolated nondecreasing NP multiplier
  uses endpoints; an isolated positive NP-buff capped sum uses one constituent for the maximum
  total and keeps the others zero. Additional readers/writers, count-dependent activation, form
  changes, signed coefficients or NP-buff rate changes disable the latter proof. The exhaustive
  two-source positive/negative oracle and an interior maximum at count 1 guard this boundary.
  Other sources retain full integer domains. Habetrot still has programs outside the proof and
  its complete upper bound is **7,950**, so that context remains typed unsupported; no candidate
  is truncated or silently omitted.

These are confirmed representation/inventory gaps, not servant-specific damage corrections.
`rankingStackDomain.test.ts` also verifies the same count scenario and complete input/result through
without-area policy reapplication. `stackQuantity.test.ts` covers explicit 0/1/max, non-minimum baseline,
add/remove after maximum (including live count above the reader cap), contradictory absence, invalid
bounds, exact calculator/ranking/portable replay and sparse count validation. Production-negative
field and multiple-source states are covered by the small aggregate fixture.

### Production evidence and intentional result changes

The shared master/pipeline digest includes NP quantity classification and all modifier stack inputs.
`productionMasterInventory.test.ts`, `specialInputInventory.test.ts` and the canonical audit ratchets
cover the whole production family without loading the master once per example. The former fabricated
six-stack selection (`1000900:8808:0`) now returns unsupported and no rows; its raw source declares no
maximum. The earlier selected NP1 average 60,245.67 is deliberately not retained. The other 24
formerly unsupported selections and all 419 default attacking-NP golden cases remain numeric.
All-attack-NP numeric closure still belongs to TSK-06.45, not this stack task.

Representative complete evidence is written by the shared production candidate-space suite to
`stack-maximum-1101000.json` and `stack-maximum-2501300.json`. The recorded run is
`.test-results/2026-09-05T17-09-56-287Z-15-39d738`. Each artifact includes scenario/build, target,
preparation commands, policy, candidate evidence, full damage input and NP1–5 output.
Both examples use natural Lv.90, Fou ATK+1,000, NP1 selection, OC1, skill Lv10,
no CE/support/mystic code, self included / conditional satisfied / area included.

| Example / canonical initial input | Preparation / target | Governing multiplier | Observed NP1 min / average / max |
| --- | --- | --- | --- |
| 平景清 `stack:attackerState:traitId%3A2759 = 4`, origin maximum | skill 1 → skill 3 → attack NP; saber/earth | Value2 1000 + Correction 250 × min(4,4), divided by 1000 = 2 | 303,774 / 337,357.925 / 370,942 |
| ワンジナ `stack:attackerState:traitId%3A2880 = 10`, origin maximum | skill 1 → skill 2 → attack NP; saber/sky | Value2 1000 + Correction 100 × min(10,10), divided by 1000 = 2 | 139,309 / 154,710.065 / 170,111 |

These final values are evidence for those complete scenarios, not a scalar patch or a comparison
against a differently built baseline. The small independent oracle compares every initial count
under the *same selected scenario, gauge and policy*; portable replay compares the complete input/result.

### Finite inventory and performance

The shared `stack-candidate-domains.json` artifact in that run records each profile's program,
quantity cardinalities and complete upper bound before allocation. For the measured satisfied
NP1/natural-level context, 433 profiles classify as 385 ready, 40 unsupported action
admissions, and eight unsupported finite domains. Ready profiles with live stacks: 12.
Representative complete bounds are 260 (four-stack NP) and 960 (ten-stack NP); the largest admitted
bound is still 3,840. Rejected bounds are 4,128 (three profiles), 4,132, 4,654, 4,874, 6,146 and 7,950.
This is an explicit completeness/support boundary under ranking §12: no partial maximum is returned.
The limit remains **4,096**. The artifact measures this context; it is not a claim of the later final
four-policy/all-NP-level maximum closure in TSK-06.5.

Same-command isolated measurements used
`pnpm test:diagnostic -- packages/calculation-application/src/productionAudit.test.ts`:

| Measurement | Before artifact runs | After artifact runs |
| --- | --- | --- |
| 1 | `2026-09-05T16-09-24-303Z-15-07205b` | `2026-09-05T17-19-10-496Z-16-2bdc16` |
| 2 | `2026-09-05T16-09-54-398Z-15-d5a296` | `2026-09-05T17-19-21-833Z-101-bc89d6` |
| 3 | `2026-09-05T16-11-34-025Z-15-e91447` | `2026-09-05T17-19-32-728Z-186-b17456` |
| median read / parse / compile ms | 111.62 / 1,714.77 / 6,349.82 | 77.40 / 1,506.89 / 5,940.15 |

Each run reads/parses/compiles once. Counters are unchanged: generated 6,360, deduplicated 3,949,
damage requests 1,924, distinct inputs 1,298. Compile median is about 6.5% lower; there is no measured
hot-path regression or relaxed ratchet. Production suite baseline was 24 files / 117 tests / 43.46s
(`2026-09-05T16-12-24-070Z-15-d93227`); the final standalone production run passed 24 files /
119 tests in 47.76s (`2026-09-05T17-41-11-029Z-15-211111`, about +9.9%). This includes the two
representative production cases and the reduced worker share described below; it is distinct from
the one-worker application compile measurement. All assertions pass with the original time limits.
The added full family/domain evidence reuses the existing suite master load. No timeout or complexity
limit was increased. One intermediate production run overlapped a full TypeScript rebuild and reported
test timeouts; final production and audit measurements run without that competing rebuild.

A5 diagnostic attribution: the first full quality attempt after lint passed hit the unchanged 5s
production timeout in E0 inventory, MLB-only golden and unsupported-convergence default golden.
Baseline `26eae69` / production artifact `2026-09-05T16-12-24-070Z-15-d93227` passed those tests in
4,652 / 4,881 / 4,852ms. The current code also passed them in 4,633 / 4,620 / 4,746ms in
`2026-09-05T17-22-36-094Z-16-499ac6`, but quality run `2026-09-05T17-29-31-557Z-15-f81c9c`
reported 5,162 / 5,061 / 5,160ms timeouts. Effective production command, lockfile and worker settings
are unchanged. Classification: **environmentDependent** (observed timing nondeterminism); this does
not prove causal independence from the change or an unchanged baseline reproduction.
The recurrence inventory also found seven full master parses across the seven cases of those three
suites. Their setup now shares one read/parse per suite (three total), preserving all assertions and
an explicit 5s setup bound. This removes repeated work instead of increasing timeout or worker limits.

The shared-setup follow-up (`2026-09-05T17-37-47-635Z-15-2fa374`) still exceeded the 5s parse
setup bound and also timed out the production target-state inventory. The earlier recurrence fix
removed intra-suite duplicate parses but missed **inter-file concurrent first parses**. The existing
production worker-share owner in `vitest.config.ts` therefore changes from 75% to 50% (9 to 6 workers
on this host's reported 12 CPUs). Unit workers, all 5s bounds, assertions and candidate cap stay unchanged.
This is an execution-resource bound, not a larger semantic support limit. Final suite timing below
includes this worker-share change; isolated one-file audit medians use one worker in either configuration.

Visual closure: quality run `2026-09-05T17-44-00-153Z-15-ece732` passed unit, production (40.79s),
master validation and build. Its four screenshot failures were inspected: desktop changes were only
DB/engine version text; mobile gained one wrapped line because of the long development artifact name.
The release version now follows the existing short `YYYYMMDD.nn` format (`20260906.01`), preserving
mobile layout. Five version-bearing calculator/ranking screenshots (including the detail screenshot behind the
first failed ranking assertion) are refreshed after inspection. PNG comparison against `26eae69`
confirms identical dimensions: 320×2930, 390×2726, 1440×1515 and two 1440×1000 images; changed pixels
are limited to the DB/engine text rows (314, 314, 340, 120 and 120 pixels). No CSS/layout change,
screenshot tolerance or masked region is added. The focused update run
`2026-09-05T17-51-43-266Z-16-a2be14` passed all ten test bodies, but correctly remains a wrapper
contract failure because snapshot-generation console messages are not allowlisted; it is not the
completion gate. The final ordinary quality run must have zero unexpected observations.

Current unit verification: 83 files / 481 tests pass
(`2026-09-05T17-21-13-037Z-15-41ba24`). The current flow tables below replace the approved planning
statuses with scoped evidence. Implementation Blocking: **0**; the final quality gate above completes A0–A5.

## TSK-06.43 — Step 1 stack quantity investigation and implementation plan (2026-09-06)

### Boundary and specification

This boundary and inventory were captured during **Step 1**; Step 2 results above are current. Start HEAD is
`26eae69dbfea06d776c9515b3e0e4430297a2250`; the initial worktree was clean. Repository `AGENTS.md`,
`systematic-review-guidelines.md`, and the structural-finding template in
`prompt-engineering-guidelines.md` were read. Only this note and the Task source were changed during Step 1.
Requirements remain unchanged: ranking requirements §5.2, finite completeness, stack inventory and
acceptance criteria, plus TSK-06.43, govern this work. All-current-attack-NP numeric closure remains
TSK-06.45; final four-policy maximum closure remains TSK-06.5.

User-visible outcome: 通常のみ uses the canonical baseline; 成立込み includes the declared maximum
stack quantity in a legal scenario, displays the count and assumption origin, and opens/replays that
same scenario in calculator. A number must never stand in for missing or contradictory semantics.

Ownership and invariants:

- Pipeline interprets raw count vocabulary and produces typed quantity identity, source/read scope,
  baseline, maximum and support evidence. Neither names nor raw keys decide application/Web behavior.
- Application owns finite scenario selection and commands. Battle execution owns quantity reads,
  constraint evaluation and ordered mutations. Web presents canonical evidence.
- Distinct matching traits (`traitCount` condition today), repeated state instances, actor counts,
  available actions, and stochastic successes are separate quantities. They do not share an inferred maximum.
- Initial assumption, actually applied preparation effects and final count are distinct. Seed once
  before preparation, execute changes once, and preserve rollback and replay. Do not reassert the
  initial maximum after a removal or form transition.
- Every selected family, target/field fact, input, choice and action must coexist in one world.
  A maximum on a damage reader is a saturation cap, not automatically a capacity of every state writer.
  Unknown support cannot be hidden by excluding its candidate or returning the baseline number.

### Read-only production inventory at the start boundary

Inventory was obtained by recursive JSON traversal of the published master and matching raw function
parameters, without normalizing/recalculating the master or changing artifacts. Occurrence means stored
canonical damage/input occurrence, not unique servant and not a candidate count.

- Published master SHA-256: `80c025e62e5916ec89cdc00d8d76cec187bc2703780468eb83e7824781e4a026`.
- Local `data/raw/nice_servant.json` SHA-256:
  `1abf690ac22bcdd427788e0ff545320af491ee9f90fbc08a56af9603a217118f`.
- All 22 `traitCount` damage occurrences have stable target/source/cap across the 5 OC × 5 NP cells.
  Caps are 0 × 5, 4 × 1, 10 × 15, 12 × 1; absent cap is 0 occurrences. This is source evidence,
  not proof that every occurrence is currently admitted/executable.

| Damage reader population | Occurrences | Evidence examples (names only identify fixtures) |
| --- | --- | --- |
| positive cap, attacker combined trait/state | 7 | シャルルマーニュ12、スーパーバニヤン10 × 2 variants、平景清4、クロエ10、ワンジナ10、蒼崎青子10 |
| positive cap, attacker state only | 1 | テュフォン・エフェメロス10 |
| positive cap, target state only | 6 | ジャック・ド・モレー、バーヴァン・シー、ビショーネ、ロクスタ、巌窟王 モンテ・クリスト、殺生院キアラ、各10 |
| positive cap, target combined trait/state | 3 | ウルズ10 × 2 variants、ロムルス＝クィリヌス10 |
| zero cap, target combined / state only | 4 / 1 | 宮本武蔵、黒姫、Ｕ－オルガマリー × 2 / ウィリアム・テル |

Zero-cap entries must be classified separately from missing maximum: their finite matching-trait or
predicate population is not a declaration of repeatable maximum stacks. Mixed base/state reads and
exclusive class/attribute predicates remain subject to existing semantics; do not convert these five
entries into zero damage or unsupported merely because `ParamAddMaxCount` is zero.

Four `effectStackCount` inputs exist across the whole master (none outside servant skill effects):

| Source occurrence | Published baseline / maximum | Raw evidence / required treatment |
| --- | --- | --- |
| ビショーネ `23547:0` | 0 / 10 | `ParamAddOpIndividuality`, explicit cap 10; preserve actual opponent-state source despite input owner `attacker` |
| キングプロテア `8808:0` | 0 / 6 | `ParamAddSelfIndividuality`, **no** `ParamAddMaxCount`; 6 is normalization fallback, not declared maximum |
| カーマ `7592:0` | 0 / 10 | opponent individuality, explicit cap 10; provenance is not interchangeable with all state sources |
| ハベトロット `23559:0` | 0 / 5 | two self individuality keys, explicit cap 5; aggregate source, not two independent maxima |

The missing-cap case must lose the invented fallback. An unsupported maximum is an allowed intermediate
outcome under §5.2, not permission to omit current production from the later TSK-06.45 numeric gate.
Do not infer a count from buff `maxRate`, turn duration, or skill reuse. A separately evidenced canonical
source bound may be used only when the pipeline can prove its meaning; otherwise emit typed unsupported.

Adjacent input inventory: `procSuccessCount` 5, `criticalStars` 22, `fieldActorCount` 1,
`matchingActorCount` 4, `currentTurn` 8, `availableSkillCount` 1, `friendshipLevel` 1.
These stay under their existing owners; the stack change must not rewrite their domains. Generic
`traitCount` predicates still count satisfied trait entries (`condition.ts`), while NP damage counts
instances (`npDamageOperation.ts`). This difference is intentional until a new typed stack reader is used.

Representative raw governing rule, independent of other buffs: both example NPs have `Value2=1000`;
平景清 has `Correction=250, ParamAddMaxCount=4`, ワンジナ has `Correction=100, ParamAddMaxCount=10`.
The NP stack multiplier is 1 at count 0 and `(1000 + correction × min(count, cap))/1000` at positive
count: 1.25/2 at 1/4 and 1.1/2 at 1/10. These are multiplier expectations, **not observed final damage**.
Step 2 must record build, NP/OC, preparation program, target, policy, full damage inputs and final values.

### Structural finding and earlier inventory gap

1. **Mechanism — confirmed:** `effectNormalization.ts:normalizeNpDamageSpec` preserves optional
   `maximumTargetCount`; `npDamageCompilation.ts:noblePhantasmDamageDependency` emits only
   `atLeast:1`. `rankingWorld.ts` and `rankingFieldWorld.ts` enumerate boolean presence, and
   `rankingQuantityWorld.ts` has no stack dimension. `schema/src/index.ts:worldFactAssertions`
   accepts trait booleans or the fixed quantity union. `state.ts:applyWorldFacts` only raises a
   present trait to at least one; `npDamageOperation.ts` can consume greater instance counts.
   `effectNormalization.ts` also defaults missing stack cap and linear maximumUnits to 6;
   `rankingCanonicalInputs.ts` chooses minimum for baseline and usually only maximum for satisfied.
2. **Mismatch — inference from these readers:** the source cap was treated as an executor-side clamp
   and the condition witness as truth, leaving no canonical quantity connecting the two. An input's
   UI owner is not enough to identify its physical count source or link another reader of that source.
3. **Missed detection — confirmed scope gap:** earlier condition closure covered polarity/composition
   and boolean trait witnesses (`rankingWorldWitness.test.ts`, `rankingFieldWorld.test.ts`), while
   executor count fixtures (`npDamageOperation.test.ts`) supplied counts directly. That does not test
   pipeline cap → planner count → preparation → replay. This delta expands the earlier condition
   inventory explicitly; it is not another servant-specific correction.
4. **Recurrence/minimum guardrail — inference:** every repeated quantity, shared-source reader,
   preparation writer, transport parser and recovery path can lose count or provenance. Guard with one
   production digest and small source × state × path fixtures, including production-zero schema states.

### Canonical design and changed flow inventory

Extend existing master-data/schema contracts; no new package. Use a discriminated quantity definition
that separates finite matching traits from stack instances and unsupported definitions. A stack
reference includes canonical identity, actor/state read scope, constituent identities and aggregation,
source provenance, baseline count, declared maximum and its evidence. Do not keep an independent
unbound `effectStackCount` input as a second source of truth. Multiple readers of the same physical
quantity share one assignment; different reader saturation caps are not automatically contradictions.
Missing declaration and internally conflicting declarations produce distinct diagnostics.

A serializable scenario assumption references that definition and records count plus origin
(baseline / satisfied maximum or other finite witness / explicit calculator input). The executor
resolves it against the selected master/profile; a client-supplied maximum never overrides the master.
Ordinary baseline is the declared initial value (0 for the observed external stack inputs), not always
`minimum`; preparation can then add/remove actual states. Preserve the ordinary candidate in satisfied
mode, including a non-minimum baseline fixture. Calculator can use typed count commands and replay the
selected ranking policy without reselecting maximum.

For the new bounded stack dimension initially enumerate legal integers from baseline/domain boundaries
through the declared maximum, including 0 where legal; deduplicate shared sources before the product.
This avoids an unproved monotonicity assumption under `atMost`, `equal`, negative modifiers or ordered
writers. Any later boundary-only reduction requires a small exhaustive equivalence proof. Certify the
complete product including action/choice/target/field/other input dimensions **before allocation**.
Keep 4,096 unchanged; fail closed beyond supported bounds, never truncate or ignore a blocking branch.
Finite source semantics that cannot be represented within the existing bounded preparation model are
unsupported, not an invitation to simulate prior turns. Validate support for the live read set before
publishing a baseline or maximum; inclusion-disabled contributions retain their ordinary outcome class.

The following current statuses close the approved Step 1 flow inventory using the Step 2 evidence above.
Units A0–A5 remain in the Task source; final quality is tracked separately.

| Direct path / current code anchors | Required transition or guard | Status |
| --- | --- | --- |
| raw → `effectNormalization.ts`, `master-data/src/index.ts`, generated master | distinguish cap/source/baseline; remove fabricated 6; validate every OC/NP/value cell and aggregate source | Verified: Step 2 scoped fixtures / production evidence |
| `rankingStaticSemantics.ts`, `runtimeInputIdentity.ts`, `rankingCanonicalInputs.ts` | collect damage/preparation-live count readers, preserve source identity across occurrences; default ≠ minimum | Verified: Step 2 scoped fixtures / production evidence |
| `rankingCandidateSpace.ts`, world/field/quantity planners, `finiteSemanticProduct.ts` | shared stack domain, baseline inclusion, complete certificate, no second independent count axis | Verified: Step 2 scoped fixtures / production evidence |
| schema scenario → `scenario.ts`, `preNoblePhantasm.ts`, `preparationState.ts`, `preparationTransaction.ts` | seed before first preparation read; current Set-based state must not erase quantities; preserve count through command transitions | Verified: Step 2 scoped fixtures / production evidence |
| `candidatePreparation.ts`, `candidateSelection.ts`, `constraints.ts`, `condition.ts` | new count predicate shares ownership with global validation; boolean/general traitCount semantics remain distinct | Verified: Step 2 scoped fixtures / production evidence |
| `state.ts`, `candidateExecution.ts`, `candidateRollback.ts`, variant preapply | add/remove/suppress, form replacement, clone/rollback/retry and preapplied operation skip preserve counts exactly once | Verified: Step 2 scoped fixtures / production evidence |
| `projection.ts`, `npDamageCompilation.ts`, `npDamageExecution.ts`, `npDamageOperation.ts`, `foldDamageInput` | count reads and source evidence agree with final damage; avoid duplicate base/state count and expanded-array limits | Verified: Step 2 scoped fixtures / production evidence |
| `rankingPolicyCandidates.ts`, `rankingCandidateSelection.ts`, `rankingExecution.ts`, prepared damage cache | nonnumeric blocker is not hidden by baseline; selected without-area policy reuses identical count scenario; cache keys distinguish damage-changing counts | Verified: Step 2 scoped fixtures / production evidence |
| `effectControls.ts`, `scenarioCommands.ts`, calculator controls, `rankingDetailPresentation.ts` | typed count edits; remove stale references on servant/variant/source change; count/origin display, no label-based rules | Verified: Step 2 scoped fixtures / production evidence |
| `rankingContracts.ts`, Web `rankingResponsePayloadSchema.ts` / `rankingEffectResponseSchema.ts`, worker protocol | preserve complete scenario/evidence, reject conflicting count/evidence or unknown source; count-sensitive request/result identity | Verified: Step 2 scoped fixtures / production evidence |
| `portableCalculation.ts`, `rankingHandoff.ts`, draft/history/share/backup adapters and schema migrations | full request survives handoff, same-version replay and stored-result comparison; rejected edits/upgrades retain prior request/result | Verified: Step 2 scoped fixtures / production evidence |
| version/cache recovery → application/UI | bump schema/engine for semantic cutover; old ambiguous ranking requests historical-only/discard/reject per existing boundary, never invent maximum; migrate unaffected data only when identity is provable | Verified: Step 2 scoped fixtures / production evidence |
| complete production inventory/damage/performance proof | one shared load/compile per audit; capture changed inputs and outcomes, including newly unsupported missing-cap case | Verified: Step 2 scoped fixtures / production evidence |
| general resource numeric closure / logical contribution UI redesign / final maximum | existing later owners; stack data and minimal count/origin display must already work in 06.43 | Deferred: TSK-06.45 / TSK-06.44 / TSK-06.5 |
| general prior-turn simulation and skill reuse | outside approved finite preparation semantics | N/A: explicitly outside requirement |

### State-by-path counterexamples and expected outcomes

| State / counterexample | Generation / execution expectation | Display / recovery expectation | Status |
| --- | --- | --- | --- |
| count 0, 1, maximum; baseline 0 and schema-legal baseline > minimum | exact count and cap multiplier; satisfied contains baseline; no automatic maximum for general quantities | calculator/ranking same complete input; origin and count retained | Verified: Step 2 scoped fixtures / production evidence |
| `atLeast`, `atMost`, `equal`, nested `all/any/not`; decreasing or saturated contribution | independent exhaustive finite oracle; correct negative witnesses and no local-max sum | selected world reproducible without rerunning selection | Verified: Step 2 scoped fixtures / production evidence |
| absent max, negative/noninteger count, baseline > max, contradictory source metadata | missing support → unsupported; malformed/contradictory state → invalid; never guessed 0/6/maximum | diagnostic survives worker/replay; no numeric maximum | Verified: Step 2 scoped fixtures / production evidence |
| raw zero-cap finite trait set vs missing cap on repeatable source | keep existing finite matching semantics; no invented repetitions | no false unsupported for the five finite-set occurrences | Verified: Step 2 scoped fixtures / production evidence |
| two independent families; two readers of same source with different caps; aggregate two source traits | one assignment per physical source, combined constraints, no double credit; source totals and cap reads consistent | stable canonical identities, one assumption per source | Verified: Step 2 scoped fixtures / production evidence |
| source count positive + absent source trait; exclusive target/field/choice; base + state overlap | detect impossible assignment; distinguish legal alternative from invalid admitted input; honor source provenance | unsupported validation stays unsupported, not “条件不成立” | Verified: Step 2 scoped fixtures / production evidence |
| seed max then add/remove/suppress, transform, failed action, rollback/retry, preapply | seed once; mutate live state in order; no stale count, lost count or double application | initial assumption distinct from applied count/effects | Verified: Step 2 scoped fixtures / production evidence |
| missing calculator input vs planner-owned witness; policy exclusion vs stochastic failure | inputRequired is repairable, exclusion/failure is ordinary non-application; semantic invalid/unsupported remains separate | controls offer only appropriate repair; unknown maximum is not a user-input prompt | Verified: Step 2 scoped fixtures / production evidence |
| selected maximum with and without area; direct calculator, ranking-origin calculator and portable request | same scenario and contribution policy yield same input/result; no independent maximum reselection | handoff, saved result comparison and replay parity | Verified: Step 2 scoped fixtures / production evidence |
| canonical-only, old-only, mixed contradictory payload; unknown identity, stale master/version, tampered evidence | strict parser/semantic validation; preserve unaffected data only where unambiguous | failed mutation/upgrade retains prior state; historical-only stays non-executable | Verified: Step 2 scoped fixtures / production evidence |
| production-zero: multiple family/cap disagreement, field stacks, OC/NP-varying domain, non-minimum baseline | focused fixture or explicit unsupported with no numeric fallback; zero-occurrence ratchet detects new production | never generalize from 22 current NP defaults | Verified: Step 2 scoped fixtures / production evidence |
| complete candidate product at/beyond 4,096; irrelevant quantity source | certify exact bound; reject beyond support before materialization; omit only proven dead readers | no partial best number or cache alias | Verified: Step 2 scoped fixtures / production evidence |

Step 1 recorded planning Blocking **0** and no unresolved product-specification question. The user
then explicitly approved Step 2. All scoped runtime paths now have verification evidence above;
final phase completion is verified by the passing `pnpm quality` above. Later tasks retain only their already assigned scope.

## Requirement v0.10.1 all attack-NP coverage — authoritative current planning delta

### User-visible outcome, invariant, and earlier review gap

Every playable attack-NP profile in the published master must receive a numeric result. A typed `unsupported`
outcome remains necessary to fail closed on future unknown semantics, but it is not an acceptable final bucket for
current production data. Calculator and ranking must reach that result through the same application compiler and
ordered executor; ranking policy may select scenarios but may not implement a second damage or resource model.

The current verified baseline is 433 AttackProfiles: 393 ranking rows plus 40
`unsupportedActionAdmission` exclusions. All 40 are attack profiles (38 servants), not the 47 servants whose
inventory contains only non-attack NPs. The default calculator baseline is 420 calculated plus 2 unsupported out
of 422 scenarios. The data pipeline already emits damage semantics for every playable attack-NP variant; its six
raw exclusions are two alternate identities already represented by canonical profiles and four non-playable
servant types. Therefore this is an execution/admission closure, not missing servant data or permission to omit an
attack NP.

The TSK-06.41 review gap was accepting one coarse `unsupportedActionAdmission` reason without expanding the
recurrence matrix across `triggerScope × damageRelevant × timing × resource reader`. That missed two mechanisms:

- 25 profiles are blocked by operations that the attack-NP execution path does not read: 17 command-card-only
  trigger profiles and 8 profile occurrences whose relevant operation is non-damage-only.
- The remaining 15 profiles use six dependent-amount families: target NP sum, NP from targets, individual NP sum,
  HP from targets, individual NP-buff sum, and multiplied NP. They require typed quantity/resource reads, not a
  servant-specific exception.

The two default-calculator failures expose the same ownership boundary: one HP-dependent ordered path needs an
explicit maximum/current HP basis, and one battle-point-dependent path needs the current amount plus phase
thresholds. Pipeline emits canonical state, application constructs commands and required input, execution is the
only reader, and Web only presents or supplies typed state. The model remains bounded to the finite preparation
phase before the attack NP; general turn passage, enemy AI, and battle simulation are out of scope.

### Changed flow inventory

| Path | Owner／expected transition | Planning status |
| --- | --- | --- |
| playable raw attack NP → AttackProfile／damage function | pipeline canonical join; alternate and non-playable exclusions remain typed | Verified: current inventory has no missing playable attack damage function |
| operation → attack-NP relevance | canonical trigger scope, timing, recipient, and damage relevance decide whether the executor can read it | Deferred: TSK-06.45 |
| dependent amount → resource read | pipeline emits a closed typed expression; executor resolves it against candidate-local state | Deferred: TSK-06.45 |
| HP／NP／battle-point initial state → ordered mutation | application constructs typed state from comparison basis or explicit calculator input; executor applies and rolls back transactionally | Deferred: TSK-06.45 |
| result → ranking row／calculator recovery | calculated profiles become rows; missing future semantics stay nonnumeric with no fallback | Deferred: TSK-06.45 |
| URL／worker／detail presentation | consumes canonical state and outcome without inferring game rules | N/A: no new Web semantic owner; typed fields flow through existing TSK-06.42／07 boundaries |
| full policy maximum／digest | proves current production nonnumeric outcomes remain zero after maximum selection | Deferred: TSK-06.5 |

Implementation order is TSK-06.46 and TSK-06.47 → TSK-06.42 → TSK-06.43 → TSK-06.45 → TSK-06.44 → TSK-06.5. Planning Blocking is 0;
runtime paths remain Deferred until their owning task verifies them.

### State-by-path counterexamples

| State | Admission／construction | Execution／selection | Expected outcome | Status |
| --- | --- | --- | --- | --- |
| command-card-only trigger beside attack NP | retain typed operation but do not mark attack-NP path unsupported | executor does not read the trigger in NP scope | profile remains calculated | Deferred: TSK-06.45 |
| non-damage operation with no damage/resource reader | preserve it in source program and evidence | no fabricated damage effect or profile-wide veto | profile remains calculated | Deferred: TSK-06.45 |
| dependent amount with complete target/resource state | bind typed source exactly once | ordered executor resolves amount then mutates | calculated with reproducible evidence | Deferred: TSK-06.45 |
| dependent amount with missing or contradictory state | do not guess zero／maximum | transactional failure; no partial commit | typed future unsupported／invalid, no numeric fallback | Deferred: TSK-06.45 |
| fixed HP mutation before HP-sensitive damage | construct selected-level maximum/current HP state | apply fixed mutation before damage read | calculator／ranking parity | Deferred: TSK-06.45 |
| battle-point mutation crossing a phase boundary | carry current amount and canonical thresholds | recompute phase from post-mutation amount | calculator／ranking parity | Deferred: TSK-06.45 |
| future unknown operation | inventory records first unsupported reader | no partial scenario or plausible number | fail closed without weakening current zero ratchet | Deferred: TSK-06.45 |

## TSK-06.42 Step 1 — authoritative comparison-basis planning delta

### PIR-001 implementation delta — worker response payload closure

The post-implementation review of `8c55613` found that the response parser validated only parts of
`RankingPolicyDetail`, then asserted the complete DTO type. Missing `attackProfile` and malformed nested
preparation actions reached presentation and threw. The previous response-path inventory checked normal
roundtrips, request rejection and stale identities, but missed malformed response payloads. This is a
transport contract gap; no production damage regression was established.

The response family includes summary attack metadata/exclusions and detail attack metadata, effects and
sources/explanations, input views, preparation commands/resources, contribution decisions/sets, warnings,
and nullable area detail. Runtime calculators/caches produce these DTOs; the protocol validates them before
`useRanking` publishes them to `RankingList`, `RankingEffectDetails`, `rankingDetailPresentation`, shared
stack/source presentation, or `rankingHandoff`. Existing canonical schemas remain vocabulary owners;
transport schemas must be assignable to complete application DTOs without an unchecked cast.

| Changed response state × path | Disposition |
| --- | --- |
| Normal populated/empty summary, detail with null/non-null area, ready/error | Verified: `rankingWorkerProtocol.test.ts` roundtrip, render and portable replay |
| Missing metadata, malformed nested action/resource/effect/input/contribution/warning and area equivalents | Verified: grouped corruption matrix in `rankingWorkerProtocol.test.ts`; complete DTO schema type checks |
| Matching identity malformed detail → hook → presentation; subsequent valid reply | Verified: `useRanking.test.tsx`; malformed replies do not publish or consume pending request |
| Stale identity and portable handoff parity | Verified: existing runtime/hook tests plus schema roundtrip → render → portable replay |
| Damage semantics, candidate generation, cache lifetime | N/A: response validation only; existing later-task scope unchanged |

Implementation evidence: `rankingEffectResponseSchema` and `rankingResponsePayloadSchema` validate the
complete application DTO shape using existing canonical schemas where available; protocol output is
assignable to `RankingWorkerResponse` without a cast. Optional absent fields remain absent. Error-stage
variants require their own payloads. Schema-legal nonempty input/condition/decision and area fixtures guard
against validation that accepts only today's default winner. No damage rule, portable identity, candidate
policy, expected number, snapshot or production digest was changed.

Focused verification: baseline runtime/hook 2 files / 6 tests, 2.58s
(`.test-results/2026-09-05T15-23-53-535Z-16-8021e7`); expanded response/runtime/hook 3 files / 11 tests,
2.65s (`.test-results/2026-09-05T15-31-50-806Z-45-9c6a3e`), warnings 0. The added work is five small-fixture
regressions, not extra production master calculations. Existing runtime canonical roundtrip test measured
74ms before and 91ms after with the new suite; these single samples are not a controlled parser benchmark.
Final gate: `pnpm quality` PASS, 237.77s, unit 458 / production 117 / Playwright 25;
skips, retries, warnings and unexpected console are all 0. Artifact:
`.test-results/2026-09-05T15-33-36-207Z-15-1325c7`. Production digest, inventory and counters match the
reviewed `8c55613` baseline (candidate 6,360 / deduplicated 3,949 / requests 1,924 / distinct 1,298).
Unit suite grew from 453 to 458 tests (7.75s → 8.40s); quality elapsed 235.29s → 237.77s. These suite
measurements include the added regression coverage and are not an isolated parser benchmark.
Implementation is ready for independent re-review; this evidence does not change reviewer adjudication.

Re-review completed, 2026-09-06: reviewer and independent reviewer confirmed PIR-001 **Resolved**, with
no new material finding; verdict **Approved**, runtime Blocking 0. The complete response family, normal
render/replay, malformed-response rejection and subsequent valid publication were rechecked. Fresh
`pnpm quality` PASS, 241.59s, unit 458 / production 117 / Playwright 25; skips, retries, warnings and
unexpected console 0. Artifact: `.test-results/2026-09-05T15-45-37-350Z-15-81df04`. Production digest,
inventory and candidate counters remain equal to the clean `8c55613` review baseline. Isolated parser
benchmark and manual browser verification were not run; automated browser coverage passed. The external
review record is `/tmp/fgo-lab-review-8c55613-x7hnuwgj/review.md`; this paragraph preserves the resolution
and evidence if that temporary record is cleaned up. Damage semantics and subsequent task scope are unchanged.

### Step 2 implementation delta (start `b4e0356`, planning `ab48586`)

The implementation now separates population, level basis and NP basis. Schema owns the strict wire selection
and pinned provenance shape; `rankingBasis.ts` owns validation/commands/resolution; `isOwned` owns membership;
`scenario.ts` retains the sole exact-ATK join. `rankingCandidateSpace` receives the resolved basis, and static
semantics, NP capacity and candidate selection consume its numeric NP level. `rankingStaticPreparation` reads
the shared fixed skill-level constant. No saved Fou/skills enter ranking scenarios and no servant ID exception
was introduced. NP matrices explicitly compile five specified bases, rather than reusing owned NP.

| Implemented path / counterexample | Evidence and disposition |
| --- | --- |
| six-input command, legal/illegal products, selected values only | Verified: `rankingBasis.test.ts`, `RankingConditions.test.tsx`; explicit owned → all changes only illegal axes |
| baseline/materialization, summary/direct detail, NP1–5 | Verified: ranking policy/candidate-space/rows fixtures and new owned-NP parity; one resolved NP reaches all consumers |
| NP0/no-build/empty population, missing ATK/present zero | Verified: stable owned fixture; 06.46 scenario fixtures reused; empty success remains distinct from request invalid |
| raw record key/embedded identity and worker initialize | Verified: exposed existing `servantBuildRecordSchema`; shared 06.47 current/v32/v33/v34 matrix extended to v35, worker lost-key fixture; failed context replacement clears the old context |
| URL parse/write, partial/duplicate/old/mixed input, filter edit/reset | Verified: `rankingState.test.ts`; no invalid-state worker initialization; invalid UI does not claim a zero-row calculation |
| worker summary/detail/cache/response identity | Verified: `rankingWorkerRuntime.test.ts` and `useRanking.test.tsx`; detail resolves only a canonical summary entry, cache hit/miss reject contradictory input, old-context replies cannot publish, unrelated CE/support edits do not recreate worker |
| portable constructor/schema/execute/recover/upgrade | Verified: strict basis ↔ scenario checks and master-dependent natural limit/fixed input check; replay reads no mutable build; 06.46 failed-attempt/handoff tests preserved |
| v34/v35 load/backup migration, old share, v33 historical retention | Verified: schema/repository/share fixtures; exact calculator/manual requests keep identity and runtime version; two-policy ranking draft discarded/history historical-only; no executable compatibility adapter |
| row/detail/request/calculator and profile mutation | Verified: stable owned product fixture, existing policy parity, real-worker E2E handoff and failed subject reset |
| current production inventory and default damage | Verified: shared audit records and counters agree with baseline except schema trace text; exact natural/Lv.90 availability reused |
| full policy maximum/all-current-NP numeric/stack/contribution presentation | Deferred: TSK-06.5 / TSK-06.45 / TSK-06.43 / TSK-06.44 |
| cache lifetime/cardinality, notice design and broader responsive/a11y polish | Deferred: TSK-07; this cutover only adjusts the expanded mobile summary and preserves existing layout limits |

Portable fixed-input validation deliberately permits canonical concrete target facts selected by the existing
planner; those facts must not be compared with an unprepared relative-class default. Source, Fou, skill level,
OC, equipment/support, explicit overrides, initial HP/BP and unmaterialized relative affinity remain checked.
Current numeric results for unknown future execution semantics are not fabricated; existing candidate/profile
outcome owners and their distinctions remain unchanged.

Verification and diagnostic attribution:

- Step 1 documents were committed as `ab48586`; `b4e0356` changes only this Task to `in_progress`. Worktree was
  otherwise clean. No unrelated user edits were present or removed.
- Unit: 79 files / 452 tests, warnings 0 (`2026-09-05T14-06-06-490Z-15-0114ae`). Production: 24 files / 117 tests,
  warnings 0 (`2026-09-05T14-08-13-979Z-16-20dbc0`). Final quality evidence is recorded below after the gate.
- Audit baseline is `255464b` source (documentation-only start commits do not change it), same effective
  `pnpm test:diagnostic -- packages/calculation-application/src/productionAudit.test.ts` command. Compile times:
  5,479 / 5,879 / 5,250 ms (median 5,479) before; 5,387 / 5,224 / 5,048 ms (median 5,224, -4.6%) after. Baseline
  artifacts: `2026-09-05T13-38-49-004Z-15-81aced`, `13-39-15-193Z-15-2ac8b0`, `13-39-34-980Z-15-58c624`;
  after: `2026-09-05T14-02-43-120Z-17-458093`, `14-03-52-765Z-16-0dd6c6`, `14-05-00-526Z-15-4f16ca` (all
  `.test-results/`, omitted date prefixes are the same date). The overlapping lint run at `13-57-52` is excluded.
- `introducedByChange`: the shared audit digest mismatch is absent on the three baseline runs and present in
  the first post-change production run (`2026-09-05T13-54-01-290Z-16-ee1757`). Full record comparison proves the
  only 815 leaf changes are `executionTrace[].detail: damage_resolution_schema_v35 → v36`. Inventory, failures,
  candidate 6,360 / deduplicated 3,949 / requests 1,924 / distinct 1,298 and all numeric damage are unchanged.
  New application digest: `482e10bb1fc7be056d6fa122bf57c3ff594fcf48dd4e794f0f6b20aec364eff9`.
- Golden engine envelopes were advanced to 31.0.0 without changing inputs or expected damage. Their initial
  version assertions are explained by the explicit engine bump; baseline rerun of those individual tests was
  not performed (`unverified` diagnostic provenance beyond the recorded prior 06.47 quality evidence).
- `environmentDependent`: the production run overlapping the Next build reports six execution failures
  (`2026-09-05T14-06-07…`); the same suite succeeds sequentially with no semantic/test-limit changes at
  `14-08-13-979Z-16-20dbc0`. This is not used as a performance comparison or a reason to relax limits.
- The snapshot-update command's six browser tests pass, but the runner rejects screenshot-regeneration console
  output as an unexpected observation. No allowance is added; the final non-update quality run must pass.
  The 320px row fixture now scrolls the row to the center so the fixed navigation does not obscure its capture.

Final integration review gap (same pinned-scenario family): the Step 1 inventory named portable replacement
but did not include `CalculatorRoute.saveScenarioDraft`, which called the throwing constructor before its
transactional save. A changed level with retained provenance therefore fails before write but rejects the UI
promise rather than returning an application outcome. This is confirmed from that call and the constructor's
strict schema parse; no production damage corruption was observed. The minimum added guardrail is an
application-owned scenario-change attempt consumed by that Web writer, with constructor-invalid and
execution-invalid counterexamples retaining the previous pair and no commit. This corrects the missed UI
command-to-recovery edge; it does not authorize editing pinned bases or change normal-reset policy.
Verified: `attemptPortableCalculationScenarioChange` now owns this attempt, `CalculatorRoute` commits only
its committed outcome, and `rankingBasis.test.ts` proves constructor/execution invalid attempts preserve the
retained pair. Resultless repair remains available; ordinary unsupported edits retain their prior behavior.

Final quality gate: **PASS**, `pnpm quality`, 283.32s, artifact
`.test-results/2026-09-05T15-00-56-136Z-16-805668`. Unit 79 files / 453 tests; production 24 files / 117 tests;
Playwright 25 tests, retries 0; warnings 0, unexpected console 0. Format, lint, typecheck, runner/docs contracts,
master validation and build also pass. TSK-06.42 runtime Blocking is 0; subsequent task dispositions above remain.

The preceding quality run (`2026-09-05T14-25-03-673Z-16-a7a791`) failed three calculator screenshot assertions.
Expected/actual/diff inspection confines every stable difference to engine labels `30.0.0 → 31.0.0`; damage
numbers and layout agree. Those three version-bearing baselines were updated from the inspected captures.
Baseline browser rerun was not performed (`unverified` provenance); the final non-update gate above passes
with no tolerance or observation allowance changes. Ranking captures cover the expanded controls/summary,
detail, 320px row and 390px icon fallback; this is not broader TSK-07 responsive closure.

### Revalidated Step 1 handoff at `255464b` (2026-09-05)

This delta supersedes the stale prerequisite and baseline statements below; the existing design and matrix
remain the starting plan. Baseline is `main` at `255464b2dc6219df7be0032bd46d45d279bbb30c`, with a clean worktree.
This pass reads code and existing evidence only: no implementation, test, configuration, snapshot, benchmark,
or production regeneration was performed. Requirements remain ranking v0.10.1 sections 4, 11, 12, 15, 17 and
UI v1.5.0 section 12; no product decision changes are needed.

#### Confirmed code delta and prerequisite reuse

- TSK-06.46 is complete: `scenario.ts:prepareCalculationScenario` checks the exact selected-level stat before
  preparation, accepts a present zero, and rejects missing ATK even with an override. Reuse its application
  invalid outcome and its scenario／portable／handoff fixtures; do not add an ATK lookup to the basis resolver.
- TSK-06.47 is complete in the Task source. `schema/src/index.ts:servantIdentityRecordSchema` now conserves raw
  own keys and validates embedded identity in current and v32/v33/v34 records, including PIR-002 at this HEAD.
  The record schema is currently private: expose/reuse that existing schema at the worker trust boundary rather
  than parse a synthetic LocalProfile or implement a new record refinement. `profile-domain:isOwned` remains
  the ownership owner; both membership and `rankingRows:createRankingRow` still duplicate its predicate.
  The identity note's independent-review-pending statement is retained as historical evidence, not promoted
  to a new approval claim by this planning pass.
- `rankingContracts`, `rankingPolicy`, `rankingRows`, `rankingStaticSemantics`, `rankingComparisonPolicy`,
  `rankingPolicyScenario`, `rankingPolicyCandidates`, and `rankingPolicyMatrix` still have the old mode/global-NP
  contract. `rankingCandidateSpace` constructs scenarios on both baseline and materialization paths. Both paths,
  summary and direct detail calls must receive the same resolved basis. Matrix NP1–5 means five complete calls
  with specified NP bases; owned-NP tests are separate and must not silently repeat the owned NP five times.
- `rankingState`, `RankingConditions`, `rankingWorkerProtocol`, `rankingWorkerRuntime`, and `useRanking` retain
  the old parser, direct patch commands, and five-field identity. `initialize` already clears all three worker
  maps, but installs an unchecked context first. Preserve this atomic clearing behavior after validation.
- Portable schema is now **35**, engine **30.0.0**. `createRankingPortableRequest` copies only two policy axes;
  `executePortableCalculation` validates schema/version/capacity but has no comparison-basis coherence check.
  `replacePortableCalculationScenario`, version upgrade, recover, and direct execution must share the new
  validation; recovery must retain the previous request/result on a failed attempt. `rankingHandoff` already
  executes before durable/workspace/session/route publication (TSK-06.46 PIR-001); preserve that transaction.

#### Review gap: detail identity and transport composition

1. Mechanism — confirmed by `rankingWorkerRuntime:handle`: detail looks up the cache by fingerprint/entryId,
   separately finds servantId, and passes the supplied AttackProfile without proving those three identify the
   same current summary entry. A cached detail returns before that relation is checked. `useRanking:onmessage`
   trusts the typed response and guards principally by selection fingerprint.
2. Implementation mismatch — inference: independent request fields can identify different rows, so six-field
   hashing alone does not establish row → detail → handoff identity. This is a transport identity issue, not a
   new damage semantic family; no production misdelivery was reproduced in this documentation-only pass.
3. Missed detection — confirmed: the earlier matrix listed malformed payload and stale context, but omitted
   structurally valid contradictory entryId/servantId/AttackProfile and delayed same-selection context responses.
4. Recurrence scope/minimum guardrail — validate context/selection/request identity on ready/result/detail/error;
   resolve detail from the canonical summary entry before cache access. Prefer sending entryId plus context and
   selection identities and obtaining servant/profile from that entry, deleting redundant client authorities.
   Check cache hit and miss, missing/nonmember entry, old context with identical selection, and mixed old/new input.

#### Concrete boundary decisions

Application owns legal selection validation, commands, and per-servant resolution. Schema owns the serializable
selection/provenance shape so portable and worker callers can reuse it without reversing package dependencies;
application adds master-dependent checks. A validated selection is distinct from raw input. Request-level invalid
has no enumerated rows or partial cache result. A valid empty owned collection is success with zero rows. Existing
profile outcomes (`inputRequired`, `unavailableUnderPolicy`, `invalid`, `unsupported`) and candidate stochastic or
policy omission classifications remain distinct; malformed transport is not a fabricated profile exclusion.

URL calculation keys will be `rPopulation`, `rLevelBasis`, `rNpBasis`, `rAffinity`, `rSelf`, `rConditional`.
The NP token is `1`–`5` or `owned`, decoded into the typed NP basis without permissive numeric coercion. Either
all six calculation keys are absent (defaults) or each occurs exactly once; the serializer emits all six for a
valid selection. Partial, duplicate, empty, unknown, old `rMode`/`rNp`, and mixed old/new inputs are invalid.
Display filter/metric keys remain independent. Changing a filter while invalid must not serialize defaults and
repair the calculation state implicitly; only explicit reset publishes a legal selection. Back/forward parsing
uses the same boundary. This closes the prior plan's partial-input rule versus default-omitting writer gap.

Portable provenance copies servant identity and selected numeric level/NP once. Verify basis ↔ provenance ↔
scenario consistency, natural-limit/Lv.90/specified-NP claims, master source and fixed comparison inputs before
execution. Owned provenance proves the pinned selection-time value, not current ownership after profile edits.
No saved build is read during replay. Do not reject legal planner-selected preparation/world facts by comparing
an executed scenario with an unprepared default scenario.

Cut over schema 35 → 36 and engine 30.0.0 → 31.0.0 once in Step 2. Preserve explicit v32/v33 dispositions and
raw-key-safe identity parsing. Add exact v35 and adapt v34 migration: valid calculator/manual snapshots keep
identity and old runtime versions (ordinary explicit upgrade remains required); two-axis ranking drafts are
discarded and matching ranking history becomes non-executable historical data. Extend the existing historical
variant, currently restricted to v33, to retain exact v34/v35 policy evidence without inventing comparison axes.
Already-historical v33 records remain historical. Current malformed or mixed requests fail closed; migration
never repairs profile maps. Apply the same disposition through stored load and backup import; old shares reject.

#### Additional state-by-path matrix (implementation deferred)

| State × path | Required result / minimum verification | Status |
| --- | --- | --- |
| selected owned NP differs from specified default × baseline/materialized candidate, summary/direct detail, matrix | one resolved NP drives coefficients, capacity, winner and selected damage row; each specified matrix column executes fully | Deferred: TSK-06.42 |
| NP0/missing build × membership and row ownership | both consume `isOwned`; no synthetic exclusions or record changes | Deferred: TSK-06.42 |
| missing exact ATK / present zero / override × new owned/uniform basis | reuse TSK-06.46 outcome and fixtures; add only basis integration parity | Deferred: TSK-06.42 |
| raw lost key or identity mismatch × worker initialize | reuse TSK-06.47 record parser and fixture family; no partial context publication or old-context calculation after failed replacement | Deferred: TSK-06.42 |
| old-only / canonical-only / mixed / duplicate / partial axes × URL, worker, portable | strict boundary; numeric calculation only for complete legal canonical input (or empty URL defaults) | Deferred: TSK-06.42 |
| invalid URL × filter edit / popstate / reset | no dispatch or implicit repair; explicit reset recovers with synchronized controls/summary | Deferred: TSK-06.42 |
| mismatched entry / nonmember entry × cached and uncached detail | reject before cache read or execution; no handoff | Deferred: TSK-06.42 |
| delayed ready/result/detail/error × new context with identical selection | ignored; no old rows/details or readiness exposed; include request identity | Deferred: TSK-06.42 |
| natural Lv.90 versus uniform Lv.90; owned value numerically equal to specified × fingerprint/replay | equal damage may have distinct selection/provenance identity | Deferred: TSK-06.42 |
| tampered provenance/fixed basis × constructor, execute, replace, recover, upgrade | typed invalid, no replacement draft/history/session/route write; retain prior pair | Deferred: TSK-06.42 |
| v32/v33/v34/v35 × calculator/manual/ranking/historical × load/backup/share | exact migration dispositions above; missing axes never become executable | Deferred: TSK-06.42 |

#### Execution boundary and evidence handoff

Planning Blocking is **0**; implementation rows remain Deferred, not Verified. Execute units 42-A through 42-F
in the Task source in dependency order. Before source edits in Step 2, measure the existing shared
`productionAudit.test.ts` compile/hot-path with three comparable bounded runs and record median, inventory,
candidate/damage counters and artifacts here; repeat after implementation under the same conditions. Previous
TSK-06.47 evidence (not remeasured here) is 469 servants / 422 attack servants / 433 profiles, default ranking
393 rows, candidate 6,360 / deduplicated 3,949 / damage requests 1,924 / distinct 1,298. Reuse the existing shared
natural/Lv.90 availability inventory; owned inputs use one stable fixture, not full-master reload per combination.
Record intentional changes by selection, resolved inputs, governing rule, outcome and rank; do not only update a
digest. Full four-policy maximum closure and all-current-NP numeric closure remain TSK-06.5 and TSK-06.45.

Step 2 requires a new explicit implementation request, this handoff, TSK-06.42 `ready`, prerequisites `done`,
and baseline ancestry through `255464b`. Allowed initial worktree: only the two reviewed Step 1 documentation
files (this note and the Task source), if not committed; no source/test/configuration/fixture/snapshot changes.
Do not revert later user edits; record any changed boundary and keep unrelated work isolated. Commit the planning
boundary if needed, then create a Task-only `in_progress` start commit before implementation. Do not run this
start transition during Step 1. Completion requires the Task done gate, unit/production evidence, final
`pnpm quality`, and zero runtime Blocking within this Task, with explicit later-task dispositions retained.

### Original planning mechanism (historical; current delta above)

The user-visible outcome remains the approved six controls: population, level basis, NP-level basis, class
affinity, self buffs, and conditional effects. Population changes membership only. Level and NP-level bases are
resolved independently for each included AttackProfile, while Fou ATK+1,000, skill level 10, OC1, and the other
shared assumptions remain fixed. The calculation application owns validation, explicit state transitions, and
per-entry resolution; Web serializes and presents that state, and ranking continues through the shared scenario
preparation and damage executor.

The current runtime violates that invariant in one mechanism. `RankingPolicyConditions.comparisonMode` is read by
`includedRankingServants`, `ownedBuild`, and `createRankingBaseScenario`; it simultaneously filters the population,
selects level and NP level, sets `attacker.source`, and imports stored Fou. `npLevel` is then read independently by
static semantics, NP-capacity policy, candidate selection, and the NP1〜5 matrix. Web patches this product directly,
parses unknown URL values to defaults, disables specified NP in owned mode, and fingerprints only the old five
fields. The worker trusts the structural TypeScript type, keeps maps keyed by that fingerprint, and returns generic
errors. Portable ranking intent retains only self／condition policy, so the resolved scenario carries the selected
numbers but not the six-field comparison identity.

Confirmed fallback paths are `ranking_owned_build_missing` being caught as generic per-profile `invalid`, invalid
URL values becoming standard／NP1, and missing `atkByLevel[level]` becoming numeric ATK 0 in shared scenario
preparation. NP0 is currently excluded from the ranking population, which agrees with the approved profile-wide
ownership rule; the defect is that ranking repeats the `npLevel > 0` rule instead of consuming its canonical owner.
The ATK item is not owned by comparison-basis selection and is split into TSK-06.46 and its own flow note. The audit
also found that a map key／embedded `ServantBuild.servantId` contradiction is accepted by the current profile schema
and can apply one servant's saved values to another across calculator, ranking, and profile readers. That separate
identity family is split into TSK-06.47. The earlier TSK-06.42 plan gap was listing endpoints without inventorying
the application command boundary, per-entry NP consumers, mixed `attacker.source` semantics, request-level invalid
outcome, persistence migration, irrelevant profile inputs in worker identity, or the two shared fallback families.

### Canonical cutover design

The application contract replaces `comparisonMode` and scalar `npLevel` with the already approved three-axis
product. A single application compiler accepts the six-field selection and returns either a validated comparison
selection or a typed request-level `invalid` result. It then resolves one `ResolvedRankingBasis` per included
servant: membership, numeric level, numeric NP level, and exact provenance for both numeric dimensions. Downstream
static semantics, NP capacity, candidate construction, and candidate selection receive only the resolved numeric
NP level; they do not read stored builds or reinterpret an NP-level basis.

Owned membership consumes the profile-domain ownership fact: NP1〜5 is owned and NP0／missing build is unowned.
The saved record remains intact when NP is returned to 0, but an owned-population ranking does not enumerate it;
specified NP must not turn an unowned record into a member. For an enumerated owned servant, level and NP level are
both present in the validated build; unavailable exact level ATK is `invalid`, never a numeric fallback. A malformed
worker payload is rejected at its runtime boundary. Map-key／`servantId` coherence is guaranteed by TSK-06.47 rather
than reimplemented in the ranking resolver. `all + ownedLevel` and `all + owned NP` are request-level invalid states.

Application commands are the only normal-state writers. `setPopulation(all)` is an explicit atomic transition: it
changes an illegal `ownedLevel` to `naturalLimit` and illegal owned NP to specified NP1, while preserving already
legal axes. Direct URL, worker, or portable inputs containing the illegal product are rejected and do not receive
that normalization. Unknown calculation-axis values and removed `rMode` are invalid; absence of all new keys means
the documented defaults. Web does not dispatch a worker calculation until the URL state is valid and exposes one
explicit reset-to-default command for an invalid URL.

Ranking scenarios keep `attacker.source: master` even when level or NP level is copied from owned data. That field
continues to control calculator saved-build behavior, so population must not set it to `owned` and thereby import
stored Fou or skill levels. The ranking detail and portable ranking intent retain the complete validated six-field
selection plus the resolved level／NP provenance; portable replay executes the pinned scenario, validates the legal
axis product and its natural-limit／Lv.90／specified-NP claims, and never re-resolves mutable saved builds. Owned
values are copied at selection time and remain pinned after the profile changes.

The schema cutover increments the current schema once. Prior-schema calculator／manual snapshots may migrate when
their identity is unchanged. A prior-schema ranking draft is discarded and a prior-schema ranking history
entry may remain only as isolated historical data; neither can be upgraded to an executable six-field ranking
request because the missing axes cannot be inferred. Old share payloads and stale worker protocols fail closed.
This is historical retention, not a compatibility runtime.

`RankingProfileInput` is narrowed to the validated servant-build map used by membership, owned bases, and row
ownership. Saved craft essences and support templates are fixed to none by the comparison policy and are not
ranking inputs; they must not recreate the worker or change a calculation／cache identity. Worker caches remain
scoped to one master／version／servant-build context and one validated six-field selection. A context replacement
clears summary, detail, and selection maps atomically, while stale guards compare both current context and
selection identities.

### Original production inventory (historical)

At audited HEAD `907f251`, the published master contains 469 servants, 422 servants with an attack NP, and 433
AttackProfiles. All 422 attack servants have both the rarity-derived natural-limit ATK and Lv.90 ATK. Of them, 421
have ATK through Lv.120; Mash has canonical stats through Lv.90. No production profile data exists for the owned
axes, so their completeness is proved with one shared stable profile fixture rather than by treating a production
zero as evidence. HEAD differs from the requested `c18f449` starting point only by the route-interaction bundle
split; the basis owner and fallback mechanism are unchanged, and no worktree changes were present during this
audit outside planning documents.

### Flow inventory and implementation ownership

| Path | Confirmed current reader／writer and required transition | Status |
| --- | --- | --- |
| master ATK production | pipeline emits level-addressable `atkGrowth`; master-data owns natural level; no Web interpolation | Verified: production natural／Lv.90 availability; schema-legal absence is Deferred: TSK-06.46 |
| six-field type／defaults／command | `rankingContracts` currently owns five fields; add raw-input validation, validated selection, explicit command reducer, and request-level invalid outcome | Deferred: TSK-06.42 |
| profile identity | profile schema permits record-key／embedded-ID contradiction; all build consumers need one fail-closed trust boundary | Deferred: TSK-06.47 |
| population | `includedRankingServants` repeats `npLevel > 0`; consume the canonical profile ownership classifier and keep NP0／missing records outside owned population | Deferred: TSK-06.42 |
| per-entry level／NP resolution | `rankingPolicy` currently couples mode, level, NP, Fou, and source; replace with the single application resolver | Deferred: TSK-06.42 |
| candidate compilation／selection | `rankingStaticSemantics`, `rankingComparisonPolicy`, `rankingPolicyScenario`, and `rankingPolicyCandidates` read global `conditions.npLevel`; consume resolved per-entry NP exactly once | Deferred: TSK-06.42 |
| row／detail identity | rows already expose numeric level／NP; detail only retains self／condition policy; add resolved basis and full six-field identity without duplicating damage semantics | Deferred: TSK-06.42 |
| URL writer／reader | `rankingState` owns `rMode`／`rNp` and fallback parsing; replace keys atomically and represent invalid calculation state without worker dispatch | Deferred: TSK-06.42 |
| worker protocol／stale identity | protocol accepts unchecked conditions; fingerprint has five fields; response error is generic | Deferred: TSK-06.42 |
| worker context | `RankingProfileInput` and its JSON fingerprint include unused craft essence／support data; narrow to validated servant builds and include context plus selection in stale identity | Deferred: TSK-06.42 |
| summary／detail cache key | worker maps are scoped only by lifecycle plus the old selection fingerprint; React stale guards compare only that selection | Deferred: TSK-06.42 |
| cache value／lifetime／cardinality | current worker caches unbounded calculations and details; this is the existing cache-lifecycle family | Deferred: TSK-07 |
| portable constructor／schema／fingerprint | detail writer and ranking intent retain only two policy axes; add six-field selection plus resolved provenance and bump schema once | Deferred: TSK-06.42 |
| draft／history／share／backup recovery | all persist and hash the full portable request; migrate identity-preserving non-ranking data, historicalize or discard old ranking snapshots, never infer missing axes | Deferred: TSK-06.42 |
| portable execute／recover／version upgrade | execute the pinned resolved scenario after identity validation; failure retains the prior request／result and never re-reads an owned build | Deferred: TSK-06.42 |
| immediate ranking → calculator replay | `rankingHandoff` already uses the application constructor and executor; prove row/detail/request/result parity for every basis family | Deferred: TSK-06.42 |
| calculator notice／normal reset interaction | consumes the new portable identity but does not own its semantics | Deferred: TSK-07 |
| filter／sort／metric | display-only state neither writes nor transforms comparison bases | N/A: no scenario or identity change |
| stack maximum／logical-effect presentation／all attack-NP closure | separate semantic owners remain unchanged by this cutover | Deferred: TSK-06.43／TSK-06.44／TSK-06.45 |
| final natural／Lv.90 × NP1〜5 × four-policy maximum and performance | consumes the closed basis resolver and stable owned fixture | Deferred: TSK-06.5 |

Planning Blocking is **0**. Implementation order is TSK-06.46 and TSK-06.47 → TSK-06.42 → TSK-06.43 → TSK-06.45 →
TSK-06.44 → TSK-06.5. TSK-07 retains only cache lifecycle, notice／reset interaction, outcome presentation, and
responsive／a11y closure; it must not add a second basis parser or portable adapter.

### State-by-path counterexamples

| State | Population／resolution | Execution／identity／recovery | Expected outcome | Status |
| --- | --- | --- | --- | --- |
| all＋natural limit＋specified NP1〜5 | all 433 profiles; canonical natural level | resolved NP is the only downstream NP input; distinct six-field identity | calculated where later execution tasks permit | Deferred: TSK-06.42 |
| all＋Lv.90＋specified NP | all 433 profiles at Lv.90 | no interpolation; distinct from natural-limit cache／portable identity | calculated where later execution tasks permit | Deferred: TSK-06.42 |
| owned＋natural limit＋owned NP | NP1〜5 ownership membership; ignore stored level／Fou／skills | copy stored NP once; pin it in detail and portable scenario | calculated | Deferred: TSK-06.42 |
| owned＋Lv.90＋specified NP | NP1〜5 ownership membership; ignore every stored combat value except owned fact | master source, Fou1000, skill10; preserve legal axes on profile mutation | calculated | Deferred: TSK-06.42 |
| owned＋low owned level＋specified NP | use only stored level | exact `atkByLevel`; same row/detail/calculator damage | calculated | Deferred: TSK-06.42 |
| owned＋owned level＋owned NP | copy two owned dimensions independently | no complete-owned-build label or saved Fou／skill import | calculated for NP1〜5 | Deferred: TSK-06.42 |
| saved build with NP0＋specified NP under owned population | unowned; record remains stored but is not enumerated | specified NP changes NP level only, not membership | absent by typed ownership proof | Deferred: TSK-06.42 |
| saved build with NP0＋owned NP under owned population | unowned; no per-entry resolution is attempted | no NP1 substitution and no fabricated exclusion | absent by typed ownership proof | Deferred: TSK-06.42 |
| no build under owned population | unowned and not enumerated | no per-entry outcome fabricated | absent by typed ownership proof | Deferred: TSK-06.42 |
| empty owned population | enumerate zero servants and profiles | valid selection and cache identity; no generic failure | calculated collection with zero rows | Deferred: TSK-06.42 |
| all＋owned level or owned NP from URL／worker／portable | reject product before enumeration／execution | no cache write, handoff, or numeric scenario | request-level `invalid` | Deferred: TSK-06.42 |
| explicit UI change owned → all while owned bases selected | application command changes only illegal axes to documented defaults | serialized result is legal; no hidden fallback reader | valid all＋natural＋specified NP1 | Deferred: TSK-06.42 |
| unknown axis or removed `rMode` URL | parser retains typed invalid state | worker not called; explicit reset is offered | request-level `invalid` | Deferred: TSK-06.42 |
| record key and `ServantBuild.servantId` disagree | reject the profile at its shared schema／persistence trust boundary | calculator, ranking, and reset cannot apply it to either identity | retained data is not guessed or rewritten | Deferred: TSK-06.47 |
| worker build or condition payload is structurally malformed | runtime parse before cache lookup or calculation | no partial context installation or generic exception fallback | request-level typed `invalid` | Deferred: TSK-06.42 |
| selected owned level lacks canonical ATK | basis resolver does not guess/interpolate | shared scenario preparation also rejects missing stat | `invalid: attackerLevelStatUnavailable` | Deferred: TSK-06.46 then TSK-06.42 parity |
| owned profile changes after detail／handoff | existing detail retains copied values and provenance | portable replay uses pinned scenario; new ranking request gets new context identity | old replay stable; new result recalculated | Deferred: TSK-06.42 |
| prior-schema ranking snapshot／share | axes cannot be reconstructed | draft discard／history historical-only; share rejected | no executable compatibility fallback | Deferred: TSK-06.42 |
| display filter／metric only | unchanged six-field state | no worker calculation or portable rewrite | presentation-only change | Verified: current boundary; reverify in TSK-06.42 |

## TSK-06.41 runtime cutover — previous authoritative delta

### Product correction closure — IRL-003／005／006

The approved user-visible outcome is that every optional action with an effective contribution under the
selected policy competes when at least one legal initial-state candidate can execute the complete action and
the later attack NP. A represented disadvantage is applied, not used as an admission veto. Only the concrete
candidate that cannot pay an NP／HP cost or otherwise reach the attack NP is dropped. The previous design used
“disadvantage-free” as a proxy for executable and therefore changed ranking membership before the ordered
executor could prove reachability.

The repaired model removes the polarity／cost veto from action admission. Admission now asks only whether the
selected policy has an effective contribution; the candidate executor then applies the complete ordered action
and attack NP, rejecting only the concrete initial-resource candidate that cannot complete. Unsupported
operations block the exact profile maximum and never become a numeric fallback. Resource closure uses the
ordered suffix for HP／NP／stars／BP, and portable reset resolves its subject inside the application boundary
from the retained request identity.

| Canonical state / counterexample | Policy admission | Ordered execution / recovery | Expected outcome | Current status |
| --- | --- | --- | --- | --- |
| unconditional deterministic contribution plus no disadvantage | policy-relevant optional action | execute all operations and attack NP | calculated candidate | Verified regression boundary |
| unconditional deterministic contribution plus represented HP cost／negative modifier／detrimental state | do not inspect polarity or cost presence | commit every sibling; require attack NP reachability | candidate competes by final average damage | Verified: adverse-independent admission fixture and production family ratchet |
| fixed NP cost at baseline start NP100% | policy-relevant action remains enumerable | cost leaves attack NP unreachable | only that concrete candidate is `unreachable` | Verified: focused NP-cost candidate is rejected with `insufficientNpGauge` |
| same fixed NP cost with a legal higher start gauge in satisfied mode | same action option | cost and attack NP both execute | reachable candidate remains and may win | Verified: NP200% candidate remains executable |
| conditional-only contribution in baseline | no effective contribution under selected policy | N/A: optional action is not executed | `policyNoOp`, independent of disadvantage | Verified regression boundary |
| unconditional＋conditional siblings plus represented cost in baseline | admit from the unconditional effective sibling | commit cost／mutation; exclude only conditional damage contribution | reachable candidate keeps unconditional contribution | Verified by baseline admission／execution fixture family |
| unknown／dependent cost | never infer feasibility | no partial transaction | `unsupported`, not `policyNoOp` or calculated | Verified fail-closed boundary |
| HP／BP mutation whose reader exists only before the mutation | admission is unchanged | suffix has no reader | `noDamageReader`; do not block a legal action | Verified: sibling suffix fixtures; calculator `300100` becomes calculated |
| HP／BP mutation followed by a reader | admission is unchanged | ordered canonical state must change before the reader | mutated value is consumed or transaction is typed unsupported | Verified: HP `702500`／BP `705300` remain typed unsupported |
| retained portable request subject differs from mutable UI scenario | N/A: ranking policy is already stored | reset resolves the retained request subject exactly before any write | exact reset or no-op with old durable／memory pair intact | Verified: exact retained build is selected and missing subject rejects before attempt |
| stochastic success／failure | existing condition policy owns contribution and outcome candidate | execute one legal outcome | baseline minimum／failure; satisfied legal maximum | N/A: unchanged by adverse-action correction |
| self buffs excluded optional action | source policy excludes the optional action | no execution | `policyNoOp`; `structuralRequired` remains separate | N/A: unchanged by adverse-action correction |

Flow classification: canonical effect／operation production and contribution classification are `Verified`;
adverse-independent admission and baseline candidate reachability are `Verified`; ordered HP／BP suffix
semantics are `Verified`; exact-subject portable reset is `Verified`; calculator／ranking parity is `Verified`;
UI ranking presentation is `N/A: it consumes typed results`; final four-policy production maximum is
`Deferred: TSK-06.5`. Current Blocking count is **0**.

Verification separates evidence roles. Focused fixtures close NP100% unreachable／NP200% reachable, adverse
admission, suffix readers, rollback, and exact reset identity. The production admission digest
`bb43fa1ff4df8e68ce460829cba253459ebc2e1a7e053a7ce782529018d6e101` covers all four policy combinations;
baseline execution records 12 concrete `insufficientNpGauge` candidates. Production adverse occurrences are
HP fixed 23, NP fixed 38, stars fixed 5, BP fixed 1, negative modifier 27, trait removal 3; all four dependent
resource families and detrimental state are explicit zero ratchets backed by focused schema-legal fixtures.

The current-default candidate population changes from 669／668 requests／631 distinct inputs to
1,936／1,924／1,298 because formerly vetoed policy-contributing action programs are now evaluated. The largest
satisfied product remains 3,840 under the unchanged 4,096 bound. The shared production audit changes from
419 calculated／3 unsupported calculators／432 ranking rows to 420／2／393, digest
`e0677f9362ef8f9a50e312693a1c8cc5fcc11e22be31b4d7c39f268ad41bbc78`. Every one of the 433
`Servant × AttackProfile` entries whose selected result, status, or ordinal rank changes is recorded with its
canonical input, ordered action, starting resource／mutation trace, NP1〜5 damage, deterministic NP1 rank, and
reason in `docs/evidence/ranking-adverse-action-diff-tsk-06-41.json`. Of 348 direct result changes, 308 remain calculated
with a newly winning complete action, 39 move from a false numeric result to typed unsupported, and one moves
from false `policyNoOp` to typed unsupported. The other 85 retain their selected candidate／damage but move rank
because those direct changes reorder the numeric population. The full 433-profile join leaves zero unexplained
rank-only or member differences.

The affected audit compile median changes from 4.697 s (`4.970／4.697／4.567`) to 7.167 s
(`7.421／7.167／6.864`, +52.6%). This is explained by 2.88× damage requests and 2.06× distinct inputs from the
required semantic population; the finite bound and cap are unchanged. Final four-policy production maximum
and its performance baseline remain `Deferred: TSK-06.5`.

Final phase gate: `pnpm quality` passed with 406 unit／116 production／25 Playwright tests,
skip／todo／retry／warning／unexpected-console 0; artifact
`.test-results/2026-09-04T15-08-22-027Z-15-a59fec`. The ranking summary and detail VRT baselines were updated
after visual confirmation of the expected 393-row／40-unsupported population and newly selected top profile.

### Previous re-review correction delta — IRL-001／003 (superseded closure status)

The 2026-09-04 re-review reopened two adjacent states in the already declared condition and resource
families. The earlier closure tested card／NP variant binding but did not enumerate terminal-form traits or
program-proved choice／operation-trigger facts; it also treated every critical-star mutation as if a terminal
input represented an ordered transition. These were flow-inventory gaps, not servant-specific exceptions.

The user-visible outcome is that baseline admission and contribution execution classify the same fully bound
intrinsic condition, and that an ordered resource mutation is erased only when the suffix of its transaction
has no damage reader. The governing invariants are one classifier for admission and contribution inclusion,
and execute-or-typed-unsupported atomicity for every resource transition. The recurrence scope is every
boolean composition of card／variant／terminal attacker trait／selected choice／operation trigger and every
resource-mutation × later-reader ordering. Production-negative resource families require an explicit zero
ratchet rather than inference from current master defaults.

| Canonical state / counterexample | Producer | Admission／execution consumer | Failure／recovery | Final status |
| --- | --- | --- | --- | --- |
| terminal form has required intrinsic trait | `AttackProfile.id.terminalActorFormProfileId.semantics.intrinsicTraits` | shared bound-condition classifier used by baseline admission and effective contribution policy | no external witness; mismatched／absent trait is not invented | Verified: Douman skill `818552` and both Chaotic／Evil contributions are effective |
| selected action branch proves choice and operation trigger inside nested card／variant／trait boolean | static preparation program and selected source effects | the same classifier consumes program facts; ordered executor consumes the corresponding activation facts | ambiguous or unproved fact remains runtime/conditional and is not baseline-admitted | Verified: schema-legal nested five-fact fixture |
| critical-star gain／loss followed by star-dependent condition or value | canonical resource operation and later operation suffix | resource closure emits `orderedCriticalStars`; executor mutates canonical star state before the reader | missing amount/state is typed unsupported and rolls back every sibling | Verified: gain／loss result fixtures plus missing-amount sibling rollback |
| critical-star mutation with no later reader | canonical resource operation | suffix-scoped resource closure | `noDamageReader`; retained evidence cannot change damage | Verified: production has zero critical-star unsupported outcomes |
| HP／BP reader and existing blocker aggregation paths | existing canonical compiler／executor／profile aggregator | unchanged owners | existing IRL-002／004 fixtures and production inventory remain authoritative | Verified regression boundary |

Flow delta classification: condition producers／admission／effective-contribution readers and resource
compiler／suffix reader scan／transaction executor／profile recovery are `Verified`. Calculator and ranking both
reach the same application compiler and ordered executor (`Verified` architecture boundary). UI presentation
is `N/A: it consumes the typed application outcome and does not classify these semantics`. TSK-06.5 final
four-policy maxima remain `Deferred: TSK-06.5`. This section's former Blocking count 0 is superseded by the
current delta above.

### Previous implementation review closure delta — IRL-001〜004 (historical)

The implementation review expanded the recurrence scope of the previous condition and operation audits. The
first closure proved current caller parity, condition truth, and pipeline classification, but did not require
the same AttackProfile-bound classifier for action admission, did not expose NP-internal value reads as
contribution dependencies, did not trace every retained resource operation through the ordered reducer, and
did not retain the complete blocker population after presentation precedence. Those were earlier review gaps,
not four independent servant exceptions.

Confirmed mechanisms are: syntactic `always` admission drops card／NP-variant intrinsic contributions;
`hpRatioLow`、`battlePointPhase`、and `traitCount` compile as an unconditional NP special contribution; fixed
non-NP resource operations compile as supported retained evidence without a state transition; and profile
aggregation selects the first input-required execution before unsupported while discarding the remaining
classes. The recurrence scope is every nested intrinsic／conditional condition, every NP value family, every
resource kind and transaction rollback path, and every admitted candidate outcome order. Minimum guardrails
are one canonical static condition classification, exhaustive typed NP value dependencies, execute-or-
unsupported resource operations, and stable class diagnostics independent of candidate order.

| Family state | Admission／normal loop | NP value／alternate mutation | Aggregation／recovery | Planning status |
| --- | --- | --- | --- | --- |
| intrinsic card／NP variant, including nested `all`／`any`／`not` | selected AttackProfile decides intrinsic truth; safe effective action is admitted | contribution uses the same classification | no external witness is invented | Verified: shared classifier fixtures＋Artoria Lily production regression |
| HP／BP／trait-count value dependency | baseline excludes only the dependent delta | satisfied mode enumerates canonical quantity／trait witnesses; NP base remains intrinsic | calculator still evaluates explicit scenario facts | Verified: exhaustive dependency fixtures＋production occurrence ratchet |
| HP／star／BP resource mutation | an admitted transaction either applies every representable transition or fails closed | unrepresentable state／unit becomes typed unsupported and rolls back siblings | no plausible numeric candidate survives | Verified: read-sensitive closure、transaction rollback、Hijikata production regression |
| calculated＋unavailable＋inputRequired＋invalid＋unsupported | execution preserves the candidate-local class | alternate candidate order cannot change classification | `invalid > unsupported > inputRequired > unavailable`; every class keeps count, digest, and bounded representatives | Verified: reordered mixed classes、calculated dominance boundary、production artifact |

TSK-06.5 final four-policy maximum remains Deferred and TSK-07 cache／responsive scope is N/A for this delta.

This section supersedes the TSK-06.4 implementation deferrals below. Implementation started from clean HEAD
`b07ca1ddb4fae01d67e38321e7a7c496b9592a64`. Damage, profile selection, row count, badge, detail, and portable
replay now consume one canonical ordered application result and its effective contribution set. Action
admission remains separate from contribution inclusion; an admitted action commits its branch, cost, and
mutations atomically even when policy excludes one damage contribution.

| Direct producer／reader／writer／recovery | Classification |
| --- | --- |
| Atlas vocabulary → source-specific canonical schemas | Verified: pipeline-only interpretation; active／passive／NP／CE／mystic bounds reject schema-legal overflow fixtures |
| canonical effects → ordered operations／retained evidence | Verified: one battle-execution compiler; resource／state／bounded／unsupported outcomes are typed |
| ordered action → branch, cost, mutation, contribution | Verified: one transactional executor; failure rolls back the action, policy exclusion does not roll mutations back |
| AttackProfile and complete path → candidate-local admission | Verified: structural role uses terminal profile and the full ordered path |
| finite domain → materialization → final-damage comparison | Verified: certificate precedes allocation, count matches materialization, independent oracle passes; maximum 2,880／4,096 |
| calculator／ranking／without-area／portable replay | Verified: same application preparation and executor; without-area is reapplied only to the selected result |
| effective contributions → damage／selection／row／badge／detail | Verified: self, condition, and area decisions remain independent; presentation groups exclude NP base |
| invalid／unsupported／inputRequired／unavailable recovery | Verified: five profile outcomes remain distinct; only typed insufficient-NP unavailability is non-blocking |
| UI writer and ranking → calculator handoff | Verified: current discriminated intent is written directly; detail renders canonical decisions |
| final four-policy × NP1–5 maximum／digest | Deferred: TSK-06.5; no new runtime semantics may be added there |

Runtime Blocking count: **0**. Cache lifetime／stale-response UI is `Deferred: TSK-07`; a general battle
simulator is `N/A: outside the bounded preparation product`.

Schema-legal fixtures cover slot 4, source effect／choice overflow, multiple choice groups, nested conditions,
exclusive branches with cost, mutation-retained／contribution-excluded actions, missing inputs, stochastic
failure, unsupported operations, unreachable profiles, and invalid／mixed portable snapshots. Calculator,
ranking, without-area, migration, reset, and replay use the same canonical application boundary.

The current master has 13,875 effects and 14,623 typed operations. TSK-06.4 counted 9,123 affected effect
occurrences and 9,124 legacy operations because one referenced wrapper expanded twice; the cutover preserves
that explained delta while removing the legacy variant. Preparation inventory is 6,360 generated, 3,949
deduplicated, and 3,438 terminal plans. Default ranking certifies and materializes 669 candidates, makes 668
damage requests, and has 631 distinct inputs. There are 433 static
AttackProfiles and 432 numeric rows: `2501400` NP1
is typed `unavailableUnderPolicy: insufficientNpGauge`, not a numeric fallback or sibling substitution.

IRL-003 remeasurement classifies 419 calculator scenarios as calculated and three as typed unsupported. The
three are exactly the production profiles where an unrepresentable HP／Battle Point mutation feeds a damage
dependency. Read-sensitive fixed star mutations now update the ordered canonical `criticalStars` state;
unread resource mutations retain a bounded-phase-irrelevant proof. Relative to TSK-06.4, master／preparation／
AttackProfile counts and the 4,096 cap are unchanged; the largest certified product rises from 2,880 to 3,840
because the previously hidden NP value dependencies are now enumerated. Default candidates rise from 576 to
668 (+16.0%) with a finite 668 certificate; this is the required missing-domain population, not unbounded
growth. Request and digest changes come from intrinsic
admission, NP dependency witnesses, resource fail-closed outcomes, and blocker diagnostics, not a new domain
dimension.

The re-review correction admits exactly one additional default candidate for Douman: 669 certified／generated／
deduplicated, 668 damage requests, and 631 distinct inputs. The 4,096 limit, 433 AttackProfiles, 432 numeric
rows, and three typed unsupported calculator profiles are unchanged. Ordered production-star transitions and
Douman's two intrinsic contributions explain application digest
`d9b41f224697dcd4addae97681492721b4a60d534192d11163bbaf4c48811695`; calculator execution parity is
`b67bc7d955dc487e610a6bb3d52ab0f816588641f1fe18cde268a6b4fcd1384b`.

Production digests are application `d9b41f224697dcd4addae97681492721b4a60d534192d11163bbaf4c48811695`
and pipeline `916403ecd681dc6b2c4655bd3c052bd8527db3eeac0d54dd1b1a2d18641c02e8`. The pre-cutover
production run was 38.47 s real. Post-cutover canonical-runner measurements were 38.01／40.24／38.74 s,
median 38.74 s: +0.27 s／+0.70%, within the 10% ratchet. Each run executed 24 files／113 tests; the first
completed its tests before reporting the then-stale runtime-counter contract, and the latter two passed the
updated contract. Final quality passed unit 380, production 113, and Playwright 25 with no skip, retry, warning,
or unexpected console; artifact `.test-results/2026-09-02T06-07-59-655Z-44-fc4f13`.

The IRL-001–005 review closure started from clean tracked HEAD `2977dffd`. Affected production runs
were 37.41／36.50／38.98 s, median 37.41 s versus the preceding canonical median 38.74 s
(-1.33 s／-3.43%); the finite-domain additions therefore introduce no unexplained regression.
Final re-review `pnpm quality` passed 402 unit tests, 114 production tests, and 25 Playwright tests
with zero skip／todo, retry, warning, or unexpected console. The retained parent artifact is
`.test-results/2026-09-04T13-13-54-906Z-15-6f35e3`.

Removal audit finds zero production legacy operation variants, operation-ID contribution projections,
independent 512-state caps, current old portable-intent writers, compatibility flags, adapters, or parallel
compilers. The schema-33 parser remains only as the exact approved migration boundary.

### Completion verification correction — legacy overcharge bypass

Confirmed mechanism: the first completion retained `CalculationPreparationOptions.preserveScenarioOvercharge`
and a runtime branch that could bypass the ordered NP resource transaction's derived base overcharge. No current
producer passed the option, so production inventory and damage digests were unchanged, but the public
schema-legal preparation path still represented the pre-policy compatibility model.

Implementation mismatch: the runtime and removal audit had converged all current callers without deleting the
obsolete override itself. Missed detection: the original legacy scan covered old operation／portable names but
not preparation-option fields, and parity fixtures exercised only the canonical default branch. Recurrence scope
is bounded to scenario preparation options that can override terminal resource or OC state. The minimum guardrail
is deletion of the option and branch, a focused NP2 fixture proving that 200% initial gauge produces executor-
derived base OC2, and a source scan for the removed symbol. After the correction this path is `Verified` and the
TSK-06.41 runtime Blocking count remains 0.

## TSK-06.4 independent design audit — authoritative current delta

This section supersedes both the pre-audit contribution-graph proposal below and the first planning-diff nested
action proposal. The rejected graph is retained only as review history; `transaction.consequences`,
`steps[].mutations`, `eligibility`, its type names, the B1〜B4 split, and its implementation boundary are not
implementation instructions.

### Fixed outcome and independently derived invariants

The user-visible result is one standard or theoretical-maximum NP damage value for one `AttackProfile`,
derived from one legal ordered preparation program. The following invariants follow from that outcome rather
than from the current proposal:

1. The two UI controls identify a ranking policy, but they are not two independent domain-state projections.
   Action admission depends on the pair, the selected action option, and the candidate-local path.
2. A skill use or NP use is the execution transaction boundary. Resource cost, selected branch, and every
   successfully applicable sibling mutation are staged and committed together. Condition-false or proc-failed
   siblings are normal non-applications, not transaction failures. Invalid, unsupported, or resource failure
   commits no part of that action. Policy exclusion of one damage contribution is not a rollback.
3. A branch is an exclusive action option. An ordered step evaluates activation, and its operation is a mutation,
   damage contribution, bounded-phase-irrelevant proof, or unsupported result. None is a second action boundary.
   Passive and intrinsic sources use an automatic source-program variant; they are not fake actions.
4. Structural necessity is an `AttackProfile × initial state × complete ordered path` role. It is never a
   static property of a skill or effect and is not inferred from a prefix without checking downstream reachability.
5. An action that establishes a condition remains executed when a downstream conditional damage contribution
   is excluded. The mutation and contribution therefore need separate canonical children under one action
   transaction.
6. Candidate construction enumerates legal action options and compatible world facts first. The executor
   evaluates every contribution in that one scenario, and selection compares final average damage after cost
   and downstream state. Effect-local maxima are never composed afterward.
7. Only candidates admitted into the canonical domain participate in profile dominance. Within that domain,
   `inputRequired`、`invalid`、or `unsupported` blocks a numeric maximum unless a planner-owned typed proof has
   already shown that exact candidate unavailable or duplicate.
8. Damage, ranking selection, row count, badge, detail, and portable replay consume one canonical application
   result. Presentation never re-evaluates requirements or contribution eligibility.
9. Portable identity stores the execution intent that changes the result; it does not infer it from scenario
   facts. Normal calculator intent and ranking policy are different union variants, not a third value on the
   ranking condition axis.
10. The preparation domain is explicitly bounded by the product. Active slots, action-option choice groups,
    ordered programs, and world dimensions have schema bounds whose complete product or sound dominance pruning
    is proven before execution. A cap is only a guardrail; it is not a completeness proof.

### Confirmed facts

| Fact | Evidence | Baseline classification |
| --- | --- | --- |
| `conditionalContribution` is compiled but not passed to contribution projection | `rankingComparisonPolicy.ts` emits it; `rankingCandidateSpace.ts` calls `compileDamageContributionProjection` with only `selfSkill` and `area` | HEAD defect, not introduced by the planning diff |
| Projection is operation-ID based | `DamageContributionProjection` contains included／excluded operation IDs and state-trait exceptions | HEAD fact |
| NP base and conditional special output share one `executeNpDamage` operation | `npDamageCompilation.ts` emits one operation; `npDamageOperation.ts` returns base and special multiplier arrays together | HEAD fact; operation exclusion cannot express the product outcome |
| Ranking profile result has three classes | `rankingContracts.ts` has calculated／unavailable／invalid; `rankingPolicyCalculation.ts` maps `inputRequired` to invalid | HEAD fact |
| Planner enumerates every ordered skill program before policy admission | `rankingStaticPreparation.ts` adds every available slot／choice command | HEAD fact |
| Planner recognizes only slots 1〜3 while schema permits 0〜20 | `skillCommands` uses `1 | 2 | 3`; `masterSkillSchema.slot` accepts 0〜20 | HEAD schema-legal completeness defect |
| Production currently has only slots 1〜3 | shared master inventory: slot 1 = 475, slot 2 = 475, slot 3 = 477, other = 0 | production-positive bound; not schema closure |
| Active skills, passives, and mystic-code skills share `MasterSkill` | `masterSkillSchema` owns the 0〜20 slot and is reused by all three populations | HEAD type-boundary fact; globally narrowing `MasterSkill.slot` is not a valid A2 fix |
| Choice count is not schema-bounded and planner models one selected group/candidate | `MasterSkill.effects` has no maximum; `skillCommands` emits one `choice` object and `selectedEffects` filters to that one pair | HEAD schema-legal completeness defect |
| Production player choice is smaller than the legal schema | maximum one group per servant skill and five candidates in the current master | production fact; not schema closure |
| Canonical action-safety information is incomplete | `nonDamage` has no typed consequence payload; 1,244／1,427 production skills contain at least one such operation | HEAD fact |
| Production contains represented tradeoffs | 7 skills have NP requirements; 38 skills have a fixed NP-loss effect; 14 skills have an unsupported NP-transition family | production fact |
| Current finite product is bounded only after program generation | cap 4,096 per profile; largest current satisfied product 2,880; baseline semantic product 7,255 and damage requests 6,913 | existing test inventory, not evidence for the proposed new dimensions |
| Portable ranking identity has one contribution field | schema 33 stores `standard | excludeVoluntarySkillModifiers`; portable execution recompiles only self／area projection | HEAD fact |
| Current reset preserves the resolved ranking scenario | `resetPortableCalculationRequest` calls the calculator constructor with the existing scenario | HEAD fact |
| Row, badge, and detail re-read effect projection | `rankingRows.ts` counts projection keys and tests `isSpecialAttack`; `RankingEffectDetails.tsx` rebuilds stacks from effects plus projection | HEAD fact; presentation is not yet derived from one canonical application result |
| Accepted ADRs at HEAD conflict with the current approved requirement | ADR-019 retains old NP-series/policy planning; ADR-027 resets the same scenario and has one ranking contribution intent | HEAD documentation-authority conflict; current documentation diff resolves it through accepted ADR-028 |

The `nonDamage` inventory includes action consequences that are visibly different for admission: production
contains `lossHpSafe` 22、`lossHpPerSafe` 1、`lossNp` 38、`lossStar` 5、and `subBattlePoint` 1 occurrences,
as well as gains and bounded-phase-irrelevant effects. Their raw function name may be used only by the pipeline
to produce typed canonical operations; application runtime cannot branch on those names.

The full master has 9,124 `nonDamage` operations from 9,123 effect occurrences. The design-time raw-family
classifier closes every occurrence as resource 1,164、state／field 5,213、typed unsupported 21、or
bounded-phase-irrelevant 2,725. One `addStateShort` occurrence currently emits two `nonDamage` operations.
There are zero unclassified raw families; implementation and the production ratchet are Deferred TSK-06.41.

| Design disposition | Raw producer families in current production |
| --- | --- |
| resource mutation | `gainNp`、`lossNp`、`gainStar`、`lossStar`、`gainHp`、`gainHpPer`、`lossHpSafe`、`lossHp`、`lossHpPerSafe`、`subBattlePoint` |
| state／field mutation | `addStateShort`、`addState`、`subState`、`moveState`、`extendBuffturn`、`shortenBuffcount`、`addStateShortToField`、`addStateToField` |
| typed unsupported | `gainNpBuffIndividualSum`、`gainHpFromTargets`、`gainNpFromTargets`、`gainNpIndividualSum`、`gainNpTargetSum`、`gainMultiplyNp`、`replaceMember`、`moveToLastSubmember` |
| bounded-phase-irrelevant | `hastenNpturn`、`none`、`friendPointUpDuplicate`、`userEquipExpUp`、`eventDropUp`、`expUp`、`delayNpturn`、`instantDeath`、`servantFriendshipUp`、`shortenSkill`、`eventDropRateUp`、`qpDropUp`、`enemyEncountCopyRateUp`、`forceInstantDeath`、`qpUp`、`displayBuffstring`、`cardReset`、`classDropUp`、`enemyEncountRateUp`、`eventPointUp`、`absorbNpturn`、`extendUserEquipSkill`、`fixCommandcard`、`friendPointUp` |

These names are audit evidence only. The pipeline maps them to typed payloads and proof codes; no downstream
runtime switch may consume this table or a raw family name.

The source inventory and chosen schema bounds are:

| Source | Production count／maximum | Approved schema |
| --- | --- | --- |
| active servant skill | 1,427; effects 23; player-choice groups 1; candidates 5; slots 1〜3 | effects ≤24、groups ≤1、candidates ≤5、slot `1 | 2 | 3` |
| passive | 1,253; effects 14; groups 0; current slot sentinel 0 | effects ≤16、groups 0、slot field absent |
| NP | 727; effects 17; groups 1; candidates 3 | effects ≤20、groups ≤1、candidates ≤3、slot field absent |
| craft essence | 2,700; effects 14; groups 0 | effects ≤16、groups 0、slot field absent |
| mystic-code skill | 84; effects 3; groups 0; slots 1〜3 | effects ≤4、groups ≤1、candidates ≤5、slot `1 | 2 | 3` |

The aggregate bound is not inferred from these local maxima. A valid `PreparedRankingContext` carries a complete
`AttackProfile × policy × NP level` domain certificate with an upper bound of at most 4,096. The current maximum
is 2,880, so the design does not relax a cap or timeout. A certificate overflow returns typed `unsupported`
before any partial maximum can be published.

### Inferences

- A global dependency graph would duplicate the already canonical ordered program, `ConditionExpression`,
  effect transaction grouping, and input definition key. Separate node／edge／read-point identities create a
  second representation that must remain synchronized. This is a two-owner risk, not required expressiveness.
- `safeDeterministic | conditionalTradeoff` is not a complete static skill classification. Safety belongs to a
  selected action option's complete consequences; effectiveness and structural necessity are candidate-local.
  A skill with unconditional and conditional siblings is the direct counterexample.
- Compiling contribution projection before action admission is cyclic: baseline action admission needs to know
  whether an unconditional contribution is effective for the selected `AttackProfile`, while input liveness and
  execution can only be compiled after the admitted action option is known.
- Deferring the action-consequence and slot inventories to TSK-06.5 would permit TSK-06.41 to implement an
  unproved domain model and then call the later mismatch “production closure”. This is an early completion gap.
- The portable schema must cut over with the result-changing runtime semantics. It can, however, use a smaller
  discriminated intent instead of a nominal `normalCalculator | baselineOnly | satisfiedCandidates` axis.
- The planning-diff `transaction.consequences` and `steps[].mutations` are two representations of the same
  resource／HP／state／form／field writes. Admission would read the summary while execution reads the ordered
  mutations, so correspondence becomes a new invariant. This is the same synchronization failure rejected for
  the dependency graph, introduced by the planning diff rather than HEAD runtime.
- The planning-diff `eligibility: intrinsic | unconditional | conditional` cannot replace the concrete
  applicability requirement, value expression, or lazy input read. Keeping both would be a synchronization
  field; keeping only the enum cannot replay NP special or HP-dependent contributions.
- `CanonicalActionOption` cannot be the outer node for passive contributions because passives have no command or
  action transaction. A source-program union is smaller than inventing a no-op action kind.
- The current 4,096 caps detect explosion but do not prove a maximum. Because choice groups and effect counts are
  schema-unbounded and the planner fails to form multi-group selections, finite-domain closure is a design input,
  not a TSK-06.5 performance-only check.
- `selfBuffs=excluded × conditionalEffects=satisfied` does not admit an optional skill that only establishes a
  condition for an attack-NP contribution. This is an application-policy decision, not something inferred from
  contribution origin. `structuralRequired` actions remain a separate AttackProfile/path-dependent case.

### Counterexamples

| State | Current／proposed failure | Required outcome | Status |
| --- | --- | --- | --- |
| schema-legal servant skill in slot 4 | current planner never emits the action | active-servant schema rejects it; passive has no slot field and mystic uses its own 1〜3 schema | Verified design A2; schema fixtures Deferred TSK-06.41 |
| one skill has two independent player-choice groups | current command stores one group/candidate and drops the other group's effects | producer rejects the artifact; supported action option has zero or one complete selected branch | Verified design A3; schema fixture Deferred TSK-06.41 |
| damage skill with an unconditional modifier plus HP／NP loss sibling | static “safe” from the modifier or “tradeoff” from one sibling loses the other fact | action option carries every ordered operation; baseline rejects disadvantage, satisfied may admit the fully represented transaction | Verified design A1; operation fixture Deferred TSK-06.41 |
| action summary says state mutation while ordered step omits it | planning-diff admission accepts an action that execution cannot apply | one ordered operation list is the only consequence owner; no summary/mutation correspondence exists | Verified design correction; fixture deferred to runtime task |
| passive contribution under `CanonicalActionOption` | passive has no legal preparation command or transaction boundary | use an automatic source-program variant with the same ordered steps | Verified design correction; fixture deferred |
| unconditional and conditional damage siblings in one safe action | whole-skill classification either loses the baseline modifier or leaks the conditional modifier | admit the action in baseline; include only the unconditional contribution | Verified design expectation; fixture deferred to runtime task |
| action grants target state used by a later special | contribution exclusion can accidentally remove the mutation or require a graph exception | commit the action／mutation; baseline excludes only the dependent damage contribution | Verified design expectation; fixture deferred |
| one NP operation with base and conditional special multiplier | operation-ID exclusion removes both or neither | base is an intrinsic contribution; special is a separate conditional contribution under the same attack action | Verified design expectation; fixture deferred |
| two exclusive branches with different NP loss | choosing the largest modifier can make the attack unreachable | execute each legal branch transaction and compare final average damage | Verified design expectation; fixture deferred |
| excluded-only contribution reads a missing input | precomputed input collection reports a false repair request | no input read unless the action precondition／retained mutation also consumes it | Verified design expectation; fixture deferred |
| retained mutation and excluded contribution share an input | dropping the contribution can incorrectly drop the mutation read | action step remains live and may return `inputRequired` | Verified design expectation; fixture deferred |
| optional skill only grants target state consumed by attack-NP special under self-excluded/satisfied | contribution-origin policy could incorrectly resurrect an action excluded by self policy | omit the optional action; retain only independently `structuralRequired` actions, then evaluate the attack-NP contribution under condition policy | Verified product decision; fixture Deferred TSK-06.41 |
| calculated candidate plus unsupported admitted branch | known number may not be the maximum | profile is unsupported; bounded diagnostics retain the blocker class | Verified design expectation; fixture deferred |
| identical scenario with baseline and satisfied ranking intents | current portable request collides | distinct request／fingerprint／replay identity | Verified design expectation; runtime deferred |
| ranking scenario reset while target／field／choice facts remain | `normalCalculator` would reactivate ranking assumptions | construct a fresh calculator baseline from explicit subject/build inputs | Verified design expectation; runtime deferred |
| schema permits enough choice/condition dimensions to exceed 4,096 | current code returns `candidateLimitExceeded` after construction | prepared-context certificate returns typed `unsupported` before publication; no partial numeric maximum | Verified design A3; certificate/oracle Deferred TSK-06.41 |

### Alternatives

| Alternative | Correctness | Complexity | Migration | Performance／test cost |
| --- | --- | --- | --- | --- |
| Preserve the proposed global contribution／dependency graph | Expressive if every duplicate identity and edge remains synchronized | Highest: graph nodes, uses, explicit read points, composition IDs, and parallel stage unions duplicate existing ordered IR | Largest schema and compiler cutover | More inventory dimensions and collision fixtures; candidate bound unchanged but compile／test cost rises |
| Keep operation-ID projection and add condition exceptions | Cannot split NP base／special or mixed sibling outputs; repeats the current structural defect | Low initially, unbounded exceptions later | Small but leaves parallel semantics | Cheap tests do not prove completeness; rejected |
| Preserve the planning-diff action transaction + consequence summary + nested effect/contribution | Represents action atomicity but duplicates every state consequence, lacks a passive outer node, and needs conditionality synchronization | Medium-high: summary-to-step correspondence and source exceptions become new invariants | Destructive IR replacement plus synchronization fixtures | Candidate bound remains unproved; test matrix grows across summary × step × contribution |
| **Discriminated action/automatic source program with one ordered step-operation list** | Directly represents action atomicity, passive sources, retained mutation, concrete contribution evaluation, lazy reads, and final-damage branch selection | Smallest closed model: no graph and no consequence summary; order supplies read points | One destructive IR/runtime/portable cutover after design closure | Reuses the reducer; bounded schema and oracle are required before a cap can be retained |

### Recommendation

Adopt the fourth alternative. The canonical model is a discriminated source program with one ordered operation
sequence, not a general dependency graph or an admission summary synchronized to an execution tree:

```ts
type CanonicalSourceProgram =
  | {
      kind: 'action';
      sourceId: CanonicalSourceId;
      actionOptionId: CanonicalActionOptionId;
      command: CanonicalPreparationCommand;
      preconditions: readonly CanonicalRequirement[];
      steps: readonly CanonicalExecutionStep[];
    }
  | {
      kind: 'automatic';
      sourceId: CanonicalSourceId;
      source: CanonicalAutomaticSourceKind;
      steps: readonly CanonicalExecutionStep[];
    };

interface CanonicalExecutionStep {
  stepId: CanonicalStepId;
  activation: CanonicalStepActivation;
  operations: readonly CanonicalStepOperation[];
}

interface CanonicalDamageContribution {
  contributionId: CanonicalContributionId;
  presentationGroupId: CanonicalEffectId | null;
  source: 'voluntarySkill' | 'passive' | 'attackNp';
  evaluation: CanonicalContributionEvaluation;
}
```

`CanonicalAutomaticSourceKind` is the closed non-command source union needed by the shared calculator executor,
including passive, intrinsic, craft-essence, support, and mystic-code sources. Ranking policy admits only the
bounded sources in its product; it does not shrink the common execution IR. `CanonicalStepOperation` is a closed
pipeline-owned union of resource／HP／state／form／field mutation, damage
contribution, `boundedPhaseIrrelevant` with a typed proof, and `unsupported`. Application derives admission from
the selected action option's ordered operations; it does not receive a pipeline-authored verdict or a separate
consequence summary. An unclassified operation is `unsupported`, never `outOfScope`.

Order supplies the read point: an action precondition is read before its transaction, step activation at that
step, and contribution evaluation only when the included contribution is reached. The evaluation owns its
concrete requirement, value expression, and input reads; conditionality is derived from those typed reads and is
not a parallel enum. Canonical input keys may be shared by multiple readers; no dependency node identity is
needed. The executor returns source/step/operation outcomes and one `EffectiveContributionSet`. Damage and
presentation consume that result without re-reading requirements.

Portable resolved intent becomes a discriminated union:

```ts
type ResolvedExecutionIntent =
  | { kind: 'calculator'; initialNpGauge: 10000 }
  | {
      kind: 'ranking';
      initialNpGauge: number;
      policy: { selfBuffs: 'included' | 'excluded'; conditionalEffects: 'baseline' | 'satisfied' };
    };
```

Manual remains a separate portable request variant. Ranking replay compiles admission and contribution policy
from the stored ranking policy; calculator execution includes every satisfied contribution in its explicit
scenario. No condition policy is inferred from world facts.

### Flow inventory and closure

| Path | Classification |
| --- | --- |
| raw source effect → canonical step operation | Verified design A1: closed operation union and all 9,123 raw effect occurrence dispositions recorded; runtime/ratchet Deferred TSK-06.41 |
| bounded active skill-slot domain | Verified design A2: source-specific schemas and 1〜3 active/mystic slots fixed; implementation Deferred TSK-06.41 |
| action option/choice and world domain | Verified design A3: at most one player-choice group plus complete prepared-context domain certificate ≤4,096; implementation/oracle Deferred TSK-06.41 |
| self-excluded/satisfied optional condition-enabler | Verified product decision: optional action is omitted; independently `structuralRequired` action is retained; fixture Deferred TSK-06.41 |
| source-program identity and action transaction | Verified design correction: action and automatic source are separate; action option is the atomic unit; runtime Deferred TSK-06.41 |
| candidate-local structural/effective role | Verified design: derived after AttackProfile and complete ordered path; runtime Deferred TSK-06.41 |
| step activation/operation/contribution evaluation | Verified design correction; no consequence summary or eligibility synchronization field; IR implementation Deferred TSK-06.41 |
| condition truth and nested composition | Verified: battle execution remains the sole evaluator; focused delta Deferred TSK-06.41 |
| policy admission → finite candidate domain | Verified design A3: admission precedes live dimensions and certificate sum; runtime Deferred TSK-06.41, production proof Deferred TSK-06.5 |
| ordered execution／rollback／lazy input recovery | Verified owner; new nested-result paths Deferred TSK-06.41 |
| effective contribution → damage／selection／row／badge／detail | Verified owner and derivation rule; implementation Deferred TSK-06.41 |
| five-class profile aggregation／bounded diagnostics | Verified design; implementation Deferred TSK-06.41 |
| portable request／fingerprint／draft／history／share／backup | Verified discriminated identity design; implementation Deferred TSK-06.41 |
| schema 33 intent-specific recovery | Verified: manual migrate, calculator deterministic current intent, ranking matching pair historical-only, ambiguous reject／snapshot discard; fixtures Deferred TSK-06.41 |
| true calculator reset | Verified design: fresh baseline constructor and atomic replacement; implementation Deferred TSK-06.41 |
| minimal Web handoff | Deferred TSK-06.41 because it is a direct schema writer |
| notice／interaction／cache／responsive／a11y | Deferred TSK-07 |
| accepted ADR authority | Verified: ADR-028 accepted; ADR-019／027 superseded and retained only as history |
| four-policy × NP1〜5 production maximum and performance | Deferred TSK-06.5; schema certificate and small exhaustive oracle strategy are fixed by A3 |

Current closure: `Blocking 0`. TSK-06.4 design is done and TSK-06.41 is ready after documentation validation.
No runtime path is Verified by this design audit; every implementation path remains explicitly Deferred.

### Planning delta

- Delete the global `DependencyNode／DependencyUse／readPoint` proposal and the four-owner B1〜B4 partition.
  The semantic families are now canonical source program, ranking application policy／outcome, and portable
  identity; execution remains their single shared evaluator.
- A1〜A3 are closed in the document-only TSK-06.4: production operation classification, source-specific schema
  bounds, and the complete candidate-domain certificate are implementation inputs, not TSK-06.5 cleanup. The
  optional condition-enabler decision remains closed by requirement 5.5.
- Do not create a separately completed runtime IR-preparation phase: keeping old behavior through a new IR would
  require an adapter or parallel compiler. Pipeline/master IR, all consumers, ranking policy, five-class outcome,
  portable schema, fingerprint, direct writers, and minimal handoff switch destructively in TSK-06.41. Internal
  commits may be ordered, but there is no phase-complete mixed runtime.
- ADR-028 is the accepted source-program／policy／portable decision; ADR-019／027 are superseded in the same
  documentation change.
- TSK-06.5 owns only exhaustive four-policy maximum, production parity, performance, and zero-legacy proof. A
  semantic mismatch found there reopens TSK-06.41; it is not patched in the audit layer.

## Rejected pre-audit proposal — non-normative review history

> TSK-06.4 reopened three semantic families owned by this note: B1 per-contribution ownership, B3 complete
> profile outcome／dominance, and B4 action admission. Portable identity／persistence／recovery remains the
> separate B2 family owned by `portable-calculation-identity-flow-tsk-06-1.md`. B1 and B2 share only the
> compiled typed projection interface; B4 consumes B1 results but never reclassifies them. Runtime paths
> remain `Deferred: TSK-06.41`／`TSK-06.5` until every design Blocking reaches 0.

### Former TSK-06.4 design reopening delta

> Historical design record: every disadvantage-free admission assertion in this section is superseded by the
> IRL-006 product correction at the top of this note. The retained architectural ownership and contribution
> projection decisions still apply.

### User-visible outcome and invariant

`baselineOnly` selects only safe deterministic voluntary actions with an unconditional effective
contribution, plus structural actions required to reach the AttackProfile. It preserves every legal ordered
mutation and evidence of those actions, but excludes damage contribution that depends on a conditional
requirement. A conditional-only voluntary action is not selected as a baseline no-op.

`satisfiedCandidates` extends that baseline with canonically represented conditional tradeoffs such as NP
consumption and with target／field／state／quantity／stochastic candidates. It does not add independent local
maxima: all included contributions must coexist in one legal ordered scenario, and an exclusive branch is
selected by final damage after costs and downstream state are applied.

This is the final product direction, not a compatibility target. `self included` admits only unconditional、
deterministic、disadvantage-free optional skills plus candidate-local structural actions. `condition satisfied`
then extends that same legal plan with compatible special attack、conditional contribution、field、and fully
represented costs such as NP consumption. Old operation-ID projection、parallel policy runtime、and adapters
must be deleted in the semantic cutover rather than retained beside the canonical model.

Damage, selected rank, effective logical effect count, and the special-attack badge derive from one effective
contribution set. Detail keeps the independent self／condition／area policy decisions, execution effects,
state, action, and evidence instead of filtering excluded effects. These outcomes are now governed by ranking
requirements 5〜7、10、11、17 and are the approved product target for TSK-06.4〜06.5.

### Confirmed mechanism and previous review gap

`compileRankingComparisonPolicy` emits `conditionalContribution: baselineOnly | satisfiedCandidates`,
but candidate materialization compiles `DamageContributionProjection` from only `selfSkill` and `area`.
The baseline condition currently limits generated world／input candidates and stochastic inputs; it does
not classify or remove a contribution whose condition becomes true through baseline facts or ordered
self mutation. `executeNpDamage` also contains base NP damage and conditional special multipliers in one
operation, so excluding every `npSpecial` operation would incorrectly remove the NP itself.

The original review proved candidate soundness, maximum completeness, and replay parity, but replayed the
same incomplete projection. It did not trace the conditional policy command through projection, damage
input, selection, row aggregation, detail, and badge, and it had no production assertion that baseline
conditional contamination was zero. The later shared projection refactor centralized source／area
classification but preserved the missing condition axis. This was a recurrence-scope gap in the earlier
review, not evidence that the approved conditional-contribution contract was complete.

Portable identity exposes a cross-family interface defect: current resolved ranking requests persist only
`standard | excludeVoluntarySkillModifiers`, while this family needs a compiled condition projection.
The portable flow note owns request identity, persistence, migration, and recovery; this note owns the typed
projection input consumed by execution. Neither family reclassifies the other's semantics.

Profile outcome aggregation is a third confirmed mechanism. `RankingProfileResult` currently exposes only
`calculated | unavailableUnderPolicy | invalid`; repairable `inputRequired` is converted to `invalid`, and
unsupported or incomplete candidates can collapse into no candidate. A lower calculated candidate must not
hide an unknown candidate that could change the maximum. This outcome closure belongs to TSK-06.4／06.41 because
per-contribution evaluation changes the candidate result population; it is not deferred to TSK-08.

Action admission is a fourth mechanism. The current planner can retain a conditional-only safe action in the
baseline candidate set, while the earlier proposal classified NP consumption as globally adverse. The first
produces policy no-op actions and unstable detail; the second removes a required conditional theoretical
candidate. B4 therefore separates static action semantics, policy admission, candidate-local reachability,
and contribution projection before implementation.

### Layer ownership

```text
data pipeline emits canonical dependency／contribution／action cost IR
battle execution evaluates dependency truth, resolved value, and execution outcome
calculation application compiles ActionAdmissionPlan and independent self／condition／area projection
ranking／portable／production audit call the same application compiler
battle execution consumes only the compiled typed projection
```

No application compiler interprets Atlas/raw vocabulary. Execution does not select a ranking policy, and
ranking／portable do not independently reclassify operation source, scope, requirement, or contribution.

### Canonical contribution and dependency design gate

Before implementation, one bounded contribution graph must replace operation-ID-only policy ownership.
Its population is policy-excludable damage contributions plus an NP base sentinel where one operation must
be split. Policy-invariant base ATK, class affinity, card constants, and equivalent base inputs remain
ordinary damage input and are inventoried as `N/A: policy invariant`; this Task does not create a general
provenance engine. Dependency identity is separate from consumer edges so one dependency can feed multiple
operations／mutations／contributions and one contribution can use multiple dependencies:

```ts
interface CanonicalDamageContribution {
  contributionId: CanonicalContributionId;
  sourceRef: CanonicalContributionSourceRef;
  operationId: string | null;
  presentationGroupId: CanonicalEffectIdentity | null;
  component: 'modifier' | 'modifierRate' | 'ignore' | 'npBase' | 'npSpecial';
  outputAddress: DamageContributionOutputAddress;
  composition: DamageContributionComposition;
  compositionIdentity: CanonicalCompositionIdentity;
  executionOrder: number;
}

interface DependencyNode {
  dependencyId: CanonicalDependencyId;
  expression: ContributionDependencyExpression;
  dependencyOrigin: DependencyOrigin;
}

interface DependencyUse {
  dependencyId: CanonicalDependencyId;
  consumer:
    | { kind: 'operation'; operationId: string }
    | { kind: 'mutation'; mutationId: CanonicalMutationId }
    | { kind: 'contribution'; contributionId: CanonicalContributionId };
  roles: NonEmptyReadonlyArray<
    | 'executionPrecondition'
    | 'retainedMutation'
    | 'contributionApplicability'
    | 'contributionValue'
  >;
  readPoint:
    | { kind: 'beforeOperation'; operationId: string }
    | { kind: 'afterOperation'; operationId: string }
    | { kind: 'beforeAttackNp' };
}

interface CanonicalContributionGraph {
  contributions: readonly CanonicalDamageContribution[];
  dependencies: readonly DependencyNode[];
  uses: readonly DependencyUse[];
}
```

`contributionId` distinguishes components inside one operation, especially NP base from each special
damage component. `dependency` is not an alias for `operation.condition`; its leaf origins cover
activation requirement, value dependency, stochastic dependency, resource dependency, world／state
dependency, and intrinsic／unconditional input. The audit population is every contribution reaching a
damage-input component plus every canonical dependency that changes its applicability or value.

Origin answers where a dependency comes from; an edge role answers why a consumer reads it; `readPoint`
answers which ordered state snapshot supplies its truth. The same expression before and after a mutation is
not merged merely because its syntax matches. One input may resolve multiple dependency nodes, one node may
have multiple role edges, and liveness is the union of every retained consumer.

Canonical IDs are emitted by the pipeline from typed source identity, component identity, and a canonical
source-local ordinal that is part of normalized IR—not the runtime array index, label, or iteration order.
The ID namespace and serialization version are explicit; synthetic NP base、split contribution、choice branch、
and cloned form variant identities have collision fixtures. `contributionId` is unique within one compiled
AttackProfile graph; `presentationGroupId` is a stable many-to-one logical effect identity; composition and
dependency identities have deterministic ordering and collision checks. Master-version changes may change an
ID only when one of its canonical inputs changes.

### Typed stage transitions

IR, policy, liveness, execution, and effective damage are separate discriminated stages rather than optional
fields on one evaluation object:

```text
CanonicalContributionGraph
  -> CompiledContributionProjection
  -> PotentialInputPlan
  -> ContributionExecutionResult
  -> EffectiveContributionSet
  -> DamageResolutionInput + RankingPresentation
```

- `CompiledContributionProjection` records independent `self`、`condition`、`areaView` decisions for every
  contribution. A contribution may be excluded on more than one axis; it has no resolved value or execution
  outcome.
- `PotentialInputPlan` contains only dependency reads reachable from admitted actions and included or retained
  consumers. It is a conservative execution plan, not an exact pre-execution truth result. Excluded-only
  value／applicability edges cannot appear live.
- `ContributionExecutionResult` is a union of applied, not-applicable false, unknown/input-required,
  execution-rejected, unsupported, and invalid outcomes. The ordered evaluator resolves actual reads at each
  `readPoint`, after short-circuit、selected branch、and prior mutation. Only an included, true, successfully
  executed contribution can carry a resolved value into `EffectiveContributionSet`.
- `EffectiveContributionSet` contains applied contribution IDs, resolved values, output addresses, and
  composition identities only. Damage／selection／row／badge consumers cannot inspect raw requirements to
  reclassify inclusion.

This makes unsupported-with-value, excluded-only-but-input-required, failed-but-effective, and
false-but-applied states unrepresentable rather than relying on consumer checks. Projection inclusion is
not itself effective application; execution may still produce a typed non-effective outcome.

### Projection-after-input liveness matrix

| Dependency role reached by an input | Contribution included | Contribution excluded | Required input outcome |
| --- | --- | --- | --- |
| execution precondition | yes／no | operation still executes | live／required |
| retained mutation | yes／no | mutation／state evidence remains | live／required |
| contribution applicability only | yes | evaluate applicability | live／required when no earlier canonical truth resolves it |
| contribution applicability only | no | no retained consumer | dead／must not emit `inputRequired` |
| contribution value only | yes | resolve effective value | live／required |
| contribution value only | no | no retained consumer | dead／must not emit `inputRequired` |
| execution／mutation plus excluded contribution value | mixed | retained consumer remains | live／required |

Potential input reachability is computed after policy projection and action admission but before execution.
Actual `inputRequired` is emitted only by ordered evaluation at the edge's `readPoint`; the planner does not
predict mutation-derived exact truth. Potential planning may suppress only reads whose entire consumer set is
excluded; it never disables an operation precondition or a retained mutation. `any(true, input-dependent)`、
unselected exclusive branches、and false applicability do not request value inputs that execution never reads.

Current-world evaluation and policy classification are separate results. Canonical simplification may
remove a branch only with a static proof; truth created by an ordered mutation does not make the
requirement unconditional.

`unknownTruth` means a supported leaf reads a fact that is not yet known and participates in three-valued
logic. `unsupportedSemantics` means the leaf itself cannot be interpreted and fails the whole expression
closed. `invalidExpression` means malformed canonical IR and remains distinct from engine support. A
well-formed but statically unsatisfiable expression is ordinary `false`. A tuple proven contradictory while
the planner constructs its canonical domain is not emitted and receives an unavailable disposition proof. A
contradictory user／schema state or a contradictory tuple emitted by the planner is `invalid`; the two are not
represented by the same reason.

| Composition | Result |
| --- | --- |
| `all(true, unknownTruth)` | `unknownTruth` |
| `any(true, unknownTruth)` | `true` |
| `not(unknownTruth)` | `unknownTruth` |
| any expression containing `unsupportedSemantics` | `unsupportedSemantics`; a true sibling does not reinterpret the leaf |
| well-formed but unsatisfiable expression | `false`／candidate unavailable |
| contradiction proven during canonical domain construction | not emitted／unavailable proof |
| contradictory user／schema state | invalid |
| malformed canonical expression | `invalidExpression` |
| planner emits a candidate outside its canonical domain | invariant violation／profile invalid |

### Contribution output and composition matrix

| Contribution family | Output address | Composition | Boundary／dependency |
| --- | --- | --- | --- |
| normal modifier | typed modifier bucket＋card qualifier | ordered additive fold after card applicability | activation and value dependencies are separate |
| modifier rate | typed rate bucket linked to its modifier family | maximum rate contribution, then multiply the completed base sum | cannot be projected as an independent additive modifier |
| ignore flag | typed damage-function boolean | boolean OR | execution and policy state remain per contribution |
| NP base sentinel | NP level multiplier slot | canonical base replace／selection | intrinsic and always included; exists only to split a mixed NP operation |
| NP special multiplier | typed NP special slot | canonical multiplier composition | special requirement and effective value are independent from NP base |
| HP／trait-count／Battle Point／rarity-derived NP value | declared NP value／multiplier slot | operation-defined typed composition | value dependency is classified even without `operation.condition` |

Any additional production output address or composition becomes Blocking until added here. A dependency
origin with zero production occurrences receives both a production `0` ratchet and a schema-legal focused
fixture; absence from current master data is not closure by itself.

### Profile outcome and dominance matrix

Candidate execution and profile results map to the same externally meaningful five classes without collapsing
repairability, semantic invalidity, or implementation support. Internally, omitted／deduplicated domain states
remain `CandidateDisposition`; they are not fake executed candidates:

| Candidate outcome | Meaning | Profile aggregation rule |
| --- | --- | --- |
| `calculated` | complete executable candidate with numeric damage | participates in maximum |
| `unavailableUnderPolicy` | candidate is canonically unreachable or disabled by the selected policy | never blocks another complete calculated candidate |
| `inputRequired` | executable semantics need repairable canonical user input | blocks numeric profile result unless the candidate is already unavailable by planner proof |
| `invalid` | contradictory user／schema state、malformed IR、planner invariant violation | blocks numeric profile result; never converted to unavailable |
| `unsupported` | canonical semantics exist but this engine cannot evaluate them completely | blocks numeric profile result unless the candidate is already unavailable by planner proof |

`RankingCandidateSpace` is the only disposition proof owner. It may omit or deduplicate a domain state only with one typed
`CandidateDispositionProof`: `staticallyUnsatisfiableRequirement`,
`contradictionProvenDuringDomainConstruction`, `noEffectiveContributionUnderPolicy`, or
`duplicateCanonicalState` with the retained state identity. A tuple outside the declared finite domain is
not a candidate; if the planner emits it, that is an invariant violation and profile invalid. No numeric
upper-bound heuristic, reachability
inference, or requirement evaluation may be added to the aggregator. An input-required or unsupported
candidate is therefore never ignored as “unable to beat the maximum”; it stays blocking until made
unavailable by one of those canonical planner proofs.

`unknownTruth` becomes `inputRequired` only when supported semantics lacks an explicit canonical user input.
Planner-generated target／field／state／quantity／stochastic witnesses are finite domain choices, not missing user
input. The blocker population is the admitted canonical candidate set; arbitrary tuples outside that domain do
not block the profile.

With at least one calculated candidate, only proven candidate-local unavailable is safely dominated. With no
calculated candidate and only unavailable candidates, the profile is unavailable. Any remaining input-required,
invalid, or unsupported candidate blocks a numeric profile result. When multiple blocking classes coexist,
profile status
uses `invalid > unsupported > inputRequired > unavailableUnderPolicy`; it retains every candidate-local blocker
as bounded typed evidence, so precedence controls presentation／recovery and does not erase diagnostics.
Diagnostics store class-level count, stable digest, and bounded representatives per class rather than every
candidate. `calculated` dominates only unavailable and otherwise yields to the highest blocking class. This
precedence is fixture-backed and never selected by candidate iteration order.

### Presentation matrix

| Surface | Canonical source | Policy-excluded contribution |
| --- | --- | --- |
| row effect count | distinct `presentationGroupId`／canonical logical effect identity among effective contributions | excluded groups are not counted; internal contribution split does not change the count |
| detail | all execution effects and contributions | retained with independent self／condition／areaView decisions |
| special-attack badge | effective special contribution set | absent when no special contribution remains effective |
| action／state／field／resource evidence | ordered execution record | always retained; policy exclusion is not execution failure |
| outcome notice | typed profile outcome plus policy state | distinguishes exclusion, input required, invalid, and unsupported |

Detail retains each policy axis independently; it does not choose a single exclusion reason when self and
condition both exclude the same contribution. `areaView` remains a detail counterfactual rather than a sixth
ranking condition.

`contributionId` is internal damage provenance and is never the user-facing count identity. Multiple output
buckets, modifier／rate pairs, stochastic minimum／success delta, or NP special components from one logical
effect share one `presentationGroupId`. The intrinsic NP base sentinel has `presentationGroupId: null` and is
never counted as an applied effect. This is a product contract, not a consequence of implementation shape.

### Reopened flow inventory

| Path | Current classification |
| --- | --- |
| canonical contribution／dependency IR design | Blocking B1／TSK-06.4: output population, origin, role, and liveness identity require approval |
| ranking condition policy producer | Verified: typed `baselineOnly | satisfiedCandidates` declaration exists |
| typed stage transition design | Blocking B1／TSK-06.4: IR／projection／liveness／execution／effective aggregation unions require approval |
| truth／semantic composition design | Blocking B1／TSK-06.4: three-valued truth, unsupported semantics, and invalid expression require typed approval |
| contribution output／composition design | Blocking B1／TSK-06.4: all output addresses and composition identities require inventory closure |
| presentation grouping design | Blocking B1／TSK-06.4: logical effect identity and NP base exclusion require product approval |
| portable compiled-projection interface | Blocking B1／TSK-06.4: interface with the separate portable family requires mutual approval |
| profile outcome／dominance design | Blocking B3／TSK-06.4: five classes, precedence, bounded diagnostics, and completeness proof require approval |
| action admission／relevance design | Blocking B4／TSK-06.4: structural、safe、conditional tradeoff、no-op proof、candidate reachability require approval |
| canonical producer implementation | Deferred: TSK-06.41 after design Blocking 0 |
| normal modifier／rate／ignore and NP base／special projection | Deferred: TSK-06.41 |
| ordered state／field／resource mutation and rollback | Deferred: TSK-06.41 |
| state-derived downstream contribution and input liveness | Deferred: TSK-06.41 |
| candidate selection／damage cache／profile aggregation | Deferred: TSK-06.41 |
| row／detail／special badge／outcome presentation | Deferred: TSK-06.41 |
| action admission implementation | Deferred: TSK-06.41 atomic semantic cutover |
| exhaustive production final maximum | Deferred: TSK-06.5 after TSK-06.41 |
| direct portable Web writer／minimal handoff parity | Deferred: TSK-06.41 as part of breaking schema cutover |
| TSK-07 notice／recovery interaction／cache and final audit | Deferred: TSK-07／TSK-08 after TSK-06.5 |

### State-by-path matrix

| Canonical state | Operation／mutation | Baseline projection | Satisfied projection | Selection／presentation | Status |
| --- | --- | --- | --- | --- | --- |
| `always`／intrinsic and NP base | apply normally | include | include | same effective set | Verified: requirement v0.9.1 |
| unconditional deterministic player choice | execute one selected exclusive branch | include | include | choose one legal maximum branch | Verified: requirement v0.9.1 |
| target／targetState conditional modifier | preserve grants and condition result | exclude contribution | include only with legal witness | damage／rank／badge follow projection | Verified: requirement v0.9.1 |
| field, including self-generated field | preserve field mutation | exclude dependent contribution | include in one legal field candidate | evidence remains even when contribution excluded | Verified: requirement v0.9.1 |
| HP／quantity／canonical input／resource gate | enforce live input and execution precondition | dead contribution-only input is not required | include legal maximum only | no fallback or precondition bypass | Blocking TSK-06.4: liveness approval |
| stochastic outcome | preserve minimum／failure semantics | exclude success-only damage contribution | include legal maximum outcome | effect reason remains stochastic, not policy-disabled | Verified: requirement v0.9.1 |
| conditional NP special multiplier | execute NP base damage | multiplier 1／conditional part excluded | legal multiplier included | special badge only when included | Verified: requirement v0.9.1 |
| activation input A＋value input B | separate dependency nodes／edges | A remains live for execution; B follows projection | both live when contribution included | no role collapse | Blocking TSK-06.4: graph／liveness approval |
| one input shared by included／excluded contributions | one dependency node, two consumer edges | live through included consumer only | live through both included consumers | no duplicate input or false suppression | Blocking TSK-06.4: graph／liveness approval |
| `all(true, unknownTruth)` | three-valued composition | unknown | unknown until resolved | no guessed witness／number | Blocking TSK-06.4: composition approval |
| `any(true, unknownTruth)` | three-valued composition | true | true | unknown branch does not hide true | Blocking TSK-06.4: composition approval |
| `not(unknownTruth)` | three-valued composition | unknown | unknown | no guessed negation | Blocking TSK-06.4: composition approval |
| `all(always, targetTrait)` | evaluate current truth separately | conditional | include only with legal target witness | preserve dependency explanation | Blocking TSK-06.4: classification approval |
| `any(always, targetTrait)` | statically simplify `always` branch | unconditional | unconditional | no external witness required | Blocking TSK-06.4: classification approval |
| `not(targetTrait present)` | evaluate explicit absence fact | conditional external-absence dependency | include only with legal negative witness | absence is evidence, not default inference | Blocking TSK-06.4: classification approval |
| `any(targetTraitA, targetTraitB)` | evaluate both branches canonically | conditional | include one sound satisfiable branch | no contradictory combined witness | Blocking TSK-06.4: classification approval |
| `all(T, not(T))` | well-formed static false | candidate unavailable | candidate unavailable | does not block another calculated candidate | Blocking TSK-06.4: classification approval |
| `any(unsupportedSemantics, always)` | semantic fail-closed | cannot produce numeric result | cannot produce numeric result | distinct from `unknownTruth` composition | Blocking TSK-06.4: classification approval |
| truth created by self mutation | preserve mutation and evaluate true | requirement remains conditional; exclude contribution | include contribution | execution truth and policy class stay distinct | Verified: requirement v0.9.1 |
| stochastic minimum＋success delta in one operation | execute one operation／outcome | retain minimum; exclude conditional delta | include legal outcome delta | one presentation group | Blocking TSK-06.4: graph／group approval |
| exclusive proc branches A／B target different buckets | preserve exclusive choice | include only baseline-effective branch outputs | include one legal maximum branch | never combine A＋B | Blocking TSK-06.4: graph／composition approval |
| modifier＋modifier rate share one condition | one dependency node, multiple consumer edges | both excluded together when conditional | both included when true | composition order remains typed | Blocking TSK-06.4: edge／composition approval |
| conditional ignore＋unconditional modifier in one effect | one presentation group, two contributions | keep modifier; exclude ignore | include legal ignore | row effect count remains one | Blocking TSK-06.4: split／group approval |
| excluded contribution input also feeds retained mutation | shared dependency with multiple role edges | input remains live | input remains live | no false `inputRequired` suppression | Blocking TSK-06.4: liveness approval |
| nested `false`＋`unknownTruth`＋`unsupportedSemantics` | separate truth and semantic status | canonical composition result | canonical composition result | no numeric fallback | Blocking TSK-06.4: composition approval |
| one logical effect split into multiple outputs | retain canonical effect identity | count effective group once | count effective group once | internal split does not change UI count | Blocking TSK-06.4: presentation approval |
| conditional-only safe skill | no baseline action | no candidate／no detail action | candidate only with legal witness | no policy no-op action | Verified: requirement v0.9.1; fixture Deferred TSK-06.41、production ratchet TSK-06.5 |
| unconditional＋conditional sibling | one safe transaction | action＋unconditional contribution | add legal conditional sibling | no partial transaction | Verified: requirement v0.9.1; fixture Deferred TSK-06.41、production ratchet TSK-06.5 |
| NP-consuming conditional tradeoff | not baseline-safe | no candidate | candidate only if attack NP remains reachable | cost is never discarded | Verified: requirement v0.9.1; fixture Deferred TSK-06.41、production ratchet TSK-06.5 |
| same trait expression before／after self mutation | two read points | pre-mutation truth | ordered post-mutation truth | syntax does not collapse time | Blocking B1／TSK-06.4 |
| self and condition both exclude one contribution | execute retained action／mutation | preserve both policy decisions | condition may include while self excludes | detail keeps both axes | Blocking B1／TSK-06.4 |

### Planning closure

- Verified: approved requirement already defines operation／state preservation, conditional contribution
  exclusion, effective-contribution-derived badge, and fail-closed execution preconditions. HEAD、main、
  merge-base are the same `45878789...`; the confirmed code mechanism predates this planning diff.
- Contribution execution／projection is B1, profile outcome／dominance is B3, and action admission is B4.
  Because B3 blocker population and input reachability depend on B4, TSK-06.41 performs one runtime semantic
  cutover for B1〜B4 and the portable B2 identity. TSK-06.5 adds no ranking semantics; it closes the exhaustive
  production maximum、four-policy inventory、performance、and legacy-removal proof.
- Portable identity is a separate B2 family and is not counted here. The shared compiled-projection interface
  must reach compatible approved types in both notes before either implementation starts.
- The breaking portable cutover includes every direct request reader／writer and minimal production Web
  handoff parity in TSK-06.41. TSK-07 retains presentation notice, recovery interaction, bounded cache,
  responsive, and accessibility closure. TSK-08 consumes the final TSK-06.5 inventory rather than producing a
  second semantic inventory.

The four proofs remain separate, but ownership follows the implementation order so eligibility does not
invalidate a just-closed maximum baseline:

| Proof | Minimum evidence | Current status |
| --- | --- | --- |
| focused candidate soundness | schema-legal action／branch／cost fixtures emit one legal ordered scenario | Deferred: TSK-06.41 |
| production candidate soundness | every emitted production candidate is one legal ordered scenario | Deferred: TSK-06.5 |
| per-contribution completeness | all policy-excludable outputs and live dependencies are represented exactly once | Deferred: TSK-06.41 |
| focused finite maximum oracle | small exhaustive schema-legal oracle matches the cutover planner | Deferred: TSK-06.41 |
| production maximum closure | four-policy × NP1〜5 inventory and representative exhaustive oracle detect missing candidates | Deferred: TSK-06.5 |
| portable／calculator execution parity | same typed request and projection reproduce damage, outcomes, and evidence | Deferred: TSK-06.41, then final regression in TSK-06.5 |

### TSK-06.4 eligibility design gate／TSK-06.41 atomic implementation boundary

TSK-06.4 approves static action semantics, policy admission, candidate-local reachability, branch atomicity,
and contribution projection before TSK-06.41 starts. TSK-06.41 implements B4 before potential input planning、
execution、and B3 aggregation inside the same atomic semantic cutover. Static semantics describe what an action is; the two ranking axes decide where it may be
admitted; ordered execution decides whether the concrete candidate remains reachable.

| Unit／mutation | Proposed classification | Atomicity／projection rule |
| --- | --- | --- |
| skill action | static `safeDeterministic | conditionalTradeoff | unsupported | outOfScope` | transaction全体を分類し、sibling operationを部分適用しない |
| AttackProfile到達role | candidate-local `structuralRequired | optional` | form、current state、ordered pathから導出し、static action kindへ固定しない |
| candidate-local action | `eligible | unreachable | unsupported` | initial resource、ordered path、AttackProfileを含めて評価する |
| canonical player-choice branch | branch-local static semantics and eligibility | 排他branchを一つの合法transactionとして選び、adverse siblingを落とさない |
| executed damage component | contribution projection | conditional siblingと独立に各dependencyを分類する |
| attacker HP decrease／NP consumption／typed detrimental state | `conditionalTradeoff` when fully represented | 成立込みでもcostをcommitし、attack NP到達不能は`unreachable` |
| stochastic／failure-capable transaction | `conditionalTradeoff` | 通常のみでは候補化せず、成立込みでも一つの合法outcomeだけを選ぶ |
| target debuff | safe or conditional by its requirement | damage contributionとしてB1 projectionへ渡す |
| conditional-only skill | policy no-op in baseline | 通常候補へ残さず、成立込みでだけ合法最大へ参加できる |
| unconditional＋conditional sibling | `safeDeterministic` action plus per-contribution projection | 通常は無条件寄与だけ、成立込みは合法なconditional siblingも含める |
| NP increase／beneficial state／trait grant／form transition | safe unless represented conditional cost exists | downstream state and livenessをordered executionで保持する |
| cooldownなどbounded preparation外 | `N/A: bounded phase外` | calculatorを一般battle simulatorへ拡張しない |
| 未解釈副作用 | `unsupported` | eligibleへ推測しない |

## Historical TSK-06 outcome and ownership

Every numeric value produced by the new ranking-policy API retains exactly one policy,
`AttackProfile`, ordered preparation program, start gauge, canonical input set, target candidate,
field candidate, quantity candidate, resolved scenario, and complete damage input. A candidate-space
error or an AttackProfile that cannot execute is never converted to baseline damage.

`RankingCandidateSpace` is the planning owner. It compiles finite domains from canonical master IR
before preparation runs. Battle execution remains the sole owner of ordered preparation, resource
preconditions, form transitions, overcharge, operation outcomes, and damage-input construction.
`calculateRankingPolicy` and the calculator use the same application facade and executor.

The old `RankingConditions` family is intentionally isolated through TSK-07. Its independent
`specialAttack` and `field` axes cannot be converted reversibly to
`RankingConditionalEffects`; therefore no legacy adapter exists. The worker/UI continue to use the
approved `ed88f1f8896354e31ae331b1d2302d765a2760e4` ranking family. New policy code is under
`rankingPolicyScenario`, `rankingPolicyCandidates`, `rankingPolicyCalculation`, and
`rankingPolicyMatrix`.

## Historical outcome classes before TSK-06.4 reopening

| Result | Meaning | Numeric value |
| --- | --- | --- |
| `calculated` | one complete candidate passed ordered preparation and canonical damage execution | yes |
| `unavailableUnderPolicy` | the requested AttackProfile exists but no candidate can execute | no |
| `invalid` | static semantics, canonical input, contradiction, or finite bound is invalid | no |

The legacy `RankingDetail` and new `RankingPolicyDetail` are distinct. Only the latter requires
candidate evidence. Execution rejection, missing input, and unsupported semantics remain typed and
are not passed to damage as guessed inputs.

## Flow inventory

| Path | Closure |
| --- | --- |
| policy producer | Verified: four self-buff × conditional-effect combinations compile to canonical commands |
| legacy producer | Verified: separate old family; non-reversible adapter removed |
| AttackProfile producer | Verified: policy-independent static inventory |
| preparation producer | Verified: finite initial form, ordered skill commands, optional transform NP, attack NP |
| preparation ordering | Verified: command sequence is part of state identity; equal slot sets in different orders remain distinct |
| semantic-domain producer | Verified: static conditions/input definitions only; no prepare/projection read during discovery |
| start gauge | Verified: baseline always present; satisfied policy adds legal capacities without overriding preconditions |
| TargetContext/field/quantity | Verified: finite canonical domains with baseline candidates and exclusive-fact constraints |
| complete product bound | Verified: checked before materialization, maximum production profile 2,880 / 4,096 |
| scenario materialization | Verified: every candidate starts from a fresh base scenario |
| ordered executor | Verified: TSK-05 transaction path; no ranking-side execution semantics |
| damage executor/cache | Verified: complete NP variant + damage input identity; calculator parity fixture passes |
| candidate selector | Verified: profile-local stable tie-break by damage, external facts, input deviation, actions/transitions, typed key |
| result writer | Verified: exhaustive calculated/unavailable/invalid profile result |
| recovery | Verified: another independently materialized candidate is tried; rejected prepared state is never mutated |
| legacy UI/worker/URL cutover | Deferred: TSK-07 |
| cross-level blueprint/cache optimization and full four-policy digest | Deferred: TSK-08 |
| support/CE/mystic-code/turn/refund expansion | N/A: outside the bounded TSK-06 policy |

## Canonical flow

```text
canonical master + AttackProfile + RankingComparisonPolicy
  -> static ordered PreparationProgram inventory
  -> static condition/input/resource domains
  -> full semantic product upper-bound check
  -> baseline + finite policy candidates
  -> fresh scenario materialization
  -> TSK-05 ordered preparation and canonical execution
  -> complete damage-input cache lookup
  -> AttackProfile-local stable selection
  -> calculated | unavailableUnderPolicy | invalid with one evidence trace
```

The NP1–NP5 correctness oracle is five complete `calculateRankingPolicy` calls. It does not rewrite
scenario/input NP level after execution and does not classify programs as partially reusable.
Optimization may cache only observable static blueprints or complete damage-input results in TSK-08.

## Counterexample matrix

| Counterexample | Classification |
| --- | --- |
| trait `present:true` / `present:false` | Verified: canonical evaluator completeness fixture |
| targetPredicate `present:true` / `present:false` | Verified: family-membership witness fixture |
| `target` / `targetState` positive, negative, and overlapping reads | Verified: physical read-scope closure fixture |
| traitCount `atLeast` / `atMost` / `equal` | Verified: target and field focused fixtures |
| provenance boundary by `trait` / `traitCount` variant | Verified: shared leaf-level source matrix across executor, audit, and planner axes |
| mixed ownership `any` / `all` / `not` | Verified: focused composition fixture and zero-production ratchet |
| nested `all` / `any` / `not` | Verified: canonical evaluator completeness fixture |
| exclusive traits: positive, negative, and mixed | Verified: candidate soundness fixture |
| self-generated trait before and after mutation | Verified: 405900 ordered target-state transition fixture |
| self buffs included/excluded with witness generation | Verified: four policy crossings and inventory fixtures |
| target traits with field, quantity, and canonical input | Verified: complete semantic-product materialization fixture |
| schema-legal conditions absent from production | Verified: focused traitCount/nested/exclusive fixtures |
| production 1102300 negative superGiant condition | Verified: NP1 average 88,558.08 and `powerMod` 0.5 |
| self buffs × conditional effects, all four crossings | Verified: focused policy fixture |
| external field absent/present | Verified: focused production fixture |
| self-generated field satisfies a later condition | Verified: focused production fixture |
| exclusive trait/class facts are not combined | Verified: finite-world fixtures |
| canonical-input-dependent form transition | Verified: schema-legal scenario fixture |
| ordered `S1 -> S2` and `S2 -> S1` with the same used slots | Verified: static program fixture |
| 505300 NP2–5 start gauge, terminal gauge, executor OC, and damage | Verified |
| rejected preparation does not become damage input | Verified: TSK-05 facade fixtures |
| one AttackProfile cannot substitute a sibling | Verified: full static inventory assertion |
| planner limit exceeded | Verified: typed `candidateLimitExceeded`, no numeric fallback |
| schema-legal unreachable profile | Verified: focused form-transition fixture returns `unavailableUnderPolicy` |
| exact tie | Verified: stable typed-key fixture |
| calculator/ranking scenario, effects, and result parity | Verified: all four policy fixture |
| UI presentation of new policy/evidence | Deferred: TSK-07 |

## Finite inventory

No effect inclusion is a dimension and no effect-subset `2^N` search remains. Domains are semantic:
ordered preparation program, start gauge, canonical inputs, target identity/facts, field facts, and
quantities. The complete per-profile product is checked before allocation.

Default new-policy production inventory:

| Counter | Value |
| --- | ---: |
| semantic upper bound | 7,255 |
| generated candidates | 7,255 |
| deduplicated candidates | 7,255 |
| damage request upper bound | 7,255 |
| damage requests | 6,913 |
| distinct damage inputs | 1,599 |
| cache hits | 5,314 |
| maximum one-profile product | 2,880 / 4,096 |

The ordered-program correction doubled the three-servant policy fixture from 24 to 48 baseline
candidates and from 208 to 404 satisfied candidates. Distinct damage inputs stayed 16/56 for included
and 4/14 for excluded; the extra legal orders therefore converge through the complete-input cache.
Production servant 2501400 also became calculated: its former unavailable result was a false negative
caused by unordered state deduplication.

The witness correction keeps the default baseline-policy inventory above unchanged. In the focused
three-servant satisfied-policy inventory, candidates increase from 404 to 1,056; included distinct
damage inputs increase from 56 to 104 and excluded from 14 to 26. The increase represents explicit
false/true physical target facts and the field all-absent state, not effect subsets. A production
audit checks 13,026 world-fact-only target condition occurrences across 205 servants/program paths and finds a
canonical true witness for every occurrence. The population includes 1,743 occurrences with
canonical default provenance, including 49 with a negative trait leaf.

## Structural findings and guardrails

### Fourth review reopening: nested ownership composition

Confirmed fact: the production audit recursively requires every leaf to be world-fact evaluable for
both `all` and `any`. The executor instead evaluates `any(effectLocal, worldTrue)` as true, while
`targetConditionWitnessSpace` retains the world branch axis and omits only the effect-local leaf.
The audit therefore excludes a schema-legal condition for which the planner can generate a true
witness. The same test-local `every` structure exists in parent `8393c5c`; current production has
zero mixed-ownership conditions, so the 13,026-condition inventory and ranking damage are unchanged.

Implementation mismatch: the leaf-level source matrix was presented as nested closure without
testing boolean composition. Missed detection: the added matrix covered only standalone leaves.
Recurrence scope: `any`, `all`, and `not` combinations of world-fact and effect-local leaves.
Minimum guardrail: name and document the production population as world-fact-only, cover mixed
ownership in focused fixtures, retain a world-true witness for `any`, and prove that `all` and
`not(effectLocal)` cannot be made true by fabricated world facts.

Resolution: the audit predicate is named and documented as world-fact-only rather than as general
witness eligibility. A focused schema-legal fixture proves that mixed `any` retains only the world
axis and has a canonical true witness, while mixed `all` and `not(effectLocal)` have no fabricated
true witness. The production gate separately ratchets mixed ownership at 0 conditions / 0 servants;
the world-fact-only population remains 13,026 conditions / 205 servants.

### Third review reopening: provenance variant ownership

Confirmed fact: `conditionTraitRequiresProvenanceDecision` accepts only a provenance value, so it
cannot own which `ConditionExpression` variants use provenance. The executor applies it only to
`trait`, while the production audit independently applies it to both `trait` and `traitCount`, and
`targetConditionWitnessSpace` enumerates both variants without consulting the classification.

Implementation mismatch: the exported value comparison was described as the executor-owned
provenance boundary even though union-variant applicability remained in each consumer. Missed
detection: the boundary fixture tested provenance values in isolation and did not cross executor
evaluation, audit eligibility, and witness-axis generation for every trait condition variant.
Recurrence scope: every new provenance-bearing leaf or consumer can choose a different applicability
set. Minimum guardrail: remove unsupported `traitCount.provenance`, expose a discriminated leaf-level
`worldFacts` / `effectLocalDecision` classification from battle-execution, and use it in the
executor, witness-space producer, and production audit with one schema-legal variant matrix.

Resolution: `ConditionExpression.traitCount` no longer exposes provenance because the canonical
pipeline has no provenance-aware count requirement. Battle-execution now accepts the whole
`trait | traitCount` leaf in `traitConditionEvaluationSource` and exhaustively returns `worldFacts`
or `effectLocalDecision`. The evaluator, `targetConditionWitnessSpace`, and production audit share
that classification. The variant matrix fixes absent/default/exceptional trait provenance and
provenance-free `traitCount`, including executor result, audit eligibility, and planner axes.

### Second review reopening: provenance audit population

Confirmed fact: the production completeness test admitted only traits with absent provenance, while
the executor also evaluates the canonical default provenance normally. This excluded 1,743
otherwise evaluable condition occurrences, including 49 `present:false` occurrences in the
recurrence family. The implementation already generates witnesses for the expanded population, but
the production gate did not retain that evidence. The guardrail is to export the executor-owned
provenance decision rule and use it directly when defining the audit population; test-local
provenance defaults are prohibited.

### Review reopening: incomplete condition witness space

Confirmed fact: `7159e27` changed `rankingWorld.ts` from enumerating both truth values for every
referenced target trait to deriving one value from the outer `not`, while ignoring the leaf
`present` value and the comparison/count of `traitCount`. It also treated a `target` trait as one
initial fact although the canonical evaluator reads both `target` and `targetState`. Consequently a
negative combined trait was left unknown or true after a state contribution, and a legal stronger
candidate could be absent. The production review fixture for 1102300 demonstrated this mechanism:
asserting `superGiant=false` in both physical scopes changes NP1 average from 80,857.34 to 88,558.08
and `powerMod` from 0.3 to 0.5.

Implementation mismatch: the planner partially reimplemented condition polarity instead of asking
battle-execution for the canonical read dimensions and validating witnesses with its evaluator.
Missed detection: parity tests replayed the selected candidate but did not compare the selected
maximum against the complete finite state space. Recurrence scope: target/targetState traits,
target predicates, `traitCount`, nested `all`/`any`/`not`, exclusive traits, and self-generated state
transitions. Minimum guardrail: separate candidate soundness, per-condition completeness, a small
exhaustive maximum oracle, and a production negative-condition damage fixture.

### Candidate discovery/execution cycle

The removed planner prepared a scenario to discover inputs/effects and then prepared again after
adding candidates. This was a procedural fixed-point search and its partial 4,096 checks did not
bound the total product. The guardrail is a static `RankingCandidateSpace` plus one whole-product
check before materialization.

### Non-reversible legacy adapter

Legacy `specialAttack` and `field` have four combinations, while one new conditional-effect axis
has two. Mapping either middle state to `satisfied` loses meaning. The adapter was removed; old and
new families remain separate until the UI cutover.

### Ordered-state deduplication

A state key based on a used-slot set collapsed different transaction orders. The state key now
contains the full command sequence. Semantic deduplication before execution is prohibited unless a
complete canonical state identity proves equivalence.

### Partial NP-level execution reuse

The removed matrix optimization executed NP5 candidates, rewrote scenario/input NP level, and
selectively reran candidates based on a ranking-owned sensitivity predicate. It recreated damage
semantics outside the executor. The canonical new-policy matrix is five complete executions;
blueprint-only caching is deferred.

### Executor-derived overcharge

The application previously rebuilt damage OC from persisted scenario OC and dropped the ordered
executor's terminal base OC. Calculator and new policy now use executor-derived OC. A scoped legacy
preparation option preserves the approved old ranking entrypoint only until TSK-07.

## Verification and performance

- Focused witness/policy/candidate/scenario diagnostics: 6 files / 55 tests passed.
- Unit: 60 files / 352 tests passed.
- Production: 27 files / 150 tests passed.
- Legacy production audit: 433 AttackProfiles/rows and damage cache 3,629 requests / 1,623 distinct,
  unchanged from the approved baseline.
- Ranking hot path after witness correction: 64.56s, 65.31s, 64.70s; median 64.70s versus the
  pre-correction median 60.91s (+3.79s / +6.22%, inside the 5s / 10% ratchet).
- Final production gate after registering the witness audit in the production suite: 80.16s,
  80.80s, 80.77s; median 80.77s versus the pre-correction median 75.50s (+5.27s / +6.98%). The
  measured increase includes 21 new production tests and remains below the 10% ratchet.
- Final `pnpm quality`: passed, including 64 executed E2E cases (32 project-filtered skips).

## Historical TSK-06 closure

- Verified: canonical witness generation, candidate soundness, per-condition completeness,
  exhaustive four-state maximum-damage oracle, selected-candidate calculator parity, production
  negative fixture, executor-shared leaf evaluation source, inventory, performance, ordered
  preparation, typed outcomes, and legacy isolation. The maximum-product record is consistently
  2,880 / 4,096.
- N/A: support/CE/mystic-code/turn/refund expansion.
- Deferred: TSK-07 UI/worker/URL cutover; TSK-08 cross-level blueprint caching and full four-policy
  production digest.
- Historical Blocking: 0 at the original TSK-06 review boundary. The TSK-06.4／06.41 reopening status at
  the top of this note supersedes this value for current work.

## TSK-06.41 accepted-review implementation delta (2026-09-05)

The PIR-001/PIR-002 implementation reopens only two producers and their direct consumers. Battle execution now
emits one typed `contributionId` on every contribution projection (`null` for non-contributions), evaluates
world-assumption projections against the final canonical battle state, and remains the owner of effective
contribution decisions. Ranking presentation joins by that exact identity and also requires the individual
projection's final applied outcome, so an effective NP base cannot satisfy an excluded NP special and a matching
trait-count projection cannot activate a nonmatching sibling even while both share the one aggregate NP-special
damage contribution. The application field materializer now distinguishes the inactive
`facts=[]` sentinel from an active fully assigned all-false witness and carries the latter as explicit false field
facts into the same ordered executor.

Changed flow inventory: projection compiler -> final-state projection evaluation -> effective contribution set ->
row/badge/detail; and finite field assignment -> scenario assertions -> condition evaluator -> modifier/NP input ->
final damage/maximum eligibility. Calculator, ranking, selected-scenario without-area replay, and ranking-origin
portable replay continue to use the existing application preparation and ordered execution paths; no alternate
compiler, persisted derived identity, servant branch, or fallback was added.

Counterexample closure: mixed NP base/special baseline and satisfied decisions, self-generated target-state
special, trait-count matching/nonmatching projections, field `present:false`, `not`, `traitCount atMost/equal`,
nested absence, inactive field sentinel, and selected-scenario personal/partyWide/partyOther separation are
focused fixtures. Production direct negative-field occurrence remains an explicit zero ratchet. Final four-policy
production maximum remains `Deferred: TSK-06.5`; cache/notice interaction remains `Deferred: TSK-07`; the changed
paths have no remaining `Blocking` classification pending the implementation verification recorded in the review
run.
