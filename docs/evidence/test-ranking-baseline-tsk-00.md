---
title: "TSK-00 test and ranking baseline"
document_version: "1.1.0"
status: "In Progress"
created_at: "2026-08-30"
updated_at: "2026-08-30"
baseline_commit: "a49591996cd0951cc82109c252d96e2fd3991fd9"
implementation_task: "docs/tasks/development-redesign-tasks.md TSK-00"
---

# TSK-00 test and ranking baseline

## 1. Baseline identity and scope

TSK-00開始時のHEADは`a49591996cd0951cc82109c252d96e2fd3991fd9`、working treeはcleanだった。本reportはtest／CI／production auditの現状を固定するだけで、data pipeline、canonical IR、application、battle execution、ranking policy、Webのproduct semanticsを変更しない。

利用者から見える不変条件はcalculatorとrankingのdamage、precision、適用効果、warning、unsupported理由、entry、UI状態に意図しない差分がないことである。float32、丸め、clamp、NP1〜5、fail-closed、ordered／transactional execution、calculator／ranking共通facade、production全件監査を省略しない。

Published masterは`20260829.8`、schemaは37、`master.json`は33,850,263 bytes、SHA-256は`c88fb68d2735f54151de3b965c1d80861cd922159119f47072f9e62ed1a4d9f1`である。

## 2. Test file and suite inventory

`vitest.config.ts`は`packages/**/*.test.ts`と`apps/**/*.test.{ts,tsx}`を一つのsuiteとして実行する。現時点ではunit／production用の重複しないinclude契約はないため、ここではpublished `master.json`を直接参照するfileをproduction consumer、それ以外をunit／fixture consumerとして観測分類する。この分類をTSK-02のcanonical suite契約として流用しない。

| Observed group | Files | Tests | Source lines | Source bytes | Sorted file-list SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| unit／fixture consumer | 57 | 304 | 10,704 | 349,461 | `ab41b9743b90a6050fc9cac8f372a2edc4d320e5d855d7819f26be847570fbe0` |
| production master consumer | 20 | 93 | 6,608 | 248,858 | `9e41dfb41717969164eecf360a4b2cea683ea3b5b8a9bad9f6f31b29f8e4205f` |
| Vitest total | 77 | 397 | 17,312 | 598,319 | `71ffa6f7835799adbcdb306eb3484c2796c61b2e453414840547e59f54453e3b` |
| Playwright source | 4 | 96 across 2 projects | 2,249 | 108,187 | file list is the four paths below |

Vitestのsorted full test-name digestは`756e5e31d206bc4632df25da0fd2728fbd198a94603dca4bd858f0f633259251`である。production consumerは次の20 filesである。

```text
apps/web/src/adapters/share.test.ts
packages/calculation-application/src/canonicalActorCount.test.ts
packages/calculation-application/src/canonicalInputs.test.ts
packages/calculation-application/src/executionBaselineInventory.test.ts
packages/calculation-application/src/externalDifferential.test.ts
packages/calculation-application/src/hpConditionGolden.test.ts
packages/calculation-application/src/mlbOnlyEffectsGolden.test.ts
packages/calculation-application/src/procEffectsGolden.test.ts
packages/calculation-application/src/productionExecutionParity.test.ts
packages/calculation-application/src/productionMasterAudit.test.ts
packages/calculation-application/src/productionMasterInventory.test.ts
packages/calculation-application/src/rankingActivationConditions.test.ts
packages/calculation-application/src/rankingConditionInventory.test.ts
packages/calculation-application/src/rankingConditionSemantics.test.ts
packages/calculation-application/src/rankingProduction.test.ts
packages/calculation-application/src/specialInputInventory.test.ts
packages/calculation-application/src/targetContextProduction.test.ts
packages/calculation-application/src/unsupportedConvergenceGolden.test.ts
packages/data-pipeline/src/executionSemanticsProduction.test.ts
packages/data-pipeline/src/masterGolden.test.ts
```

E2Eは`e2e/a11y.spec.ts`、`calculator-baseline.spec.ts`、`ranking-baseline.spec.ts`、`smoke.spec.ts`の4 filesである。Chromiumとmobile Chromiumを合わせた96 casesは32 project-specific skippedと64 executable casesになる。versioned PNG 11 filesのpath＋content digestは`537f27408450edaa6d0bc96e134e16751f7c7f0c00e8f788525fd56f99cbcee6`である。

## 3. Master loads and CI duplication

Published masterを直接読むtestは20 filesに分散し、source上の参照は42箇所ある。うち`executionSemanticsProduction.test.ts`が12箇所、`rankingProduction.test.ts`が7箇所、`unsupportedConvergenceGolden.test.ts`が3箇所、`executionBaselineInventory.test.ts`、`externalDifferential.test.ts`、`mlbOnlyEffectsGolden.test.ts`が各2箇所、残り14 filesが各1箇所である。file内Promise cacheがあってもprocess／test-file境界を越える共有compileではない。

CIとPagesの両方で`pnpm test`の直後に`pnpm validate:evidence`を実行する。後者の`evidenceInventory.test.ts`と`evidence.test.ts`は前者の77 filesに含まれるため、各workflowで2 filesを重複実行している。CIはさらにPlaywright 2 projectsを実行し、失敗時を含め`playwright-report/`を14日保存する。PagesはE2Eを実行しない。TSK-02で意味集合を一つにするまで、この差を現行baselineとする。

## 4. Production semantic family inventory

Published master全件を一回走査したcanonical artifact inventoryは次である。JSON化したこの表のSHA-256は`5da30c87c74e36e1e9ca0ae7f4686df88259c8c3d6aa99cc2ec05650609d55d4`である。

| Family | Inventory |
| --- | --- |
| entities | servants 469、craft essences 2,700、mystic codes 28、effects 13,875 |
| attack damage | standard 375、defensePiercing 67、trait 143、traitCount 22、stateTrait 13、hpRatioLow 6、battlePointPhase 2、targetRarity 1、traitExpression 1 |
| execution | contextMutation 1,488、damageModifier 3,885、ignoreDamageCut 1、ignoreDefense 39、modifierRateChange 1、nonDamage 9,124、selectNoblePhantasmVariant 22、transformActorForm 10、unresolved 53 |
| proc | guaranteed 13,826、independentRolls 41、singleRoll 3、chainedRolls 5 |
| proc selection | effectInclusion 13,870、successCount 5 |
| interaction | none 13,850、inputThresholdSeries 15、quantityThresholdSeries 5、procSeries 5 |
| normalized quantity condition | attackerHpPermille 10、battlePointPhase 11 |
| raw condition operator | all 39、any 55,462 |

Application projectionのcondition unionは`all | any | card | choice | inputQuantity | noblePhantasmVariant | operationTrigger | quantity | targetPredicate | trait`で、unresolved damage parameter／script familyは0件である。rankingが選択可能なcondition projectionは87件で、provenanceはintrinsic 54、derived／external field 27、external scenario fact 20、target 5、proc／quantity 6である。複数provenanceを持てるため合計は87と一致しない。activation-localは19件、field occurrenceは27件／24 servantsである。

現行`RankingConditions`は`comparisonMode`、`npLevel`、`classAffinity`、`selfBuffs`、`specialAttack`、`field`の6項目である。`AttackProfile` identityはservant lineage、terminal actor-form profile、NP variantで、表示属性としてtarget scope、card、terminal form labelを持つ。default production rankingは422 attacking servantsから435 actor-form nodes／profilesを評価し、433 unique entries（single 180、all 253、cardはArts 144／Buster 182／Quick 107）を返す。

resourceは現行`RankingConditions`または`AttackProfile`の独立stateではない。ranking standard policyはovercharge 1、proc success、chained proc maximum、quantity canonical minimumを固定し、NP gain／lossなどdamageに未接続のeffectは`nonDamage`として扱う。したがって、resource capacity、gain／loss、固定／全消費、NP useを候補計画へ入れることはTSK-05の意味論変更であり、TSK-00では数値fallbackやservant分岐を追加しない。

## 5. Damage, entry, policy, and audit digests

| Canonical assertion | Baseline |
| --- | --- |
| calculator default execution parity | 422 records、SHA-256 `72a6fefe6faaab95ad2d9d9562b06f42ea88e635d26415aa9108485c517e54e9` |
| ranking default | 433 rows、failure 0、SHA-256 `e603a5720446122604882448fa0b0394e9c644ccaf79334a7e8e06b3608c78cf` |
| ranking damage cache | requests 3,744、distinct inputs 1,644、hits 2,100 |
| contribution policy evidence | excluded visible 22 effects／20 entries、うちexecution applied 14 effects／13 entries |
| preparation inventory | 422 servants、generated 6,508、deduplicated 4,009、terminal 3,559、exact duplicates 2,499、rejected actions 0、maximum actions 4、maximum semantic states 56 |
| calculator effect controls | user 1,592、automatic visible 0、hidden 1,217、inert user／selected unsupported／target-context omission 0 |
| special canonical inputs | 13 controls、duplicate／unreachable／inoperable 0 |
| execution family snapshot | `executionBaselineInventory.test.ts.snap` SHA-256 `cc83e1730bac784c1a6a6ba1a8a9d54bada10ade09cb45a226af7866429722b9` |

Rankingのclass affinity二値×special attack二値×NP1〜5の20 digestは`rankingProduction.test.ts`の`policyDigests`を正本とする。seriesは次のとおりである。

```text
neutral:inactive  e603a572… 711b6fc6… fa890b04… aee4daa4… f2442278…
neutral:active    00e85977… 7c312b9b… 17a854fa… 68b38df9… 544489fd…
favorable:inactive 8b7e3184… 79f871f8… 42ab73db… 92ab0ce5… 6dc590e2…
favorable:active  744a518b… 792277ad… b46acf45… caba6b9c… 8dc58b3b…
```

field activeのNP1〜5 digestは`c7aa7d74…`、`0c82e52f…`、`8381b6bf…`、`d279d1d0…`、`b964bad5…`、state-trait matrix digestは`6b1fe2e60e812f4b009c3909cfc1f0adb5f8c25e6f29c5a5998a928909a157b2`である。省略表記は表示上だけで、比較時はcanonical test内の64桁値を使用する。

これらのauditは、全reachable default calculator scenarioがcalculatedであること、ranking rowとcalculatorが同じscenario／input／result／effectを返すこと、全AttackProfile entryが一意で欠落しないこと、unsupported／conflicting stateが数値へfallbackしないこと、candidateがfiniteかつterminalであることを保証する。

## 6. Runtime and output baseline

Node 26.3.1、pnpm 11.20.0、Vitest 4.1.11の同一worktreeで`pnpm test`を3回連続実行した。CIの対象Node 24とは異なるため、CI時間へ外挿しない。

| Run | Vitest duration | Wall clock | Import | Cumulative tests | Output |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 80.79s | 81.81s | 29.43s | 283.34s | 13 lines／273 bytes including `/usr/bin/time` |
| 2 | 81.04s | 82.01s | 31.26s | 289.41s | 13 lines／273 bytes including `/usr/bin/time` |
| 3 | 82.91s | 83.92s | 32.26s | 295.15s | 13 lines／273 bytes including `/usr/bin/time` |

wall-clock中央値は82.01秒で、3回とも77 files／397 tests passed、test warning 0である。`/usr/bin/time`の3行を除く成功出力は10 lines／242 bytesである。

ローカル既定並列のPlaywright 2 projectsは60 passed／32 skipped／4 failed、374.81秒、299 lines／22,842 bytesだった。4件はいずれもChromium session close／home readiness timeoutとして観測された。同じ4 pathsをChromium 1 worker、retryなしで再実行すると4 passed、80.81秒、21 lines／1,058 bytesだった。この結果だけからfailureを既存問題またはflakyと断定しない。CIは`CI`時に1 worker／2 retriesを使うため、ローカル並列結果をCI baselineともみなさない。snapshot更新は0件である。

## 7. Reproduction and measurement contract

Inventoryは次で再取得する。

```sh
git status --short && git rev-parse HEAD
pnpm exec vitest list --json=/tmp/tsk-00-vitest-list.json
pnpm exec playwright test --list --project=chromium --project=mobile-chromium
rg -l 'public/master/master\.json' packages apps -g '*.test.ts' -g '*.test.tsx'
sha256sum apps/web/public/master/master.json apps/web/public/master/manifest.json
```

実行時間とログ量はstdout／stderrを同じfileへcaptureし、`/usr/bin/time -p`の`real`をwall-clock、runner summaryをsuite内訳、`wc -l -c`を行数／bytes、`sha256sum`をraw log identityとする。成功と失敗を別artifactにし、truncate前の完全logを測る。構造変更前後は同一commandを最低3回実行しwall-clock中央値を比較する。

model callはsession transcriptのmodel response event数を数え、input／cached input／output tokenを別列にする。pollingは同一process IDへの`write_stdin`／wait call数と隣接timestamp差、tool outputはtool resultのtext UTF-8 bytesとimage bytesを数える。compaction前後を別sessionとして保持し、完全一致callはcommand＋cwd＋normalized argumentsのdigestで数える。repository test logとsession telemetryを混ぜず、session path／session ID／集計期間／Codex versionを必ず記録する。空pollは30秒以上、通常tool outputは4,000 tokens以下を測定gateとする。

## 8. Artifact manifest and conclusion

Canonical artifactは本report、`packages/calculation-application/src/productionExecutionParity.test.ts`、`productionMasterAudit.test.ts`、`productionMasterInventory.test.ts`、`rankingConditionInventory.test.ts`、`rankingProduction.test.ts`、`executionBaselineInventory.test.ts`とそのsnapshot、`apps/web/public/master/manifest.json`、`e2e/*-baseline.spec.ts-snapshots/`である。raw `/tmp/tsk00-*` logは測定中間物であり、正本ではない。

TSK-00ではproduction code、test expectation、snapshot、masterを変更していない。開始commit以後の差分はTask状態、本report、evidence index、handoffだけである。要件承認後のTSK-01はこのinventory、digest、成功10行、failure artifact到達性、82.01秒のVitest中央値を変更前baselineとして開始する。
