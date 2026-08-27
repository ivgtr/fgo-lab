---
title: "ランキングのcanonical scenarioと一覧presentation"
status: "Accepted"
date: "2026-08-27"
---

# ADR 016: ランキングのcanonical scenarioと一覧presentation

## Context

E3.12.1までに、単発計算はsource activation、effect inclusion、condition、proc、ordered executionを一つのcanonical scenarioから解決する構造へ収束した。一方、旧ランキングは`App`が全候補をmain threadで`DamageResolutionInput`へflattenし、workerはkernel実行と平均値sortだけを行っていた。この境界では、ランキングが使用したscenario、適用operation、条件、proc、typed failureをworker応答から説明できず、単発計算への引き継ぎもmodifier合計の再利用になり得る。

ランキングの主目的は、同じ育成規則と戦闘条件による順位を素早く比較し、必要な一行だけ根拠を確認することである。閉じた一覧へ全effectや条件を常時描画すると比較性を損なうため、計算結果と表示詳細の生成時期も分ける必要がある。

## Decision

### 計算責務

`calculation-application`が次を所有する。

- `RankingConditions`のE4初期契約は比較モード、育成規則、NP/OC/Fou、自己効果、支援、礼装、相性、
  共通battle context、並び基準を含んだ。E4.1ではADR-018により5項目の比較policyへ破壊的に置換した。
- 候補ごとの`CalculationScenario`構築
- visible terminal effectのcanonical default適用。effect inclusionだけを設定し、trait/field/choiceを有利に暗黙成立させない
- `calculateScenario`による解決と、row summary・canonical evidence summaryの生成
- 所持戦力では`npLevel > 0`の保存buildだけを候補とし、欠落値へ標準値をfallbackしない

workerはmaster snapshot、保存build、保存支援、canonical ranking conditionsを受け取り、上記application APIだけを呼ぶ。`DamageResolutionInput`、raw Atlas値、表示labelからscenarioを再構築しない。

### 状態所有

- URL query: 比較モード、計算条件、表示filter、sort metric。parse/serializeは一つのranking URL modelだけが所有する
- React local state: 開いている一行、filter panel、picker表示
- worker hook: request ID、loading、直近の成功結果、canonical condition fingerprintによるcache
- profile: 所持build、登録礼装、保存支援セット

filterはworker requestへ含めない。計算済みrowへpureに適用し、filter変更だけでは再計算しない。

### 自己効果の既定

標準比較の「自己バフあり」は、attacker/passive/NP由来のvisible terminal firepower effectを計算候補へ含める。単純procはcanonical成功scenario、chained procはcanonical default selectionを使用する。ただし次を暗黙に行わない。

- world factの追加
- effect-local conditionの`assumeSatisfied`
- single-choiceの候補選択
- canonical quantityの最大値化

したがってHP、trait、field、count等は共通scenarioの明示値またはcanonical defaultだけで評価される。「自己バフなし」は同じterminal effectを除外し、NP本体や非表示のdamage operationを除外しない。

### 表示責務

Webはapplication応答を`rankingPresentation`でpureなview modelへ変換する。

- 閉じた`ol > li > article`: 順位、顔、名称、主damage、card/範囲/class/rarity、effect/support件数
- 開いた一行だけ: NP1〜5の選択行、final input summary、effect stack、condition/proc/typed issue、計算機引き継ぎ
- detail DOMは開いた行だけ生成する
- effect stack groupingは計算機とランキングで同じWeb presentation moduleを使う

workerはReact、画像URLの組み立て、翻訳label、開閉状態を知らない。

### 単発計算への引き継ぎ

ランキングrowは使用した`CalculationScenario`を保持する。「同じ条件で計算機を開く」はこのscenarioをそのままworkspaceへ渡し、calculatorが`calculateScenario`を再実行する。modifier合計やranking rowをmanual inputへ変換しない。

### failure

`inputRequired`、`unsupported`、constraint conflictは順位へ混在させず、順位外inventoryとしてtyped statusと理由を保持する。0倍・1倍・0 damageへfallbackしない。

## Alternatives

- workerへflatten済みinputを渡す: kernel値だけは一致するがscenario/effect/proc parityを証明できないため不採用
- ranking専用の自己バフresolver: 単発計算と意味論が分岐するため不採用
- 全行の詳細を先にDOM化: 420件の一覧性と応答性を損なうため不採用
- 新package: 既存のapplicationとWeb feature境界で責務を表現できるため追加しない

## Consequences

- worker messageは大きくなるが、masterはworker生成後の初回同期で保持し、条件requestは小さくする。
- 旧ランキングと新標準条件は順位が変わり得る。同一scenario parityと、標準条件差分を別々に監査する。
- E4初回は通常の共通敵条件を正本とし、「各サーヴァントの最大特攻」モードは実装しない。
