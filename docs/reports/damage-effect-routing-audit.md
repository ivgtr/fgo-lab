# ダメージ効果 routing・条件式 監査

更新日: 2026-08-25  
状態: 調査完了・修正計画確認待ち

## 1. 結論

Q5確認時に修正した通常カード変更・状態耐性・防御効果の過剰表示と同じ根に、追加の実装漏れがある。現行の`isDamageRelevantEffect(effect)`は効果単体だけを分類し、付与元、効果対象、計算対象、条件式の論理構造を受け取らない。このためUIの過剰表示だけでなく、実際のダメージ値を誤る経路が残っている。

Q6へ進む前に、効果を`buff type`の名称リストだけで判定する構造を廃止し、source actor、recipient actor、enemy target、condition expressionを含む一つのrouting契約へ置換する必要がある。旧classifierと新classifierを併存させない。

## 2. 調査範囲

- 現行master `2026-08-25-atlas-jp-calculator-v13`の13,314効果
- servant skill、passive、宝具前後効果、概念礼装、魔術礼装
- `isDamageRelevantEffect()`、`resolveEffectSources()`、support効果選択UI、単発計算、ranking候補解決
- Atlas Academy nice APIの代表的なraw function / buff

確認方法:

- 全buff typeについて件数、label、target、origin、現行分類をinventory化
- 現行facadeで代表scenarioを再計算し、resolved inputとeffect stateを確認
- 条件式についてnormalized masterとAtlas rawの`buff.script.checkIndvType`を比較
- attacker skillを含む／除くscenarioのunsupported差分を全攻撃宝具持ちで比較

## 3. P0: 計算値を誤る実装漏れ

### P0-1: 効果対象の向きを解決していない

`effectBuffKind()`は`buffTypes`だけでmodifier種別を決め、`effect.target`と付与元actorを見ない。

再現済み:

- 概念礼装「騎士の矜持」の`self`防御力ダウン20%が、攻撃バフ+20%として加算される。
- 概念礼装「愛、此処にはなく」の味方側防御力ダウン10%が、攻撃バフ+10%として加算される。
- 清姫「恋の追跡者 A」の`enemy`攻撃力アップ20%を選ぶと、自身の攻撃バフ+20%になる。
- 支援役アルトリアの`self`限定Buster性能50%・宝具威力30%を選ぶと、攻撃役アルトリア〔オルタ〕へそのまま加算される。

全masterで確認した影響面:

- 支援UIに出る`self`火力候補: 764効果、505 skill、362 servant。支援役自身だけの効果を攻撃役へ適用できる。
- 攻撃役UIの明白な逆向き候補: 36効果、33 skill、31 servant。`ptOther`限定buff、敵への攻撃力buff、自身／味方の防御低下を含む。
- 装備者へ適用してはいけない概念礼装効果: 29効果、28礼装。`ptOtherFull`限定buffと味方側防御低下を含む。

これは表示だけでなく、`calculated`結果へ誤modifierを入れるため最優先で修正する。

### P0-2: カード耐性ダウンが常に不成立になる

normalized effectはBuster / Arts / Quick耐性ダウンについて、`cardTypes`と同時に`targetCondition.anyOf = cardBuster / cardArts / cardQuick`を持つ。resolverは先に`cardTypes`を正しく照合した後、同じcard traitを敵特性として再照合する。そのため対象カードが一致していても`target_trait_mismatch`となる。

再現済み:

- 天草四郎のBuster宝具で「熾天の杯 EX」のBuster耐性ダウン20%を有効化しても、`cardBuff = 0`のまま不成立になる。

影響面:

- 94効果中、skill 22効果と宝具ダメージ前25効果の計47効果が現在ダメージへ到達し得る。
- 宝具ダメージ後47効果は現在の一撃へ適用しないため、引き続き除外する。

card predicateをtarget traitから分離し、一度だけ評価する必要がある。

### P0-3: AND / OR条件をlossyに平坦化している

data pipelineは各buffの`ckOpIndv`をすべて`targetCondition.anyOf`へ平坦化し、Atlas rawの`buff.script.checkIndvType`を保存しない。rawでは条件ごとにAND / ORが異なる。

再現済み:

- 清少納言「威力アップ・対中立サーヴァント」はAtlas rawで`checkIndvType: 1`を持つ。
- 現行masterは`[alignmentNeutral, servant]`を`anyOf`として保存する。
- 対象traitを`servant`だけにすると、「対中立サーヴァント」と「対シャドウサーヴァント」が両方成立し、power modが合計+100%になる。

複数positive predicateを持つpower modは22効果ある。すべてがANDではないため、一律`allOf`への置換も不可。rawのoperatorと条件groupをlosslessに保存する必要がある。

## 4. P0: 正しい条件でも計算不能になる漏れ

### P0-4: 無効な効果より先にlevel値欠損を判定する

`resolveEffectSources()`は`enabled`、card条件、trait条件より前に`rawValue === undefined`を判定する。自身skillはscenarioへ3枠とも入る一方、各effectのdefaultは無効である。このため利用者が有効化していないboolean型効果でも、level値がないだけで計算全体が`unsupported`になる。

全候補比較では、skillなしscenarioが計算可能なのにdefault scenarioが`attacker_effect_level_missing`となるservantが18騎あった。例はパッションリップ、エミヤ、浅上藤乃、スペース・イシュタル。

適用可否を確定してから、適用対象だけに値・metadata解決を要求する順序へ変更する。

## 5. P1: fail-closedだが未実装の主要効果

- 防御無視は35効果ある。kernelに`ignoreDefense`があるが、skill / passive / 宝具前effectの`pierceDefence`から接続されず、値を持たない効果は`level_value_missing`になる。
- ダメージカット貫通1効果、宝具タイプ変更15効果、class relation変更8効果、field / trait追加削除系は理由付き`unsupported`であり、誤った数値は表示しないが対応範囲が不足している。
- `attackBeforeFunction`系28効果は現在すべて非火力として無視される。代表のビショーネ宝具前効果はNP獲得だけで現ダメージに影響しないことをraw APIで確認したが、参照先functionを全件解決していないため、damage modifierを内包する効果がないとはまだ証明できない。

P0修正後、nested function inventoryを作り、現ダメージに影響する参照先だけをhandlerまたはfail-closed registryへ入れる。

## 6. 収束する修正計画

### R0: 回帰fixtureを先に固定

- 騎士の矜持の防御低下が攻撃buffへ入らない。
- enemy攻撃力アップ、attackerの`ptOther` buffが自身へ入らない。
- supportの`self` buffが攻撃役へ入らない。
- CEの`ptOtherFull` buffが装備者へ入らない。
- 同cardの耐性ダウンが適用され、異cardは不成立になる。
- AND条件とOR条件をAtlas raw fixtureで別々に固定する。
- disabled effectの値欠損はunsupportedにしない。

### R1: lossless condition schema

- `TraitCondition { anyOf, noneOf }`を、operatorとpredicate groupを保持するcondition expressionへ破壊的に置換する。
- card、target trait、attacker trait、recipient trait、field、stateを別predicate kindとして正規化する。
- master schema / artifact版を更新し、旧条件形式の互換読込は残さない。

### R2: actor-aware effect routing

- `EffectSource`へsource actorとintended recipient / enemy targetを明示する。
- attacker、support、CE、mystic code、passive、NPごとのtarget適格性を一つのrouterで判定する。
- `effectBuffKind()`とcontext-freeな`isDamageRelevantEffect()`を削除し、UIとresolverが同じrouting結果を使う。
- support selectorは攻撃役へ到達可能な効果だけ、attacker UIは自身または敵へ到達可能な効果だけを表示する。

### R3: resolver判定順と既知handler

- disabled / source-target不適格 / card不一致 / condition不成立を先にrejectする。
- 適用対象だけにlevel値、metadata、handlerの完全性を要求する。
- `pierceDefence`を既存`ignoreDefense`へ接続する。
- 残る未対応効果は理由付きfail-closedとし、無関係効果は表示しない。

### R4: 全master gate

- origin × target × buff kindの許可matrixに違反するapplied effectを0件にする。
- raw condition operator欠損を0件にする。
- nested function inventoryの未分類を0件にする。
- 単発計算とrankingで同じrouter / resolverを使用する。
- 修正後のunsupported全件と理由をbaseline化し、件数だけを期待値にしない。

## 7. 確認ゲート

- 代表4ケースの誤modifierがすべて再現しなくなる。
- カード耐性ダウン47効果がtimingとcard条件に従って解決される。
- AND / OR代表fixtureがAtlas raw semanticsと一致する。
- 無効なeffectが計算をunsupportedにしない。
- attacker / support / CE UIに到達不能な効果が表示されない。
- UI、単発計算、rankingが同じactor-aware routing結果を使う。
- unit、golden、evidence、master validation、E2Eを通過する。

## 8. 優先順位

1. P0-1 target routing（誤った数値を返す）
2. P0-2 card predicate（有効な補正を欠落する）
3. P0-3 condition expression（特攻を過剰適用する）
4. P0-4 resolver順序（未選択条件で計算不能になる）
5. P1 handler / nested function coverage（fail-closed範囲を減らす）

Q6のranking facade統合はR0〜R4後に行う。先にrankingへ現行resolverを固定すると、誤ったtarget / condition semanticsを共通化してしまうためである。
