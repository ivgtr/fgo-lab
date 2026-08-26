---
title: "Damage effect execution E3.4 unsupported semantics convergence"
status: "Complete"
created_at: "2026-08-26"
schema_version: 21
engine_version: "12.12.0"
master_data_version: "2026-08-25-atlas-jp-calculator-v34"
---

# E3.4 unsupported semantics convergence

## Outcome

Production 469騎、攻撃宝具scenario 420件を現行masterとexecutorから再監査し、既存UI入力で正確に決定できるunsupported familyをcanonical IRへ実装した。監査開始時の既定unsupported 15騎、選択時unsupported 58騎100 occurrenceは、既定12騎、選択時14騎25 occurrenceへ収束した。未解決条件の無視、既定値、推測値、servant固有分岐は使用していない。

## Resolved families

- effect occurrence identity: 重複Function IDで失われていた10 occurrenceを回復し、decision／operation／projection／evidence keyを一意化した。
- field add/removeと最終class relation責務: damageに必要なmutationだけをhidden operationとして実行し、最終相性の二重適用を除いた。
- raw parameter role: value、condition、choice、lifecycle、presentation、context mutation、buff identity、unresolvedへ分類し、unknown allowlistを廃止した。
- BP phase、HP依存値、action choice、source-owned BP rate: 既存HP/BP入力またはeffect-local constraintから一意になる値だけを実行した。
- NP card、command-card、function-position scope: 最終NP cardでmodifierを再評価し、NPに関係しない通常攻撃効果を投影せず、damage後operationを遡及させない。
- buff identity: actor traitと分離し、Nemo／NoahのArts 20%とMashのNP前Buster 20%をexactに実行した。
- NP form state: 玉兎の3 card mutationと3連動火力をcard/stateのatomic置換として実行した。

## Exactness changes

- 紅閻魔は通常候補で攻撃力20%、特殊候補で攻撃力20%と宝具威力20%。異なる候補の同時選択は全modifier非適用である。
- Cu ChulainnはHP100%／50%／0%で攻撃力20%／35%／50%、Passionlipはskill level 10でHP50%／0%に30%／50%となる。
- UDKバーゲスト、キングプロテア、テノチティトランの位置付きNP前火力は順序どおり適用される。
- 玉兎はArts形態でNP威力20%、Buster形態を選び攻撃力／NP威力を選択するとBuster、攻撃力30%、NP威力50%となる。形態なしのBuster連動火力、またはArts/Buster形態同時選択はunsupportedとなりmodifierを残さない。
- ビショーネの宝具内未解決NP前参照は、通常攻撃scopeとして黙って除外せず、既定scenarioをunsupportedに変更した。これは誤った`calculated`を止める正確性修正である。

## Hidden mutation activation review closure

engine 12.12.0では、攻撃役スキルのhidden context mutationを一律automaticにせず、選択された火力effectとのactivation linkをcanonical operationへ追加した。linkは同一source skillの使用、または全condition branchが要求するtrait prerequisiteから導出する。operation enable型の選択とcondition satisfaction型の選択を区別し、conditional effectをオフへ戻したときに旧decisionがmutationを起動し続けない。

production masterの攻撃役スキル由来mutationは24 occurrenceである。未選択時は24件すべて`notApplied`、現在のNP火力decisionから到達可能なものは15件である。残る9件は現在のNPダメージへ寄与する選択がないか、選択候補を一意に確定できないため実行しない。ガレスは陽射し条件の攻撃力30%を選択すると陽射し付与を先にcommitし、ダンテは対天／対地に対応する天国／地獄だけをcommitする。テスカトリポカは同一skillの火力effect選択時だけ陽射しを解除する。recipient traitはfieldと同じactivation経路を通り、専用分岐を持たない。

エレシュキガルの冥界の護りによる`blessedByKur`付与は、現行artifactでは現在のNPダメージ後に実行される効果だけが参照する。現在のNP damage inputへ遡及させず、hiddenかつ`notApplied`をproduction regressionとして固定した。

## Remaining unsupported

選択時の25 occurrenceは、trait provenance／解除可能性5、linked state removal 1、turn比例2、state stack比例5、critical-star閾値10、参照skill／Function不足2である。対象14騎と各件数はproduction ratchetに固定した。既定12騎のうちHP不足4騎とBP不足1騎は既存入力で解消し、残る7騎はartifact、field count、編成・生存、trait count、partial条件の不足によりfail-closedを維持する。

新しいturn、star、編成、敵trait入力は追加していない。これらがR1入力へ加わるか、参照artifactとcondition仕様が確定するまで数値行を返さない。

## Production ratchet

- projections: user 1,534、automatic visible 443、hidden 687
- multi-branch OR: 18騎21効果
- selected unsupported: 14騎25 occurrence
- UI-derived exclusive pairs: 29（effect/effect 28、world-fact/world-fact 1）
- canonical fact-condition conflicts: 250組、68効果、52騎
- conflict中のcalculated、conflict operationのapplied、矛盾stateの最終input残存: 0
- inert user projection、未成立automatic火力、literal unknown trait: 0
- attacker-skill context mutation: 24 occurrence、未選択commit 0、火力decisionから到達可能15、現在のNP damageへ非寄与または候補未確定9

## UI and validation

画面構造、入力項目、操作順、共有・保存形式の意味は変更していない。中間field/state、command-card限定効果は通常表示せず、既存の火力ボタンとHP/BP入力だけを使用する。

最終品質ゲートはすべて成功した。

- format check、ESLint、TypeScript: pass
- unit／integration／property／golden: 30 files、177 tests pass
- production master validation: 3 files、17 tests pass
- evidence validation: 2 files、10 tests pass
- production build: 171 modules、pass
- Playwright Chromium／mobile Chromium: 43 pass、21 project-specific skip、0 failure
- PC、390px、320pxでDante、OR条件、HP効果、支援、共有、NP card choiceを実操作。ガレスは条件付き攻撃力選択時のhidden陽射しcommit、解除時のnon-commit、ボタン状態、ダメージ値、traceを両projectで確認
- benchmark NP1-5／200 random values: 310.93 ops/s、mean 3.2162 ms
- `git diff --check`: pass

## Commits

- `568ba73` docs(calc): inventory unsupported operation semantics
- `71669e9` refactor(calc)!: identify effect occurrences independently
- `ada4033` refactor(calc): normalize field mutation semantics
- `2441aa1` refactor(calc)!: classify effect parameter semantics
- `bc7ac39` feat(calc): execute subject-scoped Battle Point guards
- `e7dca9a` feat(calc): evaluate HP-dependent modifier expressions
- `89ef945` feat(calc): enforce action candidate choices
- `2924b0f` feat(calc): execute NP card type mutations
- `c51b1e1` refactor(calc): separate command-card trigger scope
- `3952c8b` feat(calc): execute function-position guards
- `0f1fbf8` refactor(calc): separate buff identity and card scope
- `cb2d749` feat(calc): validate source-owned quantity guards
- `ca8950e` feat(calc): execute NP form state transitions
- `a52fe35` test(calc): migrate fixtures to current execution contract
- `277bb07` test(web): ratchet current master UI baselines
- `be78f9c` test(web): verify Jade Rabbit form decisions
- `8a70077` docs(calc): define hidden mutation activation semantics
- `bd25ad1` refactor(calc)!: link hidden mutations to effect decisions
- `d5680ea` test(calc): ratchet hidden mutation reachability
- `abaf219` fix(calc): preserve linked effect decision controls
- `1a001d3` test(web): update engine baseline and E2E readiness waits

E4には着手していない。
