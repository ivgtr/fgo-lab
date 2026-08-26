---
title: "ADR-011 Canonical effect execution semantics"
status: "Accepted"
date: "2026-08-26"
---

# Context

MasterEffectはraw Atlas Functionを正規化しているが、runtime executorが`parameterSets.Value`、buff type、target文字列を再解釈していた。`Value`はdamage modifierだけでなくfield trait ID、recipient trait ID、NP等の非damage値にも使われるため、汎用value seriesでは意味を保存できない。

production masterには13,314 effect occurrenceがあり、うち10,432件が`Value`を持つ。現行実行意味に基づく排他的な用途はmodifier 3,733件、modifier-rate 1件、context trait ID 73件、その他の非damage値 6,625件である。

# Decision

1. data-pipelineをAtlas固有語彙を解釈する唯一のmodule境界とする。
2. MasterEffectは順序付きのtyped execution operationを持つ。effectがcontext mutationとmodifierを併せ持つ場合もoperationを分離する。
3. modifier operationだけがlevel／OC／limit break別modifier valueとoptional value expressionを持つ。
4. context mutationはcanonical trait名とscope policyを持ち、raw trait IDやmodifier valueを保持しない。
5. targetはcanonical policyへ正規化する。executorはpolicyとsource originからattacker／target／not-applicableを解決し、raw target文字列を解釈しない。
6. damage modifier、modifier rate change、ignore defense、ignore damage cut、card mutation、context mutation、non-damage、unresolvedを型で判別する。
7. raw parameter、buff、target、Functionは監査evidenceへ隔離する。canonical operationへのfallbackに使用しない。
8. unsupported、projection、operation trace、damage input、damage値は移行前後で完全一致させる。意味変更が必要と判明した場合は移行を停止する。
9. master schema、artifact、engine versionを更新し、旧artifactの互換読込経路は設けない。scenario、共有、保存形式は変更しない。

# Canonical target policy

target policyはAtlas名ではなく、次の適用意図を表す。

- source self: attacker自身のsourceならattacker、support／mystic sourceなら計算対象外
- party member: source originによらず計算対象attackerへ適用
- party other: support sourceなら計算対象attacker、それ以外は計算対象外
- enemy: 計算対象targetへ適用
- attacker NP card: attacker／passive／CE／NP sourceによるNP card mutationだけを対象
- unresolved: 正確なrecipientを決定できず、damage関連ならtyped unsupported

recipientの期待方向はmodifier semanticsに含める。たとえば防御低下はenemy policyからtargetへ到達する場合だけattack modifierとなり、防御上昇をattacker向けattack modifierへ誤変換しない。

# Consequences

- executorからraw routing tableと`parameter()`を削除できる。
- raw `Value`を一律にmodifierとして扱えないことをschemaで表現できる。
- 新しいraw buff／target／parameter familyはnormalization時またはproduction ratchetで検出され、runtimeでsilent fallbackしない。
- MasterEffect schemaは破壊的変更となるが、scenarioとfrontendの入出力契約は維持される。

# Verification

production 13,314 effect occurrenceを同数のtyped operationへ変換した。`Value`保有10,432 effectはmodifier 3,733、modifier rate 1、context trait ID 73、その他non-damage 6,625へ用途分類し、modifier用途以外の値をmodifier seriesへ入れていない。canonical traitへ解決できないrecipient trait参照25件は、無条件の`nonDamage`へ潰さず`unresolved`かつ`damageRelevant: false`として監査可能に保持する。

移行前後の既定420 scenarioとuser projection選択1,534ケースを、version/evidence metadataを除いて比較した。scenario input、final damage input、projection、operation trace、damage rowは1,954件すべて一致した。master schema 21、artifact v36、engine 12.13.0へ更新し、旧schema artifactは拒否する。

# Limit break and multi-operation invariants

- 限界突破skillを持たない礼装は、通常operationの値を全限界突破段階で使う明示的な同値ケースとする。
- 限界突破skillを持つ礼装は、通常／限界突破effectをstable occurrence identityで対応付け、condition、target policy、operation semanticsを比較する。sharedとして対応したeffectの欠落、semantic不一致、重複による曖昧性はartifact生成エラーとし、通常値へfallbackしない。
- MLB側だけに存在し、stable occurrenceとして一意に正規化できるeffectは`availability: maximumLimitBreakOnly`を持つ独立effectとして正常に保持する。sharedにもMLB-onlyにも一意に分類できない余剰はartifact生成エラーとする。
- valued operationの限界突破値は、対応するcanonical operationのsemantic identityで照合して取り込む。配列indexだけでは対応付けない。
- 礼装のvalued operationは、限界突破skillの有無にかかわらず`limitBreakValues`と`limitBreakValueExpressions`を必須とする。限界突破skillがない場合もnormalizerが通常系列を明示的に複製し、executorはLB4で通常系列へfallbackしない。これにより「仕様上同値」と「正規化漏れ」を区別する。
- `maximumLimitBreakOnly`は礼装effectだけに許可する。servant、NP、passive、support source、mystic codeへ配置されたartifactはsnapshot validationで拒否し、runtime originによる黙示的な解釈へ委ねない。
- 一つのeffectが複数のdamage／card／ignore／context operationを持つ場合、executorはcanonical配列順にすべてcompileする。未解決operationまたは値欠落が一つでもあればeffect全体をcompileせずfail-closedとする。
- compile後も同一effect occurrenceのoperation列を一つのtransactionとして実行する。candidate stateとcandidate damage input上で全operationを評価し、実行時quantity不足、constraint conflict、unsafe mutationなどが一件でもあれば、当該effectのstate、modifier、evidence、damage inputを一件もcommitしない。別effectの確定済み結果はrollbackしない。
- 移行前後比較は一度限りの作業メモにせず、production 420既定scenarioと1,534 user projection選択を再計算するdigest ratchetとしてrepositoryに保持する。

production監査により、MLB skill保有898礼装のうち8礼装はMLB側だけにeffectを追加することが判明した。この場合はshared effectの値fallbackとは別概念として扱う。effect-levelのcanonical availabilityで`allLimitBreakStates | maximumLimitBreakOnly`を表現し、shared occurrenceを厳密照合しつつ、MLB-only occurrenceを通常時に存在するeffectへ偽装しない。5件のdamage effect復元はv36で欠落していた正しいMLB効果を復元する承認済みの意図的差分とする。

実装後はmaster schema 22、artifact v37、engine 12.14.0となった。13,314既存effectは`allLimitBreakStates`、8件は`maximumLimitBreakOnly`として独立保持する。LB0〜3では後者をsource収集せず、LB4だけで自動実行する。shared effectの通常／MLB値照合は値以外のeffect／operation semanticsと順序が一致した場合だけ成功し、通常側欠落、semantic変更、順序変更、重複曖昧性をartifact生成時に拒否する。

executorは一effect内の全canonical operationを配列順にcompileする。値欠落またはdamage-relevant unresolvedが一件でもあればoperationを一件も返さず、部分compileしない。既存1,954ケースのdigestは`825dcf95b265e585cce9343ed6d4b7a180f531794ca3f0e173516220c5d0bc3a`のまま維持し、承認済み5礼装は別goldenでLB0／LB4の全damage input digestとNP1〜5を固定した。

レビューで、LB4時に`limitBreakValues`が欠落すると通常値へ戻るruntime fallback、`maximumLimitBreakOnly`を礼装以外にも配置できるschema、複数operation effectの後半が実行時に失敗した際の部分commitを確認した。E3.7では上記三契約を破壊的に閉鎖した。MLB skill保有礼装898件、MLB evidenceを持つshared effect 2,077件、shared valued operation 745件（通常系列と値が異なるもの735件）、およびshared MLB値全体のdigestをproduction ratchetへ固定した。全CE valued operation 1,307件はLB4系列を明示保持する。master schema 23、artifact v38、engine 12.15.0へ更新し、scenario、共有、保存、UI契約は変更していない。
