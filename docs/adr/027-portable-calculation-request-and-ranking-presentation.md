---
title: "Portable calculation requestとranking presentation"
status: superseded
date: "2026-09-01"
approved_at: "2026-09-01"
supersedes: "ADR-016"
superseded_by: "ADR-028"
---

# ADR 027: Portable calculation requestとranking presentation

> [ADR-028](028-canonical-source-program-and-finite-ranking-domain.md)が本ADRを全体として置き換えた。
> 本文はhistorical recordとしてのみ保持する。

## Context

ADR-016はrankingが採用した`CalculationScenario`をcalculatorへ渡せば同じ計算を再現できるとした。その後、damageを決める入力へ`DamageContributionProjection`と開始NPが追加されたが、workspace、fingerprint、draft、history、share、backupはscenarioだけをportable identityとしていた。この分裂により、rankingからの即時handoffでは再現できても、保存・復元経路ではprojectionや開始NPを失い、異なる計算を同じidentityとして扱える。

また、ranking summaryとdetail evidenceが同じapplication resultへ集約され、worker summary、worker detail、React detailの複数箇所へevidenceを蓄積できた。計算identityとpresentation/cache ownershipを一つの承認判断へ収束させる必要がある。

本ADRはADR-016のhandoffだけでなく、引き続き有効なapplication／worker／presentation／failure判断も再掲して更新し、ADR-016全体を置き換える。

## Decision

### 版付きportable calculation identity

`PortableCalculationRequest`をdamage、precision、operation outcome、および復元後に許可するcommandを一意に決める唯一のportable identityとする。requestは次を一つの型として保持する。

- `masterDataVersion`と`engineVersion`からなるversion context
- resolvedまたはmanualの`CalculationScenario`
- resolved requestでは`origin: calculator | ranking`、開始NP、typed contribution intent
- manual requestではmanual intentだけ

calculator constructorはcurrent version、`origin: calculator`、開始NP100%、`standard`を明示生成する。ranking applicationのpure constructorは採用candidate、current version、採用開始NP、`standard | excludeVoluntarySkillModifiers`から`origin: ranking`のrequestを生成する。conditional world、ordered command、choice、canonical inputはscenarioが保持する。

`DamageContributionProjection`、`Set`、compiled operation ID、resolved execution state、derived resource stateは保存しない。`calculation-application`だけがrequestのtyped intentと一致するmasterからprojectionをcompileする。Web、workspace、repositoryはoperationを分類しない。

fingerprint、application実行入口、draft、history、share、backupはrequest全体を使用し、scenarioやversionを並行fieldとしてidentityへ足さない。requestと実行runtime、requestとresultのmaster／engine versionは完全一致を必須とする。同じpayloadでもmasterまたはengineが異なれば別identityである。

`origin`はapplication／workspace／presentationが保持する由来情報であり、battle executionの数値処理、operation選択、damage分岐の条件に使用しない。battle executionはapplicationがcompileしたcanonical semanticsだけを消費する。

### 編集、回復、version遷移

ranking由来intentはscenario編集後も維持し、開始NPとcontributionをread-onlyで結果近傍へ表示する。開始NP editor、contribution editor、汎用resource frameworkは追加しない。「通常の計算条件へ戻す」を明示実行した場合だけ、同じscenario／versionから`calculator + 100% + standard`の新requestを生成する。capacity超過は暗黙resetせず`invalid`とする。

requestとresultは整合するが一致するmaster／engineを利用できない状態は`historicalOnly: versionUnavailable`とする。これはapplication／workspaceのrecovery stateであり、engineの`CalculationResult`、damage値、operation outcomeへ混ぜない。履歴値は再計算済みのcurrent resultとして扱わず、編集を許可しない。

draft restoreとhistory copyは保存identityを維持する。shareはrequest／result version一致を検証し、runtimeがなければhistorical-only表示を許すが、不一致なら履歴値も拒否する。「現在のバージョンで再計算」だけがscenarioとexecution intentを保持してversion contextをcurrentへ置換した新identityを生成する。成功しても旧recordを上書きせず、失敗時は旧履歴値を維持する。version upgradeと通常条件resetは別commandとし、暗黙に合成しない。

schema不正、参照欠落、version不一致、capacity超過、intentとscenarioの矛盾は`invalid`、current engineが既知のsemanticsを実行・compileできない状態は`unsupported`とし、数値へfallbackしない。

### Persistence migration

schema 32の`ProfileCollection`と`UserDataBackup`だけをisolatedな一方向migratorで次版へ変換する。profile identity、timestamps、servant builds、targets、craft essence copies、support templates、active profileをstrictに検証して維持し、安全なrequestを復元できない旧draft／historyだけを破棄する。変換後のcurrent schema全体を検証してから新形式だけを保存し、dual readerや旧domain objectをruntimeへ残さない。

旧schema share、schema 32以外の任意の旧版、future版はfail-closedに拒否する。migration／parse失敗時はuser storeをclearせず、元recordを維持してtyped failureを返す。

### Ranking application、worker、presentation

`calculation-application`はcanonical ranking conditionsからcandidate scenarioを構築し、共通のcalculation entrypointでrow summaryとtyped exclusionを生成する。ranking専用damage semanticsを持たない。selected candidateからportable requestを生成するpure constructorはapplicationが所有し、実Webのcalculator handoff wiringはWebが所有する。

workerはmaster snapshot、保存build／support、canonical conditionsを受け取り、application APIだけを呼ぶ。raw Atlas値、表示label、flatten済みmodifierからscenarioやintentを再構築しない。filter、sort、display metricは計算済みrowへpureに適用し、それらの変更だけでは再計算しない。

Webはapplication応答をpureなcanonical presentation modelへ変換し、描画とcommand dispatchだけを行う。閉じたrowは比較に必要なsummary、開いた一行だけがeffect、condition、proc、typed issue、handoff evidenceを表示する。calculatorとrankingのeffect presentationは共通moduleを使う。keyboard、accessible name、expanded state、focus order、desktop／390px／320pxのoverflow契約を維持する。

### Evidence-free cacheとstale response

applicationのUI summaryはrows、typed exclusions、summary inventoryだけを返し、`RankingPolicyDetail`やaudit用`profileResults`を含めない。worker summary cacheはcontext identityとcanonical condition fingerprintをkeyとする直近成功1件だけを保持する。workerはdetail evidenceをcacheせず、要求されたentryだけをmaterializeする。

Reactはactive detailとin-flight identityをそれぞれ最大1件だけ保持し、close、condition変更、context変更で破棄する。detail responseはrequest IDとfingerprintの両方がcurrent identityへ一致する場合だけ表示する。TSK-08が所有するprepared damage matrixとNP1〜5 cross-level cacheはこの判断へ含めない。

## Alternatives

- scenarioだけをportable identityとして残し、開始NPやprojectionを別fieldで同期する: 不一致状態と復元漏れを表現できるため不採用。
- projection、`Set`、operation IDを保存する: masterとapplication compilerの責務をportable dataへ漏らし、version間で意味が不安定になるため不採用。
- ranking intentを編集時に暗黙resetする、またはhidden stateのまま保持する: damage変化または不可視policyになるため不採用。
- historical requestをcurrent runtimeで暗黙再計算する: 保存値と新結果のidentityを混同するため不採用。
- evidenceをcomplete ranking resultとしてcacheする: value、lifetime、owner、cardinalityが無制限になるため不採用。
- 汎用battle resource frameworkまたは新packageを追加する: 現在のproduct要件と既存application境界で表現できるため不採用。

## Consequences

- TSK-06.1は版付きrequest、schema、application compiler、workspace、draft／history／share／backup、migration、version recovery、selected candidate pure constructorを実装する。
- TSK-07は実Webのranking handoff、ranking-origin presentation、worker／React cache、stale response rejectionを実装する。
- schemaとfingerprintは破壊的に切り替え、schema 32以外のcompatibility readerやparallel identityを残さない。
- calculator／ranking parityはexecution parity、immediate handoff parity、persisted restore parity、portable share parityを分けて検証する。
- damage semantics、TSK-08のfull production digest／cross-level optimization、開始NP editor、battle simulatorへスコープを広げない。

本判断は[ADR-016](016-ranking-canonical-scenario-and-presentation.md)を全体として置き換える。
