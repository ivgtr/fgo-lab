---
title: "E4.1 activation structure cleanup evidence"
status: "Complete"
date: "2026-08-28"
---

# E4.1 activation structure cleanup

## Outcome

E4.1で確定した意味論を変更せず、activation処理の所有場所を単一化した。`ActivationFact`、
`EffectDecision`、immutableな`ActivationContext`の契約、scenario schema 30、engine 24.0.0、
master schema 33、artifact `20260828.2`は不変である。E5には着手していない。

変更前はcondition tree走査がbattle-executionとcalculation-applicationへ分散し、fact setの
canonical order、重複、choice排他、source quantity range規則がschemaとexecutorで別実装だった。
また、invalid activation contextを空contextへ置換した後にcandidate preparationを続行していた。

変更後の責務は次のとおりである。

- `schema/activationFactSet`: canonical fact identity、順序、重複、choice排他、quantity range交差、immutable index
- `battle-execution/activationCondition`: condition tree解析、atom収集、materialization、negation、三値評価
- `battle-execution/activationContext`: scenario factとcompiled requirementの統合、unknown／orphan／missing検証
- `candidatePreparation` / `candidateSelection`: base作成、valid/invalid分岐、selection解決、constraint検証
- `calculation-application/activationContext`: canonical analyzerを使ったfact選択、prune、sortのみ

invalid contextは`ready | invalidActivationContext`の排他的unionで表現する。invalid側ではoperation
activation、constraint validation、card mutation選択、operation実行を行わず、base inputとdecisionを
変更しないまま`invalidActivationContext` issueだけを返す。

追補で実行stateも`ExecutableBattleState | RejectedBattleState`へ分離した。condition、constraint、
projection、operation executorはnon-nullなactivation contextを持つ`ExecutableBattleState`だけを受け取る。
failure assemblyだけが`RejectedBattleState`を生成し、nullable stateを拒否するruntime例外は削除した。
この整理は総コード量の削減ではなく、局所責務と将来変更時の影響範囲を縮小するものである。

## Removed duplication

- application独自の`all`／`any`／`not`再帰walker
- schemaとexecutorで別実装だったchoice group key、quantity owner key、range intersection
- activation atom collectorの複数実装
- invalid scenarioを通常preparationへ流すempty activation context fallback
- issue配列の有無からvalid／invalidを推測する制御
- candidate preparation内に混在していたdecision、selection、constraint、projection、failure assembly

## Structure metrics

| module | before lines / max function | after lines / max function |
|---|---:|---:|
| battle `activationContext.ts` | 311 / 86 | 187 / 30 |
| battle `candidatePreparation.ts` | 299 / 155 | 139 / 34 |
| app `activationContext.ts` | 160 / 44 | 138 / 47 |
| schema `activationFactSet.ts` | - | 134 / 56 |
| battle `activationCondition.ts` | - | 201 / 48 |
| battle `candidateSelection.ts` | - | 154 / 59 |

architecture ratchetは各stageの行数上限、analyzer所有、empty fallback禁止、application walker禁止を固定する。

## Equivalence

- 既存1,504 scenario digest: `e754617b09edeacf9661fb95d7b814bfd178e07c1827d0df16224cd02ce33b77`
- production全420攻撃宝具: 既定damage不変
- ranking全policy digest: 不変
- calculator／ranking parity: 差分0
- implementation unsupported: 0
- activation-local unresolved: 0
- damage golden、NP1〜5、effect outcome、unsupported／inputRequired: 更新なし
- share／save／URL形式: 更新なし

紅閻魔、ブレエリ、シャルロット、ククルカン、玉兎を含むactivation goldenは既存値のまま成功した。

## UI invariants

`66bc848..HEAD`にweb UI、CSS、DOM、snapshot変更はない。既存Playwright Chromium／mobile Chromium／
VRT／a11yは62 passed、30 project-specific skippedで、pixel baseline更新は0件だった。visible text、
accessible state、effect chip、desktop／390px／320px layoutは不変である。

## Performance and bundle

| metric | baseline | final | result |
|---|---:|---:|---|
| calculation benchmark | 354.94 Hz / 2.8174 ms | 355.42 Hz / 2.8135 ms | no regression |
| ranking production (same environment) | 66.96 s | 65.47 s | no regression |
| full Vitest (same host, back-to-back) | 91.07 s | 91.26 s final pass | +0.21% |
| main JS | 532.99 kB / gzip 150.94 kB | 534.33 kB / gzip 151.39 kB | +0.25% / +0.30% |
| ranking worker | 208.49 kB | 209.82 kB | +0.64% |
| CSS | 44.93 kB / gzip 9.29 kB | 44.93 kB / gzip 9.29 kB | unchanged |

全Vitestの初回最終実行ではMLB-only golden 1件が5秒timeoutとなったが、値のdiffではなかった。
同testは単独3.66秒で成功し、全体再実行は72 files／384 testsすべて成功した。旧candidate構造の
`b9098ef`を同じhost／dependencyで直後に実行した壁時計91.07秒に対し、最終構造は91.26秒だった。
旧tree側はarchiveにraw inventoryがない既知setup failureと5秒timeoutが各1件あるため成功件数の比較には
使わず、壁時計の負荷対照だけに用いた。計算benchmarkとranking productionもback-to-back比較し、
有意な実行性能悪化がないことを確認した。

## Quality gates

- format check: success
- ESLint: success
- TypeScript: success
- unit／integration／property／golden: 72 files、384 tests
- master validation: 7 files、68 tests、CLI valid
- evidence validation: 2 files、10 tests
- production build: success
- Playwright Chromium／mobile Chromium／VRT／a11y: 62 passed、30 skipped
- calculation benchmark: 355.42 Hz
- `git diff --check`: success

## Versions

- Scenario schema: 30 (unchanged)
- Engine: 24.0.0 (unchanged)
- Master schema: 33 (unchanged)
- Artifact: `20260828.2` (unchanged)
