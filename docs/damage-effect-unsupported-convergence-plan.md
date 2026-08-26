# Damage effect unsupported収束計画

- Status: active
- Baseline: `9387f66`
- Master: `2026-08-25-atlas-jp-calculator-v18`
- Date: 2026-08-26

## 1. 目的

現行masterと既存UI入力で正確に確定できるdamage effectを、raw Function、buff、parameter、conditionの意味論単位でcanonical IRへ正規化し、順序付きexecutorで実行する。件数を減らすための無視、既定値への置換、推測、`unsupported`から`calculated`への読み替えは行わない。

未解決項目は原因family、対象、必要な根拠または入力、damageへの影響を固定し、master更新で未知familyや件数が増えた場合にproduction ratchetを失敗させる。

## 2. 監査方法と基準値

production 469騎のうち攻撃宝具scenarioを構築できる420騎について、次を実行した。

1. 既定scenarioを計算する。
2. 全user projectionを一つずつ有効化して再計算する。
3. projectionをorigin、Function type、buff type、parameter key、condition、modifierへ逆引きする。
4. raw master全体でskill内effect IDの一意性を別途検査する。

現行executorが観測した基準値は次のとおりである。

| 指標 | 件数 |
|---|---:|
| 既定scenarioがunsupported | 15騎 |
| 選択時だけunsupported | 58騎、90 projection |
| 選択時unsupportedのraw signature | 49 |
| 同一skill内でeffect IDが重複するgroup | 67 |
| 上記group内のraw effect occurrence | 193 |

90は最終的なraw effect件数ではない。現行decision keyが`origin/source instance/skill/effect ID`であり、effect occurrenceを含まないため、同一skill内の同じIDが一つのprojectionへ潰れる。したがって最初にstable occurrence identityへ置換し、その後に正式なservant、effect、family件数を再固定する。ID重複を無視したままunsupportedを減らす実装は行わない。

### 2.1 occurrence identity置換後の正式基準値

master v20、schema 15、engine 12.0.0でoccurrence identityへ置換した結果、既定unsupportedは15騎のまま、選択時unsupportedは58騎・100 effect occurrenceとなった。従来の90 projectionは10 occurrenceを欠落していた。全projectionはuser 1,567、automatic visible 445、hidden 671であり、projection key衝突は0件である。以後のratchetはこのoccurrence単位を母数とする。

master v21、engine 12.1.0でfield mutationと最終クラス相性の責務を分離した。`fieldIndividuality` 11効果と`subFieldIndividuality` 1効果はhiddenなadd/remove operationへ正規化し、automatic sourceだけが順序どおりstateへcommitする。ユーザー効果のeffect-local成立をfield factへ昇格させたり、同じskillの全field候補を一括適用したりしない。`overwriteClassRelation` 7効果は、敵classではなく適用後の最終クラス相性を直接入力するcalculator契約へ集約し、二重適用も操作projectionも生成しない。

この段階で既定unsupportedは12騎、選択時unsupportedは49騎・84 effect occurrenceとなった。projectionはuser 1,551、automatic visible 442、hidden 683である。

master v23、schema 11、engine 12.2.0でraw parameter allowlistを廃止した。normalizerはparameterを`value`、`lifecycle`、`presentation`、`condition`、`contextMutation`、`unresolved`へ分類し、executorは分類済みIRだけを読む。`Value2`を一律に既知とは扱わず、役割が確定していない場合は`unresolved`とする。`overWriteTvalsList`はlosslessなrecipient conditionへ正規化した時点でraw重複を破棄し、同じ条件を二重に判定しない。名前が得られないtraitは文字列`unknown`ではなく`traitId:<id>`としてidentityを保持する。

この段階で既定unsupportedは12騎、選択時unsupportedは48騎・83 effect occurrenceとなった。Gilgameshの`overWriteTvalsList`付き特攻宝具威力効果1件は、既に正規化済みのAND条件を用いてexactに操作可能となった。projectionはuser 1,553、automatic visible 440、hidden 683、literal `unknown` traitは0件である。condition-source、choice、可変値、参照positionは分類できても意味論を実行できるまでは引き続き`unresolved`とする。

master v24、schema 12、engine 12.3.0で`CheckBattlePointPhaseRange`をsubject付きquantity conditionへ正規化した。`7<=`と`<=1`をそれぞれ`atLeast 7`、`atMost 1`として保持し、範囲文字列をexecutorで再解釈しない。自身・passive・NPの条件は現在のattacker BP入力で評価し、支援元など別sourceのBPはattacker BPと同一視せずeffect-localな成立制約として扱う。これによりEreshkigalのBP7防御無視がautomaticに適用され、Beni-enmaのBP空腹時宝具威力効果は操作可能となった。既知BPと矛盾する成立decisionはconstraint conflictでmodifierをcommitしない。

既定unsupportedは12騎のままだが、Ereshkigalの理由から`unsupportedOperation`が除かれ、必要なBP入力不足だけになった。選択時unsupportedは48騎・82 effect occurrence、projectionはuser 1,554、automatic visible 439、hidden 683である。`TriggeredTargetBattlePointRateRange`はaction choiceの状態遷移と不可分なため、この段階では同じ条件へ読み替えない。

master v25、schema 13、engine 12.4.0でHP比例modifierをcanonical value expressionへ正規化した。`inverseHpLinear`は`base + bonusAtZeroHp × (1000 - HP) / 1000`、`hpRangeLinear`は指定HP範囲の両端値を整数演算で線形補間する。Cu ChulainnはHP100%／50%／0%で攻撃力20%／35%／50%、Passionlipはskill level 10でHP50%／0%に攻撃力30%／50%となる。HP範囲外と成立decisionの組合せはconstraint conflictとなり、modifierをcommitしない。

値式はquantity ownerを保持する。自身skillの値式には既存の「自身の残りHP」入力を再利用し、同じ入力欄をHP依存宝具以外にも必要時だけ表示する。support sourceのHP依存効果は攻撃役HPで代用せず、source HP入力がない現行UIでは選択時typed unsupportedを維持する。この段階のown-effect監査では、既存入力を補った選択時unsupportedは46騎・80 effect occurrenceとなった。HP未入力のまま選択した場合は数値行を返さない。

master v26、schema 14、engine 12.5.0で`ActSet`と`ActSelectIndex`をcanonical action choiceへ正規化した。choiceは同じsource instance・skill・familyの候補だけを排他にするeffect-local制約であり、traitやfieldをworld factへ追加しない。同じ候補に属する複数modifierは同時適用でき、異なる候補を同時選択した場合は`choiceConflict`として全候補を非適用にする。`ActSetWeight`は候補の抽選重みでありdamage値ではないため、対応する`ActSet`とともにchoice metadataへ分類する。

BraveエリザベートのBuster候補と攻撃力候補は単独でそれぞれ正確に適用され、同時選択はmodifierを残さずfail-closedになる。action choiceを持つ全production effectのうち、17 effect occurrence・7騎が選択時unsupportedからexact calculationへ移行した。既存quantityを補ったown-effect監査の残存は39騎・63 effect occurrence、projectionはuser 1,554、automatic visible 439、hidden 687である。choice由来の排他候補は12組、全排他候補は20組で、同時選択が`calculated`となる組合せは0件である。

master v27、master schema 15、scenario schema 16、engine 12.6.0で、カード種別がbuff typeに明示された`tdTypeChangeArts`、`tdTypeChangeBuster`、`tdTypeChangeQuick`を`changeCardType` operationへ正規化した。カード種別を持たない親`tdTypeChange`から値を推測しない。`InvalidHide`は表示制御metadataとして分類し、damage semanticsへ流用しない。

カード色modifierは付与時のcardではなく、全operation実行後の最終NP cardでdamage inputへfoldする。これにより、先に付与された色バフも後続のcard mutation後に正しく再評価される。選択された決定的card mutationから計画上の最終cardを導出して初期統合制約へ加え、競合する色modifierとchoiceをoperation実行前にall-or-nothingで止める。candidate stateの検証に失敗した場合も元のNP cardを維持する。productionでは8効果・4騎をexact operationとして投影し、玉兎の連動state semanticsを含む3効果・1騎はtyped unsupportedに維持した。選択時unsupportedは39騎・62 effect occurrence、projectionはuser 1,561、automatic visible 439、hidden 687である。単独選択でも既知cardと矛盾する候補を除いた排他候補は24組で、競合中の正常計算は0件である。

master v29、master schema 16、scenario schema 17、engine 12.7.0で、skill／passiveにある`attackBeforeFunction` 22効果・20騎を`commandCardAttack` scopeへ正規化した。これらは通常攻撃の直前に別Functionを起動する効果であり、単体NP damage inputもその前段stateも変更しないため、NP火力projectionから除外する。宝具Function列に置かれた同buff type 2効果は実行scopeが異なり、NP前参照として従来どおりfail-closedに残す。containerを見ずにbuff typeだけで除外する処理は行わない。

この分離により、操作してもNP damageへ作用しない21 user projectionを削除し、選択時unsupportedは22騎・41 effect occurrenceとなった。projectionはuser 1,540、automatic visible 439、hidden 687である。raw `Value2`の未解決damage候補は25件から、宝具内参照2件とfield-change参照1件の計3件へ縮小した。インドラのOR火力効果は従来どおり操作可能で、同じskillのQuick通常攻撃前追加効果は「自身の適用内容」へ表示しない。

master v30、master schema 17、scenario schema 18、engine 12.8.0で`TriggeredFuncPosition`を、world factではなく同一source operation列の位置を保持するeffect-local trigger制約へ正規化した。位置は整数値のまま保持し、OR候補やtraitへ変換しない。`DisplayLastFuncInvalidType`は表示metadataとして分離する。productionでは23 occurrence・13騎を正規化し、damage候補5件のうち実際に宝具前projectionへ到達するUDKバーゲスト、キングプロテア、テノチティトランの3効果を既存のオン・オフ操作でexactに実行する。呪腕のハサンと徐福の位置付き効果はdamage operation後にあるため、宝具damage inputへ遡及させない。

effect-local trigger decisionは具体的なworld stateを追加せず、同じoperationのmodifierだけを有効化する。位置が複数、非整数、欠落のeffectは正規化せず、選択またはautomatic実行時にfail-closedを維持する。この段階で既定unsupportedは12騎、選択時unsupportedは20騎・39 effect occurrence、projectionはuser 1,541、automatic visible 438、hidden 687である。

## 3. 既定scenarioの完全インベントリ

| 原因family | 対象 | damage影響 | 現行入力で解決 | 根拠データ |
|---|---|---|---|---|
| 必須attacker HP未入力 | アン・ボニー＆メアリー・リード（Archer/Rider）、アシュヴァッターマン、土方歳三の4騎 | 宝具倍率 | 可能。既存HP入力を使う | NP Functionとparameterあり |
| 必須Battle Point未入力 | エレシュキガル | 宝具倍率と宝具前防御無視 | 可能。既存BP入力を使う | BP Functionとrangeあり |
| trait count宝具前trigger | ジャック・ド・モレー | 宝具前modifierの可能性 | 現状不可 | 参照skill本体がartifactにない |
| field count加算 | アショカ王 | 宝具威力 | effect-local decisionで数値が一意なら可能 | `TriggeredFieldCountRange/Target`あり |
| 表示用付帯parameter | マシュ・キリエライト | 防御無視 | 可能 | `AuraEffectId`は表示資源ID、modifier本体あり |
| class relation override | 殺生院キアラ、C.I.E.L、ハベトロット | クラス相性 | 既存の最終クラス相性入力へ責務を集約 | buff typeあり。対象class入力は持たない |
| 参照対象・生存判定による加算 | ジョン・ラックランド、ハベトロット | 宝具威力 | 現状不可 | parameterはあるが対象編成・生存factがない |
| traitごとの可変加算 | キングプロテア・オルタ | 宝具威力 | 現状不可 | count対象の完全な正規化が未実装 |
| partial trait condition | BBドバイ | 恒常攻撃力 | 不可 | `checkIndvType=4`をlosslessに解釈する情報不足 |
| occurrence identity衝突 | キングプロテア、ジョン・ラックランドほか | 別modifierの上書き・誤操作 | 可能。IR識別子の修正 | raw配列順とpathあり |

既定のHP/BP不足は誤計算ではなく、値が入力されるまで数値行を返さない正しいfail-closedである。既存入力へ値を与えたproduction regressionでは`calculated`になることを固定する。

## 4. 選択時unsupportedのsignatureインベントリ

以下は49 signatureを意味論familyへ集約した完全な一覧である。括弧内は現行projection数で、identity修正後にoccurrence数へ更新する。

### 4.1 正確に解消するfamily

| canonical family | raw semantics | 現行対象 | projection数 | 実行意味 |
|---|---|---|---:|---|
| field mutation | `fieldIndividuality` | ガウェイン、ガレス、ジャガーマン、Λ、張角、テノチティトラン、ひびき＆千鍵 | 11 | field stateへtraitを追加しhiddenでcommit |
| field removal | `subFieldIndividuality` | テスカトリポカ | 1 | field stateからtraitを解除しhiddenでcommit |
| state unlink/removal | `subIndividuality` | 黄飛虎 | 1 | state trait解除。後続damage条件が読む場合だけ実行 |
| presentation metadata | `AuraEffectId`、`HideMiss`、`HideNoEffect`、`ShowState`、`DisplayNoEffectCauses` | マシュ、玉兎ほか | occurrence再集計 | 数値・条件・順序へ作用しないtyped metadata |
| trait source semantics | `IncludeIgnoreIndividuality`、`IgnoreIndivUnreleaseable`、`IncludePassiveIndividuality`、`FuncCheckTargetIndividualityTargetType` | メドゥーサ、ゴルゴーン、ビショーネ、セミラミス、アルジュナ〔オルタ〕、テスカトリポカ、玉兎 | 9 | initial/state/combinedのどのtrait集合を読むかIRへ保持 |
| linked trait grant | `AddIndividualty/List/LinkageTarget` | 宮本武蔵2種、ネモ／ノア、マシュ | 4 | modifierとstate付与を別operationへcompileし同じsource順で実行 |
| HP-dependent modifier | `RatioHPLow`、`RatioHPHigh`、`RatioHPRangeLow/High` | クー・フーリン、パッションリップ | 2 | 自身効果は既存HP入力からexact。支援元HP依存は別ownerとして入力不足を維持 |
| BP-dependent modifier | `TriggeredTargetBattlePointRateRange` | 紅閻魔 | 2 | 既存BP入力からbranchを決定 |
| random/action choice | `ActSet/ActSetWeight`、`ActSelectIndex` | Braveエリザ、エルキドゥ、ゴッホ〔マイナー〕、シャルロット、ククルカン、岸波白野、玉兎 | 17 | 対応完了。同じchoice groupの候補を排他decisionとして扱い、選択候補だけ適用 |
| function position guard | `TriggeredFuncPosition` | UDKバーゲスト、キングプロテア、テノチティトランほか | 23 | 対応完了。整数positionをeffect-local trigger制約として保持し、選択effectだけを実行。damage後のoperationは遡及させない |
| class relation responsibility | `overwriteClassRelation` | ネロ、セミラミス、カーマ、ヘファイスティオン、キアラ、C.I.E.L、ハベトロット | 7 | calculatorの最終クラス相性入力が唯一のdamage fact。operationは二重適用しない |
| NP card type mutation | `tdTypeChangeArts`、`tdTypeChangeBuster`、`tdTypeChangeQuick` | エミヤ、UDKバーゲスト、スペース・イシュタル、BBドバイ、玉兎 | 11 | 8効果は対応完了。ordered stateで宝具cardを変更し、最終cardで色modifierとdamage inputを再評価。連動state未解決の玉兎3効果はfail-closed |
| non-damage filtering | damage modifier、宝具card、後続conditionのいずれも変更しないoperation | 全masterから意味論抽出 | family別ratchet | hiddenかつnon-blocking。raw type名だけでは判定しない |

`class relation responsibility`は効果を無視する意味ではない。このcalculatorは敵classを入力せず、適用後の最終クラス相性を直接入力する契約であるため、executorが同じ相性変更を再適用すると二重計上になる。projectionとtraceには「最終入力で解決」と記録する。

### 4.2 入力またはartifact不足のためfail-closedを維持するfamily

| canonical family | raw semantics | 対象例 | 不足 | 扱い |
|---|---|---|---|---|
| referenced trigger skill | NP内`attackBeforeFunction`、`npattackPrevBuff`、`fieldIndividualityChangedFunction` | ジャック・ド・モレー、ビショーネ、北斎、エレシュキガルほか | `Value/SkillID`が参照するskill定義が現行artifactにない | 選択・automatic時はtyped unsupported。skill/passive内の通常攻撃trigger 22効果は`commandCardAttack`としてNP計算から分離済み |
| target/state stack scaling | `ParamAddOpIndividuality`、`ParamAddMaxCount/Value` | ビショーネ、カーマ | 対象状態のstack数入力 | typed missing quantity |
| self stack scaling | `ParamAddSelfIndividuality` | キングプロテア、ハベトロット | 自身stack数入力または先行operation | derived stateで一意な場合だけ計算、それ以外unsupported |
| turn scaling | `ParamAdd/ParamMax` | 茶々、魔王信長 | 経過turn | typed missing quantity |
| critical-star threshold | `StarHigher` | ハベトロット | star数 | NP damage要件外。選択時unsupportedを維持 |
| party target/survival scaling | `ParamAdd*TargetType`、`ParamAddOpCheckDead` | ジョン・ラックランド、ハベトロット | 編成対象と生存状態 | typed missing world input |
| per-trait function scaling | `TypeIndividualityEachFunc` | キングプロテア・オルタ | trait-count対象と倍率対応 | canonical IRの根拠確定までunsupported |
| partial condition | `partialTrait` | BBドバイ | losslessな条件意味論 | typed unsupported |

このフェーズでは新しい敵trait editor、field editor、star、turn、編成生存入力を追加しない。不足familyは値を0倍・1倍へ置換せず、選択時またはautomatic時に数値行を返さない。

## 5. Canonical IR

### 5.1 identity

`MasterEffect`はmaster正規化時に`occurrenceId`を持つ。値はraw pathから導出したskill内の安定したoccurrenceであり、Function IDとは別物である。`OperationSource`、decision key、projection key、evidence raw pathはoccurrenceを含む。旧keyとのfallback、ID別分岐、同一keyのprojection上書きは残さない。

### 5.2 operation semantics

raw parameterの未知key allowlistではなく、次のtyped IRへ正規化する。

- `modifier`: modifier種別、base value、value expression、trait source、card
- `stateMutation`: scope、trait、add/remove、timing
- `choice`: group、candidate、selection rule
- `guard`: condition expression、quantity expression、operation position
- `metadata`: 表示だけに作用し、damage semanticsを変えない値
- `reference`: 参照先skillと、artifact解決状態
- `nonDamage`: damage inputも後続damage conditionも変更しないと証明されたoperation

未知parameterをexecutorで黙認しない。normalizerは全keyを役割別に分類し、未実装の意味論は`unresolved`へ明示する。production ratchetはdamage候補に現れる`unresolved` keyの集合と件数を固定し、新規keyまたは件数増加を検出する。executorはraw keyの許可リストを持たない。

## 6. 実行順序

1. stable occurrence sourceを収集する。
2. master condition、parameter guard、choice decisionをconstraint IRへcompileする。
3. 選択済みeffect decisionとworld/quantity factsを統合検証する。
4. 各operationをraw occurrence順にcandidate stateへ適用する。
5. state mutationとmodifier value expressionを同じ時点のstateで評価する。
6. 検証成功時だけcommitする。
7. non-damage operationはtraceへ残すがdamage precisionを落とさない。
8. unresolved reference、missing quantity、unsupported conditionが選択済み・automatic・damage本体に関与すればfail-closedにする。

## 7. 実装優先度

1. occurrence identity衝突を解消し、監査母数を正す。
2. 非damageとpresentation metadataを型で分離し、不要な阻害を除く。
3. field/state mutationとtrait sourceを正規化する。
4. 既存HP/BP入力で解けるquantity familyを実装する。
5. action choiceを排他decisionへ正規化する。
6. derived stateだけで解けるstack/value expressionを実装する。
7. artifact・入力不足familyをtyped reason別に固定する。

## 8. Production ratchet

ratchetはservant IDの期待一覧ではなく、canonical familyとraw signatureから候補を抽出する。

- occurrence IDの重複0件
- projection keyの衝突0件
- unknown Function、buff、parameter、condition familyの増加0件
- 既定unsupportedをreason family・servant・effect occurrence別にsnapshot
- 選択時unsupportedを同じ軸でsnapshot
- nonDamageまたはmetadataが計算をunsupportedにする件数0
- user projectionはon/offでdecision、outcome、input、damageのいずれかが変化
- choice groupの複数候補同時適用で`calculated` 0件
- missing inputを0または既定値として計算する件数0
- unsupported operationが`applied`になる件数0
- Dante、水着武則天、アーキタイプ：アース、水着リリス、quantity範囲、競合all-or-nothing、initial/state/combined三値論理を継続

## 9. UIと共有

画面構造、入力欄、操作順は変えない。火力modifierと選択可能なchoice結果だけを現在の「自身の適用内容」へ投影する。field/state mutation、metadata、nonDamage operationはhiddenとし、traceには残す。既存HP/BP入力を再利用する。scenarioはoccurrence decision keyだけを保存し、master conditionやparameter式を複製しない。

共有・保存データは新keyへ一方向に更新する。衝突する旧keyを恣意的に一つのoccurrenceへ割り当てる互換処理は作らず、意味を一意に復元できない入力はschemaまたはapplication境界でtyped unsupportedにする。

## 10. 完了条件

- 現行masterと既存UI入力でexactに解けるfamilyがすべてcalculatedまたは正しいnon-blockingへ移行している。
- 残存unsupportedはservant、effect occurrence、raw signature、typed reason、必要な入力・artifactを固定している。
- occurrence、normalization、executor、application、share、production regressionを各familyで持つ。
- 数値が変わる代表例はoperation、fact、value expression、最終damage inputをtraceで説明できる。
- UI入出力、URL共有、保存・復元、PC/390px/320pxを維持する。
- 全品質ゲートとproduction ratchetが成功する。
