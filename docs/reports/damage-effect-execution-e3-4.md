---
title: "Damage effect execution E3.4 unsupported semantics convergence"
status: "Complete"
created_at: "2026-08-26"
schema_version: 21
engine_version: "12.11.0"
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

## UI and validation

画面構造、入力項目、操作順、共有・保存形式の意味は変更していない。中間field/state、command-card限定効果は通常表示せず、既存の火力ボタンとHP/BP入力だけを使用する。

最終品質ゲート結果は、このreportの完了commit前に実行し、format、lint、typecheck、unit/integration/property/golden、master/evidence validation、production build、Playwright、benchmark、`git diff --check`をすべて成功させる。

E4には着手していない。
