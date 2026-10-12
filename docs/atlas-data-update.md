# Atlas直接取得・自動追従・未対応監視の実装計画

設計確認日: 2026-10-12。対象revision: adafb00940ebc2ac4f691065c6c6545c4cd420bf。
直接取得・自動更新・定期監視は未実装。この文書は[アーキテクチャの設計要件](architecture.md#atlas直接取得と自動更新の設計要件)を実装へ接続する取得契約・責務・達成条件を定める。チェックポイントの状態と再現可能な証拠をここで管理する。

## 結論と成立条件

完成形は、Atlasが**抽出・検査に成功した一つのsourceを各GETの間固定し、自己完結したraw bundle**を一応答で返し、browserがそれを共通data-pipelineで検証して端末のactiveを原子的に切り替える形とする。公開APIで過去の版を選ぶ仕組み、表ごとの版指定、旧版の保持、世代manifestは要求しない。calculator/rankingと保存結果を区別するため、端末内では入力内容・変換器・規則のdigestを保持する。Actionsは別の全raw bundleから製品範囲外も監査し、停止は独立watchdogが検出する。製品から大きいmasterの配信を撤去し、固定回帰入力だけを開発用に残す。

最終ゴールは、**Atlas APIを唯一の大きいゲームデータ配信元とし、端末が最新の完成済み入力へ安全に自動追従すること**。FGO Labはraw語彙からcanonicalへの唯一の意味変換・検証、端末内activeの切替、監視と利用者への状態表示を所有する。新しいservant・礼装・既知係数の追加はアプリ再deployも自前masterの再配信もなく反映する。未知の意味を含む候補は拒否し、既存の互換activeと更新失敗を明示する。「Atlasで現在公開中の入力」と「最後に安全に受け入れた入力」をUI上でも区別する。

Actionsは端末更新の中央承認者にしない。scheduleは遅延・停止し得るため、各端末が同じ契約で候補を検証して切り替える。Actionsは端末より広い語彙を観測し、未知・未対応・監視障害を重複なく開発者へ届ける。小さい自前manifestを後から作ってAtlas応答のhashを並べても、元の応答が一世代だった証拠にはならないため、それを上流の完了通知の代用にしない。

データ面は**Atlasが公開する自己完結raw bundle API**を採る。変換済みniceを上流とFGO Labで二重に意味変換せず、FGO Labがraw→canonicalを唯一所有する。AtlasのGit treeはbundleの生成元を固定する材料だが、Git transportをbrowserの製品経路にしない。Atlasの現行DB/Redis APIや可変CDNの個別応答を一つの入力と推定しない。新APIの実装・公開・実応答検証を第一checkpointとし、上流の協力がなければ達成不能と記録する。自前mirrorやproxyに置き換えて完了扱いしない。

現行[Atlas OpenAPI](https://api.atlasacademy.io/openapi.json)にこのbundle APIはない。Atlas側の協力・公開までを完了条件とし、APIが未公開のままFGO Lab側の部品だけを完成と呼ばない。

### 利用者の振る舞いから決める受入境界

Atlas APIを製品の取得元とする。初回は取得・検証・保存が終わるまで計算可能なmasterを見せず、進行状況または再試行可能な失敗を示す。互換性を確認できるactiveが端末にある場合は先にそれでUIと計算を開き、更新を背景で調べる。更新候補に未知の意味、欠損、矛盾、生成元の不明点があれば切り替えず、activeの出典と更新失敗を明示する。上流取得失敗のたびに既存masterを消したり、自前配信先から補ったりしない。新候補は全入力の受入後に一回の保存transactionで切り替え、calculatorとrankingは同じidentityへ同時に移る。切替前の計算結果・共有結果は新しいmasterで計算したものとして扱わない。

この振る舞いに必要な保証を、候補内部の**意味・参照整合性**と、候補全入力の**生成元の整合性**に分ける。前者は共通validatorで確認できる。後者はAtlasがGETごとに一つの成功済みsourceを固定し、その表とcatalogだけから一応答を生成することで保証する。取得後にbytesへ自分でhashを付けても、`/info`の前後一致や個別ETagを照合しても生成元の整合性は証明できない。現行公開APIの複数応答だけを使う初回activationは安全と認定しない。

Atlas側の公開契約が決まる前に取得器・receiptの形を固定しない。調査用に固定したGit commitは上流APIの受入試験とNode/Worker比較の入力に使えるが、製品ブラウザーがGitから読む設計ではない。上流bundleの実応答・原子的公開・更新反例が揃ってから、FGO Labの入力・保存契約を確定する。

2026-10-12の追加調査で、AtlasのrawゲームデータGit repositoryにはimmutableなcommit/tree/blobがあることを確認した。一方、通常のGit APIは実ブラウザーでCORS拒否され、Git packのRange取得は専用clientの維持が要る。完成形でAtlasへ求めるのは、同じ成功済みsource treeから作ったraw表とcatalogを**一応答で**読む契約である。APIがraw bytesを返すなら、Atlasのnice変換器版を入力identityに含める必要はなくなる。FGO Lab側に必要なraw join・意味変換は一つの共通実装として作る。自前hash一覧、二回の同一取得、待機時間、infoの前後一致で上流の公開保証を埋めない。

## 現行経路と変更境界

| 現行の根拠 | 現行挙動・問題 | 変更する責務 |
| --- | --- | --- |
| [cli.ts](../packages/data-pipeline/src/cli.ts) | ローカルの4つのnice exportと固定referenced_skills/battle_pointsを読み、自前public/masterへ生成。versionは手動または日付 | Node専用I/OとAtlas raw取得・共通変換・検証を分離。製品配信へのnormalize出力を撤去 |
| [snapshotNormalization.ts](../packages/data-pipeline/src/snapshotNormalization.ts)、[atlasContract.ts](../packages/data-pipeline/src/atlasContract.ts) | nice形状をrawとして扱い、unknownを型assertionで解釈。配列検査以外の構造検査は限定的。ID重複のMap上書きや不正項目の除外がある | nice前提の入力契約を置き換え、Atlas raw表のjoin、厳格な構造検証、明示的な対象範囲、参照閉包、語彙分類を唯一の受入境界にする |
| [artifact.ts](../packages/data-pipeline/src/artifact.ts)、[targetTaxonomy.ts](../packages/data-pipeline/src/targetTaxonomy.ts) | node:crypto/Bufferへの依存。normalizationからartifactをimportする | 共通経路をTextEncoder/WebCrypto等のNode24・browser共通APIで動かす。Node専用監査のimport経路を分ける |
| [effectNormalization.ts](../packages/data-pipeline/src/effectNormalization.ts) | SkillIDや特定callbackのValueを参照IDと解釈して再帰変換。固定Mapが不足すると失敗。取得・循環検査はない | 同じ意味定義から依存を列挙し、重複取得を避けて解決。発見と実行で別の参照解釈を作らない |
| [affinities.ts](../packages/calc-core/src/affinities.ts)、[formula.ts](../packages/calc-core/src/formula.ts) | クラス補正・相性、属性相性、カード補正、0.23をコード内に保持。未知クラスを1で補う経路もある | 数値の正本をcanonical masterへ移す。applicationがmasterから数値入力を組み、calc-coreが演算する。未知値の中立補完を撤去 |
| [repository.ts](../apps/web/src/adapters/repository.ts) | 自前manifestをfetch。staging/master同一transactionの基礎はあるがstagingの大型記録が残る。active読取では保存時receiptとbytes/hashを確認し、旧cacheをclearする | Atlas取得receiptとactive保存契約を新設。master候補と利用者dataを分離し、旧・不正masterは利用拒否するが自動で全clearしない |
| [startup.ts](../apps/web/src/app/startup.ts)、[App.tsx](../apps/web/src/app/App.tsx) | 起動時だけmanifest確認。onlineイベントは表示更新のみ | 起動・online復帰・利用中確認を一つの更新coordinatorへ接続。互換activeがあれば先にUIを起動して候補を背景取得 |
| [useRanking.ts](../apps/web/src/features/ranking/useRanking.ts)、[rankingWorkerRuntime.ts](../apps/web/src/features/ranking/rankingWorkerRuntime.ts) | master/context変更時のWorker再作成と旧reply拒否を備える。Workerはcanonical master受取後の計算のみ | 既存の版・request境界を活用し、active切替時のUI、calculator保存guard、ranking detail/handoffも一緒に無効化 |
| [portableCalculation.ts](../packages/calculation-application/src/portableCalculation.ts)、[shareValidation.ts](../apps/web/src/adapters/shareValidation.ts) | master/engineが違う保存結果はhistoricalOnly。request/resultの版矛盾は拒否 | 既存の過去結果表示契約を保持。新masterの結果への無言の置換をしない |
| [sw.js](../apps/web/public/sw.js) | 全GETを横断cacheし、失敗時にrequest cacheまたはshellを返す | 同一originの明示的なshell/assetsだけを扱う。Atlas構造化入力をcache・shell代替の対象から除外 |
| [atlasInventory.ts](../packages/data-pipeline/src/atlasInventory.ts)、[productionAudit.ts](../packages/data-pipeline/src/productionAudit.ts) | 前者はdamageNp接頭辞だけ。後者は正規化後で、捨てられた入力・新fieldを復元できない | raw全入力・schema/enum catalogを先に観測し、正規化結果と受入不能を別途監査 |
| [ci.yml](../.github/workflows/ci.yml) | PR/push/manualのquality:ciだけ。全.test-resultsを14日保持 | 独立した軽量monitor workflowを追加。既存CI全qualityを毎回実行しない |

rawの意味はdata-pipeline、scenarioはcalculation-application、順序付き状態遷移はbattle-execution、数値演算はcalc-coreのままにする。UIやWorkerへキャラクター固有解釈を移さない。

## 上流入力の調査と現在の不足

2026-10-12のHTTP read-only確認:

- `/info`のJPはhash=5d3cbc、timestamp=1791730860。
- `/export/JP/info.json`は同じJP hashのほかserverHash=35cadc、dataVer=2681等を持つ。入力ごとのdigest、snapshot manifest、immutable URL一覧は含まれない。
- `/openapi.json`が申告するAPI版は6.0.0、serverHashは35cadc。上流GitHubで解決したcommitは35cadc444e20c78cc60e56082ad1b64607d4d2e2。現master a937bbb0f7eced10f45f57568786da10d9994027も同じ問題を持つ。
- 上流[app/tasks.py](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L99)は各exportを既存pathへ個別に書く。[generate_exports](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L547)は定数、各export、servant/equipを順番に生成し、FGO Labが使う既定言語exportより後でinfoを更新する。ただしinfo更新後も別のexport生成が続く。公開コードからは全体のatomic publicationを確認できない。実CDNの運用までコードだけで断定しない。
- 稼働中のserverHashに一致する同revisionの[load_and_export](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L857)では、DBとRedisの読込み後、`update_master_repo_info`が`/info`用のRedis版を**export生成前**に更新する。読込み中の例外を記録しても後段のexport生成へ進み、export生成中の例外も記録して戻る。したがって`/info`の新版は完了通知ではない。例としてraw repository更新後にDB読込みが失敗すると、新rawから作る係数と旧DBから作るservantが混在し得る。これは公開コードから導く失敗経路であり、実運用で発生したとの主張ではない。[旧/新の`/info`一致](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/main.py#L321)だけで混在を否定できない理由になる。
- [DB import](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/db/load.py#L554)はtable groupごとのtransaction、[Redis import](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/redis/load.py#L22)はkeyごとのdelete/writeで進む。失敗時に全DB/Redisを一括rollbackする構造ではない。このため自己完結bundleを新設するなら、読込み成功後の一貫した生成元から作り、失敗時は現在公開中の完成応答を維持する必要がある。並行更新を排除する運用・実装契約も確認する。
- 実OpenAPIの`/nice/{region}/skill/{skill_id}`の引数はregion、skill_id、reverse、reverseData、langであり、snapshot/commit指定はない。[routerの一次資料](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/routers/nice.py)。
- このskill routeは現在のDBから応答し、server側cacheは通常7日で、更新処理がexport前後でcacheを消す。cache消去は静的exportと一つの公開transactionではない。[skillの取得処理](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/core/nice/nice.py#L174)、[cache設定](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/main.py#L280)、[消去順](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L876)。
- HEADで各exportにCORS `Access-Control-Allow-Origin: *`、ETag、Last-Modifiedを確認。ただしETagをbrowserへ公開するExpose-Headersは確認できなかった。ヘッダーとCORSの実利用はbrowserで改めて検証する。ETagは単一資源の再取得抑制にしか使わない。
- 実応答の`Cache-Control: no-cache`は個々のURLの再検証を促すが、公開完了や全入力の同一generationを示さない。`/info`はexportより早く変わり得るため、そのhashだけで大型GET・正規化を省略すると新旧混在や未完了を見逃す。現行公開APIで要求する「小さい確認だけで安全に未変更と判定する」契約も未確認である。
- Atlasの[rawデータGit repository](https://git.atlasacademy.io/atlasacademy/fgo-game-data)のJP HEADは`5d3cbcc79ebcea42ec99dbecd5279e6e64effa3c`で、`/info`の短いhashと一致する。このcommitからroot tree `9ef4ebf08375bfdb974ed6e60ccf2aaa691f9b5d`、master tree `379b2ca7ccfed7a9062e82b91773c0a8a9d6803c`、各raw tableのblob SHAをたどれる。Git object IDはraw bytesを同じtreeへ束縛するが、抽出元の論理整合や成功までは証明しない。nice export・API追加参照・API変換器版もこのtreeには含まれない。
- [同master tree API](https://git.atlasacademy.io/api/v1/repos/atlasacademy/fgo-game-data/git/trees/379b2ca7ccfed7a9062e82b91773c0a8a9d6803c?recursive=true)の一覧は441 JSON blob・identity合計316,029,261 bytes。Atlasの`get_servant_entity`、skill/NP helper、魔術礼装、素材、係数候補を広めに集めると、buff補助を含め73表・identity合計165,330,506 bytesになり、ここには現製品が使わないvoice・AI等も含む。これは必要量の確定値でも圧縮wire bytesでもない。rootの`gamedatatop.json`（17,348,899 bytes）・`AssetStorage.txt`（2,117,001 bytes）も別に存在する。Atlasのraw entity組立が読む`mstSvtExtra`はこのmaster treeに見つからない。これらのサイズと存在はGit tree APIのread-only応答に基づく。
- 現製品がcanonicalへ使うfieldを[正規化器](../packages/data-pipeline/src/snapshotNormalization.ts)から逆引きすると、servant/CEのID・名前・成長値・顔、skill/NPと効果、素材、MC、BP、クラス/属性/カード/係数が主経路である。これに対応するraw表を43表へ絞った場合、当該treeのidentity合計は66,046,567 bytes。`mstAttriRelation`は属性相性の直接入力、`mstClass`はクラス倍率、`mstCard`はカード倍率、`mstConstant`は基礎係数である。上流の[buff補助生成](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/data/buff.py#L8)は`mstClassRelationOverwrite`と`mstBuffConvert`も読む。現ローカルnice servantのbuff scriptには前者由来の`relationId`が9件、後者由来の`convert`が3件あり、raw経路ではこれらを黙って失わない。43表にはcanonicalで直接使わない既知の監視対象も含む。新しいraw field・参照edgeが生じた場合の自動受入を保証する固定リストではない。

| 候補群 | raw表（同commitのmaster tree） | identity bytes |
| --- | --- | ---: |
| ID・成長 | `mstSvt`, `mstSvtLimit`, `mstSvtExp`, `mstSvtLimitAdd`, `mstSvtIndividuality` | 15,271,465 |
| skill・effect | `mstSvtSkill`, `mstSvtPassiveSkill`, `mstSvtAppendPassiveSkill`, `mstSkill`, `mstSkillLv`, `mstSkillDetail`, `mstSkillAdd`, `mstSkillGroup`, `mstSkillGroupOverwrite`, `mstSkillIndividuality`, `mstSvtSkillRelease`, `mstFunc`, `mstFuncGroup`, `mstBuff`, `mstCommonRelease` | 39,521,407 |
| NP | `mstSvtTreasureDevice`, `mstSvtTreasureDeviceRelease`, `mstTreasureDevice`, `mstTreasureDeviceLv`, `mstTreasureDeviceDetail`, `mstSvtOverwrite` | 8,113,205 |
| MC補助 | `mstEquip`, `mstEquipExp`, `mstEquipSkill` | 48,521 |
| 素材・BP | `mstCombineLimit`, `mstCombineSkill`, `mstCombineAppendPassiveSkill`, `mstItem`, `mstBattlePoint`, `mstBattlePointPhase`, `mstSvtBattlePoint` | 2,603,285 |
| 係数 | `mstClass`, `mstClassRelation`, `mstAttriRelation`, `mstCard`, `mstConstant` | 209,172 |
| buff補助 | `mstClassRelationOverwrite`, `mstBuffConvert` | 279,512 |

### 固定raw commitで確認したjoinと意味の対応

JP commit `5d3cbcc79ebcea42ec99dbecd5279e6e64effa3c`の43表を同じGit treeから読んだ。調査用のpartial cloneを使ったので、これはAtlas製品APIの公開成功・CORS・保持期間の証拠ではない。現行[正規化器](../packages/data-pipeline/src/snapshotNormalization.ts)が採る`collectionNo > 0`かつtypeがnormal/heroineのraw 470 servant、typeがservantEquipの2,706 CE、`mstEquip`の28 MCを起点に、上流の[skill join](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/db/helpers/skill.py#L27)・[NP join](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/db/helpers/td.py#L19)に従って調べた。手元の旧nice入力との差は通常servant ID `705400`とCE ID `9312570`, `9409490`〜`9409530`の計7件で、将来の無コード更新検証に使える。

| canonical用途 | 固定rawで確認した結合・値 | 実装で保持する検査 |
| --- | --- | --- |
| servant/CE・成長 | `mstSvt.id`→`mstSvtLimit.svtId`、`mstSvt.expType`→`mstSvtExp.type`。最高limitのbase/maxと`curve/1000`によるHP/ATK成長は旧niceの485 servantと2,700 CE、計6,370配列と全件一致 | `(svtId,limitCount)`と`(type,lv)`の一意性、必要levelの連続性、上限・計算丸め。旧fixtureと新版rawを一世代と見なさない |
| skill/NP/MC | servant/CEの`mstSvtSkill.skillId`、passiveの`mstSvt.classPassive`、MCの`mstEquipSkill.skillId`→`mstSkill.id`→`mstSkillLv.skillId`→同じ位置の`funcId`/`svals`→`mstFunc.id`→意味に応じた`mstBuff.id`。NPは`mstSvtTreasureDevice.treasureDeviceId`→`mstTreasureDeviceLv.treaureDeviceId`、releaseは`(svtId,num,priority)`で結合 | 位置・level・priority・releaseの保持、重複key/長さ不一致の拒否、raw数値enumと位置付き値の厳格解釈 |
| 追加参照 | 広めのrootから直接skill 7,316 ID、既知の`SkillID`とcallback buff type 160/203の`Value`から追加25 IDを発見し、同一表内で全件解決。残りの固定28参照の3 IDはrootに既存。NPを含む738 TD、2,682 function、1,066 buff、`DependFuncId*`から10 functionも同じ43表に存在 | 値をIDと解釈する条件をregistryで一元化し、参照元・位置・levelのedgeを記録。未知の参照形、欠落、循環は拒否。これらの件数は調査用走査であり共通変換器の成功証拠ではない |
| 素材・BP | `mstItem`のuse区分はraw fieldでなく[上流item生成](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/data/item.py#L21)が全`mstCombineLimit`/`Skill`/`AppendPassiveSkill`から導出する。旧niceの採用152素材IDと固定rawの導出集合は一致。BP 2 IDは`mstBattlePoint`/`Phase`/`mstSvtBattlePoint`で閉じる | 素材IDと個数、BP位相・資格の検査。Mashの`combineLimitId=800100`に対応する行は無いが、上流も空の昇段素材として扱う明示的な省略であり、一般的な欠損許容へ広げない |
| 数値規則 | `mstClass.attackRate`と`mstClassRelation(atkClass,defClass)`は既存17クラスの全289組で現行値と一致。`mstAttriRelation`の5×5、`mstCard(id, num=1)`のArts/Buster/Quick 1000/1500/800、`mstConstant.ATTACK_RATE=230`も一致 | class/attribute/cardの数値ID→意味名は同一bundleのcatalogで定義。既知classの値変更はmaster更新で追従し、新class/cardの意味は未知として拒否 |

level配列は固定rawの`mstSkillLv` 47,647行で`funcId`と`svals`、`mstTreasureDeviceLv` 9,232行で`funcId`と`svals`〜`svals5`がすべて同長だった。代表的な17表の主keyにも重複は無かった。変換器はこの観測を既定値にせず、毎世代で再検査する。trait名、class名、function/buff/target/condition/cardの数値enum、`FUNC_VALS_NOT_BUFF`はraw表のfieldだけからは復元できず、上流[enum定義](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/schemas/gameenums.py)と[trait定義](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/schemas/enums.py#L1127)に相当する**同一bundleのcatalog**が必須である。

この固定世代では既知のjoinと追加参照に43表内の未解決IDは無かった。ただしraw script・位置付きparameterの**全ての未知の意味**を調査用走査で解釈したわけではない。実装の共通registry/parserで全fieldを分類し、NodeとWorkerの生成結果を照合して初めて受入閉包と認定する。新しい参照形式や表が現れた世代は拒否し、Actionsの監視へ根拠を渡す。

- 画像については、現製品の`imageKey`がservant初期顔、CE顔、MC・素材・skillのアイコンURLを使う。[Atlasの画像URL生成](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/core/nice/svt/asset.py#L77)と[URL規則](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/schemas/nice.py#L111)では現在の主要画像をrawのIDと定型pathから組み立てる。現masterのservant・CE・MC・素材の各1例はAtlas staticでHEAD 200とCORS `*`を確認した。現UIが使う初期顔には`mstSvtExtra`を使わず、同表のniceでの用途はbond/Valentine情報と一部costume IDである。現UIの画像URL生成だけならrootの大型asset catalogを必須入力とする根拠は見つからない。画像URL規則と取得baseは変換器版で固定し、新画像の存在は実UIで検査する。
- 実ChromiumからGitea `/api/v1/repos/.../branches/JP`、`/git/blobs/{sha}`、`/raw/master/...?...`をfetchすると、`Access-Control-Allow-Origin: *, *`という重複値でCORS拒否される。Pythonで各応答に二つの同名headerがあることも確認した。これはbrowserのfetch設定で解消できない。
- GiteaのGit HTTP `/objects/{sha}`と`/objects/pack/*.idx`はbrowserからCORSで読めるが、必要なblobの多くはpack内にある。`git-upload-pack`のPOSTはbrowserでpreflightが400となり、simple requestは本体が400となる。packのRange GETは206で成功する。`mstBattlePoint.json`の203-byte rangeから335-byte blobを復号し、Git blob SHAと一致することまで検証した。現公開packの最大は32,733,824,054 bytes、index総計は7,254,320 bytes。必要な現在blobの例`mstFunc`（6,567,712 bytes）、`mstSvtLimit`（9,184,397 bytes）、`mstSvtSkill`（1,932,755 bytes）はpack中の通常blobと確認した。pack全体の転送が必須だとは主張しない。rawをAPIで版指定配信すればbrowserのGit pack解析は不要になるが、raw joinと意味変換はFGO Labが所有する。
- Git HTTP経路を将来採るなら、commitが参照する全blobを必要期間取得できる保持契約と、pack再編成時にindexを取り直しても同じGit object IDで再検証できる実証が要る。現在の一commitでの成功を旧commitの長期提供保証とはしない。
- 小さい`NiceClass.json`を`?hash={JPのfull commit}`と`?hash=definitely-invalid`でもGETした。双方とも版指定なしと同じ30,970 bytes・SHA-256・ETagを返した。このqueryは版指定として機能しない。固定入力の`referenced_skills.json`には28件あり、例の`/nice/JP/skill/961313`は取得できるが版を指定できない。実GETの応答は1,634 bytesで、本文にgeneration/版のfieldがなく、ETag・Last-Modifiedもない。HEADは405だった。
- ローカル固定入力の28件のreferenced skill IDは、`nice_servant`・`nice_equip`・`nice_mystic_code`のfunctionを持つ埋込みskill ID集合には**一件も含まれない**。単にbulk export内を探すだけでは現在の追加参照すら閉じない。現行OpenAPI 109 pathにはsnapshot/version/manifest/exportのrouteがなく、skillの版指定入力もない。これは公開APIで必要な追加参照の取得方法を上流へ確認すべき理由であり、将来の追加参照方式も固定28件から推定しない。
- この28件を固定JP raw commit `5d3cbcc79ebcea42ec99dbecd5279e6e64effa3c`で追跡した。`mstSkill`には28件すべて、同じcommitの`mstSkillLv`には対応する64行、`mstFunc`にはそこから直接参照する24 function IDがすべて存在した。Git blob SHAはそれぞれ`4e2167b4f17dc6842808306186cdd6bdd890a027`、`74dbf2e0b6e6f7e3e0d4207fc0ac665d1ec9613d`、`59a7c9687a94f6d416974023809f2cf238b0f8bc`と照合した。これは**固定fixtureの第一段の参照**が同じGit treeにあるという証拠であり、全servant/CEからの発見、function値内の再帰参照、buff等へのjoinの閉包や、製品browserのAPI取得保証ではない。
- `mstSkillLv`は12,112,638 bytesで、Gitea blob/contents APIはメタ情報のみ返し本文を返さなかったため、調査ではJP branchのpartial cloneから同commitのblobを読んだ。可変raw CDNの同名ファイルは2,777,245 bytes・16,881行で、この28件に対応するskill IDは3件だけだった。固定Git blobは47,647行であり、可変CDNをこのcommitの欠けた表の代用にできない。Git経由の取得は調査手段であって製品経路ではない。
- Atlasのraw配信`https://assets.atlasacademy.io/GameData/JP/master/mstSkill.json`もGETでき、2026-10-12の確認ではCORS `*`、1,163,559 bytes、7,107行だった。`mstConstant.json`・`mstSvt.json`も読める。しかし確認したURLは可変の現在値、`Cache-Control: max-age=86400`で、同じbaseの`files.txt`・`gamedatatop.json`は404。版付きraw URLまたは完成manifestは見つからず、現在のCDNを世代固定raw APIと同一視できない。
- 同じ日に[可変raw CDNの`mstClass.json`](https://static.atlasacademy.io/JP/master/mstClass.json)を取得すると38行・7,965 bytesだったが、[JP full commitの`mstClass` blob](https://git.atlasacademy.io/api/v1/repos/atlasacademy/fgo-game-data/git/blobs/1520cbee600fd3649b6137ca5ae55759f1340c50)は84行・27,684 bytesで、CDN側にないIDが46件あった。共通IDの行にもGit側だけのfieldがある。URLが返す本文をGitの当該commitのblobと見なせない**実例**であり、原因やCDN全体の状態はこの比較だけで断定しない。`mstCard`等の小表もbytes/blob SHAが一致しなかった。固定commitの表ごとのdigest照合が必要である。
- Atlas APIの[現行server実装](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/main.py)は429で`Retry-After`を返し、多数の小さいAPI呼出よりexportを推奨している。追加参照の参照閉包では並列上限・重複排除・Retry-After尊重が上流負荷の条件となる。Atlasが[公表するデータライセンス](https://atlasacademy.io/about-us/)はODC-BY 1.0で、実装後も出典表示を保持する。

必要なraw入力はnice export名から機械的に置き換えない。上記43表は**現行consumerから導いた初回受入試験の入力集合**であり、Atlas APIの固定表数や将来の参照先上限ではない。data-pipelineは既知の意味定義から必要な表種別を指定し、その表の全行から新しい参照IDを発見・解決する。未知の表・参照形式は推測せず拒否する。固定sourceの43表はidentity 66,046,567 bytes、表別gzip level 6の合計3,260,165 bytesと手元で測った。これはHTTP実転送量・端末peak memoryの代用ではない。[raw function値の解釈](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/core/nice/func.py#L129)は数値ID、位置、文字列内の参照で意味が変わるため、FGO Labのregistry・parser・参照解決で一元化する。

現行JP nice exportはGET/HEADで存在とCORS `*`を確認した。`NiceClass`は84件、`NiceClassAttackRate`は84 key、`NiceClassRelation`は75行、`NiceAttributeRelation`は5属性、`NiceConstant`は341 key、`nice_enums`は40 enum group、`nice_trait`は360 key、`nice_battle_point`は2件。個別の可変URLであり、同時取得しても一世代を証明しない。現行計算の17クラス相性はnice係数と一致し、Arts/Buster/Quickの`adjustAtk`は1000/1500/800、`ATTACK_RATE`は230で現行0.23に対応した。これはraw実装時の照合資料であってnice応答を製品入力とする根拠ではない。rawの出典field・単位・境界は別に同定し、固定期待値を再生成せずに照合する。

## 採用する取得契約と棄却した方式

「版で管理しない」は、**公開APIで版を選択せず、旧版も保持しない**という意味で採用する。Atlas内部では、抽出・検査成功済みのsource treeとcatalogを用意してから現在のsource pointerを原子的に切り替え、各GETは開始時にそのpointerを固定して一応答を作る。途中の表、catalog、失敗した抽出は応答へ混ぜない。進行中のGETが読み終えるまではそのsourceを保持するが、過去版の公開・選択はしない。この公開操作には一時領域と切替点が必要だが、利用者やFGO Labはpublication ID、sequence、世代manifestを扱わない。既存の可変表URLを順に読むだけでは、これらの保証を得られない。

Atlas APIには少なくとも二種類の自己完結応答を要求する。製品用bundleは、data-pipelineが指定する既知のraw表種別について**全行**、その表から解釈する数値enum・trait・表示資源等のcatalog、regionと生成契約を含む。選択表はcanonical順の取得パラメーター等で指定し、表種別の追加でAtlasにFGO Lab専用profileの改修を求めない。43表は現在の調査候補であり、固定のID集合ではない。表内のID参照はWorkerが入力から発見して解決する。新しい表種別を必要とする未知の意味は、既知表の追加IDと区別して拒否する。監査用bundleは全表指定で、公開対象の全raw表・path一覧とcatalogを含める。Actionsは対象外の表・fieldを含めて監視する。二つのGETが同じ抽出時点を指す保証は不要であり、各応答をそれぞれ一つの完成入力として記録する。両者の同時照合が必要なテストでは同じ固定source fixtureから生成する。

bundle形式は、表境界とpathが一意で、未知・重複・欠落を検出でき、browser WorkerとNodeがストリーム処理できるものにする。URL名やJSON/圧縮archiveの詳細はAtlasとの実装協議で決める。重要なのは一回の応答に全入力が閉じること、producerが成功した抽出元を固定すること、未完成sourceを現在pointerへ露出しないこと、HTTP cache/CDNが旧・新の断片を混ぜないこと、browser CORSと条件付き確認が働くことである。Git treeにない必要入力やコード由来catalogも同じbundleに収め、出典と生成器を明示する。Atlas側のproducerは抽出元のcommit/tree、抽出成功状態とcatalog生成器を内部証拠として保持し、受信側にも出典を示す。ただし出典commit単体を抽出成功の証明とはしない。bundle本文のdigest/ETagは**本文の同一性**、producer証拠は**生成元の正当性**、FGO Labのvalidatorは**意味・参照整合性**を別々に担う。

未変更確認は選択表ごとの安定URLのHEADまたは条件付きGETで行い、ETagをbrowserへ公開する。ETagは本文の同一性を示す。source出典・生成時刻は応答headerに分け、本文を決定的に生成する。製品用表/catalogが同じなら無関係なraw表の更新だけで製品用ETagを変えない。確認とGETの間に公開が進んでも、GETが返すbundle全体を一候補として扱う。確認失敗は「未変更」と扱わない。変換器・意味契約・policyが変わった時はETagが同じでも保存済みactiveの互換性を再評価し、必要なら本文を再取得する。現在の製品用bundleにない表種別を要求する新しいアプリbuildも、新しい選択集合の完全応答を得るまでは受け入れない。

この方式は公開側の旧版保持と端末の表別raw cacheを不要にする代わりに、更新時には製品用bundleを丸ごと再取得する。手元の同一raw treeから得た43表は展開時66,046,567 bytes、tar+gzip level 6で3,292,112 bytesだった。これはローカルarchiveの参考値で、Atlasの実wire bytes、Worker peak、監査用全表の圧縮量は未実測。初回・更新の費用が要件を満たすか、実APIと実端末で測る。費用が許容できない場合に複数の可変URLへ黙って戻さず、上流と取得単位を再設計する。

### 端末の受入と保存契約

取得receiptにはregion、producerが提示するsource出典、bundle本文digest、含まれた表/catalog一覧、実際にcanonicalへ入れた行・参照edge、変換器・受入契約・policyのdigest、canonical digestを記録する。master identityはcanonical生成に影響する入力と規則から決定的に作る。これは公開版の選択番号ではなく、計算・保存結果の比較に必要な端末内の識別子である。無関係な表だけが変わってcanonical入力が同じなら計算identityを保つ。canonical入力が変わり出力bytesが偶然同じでも再検証する。確認時刻はidentityに混ぜない。

- browser WorkerとNodeで一つのraw validator、relational join、dependency resolver、normalizer、canonical validatorを使う。Atlas fetch・IndexedDB・Node fixtureのI/Oを分け、既存nice parserをraw parserの前に残す互換層は作らない。
- raw fieldは構造・型を検査し、「利用する」「明示的に範囲外」「既知だが計算未対応」を分類する。必要field欠落、不正値、未知field、未知効果/条件/演算、矛盾は拒否する。除外対象もinventoryへ記録する。
- 参照閉包は表内のIDを位置と意味registryに従って発見し、重複排除して解決先から反復する。欠落・同ID異内容・循環は経路付きで拒否する。未知の数値を参照IDと推測しない。固定referenced_skills/battle_pointsは製品入力から除く。
- 既知の意味による新servant/CE、成長値、既存係数値、既知の参照先追加はコード変更なしで対応する。新効果族、演算順、条件・対象・選択規則、未定義のカード/クラス意味はコードと検証が必要。クラス/属性相性・カード補正・基礎係数をmaster入力へ移し、calc-coreの中立補完を撤去する。
- inventoryは正規化の最初の例外より前に作り、全skill/passive、支援宝具、礼装の通常/LB、MC、callback、形態、BP、script、parameterを観測する。ID重複、主key・level列の欠損、共有参照と循環も検証する。
- 係数をmasterへ移すときはrelativeな相性指定のtarget候補、UI選択、scenario組立、battleの直接callerまで更新する。既存の計算量cap、timeout、ランダム上限の排他性、permille、float32境界は緩めず、新値が既存意味に収まらなければ拒否する。
- 専用取得Workerとranking Workerは処理寿命が異なるため分け、意味変換コードは複製しない。取得量・parse時間・memory peakと保存容量は実端末で測る。
- 現masterには既知の`unsupported`が28件ある。意味を定義できる明示的な非計算結果は保持して通知・計算拒否する。意味を定義できない未知を含む候補はactiveへ切り替えない。既存に出現したという理由だけのallowlistは作らない。

| 状況 | 挙動 |
| --- | --- |
| 初回、activeなし | bundle取得・検証・保存の成功後だけ計算可能にする。失敗は原因と再試行を表示する |
| 互換activeあり | activeを検証して先にUIを開き、起動・online復帰・利用中に背景確認する |
| 未変更 | ETagと入力契約が同じなら本文取得、変換、active書込みを省く。確認metaだけ更新する |
| 新候補 | Workerで一応答を最後まで取得し、全表/catalog・参照・意味・canonicalを検証してから一つのIDB transactionでactiveを切り替える |
| offline / 429 / 5xx / 途中切断 / 不整合 | 候補を拒否し、互換activeと失敗状態を表示する。activeなしなら計算不能とする。別配信先で補わない |
| quota / 保存失敗 / crash | 既存activeとuser storeを保持し、永続化できない候補を成功として使わない |
| 進行中の計算・複数tab | active identityの変更時にcalculator/rankingの古いreply、detail、handoff、保存を拒否する。DB transactionで期待active digestを比較し、競合した候補を破棄する。通知脱落はfocus時の再読取と次回のAtlas確認で回復する |
| draft/history・共有URL | request/resultのmaster・engine identityを保持。同じ入力なら検証して再利用し、異なる場合はhistoricalOnlyとして表示する。自動再計算・上書きをしない |

旧保存masterには新bundleの生成元証拠がないため黙って移行しない。新しいmasterを明示的に取得し、既存user store、profile、draft、history、backupを消さない。保存契約の変更で利用者データが読めなくなるなら実装前に影響を示す。`public/master`の固定baselineは開発fixtureへ移し、回帰期待値を更新のために再生成しない。

現行の直接callerでは、`bootstrapApplication`が候補確認・保存を待ってからUIを起動し、`loadActiveMaster`が検証失敗時にmaster storeをclearする。`stageAndActivate`は約33MBをstaging/masterへ重複保存する。rankingはmaster/context変更時のWorker再作成と旧reply拒否を備えるが、active切替起点はない。これらを保存・計算の一つの境界として変更する。Service WorkerはAtlas応答をshell代替や独自cacheの対象にしない。

## GitHub Actions監視

検知は三層にする。

1. 監査用bundle内の全raw表/path・field・schema/enum catalogの変化。公開される全enum/schemaと新しい表を観測し、実使用前の新概念も通知する。
2. 製品機能に関わるraw表の全行についてfield・function/buff/target・parameter/script・trait/形態/参照edge・係数の分類と変化。damageNp以外、計算範囲外として除外した入力もinventoryに残す。新しい表は内容を読まず無関係と決めず、分類待ちとして通知する。
3. 製品と共通の受入検証、canonical未対応、既知の意味ケースの実行。新概念、受入不能、通信障害、検査コード障害、通知/状態保存障害を分ける。

Atlasが公開入力・enum・schemaへまだ表していないゲーム規則まで検知できるとは保証しない。この限界と観測対象を公開運用文書へ明記する。全ゲーム概念を含めるために別のraw catalog/changefeedが必要と分かった場合は、取得契約と一緒に上流要件として記録する。

現在の`atlasInventory.ts`は宝具functionの`damageNp*`だけを数える。`productionAudit.ts`は正規化済みeffectの語彙と結果を監査するため、変換前に捨てたfield・entityや変換中に最初の例外で止まった後の新概念を列挙できない。監視の入力inventoryは、監査用bundleの全表・catalogと対象raw表の全行・追加参照から正規化前に作り、対象外の項目も種類・出現件数・例示ID・field pathを持たせる。監査用bundleのETagが同じrunでは大型本文を取得しない。変化したrunは全表を一つの応答で取得し、未知・変更表を分類する。コード変更時は元の入力が同じでも再判定する。

小さい専用の管理Issueを永続状態の正本とする案を採用する。内容は現形式の機械可読状態、最後の試行/完了/受入成功時刻、監査bundle digest、取得/変換/検査コードfingerprint、語彙集合または必要な差分基準、problem fingerprintと通知Issue ID、直近のmetrics。ArtifactとActions cacheを状態の正本にしない。容量を実測し、GitHub本文制限へ近づくなら全文inventoryは置かず必要な集合・digestへ絞る。

- monitorのconcurrencyは一つ、cancel-in-progressはfalse。GitHubの[concurrency仕様](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency)では既定でpendingは一つだけで、追加のpendingは古いpendingを取消し得る。全tickの実行を前提にせず、最終完了時刻と遅延を監視する。PRから通知・状態更新を行わない。
- 上流と検査fingerprintが同じで、直前の完全な検査がacceptedまたはrejectedとして記録済みなら、小さい確認で終了できる。通信失敗や途中停止を検査完了と扱わない。
- 正規化器・受入schema・意味registry・監視コード・関連依存変更をfingerprintに含める。文書だけの変更をfull scanの理由にしない。コード変更では上流未変更でも再検査する。
- 問題fingerprintは分類、未知概念/field path/意味契約等で作り、更新日時や上流版を無条件に含めない。同じ未対応が新servantへ広がってもIssueを乱造しない。入力URL/本文digest、該当ID/path、再現する最小証拠、拒否理由、run URLを通知する。
- open/closed Issueを機械markerで照合し、再実行・送信成功後のstate保存失敗でも通知を再利用する。通知本文digestが同じならcommentしない。新しい有意な証拠のみ同Issueを更新する。closed後に再発した場合は同Issueで再発を記録する。
- APIの検索/全page取得失敗を「Issueなし」にしない。状態破損を空状態へ補完しない。Issue編集競合・手動編集も検出し、成功heartbeatを進めずworkflow失敗として露出させる。
- 権限はjob単位の`contents: read`、通知/state更新の`issues: write`を基本にする。既存CIがmonitor履歴を照会する箇所だけ`actions: read`を使う。PAT、contents書込み、外部secretを前提にしない。2026-10-12に実repositoryのActionsはenabled、allowed_actions=all、既定`GITHUB_TOKEN`権限はread、PR承認は不可とAPIで確認した。job権限の明示と実manual runは引き続き必要。secret値は参照していない。
- 成功・未変更時はjob summary/管理Issueの小さい記録だけ。失敗時だけ必要な診断artifactを短期間保持する案（初期候補7日）。巨大export/masterを常時uploadしない。再現に必要な最小入力をどこまで保持できるか、上流が旧bundleを保持しない条件で確認する。

scheduleはdefault branch上でしか実行されず、遅延・drop、公的repositoryの60日無活動による停止がある。[GitHub一次資料](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。監視の完全停止を監視自身で検出することはできないため、**独立したdead-man-switchを完成条件に含める**。[Healthchecks.ioのGitHub Actions向け手順](https://healthchecks.io/docs/github_actions/)のように、完全な監査と通知状態保存が終わったrunだけが成功pingを送り、予定時刻+許容遅延までpingが無ければ外部から運用者へ通知する。ping URLはGitHub secretで保持し、log・artifactへ出さない。監視が動いたrunの障害はActionsと管理Issue、未起動・長時間停止はwatchdogで扱い、両方の失敗注入を実運用設定で試す。管理Issueに最終成功・受入成功を残し、既存CIもheartbeat age・workflowの有効状態を照会する。独立サービスのアカウント・通知先・料金・保持条件は実装時に確認する外部運用依存であり、未設定なら「監視障害を検出できる」と完了扱いしない。

周期は6時間を候補として比較する。毎時00分を避ける。6/12/24時間の検知遅延と費用を示し、browser側の起動確認・online復帰・利用中TTLは利用状況と上流条件から別途決める。上流契約が成立する前に周期を確定しない。

## 実装単位と各達成条件

| 単位 | 作業 | 閉じる条件 |
| --- | --- | --- |
| 0. Atlas bundle API | 成功済みのraw sourceとcatalogへ現在pointerを原子的に切り替え、各GETは固定したsourceから製品用・監査用の自己完結bundleを返す。CORS・ETag・条件付き確認を公開する | 実JP応答をNode/browserで取得できる。抽出失敗・部分生成・並行更新・途中切断でも一応答へ異なる元の表が混入しない。Atlas側の実公開がなければ未達 |
| 1. 共通raw受入 | data-pipelineに厳格schema、catalog、join、参照閉包、inventory、決定的canonical/receiptを実装しNode/Workerで共有する | 同じ固定bundleでNode/実Workerの出力bytesとdigestが一致。新servant/CE・既知係数・参照追加に無コード追従し、未知/欠損/矛盾を拒否 |
| 2. 数値規則と共通計算 | 係数・相性・card・定数をmasterへ移し、calculator/rankingが同じ規則・identityを使う | 既存17×17 class、5×5属性、3カード、0.23と固定期待値が一致。既知値だけの変更が両計算へ反映し、未知class/cardは拒否 |
| 3. 端末の取得・保存・UI | bundle取得Worker、原子的active、更新coordinator、計算/保存guard、SW対象整理を実利用経路へ接続する | 初回/更新/未変更/offline/429/quota/crash/複数tab/計算中/共有結果を実UIで確認。成功時だけ切替。未変更の大型GET/変換/active書込みはゼロ |
| 4. Actions監視と独立watchdog | 監査用bundleの全語彙inventoryと共通producer受入を定期実行し、管理Issueで重複防止する。独立のrun停止検知を設定する | NP以外も含む新概念・未対応・取得/状態/通知障害を分類し、再実行・crashでIssue重複なし。schedule停止を別時刻基盤で検出 |
| 5. 配信整理・全体gate | `public/master`を製品から撤去し、公開文書を実挙動へ更新する。費用・性能と最終gateを実測する | 新データから実UI/計算、失敗時の保持、Node/Worker一致、転送・保存・Actions費用を示し、[最終gate](testing.md)を通す |

各checkpointは実経路と証拠が揃ってからチェックする。途中でbundleが必要な参照を含められない、転送・保存量が成立しない、上流の抽出成功を保証できない等が判明したら局所的に足さず、目的・不変条件・生成/利用経路を見直してこの記録を更新する。

- [ ] **0. Atlas bundle API公開**
- [ ] **1. 共通raw受入**
- [ ] **2. 数値規則と共通計算**
- [ ] **3. 端末の取得・保存・UI**
- [ ] **4. Actions監視と独立watchdog**
- [ ] **5. 配信整理・全体gate**

## 調査証拠・費用と未達条件

2026-10-12の固定JP rawでは通常servant 470件、CE 2,706件、MC 28件を起点に、既知skill/NP/function/buffと素材・係数の結合が成立した。旧nice入力と比較した成長6,370配列、17クラス相性289組、5属性相性25組に差はない。新servant 1件、CE 6件、入力から発見するcallback skill 25件を実装検証の対象にできる。これらは**共通変換器・ブラウザー取得の成功ではない**。製品コード・利用者データは変更していない。

参考量: 現行自前masterは32,953,998 bytes、ローカルgzip 2,755,994 bytes。Atlasの現行主要nice exportはidentity合計92,688,305 bytes。固定Git treeのraw全441表はidentity合計316,029,261 bytes、製品用候補43表は66,046,567 bytesで、同じ43ファイルのtar+gzip level 6は3,292,112 bytes。これはAtlas新APIの実転送量でもaudit bundleの圧縮量でもない。bundle一括化で表別差分転送は失うため、初回だけでなく**更新一回当たり**の上流wire bytes、Worker展開・parse peak、端末保存を測る。未変更はHEAD/条件付きGETの実request数・wire bytes・時間を測る。Atlas producerの生成時間・保存量・切替時間、Actionsの変更/未変更runner秒・転送・GitHub API回数・artifact GB-hours、独立watchdog費用も実測する。

周期h、月の変更run数Cなら月run数R=720/h、上流転送=(R-C)×小確認bytes+C×監査bundle bytes+失敗再試行分。6/12/24時間を比較し、料金・上流制限・実設定は実装時の証拠で確認する。2026-10-12時点でrepositoryはpublic、直近のCI jobは成功1,025秒・失敗1,484秒、公開artifact 2件は計401,333,546 bytesで14日保持。これはmonitorの費用を示さない。[GitHub料金資料](https://docs.github.com/en/billing/concepts/product-billing/github-actions)の条件と実run/請求情報を区別する。

固定bundleをNodeと実browser Workerへ同じbytesで渡し、参照閉包、canonical bytes/digest、inventory、拒否理由を照合する。Atlas APIをmockした実UIで新servant/CE・既知係数の更新からcalculator/ranking、保存復元、共有結果まで確認する。未知field/効果、参照欠落、catalog欠落、壊れたarchive、途中切断、quota、複数tab、遅延中の計算を拒否・保持する。Atlas側の抽出失敗・部分source・GET中のpointer切替の失敗注入は別に必要であり、FGO Labのfixture成功で代用しない。監視は新表・NP以外の概念・通知直後crashをfixtureと実workflowで検証する。固定回帰期待値の再生成、cap/timeout/ratchetの緩和をしない。最終gateは[testing.md](testing.md)に従う。

### Atlasへ確認する公開契約

現行[OpenAPI](https://api.atlasacademy.io/openapi.json)は109 pathで、raw表の自己完結bundleはない。現行`/raw/JP/skill/961313`の`hash`/`commit`/`snapshot` queryは無指定と同じ応答を返す。実browserではAtlas raw APIはCORSで読めるがGit APIは拒否される。現行上流の[load_and_export](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L857)は一括成功と原子的配信の根拠にならない。

上流へ求めるのは、成功済みsource treeからの二つの完全bundle、生成元の成功判定、一応答の原子性、抽出失敗時の現行source維持・進行中GETのsource固定、CORS/ETag/HEADまたは条件付きGET、429/Retry-After、帯域・公開条件である。実JP応答と維持対象の上流実装の双方で確認し、旧・新の切替中に単一GETが混在しないことを失敗注入する。問い合わせの送信は本調査に含めない。Atlas側の協力・公開が得られなければ直接Atlas API取得の完成条件は未達と記録する。

今回の再判断: 公開版の選択・旧版保持・世代manifestは、**複数応答を後から揃えるため**に必要だった。取得単位を自己完結した一応答に変えれば、その複雑さを製品契約から外せる。代償は更新時のbundle再転送と上流での成功済みsourceの原子的切替と一応答のsource固定である。端末の計算identityまで消すと進行中計算・共有結果・保存済み入力を区別できないため、内容digestは残す。この変更は既存の版付き計画を置き換えるもので、暫定fallbackではない。

次の操作: checkpoint 0としてAtlas側のbundle公開契約・抽出成功判定・一括応答の実装可能性と帯域を確認する。公開後に実JP応答でCORS、ETag、原子的切替、Node/browserの取得を検証してからcheckpoint 1〜5を進める。このセッションは調査・計画までとし、製品実装は行わない。
