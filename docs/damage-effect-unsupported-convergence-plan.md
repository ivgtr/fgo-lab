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
| HP-dependent modifier | `RatioHPLow`、`RatioHPHigh`、`RatioHPRangeLow/High` | クー・フーリン、パッションリップ | 2 | 既存HP入力から条件と値をexactに決定 |
| BP-dependent modifier | `TriggeredTargetBattlePointRateRange` | 紅閻魔 | 2 | 既存BP入力からbranchを決定 |
| random/action choice | `ActSet/ActSetWeight`、`ActSelectIndex` | Braveエリザ、エルキドゥ、ゴッホ〔マイナー〕、シャルロット、ククルカン、岸波白野、玉兎 | 18 | 同じchoice groupの候補を排他decisionとして扱い、選択候補だけ適用 |
| function position guard | `TriggeredFuncPosition` | テノチティトラン、キングプロテアほか | occurrence再集計 | raw effect occurrence順からguard対象を解決。曖昧ならunsupported |
| class relation responsibility | `overwriteClassRelation` | ネロ、セミラミス、カーマ、ヘファイスティオン、キアラ、C.I.E.L、ハベトロット | 7 | calculatorの最終クラス相性入力が唯一のdamage fact。operationは二重適用しない |
| NP card type mutation | `tdTypeChangeArts`、`tdTypeChangeBuster` | UDKバーゲスト、玉兎 | 3 | ordered stateで宝具cardを変更し、後続のcard条件とdamage inputを再評価 |
| non-damage filtering | damage modifier、宝具card、後続conditionのいずれも変更しないoperation | 全masterから意味論抽出 | family別ratchet | hiddenかつnon-blocking。raw type名だけでは判定しない |

`class relation responsibility`は効果を無視する意味ではない。このcalculatorは敵classを入力せず、適用後の最終クラス相性を直接入力する契約であるため、executorが同じ相性変更を再適用すると二重計上になる。projectionとtraceには「最終入力で解決」と記録する。

### 4.2 入力またはartifact不足のためfail-closedを維持するfamily

| canonical family | raw semantics | 対象例 | 不足 | 扱い |
|---|---|---|---|---|
| referenced trigger skill | `attackBeforeFunction`、`npattackPrevBuff`、`fieldIndividualityChangedFunction` | フラン、アシュヴァッターマン、ビーマ、インドラ、ビショーネ、北斎、エレシュキガルほか | `Value/SkillID`が参照するskill定義が現行artifactにない | 選択・automatic時はtyped unsupported。非damageと証明できた参照だけ非blocking |
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

未知parameterをexecutorで黙認しない。normalizerが全keyを上のいずれかへ分類し、未分類はmaster validationを失敗させる。

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
