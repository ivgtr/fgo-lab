---
title: "Portable calculation requestとranking presentation"
status: proposed
date: "2026-09-01"
approval: "required"
proposed_supersedes: "ADR-016"
---

# ADR 027: Portable calculation requestとranking presentation

## Status and approval

本ADRはTSK-06.1の設計proposalであり、承認前はruntime実装の根拠にしない。承認時はADR-016のhandoffだけでなく、計算責務、状態所有、presentation、worker境界、typed failureを含む有効な判断を本ADRが全て引き継ぎ、ADR-016を全体としてsupersedeする。

## Context

ADR-016はranking rowの`CalculationScenario`をcalculatorへ渡せば再現できるとした。その後、実行入力はscenarioに加えて`DamageContributionProjection`と`initialNpGauge`を必要とするようになった。一方、fingerprint、draft、history、share、backupはscenarioだけをportable identityとしており、非baseline NPとcontribution policyを復元できない。完全入力をtestから直接注入するexecution parityは、このhandoff／persistence parityを証明しない。

同時に、worker summary、worker detail cache、React detail recordがevidenceを重複保持している。cacheはkeyだけでなくvalue、lifetime、owner、maximum cardinalityを一つのcontractで決める必要がある。

## Decision

### Portable calculation identity

`CALC-PORTABLE-001`の`PortableCalculationRequest`を、damage、precision、operation outcomeを一意に決める唯一のportable inputとする。resolved requestはscenario、開始NP、`standard | excludeVoluntarySkillModifiers`のtyped contribution intentを持つ。manual requestはmanual scenarioと`manual` intentだけを持つ。

requestへ`DamageContributionProjection`、`Set`、raw／compiled operation ID、compiled operation、resolved／derived execution stateを保存しない。`calculation-application`だけがtyped intentとcurrent masterからprojectionをcompileし、同じapplication／execution entrypointをcalculatorとrankingが共有する。compile不能な値をstandardへfallbackしない。

normal calculatorは`10000 + standard`を省略不能な値として明示生成する。ranking handoffは採用scenario、採用済み開始NP、自己バフありなら`standard`、なしなら`excludeVoluntarySkillModifiers`を渡す。conditional effectの成立world、canonical input、ordered commandはscenarioが保持する。

### Calculator edit transition

ranking由来intentは、calculatorでscenarioを編集しても暗黙に変更しない。開始NPとcontribution intentを結果近傍へ非編集値として常時表示する。利用者が「通常の計算条件へ戻す」を明示実行した場合だけ、現在scenarioから`10000 + standard`の新requestへ遷移し、ranking intentをhidden stateへ残さない。

保持した開始NPがNP level capacityを超えた場合は`invalid: initialNpGaugeExceedsCapacity`としてdamageを返さず、通常条件へ戻すactionを提示する。開始NP editor、contribution editor、汎用resource frameworkは追加しない。

### Calculation responsibility and failure

`calculation-application`はranking conditionsから候補scenarioを構築し、canonical default、finite preparation、candidate selection、typed contribution compile、damage execution、row summary／detail evidence materializationを所有する。ranking policyはcandidateとcontribution intentを選ぶがdamage semanticsを再実装しない。workerはraw Atlas値、表示label、servant IDからscenarioやintentを再構築しない。

schema不正、参照欠落、version／master不一致、capacity超過、scenario／intent矛盾は`invalid`とする。requestとmasterは整合するがcurrent engineが既知のsemanticsを実行できない場合だけ`unsupported`とする。`inputRequired`、`unsupported`、constraint conflictは順位へ混在させずtyped exclusionとし、0倍、1倍、0 damageへfallbackしない。

### Portable paths and migration

fingerprintはrequest全体、master data version、engine versionを含む。draft、history finalize／copy、share URL／JSON、backup export／importは同じrequestを直接保持し、scenarioとのparallel fieldを持たない。

schema 32から次版へのstartup／backup migrationはisolatedな一方向変換とする。profile identity／timestamps、servant builds、targets、craft essence copies、support templates、active profile IDをstrictに検証して維持し、旧draft／historyだけを破棄する。変換したcurrent schema全体を検証してからcurrent形式だけを保存する。parse／migration失敗時にuser storeをclearしない。

exact schema 32の`UserDataBackup`だけは同じmigratorで変換できる。旧schemaのshare、任意の古いschema、unknown／future schemaは拒否する。current share requestに対応するmasterがなければ再計算を`invalid`とし、保存済みresultを「共有時の履歴値」としてだけ表示できる。v32 readerはmigration boundaryだけに閉じ、current domain／repositoryへdual readerや同期modelを残さない。

### State and presentation ownership

- URL query: rankingのcanonical五条件、表示filter、sort metric。単一parse／serialize modelが所有する。
- React local state: 開いている一行、filter panel、picker、現在detail最大1件。
- worker hook/runtime: request ID、canonical fingerprint、直近成功summary最大1件、stale rejection。
- profile: builds、CE、supportとportable requestを含むdraft／history。

filter、sort、display metricだけの変更はworker計算を発行しない。Webはapplication応答をpureなpresentation modelへ変換し、閉じた`ol > li > article`には比較に必要なsummaryだけを描画する。開いた一行だけにfinal input、effect stack、condition／proc／typed issue、calculator handoffを描画し、detail DOMも一行分だけ生成する。effect presentationはcalculatorとrankingで共有する。workerはReact state、画像URL、翻訳labelを知らない。

### Summary and detail cache

`RK-CACHE-001`に従い、applicationのUI summaryから`RankingPolicyDetail`と`profileResults`を分離する。workerはcontext identityとcanonical五条件fingerprintをkeyに、rowsとtyped exclusionsだけの直近成功summaryを最大1件cacheする。worker detail evidence cacheは持たず、選択entryのrequestごとにevidenceをmaterializeする。

Reactはactive detailとin-flight detailを各最大1件だけ保持し、close、condition変更、context変更で破棄する。detail responseはrequest IDとfingerprintの両方がcurrent requestに一致する場合だけ表示へ適用する。TSK-08のprepared damage matrix／NP1〜5 cross-level cacheは本ADRで実装しない。

## Alternatives

- `CalculationScenario`へoptional開始NPだけを追加する: projection、persistence、identityの分裂を残すため不採用。
- operation IDや`Set`をportable化する: master／compilerのderived stateを永続契約へ漏らすため不採用。
- calculator編集時に暗黙resetする: damageが説明なく変わるため不採用。
- inherited intentを非表示で維持する: 見えないranking policyで編集させるため不採用。
- 全行detailまたはworker detail cache: evidenceのcardinalityを候補数まで増やすため不採用。
- 汎用battle resource framework／新package: 現要件と既存application境界を超えるため不採用。

## Consequences

- schema／engine version、fingerprint、workspace、draft、history、share、backupは破壊的に一括更新する。
- 安全なprofile dataはmigrationし、再現不能な旧calculation snapshotだけを破棄する。
- execution parity、handoff parity、persisted restore parity、portable share parityを別々に検証する。
- ADR-016は本ADRの承認までacceptedのまま残る。承認時に本ADRをaccepted、ADR-016をsupersededへ同一変更で更新する。
