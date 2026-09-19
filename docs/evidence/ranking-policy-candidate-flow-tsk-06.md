---
title: "TSK-06 ranking policy and finite candidate flow closure"
status: "Active"
updated_at: "2026-09-20"
---

# TSK-06 ranking policy and finite candidate flow closure

最新の進捗は[canonical checkpoint](#canonical-checkpoint2026-09-13フォローアップ)の2026-09-20最終追記。TSK-06.45はU0〜U5、80条件34,640 outcomes、stable owned、回復、性能、最終qualityを完了しdone。Blocking 0、Task内Deferred 0。依存先TSK-06.46はready。以下の過去deltaは当時の根拠であり、旧Blocking／Deferred／in_progress記述は最新checkpointを優先する。

## c167e63再開delta（2026-09-09）

開始HEADは`c167e6399451196da2c8faee8ad2c95d0e71d3ee`、Git clean。AGENTS、現行要件、
既存Task、systematic-review-guidelinesと本noteを照合した。利用者成果は全攻撃NPの共通実行。
semantic ownerは既存bounded preparation／ordinary executionのresource queryとtransaction。
今回も新しい計画正本を作らず、以下は既存U0〜U5/C1〜C12の調査deltaとする。

### 実装前自己レビューで確定した不足

1. **初期basisと必要入力**。`scenario.resolveScenarioPreparationOutcome`は`initialHp.maximum`を
   解決するが、`resolveAttackerFormExecution`へ渡さない。`preparationState.createPreparationState`に
   HP実量がなく、NP/OCだけがtransaction stateにある。構造探索の`preNoblePhantasmPlanner`は
   HP未束縛contextを使う。未束縛の探索と、実scenarioのmissingを別型にしなければ、HP guardが
   legal programを消すか、実入力不足を許容する。初期0は死亡、正HPの表示0は生存という確定要件を維持する。
2. **読取時点のproducer不足**。`effectNormalization.normalizeQuantityConditions`と
   `normalizeBuffHpConditions`は同じ`quantityConditions`配列へ合流し、JSON同値でdedupされ、
   一つの`requirement.expression`になる。parameter由来のHP値式区間とbuff script条件の由来・読取時点はこのIRにない。
   RatioHPRangeLow/Highをskillの発動条件と断定しない。現在の事実は二producerの情報が同じquantityへ合流すること。
   `preparationOc`はsource開始のfactsを保持し、`ocState.rateValue`は利用時に値式を読むが、HPは
   contextの初期permilleとwrite markerのみ。ordinaryの`projection.resolveModifierValue`と
   `npDamageOperation.evaluateNpDamageOperation`もpermilleを読む。terminal HPを全sourceへ渡す案も、
   source開始値を全consumerへ固定する案も採用しない。
3. **更新とprojectionの二重解釈**。`terminalOcPreparationEffects`は後続OC readerのあるresourceしか
   terminal preparationへ含めない。`closeResourceMutationSemantics`はordinary suffixにreaderがなければ
   HP writeを消せるが、全NPの生存条件を実装していない。HP guardだけを追加しても、未実行のHP costを
   初期HPで判定してしまう。初期seedだけの単位を全H接続の代わりにしない。
4. **admissionの別モデル**。`rankingActionAdmission.classifyPrograms`はstructuralを先にadmitし、
   optionalは`unsupportedEffect`でsource中のunsupportedを一括拒否する。contextReference、dependent量、
   不使用variant、automatic、unknown siblingをprogram-bound proofで区別する責務は残る。
   HP/BPだけでなく、全22 exclusionsの併存原因を扱う。

上記はc167e63で確認した実装と型の事実。新しいdamage regressionを観測したという主張ではない。
前回reviewのgapはread descriptorのactor/resource分類を整えた後、**条件を作る時点で失われるclock**と
全NPの生存readを実行まで閉じなかったこと。recurrence scopeはfunction条件／buff-use条件／量式／OC率／
terminal damage、同一source内の前後write、form・variant・CE/support・ordinary projection。
最小guardrailは同じHP閾値を異なるclockで読むfixture、条件→healとheal→条件、grant→heal→use、
HP1/11000、HP0、command失敗→retry、portable fresh run一致。個別servant修正へ分割しない。

### 実行単位の境界修正（U番号はTask表を維持）

- U0-R/U1-Rは単独の成果物追加でphase完了とせず、対応するU2/U3/U4の実行証拠へjoinする。
  pipelineがactivation／operation／effect-useの読取契約を発行し、executionがclockとactorを解決する。
  application/UIでraw証拠からclockを復元しない。instanceには必要な式とownerを保持し、
  activation判定のreceiptとlive value queryを別にする。
- **HP縦断単位はU0-H/U1-H/U2-H.1〜3＋該当U3-A/U4**。初期intentの整合検査→absolute seed→
  最大値instanceとgain/loss→必要時のquery→NP-use前・damage位置の生存判定→共通outcome→
  入力修正/reset/装備変更/portable再構築までを完了境界にする。内部focused検証は分割してよいが、
  seed/resolver/query descriptorだけでこの単位を完了にしない。
- **BP縦断単位はU0-B/U1-B/U2-B＋該当U3/U4**。pipeline参照domain→actor別point/capacity→
  phase/rate導出→branch選択と後続damage/OC→rollback→保存初期intentから再実行。
  HPの数式には非依存。phase inputをpointへ写す代表値は、後続全readerで同値である証明が必要。
- **count縦断単位はU0-D/U1-D/U2-D.count＋該当U3/U4**。計数scope、actor単位とtrait一致単位と
  buff instance単位を分け、現在のpopulation/stack ownerでquery→NP更新→後続OC/NP→repairを閉じる。
  `Value2`をcount capとしない。解除前後、同actor複数一致、normal/LB/NP cellを反例にする。
- **transfer縦断単位はU0-D/U1-D/U2-D.transfer＋該当U3/U4**。donor snapshot、算定gain、
  dependent childの結果、実減少量を別に保持する。NP/敵charge/HPを共通数値へ潰さず、
  nested proc failureとsemantic rejectionを分離し、全draft rollback/retryまで閉じる。
- U3-Qは各単位のordered readerから初期量候補の必要境界を作る。単にwriter後の閾値を初期入力へ
  コピーしない。小domain全探索、amount-only reader、同phase異point、clamp、HP0除外、
  baseline包含と四policy最大値を検証する。U5の433/433・422/422、80条件・owned・UI・性能は維持する。

### 技術gateと製品範囲の区別

| path／gate | 現在の分類と解消条件 |
| --- | --- |
| 初期割合の整数写像／safe integer | Verified: 既存U0-H設計を継承。BigInt積のfloor、p=0→0、p>0→正値。実行接続は未検証 |
| HP条件／値式のclockと精度 | buff ownerの利用時readを採用。Blocking: U0-Hの閾値・量式ごとの整数化位置。根拠と具体的な判別入力は実装直前deltaを参照 |
| 最大HP付与・解除、回復量 | Blocking: U0-H/U1-H。現在の一次資料はbuff action集約まで。比較実装の最大値変更・回復の処理を、そのままゲーム挙動のoracleにしない |
| BP domain | Verified: 両domainのNice APIを今回再取得し、3300200の固定point境界、705300の割合境界/defaultMax4/superGiant8/maxLimit12を確認。51 write cells/25 capacity cellsはshared auditを再照合。実装はDeferred: TSK-06.45/U1-B/U2-B |
| BP段階intentと実量の対応 | Verified: D2の制約方式と有限性。Deferred: TSK-06.45/U3-Qの全program候補積・最大値完全性。段階とpointを同一視せず、初期phase4の30/39→+5でphase4/5となる反例を維持 |
| count selector | Verified: 既存scope分類を継承。count実量・trait instance寿命・全cell実行はDeferred: TSK-06.45/U1-D/U2-D.count |
| transfer順序・抵抗・gain clamp | Verified: 現行disjoint/非反応型branchの順序同値性、raw60 cellsと抵抗producer0。未知childは更新前拒否を採用。Deferred: TSK-06.45/U1-D,U2-D.transferの接続と回復。HP数値未確定は依存として保持 |
| 吸収元quantityの製品入力 | Verified: D2の対象別制約方式を採用。既存inline領域へ吸収効果量と共有対象の制約を投影。生の敵HP入力は不要。Deferred: TSK-06.45/U3-Q,U4の合法候補・複数read・修復検証。具体例は追加delta |
| transaction／form／source activation／ordinary receipt | Deferred: TSK-06.45/U2/U3。NP/OCだけでなくHP/BP/instance/context/read receiptを同じdraftへ含め、失敗command全体を戻す。前commandは保持 |
| portable/reset/装備変更／admission／全production | Deferred: TSK-06.45/U3〜U5。初期intent再解決と全outcomeの一致が必要。既存gate成功を実装証拠へ代用しない |

吸収元量が単なる内部詳細ではない反例: 現行masterの`gainHpFromTargets`は3 effects/30 cellsで、
`DependFuncVals.Value`と敵HPの不足に依存する。礼装9307920のcanonical効果はattacker HP≦500 permilleで
NP buff +300。max10000/current4000に0または3000のHP gainが入れば、この後の閾値結果は異なる。
これは同一入力の数値が一意になるために必要な情報の反例であり、転送順序・丸めのゲーム実測証拠ではない。
この礼装の存在はshared masterの追加source監査へ含め、本人のHP依存NPだけを対象にしない。
追加入力は前回提案したが、対象別の依存量と段階指定のモデルを検証する前に必須とはしない。
効果実行要件§6のbattle simulation対象外と、既存Task U2-D.transferの新敵state入力時の範囲確認は維持する。
今回の指示を敵HP入力の追加承認と解釈せず、まず既存製品範囲での表現可能性を調査する。

追加の製品入力反例: [3300200 Nice API](https://api.atlasacademy.io/nice/JP/battle-point/3300200)は
phase4の境界を30、phase5を40と定義する。同じphase4でもpoint30と39では+5後が35/44となり、
phase4/5に分かれる。現行masterのskill2372650は5 point加算cellを持ち、同domainのNPは
`secondaryValuePermille=1000, correctionPermille=100`でphaseを読む。
この差はphaseだけの初期intentでは解決できない。`StartingPosition`/`FriendShipAbove`の成立と
source activationを確定した合法programで検証する必要があり、raw cellの存在を実行済み証拠にはしない。
[705300 Nice API](https://api.atlasacademy.io/nice/JP/battle-point/705300)は割合phaseであるため、
この固定point境界を流用しない。absentとpoint0、capacity変更後の同値性も維持する。
前回の「開始point入力＋phase表示」案は、利用者のバフ量ベースの段階指定という指示を受け撤回した。
この反例だけでは内部pointの直接入力が必須とは言えない。初期点の暗黙補完禁止は維持する。

### 対象ベースの設計修正（利用者指示の反映）

利用者成果は、バフ量に対応する段階で条件を指定し、calculator／rankingで同じ実行結果を得ること。
不変条件は、**対象の同一性、量のdomain、量の尺度、読取時点を分離**し、段階を実量へ直接加算しないこと。
BPだけ別の入力・更新法則にせず、HP／NP／BP／吸収の同じ依存read機構へ適用する。
ただしHP、NP、敵chargeの単位や減少下限まで同じ数値規則にはしない。

確認した機構と前回の検出漏れ:

- `resourceQueries.ResourceQuery`はactor／resource／measure／domainを分離しているが、これはread descriptorのみ。
  `executionSemantics`のBP加算はrecipientを持たない`contextMutation/addQuantity/battlePointPhase`を生成する。
  `candidateExecution.quantityOperationIsNotRelevant`はそのdomain由来`subjectId`を`attackerId`とも比較し、
  NPのdamage kindから関連性を決める。対象とdomainが独立した実行モデルに収束していない事実であり、
  現行masterの新しいdamage反例を実行で確認したという意味ではない。
- passiveだけ`representedByCurrentInput`として省略するproducerが残り、
  段階入力に含まれた操作の範囲を実行receiptで証明していない。前回は同phase異pointの反例を
  入力UIの不足として捉え、対象・尺度・入力に含む時点を先に閉じなかった。
- `rankingQuantityWorld`はsubject付きquantityを候補抽出から除外し、quantity名だけで候補を集約する。
  同対象の複数domain／別対象の同domainを分ける責務もU3-Qに含む。共通queryが存在するだけでは解消済みにしない。

設計上の責務と実装前の解消条件:

| 境界 | 責務・不変条件 | 現在の分類 |
| --- | --- | --- |
| raw→canonical operation | pipelineが効果の対象selector、量domain、尺度、条件／量式を発行。domain IDをactor IDにしない | Deferred: TSK-06.45/U1-B/D |
| 入力→application intent | 指定時点は既存要件の初期basis。段階は対象と依存する効果に結び付いたバフ量で提示する。passiveを含む選択済み準備列をその後に一度だけ実行し、最終値overrideへ変えない | Verified: 設計判断D1。runtime接続はDeferred: TSK-06.45/U2-B/U3-Q/U4 |
| intent→execution state | 対応する実量の制約を保持し、全関連read／outcomeが同値と証明できる場合だけ代表へ縮約。非同値な候補は効果量の組合せで分け、別の対象状態を同時に捏造しない | Verified: D2の方式とBP有限性。Deferred: TSK-06.45/U3-Q,U4の全program完全性・性能・回復。実装直前deltaの吸収量制約も参照 |
| 対象別state→ordered read/write | executionがactor別実量を所有。吸収元read、受取先write、source所有の補正を別に解決し、条件／proc／量read／writeを同じdraftへ置く。段階・バフ量は対応するclockのqueryから導出 | Deferred: TSK-06.45/U2-B/D、数値契約gateは維持 |
| 結果→回復 | calculatorとrankingが同じintent解決・実行を使用。保存するintentと実行receiptを区別し、reset／装備／form変更で依存制約を再評価。rollback後のretryに失敗draftや古い代表stateを残さない | Deferred: TSK-06.45/U3/U4 |

最小反例集合は、同対象の異domain、異対象の同domain、sourceとrecipientが異なる支援、
吸収元と受取先が異なるtransfer、同段階内の増減後分岐、割合domainのcapacity変更、
同じバフ量でもHP0と正HPで攻撃可否が異なる状態、NP量からOCが変わる状態、
passive／skill／transform／NP前の二重適用、rollback／retry／portable再構築。
単一のバフ量一致を、全結果・到達可能性の一致へ読み替えない。
stochastic failure／disabled／repairable input／invalid／unsupportedは既存outcome契約を維持し、
制約が曖昧なまま任意の数値へ落とさない。ただし現行masterの未解消をinputRequired扱いにするだけではTask完了条件を満たさない。
このdeltaはU0-B/D・U1-B/D・U2-B/D・U3-Q・U4へ反映する設計課題であり、runtime接続の完了証拠ではない。

### 判断の確定と実行への割当

利用者の「これまでの判断パターンから判断に落とし込んで対応」に従い、上記の設計上の選択は
次で確定する。基準は既存初期basis、バフ量段階の入力、対象ベースの共通化、推測値禁止、
同じapplication/execution、既存領域内の入力、回復時の再構築。ゲーム挙動の未確認事項を
設計上の裁量で事実に変えない。以下の判断受領・仕様照合をruntimeの検証済みへ読み替えない。

| 判断 | 採用する処理と削除する重複 | 実行単位・判定証拠 |
| --- | --- | --- |
| D1: 指定時点 | HP/BPとも初期basisを指定する。BPはバフ量に対応する段階で提示し、内部point入力へ置換しない。自動付与も準備列で実行し、passiveというsource種別だけで入力へ適用済みとする省略を削除。実行後の段階は結果として投影 | U0-B/U2-B/U4。初期→passive→skill→NP前の更新、reset/fresh runで二重適用0 |
| D2: 段階と実量 | 段階は実量の制約であり、実量そのものではない。対象/domain/読取時点を共有する効果量の組合せから合法な候補を解決する。単一効果ごとの独立な最大値を合成しない。後続で非同値なら必要な効果量の候補を既存入力領域へ投影し、raw pointを利用者へ要求しない | U0-B/D/U3-Q。小domain全探索と一致、同段階異point、競合する効果量、候補なしと複数非同値を区別。表現不能を任意数値で埋めず、現行masterに残れば完了不可 |
| D3: 対象の所有 | physical actor、量domain、source instance、recipient selectorを独立にする。executionが対象別stateを唯一所有し、query/operationがそれを参照。吸収元と受取先も同じ参照契約を使う。domainとattacker IDの比較、攻撃者の量の他sourceへの流用を削除 | U1-R/B/D/U2。異actor同domain・同actor異domain・支援・複数recipient・自己donor。既存selectorを拡張し、任意の戦闘entity editorは追加しない |
| D4: 時点と数値 | activation条件、operation位置の量read、利用時に評価する式をIRで区別。固定値には確定時点のreceipt、live値には所有対象と式を保持。表示用HP丸めを生存判定へ流用しない。最大HP・回復・吸収の数値規則は一次根拠と全cellの対応が取れたbranchから固定 | U0-H/D/U1-R/U2。grant→write→use、HP0/正HP表示0、最大値解除、donor不足/抵抗。資料未確定は技術調査で解消し、製品判断として差し戻さない |
| D5: transactionとoutcome | 一つのcommand draftに全resource・OC・form・instance・context・receiptを含める。source/childの確率的不発はゲーム規則に従うoperation outcome、意味不正や必要情報不足はcommand全体の非commit。HP0の攻撃拒否はtyped到達不能でNP/OCを消費しない。前commandのcommitは保持 | U2/U3-A/U4。成功→次command拒否→修復retry、child不発とunknown、NP-use前とdamage位置HP0。admissionと共通結果の分類一致 |
| D6: 回復と保存 | canonical初期intentを保存し、実行draftや選択した内部代表を入力正本にしない。装備/Lv/form/NP/OC/policy変更、reset、portable復元は同じapplication constructorから制約・初期量・準備列を再解決。意味を維持できない旧schemaは既存version方針で拒否し、旧writer fallbackを残さない | U4。変更前の代表stateを使い回さない、失敗requestが成功requestを汚染しない、fresh runとのinput/outcome/receipt一致 |
| D7: rankingと性能 | rankingは同じ制約と実行から合法candidateを選ぶ。対象/domainを失うquantity名だけの集約を削除。必要なordered境界を初期domainへ戻し、同値縮約は共通executorの観測に基づく。4096上限や性能閾値を緩和しない | U3-Q/U5。soundness、最大値の完全性、baseline包含、NP1〜5、全policy、同環境before/after。候補爆発は方式を見直す条件 |
| D8: admissionと完了 | 選択programのsource activation・form/variant・readerから関連性を決める。familyのresolverやIRの有無、source内のunknown一件だけではadmit/rejectを決めない。現在calculatedな宝具も同じ母集団へ残す | U3-A/U5。22 exclusionsの併存原因join、422/422・433/433、fail-closed・回復・性能・最終quality。先行単位でTaskを閉じない |

D2のcandidateはapplicationの入力投影であり、UIに内部条件式・敵HP・行動順のeditorを追加する判断ではない。
不足情報の入力owner、消費effect、共有key、表示位置は効果実行要件§8.10/8.11とADR-013に従う。
吸収元の実量入力を先に必須化する提案は採用しない。既存入力と合法な効果量指定で閉じないことが
具体的に証明され、敵state等の新しい製品範囲が不可欠な場合だけ、その差を確認する。

実装前自己レビューの残りは「どちらを選ぶか」ではなく、D2の全domain/cellの表現可能性、D4の
数値・clock根拠、D8の全22 exclusionsの直接原因join。これらを既存U0へ記録してから対応branchの
縦断実装へ進む。未検証をVerifiedに変更せず、依存しない単位を一括で承認待ちにはしない。

### 実装直前の調査delta

今回の指示は「実装できる手前まで」。runtime/schema/master/testは変更しない。
HEADは引き続きc167e63、開始時のTask/flow差分を保持。以下は既存U0の証拠追加で、新しい計画正本ではない。

**22 exclusionsの直接原因join — Verified（原因監査のみ）**

既存production artifactの22 profile keyを、実際の
`compileStaticRankingPreparationPrograms`→`compileCandidateLocalActionAdmissionDispositions`へ渡し、
default policy/NP1/initialGauge10000/automatic passivesで拒否sourceを抽出した。
20 lineage・22 profilesすべてに原因があり、36 source-qualified occurrences
（contextReference22、dependentResourceAmount14）を確認した。
raw skill ID＋function occurrenceまで36/36 join。raw actorは21で、青子の変身後skill2355650は
raw actor2501500からlineage2501400へ入る。lineageだけでrawを引くと6 occurrencesが漏れるため、
form由来を含めてjoinした。probeはmasterを一度parseし、full rankingの再計算はしていない。

| 現在の拒否family | profiles | lineageとprofile差 | 変更責務 |
| --- | ---: | --- | --- |
| contextReferenceのみ | 8 | 105900、106400、204900×2、405700、605100、705300、2501400 | U1-R/Dのinstance/trait producer＋U2の付与・解除＋U3-A。705300には別途BP実行の不足もある |
| dependentResourceAmountのみ | 10 | 106200、204300、304000、306000、403600、1000900、1001800、1101600、2500400、2501600 | U1-D/U2-D.countまたはtransfer＋U3-A。HP/NP更新の後続readerまで接続 |
| 両方 | 4 | 306200×2、502600、1102300 | instance/traitとcount/transferを両方閉じる。一原因の解消でprofile完了にしない |

再現調査: `/tmp/tsk0645-admission-plan-probe.ts` → `/tmp/tsk0645-admission-plan-probe.json`、
raw join `/tmp/tsk0645-admission-raw-join.json`。
基点artifactは上記120-test production run、master hashは
`3a9c481dc25ab151f3be8106352210e4807ca0eaa1f2fb4c19225fa645a9ff6b`。
これは現在の最初のadmission拒否原因を全数対応付けた証拠であり、修正後の全execution成功の証拠ではない。

**contextReferenceの再発範囲と実装責務**

`effectNormalization`のaddedRecipientTraits/removedRecipientTraitsはname mapにあるValueだけを保持し、
`targetStateNormalization.stateMutationTraitName`で既に使う`traitId:` identityへの写像と一致しない。
その後`executionSemantics`は操作が空ならcontextReferenceを生成する。
一方、Value9999のmarkerにはbuff自体のtrait（3091、2860、2885など）があり、Value0のmarkerも存在する。
**Valueをすべてactor traitへ足す修正は不採用**。actorへ付与するtraitと、buff instance自身のtraitを分離する。
`SameBuffLimitTargetIndividuality/Num`、`AddIndividualty/List`、`AddLinkageTargetIndividualty`、
`AddIndividualityEx`も同じinstance/selector inventoryに含める。labelやIDごとの例外を作らない。
未使用markerの非干渉proofと、count/解除/後続条件が読むmarkerの実行をU1-R/U2/U3-Aで分ける。
前回の検出漏れは、raw contextReferenceをadmissionの問題だけと見て、producerのidentity欠落と
form間のraw owner joinを閉じなかったこと。最小guardrailは名前なしtrait、Value0/9999 marker、
instance複数付与→count→解除、変身前後の同function ID、後続readerの有無。

**BP段階の有限性 — Verified（限定した数理モデル）、ゲーム遷移と全program joinは未検証**

- 固定閾値domain3300200の現行writerは非負の+5/+10だけで、phase readerの最大境界は90。
  このreader/write集合ではpoint≥90の区間は以後の全phase readで同値。
  90はcapacityではなく、尾部区間の代表境界である。初期候補はabsentと0〜90の92代表以内。
  各prefixの加算量をs、読取閾値をtとすると、初期分割の境界はt−s。
  +5/+10の長さ0〜4の31列と0〜350の比較で10,881件一致し、観測trace classの最大は20だった。
- 割合domain705300は明示maxLimit12のため、これまでの有効capacityが上限内ならstored pointも0〜12。
  capacity低下時にretainする仮説とclampする仮説の両方で、この有限性は保たれる。
  capacity4/8/12、gain2/gain12/loss2/capacity変更の長さ0〜3の259列で15,540件を検査。
  **この検査はretain/clampのどちらがゲームで正しいかを決定しない**。
- 実装は小domainを列挙して共通executionに通し、同じ初期段階でも更新後の効果量が異なる候補を
  同一視しない。projectionは合法な効果量の組合せを返す。raw pointの任意選択はしない。
  新しいwriter/readerが入ったら上記尾部proofを失効させ、current amount/rate readerや減算を
  phase-only proofで消さない。全量・全条件の積が4096以下であることはU3-Qで別途検証する。

設計probe `/tmp/tsk0645-bp-partition-probe.py` → `/tmp/tsk0645-bp-partition-probe.json`。
独立の数理反例検査であり、production executorのtestや性能測定ではない。

**HP/BPのread ownerとclock — producerとbindingを同時に修正する**

raw servant全体からHP値式/HP script条件を持つ13 function occurrencesを抽出した
（`/tmp/tsk0645-raw-plan-probe.json`、礼装は既存shared inventoryのHP_LOWER1件を継承）。
RatioHPRangeを持つ1000100/355551/2465は、別にbuff scriptのHP_LOWER500も持つ。
したがって現行productionで両producerが同じ境界になることは、一般に値式区間と付与条件を同一視する証拠ではない。
300900/49650/23498はparty全体へHP依存値式を付与する。source HPを一律に読む仮定では済まない。

BPについても`TriggeredTargetBattlePointRateRange`を現在はsourceQuantityへ正規化しているが、
比較実装の`function_executor.dart:acquireFunctionTarget`内のtarget filteringはrecipientごとに
`battlePointRateCheck`/`battlePointCheck`を呼ぶ。同実装のHP buff値式とHP script条件もbuff ownerを読む。
これはsource bindingを再検証する具体的な比較証拠であり、比較コードをゲームoracleにはしない。
前回のread descriptor整理でsourceに結び付けたこと自体を正しさの証拠へ転用しない。
U1-Rは明示的な「発生元／recipient／buff owner」の相対参照をIRに持ち、concrete actorへ束縛する責務とする。
反例はsource HP100%/recipient HP1、逆のHP、source BP満杯/recipient BP空、逆のBP、
grant→heal→use、同source内のBP write前後。HP buff/useとoperation target checkを同じsnapshotへ固定しない。

数値の監査範囲も限定できた。現行canonical全sourceのgainHpPer50 cellsとlossHpPerSafe10 cellsは
Value1000だけで、割合基礎量は最大HP全量となる。任意割合の端数処理を現行cellの実害と表現しない。
ただし固定回復への量modifier、HP比率の閾値・値式、最大HP減少/解除、transferの算定順は依然として
整数化位置やstate更新規則の証拠が必要。既存[FGO float資料](https://github.com/atlasacademy/fgo-docs/blob/master/deeper/battle/32-bit-float.md)の
NP gain例だけではHPの演算順を確定できない。

**追加の根拠照合とgateの縮小（2026-09-09）**

前回のレビュー不足は、現行programで観測される未確定数値と、productionにない遷移の
実行一般化を同じBlockingへまとめたこと。以下は対象を隠すための除外ではなく、raw全sourceの
再監査と、観測同値性／拒否契約による境界の明確化である。
比較コードは[Chaldea commit 9fa75655](https://github.com/chaldea-center/chaldea/tree/9fa75655c07ecd76168b1ccf5b8232e8d64664cf)に固定。
比較先のテストを実行したという意味ではなく、該当コード・公開テスト・呼出元を読んだ証拠として用いる。

- raw servant・CE・mystic code・referenced skillsを各一回読み、6 transfer occurrences/60 cellsを確認。
  parentはすべてself、childはHP→enemy/enemyOneNoTargetNoAction/enemyAll、
  player NP→ptOther、enemy charge→enemyAll。child Rateはすべて1000。
  ただし**Rate1000は無条件成功の証明ではない**。
  Chaldeaの`hasten_npturn.dart:HastenNpturn`は専用の`resistanceDelayNpturn`を控除する。
  対象raw一式の同耐性plus/minus producerは0件。通常の弱体耐性とは別familyとして扱う。
- 現行のdisjoint donor/receiver、非反応型child、抵抗なしのbranchでは、同一snapshotでgainを
  算定した後のreceiver加算とdonor減算は別actorへの更新であり、最終stateが可換になる。
  14,080個の小型状態を独立に比較し一致。これはゲームの内部実行順を観測した証拠ではないが、
  **このbranchの数値実装にゲーム内部のgain/child順の判明を要求する必要はない**。
  executorはsnapshot→算定gain→receiver clamp→child更新の順を採用し、途中に外部readを許さない。
  子の未知条件・確率・専用耐性・receiverとのalias・反応型処理は、全mutation前にunsupportedへ閉じる。
  invalidなselector/重複identityとunsupportedな実行契約は区別する。将来形へ推測の順序を与えない。
- HP吸収はdonorごとのsafe下限を先に適用し、その和とreceiverの実増分を分離する。
  例: donor501/2500、各上限2000なら算定gain2500、donor残1/500。
  receiver9000/10000では実増分1000でもdonor損失を1000へ減らさない。
  [使用者の記録](https://intindex.stars.ne.jp/archives/6016)の敵HP不足時の説明と、
  Chaldea `function_executor_test.dart:gainHpPerTarget`の不足donorテストがこの区別を支持する。
  player NPは各donorの`min(current, cost)`、enemy chargeは不足なら0、充足ならmasterのValue2を
  player NP単位へ写す別量式にする。比較テスト`gainNpFromTargets`はNP2000/10000から
  cost2800でgain4800、残0/7200を検証している。比較値の転記だけで自前testを作らない。
- BPの直接capacity buff writerは全rawで1 occurrence/25 cellsのみ。
  raw705300 NPのfunctionsはdamageの後にcapacity+4があり、当該NPは終端攻撃。
  この直接writerのafterDamage branchは`N/A: 終端damage以後`。
  ただしcapacityの間接writerは別にある。raw204900/2273450/21150はselfへ2076（超巨大）を付与し、
  705300/23458はptFullへ10042（domain eligibility）を付与する。
  **直接capacity buffの25 cellsだけからcapacity変更全体をscope外とする推論は棄却**。
  特性付与・解除、formのtrait集合、source activationもcapacity/eligibilityの依存writerへjoinする。
  比較実装は`FunctionExecutor.executeFunctions`の各function後に`BattleData.checkActorStatus`→
  `BattleServantData.updateActState`（特性buffを先に更新）→`refreshBattlePointMax`を呼び、
  capacity再計算とpoint clampを行う。phaseのcached maxとrateのlive maxを不一致のまま使う
  という前回の懸念は、この呼出元を追わなかった調査漏れだった。
  採用設計は、対象の有効trait/instance更新→capacity/eligibility更新→有効domainのpoint clamp→
  後続readの順。domain不存在とpoint0は分け、存在しないdomainに0のrateを捏造しない。
  これはrawのdomain定義と比較実装の全更新経路に基づく設計判断。実ゲーム測定済みの主張ではない。
  初期、特性付与・解除、form/retry、同一source内readをU1-B/U2-Bで検証する。
  直接capacity buffのpre-damage出現0をratchetし、新規出現時は対応契約を検証するまで更新前拒否。
  現行51 write cellsのpoint増減、recipient別range判定、段階→実量は引き続き実装対象。
- HP buffのowner/clockはrawのrecipientとbuff scriptを保持し、buff ownerの利用時readへ束縛する
  採用設計とする。根拠はparty宛HP依存buffのraw、比較実装`BuffData.getValue`/`checkAct`、
  付与後にHPを変更して効果量を再評価する`buff_test.dart:HpRatio`。
  source HPを固定値として配る設計は不採用。これはraw構造と独立実装からの設計推論であり、
  端数までのゲーム実測を得たという主張ではない。

raw再監査は `/tmp/tsk0645-gate-evidence.py` → `/tmp/tsk0645-gate-evidence.json`。
各入力のSHA256、全該当path、function/cellを保持。selected executionの検証とは区別する。
算術probeは `/tmp/tsk0645-numeric-contract-probe.py` → 同名`.json`。
上記の可換性はdead receiverを復活させる契約ではなく、receiver生存guardを別途必要とする。

**吸収量の入力を対象ベースで閉じる採用設計**

U3-Q/U4は既存inline領域に効果量の制約を提示し、生の敵HP編集を追加しない。
同じdonorへ上限a、bのHP吸収を順に実行する場合、最初の吸収量x<aなら次は0、
最初がaなら次の吸収量は0〜b。二効果の最大値を別々に指定して矛盾させない。
内部では同じdonor identityに初期整数HPの区間を束縛し、ordered lossで区間を更新する。
このreader集合なら初期HPが`1 + 全予定吸収上限の和`以上の尾部は同値。
途中で敵HPそのものを読む別operationが加われば尾部proofを失効させる。
HP/NP/chargeは単位別queryのまま、同じ「対象別制約→ordered実行→効果量投影」を使う。
既定値は既存要件の最小合法stateから解決し、未指定を最大吸収として扱わない。
非同値な選択肢は必要な効果量の組合せとして修復可能に表示し、区間代表を入力正本へ保存しない。
この設計に新しい製品判断は不要。小domain全探索、二重吸収、効果解除／不使用への変更、
portable/resetでの制約再解決はU3-Q/U4の未実装完了条件として残す。

**HPでまだ採用できない数値と、それを判別する入力**

1. 最大HP低下: current5000/max10000へmax−2000を付与すると、clamp-onlyなら5000/8000、
   比較実装の常時減算なら3000/8000になる。
   [Rabbit本人の分析](https://gamefaqs.gamespot.com/boards/180151-fate-grand-order/76323843)は
   負傷量が減少量以上ならcurrentは減らないと明記しており、clamp-onlyを支持する。
   Chaldeaの`buff_test.dart:maxhp`は満タン時だけで両仮説を区別できない。
   よって比較実装の減算規則をoracleとして採用する案を棄却。原分析は実測手順を提示していないため、
   整数遷移の最終確認済みとはしない。解除時のcurrent維持／maxへのclampも同時に固定する。
2. 回復量: `gain_hp.dart`の`toModifier`はdouble演算で、damageの専用Float型を使わない。
   基礎3000・receive1300・give1000では、各演算float32→整数化なら3899、doubleなら3900。
   基礎200・receive1050・give1100でも230対231になる。
   全rawから抽出した値集合の直積94,185組を算術比較して差を確認したが、この直積は
   合法production同時付与を証明していない。一般的なfloat32資料のNP例から、HP回復の
   乗算順／整数化位置を逆算して正解値を捏造しない。回復表示値だけでなく実HP差で判別する。
3. HP条件／値式: owner/clockの採用と数値readerの確定は別。
   比較実装はbuffのpermille整数化とNPの連続比率を使い分ける。
   表示HP比率・条件permille・NP倍率用比率を同一readerへ潰さない。
   threshold直前直後、正HP表示0、grant→heal→useを同じ数値規則で確認する。

**実装開始の判定（未検証事項を実装担当へ隠さない）**

| gate | 現在の判定 | 残る証拠／最小反例 |
| --- | --- | --- |
| 全22 exclusionsの直接原因とraw owner | Verified | 上記22 profile/36 occurrence join。修正後の後続failureはU5で再分類 |
| actor/domain/instance所有、初期指定、rollback、回復の方式 | Verified: D1〜D8の設計 | 実行成功の証拠は各U2/U3/U4で取得 |
| BP段階→有限候補 | Verified: 有限性、直接writerのscope、間接trait writerと比較実装の更新経路 | recipient bindingと特性→capacity→point clamp→readを採用。全program候補積／最大値完全性はDeferred: TSK-06.45/U3-Q、未検証の上限を通過済みにはしない |
| HPのowner/clock/数値 | owner/clock設計は採用、数値はBlocking: U0-H | 上記3項の判別入力。比較テストの満タン偏重とdouble/f32差を解消し、未確認の数値を埋めない |
| transferの数値とchild outcome | Verified: 現行disjoint/非反応型branchの順序同値性と対象範囲 | raw60 cells、耐性producer0、可換性14,080状態。実装・全cell join・未知childのmutation前拒否はDeferred: TSK-06.45/U1-D,U2-D.transfer。HP branchはHP数値契約と生存guardへ依存 |
| production parity/回復/性能/quality | Deferred: TSK-06.45/U2〜U5 | 今回は実装前調査。対応数420/422・411/433から改善したとは扱わない |

今ある資料だけでは上記Blockingを0と判定できない。設計の選択は確定済みだが、
**TSK-06.45全体を無条件に実装開始できる状態とはまだ記録しない**。
BPの直接afterDamage容量buffと間接trait writerを混同せず、現行transferの同値な内部順序を
再び全体の技術Blockingへ戻さない。
残るHP数値については上記の相違を識別する根拠が必要。文書検証・比較実装テスト・独立算術probeを
ゲーム観測へ読み替えて実装開始可能と宣言しない。

**実装差分の接続先と削除条件（既存単位への割当）**

| 境界 | 実装時に必須となる変更 | alternate/recoveryの確認 |
| --- | --- | --- |
| application→concrete preparation | `scenario.resolveScenarioPreparationOutcome`で解決したmaximumと初期intentを、必須のvalidated basisとして`sourceCollection.resolveAttackerFormExecution`へ渡す。量assertionとの重複は初期境界で整合検査し、live stateを初期world factで上書きしない | 直接`collectSources`の暗黙再実行も同じbasisを必須にするか、prepared結果を受ける収集専用入口へ変更。masterなしの実行fallbackを残さない |
| structural planning→concrete execution | `preNoblePhantasmPlanner`の未束縛候補を実行済み`PreNoblePhantasmState`として公開しない。構造候補/obligationと、validated basisを消費した実行stateを別型にする。探索段階のmissing HPをHP0扱いにしない | 既存static ranking programとavailable actionの双方が合法な構造候補を保持し、実行時のHP0拒否を迂回しない |
| canonical operation→transaction | `preparationContracts/State/Transaction`のdraftへactor別量とinstanceを追加。`preparationOc/Facts`はoperation位置に応じたcurrent stateからfacts/量を読む。更新後にsource開始時cacheや初期ratioを流用しない | `ocSourceBinding/ocState`のhpWrite markerをlive queryへ置換し、利用時OC率のreadも同じstateを参照。partial commit/二重source適用を許さない |
| NP-use→beforeDamage→damage | NP-use前のHP0 guardはNP消費とOC-useより先。beforeDamage後もHP0を検査し、失敗したattack command全体の仮消費を戻す。成功時だけ共通receiptを返す | transform NPは後続formへのstateをcommitし、terminal NPは終了。拒否command前のskill結果は保持。ordinaryの`preappliedOperationIds`は成功receiptからのみ作る |
| instance→modifier projection | `projection/npDamageOperation`は各readerのownerとclockに応じたquantityを消費。live式と固定済み値を別型にし、terminal HPを全effectへ配布する処理を置かない | skill/NP/passive/CE/support/mystic、normal/LB、NP1〜5、選択外variantとform由来のsourceを同じ条件で扱う |
| execution proof→admission/outcome | `resourceProgramAudit`のobserverを実行済みproofへ昇格させず、実executorのquery/receiptとjoin。`rankingActionAdmission`はsourceのfirst unknownでprofile全体を落とす処理とstructural迂回を整理 | disabled、condition false、proc failure、inputRequired、invalid、unsupported、typed unavailableを区別。候補内のunknownを除外して最大値だけ成功させない |
| initial intent→portable/cache/UI | `rematerializePreparedCalculationInputs`、`reapplyPreparedCalculationPolicy`、portable reset/upgrade、worker/request/cacheを同じconstructorへ戻す。状態代表とreceiptは入力正本へ保存しない | cache identityにbasis/program/actor form/NP level/masterを含める。装備変更・reset・保存復元後に旧draftの量を再利用しない。UIはapplication descriptorのみ表示 |

この表は数値規則が確定した後の着手先を固定するもので、実装開始のBlockingを隠すものではない。
内部検証は各resourceの小型fixture→applicationの入力から回復までのfixture→shared production auditの順。
HP用guardのfixtureだけを先に通して、未実行のHP writeが残る状態でU2-Hを完了にしない。
移行はschema/engine/必要なmaster版とconsumerを同時に切り替え、最終gateは`pnpm quality`一回とする。

実装前調査の文書検証: `pnpm test:docs`6 tests＋整合検査成功、その後`pnpm quality`成功287.99秒。
unit753/production120/Playwright26、skip/todo/retry/warning/unexpected consoleは0。
artifact `.test-results/2026-09-08T18-28-40-345Z-15-f2b01a`。
runtime変更はないため新しいhot-path性能測定はN/A。上記beforeを実装時の比較基点として保持する。
quality後のVitest/validate:evidenceは追加していない。文書の検証成功と実装開始の意味論gateは別判定。

### 今回の検証

c167e63で`pnpm test:production`成功: 24 files/120 tests、44.32秒、warning/skip/todo 0。
artifact `.test-results/2026-09-08T17-08-47-403Z-15-960a41`。
shared auditはcalculator420/422・ranking411/433を再確認。HP179 mutations、HP dependent30 cells、
BP51 write cellsと25 capacity cellsを既存shared artifactで確認し、masterの別compileは追加していない。
同一環境・非並行・warm-up後のranking3回は3893.19/3807.27/3459.51ms、中央値3807.27ms。
全回411 rows/22 exclusions、digest `d1518753515101166ca89d9e6f76cde3067cb2bf8f80ebff6dee3dfbee410071`。
測定scriptは既存`/tmp/tsk0645-query-performance.ts`、出力は`/tmp/tsk0645-c167e63-before.json`。
外部tsx runnerのDEP0205 warning1はproduction suite warning0と区別する。
今回のruntime変更は0。全TaskのBlockingは0ではなく、実装開始条件を満たしたとは記録しない。
今回の文書差分に対する`pnpm quality`成功: 257.98秒、unit753/production120/Playwright26、
skip/todo/retry/warning/unexpected console 0。
artifact `.test-results/2026-09-08T17-25-15-055Z-45-eecbae`。
これは未実装の実行closureを満たす証拠ではない。runtime変更なしのためafter runtime性能測定は
N/A: 今回は計画文書のみ。次のruntime変更では上記beforeと比較する。

## 77be416後のStep 2（2026-09-09）

開始時dirtyは承認済みStep 1のTask／flowだけで保持。master SHA-256は
`3a9c481dc25ab151f3be8106352210e4807ca0eaa1f2fb4c19225fa645a9ff6b`、manifest一致。
利用者成果は全攻撃宝具の共通実行、所有familyはbounded resource query／transaction。
初期basisとlive state、actor、read clock、非数値outcomeを分離する不変条件を維持する。
仕様差・構造findingが出た場合は同familyの設計と反例をここで更新してから実装を再開する。

before production120成功42.46秒（`.test-results/2026-09-08T15-36-05-711Z-15-78a55f`）。
同一parse済みmaster、warm-up後ranking3回は4922.65／4046.60／3614.80ms、中央値4046.60ms。
全回411 rows／22 exclusions、同一結果digest。測定scriptと値は
`/tmp/tsk0645-query-performance.ts`、`/tmp/tsk0645-query-before.json`。
外部tsx起動時のNode DEP0205 warning1は測定runnerの出力として記録し、suite warning0と区別する。

現在のatomic境界はU1-Rのresource read descriptorとU0-Rのobserver消費。
condition／値式のresource・actor・domainをexecutionで分類し、opaqueと既知のreadを併存させる。
NP-use生存readは必要契約として明示するが、descriptor生成をHP guard実装完了に読み替えない。
HP／BP実state、全cell実行とcalculator追加sourceの全joinは後続単位として未完了を保持する。

### 初期0%確定と次の共通outcome境界

2026-09-09利用者判断: 初期0%も死亡・攻撃不可。表示だけ0%になる正HPは攻撃可能。
この決定は旧Step 1節の未規定記述を置き換える。初期HP精度・live HP変化の技術gateは別途必要。
U2-H.1/H.3の前提としてU3-Aの共通`unavailable`結果を先行する。現在calculatorがNP不足を
unsupportedへ変換しrankingだけrejection codeからunavailableへ再解釈する不一致を除去する。
producerはpreparation rejection、分類ownerはapplication、consumerはcalculator/ranking/portable/result UI。
unknown・inputRequired・invalidは別branchを保持。rankingが失敗候補を捨てられるのは共通unavailableだけ。
同一理由の全候補失敗と複数理由混在を分け、後者をNP不足へ誤変換しない。
schema/engine更新、portable旧版拒否・新結果保存、UI非数値表示、production分類を同一単位で閉じる。
HP死亡code自体はlive state接続時に追加し、初期ratioだけを見た別経路のguardを作らない。

U1-R descriptor後のproduction: 120 tests/24 files成功、44.22秒、warning0。
artifact `.test-results/2026-09-08T15-51-08-390Z-41-6cbbcc`。
4,742 audit recordsはinventory metadata以外beforeと一致し、calculator420/422・ranking411/433を維持。
後ranking3回4241.55/4344.18/4384.07ms（中央値4344.18ms、before比+7.35%）。全回結果digest一致。
単発3標本の揺れを含むため原因不明の増加を許容済みとはしない。量query収集のallocationと再測定を後続で確認する。

### canonical checkpoint（2026-09-13、フォローアップ）

**2026-09-20 TSK-06.45最終closure（基点6546340、U0〜U5完了、Blocking 0／Task内Deferred 0）:** BP完了時の433/433・422/422、quality、性能をbeforeとして再利用し、現行production inventoryから独立非HPとU5だけを閉じた。機械正本は[production closure](tsk-06-45-production-closure.json)、全80条件のper-condition／per-profile recordは`.test-results/tsk-06-45-production-closure`。

- D1／D2: familyごとの局所最大は合成せず、一つのordered program、canonical input、target／field／quantity worldから合法candidateを生成する。整数境界は境界値と直前値、target worldはcanonical initial stateと全condition truthで同値化し、小型独立全探索で最大damageとbaseline保持を照合した。3300200成立込みは3,840→3,072へ縮約して同じ最大値を保持し、最大productは2801300の3,435/4,096。
- D3／D7: source-owned target-stateと外部world factを別domainとし、effect-local provenanceは未知のまま保持する。schema-legal混合条件のoutcome集合を全探索と照合し、現行productionの混合ownership 0件ratchetを確認した。unknown candidateを除外してcalculatedへ変換しない。
- D4／D5: 攻撃NPが選択profileへ到達しない一候補の既存unsupported diagnosticをtyped reachabilityへ集約し、他のcalculated candidateをblockしない。同じ理由で全候補が失敗した場合だけ`unavailableUnderPolicy`。unknown／invalid／inputRequired／一般unsupportedは従来どおり別class。
- D6: 準備OC sourceが最初に読む固定world traitをdomain discoveryだけでなく実行scenarioにもmaterializeする。106400／401300／500400／2800600のNP2/OC1は修復inputなしでcalculated。付与instanceが所有するtraitは外部factで上書きしない。
- D8: critical-starは別実装を追加せず、既存canonical reducerをproduction joinで閉じた。203700／305600／2300700／2300800／2801300の174 selected-program mutation、16 writer-reader関係を、ordered/deferred reader、receipt、全resource rollback／retry、portable／worker回復へ対応させた。

80条件は自然上限／Lv.90 × 自己buffあり／なし × 条件通常／成立込み × 合法NP/OC 10組。34,640 outcomesは34,600 calculated、2501400の自己buffなし40条件だけ`insufficientNpGauge`のtyped unavailable。unsupported／invalid／inputRequired 0、calculator／ranking／portable parity 34,600/34,600、差分0。masterは各shard一度だけloadし、同じinventoryをcondition assertionsへ再利用した。06.44の1,960 unsupported解消はcount／transfer／HP／marker／BPの既存deltaへ対応し、今回damage差として重複計上しない。

stable ownedは自然上限／Lv.90／保有Lv、指定／保有NP Lv、NP0、build／ATK欠落、canonical zero、capacity内外OC、profile変更後pinned replay、forged／mixed／旧version拒否、拒否時旧pair保持を検証。inputRequired→修復、policy off/on、without-area、装備／Lv／form／NP／OC、reset、保存復元、upgrade失敗、stale worker、全state rollback／前command保持／retry二重適用0も同じapplication constructor／executionで成功。UI componentは変更なし。engine 47.0.0表示と固定world fact／選択witnessの現在結果に合わせVRT 4枚だけを更新し、desktop／390px／320pxをfocused 5/5と最終E2Eで確認した。

候補全80条件合計はgenerated／deduplicated 1,028,810、damage request 967,810、distinct 233,100、cache hit 734,710。hot path中央値は5,233.421→5,231.173ms（-0.04%）。production stepは84,677→109,147ms（+28.90%）。closure test 4件とshared audit assertionを追加し、既定5秒timeout維持のためproduction workerを4に固定したwall time差であり、candidate hot pathの退行ではない。cap4096、timeout、性能ratchetは不変。engine 47.0.0、master20260920.3／master schema56／portable schema40は不変。最終`pnpm quality`はunit841／production143／E2E29、skip／todo／retry／warning／unexpected console 0、435.211秒で成功（`.test-results/2026-09-19T21-07-48-452Z-15-1f2e41`、manifest SHA-256 `a6d892985cfe34f977c36d5581878ac9fb677a4e36b95c38800f5133ad12b8b1`）。これより下の`Deferred: TSK-06.45/U*`は実装前のhistorical planning記録であり、このcheckpointが現行DispositionをVerifiedへ上書きする。

**2026-09-20 TSK-06.46計画checkpoint（TSK-06.45後、実装未着手）:** TSK-06.45の完了判定は維持し、次の所有Taskをworld候補生成の責務分割と独立oracle強化へ変更した。現行の初期truth signatureだけでは、同じ開始truthを持つ永続target traitと除去可能なtargetState traitがmutation後に非同値となる反例を表現できない。06.46はworld domain、ordered observation、transition-aware quotient、representative、certificateを分離し、plannerの生成domainを使わない小型全探索で最大値と非数値outcomeを照合する。TSK-06.45の34,640 outcomes、typed unavailable 40、candidate cap 4,096、timeout、性能ratchetをbaselineとして固定し、新damage ruleやUI変更は含めない。詳細なW0〜W5とDone gateは[Task正本](../tasks/development-redesign-tasks.md#tsk-0646-ranking-world-candidate-architecture-and-oracle-hardening)。Blocking 0、status `ready`。後続はTSK-06.47（contribution UI）→TSK-06.5。

**2026-09-20独立marker／admission完了（基点538b83a、対象内Blocking0）:** actor individuality（Value）とbuff trait／buff identityをcanonical instanceへ分離。固定Chaldeaの`getTraits`／`getBuffTraits`／`countBuffWithTrait`／`subState`を照合し、付与・重複・解除・別actor・既知の不在を共通reducerへ接続した。Value 0／9999もbuff自身のtraitと区別し、族連動・finite-use・BP activationの未確定cellは推測しない。根拠は[marker source](tsk-06-45-marker-source.json)。

- 対象105900、204900×2、405700、2501400の35条件は33 calculated、青子の自己バフ除外2条件だけNP不足のtyped unavailable。採用scenario・calculator／portable parityを記録。自然上限／Lv.90／stable owned・合法OC2・四policyの60条件も通過した。
- source inventoryは33actor／55occurrenceとCE2effect。同programのcanonical reader・全NP cellと結び付けた非交差proofを使用し、opaque readerでは禁止。source列を実行順と誤認せず候補順序を保持する。共通cohort writerを未解決actorへの二重writeにしない。
- 同commandの付与→解除、重複instance、別actor、条件不成立／未知、NP・HP・context／receipt rollbackとretryを検証。未知markerは不明状態と元の修復inputを保持し、実寄与するreaderで要求する。飽和・空解除のno-opで不要な入力を要求しない。62件のtransaction／独立oracleが成功（`.test-results/2026-09-19T15-04-36-018Z-16-ec9e47`）。
- 小型oracleは2skillの全subset／全順序を独立列挙し、baseline／satisfiedの最大値と採用順序を照合。実行中に成立したmarker条件をbaselineで除外しない。403700／405300の初期passive未知条件は構造探索で両branchを保持し、実行時は確定factsで再評価する。
- 共有auditは通常ranking432/433・calculator421/422、残る拒否は対象外705300 BP。差分は[marker delta](tsk-06-45-marker-delta.json)。数値差は203500／205500／2501400のcalculator、203500／605100／2300600のranking。marker付与後のNP特攻倍率／状態数／攻撃buffで説明する。
- E2E-053は4系統の実画面・保存再読込・NP2/OC2→NP1/OC1修復を実行し成功（`.test-results/2026-09-19T15-07-24-555Z-15-4f842e`）。共有markerの220経路（NP／合法OC、CE normal/LB、支援とrecipient）も成功。106400／2800600のNP2/5・OC1は初期trait／stateの不足をtyped inputRequiredで返し、初期なしを入力して修復・再実行した。入力事実が後続marker更新を上書きしない。formに属する常時instanceはform変更で失効し、active／CE instanceを保持する。
- 差分レビューで生成・実行・候補・回復の局所反例を解消し、最終qualityと結果記録まで完了。性能はwarm1＋serial3で中央値4999.986ms、538b83a収録4795.091ms比+4.27%。候補6516→6658、dedup4043→4182、要求2377→2591、distinct1451→1485。前回HP増加とは別比較。[validation](tsk-06-45-marker-validation.json)／[performance](tsk-06-45-marker-performance.json)参照。対象4系統5profileと直接共有する経路のU1-R／U2／U3-A／U3-Q／U4は完了。最終`pnpm quality`はunit834／production133／E2E28成功、warning・unexpected observation・retry0、324.726秒（`.test-results/2026-09-19T15-59-14-750Z-15-7cc0c3`）。productionは538b83a収録71,083ms→72,209ms。追加3testで35＋60＋220条件を検証。master20260919.4/schema55、engine45.0.0、portable schema40。BP実量・独立した非HP回復／UI・U5全条件は未完了。

**2026-09-20 BP縦断単位完了（基点0d279c0、対象内Blocking0）:** Atlasの705300／3300200定義を固定取得し、pipelineだけがactor eligibility、trait capacity、point／permille phaseをcanonical domainへ変換する。actor×domainのstateは定義不明、eligible absent、present point0を分離し、phase/rateをlive point/capacityから導出する。3300200の最終閾値90はcapacityへ読み替えない。[source](tsk-06-45-bp-source.json)参照。

- point gain/loss、capacity instance、trait／marker／form変更後のreconcileを既存preparation transactionへ統合。失敗時はBP・HP・NP・OC・form・instance・context・receiptをcommand前へ戻し、前commandのcommitは保持する。終端damage後の直接capacity25 cellsと、後続readへ影響する間接trait writerを分離した。
- 初期入力は従来どおり段階intent。合法pointの逆像を列挙し、同段階のpoint4/5等を一代表へ縮約せず全application/execution後の最大値を比較する。単一witnessでは二重damage評価を省略。小型oracleはcapacity1〜12の全pointを独立列挙し、actor/domain、支援recipient、飽和・端数・境界、trait解除、未知capacity writerの更新前拒否を検証した。
- 705300の通常NP1/2/5とNP2四policyは7/7 calculated。calculator最大44,251／59,002／73,752、ranking NP2最大33,715／106,204／21,612／48,628。成立込みはskill1のchoice candidate2を採用し、残る拒否0。共有3300200も同7条件をcalculatedとし、calculator最大33,725／44,920／56,115、capacityなし、終端phase1を確認。[validation](tsk-06-45-bp-validation.json)参照。
- portableは初期段階だけを保存し内部pointを保存しない。装備・Lv・form・NP・OC・policy変更は同じconstructorから再実行。E2E-054で705300の段階2、NP2/OC2、保存再読込、攻撃役変更時の段階0 resetを実画面確認した。NP damage型だけを見て入力を隠していたUI漏れは、pipeline済みdomain参照へ置換した。
- 通常ranking432→433/433、calculator421→422/422。候補2660→2665、damage request2591→2596、distinct1485→1489、preparation plan3628→3640。3300200 calculator NP1はpre-damage gain後のphase1を読むため平均27,907.42→30,684.20、default ranking NP1は既存と同値。damage根拠は[delta](tsk-06-45-bp-delta.json)。ranking中央値5227.85→5233.42ms（+0.11%）でcap／timeout／ratchet変更なし。[performance](tsk-06-45-bp-performance.json)参照。
- 3300200のNP2四policy最大は27,279／54,419／18,987／37,834。成立込みの有限候補上限3,840と採用witnessを固定し、採用scenarioを共通executionで再生する。未知witnessを残りの数値候補から捨てず、選択NP Lvの行で最大値を比較する。
- 今回のU0-B／U1-B／U2-BとBPに直接必要なU1-R／U3-A／U3-Q／U4はBlocking0。最終`pnpm quality`はunit840／production139／E2E29、skip／todo／retry／warning／unexpected console 0、369.017秒で成功（`.test-results/2026-09-19T18-26-32-399Z-15-4b8408`）。U5の全433profile×422calculator×80合法条件・stable owned closure、TSK-06.45全体完了は宣言しない。

**2026-09-19追記: HP系全体は完了、scoped Blocking0。TSK全体は未完了。** 基点`645a3ee`、引継ぎclean。前回NP／charge transferの成功済みbeforeは再利用した。

今回のHP完了境界はU0-H／U1-H／U2-H.1〜3／U2-D.transferのHP／HPに関係するU3-A・U3-Q・U4。初期intent→actor別HP→共通transaction→条件・値式・NP係数の時点別query→生存guard→damage→修復・保存復元・UIを接続した。固定Chaldea参照の採用契約を使用し、ゲーム実測済みとはしていない。TSK-06.45全体は継続中。

- actor別absolute／current-only／ratio-only／不足を区別。初期0と実行中0は攻撃不可、正値で表示だけ0%は攻撃可。buff整数permille、NPのcurrent/max、表示丸めは別query。
- fixed／percent gain・loss、safe下限、回復modifier、最大HP付与・解除・form再解決を順序付きで実行。減少modifier・変換・再生のturn-end処理はcanonicalな時点非交差proofで区別し、NP前のlossへ混用しない。失敗時はHP・NP・OC・context・全receiptをrollbackする。
- 204300の7414→710、403600の3966→711をcurrent inventoryへjoin。204300の7415はenemy actor専用の非交差proof。donor snapshotの算定gain、receiver実回復、donor実減少を分離し、403600の併存防御低下も同じadmissionから実行する。702500は回復→safe loss→HP依存NPへ接続。
- 条件付き回復補正は付与時に固定せず利用時に再評価する。実行済みHP効果をdamage時点で再判定せず、正当な支援の選択を元のfamilyで検証して引き継ぐ。未知のchoice・writer・child抵抗・aliasはfail closed。条件のない値への置換やID/name runtime分岐はない。
- rankingは合法な初期入力と順序を共通executorで評価。更新後thresholdの逆像、HP→NP/OC依存、逆HPと正HPの競合による区間内部最大を小型全探索と照合。cap4096・timeout・性能ratchetの緩和なし。
- HP修復は初期factを追加して全体を再実行し、実行途中を上書きしない。保存／portableは初期intentを保持。reset／装備・Lv・NP・OC・form変更で再解決する。攻撃役変更時は新NP容量へ初期OCも揃える。E2E-052とdesktop／390px／320pxの実画面を確認。

整数permilleだけの観測は連続比率の値を確定しない（0／1000の端点を除く）。最低HP対象の選択には不明なsource最大HPを初期入力として要求し、mutation／OC readerと同じ定義で修復する。NP係数は実current/maxだけを受け入れ、整数permille fallbackを廃止した。workerはNP効果のcanonical timingを保持し、未知metadataを拒否する。ranking表示もterminal receiptの実HPを使う。

採用仕様・11参照file／定数hash・全source joinは[source](tsk-06-45-hp-source.json)、実行matrix／UI／qualityは[validation](tsk-06-45-hp-validation.json)、855 identityの欠落・追加0と数値差は[delta](tsk-06-45-hp-delta.json)、前後測定は[performance](tsk-06-45-hp-performance.json)。ゲーム実測値への格上げはしていない。

| profile | 通常NP1／NP2／NP5平均 | NP2四policy平均（自己あり通常／成立、なし通常／成立） | NP2候補数 | 残るprofile拒否 |
| --- | --- | --- | --- | --- |
| 204300 | 43,838.400／54,798.110／65,757.830 | 54,798.110／109,596.735／40,185.155／80,370.800 | 2／352／1／22 | なし |
| 403600 | 15,278.175／20,371.065／25,463.950 | 20,371.065／20,371.065／15,669.935／15,669.935 | 2／32／1／2 | なし |
| 702500 | 53,457.900／65,869.885／78,281.860 | 65,869.885／111,701.120／52,129.810／93,792.370 | 16／226／1／10 | なし |

21条件の採用scenario／canonical input／全NP rows／候補根拠をvalidationに保存した。通常transfer donor0でも同sourceの合法効果を保持する。702500通常NP1／NP2は合法な開始NPとスキル3を選んでsafe loss後の約92%をNPが読む。NP1でNP増加が容量上限にclipされても、HP減少から宝具係数への依存をadmissionに保持する。修正前はこの候補がpolicyNoOpで欠落していた。Lv.90 HP12,028＋固定フォウ1,000で初期最大13,028、safe loss後12,028。buff値923permille、表示92%、NP1倍率は`(8000+trunc((1-12028/13028)*8000))/10=861.4%`となり、丸め済みbuff割合をNP係数へ流用しない。成立込みは初期HP permille1から、更新後の生存境界と実比率を用いて最大値を選ぶ。HP0は`attackerDead`、修復可能な不足は`inputRequired`、未知writer／child／抵抗／aliasはtyped unsupported／invalidであり、通常条件の拒否とは区別する。

- 最終`pnpm quality`成功: unit826／production130／E2E27、warning・unexpected console・retry0、336.078秒。run `.test-results/2026-09-19T13-54-00-780Z-45-f19bd9`。master20260913.27/schema54、engine44.0.0、portable schema40。
- ranking425→427/433、calculator420→421/422。既存424 rankingの数値は不変、702500のNP1平均49,647.410→53,457.900はNP上限と独立したHP減少のadmission／NP係数読取による。calculator403600のNP1平均23,505.15→30,556.84は併存防御ダウン30%の適用、702500はHP更新後の連続NP係数によりunsupported→80,187.10。calculator既定相性は403600が2、702500が1.5で、ranking等倍とは別条件。
- 候補生成6,500→6,516、dedup4,035→4,043、damage要求2,351→2,377、distinct1,445→1,451。HP dependency追加で通常scenario候補は2,412→2,434。ranking中央値4795.091ms、645a3ee収録3,542.927ms比+35.34%、同環境で再現した基点4,081.067ms比+17.50%。各warm1＋serial3、非並行。処理追加と環境変動を分けて記録し、cap4096・timeoutの緩和なし。CPU profileのranking本体inclusive時間（warmup＋3回）は16,638→19,413ms（+16.7%）で、HP依存解析／共通準備・条件state／GCの増加を確認。区間外のhash処理を遅延理由に含めず、feature別の厳密な時間配賦とはしない。
- 共有HP inventory486 source／7,470 cell。990 calculator条件（987 calculated、独立BPの3条件のみtyped unsupported）、108 ranking条件、900 normal/LB礼装条件、211支援・選択branchのcalculator／portable一致。自己／支援、自然上限／Lv.90、NP1/2/5・合法初期OC、四policy・ownedを検証した。HP sourceが既にcalculatedの経路も含む。

支援HP211経路には選択familyの全HP branchを含む。705300のHP消費条件は既存canonical sourceQuantity factがあれば実行でき、不明ならunsupportedのまま。これはBP point／capacityの実装代替ではない。独立BP条件のcalculator3件は今回のHP Blockingに隠さずvalidationへ残した。支援projectionは378→379（101000 skill945650 branch4の攻撃buffが選択修復後に到達）、その他既存のNP不足／未知OC拒否はtyped理由を維持する。

E2E-052のHP修復・保存復元・装備／Lv／NP／OC／form／resetを実画面で確認。E2E-050は土方歳三NP1／NP2の実行時HP92%、E2E-051は初期OC3でNP効果timingを含むworker応答を確認した。HP1/11000の生存・表示・buff／NP精度差、未知比率からの最低HP対象修復、途中失敗の全transaction rollbackも小型fixtureで成功。HPの旧Deferred表は本証拠により閉じる。BPを含む行の非HP部分とU5は継続する。

残る実経路と完了ゲート:

1. 独立marker/admission: 105900の21300/21301、204900の21148（2profile）、405700の22977〜22979、2501400の21660と関連trigger。canonical marker producer→実reader→admissionを閉じ、未知の最大候補を落とさず四policy／portable／小型oracleで受け入れる。
2. BP: 705300のmarkerとactor/domain別point→capacity→phase/rate→HP以外も含む後続条件・damage。U0-B→U1-B/U2-Bで初期basis、trait変更／解除、合法段階、飽和・端数・rollbackを閉じる。支援のHP条件ではBP事実が不明なら拒否し、既存のsourceQuantity factで事実を与えた実行と区別して記録した。BP値をHP側で捏造しない。
3. 非HPのU3/U4: 上記stateが変わる候補の最大値保持、修復・reset・portable／worker identity・UIを同じ縦断単位で閉じる。今回HPで成功した回復経路は再実装しない。
4. U5: 残6 ranking profiles／1 calculatorを解消後、全433／422と80合法比較条件・stable owned basisを共有auditで検証。差分説明、typed unavailable全数根拠、性能、最終quality、Task全体のBlocking/Deferred0がclosure gate。profile率から残工数を推定しない。

比較基点は`645a3ee`。検証時HEADは並行する規約更新commit `9a866b7`（Serena設定`600af5c`を含む）＋今回HP差分（未commit）。Serena設定・AGENTS・README変更は保持。quality後は文書・証跡のみを確定し、docs整合性／JSON hash／git diffを確認済み。今回の成功済みHP実行matrixは後続のbeforeとして再利用する。2026-09-19の利用者依頼により本記録とHP実装・検証・証跡を同じcommitへ収録。

以下は2026-09-13時点のNP／charge transfer完了記録（当時のHP未完了記述は上記で更新済み）。

**`b1759b7`基点のU2-D.transfer（304000・1102300・2500400）は実装・検証完了、scoped Blocking0。TSK全体は未完了。** 開始clean。今回の範囲はplayer NP／enemy chargeと1102300の直接併存marker。以下のcount7profile証跡を有効なbeforeとして再利用した。

直接経路は`npTransferNormalization`→typed `npTransfer`／`transferDonor`入力→application scenario・ranking候補→共通preparation transaction→`applyNpTransfer`→後続NP/OC・damage→portable／既存UI。player NPは0.01%単位で`min(snapshot,cost)`を加算し、enemy chargeは整数チャージで`snapshot>=cost`のdonorだけValue2を加算する。両者ともdonor実減少は`min(snapshot,cost)`。receiptでsnapshot、算定gain、receiver実増分、donor実減少・残量を分け、receiver上限で失ったgainをdonorへ返さない。後続transferはdonor resource＋actor位置で同じ残量を読み、sourceの入力key変更でも初期値へ戻さない。

採用済み固定Chaldea commit `9fa75655c07ecd76168b1ccf5b8232e8d64664cf`の処理・呼出元・関連testと全6occurrence/60cellを[source](tsk-06-45-np-transfer-source.json)へ固定した。child Rate1000に加え、対象非alias、空condition/script/関連metadata、専用charge抵抗producer0件を必要条件とする。未知child・専用抵抗・aliasはfail closed。supportのplayer transferはattackerがdonorとなるaliasで拒否し、enemy transferはreceiver gain0を証明できる既存sourceだけ受け入れる。

選択sourceは304000 skill671650/function3957、1102300 skill2678550/function5043、2500400 skill711550/function5043。1102300の併存function23491は、固定参照のtrait readerがValueを読むことと現行attack reader inventoryから、Value0・防御metadata・attack/population/count readerなしの限定proofへ正規化した。damageNpIndividualSumのscalar Targetはtraitでなく読取scopeであり、TargetListと区別する。任意markerの数値化はしない。敵actor自身のcharge操作450箇所はtyped非交差proofへ分離した。未解決enemy charge writer、またはattackerへ投影されたparty NP writerの後ではdonor初期値を再利用せず拒否する。

初期donor入力は味方2枠（0..30000）／敵3枠（0以上の整数）、不在は0。rankingは同じdonorへの全attempted costまでの飽和同値性と、NP到達性・OC/terminal damage不変proofを使う。直接入力reader、損失、未知writer、観測可能なOC差ではbaseline縮約しない。合法な代表tupleと全skill順序を保持し、cap4096は不変。

| profile | 通常NP1／NP2／NP5平均 | NP2候補数（自己あり通常／成立、なし通常／成立） | 残るprofile拒否 |
| --- | --- | --- | --- |
| 304000 | 20,261.525／26,948.855／33,636.195 | 9／96／1／6 | なし |
| 1102300 | 46,127.735／61,503.805／76,879.880 | 5／850／1／10 | なし |
| 2500400 | 43,236.950／57,591.100／71,945.245 | 5／48／1／3 | なし |

通常NP1/2/5・NP2四policyの21条件は全calculatedで、採用scenario・canonical input・rows・候補根拠を[validation](tsk-06-45-np-transfer-validation.json)へ記録した。calculator／ranking／portableの結果は一致。通常の代表はdonor0であり、移送によるOC増加とスキルadmission改善を混同しない。非zero donorと初期OC2の3profileもportable再実行・不正値からの修復後に一致する。

通常calculatorの数値差は3件。304000は同じskillの攻撃50%が有効となりNP1平均26,948.855→40,323.545。1102300はBuster buff1%→21%で77,006.960→92,255.965。2500400は防御ダウン20%がcanonical攻撃項に反映され71,945.240→86,299.405、targetStateにbuffNegativeEffectを追加した。calculator既定相性2とranking等倍は別条件。既存rankingの数値差0件、855 audit identityの追加・欠落0件。差分の完全記録は[delta](tsk-06-45-np-transfer-delta.json)。NP2成立込みでは1102300が岸辺・中立条件によるNP威力80%／powerMod50%で141,459.415、2500400がburn特攻1.5で86,299.405。既存の条件規則と採用scenarioによる値であり、以前拒否された条件との数値差は主張しない。

- forward／completeness: player不足、enemy不足かつ実減少あり・gain0、receiver clamp、複数donor、連続移送、source間の入力key変更を小型fixtureで確認。cost2/3の全入力配置で観測tupleと非単調scoreの最大を保持し、OC閾値と直接input readerが縮約を止める反例を確認。
- recovery: 不正donor量はinputRequired、未知child／binding／専用抵抗／aliasはunsupported／invalidの境界で閉じる。既知のparent失敗はno-op。後続operation失敗ではdonor／receiver／NP／OC／receiptをrollbackし、入力修復後に同じcommandを再実行できる。party NP／enemy chargeの未解決writerを初期値で上書きしない。
- alternate path／UI: calculator/ranking/portableが同じtransactionを使用。E2E-050で3profileの初期量入力→負値拒否→修復→計算→保存→再読込→自動0を確認した。代表input欄とranking/calculator画面を目視確認。VRT5枚はmaster/engine表記と425/8件を更新し、snapshot再生成runを成功gateに数えない。

| 基点比較 | before | after | 解釈 |
| --- | ---: | ---: | --- |
| 通常ranking／calculator | 422/433／420/422 | 425/433／420/422 | 対象3profileを追加。calculatorは既存3件のsource適用を修正 |
| 候補生成／dedup | 6,476／4,023 | 6,500／4,035 | 追加3profileの候補を実行 |
| damage要求／distinct | 2,332／1,431 | 2,351／1,445 | 実測へcounter契約を更新 |
| program／mutation／opaque | 7,255／15,894／54,108 | 7,255／15,927／54,097 | transferと直接markerをtyped operationへ |
| ranking hot path中央値 | 3,715.939ms | 3,542.927ms | -4.66%。同script/hash・Node/CPU・条件、warmup1＋serial3回 |
| production step | 52,140ms | 49,139ms | 21条件と非zero portable修復testを追加。file時間はshared setup／並列実行を含む |

[performance](tsk-06-45-np-transfer-performance.json)に3samples、同条件照合、影響suiteの前後を保存した。処理追加と計時変動の寄与を分離した値ではない。cap4096、timeout、性能ratchetの緩和なし。

最終`pnpm quality`成功: unit802／production124／E2E26、warning・unexpected console・retry0、281.360秒。manifest `.test-results/2026-09-12T20-50-16-144Z-15-170467/manifest.json`、SHA256 `1ed2ea19bc9098648cae4addc56219ce15509d46b3a9233fd6688cdffbbd2b02`。master20260913.16/schema53、engine43.0.0、portable schema40。現行pipeline再生成とpublished masterのhash一致も確認。実装file hash、source join、追加修復test、UI artifactsはvalidationに保持した。

今回の対象3profileに残る拒否理由・未達gateはなし。残ranking8profile（105900、204300、204900×2、403600、405700、705300、2501400）はunsupportedActionAdmission、calculatorは702500・705300がunsupported。HP transfer204300／403600、その他marker／HP／BP、全条件・owned／全体回復/UIとTSK-06.45全体は未完了、06.47はblockedを維持する。次は残profileを既存U2/U3の直接reader/writerへ対応させる。今回の成功before/afterを再検証しない。検証時のGitは`b1759b7`＋今回差分。2026-09-13の利用者依頼で本記録を含むcommitへ収録する。次単位候補のHP transfer（204300・403600）と直接必要なU2-H.2、受入条件はTaskの最新Handoffへ記録した。quality後は文書・証跡だけを更新し、docs整合性・JSON/hash・差分を確認した。

以下は`b1759b7`に収録済みのcount7profile完了証跡。

**`0cf5a36`基点のcount7profile単位は実装・検証完了、scoped Blocking0。TSK全体は未完了。** 開始時clean。基点のquality（unit780/production122/E2E26）と49条件をbeforeとして再利用した。現在の49条件は40 calculated／9 unsupportedから49 calculatedへ改善した。

U3-Qでは空quantityの二重生成を除去し、populationの初期入力を合法性検査後に、全count readerと付与/解除scopeが観測する値で同値化する。スキル順序は削除しない。代表は実在する合法tupleからbaselineとの差が最小のものを選ぶ。上限4096は完全な残存productへ適用する。NPを使う前の到達性・損失・未知writer・input直接readerがある場合は削減せず、共通executionのNP区間とterminal NPのOC依存性でdamage不変が証明できる場合だけ初期populationをbaselineへ縮約する。

| NP2・自己buffあり・成立込み | beforeの完全product | after候補上限 | 判定 |
| --- | ---: | ---: | --- |
| 306200の2profile（各々） | 18,640 | 2,860 | cap内、両NP variantを保持 |
| 502600 | 8,378 | 43 | 対象別function入力を共通実行へ接続。terminal damageはOC非依存 |
| 1001800 | 34,428 | 912 | terminal damageのOC非依存を共通ownerで証明 |
| 2501600 | 4,128 | 2,064 | 空quantityの重複を除去 |

beforeは基点のprogram別dimensionから求めた全productであり、上限到達時の部分和と区別する。NP2四policyと通常NP1/2/5の49記録はすべてcalculated、calculator/ranking/portableで一致。今回のsliceに残る拒否理由はなし。上記IDは証跡の対象指定だけに使う。

502600の直接経路は、pipelineの`populationFunctionNormalization`→typed `populationFunction`（position、removeOne／grant、直前同対象成功／条件trait）→既存preparation transaction→`populationFunctions`の敵別state／receipt→`readPopulationCount`→NP/OC→portable/UI。採用済みChaldea固定commitの`sub_state.dart`は実際に1件以上解除した対象だけ成功とし、`add_state.dart`の負Rateは直前の同対象成功を参照する。2回目の解除が不発でも1回目に付与済みのmarkerは残り、条件付きcounterは該当敵ごとに1個付与される。

初期入力は敵0/1/2それぞれの解除対象になる通常buff数と条件markerの有無。人数は既存の追加敵0..2へ結ぶ。解除数は当該sourceのone-removal回数で飽和する段階入力であり、強化全体の無制限な実個数を推測しない。解除不能・耐性で失敗する分はこの成功可能な対象数に含めない。任意の敵buff一覧・抵抗計算・battle simulatorは追加していない。除去したbuffの残存特性を読む別経路は既存uncertain writeで拒否し、他の未知writerを初期入力で上書きしない。

- forward: 各敵のbuff数0/1/2を同一function列で処理し、対象別成否→marker→count→NP/OCを確認。初期markerの8組合せ×buff数27組合せを独立oracleと照合。remove-allは付与instanceとcanonical trait countも更新し、他の既存付与分は残す。
- recovery: 不在の敵に非zero入力はinputRequired。source途中の未知量・不整合ではpopulation／NP／OC／receiptをrollback。同じcommandを人数修復後に再実行可能。入力定義不足・mixed shapeはmaster schemaで拒否。未知metadata・finite-use・damage modifierの誤取込・循環marker参照はslice全体をfail closedにする。
- alternate path: calculator/ranking/portable、支援source、初期phaseと選択skillが同じtransactionを通る。支援sourceを一律拒否する初期実装の回帰は解消。原子的commit前の別数値fallbackなし。
- completeness: 小型fixtureで全合法人数配置・付与前後のreadが同値keyごとに一致し、独立した非単調scoreの最大値を保持。OC非依存proofはtarget traitのpositive/negative reader、別source、損失、未知writerを削減根拠にしない。productionは全profile inventoryと49条件のparityで役割を分ける。
- UI: 既存E2E-050で敵2の入力→不在による拒否→人数修復→計算→保存→再読込→自動値へ復帰を確認。VRT5枚はDB/engine表記と422/11件表示の変更を確認し更新。snapshot再生成runはconsole観測があるため成功gateに数えない。

原因と検出差分: 空のquantity候補がkeyの違いで2件になり、populationは読取結果が同じ人数配置まで直積化されていた。従来の通常NP1条件は容量でpopulationが縮約され、この組合せを検出できなかった。また対象単位の解除成否を持たず、負Rateの後続付与・条件付きcohort writerを接続できなかった。今回、初期入力／対象別receipt／集約countの責務を分離し、同じfamilyの通常・支援・rollback・未知writer・schema不正へfixtureを追加した。

全件の現在値はranking422/433、calculator420/422。基点と一致するcalculator/rankingの855件のaudit identityに追加・欠落はなく、既存calculatedの数値差は0件。通常rankingの新規502600はNP1/2/5平均17,308.290／21,635.495／25,962.700。canonical inputはATK8,616＋Fou1,000、Buster buff45%、classAttackRate0.9、相性1、OC1、defensePiercing。初期解除数・marker0の代表ではcount由来のNP加算も0だが、共通skill経路の拒否を解消したことで計算可能になる。非zero入力のcountは共通transactionで処理し、OC非依存のterminal damageと区別する。

新たに成立込みで計算可能になったNP2のcanonical inputと規則:

| profile | NP2平均 | 最大候補の主要input／適用規則 |
| --- | ---: | --- |
| 306200／NP306204 | 115,903.455 | 初期individuality count3・追加味方1→OC2、NP威力30%、dragon宝具特攻1.5 |
| 306200／NP306201 | 102,529.915 | 同じcount/人数→OC2、NP威力15%、dragon宝具特攻1.5 |
| 502600 | 21,635.495 | 上記defensePiercing、Buster45%。OCによるterminal damage変化なし |
| 1001800 | 165,854.365 | canonical classAffinity2、攻撃50%、Quick50%、powerMod105%、sakuraSeries対象。選択scenarioの既存規則であり新しいclass規則ではない |
| 2501600 | 162,299.965 | 攻撃20%、Buster36%、NP威力10%、powerMod60%、lawfulGood/servant宝具特攻2 |

旧policy記録には数値列がないため、以前拒否された条件の最大値との数値差は主張しない。合法候補の保持は同値性proofと全列挙の小型反例で確認し、全49条件の現在のcanonical input・rows・plan・policy選択根拠を[validation](tsk-06-45-population-count-validation.json)へ保存した。通常全件damage差、9件のoutcome改善、基点の完全product dimensionは[delta](tsk-06-45-population-count-delta.json)に保持する。

| 基点比較 | before | after | 解釈 |
| --- | ---: | ---: | --- |
| default候補生成／dedup | 6,467／4,018 | 6,476／4,023 | 新規502600のdefault候補を実行。成立込み5profileの上限解消とは別条件 |
| damage要求／distinct | 2,321／1,430 | 2,332／1,431 | 対応1profileの増加。runtime counter期待値を実測へ更新 |
| program／mutation／opaque | 7,255／15,894／54,108 | 7,255／15,894／54,108 | 総数不変。対象別操作の表現変更に合わせdigestを更新 |
| ranking hot path中央値 | 3,429.159ms | 3,715.939ms | +8.36%。同script/hash・Node/CPU・条件、warmup1回＋serial3回。新規処理と計時変動の寄与は分離していない |
| production step | 38,663ms | 52,140ms | +34.86%。7profile受入testは4,305.6→32,108.5ms。旧拒否候補の全探索と四policyのcalculator/portable replayを追加 |

[performance](tsk-06-45-population-count-performance.json)には基点計測、3samples、影響suiteの前後も保持した。suite内並列実行とshared setupを含むfile時間を単独処理の時間と解釈しない。cap4096、timeout、性能ratchetの緩和はない。

最終`pnpm quality`はunit790／production122／E2E26、warning・unexpected console・retry0、273.759秒で成功。manifestは`.test-results/2026-09-12T19-46-29-367Z-46-6620ae/manifest.json`、SHA256 `77d06a907a9040c14a3b9e5a52247c74d01f0aba1fcc3eb398714fa6f2f7e3c6`。application audit digestは`ba4d2186e3e1be6233625d157acfd6b05a5d67f9f6ee446b2a6c0ec66c1f521d`。master20260913.12/schema52、engine42.0.0、portable schema40（保存shape不変）。quality後は文書・証跡だけを更新し、docs整合性・差分・JSON/hash照合を通した（docsは既存format除外対象）。

このcount単位の未達gateはなし。検証時のGitは`0cf5a36`＋dirty。2026-09-13の利用者依頼で、この記録を含むcommitへ実装/test/VRT/証跡を収録する。次回は残ranking11／calculator2件を既存U2-D.transfer・marker/admission・HP/BPのreader/writerへ対応させ、必要な参照契約から始める。同じbefore/qualityを再実行しない。全条件/owned・全体回復/UIを含むTSK-06.45全体はin_progress、06.47はblockedを維持する。

以下は`dc87dc1`までの完了済み証跡と採用契約。

**参考実装の採用（2026-09-13利用者承認、現在の判断）**。
Chaldeaの該当実装を参考仕様としてTSK-06.45の未確定resource処理を閉じる。
固定commitは`9fa75655c07ecd76168b1ccf5b8232e8d64664cf`（今回確認したmainと一致）。
実装本体・呼出元・関連testを既存IR/executionへ対応させ、同じ規則を一から導き直さない。
これは比較対象として眺めるだけの扱いを変更する採用判断であり、ゲーム実測済みとする主張ではない。
HP/BP/count/transferの既存判別例は参照契約の回帰fixtureへ使い、実測は追加検証として扱う。
FGO Labの製品範囲・canonical ownership・入力fail-closed・共通transaction・parityは維持する。
参照元のbattle UI/delegateや任意の戦闘simulationを移植せず、該当する規則を接続する。

HP3件の該当source・SHA256・関数位置・採用式を[既存HP証跡](tsk-06-45-hp-observation-gates.json)の
referenceContractへ記録し、statusを`observationRequired`から`referenceSpecified`へ変更した。
従来のraw/判別入力/予測は保持し、観測不足の記録をhistoricalObservationRequirementへ分離。

| HP契約 | 今回固定した規則 | 残る作業 |
| --- | --- | --- |
| 最大HP | `postAddStateProcessing`は増減量を現在HPにも適用し、生存中の非致死減少は下限1。通常maxhp解除はcurrentを回復せず再計算maxへclamp。baseHp解除の別減算は混同しない | 最大値instance・form・失敗時rollbackを既存stateへ接続 |
| 回復 | `gainHP`はdoubleで基礎量→受回復補正→与回復補正→末尾で整数化。3000/1300/1000はclamp前3900。回復禁止/死亡/最大HP制約も同経路へ接続 | all cell・modifier・recipientと回復outcomeの検証 |
| HP比率 | buff条件/値式はownerのHP比率を整数permille化。NPのHP依存係数は整数permilleを経由せずHP/maxから計算し係数を整数化。表示丸めとは分離 | 各owner/clockのqueryと既存damage式へ接続 |

最大HP減少5000/10000→3000/8000はChaldea準拠として採用する。旧clamp-onlyの分析記述との相違は
解消済み実測と偽らず証跡に残すが、この採用判断後に同じ実測待ちを開始gateへ戻さない。
同様に、下記や過去deltaの「比較実装を採用しない」「数値の実測必須」「HP3件観測待ち」は
現在の停止条件として失効する。U0-H全family/HP実行の完了やTaskのBlocking0を意味しない。
他のcount/actor lifecycleやBP/transferも該当するChaldea処理から具体化し、参照元にない部分と
明示要件との矛盾だけを限定した技術課題として残す。未対応入力を参照元のdefaultで補完しない。


**今回完了した実装単位（2026-09-13）**。開始時HEAD `83b4db2`、clean treeを確認。
攻撃NPの1000900/3392と1101600/21113、および後者の2253450/20955を同じ単位で接続した。
今回の実装・証跡は、本記録を含む実装commitへ収録する。master `20260913.05` / master schema50 / portable schema40 / engine40.0.0。
productionの最終対応数はranking415/433（+2）、calculator420/422（不変）。
最終quality・性能・差分証跡を確認し、今回単位のscoped Blockingは0。TSK-06.45全体はin_progressを維持する。

| 経路／責務 | 実装と反証 | 証拠 |
| --- | --- | --- |
| raw callback→canonical identity | 参照skill991687/964555/970408のbuff.valsを使い、addIndividualityのValueをbuff identityにしない。成長系の物理上限10は全grantの明示SameBuffLimitが一致するときだけ採用。未指定・矛盾するwriterから上限を推測しない | `npCountNormalization.test.ts`、[固定参照契約](tsk-06-45-np-count-source.json) |
| 入力→同一instance state | 旧buffInstanceCountを廃止し、既存effectStackCount/keyへinstanceTraitsを束縛。attacker/targetを別identityでseed。別名の矛盾入力・曖昧signatureは拒否 | `buffInstances.test.ts`、`stackPreparationSupport.test.ts` |
| recipient／live read | NP増加はrecipientのactive instanceのみ、stack量式と付与上限は常時buffも含めて読む。actor固有traitや別recipientを加算しない。付与・remove-allの直後にstack/state表示を投影 | `buffInstances.test.ts`、`resourceQueries.test.ts` |
| ordered execution→commit | NP/OC transactionがstack/state/instanceを一括返却し、skill/transform/attack reducerは確定stateをcommitする。古いstructural stackで上書きする経路を解消 | `preparationTransaction.test.ts`、`stackPreparationSupport.test.ts` |
| selected source／後続実行 | sourceSelfの支援stackを攻撃役へ転用せず、対象からの除外とunsupportedを区別。20955はcommandCardAttack限定のcritical callbackとして正規化しNPではscope外。1000900の後続skill2082450/8808は同じgrowth cap10で有限入力を構成 | `executionSemanticsProduction.test.ts`、`productionExecutionParity.test.ts` |
| 結果→修正／rollback／portable | 範囲外初期countはinputRequired、修正可能な定義を返す。失敗commandのNP/OC/instance/receiptをrollbackしretry。保存再読込・resetを同じcommandで再実行 | 小型fixture、production parity、E2E-050 |
| ranking完全性 | bound instance countは全整数を列挙し、stack単調性の近道を使わない。対象2profileのNP1/2/5×4policyをcalculator/portableへreplay。NP2 conditionalで全count×全skill順列の独立oracleと照合 | `productionExecutionParity.test.ts`、`stackPreparationSupport.test.ts` |

**before/after証跡**。[差分と24件の受入記録](tsk-06-45-attack-buff-count-delta.json)は
`ab5d77d`の保存済み全件auditから比較し、normalization execution差62件と選択program/input/NP1〜5 damageを保持する。
master20260913.05は初期stackとamount readerの両方へinstance identityを保持する。
増殖の初期入力上限10は明示された物理cap。原稿完成の上限30は最大NP容量30000÷最小係数1000の飽和同値境界で、物理capではない。
対象の後続stack量式の上限とremove-allを含め、30を超える初期数が追加の結果を作らない範囲を全整数候補にする。
複数のstack源に上限未指定の量式はこの推定へ広げず、unsupportedを維持する。

| 観測 | before | after | 理由 |
| --- | ---: | ---: | --- |
| ranking計算可能 | 413/433 | 415/433 | 対象2profileのsource・variant・後続実行を解消 |
| calculator計算可能 | 420/422 | 420/422 | 既存のHP/BP拒否は不変 |
| default calculator 1101600 NP1平均 | 69,362.240 | 83,234.795 | skill2255550のcount処理を実行可能にしたことで、同skill/function254のNP威力20%が適用。初期count0のNP加算は0のまま |
| 新ranking default NP1平均 | 順位外 | 1000900:26,497.825 / 1101600:41,617.150 | Lv自然上限・等倍・自己buffあり・通常条件・初期OC1。calculator標準との相性条件の違いを混同しない |
| 全preparation生成／dedup | 6,403 / 3,986 | 6,419 / 3,994 | 対象2profileの合法順序を追加。候補cap・timeout緩和なし |
| damage要求／distinct | 2,211 / 1,397 | 2,232 / 1,404 | 新profileの候補を共通damage cacheへ追加 |
| resource program／mutation／opaque | 7,255 / 15,795 / 54,037 | 7,255 / 15,817 / 54,059 | 静的program母集団は不変。countのmutationとstack readerのinstance依存を監査。opaque総数は未対応profile数とは別 |
| production suite wall time | 41.261s（120 tests） | 41.362s（121 tests、+0.24%） | 対象2profileの24ケース・独立oracle・portable回復のproduction testを追加。master read/parse/compileは各1回を維持 |
| ranking hot path median | 3,519.66ms | 3,416.76ms（−2.92%） | 同じ固定script、warm-up1＋serial3、同CPU/Node・条件で比較 |

性能beforeは前単位の保持済み[final](tsk-06-45-resource-final.json)、今回afterは
[attack buff count final](tsk-06-45-attack-buff-count-final.json)。中間計測を復元・baseline化しない。
既存calculatedの数値差は上記calculator1件のみ。新ranking2件と、NP2×4policyのうち
conditional includedの全整数×全skill順列oracleを差分artifactのacceptanceへ保持する。
同条件のNP2平均は1000900がcount10→消費後live0・OC2で86,274.555、1101600がcount10→live0・OC2で116,024.425。

**最終検証と引継ぎ**。

- `pnpm quality`成功: `.test-results/2026-09-12T16-51-55-415Z-16-b067b5/manifest.json`。unit766 / production121 / Playwright26、skip/todo/retry/flaky/warning/unexpected console 0。format・lint・typecheck・runner・docs・master・buildを含む全gate成功。duration259.410s。
- quality manifest SHA256: `efd46caea0f41b9a16e356773ae2d11b40033c478d78b58007733c0785a1e6ef`。
- application audit digest: `63f93e477f2479aa2031c7d22ca2ce4eb0e865d370c0338ddd737c934067ecaf`。同runの`production/production-audit-calculation-application.json`と`attack-buff-count-acceptance.json`を差分artifactへ参照・保持。
- published master SHA256: `19636a8949e610eb7bf4c0ec67661a8b5ca0f8a15c22e1e1819fb6f2e92faf4c`。差分artifact SHA256: `4df74ef379f97c86bf7bf9f6f439451ac577732128c61f0f51204a021c61ea59`。性能final SHA256: `c2dbedcf1fc3efe9837a011426b48230b9cc41872e0a4c2224927a107593770e`。
- `git diff --binary HEAD -- apps packages data/raw e2e scripts`のSHA256: `48bae411f5aebbdac6e26aee8b7f2bc3487661e73f7ec6aecb4878efff9091f5`。検証時点はHEAD `83b4db2`＋未コミット差分。利用者のコミット依頼により、新規evidence JSON2件とTask/flowを含め、本記録を含む実装commitへ収録する。開始時cleanで、既存利用者変更の上書きなし。検証後の変更はコミット状態を明確にする文書更新のみ。
- VRT5枚はmaster/engine表記と415/18件表示を更新し、desktop/list/detail・mobileを確認。snapshot再生成runのconsole記録は成功gateに使わず、最終qualityの通常比較でunexpected console 0を確認した。
- 検証過程で、後段commitが古いstack値を戻す問題、修正可能な入力のunsupported分類、拒否画面の入力UI、支援recipientへの旧stack制約を修正。支援sourceSelfの23559もcanonical routeのonMissing:ignoreに従って対象外とし、未対応へ誤分類しない。raw format、型、追加E2E観測、全件digest/counterの期待値も修正して最終gateへ反映した。候補capやtimeoutの緩和はない。
- 今回単位の未達gateはなし。次は既存U2-D.countのtarget/individual count、transferへ進む。開始操作はこの残18分類と[固定参照契約](tsk-06-45-np-count-source.json)の該当関数を既存U表へ対応させること。今回の全件監査・成功gateを開始時に繰り返さない。HP/BP、marker/admission、全条件/ownedと全体の回復/UI・Task gateは未完了。

以下の開始時の2profileと直接接続先は83b4db2時点の証拠として保持する。
現在の残18profileはmarker6 / target count3 / individual count4 / player NP transfer3 / HP transfer2。
calculatorのHP/BP各1件、全条件/owned、残る量式・admission・全Task gateは未完了。

**前回から閉じた範囲**。ranking411→413/433、calculator420/422不変。
改善2profileはactor trait付与からNP条件への接続。count共通state/transaction/回復は限定接続済みだが、
新規正規化2種は非攻撃NPに属し、残る攻撃NPのbuff count2profileは未対応である。
HP3件は前sessionでobservationRequiredだったが、今回の採用方針に基づき上記referenceSpecifiedへ更新済み。
性能/差分/HP判別入力はtracked artifactへ移り、消失した旧/tmp一式を次sessionで復元する必要はない。

**今回照合した証拠**。

- 最終quality manifestは下記実装deltaのSHA256と一致し、success、unit762/production120/Playwright26を確認。manifestは07ddfe1＋dirtyの実装時記録である。
- 当時trackedだった`apps packages scripts e2e`の差分を`git diff --binary --diff-filter=M 07ddfe1 ab5d77d -- apps packages scripts e2e`で照合し、下記`1547f4b...`と一致。新runtime2fileとpublished masterも記録済みhashに一致。今回qualityを再実行したという意味ではない。
- 最終qualityの`production/production-audit-calculation-application.json`はSHA256 `1e954fbe9bceef1207bd66e93cad9738ca5f7b3241d73ca55c8d7bc0d53c913c`。tracked [count execution delta](tsk-06-45-count-execution-delta.json)のafterと一致し、残ranking20profileとcalculator2件を確認。
- calculatorの残りは702500のHP `resourceStateUnavailable`と705300のBP `resourceStateUnavailable`。ranking20件の保存outcomeはすべて`unsupportedActionAdmission`であり、これだけから下流の実行成功を予測しない。

**残18profileの現在の分類**。前回の失敗identityと選択sourceのjoinを継承し、今回の全件実行でbuff count2件の解消と他18件の拒否維持を確認した。
下表は主な量式・markerによる重複なしの進行管理分類で、6＋3＋4＋3＋2＝18。
選択source中のoperationがすべてそのまま最終的なadmission拒否原因だとは断定しない。

| 主分類 | profile数 | 証拠上のactor（同actorの別profileを含む） | 併存事項／担当単位 |
| --- | ---: | --- | --- |
| marker/contextReference | 6 | 105900、204900×2、405700、705300、2501400 | U1-R/U3-A。705300はBP実stateも不足、2501400はaddStateShortのoperationSemanticsも併存 |
| target count | 3 | 106200、306000、1001800 | U2-D.count。gainNpTargetSumの対象人数とrecipientを分離 |
| individual count | 4 | 306200×2、502600、2501600 | U2-D.count。gainNpIndividualSum、502600はcontextReferenceも併存 |
| player NP transfer | 3 | 304000、1102300、2500400 | U2-D.transfer。1102300はcontextReferenceも併存 |
| HP transfer | 2 | 204300、403600 | U2-D.transfer＋HP実state/生存の接続。数値契約はChaldea準拠を採用済み |

この18profileはdefaultの入口拒否であり、現在calculatedのHP/BP未接続や全条件の不足を含む残作業総数ではない。
終了までの作業量を「あと18行」や単純な対応率で見積もらない。既存U1〜U5の完了条件は維持する。

**今回閉じた実経路の開始証拠（83b4db2）**。
以下は着手時の不足と直接接続先である。現在の実装・受入結果は上のmatrixと差分artifactを参照する。

- 1000900/skill575350/function3392はcanonicalで`gainNpBuffIndividualSum`→`dependentResourceAmount`のまま。
- 1101600/skill2255550/function21113も同量式で未対応、routeはpartyMember。加えてskill2253450/function20955は`addStateShort`→`operationSemantics`のまま。この併存を最初から検証範囲へ入れる。
- `targetStateNormalization`のcountedBuffDefinitionsはbuff.vals由来のsignatureが一意な場合だけ発行。`npCountNormalization.normalizeNpBuffCount`はそのdefinitionを必須とし、単一正selector等へ限定。callback由来signatureを含む不足根拠は前回deltaの次actionを継承し、今回取得済みとしない。
- `buffInstances.seedBuffInstances`と`countBuffInstances`は初期attacker入力・attacker readの契約。recipient別readと既存stack入力の同一state束縛は、単にnormalizerの拒否を外す前に閉じる責務である。

IDは監査上の対象指定であり、runtime分岐やそのprofileだけの数値補完を許可しない。
上記は接続責務と未達の特定であって、具体的なschema変更案の承認や全対象の正しさの証明ではない。
順序と単位終了条件は[TSK-06.45](../tasks/development-redesign-tasks.md#tsk-0645-all-attack-np-execution-closure)へ集約。
今回、併存理由と後続実行を含む2件の改善を確認した。これを他familyや全Taskの完了へ一般化しない。

**進行管理上の修正**。
前回の指示はHP非依存のcount familyを選んだが、攻撃NP実データの終了対象が十分に固定されておらず、
限定共通処理の検証を終えても当該count残件は減らなかった。これはTask完了の虚偽申告ではないが、
次はproductionの受入対象と同じ原因の直接writer/readerを開始時に結ぶ必要がある。
Taskに残っていた「HPを30分調査」「未コミット」と、count/BPの二択を現在の指示から除いた。
HP実測の取得を実装開始条件とする整理は、上記の参考実装採用で置き換えた。観測結果の回答を待たず、採用契約の実装・検証へ進める。Task全体の完了には既存U1〜U5の接続・全production・回復・性能gateが必要。

今回の文書検証: `pnpm test:docs`6件・docs integrityと`git diff --check`成功。変更した参照先と表の書式を確認（docsは既存Prettier除外）。runtime/master/test変更なし。文書・証跡のみを利用者依頼のフォローアップcommitへ収録。今回quality・production・性能の再実行はない。
以下は検証時点の実装記録。dirty/untracked・未コミット表記はab5d77dへの収録前を指す。

**2026-09-12実装delta（最終checkpoint、TSK-06.45は未完了）**。開始`07ddfe1`、
Task/flowの既存dirtyを保持。60分checkpoint後も同じcount familyを検証し、90分境界では
新familyを開始せず、開始済みの最終qualityと証跡更新を終えた。stage/commitは未実施。

**変更と利用者結果**。

- actor traitの付与をrawの実consumerへjoinし、106400/605100のranking2profileを回復。
  calculatorは420/422のまま、rankingは411/433→413/433。calculatorの数値差分は605100のみ。
  skill22990のtraitId10006付与→NP23002の条件付きattackBuff300permilleが根拠であり、
  runtimeのservant ID分岐ではない。全156正規化差分・before/after inputは
  [count execution delta](tsk-06-45-count-execution-delta.json)と再生成scriptで再照合できる。
- U2-D.countの一律拒否を削除し、初期stack→付与/解除→live count条件→NP/OCを接続。
  attacker/target/field、nested条件、同じcommand内のwrite/read、変身NPの消費後readを検証した。
  buff自身のtrait identityをactor特性と分離し、共通transactionにinstanceと計数量を保持する。
  source実行失敗は全draftを戻し、retry・portable edit・旧engineからのupgradeはfresh実行へ戻す。
- 新しいbuff count正規化は単一正selector・一意な通常buff signatureの2種に限定。
  2500600/function6008と2800300/function9138はいずれも非攻撃NPのservantであり、
  **攻撃NPの2行改善は上記actor trait接続によるもの**。count側のapplication縦断はsemantic fixtureで検証。
  1000900/1101600のbuff count、individual/target count、対象横断状態は未接続で、U2-D全体は完了としない。
  共通traitによる解除もcount readerのinstance signatureへjoinし、OC候補から必要な先行操作を落とさない。
- typed read descriptorとshared resource auditにlive instance read/writeを保持。
  未束縛source、曖昧な初期alias、未知の移動、有限使用回数・特殊identity・解除数などは更新前に拒否。
  scalar inputをlive countの代用品にせず、未対応のcount条件/値式の組合せはschemaで拒否する。
  比較実装のURL/commit/hashと解釈は[np count source](tsk-06-45-np-count-source.json)。ゲーム実測の主張ではない。

**検証と差分識別**。

- 最終`pnpm quality`成功: `.test-results/2026-09-12T14-52-25-845Z-15-bb6d1d/manifest.json`。
  unit762 / production120 / Playwright26成功、skip/retry/警告/予期しないconsoleは0、262.54秒。
  manifest SHA256 `5ca9d75175214a85d39a0de9ef8cfa72de443a7e688772c97b9dd457de341b5a`。
  この成功後にVitest・production・master・build・E2Eを追加実行しない。
  最終checkpoint更新後の`pnpm test:docs`と`git diff --check`も成功。Task抽出器が証跡path中の
  `Z`を終端と誤認するため、Task本文はこのcheckpointへの参照とし、正確なpathはここに保持した。
- 四policy/NP1,2,5とowned NP2のcalculator parity、NP2の全整数0..6×skill順序の独立最大値比較、
  count→NP→OC、normal/LB/OC cell、未知metadata、rollback/retry、transform/portable upgradeを含む。
  全masterの全条件・owned組合せを通過済みという意味ではない。
- 実workerのsummary→detail→calculator handoffと失敗/reset経路はE2E-050。
  5枚の画像baseline差分は版表示とranking件数のみと画像で確認した。閾値は変更していない。
  途中qualityの失敗はlint、候補数counter期待値、版表示/件数の旧baselineによるもの。
  画像再生成runのconsole検出は再生成専用commandの出力で、最終通常runでは0。
- 現行master `20260912.05`、master schema49、保存scenario schema39、engine39.0.0。
  master SHA256 `aae6b687294761efd37aadf59255e93433879d9bfa5082a86a3a5e503ad536af`。
  shared application digest `e52da590e30e0eb762b739c2fe5f7462483adcfcb7947522c548b4c7f507e9d5`。
  resource programs7255 / mutations15795 / opaque54037、digest
  `830e4f83cdd16e0cacdae8d16d2d9ed3955b064ac4403e7e1702335bc83b1a80`。
- `git diff --binary -- apps packages scripts e2e`のSHA256は
  `1547f4b52842e29cc7af076e4db9541cc719deee5cf30d75fa9de17c00f7daa7`（untrackedを含まない）。
  新runtimeファイル`buffInstances.ts`は`af9bf18b0819975cb01ba7f899919bdced8ea2068e2245ff87678a2f70284b62`、
  `npCountNormalization.ts`は`5a5853509cae81b366716f831048450b2b3e00ba47341e322bcfbc1f3bca311a`。
  新test2本・再照合/計測script2本・JSON証跡もuntrackedのまま保持。Git差分と併せて扱う。
- 最終性能は[before](tsk-06-45-resource-before.json)と[final](tsk-06-45-resource-final.json)。
  同じwarmup1＋serial3回のdefault rankingでmedian3571.93→3519.66ms（約1.5%減）。
  中間3610.18ms（旧master20260912.04）は最終比較に使わないため、2026-09-13のフォローアップでGit-onlyへ整理。
  復元は`git show ab5d77d:docs/evidence/tsk-06-45-resource-after.json`、SHA256 `ef8ebd8931b85ffeff8a80a7c1448f644d0d8d1f4fc062b749d8108aca8552d6`。before/finalと計測scriptは保持。script hash差はformatterによるもの。
  generated6382→6403、deduplicated3966→3986、damage request2190→2211、distinct1385→1397。
  terminal plans3453・calculator母集団422は同数。exact counterは説明済み増分へ更新し、
  planner上限4096、timeout、最大積3840のratchetを緩和していない。tsxのDEP0205は外部計測runnerの出力。

**実装終了時の未達条件（履歴）**。
HP/BP、未対応count・transfer、program-bound admission、全対象条件・ownedの候補完全性/回復・UIが残った。
当時は攻撃NP buff countまたはBPを次候補としていた。現在の優先順位は本checkpoint冒頭とTaskへ更新済み。
HP観測依頼は実装終了時点では未取得で、以下の判別入力とstatusを保持する。

HP限定調査は開始から30分以内に3件とも`observationRequired`と判定した。
`tsk-06-45-hp-observation-gates.json`はraw hash・該当cell・不足観測を保持する。
回復はアルテラのfunction440/Lv10とカルデアの顕学の受回復30% cellを同時に使える入力へ絞った。
欠損HP>3900、他modifierなしで、使用前後の実HP差3899/3900を観測する必要がある。
HP比率は土方Lv90のmaster12028＋固定フォウ1000＝13028へ具体化し、正HP1と表示0%を分離する。
新たな実HP測定は取得できず、比較実装・float32算術を正解値として採用していない。
最大HPは負傷時の減少と解除を別々に観測する必要がある。3件のBlockingは継続。

before hot pathは消失scriptと同条件を証明できないため、永続する
`scripts/measure-ranking-resources.ts`で新規取得した。`tsk-06-45-resource-before.json`にscript/master/hash、
環境、全3回、結果digestを保持。中央値3571.93ms、411rows/22exclusions。
外部tsx runnerのDEP0205 warningはproduct suiteとは区別する。

**前回フォローアップの成果と範囲**。当時の利用者依頼は前sessionの現状整理と進行の立て直し。実装や追加のゲーム規則調査は開始していない。
基点`c167e63`→現在`07ddfe1`のcommit差分は文書・指示だけ。開始時の未コミット変更はTaskと本flowで、保持して現状記録を修正した。
TSK-06.45はin_progress、06.47はblocked。全Taskの完了と、今回のフォローアップの完了は別判定。

**前sessionの経過と停滞要因**。
session `01a081fb-ff44-7f33-873b-2655e583d589`の利用者メッセージ8件と完了イベントをread-onlyで確認。
当初は06.45完遂の依頼だったが、途中で「実装できる手前まで」「根拠を埋める」「調査を続けて」に絞られた。
最後の調査はusage limitで中断した記録がある。履歴の開始〜終了は約7時間33分だが待機を含み、連続作業時間とは扱わない。
進行が見えにくくなった要因は次の3点。

- HP数値の未確定3件、採用済みのBP/transfer設計、実装後に検証すべき候補積が「全体の実装開始条件」に混在していた。Taskの古い冒頭/Handoffは、詳細deltaで採用済みのowner/clock・transfer順序まで未確定としていた。
- 文書変更にfull qualityを2回実行した記録はあるが、数値根拠や実装接続は進まない。2 runは257.98秒と287.99秒で、これだけを長期化全体の原因とは断定しない。現行READMEに従い、今回は文書検証に限定する。
- 根拠探索の次actionはあっても取得できない場合の報告境界が弱く、補助証拠が`/tmp`に依存していた。次回はTaskに定めたU0-Hの限定判定と必要な証拠の復元を行う。

**現在の意味論判定**。
D1〜D8、初期0%の死亡、対象別段階intent、owner/clock、BPの特性→capacity→point clamp、
現行disjoint/非反応型transferの順序同値性と未知childのmutation前拒否は採用済み。
これらの設計判断を再承認待ちへ戻さない。残るゲーム数値のBlockingはU0-Hの次の3件。

| 未確定事項 | 既存の判別入力／閉じる根拠 | 影響 |
| --- | --- | --- |
| 最大HP変更・解除 | current5000/max10000→max−2000の5000/8000対3000/8000。負傷時と解除時を識別する仕様・実HP観測 | U2-Hの最大値instance・current clamp |
| 回復量の丸め・演算順 | 基礎3000×受回復130%の3899対3900。合法なsource組合せと実HP差を確認。表示値や任意値直積だけで確定しない | HP gain・modifier・HP transfer依存 |
| HP条件・値式・NP倍率の比率 | 閾値直前直後、HP1/11000、grant→heal→use。各readerの整数化位置を区別 | HP query・倍率・生存判定との分離 |

上記は既存deltaの未解消点の整理であり、新たなゲーム挙動の発見ではない。
BP/count/NP・charge transferの実装をすべてHP数値へ依存させない。全program候補積、縦断回復、
admission、全profile/全条件/parity/性能はU1〜U5の未実装・未検証であり、設計済みを理由にVerifiedへ変えない。

**確認できる証拠と不足**。

- `.test-results/2026-09-08T17-08-47-403Z-15-960a41/manifest.json`はc167e63・clean、production24 files/120 tests成功、44.316秒。隣接する`production-audit-calculation-application.json`を今回読み、calculator420/422（unsupported2）、ranking411/433、4742 records、7255 resource programsを確認した。
- 同auditのmaster版`20260908.05`、schema39、engine38.0.0、digest `4f9ce3ac112099ad2bd706fb90add87bdac32d585c5deacdc10f911bd5a0eaa8`を保持。これはcurrent-defaultの保存済みinventoryであり、現在実行した全条件parityではない。
- qualityの`.test-results/2026-09-08T17-25-15-055Z-45-eecbae/manifest.json`と`.test-results/2026-09-08T18-28-40-345Z-15-f2b01a/manifest.json`は現存し、success・c167e63・dirtyを確認。今回の文書差分や未実装HPの検証結果へ転用しない。
- c167e63再開deltaが明記する`/tmp`の11 pathはすべて消失。admission/raw join、BP partition、raw/gate evidence、numeric probe、performance script/before JSONが含まれる。22 profile/36 occurrence、60 cells、14,080状態、hot path中央値3807.27msは前sessionの記録として保持するが、その補助出力を今回再照合できたとは主張しない。
- 復元は必要な元command/scriptから行い、完全な出力を回収できないものだけ限定再取得する。現在残るproduction artifactを捨てて全監査をやり直さない。性能比較の実行時はscript・環境の一致を確認し、同条件を再現できなければbeforeを取り直す。

**次の操作と未達条件**。順序と終了判定は[Taskの進行管理](../tasks/development-redesign-tasks.md#tsk-0645-all-attack-np-execution-closure)に集約。
次はU0-Hの3件について必要な観測を限定し、根拠取得／未取得を個別に判定する。今回の整理で追加の実装権限を求めない。
HP縦断接続、全22 exclusionsの解消、80条件・owned・parity・回復・after性能・最終quality/Blocking0は未達。
文書検証: `pnpm test:docs`6 testsとdocs integrity成功、`git diff --check`成功。参照先と表の書式を確認（docsは既存Prettier除外）。runtime/test/master/schemaの変更なし、stage/commitなし。今回のfull quality・production・性能測定は実行していない。

前回c167e63までの継承証拠（今回の実行結果ではない）:
前回のatomic単位はU1-R read descriptor/consumerと
U0-R partial observer、U3-A NP不足/容量不足の共通unavailable、付随するU4旧版回復/UI。
初期0%は死亡と要件v1.2.4へ反映済みだが、HP live state/死亡guardは未実装。
変更family: condition frame・source input owner・actor/domain/resource query、preparation rejectionの結果分類。
検証済み: focused82（`.test-results/2026-09-08T16-31-27-772Z-45-25ec57`）、
unit750（`.test-results/2026-09-08T16-32-00-799Z-15-83b60f`、10.05秒、warning0）。
最終owner contextでranking3955.38/3820.06/3633.72ms、中央値3820.06ms（before比-5.60%）、411/22、
result digest `d1518753515101166ca89d9e6f76cde3067cb2bf8f80ebff6dee3dfbee410071`。
前回qualityはunit/productionまで成功し、engine版表示だけのVRT3件で失敗。
画像を目視確認して該当3枚だけ更新した。更新実行のconsole出力によるcontract failureも成功へ数えない。
上記単位の`pnpm quality`成功（`.test-results/2026-09-08T16-33-54-106Z-15-46445f`、301.53秒、
unit750/production120/Playwright26、skip/retry/warning/unexpected console 0）。
追記: U0-H初期basis合計のsafe integer検査を実装。focused20
（`.test-results/2026-09-08T16-43-34-923Z-45-a8f922`）、unit753
（`.test-results/2026-09-08T16-46-00-585Z-16-13e712`、11.02秒）成功。
最終gate成功: `.test-results/2026-09-08T16-49-23-896Z-15-92800f`、316.12秒、
unit753/production120/Playwright26、skip/todo/retry/warning/unexpected console 0。
production子suite47.60秒（before42.46秒、直前quality44.27秒）。hot path最終中央値は上記3820.06ms、
候補数・結果不変。今回追加の定数個の整数検査について別hot path再測定はN/A: 探索構造変更なし。
前回の次actionはU1-R clock/receiptとU2-Hの接続だった。再開時の調査で必要な縦断境界を
上記c167e63 deltaへ更新した。前回のquality成功を今回未実装のHP/BP/count/transfer証拠へ転用しない。

### U1-R実装中の設計再確認: 不明conditionと物理resourceの範囲

prototype shared auditでcalculator unsupported2→6、ranking22→23を検出した。
基点77be416の同一master production artifactと比較し`introducedByChange`と分類。
比較条件のmaster/lock/toolchain差なし（full production対同一audit focused実行）。
原因は全unsupported conditionを全resource readerへ投影したこと。`operationCompiler.compileEffectCondition`の
unresolvedRecipientはtrait／targetPredicateのactor解決失敗であり、HP/NP/BP/starsの量readではない。
失敗conditionの意味を失わずopaqueへ保持しながら、潜在resource集合を明示する設計へ改める。
`unresolvedPreparationWrite`は元のreadDependencyを保持し、HP書込由来とtrait/stack由来を区別する。
検出漏れはreadabilityとtruthの分離だけでunknownの**物理範囲**を分離しなかった点。
再発範囲はnested boolean、unknown trait対unknown HP、evidence-only projection、通常resource suffix、OC。
最小guardrailは非量unknownのopaque保持／量unknownのreader保持を同fixtureで検証し、全production差分を確認する。
旧期待値へ戻すためのprofile例外やunknownの一律無視は行わない。

### U1-Rのcompiled input境界の補完

read descriptorのconsumer確認で、`operationReadsResource`がcondition側へinputDefinitionsを渡さず、
source HPのcanonical input条件を一般inputとして扱う欠落を確認した。元のcondition/value二系統を
共通化しただけではcompiled inputの物理bindingを閉じられなかった点が先行reviewのgap。
同じoperationのsource actorとinputDefinitionsをcondition/value双方へ渡す。反例はsource HP input条件、
同形の非HP input、nested boolean、後続readerの有無。これはU1-R内の同一read機構の補完である。
OC admissionのbackward sliceにもquantity leafだけを見る同じ欠落が残るため、canonical input定義と
OC率の値式も共通collectorへ接続する。対象sourceは既存の本人skill/NP探索で、外部actor/clockの全接続とは区別する。

### U1-R owner review: condition actorとinput owner

今回追加したResourceReadContext.actorだけでは、attackerのcondition factsを読むsupport効果内で
sourceHpPermille入力がsupport本人を指すことを同時に表現できなかった。
`condition.evaluateCondition`のquantityは現在のfactsを読み、inputQuantityはbinding済み入力を読む一方、
prototype `inputRead`は両者を同じactorへ投影していた。数値差は未確認だが、将来のactor非干渉proofに使えない。
先行reviewのgapはsourceとrecipientの区別だけで、condition frameと入力ownerを分離しなかった点。
同一read契約のrecurrence scopeはordinary／OC／observerのcondition/value。sourceActorを必須contextへ追加し、
actorは評価frame、sourceActorはsource HP入力の所有者とする。情報なしはunresolvedで推測しない。
反例は同じsupport効果内のattacker quantityとsupport HP input、sourceSelf condition、canonicalInput値式、
明示attacker HP値式。ordinary bool suffixの既存判定はresource集合のままで、actor proof全接続とは呼ばない。

### 今回の検証境界とHP接続の次の依存

| path | 分類・証拠 |
| --- | --- |
| canonical condition/value/amount → execution resource query → ordinary suffix/terminal reader/partial observer | Verified: nested unknown、source HP input/value、partyOther exclusion、BP actor/domainをfocused fixtureで確認。queryの存在をlive state接続へ読み替えない |
| NP不足/容量不足 rejection → application unavailable → calculator/ranking | Verified: public scenarioとportable同一結果、rankingの独自rejection再分類を削除。混在reasonはnoSatisfiableCandidate。unsupportedの同名diagnosticでは再分類しない |
| unavailable → portable/share/current result UI | Verified: schema空rows・reason必須、share parse、UI非数値表示。portableのexecutedはrequest評価済みを表し、内側のunavailableをcalculatedへ変換しない。既存履歴確定はcalculatedのみ |
| schema38 calculator/ranking保存 → import/backup → history | Verified: resolved draftは失効、historyはhistoricalOnly。初期OC/basis/scenario/engine identity保持。旧schemaにunavailableを混ぜる不整合を拒否。manualの既存回復契約を維持 |
| initial HP exact-level basis → sum validation → application/portable | Verified: 本人/礼装加算のunsafe拒否と最大safe値保持、focused20・unit753・最終quality。通常master値の変更なし |
| initial HP resolver → current/maximum/live reader/death guard | Deferred: TSK-06.45/U0-H,U2-H。初期0%製品判断は確定、guardコードは未接続 |
| HP/BP/count/transfer/全cell実行/全source join/admission全体 | Deferred: TSK-06.45/U0〜U5。今回の先行単位から除外済みと扱わない |

schema39・engine38.0.0へ更新。5 golden artifactはengine identityだけを更新し数値期待値を変更していない。
production auditの4,742 records差分はcalculator422件/ranking411件のschema trace（v38→v39）と
inventory.unavailable=0の追加だけ。全default数値結果、非数値理由、candidate/request counters不変。
非並行ranking再測定は3681.65/3632.81/3504.63ms、中央値3632.81ms（before4046.60ms比-10.23%）。
7.35%増加の初回afterは再現せず、今回の測定範囲では継続的なhot path退行を観測しなかった。
最終result digest変更はschema/engine identityを含むためで、上記production record比較で数値差と区別する。

全productionの16:09実行はSTACK_TRACE_ERROR 3件とsuite skip2を含む失敗として保持し、成功へ数えない。
artifact `.test-results/2026-09-08T16-09-41-208Z-15-e48876`。同時に型検査が動作していた。
該当4filesはコード変更なしの非並行focused実行23tests成功30.17秒
（`.test-results/2026-09-08T16-11-44-517Z-16-647d0d`）。並行負荷の影響は推論で、根因を断定しない。
後続のquality2回で全suite成功を確認した。根因は未確定のまま保持し、timeout/cap/ratchetは緩めていない。

HP stateを足す前に既存`preNoblePhantasmPlanner`のNP-only探索contextと実scenarioを区別する必要がある。
plannerへ単純にmissing-HP拒否を追加すると、実scenarioで成立し得るform/programまで消える。
これはHPを適当に100%補完する理由にはしない。planningの未束縛量と実行の必要入力を型で分離し、
U2-H.1/H.3のinputRequired/不可到達をapplicationへ返す責務と併せて閉じる。
またpreparation末尾のHPをordinary全modifierへ渡す案は、modifier→healのread clockを逆転させるため不採用。
既存ordered source activationのread frameとcommit receiptを使う設計が前提となる。

HP read frameの受渡し差分（U1-R/U2-H/U4、設計のみ）:
`preparationContracts.AppliedPreparationEffect`にあるのはeffectとproc outcomeで、HP読取値はまだない。
`sourceCollection.collectOperationSources`のaction.selectedEffects展開はそのprocをordinary sourceへ渡すが、
HP frameは渡せない。`AppliedPreparationAction.resourceBefore/resourceAfter`もNP量であり、HP receiptと呼ばない。
したがって既存のactivation経路を拡張し、実際に読んだoperation/actor/query/clockとcommit済み更新を
区別したreceiptを準備→ordinaryへ渡す必要がある。action終了HP一個の追加ではeffect間のread時点を保持できない。
`preNoblePhantasmSemanticStateKey`はactiveEffectsをcanonicalEffectKeyでsortし、現在そのkeyに読取frameがない。
同じ最終HP・同じeffect集合でもhealとHP依存効果の順序が違う反例を、state dedupとdamage cacheへ追加する。
必要なのは数値/可否/後続更新に影響するframeのidentityであり、全action履歴を無条件key化して候補を増やす案は採用しない。
現行HP state未接続下での新たな数値退行を主張するものではない。分類はDeferred: TSK-06.45/U1-R,U2-H,U4。

HP初期入力のalternate writer確認（U2-H/U4、コード変更なし）:
`resolvedScenarioSchema.worldFactAssertions`はHP/BP量を許容し、`sourceCollection`→`preparationFacts`は
context値の後にそれを読み込む。ordinaryは`validateCandidateSelections`→`applyWorldFacts`を通る。
`fixedConstraintFactsFromState`は非nullの初期量を制約に含めるため、既知初期値との矛盾はordinary側で
検査される。一方nullの初期量には固定制約がなく、world assertionが量のproducerになり得る。
このpathを単に「HP slider→seed」とした先行inventoryは不十分だった。
HP1000＋assertion0、HP null＋assertion0、同値重複、portable復元→編集/resetをC3/C9の反例へ追加する。
準備とordinaryで別の入力優先順位を作らず、U2-H.1の初期intent解決とU4の旧writer除去/拒否を同時に扱う。
確認済みなのはschema/producer/consumer/制約検査の順序であり、新たなproduction damage差を実測したという主張ではない。
分類はpath inventory Verified、実装とfocused再現はDeferred: TSK-06.45/U2-H.1,U4。

U0-H初期basisの整数域: `readHpAtLevel`は各項をsafe integerに制限するが、初期resolverの
HP＋固定1000＋装備HPの和は未検査だった。schema-legalな最大safe integerのHPからunsafeな
maximumを返せるため、初期basisのownerで加算結果も検査する。通常masterの数値変更ではない。
守る条件はresolved.maximumが正のsafe integerであること。overflowをclamp/0/ATK推定で補わず、
initialHpUnavailable/unsafeMaximumとして共通applicationへ返す。
反例は本人HP＋固定1000の境界、礼装HP加算の境界、最大safe値ちょうど、portable再実行。
この範囲検査をHP current/query/guardの接続完了へ読み替えない。

U0-H初期割合→整数HPの採用設計（未実装）:
入力pはschemaの整数permille 0..1000、初期maximum Mは上記safe integer（M≧1001）。
current=⌊M×p/1000⌋を採用する。これは計算機の入力写像としての技術選択で、ゲーム実測から得た丸め規則ではない。
端点p=0→0、p=1000→M、p≧1→current≧1、単調性を満たし、正値を0へ潰すclampを要しない。
乗算中間値のunsafe化を避け、BigInt積の整数除算後にNumberへ戻す（商は0..Mなのでsafe）。
例: M=9007199254740991ではp=500→4503599627370495、p=999→8998192055486250。
ratio-only外部actorにこの絶対HP写像を流用しない。current1/maximum11000のalive・閾値・値式・表示queryは
別契約であり、この初期写像の確定でread時精度やHP transitionのgateを解除しない。

U0-Hの一次根拠差分: fgo-docs commit `4d905267350e8078f46889ab19f6fc54f564a3ed`の
[buff action集約](https://github.com/atlasacademy/fgo-docs/blob/4d905267350e8078f46889ab19f6fc54f564a3ed/deeper/battle/buff.md)
を確認した（SHA-256 `f0b4c80029bb8133688a2aebc92ea8f94123a604030332414434eb16f47729ca`）。
baseParam＋加算buff−減算buffに下限を適用後、baseValueを引き、対象actionの上限制約を適用する。
複数buffの上限は最後のmaxRateを用いるという一次記述がある。全instanceの最大capへ畳む案は採用しない。
この集約根拠だけではHP回復の丸め位置や最大HP解除時current更新は確定しないため、対応する技術gateは残る。

## 77be416後のStep 1（2026-09-09）

### 1. 要件確認

AGENTS.md、systematic-review-guidelines、prompt-engineering-guidelines、現行product要件、
damage-effect-execution §3.1a、ranking要件 §4.2／6.4／9／14〜17、既存Taskと本noteを照合した。
利用者成果は現行masterの全攻撃宝具をcalculator／ranking共通application・executionで正しく計算可能にすること。
semantic ownerはbounded preparation／ordinary executionのresource・quantity・source transaction。
既存F1〜F3とC1〜C12を継承し、本節は77be416との差分だけを所有する。

守る不変条件:

- 初期最大HPは選択Lvのcanonical master HP＋固定HPフォウ1000。calculatorだけcanonical装備HPを加える。
  HPフォウUI、ATK推定、欠損0補完なし。未装備の加算なしと装備HP欠損は別状態。
- 初期basisと戦闘中current／maximum instanceを分離。表示ratioを生存・量式の入力へ戻さない。
  実行中HP0は攻撃到達不能、正値の表示0%は攻撃可能。拒否時NP／OC回数／receiptを消費しない。
- raw解釈はpipeline、初期intent・commandはapplication、read・ordered write・rollbackはexecution、UIは表示。
  rankingは候補選択だけを所有し、独自damage semanticsやraw key／servant ID分岐を追加しない。
- calculated、invalid、inputRequired、unsupported、unavailableを分離する。condition false、proc失敗、
  disabled inclusion、不使用、非干渉proofも根拠を区別し、unknown／部分解釈を数値や正常非適用にしない。

### 2. 現状調査

開始HEAD `77be41645b4c73a7aa4616d4dcf47ff8f87683f9`、親`ef45befb799e12c9bbf5a45857e1379d71ede95e`。
開始時Git statusは空（既存未コミット変更0）。親差分10 filesを確認した。
77be416はsource inventory抽出、resourceProgramAuditとshared production artifactを追加し、
rankingStaticSemanticsのsource生成を同inventoryへ移した。HP／BP実行state追加ではない。
既存検証の411/433 ranking、420/422 calculator、7,255 structural programs、15,795 writer観測、
53,949 opaque観測は直前Step 2節の履歴証拠。今回の新規全実行測定とは呼ばない。

| producer → semantic owner → consumer／回復 | 現在の実装との差分と分類 |
| --- | --- |
| raw HP成長→master readHpAtLevel→initialHp.resolveInitialMaximumHp→scenario.resolveScenarioPreparationOutcome | Verified: resolverは固定1000・CE Lv/LB検証を実施。initialMaximumHpのproduction参照はscenario内の型／返却だけで、resolveAttackerFormExecution引数に渡らない。実行接続はDeferred: TSK-06.45/U2-H.1 |
| scenario HP intent→preparationFacts.preparationConditionState→condition／ordinary npDamageOperation／hpValueExpression | Verified: preparationはcontext ratio、ordinaryもpermilleを読む。preparationState.createPreparationStateにcurrent／maximumなし。実量・precision query・HP0 guardはDeferred: TSK-06.45/U1-R,U2-H |
| pipeline HP resourceMutation／lossFloor、最大HP・回復buff stateMutation→preparationTransaction／ocState→ordinary projection | Verified: HP IRとsafe下限の存在は実行保証でない。ocStateはhpWrite markerでHP依存率をunsupported化。gain／loss／heal／max付与解除・live rate readはDeferred: TSK-06.45/U0-H,U1-H,U2-H |
| initialOc／npResource→preparationTransaction.planPreparationResourceTransaction→ocState receipt→scenario damage input | Verified: NP消費→共通source処理、terminal receipt.effectiveOcの利用を読取確認。NP比例量の既存証拠を保持。HP/BP/transferを含む全state rollbackはDeferred: TSK-06.45/U2 |
| executionSemantics BP→preparation context／quantity state→npDamageOperation | Verified: BP gainがaddQuantity battlePointPhaseへ正規化され、point/capacity stateがない。phase直加算を削除しdomain queryへ移す責務はDeferred: TSK-06.45/U0-B,U1-B,U2-B |
| dependent raw量→executionSemantics unsupported→compiler／admission | Verified: target/individual/buff countとtransferは依存量名だけで閉じない。selector、donor、child順序の保存とqueryはDeferred: TSK-06.45/U0-D,U1-D,U2-D |
| form graph／variant→rankingProgramSourceGroupsとpreparationState／activatePreparationForm→ordinary static projection | Verified: 77be416はactivation順とordinary projectionを分離。非選択variant、再入場、旧form失効の既存fixtureを保持。state量・instance寿命の両clock接続はDeferred: TSK-06.45/U1-R,U2-H.3 |
| resourceSemantics.operationReadsResource→closeResourceMutationSemantics→compiler／admission | Verified: suffix proofはcondition、一部modifierとNP specialのみ。全NP HP0、actor-qualified amount、source BP rate、最大値解除を含まない。observerのfirstRequiredHpGuardは実装済guardでない。proof統一はDeferred: TSK-06.45/U0-R,U1-R,U3-A |
| rankingActionAdmission.classifyPrograms→optionalAdmission→rankingProfileOutcome.unresolvedProfileResult | Verified: structural先行admitとoptional unsupported先行判定が別。現行到達不能分類はNP不足／容量中心。role・policy・semantic proofを別に合成する変更はDeferred: TSK-06.45/U3-A |
| rankingQuantityWorld→rankingExecution.executeRankingScenarios→scenario.prepare/evaluate | Verified: shared facade／complete input cacheを使う。一方quantity候補はcondition境界中心でamount-only・更新後境界の完全性は未証明。Deferred: TSK-06.45/U3-Q |
| input修正／policy再適用→scenario.rematerializePreparedCalculationInputs,reapplyPreparedCalculationPolicy | Verified: 元scenarioからprepareCalculationScenarioWithPolicyへ戻る。新resource seedとreceiptのfresh実行一致はDeferred: TSK-06.45/U4 |
| CalculatorRoute scenario change/reset→portableCalculation attempt関数→prepareCalculationScenarioWithPolicy→draft/history | Verified: commit可能なattemptだけをdraftへ渡しresetはdefault constructorへ戻る。装備／Lv変更の初期HP再解決と失敗時保持、worker/cache版同期はDeferred: TSK-06.45/U4 |

Verifiedは表に明記した現状コード確認と既存証拠の範囲に限定し、未実装pathをVerifiedとしない。

**前回レビューgap（F1〜F3の更新）:** 発生機構は、部分readerの観測を全program非干渉proofへ昇格し得ること。
実装不一致は`resourceProgramAudit.readCoverage=partialCurrentContracts`とruntime
`resourceSemantics.operationReadsResource`の範囲差。77be416自身はpartialと明記しており、
新規damage regressionを確認したという主張ではない。検出漏れは旧調査がresolver／IR／source列の存在を
actor・clock・terminal生存前提・回復writerまで閉じなかったこと。再発範囲はHP/BP/量式/OC率/解除/
form/automatic/非選択cell。最小guardrailは一つのexecution-owned query契約をexecutorとaudit/admissionが
消費し、観測coverageと実行outcomeを別字段に保持すること。calculated内HP writer87 profilesも監査対象とする。

### 3. 採用設計と理由

ef45bef Step 1の採用設計を継承する。今回確定する境界は以下。

- actor＋resource/domain＋query種別＋phase/position＋selected variant/cellを持つread契約をexecutionへ集約。
  absolute／ratioOnly／missingを分け、alive・threshold・値式・displayを別queryとする。
- immutable initial basisから一度seedし、既存transaction draftにHP／maximum instance／BP／count stateを追加。
  condition→proc→amount read→writeを順序化し、OC rateはquery時点で読む。NP使用入口とdamage到達位置の
  HP guard、失敗commandの全rollback、成功済み前command保持、ordinaryへのreceipt受渡しを一体で閉じる。
- pipelineはresource別closed amount、selector、recipient、lifetime、解除とchild依存を保存する。
  初期HP整数化、最大値解除・量modifier合成、BP domain、transfer順序は技術gateであり、根拠未確定の式を採用済みにしない。
- admissionはstructural roleと意味検証を分け、実効寄与に必要なcost／sibling／automaticを共通実行する。
  finite候補はinitial intent上の更新後境界を含む。unknown候補を捨てて最大を宣言しない。
- portable/reset/装備変更はinitial intentを再解決する。terminal HPや適用済み最大値を保存basisへ混入させない。

不採用: ratioだけの可変HP（絶対量・生存・精度を失う）、HP marker削除だけ（古いHPでOC率が成功する）、
resourceごとの後置pass（順序とrollbackを失う）、static ordinary列を準備順に並べ替えるだけ（clockを混同）、
ranking独自reducer／未知候補除外／上限緩和（parity・最大性を失う）、全battle simulator（現要件外）。
初期量子化のfloor案やgain＝child実減少量は技術調査前に固定しない。

### 4. 検証可能な実行単位

順序・入力・変更責務・完了条件の正本は既存TaskのU0〜U5表だけに保持する。
開始はU0-Rの未完了joinと同環境before測定→U1-R。独立U0-H/B/Dの根拠確定→各IR→state/query→
ordered適用を進め、U3-A/Q→U4→U5へ閉じる。HPを読まないBP/countにHP transition完了を課さない。

C1〜C12の既存matrixへ、今回の反例交差を追加する。

| state × path | 期待結果／検証 | 分類 |
| --- | --- | --- |
| 未装備／canonical CE HP0／欠損／不正Lv・LB × calculator/ranking/reset/装備変更 | 未装備・実在0補正は合法、欠損はinvalid。固定1000をATK Fou変更で変えない。fresh seed一致 | Deferred: TSK-06.45/U2-H.1,U4 |
| HP1/11000／実HP0 × skill→transform→terminal→ordinary | 正値の表示0%は生存、実0はunavailable。閾値・inverse値式を表示丸めから独立に検証 | Deferred: TSK-06.45/U2-H.1〜3 |
| safe/通常loss／heal clamp／max instance付与解除 × form再入場・CE通常/LB非default cell | 再seed・二重適用なし、量modifierのgiver/recipientを混同しない | Deferred: TSK-06.45/U0-H,U1-H,U2-H.2 |
| rate grant→HP write→OC grant／rate除去→grant × source≠recipient | 利用時HP・生存instanceで率を読む。未知絶対HPをratioから推定しない | Deferred: TSK-06.45/U1-R,U2-H.3 |
| 同phase異point／absent/0／capacity解除 × BP→NP amount→OC | phaseだけで同値とせず、live point/domainを読む | Deferred: TSK-06.45/U0-B,U2-B,U3-Q |
| 一actor複数trait／複数buff／count0/cap × 解除・target/individual/recipient切替 | 人数・一致数・instance数を独立に数え、selector欠損はfail-closed | Deferred: TSK-06.45/U0-D,U2-D.count |
| transfer donor clamp/抵抗／child proc失敗／invalid × NP/HP gain→後続read→retry | donor snapshot・算定gain・child実量を区別。invalidはcommand全stateを戻しproc失敗と別outcome | Deferred: TSK-06.45/U0-D,U2-D.transfer |
| unknown sibling／nested any/all/not／非選択variant × optional/structural/automatic/admission | source不使用・proof・unknownを区別し、未対応最大候補を数値へ隠さない | Deferred: TSK-06.45/U1-R,U3-A,Q |
| command途中拒否 × NP/HP/BP/OC/form/context/instance/receipt→修復再実行 | 前command保持、拒否command漏れ0、ordinary二重適用0 | Deferred: TSK-06.45/U2,U4 |
| policy off/on／without-area／portable upgrade失敗／stale worker × fresh calculator/ranking | 同じ入口、complete input/result/outcome/action receipt一致。保存失敗時旧request/sessionを保持 | Deferred: TSK-06.45/U4,U5 |
| 初期入力0% × seed・分析表示・成立込み候補最大 | 未規定。製品判断が必要なbranchだけ保留、他の技術調査は継続 | Blocking: 当該branchの製品判断（Step 1完了・独立単位開始は妨げない） |
| turn-end／被攻撃／一般死亡復活の新規simulation | bounded外proofを保持する。即時量modifierとの非干渉確認自体はU1-R内 | N/A: 新規simulationは現要件外 |

focused fixtureは小型schema-legal stateを使い、production0のvariant/actor/clock交差も含める。
productionは既存shared inventoryを一度parse/compileして全格納source→normal/LB/NP/OC cell→
selected program→first reader→実行outcomeへjoinする。profile default outcomeをprogram成功数に流用しない。
CE/支援のcalculator追加source、未選択variant、既にcalculatedのprofileも別母集団として含める。
parityは値だけでなくshared入口、complete input、outcome、applied actions/receiptを確認する。
小domain全探索でmaximumを独立検証し、全80合法条件とowned basis、全非数値理由をU5で全数確認する。
performanceは同master・同条件・非並行でaffected production suiteとwarm-up後hot path各3回中央値、
candidate/request/distinct/cacheとartifact容量をbefore/after比較。82.05MiBの既存観測をさらに重複展開しない。
単位ごとfocused diagnostic→unit/production→必要なperformance、最終gateはpnpm quality。

### 5. 既存正本更新・Step 2開始条件

Task表のidentityと依存を維持し、今回Step 1を完了として記録する。TSK-06.45全体は未完了。
Step 2開始条件は今回の計画確認、HEAD/Git/master manifest・既存変更の再照合、着手単位の入力と反例の固定。
U0-R/U1-Rと独立技術調査は開始可能。HP数値規則／BP domain／transfer順序の未確定は対応実装branchの
技術Blockingであり、ユーザーへ通常技術判断を委ねない。現行入力では必要stateを一意に表せないことが
具体的に判明した場合だけ、BP point入力や敵state入力の最小追加範囲を製品判断として提示する。
初期0%以外に新たな製品判断の必要性は今回確定していない。
Task完了にはTask内DeferredとBlockingを全て閉じ、既存Done gateを満たす。06.5へ実行未対応を送らない。

検証記録: `pnpm test:docs`と`git diff --check`成功。最終`pnpm quality`成功（273.86秒）、
unit728／production120／Playwright26、skip/todo/retry/warning/unexpected console 0。
artifact: `.test-results/2026-09-08T15-24-47-050Z-16-3e376c`。
これはStep 1文書phaseのgateであり、未実装resourceのclosureや構造変更前後の独立性能測定ではない。
製品code・tests・master・schema変更なし。Taskと本noteの2ファイルのみ変更、stage/commitなし。
Step 1を完了してここで停止する。

## TSK-06.44 — initial OC and own OC boost closure (2026-09-08)

Current sequence: **06.43 done → 06.44 done → 06.45 ready → 06.46 → 06.47 → 06.5 → 07**.
Requirements v0.10.2 §4／9 own the approved product contract. This section owns the additional
flow inventory and counterexamples; it supersedes the next-task statement in the historical
06.43 approval below. Current implementation and verification are recorded in the 2026-09-08 section; earlier checkpoints below remain historical evidence.

### 独立再レビュー承認・commit handoff（2026-09-08）

独立再レビューの判定は **Approved**。PIR-001／002はreviewerがResolvedと判定し、
scoped Blocking 0、追加の採用指摘なし。以下の実装中記録は履歴として保持する。
レビュー正本: `/tmp/fgo-lab-review-tsk-06-48-20260908/review.md` のCurrent verdict。
レビュー対象はHEAD `5faf7ec`＋TSK-06.44全152ファイルのworktreeで、commit準備時に全SHA256一致を確認。
最終qualityは `.test-results/2026-09-08T04-05-59-492Z-15-5a229b` で成功
（unit637／production119／Playwright26、247.59秒、skip／todo／retry／warning／unexpected console 0）。
全80条件matrixと独立性能の再測定はせず、変更のない既存証拠を照合した。
06.44をdone、06.45をreadyへ戻す。解除耐性の明示unsupportedと06.45の既存残存範囲は変更しない。

### PIR-001／002 implementation delta（2026-09-08）

レビュー判定はChanges required。以下は実装者の現在地であり、指摘のresolution／approvalは独立再レビューが所有する。
PIR-001: `rankingBasis.applyRankingSelectionCommand`が容量でclampし、`initialOc.changeResolvedNpLevel`の
OC1補正と分岐していた。前回はcalculatorのNP×OC表のみを修正し、両commandとowned→specifiedを
同じ反例で比較していなかった。補正のownerをinitialOcへ統一し、UI→URL／workerまでを対象にする。
PIR-002: `CalculatorRoute.regenerateHistory`がrequestだけを更新し、`portableDraft`→
`finalizeHistory`のsession集約writerへ旧sessionを渡していた。前回のmigration／replay検証は
再生成→draft→共有／離脱確定のwriteを含んでいなかった。通常履歴copyと再生成の新session開始を
portableDraftで共有する。reset／scenario編集は同じsessionを維持する別commandである。

| Changed path / counterexample | Current status |
| --- | --- |
| calculator／ranking指定NP変更・owned→specified：NP5/OC3→NP2/3/4はOC1、合法OCは保持 | Verified: initialOc command parity fixture |
| UI再表示→URL／worker、population→all／reset、直接不正requestと保有混在 | Verified: UI／URL／worker fixtures、既存rankingBasis／schema tests |
| current／historicalOnly履歴選択×未確定／共有確定済みsession×共有／離脱finalizer | Verified: CalculatorRoute.history integration matrix |
| 再生成不可／保存失敗→既存draft・workspace・session保持、旧履歴不変 | Verified: missing subject／missing level route、portableDraft保存失敗fixture |
| 全80条件matrix／独立compile性能再測定 | N/A: command補正とsession identityのみ。既存証拠を保持しquality内production digest／parityで確認 |

実装者検証: 修正前にPIR-001のOC2とPIR-002のsession再利用を追加fixtureで再現した。
修正後focused25／unit637成功。`initialOcAfterNpLevelChange`が補正を共有し、
`startPortableDraft`が保存成功後だけworkspace／sessionを公開する。通常履歴のsource=historyと
同一fingerprintの連続履歴集約は既存どおり。Appの通常navigation／rankingHandoffは既に新sessionを
発行する別producerで、今回の修正は不要（既存handoff／startup testsをqualityで確認）。
最終`pnpm quality`成功: `.test-results/2026-09-08T03-58-37-257Z-15-d266cd`。
unit637／production119／Playwright26、warning・unexpected console・retry 0。
unit再確認は `.test-results/2026-09-08T03-56-54-889Z-15-997719`（637 tests）。
履歴test harnessはrender途中でなくcommit後のstateを観測し、登録finalizerの更新を待つ。
既存production digest／raw／master／80条件と性能証拠は変更なし。
実装者statusは`ready-for-re-review`。resolution／approvalは独立`$post-implementation-review`が所有し、
Taskはin_progress、06.45はblockedに維持する。

### 実装引継ぎの再評価（2026-09-08）

今回の完了依頼で過去の保留を解除。専用OC IR、executorのinstance／NP-use receipt、初期OC intentは
利用者の比較・再現目的に一致するため維持する。新しいHP実行モデルや探索軸は追加しない。
準備の不確定writeは実際のreaderとの交差で判定し、通常projectionはcommit済み成否を再解釈しない。
全経路parity、production差分・性能と最終qualityを確認し、06.44を完了した。

追加確認: portableの固定basis validatorが成立込みHP witnessまでHP100%へ限定していた。
過去の監査は一例の基点再現に留まり、同じquantity producerが書くBattle Pointを含む
通常／成立込み×calculator／portableの契約を閉じていなかった。通常policyでは固定値を検証し、
成立込みではschema検証済みのquantityを共通executorへ渡す。選択candidateの最大性をportableで
再探索する要件はなく、保存したcanonical入力とpolicyの再実行が責務である。
NP5・初期OC3→NP2変更でresolved calculatorがOC2へclampする差も確認した。
§9.1の明示command補正はOC1なので、利用可能な値の維持／容量不足時OC1をapplicationで統一する。
反例と全80条件production matrixで確認した。

実経路の追加検証: OC sourceのskillNameに内部IDを渡していたため、sourceを解決する既存commandから
表示名を必須で渡す。receiptとWeb共通presentationの責務を変えず、生成時の根拠を修正した。
性能監査ではcommand内の同一stateに対するcondition factsを共有し、pure damage sourceの不要な
preparation input解決、単一OC cellの不要なoperation重複排除を削除した。
状態変更時はfactsを再構築し、policy変更・入力修正では元requestから再prepareする契約を維持する。
各変更前後でproduction digest／小domain oracleを照合した。表示名修正だけはreceiptを含む
semantic keyを変えるためdigestが変わり、damage input／outcome差はない。

### Canonical checkpoint（2026-09-08 02:55 UTC、開始から約60分）

- 現在の結果: 初期OC intent／自前OC shared executionとUI cutoverを接続済み。全qualityは一度成功。
  80条件監査は53条件・21,363 selected resultsまで完了し、calculator／portable再現差分0。
- 変更family: OC grant／rate／lifecycle／NP-use receiptと直接のapplication・保存・UI経路。
  残存trigger／dependent resourceは06.45に維持し、新しいsemantic familyへ着手しない。
- 検証済み証拠: 下記IR／EXEC／APP／IDENTITY/UI、production119、unit621、Playwright26。
  default calculator420/422、ranking393/433、raw4 digest不変。性能増加はshared preparationと
  OC-dependent candidate増加をCPU profileで分解済み。最新3回計測をmatrix後に確定する。
- 次のaction: 実行中の `.test-results/tsk-06-48-a5/completed-matrix` を80条件まで完了し、
  canonical input差分・性能を既存正本に反映、最終qualityで完了判定する。
  実行HEADは`5faf7ecdbffcbe0c90d98e8a39f1e5b7ef4ef28d`、挙動比較baselineは`c555e4f`。
  間の2 commitsはagent運用文書。ユーザーの未commit差分を保持し、stage／commitなし。

### 検証証拠とclosure（2026-09-08）

状態別matrixの`Verified`は以下の証拠群を参照する。productionに存在しない組合せは
schema-legal fixtureで閉じ、全profileの数値化とは区別する。

- **IR**: `packages/data-pipeline/src/ocSemantics.test.ts`、`productionAudit.test.ts`、
  `packages/calculation-application/src/productionMasterInventory.test.ts`。raw OC167 occurrences／632 cells、
  公開boost97・rate grant29・remove75・nonintersection131・resistance60を共有inventoryで確認。
  rate grant868 cells／resistance514 cellsのうちCE LB継承3 cellsをrawとの対応に含める。
  lifecycle199＋既存context writer7、HP依存rate1 effect／25 cellsを全体分類に保持する。
- **EXEC**: `packages/battle-execution/src/ocState.test.ts`、`ocSourceProgram.test.ts`、
  `preparationTransaction.test.ts`。NP-useでのcell固定、capでも全参加count消費、constant lifetime、
  HP→rate query、条件・recipient・selector、同一command rollbackと次のcommandへの汚染防止を検証。
- **APP**: `packages/calculation-application/src/ocExecutionParity.test.ts`、`ocCandidateOracle.test.ts`、
  `initialOc.test.ts`、`rankingBasis.test.ts`。policy再適用・input修正・portable replayを同じ入口へ戻し、
  不正capacity拒否、明示commandのOC1補正、混在保有、OC-dependent quantityの有限oracleを検証。
  HP／Battle Point witnessは成立込みで再現し、通常basisへ偽装したrequestは拒否する。
- **IDENTITY/UI**: schema／portable／migration／workerの既存suiteとPlaywright E2E-051。
  resolved初期OC1〜3とmanual最終OC1〜5、初期／発動時OC表示、desktop／390px／320px、keyboard、
  NP／population command、reset、old-only／canonical-only／mixed payload、stale worker拒否を検証。
- **PRODUCTION**: `packages/calculation-application/scripts/audit-oc-matrix.ts`を一回のmaster parseで実行。
  自然上限／Lv90×四policy×NP1〜5×合法初期OCの80条件で、選択された全calculated結果について
  calculator／portableのcomplete input・damage result・applied actions（NP-use receiptを含む）を比較する。
  profile全体のunsupportedにはportable candidateが存在しないため、outcome理由を全数記録し、
  recovery／invalid／inputRequiredの経路は上記EXEC／APPの反例で検証する。
  80/80条件、32,640 selected results、input／result／receipt parity差分0で完了。

最初の全`pnpm quality`は `.test-results/2026-09-08T02-20-57-156Z-15-e38f5e` で成功。
unit621／production119／Playwright26、warning・unexpected console・retry 0。
最終matrix・性能証拠と不要引数の整理を含む最新差分も、
`.test-results/2026-09-08T03-10-01-607Z-15-c1fff1` の最終`pnpm quality`で成功（234.64秒）。
unit621／production119／Playwright26、skip・todo・retry・warning・unexpected console 0、
artifact integrity errors 0。06.44の全scoped pathはVerifiedまたは理由付きN/A、Blocking／Task内Deferred 0。
残存production unsupportedの数値化は06.45の既存受入条件であり、本Taskの延期へ読み替えない。

### Production差分と06.45へのbaseline（2026-09-08）

[機械可読の差分証拠](oc-execution-diff-tsk-06-48.json)にraw／master digest、canonical before/after
inputとrule、NP5独立選択差分、全80条件summaryと非数値outcomeの全profile・理由を保持する。
全34,640 profile outcomesはcalculated32,640／unsupported1,960／unavailableUnderPolicy40、
invalid／inputRequired 0。後者40件は自バフ除外時のtransform後NP不足であり、到達性の結果を維持する。

master `20260906.03`、master schema45／portable schema38／engine33。
master SHA-256は`65add07d7b3c81927fd147e632ceea0c22ed0f7cb7f95079db4c6fc750ed6098`。
raw4件はA0と同一。default（自然上限・自バフ込み・通常・NP1・初期OC1）は
calculator420/422 calculated、ranking393/433 calculatedで件数不変。
canonical NP identityのcutoverを対応付けた433 profilesで、calculatorの完成input差28件
（OC関連27、negative target state1）、rankingの完成input差17件を確認した。
入力差にはeffective OCのみ変わりdamageが変わらない場合も含む。
2301100のexclusive-state根拠によるattack buff差と、OC／NP buff差を別ruleで保持する。

自然上限・自バフ込み・初期OC1で、独立最適化NP5とNP1採用scenarioのNP5列は
通常7件／成立込み6件で異なる。これは同じNP5値であっても採用program／effective OC／完成inputが
異なるためであり、列cacheで代用しない。旧NP5 baselineは開始gaugeの暗黙探索を含むので、
新しい初期OC1／2／3と比較するときは条件変更と意味論変更を分ける。

06.45は未着手。通常NP1の40 unsupportedは`unsupportedActionAdmission`、calculatorの2件は
既存HP／Battle Point境界。成立込みNP1では40 admission＋8 finite-domain上限＋4 executionで
52 unsupported（381 calculated）。finite-domainの未知最大を4096で打切って数値化しない。
NP5・初期OC1では追加actionが到達可能になるため、通常は3 ambiguous condition＋1 HP＋1
attack-NP unavailable、成立込みは5 ambiguous conditionが追加される。
これらの5 profilesは401300／500400／702500／2300600／2800600で、IDは証拠索引だけに使用する。
NP5・初期OC3ではこの追加5件は消える。OCの未解釈fallbackではなく、既存execution制約が
実行可能なactionに現れた結果であり、全attack closureを受入条件とする06.45へ現在値を渡す。
同Taskの着手時は、このpolicy／NP／初期OC付きbaselineとproducer／reader／recoveryを照合する。

### 性能の確定（2026-09-08）

同じdefault shared audit commandを、`c555e4f` archiveと現行worktreeで各3回、他のsuite／matrixと
重ねず測定した。archive内のworkspace importを維持し、dependency installは行わない。

| 測定対象 | before | after | 判断 |
| --- | --- | --- | --- |
| shared compile中央値 | 5,545.516 ms | 6,924.666 ms | +24.87%。OC全cellsのdependency解析、準備condition／instance／receiptの新実行と候補増を含む |
| 同3回のcompile | 5,383.706／5,545.516／5,593.532 ms | 6,565.907／6,924.666／7,404.706 ms | 全回同一default digest・counters、測定対象を変更しない |
| affected production suite | A0 37.94 s | 初回full quality 39.731 s／最終31.163 s | 同suiteのgate時間を併記。hot-pathは上の独立3回計測で判定 |
| default candidate／damage request／distinct input | 1,936／1,924／1,298 | 2,153／2,096／1,329 | OCの間接寄与による追加候補。requests +8.94%、distinct +2.39% |
| preparation generated／deduplicated | 6,360／3,949 | 6,364／3,958 | ordered準備の母集団増は限定的 |

CPU sample比較はshared compile 4,745.773→6,382.127 msの測定で、追加costが
preparation facts／OC receiptとOC全cell dependency解析に現れることを確認した。
これは最終3回計測とは別の診断であり、sample時間をwall timeへ厳密加算しない。
同一command内facts共有、pure damage sourceの不要準備入力解決削除、単一OC cellの重複排除省略により
正しい実行を保ったまま追加costを縮小した。初期gauge探索軸を復活させるcache／shortcutは導入しない。

candidate上限4096、実行可能な最大space3840、static programs7,255／profile最大60、
preparation actions最大4／states最大56は不変。8 finite-domain unsupportedを隠すための上限緩和もない。
測定可能なhot-path増は残るが、上記の追加実行とwork countersに対応しており、一般battle simulatorや
別の最適化Taskへ範囲を広げない。raw／master／caseを変えて性能改善と見せる比較は行っていない。
全80条件の時間は機械証拠へ保持し、旧40条件の暗黙gauge探索の合計時間とは直接比較しない。

### Step 2 A0 baseline and execution stop (2026-09-06)

更新Step 1は利用者承認済み。開始HEADは`c555e4ff9a208f8da01e56130fbd49e63848e192`、
raw4件と公開masterのSHA-256は下記Step 1基点と全件一致。worktreeは計画文書6件だけが変更済みで、
その変更を保持した。承認済みのresolved初期OC1〜3／manual最終OC1〜5をrequirements §9.1とUI spec §9へ明記した。
本節の追加Blockingは、下記に履歴として保持するStep 1の「未決定0」という判定を更新する。

A0で計測済み:

- `pnpm test:diagnostic -- packages/calculation-application/src/productionAudit.test.ts`を3回実行。
  test時間7.528／7.524／7.623秒（中央値7.528秒）、shared compile時間5.520／5.641／5.619秒（中央値5.619秒）。
  runner全体時間10.00／10.07／10.02秒。これはcalculator＋default rankingの共有auditであり、
  ranking単独時間や全四policy／全NP条件の計測とは呼ばない。
- 3回ともaudit digest `8b487c1c5d5fae1a4be95652f846cb89226322cece373006db72a5f0b1091816`。
  generated preparation states6,360／deduplicated3,949、damage requests1,924／distinct inputs1,298。
  calculator422件中420 calculated／2 unsupported、ranking433 profiles中393 calculated／40 unsupported。
  master read／parse／compile各1回。既存default policy・NP1・開始100%の変更前baselineである。
- artifacts: `.test-results/2026-09-05T20-59-22-969Z-15-873d29`、
  `.test-results/2026-09-05T21-00-03-768Z-15-0b67c3`、
  `.test-results/2026-09-05T21-00-50-634Z-15-211251`。
  各`production-audit-calculation-application.json`にcanonical damage inputs／outcomes／countersを保持。
- `pnpm test:production`: 24 files／119 tests成功、37.94秒、warnings0。
  artifact `.test-results/2026-09-05T21-01-35-778Z-15-38e0ab`。
- 再現可能なraw／published inventory command:
  `node packages/data-pipeline/scripts/audit-oc-planning-baseline.mjs`。
  artifact `.test-results/tsk-06-48-a0/oc-inventory.json`はHEAD／worktree／入力digest／各source path／
  raw selector metadata／通常・LB cellsを保持する。raw OC167件／632 cells、公開OC97件、
  lifecycle writer199件、positive application rate modifier29件は計画と一致。

**OC-RATE-HP-001 — rate prerequisiteのHP依存reader（停止時点の記録／計画補足で解消）**

以下のBlocking表記は停止時点の履歴。利用者確認後のcontinuation contractが現在の分類を上書きする。
製品仕様の再承認事項ではなく、既存HP依存判定をrate利用時へ接続する実装項目として継続する。

1. 発生機構［確認済み］: 29 rate effectsのうち公開1 effect／25 cellsが`Value=0, RatioHPLow=400`を持つ。
   occurrenceは`servants[10].noblePhantasmVariantGroups[1].variants[0].effects[0]`、
   actor101300／NP101302／effect946:0、`timing=beforeDamage`。
   同じfuncId946の別skill occurrenceは公開cellsが固定200であり、funcIdだけのraw joinではこの差を判定できない。
   上記auditは公開occurrenceのcellsからHP依存1件を数え、rawの同ID別variantを混入しない。
2. 実装とのズレ［確認済み・推論を分離］:
   `data-pipeline/src/effectNormalization.ts:normalizeModifierValueExpressions`はこの形を既存の
   `inverseHpLinear`へ変換できる。しかし`executionSemantics.ts:normalizeExecutionSemantics`の
   rate effectは`stateMutation`へ落ちるため、公開executionに量expressionは残っていない［確認済み］。
   `battle-execution/src/resourceSemantics.ts:operationReadsResource`はcondition、NP special dependency、
   addModifier expressionだけを読む。`closeResourceMutationSemantics`は後続readerがなければ
   HP writerを`noDamageReader`へ変える。準備側`preparationContracts.ts`はHPをcontext値として持つが
   mutable resource stateはNPだけである［確認済み］。
   rateを準備側へ移して固定adjustmentへ焼くと、HP→rate→OCの読取時点とsuffix proofが欠落する［推論］。
3. 検出漏れ［確認済み］: 更新Step 1は29件のselector／clamp前Rate／付与・解除を閉じたが、
   rateの**量expression**別inventoryとHP writer→rate query→OC grantの反例がなかった。
   A0への延期事項として元から残していたものではなく、今回のoccurrence別artifact化で確認した追加境界である。
4. 再発範囲／最小guardrail［推論］: rate prerequisiteのfixed／inverseHpLinear／hpRangeLinearと、
   own／external source、grant時／query時、HP writerの前後、rollback／retry。
   pipelineは既存typed expressionをlosslessに保持し、source programのresource-read proofはrate queryも対象にする必要がある。
   full HP simulatorを追加する根拠にはしない。liveで未表現のHP writerをtyped unsupportedへ閉じる境界と、
   HPが不変の場合のrate evaluationを確定してからA1／A2a〜c／A3へ一括反映する。

読取時点の根拠は既存`battle-execution/src/projection.ts:resolveModifierValue`の現在HPによるexpression評価と、
Step 1で参照した公開実装の
[BuffData.getParam](https://github.com/chaldea-center/chaldea/blob/9fa75655c07ecd76168b1ccf5b8232e8d64664cf/lib/app/battle/models/buff.dart#L283)
（query時のowner HP読取）。ゲーム内の独立実測とは区別する。

追加反例: canonical rate expression `{kind:inverseHpLinear, basePermille:0, bonusAtZeroHpPermille:400}`、
OC base application rate1000、recipient resistance200。HP500permilleならadjustment200で実効率1000、
HP1000permilleならadjustment0で実効率800となる。rate grant後／OC grant前にHP gainがあるprogramで、
grant時の200を固定すると確定成功に化ける。HP writerを実行できない現行bounded resourceモデルでは、
この経路を成功扱いにせずunsupportedへ接続する必要がある。HP writerなし、readerより後のwriter、
rate解除後、外部source HP不明、command拒否後retryも同じ反例familyへ含める。

| Changed path | Status |
| --- | --- |
| pipeline rate amount expression → preparation rate query → HP resource suffix proof → OC outcome／rollback | Blocking: OC-RATE-HP-001。固定値に潰さないread contractとunsupported境界を計画へ反映する必要がある |
| 公開HP依存rateの当該NP OCへの影響 | N/A: このeffectはNP-use OC確定後のNP-before。現在のOCを遡及して変えない。production damage差分は未観測 |

停止時点でA0全条件matrix／writer分類の共有gate化は未完了、A1〜A5は未着手。
製品コード・master・schema versionは変更していない。上記audit scriptと正本文書のみを変更した。
`pnpm quality`はphase未完了のため未実行。Done gateやruntime closureの成立は主張しない。
停止時の文書検証は`pnpm test:docs`（6 tests＋integrity）と`git diff --check`が成功。
06.45の既存trigger／dependent resource問題は未変更で、開始値の更新は06.44完了後に行う。

### OC-RATE-HP-001 continuation contract（利用者確認後）

上の停止記録は履歴として保持する。既存モデル内の依存判定不足として継続し、製品仕様の再承認を要求しない。
rate量expressionは付与時に固定せず、OC付与に使う時点で評価する。不変HPを証明できれば計算し、
結果に影響する未表現HP writerは既存resourceSemanticsと同じunsupported、修正可能なHP不足はinputRequired。
rate付与operationだけをHP readerにしてはならず、active rate instanceの利用位置まで依存を追う。
新しいHP実行モデルは追加しない。

| State × path | Expected outcome | Status |
| --- | --- | --- |
| rate付与 → HP変更 → OC付与 | 利用時までにHP不変を証明できずunsupported、command rollback | Verified: EXEC / APP |
| HP変更なし／最後のrate利用後のHP変更 | 利用時の不変HPでrate評価。後続readerなしwriterは既存規則 | Verified: EXEC / APP |
| rate解除 → HP変更 → OC付与 | 除去済みrateのHP依存を復活させない | Verified: EXEC / APP |
| 別sourceのHP／不足input | source identityを分離し、修正可能な不足はinputRequired | Verified: EXEC / APP |
| rollback／retry | HP依存汚染・instance・receiptを同時復元 | Verified: EXEC / APP |
| candidate admission／reduction | HP→rate利用→OC outcomeを共有依存へ接続 | Verified: APP |

Current classification: OC-RATE-HP-001の計画補足はVerified、runtimeは上表のDeferred。Blocking 0。
再停止は既存outcome／所有境界で閉じられず、新しいHP実行モデルまたは製品判断が必要と具体的に判明した場合だけ。

### 利用者指示による整理時点（2026-09-06、追加実装を保留）

利用者の「整理が終わったら実装まで行かずに一度情報をまとめよう」に従い、追加の製品／testコード変更を停止。
全条件監査も中断し、途中manifestを保持した。これは新しい仕様問題による実装停止でもphase完了でもない。
HEADはc555e4ff、local master .03のSHA-256は65add07d7b3c81927fd147e632ceea0c22ed0f7cb7f95079db4c6fc750ed6098。
未commit変更は保持し、stage／commitなし。

- 確認済み: read-point反例100 tests、6 source phaseの付与成否→damage reader／portable replay 11 tests、
  NP1採用scenarioのNP5列とNP5再最適化を区別するoracleを含む2 tests、responsive／keyboard／command／reset E2E 11 tests。
  詳細artifactは下のcheckpointおよび `.test-results/2026-09-06T10-04-37-982Z-16-dfd85e`。
- 全条件監査: `.test-results/tsk-06-48-a5/readpoint-matrix/manifest.json`の12／80条件まで採取。
  この範囲のcalculator比較は一致。成立込み2条件のportableで各5 profiles、計10件の`ranking_basis_invalid`を記録。
  5 profiles全体の基点再現は未確認で、202500の1反例だけが下記の`baselineReproducedUnchanged`。
  中断した監査は成功扱いにしない。
- 最新unit全体は615成功／1失敗（2026-09-06T10-02-13-431Z-16-c6b9af）。失敗は、未読trait writeを即時拒否する旧fixtureの期待。
  意味を保つunknown NP lossのfixtureへ修正し、scenario focusedは成功したが、全unitの再実行は未実施。
  最新lintはtestコードの型付きfixture／matcherに4 errors（warnings 0）、未修正。
- Production focusedはinventory／candidate digest等の期待差分が残る。OC加算のinput差分27件と、敵negative state追加1件を
  `.test-results/tsk-06-48-a5/calculator-canonical-input-delta.json`へ保存。204300のQuick buff脱落は解消済み。
  数値・outcome差分の最終承認証拠とratchet整合は未完了。
- 未検証: 全経路parity、残りのstate-by-path、最終production inventory、候補／suite／hot pathのbefore-after、最新変更の全体検証。
  `pnpm quality`は未実行。Task Done gate／Task内Deferredは閉じない。

### Portable HP basis診断の帰属（A5監査中、未解決）

`included:satisfied / naturalLimit / NP1 / 202500`のHP0候補はrankingとcalculatorが計算可能だが、portableが
`scenarioInvalid: ranking_basis_invalid`となる。指定基点c555e4ffの隔離archiveで同じcommandを実行し、
同じHP0・同じ拒否を再現した。分類は`baselineReproducedUnchanged`。現行master .03/schema38/engine33と
基点master .01/schema37/engine32の差はOC切替に伴うもので、HP固定validatorの拒否条件は同じ。
証拠: `.test-results/tsk-06-48-a5/portable-basis-attribution.json`。
この比較は全profileの不変性を証明しない。06.44の変更によるdamage差分へ混ぜず、既存HP witnessの
portable basis契約の独立した引継ぎ候補として残す。A5の全経路parity gateは未成立のまま保持する。

### Step 2 implementation checkpoint（A0／A1とA2接続用fixture）

以下は中間検証であり、Step 2の完了記録ではない。現在はlocal公開master .03（schema45）、payload schema38、engine33、
calculator／ranking／portable／UIの切替を実装済み。HEADは基点c555e4ffのまま、既存の未commit計画変更を保持する。
以下のdraft段階の診断・停止履歴は保持し、解決済み原因と最新の未検証項目を区別する。
最新証拠: read-point反例100 tests成功（2026-09-06T09-53-42-457Z-16-2fba76）、
skill／terminal NP／passive／CE／support／mysticCodeの付与成否からdamage readerまでのparity 11 tests成功
（2026-09-06T09-58-16-649Z-16-9b50cd）、desktop／390px／320px／keyboard／command／resetのE2E 11 tests成功
（2026-09-06T09-54-17-966Z-15-9965b6、warnings/observations 0）。544 testsは接続前基盤の証拠として保持する。
全production／性能after、全条件portable parity、最終qualityは未完了。

- A2実経路診断（未完了）: draft masterでnaturalLimit／included／baseline／NP1を実行し、241 calculatedを観測。
  `.test-results/tsk-06-48-a2/draft-runtime`は接続漏れの診断artifactでありafter完了値ではない。
  OCを共通executorへ委譲した後も`canNormalizeDamageEffect`が通常modifierとして再度unsupportedを作る経路と、
  preparationで合成するactivation factsの重複・非正規順を確認した。前のfixtureはraw成功率・resource条件に集中し、
  OC-only effectのdependency consumerと複数commandでのactivation fact合成を未検証だった。
  normal/dependency compilation双方で委譲済みOCを二重処理せず、入力fact自体のvalidationを維持した上で
  command由来factを正規化して合成する。所有境界・outcomeの変更は不要。反例と再測定は未完了。
- A2 read-point closureの補足: terminal damage専用のcontext writeを準備条件として一律拒否すると、
  OCと非交差の敵への条件付き状態付与でもranking全体がunsupportedになった。terminal NPのOC readerに至る
  prefixだけを準備へ渡す。command間の不確定context writeは成功／不成立に丸めず、当該trait／quantityを
  後続のOC・resource・form条件が読む場合だけ既存unsupportedへ閉じる。Boolean compositionでは無関係な
  branchを全体のunsupportedへ昇格させない。既存の条件stateとtransactionが所有し、新しい製品outcomeは追加しない。
  この補足の実経路反例とproduction再照合は未検証。
- 保存切替のfocused証拠: schema／portable 2 files・35 tests成功
  （`.test-results/2026-09-06T07-17-24-635Z-15-f1cf13`）。schema33〜37の旧resolvedは最終OCを読み替えず
  history-onlyに保持し、旧draftを破棄する。544 unit成功は引き続き接続前基盤の証拠であり実経路完了ではない。
- 接続診断のread-point補足（2026-09-06）: removal-resistanceは未表現stateの「存在し得る」印であり、
  条件不明の付与時点で入力要求にしてはいけない。liveなOC/rate instanceと解除が交差する時点でのみ
  既存unsupported境界を適用する。`draft-runtime-dependencies`で、解除readerのない条件付きmarkerが
  target buff有無を要求する過剰停止を確認した。既存fixtureは確定markerとlive removalの交差だけを検証し、
  条件不明marker→readerなしを欠いていた。unknown/false marker × removalあり/なし × terminal receipt後を
  同じbounded ownerの反例へ追加する。新しいHP/state実行モデルやoutcomeは導入しない。
- Terminal NP本体のresource/context処理は、後続OC操作の前提になるprefixだけを準備へ渡す。
  当該NPのOCは既に確定し、最後のOC reader後のHP回復／NP再充填はOCを変更しない。
  通常damage側のbeforeDamage resource reader判定は既存ownerに残す。`304700`のafterDamage未解決HP対象と
  `901200`のafterDamage選択付き再充填をOC準備へ無条件に加えていた過剰停止を、このread-point境界で除去する。
- Rate条件のread-point補足: `2800100`の初期passive `7362:0`は付与先条件が不明で、後続OC付与がない
  default計算まで`preparationInputRequired`として候補生成をthrowしていた。数値readerのないrate付与の不明性を
  eagerな実行拒否へ昇格させた接続不足であり、HP依存量と同じく既存outcome／executor内で閉じる。
  付与時点の未解決conditionとlifetime／selectorを不確定writeとして保持し、実際に該当rateを読むgrantで
  inputRequired／unsupportedへ戻す。後続時点のfactsで過去の付与成否を確定せず、入力修正後は元requestを再prepareする。
  未読／OC付与／rate付与／確定解除／別recipient／form expiry／rollbackを追加反例とし、未検証のまま完了扱いにしない。

- 解除条件のread-point補足: production `106400`のterminal NPにあるnegative解除は、対象instanceがない場合にも条件入力を要求し、default候補を0件にしていた。付与率の未読反例だけでは解除対象なしを検出できなかった。共通OC state ownerでrecipient／selector／lifetimeの交差を判定し、空集合の解除はnotApplicable、live対象ありの不明条件は従来のinputRequired／unsupportedへ閉じる。未読rateを含む解除・constant・expired・別recipientの反例を追加し、候補欠落0を再照合する。所有境界と製品outcomeは変更しない。

- 排他stateの準備reader補足: `2301100`の2 profileで、canonical `npCardForm`の一方が初期passive／choiceで確定しても、他方を読むOC条件がintrinsic trait未指定によりunknownとなった（default ranking391件、旧393件）。既存normal condition readerにも同じ合成規則があるため、OC固有のfalse補完はせず共通condition ownerで既存exclusive groupの否定証拠を利用する。前のreader反例は正のstate付与と明示falseだけで、排他stateによる否定を欠いていた。排他兄弟あり／なし・無関係trait・rollbackを確認し、未確認の矛盾stateを成立扱いにしない。

- 支援sourceのOC reader補足: production support auditの`2301100:2536550`は支援自身へのOC付与条件を要求していたが、現在のbounded phaseに支援役のNP-useはない。OC boostのrecipientが攻撃役以外でも、有限rateの消費を通じた後続影響は残り得るため、単純な対象除外はしない。live有限rate参加がない場合だけnotApplicableを証明し、参加ありは通常の付与・入力・rollback規則を維持する。既存反例は別source rate量だけで、別source boostの未読と間接消費を欠いていた。

- OC移行時の併存context write補足: 全392 effectsのIR差分照合で、rate grant3 effects（occurrence `1128:0`、enemy recipient）の既存`addTrait buffNegativeEffect`が失われ、target-state inventoryが1411→1408になっていた。原因は`effectNormalization.ts`の敵state正規化からOC rate family全体を除外したこと。writer199件の既存context7件は保存したが、grant family29件と既存damage readerの交差を同じ監査へ含めていなかった。正規化はOC operationとdamage-reachable context operationを併存させる。OC rate ownerと既存context ownerを置換せず、成功時の一度適用／失敗時のrollbackを混在fixtureで確認する。3件の減少は意図的差分ではなく修正対象であり、同inventoryのratchetを下げない。

- 上記の混在反例で、common stochastic resolver自体はpreResolved成否を読む一方、consumer helperのguaranteed fast pathがreceiptのfailureを上書きする経路を確認した。OC raw rateを専用operationへ移した後は通常procがguaranteedでも実効付与率は0になり得る。fast pathよりcommitted outcomeを優先し、terminal NPのselectedEffectsにも共通executorの成否を保存して通常projectionへ渡す。前のcompiler fixtureはpreResolved値の保持だけを検証し、最終activation consumerを通していなかった。skill／terminal NP × rate0/1000 × damage-state readerで実経路を固定する。
- read-point伝播の追加監査（未検証）: 80条件の途中で、外側preparationTransactionがunknownなtrait-only writeを即時拒否し、HP binderがpartyOtherの書込先を即時unsupportedにする経路を確認。共通ledger内の後続reader判定だけを検証し、入口binderと外側transactionの早期拒否を監査しなかった点が前回の検出漏れ。productionの204300では後続HP readerのないpartyOther HP lossを含むskill全体が候補から落ち、既存Quick buffを失うため意図的damage差分には分類しない。最小guardrailは、HP書込範囲をsource除外／不明範囲までcanonicalに保持し、実際のsource HP readerでのみ交差判定すること、trait-only uncertaintyはledgerへ残し、form／variant／gaugeの即時決定と分離すること。反例はpartyOther×attacker/source reader、不明recipient×未読/読取、unknown trait write×未読/後続読取、rollback/retry。既存HP実行モデルやoutcomeを増やさずA2/A3の接続補完として扱う。80条件監査はsatisfiedで202500の実経路parity不一致を検出して停止したため、途中出力を完了証拠にしない。


- A0拡張matrix: 自然上限／Lv90 × 四policy × NP1〜5の40条件を採取。
  `.test-results/tsk-06-48-a0/valid-matrix-manifest.json`が有効artifact一覧の正本。
  `packages/calculation-application/scripts/audit-oc-matrix.ts`は全profileのcanonical input／outcome／actions／metricsを保存する。
  最初のrunの誤った`uniform90`は0 profilesだったため廃棄し、schema validationを追加した`uniformLevel90`の再採取分だけを採用。
  この拡張matrixの時間は他の診断と重なっており、isolated hot-path ratchetには上の3回baselineを使う。
  開始gauge探索を含む旧モデルの測定であり、変更後の固定開始NPの測定と混同しない。
- A1の診断用snapshot生成:
  `pnpm --filter @fgo-lab/data-pipeline exec tsx scripts/audit-oc-normalized-master.ts /tmp/tsk-06-48-master.json`。
  raw5 inputsを一度ずつ読み、全raw OC167 occurrences／632 cellsの段階・Rate・Turn・Countを照合してからsnapshotを生成する。
  未公開sourceを含むraw numeric/lifecycleのgateであり、source lifetime／recipientのgateは次のpublished照合と区別する。
- 公開occurrenceの照合:
  `node packages/data-pipeline/scripts/audit-oc-normalization.mjs /tmp/tsk-06-48-master.json .test-results/tsk-06-48-a0/oc-inventory.json .test-results/tsk-06-48-a0/normalized-oc-cells.json`。
  OC97／rate29、通常・LB計866 cells、generic writer199件の92/2/73/32分類が一致。
  追加されたcanonical operationはgrant97／rate29／remove75／nonintersection131。
  診断snapshot SHA-256は`794cf98300041d9db96e41a8897cee367bc97274f4a4a61c595c8240555ee238`。
- Writer inventoryの差分［確認済み］: 199は旧`stateMutation`だけの母集団だった。
  既に`contextMutation`を持つsubStateが別に7 effectsあり、A1ではその全context operationを保持してOC非交差proofを追加した。
  全206 lifecycle occurrences＝generic199＋既存context7。`contextWriters`を共有inventoryへ追加し、既存operationの完全一致をassertする。
  旧inventoryはgeneric kindで絞っていたため、raw function familyに属する既存typed pathを捕捉していなかった。
  所有境界と期待outcomeは変更せず、raw functionとcanonical operationの双方を照合するguardrailを追加した。
- Pipelineの追加反例: 未知stack rule／未知parameter／未解釈HP量を固定値へ落とさずunsupported。
  未命名selectorはfamily3種のidentityが全て得られた場合だけ非交差を証明し、不完全なidentityや同じidentityの不明名はunsupported。
  `NoCheckIndividualityIfNotUnit=1`はrecipient checkが空のsubStateだけ、空のcheckを省略しても結果が変わらない境界で認識する。
  非空checkや未知値は未解釈として残す。いずれもpipeline内の判定でありruntimeのraw key／ID分岐にはしない。
- 接続前fixture: OC cap、action終端消費、constant再付与防止、同一action再commit拒否、NP receipt後のcell選択、
  condition／policy共通owner、rate付与→HP変更→OC利用、最後の利用後の変更、解除、別source、rollback／retryを確認。
  HP500＋rate200−resistance200では1000、HP1000では800となる値を使い、clampで読取時点の差が隠れないことを検証する。
  HP formulaは既存projectionと共通化。source program cacheには全cellsとstatic conditionだけを置き、runtime stateを入れない。
- Focused verification: `ocSemantics`／`executionSemantics`／pipeline `index`／`ocSourceProgram`／`ocState`／
  `resourceSemantics`／`variantSelection`の7 files／81 tests成功、warnings0。
  artifact `.test-results/2026-09-06T02-07-10-137Z-15-b9fe6f`。
- 続くunit検証は88 files／544 tests成功、8.17秒、warnings0。
  artifact `.test-results/2026-09-06T02-12-16-583Z-15-39bd63`。
  途中のarchitecture検証ではstochastic ownerの115行上限へ抵触したため、実効率判定を`applicationRate.ts`へ分離し、
  ratchetを変更せず再検証した。policy除外rate instanceはHP量を数値へ使わず、物理的な参加回数を消費する反例も追加した。
  `tsc -b`、変更sourceのESLint、`pnpm test:docs`（6 tests＋integrity）が成功。
  最後のnormalization fixture整形後も20 focused tests成功（`.test-results/2026-09-06T02-13-06-661Z-15-93782e`）。

544 testsは接続前基盤の証拠であり、以下の実経路の完了証拠ではない。

現在の接続作業: 準備stateにOC instance／receiptを保持し、CE初期phase、form lifetime、支援phaseを共通sourceから構成中。
準備条件の独自評価は共通condition評価へ移し、入力範囲検証とproc outcomeを別に保持する。
接続中に入力検証迂回と要求由来source quantityの循環的な成立判定を検出したため、focused反例で修正確認中。
追加承認や新Taskは不要。実経路のparity・性能・UIが未検証である点は維持する。

未完了: 初期passive／CE lifetimeとexternal phaseの実経路配置、gauge／formとのcommand transaction統合、
application recoveryとpolicy再prepare、candidate dependency、portable／UI cutover、production parity／性能after。
上のHP state-by-path表は、これらの実経路へ接続するまでDeferredのままとする。`pnpm quality`は未実行、Done gateは未成立。

### Outcome, invariants and review gap

利用者が初期OC1／2／3を選び、通常のみ／成立込みで同じ開始NPを比較する。準備中の自前NP増減とOC加算は
共通executorが適用し、発動時OCをdetailへ返す。初期OCと発動時OCは別の値であり、OC加算はNP gaugeを増やさない。
外部支援・チェイン・最大化・自前OC個別toggleはランキングに追加しない。

Confirmed investigation at `c555e4f`:

- NP5・自然上限・等倍・自己バフあり・成立込みの433 profilesは370 calculated／63 unsupported。
  計算済み370件の発動時OCは1:181件、2:1件、3:188件。これは06.45のdefault baselineとは別条件である。
- 全370件の採用scenario／開始NP／policyを共通calculatorでreplayしたinputとNP1〜5列は一致し、
  NP5順位値もNP5列と一致した。列選択のずれではなく、成立込みの開始NP探索が比較前提を変えていた。
  `RankingConditions.tsx`の「OC1」表示とrequirements旧§4.2／9.1／9.2はこの探索と整合していなかった。
- published master内の`upChagetd` evidenceの調査inventoryは97 occurrences（skill38／36 servants、NP4、CE54、mystic code1）。
  canonical変換後は汎用stateMutationとなり、`packages/battle-execution/src/operationCompiler.ts`の
  preserveSemanticEffect／stateMutationOnly経路では加算段階を実効OCへ反映できていない。
- Typhon skill2の自己対象OC+2を明示実行しても、開始100%でOC1、300%でOC3のままだった。
  期待するOC3／5との差は表示だけでは解消しない。初期100%でも自前NP増加で発動時OCが上がる例もあり、
  初期OC1を最終OC1として固定する修正は誤りとなる。

Mechanism / mismatch: applicationが初期resourceを最大化候補へ含める一方でUIは固定OC1を表示し、
pipelineからexecutorへOC加算の量・識別が保たれない。共有replay一致だけでは同じ誤りを検出できない。
Missed detection: 06.43レビューはstack quantityとPIR-001〜003を閉じたが、NP1採用scenarioのNP5列と
NP5で再最適化した順位の区別、OC加算familyのlossless mappingと表示契約まで監査しなかった。
Recurrence scope: 全OC producer、action admission、準備／NP使用、finite dependency、portable／UI。
この追加調査だけでは06.43由来のregressionとは断定しない。既存レビューの承認履歴は保持する。

調査の一時artifactは `/tmp/fgo-np5-audit.json`、`/tmp/fgo-np5-replay.json`、
`/tmp/fgo-np5-oc-family.json`。実装開始時にHEAD／master digest／commandを伴う再現可能な共有inventoryへ置換し、
一時fileの存在を完了条件にしない。外部順位への一致はoracleにせず、初期OC、field、target相性、stack、
乱数固定値と平均値の差を分離する。OC以外の比較差を本Taskで一括補正しない。

### Step 1 implementation audit (2026-09-06)

基点は `c555e4ff9a208f8da01e56130fbd49e63848e192`。開始時点でTasks、ranking requirements、UI spec、
本note、NP resource note、docs READMEに利用者の未commit変更があり、その計画を仮説として照合した。
本Stepはread-only調査と正本文書更新のみ。上記370件replayは先行調査の記録であり、今回再実行した結果ではない。

#### Production population — confirmed

ローカルのraw JSON全階層を走査し、functionの`buffs[].type = upChagetd`をpathごとに数えた。
published masterは`atlasEvidence.buffTypes`を持つeffectをpathごとに数え、同じfunction IDでも別sourceを潰していない。
これはread-onlyのJSON inventoryであり、normalizeやdamage実行の成功証明ではない。

| Population | OC occurrences | Interpretation |
| --- | ---: | --- |
| `data/raw/nice_servant.json` | 44 | skill40、NP4。passive0 |
| `data/raw/nice_equip.json` | 122 | 強化／limit-break別raw sourceを含む |
| `data/raw/nice_mystic_code.json` | 1 | skill1 |
| `data/raw/referenced_skills.json` | 0 | 参照skill経由はproduction-negative |
| `apps/web/public/master/master.json` | 97 | skill38／36 servants、NP4、CE54、mystic1。raw167件とは母集団が異なる |

SHA-256（ファイルbytes）:

- servant raw: `1abf690ac22bcdd427788e0ff545320af491ee9f90fbc08a56af9603a217118f`
- equip raw: `bb339ac726f8201243410ec82b85a14496e6a8dace54b226071b556604fc27e5`
- mystic raw: `ce6560440673fad4f36f8e08a97b20b4b5d9e2e0e1c5f262943bbf47d8b857cf`
- referenced skills raw: `afdc02f3251dd901c133745203889a0c1c4d23409da17d24634140b5e75107f6`
- published master: `6e96b3f11fdbdef82997be12c84076d4236651d23f4ee7662a4b66a6a272c8f8`

公開97件すべてのexecutionは`stateMutation(add, polarity:unknown)`。recipientはpartyMember40／sourceSelf57。
全件proc guaranteed、triggerScope null。requirementはalways95／any2（recipient trait条件）。
NP4件は全て`timing:afterDamage`であり、`gameActivation:npBeforeDamage`と異なるtiming fieldを持つ。
OC加算の対象をskill38件だけへ縮めず、CEの通常／限界突破values、condition付きparty recipientも保持する。
raw全件ではValue1／2、Turn1／3／-1、Count1／3／4／-1が現れる。公開の通常parameterSetsではCount3、同じCE effectのlimitBreakParameterSetsではCount4を確認した。
この二つを別source occurrenceへ水増しせず、A1で同一effectの通常/LB cellsとして固定する。rawの-1を回数0や欠落に丸めない。
passive、NP-before、stochastic OC、参照skillは現在の公開OC付与母集団では0件であり、fixture＋0件ratchetを使う。

汎用lifecycle writerの公開inventoryは199 operations（remove193、move3、extendDuration2、shortenCount1）。
これはOCへ適用可能な件数ではない。recipientとselectorによる絞り込み前の直接writer母集団である。
`stateMutation`はselectorも持たず、現状masterだけでは全writerのOC非干渉を証明できない。
例えばshortenCountはraw TargetList、moveはDependFunc、removeはraw functionのtrait selectorをpipelineで解釈する必要がある。
Step 1再調査で全199件をrawへ対応させた。分類結果と実装境界は下記「Planning closure correction」に記録する。
汎用lifecycle全体の機能実装を199件すべてに要求する計画ではない。

#### Direct paths — confirmed code evidence and implementation ownership

以下のpathはpackageの`src/`相対。表のVerifiedは現行経路の調査済みを意味し、下のruntime closureを置換しない。

| Path | Current implementation / consequence | Investigation; implementation unit |
| --- | --- | --- |
| Raw → canonical | data-pipeline `executionSemantics.ts`のtypedStateFamilies fallbackはbuff identity／量／lifecycleを持たない。`effectNormalization.ts`はValue/Turn/CountをatlasEvidenceへ残すがmaster-data `index.ts`のstateMutation unionへは出さない。runtimeでrawを読み戻さず専用OC operationへ置換する。 | Verified; A0/A1 |
| Canonical → operation/projection | battle-execution `effectRouting.ts`はstateMutationのrecipientをnullにし、`operationCompiler.ts`はpreserveSemanticEffectまたはstateMutationOnlyへ落とす。`executionPlan.ts`は後者をretainedProjectionsへ移す。加算・正常な不適用・未対応を新typed operationで区別する。 | Verified; A1/A2 |
| Initial state → preparation | application `scenario.ts:resolveScenarioPreparationOutcome` → battle-execution `sourceCollection.ts:resolveAttackerFormExecution` → `preparationState.ts`／`preparationSkillReducer.ts`／`preparationTransformNpReducer.ts`／`preparationAttackNp.ts`。現在はNP resourceとbaseOverchargeのみ。OC grant stateとNP使用receiptを同じtransaction ownerへ追加する。 | Verified; A2 |
| NP-use → effect cells → damage | attack reducerはeffects空でresource全消費、transform reducerはcontext.overchargeでcellsを選ぶ。`sourceCollection.ts`はtransform effectsをterminal input.overchargeで再選択する。`scenario.ts`はMath.max(baseOvercharge ?? 1, scenario.overcharge)、`npDamageCompilation.ts`はその値で本体・条件・倍率をcompileする。各NP自身の使用時OCを固定し、攻撃NPのOCを変身NPへ遡及しない。 | Verified; A2 |
| Automatic/external sources | `sourceCollection.ts`はpassive、CE、support、mystic、NP-beforeを収集し、`executionPlan.ts`はphase順に並べる。現在CEは準備NPより後のphase。OCのconstant付与は最初のNP使用前に有効化する必要があり、既存phaseをそのままOC消費順に転用できない。外部skillの既存入力範囲と順序を明示し、新しい支援editorは作らない。 | Verified; A0/A2 |
| Conditions / recovery | `preparationTransaction.ts:effectChangesPreparation`はOCを読まない。preparationRequirementSatisfiedはfield/opponentをunknownにし、非構造のunknown effectを準備mutationへ含めない。OCをこの経路へ単に追加すると条件付き加算を黙って失う。materialized factsと共通condition ownerへ接続し、未解決はinputRequired/invalid/unsupportedへ戻す。 | Verified; A2 |
| Transaction / alternate writes | `preparationTransaction.ts`のresource plan、skill/transform/attack reducerのstate commit、`preparationState.ts:appendPreparationEffects`、`state.ts:cloneBattleState`、`candidateExecution.ts`のgroup clone/rollback、`candidateRollback.ts`、`variantSelection.ts`のpreappliedOperationIdsが直接対象。付与済みeffectと未消費instanceと使用receiptを区別し、projection replayで再付与しない。 | Verified; A2 |
| Policy reapplication | application `scenario.ts:reapplyPreparedCalculationPolicy`は既存orderedScenarioを再実行しpreparationを再解決しない。policy依存OCをbaseInputへ焼き込む設計ではstale OCになる。policyをexecution contextへ先に渡す。policy変更時は共通prepare入口から再評価し、使用済みreceiptを再利用しない。 | Verified; A2/A3 |
| Selection / commands / capacity | schema `rankingSelection.ts`は6条件、application `rankingBasis.ts`はNP basis変更とpopulation→allのowned→NP1修正を所有。両commandで必要ならinitial OC1変更もatomicにする。schema validationとmaster capacity検証を分け、保有混在はentry単位のcapacity不足を返す。 | Verified; A3/A4 |
| Candidate admission / finite proof | `rankingComparisonPolicy.ts`が成立込みのcapacity列からstartNpGaugeCandidatesを生成、`rankingCandidateSpace.ts`が探索次元化。`rankingActionAdmission.ts`のbaselineは4種の直接modifierだけを実効寄与扱いするため、OC-only/charge-onlyの間接寄与を逃す。`rankingStaticSemantics.ts`はpreserveSemanticEffect条件を除外する。NP gauge→base OCとboost→effective OCの両依存を共通semantic dependencyから読む。 | Verified; A3 |
| Reduction / numeric cache | `rankingStackDomain.ts`はNPの全OC/NP cellsを読むがgeneric preserved operationを依存から除外する。`rankingExecution.ts`／`preparedDamageInputCache.ts`は完成inputをkey化しnpLevelだけ正規化する。OC変化前のrequestや選択済みNP1 scenarioをNP5再最適化と同値扱いしない。 | Verified; A3/A5 |
| Portable / persistence / reset | schema `index.ts`のranking intentはinitialNpGaugeとpolicy/basisを別保持、calculator intentは10000固定。application `portableCalculation.ts`、`rankingPortableBasis.ts`、Web `app/rankingHandoff.ts`／`portableDraft.ts`とworkspace-domainがdraft/historyへ渡す。profile/backup migrationは古いrequestからcalculator10000を作る経路もある。旧OC modelを再実行可能な新requestへ暗黙変換しない。historicalOnly表示と再生成を区別する。 | Verified; A4 |
| URL / worker / UI | Web `rankingState.ts`のcomplete6キー判定、`rankingWorkerProtocol.ts`のrequest/detail payload、`rankingWorkerRuntime.ts`のfingerprint別cache、`useRanking.ts`のstale判定、application `rankingContracts.ts`等の比較identity、Web `RankingConditions.tsx`のOC1固定、`rankingDetailPresentation.ts`の開始NP、calculator `Calculator.tsx`のscenario.overcharge writerを一括切替する。 | Verified; A4 |
| Shared numeric execution | `rankingPolicyScenario.ts`が開始NPをpreparation optionへ渡し、`rankingExecution.ts`と`portableCalculation.ts`がapplication scenarioのprepare/evaluateへ合流する。calculator/ranking独自のOC計算は追加しない。 | Verified; A2–A5 |

#### Design decisions, unresolved contracts and review-gap delta

確定した設計方針:

- 初期OCはranking intent。開始NPへの変換とcapacityのownerはapplication＋既存canonical NP resource。
  gauge／boost instances／NP-use receipt（消費前gauge、base OC、適用boost、effective OC、消費根拠）を区別する。
  effective OCのownerはbattle-executionで、application/Webは値を足したりMath.maxしたりしない。
- 専用OC operationは段階のvalue cells、canonical recipient/requirement、duration/count、stacking根拠を持つ。
  -1などraw表記はpipelineで解釈し、無制限と有限をtyped unionにする。曖昧なセルを1へ補完しない。
- 準備の付与・実際のNP使用・消費・再付与を一つのordered stateへ閉じる。NP-before/afterを見かけの
  gameActivationだけで解釈しない。NP自身のOC依存効果は当該use receiptを読む。
- generic state removal/move/extend/shortenがactive OCへ到達する経路もfamily内に含む。未解釈writerを成功no-opにせず、
  canonical selectorでOCへ到達しない証明かbounded executionを必要とする。全buff simulatorへの拡張はしない。
- 加算stateとpolicy上の有効寄与は区別する。structuralRequired actionの実行事実を消さず、四policyで使用OCを再導出する。
  optional OC/NP charge actionは後続のOC-sensitive reader／NP到達性へ寄与する場合を検証し、無関係actionを無制限に増やさない。

#### Planning closure correction — user review after Step 1 report

前回報告の「Step 1完了」は訂正する。OC lifecycle、writer到達性、policy再適用の設計選択を未確定のまま
実装単位A0へ送ったため、実装範囲を確定する調査が終わっていなかった。利用者の指摘を受けて同じStep 1を再開し、
下記を製品コード変更なしで確認した。A0は実装直前の再現可能baseline計測に限定し、仕様選択の延期先にはしない。
manualの最終OC1〜5維持は利用者確認済み。resolvedは提案どおり初期OC1〜3と発動時OC表示へ統一する計画で、
最終入力のoverchargeはmanual/damage inputだけに残し、resolved requestの別名として残さない。

**1. Writer母集団の閉鎖［確認済み］**

rawのfunctionをfuncIdでjoinし、全候補のtarget、traitVals、TargetList、DependFuncを比較した。
9 occurrencesはraw value variantを複数持つが、下記OC到達性分類は全variantで一致する。unmapped0、分類矛盾0。
IDはaudit joinだけに使い、runtime分岐はcanonical recipientとtyped state selectorで行う。

| Disjoint partition | Count | OC stateへの到達性・実装責務 |
| --- | ---: | --- |
| targetが敵 | 92 | remove91＋extend1。今回のattacker OCを変更しない。partyOtherは支援originでattackerへ届き得るため、この区分には含めていない。 |
| selectorがOCと非交差 | 105 | remove100、move3、shorten1、extend1。removeは弱体/攻防/個別state等のselectorでbuffPositiveEffect単独のOCと非交差。moveはDependFuncのcurseまたはNP-charge-block selector。shortenはTargetList[2886]。extendは味方の毎turn系selector。 |
| 自身の強化解除 | 2 | `21513`（600300 skill）、`22699`（603500 NP-before）。removableなOC instanceに到達可能。使った後のreceiptは変更しない。 |

extend1はTarget=-1／TargetList[3060,3080,3081]でOCのbuff trait3004と非交差。
全167 raw OC付与のbuff定義は同じ形で、buffGroup0、maxRate5、valsはbuffPositiveEffectだけ、
script/ckSelfIndv/ckOpIndvは空。functionのfuncGroup/scriptも空。rawパラメータ632 cellsは全て
Rate/Turn/Count/Valueを持ち、追加はpresentationとrecipient checkの2キーだけだった。
これにより現行OCを「全beneficial state一般」として実装する必要はなく、OC familyへのselector適用だけを閉じられる。

解除2件のscope判定:

- skillの強化解除はNP使用前。現行rankingでは当該actorの自前OC付与がなく、新たなOC数値差は発生しない。
  calculatorの現在のphase順では支援/mystic skillはこの準備skillより後、CEはpassive sourceで解除対象外。
  schema-legalな「OC skill→解除→NP」はremovable instanceを消してbase OCへ戻るfocused fixtureで閉じる。
- NP-beforeの強化解除はNP-use receipt確定後。当該NPのOCは変わらない。将来のNPがあれば残存instanceに影響するが、
  このproduction actorのterminal attack後に次のNP readerはない。NP-afterの付与も同じく現在damageへ先取りしない。
- removal resistanceは当該NP-before解除の成功率を変えるが、確定済みOCと現在damageのOC入力を変えない。
  将来fixtureで「removal resistance→解除→未実行NP」がliveになる場合は、未表現resistanceを無視せず
  `unsupported`へ閉じる。全buff解除確率の新シミュレーターは作らない。removalのRateと既存procで確定できるfixtureは
  applied／stochastic failureに分け、相手対象・selector不一致・immutable sourceは正常な非適用とする。

**付与成功率を含む再発範囲［同じ調査で追加確認］**

199件の92/105/2分類は**OC instanceそのもの**への到達性。これだけでfamily全体の閉鎖とはしない。
付与率の直接transformerまで辿ると、公開masterにpositive buff対象のrate modifierが29 effectsある
（servant22、CE7）。内訳はgrant success up12、recipient success up12、recipient resistance up4、grant success down1。
rawのbuff定義からcaster側とrecipient側のselectorを分離する。これらも現状は量・対象役割を保持しないgeneric state等であり、
actor trait条件として再解釈してはならない。

- `21623`（703500 skill）は自身へのpositive buff resistance+1000、付与Rate5000。
  自前OCはないが、calculatorでこのskill後に支援OC（通常Rate1000）を付けると、補助なしでは成功率0になる。
  mystic OCのraw Rate5000なら低下後も確定となる。既存の`proc:guaranteed`だけを保持するとこの差を失う。
- `7362`はcaster側のgrant success down200だが、対象はraw intrinsic selectorで限定される。
  現行OC付与casterとのintersectionは0。名前やservant IDの例外ではなくcanonical caster identity predicateで非交差を証明する。
- recipient resistance upの残り3件は敵対象でattacker OCには届かない。positive avoidStateのattacker対象は0。
  空tvalsを持つraw avoidStateもckOpIndv[2852]で限定され、OC buff traitとは非交差。
- OC段階値に作用するbuffRate selectorは現行0（既存1件はNP damage buff限定）。将来のunknown value transformerはunsupported。

29 rate effectsのstate traitsはpositive、negative、buff-grant-success-upの3種。これまで非交差105件としたwriterのうち
73件はこの**rate prerequisite**へは届き得る。したがってfamily全体の保守的なwriter区分は
**敵92／OC直接2／rate prerequisite73／両者と非交差32 = 199**とする。
73件を無効果として除外しない。canonical selectorでOCとrate stateの両collectionを同じcommand内で除去できる設計にする。
producer/consumerはこのbounded sliceに限定し、任意の全buff state simulatorへ拡張しない。

採用設計:

- pipelineはOC付与と29 rate effectsについてrawの**clamp前application rate**、caster/recipient role、
  effect-family selector、signed additive adjustment、lifecycle、grant sourceをcanonical化する。
  intrinsic recipient条件と「どのbuff種の成功率を変えるか」のselectorを別fieldにする。
- command interpreterがsource/recipientの現在rate stateを読み、OC付与時の実効率を
  `clamp(baseApplicationRate + casterGrantAdjustment - recipientResistance, 0, 1000)`で導出する。
  constant passive付与はcanonicalなpassive application ruleで扱い、確率補正を遡及しない。
- rate modifierの付与自体も同じ入口を通す。補助rate stateが成立したと勝手に仮定しない。
  0は確率不成立、1000は確定、中間は既存canonical proc witnessの0/1入力へ接続し、入力がなければinputRequired。
  static source programはraw guaranteedだけから「必要proc入力なし」と早期決定しない。
- queryで使った有限rate stateの回数はcommand/action終端で一度だけ消費する。失敗したOC grantは正常な不成立であり、
  使用した補助stateまでtransaction rollbackしない。semantic invalid/inputRequiredによるcommand拒否とは区別する。
- removalはOC instanceとrate prerequisiteを同じtyped selectorで処理し、immutable/passiveを維持する。
  未対応live removal resistanceは明示unsupported（現在のOC数値を変えるproduction交差は0）。
- このrate familyを他の全damage buffの成功率修正へ広げる作業は本Taskで行わない。ただしOCへ至るrate調整の付与・解除は
  すべて同じbounded sliceに含む。非OC familyの既存問題を今回の数値補正へ混ぜない。

公開canonicalのbuffPositiveEffect参照106 effectsは汎用stateMutation86／enemyへのcontextMutation20で、
当該traitを読むdamageModifier/NP本体は0。OCを新しいactor trait書込として公開し、この誤ったselector解釈を活性化しない。
A1でOC/rate selectorをcanonical operationへ移し、scalar actor conditionへ戻さない。

**2. NP使用・stacking・lifecycle規則［根拠付き設計判断］**

ローカルrawに加え、以下の公開資料/公開実装をread-onlyで照合した。ゲーム実行の独立実測とは区別する。

- [Atlas fgo-docs / buff group and limits](https://github.com/atlasacademy/fgo-docs/blob/4d905267350e8078f46889ab19f6fc54f564a3ed/README.md#unstackable-buffs): group0は加算を共存可能、非zero groupは非重複。
- [Chaldea activateNP / getBuffValue](https://github.com/chaldea-center/chaldea/blob/9fa75655c07ecd76168b1ccf5b8232e8d64664cf/lib/app/battle/models/svt_entity.dart#L1732): OCをNP functionsより先に確定し、全該当buffを使用記録してから合算・capする。
- [Chaldea withAction](https://github.com/chaldea-center/chaldea/blob/9fa75655c07ecd76168b1ccf5b8232e8d64664cf/lib/app/battle/models/battle.dart#L237) / [BuffData useOnce](https://github.com/chaldea-center/chaldea/blob/9fa75655c07ecd76168b1ccf5b8232e8d64664cf/lib/app/battle/models/buff.dart#L589): action終端で使用済みinstanceの有限countだけを減らす。
- [Chaldea addState](https://github.com/chaldea-center/chaldea/blob/9fa75655c07ecd76168b1ccf5b8232e8d64664cf/lib/app/battle/functions/add_state.dart#L27) / [subState](https://github.com/chaldea-center/chaldea/blob/9fa75655c07ecd76168b1ccf5b8232e8d64664cf/lib/app/battle/functions/sub_state.dart#L26): passive sourceとactive buffを分離。raw CE122 sourcesは全てpassive型であり、同じOC buffでもskill付与と解除可能性が違う。

ここから採用するbounded executor規則:

1. 開始時にCE constantを一度だけ付与。form passiveはそのformのsource lifetimeで有効化し、terminal passiveを
   初期formへ遡及しない。OC/rateのgrant source identityと付与instance identityを区別し、再compileで回数を補充しない。
2. 既存calculatorのordered own commandsを実行。support/mysticの既存選択skillは現在の順序どおり
   own preparationの後、terminal attack NP-useの前に実行する。CE constantだけを実際の初期lifetimeへ移す。
   外部skillを変身NP前へ移す新しい順序editorは追加しない。
3. NPのexecution preconditionを検証後、全消費前gaugeからbase OCを導出する。
   その時点で有効なOC instanceを列挙し、policy上の寄与を分離してeffective OC=min(5, base OC+対象加算)を固定する。
   加算総和・clamp後段階・参加instance・policy除外instanceをreceiptへ記録する。
4. NP-before、NP本体、NP-afterのvalue/proc/condition cellsは**当該receipt**を読む。
   NP-beforeの新規OC付与は当該NPのOCを上げず、解除も確定済みOCを下げない。循環再計算は行わない。
5. NP action終端で、使用開始時に参加したinstanceの有限countを1だけ消費する。cap5で数値寄与が飽和していても
   参加した全instanceが消費対象。途中の新規付与は未使用なので消費しない。無制限countは減らさない。
   途中解除されたinstanceを復活させない。count0はinactive、Turn0は期限切れ、-1はunlimitedとして区別する。
6. command全体の失敗ではgauge、form、OC/rate grant、receipt、残countをrollbackする。receiptを確定結果としてUIへ出すのはcommit後。
   同一turnのためdurationを保存するがturn tickは行わない。

productionのgroup0をtyped `additive`へ正規化する。未検証のnonzero group、unknown stack rule、動的OC段階expression、
不足cellはsupported additiveへ丸めずinvalid/unsupported。これらを実装時の新しい設計判断にせず反例の期待outcomeとして固定する。

**3. 実行ownerとpolicy再適用［単一案へ確定］**

二段構成をそのまま二重実行に使わない。battle-executionの準備transactionを有限command interpreterとして拡張し、
NP gauge/OC/OC付与率/formのwriteとNP-use receiptを唯一所有させる。外側のapplicationは次の順序を共通入口として組み立てる。

`validated request + policy + resolved world/input facts → canonical source program → command interpreter → committed receipts → damage/effect projection → result`

- source programのstatic段階は全OC cellsを保持し、OCで変わる値/確率をOC1に早期固定しない。
  command interpreterは既存compileEffectCondition/condition/activation/stochastic ownerを呼ぶ。
  field/target/input factsは準備**前**に解決して渡し、rate状態はcommand順に更新する。preparationRequirementSatisfied独自のunknown-as-no-mutation経路を
  OC readerには使わない。unsupportedなlive inputはrequired-input/invalid/unsupportedとして戻す。
- 実行済みeffectはinstanceとreceiptで引き継ぎ、sourceCollection/通常operation loopはそのwriteを再適用しない。
  damage projectionは対応するNP receiptでcellを選ぶ。preapplyはform/variantの既存適用記録にOCのcommit記録を結び付ける。
  全変数をapplication orchestratorへ戻さず、battle-execution内のfocused moduleへ分ける。
- grant事実とcontribution inclusionを分離する。structural-required actionのresource/form mutationは維持する。
  使用時のphysical参加instanceとpolicy上加算へ含めるinstanceを別集合にし、除外された寄与を後続で復活させない。
  自己バフなしのoptional skillは現行source policyどおりadmitしない。baselineではconditional OC寄与を数値へ含めない。
- `reapplyPreparedCalculationPolicy`は共通prepare入口へ元request＋新policyを渡して再評価する経路に一本化する。
  cached baseInputへboostを焼き込んでprojectionだけ替える案は採用しない。immutable source programのcompile cacheは再利用可、
  使用済みstate/receipt cacheは再利用不可。without-areaも同じ規則を通す。

**4. 候補生成の責務とbound［計画時に確認済み］**

現行master一回parse、既存compileStaticRankingPreparationPrograms/compileCandidateLocalActionAdmissionを直接呼んだread-only audit:
422 attack servants／433 profiles、static programs7,255、1 profile最大60。
included baselineのadmitted programs2,034、included satisfied6,722。
attack servant範囲のOC skill source29件中13件は直接damageModifier/modifierRateChange/ignoreDefense/ignoreDamageCutを持たない。
これは「13件すべてが新しい最適解になる」という測定ではない。source単位の現行baseline admission漏れ候補である。

新規action/skill再使用/初期gauge探索は追加しない。既存static program全集合から、以下のcanonical依存を逆向きに辿る。

- NP body/effectの全OC cells（値、condition、proc）→ NP-use effective OC → boost grant/remove、gauge→base OC。
- OC grant→effective application rate→caster/recipient rate stateの付与/解除/条件。
- NP使用precondition／後続skill cost→gauge gain/loss。単なるcharge-onlyも、この到達性またはOC-sensitive readerを持つときだけ実効寄与候補。
- transitive condition/input/state writerと排他branchはprogramの順序で保持。unknown dependencyで削減を証明しない。

通常単一form・選択なしの3skillならpartial permutationは1+3+6+6=16。実測の最大60は既存form/branchを含む。
このstatic boundを増やさず、world/quantity domainは既存4,096 certificateへ合成する。OC-sensitive dependencyがある
quantityはmonotone/aggregate reductionを解除して完全な小domainを使う。全探索oracleはplan順序も比較する。
初期OCは一つの意図値でありdimension cardinalityを増やさない。source program/全cellsのdependency解析はcandidateごとに繰り返さず
master/program単位に共有する。policyごとのruntime時間はA0/A5で測るが、処理構造の選択をその測定へ先送りしない。

**5. 固定した反例期待値（実行testはStep 2）**

| Canonical input / path | Expected rule/outcome |
| --- | --- |
| initial100%, NP2、own gain100%、boostなし | gauge200%→base/effective OC2。initialOC1自体は不変 |
| initial300%、+2/count1を2 instances | base3、合算4、effective5。NP終端で両instance count0 |
| initial100%、+2/count1→transform NP→after grant+1/count1→gain100%→attack | transform OC3、元boost消費。attack OC2、新boostだけ消費。変身NPのcellsをattack OC2で読み直さない |
| initial100%、NP-before grant+2/count1 | 当該NP OC1、new instance未消費。次のNPがあれば加算可能 |
| initial100%、+2/count2→NP-before remove positive | 当該NP OC3。removableなら残instance除去、CE/passiveなら除去されず使用分count1。receiptは不変 |
| recipient resistance1000の後にOC付与、caster補助0 | base application rate1000なら不成立、5000なら確定。両者をguaranteedへ潰さない |
| recipient resistance1000、caster grant bonus200、OC baseRate1000 | 実効200。proc witnessなしはinputRequired、失敗ならinstanceなし、成功なら付与。policy baseline/satisfiedは同じ既存proc入力規則を使う |
| rate stateを解除→OC grant | 解除後stateで成功率を導出。解除不能なら保持。補助stateの付与が失敗した場合も未適用として読む |
| count1使用NPでsibling invalid、またはrequired input不足 | actionをcommitしない。gauge/instance/count/receiptを元に戻す |
| unchanged requestでpolicy再適用／without-area | fresh request executionとinput/outcome/receiptが一致。以前のOCを再利用しない |
| nonzero group／live unknown removal resistance／OC-sensitive unknown writer | additive/成功/OC1へfallbackせずunsupported。malformed/missing canonical cellはinvalid |

Planning closure: 上の調査・設計判断はVerified、未決定のowner/順序/production分類は0。
実装と実行testの証明は下のruntime matrixにDeferredとして残す。現在の数値結果を修正・検証したとの主張ではない。

追加のcause analysis（先行調査の共通原因へ追加するdelta）:

- 発生機構［確認済み］: OCをresource準備前後で数値だけ受け渡し、sourceCollectionが準備NPのOCをterminal OCで読む。
  operationCompilerの汎用state保持は量も回数も実行せず、policy再適用はその既存base inputを再利用する。
- 実装とのズレ［推論］: gauge由来base OC修正を全OC closureと捉えると、effect付与からNP使用receiptまでのowner不在が残る。
  根拠は上記scenario/preparation/sourceCollectionの異なるOC reader。
- 検出漏れ［確認済み］: 既存06.44計画は具体reader/writerが未記入で、変身NPのcell再選択、constant CEの初回消費、
  policy再適用、population変更によるNP1復帰、保存migrationの交差が明示されていなかった。
- 再発範囲［推論］: 同じpathを通る全OC付与とOC-sensitive効果。最小guardrailは下記追加matrixとStep 1の母集団対応表。
  特定servantの期待damageだけを修正単位にしない。既存06.43承認の取消やregression帰属は主張しない。

### Canonical flow inventory delta

NP gaugeの既存ownerは `docs/evidence/np-resource-semantics-flow-tsk-04.md` に維持し、
本節は選択初期OC／OC加算state／発動時OCという追加familyだけを所有する。
上のStep 1 inventoryで具体producer／consumerを固定した。以後は差分のみ更新する。外部sourceの監査は既存calculatorの共有経路を閉じるためである。

| Path / owner | Required delta | Status |
| --- | --- | --- |
| Pipeline → master/schema admission | 全skill／NP／passive／CE／mystic sourceのOC段階、recipient、condition、duration/count、stacking semanticsを根拠付きtyped IRへ保持。曖昧値・欠落値・未知対象を無効果扱いしない。 | Verified: IR |
| Application comparison → scenario | 選択初期OCを開始100／200／300%へ変換。指定NP capacity validationと保有混在のcapacity不足を区別。宝具Lv変更と初期OC修正をatomic commandで適用。 | Verified: APP |
| Application admission → finite candidates | 両condition modeで開始NP候補を1つに固定。own OC boostの間接寄与を判定し、適用条件／実効OC／NP倍率依存をdomain proofとdedup keyに含める。 | Verified: APP |
| Executor preparation → NP → damage | gauge由来base OCとactive OC boostを別stateとして保持。自己へ適用可能なrecipientをcanonical解決し、NP本体処理前のOC確定・上限・action終端の回数消費・変身NP・NP前後effectを順序通り評価。 | Verified: EXEC / APP |
| Transaction recovery → application | clone、rollback、failed command、retryでgauge／OC boost／countを同時復元。失敗後に加算残留、回数先消費、二重適用を起こさない。 | Verified: EXEC / APP |
| Request → URL／worker／cache／portable | versionと初期OC identityを同時切替。旧payloadの曖昧な開始NPをOC1で補完せず拒否し再生成commandへ戻す。異なるOCのcache混用・stale resultを拒否。 | Verified: IDENTITY/UI |
| Result → UI／calculator replay／reset | 初期OCと発動時OCを区別して表示し、採用開始NP／ordered plan／policyを同じexecutorで再現。normal resetは開始100%と通常policyへatomicに戻す。 | Verified: APP / IDENTITY/UI |
| Production audit → downstream baseline | 共有master一回でfamily inventory、NP5再最適化、合法OC matrix、parity／damage input差、candidate数とhot-pathを測定。06.45へpolicy付きbaselineを渡す。 | Verified: PRODUCTION / 性能の確定 |
| New external support／full turn simulator | ランキングの製品範囲外。既存calculator経路の正規化監査を理由に機能追加しない。 | N/A: no product requirement |

### State-by-path counterexamples and outcome classes

`calculated`、policy上のcapacity不足／到達不能 `unavailableUnderPolicy`、修正可能な必須input不足
`inputRequired`、矛盾input／IR `invalid`、意味未対応 `unsupported`を分離する。確率不成立やpolicyによる
不採用は成功した加算と区別したeffect evidenceで保持し、それだけでprofile全体をunsupportedにしない。

| State × path | Minimum guardrail | Status |
| --- | --- | --- |
| NP1／NP2〜4／NP5 × initial OC1〜3 | 境界内は同じ初期gauge、指定NPで境界外のrequestは拒否。保有混在は容量不足だけtyped unavailable。UI変更は修正値も表示。 | Verified: APP / IDENTITY/UI |
| baseline／satisfied × included／excluded | 全四policyで初期gauge不変。optional own boostのadmission／不採用とstructural-required actionを区別し、最大化名目で外部加算を混入しない。 | Verified: APP |
| own gauge gain／loss × boost0／+1／+2／cap超過 | 初期100%→自前charge→base OC2、初期300%＋2→OC5、NP不足、複数加算と上限を小fixtureで固定。 | Verified: EXEC / APP |
| skill／automatic／NP-before／NP-after × self／party-including-self／other-only | 対象・タイミング・確率・条件・期間／回数・重複制約を保持。自身へ不適用と未解釈を分離し、当該NP後の効果を先取りしない。 | Verified: EXEC / APP |
| transform NP → attack NP × count1／複数回 | 実際のNP使用だけで正しい回数消費。先行NPで使い切った加算を攻撃NPへ残さず、再付与も正しい順序で反映。 | Verified: EXEC / APP |
| failed transaction／rollback／clone／retry | gaugeとboost duration/countが同時復元。数値・outcome・evidenceを共通calculator／rankingで比較。 | Verified: EXEC / APP |
| missing／conflicting／unknown canonical semantics | 無効果・OC1・成功へfallbackせず明示停止。production-negativeもschema-legal focused fixtureで検証。 | Verified: IR / EXEC |
| OC-sensitive NP cells × quantity reduction／ordered plan | 小さい有限全探索oracleと採用候補一致。NP level列を再利用する場合はcomplete input同一性を証明。 | Verified: APP |
| URL／worker／cache／portable × OC change／old version／normal reset | identity衝突0、stale拒否、同一入力replay、旧request拒否後の再生成、reset後の非baseline state残留0。 | Verified: IDENTITY/UI |

Additional Step 1 counterexamples（既存matrixへのdelta、実装単位はTasks正本）:

| State × path | Minimum guardrail | Status |
| --- | --- | --- |
| transform OC1 → attack OC3 × OC-dependent value/proc | 各useのreceiptで異なるcellを評価。先行NPでCount1消費後、当該NP-after再付与だけを次の攻撃NPへ残す。 | Verified: EXEC / APP |
| constant CE count1／3／LB4 × transform→attack | constantをNP使用前に一度だけ付与し、変身NP消費を記録。effect projectionで再付与しない。raw LB4のmappingを検証する。 | Verified: IR / EXEC |
| conditional boost × field/recipientState／all/any/not／unknown × preparation/retry | materialized factsで通常loopと準備が同じtruthを読む。unknownをno-opや成功へ落とさずrequired-input recoveryへ接続。 | Verified: EXEC / APP |
| boost + sibling invalid × group rollback／preapply | gauge・instance・残回数・receiptをatomicに戻す。form/variant preapplyから加算を二重実行しない。 | Verified: EXEC / APP |
| remove/move/extend/shorten × active OC／unrelated state | canonical selectorで関連性を証明。OC対象writerを汎用stateMutation成功として捨てない。未対応は明示停止。 | Verified: IR / EXEC |
| policy reapply／without-area projection × conditional OC | prepared scenarioの再利用で以前のeffective OCが残らず、fresh executionとinput/outcome/receipt一致。 | Verified: APP |
| charge-only／OC-only × sensitive/insensitive NP／structural-required | baseline admissionも間接寄与を発見。unknown dependencyにendpoint reductionを使わず、小domain全探索oracleで採用plan一致。 | Verified: APP |
| owned NP5+initial3 → population all→NP1 | population commandもinitial1への修正を明示しatomic適用。直接不正requestは拒否、保有混在の低capacity行はunavailable。 | Verified: APP / IDENTITY/UI |
| old-only／canonical-only／mixed contradictory × parser/migration/backup/draft/history/share | parserのunknown-key除去で旧overchargeが失われたまま成功しない。historicalOnlyと再実行を分離し、再生成commandへ戻す。 | Verified: IDENTITY/UI |
| selected NP1 result matrix vs separately optimized NP5 × cache | 共通完成inputの一致だけでdamage matrixを再利用。NP5最適planとOCが異なる列をNP1採用scenarioの列から代用しない。 | Verified: APP / PRODUCTION（NP5独立選択差分） |
| turn progression／skill reuse／new ranking support | 同一turn有限準備の外。durationの保持をturn simulatorや支援UI追加へ拡大しない。 | N/A: outside approved product scope |

The current dispositions above supersede the planning-only status. Runtime counterexamples are
Verified by the evidence groups in the 2026-09-08 closure section. The 80-condition production matrix also passes with zero selected-result parity failures.
The performance comparison and final quality gate pass. All TSK-06.44 scoped paths are Verified
or justified N/A, with Blocking and task-local Deferred both zero.


## TSK-06.43 — review approval and next-task handoff (2026-09-06)

Independent re-review and root adjudication: **Approved**, PIR-001–003 all **Resolved**,
no new material finding, Blocking **0**. Reviewed HEAD was `26eae69` plus the complete
79-file implementation; all hashes matched the implementation response at review completion.

- PIR-001: preparation rejects stack-dependent resource/structural requirements before transaction
  commit through one shared typed support classifier; calculator/ranking/portable and all three
  state scopes, nested conditions, retry and transform-NP paths are covered.
- PIR-002: aggregate reduction observes executor-owned NP dependencies across all OC/NP cells,
  additional readers/writers and exclusive sources. Focused exhaustive oracles preserve maxima;
  unproved domains remain complete or explicitly unsupported.
- PIR-003: master admission rejects conflicting physical-source baselines across NP/effect/variant/CE
  definitions while permitting distinct reader caps. HEAD schema43 caches are rejected by schema44
  admission; no intermediate unpublished schema44 deployment is assumed.

Fresh reviewer verification: focused17 and production119 pass; final `pnpm quality` passes in
234.94s at `.test-results/2026-09-05T19-31-18-851Z-15-53be95`, unit495/production119/Playwright25,
zero skip/todo/retry/warning/unexpected console and artifact integrity errors. The complete 433-profile
candidate inventory, both representative maximum artifacts, audit digest and work counters equal
the initial review boundary. Stored controlled compile medians were independently checked:
5412.219ms → 5556.779ms (+2.67%), with unchanged counters. No fresh six-run performance benchmark
or separate manual browser session was run during re-review. Full append-only review history is
in the temporary external record `/tmp/fgo-lab-tsk-06.43-review-odmwuw5j/review.md`; this section
retains its completion evidence independently of that temporary file.

TSK-06.43 is done; TSK-06.45 is ready and unstarted. The next task reuses the existing 06.45
trigger/resource flow matrix below, verifies its default baseline against the committed master,
and closes relevance-aware admission, typed dependent amounts, HP/battle-point state and ordered
execution/recovery. Its default 433/433 ranking and 422/422 calculator goals must not be confused
with the satisfied-policy 385-ready/48-unsupported inventory measured for 06.43. Stack preparation
support and combined target-world/count conflicts remain explicit unsupported until their scoped
owners provide a proof; no numeric fallback or partial maximum is accepted. Later owners remain
06.47 contribution presentation, 06.5 final maximum and 07 Web/worker cutover.

The implementation/verification sections below are historical; their pending-review statements
are superseded by this approval.

## TSK-06.43 — accepted review findings implementation (2026-09-06)

PIR-001–003 were Accepted in the initial post-implementation review at HEAD `26eae69`.
The user authorized their implementation with「引き継いでください」. The reviewed 68 tracked
and eight untracked files still match the review snapshot; all existing changes are preserved.
The earlier Step 2 completion below is historical until this follow-up is verified and re-reviewed.

The inventory missed three direct boundaries: preparation target/field writers before stack-dependent
resource conditions, NP-body readers in aggregate domain reduction, and conflicting physical-source
defaults at master admission. These are schema-legal counterexamples, not observed production damage
regressions. Existing tests covered final attacker mutation, static aggregate readers with a standard NP,
and helper-level conflict rejection; they did not cross those boundaries.

| Delta / semantic owner | Required behavior and minimum counterexamples | Status |
| --- | --- | --- |
| PIR-001: battle-execution preparation support | All scopes and nested stack-dependent preparation requirements reject explicitly until preparation models all ordered writers. Never fund an attack using stale counts. | Verified: `stackPreparationSupport.test.ts` covers add/remove, 0/1/max, comparisons/composition, retry, transform-NP pre-consumption, calculator/ranking/portable; shared production inventory ratchets these requirements at zero. |
| PIR-002: executor dependency → application finite proof | Inspect NP-body dependencies across OC/NP cells as well as effect operations; preserve complete domains for shared readers, unknown live dependencies and exclusive sources. | Verified: `rankingStackDomain.test.ts` numeric stateTrait/traitExpression aggregate oracles, trait support boundary and nested/exclusive guards; complete production candidate inventory unchanged. |
| PIR-003: master admission | Reject conflicting defaults for one physical stack source before calculator initialization, while permitting different reader caps. | Verified: `stackMasterAdmission.test.ts` legal controls and conflicting NP/effect/variant/CE definitions; `stackInputDefaultsAgree` shared by master admission and execution merge. |

The PIR-001 support boundary is deliberately bounded: generic ordered battle simulation is outside
this task. Stack-dependent preparation activation becomes typed unsupported; ordinary stack modifiers
and NP damage remain supported. Source identity/default validation belongs to master-data, not Web.
No schema shape, candidate cap, snapshot tolerance or servant-specific runtime rule is added.
Verification: isolated production audit before/after ×3, focused semantic regressions, unit/production,
and `pnpm quality` as the final phase gate. Independent review retains finding resolution authority.

Implementation verification before the final gate: focused 17 tests pass
(`2026-09-05T19-09-04-373Z-44-25459c`), unit 495 pass
(`2026-09-05T19-09-43-491Z-15-c663f6`), final standalone production 119 pass in 34.68s
(`2026-09-05T19-17-08-150Z-15-4fad02`; same-boundary before 37.21s).
The complete `stack-candidate-domains.json` equals the pre-fix review artifact: 385 ready and
48 unsupported profiles, largest admitted bound 3,840, cap 4,096. Both representative maximum
artifacts (1101000/2501300), including scenario, policy, full input and NP1–5 output, are identical.
No production damage/input digest, generated master, screenshot or threshold was updated.

The expanded trait NP fixture exposes an existing support boundary: combined target-world witnesses
can conflict with independently assigned state counts. It remains explicit unsupported, with no
reduced numeric maximum. This follow-up does not implement that additional world-generation behavior.
The final phase gate and before/after timing records are appended to the external review record;
finding resolution and Task completion remain pending independent re-review.

## TSK-06.43 — Step 2 implementation and verification (2026-09-06)

Explicit implementation approval followed Step 1. HEAD remains `26eae69`; the two approved planning
notes were the only modified files at the Step 2 boundary. A0 baseline artifacts were captured before
product edits. The semantic cutover is **master manifest schema 44 / scenario schema 37 / engine 32.0.0**.
The published artifact is `20260906.01`, SHA-256
`6e96b3f11fdbdef82997be12c84076d4236651d23f4ee7662a4b66a6a272c8f8` (30,127,202 bytes).
Measured development artifact `20260906-tsk0643-3` differs only in its top-level version string;
substituting that string into the final bytes reproduces its SHA-256
`3ecb6b6b37bf5804ac1d6b56af3dfaea877d17ef3a2d193a762253ca825155c3` exactly.
Raw input and requirements are unchanged. Final `pnpm quality`: **PASS**, 269.27s, artifact
`.test-results/2026-09-05T17-54-49-795Z-15-ce11fd`. Unit 481 / production 119 / Playwright 25 pass;
skip/todo/retry/warning/unexpected-console counts are zero. Parent/child artifact verification has
zero errors. Production within the final gate took 46.95s. A0–A5 are complete; Blocking **0**.

### Implemented ownership and inventory delta

`master-data/stackQuantity.ts` defines physical stack identity `(scope, trait)`, baseline and the
reader's declared saturation bound. `stackQuantityNormalization.ts` is the only raw interpreter.
The 22 NP occurrences remain classified as 17 bounded stacks and five zero-cap finite trait sets.
The four old modifier occurrences become three supported aggregate readers (four atomic inputs) and
one typed unsupported missing-maximum reader. A legacy unbound input, positive-cap finite-trait tag,
duplicate source or contradictory source/cell/baseline is rejected. Different reader saturation caps
can share a physical source; the canonical input domain covers the largest live cap.

`stackLinear` reads the capped sum of constituent live counts. It is not a second independent
quantity and does not multiply aggregate capacity by the number of constituents. A self-source
stack on a support actor is explicitly unsupported when that actor's state is not represented;
it must not accidentally read the attacker's count. This adds one typed unsupported support
projection to the existing inventory. No runtime servant/name/raw-key branch was added.

Application resolves and validates `canonicalInputValues`, records baseline/maximum/witness origin,
and passes the initial count into both preparation and shared execution. The executor seeds once,
then owns add/remove/form/clone/rollback and current count reads. Ordinary actor counts, stochastic
successes and finite distinct-trait predicates retain their separate semantics. Web presents the
count and initial-assumption origin and rejects conflicting scenario/effect-input/candidate evidence.
Portable calculator replay preserves the scenario and contribution policy. Schema 36 ranking history
is historical-only on migration; current, old and mixed version boundaries are exercised by schema tests.

### Additional recurrence findings and minimum guardrails

The implementation inventory closed three boundaries missed by the initial central-path model:

- A boolean preparation key cannot distinguish counts 1 and 4. Preparation context and semantic
  state identity now preserve quantities; `preNoblePhantasmPlanner.test.ts` checks distinct counts
  with equal boolean presence. Existing transactional rejection and transform paths retain the
  cloned count state; `condition.property.test.ts` checks clone/add independence.
- A repeated-trait output array is bounded at 100 while a legal stack can exceed 100.
  `stackStateCounts` carries exact current quantities; the corresponding trait array carries
  presence once. The strict damage-input schema rejects disagreement. A 101-count fixture closes
  the output/worker boundary without increasing array or candidate limits. At the default production
  baseline, 18 complete inputs gain this metadata and three state arrays change representation;
  **all 422 calculator outcomes and damage rows remain unchanged**. Only the missing-cap reader's
  applied-effect evidence changes. The input-digest updates record this representational change.
- Full integer enumeration gives Wanjina an over-limit domain; independent enumeration of a
  two-source aggregate gives Habetrot 70,350 candidates. The initial plan required proof before
  reduction but had not separated aggregate observational equivalence from independent inputs.
  `rankingStackDomain.ts` owns two conservative proofs: an isolated nondecreasing NP multiplier
  uses endpoints; an isolated positive NP-buff capped sum uses one constituent for the maximum
  total and keeps the others zero. Additional readers/writers, count-dependent activation, form
  changes, signed coefficients or NP-buff rate changes disable the latter proof. The exhaustive
  two-source positive/negative oracle and an interior maximum at count 1 guard this boundary.
  Other sources retain full integer domains. Habetrot still has programs outside the proof and
  its complete upper bound is **7,950**, so that context remains typed unsupported; no candidate
  is truncated or silently omitted.

These are confirmed representation/inventory gaps, not servant-specific damage corrections.
`rankingStackDomain.test.ts` also verifies the same count scenario and complete input/result through
without-area policy reapplication. `stackQuantity.test.ts` covers explicit 0/1/max, non-minimum baseline,
add/remove after maximum (including live count above the reader cap), contradictory absence, invalid
bounds, exact calculator/ranking/portable replay and sparse count validation. Production-negative
field and multiple-source states are covered by the small aggregate fixture.

### Production evidence and intentional result changes

The shared master/pipeline digest includes NP quantity classification and all modifier stack inputs.
`productionMasterInventory.test.ts`, `specialInputInventory.test.ts` and the canonical audit ratchets
cover the whole production family without loading the master once per example. The former fabricated
six-stack selection (`1000900:8808:0`) now returns unsupported and no rows; its raw source declares no
maximum. The earlier selected NP1 average 60,245.67 is deliberately not retained. The other 24
formerly unsupported selections and all 419 default attacking-NP golden cases remain numeric.
All-attack-NP numeric closure still belongs to TSK-06.45, not this stack task.

Representative complete evidence is written by the shared production candidate-space suite to
`stack-maximum-1101000.json` and `stack-maximum-2501300.json`. The recorded run is
`.test-results/2026-09-05T17-09-56-287Z-15-39d738`. Each artifact includes scenario/build, target,
preparation commands, policy, candidate evidence, full damage input and NP1–5 output.
Both examples use natural Lv.90, Fou ATK+1,000, NP1 selection, OC1, skill Lv10,
no CE/support/mystic code, self included / conditional satisfied / area included.

| Example / canonical initial input | Preparation / target | Governing multiplier | Observed NP1 min / average / max |
| --- | --- | --- | --- |
| 平景清 `stack:attackerState:traitId%3A2759 = 4`, origin maximum | skill 1 → skill 3 → attack NP; saber/earth | Value2 1000 + Correction 250 × min(4,4), divided by 1000 = 2 | 303,774 / 337,357.925 / 370,942 |
| ワンジナ `stack:attackerState:traitId%3A2880 = 10`, origin maximum | skill 1 → skill 2 → attack NP; saber/sky | Value2 1000 + Correction 100 × min(10,10), divided by 1000 = 2 | 139,309 / 154,710.065 / 170,111 |

These final values are evidence for those complete scenarios, not a scalar patch or a comparison
against a differently built baseline. The small independent oracle compares every initial count
under the *same selected scenario, gauge and policy*; portable replay compares the complete input/result.

### Finite inventory and performance

The shared `stack-candidate-domains.json` artifact in that run records each profile's program,
quantity cardinalities and complete upper bound before allocation. For the measured satisfied
NP1/natural-level context, 433 profiles classify as 385 ready, 40 unsupported action
admissions, and eight unsupported finite domains. Ready profiles with live stacks: 12.
Representative complete bounds are 260 (four-stack NP) and 960 (ten-stack NP); the largest admitted
bound is still 3,840. Rejected bounds are 4,128 (three profiles), 4,132, 4,654, 4,874, 6,146 and 7,950.
This is an explicit completeness/support boundary under ranking §12: no partial maximum is returned.
The limit remains **4,096**. The artifact measures this context; it is not a claim of the later final
four-policy/all-NP-level maximum closure in TSK-06.5.

Same-command isolated measurements used
`pnpm test:diagnostic -- packages/calculation-application/src/productionAudit.test.ts`:

| Measurement | Before artifact runs | After artifact runs |
| --- | --- | --- |
| 1 | `2026-09-05T16-09-24-303Z-15-07205b` | `2026-09-05T17-19-10-496Z-16-2bdc16` |
| 2 | `2026-09-05T16-09-54-398Z-15-d5a296` | `2026-09-05T17-19-21-833Z-101-bc89d6` |
| 3 | `2026-09-05T16-11-34-025Z-15-e91447` | `2026-09-05T17-19-32-728Z-186-b17456` |
| median read / parse / compile ms | 111.62 / 1,714.77 / 6,349.82 | 77.40 / 1,506.89 / 5,940.15 |

Each run reads/parses/compiles once. Counters are unchanged: generated 6,360, deduplicated 3,949,
damage requests 1,924, distinct inputs 1,298. Compile median is about 6.5% lower; there is no measured
hot-path regression or relaxed ratchet. Production suite baseline was 24 files / 117 tests / 43.46s
(`2026-09-05T16-12-24-070Z-15-d93227`); the final standalone production run passed 24 files /
119 tests in 47.76s (`2026-09-05T17-41-11-029Z-15-211111`, about +9.9%). This includes the two
representative production cases and the reduced worker share described below; it is distinct from
the one-worker application compile measurement. All assertions pass with the original time limits.
The added full family/domain evidence reuses the existing suite master load. No timeout or complexity
limit was increased. One intermediate production run overlapped a full TypeScript rebuild and reported
test timeouts; final production and audit measurements run without that competing rebuild.

A5 diagnostic attribution: the first full quality attempt after lint passed hit the unchanged 5s
production timeout in E0 inventory, MLB-only golden and unsupported-convergence default golden.
Baseline `26eae69` / production artifact `2026-09-05T16-12-24-070Z-15-d93227` passed those tests in
4,652 / 4,881 / 4,852ms. The current code also passed them in 4,633 / 4,620 / 4,746ms in
`2026-09-05T17-22-36-094Z-16-499ac6`, but quality run `2026-09-05T17-29-31-557Z-15-f81c9c`
reported 5,162 / 5,061 / 5,160ms timeouts. Effective production command, lockfile and worker settings
are unchanged. Classification: **environmentDependent** (observed timing nondeterminism); this does
not prove causal independence from the change or an unchanged baseline reproduction.
The recurrence inventory also found seven full master parses across the seven cases of those three
suites. Their setup now shares one read/parse per suite (three total), preserving all assertions and
an explicit 5s setup bound. This removes repeated work instead of increasing timeout or worker limits.

The shared-setup follow-up (`2026-09-05T17-37-47-635Z-15-2fa374`) still exceeded the 5s parse
setup bound and also timed out the production target-state inventory. The earlier recurrence fix
removed intra-suite duplicate parses but missed **inter-file concurrent first parses**. The existing
production worker-share owner in `vitest.config.ts` therefore changes from 75% to 50% (9 to 6 workers
on this host's reported 12 CPUs). Unit workers, all 5s bounds, assertions and candidate cap stay unchanged.
This is an execution-resource bound, not a larger semantic support limit. Final suite timing below
includes this worker-share change; isolated one-file audit medians use one worker in either configuration.

Visual closure: quality run `2026-09-05T17-44-00-153Z-15-ece732` passed unit, production (40.79s),
master validation and build. Its four screenshot failures were inspected: desktop changes were only
DB/engine version text; mobile gained one wrapped line because of the long development artifact name.
The release version now follows the existing short `YYYYMMDD.nn` format (`20260906.01`), preserving
mobile layout. Five version-bearing calculator/ranking screenshots (including the detail screenshot behind the
first failed ranking assertion) are refreshed after inspection. PNG comparison against `26eae69`
confirms identical dimensions: 320×2930, 390×2726, 1440×1515 and two 1440×1000 images; changed pixels
are limited to the DB/engine text rows (314, 314, 340, 120 and 120 pixels). No CSS/layout change,
screenshot tolerance or masked region is added. The focused update run
`2026-09-05T17-51-43-266Z-16-a2be14` passed all ten test bodies, but correctly remains a wrapper
contract failure because snapshot-generation console messages are not allowlisted; it is not the
completion gate. The final ordinary quality run must have zero unexpected observations.

Current unit verification: 83 files / 481 tests pass
(`2026-09-05T17-21-13-037Z-15-41ba24`). The current flow tables below replace the approved planning
statuses with scoped evidence. Implementation Blocking: **0**; the final quality gate above completes A0–A5.

## TSK-06.43 — Step 1 stack quantity investigation and implementation plan (2026-09-06)

### Boundary and specification

This boundary and inventory were captured during **Step 1**; Step 2 results above are current. Start HEAD is
`26eae69dbfea06d776c9515b3e0e4430297a2250`; the initial worktree was clean. Repository `AGENTS.md`,
`systematic-review-guidelines.md`, and the structural-finding template in
`prompt-engineering-guidelines.md` were read. Only this note and the Task source were changed during Step 1.
Requirements remain unchanged: ranking requirements §5.2, finite completeness, stack inventory and
acceptance criteria, plus TSK-06.43, govern this work. All-current-attack-NP numeric closure remains
TSK-06.45; final four-policy maximum closure remains TSK-06.5.

User-visible outcome: 通常のみ uses the canonical baseline; 成立込み includes the declared maximum
stack quantity in a legal scenario, displays the count and assumption origin, and opens/replays that
same scenario in calculator. A number must never stand in for missing or contradictory semantics.

Ownership and invariants:

- Pipeline interprets raw count vocabulary and produces typed quantity identity, source/read scope,
  baseline, maximum and support evidence. Neither names nor raw keys decide application/Web behavior.
- Application owns finite scenario selection and commands. Battle execution owns quantity reads,
  constraint evaluation and ordered mutations. Web presents canonical evidence.
- Distinct matching traits (`traitCount` condition today), repeated state instances, actor counts,
  available actions, and stochastic successes are separate quantities. They do not share an inferred maximum.
- Initial assumption, actually applied preparation effects and final count are distinct. Seed once
  before preparation, execute changes once, and preserve rollback and replay. Do not reassert the
  initial maximum after a removal or form transition.
- Every selected family, target/field fact, input, choice and action must coexist in one world.
  A maximum on a damage reader is a saturation cap, not automatically a capacity of every state writer.
  Unknown support cannot be hidden by excluding its candidate or returning the baseline number.

### Read-only production inventory at the start boundary

Inventory was obtained by recursive JSON traversal of the published master and matching raw function
parameters, without normalizing/recalculating the master or changing artifacts. Occurrence means stored
canonical damage/input occurrence, not unique servant and not a candidate count.

- Published master SHA-256: `80c025e62e5916ec89cdc00d8d76cec187bc2703780468eb83e7824781e4a026`.
- Local `data/raw/nice_servant.json` SHA-256:
  `1abf690ac22bcdd427788e0ff545320af491ee9f90fbc08a56af9603a217118f`.
- All 22 `traitCount` damage occurrences have stable target/source/cap across the 5 OC × 5 NP cells.
  Caps are 0 × 5, 4 × 1, 10 × 15, 12 × 1; absent cap is 0 occurrences. This is source evidence,
  not proof that every occurrence is currently admitted/executable.

| Damage reader population | Occurrences | Evidence examples (names only identify fixtures) |
| --- | --- | --- |
| positive cap, attacker combined trait/state | 7 | シャルルマーニュ12、スーパーバニヤン10 × 2 variants、平景清4、クロエ10、ワンジナ10、蒼崎青子10 |
| positive cap, attacker state only | 1 | テュフォン・エフェメロス10 |
| positive cap, target state only | 6 | ジャック・ド・モレー、バーヴァン・シー、ビショーネ、ロクスタ、巌窟王 モンテ・クリスト、殺生院キアラ、各10 |
| positive cap, target combined trait/state | 3 | ウルズ10 × 2 variants、ロムルス＝クィリヌス10 |
| zero cap, target combined / state only | 4 / 1 | 宮本武蔵、黒姫、Ｕ－オルガマリー × 2 / ウィリアム・テル |

Zero-cap entries must be classified separately from missing maximum: their finite matching-trait or
predicate population is not a declaration of repeatable maximum stacks. Mixed base/state reads and
exclusive class/attribute predicates remain subject to existing semantics; do not convert these five
entries into zero damage or unsupported merely because `ParamAddMaxCount` is zero.

Four `effectStackCount` inputs exist across the whole master (none outside servant skill effects):

| Source occurrence | Published baseline / maximum | Raw evidence / required treatment |
| --- | --- | --- |
| ビショーネ `23547:0` | 0 / 10 | `ParamAddOpIndividuality`, explicit cap 10; preserve actual opponent-state source despite input owner `attacker` |
| キングプロテア `8808:0` | 0 / 6 | `ParamAddSelfIndividuality`, **no** `ParamAddMaxCount`; 6 is normalization fallback, not declared maximum |
| カーマ `7592:0` | 0 / 10 | opponent individuality, explicit cap 10; provenance is not interchangeable with all state sources |
| ハベトロット `23559:0` | 0 / 5 | two self individuality keys, explicit cap 5; aggregate source, not two independent maxima |

The missing-cap case must lose the invented fallback. An unsupported maximum is an allowed intermediate
outcome under §5.2, not permission to omit current production from the later TSK-06.45 numeric gate.
Do not infer a count from buff `maxRate`, turn duration, or skill reuse. A separately evidenced canonical
source bound may be used only when the pipeline can prove its meaning; otherwise emit typed unsupported.

Adjacent input inventory: `procSuccessCount` 5, `criticalStars` 22, `fieldActorCount` 1,
`matchingActorCount` 4, `currentTurn` 8, `availableSkillCount` 1, `friendshipLevel` 1.
These stay under their existing owners; the stack change must not rewrite their domains. Generic
`traitCount` predicates still count satisfied trait entries (`condition.ts`), while NP damage counts
instances (`npDamageOperation.ts`). This difference is intentional until a new typed stack reader is used.

Representative raw governing rule, independent of other buffs: both example NPs have `Value2=1000`;
平景清 has `Correction=250, ParamAddMaxCount=4`, ワンジナ has `Correction=100, ParamAddMaxCount=10`.
The NP stack multiplier is 1 at count 0 and `(1000 + correction × min(count, cap))/1000` at positive
count: 1.25/2 at 1/4 and 1.1/2 at 1/10. These are multiplier expectations, **not observed final damage**.
Step 2 must record build, NP/OC, preparation program, target, policy, full damage inputs and final values.

### Structural finding and earlier inventory gap

1. **Mechanism — confirmed:** `effectNormalization.ts:normalizeNpDamageSpec` preserves optional
   `maximumTargetCount`; `npDamageCompilation.ts:noblePhantasmDamageDependency` emits only
   `atLeast:1`. `rankingWorld.ts` and `rankingFieldWorld.ts` enumerate boolean presence, and
   `rankingQuantityWorld.ts` has no stack dimension. `schema/src/index.ts:worldFactAssertions`
   accepts trait booleans or the fixed quantity union. `state.ts:applyWorldFacts` only raises a
   present trait to at least one; `npDamageOperation.ts` can consume greater instance counts.
   `effectNormalization.ts` also defaults missing stack cap and linear maximumUnits to 6;
   `rankingCanonicalInputs.ts` chooses minimum for baseline and usually only maximum for satisfied.
2. **Mismatch — inference from these readers:** the source cap was treated as an executor-side clamp
   and the condition witness as truth, leaving no canonical quantity connecting the two. An input's
   UI owner is not enough to identify its physical count source or link another reader of that source.
3. **Missed detection — confirmed scope gap:** earlier condition closure covered polarity/composition
   and boolean trait witnesses (`rankingWorldWitness.test.ts`, `rankingFieldWorld.test.ts`), while
   executor count fixtures (`npDamageOperation.test.ts`) supplied counts directly. That does not test
   pipeline cap → planner count → preparation → replay. This delta expands the earlier condition
   inventory explicitly; it is not another servant-specific correction.
4. **Recurrence/minimum guardrail — inference:** every repeated quantity, shared-source reader,
   preparation writer, transport parser and recovery path can lose count or provenance. Guard with one
   production digest and small source × state × path fixtures, including production-zero schema states.

### Canonical design and changed flow inventory

Extend existing master-data/schema contracts; no new package. Use a discriminated quantity definition
that separates finite matching traits from stack instances and unsupported definitions. A stack
reference includes canonical identity, actor/state read scope, constituent identities and aggregation,
source provenance, baseline count, declared maximum and its evidence. Do not keep an independent
unbound `effectStackCount` input as a second source of truth. Multiple readers of the same physical
quantity share one assignment; different reader saturation caps are not automatically contradictions.
Missing declaration and internally conflicting declarations produce distinct diagnostics.

A serializable scenario assumption references that definition and records count plus origin
(baseline / satisfied maximum or other finite witness / explicit calculator input). The executor
resolves it against the selected master/profile; a client-supplied maximum never overrides the master.
Ordinary baseline is the declared initial value (0 for the observed external stack inputs), not always
`minimum`; preparation can then add/remove actual states. Preserve the ordinary candidate in satisfied
mode, including a non-minimum baseline fixture. Calculator can use typed count commands and replay the
selected ranking policy without reselecting maximum.

For the new bounded stack dimension initially enumerate legal integers from baseline/domain boundaries
through the declared maximum, including 0 where legal; deduplicate shared sources before the product.
This avoids an unproved monotonicity assumption under `atMost`, `equal`, negative modifiers or ordered
writers. Any later boundary-only reduction requires a small exhaustive equivalence proof. Certify the
complete product including action/choice/target/field/other input dimensions **before allocation**.
Keep 4,096 unchanged; fail closed beyond supported bounds, never truncate or ignore a blocking branch.
Finite source semantics that cannot be represented within the existing bounded preparation model are
unsupported, not an invitation to simulate prior turns. Validate support for the live read set before
publishing a baseline or maximum; inclusion-disabled contributions retain their ordinary outcome class.

The following current statuses close the approved Step 1 flow inventory using the Step 2 evidence above.
Units A0–A5 remain in the Task source; final quality is tracked separately.

| Direct path / current code anchors | Required transition or guard | Status |
| --- | --- | --- |
| raw → `effectNormalization.ts`, `master-data/src/index.ts`, generated master | distinguish cap/source/baseline; remove fabricated 6; validate every OC/NP/value cell and aggregate source | Verified: Step 2 scoped fixtures / production evidence |
| `rankingStaticSemantics.ts`, `runtimeInputIdentity.ts`, `rankingCanonicalInputs.ts` | collect damage/preparation-live count readers, preserve source identity across occurrences; default ≠ minimum | Verified: Step 2 scoped fixtures / production evidence |
| `rankingCandidateSpace.ts`, world/field/quantity planners, `finiteSemanticProduct.ts` | shared stack domain, baseline inclusion, complete certificate, no second independent count axis | Verified: Step 2 scoped fixtures / production evidence |
| schema scenario → `scenario.ts`, `preNoblePhantasm.ts`, `preparationState.ts`, `preparationTransaction.ts` | seed before first preparation read; current Set-based state must not erase quantities; preserve count through command transitions | Verified: Step 2 scoped fixtures / production evidence |
| `candidatePreparation.ts`, `candidateSelection.ts`, `constraints.ts`, `condition.ts` | new count predicate shares ownership with global validation; boolean/general traitCount semantics remain distinct | Verified: Step 2 scoped fixtures / production evidence |
| `state.ts`, `candidateExecution.ts`, `candidateRollback.ts`, variant preapply | add/remove/suppress, form replacement, clone/rollback/retry and preapplied operation skip preserve counts exactly once | Verified: Step 2 scoped fixtures / production evidence |
| `projection.ts`, `npDamageCompilation.ts`, `npDamageExecution.ts`, `npDamageOperation.ts`, `foldDamageInput` | count reads and source evidence agree with final damage; avoid duplicate base/state count and expanded-array limits | Verified: Step 2 scoped fixtures / production evidence |
| `rankingPolicyCandidates.ts`, `rankingCandidateSelection.ts`, `rankingExecution.ts`, prepared damage cache | nonnumeric blocker is not hidden by baseline; selected without-area policy reuses identical count scenario; cache keys distinguish damage-changing counts | Verified: Step 2 scoped fixtures / production evidence |
| `effectControls.ts`, `scenarioCommands.ts`, calculator controls, `rankingDetailPresentation.ts` | typed count edits; remove stale references on servant/variant/source change; count/origin display, no label-based rules | Verified: Step 2 scoped fixtures / production evidence |
| `rankingContracts.ts`, Web `rankingResponsePayloadSchema.ts` / `rankingEffectResponseSchema.ts`, worker protocol | preserve complete scenario/evidence, reject conflicting count/evidence or unknown source; count-sensitive request/result identity | Verified: Step 2 scoped fixtures / production evidence |
| `portableCalculation.ts`, `rankingHandoff.ts`, draft/history/share/backup adapters and schema migrations | full request survives handoff, same-version replay and stored-result comparison; rejected edits/upgrades retain prior request/result | Verified: Step 2 scoped fixtures / production evidence |
| version/cache recovery → application/UI | bump schema/engine for semantic cutover; old ambiguous ranking requests historical-only/discard/reject per existing boundary, never invent maximum; migrate unaffected data only when identity is provable | Verified: Step 2 scoped fixtures / production evidence |
| complete production inventory/damage/performance proof | one shared load/compile per audit; capture changed inputs and outcomes, including newly unsupported missing-cap case | Verified: Step 2 scoped fixtures / production evidence |
| general resource numeric closure / logical contribution UI redesign / final maximum | existing later owners; stack data and minimal count/origin display must already work in 06.43 | Deferred: TSK-06.45 / TSK-06.47 / TSK-06.5 |
| general prior-turn simulation and skill reuse | outside approved finite preparation semantics | N/A: explicitly outside requirement |

### State-by-path counterexamples and expected outcomes

| State / counterexample | Generation / execution expectation | Display / recovery expectation | Status |
| --- | --- | --- | --- |
| count 0, 1, maximum; baseline 0 and schema-legal baseline > minimum | exact count and cap multiplier; satisfied contains baseline; no automatic maximum for general quantities | calculator/ranking same complete input; origin and count retained | Verified: Step 2 scoped fixtures / production evidence |
| `atLeast`, `atMost`, `equal`, nested `all/any/not`; decreasing or saturated contribution | independent exhaustive finite oracle; correct negative witnesses and no local-max sum | selected world reproducible without rerunning selection | Verified: Step 2 scoped fixtures / production evidence |
| absent max, negative/noninteger count, baseline > max, contradictory source metadata | missing support → unsupported; malformed/contradictory state → invalid; never guessed 0/6/maximum | diagnostic survives worker/replay; no numeric maximum | Verified: Step 2 scoped fixtures / production evidence |
| raw zero-cap finite trait set vs missing cap on repeatable source | keep existing finite matching semantics; no invented repetitions | no false unsupported for the five finite-set occurrences | Verified: Step 2 scoped fixtures / production evidence |
| two independent families; two readers of same source with different caps; aggregate two source traits | one assignment per physical source, combined constraints, no double credit; source totals and cap reads consistent | stable canonical identities, one assumption per source | Verified: Step 2 scoped fixtures / production evidence |
| source count positive + absent source trait; exclusive target/field/choice; base + state overlap | detect impossible assignment; distinguish legal alternative from invalid admitted input; honor source provenance | unsupported validation stays unsupported, not “条件不成立” | Verified: Step 2 scoped fixtures / production evidence |
| seed max then add/remove/suppress, transform, failed action, rollback/retry, preapply | seed once; mutate live state in order; no stale count, lost count or double application | initial assumption distinct from applied count/effects | Verified: Step 2 scoped fixtures / production evidence |
| missing calculator input vs planner-owned witness; policy exclusion vs stochastic failure | inputRequired is repairable, exclusion/failure is ordinary non-application; semantic invalid/unsupported remains separate | controls offer only appropriate repair; unknown maximum is not a user-input prompt | Verified: Step 2 scoped fixtures / production evidence |
| selected maximum with and without area; direct calculator, ranking-origin calculator and portable request | same scenario and contribution policy yield same input/result; no independent maximum reselection | handoff, saved result comparison and replay parity | Verified: Step 2 scoped fixtures / production evidence |
| canonical-only, old-only, mixed contradictory payload; unknown identity, stale master/version, tampered evidence | strict parser/semantic validation; preserve unaffected data only where unambiguous | failed mutation/upgrade retains prior state; historical-only stays non-executable | Verified: Step 2 scoped fixtures / production evidence |
| production-zero: multiple family/cap disagreement, field stacks, OC/NP-varying domain, non-minimum baseline | focused fixture or explicit unsupported with no numeric fallback; zero-occurrence ratchet detects new production | never generalize from 22 current NP defaults | Verified: Step 2 scoped fixtures / production evidence |
| complete candidate product at/beyond 4,096; irrelevant quantity source | certify exact bound; reject beyond support before materialization; omit only proven dead readers | no partial best number or cache alias | Verified: Step 2 scoped fixtures / production evidence |

Step 1 recorded planning Blocking **0** and no unresolved product-specification question. The user
then explicitly approved Step 2. All scoped runtime paths now have verification evidence above;
final phase completion is verified by the passing `pnpm quality` above. Later tasks retain only their already assigned scope.

## TSK-06.45 Step 1 — all attack-NP execution closure（2026-09-08）

本節が06.45のcanonical flow note。要件確認 → 現状調査 → 設計 → 検証の順で記録する。
実行順と進捗の正本はTask表の06.45内U0〜U5。Step 1は文書のみで、runtime closureではない。

### 要件と守る意味論

利用者から見た到達点は、現行published masterの全playable攻撃宝具をcalculator／rankingの
同じapplication constructorとordered executorで計算できること。ranking要件v0.10.3
§3.2、4.2、5、6.4〜7、9、10.4、14〜17を適用する。基礎要件の旧ranking入力記述ではなく、
承認済みの7入力・初期OC契約を用いる。damage-effect-execution要件§3の入力・結果UIも維持する。

- AttackProfileをform／variant／scope間で混成せず、全variantのdamage joinを母集団にする。
- 初期OCとNP-use時点のOCを区別し、capacity／消費／OC receiptは06.44の契約を保持する。
- skill各slot最大1回、transform NP最大1回、終端attack NP1回の有限phaseに限定する。
- policyは合法candidateと寄与を選ぶ。resource cost、条件truth、状態変化、確率結果を上書きしない。
- raw語彙の解釈はpipeline、初期inputとcommandはapplication、状態read／mutation／rollbackはexecutionが所有する。
- dependencyを読まないことの証明と、未対応だから実行を省くことを区別する。直接damageだけでなく、
  後続condition・resource amount・NP到達性・OC付与率・form／variantを変えるreaderを含める。
- 初期state、使用したinput、適用済みmutationを別に保持し、repair／reset／replayは初期stateから再実行する。

outcomeは合成前に次へ固定する。`calculated`、包含off、stochastic failure、条件false、
証明済みphase非関連、`policyNoOp`、具体candidateの`unreachable`、修復可能な`inputRequired`、
矛盾した`invalid`、未解釈の`unsupported`。profile集約でこれらを0 damageや別profileに置換しない。
rankingの生成責任に属するwitness不足を利用者の未入力にしない。合法candidateがあっても、
admit対象の未解釈candidateを無視して最大値確定とはしない。逆に、証明付き生成対象外candidateをprofile blockerにしない。

### 現状調査と再現baseline

基点／調査HEAD: `e354764a6ad32aedf215c7fc7b785c73331d6f35`。開始時worktree clean。
master `20260906.03`、schema45／portable38／engine33、master SHA-256
`65add07d7b3c81927fd147e632ceea0c22ed0f7cb7f95079db4c6fc750ed6098`。
06.44の機械証拠は本note冒頭の`oc-execution-diff-tsk-06-48.json`を再利用し、別の正本を作らない。 path名は旧Task番号を保持する。

| 母集団／測定 | e354764での確認 | 証拠 |
| --- | --- | --- |
| default calculator | 422 scenarios、420 calculated、2 unsupported、invalid／inputRequired 0 | `productionExecutionParity.test.ts`とshared `productionAudit.test.ts` |
| default ranking（自然上限・自バフ込み・通常・NP1・初期OC1） | 433 profiles、393 calculated、40 unsupportedActionAdmission、他の非数値0 | shared production audit、既存`audit-oc-matrix.ts`のdefault実行 |
| 母集団の差 | 469 servants中422が準備経由で攻撃可、47は非攻撃。422はdefault scenario数、433はform-qualified profile数 | shared production audit／`attackProfile.ts`。default422件だけでは全variant closureを証明しない |
| raw damage join | 既存pipeline／master inventoryの全攻撃family・除外分類をproduction suiteで再確認 | `executionBaselineInventory.test.ts`、`productionMasterInventory.test.ts`、pipeline inventory。非playableとcanonicalへ統合済みidentityは欠落扱いしない |
| 全80条件 | 34,640 outcomes＝32,640 calculated／1,960 unsupported／40 unavailable、invalid／inputRequired 0 | 同じHEAD・masterの06.44保存証拠を継承。今回はdefault以外の80条件を再実行したとは扱わない |

再実行: `pnpm test:diagnostic -- packages/calculation-application/src/productionExecutionParity.test.ts packages/calculation-application/src/executionBaselineInventory.test.ts`
は2 files／3 tests成功、6.53秒、artifact `.test-results/2026-09-08T04-20-27-414Z-15-71d73d`。
`pnpm test:production`は24 files／119 tests成功、39.98秒、warning0、artifact
`.test-results/2026-09-08T04-22-06-022Z-15-aec017`。shared audit digestは
`b937e5767b124dfa49aa662822456b883af81ac6ae0db1dd8c5ffa1e6ba21ad2`。

既存matrix scriptを`FGO_AUDIT_OC=1 FGO_AUDIT_LEVEL=naturalLimit FGO_AUDIT_SELF=included
FGO_AUDIT_CONDITIONAL=baseline FGO_AUDIT_NP=1`で絞り、data-pipelineの`tsx`から実行。
一時出力は`/tmp/tsk-06-45-step1-matrix`。393件のcalculator／portable parity差0、
ranking本体4,807.99ms、damage requests2,096／distinct1,329、digest
`2f6ddc095c632bf18585d8fb86a38a9b5174dce40d93db32e1b54c206ab34307`。
これは単発参考値で、Step 2の前後比較は同一環境・非並行で再測定する。
直接tsx実行はNode DEP0205警告を出した（test runner内warningは0）。runtime不具合の証拠とはしない。

#### Production familyを全体から分類した結果

全masterのeffect（skills／passives／全NP variants／CE／mystic）を再帰走査し、
`execution.kind=unsupported`をfunction family・reason・trigger・damageRelevantで分類した。
これは格納occurrence数であり、raw unique function数やprofile数ではない。

| family | 格納occurrence | 残存モデル |
| --- | ---: | --- |
| commandCardAttack × operationSemantics | 23 | trigger発火とNP実行の関連性 |
| contextReference × damageRelevant:false | 29 | 読まれるstateか、証明済み非関連か |
| gainNpTargetSum／gainNpFromTargets／gainNpIndividualSum／gainHpFromTargets | 各3 | count／dependent target transaction |
| gainNpBuffIndividualSum／gainMultiplyNp | 4／1 | buff count／current gauge倍率 |
| operationSemantics（triggerなし） | 1 | 他variantを含むinventoryに保持し、選択programとのjoinで影響を判定 |
| replaceMember／moveToLastSubmember | 3／1 | party mutation。無条件に非関連へ落とさずbounded path上のreaderを監査 |

40個の非数値profileを`compileStaticRankingPreparationPrograms`の全sourceUsesへjoinして再分類:
triggerのみ17、非火力参照のみ8、依存量のみ10、依存量＋非火力参照4、依存量＋trigger1。
したがって旧25／15の主分類は再現するが、15件中5件は原因を併有する。
servantの全skillsを無差別joinすると、未選択variantを含めてtrigger件数等を過大計上する。
以後のinventoryはprofile → legal program → selected source → ordered operation → first readerを保持する。

既存資源operation全数はNP730／HP179／star255／Battle Point1。HP依存NP damage6、
Battle Point phase依存NP damage2、traitCount22も既存production ratchetと一致。
失敗2例だけでなく、既にcalculatedなprofile、支援・自動source、将来schema-legal stateもread scopeの監査対象。

### 構造finding（共通原因ごとに一度記録）

**F1: relevanceとadmissionの所有権不一致。** 確認済みの発生機構は
`rankingActionAdmission.ts:unsupportedEffect/optionalAdmission`がtrigger／damageRelevantに先行して
unsupportedを返し、`compileCandidateLocalActionAdmission`がprofile keyへ広げ、
`rankingCandidateSpace.ts`が候補spaceを止めること。一方`operationCompiler.ts:compileEffect`は
non-null triggerを全省略し、unsupportedのdamageRelevant／recipientで絞る。
実装時のズレ（推論）は、source-local対応判定をcandidateの実行可能性と同一視したこと。
検出漏れは06.41のcoarse理由を受入れ、旧06.45計画でも25／15以外のautomatic source・
OCへの間接read・複数原因の交差をmatrixへ落としていなかったこと。
最小guardrailは同じeffectをskill／passive／transform NP／attack NP／外部phaseで通し、
triggerなし／command card／未知trigger、readerあり／なし、optional／structuralの結果を比較する。

**F2: resource値とtransaction結果がIRで失われる。** `executionSemantics.ts`は六つの依存量familyを
同じ`unsupported:dependentResourceAmount`へ落とし、`preparationResourcePlan.ts:selectedSourceNpMutations`も
同じreasonのattacker宛operationをNP unsupportedへ写す。rawでは`gainHpFromTargets`の
`DependFunc=lossHpSafe`と`gainNpFromTargets`の`DependFunc=lossNp`は別resourceであり、
依存先の実適用結果が必要。`gainNpTargetSum/IndividualSum`にはValue／Value2／selector、
`gainNpBuffIndividualSum`にはbuff selector、`gainMultiplyNp`には倍率Valueがある。
分類名だけでは値の単位・上限・対象・read時点を表現できない。
推論: canonicalへ正規化する段階で読取情報を削ったため、calculator／ranking間の対応差が生じる。
検出漏れはtyped unsupported件数を固定するtestがfamilyの数値化を証明していないこと。
再発範囲はcondition／amount／OC／NP到達性の間接依存、targetごとのclampとその合計、
複数消費者、失敗／partial rollback。依存関係は有限program内の参照に限定し、任意グラフを導入しない。

**F3: HP／Battle Pointの初期値・更新・派生値が分裂。** 確認済み:
`resourceSemantics.ts`はHP／BPの後続readerを見つけても`resourceStateUnavailable`を残す。
`AtlasServant`／published servantにはHP growthがなく、rawには120 levelのhpGrowthがある。
`lossHpSafe`と`lossHp`は同じHP lossへ正規化され、下限の意味も保持しない。
`addBattlePoint`はpoint量を`addQuantity:battlePointPhase`へ変換するが、`subBattlePoint`は
`BattlePointValue`でなくValue seriesを読み、production1 occurrenceのamountが全null。
`candidateExecution.ts:quantityOperationIsNotRelevant`はphase依存NP以外のaddQuantityを落とす。
BP rate／condition readerは`effectNormalization.ts`にもあり、phase依存damage2件と同じ母集団ではない。
`ocState.ts:rateValue`はHP write後を`ocRateHpStateUnavailable`として止める。
推論: ratio／phaseだけをcanonical値にしたためabsolute mutationを正しく合成できず、
OC用HP write markerとdamage側のresource stateが二重modelになっている。
検出漏れは旧計画がHP1例／BP1例を挙げたものの、加算・減算・rate・condition・OC・フォーム変更の
全writer／readerを列挙していなかったこと。最小guardrailは後述C3〜C6。

**資料上の未確定点（U0で閉じる）:** rawの705300にはBP減算2とrate rangeがあるが、
そのゲージ定義／閾値は`nice_servant.json`のbattlePointsにない。同ファイルで確認できた
battlePoints定義は3300200のphase0〜10（value -1,0,10,…,90）で、別subjectへ流用できない。
「calculatorのBP失敗＝phase依存NP用の既存閾値で解決」とは断定しない。
六familyの実適用量・safe HP下限／丸め・count上限、初期HPの補正内訳もraw全cellと一次根拠の照合が必要。
敵HPや他メンバーNPを無断で入力項目／仮想固定値に追加しない。bounded phaseで読まれる場合だけ、
既存canonical input／有限witnessから導出可能かをU0で確定する。製品上の新入力・編成前提が不可避なら相談する。

### 採用設計と判断理由

1. **一つのbounded operation read contract。** 既存battle-execution内のfocused moduleが
   phase／trigger／recipient／ordered suffixを受け、`required`（readと理由）、
   `irrelevant`（typed proof）、`unsupported`を返す。readにはdamage、condition、amount、
   OC、resource requirement、form／variantを含む。既存`resourceSemantics`、`ocDependency`、
   `ocTerminalDependencies`、admissionの部分判定はこのcontractを消費する。
   pipelineだけがraw triggerをtyped scopeへ正規化し、unknownを「非関連」にしない。
   global dependency graphやservant別whitelistは採用しない。proofはprogramとread時点に束縛する。
2. **closed amount／resource union。** fixed、current-resource倍率、selector付きtarget count、
   buff count、対象別の依存量集約を区別する（read時点とgain／依存処理順はU0で確定）。NP basis points、HP絶対量、
   BP point量を混用しない。raw key、DependFuncIdはpipelineでcanonical参照へ解決し、
   missing／ambiguous参照をrejectし、nested dependencyと先行operationへの参照を混同しない。
   target側の消費と自身gainは同じtransaction内で一度実行し、確定したread時点と実行順をreceiptに残す。
   ratio／phase／rateはcurrent stateから導出し独立writerを削除する。
3. **必要な状態だけを保持。** HPは選択actor/form・levelから解決したmaxとcurrent、
   NPは既存capacityとcurrent、BPはsubject-qualified currentと確認済みdomain／threshold、
   countは既存canonical数量とprovenanceを使う。HP成長は06.411のlevel解決責務を拡張し、
   ATKからの推定や最も近いlevelへfallbackしない。current HPのinput精度と補正basisはU0で固定する。
   BPのpoint／phase／rateを一つの無名numberへ潰さない。未解釈stateは実行可能型と分離する。
4. **ordered transactionを共通ownerへ収束。** `preparationTransaction`と`preparationPhases`の
   既存source順を用い、resource・condition・OC・contextを同じ時点のstateで評価する。
   全resourceだけを先に処理する独立passは依存readerの前後を跨がせない。
   NP-use receiptを消費前に固定する06.44契約は維持し、攻撃宝具中の後続chargeで遡及変更しない。
   `operationCompiler`／preapply／ordinary executionへのhandoffは適用済みreceiptを受け、二重mutationを防ぐ。
   skill失敗は全commandをrollbackし、automatic sourceは既存phase境界を保持する。
5. **applicationから回復まで一括cutover。** 初期inputと採用worldをscenarioへ保存し、
   ranking量候補は同じresource reducerで得られる有限境界から生成する。HP減少などで非単調な場合に
   各数量の単純maximumだけを選ばない。独立小型oracleで候補完全性を確認する。
   portable／cache identityに結果を変えるbasisを含め、repair・level／NP／OC／policy変更・resetは
   同じconstructorへ戻す。新旧ratio／phase stateを併存させず、schema／master／engineを必要に応じ一括更新する。

### 直接producer／reader／writer／recovery inventory

以下は06.44時点の計画表を最終結果へ更新したもの。完了根拠は最新checkpointとmachine evidenceに集約する。

| Path | 現在の直接node／変更契約 | Status |
| --- | --- | --- |
| raw → canonical artifact | `executionSemantics.ts`、`effectNormalization.ts`、`snapshotNormalization.ts`、`atlasContract.ts`、`master-data/src/index.ts`。trigger、six families、HP growth、BP values/domainをlosslessにする | Verified: U0/U1、family source evidence |
| initial basis → preparation | `scenario.ts`、`rankingPolicy.ts`、`rankingQuantityWorld.ts`、`sourceCollection.ts`、`preparationContracts.ts`。level／form／NP／OC／quantityから一度seed | Verified: U2/U3、stable owned／80条件 |
| optional／structural admission → space | `rankingStaticPreparation.ts`、`rankingActionAdmission.ts`、`rankingCandidateSpace.ts`。program-bound relevance、typed omissionを消費 | Verified: U1/U3、小型oracle／全profile |
| skill／transform NP／attack NP | `preparationTransaction.ts`、`preparationResourcePlan.ts`、`npResource.ts`。condition・dependent amount・消費・OC receiptを順序評価しatomic commit | Verified: U2、rollback／retry |
| passive／form activation／CE／support／mystic | `preparationPhases.ts`、`preparationOc.ts`、`ocSourceProgram.ts`、`ocSourceBinding.ts`。同じresource read、source HPとrecipient HPを分離 | Verified: U2、production source inventory |
| preparation → damage／preapply | `operationCompiler.ts`、`resourceSemantics.ts`、`candidatePreparation.ts`、`candidateExecution.ts`、`npDamageOperation.ts`。receipt移送、ratio／phase派生、二重実行防止 | Verified: U2、calculator/ranking/portable parity |
| OC間接read | `ocDependency.ts`、`ocResourceDependencies.ts`、`ocTerminalDependencies.ts`、`ocState.ts`。HP write markerをsupported state readへ収束、飽和proof／NP-use時点を保持 | Verified: U1/U2、全合法OC |
| repair／policy reapply → rebuild | `scenario.ts:rematerializePreparedCalculationInputs/reapplyPreparedCalculationPolicy`、`executionPlan.ts`のinput定義。新resource inputを準備依存へ含める | Verified: U3、focused recovery |
| portable／draft／history／reset／upgrade | `portableCalculation.ts`、`schema/src/index.ts`、Web `portableDraft.ts`。初期値を保存、mutationを復元しない、失敗時prior requestを維持 | Verified: U4、stable owned／旧pair保持 |
| ranking result／worker／cache／detail → calculator | `rankingProfileOutcome.ts`、`rankingPortableBasis.ts`、`preparedDamageInputCache.ts`、`rankingWorkerProtocol.ts`。outcomeとbasis検証、stale拒否、同一採用scenario再現 | Verified: U3/U4、34,600 parity／stale拒否 |
| Web input／表示 | `Calculator.tsx`、`EffectInlineInput.tsx`、`CalculationContextNotice.tsx`の既存表示契約。typed input修復と自動再計算、7 ranking入力を維持 | Verified: U4。UI変更なし、既存E2E維持 |
| production／性能 | shared `productionAudit.ts`、`productionMasterInventory.test.ts`、既存matrix script。raw → first reader → outcome／input差分を共有inventoryで検証 | Verified: U0/U5、80条件／性能／quality |
| turn／AI／一般battle simulation | 有限phaseの外 | N/A: 現要件外 |
| contribution UI再設計／最終最大値証明 | 同familyで変わるinput／outcome parityは06.45で検証し、後続Taskの独自完了条件だけを残す | Deferred: TSK-06.47／TSK-06.5 |

旧planningの「URL／workerはN/A」は撤回する。Webがsemantic ownerでないことは、
canonical stateのreader／writer／recovery検証を省く理由にはならない。
NP基本capacityの正本は`np-resource-semantics-flow-tsk-04.md`、transaction境界は
`transactional-preparation-flow-tsk-05.md`を参照し、今回の変更差分だけを本節で所有する。

### State-by-path反例と検証方法

全Cartesian productのtest増殖は避け、次の境界を小型fixtureで交差させる。
production occurrence0もfixtureまたは根拠付きN/Aで閉じる。各行は最新checkpointのfocused fixture、family evidence、80条件matrixで**Verified**。

| ID | State／反例 | 交差するpath・期待結果 |
| --- | --- | --- |
| C1 | triggerなし／command-card-only／unknown、before／after terminal、readerなし／間接readerあり | skill、automatic、transform、terminal。証明済み非関連だけを省略、unknown reachableはunsupported |
| C2 | optional no-opとstructural、無条件寄与＋unknown sibling、未選択branchのunknown | admission→space→集約。合法な生成対象を保持し、未知最大値をcalculatedへ隠さない |
| C3 | HP0／1／max、選択level違い、fixed／percent gain/loss、safe／非safe、heal後loss | preparation→condition／NP damage／OC rate。同じcurrentを読む。丸め・下限はU0で確定した独立期待値と比較 |
| C4 | BP point閾値直前／一致／直後、加算後減算、subject違い、phase／rate reader、定義欠損 | amount→derived phase/rate→condition／damage。phaseへのpoint直接加算、null→0を拒否 |
| C5 | count0／1／cap、重複target／buff、対象不一致、同じsourceの複数consumer | selectorとprovenanceを維持、countとamount上限を別評価、mutation後のcountを再読取 |
| C6 | target lossがclampされる／一部対象失敗／後続gain失敗、参照循環／未解決／別resource | gainのread snapshotとchildの適用結果を別receiptへ保持。実適用量sumを未確認の仕様として採用しない。command拒否時は全体rollback、stochastic failureとは区別 |
| C7 | HP→condition→NP gain→OC→攻撃、先行reader後のmutation、transform前後／NP1〜5 | 一つのordered state。OCを遡及変更せず、capacity不足candidateのみunreachable |
| C8 | 同じ値でもinitial／applied由来違い、preapply→ordinary、rollback→retry | 二重mutation／残留effect／stale amount0、失敗時元のstate・requestを保持 |
| C9 | input欠損／修復、inclusion off／proc failure／条件false、all／any／notのunknown混在 | direct calculator、ranking、reapply、detail。外部outcome classとrepair commandを維持 |
| C10 | policy四組合せ、baseline包含、非単調HP／数量、複数family同時成立 | 独立有限oracleと採用candidate比較。矛盾world／各軸maximumの合算／cap truncateを拒否 |
| C11 | level／form／NP／OC変更、reset、ranking handoff、save/reload、old-only／canonical-only／mixed | constructor→portable→worker/cache→UI。版不一致と矛盾をreject、採用input／damage／receipt parity |
| C12 | 現行全profile＋schema-legal将来unknown／production-zero reader | 433／422だけでなく全variantをshared inventoryで監査。既に数値のprofileのdamage差もcanonical ruleで説明 |

### 完了条件とStep 2への境界

Task表U0〜U5の検証が完了し、default ranking433／433・calculator422／422、指定80条件と
stable owned fixtureでunsupported／invalid／inputRequired0、calculator／ranking parity差0。
`unavailableUnderPolicy`は選択policyのtyped reachability proofだけを許可し、既存40 outcomesも再検証する。
全damage差にcanonical input・ordered receipt・ruleを付け、input不足を黙って補完しない。
未説明10%超性能退行、candidate上限／timeout緩和、UI editor追加、raw／ID runtime分岐0。
最終`pnpm quality`成功と全scoped pathのBlocking／Task内Deferred0で06.45を閉じる。

Step 1時点ではU0の技術資料確定が未完了で、数値実装の前提をVerifiedにしていない。
**Blocking: HP／dependent targetの量契約と705300のBP domain根拠が未確定（U0が解消を所有）。**
これはStep 1時点の技術調査gate。Step 2で判明した製品判断と、依存部分だけを保留する境界は下記U0進行記録を正本とする。
Step 2は利用者の次の依頼後、HEAD／master／dirty diffを再確認してU0から開始可能。
根拠が揃わず新UI・編成・敵stateの製品前提が必要と判明した場合のみ、その具体的差分を相談する。

### Step 2／U0進行記録（2026-09-08）

利用者の「OK進めましょう」によりStep 2を開始。HEADは引き続き`e354764`、開始時dirtyは
Step 1で編集したTaskと本noteのみ。以下は調査・監査実装であり、U1〜U5の数値実装は未着手。

**追加確認とStep 1の修正:**

- [Atlas Nice Battle Point API](https://api.atlasacademy.io/nice/JP/battle-point/705300)と
  [raw API](https://api.atlasacademy.io/raw/JP/battle-point/705300)で欠けていた定義を取得した。
  nice response SHA-256 `ccb32b745561be1d1704c6b28878fa9b67ce2caa4413523c9b0ea744f692a84e`、
  raw response SHA-256 `91deb828f040cd744716ed5c7e72999266f42d21db960da3b7756d993da77b70`。
  `battlePointCheckAsPercentage`、phase境界-1／0／500／750／1000、defaultMax4、
  superGiant時max8、maxLimit12、recipient trait10042を確認。固定point閾値ではなく、
  subject・recipient・current・動的capacity・割合・phaseを区別する必要がある。
  これらを既存raw／published masterへまだ追加していない。U1では参照BP定義の取得元を
  pipeline入力に加え、任意IDのhardcode／別ゲージ閾値の流用をしない。
- `gainNpTargetSum/IndividualSum`の`Value2`は計数対象scopeであり、count capではない。
  ローカルrawのdescription／対象系列と、[独立実装の対象選択](https://github.com/chaldea-center/chaldea/blob/9fa75655c07ecd76168b1ccf5b8232e8d64664cf/lib/app/battle/functions/gain_np.dart)
  を照合した。3は全体、4は自身以外の全体、2は敵。型はtargetScopeとcountingUnitを別に持ち、
  count上限は既存population domain／stack定義から導出する。旧計画の「Value2／上限」を
  一つの量契約として読む解釈は棄却する。上流実装は補助証拠であり唯一のdamage oracleにしない。
- 六dependent family内にも依存先resourceの違いがある。published evidence全cellは
  `gainNpFromTargets→delayNpturn:enemyAll`20、`→lossNp:ptOther`10、
  `gainHpFromTargets→lossHpSafe`30（enemy／enemyOneNoTargetNoAction／enemyAll各10）。
  enemy chargeをNP basis pointsへ読み替えない。さらにrawには同skillの
  `absorbNpturn`（反対team向け）もあるため、recipient/teamと後続readのproofを保持する。
- 原案の「依存先を先に実行しreceiptをsum」をゲーム仕様として確定してはいけない。
  rawはnested DependFuncを保持するが、[比較先のgain実装](https://github.com/chaldea-center/chaldea/blob/9fa75655c07ecd76168b1ccf5b8232e8d64664cf/lib/app/battle/functions/gain_hp_from_targets.dart)
  は事前HPからgainを算出してから依存Functionを実行する。NPも同様の順序を持つ。
  同じ結果となる保証があるstateと、抵抗／clamp／gain modifierが介在するstateを分離し、
  U0でread snapshotとcommit順序の根拠を確定してからU2を実装する。

**実装した監査:** `data-pipeline/src/resourceProductionAudit.ts`を既存shared
`productionAudit.ts`から一度呼ぶ。既存の全source occurrenceと全normal／LB evidence cellを使い、
resource mutation、unsupported×trigger×damageRelevant、dependent target family、count scope、
HP loss variant、BP書込・capacity変更・phase／割合条件と欠損amountを一つのinventoryへ収束させた。
全masterの再load／再compile、別damage evaluator、runtime raw readerは追加していない。
Flow closure（U0監査コードのみ）: N/A: 観測項目の追加でありcanonical state／実行outcome／write pathを変更しない。
依存先ID不一致・欠損・非object値はauditをfail-closedにするfocused fixtureを追加。

新inventoryはNP730／HP179／star255／BP1、HP loss cellsはsafe245／通常275／percent-safe10、
BP書込cellsは51（3300200加算21、705300加算20／減算10）、canonical BP amount欠損10を固定。
依存NP／HPの計60cellを合算して一種類に潰さない。pipeline audit digestは
`c2e174e0988584dbdcafbd954c4da5f8ba97036cda8cd7b5467c30dfda02453a`へ変更。
変更理由はinventory field追加だけで、inventory以外の全audit recordsが旧HEADと一致することを確認した。
master SHA-256とapplicationのdamage／baselineは不変。

**初回監査の検証（capacity／条件追加前）:** focused2 files／6 tests成功（`.test-results/2026-09-08T04-40-43-066Z-45-f4fb7c`）、
production24 files／119 tests成功、35.73秒（`.test-results/2026-09-08T04-41-03-998Z-16-cf682a`）。
master read／parse／compileは1／1／1を維持。旧HEAD auditと変更後auditを同じparse済みmasterで
warm-up後5回ずつ順序交替で測定し、compile中央値460.52ms→464.71ms（+0.91%）。
これはauditの追加コスト測定であり、未着手のruntime実装の性能合格とはしない。

追加後はfocused2 files／7 tests成功（`.test-results/2026-09-08T05-03-00-580Z-15-8b9395`）、
production24 files／119 tests成功、39.70秒、警告0（`.test-results/2026-09-08T05-03-57-504Z-15-018dd5`）。
inventory以外のrecords一致も再確認。同じ5回交互測定で中央値471.02ms→505.10ms（+7.24%）。
この一時測定scriptではNodeの`module.register`非推奨警告を観測したが、focused suiteの警告は0。
最終`pnpm quality`成功（`.test-results/2026-09-08T05-04-42-574Z-15-8ea5dc`）：
unit643／production119／Playwright26、267.17秒、警告・unexpected console・retry0。
前回監査gateの241.10秒より全体時間は増加しており、単発の全体時間からruntime性能合格は主張しない。
U0のaudit compile測定と、U5が所有するproduction／ranking hot-path性能gateを区別する。

**独立調査の追加delta（F3／C5〜C7）:**

- Verified（inventory）: BP capacity writerは`addMaxBattlePoint`の25 cells、全てNPの
  `afterDamage`。phase条件260／割合条件130 cellsも監査へ追加した。前回調査はpoint加減算と
  domain定義に偏り、raw buff側のcapacity writerを拾えていなかった。実装との差は、currentだけでなく
  capacity変更でも割合／phaseの読取値が変わる点。最低guardrailはcurrent・capacity・phase・rateを
  区別したshared inventoryと、capacity変更→read／rollbackの小型fixture（Deferred: TSK-06.45 U2）。
  現行のafterDamage writerは同一terminal damage後なので、これだけで現行damage不具合とは断定しない。
- Deferred: TSK-06.45 U1〜U3。BP domain IDとactor identityを分け、recipientのlive resourceを読む。
  根拠は`candidateExecution.ts:quantityOperationIsNotRelevant`のattacker／NP種別限定、
  `effectNormalization.ts`のphase条件とsourceQuantity条件への分割、
  `activationCondition.ts`の`sourceQuantityRanges`読取。writer→後続conditionで古いfactを
  使わない契約へ収束させる。例えばcurrent2／capacity4で加算2後にrate<=999は偽となる。
  この反例はschema fixtureで固定し、現行skillでの再現判定にはplayerChoiceを適用したprogramを使う。
- Verified（比較証拠の限界）: retained dependent cellsはouter／innerのRate1000かつ自己gain、
  donorとrecipientは別actor。ただしRate1000だけではcharge減少抵抗の不存在を証明しない。
  比較実装は事前量からgainした後にchildを実行するため、child失敗時の実適用量のoracleにはできない。
  Blocking: dependent transferのread／commit契約の技術根拠（U0が所有）。無抵抗・別actor・介在効果なしの
  同値なケースと、抵抗／同一actor／clamp／回復補正で順序差が出るケースを分離する。
  前者だけの一致を全familyの証明とせず、資料で確定できないschema状態はfail-closedを設計する。

**初期最大HPの製品判断と次のaction（2026-09-08、利用者承認済み）:**

ランキングは選択Lvのmaster HP＋HPフォウ1000、礼装なし。通常計算機は選択Lvのmaster HP＋
HPフォウ1000＋装備礼装HP。HPフォウは今回追加した固定条件で、ATKフォウ設定から推論しない。
編集UIは追加しない。製品条件の正本はランキング要件v0.10.3 §4.2と効果実行要件v1.2.2 §3.1a。
以前の「master HPのみ」案は不採用。初期HPの製品判断に対するBlockingは解消した。
戦闘中の`addMaxhp/subMaxhp`は別の意味論として扱い、初期basisへ混入させない。

**Verified（データ／装備情報の調査、実装完了ではない）:**

- `schema/src/index.ts`の装備schemaは礼装ID・Lv・限界突破数を保持し、portable側にも同じ情報がある。
  `calculation-application/src/scenario.ts:damageResolutionInputForNoblePhantasm`は現在その情報でATKを解決する。
  HP計算にATKやATK overrideを流用せず、同じ装備identityからHPを独立解決する。
- `data/raw/nice_equip.json`をpublished masterの全2700礼装へID joinした。
  全件に`hpBase/hpMax/hpGrowth`が存在し、成長表は計213176 cells。
  全cellが非負整数、配列長はraw lvMaxと一致し、canonical最大装備Lvが配列範囲内であることを確認した。
  **現在の装備入力に追加情報は不要**。ただしpublished canonicalからはまだHPを解決できない。
- `data-pipeline/src/atlasContract.ts:AtlasEquip`、`snapshotNormalization.ts`、
  `master-data/src/index.ts:craftEssenceMasterSchema`がHPを落としている。
  rawのLv別HPをcanonical growthとして保存し、Lv−1の実データを使う。ATKの線形補間をHPへ転用しない。
  servant rawにもHP成長表があるが、playable全form／選択Lvの完全性はU1共有inventoryで固定する。

**Deferred: TSK-06.45 U1〜U4（変更範囲／guardrail）:**

pipeline raw型・normalizer→master schemaと全HP成長表→application初期HP resolver→executor→
保存／portable／workerのidentity・再構築へ接続する。新しいHP編集UIや保存済みHPフォウ設定は追加しない。
礼装なしの0、canonicalに明示されたHP0、HP欠損、装備ID不一致、不正Lv、stale masterを区別し、
欠損を0として継続しない。CE Lv／限界突破／装備解除、servant Lv、ATKフォウだけの変更、
reset／復元をC5・C9・C11へ追加する。ランキング＋1000と通常計算機＋1000＋CE HPのparityは
礼装なしで一致、装備ありは同一canonical装備条件同士で比較する。戦闘最大HP増減後の二重加算も反証する。
canonical schema／master再生成が必要だが、今回の更新は要件・Task・flowのみで数値実装はまだ行わない。

**独立調査の継続（BP／dependent）:**

- `preparationFacts.ts:preparationConditionState`は過去appliedActionsのsourceQuantityを除外する一方、
  contextと現在actionのfactsは保持する。したがって単純な「全ての古いfactが残る」という診断は不正確。
  BPのlive stateと現在actionの事前factが競合しない読取契約を、operation内のmutation→conditionまで
  追跡する（Deferred: TSK-06.45 U0〜U2）。上限変更／割合readの反例は前節を維持する。
- 比較実装`gain_np_from_targets.dart`はenemy receiverの場合にgainを1へ変換し、コメントにもValue2解釈の
  推測を含む。player NPとenemy chargeを同じ量型に潰さず、receiver team×donor resourceを区別する。
  比較実装だけで未確認branchを採用しない。依存先減少抵抗とread／commit順の技術Blockingは残る。

U0全体、U1〜U5、TSK-06.45全体は未完了。HP製品判断待ちを理由にBP・依存量調査を止めない。


### U1／HPデータと初期値resolverの実装checkpoint（2026-09-08）

利用者の実装依頼後、既存dirty変更を保持してHP familyから着手。
**現時点の到達点はcanonical HPデータと初期値の解決／検証であり、ordered HP更新とdamageへの適用は未完了。**

- Verified: raw servant／CE `hpGrowth` → `snapshotNormalization.ts` → `hpByLevel`。
  shared resource auditがservantのcanonical ATK対応Lv全てと、CEの全合法装備LvでHP存在を検証する。
  servant469件／56250 cells、CE2700件／213176 cells（明示HP0は70536）。欠損は0補完せず監査を失敗させる。
  Lv別実値を保持し、ATK補間式・servant ID分岐を追加しない。
- Verified: master schema46、master `20260908.01`、32771960 bytes、
  SHA-256 `895a9c1f042ed64e6dd2dc272909fd56cf5107f8dcb16d5f24744178b0e1bb5f`。
  e354764のsnapshotからHP成長表とversion以外が一致することを構造比較した。
  manifest／fixture／normalization golden v66／evidence registryを同時更新。
  pipeline audit digestは`2546a42746b2e36508b2b4d844e03a5512838191dbb43f2ef2d0a8599c851e35`。
- Verified: `calculation-application/src/initialHp.ts:resolveInitialMaximumHp`が固定HPフォウ1000を加算し、
  装備ID・Lv・限界突破の合法性とcanonical HPを検証する。`resolveScenarioPreparationOutcome`が
  calculator／ranking共通で呼び、prepared outcomeへ`initialMaximumHp`を保持する。
  ATKフォウ・ATK overrideを参照しない。新HP編集UIなし。
- Verified: 欠損HP／不正装備は`initialHpUnavailable`のinvalid。
  portable再実行とversion upgrade失敗時の旧request/result保持で確認した。
  ranking profile集約の固定`attackerLevelStatUnavailable`を除去し、元のinvalid理由を保持する。
  不存在CEの旧unsupported期待は、装備条件不正のinvalidへ意図的に変更。
- Deferred: TSK-06.45 U2〜U4。`initialMaximumHp`はまだpreparation／damageの実HP stateへ接続していない。
  現行のHP比率、OCのHP書込による無効化、通常executorのHP resource未対応を置換し、
  mutation→後続read、maxHP増減、rollback、preapply／ordinaryの二重適用を閉じる。
  BP・dependent量の未確定契約とF1 admission closureも引き続き本Task内で所有する。

検証: HP growth／shared audit focused4 files20 tests成功
（`.test-results/2026-09-08T07-43-48-986Z-45-32aa7f`）。
application／portable／profile outcome focused4 files55 tests成功
（`.test-results/2026-09-08T07-46-41-972Z-45-ac6f4f`）。
production24 files119 tests成功、32.36秒、warning0
（`.test-results/2026-09-08T07-47-59-152Z-16-30b08c`）。
同じparse済みmasterのaudit compileをwarm-up後5回交互測定し、e354764のaudit中央値
450.27ms→483.04ms（+7.28%）。artifactはHP growth分で30361798→32771960 bytes（+7.94%）。
これはHPデータ／inventory追加の測定であり、未接続のordered HP／BP／dependent runtimeの性能合格ではない。
現行damage baselineは393/433・420/422のまま。初期HPの解決成功を全攻撃宝具の数値closureと扱わない。

最初のquality（`.test-results/2026-09-08T07-50-30-945Z-15-cc5d72`）はPlaywrightの画面比較4件で失敗。
基点e354764のquality成功（04:29の記録）・同一lockfile／UIコード／Playwright設定と比較し、
`introducedByChange`と分類した。calculator desktop／320px／390px、ranking desktopのdiff画像を確認し、
最終安定画像の58／41／43／34 pixelsの差分はmaster版表示に限定された。
画面期待値を通常のPlaywright撮影で更新した。先行assertion失敗で未到達だったranking detailも
版表示だけの変更を画像比較し、計5枚を更新した。
更新run（`.test-results/2026-09-08T07-56-05-078Z-15-7cf073`）は5 tests自体は成功したが、
Playwrightの再生成console.logをobserverが検出してcontract_failureとなった。許可ルールは追加せず、
更新なしのqualityを再実行する。
最終`pnpm quality`は成功（`.test-results/2026-09-08T07-57-14-352Z-16-f773ca`）：
unit660／production119／Playwright26、253.69秒、warning・unexpected console・retry0。
このgateは今回のHPデータ／初期resolverの検証であり、U1全体やTSK-06.45の完了ではない。
#### 次セッションへの引き継ぎ（U1部分実装済み、Task全体未完了）

再開基点はHEAD `e354764a6ad32aedf215c7fc7b785c73331d6f35`＋現在のworktree差分。
今回までの文書・監査・HP実装・master・fixture・画面期待値5枚は未コミット／未ステージ。
reset／clean／一括checkoutで消さず、開始時にGitと本checkpointを照合する。
現行masterは上記20260908.01／master schema46、portable schema38／engine33.0.0。
初期HPの製品条件は承認済みで、再確認待ちはない。追加UI・編成入力等の製品範囲変更が必要な場合だけ相談する。

**最初の実行単位:** HPのsafe／通常loss・maxHP補正のcanonical契約を確定し、
`scenario.ts:resolveScenarioPreparationOutcome`の`initialMaximumHp`を共通HP state／receiptへ接続する。
初期最大HPを計算しただけでは、既存HP比率を置換したことにならない。

| 再開時に追う直接経路 | 必要な変更／検証 |
| --- | --- |
| `executionSemantics.ts` → master operation → `operationCompiler.ts` | safe loss／通常loss、固定／割合、回復、maxHP増減と除去の量・上下限を保持する。raw語彙はpipeline内に限定 |
| `preparationContracts.ts`／`sourceCollection.ts` → `preparationTransaction.ts`／`preparationPhases.ts` | 初期HPからordered stateを生成し、適用済み入力・resource receiptと利用可能な入力を分離。各sourceのrecipientを保つ |
| `ocSourceBinding.ts` → `ocState.ts`／`preparationOc.ts`／`preparationFacts.ts` | 現行`hpWrite`／`hpWriteOthers`／`hasOcHpWrite`による読取無効化を、共通stateの最新HP読取へ収束させる。条件false・確率失敗・unknownを同一扱いしない |
| `resourceSemantics.ts` → `candidateExecution.ts` → 最終damage入力 | 現行HPの`resourceStateUnavailable`とratio別管理を置換し、準備で適用済みの変化を二重適用しない。全command rollbackとretryを検証 |
| application constructor → portable／reset／Lv・装備変更 → UI | 初期basisから再構築し、戦闘中のmaxHP補正を初期値へ混ぜない。旧state／worker／cacheの回復と版更新はU4で閉じる |

最小反例はC5〜C8・C11のdeltaとして、HP1にsafe／通常loss、回復clamp、
固定／割合と端数、maxHP変更→HP比率／OC／damage読取、条件false／確率失敗、
skill→transform→terminal、passive／CE／support、途中失敗→rollback→再実行を用意する。
初期resolverの欠損拒否テストだけでこれらをVerifiedにしない。

**同じTask内の残作業:** BPのdomain IDとactor identity、current／capacity／rate／phaseを分離し、
変化後の条件をlive stateから読む。dependent量はreceiver／donorのresource単位、
read snapshot／commit順序、減少抵抗・clampを確定する。比較実装は補助資料でありoracleではない。
未確定の技術契約はU0、typed IRはU1、共通実行はU2が所有する。
F1のtrigger／admission共有化も未実装。これらが揃ってからU3〜U5を閉じる。
資料のURL・取得hash・比較commitは本noteのU0進行記録を参照し、`/tmp`のcloneやscriptを必須の正本にしない。

検証はaffected focused → unit／production → 最終quality。既存成功runの反復だけを先行せず、
次のsemantic変更に対応する反例から進める。全masterはshared inventoryを再利用する。
最終目標はdefault433/433・422/422と指定80条件、全variant、parity、fail-closed、性能・UI契約のclosure。
今回のquality成功はHP初期値までの証拠であり、U0／U1全体・U2〜U5・TSK-06.45の完了ではない。


### 残作業のStep 1再設計（2026-09-08、e354764＋未コミット差分）

本deltaはNP metadata境界実装前の設計履歴。現行引き継ぎは後段の「NP metadata境界後の残作業Step 1」を参照する。
今回は調査・設計・Task更新のみ。新たな実装許可はなく、Step 2は次の利用者依頼から始める。
AGENTS、systematic-review／prompt-engineering guidelines、現行ranking v0.10.3、
damage-effect-execution v1.2.2、TaskとGit差分を照合した。初期HPの製品条件は変更しない。
HEADはe354764、masterは20260908.01／schema46。既存未コミットのHP実装・監査・
要件・master・fixture・画像を保持。393/433・420/422とquality成功は前回証拠の継承であり、
今回再測定した数値ではない。全Taskの完了、数値closure、性能合格へ読み替えない。

#### 現状調査の追加証拠と以前の検出漏れ

**F3 delta（最大値と量modifierの所有権）:** 現行master全13,875 effectを一度再帰走査した。
HP function occurrenceはgainHp142、gainHpPer2、lossHpSafe23、lossHp11、lossHpPerSafe1、
gainHpFromTargets3。buff occurrenceはaddMaxhp34（afterDamage8／timingなし26）、
subMaxhp4、upGainHp56、downGainHp8、upGivegainHp5、upFuncHpReduce38、subFuncHpReduce1、
hpReduceToRegain2、reduceHp150、regainHp88、reactiveDamageGainHp1。
これは格納effect数であり、選択programの到達件数・発火件数ではない。
`resourceProductionInventory`は現在HP function lossとBP capacityを観測するが、このHP buff集合を
量へのread/writeとして分類していない。`executionSemantics.ts:typedStateFamilies`は最大HP増減も
generic state addへ落とす。従ってHP179 mutationだけの監査では同じ量契約の全producerを捉えない。
前回のgapは最大HP増減を反例名には挙げながら、回復量／減少量modifier・変換・解除をinventoryに
展開しなかった点。全件が現在のdamage不具合という主張ではない。
最低guardrailはこのbuff集合をraw全cell→source／trigger→first readerでjoinし、
即時量modifier／最大値instance／turn-end／被攻撃時／証明不能に分類すること。
turn-end回復や被攻撃時効果を即時healへ変換しない。後続の有限phaseで読まれるinstanceだけを実行し、
非関連proofのないgeneric state addを成功扱いしない。

**F2／F3 delta（時点の分裂）:** `scenario.ts:resolveScenarioPreparationOutcome`は初期最大HPを
解決するが、`resolveAttackerFormExecution`へ渡さず、戻り値へ付けている。
`sourceCollection.ts`／`preparationContracts.ts`の入口はratioのみ。
`planPreparationResourceTransaction`と`executePreparationPhase`はOC/context処理を終えた後で
`applyPreparationSourceResources`のNP-only passを実行する。
`preparationFacts.ts`は初期contextのHP・BPを読み直し、`ocState.ts:rateValue`は
HP write markerで読取を拒否する。`candidateExecution.ts`はresourceをstar-only reducerへ渡す。
共通HP reducerを一個追加するだけではこの順序は閉じない。以前の「共通helper」中心の計画で
不足した検出は、action内のresource→conditionとcondition→resourceの両方向である。

**F1 delta（proofの粒度）:** `resourceSemantics.ts:operationReadsResource`はcondition、
specialAttackDependency、modifier式の一部だけを読み、OC・dependent amount・NP到達性を含まない。
`operationCompiler.ts:compileEffect`はtriggerScope非nullを一律省略する一方、
`rankingActionAdmission.ts:unsupportedEffect`はrelevance前にunsupportedを拾い、
`compileCandidateLocalActionAdmission`はprofile keyへ集約する。structural actionはその検査を迂回する。
`rankingQuantityWorld.ts`はconditionの境界±1と端点を初期ratio／phaseへ直接書くため、
mutationの逆像やamount-only readerの候補完全性を証明できない。
これらはe354764から残る機構で、今回のHPデータ追加が導入した不具合とは扱わない。

**BPの再確認:** Atlas Nice APIの[705300定義](https://api.atlasacademy.io/nice/JP/battle-point/705300)
を再取得し、上記U0のSHA-256と一致した。割合方式とdefaultMax4／条件付き8／maxLimit12を確認。
[3300200定義](https://api.atlasacademy.io/nice/JP/battle-point/3300200)のSHA-256は
`dc3e11f7c94a2a43bdb4194eac00c3fe7a2a699ece5b12ce6c41209966bf6489`。
こちらはpoint閾値-1,0,10,…,90でscriptは空。phase最後の境界90をcapacity90と推測しない。
外部APIの更新を現在のmasterへ混ぜず、Step 2で取得入力とmanifestを固定する。
[fgo-docs](https://atlasacademy.github.io/fgo-docs/)も確認したが、確認した本文からは
HP量の全丸め・最大HP解除・dependent gainとchild失敗の順序を確定できなかった。
上記比較実装を正解oracleへ昇格させず、未確定の技術gateを下表へ限定する。

#### 採用する設計と不採用案

| 契約 | 採用判断・理由 | 残る技術gate |
| --- | --- | --- |
| 初期HPと実HP | applicationが装備identityとLvから既存resolverを呼び、準備開始前にtyped initial basisを渡す。runtimeはactor-qualified current、effective maximum、最大値instanceを保持し、ratioはread時に導出。初期最大HPを戦闘補正の保存先にしない | 入力permille→整数HP→表示ratioの丸めとHP0の実行境界をU0-Hで固定。0→1の暗黙clampを禁止 |
| HP量と最大値 | fixed／割合量、safe／通常loss、回復量modifierのowner、最大値付与／解除をclosed unionへ保持。付与・解除のcurrent補正を同じreducerへ置く。初期HPの再解決による最大値解除は不採用 | 割合の分母、丸め位置、safe下限、最大値解除時のcurrent、回復／減少量補正の合成順をU0-Hで確定 |
| HPの外部actor | source HPとrecipient HPをtyped actor identityで区別。既存source ratio入力は初期intentとして扱い、attacker最大HPを流用しない | ratioだけで一意なreadは継続可。絶対mutationにsource最大HPが必要で既存basisから決まらない場合はunsupported。新入力追加は相談対象 |
| BP | domain identityとactor identityを別型にし、point＋capacity rule／instanceからphase・rateを導出。phase/rateを更新可能stateやsourceQuantity成立factとして二重保持しない。existing phase UIはapplication commandが合法point witnessへ解決する | phase区間の境界、point上限、動的capacityの再評価時点、同じphase内の複数pointが後続readで分岐する場合のwitness規則をU0-Bで固定。最小pointへの無根拠な一意化は禁止 |
| 依存量 | currentGauge倍率、target count、individual count、buff count、dependent transferを量型で区別。selector／actor重複の計数単位、NP basis points／enemy charge／HPを別型にする。nested childを同じcommandに含める | six raw familiesの各量式・read時点はU0-D。gain snapshot、試行量、child実適用量を別receiptへ保持し、後二者を無条件にgainへsumしない |
| 共通実行 | 既存bounded phaseのsource列を維持し、各stepのcondition→proc→read→writeを一つのtransaction draftへ適用。OCはNP本体より前にreceipt固定、終端で参加instanceだけ消費。OC/context完了後の独立NP passを削除 | U2-HでHP／NP／OC順序を接続し、U2-B/Dが同じ入口を拡張。新packageや汎用battle simulatorは作らない |
| relevance／admission | executionがtyped read/write/trigger factsとprogram-bound non-interference proofを所有し、applicationがpolicy admissionを決める。automatic sourceはactionに偽装しない。条件unknownをfalseにせず、exact no-op proofだけを認める | U1-Rで共通contract、U3で全candidateとprofile集約へ接続。source非関連とeffect包含offを同一proofにしない |
| 再実行とidentity | 初期intentだけをportableへ保存。receiptは導出evidence。repair／policy変更／装備・Lv変更／reset／upgradeは同じconstructorから再実行。初期／使用input／適用stateを別型にする | U4でschema・engine・必要なmaster版を一括更新。異なるreceipt／basisを同じdamage cacheへ混入させない |

BP既存UIのphase選択をpoint editorへ変える計画ではない。既存入力で一意な結果を得られないことが
U0-Bで確認された場合のみ、具体的な反例と最小の製品差分を相談する。
HP0もschemaでは合法（`quantityFacts.ts`の0〜1000）。これを死亡simulationの導入理由にせず、
分析用の初期ratio0とordered lossで攻撃が実行不能となる状態を混同しない契約をU0-Hのgateとする。

数値readは現在state、付与済みmodifierの値が利用時依存ならその利用時stateを参照する。
HP→OC率→OC付与→NP cellの間接辺、BP capacity→割合condition、buff解除→count量を含める。
proofはprogram／policy／selected variant／read時点へ束縛し、policy再適用で使い回さない。
HPやBPの最小・最大だけで単調性を仮定する案と、unknown candidateを落として残りの最大値を返す案は不採用。
有限候補は初期domainの端点・condition／piecewise式の境界・ordered reducerを逆向きに辿った境界から
生成する。逆像を証明できない有限小domainは全探索、上限超過はtyped failureとし4096を緩和しない。

**outcome合成:** inclusion off、proc failure、条件false、proof付き非関連は正常な非適用。
実際に不可能な具体candidateはunreachable、修復可能な既存input不足はinputRequired、矛盾はinvalid、
未解釈はunsupported。stochastic child failureはゲーム上の結果としてparentの量契約に従い、
必ずcommand拒否／rollbackになるとは仮定しない。invalid／required／unsupportedでcommandを拒否した場合は
HP／NP／BP／OC／context／formとreceipt全体を元へ戻す。profile最大値の確定には全admit対象の
解決または除外proofを要求する。ranking生成責任のwitness欠落を利用者の未入力へ変換しない。

#### 既存flow inventory／反例のdelta（実装証拠とは分離）

| 追加・再確認path | 反例と検証方法 | Status |
| --- | --- | --- |
| HP raw buff→量modifier／最大値instance→除去→reader | C3/C7: max10000/current5000への最大値付与・解除、heal modifier→heal→loss、turn-end／被攻撃trigger。値はU0-H根拠から独立期待値化し、generic addを許容しない | Deferred: TSK-06.45/U0-H,U1-H,U2-H |
| 初期basis→sourceCollection→preparation→damage | C3/C11: Lv/CE違い、max10001とratio333、明示0／null、ATKフォウだけ変更、transform前後。初期最大値の引数未接続をfixtureで検出 | Deferred: TSK-06.45/U2-H,U4 |
| 共通draft→condition／OC／NP resource→receipt | C7: HP loss→HP条件付きNP gain→NP使用、rate付与→HP更新→OC付与。source配列逆順では結果差、同一ordered programのcalculator/rankingでは一致 | Deferred: TSK-06.45/U2-H,U3 |
| source HP／party-other→同actorのOC率read | C3/C9: attackerとsupportで異なるHP、未知最大値への絶対loss、ratioだけのread、除外recipient、unknown条件＋有限rate消費。attacker流用0 | Deferred: TSK-06.45/U2-H |
| BP point／capacity／trait→phase・rate→condition | C4: current2/capacity4で+2後rate<=999はfalse、同じcurrentでcapacity8ならtrue。phase境界前／一致／後、別actor同domain、選択branch、capacity buff解除 | Deferred: TSK-06.45/U0-B,U2-B |
| snapshot→nested child→gain／rollback | C6: donor量不足／抵抗あり／receiver満杯／receiver=donor／child失敗／後続invalid。snapshot量と実減少量が異なる最小fixtureで順序を判別。schema外simulationは増やさない | Blocking: U0-Dのread/commit根拠。TSK-06.45/U2-Dに限って数値接続を止める |
| target／individual／buff selector→量 | C5: 同一actorの複数trait一致、同一buff identityの複数instance、解除後count、targetなし、NP倍率はNP消費前／後。raw全cellの違いを一量式へ潰さない | Deferred: TSK-06.45/U0-D,U1-D,U2-D |
| proof→optional/structural→candidate→profile | C1/C2/C9: command-card-only／unknown trigger、automatic／support、非選択variant、unknown sibling、all(true,unknown)／any(true,unknown)／not(unknown)。executionとadmissionの判定一致 | Deferred: TSK-06.45/U1-R,U3 |
| initial quantity候補→ordered execution→最大値 | C10: loss／heal clampの後にHP threshold、BPの同phase異point、amount-only reader、OC率閾値。小domain独立全探索と四policyの結果／採用witness／baseline包含を比較 | Deferred: TSK-06.45/U3 |
| preparation receipt→clone／ordinary→再構築 | C8/C11: 同一command二重適用0、sibling invalid後の完全rollback→retry、without-areaとfresh run一致、保存復元／stale worker／version拒否時の旧request保持 | Deferred: TSK-06.45/U2-H,U4 |
| HP／BP／dependent生産母集団→first reader→outcome | C12: 既存shared auditを拡張し全source・全normal/LB/NP cellとlegal programをjoin。未選択variantと併存原因は別列。production0の各readerは小fixture | Deferred: TSK-06.45/U0-R,U5 |
| ターン進行／被攻撃／死亡復活の一般simulation | 現行bounded phaseで発火しないことのproofをU1-Rが持つ。発火しない効果のinstanceを即時回復として使わない | N/A: 現要件外の進行エンジン |

- Blocking: U0-HのHP整数化・量補正・最大値解除契約。U1-H/U2-Hの対応する数値実装に限定する。
- Blocking: U0-BのBP point上限・phase witness・capacity再評価契約。U1-B/U2-Bの対応する数値実装に限定する。

これらの数値実装の前提はVerifiedではない。
調査で存在と経路を確認したこと、設計を採用したこと、runtime反例を検証したことを分ける。
新たな製品判断待ちは現在なし。技術gateは親agentが既存一次資料／raw全cellと反例で解消し、
十分な根拠が得られないbranchはunsupportedとする。ただし現行productionのadmit対象に残るなら
それで全宝具closureとはせず、当該単位をBlockingのまま報告する。

#### 今回の停止点とStep 2開始条件

実行順と各単位の出口はTaskの改訂U0〜U5を参照する。Step 2は次の利用者依頼とGit／本deltaの
照合後、U0-Rのbefore測定・共有join、U0-Hの量契約から開始する。U0-B/Dの根拠不足は
それに依存しないU1-R／HP調査を止めない。HPデータ／resolverを作り直す単位は設けない。
今回変更するのは既存Taskと本noteのみ。文書整合を確認し、phase-completion gateはpnpm quality。
qualityの成功は文書更新を含む現在treeの検証に限定し、未実装matrixをVerifiedへ変更しない。

今回の検証: `pnpm test:docs`成功、`git diff --check`成功。
最終`pnpm quality`成功（`.test-results/2026-09-08T08-38-00-688Z-16-26e934`）：
unit660／production119／Playwright26、288.37秒、warning・unexpected console・retry0。
開始時の全dirty／untrackedファイルのSHA-256と比較し、今回更新したのはTaskと本noteだけ、
新しいworktreeファイル0を確認。製品コード・既存master／fixture／画面期待値は保持した。
このrunはStep 1の文書更新gateで、runtime性能のbefore/after測定や全攻撃宝具closureではない。
TSK-06.45は未完了、06.47は引き続きblocked。

### Step 2再開・共通transactionの先行単位（2026-09-08）

利用者の実装依頼を受領。e354764＋既存dirty差分を照合し、変更前production119件成功
（31.81秒、`.test-results/2026-09-08T08-44-43-211Z-15-05c207`）。
U0-RのHP buff全cell監査を追加。HP0%の分析値／攻撃不能の製品判断は確認中で、その入力の
実HP接続だけを保留する。HP量やBPの技術gateを成功扱いしない。

U2-HのうちNP／OC順序統合を先行する。この単位は新しいHP数値規則に依存しない。
既存source列のcanonical operation順にNP更新を同じtransaction draftへ入れ、後置NP passを
削除する。NP-use前のgauge／OC receipt、source条件・proc、拒否codeを維持し、phaseとcommandで
同じ入口を使用する。HP／BPはまだ新しい数値stateへ接続したとは扱わない。

反例delta（C7/C8、Deferred: TSK-06.45/U2-H）: NP gain→OC付与失敗、OC付与→NP amount不正、
source内の複数NP mutation／別sourceでのclamp、NP消費後のOC別cell charge、automatic／external
phaseの後続失敗。invalid／unsupported／inputRequired時はNP・OC・context・receipt全体rollback。
この単位の完了は二段階NP passの参照0と既存focused／production parityで判断し、
U1-R全体やHP実行closureをVerifiedへ変更しない。

#### 先行単位の調査・検証delta

HP buff監査は`resourceProductionInventory`の既存全source／normal・LB cell走査へ追加した。
最大HP、HP回復量、HP減少量、継続回復／減少、変換を別keyとして保持する。未知のHP buff語彙も
監査へ現れるため、runtime allowlistに存在しない語彙を監査段階で消さない。
HP buffは11種、cell key／target／trigger／timing別58群。pipeline digestは
`7a5926f0f5f31ccd064de6c8afa96550cd344560c040de04fc20f12257f359bc`。
inventory以外の15,218 recordsは変更前と一致。これはraw母集団の補強であり、
legal program→first readerの全join完了ではない（Deferred: TSK-06.45/U0-R）。

C7/C8検出漏れの修正: Step 1はsource間の失敗順／全command rollbackを列挙したが、
一つのMasterEffectにNP mutationと確率OC operationが共存するschema-legal stateを分けていなかった。
後置passを除く際、NP先行書込の後で同効果のOCが確率失敗すると、効果の最終activationはfailureでも
NP draftだけが残り得る。`executePreparationOc`のsource開始時NP snapshotをそのsourceの終了時に
確定し、確率失敗時はsource分を戻す。command拒否では公開するstructuralStateも開始stateを返す。
これによりnormal stochastic failureとinvalid／unsupported／inputRequiredを混ぜない。
最小guardrailは同効果内NP先／OC先×成功／失敗／入力修復、別sourceの失敗順、
NP-use receipt固定後のOC grant→OC別cell refund。`preparationTransaction.test.ts`で保持する。
全resourceのsource単位確定を閉じたとはせず、HP／BP／dependentには同じ反例をU2で適用する。

NP-only後置pass `applyPreparationSourceResources`／`selectedSourceNpMutations` は削除し参照0。
NP requirement／all消費を先に行い、発動時OCは消費前gaugeのreceiptへ固定する。
その後はcanonical source／operation順でNPとOCを実行し、各NP stepでclampする。
順序依存の失敗codeと実行記録が変わるためengineVersionを33.0.0→34.0.0へ更新した。
master schema46／portable38の構造変更は今回なし。既存5 goldenのengine identityのみ更新し、
期待damage数値は変更しない。旧OC証拠artifactは当時のengine identityで保持する。

変更前後の既定ranking433 recordsは、143 actionのocOutcomesへのNP step追加を除き一致する。
393 calculated／40 exclusion、request2096／distinct1329、calculator replay393件の差分0。
交互3回測定のbeforeは4064.78／4053.78／4060.44ms、afterは4509.11／4086.42／4209.36ms。
中央値4060.44→4209.36ms（+3.67%）。同一masterを保持し、4 execution moduleだけ変更前後に切り替え、
各runを別process・非並行で実行後に実装bytesを復元した。artifactは
`/tmp/tsk0645-step2-paired/{before,after}{1,2,3}/manifest.json`。
HP buff監査は共有parse済みmaster、warm-up後交互5回でcompile中央値504.62→488.69ms。
測定scriptは`/tmp/tsk0645-step2-measure-audit.ts`。未説明の10%超hot-path退行はこの単位では観測しない。

U0-Bの追加根拠: [公式のスキル説明・不具合案内](https://news.fate-go.jp/2026/08/2026summer_pu1/)
（2026-08-12公開、8月28日追記）でスキルのpoint加算と、宝具効果前のcapacity増加が不具合であることを
確認した。rawのafterDamage capacity cellと整合し、同宝具damageのrate／phaseへcapacity増加を
遡及しない設計の根拠になる。同案内はcontinue時にcapacity buff解除と初期値resetが正しいとも記載する。
continue simulation自体はN/A: 現行bounded phase外。正規state再構築が旧capacityを持ち越しては
ならない反例としてU4へ保持する。将来の修正状態を推測せず、この時点の説明を証拠とする。

BP absentとpoint0の同一視も禁止する。比較実装`battle_point_calc.dart`ではstate absentのphase0と、
state生成後point0のphase1が区別される。rawのphase0境界-1／phase1境界0と整合するが、これは
独立したゲーム動作検証ではない。初期phase入力→actorのdomain存在→point witnessの対応はU0-Bで
確定するまでBlocking。3300200のscriptにcapacityがないことを最終phase閾値90で補完しない。

| 今回閉じるstate × path | 判定 |
| --- | --- |
| NP mutation→後続OC／OC→後続NPの失敗順と全command rollback | Verified: `preparationTransaction.test.ts`のinvalid／unsupported／入力修復反例 |
| 同一effectのNP／OC順序×確率成功・失敗・未入力 | Verified: mixed occurrence fixture。失敗は通常非適用、未入力はcommand拒否 |
| NP消費前gauge→OC receipt→NP-body grant後の返還cell | Verified: frozen receipt fixture。追加OCで同じ宝具のcellを再選択しない |
| automatic／CE／external phase→terminal NP失敗→再実行 | Verified: 既存phase・charge rollback fixtureを同じ共通入口で再検証 |
| HP buff全source／normal・LB cell→pipeline digest | Verified: `resourceProductionAudit.test.ts`／共有production audit |
| HP／BP／dependentの実量と回復経路、全programのread closure | Deferred: TSK-06.45/U0〜U4。上記NP単位の証拠を流用して完了させない |

#### 画面差分とperformanceの追加確認

最初のquality（`.test-results/2026-09-08T09-28-15-853Z-16-5ec43f`）はunit666／production119が
成功、Playwright23成功／3失敗。失敗画像を確認し、desktop／320px／390pxともengineVersion表示の
33→34だけが差分であることを確認した。既存のmaster・damage数値・layoutを保持したactual画像で
3枚の期待画像を更新する。原因分類はintroducedByChange（意図したversion表示変更）。

同runのproduction40.66秒は開始時31.81秒より長く、単一before/afterだけでは性能合格としない。
`diagnostic-attribution`に従い、e354764 archiveへ開始時dirty bytesと同一raw入力を加えた
`/tmp/tsk0645-step2-isolated-baseline`を作成し、workspace package importがarchive内へ解決することを
確認した。比較では利用者worktreeを切り替えず、同じ`pnpm test:production`を非並行で実行する。
初回archive試行はraw入力が未配置で118/119のため比較対象外。raw入力を配置後の成功runだけを使用する。

raw配置後の交互3回は、before37375／37675／39075ms、after38277／37601／38144ms、
全run119件成功。中央値37675→38144ms（+1.24%）。runner／lockfile／raw入力は同一で、
比較ログは`/tmp/tsk0645-production-pairs/{before,after}{1,2,3}.log`にartifact参照を保持する。
初回の単発所要時間差の帰属はenvironmentDependent: 同一baseline自体でも31.81秒から37〜39秒へ
変動しており、変更による10%超退行は交互測定では再現しなかった。より広い性能無関係は主張しない。
この結果と既定rankingの+3.67%を先行単位の性能証拠とし、U5全条件の性能完了とは扱わない。

#### 検証範囲と残作業

focused `preparationTransaction.test.ts`44件成功
（`.test-results/2026-09-08T09-21-59-065Z-15-a61cf3`）。
先行unit663／production119成功後、同効果内の反例とfrozen refund cellを追加したため、
最終treeのphase gateは改めて`pnpm quality`で確認する。
80条件matrixの一括試行は、通常10条件と成立込み2条件のrecordsを取得した時点で中断した。
成立込みは1条件約96秒で、現行未対応familyを残すこの先行単位ではU5の完了証拠を作れないため、
全80条件成功とは扱わない。部分artifactは`/tmp/tsk0645-step2-after/full-matrix/`。
この中断はtimeout／candidate capの緩和ではない。時間の増減判定には条件が揃った交互測定のみを使う。

次のaction: U0-Rのlegal program→first reader join、U0-Hの整数化／量補正／最大HP解除の根拠、
U0-Bのdomain存在／point witness、U0-Dの依存snapshot／child commitを閉じる。
HP0%の回答はその境界にだけ適用する。今回のNP／OC統合をHP実行接続やU2全体完了としない。

#### 60分checkpoint（2026-09-08 09:45 UTC）

現在outcome: NP／OC順序統合とHP buff監査は実装済み。HP・BP・dependentの実量接続とadmission closure、
TSK-06.45全体は未完了。変更familyはpreparation resource／OC transactionとその監査・engine identity。
確定証拠は上記focused、unit666／production119、既定ranking parity、交互production中央値+1.24%、
ranking中央値+3.67%。画面3件の差分はengineVersion表示だけと確認して期待画像を更新した。
現在の`pnpm quality`はその最終treeを検証中。HP0%の製品判断は回答待ちで、その境界以外のtechnical
gateを回答待ちと混同しない。次のactionはquality結果の記録とU0-R/H/B/Dの未確定契約の解消。
master／HP resolver／既存変更は保持、stage・commitなし。

#### 先行実装の最終検証（2026-09-08）

`pnpm quality`成功、253.21秒、unit666／production119／Playwright26、warning・unexpected console・retry0。
artifact: `.test-results/2026-09-08T09-42-39-137Z-16-59bf20`。
7条件、通常計算機のdesktop／390px／320px、NP1〜5、保存復元・worker・ranking handoffを既存suiteで
再検証した。今回の画面期待値変更はengineVersion表示に必要な3枚だけで、ranking画像は開始時のまま。
開始時のdirty／untracked bytesと照合し、今回の変更対象以外を保持、既存test行の削除0、
master・HP data/resolver・要件の既存変更を保持した。stage・commitなし。
この検証が閉じるのは上記先行単位のみ。初期HP0%は回答未受領、HP量の数値規則・BP witness・
依存read／child commitの技術gateは未解消。U0全体／U1-R／HP・BP・dependent接続／admission／U4〜U5、
TSK-06.45全体を完了としない。

#### 実行中HP0の境界確認（2026-09-08）

利用者の「実行中HP0%は攻撃負荷が正しいでしょう」は、文脈上「攻撃不可」の確認として受領。
実行中のcanonical current HPが0の場合は攻撃不能とし、NPを実行してdamage0を返したり、
unsupportedや入力不正へ分類したりしない。HP1以上が表示割合の丸めで0%になる場合は、この
攻撃不能条件に含めない。判定根拠は表示ratioではなく実HP量とする。
U2-H/U3の反例に、実HP0でのNP拒否、HP1で表示0%でもこの理由では拒否しないこと、
拒否でNP gauge／OC使用回数／receiptを消費しないことを追加する（Deferred: TSK-06.45/U2-H,U3）。
初期入力0%を理論火力の分析値として許容するかまでは今回の発言から確定しない。
初期最大HPのresolverと実行中の最大HP補正、HP0とHP欠損の区別は引き続き維持する。
今回は確認内容の記録のみで、runtime実装済みとは扱わない。

#### U0-D/U2-D current-NP proportional gain delta（2026-09-08）

利用者可視の目的は、現在NPに比例する増加を固定chargeと分離し、calculator／rankingの
共通ordered transactionで次のNP到達性・OCへ反映すること。raw `gainMultiplyNp`は現行masterで
1 occurrence／通常10 skill cells（係数500〜1000 permille）。pipelineだけがraw名を解釈する。
canonical量式は`currentGaugeRatio`、増加量は直前のcurrent gauge × 係数 / 1000の整数部、
その増加後にcapacity clampする。現在値そのものの置換でも、初期値からの再計算でもない。
独立した基本期待値はNP50%＋係数1000→NP100%、NP100%＋係数500→NP150%。
比較実装Chaldea `gain_np.dart`（9fa75655c07ecd76168b1ccf5b8232e8d64664cf）もcurrent値に対する
増分の整数化を行うが、単独oracleにはしない。端数はcanonical basisPointsの各writeで切り捨てる。

新たな調査範囲は量式producer、normal/LB結合、NP step選択、shared reducer、OC依存区間、
OC cell読取、admission、保存／worker経由の再実行。固定量しかないと仮定したconsumerを
一括更新する。matching count／transferの契約はこの単位から独立して未完了のまま保持する。

| path／反例 | 状態 |
| --- | --- |
| raw全cell→canonical係数、normal/LB値差と意味不一致、NP OC cell差 | Verified: pipeline全10 cells、CE normal/LB結合・不一致拒否、NP frozen OC receiptのfocused fixture |
| current gaugeの増加／減少／all-consume後read、逐次clamp、端数、0、capacity | Verified: npResource.test.tsの独立期待値、逐次clamp／all-consume／非整数・負数・unsafe値 |
| invalid係数／欠損cell／別resourceとの矛盾は数値補完せず拒否 | Verified: schemaのNP gain限定とruntime guard、欠損cell rollback／修復再実行 |
| NP対象／unit／domainの未解決・矛盾、既知の別actorとの区別 | Verified: pipeline・schema・direct reducer・OC依存区間の固定／比例fixture。非攻撃NP2件の攻撃実行はN/A: 現行attack terminalへ到達しない |
| source失敗／未知condition、transaction拒否→rollback／retry | Verified: preparationTransaction.test.tsの固定／比例×NP先／OC先×proc成否・未知condition |
| OC依存区間とadmission、calculator／ranking共通結果、復元とidentity | Verified: NP1/2×4 policyのcalculator／portable／ranking input・result・receipt parity、実master明示command |
| HP／BP／他dependent・全80条件 | Deferred: TSK-06.45/U0-H,U0-B,U2-H,U2-B,U2-D,U3,U5 |

current量を読む責務は`npResource.ts`の`gainCurrentGaugeRatio`に集約し、実行とOC依存区間は
`npMutationFromCanonicalAmount`を共用する。UIは量式を解釈せず、既存scenario commandで再実行。
比例量追加段階でmaster schema47／master `20260908.02`／engine35.0.0へ更新した（最終masterは後述の .03）。portable schema38は変更不要：
新しい保存入力を増やしておらず、engine／master identity変更で旧計算結果を無効化する。
この中間master .02の差分はversionと `/servants/360/skills/1/effects/0/execution/0` のみ、HPデータは開始時と一致。

開始時dirty treeの隔離コピーと比較したshared application auditは、inventory以外では
`preparation:704900`の8追加、`calculator:704900`のavailableActions、ranking同profileだけが変化。
既存calculator input／resultは不変。rankingは393→394/433、未対応40→39。NP1・initialOC1・
included/baselineでは容量10000のため比例増加自体はno-opだが、旧unsupportedが同profileを
遮断しなくなり、既存card buffを含む合法候補を比較できる。NP2の明示skill実行では
10000＋floor(10000×1000/1000)=20000、NP1では10000へclampする。
全preparation generated6364→6382、deduplicated3958→3966、terminal3445→3453、
ranking候補2153→2155、damage request2096→2098、distinct input1329→1331。
新しい合法経路に対応する実数ratchetを更新し、最大semantic states56／planner cap4096を維持する。
新しいapplication digest `7f6ce6388fb4396fcb6384c1d4779c12439d6f33f3f67bfb4961d2f4680dadbd`、
pipeline digest `270d5dca7844870d6b7d3e61cb28f2df14df60fc5d5b1fbf125d4ed9f35673f4`。

性能：同processでbefore／afterを交互に3回、各tree独立のcanonical parse／module解決、
ranking default中央値3248.46→3300.19ms（+1.59%、非並行、候補増分は上記）。
`/tmp/tsk0645-multiplier-performance.json`。production suiteは開始時36.18秒／119件に対し
変更後35.96秒／120件成功（後者のrunnerは旧counter ratchetとの差で失敗、契約値を上記へ更新済み）。
全phase gateは`pnpm quality`結果を下に追記する。TSK-06.45全体の完了ではない。


#### 比例量レビューでのNP metadata境界の補強

機構：`resolveTargetPolicy`のnullは既知の別actorと未解決targetの両方を含む。
`selectedNpMutation`／`ocGaugeDependencies`がattacker以外を一律skipすると、対象不明のNP更新を
効果なしと同一視する。既存inventoryは現行sourceSelfと既知enemyの非交差を確認したが、
未解決target×固定／比例量を反例へ含めていなかった。この検出漏れをここで補強する。
範囲はNP量式全体のtarget解決であり、サーヴァント個別の差ではない。
最小guardrail：pipelineは未知targetを`unsupported:unresolvedTarget`へ正規化し、canonical
実行可能NP mutationは対象解決済みだけを許す。直接executorへ不正なtyped値が渡された場合も
対象不明をskipせず拒否し、依存区間で不変を証明しない。既知enemy／別actorの非交差は維持する。
同じcanonical object監査で、HP用のpercent unit／BP用subjectIdも固定NP量へ誤適用できる型であることを
確認した。再発範囲をtargetだけに狭めず、NP mutation全amountのmetadataを対象解決済み・basisPoints・
別domainなしへ限定する。schema拒否とdirect reducer拒否を固定／比例の両方で検証する。
「現行masterで該当0」という初期記載は、全masterで検証する前の誤った見立てだった。
full-master parseで非攻撃宝具2件（504600／605200）のNP gainが`ptSelfAnotherFirst`を未解決のまま
resource mutationとして保持していたことを確認した。攻撃profileに範囲を寄せたinventoryの見落としとして
訂正する。対象を全partyへ推測拡張せず、pipelineで`unsupported:unresolvedTarget`へ正規化する。
masterはimmutable identityを守り`20260908.02`→`20260908.03`へ更新、正規化NP mutation731→729と
unresolvedResourceTargets2を別々にratchetする。2件とも現行の攻撃到達経路に参加しない非攻撃宝具で、
攻撃profile件数と数値は変えない。unit／別domainの不正metadataはproduction0、focused fixtureで検証。
対象不明のfocused red2件を `.test-results/2026-09-08T10-31-03-386Z-16-1bc5b3` で確認し、
共通routing helper／pipeline descriptor／schema制約で補強した。applicationはpipelineの
`unsupported:unresolvedTarget`を既存admissionで扱い、未解決NP mutationの数値化へ進まない。
補強後のpipeline digestは`5130b36b488bb797a76d85945b46c2d338b150938faa33dad0cd8684e9b94892`。
前述の`270d5d...`は比例量追加直後の中間master .02に対する証拠として区別する。

#### current-NP単位の最終検証・継続checkpoint（2026-09-08）

最終treeはmaster `20260908.03`／schema47／engine35.0.0。raw全入力から再正規化したbytesは
公開masterと完全一致した。開始時masterとの差分はversion、比例量1 operation、未解決target2
operationと対応する非攻撃NP canonicalId2件のみ。HPデータの変更0。
NP metadata補強前のqualityは `.test-results/2026-09-08T10-26-53-814Z-16-954346` で成功したが、
その後に補強したため最終gateとはしない。focused68件、補強後production120件が成功。
画像5枚の差分は版番号・ranking件数の表示領域のみ。画像更新時のrunner logはunexpected
observation扱いであり、更新実行をquality成功へ読み替えない。最終qualityは更新optionなしで実行する。

単発production43.63秒はmaster差分走査を並行した非比較条件だったため、退行判定に使用しない。
開始時dirtyの隔離copyと最終treeで交互・非並行に3 pairを再測定：before35359／36452／36146ms、
after35436／36004／37194ms、中央値36146→36004ms（-0.39%）、全before119件／after120件成功。
`/tmp/tsk0645-multiplier-production-pairs/summary.json`。43.63秒の増加はcontrolled条件で再現せず
環境依存と分類し、変更に起因する退行とはしない。最大semantic states56／cap4096と
master read・parse・compile各1を維持する。性能合格をHP／BP未実装部分の証拠へ拡張しない。

最終`pnpm quality`成功：281.23秒、unit695／production120／Playwright26、warning・unexpected console・retry0。
artifact: `.test-results/2026-09-08T10-50-55-645Z-16-fc17cd`。最終code／master／要件／画面でのgateであり、
この記録追記以外の変更を加えていない。今回のcurrent-NP量式・NP metadata境界の実行単位を閉じる。
Task／flow／要件を更新し、HP0攻撃不可はdamage-effect requirements v1.2.3へ反映した。
開始時のHP resolver・HP成長実装、NP/OC先行transaction等の既存変更を保持。stage／commitなし。

継続する目的は全攻撃NPのcommon path closure。現在ranking394/433／calculator420/422で、Task全体は未完了。
次のactionはU0-Hの実量query／回復量／maxHP解除契約とU1-Rのrequired readerを確定し、既存initial resolverを
HP stateへ接続すること。runtime current HP0の攻撃不可は確定しているが未実装、初期0%の分析扱いは未規定。
未規定判断に依存しないHP正値・更新順・BP／他依存量の技術調査は確認待ちにしない。
U0全体、U1-R、HP／BP接続、他dependent、admission、U4〜U5／全80条件を完了扱いしない。


#### HP実量接続に向けたread精度の追加確認（U0-H、未実装）

現行`preparationFacts`、`ocState.rateValue`、`hpValueExpression`、`npDamageOperation`は入力の
HP permilleを読むが、runtime HPは未接続なので、現状の「全readerへ一つの丸め済み比率を渡す」
形を実HP接続後の正解と仮定しない。実HP0の攻撃不能、表示0%、HP閾値、HP依存の倍率は別query。
確定した設計制約は、canonical current／maximumの整数値を保持し、表示の丸めをNP倍率へ戻さないこと。
例えばcurrent1／maximum11000、ゼロHP時bonus10000の線形式では、最後に整数化したbonusは9999、
先にpermilleを0へ丸めると10000になる。この反例をC3/C7へ追加する。これは式の反例であり、
ゲーム内の端数実測を新たに取得したという主張ではない。

比較実装Chaldeaの同commitでは、`damage.dart`のHP依存NPは`hp / maxHp`を直接読む一方、
`models/buff.dart`のHP_HIGHER／LOWERは比率を1000倍した整数部を比較する。
`gain_hp.dart`は割合回復を最大HP基準で求め、付与側・受取側の回復係数を乗算して最後に整数化、
割合lossはその量を先に整数化する。`svt_entity.dart`はmaxhp系とbaseHp系の解除時に異なる
current HP更新を行う。これらは比較証拠であり、11種類のHP buffへ一括適用するoracleではない。
raw全cell／canonical selector／実量queryへjoinし、量modifier・maxHP解除・外部actorの不足状態を
確定するまでU0-H/U2-Hを完了としない。HP実量・HP0攻撃拒否の製品コードは今回も未接続。

### ef45bef後のStep 2実装記録（2026-09-08）

利用者の実装依頼を受領。開始時dirtyは直前Step 1のTaskと本noteのみで保持する。
before production120成功56.00秒（`.test-results/2026-09-08T14-22-04-395Z-15-9cde92`）。
同一parse済みmasterでranking warm-up後3回は5415.49／5384.28／5820.49ms、中央値5415.49ms、411/22。

**U0-Rの前提追加／以前の調査gap:** `rankingStaticSemantics.ts:sourcesForProgram`は全到達formの
automatic sourceを先頭へ集める一方、executorはform変更時に`activatePreparationForm`を実行する。
確認済みなのは二つのsource列の順序差であり、それだけでruntime bugとはいえない。
前回調査はstatic source列をfirst-reader監査へ使う際の「準備activation順とordinary投影」の区別を欠いていた。
最初の試作では静的列を入れ替えたが、ordinaryの読取clockを変える根拠にならないため、その変更は取り下げた。
最終形は`rankingProgramSourceGroups`を一つのsource inventoryとし、準備順と既存static projectionを別に導出する。
engine／master／schemaは不変。順位・damage・candidate evidenceの変更をこの監査単位の目的にしない。

C7/C8の再発範囲は初期／中間／最終formのpassive、transform NP、skill変身、再入場。
小型schema-legal fixtureで変身後passiveのactivation位置、通常投影との差、旧formの火力失効、
同formでの重複activation抑止、再入場を確認する。ordinary値式はdeclared readerとして独立に記録し、
準備writeとの先後が未接続なものを`deferredReader`へ残す。順序不明のreaderを前後どちらかへ決めない。
`firstPotentialReader`、`firstRequiredHpGuard`、`deferredReader`、`firstOpaqueOperation`は独立した観測で、
admission verdictや数値execution outcomeへ合成しない。HP invalidation markerを実HP更新済みと扱わない。

`resourceProgramAudit.ts`を既存application shared auditへ接続する。構造上選択されたprogramを対象に、
canonical amount全cellの件数、NP-use、resource writer、明示condition・NP比例量、OC率利用時の潜在reader、
不足するHP guard、opaque state/依存量とdefault profile outcomeを対応付ける。raw語彙を解釈しない。
OC rateのremoval／condition後の生存はこのobserverでは証明せず、opaque経路として併記する。
`defaultProfileOutcome`は全programの実行成功を意味しない。HP／BP／countのactor-qualified query、
全cellごとの実行可否、calculator装備／支援を含む全経路join、回復／receipt closureはU0-R/U1-R/U2の残作業。

**2026-09-09検証差分:** `sourceGroups`でform、command位置、terminal NP identityをpositionへ結ぶ。
`readCoverage: partialCurrentContracts`をartifactへ明示し、nested sourceQuantity／foreign subjectと
未解決conditionをopaqueへ残す。既存`conditionReadsResource`が拾わないsource-qualified BP rateを
no-reader proofへ読み替えない。BPのactor/domainとread契約はU1-R/U0-Bで閉じる。
normal/LBの非default cellにだけHP値式がある反例、not/any内のsource rate、HP率の付与と利用の間の
HP writeを小型fixtureへ追加した。これは監査の検出範囲の検証であり、数値実行のfixtureではない。

shared artifactの構造programは7,255、所属profileのdefault outcomeはcalculated 6,864／unsupported 391。
同じprofileへ複数programが属するため、program成功件数ではない。writer観測は15,795、opaque観測53,949。
resource-program digestは`d5559c0544b1eb7076f39156ad7d9904e9616bd025561319443608829fc5de53`。

| resource | selected-program writer観測 | source＋effectで重複排除したwriter | 後続HP guardが必要な観測 | writerを含むcalculated profile |
| --- | --- | --- | --- | --- |
| HP | 1,184 | 104 | 1,121 | 87 |
| NP | 12,445（synthetic NP-use消費を含む） | 429（syntheticを除く） | N/A: HP guardではない | 411 |
| stars | 2,077 | 166 | N/A: HP guardではない | 147 |
| BP | 89 | 6 | N/A: HP guardではない | 1 |

`occurrenceId`だけでは別source内の同一functionを区別できないため、位置はsource identityとの組で扱う。
上表はcurrent structural plannerの選択sourceであり、全13,875格納effect、支援、CE、非選択variantの
母集団とは区別する。HP87 profilesという観測は既存calculatedにも調査対象がある証拠であり、
そのすべてが誤計算であるとの断定ではない。

| 今回変更した直接経路／反例 | 状態 |
| --- | --- |
| initial／中間／terminal form → automatic/action/terminal source group | Verified: schema-legal変身・再入場・同form連続skill、missing terminal拒否 |
| source inventory → static ordinary projection → ranking candidate／calculator再実行 | Verified: 既存4,742 recordsのうちinventory以外の4,741件、candidate/request counters不変 |
| selected source → partial resource observations → shared artifact/digest | Verified: focused11 tests、全production120、上記digest。all-cell execution proofは含まない |
| 新しいpersisted state／UI command／復元writer | N/A: この単位では変更せず、schema48／portable38／engine37.0.0を維持 |
| actor-qualified read／maxHP・HP・BP・count／receiptの実行接続、全cell・全経路join | Deferred: TSK-06.45 U0-R/U1-R/U2。Task全体の未接続を消さない |

unit728成功11.17秒（`.test-results/2026-09-08T15-03-47-588Z-15-ed23be`）。
production120成功40.78秒（`.test-results/2026-09-08T15-05-39-498Z-44-2d18bb`）、before56.00秒。
同suiteのshared compileは15,693.48→13,092.08ms。非並行ranking warm-up後3回のafterは
5181.48／4730.55／4555.26ms、中央値4730.55ms（before5415.49ms、約12.6%減）。
candidate6382／dedup3966／damage request2190／distinct1385不変。cap／timeout／複雑度ratchetを緩めていない。
最終`pnpm quality`成功278.54秒（`.test-results/2026-09-08T15-10-35-592Z-44-9e66f1`）。
unit728／production120／Playwright26、skip／todo／retry／warning／unexpected console 0。
これらをTSK-06.45の全数値closureへ代用しない。shared artifactは29.01→82.05MiBへ増加した。
7,255 programの位置付き観測を追加した分で、masterの追加read／parseは行わず、上記suite／hot pathに退行は観測しなかった。

U0-Hの追加一次確認: Atlas API OpenAPI v6.0.0（server commit `8a6af7`）が案内する
[Buff Action定義](https://api.atlasacademy.io/export/JP/NiceBuffList.ActionList.json)を取得し、
SHA-256 `b64b91a4f81df1f0dd3efe2ce31cdbf29c8fa6ac5ab45cee6815b7a95fb2413d`へ固定した。
`gainHp`／`giveGainHp`は別actionでbaseParam1000・baseValue0・limit normal、
`maxhpValue`はlimit none、`maxhpRate`はbaseParam1000・baseValue1000・limit normal。
`maxRate`が複数値のactionは個別buffの上限を取込時に保持し、配列の最大値を全instanceへ一律適用しない。
`turnendHpReduce.plusAction=funcHpReduce`と`turnendHpReduceToRegain`も確認した。
前回の「HP減少量／変換buff」の大括りだけでは、即時lossとturn-end減少の適用先を同じにできない。
比較実装の`getBuffValueForTurnEndHpReduce`もこれらをturn-endで読むが、ゲームの排他性証明ではない。
U0-H/U1-Hでは全11 familyの適用先を切り分け、未知scopeを即時HP reducerへ持ち込まないことをguardrailにする。
初期permille整数化・最大値instance解除後のcurrent・全selectorの数値契約はなお未確定で、
この一次定義の取得だけではU0-Hを完了しない。

実装checkpoint: source inventory／部分監査を実装・検証済み。実行中のHP実状態・BP・残る依存量と
admissionは未接続のまま。次のactionはU1-Rのactor／clock付きquery契約とU0-H/B/Dの技術gateを閉じ、
確定branchを既存transactionとordinary receiptへ接続する。初期0%の分析利用は質問中で、回答を推定しない。
今回の対応件数は増加しておらず、Taskはin_progress。製品コード・tests・Task／flowの差分を未commitで保持する。


### ef45bef後の残作業Step 1（2026-09-08）

以下はStep 1時点の調査・設計記録。実装開始後の差分は上段Step 2節を参照する。既存F1〜F3、C1〜C12、下段の先行実装証拠は維持する。
単位・順序・進捗は[TSK-06.45の既存表](../tasks/development-redesign-tasks.md#tsk-0645-all-attack-np-execution-closure)
だけが所有する。今回は調査・設計・既存文書更新まで。過去のStep 2許可を継続しない。

#### 要件確認

AGENTS、systematic-review／prompt-engineering guide、product v0.3.8、effect execution §3.1a、
ranking v0.10.3 §6.4／初期OC契約、Task表とHP下限IRの最終引き継ぎを確認した。
利用者成果は全攻撃宝具をcalculator／rankingの共通経路で正しく計算可能にすること。
所有familyはbounded preparationのresource／quantity read-writeとaction admissionである。

初期最大HPはランキング＝選択Lv master HP＋固定1000、通常計算機＝さらにcanonical装備HP。
初期basisと戦闘中maximum instanceを分け、HPフォウeditor・ATK推定・欠損0補完は禁止する。
実行中HP0は攻撃不可、表示0%のHP正値は攻撃可能。初期0%の分析利用は未規定として質問し、
そのseed／表示境界だけ保留する。一般の死亡復活や敵との戦闘simulatorは追加しない。
OCは発動前gauge由来baseとliveな自前加算を区別し、NP消費と同じtransactionで固定する。
正常非適用（手動除外／source未使用／proc失敗／condition false／範囲外proof）、到達不能、
inputRequired、invalid、unsupported、calculatedを合成前に区別する。未知候補を落として最大値を宣言しない。

#### 現状調査と証拠境界

基点HEAD `ef45bef`、開始時`git status --short`空。master `20260908.05`／schema48、
32,772,572 bytes、SHA-256 `3a9c481dc25ab151f3be8106352210e4807ca0eaa1f2fb4c19225fa645a9ff6b`を実測しmanifestと一致。
portable38／engine37.0.0。直前qualityとproduction期待値の411/433・420/422は履歴baselineであり、
今回の全条件closureや構造変更前のhot-path測定の代替にはしない。

現masterを一度parseして全13,875格納effectを再帰集計した。HP gain142／percent gain2、
通常loss11／safe loss23／percent-safe loss1。最大HP add34／sub4、回復量up56／down8／giver5、
減少量up38／sub1、減少→回復変換2。turn-end等のreduceHp150／regainHp88／reactiveDamageGainHp1も
母集団に残し、即時HP更新へ読み替えない。BP add5／sub1／capacity1。
未対応依存量はtarget人数3、individual数3、buff数4、NP transfer3、HP transfer3の計16 occurrence。
contextReferenceは29 occurrenceすべてdamageRelevant=falseだが、後続countへの間接寄与は未否定。
これは格納occurrence確認であり、発火回数や22除外profileの原因別件数ではない。
全cellとselected legal program→first reader→outcomeのjoinはU0-Rで既存shared auditへ追加する。

| 直接読取調査（Verifiedは現状確認のみ） | 確認済みの未接続／採用する変更 |
| --- | --- |
| application `initialHp.ts:resolveInitialMaximumHp` → `scenario.ts:resolveScenarioPreparationOutcome` | resolverは固定1000とCE欠損拒否を持つが、`initialHp.maximum`をform executionへ渡さず戻り値へ添付するだけ。U2-H.1で入口seedへ接続 |
| execution `preparationContracts.ts`／`preparationFacts.ts:preparationConditionState` | stateはNP／OCのみ、HP/phaseはcontextから読む。source HPの既存100% defaultはratio入力の規則であり、未知sourceの絶対HP生成の根拠ではない |
| `resourceSemantics.ts:operationReadsResource`／`ocTerminalDependencies.ts:terminalResourceHasReader` | ratio条件／一部値式を読むだけ。HP0の暗黙前提、amount read、actor、最大値instanceを含むproofではない。terminal gauge OCの固定は維持し、後続amount queryまで一律無関係にしない |
| `ocState.ts:rateValue`／`hpValueExpression.ts`／`npDamageOperation.ts` | HP write marker後はOC率unsupported。ordinary NP/値式は丸め済みpermilleを読む。markerの削除だけでは精度もlive readも解消しない |
| `preparationTransaction.ts:effectRequiresPreparationDecision`／`preparationPhases.ts`／`candidateExecution.ts` | NP・dependent・identity中心の準備判定。既存NP/OC draftを拡張し、HP/BP/instanceの条件・proc・順序も準備に含める。ordinaryのpreappliedOperationIds境界で再適用を防ぐ |
| pipeline `executionSemantics.ts`／`resourceProductionAudit.ts` | BP addはpointをbattlePointPhaseへaddQuantity、subのamountはValue列由来、count selectorはunsupportedに保持されない。resource別IRが必要 |
| application `rankingActionAdmission.ts:classifyPrograms,optionalAdmission` | structural先行admitとoptionalのunsupported先行判定が別。roleと意味検証を分離し、同一selected program proofを消費する |
| `rankingQuantityWorld.ts`／`rankingProfileOutcome.ts`／`scenario.ts:rematerializePreparedCalculationInputs,reapplyPreparedCalculationPolicy` | 条件境界候補のみ、到達不能はNP不足等のみ。amount-only／更新後境界とHP0 outcomeを追加。修復は既存constructorへ戻す |

**以前の調査gapの訂正（既存F1〜F3の範囲内）:** 共有helper・IRの存在と実行接続を別証拠にした点は維持する。
一方、旧Taskの「既存population／stackをtyped selectorで読む」だけでは、個体数と付与特性instance数、
recipientと計数scopeの欠落を埋めない。下段trigger調査で判明したselector欠落を実行単位へ反映できていなかった。
発生機構はproducerの情報欠落をconsumer再利用だけで解決しようとする設計不足。実装との不一致は
`executionSemantics.ts`のdependent unsupported化、検出漏れはcount名の分類で止めた点。
最小guardrailは同一actorに複数一致特性／同じbuff複数instance／party recipientとdonorの違い／解除後count。
これは新commit由来のregressionという主張ではなく、現在のコードと既存引き継ぎの照合結果である。

#### 採用設計と理由

- **共通query owner:** execution内のfocused moduleにactor、resource、query種別、読取位置を持たせる。
  結果はknown／required input／invalid／unsupportedを区別する。HPのabsolute／ratioOnlyを型で分離し、
  alive、threshold、value expression、displayを別queryとする。`floor(maximum × initialPermille / 1000)`は
  初期量子化の採用案だが、U0-Hで合法入力域・正値端点を確認して固定する。丸めた表示を数値式へ戻さない。
  HP1/11000、bonus10000のinverse式は9999、ratioを先に0化した10000とは非同値である。
- **read/write proof:** 既存`npProgramScope.ts`のtrigger契約は再利用する。selected variantと順序を束縛し、
  condition・量式・OC率・form/解除・全NPのHP生存前提まで読む。future readへ届く書込だけを残す証明と、
  不使用／確率失敗を分ける。未知scopeはschema拒否であり、未知scopeのschema-legal fixtureを要求しない。
- **stateとtransaction:** immutableな初期basisから一度seedし、current／maximum instance／BP pointとcapacity／
  countに必要なinstanceを既存draftで更新する。各operationのcondition→proc→量read→writeを順序化し、
  利用時OC率はその時点のactorを読む。HP0 guardはNP使用入口とdamage到達位置に置き、拒否ではgauge、
  OC回数、context、form、instance、receiptをcommand前へ戻す。成功済み前commandまで巻き戻さない。
  ordinaryへstateとreceiptを渡し、without-areaも初期intentから同じexecutorへ通す。
- **HP IR:** 既存lossFloorを正本とし、fixed／maximum割合、最大値・量modifierのselector、giver／recipient、
  lifetimeと解除をlosslessに保持する。maximum変更で初期seedを再利用しない。補正合成、割合整数化、
  最大値解除時currentと変換順はU0-Hの式・一次根拠を満たしたbranchから実装する。rawをruntimeで再読しない。
- **BP domain:** pipelineに固定取得したdomain定義を取り込み、pointとphaseを分離する。actor適用条件、
  percentage／absolute閾値、defaultMax／maxChange／maxLimitをcanonical化し、phase/rateはlive queryにする。
  absentとpoint0を区別する。旧phase意図はpoint集合として解決し、後続結果が同値の場合だけ代表を選ぶ。
  同値でない現行入力が見つかれば、最小pointへの暗黙決定ではなく具体例付きで製品判断を相談する。
- **count／transfer:** countは人数・特性instance・buff instance別のselectorとread snapshotを持つ。
  保証最低値と外部入力は既存input ownerを再利用するが、instanceの不足を人数へ流用しない。
  transferはdonor snapshot、gain算定量、child試行／実適用量を別結果にし、enemy chargeとplayer NPを分離。
  child失敗とcommand invalidを区別する。未確定の順序を「実減少量＝gain」として実装しない。
- **admission／候補:** role・policy inclusionと意味検証を別に合成する。実効寄与のあるactionはcostを含む
  全siblingを実行、structural／automaticも同じ読取proofを使う。contextReferenceも後続countへjoinする。
  候補はinitial domainに対する更新後境界の逆像を含み、piecewise／非単調branchは小domain全探索との一致で証明。
  4096等のcapを緩めず、初期0%未規定の影響は成立込みHP候補の最終closureにも明示する。
- **回復・identity:** 装備/Lv/NP/OC/form変更、reset、policy reapply、portable/share/save/history、worker/cacheは
  canonical initial intentから再解決する。最大値instanceや最終HPを初期入力として保存しない。
  旧ratio/phase runtime writerを削除するcutoverとschema/engine identity変更を同じU4境界で検証する。

[BP 705300](https://api.atlasacademy.io/nice/JP/battle-point/705300)と
[BP 3300200](https://api.atlasacademy.io/nice/JP/battle-point/3300200)はweb open不可のためHTTPで再取得。
SHA-256はそれぞれ`ccb32b745561be1d1704c6b28878fa9b67ce2caa4413523c9b0ea744f692a84e`、
`dc3e11f7c94a2a43bdb4194eac00c3fe7a2a699ece5b12ce6c41209966bf6489`で以前と一致。
前者はpercentage、defaultMax4／traitによる8／maxLimit12を明示、後者のscriptは空。
後者の最終phase閾値90を容量と推定しない。
[fgo-docsのbuff action説明](https://atlasacademy.github.io/fgo-docs/#lower-and-upper-bounds-of-buffs)も確認したが、
一般のbuff集約式だけでは最大HP解除・transfer順を確定できない。これらは技術gateのままで、承認質問へ転嫁しない。

#### 反例・flow closureと実行単位への接続

以下は既存C1〜C12の今回差分。Task表の依存・完了証拠と合わせて検証する。

| state × forward／recovery path | 反例・期待結果 | Disposition |
| --- | --- | --- |
| master／Lv／CE→initial resolver | 固定1000、未装備0補正と欠損の区別。既存resolver保持 | Verified: コード・既存testを読取確認 |
| initial seed→skill/automatic/transform/terminal→ordinary | HP1/11000は生存、表示0%でも実HP0とは別。全NP guard、HP write→条件→NP→OC、grant時とuse時read | Deferred: TSK-06.45/U1-R,U2-H.1〜3 |
| maximum／量instance→付与・解除・form | 順序交換、giver≠recipient、safe lossはHP0を復活させない、最大値解除で再seedしない | Deferred: TSK-06.45/U0-H,U1-H,U2-H.2 |
| count／BP→NP/HP amount→後続条件 | 同phase異point、absent/0、capacity trait解除、複数一致actorを人数として重複計数しない、buff解除 | Deferred: TSK-06.45/U0-B/D,U1-B/D,U2-B/D |
| transfer→transaction reject→retry | donor抵抗・clamp・child proc failure対invalid、NP/HP/OC/context/receipt全rollback、前commandは保持 | Deferred: TSK-06.45/U2-D.transfer,U2-H.3 |
| read proof→admission→profile／四policy候補 | standard NPのlethal cost、unknown sibling、未選択variant、all/any/not unknown、amount-only reader、未対応最大候補を隠さない | Deferred: TSK-06.45/U3-A,Q |
| UI command／portable／cache→constructor→再実行 | Lv/装備/NP/OC/form/reset、without-area、policy off/on、stale拒否、upgrade失敗で旧request保持。fresh runとinput/outcome/receipt一致 | Deferred: TSK-06.45/U4 |
| 初期0%→seed／分析表示／成立込み候補 | 分析値としての扱いは回答なしに決めない。他branchの調査は継続 | Blocking: 初期0%の製品判断 |
| raw全cell→selected program→first reader→production | 全source/normal/LB/NP cell、現在calculatedと未選択variantも対象。default433/433・422/422、全80合法条件とownedを検証 | Deferred: TSK-06.45/U0-R,U5 |
| turn-end／被攻撃／一般死亡復活 | bounded program外というproofを保ち、simulatorを作らない | N/A: 現要件外 |

U0-Hの数値規則、U0-Bの容量・phase witness、U0-Dのselector／transfer順は対応branchの技術Blocking。
これは設計の確定部分と未確定部分を分けたgateであり、Task外への延期ではない。
Task全体は全runtime Blocking／Task内Deferred0、全production数値closure、calculator/ranking parity、
fail-closed、性能before/after、UI不変条件、最終quality成功でのみ完了する。

Step 2は次の利用者の実装依頼後にGit／manifestを再確認し、Task U0-Rのshared joinとbefore測定から開始。
U1-Rと独立したU0-H/B/Dの根拠確定を進め、確定したbranchのみIR→state/query→実行→回復へ接続する。
HP全体完了をcount/BPの前提にせず、製品未規定branchだけ保留する。別計画書・新正本は作らない。
今回のStep 1では製品code、master、schema、test、UIを編集せず、Taskと本noteだけを更新する。
検証: `pnpm test:docs`、`git diff --check`成功。最終`pnpm quality`成功、328.23秒、
unit717／production120／Playwright26、skip／todo／retry／warning／unexpected console 0。
artifact: `.test-results/2026-09-08T14-15-20-883Z-15-2bf035`。
production baselineはranking411/433、calculator420/422を維持。直前artifactのrankingFailure22件は
全て`unsupported:unsupportedActionAdmission`、calculator2件はHP／BP resourceStateUnavailableだった。
この表面理由の照合は全first-reader joinの完了ではない。今回の時間はdocs phaseのgate測定であり、
構造変更before/after性能比較ではない。quality後はこの結果記録のみ追記し、追加Vitestは実行しない。
変更対象はTaskと本noteの2ファイルのみ、製品code／master変更なし、stage／commitなし。
初期0%の回答は未受領。Step 1をここで止める。TSK-06.45全体は未完了。

### NP metadata境界後の残作業Step 1（2026-09-08）

この節はef45bef前の設計履歴。現在の差分は上のef45bef Step 1を参照。過去のF1〜F3、direct flow、C1〜C12は維持し、
変更・追加分だけを記す。実行単位と依存順は[既存TaskのU0〜U5](../tasks/development-redesign-tasks.md#tsk-0645-all-attack-np-execution-closure)
だけが所有する。このStep 1時点の許可は調査・設計・文書更新までだった。後段のStep 2再開で新たな実装依頼を受領した。

#### 1. 要件確認と基点

AGENTS、systematic-review／prompt-engineering guidelines、product v0.3.8、damage review v1.0.1、
effect execution v1.2.3、ranking v0.10.3、Task表、直前のHP query引き継ぎとGitを照合した。
利用者成果は**現行master全攻撃宝具を共通application／executorで正しく計算可能にすること**。
HP関連宝具や現在の未対応39件だけの局所修正ではない。

- 初期最大HPはランキング＝選択Lvのmaster HP＋固定HPフォウ1000、通常計算機＝さらにcanonical CE HP。
  `initialHp.ts:resolveInitialMaximumHp`は既存実装を使う。HP編集UI追加・ATK推定・欠損0補完はしない。
- 実行中の実HP0は攻撃到達不能。表示の丸めで0%となる正値を拒否しない。拒否ではNP gauge・OC使用回数・
  NP-use receiptを消費／更新しない。初期入力0%の分析許容だけが未規定で、今回は質問済み・未回答。
- 初期basisと戦闘最大HP補正を分ける。既存bounded source順、NP-use前のOC固定、transactionの原子性、
  contribution inclusionとproc結果／condition／source使用の分離を維持する。一般の死亡復活・ターン進行は追加しない。
- HEAD `e354764a6ad32aedf215c7fc7b785c73331d6f35`＋開始時dirty/untrackedを保持。
  manifestはmaster `20260908.03`／schema47、32771763 bytes、SHA-256
  `5723c904fc298da5fd559b68fc1356103fe8003a879b51efb85f3b459b914f93`、portable38／engine35.0.0。
  既存artifact `.test-results/2026-09-08T10-50-55-645Z-16-fc17cd/production/production-audit-calculation-application.json`
  と現行`productionAudit.test.ts`はranking394/433、calculator420/422、preparation plans3453で一致する。
  これは既存証拠の照合。今回のbefore性能測定・全80条件再計算とは呼ばない。

#### 2. 現状調査 — 同じ機構の再発範囲

**Verified（読取調査、数値実行の検証ではない）:** published masterを一度parseし、全13,875格納effectの
function／buff／source内timing／trigger／normal・LB parameter cell／canonical operationを再帰照合した。
HP functionはgain142、percent gain2、safe loss23、通常loss11、percent-safe loss1、dependent HP3。
11種類のHP buffの各occurrence件数は前回F3 inventoryと一致する。HP buff／量function／BP・依存量の
対象集合をfunction＋buff types＋target＋timing＋triggerでまとめると77群。これは格納群数であり、
selected programの発火・damage到達件数ではない。shared auditへのlegal program／first-reader joinは未完了。

| 現在確認したfamily | 格納母集団／現行IR | 今回の設計への帰結 |
| --- | --- | --- |
| 現在NP比例増加 | 1 occurrence、`resourceMutation/currentGaugeRatio`実装済み | 六family一括未対応という旧記述を残作業へ使わない。既存normal/LB/NP cell、metadata拒否、NP/OC順序を回帰境界にする |
| target／individual／buff計数量 | 各3／3／4 occurrence、全て`unsupported:dependentResourceAmount` | 人数／一致数／buff instanceを異なるcount queryとして扱う。既存population／stackのownerを拡張し、HP全体完了への依存を外す |
| NP／HP transfer | 各3 occurrence、各30 cells、全て同上unsupported | 残りは合計5 family・16 occurrence。snapshotからのgainとchild適用量を同一視しない |
| 最大HP・量modifier | addMaxhp34／subMaxhp4、upGainHp56／downGainHp8／upGivegainHp5、upFuncHpReduce38／subFuncHpReduce1、hpReduceToRegain2 | `stateMutation`では量・selector・解除結果を実行できない。ParamAdd/ParamMax、OnField、BP rate条件も保持して分類する。turn-end／被攻撃の3 buff familyは即時量へ変換しない |
| BP writer | add5 occurrence／41 cellsはphaseへの`contextMutation`、sub1／10 cellsはamount欠損のresource。capacity1／25 cellsはafterDamageのgeneric state | pointとphaseの型を分離。capacity writerの存在だけで同一terminal damage不具合とは断定しない。後続transform経路とproduction0のpre-damage fixtureを分ける |

**F1／F3の追加cause analysis（今回広げた範囲をここで一度だけ記録）:**

1. 発生機構・確認済み: `resourceSemantics.ts:operationReadsResource`はHP ratio条件と一部値式を検出するが、
   実HP0の攻撃到達性を読まない。`preparationContracts.ts`にHP state／HP0拒否codeはなく、
   `preparationTransaction.ts`はNP requirement／消費から開始する。`scenario.ts`はprepared rejectionを
   inputRequired以外unsupportedへ写し、`rankingProfileOutcome.ts`はNP不足／容量超過だけを到達不能に写す。
2. 実装とのズレ・推論: HPの数値依存がない標準NPでも、HP loss後に実HP0なら攻撃可能とは限らない。
   HP ratio readerがないというproofだけではlossを消せない。共通query ownerに攻撃前提を含める必要がある。
3. 見逃した範囲・確認済み: 過去C3/C7にHP0という値はあったが、全NPのimplicit readerとして
   raw→program inventoryとrejection→calculator／profile集約までを一つの行にしていなかった。
   直前追加の「HP0拒否・非消費」反例を、今回その直接consumerと母集団へ展開する。新変更由来の不具合とは主張しない。
4. 再発範囲・推論／最小guardrail: standard／HP依存／BP依存NP、skill／transform／terminal beforeDamage、
   automaticとwithout-area再実行を交差する。readerなし標準NP＋lethal lossがnumericへ抜けないこと、
   HP1で表示0%は抜けること、拒否でNP-use以前のstateへ戻ることを小型fixtureで固定する。

**残るF1〜F3の確認delta:**

- `scenario.ts:resolveScenarioPreparationOutcome`は初期最大HPを戻り値に付けるだけで準備入口へ渡していない。
  `preparationFacts.ts`はcontextのratio／phase、`npDamageOperation.ts`と`hpValueExpression.ts`はpermille、
  `ocState.ts:rateValue`はHP write markerを読む。これらを同じ丸め済みratioへ寄せるだけでは精度を失う。
- 旧NP-only後置passは既にない。`preparationTransaction.ts`／`preparationPhases.ts`はともに
  `executePreparationOc`を呼び、そのordered draft内でNPとcontextを更新している。この接続を拡張する。
  `candidateExecution.ts`のresource実行はstar専用、`preappliedOperationIds`が二重適用を防ぐ直接境界。
- `operationCompiler.ts:compileEffect`のtriggerScope非null一括省略、`ocTerminalDependencies.ts`のresource別reader、
  `ocDependency.ts`の逆向き依存、`rankingActionAdmission.ts`のunsupported先行判定／structural迂回は別判定のまま。
  U1-Rで同じselected bounded programの証拠へ収束させる。NP metadata修正の完了をこの証明へ流用しない。
- `rankingQuantityWorld.ts`は条件leafの端点と境界±1のみ、`rankingCandidateSpace.ts`もconditionsを渡している。
  amount-only read／更新後境界はこの入口だけでは表せない。`scenario.ts`のrematerialize／reapplyは既に
  共通constructorへ戻るので、新しいrepair経路を作らずそのseed／query入力を更新する。

**一次資料の範囲:** [705300 BP定義](https://api.atlasacademy.io/nice/JP/battle-point/705300)と
[3300200 BP定義](https://api.atlasacademy.io/nice/JP/battle-point/3300200)をHTTP再取得し、前回記録の
SHA-256 `ccb32b…a84e`／`dc3e11…6489`と一致を確認した。web openは取得不可だったためHTTPで確認した。
BP割合方式／容量ruleのデータはあるが、phase inputのwitness一意性や全domainのpoint上限までを証明しない。
[fgo-docs](https://atlasacademy.github.io/fgo-docs/)のbuff action集約・上限の説明は参照できるが、
今回確認した本文にHP全11 buffの更新・解除・transfer順の完全な規則はなく、技術gateを解消したとは扱わない。
比較実装に関する既存記録も補助証拠のまま。現在の外部応答を製品masterへ混ぜる変更はしていない。

#### 3. 採用設計 — queryとstateの境界

F1〜F3の既存採用表を維持し、次を具体化する。新package・永続的な全体依存graph・servant別分岐は作らない。

| 境界 | 今回確定する内部設計／理由 | 数値実装前のgate |
| --- | --- | --- |
| 初期intent→HP seed | applicationだけがLv／装備と既存resolverを解決。整数HP seedは`floor(initialMaximum × inputPermille / 1000)`を採用案とする。割合は初期入力intentとして残し、runtime writerにしない。正入力を1へ無条件clampしない | U0-Hで現行入力精度と全対応Lvの境界を照合して固定する。初期0%の製品判断だけは別gate。これはUI量子化規則の設計で、ゲーム実測の主張ではない |
| HP stateとquery | actor-qualified `absolute(current, initialMaximum, active maximum instances)`と`ratioOnly`／不足を区別。absoluteから生存・threshold・value expression・表示をqueryする。ratioOnlyは絶対量の捏造に使わない | U0-Hで式ごとの丸め・float32境界を確定。HP1/11000の線形式bonus9999と、先にratio0化した10000を区別。表示queryをNP/OC値式へ戻さない |
| resource IR／instance | HP用fixed／maximum-ratio／loss floor／modifier selectorとBP用domain／pointをresource別unionへ分離。最大値・回復補正・減少補正・変換のinstanceはowner、source、lifetime、selectorを保持 | U1-H/B/Dで全cellへjoin。NP basisPoints限定のmetadata拒否を維持し、HP/BP固有metadataまで禁止する共通validatorにはしない |
| ordered draft | 既存NP／OC source transactionにHP・BP・count queryを足す。condition→proc→量read→writeを同じdraftで行い、利用時に決まるOC率は利用時HPを読む。ordinaryへ適用receiptを渡す | U2で各sourceのbefore/afterと全state rollbackを検証。入口HP0でNPを拒否し、beforeDamage更新からdamage到達時のHP0も成功へ抜けない。NP/OCの仮更新を外へcommitしない |
| bounded dependency | executionが`required read / proven irrelevant / unresolved`をactor、位置、phase、selected variantへ束縛して返す。terminal攻撃可否は暗黙のHP read。途中の量式・condition・OC率の辺も同じ分類 | U1-R。condition unknownとfalse、無関係のproofとinclusion offを区別。先行readだけなら後のwriteはそのreadを変えないが、後続攻撃前提は別に調べる |
| BP初期intent | `absent`と`present(point, domain, capacity instances)`を区別。phase/rateはqueryのみ。旧phase UIから候補point集合を解決し、後続結果が同値と証明できる場合だけ一代表へ縮約 | U0-B。容量8のpoint4/5は同phaseでも+1後にphaseが分かれる反例を用意（割合閾値を前提にした設計反例）。phaseだけで数値が一意でないcalculator入力は勝手に最小pointへ決めない |
| count／transfer | 計数は既存canonical population／stackを読む。transferはread snapshot、gain算定量、child試行／適用結果を別に記録。child proc失敗は正常結果たり得るがinvalidはcommand拒否 | U0-D。target人数とindividual一致、buff identityとinstance、enemy chargeとNP量を潰さない。未確認順序で「child実減少量sum」を採用しない |
| admission→profile | applicationが共通proofとpolicyを合成。effective contributionを持つoptional actionも全siblingを実行し、structural／automaticにも同じ意味検証を使う。未知最大候補を捨てて最大値を確定しない | U3-A。明確なno-op／到達不能だけを除外、未選択branchをprofile blockerへ昇格させない。HP0はtyped unreachable、欠損／矛盾／未対応とは別結果 |
| candidate／recovery | 初期domainに対するordered境界の逆像とpiecewise量式の端点を使い、小domain全探索で候補を検証。選択witnessをinitial intentとしてportableへ渡し、repair/resetで再構築 | U3-Q/U4。ratio/phase別writerを残さず、old-only／canonical-only／mixedをschemaで拒否・受理し分ける。4096緩和・未知candidate切捨てなし |

outcomeの外部classは既存設計を維持する：calculated、正常非適用（off／proc failure／false／非関連proof）、
到達不能、修復可能なinputRequired、invalid、unsupported。HP0拒否をcalculatorではunsupported、rankingでは
unavailableへ後付け変換する二重意味論は作らない。単なるwitness生成漏れを利用者の未入力にしない。

#### 4. 検証可能な実行単位への接続 — flow／反例delta

以下の`Verified`は既存実装の読取確認に限定する。新しいruntimeのcounterexampleはすべてTask内Deferred。
全Cartesian productは作らず、C1〜C12の代表交差を小型fixtureで検証し、全masterはshared inventoryを一度使う。

| canonical state→直接経路 | 追加／更新する反例と期待結果 | Status |
| --- | --- | --- |
| Lv／CE→initialHp→scenario | resolverの固定1000・欠損拒否を再利用する。HP data／resolver自体を作り直さない | Verified: 既存initialHp・hpGrowth test／production artifactを照合 |
| seed→preparationFacts／OC rate／npDamageOperation | C3/C7: 同じHP1/11000で生存、表示、閾値、連続量式を別query。maxHP付与・解除後も同じactorを読む | Deferred: TSK-06.45/U0-H,U2-H.1〜3 |
| HP write→standard NP guard→application／profile | C1/C7/C9: HP readerのない標準NPにもlethal loss、safe loss、HP正値表示0%。NP-use前とbeforeDamage後の拒否でgauge／OC使用回数／receipt非消費 | Deferred: TSK-06.45/U2-H.3,U3-A |
| 最大値／回復／減少instance→付与・解除・form | C3/C8: modifier→lossとloss→modifier、source giverとrecipient、HP0／上限／端数、OnField解除、sibling invalid→全rollback→retry。初期basis再seedで回復させない | Deferred: TSK-06.45/U0-H,U1-H,U2-H.2 |
| source／party-other→HP query | C9: ratio-onlyで読める式、最大HP不明で絶対loss後の式、別actor同じ表示割合、除外recipient、unknown condition。必要量をattackerで代用しない | Deferred: TSK-06.45/U2-H.1〜3 |
| point／capacity／trait→phase／rate→condition／OC | C4/C7: absent対point0、同phase異point、capacity変更・解除、別actor同domain。現在actionのsourceQuantityがlive値を上書きしない | Deferred: TSK-06.45/U0-B,U1-B,U2-B |
| selector→count／transfer→NP・HP→後続read | C5/C6: 同actor複数一致、buff解除、donor不足／抵抗／clamp、nested child proc failure対invalid。countとtransferの期待値を共有しない | Deferred: TSK-06.45/U0-D,U1-D,U2-D.count,U2-D.transfer |
| compiler／OC／resource→admission→candidate | C1/C2/C9/C10: trigger unknown／command-only、選択と未選択variant、automatic／optional／structural、all(true,unknown)／any(true,unknown)／not(unknown)、量式のみのreader | Deferred: TSK-06.45/U1-R,U3-A,U3-Q |
| receipt→ordinary／without-area／repair／portable／worker | C8/C11: 同一command再適用0、policy off→on、装備・Lv・form・NP・OC変更、reset／保存復元／upgrade拒否・stale workerで旧request保持。同じ初期intentのfresh runとinput・outcome・receipt一致 | Deferred: TSK-06.45/U2-H.3,U4 |
| 全effect／全cell→selected program→first reader→数値 | C12: 未対応39件だけでなく全433 profile・422計算機母集団、全variant・80条件・owned。併存原因とbefore/after damage差をruleで説明 | Deferred: TSK-06.45/U0-R,U5 |
| 一般ターン進行・被攻撃・死亡復活／新HPフォウeditor | bounded phase外を実行しないproofをU1-Rで確認。HP0の攻撃拒否だけからsimulationを増やさない | N/A: 現製品要件外 |

**未解決事項と依存範囲:**

- Blocking: 初期0%の分析許容の製品判断。初期0%のseed／結果表示の最終接続だけを保留する。
- Blocking: HP量modifierの合成・整数化／最大値instance解除、BP phase witness／容量再評価、
  transfer read／child commit順の一次根拠。対応するU0-H/B/Dが閉じるまでその数値branchを実装完了にしない。
  U1-R、HP正値の契約整理、独立したcount分類は進行可能。技術gateの解消を利用者確認へ転嫁しない。
- BP phaseだけでは一意な結果を持てない、またはtransferが既存入力から決まらないことを現行admit対象で
  確認した場合は、入力・期待結果の具体例を添えて最小の製品差分だけ相談する。現段階では新UI追加を採用しない。
- 上記Blockingはruntime closureの前提であり、調査・設計の文書作業を止める条件ではない。
  unsupportedを暫定保持しても現行全攻撃宝具closureのDoneにはならない。

**Step 2開始条件／停止点:** 次の利用者の実装依頼後にGit・manifest・本節を再照合し、TaskのU0-Rから
beforeと共有join、U1-RとU0-Hの独立した契約確定へ進む。数値branchは自身のgateが閉じた順に実装する。
旧NP後置pass削除／HP成長表再実装／全HP完了を待ってからcount着手という旧順序は採用しない。
今回のStep 1が終わってもTaskはin_progress、06.47はblocked。全U0〜U5、全scopeのBlocking／Task内Deferred0、
全production数値化・parity・fail-closed・性能・UI不変条件と最終qualityがTask完了条件である。

検証記録は以下へ追記する。今回の編集対象は既存Taskと本noteのみ。製品code／master／fixture／画像、
既存untrackedは保持し、stage／commitしない。文書gateのqualityを実装closureや性能beforeへ読み替えない。

今回の検証: `pnpm test:docs`、`git diff --check`成功。
最終`pnpm quality`成功：292.18秒、unit695／production120／Playwright26、skip／todo／retry／warning／
unexpected console 0。artifact: `.test-results/2026-09-08T11-19-05-105Z-15-d1b847`。
今回のproduction gateでも現行baselineを検証した。既存auditの39 rankingFailureは全て表面理由が
`unsupported:unsupportedActionAdmission`であり、HP／BP／依存量の併存原因まで解消した証拠ではない。
この検証記録以外にgate後の変更はない。開始時の管理対象全ファイルのSHA-256と比較し、今回変更したのは
Taskと本noteだけ、新規worktreeファイル0を確認した。Step 1の調査・設計・Task更新をここで止める。
初期0%の回答は未受領。TSK-06.45全体は未完了で、次の実装はStep 2依頼後に開始する。

#### Step 2再開：U1-Rのbounded trigger契約（実装中）

利用者の実装依頼を受領。既存dirtyを保持し、before production120件成功（43.78秒、
`.test-results/2026-09-08T11-54-56-596Z-15-f39bb7`）。39除外profilesを選択skill variantへjoinし、
17 profilesはunsupportedがcommandCardAttack scopeだけ、他にはcontextReference／dependent量が
併存することを確認。これはskill選択へのjoinであり、U0-R全first-reader joinの完了ではない。

F1調査の修正：現行triggerScope schemaはnull／commandCard／commandCardAttackのclosed unionである。
「unknown triggerのschema-legal fixture」という旧反例指定は不正確だった。未知語彙はschemaで拒否し、
型を迂回した境界もfail-closed、今後variant追加時はexhaustive checkで要分類とする。
通常攻撃専用scopeのOC／NP／context mutationはschema-legalなので、production0でも実行阻止を検証する。

ownerはexecutionの`npProgramScope.ts`。compiler／projectionだけでなくpreparation選択・activation fact・
automatic transaction、OC逆向き依存／gauge区間、static program選択／admissionが同じscope proofを読む。
C1/C2/C7/C9へscope×source（skill/passive/CE/support/mystic/NP）×operation（modifier/NP/HP/OC/context/unsupported）を追加。
不使用action、除外effect、proc失敗はこのscope proofとは別に扱う。明示NP sourceのnull scopeは実行を維持する。
U1-RのHP到達性・amount／actor-qualified reader全体は引き続きDeferred: TSK-06.45/U1-R。

再確認でform到達性のgraph walkにも非発火transitionを数える経路を検出した。
`formCanReachAttackWithoutPreparationNp`は現在formの選択skillに含まれる発火可能occurrenceへ
辺を束縛する。以前の検出不足はcompiler／mutationの抑止だけを見て到達性queryを含めなかった点。
production影響の追加は確認していない。schema-legalな「現在formに攻撃NPなし＋command-only変身辺」で
false、同じeffectをnull scopeにした場合trueをguardrailにした。

| trigger state × 直接経路／回復 | Disposition |
| --- | --- |
| null／commandCard／commandCardAttack → compiler／damage projection | Verified: `ocSourceProgram.test.ts`のordinary／OC compile一致 |
| scope × skill／passive／CE／support／mystic／NP → NP／HP marker／form | Verified: `preparationTransaction.test.ts`。非発火ではresource・form・active effects不変、terminal攻撃成功 |
| scope → OC感度／逆向きslice／NP gauge依存 | Verified: `ocSourceProgram.test.ts`。scopeだけを変えたpositive／negative対 |
| scope → form graph到達性 | Verified: 同transaction fixture。発火しない辺をreachabilityへ使わない |
| unsupported sibling／trigger-only positive → optional admission | Verified: `rankingActionAdmission.test.ts`。非発火のみ無関係、null unsupportedは拒否を維持 |
| calculator／ranking四policy／portable再実行 | Verified: `ocExecutionParity.test.ts`。NP loss／OC boostの非発火、numeric・effective OC・receipt一致 |
| production0のresource／OC trigger | Verified: schema-legal focused fixture。shared auditにtrigger×operation×resourceを追加、未知scopeはschemaとunchecked runtime両方で拒否 |
| HP実量・actor-qualified amount読取／未知context関連性 | Deferred: TSK-06.45/U1-R,U0-H,U0-D,U3-A。scope proofで置き換えない |
| 一般command-card戦闘進行 | N/A: 現bounded NP program外 |

**production delta:** ranking394→411/433、unsupported39→22。calculator420/422、既存numeric
ranking recordsはbefore auditと同一。新規17件以外の数値差は0。preparation plans3453は不変。
全80条件closureはまだ未検証。候補2155→2247、damage request2098→2190、distinct1331→1385。
cache hit805/2190。これは合法候補追加の結果であり、cap・timeout・complexity上限の緩和はない。
shared application digestは`82a4ab44b033e2ec4fc0a1d79d34d48a2364ef6e3d6a228841c95a8cd8d80a87`、
pipeline digestは`6181fd3b3c82dff2b5c394d1544034246b92e80eec873766f579894a9c8f14fa`。
production trigger内訳はcommandCardAttack unsupported23、commandCard stateMutation15／damageModifier2。

**性能:** 同じmasterを各rootで一度parseし、before/after各1回warm-up後、交互順・非並行で3回ずつ
ranking defaultを測定。before3299.80／3395.89／3540.13ms、after3576.28／3409.73／4009.67ms。
中央値3395.89→3576.28ms（+5.31%）、合法候補数+4.27%。未説明10%超増加なし。
production suiteの単回比較は43.78→39.56秒（後者は120test成功・counter旧期待値でcontract_failure）。
単回suite時間を安定した性能改善とは主張しない。

**identity:** 計算対象とscope実行意味が変わるためengine35→36.0.0。portable schema38／master
20260908.03／schema47は変更しない。golden5件のengine metadataと画面のengine／件数表示を同期する。
既存portable再構築・worker identity／stale拒否をqualityで検証する。

**U0-Dの追加調査:** raw `nice_servant.json`のcount全10 occurrenceをcanonicalと照合。
`traitVals`はNP recipientの`funcTargetType`とは別の計数selectorだが、現在のunsupported IRには
保持されない。`Value2`はcanonical evidenceでlifecycle分類になっており、scopeを型付けしたことには
ならない。例としてgainNpTargetSumの複数traitは同actorを人数として一度数える必要がある一方、
gainNpIndividualSumは付与された特性instanceも対象になる。buff countのptAll recipientを各recipient自身の
stackだけへ結び付ける根拠もない。既存人数／stack入力への一括置換は採用しない。
必要な次の契約は計数scope・selector・恒常特性と付与instanceの区別・重複計数・発動者とrecipientの分離。
rawのdetailは期待意味の根拠として確認できるが、全cellのread snapshotと丸めを証明したとは扱わない。
contextReference29 occurrenceには実際の特性付与が含まれるため、`damageRelevant:false`だけで
admissionから無視する変更は行わない。後続count readerと同じprogramへjoinする。

**この先行単位の検証結果:** `pnpm quality`成功
（`.test-results/2026-09-08T12-24-36-695Z-15-89ff39`、270.29秒）。unit705／production120／
Playwright26、skip・retry・warning・unexpected console0。最終production39.41秒。
focusedのform到達性58件は`.test-results/2026-09-08T12-19-45-723Z-15-c545b1`。
画面5枚を目視確認し、engine36・411/22件表示、desktop／390px／320pxの既存入力とNP1〜5表を維持した。
再生成時のconsole検出は期待値更新runに限定され、監視allowlistは緩めていない。
開始時ファイルの欠落0、今回対象外の内容hash不変、master hash不変、stage／commitなし。
この結果はbounded trigger先行単位の完了証拠。U0-R全join・U1-R全体・HP／BP／依存量・
admission全体・U4〜U5とTSK-06.45の完了ではない。






#### Step 2継続：HP減少下限のIR境界（2026-09-08）

利用者の継続実装依頼を受領。基点はengine36／master20260908.03・schema47、ranking411/433・
calculator420/422。既存dirtyを保持する。初期seed／queryを接続する前に、現在のHP IRがsafe／通常lossを
同一形状へ落としている情報欠落を閉じる。数値stateから失われたraw種別を推定する設計は採用しない。
これは既存F3の確認済みgapへのU1-H先行単位であり、新しい原因として重複登録しない。

HP lossは`lossFloor: zero | oneIfAlive`を必須にし、gain／NP等ではこの属性を拒否する。
`oneIfAlive`は生存中のHPを1未満にしない意味であり、既に0のHPを1へ戻す復活ではない。
pipelineがsafe固定・safe割合・通常固定の全normal/LB/NP cellへ保持し、旧shapeや矛盾したshapeは
master schemaで拒否する。既存executorのHP write invalidation／unsupportedを数値成功へ変更しない。
未確定の最大HP・量modifier・transfer契約をこの下限分類だけで解消したとは扱わない。

追加の検出漏れ: `operationCompiler.ts`のresource量選択は`amount.values`だけを読み、pipelineが保持する
`limitBreakValues`を捨てていた。NP preparationでは別の選択があるため、HPだけを同じhelperへ
渡す確認ではordinary consumerの欠落を検出できない。共通原因は量表の選択責務の分裂で、再発範囲は
ordinaryのHP／star／BP fixed resource。sourceのlimitBreak・valueSetIndex・valueIndexを同じ選択へ渡し、
型・上下限・actor scopeは変えず、schema-legal fixtureで三resourceのnormal/LB差を固定する。

反例はgainとloss×zero/oneIfAlive×fixed/percent×normal/LB/NP、旧shape・他resourceへの混入・
current-gauge比例量のHP誤適用。共有production auditで全179 HP mutation中のloss35 occurrenceと
全cellをraw→canonicalで照合する。runtime raw分岐、ID分岐、0補完を追加しない。

採用実装は`master-data/index.ts`のresource別union、pipeline `hpResourceFamilies`、CEの
`withResourceLimitBreakValues`、ordinary `ResourceMutationIdentity`／`resourceMutationIdentity`。
HP lossの下限はschema parse、CE merge、OC source program、ordinary compileを通して保持する。
`BattlePointId`を持つHP raw cellは他resourceのsubjectを暗黙に捨てず正規化で拒否する。
HPへNP比例量を流用しない。amount欠損のnullは引き続き数値0へ補完しない。
LB指定時の表欠損もnormal値へfallbackせず、null／unavailableを維持する。

| 下限／cell state × 直接経路 | Disposition |
| --- | --- |
| gain／通常loss／safe固定loss／safe割合loss → canonical各NP・Lv cell | Verified: `executionSemantics.test.ts`の5family matrix。旧loss shape、未知floor、gain／NPへのfloor混入、HPへのNP比例量／別subjectを拒否 |
| CE normal／LB → amountとfloorの結合 | Verified: `craftEssenceNormalization.test.ts`。同一floorの別値／LBなしの明示同値、異なるfloorの結合拒否 |
| HP／star／BP × normal/LB × NP・Lv index → ordinary compile | Verified: `ocSourceProgram.test.ts`。22／42の選択差、HP下限保持、resolutionはresourceStateUnavailableを維持 |
| canonical HP → OC program／preparation invalidation・rollback | Verified: 既存OC／preparation fixturesに下限を明示。OC programは原operationを保持し、未実装の量更新を成功へ変更しない |
| 全source／全cell → shared production audit | Verified: HP loss35 occurrence、safe固定245／通常275／safe割合10 cells。gain固定1930／割合50 cells。raw→canonical値一致、normal／LB欠損・値差をfocused fixtureで拒否 |
| 旧master／旧engine → validation／再構築／UI | Verified: 最終qualityのstartup／stale拒否・再構築・Playwright26。schema48、engine37、portable38、master20260908.05。画面5枚のidentity更新とmobile結果表のCSS所有権を確認 |
| 実HP seed／query／HP0拒否／gain・loss reducer／最大値・量modifier・transfer | Deferred: TSK-06.45/U0-H,U2-H.1,U2-H.2,U2-H.3。下限分類は実HP更新・HP0攻撃判定の実装ではない |

**before／after:** 開始時production120成功36.63秒
（`.test-results/2026-09-08T12-36-04-404Z-15-8b0ea7`）。途中production117成功・3失敗は
HP canonical identityと監査項目追加によるdigest差のみ。候補数／admission件数は不変。
同じrawと開始時packagesからbefore masterを再正規化し、開始時SHA-256
`5723c904fc298da5fd559b68fc1356103fe8003a879b51efb85f3b459b914f93`との完全一致を確認した。
新masterとの差分はversion、HP loss35件の下限、対応するNP canonical ID12件のみ。
calculator422件はそのまま一致、ranking433件はこのID対応だけを適用するとrecord全体が一致した。
preparation identityは新しいfloorを含むため更新される。古いidentityを互換のために温存しない。
新規に数値化したprofileは0、default411/433・420/422、preparation plans3453を維持。
application digest `c2689cd254f3ca245c196c5fc4d4c0ebf1d9a5192c35633407ff4fc0755f871e`、
pipeline digest `9145478963fd3f6bfa7839bec1a1930a9b9ddd90dd04fd4da091655b29e23a1c`。

同一環境・各1 warm-up・交互順3組・非並行ranking測定はbefore3301.79／3714.68／3380.84ms、
after3328.09／3393.28／3227.24ms、中央値3380.84→3328.09ms（-1.56%）。有意な高速化とは主張せず、
未説明10%超退行はない。途中production36.54秒、unit717件10.73秒
（`.test-results/2026-09-08T12-50-24-112Z-15-f11e10`）。


最終quality途中の390px VRTで2830px／2821pxの高さ差を検出した。
`calculator.css`の`.worksheet th/td`と`calculation-result.css`の`.np-result-table th/td`が
同じspecificityで別々のpaddingを指定し、結果表のモバイル密度がstylesheet順に依存していた。
0.05rem×上下×6行の差は観測した約9pxと整合する。以前の画像更新だけではCSSの責務競合を検出できず、
再発範囲はcalculator結果表の全mobile幅。worksheet内のtableは結果表だけであることを確認し、
mobileのtable font-size／cell paddingを結果表の専用CSSへ移して同じファイルのmedia queryで確定する。
画像閾値、retry、console監視は緩めない。これはHP数値化とは別の、今回のqualityで発見した表示安定性修正。
修正後VRT9成功、390pxだけ密度差の期待画像を更新した。更新runのconsole検出は成功判定に使わず、
期待値更新optionなしの最終`pnpm quality`で閉じた。

最終検証: `.test-results/2026-09-08T13-11-05-798Z-15-f196ee`、238.63秒。
unit717／production120／Playwright26成功、skip／todo／retry／warning／unexpected console 0。
新master SHA-256 `3a9c481dc25ab151f3be8106352210e4807ca0eaa1f2fb4c19225fa645a9ff6b`。
開始時ファイルの欠落0、今回対象外の内容hash不変。stage／commitなし。
この先行単位のscoped Blockingは0。TSK-06.45全体は未完了で、実HP・最大HP更新、BP、
依存量、admissionの残作業と初期0%の未規定判断を維持する。
次はU0-Hのquery／最大値・量modifier契約とU2-H.1の実HP seed／query接続。
継続実装の再承認は不要。初期0%の回答待ちはその境界だけに限定する。



## TSK-06.42 Step 1 — authoritative comparison-basis planning delta

### PIR-001 implementation delta — worker response payload closure

The post-implementation review of `8c55613` found that the response parser validated only parts of
`RankingPolicyDetail`, then asserted the complete DTO type. Missing `attackProfile` and malformed nested
preparation actions reached presentation and threw. The previous response-path inventory checked normal
roundtrips, request rejection and stale identities, but missed malformed response payloads. This is a
transport contract gap; no production damage regression was established.

The response family includes summary attack metadata/exclusions and detail attack metadata, effects and
sources/explanations, input views, preparation commands/resources, contribution decisions/sets, warnings,
and nullable area detail. Runtime calculators/caches produce these DTOs; the protocol validates them before
`useRanking` publishes them to `RankingList`, `RankingEffectDetails`, `rankingDetailPresentation`, shared
stack/source presentation, or `rankingHandoff`. Existing canonical schemas remain vocabulary owners;
transport schemas must be assignable to complete application DTOs without an unchecked cast.

| Changed response state × path | Disposition |
| --- | --- |
| Normal populated/empty summary, detail with null/non-null area, ready/error | Verified: `rankingWorkerProtocol.test.ts` roundtrip, render and portable replay |
| Missing metadata, malformed nested action/resource/effect/input/contribution/warning and area equivalents | Verified: grouped corruption matrix in `rankingWorkerProtocol.test.ts`; complete DTO schema type checks |
| Matching identity malformed detail → hook → presentation; subsequent valid reply | Verified: `useRanking.test.tsx`; malformed replies do not publish or consume pending request |
| Stale identity and portable handoff parity | Verified: existing runtime/hook tests plus schema roundtrip → render → portable replay |
| Damage semantics, candidate generation, cache lifetime | N/A: response validation only; existing later-task scope unchanged |

Implementation evidence: `rankingEffectResponseSchema` and `rankingResponsePayloadSchema` validate the
complete application DTO shape using existing canonical schemas where available; protocol output is
assignable to `RankingWorkerResponse` without a cast. Optional absent fields remain absent. Error-stage
variants require their own payloads. Schema-legal nonempty input/condition/decision and area fixtures guard
against validation that accepts only today's default winner. No damage rule, portable identity, candidate
policy, expected number, snapshot or production digest was changed.

Focused verification: baseline runtime/hook 2 files / 6 tests, 2.58s
(`.test-results/2026-09-05T15-23-53-535Z-16-8021e7`); expanded response/runtime/hook 3 files / 11 tests,
2.65s (`.test-results/2026-09-05T15-31-50-806Z-45-9c6a3e`), warnings 0. The added work is five small-fixture
regressions, not extra production master calculations. Existing runtime canonical roundtrip test measured
74ms before and 91ms after with the new suite; these single samples are not a controlled parser benchmark.
Final gate: `pnpm quality` PASS, 237.77s, unit 458 / production 117 / Playwright 25;
skips, retries, warnings and unexpected console are all 0. Artifact:
`.test-results/2026-09-05T15-33-36-207Z-15-1325c7`. Production digest, inventory and counters match the
reviewed `8c55613` baseline (candidate 6,360 / deduplicated 3,949 / requests 1,924 / distinct 1,298).
Unit suite grew from 453 to 458 tests (7.75s → 8.40s); quality elapsed 235.29s → 237.77s. These suite
measurements include the added regression coverage and are not an isolated parser benchmark.
Implementation is ready for independent re-review; this evidence does not change reviewer adjudication.

Re-review completed, 2026-09-06: reviewer and independent reviewer confirmed PIR-001 **Resolved**, with
no new material finding; verdict **Approved**, runtime Blocking 0. The complete response family, normal
render/replay, malformed-response rejection and subsequent valid publication were rechecked. Fresh
`pnpm quality` PASS, 241.59s, unit 458 / production 117 / Playwright 25; skips, retries, warnings and
unexpected console 0. Artifact: `.test-results/2026-09-05T15-45-37-350Z-15-81df04`. Production digest,
inventory and candidate counters remain equal to the clean `8c55613` review baseline. Isolated parser
benchmark and manual browser verification were not run; automated browser coverage passed. The external
review record is `/tmp/fgo-lab-review-8c55613-x7hnuwgj/review.md`; this paragraph preserves the resolution
and evidence if that temporary record is cleaned up. Damage semantics and subsequent task scope are unchanged.

### Step 2 implementation delta (start `b4e0356`, planning `ab48586`)

The implementation now separates population, level basis and NP basis. Schema owns the strict wire selection
and pinned provenance shape; `rankingBasis.ts` owns validation/commands/resolution; `isOwned` owns membership;
`scenario.ts` retains the sole exact-ATK join. `rankingCandidateSpace` receives the resolved basis, and static
semantics, NP capacity and candidate selection consume its numeric NP level. `rankingStaticPreparation` reads
the shared fixed skill-level constant. No saved Fou/skills enter ranking scenarios and no servant ID exception
was introduced. NP matrices explicitly compile five specified bases, rather than reusing owned NP.

| Implemented path / counterexample | Evidence and disposition |
| --- | --- |
| six-input command, legal/illegal products, selected values only | Verified: `rankingBasis.test.ts`, `RankingConditions.test.tsx`; explicit owned → all changes only illegal axes |
| baseline/materialization, summary/direct detail, NP1–5 | Verified: ranking policy/candidate-space/rows fixtures and new owned-NP parity; one resolved NP reaches all consumers |
| NP0/no-build/empty population, missing ATK/present zero | Verified: stable owned fixture; 06.411 scenario fixtures reused; empty success remains distinct from request invalid |
| raw record key/embedded identity and worker initialize | Verified: exposed existing `servantBuildRecordSchema`; shared 06.412 current/v32/v33/v34 matrix extended to v35, worker lost-key fixture; failed context replacement clears the old context |
| URL parse/write, partial/duplicate/old/mixed input, filter edit/reset | Verified: `rankingState.test.ts`; no invalid-state worker initialization; invalid UI does not claim a zero-row calculation |
| worker summary/detail/cache/response identity | Verified: `rankingWorkerRuntime.test.ts` and `useRanking.test.tsx`; detail resolves only a canonical summary entry, cache hit/miss reject contradictory input, old-context replies cannot publish, unrelated CE/support edits do not recreate worker |
| portable constructor/schema/execute/recover/upgrade | Verified: strict basis ↔ scenario checks and master-dependent natural limit/fixed input check; replay reads no mutable build; 06.411 failed-attempt/handoff tests preserved |
| v34/v35 load/backup migration, old share, v33 historical retention | Verified: schema/repository/share fixtures; exact calculator/manual requests keep identity and runtime version; two-policy ranking draft discarded/history historical-only; no executable compatibility adapter |
| row/detail/request/calculator and profile mutation | Verified: stable owned product fixture, existing policy parity, real-worker E2E handoff and failed subject reset |
| current production inventory and default damage | Verified: shared audit records and counters agree with baseline except schema trace text; exact natural/Lv.90 availability reused |
| full policy maximum/all-current-NP numeric/stack/contribution presentation | Deferred: TSK-06.5 / TSK-06.45 / TSK-06.43 / TSK-06.47 |
| cache lifetime/cardinality, notice design and broader responsive/a11y polish | Deferred: TSK-07; this cutover only adjusts the expanded mobile summary and preserves existing layout limits |

Portable fixed-input validation deliberately permits canonical concrete target facts selected by the existing
planner; those facts must not be compared with an unprepared relative-class default. Source, Fou, skill level,
OC, equipment/support, explicit overrides, initial HP/BP and unmaterialized relative affinity remain checked.
Current numeric results for unknown future execution semantics are not fabricated; existing candidate/profile
outcome owners and their distinctions remain unchanged.

Verification and diagnostic attribution:

- Step 1 documents were committed as `ab48586`; `b4e0356` changes only this Task to `in_progress`. Worktree was
  otherwise clean. No unrelated user edits were present or removed.
- Unit: 79 files / 452 tests, warnings 0 (`2026-09-05T14-06-06-490Z-15-0114ae`). Production: 24 files / 117 tests,
  warnings 0 (`2026-09-05T14-08-13-979Z-16-20dbc0`). Final quality evidence is recorded below after the gate.
- Audit baseline is `255464b` source (documentation-only start commits do not change it), same effective
  `pnpm test:diagnostic -- packages/calculation-application/src/productionAudit.test.ts` command. Compile times:
  5,479 / 5,879 / 5,250 ms (median 5,479) before; 5,387 / 5,224 / 5,048 ms (median 5,224, -4.6%) after. Baseline
  artifacts: `2026-09-05T13-38-49-004Z-15-81aced`, `13-39-15-193Z-15-2ac8b0`, `13-39-34-980Z-15-58c624`;
  after: `2026-09-05T14-02-43-120Z-17-458093`, `14-03-52-765Z-16-0dd6c6`, `14-05-00-526Z-15-4f16ca` (all
  `.test-results/`, omitted date prefixes are the same date). The overlapping lint run at `13-57-52` is excluded.
- `introducedByChange`: the shared audit digest mismatch is absent on the three baseline runs and present in
  the first post-change production run (`2026-09-05T13-54-01-290Z-16-ee1757`). Full record comparison proves the
  only 815 leaf changes are `executionTrace[].detail: damage_resolution_schema_v35 → v36`. Inventory, failures,
  candidate 6,360 / deduplicated 3,949 / requests 1,924 / distinct 1,298 and all numeric damage are unchanged.
  New application digest: `482e10bb1fc7be056d6fa122bf57c3ff594fcf48dd4e794f0f6b20aec364eff9`.
- Golden engine envelopes were advanced to 31.0.0 without changing inputs or expected damage. Their initial
  version assertions are explained by the explicit engine bump; baseline rerun of those individual tests was
  not performed (`unverified` diagnostic provenance beyond the recorded prior 06.412 quality evidence).
- `environmentDependent`: the production run overlapping the Next build reports six execution failures
  (`2026-09-05T14-06-07…`); the same suite succeeds sequentially with no semantic/test-limit changes at
  `14-08-13-979Z-16-20dbc0`. This is not used as a performance comparison or a reason to relax limits.
- The snapshot-update command's six browser tests pass, but the runner rejects screenshot-regeneration console
  output as an unexpected observation. No allowance is added; the final non-update quality run must pass.
  The 320px row fixture now scrolls the row to the center so the fixed navigation does not obscure its capture.

Final integration review gap (same pinned-scenario family): the Step 1 inventory named portable replacement
but did not include `CalculatorRoute.saveScenarioDraft`, which called the throwing constructor before its
transactional save. A changed level with retained provenance therefore fails before write but rejects the UI
promise rather than returning an application outcome. This is confirmed from that call and the constructor's
strict schema parse; no production damage corruption was observed. The minimum added guardrail is an
application-owned scenario-change attempt consumed by that Web writer, with constructor-invalid and
execution-invalid counterexamples retaining the previous pair and no commit. This corrects the missed UI
command-to-recovery edge; it does not authorize editing pinned bases or change normal-reset policy.
Verified: `attemptPortableCalculationScenarioChange` now owns this attempt, `CalculatorRoute` commits only
its committed outcome, and `rankingBasis.test.ts` proves constructor/execution invalid attempts preserve the
retained pair. Resultless repair remains available; ordinary unsupported edits retain their prior behavior.

Final quality gate: **PASS**, `pnpm quality`, 283.32s, artifact
`.test-results/2026-09-05T15-00-56-136Z-16-805668`. Unit 79 files / 453 tests; production 24 files / 117 tests;
Playwright 25 tests, retries 0; warnings 0, unexpected console 0. Format, lint, typecheck, runner/docs contracts,
master validation and build also pass. TSK-06.42 runtime Blocking is 0; subsequent task dispositions above remain.

The preceding quality run (`2026-09-05T14-25-03-673Z-16-a7a791`) failed three calculator screenshot assertions.
Expected/actual/diff inspection confines every stable difference to engine labels `30.0.0 → 31.0.0`; damage
numbers and layout agree. Those three version-bearing baselines were updated from the inspected captures.
Baseline browser rerun was not performed (`unverified` provenance); the final non-update gate above passes
with no tolerance or observation allowance changes. Ranking captures cover the expanded controls/summary,
detail, 320px row and 390px icon fallback; this is not broader TSK-07 responsive closure.

### Revalidated Step 1 handoff at `255464b` (2026-09-05)

This delta supersedes the stale prerequisite and baseline statements below; the existing design and matrix
remain the starting plan. Baseline is `main` at `255464b2dc6219df7be0032bd46d45d279bbb30c`, with a clean worktree.
This pass reads code and existing evidence only: no implementation, test, configuration, snapshot, benchmark,
or production regeneration was performed. Requirements remain ranking v0.10.1 sections 4, 11, 12, 15, 17 and
UI v1.5.0 section 12; no product decision changes are needed.

#### Confirmed code delta and prerequisite reuse

- TSK-06.411 is complete: `scenario.ts:prepareCalculationScenario` checks the exact selected-level stat before
  preparation, accepts a present zero, and rejects missing ATK even with an override. Reuse its application
  invalid outcome and its scenario／portable／handoff fixtures; do not add an ATK lookup to the basis resolver.
- TSK-06.412 is complete in the Task source. `schema/src/index.ts:servantIdentityRecordSchema` now conserves raw
  own keys and validates embedded identity in current and v32/v33/v34 records, including PIR-002 at this HEAD.
  The record schema is currently private: expose/reuse that existing schema at the worker trust boundary rather
  than parse a synthetic LocalProfile or implement a new record refinement. `profile-domain:isOwned` remains
  the ownership owner; both membership and `rankingRows:createRankingRow` still duplicate its predicate.
  The identity note's independent-review-pending statement is retained as historical evidence, not promoted
  to a new approval claim by this planning pass.
- `rankingContracts`, `rankingPolicy`, `rankingRows`, `rankingStaticSemantics`, `rankingComparisonPolicy`,
  `rankingPolicyScenario`, `rankingPolicyCandidates`, and `rankingPolicyMatrix` still have the old mode/global-NP
  contract. `rankingCandidateSpace` constructs scenarios on both baseline and materialization paths. Both paths,
  summary and direct detail calls must receive the same resolved basis. Matrix NP1–5 means five complete calls
  with specified NP bases; owned-NP tests are separate and must not silently repeat the owned NP five times.
- `rankingState`, `RankingConditions`, `rankingWorkerProtocol`, `rankingWorkerRuntime`, and `useRanking` retain
  the old parser, direct patch commands, and five-field identity. `initialize` already clears all three worker
  maps, but installs an unchecked context first. Preserve this atomic clearing behavior after validation.
- Portable schema is now **35**, engine **30.0.0**. `createRankingPortableRequest` copies only two policy axes;
  `executePortableCalculation` validates schema/version/capacity but has no comparison-basis coherence check.
  `replacePortableCalculationScenario`, version upgrade, recover, and direct execution must share the new
  validation; recovery must retain the previous request/result on a failed attempt. `rankingHandoff` already
  executes before durable/workspace/session/route publication (TSK-06.411 PIR-001); preserve that transaction.

#### Review gap: detail identity and transport composition

1. Mechanism — confirmed by `rankingWorkerRuntime:handle`: detail looks up the cache by fingerprint/entryId,
   separately finds servantId, and passes the supplied AttackProfile without proving those three identify the
   same current summary entry. A cached detail returns before that relation is checked. `useRanking:onmessage`
   trusts the typed response and guards principally by selection fingerprint.
2. Implementation mismatch — inference: independent request fields can identify different rows, so six-field
   hashing alone does not establish row → detail → handoff identity. This is a transport identity issue, not a
   new damage semantic family; no production misdelivery was reproduced in this documentation-only pass.
3. Missed detection — confirmed: the earlier matrix listed malformed payload and stale context, but omitted
   structurally valid contradictory entryId/servantId/AttackProfile and delayed same-selection context responses.
4. Recurrence scope/minimum guardrail — validate context/selection/request identity on ready/result/detail/error;
   resolve detail from the canonical summary entry before cache access. Prefer sending entryId plus context and
   selection identities and obtaining servant/profile from that entry, deleting redundant client authorities.
   Check cache hit and miss, missing/nonmember entry, old context with identical selection, and mixed old/new input.

#### Concrete boundary decisions

Application owns legal selection validation, commands, and per-servant resolution. Schema owns the serializable
selection/provenance shape so portable and worker callers can reuse it without reversing package dependencies;
application adds master-dependent checks. A validated selection is distinct from raw input. Request-level invalid
has no enumerated rows or partial cache result. A valid empty owned collection is success with zero rows. Existing
profile outcomes (`inputRequired`, `unavailableUnderPolicy`, `invalid`, `unsupported`) and candidate stochastic or
policy omission classifications remain distinct; malformed transport is not a fabricated profile exclusion.

URL calculation keys will be `rPopulation`, `rLevelBasis`, `rNpBasis`, `rAffinity`, `rSelf`, `rConditional`.
The NP token is `1`–`5` or `owned`, decoded into the typed NP basis without permissive numeric coercion. Either
all six calculation keys are absent (defaults) or each occurs exactly once; the serializer emits all six for a
valid selection. Partial, duplicate, empty, unknown, old `rMode`/`rNp`, and mixed old/new inputs are invalid.
Display filter/metric keys remain independent. Changing a filter while invalid must not serialize defaults and
repair the calculation state implicitly; only explicit reset publishes a legal selection. Back/forward parsing
uses the same boundary. This closes the prior plan's partial-input rule versus default-omitting writer gap.

Portable provenance copies servant identity and selected numeric level/NP once. Verify basis ↔ provenance ↔
scenario consistency, natural-limit/Lv.90/specified-NP claims, master source and fixed comparison inputs before
execution. Owned provenance proves the pinned selection-time value, not current ownership after profile edits.
No saved build is read during replay. Do not reject legal planner-selected preparation/world facts by comparing
an executed scenario with an unprepared default scenario.

Cut over schema 35 → 36 and engine 30.0.0 → 31.0.0 once in Step 2. Preserve explicit v32/v33 dispositions and
raw-key-safe identity parsing. Add exact v35 and adapt v34 migration: valid calculator/manual snapshots keep
identity and old runtime versions (ordinary explicit upgrade remains required); two-axis ranking drafts are
discarded and matching ranking history becomes non-executable historical data. Extend the existing historical
variant, currently restricted to v33, to retain exact v34/v35 policy evidence without inventing comparison axes.
Already-historical v33 records remain historical. Current malformed or mixed requests fail closed; migration
never repairs profile maps. Apply the same disposition through stored load and backup import; old shares reject.

#### Additional state-by-path matrix (implementation deferred)

| State × path | Required result / minimum verification | Status |
| --- | --- | --- |
| selected owned NP differs from specified default × baseline/materialized candidate, summary/direct detail, matrix | one resolved NP drives coefficients, capacity, winner and selected damage row; each specified matrix column executes fully | Deferred: TSK-06.42 |
| NP0/missing build × membership and row ownership | both consume `isOwned`; no synthetic exclusions or record changes | Deferred: TSK-06.42 |
| missing exact ATK / present zero / override × new owned/uniform basis | reuse TSK-06.411 outcome and fixtures; add only basis integration parity | Deferred: TSK-06.42 |
| raw lost key or identity mismatch × worker initialize | reuse TSK-06.412 record parser and fixture family; no partial context publication or old-context calculation after failed replacement | Deferred: TSK-06.42 |
| old-only / canonical-only / mixed / duplicate / partial axes × URL, worker, portable | strict boundary; numeric calculation only for complete legal canonical input (or empty URL defaults) | Deferred: TSK-06.42 |
| invalid URL × filter edit / popstate / reset | no dispatch or implicit repair; explicit reset recovers with synchronized controls/summary | Deferred: TSK-06.42 |
| mismatched entry / nonmember entry × cached and uncached detail | reject before cache read or execution; no handoff | Deferred: TSK-06.42 |
| delayed ready/result/detail/error × new context with identical selection | ignored; no old rows/details or readiness exposed; include request identity | Deferred: TSK-06.42 |
| natural Lv.90 versus uniform Lv.90; owned value numerically equal to specified × fingerprint/replay | equal damage may have distinct selection/provenance identity | Deferred: TSK-06.42 |
| tampered provenance/fixed basis × constructor, execute, replace, recover, upgrade | typed invalid, no replacement draft/history/session/route write; retain prior pair | Deferred: TSK-06.42 |
| v32/v33/v34/v35 × calculator/manual/ranking/historical × load/backup/share | exact migration dispositions above; missing axes never become executable | Deferred: TSK-06.42 |

#### Execution boundary and evidence handoff

Planning Blocking is **0**; implementation rows remain Deferred, not Verified. Execute units 42-A through 42-F
in the Task source in dependency order. Before source edits in Step 2, measure the existing shared
`productionAudit.test.ts` compile/hot-path with three comparable bounded runs and record median, inventory,
candidate/damage counters and artifacts here; repeat after implementation under the same conditions. Previous
TSK-06.412 evidence (not remeasured here) is 469 servants / 422 attack servants / 433 profiles, default ranking
393 rows, candidate 6,360 / deduplicated 3,949 / damage requests 1,924 / distinct 1,298. Reuse the existing shared
natural/Lv.90 availability inventory; owned inputs use one stable fixture, not full-master reload per combination.
Record intentional changes by selection, resolved inputs, governing rule, outcome and rank; do not only update a
digest. Full four-policy maximum closure and all-current-NP numeric closure remain TSK-06.5 and TSK-06.45.

Step 2 requires a new explicit implementation request, this handoff, TSK-06.42 `ready`, prerequisites `done`,
and baseline ancestry through `255464b`. Allowed initial worktree: only the two reviewed Step 1 documentation
files (this note and the Task source), if not committed; no source/test/configuration/fixture/snapshot changes.
Do not revert later user edits; record any changed boundary and keep unrelated work isolated. Commit the planning
boundary if needed, then create a Task-only `in_progress` start commit before implementation. Do not run this
start transition during Step 1. Completion requires the Task done gate, unit/production evidence, final
`pnpm quality`, and zero runtime Blocking within this Task, with explicit later-task dispositions retained.

### Original planning mechanism (historical; current delta above)

The user-visible outcome remains the approved six controls: population, level basis, NP-level basis, class
affinity, self buffs, and conditional effects. Population changes membership only. Level and NP-level bases are
resolved independently for each included AttackProfile, while Fou ATK+1,000, skill level 10, OC1, and the other
shared assumptions remain fixed. The calculation application owns validation, explicit state transitions, and
per-entry resolution; Web serializes and presents that state, and ranking continues through the shared scenario
preparation and damage executor.

The current runtime violates that invariant in one mechanism. `RankingPolicyConditions.comparisonMode` is read by
`includedRankingServants`, `ownedBuild`, and `createRankingBaseScenario`; it simultaneously filters the population,
selects level and NP level, sets `attacker.source`, and imports stored Fou. `npLevel` is then read independently by
static semantics, NP-capacity policy, candidate selection, and the NP1〜5 matrix. Web patches this product directly,
parses unknown URL values to defaults, disables specified NP in owned mode, and fingerprints only the old five
fields. The worker trusts the structural TypeScript type, keeps maps keyed by that fingerprint, and returns generic
errors. Portable ranking intent retains only self／condition policy, so the resolved scenario carries the selected
numbers but not the six-field comparison identity.

Confirmed fallback paths are `ranking_owned_build_missing` being caught as generic per-profile `invalid`, invalid
URL values becoming standard／NP1, and missing `atkByLevel[level]` becoming numeric ATK 0 in shared scenario
preparation. NP0 is currently excluded from the ranking population, which agrees with the approved profile-wide
ownership rule; the defect is that ranking repeats the `npLevel > 0` rule instead of consuming its canonical owner.
The ATK item is not owned by comparison-basis selection and is split into TSK-06.411 and its own flow note. The audit
also found that a map key／embedded `ServantBuild.servantId` contradiction is accepted by the current profile schema
and can apply one servant's saved values to another across calculator, ranking, and profile readers. That separate
identity family is split into TSK-06.412. The earlier TSK-06.42 plan gap was listing endpoints without inventorying
the application command boundary, per-entry NP consumers, mixed `attacker.source` semantics, request-level invalid
outcome, persistence migration, irrelevant profile inputs in worker identity, or the two shared fallback families.

### Canonical cutover design

The application contract replaces `comparisonMode` and scalar `npLevel` with the already approved three-axis
product. A single application compiler accepts the six-field selection and returns either a validated comparison
selection or a typed request-level `invalid` result. It then resolves one `ResolvedRankingBasis` per included
servant: membership, numeric level, numeric NP level, and exact provenance for both numeric dimensions. Downstream
static semantics, NP capacity, candidate construction, and candidate selection receive only the resolved numeric
NP level; they do not read stored builds or reinterpret an NP-level basis.

Owned membership consumes the profile-domain ownership fact: NP1〜5 is owned and NP0／missing build is unowned.
The saved record remains intact when NP is returned to 0, but an owned-population ranking does not enumerate it;
specified NP must not turn an unowned record into a member. For an enumerated owned servant, level and NP level are
both present in the validated build; unavailable exact level ATK is `invalid`, never a numeric fallback. A malformed
worker payload is rejected at its runtime boundary. Map-key／`servantId` coherence is guaranteed by TSK-06.412 rather
than reimplemented in the ranking resolver. `all + ownedLevel` and `all + owned NP` are request-level invalid states.

Application commands are the only normal-state writers. `setPopulation(all)` is an explicit atomic transition: it
changes an illegal `ownedLevel` to `naturalLimit` and illegal owned NP to specified NP1, while preserving already
legal axes. Direct URL, worker, or portable inputs containing the illegal product are rejected and do not receive
that normalization. Unknown calculation-axis values and removed `rMode` are invalid; absence of all new keys means
the documented defaults. Web does not dispatch a worker calculation until the URL state is valid and exposes one
explicit reset-to-default command for an invalid URL.

Ranking scenarios keep `attacker.source: master` even when level or NP level is copied from owned data. That field
continues to control calculator saved-build behavior, so population must not set it to `owned` and thereby import
stored Fou or skill levels. The ranking detail and portable ranking intent retain the complete validated six-field
selection plus the resolved level／NP provenance; portable replay executes the pinned scenario, validates the legal
axis product and its natural-limit／Lv.90／specified-NP claims, and never re-resolves mutable saved builds. Owned
values are copied at selection time and remain pinned after the profile changes.

The schema cutover increments the current schema once. Prior-schema calculator／manual snapshots may migrate when
their identity is unchanged. A prior-schema ranking draft is discarded and a prior-schema ranking history
entry may remain only as isolated historical data; neither can be upgraded to an executable six-field ranking
request because the missing axes cannot be inferred. Old share payloads and stale worker protocols fail closed.
This is historical retention, not a compatibility runtime.

`RankingProfileInput` is narrowed to the validated servant-build map used by membership, owned bases, and row
ownership. Saved craft essences and support templates are fixed to none by the comparison policy and are not
ranking inputs; they must not recreate the worker or change a calculation／cache identity. Worker caches remain
scoped to one master／version／servant-build context and one validated six-field selection. A context replacement
clears summary, detail, and selection maps atomically, while stale guards compare both current context and
selection identities.

### Original production inventory (historical)

At audited HEAD `907f251`, the published master contains 469 servants, 422 servants with an attack NP, and 433
AttackProfiles. All 422 attack servants have both the rarity-derived natural-limit ATK and Lv.90 ATK. Of them, 421
have ATK through Lv.120; Mash has canonical stats through Lv.90. No production profile data exists for the owned
axes, so their completeness is proved with one shared stable profile fixture rather than by treating a production
zero as evidence. HEAD differs from the requested `c18f449` starting point only by the route-interaction bundle
split; the basis owner and fallback mechanism are unchanged, and no worktree changes were present during this
audit outside planning documents.

### Flow inventory and implementation ownership

| Path | Confirmed current reader／writer and required transition | Status |
| --- | --- | --- |
| master ATK production | pipeline emits level-addressable `atkGrowth`; master-data owns natural level; no Web interpolation | Verified: production natural／Lv.90 availability; schema-legal absence is Deferred: TSK-06.411 |
| six-field type／defaults／command | `rankingContracts` currently owns five fields; add raw-input validation, validated selection, explicit command reducer, and request-level invalid outcome | Deferred: TSK-06.42 |
| profile identity | profile schema permits record-key／embedded-ID contradiction; all build consumers need one fail-closed trust boundary | Deferred: TSK-06.412 |
| population | `includedRankingServants` repeats `npLevel > 0`; consume the canonical profile ownership classifier and keep NP0／missing records outside owned population | Deferred: TSK-06.42 |
| per-entry level／NP resolution | `rankingPolicy` currently couples mode, level, NP, Fou, and source; replace with the single application resolver | Deferred: TSK-06.42 |
| candidate compilation／selection | `rankingStaticSemantics`, `rankingComparisonPolicy`, `rankingPolicyScenario`, and `rankingPolicyCandidates` read global `conditions.npLevel`; consume resolved per-entry NP exactly once | Deferred: TSK-06.42 |
| row／detail identity | rows already expose numeric level／NP; detail only retains self／condition policy; add resolved basis and full six-field identity without duplicating damage semantics | Deferred: TSK-06.42 |
| URL writer／reader | `rankingState` owns `rMode`／`rNp` and fallback parsing; replace keys atomically and represent invalid calculation state without worker dispatch | Deferred: TSK-06.42 |
| worker protocol／stale identity | protocol accepts unchecked conditions; fingerprint has five fields; response error is generic | Deferred: TSK-06.42 |
| worker context | `RankingProfileInput` and its JSON fingerprint include unused craft essence／support data; narrow to validated servant builds and include context plus selection in stale identity | Deferred: TSK-06.42 |
| summary／detail cache key | worker maps are scoped only by lifecycle plus the old selection fingerprint; React stale guards compare only that selection | Deferred: TSK-06.42 |
| cache value／lifetime／cardinality | current worker caches unbounded calculations and details; this is the existing cache-lifecycle family | Deferred: TSK-07 |
| portable constructor／schema／fingerprint | detail writer and ranking intent retain only two policy axes; add six-field selection plus resolved provenance and bump schema once | Deferred: TSK-06.42 |
| draft／history／share／backup recovery | all persist and hash the full portable request; migrate identity-preserving non-ranking data, historicalize or discard old ranking snapshots, never infer missing axes | Deferred: TSK-06.42 |
| portable execute／recover／version upgrade | execute the pinned resolved scenario after identity validation; failure retains the prior request／result and never re-reads an owned build | Deferred: TSK-06.42 |
| immediate ranking → calculator replay | `rankingHandoff` already uses the application constructor and executor; prove row/detail/request/result parity for every basis family | Deferred: TSK-06.42 |
| calculator notice／normal reset interaction | consumes the new portable identity but does not own its semantics | Deferred: TSK-07 |
| filter／sort／metric | display-only state neither writes nor transforms comparison bases | N/A: no scenario or identity change |
| stack maximum／logical-effect presentation／all attack-NP closure | separate semantic owners remain unchanged by this cutover | Deferred: TSK-06.43／TSK-06.47／TSK-06.45 |
| final natural／Lv.90 × NP1〜5 × four-policy maximum and performance | consumes the closed basis resolver and stable owned fixture | Deferred: TSK-06.5 |

Planning Blocking is **0**. Current numbering maps the original prerequisite pair to TSK-06.411 and
TSK-06.412 → TSK-06.42 → TSK-06.43 → TSK-06.44 → TSK-06.45 → TSK-06.46 → TSK-06.47 → TSK-06.5.
TSK-07 retains only cache lifecycle, notice／reset interaction, outcome presentation, and responsive／a11y closure;
it must not add a second basis parser or portable adapter.

### State-by-path counterexamples

| State | Population／resolution | Execution／identity／recovery | Expected outcome | Status |
| --- | --- | --- | --- | --- |
| all＋natural limit＋specified NP1〜5 | all 433 profiles; canonical natural level | resolved NP is the only downstream NP input; distinct six-field identity | calculated where later execution tasks permit | Deferred: TSK-06.42 |
| all＋Lv.90＋specified NP | all 433 profiles at Lv.90 | no interpolation; distinct from natural-limit cache／portable identity | calculated where later execution tasks permit | Deferred: TSK-06.42 |
| owned＋natural limit＋owned NP | NP1〜5 ownership membership; ignore stored level／Fou／skills | copy stored NP once; pin it in detail and portable scenario | calculated | Deferred: TSK-06.42 |
| owned＋Lv.90＋specified NP | NP1〜5 ownership membership; ignore every stored combat value except owned fact | master source, Fou1000, skill10; preserve legal axes on profile mutation | calculated | Deferred: TSK-06.42 |
| owned＋low owned level＋specified NP | use only stored level | exact `atkByLevel`; same row/detail/calculator damage | calculated | Deferred: TSK-06.42 |
| owned＋owned level＋owned NP | copy two owned dimensions independently | no complete-owned-build label or saved Fou／skill import | calculated for NP1〜5 | Deferred: TSK-06.42 |
| saved build with NP0＋specified NP under owned population | unowned; record remains stored but is not enumerated | specified NP changes NP level only, not membership | absent by typed ownership proof | Deferred: TSK-06.42 |
| saved build with NP0＋owned NP under owned population | unowned; no per-entry resolution is attempted | no NP1 substitution and no fabricated exclusion | absent by typed ownership proof | Deferred: TSK-06.42 |
| no build under owned population | unowned and not enumerated | no per-entry outcome fabricated | absent by typed ownership proof | Deferred: TSK-06.42 |
| empty owned population | enumerate zero servants and profiles | valid selection and cache identity; no generic failure | calculated collection with zero rows | Deferred: TSK-06.42 |
| all＋owned level or owned NP from URL／worker／portable | reject product before enumeration／execution | no cache write, handoff, or numeric scenario | request-level `invalid` | Deferred: TSK-06.42 |
| explicit UI change owned → all while owned bases selected | application command changes only illegal axes to documented defaults | serialized result is legal; no hidden fallback reader | valid all＋natural＋specified NP1 | Deferred: TSK-06.42 |
| unknown axis or removed `rMode` URL | parser retains typed invalid state | worker not called; explicit reset is offered | request-level `invalid` | Deferred: TSK-06.42 |
| record key and `ServantBuild.servantId` disagree | reject the profile at its shared schema／persistence trust boundary | calculator, ranking, and reset cannot apply it to either identity | retained data is not guessed or rewritten | Deferred: TSK-06.412 |
| worker build or condition payload is structurally malformed | runtime parse before cache lookup or calculation | no partial context installation or generic exception fallback | request-level typed `invalid` | Deferred: TSK-06.42 |
| selected owned level lacks canonical ATK | basis resolver does not guess/interpolate | shared scenario preparation also rejects missing stat | `invalid: attackerLevelStatUnavailable` | Deferred: TSK-06.411 then TSK-06.42 parity |
| owned profile changes after detail／handoff | existing detail retains copied values and provenance | portable replay uses pinned scenario; new ranking request gets new context identity | old replay stable; new result recalculated | Deferred: TSK-06.42 |
| prior-schema ranking snapshot／share | axes cannot be reconstructed | draft discard／history historical-only; share rejected | no executable compatibility fallback | Deferred: TSK-06.42 |
| display filter／metric only | unchanged six-field state | no worker calculation or portable rewrite | presentation-only change | Verified: current boundary; reverify in TSK-06.42 |

## TSK-06.41 runtime cutover — previous authoritative delta

### Product correction closure — IRL-003／005／006

The approved user-visible outcome is that every optional action with an effective contribution under the
selected policy competes when at least one legal initial-state candidate can execute the complete action and
the later attack NP. A represented disadvantage is applied, not used as an admission veto. Only the concrete
candidate that cannot pay an NP／HP cost or otherwise reach the attack NP is dropped. The previous design used
“disadvantage-free” as a proxy for executable and therefore changed ranking membership before the ordered
executor could prove reachability.

The repaired model removes the polarity／cost veto from action admission. Admission now asks only whether the
selected policy has an effective contribution; the candidate executor then applies the complete ordered action
and attack NP, rejecting only the concrete initial-resource candidate that cannot complete. Unsupported
operations block the exact profile maximum and never become a numeric fallback. Resource closure uses the
ordered suffix for HP／NP／stars／BP, and portable reset resolves its subject inside the application boundary
from the retained request identity.

| Canonical state / counterexample | Policy admission | Ordered execution / recovery | Expected outcome | Current status |
| --- | --- | --- | --- | --- |
| unconditional deterministic contribution plus no disadvantage | policy-relevant optional action | execute all operations and attack NP | calculated candidate | Verified regression boundary |
| unconditional deterministic contribution plus represented HP cost／negative modifier／detrimental state | do not inspect polarity or cost presence | commit every sibling; require attack NP reachability | candidate competes by final average damage | Verified: adverse-independent admission fixture and production family ratchet |
| fixed NP cost at baseline start NP100% | policy-relevant action remains enumerable | cost leaves attack NP unreachable | only that concrete candidate is `unreachable` | Verified: focused NP-cost candidate is rejected with `insufficientNpGauge` |
| same fixed NP cost with a legal higher start gauge in satisfied mode | same action option | cost and attack NP both execute | reachable candidate remains and may win | Verified: NP200% candidate remains executable |
| conditional-only contribution in baseline | no effective contribution under selected policy | N/A: optional action is not executed | `policyNoOp`, independent of disadvantage | Verified regression boundary |
| unconditional＋conditional siblings plus represented cost in baseline | admit from the unconditional effective sibling | commit cost／mutation; exclude only conditional damage contribution | reachable candidate keeps unconditional contribution | Verified by baseline admission／execution fixture family |
| unknown／dependent cost | never infer feasibility | no partial transaction | `unsupported`, not `policyNoOp` or calculated | Verified fail-closed boundary |
| HP／BP mutation whose reader exists only before the mutation | admission is unchanged | suffix has no reader | `noDamageReader`; do not block a legal action | Verified: sibling suffix fixtures; calculator `300100` becomes calculated |
| HP／BP mutation followed by a reader | admission is unchanged | ordered canonical state must change before the reader | mutated value is consumed or transaction is typed unsupported | Verified: HP `702500`／BP `705300` remain typed unsupported |
| retained portable request subject differs from mutable UI scenario | N/A: ranking policy is already stored | reset resolves the retained request subject exactly before any write | exact reset or no-op with old durable／memory pair intact | Verified: exact retained build is selected and missing subject rejects before attempt |
| stochastic success／failure | existing condition policy owns contribution and outcome candidate | execute one legal outcome | baseline minimum／failure; satisfied legal maximum | N/A: unchanged by adverse-action correction |
| self buffs excluded optional action | source policy excludes the optional action | no execution | `policyNoOp`; `structuralRequired` remains separate | N/A: unchanged by adverse-action correction |

Flow classification: canonical effect／operation production and contribution classification are `Verified`;
adverse-independent admission and baseline candidate reachability are `Verified`; ordered HP／BP suffix
semantics are `Verified`; exact-subject portable reset is `Verified`; calculator／ranking parity is `Verified`;
UI ranking presentation is `N/A: it consumes typed results`; final four-policy production maximum is
`Deferred: TSK-06.5`. Current Blocking count is **0**.

Verification separates evidence roles. Focused fixtures close NP100% unreachable／NP200% reachable, adverse
admission, suffix readers, rollback, and exact reset identity. The production admission digest
`bb43fa1ff4df8e68ce460829cba253459ebc2e1a7e053a7ce782529018d6e101` covers all four policy combinations;
baseline execution records 12 concrete `insufficientNpGauge` candidates. Production adverse occurrences are
HP fixed 23, NP fixed 38, stars fixed 5, BP fixed 1, negative modifier 27, trait removal 3; all four dependent
resource families and detrimental state are explicit zero ratchets backed by focused schema-legal fixtures.

The current-default candidate population changes from 669／668 requests／631 distinct inputs to
1,936／1,924／1,298 because formerly vetoed policy-contributing action programs are now evaluated. The largest
satisfied product remains 3,840 under the unchanged 4,096 bound. The shared production audit changes from
419 calculated／3 unsupported calculators／432 ranking rows to 420／2／393, digest
`e0677f9362ef8f9a50e312693a1c8cc5fcc11e22be31b4d7c39f268ad41bbc78`. Every one of the 433
`Servant × AttackProfile` entries whose selected result, status, or ordinal rank changes is recorded with its
canonical input, ordered action, starting resource／mutation trace, NP1〜5 damage, deterministic NP1 rank, and
reason in `docs/evidence/ranking-adverse-action-diff-tsk-06-41.json`. Of 348 direct result changes, 308 remain calculated
with a newly winning complete action, 39 move from a false numeric result to typed unsupported, and one moves
from false `policyNoOp` to typed unsupported. The other 85 retain their selected candidate／damage but move rank
because those direct changes reorder the numeric population. The full 433-profile join leaves zero unexplained
rank-only or member differences.

The affected audit compile median changes from 4.697 s (`4.970／4.697／4.567`) to 7.167 s
(`7.421／7.167／6.864`, +52.6%). This is explained by 2.88× damage requests and 2.06× distinct inputs from the
required semantic population; the finite bound and cap are unchanged. Final four-policy production maximum
and its performance baseline remain `Deferred: TSK-06.5`.

Final phase gate: `pnpm quality` passed with 406 unit／116 production／25 Playwright tests,
skip／todo／retry／warning／unexpected-console 0; artifact
`.test-results/2026-09-04T15-08-22-027Z-15-a59fec`. The ranking summary and detail VRT baselines were updated
after visual confirmation of the expected 393-row／40-unsupported population and newly selected top profile.

### Previous re-review correction delta — IRL-001／003 (superseded closure status)

The 2026-09-04 re-review reopened two adjacent states in the already declared condition and resource
families. The earlier closure tested card／NP variant binding but did not enumerate terminal-form traits or
program-proved choice／operation-trigger facts; it also treated every critical-star mutation as if a terminal
input represented an ordered transition. These were flow-inventory gaps, not servant-specific exceptions.

The user-visible outcome is that baseline admission and contribution execution classify the same fully bound
intrinsic condition, and that an ordered resource mutation is erased only when the suffix of its transaction
has no damage reader. The governing invariants are one classifier for admission and contribution inclusion,
and execute-or-typed-unsupported atomicity for every resource transition. The recurrence scope is every
boolean composition of card／variant／terminal attacker trait／selected choice／operation trigger and every
resource-mutation × later-reader ordering. Production-negative resource families require an explicit zero
ratchet rather than inference from current master defaults.

| Canonical state / counterexample | Producer | Admission／execution consumer | Failure／recovery | Final status |
| --- | --- | --- | --- | --- |
| terminal form has required intrinsic trait | `AttackProfile.id.terminalActorFormProfileId.semantics.intrinsicTraits` | shared bound-condition classifier used by baseline admission and effective contribution policy | no external witness; mismatched／absent trait is not invented | Verified: Douman skill `818552` and both Chaotic／Evil contributions are effective |
| selected action branch proves choice and operation trigger inside nested card／variant／trait boolean | static preparation program and selected source effects | the same classifier consumes program facts; ordered executor consumes the corresponding activation facts | ambiguous or unproved fact remains runtime/conditional and is not baseline-admitted | Verified: schema-legal nested five-fact fixture |
| critical-star gain／loss followed by star-dependent condition or value | canonical resource operation and later operation suffix | resource closure emits `orderedCriticalStars`; executor mutates canonical star state before the reader | missing amount/state is typed unsupported and rolls back every sibling | Verified: gain／loss result fixtures plus missing-amount sibling rollback |
| critical-star mutation with no later reader | canonical resource operation | suffix-scoped resource closure | `noDamageReader`; retained evidence cannot change damage | Verified: production has zero critical-star unsupported outcomes |
| HP／BP reader and existing blocker aggregation paths | existing canonical compiler／executor／profile aggregator | unchanged owners | existing IRL-002／004 fixtures and production inventory remain authoritative | Verified regression boundary |

Flow delta classification: condition producers／admission／effective-contribution readers and resource
compiler／suffix reader scan／transaction executor／profile recovery are `Verified`. Calculator and ranking both
reach the same application compiler and ordered executor (`Verified` architecture boundary). UI presentation
is `N/A: it consumes the typed application outcome and does not classify these semantics`. TSK-06.5 final
four-policy maxima remain `Deferred: TSK-06.5`. This section's former Blocking count 0 is superseded by the
current delta above.

### Previous implementation review closure delta — IRL-001〜004 (historical)

The implementation review expanded the recurrence scope of the previous condition and operation audits. The
first closure proved current caller parity, condition truth, and pipeline classification, but did not require
the same AttackProfile-bound classifier for action admission, did not expose NP-internal value reads as
contribution dependencies, did not trace every retained resource operation through the ordered reducer, and
did not retain the complete blocker population after presentation precedence. Those were earlier review gaps,
not four independent servant exceptions.

Confirmed mechanisms are: syntactic `always` admission drops card／NP-variant intrinsic contributions;
`hpRatioLow`、`battlePointPhase`、and `traitCount` compile as an unconditional NP special contribution; fixed
non-NP resource operations compile as supported retained evidence without a state transition; and profile
aggregation selects the first input-required execution before unsupported while discarding the remaining
classes. The recurrence scope is every nested intrinsic／conditional condition, every NP value family, every
resource kind and transaction rollback path, and every admitted candidate outcome order. Minimum guardrails
are one canonical static condition classification, exhaustive typed NP value dependencies, execute-or-
unsupported resource operations, and stable class diagnostics independent of candidate order.

| Family state | Admission／normal loop | NP value／alternate mutation | Aggregation／recovery | Planning status |
| --- | --- | --- | --- | --- |
| intrinsic card／NP variant, including nested `all`／`any`／`not` | selected AttackProfile decides intrinsic truth; safe effective action is admitted | contribution uses the same classification | no external witness is invented | Verified: shared classifier fixtures＋Artoria Lily production regression |
| HP／BP／trait-count value dependency | baseline excludes only the dependent delta | satisfied mode enumerates canonical quantity／trait witnesses; NP base remains intrinsic | calculator still evaluates explicit scenario facts | Verified: exhaustive dependency fixtures＋production occurrence ratchet |
| HP／star／BP resource mutation | an admitted transaction either applies every representable transition or fails closed | unrepresentable state／unit becomes typed unsupported and rolls back siblings | no plausible numeric candidate survives | Verified: read-sensitive closure、transaction rollback、Hijikata production regression |
| calculated＋unavailable＋inputRequired＋invalid＋unsupported | execution preserves the candidate-local class | alternate candidate order cannot change classification | `invalid > unsupported > inputRequired > unavailable`; every class keeps count, digest, and bounded representatives | Verified: reordered mixed classes、calculated dominance boundary、production artifact |

TSK-06.5 final four-policy maximum remains Deferred and TSK-07 cache／responsive scope is N/A for this delta.

This section supersedes the TSK-06.4 implementation deferrals below. Implementation started from clean HEAD
`b07ca1ddb4fae01d67e38321e7a7c496b9592a64`. Damage, profile selection, row count, badge, detail, and portable
replay now consume one canonical ordered application result and its effective contribution set. Action
admission remains separate from contribution inclusion; an admitted action commits its branch, cost, and
mutations atomically even when policy excludes one damage contribution.

| Direct producer／reader／writer／recovery | Classification |
| --- | --- |
| Atlas vocabulary → source-specific canonical schemas | Verified: pipeline-only interpretation; active／passive／NP／CE／mystic bounds reject schema-legal overflow fixtures |
| canonical effects → ordered operations／retained evidence | Verified: one battle-execution compiler; resource／state／bounded／unsupported outcomes are typed |
| ordered action → branch, cost, mutation, contribution | Verified: one transactional executor; failure rolls back the action, policy exclusion does not roll mutations back |
| AttackProfile and complete path → candidate-local admission | Verified: structural role uses terminal profile and the full ordered path |
| finite domain → materialization → final-damage comparison | Verified: certificate precedes allocation, count matches materialization, independent oracle passes; maximum 2,880／4,096 |
| calculator／ranking／without-area／portable replay | Verified: same application preparation and executor; without-area is reapplied only to the selected result |
| effective contributions → damage／selection／row／badge／detail | Verified: self, condition, and area decisions remain independent; presentation groups exclude NP base |
| invalid／unsupported／inputRequired／unavailable recovery | Verified: five profile outcomes remain distinct; only typed insufficient-NP unavailability is non-blocking |
| UI writer and ranking → calculator handoff | Verified: current discriminated intent is written directly; detail renders canonical decisions |
| final four-policy × NP1–5 maximum／digest | Deferred: TSK-06.5; no new runtime semantics may be added there |

Runtime Blocking count: **0**. Cache lifetime／stale-response UI is `Deferred: TSK-07`; a general battle
simulator is `N/A: outside the bounded preparation product`.

Schema-legal fixtures cover slot 4, source effect／choice overflow, multiple choice groups, nested conditions,
exclusive branches with cost, mutation-retained／contribution-excluded actions, missing inputs, stochastic
failure, unsupported operations, unreachable profiles, and invalid／mixed portable snapshots. Calculator,
ranking, without-area, migration, reset, and replay use the same canonical application boundary.

The current master has 13,875 effects and 14,623 typed operations. TSK-06.4 counted 9,123 affected effect
occurrences and 9,124 legacy operations because one referenced wrapper expanded twice; the cutover preserves
that explained delta while removing the legacy variant. Preparation inventory is 6,360 generated, 3,949
deduplicated, and 3,438 terminal plans. Default ranking certifies and materializes 669 candidates, makes 668
damage requests, and has 631 distinct inputs. There are 433 static
AttackProfiles and 432 numeric rows: `2501400` NP1
is typed `unavailableUnderPolicy: insufficientNpGauge`, not a numeric fallback or sibling substitution.

IRL-003 remeasurement classifies 419 calculator scenarios as calculated and three as typed unsupported. The
three are exactly the production profiles where an unrepresentable HP／Battle Point mutation feeds a damage
dependency. Read-sensitive fixed star mutations now update the ordered canonical `criticalStars` state;
unread resource mutations retain a bounded-phase-irrelevant proof. Relative to TSK-06.4, master／preparation／
AttackProfile counts and the 4,096 cap are unchanged; the largest certified product rises from 2,880 to 3,840
because the previously hidden NP value dependencies are now enumerated. Default candidates rise from 576 to
668 (+16.0%) with a finite 668 certificate; this is the required missing-domain population, not unbounded
growth. Request and digest changes come from intrinsic
admission, NP dependency witnesses, resource fail-closed outcomes, and blocker diagnostics, not a new domain
dimension.

The re-review correction admits exactly one additional default candidate for Douman: 669 certified／generated／
deduplicated, 668 damage requests, and 631 distinct inputs. The 4,096 limit, 433 AttackProfiles, 432 numeric
rows, and three typed unsupported calculator profiles are unchanged. Ordered production-star transitions and
Douman's two intrinsic contributions explain application digest
`d9b41f224697dcd4addae97681492721b4a60d534192d11163bbaf4c48811695`; calculator execution parity is
`b67bc7d955dc487e610a6bb3d52ab0f816588641f1fe18cde268a6b4fcd1384b`.

Production digests are application `d9b41f224697dcd4addae97681492721b4a60d534192d11163bbaf4c48811695`
and pipeline `916403ecd681dc6b2c4655bd3c052bd8527db3eeac0d54dd1b1a2d18641c02e8`. The pre-cutover
production run was 38.47 s real. Post-cutover canonical-runner measurements were 38.01／40.24／38.74 s,
median 38.74 s: +0.27 s／+0.70%, within the 10% ratchet. Each run executed 24 files／113 tests; the first
completed its tests before reporting the then-stale runtime-counter contract, and the latter two passed the
updated contract. Final quality passed unit 380, production 113, and Playwright 25 with no skip, retry, warning,
or unexpected console; artifact `.test-results/2026-09-02T06-07-59-655Z-44-fc4f13`.

The IRL-001–005 review closure started from clean tracked HEAD `2977dffd`. Affected production runs
were 37.41／36.50／38.98 s, median 37.41 s versus the preceding canonical median 38.74 s
(-1.33 s／-3.43%); the finite-domain additions therefore introduce no unexplained regression.
Final re-review `pnpm quality` passed 402 unit tests, 114 production tests, and 25 Playwright tests
with zero skip／todo, retry, warning, or unexpected console. The retained parent artifact is
`.test-results/2026-09-04T13-13-54-906Z-15-6f35e3`.

Removal audit finds zero production legacy operation variants, operation-ID contribution projections,
independent 512-state caps, current old portable-intent writers, compatibility flags, adapters, or parallel
compilers. The schema-33 parser remains only as the exact approved migration boundary.

### Completion verification correction — legacy overcharge bypass

Confirmed mechanism: the first completion retained `CalculationPreparationOptions.preserveScenarioOvercharge`
and a runtime branch that could bypass the ordered NP resource transaction's derived base overcharge. No current
producer passed the option, so production inventory and damage digests were unchanged, but the public
schema-legal preparation path still represented the pre-policy compatibility model.

Implementation mismatch: the runtime and removal audit had converged all current callers without deleting the
obsolete override itself. Missed detection: the original legacy scan covered old operation／portable names but
not preparation-option fields, and parity fixtures exercised only the canonical default branch. Recurrence scope
is bounded to scenario preparation options that can override terminal resource or OC state. The minimum guardrail
is deletion of the option and branch, a focused NP2 fixture proving that 200% initial gauge produces executor-
derived base OC2, and a source scan for the removed symbol. After the correction this path is `Verified` and the
TSK-06.41 runtime Blocking count remains 0.

## TSK-06.4 independent design audit — authoritative current delta

This section supersedes both the pre-audit contribution-graph proposal below and the first planning-diff nested
action proposal. The rejected graph is retained only as review history; `transaction.consequences`,
`steps[].mutations`, `eligibility`, its type names, the B1〜B4 split, and its implementation boundary are not
implementation instructions.

### Fixed outcome and independently derived invariants

The user-visible result is one standard or theoretical-maximum NP damage value for one `AttackProfile`,
derived from one legal ordered preparation program. The following invariants follow from that outcome rather
than from the current proposal:

1. The two UI controls identify a ranking policy, but they are not two independent domain-state projections.
   Action admission depends on the pair, the selected action option, and the candidate-local path.
2. A skill use or NP use is the execution transaction boundary. Resource cost, selected branch, and every
   successfully applicable sibling mutation are staged and committed together. Condition-false or proc-failed
   siblings are normal non-applications, not transaction failures. Invalid, unsupported, or resource failure
   commits no part of that action. Policy exclusion of one damage contribution is not a rollback.
3. A branch is an exclusive action option. An ordered step evaluates activation, and its operation is a mutation,
   damage contribution, bounded-phase-irrelevant proof, or unsupported result. None is a second action boundary.
   Passive and intrinsic sources use an automatic source-program variant; they are not fake actions.
4. Structural necessity is an `AttackProfile × initial state × complete ordered path` role. It is never a
   static property of a skill or effect and is not inferred from a prefix without checking downstream reachability.
5. An action that establishes a condition remains executed when a downstream conditional damage contribution
   is excluded. The mutation and contribution therefore need separate canonical children under one action
   transaction.
6. Candidate construction enumerates legal action options and compatible world facts first. The executor
   evaluates every contribution in that one scenario, and selection compares final average damage after cost
   and downstream state. Effect-local maxima are never composed afterward.
7. Only candidates admitted into the canonical domain participate in profile dominance. Within that domain,
   `inputRequired`、`invalid`、or `unsupported` blocks a numeric maximum unless a planner-owned typed proof has
   already shown that exact candidate unavailable or duplicate.
8. Damage, ranking selection, row count, badge, detail, and portable replay consume one canonical application
   result. Presentation never re-evaluates requirements or contribution eligibility.
9. Portable identity stores the execution intent that changes the result; it does not infer it from scenario
   facts. Normal calculator intent and ranking policy are different union variants, not a third value on the
   ranking condition axis.
10. The preparation domain is explicitly bounded by the product. Active slots, action-option choice groups,
    ordered programs, and world dimensions have schema bounds whose complete product or sound dominance pruning
    is proven before execution. A cap is only a guardrail; it is not a completeness proof.

### Confirmed facts

| Fact | Evidence | Baseline classification |
| --- | --- | --- |
| `conditionalContribution` is compiled but not passed to contribution projection | `rankingComparisonPolicy.ts` emits it; `rankingCandidateSpace.ts` calls `compileDamageContributionProjection` with only `selfSkill` and `area` | HEAD defect, not introduced by the planning diff |
| Projection is operation-ID based | `DamageContributionProjection` contains included／excluded operation IDs and state-trait exceptions | HEAD fact |
| NP base and conditional special output share one `executeNpDamage` operation | `npDamageCompilation.ts` emits one operation; `npDamageOperation.ts` returns base and special multiplier arrays together | HEAD fact; operation exclusion cannot express the product outcome |
| Ranking profile result has three classes | `rankingContracts.ts` has calculated／unavailable／invalid; `rankingPolicyCalculation.ts` maps `inputRequired` to invalid | HEAD fact |
| Planner enumerates every ordered skill program before policy admission | `rankingStaticPreparation.ts` adds every available slot／choice command | HEAD fact |
| Planner recognizes only slots 1〜3 while schema permits 0〜20 | `skillCommands` uses `1 | 2 | 3`; `masterSkillSchema.slot` accepts 0〜20 | HEAD schema-legal completeness defect |
| Production currently has only slots 1〜3 | shared master inventory: slot 1 = 475, slot 2 = 475, slot 3 = 477, other = 0 | production-positive bound; not schema closure |
| Active skills, passives, and mystic-code skills share `MasterSkill` | `masterSkillSchema` owns the 0〜20 slot and is reused by all three populations | HEAD type-boundary fact; globally narrowing `MasterSkill.slot` is not a valid A2 fix |
| Choice count is not schema-bounded and planner models one selected group/candidate | `MasterSkill.effects` has no maximum; `skillCommands` emits one `choice` object and `selectedEffects` filters to that one pair | HEAD schema-legal completeness defect |
| Production player choice is smaller than the legal schema | maximum one group per servant skill and five candidates in the current master | production fact; not schema closure |
| Canonical action-safety information is incomplete | `nonDamage` has no typed consequence payload; 1,244／1,427 production skills contain at least one such operation | HEAD fact |
| Production contains represented tradeoffs | 7 skills have NP requirements; 38 skills have a fixed NP-loss effect; 14 skills have an unsupported NP-transition family | production fact |
| Current finite product is bounded only after program generation | cap 4,096 per profile; largest current satisfied product 2,880; baseline semantic product 7,255 and damage requests 6,913 | existing test inventory, not evidence for the proposed new dimensions |
| Portable ranking identity has one contribution field | schema 33 stores `standard | excludeVoluntarySkillModifiers`; portable execution recompiles only self／area projection | HEAD fact |
| Current reset preserves the resolved ranking scenario | `resetPortableCalculationRequest` calls the calculator constructor with the existing scenario | HEAD fact |
| Row, badge, and detail re-read effect projection | `rankingRows.ts` counts projection keys and tests `isSpecialAttack`; `RankingEffectDetails.tsx` rebuilds stacks from effects plus projection | HEAD fact; presentation is not yet derived from one canonical application result |
| Accepted ADRs at HEAD conflict with the current approved requirement | ADR-019 retains old NP-series/policy planning; ADR-027 resets the same scenario and has one ranking contribution intent | HEAD documentation-authority conflict; current documentation diff resolves it through accepted ADR-028 |

The `nonDamage` inventory includes action consequences that are visibly different for admission: production
contains `lossHpSafe` 22、`lossHpPerSafe` 1、`lossNp` 38、`lossStar` 5、and `subBattlePoint` 1 occurrences,
as well as gains and bounded-phase-irrelevant effects. Their raw function name may be used only by the pipeline
to produce typed canonical operations; application runtime cannot branch on those names.

The full master has 9,124 `nonDamage` operations from 9,123 effect occurrences. The design-time raw-family
classifier closes every occurrence as resource 1,164、state／field 5,213、typed unsupported 21、or
bounded-phase-irrelevant 2,725. One `addStateShort` occurrence currently emits two `nonDamage` operations.
There are zero unclassified raw families; implementation and the production ratchet are Deferred TSK-06.41.

| Design disposition | Raw producer families in current production |
| --- | --- |
| resource mutation | `gainNp`、`lossNp`、`gainStar`、`lossStar`、`gainHp`、`gainHpPer`、`lossHpSafe`、`lossHp`、`lossHpPerSafe`、`subBattlePoint` |
| state／field mutation | `addStateShort`、`addState`、`subState`、`moveState`、`extendBuffturn`、`shortenBuffcount`、`addStateShortToField`、`addStateToField` |
| typed unsupported | `gainNpBuffIndividualSum`、`gainHpFromTargets`、`gainNpFromTargets`、`gainNpIndividualSum`、`gainNpTargetSum`、`gainMultiplyNp`、`replaceMember`、`moveToLastSubmember` |
| bounded-phase-irrelevant | `hastenNpturn`、`none`、`friendPointUpDuplicate`、`userEquipExpUp`、`eventDropUp`、`expUp`、`delayNpturn`、`instantDeath`、`servantFriendshipUp`、`shortenSkill`、`eventDropRateUp`、`qpDropUp`、`enemyEncountCopyRateUp`、`forceInstantDeath`、`qpUp`、`displayBuffstring`、`cardReset`、`classDropUp`、`enemyEncountRateUp`、`eventPointUp`、`absorbNpturn`、`extendUserEquipSkill`、`fixCommandcard`、`friendPointUp` |

These names are audit evidence only. The pipeline maps them to typed payloads and proof codes; no downstream
runtime switch may consume this table or a raw family name.

The source inventory and chosen schema bounds are:

| Source | Production count／maximum | Approved schema |
| --- | --- | --- |
| active servant skill | 1,427; effects 23; player-choice groups 1; candidates 5; slots 1〜3 | effects ≤24、groups ≤1、candidates ≤5、slot `1 | 2 | 3` |
| passive | 1,253; effects 14; groups 0; current slot sentinel 0 | effects ≤16、groups 0、slot field absent |
| NP | 727; effects 17; groups 1; candidates 3 | effects ≤20、groups ≤1、candidates ≤3、slot field absent |
| craft essence | 2,700; effects 14; groups 0 | effects ≤16、groups 0、slot field absent |
| mystic-code skill | 84; effects 3; groups 0; slots 1〜3 | effects ≤4、groups ≤1、candidates ≤5、slot `1 | 2 | 3` |

The aggregate bound is not inferred from these local maxima. A valid `PreparedRankingContext` carries a complete
`AttackProfile × policy × NP level` domain certificate with an upper bound of at most 4,096. The current maximum
is 2,880, so the design does not relax a cap or timeout. A certificate overflow returns typed `unsupported`
before any partial maximum can be published.

### Inferences

- A global dependency graph would duplicate the already canonical ordered program, `ConditionExpression`,
  effect transaction grouping, and input definition key. Separate node／edge／read-point identities create a
  second representation that must remain synchronized. This is a two-owner risk, not required expressiveness.
- `safeDeterministic | conditionalTradeoff` is not a complete static skill classification. Safety belongs to a
  selected action option's complete consequences; effectiveness and structural necessity are candidate-local.
  A skill with unconditional and conditional siblings is the direct counterexample.
- Compiling contribution projection before action admission is cyclic: baseline action admission needs to know
  whether an unconditional contribution is effective for the selected `AttackProfile`, while input liveness and
  execution can only be compiled after the admitted action option is known.
- Deferring the action-consequence and slot inventories to TSK-06.5 would permit TSK-06.41 to implement an
  unproved domain model and then call the later mismatch “production closure”. This is an early completion gap.
- The portable schema must cut over with the result-changing runtime semantics. It can, however, use a smaller
  discriminated intent instead of a nominal `normalCalculator | baselineOnly | satisfiedCandidates` axis.
- The planning-diff `transaction.consequences` and `steps[].mutations` are two representations of the same
  resource／HP／state／form／field writes. Admission would read the summary while execution reads the ordered
  mutations, so correspondence becomes a new invariant. This is the same synchronization failure rejected for
  the dependency graph, introduced by the planning diff rather than HEAD runtime.
- The planning-diff `eligibility: intrinsic | unconditional | conditional` cannot replace the concrete
  applicability requirement, value expression, or lazy input read. Keeping both would be a synchronization
  field; keeping only the enum cannot replay NP special or HP-dependent contributions.
- `CanonicalActionOption` cannot be the outer node for passive contributions because passives have no command or
  action transaction. A source-program union is smaller than inventing a no-op action kind.
- The current 4,096 caps detect explosion but do not prove a maximum. Because choice groups and effect counts are
  schema-unbounded and the planner fails to form multi-group selections, finite-domain closure is a design input,
  not a TSK-06.5 performance-only check.
- `selfBuffs=excluded × conditionalEffects=satisfied` does not admit an optional skill that only establishes a
  condition for an attack-NP contribution. This is an application-policy decision, not something inferred from
  contribution origin. `structuralRequired` actions remain a separate AttackProfile/path-dependent case.

### Counterexamples

| State | Current／proposed failure | Required outcome | Status |
| --- | --- | --- | --- |
| schema-legal servant skill in slot 4 | current planner never emits the action | active-servant schema rejects it; passive has no slot field and mystic uses its own 1〜3 schema | Verified design A2; schema fixtures Deferred TSK-06.41 |
| one skill has two independent player-choice groups | current command stores one group/candidate and drops the other group's effects | producer rejects the artifact; supported action option has zero or one complete selected branch | Verified design A3; schema fixture Deferred TSK-06.41 |
| damage skill with an unconditional modifier plus HP／NP loss sibling | static “safe” from the modifier or “tradeoff” from one sibling loses the other fact | action option carries every ordered operation; baseline rejects disadvantage, satisfied may admit the fully represented transaction | Verified design A1; operation fixture Deferred TSK-06.41 |
| action summary says state mutation while ordered step omits it | planning-diff admission accepts an action that execution cannot apply | one ordered operation list is the only consequence owner; no summary/mutation correspondence exists | Verified design correction; fixture deferred to runtime task |
| passive contribution under `CanonicalActionOption` | passive has no legal preparation command or transaction boundary | use an automatic source-program variant with the same ordered steps | Verified design correction; fixture deferred |
| unconditional and conditional damage siblings in one safe action | whole-skill classification either loses the baseline modifier or leaks the conditional modifier | admit the action in baseline; include only the unconditional contribution | Verified design expectation; fixture deferred to runtime task |
| action grants target state used by a later special | contribution exclusion can accidentally remove the mutation or require a graph exception | commit the action／mutation; baseline excludes only the dependent damage contribution | Verified design expectation; fixture deferred |
| one NP operation with base and conditional special multiplier | operation-ID exclusion removes both or neither | base is an intrinsic contribution; special is a separate conditional contribution under the same attack action | Verified design expectation; fixture deferred |
| two exclusive branches with different NP loss | choosing the largest modifier can make the attack unreachable | execute each legal branch transaction and compare final average damage | Verified design expectation; fixture deferred |
| excluded-only contribution reads a missing input | precomputed input collection reports a false repair request | no input read unless the action precondition／retained mutation also consumes it | Verified design expectation; fixture deferred |
| retained mutation and excluded contribution share an input | dropping the contribution can incorrectly drop the mutation read | action step remains live and may return `inputRequired` | Verified design expectation; fixture deferred |
| optional skill only grants target state consumed by attack-NP special under self-excluded/satisfied | contribution-origin policy could incorrectly resurrect an action excluded by self policy | omit the optional action; retain only independently `structuralRequired` actions, then evaluate the attack-NP contribution under condition policy | Verified product decision; fixture Deferred TSK-06.41 |
| calculated candidate plus unsupported admitted branch | known number may not be the maximum | profile is unsupported; bounded diagnostics retain the blocker class | Verified design expectation; fixture deferred |
| identical scenario with baseline and satisfied ranking intents | current portable request collides | distinct request／fingerprint／replay identity | Verified design expectation; runtime deferred |
| ranking scenario reset while target／field／choice facts remain | `normalCalculator` would reactivate ranking assumptions | construct a fresh calculator baseline from explicit subject/build inputs | Verified design expectation; runtime deferred |
| schema permits enough choice/condition dimensions to exceed 4,096 | current code returns `candidateLimitExceeded` after construction | prepared-context certificate returns typed `unsupported` before publication; no partial numeric maximum | Verified design A3; certificate/oracle Deferred TSK-06.41 |

### Alternatives

| Alternative | Correctness | Complexity | Migration | Performance／test cost |
| --- | --- | --- | --- | --- |
| Preserve the proposed global contribution／dependency graph | Expressive if every duplicate identity and edge remains synchronized | Highest: graph nodes, uses, explicit read points, composition IDs, and parallel stage unions duplicate existing ordered IR | Largest schema and compiler cutover | More inventory dimensions and collision fixtures; candidate bound unchanged but compile／test cost rises |
| Keep operation-ID projection and add condition exceptions | Cannot split NP base／special or mixed sibling outputs; repeats the current structural defect | Low initially, unbounded exceptions later | Small but leaves parallel semantics | Cheap tests do not prove completeness; rejected |
| Preserve the planning-diff action transaction + consequence summary + nested effect/contribution | Represents action atomicity but duplicates every state consequence, lacks a passive outer node, and needs conditionality synchronization | Medium-high: summary-to-step correspondence and source exceptions become new invariants | Destructive IR replacement plus synchronization fixtures | Candidate bound remains unproved; test matrix grows across summary × step × contribution |
| **Discriminated action/automatic source program with one ordered step-operation list** | Directly represents action atomicity, passive sources, retained mutation, concrete contribution evaluation, lazy reads, and final-damage branch selection | Smallest closed model: no graph and no consequence summary; order supplies read points | One destructive IR/runtime/portable cutover after design closure | Reuses the reducer; bounded schema and oracle are required before a cap can be retained |

### Recommendation

Adopt the fourth alternative. The canonical model is a discriminated source program with one ordered operation
sequence, not a general dependency graph or an admission summary synchronized to an execution tree:

```ts
type CanonicalSourceProgram =
  | {
      kind: 'action';
      sourceId: CanonicalSourceId;
      actionOptionId: CanonicalActionOptionId;
      command: CanonicalPreparationCommand;
      preconditions: readonly CanonicalRequirement[];
      steps: readonly CanonicalExecutionStep[];
    }
  | {
      kind: 'automatic';
      sourceId: CanonicalSourceId;
      source: CanonicalAutomaticSourceKind;
      steps: readonly CanonicalExecutionStep[];
    };

interface CanonicalExecutionStep {
  stepId: CanonicalStepId;
  activation: CanonicalStepActivation;
  operations: readonly CanonicalStepOperation[];
}

interface CanonicalDamageContribution {
  contributionId: CanonicalContributionId;
  presentationGroupId: CanonicalEffectId | null;
  source: 'voluntarySkill' | 'passive' | 'attackNp';
  evaluation: CanonicalContributionEvaluation;
}
```

`CanonicalAutomaticSourceKind` is the closed non-command source union needed by the shared calculator executor,
including passive, intrinsic, craft-essence, support, and mystic-code sources. Ranking policy admits only the
bounded sources in its product; it does not shrink the common execution IR. `CanonicalStepOperation` is a closed
pipeline-owned union of resource／HP／state／form／field mutation, damage
contribution, `boundedPhaseIrrelevant` with a typed proof, and `unsupported`. Application derives admission from
the selected action option's ordered operations; it does not receive a pipeline-authored verdict or a separate
consequence summary. An unclassified operation is `unsupported`, never `outOfScope`.

Order supplies the read point: an action precondition is read before its transaction, step activation at that
step, and contribution evaluation only when the included contribution is reached. The evaluation owns its
concrete requirement, value expression, and input reads; conditionality is derived from those typed reads and is
not a parallel enum. Canonical input keys may be shared by multiple readers; no dependency node identity is
needed. The executor returns source/step/operation outcomes and one `EffectiveContributionSet`. Damage and
presentation consume that result without re-reading requirements.

Portable resolved intent becomes a discriminated union:

```ts
type ResolvedExecutionIntent =
  | { kind: 'calculator'; initialNpGauge: 10000 }
  | {
      kind: 'ranking';
      initialNpGauge: number;
      policy: { selfBuffs: 'included' | 'excluded'; conditionalEffects: 'baseline' | 'satisfied' };
    };
```

Manual remains a separate portable request variant. Ranking replay compiles admission and contribution policy
from the stored ranking policy; calculator execution includes every satisfied contribution in its explicit
scenario. No condition policy is inferred from world facts.

### Flow inventory and closure

| Path | Classification |
| --- | --- |
| raw source effect → canonical step operation | Verified design A1: closed operation union and all 9,123 raw effect occurrence dispositions recorded; runtime/ratchet Deferred TSK-06.41 |
| bounded active skill-slot domain | Verified design A2: source-specific schemas and 1〜3 active/mystic slots fixed; implementation Deferred TSK-06.41 |
| action option/choice and world domain | Verified design A3: at most one player-choice group plus complete prepared-context domain certificate ≤4,096; implementation/oracle Deferred TSK-06.41 |
| self-excluded/satisfied optional condition-enabler | Verified product decision: optional action is omitted; independently `structuralRequired` action is retained; fixture Deferred TSK-06.41 |
| source-program identity and action transaction | Verified design correction: action and automatic source are separate; action option is the atomic unit; runtime Deferred TSK-06.41 |
| candidate-local structural/effective role | Verified design: derived after AttackProfile and complete ordered path; runtime Deferred TSK-06.41 |
| step activation/operation/contribution evaluation | Verified design correction; no consequence summary or eligibility synchronization field; IR implementation Deferred TSK-06.41 |
| condition truth and nested composition | Verified: battle execution remains the sole evaluator; focused delta Deferred TSK-06.41 |
| policy admission → finite candidate domain | Verified design A3: admission precedes live dimensions and certificate sum; runtime Deferred TSK-06.41, production proof Deferred TSK-06.5 |
| ordered execution／rollback／lazy input recovery | Verified owner; new nested-result paths Deferred TSK-06.41 |
| effective contribution → damage／selection／row／badge／detail | Verified owner and derivation rule; implementation Deferred TSK-06.41 |
| five-class profile aggregation／bounded diagnostics | Verified design; implementation Deferred TSK-06.41 |
| portable request／fingerprint／draft／history／share／backup | Verified discriminated identity design; implementation Deferred TSK-06.41 |
| schema 33 intent-specific recovery | Verified: manual migrate, calculator deterministic current intent, ranking matching pair historical-only, ambiguous reject／snapshot discard; fixtures Deferred TSK-06.41 |
| true calculator reset | Verified design: fresh baseline constructor and atomic replacement; implementation Deferred TSK-06.41 |
| minimal Web handoff | Deferred TSK-06.41 because it is a direct schema writer |
| notice／interaction／cache／responsive／a11y | Deferred TSK-07 |
| accepted ADR authority | Verified: ADR-028 accepted; ADR-019／027 superseded and retained only as history |
| four-policy × NP1〜5 production maximum and performance | Deferred TSK-06.5; schema certificate and small exhaustive oracle strategy are fixed by A3 |

Current closure: `Blocking 0`. TSK-06.4 design is done and TSK-06.41 is ready after documentation validation.
No runtime path is Verified by this design audit; every implementation path remains explicitly Deferred.

### Planning delta

- Delete the global `DependencyNode／DependencyUse／readPoint` proposal and the four-owner B1〜B4 partition.
  The semantic families are now canonical source program, ranking application policy／outcome, and portable
  identity; execution remains their single shared evaluator.
- A1〜A3 are closed in the document-only TSK-06.4: production operation classification, source-specific schema
  bounds, and the complete candidate-domain certificate are implementation inputs, not TSK-06.5 cleanup. The
  optional condition-enabler decision remains closed by requirement 5.5.
- Do not create a separately completed runtime IR-preparation phase: keeping old behavior through a new IR would
  require an adapter or parallel compiler. Pipeline/master IR, all consumers, ranking policy, five-class outcome,
  portable schema, fingerprint, direct writers, and minimal handoff switch destructively in TSK-06.41. Internal
  commits may be ordered, but there is no phase-complete mixed runtime.
- ADR-028 is the accepted source-program／policy／portable decision; ADR-019／027 are superseded in the same
  documentation change.
- TSK-06.5 owns only exhaustive four-policy maximum, production parity, performance, and zero-legacy proof. A
  semantic mismatch found there reopens TSK-06.41; it is not patched in the audit layer.

## Rejected pre-audit proposal — non-normative review history

> TSK-06.4 reopened three semantic families owned by this note: B1 per-contribution ownership, B3 complete
> profile outcome／dominance, and B4 action admission. Portable identity／persistence／recovery remains the
> separate B2 family owned by `portable-calculation-identity-flow-tsk-06-1.md`. B1 and B2 share only the
> compiled typed projection interface; B4 consumes B1 results but never reclassifies them. Runtime paths
> remain `Deferred: TSK-06.41`／`TSK-06.5` until every design Blocking reaches 0.

### Former TSK-06.4 design reopening delta

> Historical design record: every disadvantage-free admission assertion in this section is superseded by the
> IRL-006 product correction at the top of this note. The retained architectural ownership and contribution
> projection decisions still apply.

### User-visible outcome and invariant

`baselineOnly` selects only safe deterministic voluntary actions with an unconditional effective
contribution, plus structural actions required to reach the AttackProfile. It preserves every legal ordered
mutation and evidence of those actions, but excludes damage contribution that depends on a conditional
requirement. A conditional-only voluntary action is not selected as a baseline no-op.

`satisfiedCandidates` extends that baseline with canonically represented conditional tradeoffs such as NP
consumption and with target／field／state／quantity／stochastic candidates. It does not add independent local
maxima: all included contributions must coexist in one legal ordered scenario, and an exclusive branch is
selected by final damage after costs and downstream state are applied.

This is the final product direction, not a compatibility target. `self included` admits only unconditional、
deterministic、disadvantage-free optional skills plus candidate-local structural actions. `condition satisfied`
then extends that same legal plan with compatible special attack、conditional contribution、field、and fully
represented costs such as NP consumption. Old operation-ID projection、parallel policy runtime、and adapters
must be deleted in the semantic cutover rather than retained beside the canonical model.

Damage, selected rank, effective logical effect count, and the special-attack badge derive from one effective
contribution set. Detail keeps the independent self／condition／area policy decisions, execution effects,
state, action, and evidence instead of filtering excluded effects. These outcomes are now governed by ranking
requirements 5〜7、10、11、17 and are the approved product target for TSK-06.4〜06.5.

### Confirmed mechanism and previous review gap

`compileRankingComparisonPolicy` emits `conditionalContribution: baselineOnly | satisfiedCandidates`,
but candidate materialization compiles `DamageContributionProjection` from only `selfSkill` and `area`.
The baseline condition currently limits generated world／input candidates and stochastic inputs; it does
not classify or remove a contribution whose condition becomes true through baseline facts or ordered
self mutation. `executeNpDamage` also contains base NP damage and conditional special multipliers in one
operation, so excluding every `npSpecial` operation would incorrectly remove the NP itself.

The original review proved candidate soundness, maximum completeness, and replay parity, but replayed the
same incomplete projection. It did not trace the conditional policy command through projection, damage
input, selection, row aggregation, detail, and badge, and it had no production assertion that baseline
conditional contamination was zero. The later shared projection refactor centralized source／area
classification but preserved the missing condition axis. This was a recurrence-scope gap in the earlier
review, not evidence that the approved conditional-contribution contract was complete.

Portable identity exposes a cross-family interface defect: current resolved ranking requests persist only
`standard | excludeVoluntarySkillModifiers`, while this family needs a compiled condition projection.
The portable flow note owns request identity, persistence, migration, and recovery; this note owns the typed
projection input consumed by execution. Neither family reclassifies the other's semantics.

Profile outcome aggregation is a third confirmed mechanism. `RankingProfileResult` currently exposes only
`calculated | unavailableUnderPolicy | invalid`; repairable `inputRequired` is converted to `invalid`, and
unsupported or incomplete candidates can collapse into no candidate. A lower calculated candidate must not
hide an unknown candidate that could change the maximum. This outcome closure belongs to TSK-06.4／06.41 because
per-contribution evaluation changes the candidate result population; it is not deferred to TSK-08.

Action admission is a fourth mechanism. The current planner can retain a conditional-only safe action in the
baseline candidate set, while the earlier proposal classified NP consumption as globally adverse. The first
produces policy no-op actions and unstable detail; the second removes a required conditional theoretical
candidate. B4 therefore separates static action semantics, policy admission, candidate-local reachability,
and contribution projection before implementation.

### Layer ownership

```text
data pipeline emits canonical dependency／contribution／action cost IR
battle execution evaluates dependency truth, resolved value, and execution outcome
calculation application compiles ActionAdmissionPlan and independent self／condition／area projection
ranking／portable／production audit call the same application compiler
battle execution consumes only the compiled typed projection
```

No application compiler interprets Atlas/raw vocabulary. Execution does not select a ranking policy, and
ranking／portable do not independently reclassify operation source, scope, requirement, or contribution.

### Canonical contribution and dependency design gate

Before implementation, one bounded contribution graph must replace operation-ID-only policy ownership.
Its population is policy-excludable damage contributions plus an NP base sentinel where one operation must
be split. Policy-invariant base ATK, class affinity, card constants, and equivalent base inputs remain
ordinary damage input and are inventoried as `N/A: policy invariant`; this Task does not create a general
provenance engine. Dependency identity is separate from consumer edges so one dependency can feed multiple
operations／mutations／contributions and one contribution can use multiple dependencies:

```ts
interface CanonicalDamageContribution {
  contributionId: CanonicalContributionId;
  sourceRef: CanonicalContributionSourceRef;
  operationId: string | null;
  presentationGroupId: CanonicalEffectIdentity | null;
  component: 'modifier' | 'modifierRate' | 'ignore' | 'npBase' | 'npSpecial';
  outputAddress: DamageContributionOutputAddress;
  composition: DamageContributionComposition;
  compositionIdentity: CanonicalCompositionIdentity;
  executionOrder: number;
}

interface DependencyNode {
  dependencyId: CanonicalDependencyId;
  expression: ContributionDependencyExpression;
  dependencyOrigin: DependencyOrigin;
}

interface DependencyUse {
  dependencyId: CanonicalDependencyId;
  consumer:
    | { kind: 'operation'; operationId: string }
    | { kind: 'mutation'; mutationId: CanonicalMutationId }
    | { kind: 'contribution'; contributionId: CanonicalContributionId };
  roles: NonEmptyReadonlyArray<
    | 'executionPrecondition'
    | 'retainedMutation'
    | 'contributionApplicability'
    | 'contributionValue'
  >;
  readPoint:
    | { kind: 'beforeOperation'; operationId: string }
    | { kind: 'afterOperation'; operationId: string }
    | { kind: 'beforeAttackNp' };
}

interface CanonicalContributionGraph {
  contributions: readonly CanonicalDamageContribution[];
  dependencies: readonly DependencyNode[];
  uses: readonly DependencyUse[];
}
```

`contributionId` distinguishes components inside one operation, especially NP base from each special
damage component. `dependency` is not an alias for `operation.condition`; its leaf origins cover
activation requirement, value dependency, stochastic dependency, resource dependency, world／state
dependency, and intrinsic／unconditional input. The audit population is every contribution reaching a
damage-input component plus every canonical dependency that changes its applicability or value.

Origin answers where a dependency comes from; an edge role answers why a consumer reads it; `readPoint`
answers which ordered state snapshot supplies its truth. The same expression before and after a mutation is
not merged merely because its syntax matches. One input may resolve multiple dependency nodes, one node may
have multiple role edges, and liveness is the union of every retained consumer.

Canonical IDs are emitted by the pipeline from typed source identity, component identity, and a canonical
source-local ordinal that is part of normalized IR—not the runtime array index, label, or iteration order.
The ID namespace and serialization version are explicit; synthetic NP base、split contribution、choice branch、
and cloned form variant identities have collision fixtures. `contributionId` is unique within one compiled
AttackProfile graph; `presentationGroupId` is a stable many-to-one logical effect identity; composition and
dependency identities have deterministic ordering and collision checks. Master-version changes may change an
ID only when one of its canonical inputs changes.

### Typed stage transitions

IR, policy, liveness, execution, and effective damage are separate discriminated stages rather than optional
fields on one evaluation object:

```text
CanonicalContributionGraph
  -> CompiledContributionProjection
  -> PotentialInputPlan
  -> ContributionExecutionResult
  -> EffectiveContributionSet
  -> DamageResolutionInput + RankingPresentation
```

- `CompiledContributionProjection` records independent `self`、`condition`、`areaView` decisions for every
  contribution. A contribution may be excluded on more than one axis; it has no resolved value or execution
  outcome.
- `PotentialInputPlan` contains only dependency reads reachable from admitted actions and included or retained
  consumers. It is a conservative execution plan, not an exact pre-execution truth result. Excluded-only
  value／applicability edges cannot appear live.
- `ContributionExecutionResult` is a union of applied, not-applicable false, unknown/input-required,
  execution-rejected, unsupported, and invalid outcomes. The ordered evaluator resolves actual reads at each
  `readPoint`, after short-circuit、selected branch、and prior mutation. Only an included, true, successfully
  executed contribution can carry a resolved value into `EffectiveContributionSet`.
- `EffectiveContributionSet` contains applied contribution IDs, resolved values, output addresses, and
  composition identities only. Damage／selection／row／badge consumers cannot inspect raw requirements to
  reclassify inclusion.

This makes unsupported-with-value, excluded-only-but-input-required, failed-but-effective, and
false-but-applied states unrepresentable rather than relying on consumer checks. Projection inclusion is
not itself effective application; execution may still produce a typed non-effective outcome.

### Projection-after-input liveness matrix

| Dependency role reached by an input | Contribution included | Contribution excluded | Required input outcome |
| --- | --- | --- | --- |
| execution precondition | yes／no | operation still executes | live／required |
| retained mutation | yes／no | mutation／state evidence remains | live／required |
| contribution applicability only | yes | evaluate applicability | live／required when no earlier canonical truth resolves it |
| contribution applicability only | no | no retained consumer | dead／must not emit `inputRequired` |
| contribution value only | yes | resolve effective value | live／required |
| contribution value only | no | no retained consumer | dead／must not emit `inputRequired` |
| execution／mutation plus excluded contribution value | mixed | retained consumer remains | live／required |

Potential input reachability is computed after policy projection and action admission but before execution.
Actual `inputRequired` is emitted only by ordered evaluation at the edge's `readPoint`; the planner does not
predict mutation-derived exact truth. Potential planning may suppress only reads whose entire consumer set is
excluded; it never disables an operation precondition or a retained mutation. `any(true, input-dependent)`、
unselected exclusive branches、and false applicability do not request value inputs that execution never reads.

Current-world evaluation and policy classification are separate results. Canonical simplification may
remove a branch only with a static proof; truth created by an ordered mutation does not make the
requirement unconditional.

`unknownTruth` means a supported leaf reads a fact that is not yet known and participates in three-valued
logic. `unsupportedSemantics` means the leaf itself cannot be interpreted and fails the whole expression
closed. `invalidExpression` means malformed canonical IR and remains distinct from engine support. A
well-formed but statically unsatisfiable expression is ordinary `false`. A tuple proven contradictory while
the planner constructs its canonical domain is not emitted and receives an unavailable disposition proof. A
contradictory user／schema state or a contradictory tuple emitted by the planner is `invalid`; the two are not
represented by the same reason.

| Composition | Result |
| --- | --- |
| `all(true, unknownTruth)` | `unknownTruth` |
| `any(true, unknownTruth)` | `true` |
| `not(unknownTruth)` | `unknownTruth` |
| any expression containing `unsupportedSemantics` | `unsupportedSemantics`; a true sibling does not reinterpret the leaf |
| well-formed but unsatisfiable expression | `false`／candidate unavailable |
| contradiction proven during canonical domain construction | not emitted／unavailable proof |
| contradictory user／schema state | invalid |
| malformed canonical expression | `invalidExpression` |
| planner emits a candidate outside its canonical domain | invariant violation／profile invalid |

### Contribution output and composition matrix

| Contribution family | Output address | Composition | Boundary／dependency |
| --- | --- | --- | --- |
| normal modifier | typed modifier bucket＋card qualifier | ordered additive fold after card applicability | activation and value dependencies are separate |
| modifier rate | typed rate bucket linked to its modifier family | maximum rate contribution, then multiply the completed base sum | cannot be projected as an independent additive modifier |
| ignore flag | typed damage-function boolean | boolean OR | execution and policy state remain per contribution |
| NP base sentinel | NP level multiplier slot | canonical base replace／selection | intrinsic and always included; exists only to split a mixed NP operation |
| NP special multiplier | typed NP special slot | canonical multiplier composition | special requirement and effective value are independent from NP base |
| HP／trait-count／Battle Point／rarity-derived NP value | declared NP value／multiplier slot | operation-defined typed composition | value dependency is classified even without `operation.condition` |

Any additional production output address or composition becomes Blocking until added here. A dependency
origin with zero production occurrences receives both a production `0` ratchet and a schema-legal focused
fixture; absence from current master data is not closure by itself.

### Profile outcome and dominance matrix

Candidate execution and profile results map to the same externally meaningful five classes without collapsing
repairability, semantic invalidity, or implementation support. Internally, omitted／deduplicated domain states
remain `CandidateDisposition`; they are not fake executed candidates:

| Candidate outcome | Meaning | Profile aggregation rule |
| --- | --- | --- |
| `calculated` | complete executable candidate with numeric damage | participates in maximum |
| `unavailableUnderPolicy` | candidate is canonically unreachable or disabled by the selected policy | never blocks another complete calculated candidate |
| `inputRequired` | executable semantics need repairable canonical user input | blocks numeric profile result unless the candidate is already unavailable by planner proof |
| `invalid` | contradictory user／schema state、malformed IR、planner invariant violation | blocks numeric profile result; never converted to unavailable |
| `unsupported` | canonical semantics exist but this engine cannot evaluate them completely | blocks numeric profile result unless the candidate is already unavailable by planner proof |

`RankingCandidateSpace` is the only disposition proof owner. It may omit or deduplicate a domain state only with one typed
`CandidateDispositionProof`: `staticallyUnsatisfiableRequirement`,
`contradictionProvenDuringDomainConstruction`, `noEffectiveContributionUnderPolicy`, or
`duplicateCanonicalState` with the retained state identity. A tuple outside the declared finite domain is
not a candidate; if the planner emits it, that is an invariant violation and profile invalid. No numeric
upper-bound heuristic, reachability
inference, or requirement evaluation may be added to the aggregator. An input-required or unsupported
candidate is therefore never ignored as “unable to beat the maximum”; it stays blocking until made
unavailable by one of those canonical planner proofs.

`unknownTruth` becomes `inputRequired` only when supported semantics lacks an explicit canonical user input.
Planner-generated target／field／state／quantity／stochastic witnesses are finite domain choices, not missing user
input. The blocker population is the admitted canonical candidate set; arbitrary tuples outside that domain do
not block the profile.

With at least one calculated candidate, only proven candidate-local unavailable is safely dominated. With no
calculated candidate and only unavailable candidates, the profile is unavailable. Any remaining input-required,
invalid, or unsupported candidate blocks a numeric profile result. When multiple blocking classes coexist,
profile status
uses `invalid > unsupported > inputRequired > unavailableUnderPolicy`; it retains every candidate-local blocker
as bounded typed evidence, so precedence controls presentation／recovery and does not erase diagnostics.
Diagnostics store class-level count, stable digest, and bounded representatives per class rather than every
candidate. `calculated` dominates only unavailable and otherwise yields to the highest blocking class. This
precedence is fixture-backed and never selected by candidate iteration order.

### Presentation matrix

| Surface | Canonical source | Policy-excluded contribution |
| --- | --- | --- |
| row effect count | distinct `presentationGroupId`／canonical logical effect identity among effective contributions | excluded groups are not counted; internal contribution split does not change the count |
| detail | all execution effects and contributions | retained with independent self／condition／areaView decisions |
| special-attack badge | effective special contribution set | absent when no special contribution remains effective |
| action／state／field／resource evidence | ordered execution record | always retained; policy exclusion is not execution failure |
| outcome notice | typed profile outcome plus policy state | distinguishes exclusion, input required, invalid, and unsupported |

Detail retains each policy axis independently; it does not choose a single exclusion reason when self and
condition both exclude the same contribution. `areaView` remains a detail counterfactual rather than a sixth
ranking condition.

`contributionId` is internal damage provenance and is never the user-facing count identity. Multiple output
buckets, modifier／rate pairs, stochastic minimum／success delta, or NP special components from one logical
effect share one `presentationGroupId`. The intrinsic NP base sentinel has `presentationGroupId: null` and is
never counted as an applied effect. This is a product contract, not a consequence of implementation shape.

### Reopened flow inventory

| Path | Current classification |
| --- | --- |
| canonical contribution／dependency IR design | Blocking B1／TSK-06.4: output population, origin, role, and liveness identity require approval |
| ranking condition policy producer | Verified: typed `baselineOnly | satisfiedCandidates` declaration exists |
| typed stage transition design | Blocking B1／TSK-06.4: IR／projection／liveness／execution／effective aggregation unions require approval |
| truth／semantic composition design | Blocking B1／TSK-06.4: three-valued truth, unsupported semantics, and invalid expression require typed approval |
| contribution output／composition design | Blocking B1／TSK-06.4: all output addresses and composition identities require inventory closure |
| presentation grouping design | Blocking B1／TSK-06.4: logical effect identity and NP base exclusion require product approval |
| portable compiled-projection interface | Blocking B1／TSK-06.4: interface with the separate portable family requires mutual approval |
| profile outcome／dominance design | Blocking B3／TSK-06.4: five classes, precedence, bounded diagnostics, and completeness proof require approval |
| action admission／relevance design | Blocking B4／TSK-06.4: structural、safe、conditional tradeoff、no-op proof、candidate reachability require approval |
| canonical producer implementation | Deferred: TSK-06.41 after design Blocking 0 |
| normal modifier／rate／ignore and NP base／special projection | Deferred: TSK-06.41 |
| ordered state／field／resource mutation and rollback | Deferred: TSK-06.41 |
| state-derived downstream contribution and input liveness | Deferred: TSK-06.41 |
| candidate selection／damage cache／profile aggregation | Deferred: TSK-06.41 |
| row／detail／special badge／outcome presentation | Deferred: TSK-06.41 |
| action admission implementation | Deferred: TSK-06.41 atomic semantic cutover |
| exhaustive production final maximum | Deferred: TSK-06.5 after TSK-06.41 |
| direct portable Web writer／minimal handoff parity | Deferred: TSK-06.41 as part of breaking schema cutover |
| TSK-07 notice／recovery interaction／cache and final audit | Deferred: TSK-07／TSK-08 after TSK-06.5 |

### State-by-path matrix

| Canonical state | Operation／mutation | Baseline projection | Satisfied projection | Selection／presentation | Status |
| --- | --- | --- | --- | --- | --- |
| `always`／intrinsic and NP base | apply normally | include | include | same effective set | Verified: requirement v0.9.1 |
| unconditional deterministic player choice | execute one selected exclusive branch | include | include | choose one legal maximum branch | Verified: requirement v0.9.1 |
| target／targetState conditional modifier | preserve grants and condition result | exclude contribution | include only with legal witness | damage／rank／badge follow projection | Verified: requirement v0.9.1 |
| field, including self-generated field | preserve field mutation | exclude dependent contribution | include in one legal field candidate | evidence remains even when contribution excluded | Verified: requirement v0.9.1 |
| HP／quantity／canonical input／resource gate | enforce live input and execution precondition | dead contribution-only input is not required | include legal maximum only | no fallback or precondition bypass | Blocking TSK-06.4: liveness approval |
| stochastic outcome | preserve minimum／failure semantics | exclude success-only damage contribution | include legal maximum outcome | effect reason remains stochastic, not policy-disabled | Verified: requirement v0.9.1 |
| conditional NP special multiplier | execute NP base damage | multiplier 1／conditional part excluded | legal multiplier included | special badge only when included | Verified: requirement v0.9.1 |
| activation input A＋value input B | separate dependency nodes／edges | A remains live for execution; B follows projection | both live when contribution included | no role collapse | Blocking TSK-06.4: graph／liveness approval |
| one input shared by included／excluded contributions | one dependency node, two consumer edges | live through included consumer only | live through both included consumers | no duplicate input or false suppression | Blocking TSK-06.4: graph／liveness approval |
| `all(true, unknownTruth)` | three-valued composition | unknown | unknown until resolved | no guessed witness／number | Blocking TSK-06.4: composition approval |
| `any(true, unknownTruth)` | three-valued composition | true | true | unknown branch does not hide true | Blocking TSK-06.4: composition approval |
| `not(unknownTruth)` | three-valued composition | unknown | unknown | no guessed negation | Blocking TSK-06.4: composition approval |
| `all(always, targetTrait)` | evaluate current truth separately | conditional | include only with legal target witness | preserve dependency explanation | Blocking TSK-06.4: classification approval |
| `any(always, targetTrait)` | statically simplify `always` branch | unconditional | unconditional | no external witness required | Blocking TSK-06.4: classification approval |
| `not(targetTrait present)` | evaluate explicit absence fact | conditional external-absence dependency | include only with legal negative witness | absence is evidence, not default inference | Blocking TSK-06.4: classification approval |
| `any(targetTraitA, targetTraitB)` | evaluate both branches canonically | conditional | include one sound satisfiable branch | no contradictory combined witness | Blocking TSK-06.4: classification approval |
| `all(T, not(T))` | well-formed static false | candidate unavailable | candidate unavailable | does not block another calculated candidate | Blocking TSK-06.4: classification approval |
| `any(unsupportedSemantics, always)` | semantic fail-closed | cannot produce numeric result | cannot produce numeric result | distinct from `unknownTruth` composition | Blocking TSK-06.4: classification approval |
| truth created by self mutation | preserve mutation and evaluate true | requirement remains conditional; exclude contribution | include contribution | execution truth and policy class stay distinct | Verified: requirement v0.9.1 |
| stochastic minimum＋success delta in one operation | execute one operation／outcome | retain minimum; exclude conditional delta | include legal outcome delta | one presentation group | Blocking TSK-06.4: graph／group approval |
| exclusive proc branches A／B target different buckets | preserve exclusive choice | include only baseline-effective branch outputs | include one legal maximum branch | never combine A＋B | Blocking TSK-06.4: graph／composition approval |
| modifier＋modifier rate share one condition | one dependency node, multiple consumer edges | both excluded together when conditional | both included when true | composition order remains typed | Blocking TSK-06.4: edge／composition approval |
| conditional ignore＋unconditional modifier in one effect | one presentation group, two contributions | keep modifier; exclude ignore | include legal ignore | row effect count remains one | Blocking TSK-06.4: split／group approval |
| excluded contribution input also feeds retained mutation | shared dependency with multiple role edges | input remains live | input remains live | no false `inputRequired` suppression | Blocking TSK-06.4: liveness approval |
| nested `false`＋`unknownTruth`＋`unsupportedSemantics` | separate truth and semantic status | canonical composition result | canonical composition result | no numeric fallback | Blocking TSK-06.4: composition approval |
| one logical effect split into multiple outputs | retain canonical effect identity | count effective group once | count effective group once | internal split does not change UI count | Blocking TSK-06.4: presentation approval |
| conditional-only safe skill | no baseline action | no candidate／no detail action | candidate only with legal witness | no policy no-op action | Verified: requirement v0.9.1; fixture Deferred TSK-06.41、production ratchet TSK-06.5 |
| unconditional＋conditional sibling | one safe transaction | action＋unconditional contribution | add legal conditional sibling | no partial transaction | Verified: requirement v0.9.1; fixture Deferred TSK-06.41、production ratchet TSK-06.5 |
| NP-consuming conditional tradeoff | not baseline-safe | no candidate | candidate only if attack NP remains reachable | cost is never discarded | Verified: requirement v0.9.1; fixture Deferred TSK-06.41、production ratchet TSK-06.5 |
| same trait expression before／after self mutation | two read points | pre-mutation truth | ordered post-mutation truth | syntax does not collapse time | Blocking B1／TSK-06.4 |
| self and condition both exclude one contribution | execute retained action／mutation | preserve both policy decisions | condition may include while self excludes | detail keeps both axes | Blocking B1／TSK-06.4 |

### Planning closure

- Verified: approved requirement already defines operation／state preservation, conditional contribution
  exclusion, effective-contribution-derived badge, and fail-closed execution preconditions. HEAD、main、
  merge-base are the same `45878789...`; the confirmed code mechanism predates this planning diff.
- Contribution execution／projection is B1, profile outcome／dominance is B3, and action admission is B4.
  Because B3 blocker population and input reachability depend on B4, TSK-06.41 performs one runtime semantic
  cutover for B1〜B4 and the portable B2 identity. TSK-06.5 adds no ranking semantics; it closes the exhaustive
  production maximum、four-policy inventory、performance、and legacy-removal proof.
- Portable identity is a separate B2 family and is not counted here. The shared compiled-projection interface
  must reach compatible approved types in both notes before either implementation starts.
- The breaking portable cutover includes every direct request reader／writer and minimal production Web
  handoff parity in TSK-06.41. TSK-07 retains presentation notice, recovery interaction, bounded cache,
  responsive, and accessibility closure. TSK-08 consumes the final TSK-06.5 inventory rather than producing a
  second semantic inventory.

The four proofs remain separate, but ownership follows the implementation order so eligibility does not
invalidate a just-closed maximum baseline:

| Proof | Minimum evidence | Current status |
| --- | --- | --- |
| focused candidate soundness | schema-legal action／branch／cost fixtures emit one legal ordered scenario | Deferred: TSK-06.41 |
| production candidate soundness | every emitted production candidate is one legal ordered scenario | Deferred: TSK-06.5 |
| per-contribution completeness | all policy-excludable outputs and live dependencies are represented exactly once | Deferred: TSK-06.41 |
| focused finite maximum oracle | small exhaustive schema-legal oracle matches the cutover planner | Deferred: TSK-06.41 |
| production maximum closure | four-policy × NP1〜5 inventory and representative exhaustive oracle detect missing candidates | Deferred: TSK-06.5 |
| portable／calculator execution parity | same typed request and projection reproduce damage, outcomes, and evidence | Deferred: TSK-06.41, then final regression in TSK-06.5 |

### TSK-06.4 eligibility design gate／TSK-06.41 atomic implementation boundary

TSK-06.4 approves static action semantics, policy admission, candidate-local reachability, branch atomicity,
and contribution projection before TSK-06.41 starts. TSK-06.41 implements B4 before potential input planning、
execution、and B3 aggregation inside the same atomic semantic cutover. Static semantics describe what an action is; the two ranking axes decide where it may be
admitted; ordered execution decides whether the concrete candidate remains reachable.

| Unit／mutation | Proposed classification | Atomicity／projection rule |
| --- | --- | --- |
| skill action | static `safeDeterministic | conditionalTradeoff | unsupported | outOfScope` | transaction全体を分類し、sibling operationを部分適用しない |
| AttackProfile到達role | candidate-local `structuralRequired | optional` | form、current state、ordered pathから導出し、static action kindへ固定しない |
| candidate-local action | `eligible | unreachable | unsupported` | initial resource、ordered path、AttackProfileを含めて評価する |
| canonical player-choice branch | branch-local static semantics and eligibility | 排他branchを一つの合法transactionとして選び、adverse siblingを落とさない |
| executed damage component | contribution projection | conditional siblingと独立に各dependencyを分類する |
| attacker HP decrease／NP consumption／typed detrimental state | `conditionalTradeoff` when fully represented | 成立込みでもcostをcommitし、attack NP到達不能は`unreachable` |
| stochastic／failure-capable transaction | `conditionalTradeoff` | 通常のみでは候補化せず、成立込みでも一つの合法outcomeだけを選ぶ |
| target debuff | safe or conditional by its requirement | damage contributionとしてB1 projectionへ渡す |
| conditional-only skill | policy no-op in baseline | 通常候補へ残さず、成立込みでだけ合法最大へ参加できる |
| unconditional＋conditional sibling | `safeDeterministic` action plus per-contribution projection | 通常は無条件寄与だけ、成立込みは合法なconditional siblingも含める |
| NP increase／beneficial state／trait grant／form transition | safe unless represented conditional cost exists | downstream state and livenessをordered executionで保持する |
| cooldownなどbounded preparation外 | `N/A: bounded phase外` | calculatorを一般battle simulatorへ拡張しない |
| 未解釈副作用 | `unsupported` | eligibleへ推測しない |

## Historical TSK-06 outcome and ownership

Every numeric value produced by the new ranking-policy API retains exactly one policy,
`AttackProfile`, ordered preparation program, start gauge, canonical input set, target candidate,
field candidate, quantity candidate, resolved scenario, and complete damage input. A candidate-space
error or an AttackProfile that cannot execute is never converted to baseline damage.

`RankingCandidateSpace` is the planning owner. It compiles finite domains from canonical master IR
before preparation runs. Battle execution remains the sole owner of ordered preparation, resource
preconditions, form transitions, overcharge, operation outcomes, and damage-input construction.
`calculateRankingPolicy` and the calculator use the same application facade and executor.

The old `RankingConditions` family is intentionally isolated through TSK-07. Its independent
`specialAttack` and `field` axes cannot be converted reversibly to
`RankingConditionalEffects`; therefore no legacy adapter exists. The worker/UI continue to use the
approved `ed88f1f8896354e31ae331b1d2302d765a2760e4` ranking family. New policy code is under
`rankingPolicyScenario`, `rankingPolicyCandidates`, `rankingPolicyCalculation`, and
`rankingPolicyMatrix`.

## Historical outcome classes before TSK-06.4 reopening

| Result | Meaning | Numeric value |
| --- | --- | --- |
| `calculated` | one complete candidate passed ordered preparation and canonical damage execution | yes |
| `unavailableUnderPolicy` | the requested AttackProfile exists but no candidate can execute | no |
| `invalid` | static semantics, canonical input, contradiction, or finite bound is invalid | no |

The legacy `RankingDetail` and new `RankingPolicyDetail` are distinct. Only the latter requires
candidate evidence. Execution rejection, missing input, and unsupported semantics remain typed and
are not passed to damage as guessed inputs.

## Flow inventory

| Path | Closure |
| --- | --- |
| policy producer | Verified: four self-buff × conditional-effect combinations compile to canonical commands |
| legacy producer | Verified: separate old family; non-reversible adapter removed |
| AttackProfile producer | Verified: policy-independent static inventory |
| preparation producer | Verified: finite initial form, ordered skill commands, optional transform NP, attack NP |
| preparation ordering | Verified: command sequence is part of state identity; equal slot sets in different orders remain distinct |
| semantic-domain producer | Verified: static conditions/input definitions only; no prepare/projection read during discovery |
| start gauge | Verified: baseline always present; satisfied policy adds legal capacities without overriding preconditions |
| TargetContext/field/quantity | Verified: finite canonical domains with baseline candidates and exclusive-fact constraints |
| complete product bound | Verified: checked before materialization, maximum production profile 2,880 / 4,096 |
| scenario materialization | Verified: every candidate starts from a fresh base scenario |
| ordered executor | Verified: TSK-05 transaction path; no ranking-side execution semantics |
| damage executor/cache | Verified: complete NP variant + damage input identity; calculator parity fixture passes |
| candidate selector | Verified: profile-local stable tie-break by damage, external facts, input deviation, actions/transitions, typed key |
| result writer | Verified: exhaustive calculated/unavailable/invalid profile result |
| recovery | Verified: another independently materialized candidate is tried; rejected prepared state is never mutated |
| legacy UI/worker/URL cutover | Deferred: TSK-07 |
| cross-level blueprint/cache optimization and full four-policy digest | Deferred: TSK-08 |
| support/CE/mystic-code/turn/refund expansion | N/A: outside the bounded TSK-06 policy |

## Canonical flow

```text
canonical master + AttackProfile + RankingComparisonPolicy
  -> static ordered PreparationProgram inventory
  -> static condition/input/resource domains
  -> full semantic product upper-bound check
  -> baseline + finite policy candidates
  -> fresh scenario materialization
  -> TSK-05 ordered preparation and canonical execution
  -> complete damage-input cache lookup
  -> AttackProfile-local stable selection
  -> calculated | unavailableUnderPolicy | invalid with one evidence trace
```

The NP1–NP5 correctness oracle is five complete `calculateRankingPolicy` calls. It does not rewrite
scenario/input NP level after execution and does not classify programs as partially reusable.
Optimization may cache only observable static blueprints or complete damage-input results in TSK-08.

## Counterexample matrix

| Counterexample | Classification |
| --- | --- |
| trait `present:true` / `present:false` | Verified: canonical evaluator completeness fixture |
| targetPredicate `present:true` / `present:false` | Verified: family-membership witness fixture |
| `target` / `targetState` positive, negative, and overlapping reads | Verified: physical read-scope closure fixture |
| traitCount `atLeast` / `atMost` / `equal` | Verified: target and field focused fixtures |
| provenance boundary by `trait` / `traitCount` variant | Verified: shared leaf-level source matrix across executor, audit, and planner axes |
| mixed ownership `any` / `all` / `not` | Verified: focused composition fixture and zero-production ratchet |
| nested `all` / `any` / `not` | Verified: canonical evaluator completeness fixture |
| exclusive traits: positive, negative, and mixed | Verified: candidate soundness fixture |
| self-generated trait before and after mutation | Verified: 405900 ordered target-state transition fixture |
| self buffs included/excluded with witness generation | Verified: four policy crossings and inventory fixtures |
| target traits with field, quantity, and canonical input | Verified: complete semantic-product materialization fixture |
| schema-legal conditions absent from production | Verified: focused traitCount/nested/exclusive fixtures |
| production 1102300 negative superGiant condition | Verified: NP1 average 88,558.08 and `powerMod` 0.5 |
| self buffs × conditional effects, all four crossings | Verified: focused policy fixture |
| external field absent/present | Verified: focused production fixture |
| self-generated field satisfies a later condition | Verified: focused production fixture |
| exclusive trait/class facts are not combined | Verified: finite-world fixtures |
| canonical-input-dependent form transition | Verified: schema-legal scenario fixture |
| ordered `S1 -> S2` and `S2 -> S1` with the same used slots | Verified: static program fixture |
| 505300 NP2–5 start gauge, terminal gauge, executor OC, and damage | Verified |
| rejected preparation does not become damage input | Verified: TSK-05 facade fixtures |
| one AttackProfile cannot substitute a sibling | Verified: full static inventory assertion |
| planner limit exceeded | Verified: typed `candidateLimitExceeded`, no numeric fallback |
| schema-legal unreachable profile | Verified: focused form-transition fixture returns `unavailableUnderPolicy` |
| exact tie | Verified: stable typed-key fixture |
| calculator/ranking scenario, effects, and result parity | Verified: all four policy fixture |
| UI presentation of new policy/evidence | Deferred: TSK-07 |

## Finite inventory

No effect inclusion is a dimension and no effect-subset `2^N` search remains. Domains are semantic:
ordered preparation program, start gauge, canonical inputs, target identity/facts, field facts, and
quantities. The complete per-profile product is checked before allocation.

Default new-policy production inventory:

| Counter | Value |
| --- | ---: |
| semantic upper bound | 7,255 |
| generated candidates | 7,255 |
| deduplicated candidates | 7,255 |
| damage request upper bound | 7,255 |
| damage requests | 6,913 |
| distinct damage inputs | 1,599 |
| cache hits | 5,314 |
| maximum one-profile product | 2,880 / 4,096 |

The ordered-program correction doubled the three-servant policy fixture from 24 to 48 baseline
candidates and from 208 to 404 satisfied candidates. Distinct damage inputs stayed 16/56 for included
and 4/14 for excluded; the extra legal orders therefore converge through the complete-input cache.
Production servant 2501400 also became calculated: its former unavailable result was a false negative
caused by unordered state deduplication.

The witness correction keeps the default baseline-policy inventory above unchanged. In the focused
three-servant satisfied-policy inventory, candidates increase from 404 to 1,056; included distinct
damage inputs increase from 56 to 104 and excluded from 14 to 26. The increase represents explicit
false/true physical target facts and the field all-absent state, not effect subsets. A production
audit checks 13,026 world-fact-only target condition occurrences across 205 servants/program paths and finds a
canonical true witness for every occurrence. The population includes 1,743 occurrences with
canonical default provenance, including 49 with a negative trait leaf.

## Structural findings and guardrails

### Fourth review reopening: nested ownership composition

Confirmed fact: the production audit recursively requires every leaf to be world-fact evaluable for
both `all` and `any`. The executor instead evaluates `any(effectLocal, worldTrue)` as true, while
`targetConditionWitnessSpace` retains the world branch axis and omits only the effect-local leaf.
The audit therefore excludes a schema-legal condition for which the planner can generate a true
witness. The same test-local `every` structure exists in parent `8393c5c`; current production has
zero mixed-ownership conditions, so the 13,026-condition inventory and ranking damage are unchanged.

Implementation mismatch: the leaf-level source matrix was presented as nested closure without
testing boolean composition. Missed detection: the added matrix covered only standalone leaves.
Recurrence scope: `any`, `all`, and `not` combinations of world-fact and effect-local leaves.
Minimum guardrail: name and document the production population as world-fact-only, cover mixed
ownership in focused fixtures, retain a world-true witness for `any`, and prove that `all` and
`not(effectLocal)` cannot be made true by fabricated world facts.

Resolution: the audit predicate is named and documented as world-fact-only rather than as general
witness eligibility. A focused schema-legal fixture proves that mixed `any` retains only the world
axis and has a canonical true witness, while mixed `all` and `not(effectLocal)` have no fabricated
true witness. The production gate separately ratchets mixed ownership at 0 conditions / 0 servants;
the world-fact-only population remains 13,026 conditions / 205 servants.

### Third review reopening: provenance variant ownership

Confirmed fact: `conditionTraitRequiresProvenanceDecision` accepts only a provenance value, so it
cannot own which `ConditionExpression` variants use provenance. The executor applies it only to
`trait`, while the production audit independently applies it to both `trait` and `traitCount`, and
`targetConditionWitnessSpace` enumerates both variants without consulting the classification.

Implementation mismatch: the exported value comparison was described as the executor-owned
provenance boundary even though union-variant applicability remained in each consumer. Missed
detection: the boundary fixture tested provenance values in isolation and did not cross executor
evaluation, audit eligibility, and witness-axis generation for every trait condition variant.
Recurrence scope: every new provenance-bearing leaf or consumer can choose a different applicability
set. Minimum guardrail: remove unsupported `traitCount.provenance`, expose a discriminated leaf-level
`worldFacts` / `effectLocalDecision` classification from battle-execution, and use it in the
executor, witness-space producer, and production audit with one schema-legal variant matrix.

Resolution: `ConditionExpression.traitCount` no longer exposes provenance because the canonical
pipeline has no provenance-aware count requirement. Battle-execution now accepts the whole
`trait | traitCount` leaf in `traitConditionEvaluationSource` and exhaustively returns `worldFacts`
or `effectLocalDecision`. The evaluator, `targetConditionWitnessSpace`, and production audit share
that classification. The variant matrix fixes absent/default/exceptional trait provenance and
provenance-free `traitCount`, including executor result, audit eligibility, and planner axes.

### Second review reopening: provenance audit population

Confirmed fact: the production completeness test admitted only traits with absent provenance, while
the executor also evaluates the canonical default provenance normally. This excluded 1,743
otherwise evaluable condition occurrences, including 49 `present:false` occurrences in the
recurrence family. The implementation already generates witnesses for the expanded population, but
the production gate did not retain that evidence. The guardrail is to export the executor-owned
provenance decision rule and use it directly when defining the audit population; test-local
provenance defaults are prohibited.

### Review reopening: incomplete condition witness space

Confirmed fact: `7159e27` changed `rankingWorld.ts` from enumerating both truth values for every
referenced target trait to deriving one value from the outer `not`, while ignoring the leaf
`present` value and the comparison/count of `traitCount`. It also treated a `target` trait as one
initial fact although the canonical evaluator reads both `target` and `targetState`. Consequently a
negative combined trait was left unknown or true after a state contribution, and a legal stronger
candidate could be absent. The production review fixture for 1102300 demonstrated this mechanism:
asserting `superGiant=false` in both physical scopes changes NP1 average from 80,857.34 to 88,558.08
and `powerMod` from 0.3 to 0.5.

Implementation mismatch: the planner partially reimplemented condition polarity instead of asking
battle-execution for the canonical read dimensions and validating witnesses with its evaluator.
Missed detection: parity tests replayed the selected candidate but did not compare the selected
maximum against the complete finite state space. Recurrence scope: target/targetState traits,
target predicates, `traitCount`, nested `all`/`any`/`not`, exclusive traits, and self-generated state
transitions. Minimum guardrail: separate candidate soundness, per-condition completeness, a small
exhaustive maximum oracle, and a production negative-condition damage fixture.

### Candidate discovery/execution cycle

The removed planner prepared a scenario to discover inputs/effects and then prepared again after
adding candidates. This was a procedural fixed-point search and its partial 4,096 checks did not
bound the total product. The guardrail is a static `RankingCandidateSpace` plus one whole-product
check before materialization.

### Non-reversible legacy adapter

Legacy `specialAttack` and `field` have four combinations, while one new conditional-effect axis
has two. Mapping either middle state to `satisfied` loses meaning. The adapter was removed; old and
new families remain separate until the UI cutover.

### Ordered-state deduplication

A state key based on a used-slot set collapsed different transaction orders. The state key now
contains the full command sequence. Semantic deduplication before execution is prohibited unless a
complete canonical state identity proves equivalence.

### Partial NP-level execution reuse

The removed matrix optimization executed NP5 candidates, rewrote scenario/input NP level, and
selectively reran candidates based on a ranking-owned sensitivity predicate. It recreated damage
semantics outside the executor. The canonical new-policy matrix is five complete executions;
blueprint-only caching is deferred.

### Executor-derived overcharge

The application previously rebuilt damage OC from persisted scenario OC and dropped the ordered
executor's terminal base OC. Calculator and new policy now use executor-derived OC. A scoped legacy
preparation option preserves the approved old ranking entrypoint only until TSK-07.

## Verification and performance

- Focused witness/policy/candidate/scenario diagnostics: 6 files / 55 tests passed.
- Unit: 60 files / 352 tests passed.
- Production: 27 files / 150 tests passed.
- Legacy production audit: 433 AttackProfiles/rows and damage cache 3,629 requests / 1,623 distinct,
  unchanged from the approved baseline.
- Ranking hot path after witness correction: 64.56s, 65.31s, 64.70s; median 64.70s versus the
  pre-correction median 60.91s (+3.79s / +6.22%, inside the 5s / 10% ratchet).
- Final production gate after registering the witness audit in the production suite: 80.16s,
  80.80s, 80.77s; median 80.77s versus the pre-correction median 75.50s (+5.27s / +6.98%). The
  measured increase includes 21 new production tests and remains below the 10% ratchet.
- Final `pnpm quality`: passed, including 64 executed E2E cases (32 project-filtered skips).

## Historical TSK-06 closure

- Verified: canonical witness generation, candidate soundness, per-condition completeness,
  exhaustive four-state maximum-damage oracle, selected-candidate calculator parity, production
  negative fixture, executor-shared leaf evaluation source, inventory, performance, ordered
  preparation, typed outcomes, and legacy isolation. The maximum-product record is consistently
  2,880 / 4,096.
- N/A: support/CE/mystic-code/turn/refund expansion.
- Deferred: TSK-07 UI/worker/URL cutover; TSK-08 cross-level blueprint caching and full four-policy
  production digest.
- Historical Blocking: 0 at the original TSK-06 review boundary. The TSK-06.4／06.41 reopening status at
  the top of this note supersedes this value for current work.

## TSK-06.41 accepted-review implementation delta (2026-09-05)

The PIR-001/PIR-002 implementation reopens only two producers and their direct consumers. Battle execution now
emits one typed `contributionId` on every contribution projection (`null` for non-contributions), evaluates
world-assumption projections against the final canonical battle state, and remains the owner of effective
contribution decisions. Ranking presentation joins by that exact identity and also requires the individual
projection's final applied outcome, so an effective NP base cannot satisfy an excluded NP special and a matching
trait-count projection cannot activate a nonmatching sibling even while both share the one aggregate NP-special
damage contribution. The application field materializer now distinguishes the inactive
`facts=[]` sentinel from an active fully assigned all-false witness and carries the latter as explicit false field
facts into the same ordered executor.

Changed flow inventory: projection compiler -> final-state projection evaluation -> effective contribution set ->
row/badge/detail; and finite field assignment -> scenario assertions -> condition evaluator -> modifier/NP input ->
final damage/maximum eligibility. Calculator, ranking, selected-scenario without-area replay, and ranking-origin
portable replay continue to use the existing application preparation and ordered execution paths; no alternate
compiler, persisted derived identity, servant branch, or fallback was added.

Counterexample closure: mixed NP base/special baseline and satisfied decisions, self-generated target-state
special, trait-count matching/nonmatching projections, field `present:false`, `not`, `traitCount atMost/equal`,
nested absence, inactive field sentinel, and selected-scenario personal/partyWide/partyOther separation are
focused fixtures. Production direct negative-field occurrence remains an explicit zero ratchet. Final four-policy
production maximum remains `Deferred: TSK-06.5`; cache/notice interaction remains `Deferred: TSK-07`; the changed
paths have no remaining `Blocking` classification pending the implementation verification recorded in the review
run.
