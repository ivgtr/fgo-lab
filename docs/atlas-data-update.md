# Atlas直接取得・自動追従・未対応監視の実装計画

設計確認日: 2026-10-12。対象revision: adafb00940ebc2ac4f691065c6c6545c4cd420bf。
直接取得・自動更新・定期監視は未実装。この文書は[アーキテクチャの設計要件](architecture.md#atlas直接取得と自動更新の設計要件)を実装へ接続する取得契約・責務・達成条件を定める。チェックポイントの状態と再現可能な証拠をここで管理する。

## 結論と成立条件

完成形は二つの独立した公開・受入transactionで成り立つ。**Atlas側**は抽出に成功した一つのraw source treeと、そのtreeから用意した表・schema/enum catalogをimmutableなpublicationとしてAPIで公開し、全資源の検証後にだけ小さい`current`を切り替える。**FGO Lab側**はbrowserがそのpublicationから必要な入力を直接取得し、data-pipelineの一つの意味変換をNode/Workerで実行して、検証済みcanonical masterを端末で原子的にactiveへ切り替える。calculator/rankingと保存結果は同じmaster・規則・変換版のidentityを使う。ActionsはAtlasの全公開raw語彙と製品受入を監査し、停止は独立したwatchdogが検出する。製品から大きいmasterの配信を撤去し、固定回帰入力だけを開発用に残す。

最終ゴールは、**Atlas APIを唯一の大きいゲームデータ配信元とし、端末がAtlasの最新の「完成済みかつFGO Labで受入可能な世代」へ自動で追従すること**。FGO Labはraw語彙からcanonicalへの唯一の意味変換・検証、端末内activeの切替、監視と利用者への状態表示を所有する。新しいservant・礼装・既知係数の追加はアプリ再deployも自前masterの再配信もなく反映する。未知の意味を含む世代は自動受入の対象ではなく、既存の互換activeを明示して使い、対応に必要な証拠を監視で通知する。「最新版」と「最後に安全に受け入れた版」をUI上でも区別する。

Actionsは端末更新の中央承認者にしない。scheduleは遅延・停止し得るため、各端末が同じ契約で候補を検証して切り替える。Actionsは端末より広い語彙を観測し、未知・未対応・監視障害を重複なく開発者へ届ける。小さい自前manifestを後から作ってAtlas応答のhashを並べても、元の応答が一世代だった証拠にはならないため、それを上流の完了通知の代用にしない。

データ面は**Atlasが公開するcontent-addressedなraw表API**を採る。変換済みniceを上流とFGO Labで二重に意味変換せず、FGO Labがraw→canonicalを唯一所有する。AtlasのGit treeは表bytesを特定する材料だが、Git transportをbrowserの製品経路にしない。Atlasの現行DB/Redis APIや可変CDNを同一世代と推定しない。上流の新しいpublication APIは本計画の第一成果物として実装・公開・実応答検証まで追う。Atlas側の採用・deployがなければ、この要件群は本repositoryだけでは達成できない。自前mirrorやproxyに置き換えて完了扱いしない。

現行[Atlas OpenAPI](https://api.atlasacademy.io/openapi.json)にこのpublication APIはない。Atlas側で必要な変更の範囲、検証方法、引渡し条件を下に定め、外部依存を通常の実装checkpointと同じ粒度で管理する。Atlas側の協力・公開までを完了条件とし、APIが未公開のままFGO Lab側の部品だけを完成と呼ばない。

### 利用者の振る舞いから決める受入境界

Atlas APIを製品の取得元とする。初回は取得・検証・保存が終わるまで計算可能なmasterを見せず、進行状況または再試行可能な失敗を示す。互換性を確認できるactiveが端末にある場合は先にそれでUIと計算を開き、更新を背景で調べる。更新候補に未知の意味、欠損、矛盾、取得世代の不明点があれば切り替えず、activeの出典と更新失敗を明示する。上流取得失敗のたびに既存masterを消したり、自前配信先から補ったりしない。新候補は全入力の受入後に一回の保存transactionで切り替え、calculatorとrankingは同じidentityへ同時に移る。切替前の計算結果・共有結果は新しいmasterで計算したものとして扱わない。

この振る舞いに必要な保証を、候補内部の**意味・参照整合性**と、候補全入力の**上流世代の整合性**に分ける。前者は共通validatorで確認できる。後者は、取得したbytesへ自分でhashを付けても、`/info`の前後一致や個別ETagを照合しても証明できない。`info.json`が関連exportより後で書かれる現行実装は有用な完了の手掛かりだが、版指定できないskill API応答やCDNでの公開単位まで束縛しない。「同じ時点で読めて計算できた」ことを「同じ上流generation」と表示・保存しない。したがって、現行公開APIだけを使う初回activationを安全と認定する設計にはまだ到達していない。この不足を隠して実装を進める製品判断はしない。

Atlas側の公開契約が決まる前に取得器・receipt・raw cacheの形を固定しない。調査用に固定したGit commitは上流APIの受入試験とNode/Worker比較の入力に使えるが、製品ブラウザーがGitから読む設計ではない。上流publicationの実応答・保持・更新反例が揃ってから、FGO Labの入力・保存契約を確定する。

2026-10-12の追加調査で、AtlasのrawゲームデータGit repositoryにはimmutableなcommit/tree/blobがあることを確認した。一方、通常のGit APIは実ブラウザーでCORS拒否され、Git packのRange取得は専用clientの維持が要る。完成形でAtlasへ求めるのは、同じcommitが参照するraw表とcatalogをHTTP APIから版指定で読める契約である。APIがraw bytesを返すなら、Atlasのnice変換器版を入力identityに含める必要はなくなる。FGO Lab側に必要なraw join・意味変換は一つの共通実装として作る。自前hash一覧、二回の同一取得、待機時間、infoの前後一致で上流の公開保証を埋めない。

## 現行経路と変更境界

| 現行の根拠 | 現行挙動・問題 | 変更する責務 |
| --- | --- | --- |
| [cli.ts](../packages/data-pipeline/src/cli.ts) | ローカルの4つのnice exportと固定referenced_skills/battle_pointsを読み、自前public/masterへ生成。versionは手動または日付 | Node専用I/OとAtlas raw取得・共通変換・検証を分離。製品配信へのnormalize出力を撤去 |
| [snapshotNormalization.ts](../packages/data-pipeline/src/snapshotNormalization.ts)、[atlasContract.ts](../packages/data-pipeline/src/atlasContract.ts) | nice形状をrawとして扱い、unknownを型assertionで解釈。配列検査以外の構造検査は限定的。ID重複のMap上書きや不正項目の除外がある | nice前提の入力契約を置き換え、Atlas raw表のjoin、厳格な構造検証、明示的な対象範囲、参照閉包、語彙分類を唯一の受入境界にする |
| [artifact.ts](../packages/data-pipeline/src/artifact.ts)、[targetTaxonomy.ts](../packages/data-pipeline/src/targetTaxonomy.ts) | node:crypto/Bufferへの依存。normalizationからartifactをimportする | 共通経路をTextEncoder/WebCrypto等のNode24・browser共通APIで動かす。Node専用publication/auditのimport経路を分ける |
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

## 上流入力と同一snapshotの取得契約

2026-10-12のHTTP read-only確認:

- `/info`のJPはhash=5d3cbc、timestamp=1791730860。
- `/export/JP/info.json`は同じJP hashのほかserverHash=35cadc、dataVer=2681等を持つ。入力ごとのdigest、snapshot manifest、immutable URL一覧は含まれない。
- `/openapi.json`が申告するAPI版は6.0.0、serverHashは35cadc。上流GitHubで解決したcommitは35cadc444e20c78cc60e56082ad1b64607d4d2e2。現master a937bbb0f7eced10f45f57568786da10d9994027も同じ問題を持つ。
- 上流[app/tasks.py](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L99)は各exportを既存pathへ個別に書く。[generate_exports](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L547)は定数、各export、servant/equipを順番に生成し、FGO Labが使う既定言語exportより後でinfoを更新する。ただしinfo更新後も別のexport生成が続く。公開コードからは全体のatomic publicationを確認できない。実CDNの運用までコードだけで断定しない。
- 稼働中のserverHashに一致する同revisionの[load_and_export](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L857)では、DBとRedisの読込み後、`update_master_repo_info`が`/info`用のRedis版を**export生成前**に更新する。読込み中の例外を記録しても後段のexport生成へ進み、export生成中の例外も記録して戻る。したがって`/info`の新版は完了通知ではない。例としてraw repository更新後にDB読込みが失敗すると、新rawから作る係数と旧DBから作るservantが混在し得る。これは公開コードから導く失敗経路であり、実運用で発生したとの主張ではない。[旧/新の`/info`一致](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/main.py#L321)だけで混在を否定できない理由になる。
- [DB import](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/db/load.py#L554)はtable groupごとのtransaction、[Redis import](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/redis/load.py#L22)はkeyごとのdelete/writeで進む。失敗時に全DB/Redisを一括rollbackする構造ではない。このため上流の完成世代を新設するなら、単に最後にmanifestを書くのでなく、読込み成功後の一貫した生成元を用い、失敗時は旧公開世代を保持する必要がある。並行更新を排除する運用・実装契約も確認する。
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
| 数値規則 | `mstClass.attackRate`と`mstClassRelation(atkClass,defClass)`は既存17クラスの全289組で現行値と一致。`mstAttriRelation`の5×5、`mstCard(id, num=1)`のArts/Buster/Quick 1000/1500/800、`mstConstant.ATTACK_RATE=230`も一致 | class/attribute/cardの数値ID→意味名は版付きcatalogで定義。既知classの値変更はmaster更新で追従し、新class/cardの意味は未知として拒否 |

level配列は固定rawの`mstSkillLv` 47,647行で`funcId`と`svals`、`mstTreasureDeviceLv` 9,232行で`funcId`と`svals`〜`svals5`がすべて同長だった。代表的な17表の主keyにも重複は無かった。変換器はこの観測を既定値にせず、毎世代で再検査する。trait名、class名、function/buff/target/condition/cardの数値enum、`FUNC_VALS_NOT_BUFF`はraw表のfieldだけからは復元できず、上流[enum定義](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/schemas/gameenums.py)と[trait定義](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/schemas/enums.py#L1127)に相当する**版付きcatalog**が必須である。

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

必要なraw入力はnice export名から機械的に置き換えない。上記43表は**現行consumerから導いた初回受入試験の入力集合**であり、Atlas APIの固定表数や将来の参照先上限ではない。公開manifestはsource全表を列挙し、data-pipelineは既知の意味定義から必要表を選び、入力から新しい参照edgeを発見したら同publicationの表を追加取得して閉包を検査する。未知の表・参照形式は推測せず拒否する。固定世代の43表はidentity 66,046,567 bytes、表別gzip level 6の合計3,260,165 bytesと手元で測った。これはHTTP実転送量・端末peak memoryの代用ではない。実wire/peak/保存量で表単位取得の成立を検証する。[raw function値の解釈](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/core/nice/func.py#L129)は数値ID、位置、文字列内の参照で意味が変わるため、FGO Labのregistry・parser・参照解決で一元化する。

現行JP nice exportはGET/HEADで存在とCORS `*`を確認した。`NiceClass`は84件、`NiceClassAttackRate`は84 key、`NiceClassRelation`は75行、`NiceAttributeRelation`は5属性、`NiceConstant`は341 key、`nice_enums`は40 enum group、`nice_trait`は360 key、`nice_battle_point`は2件。個別の可変URLであり、同時取得しても一世代を証明しない。現行計算の17クラス相性はnice係数と一致し、Arts/Buster/Quickの`adjustAtk`は1000/1500/800、`ATTACK_RATE`は230で現行0.23に対応した。これはraw実装時の照合資料であってnice応答を製品入力とする根拠ではない。rawの出典field・単位・境界は別に同定し、固定期待値を再生成せずに照合する。

Atlas APIへ求める公開契約は、(1) region別に抽出・検査が成功したraw commit/treeとその抽出根拠を指す小さい`current`、(2) commitを指定して読むimmutableなtable bytesと表一覧・digest、(3)同じ世代に束縛したschema/enum catalog、(4)完全公開後だけ`current`が切り替わり、旧世代が明記した期間読めること、(5)browser CORS・条件付き確認・取得上限・429の契約である。raw APIはsource commitが参照するblobをそのまま配信し、DB/Redisの現在値やnice変換器の実行結果を混ぜない。catalogがsource以外から生成されるなら、その生成器版と内容digestを世代に束縛する。受信側はfull commit/tree、表ごとのdigest、catalog、regionを確認する。Git object IDだけを短縮したhashや、取得後に自分で付けたhashは公開完了の代用にしない。

API path名はAtlasと調整できるが、配信資源は三つに定める。小さい`current`はregion、単調増加するpublication sequence、publication ID、immutable manifestのURL/digest、full source commit/tree、抽出成功receipt、公開時刻を返し、条件付きGETとbrowser CORSを持つ。manifestはそのpublicationのsource全表のpath・展開bytes・SHA-256・immutable URLとcatalogの生成器版・digest・URL、保持期限を返す。表URLは指定publicationの**全行**を返し、digestはHTTP圧縮前のraw bytesで照合する。同じdigestの表は世代間で同じimmutable資源を共有し、保持中manifestが参照する資源は削除しない。Atlasは固定source treeからstagingへ表とcatalogを用意・照合してからmanifestを公開し、最後に`current`を原子的に切り替える。旧publicationは宣言した期限まで読み切れる。これらがAtlasに実装・公開されるまで、FGO Lab側のreceipt形式を確定しない。

端末は`current`のpublication IDと変換器版が前回と同じなら大型取得・変換・active書込みを省く。publicationだけが進んだ場合はmanifestを読み、**canonical生成に入る表と使用catalog部分**のdigestを照合する。入力digestがすべて同じならactive計算版を維持し、小さい確認metaだけを進める。入力が変われば必要表の内容digestに合う端末cacheを再利用し、不足分だけAtlasから取得して全体を再変換する。Actionsは製品に無関係なsource表の変化もmanifestから監査する。取得途中に`current`が進んでも、候補は最初に選んだpublication IDだけから読み、期限切れなら候補を破棄して新しい`current`から再試行する。

取得receiptには上流公開契約の証拠、full source commit/tree、region、catalog版/digest、**実際にcanonical生成へ入れた**表・rowまたは参照閉包のpath・bytes/hash、参照edge、FGO Lab変換器/受入契約版、canonical digestを記録する。source publication identityは出典と監視の版、master identityは完全なcanonical入力集合・使用catalog/mapping・変換器/policy版から決定的に作る。無関係な上流表の変更で計算版を変えず、canonical入力が変わればcanonical bytesが同じでも別identityとして再検証する。同じidentityに異内容を保存しない。最後に確認したsource commitとその表digest照合結果は小さいmetaに別記し、meta保存失敗時に「最新版確認済み」と表示しない。確認・取得時刻はidentityに混ぜない。UI表示名の言語資源がraw source以外なら、その版付き入力も同じreceiptへ含める。

## 共通変換、参照、数値、未知の境界

- browser WorkerとNodeで一つのraw table validator、relational join、dependency resolver、normalizer、canonical validatorを使う。I/OはAtlas fetch・IndexedDB・Node fixtureの各adapterへ置く。専用master Workerとranking Workerは処理の寿命が違うため分けるが、意味変換コードは複製しない。既存nice parserをraw parserの前に残す互換層は作らない。
- rawの既知fieldは構造・型を検査し、「利用する」「明示的に範囲外」「既知だが計算未対応」を根拠付きで分類する。必要field欠落、不正値、未知field、未知効果/条件/演算、矛盾は拒否。Zodで未知項目をstripして受理しない。
- 除外対象であっても入力の存在と除外理由をinventoryへ記録する。宝具攻撃以外の全skill/passive、支援宝具、礼装通常/LB、MC、callback、形態、BP、scripts、パラメーターを観測する。変換がthrowする前の語彙inventoryを残し、最初の一件だけで監視を終えない。
- 参照閉包はraw表とjoin結果を走査し、必要IDを重複排除して解決、解決先から新edgeを発見して完了まで反復する。表単位で取得済みなら索引を再利用する。ID重複・同ID異内容、ID不一致、欠落、循環は経路付きで拒否する。共有参照を循環と混同しない。network並列数・深さ・総量・timeoutを明示し、超過を成功扱いしない。
- 固定referenced_skills/battle_pointsは製品入力から除き、必要な固定ケースのfixtureとしてだけ残す。未知の数値を「参照IDらしい」と推測して取りに行かない。
- 既知のschema・意味による新servant/CE、成長curve、倍率、既存係数表の値、既知参照先の追加はコード変更なしで対応する。新効果族、演算順、条件・対象・選択規則、未定義のカード/クラス意味などはコードと証拠が必要。
- クラス/属性相性・カード補正・基礎係数をmasterの版に含める。relativeな相性指定も新しい表と矛盾しないよう、target候補生成・UI選択・scenario組立・battleの直接callerまで変更する。数値だけ更新して旧表による候補を残さない。
- 既存の範囲・計算量capを値更新のために緩和しない。ランダム上限の排他性、permille、float32境界等を上流仕様と照合する。新値が現在の意味・予算に収まらなければ拒否して理由を出す。
- 現masterに`unsupported`が28件あることを確認した（operationSemantics 18、unresolvedTarget 2、partyCompositionMutation 4、contextReference 4）。全unsupportedを禁止すると現行範囲まで凍結する。既知で明示的な非計算結果として保持できる未対応と、意味を定義できない未知を区別する。前者は通知・計算拒否を保持し、後者はcandidate activationを拒否する。既存に出現したという理由だけのallowlistは作らない。

現行ローカルの**nice**入力の実測では`nice_servant`は485行・top-level 61 key、全skill/passive/NPに10,903 function・49 `funcType`・121 parameter keyがある。`nice_equip`は2,700行・top-level 27 key、`nice_mystic_code`は28行・10 key、`nice_item`は1,959行・18 key。現在の`atlasContract.ts`は多くをoptionalなTypeScript型で記述し、`normalizeAtlasSnapshot`は配列検査後に型assertionを使う。これはraw表の正確な取得量やjoin範囲を示さない。実装時の厳格な受入ではrawの大量のfieldを「使用・既知の範囲外・明示的未対応」に分類し、未知fieldをparse時にstripした成功としない。元入力からのinventoryはnormalizationのthrowより先に作る。

## 更新・保存・UIの利用経路

| 状況 | 計画する挙動 |
| --- | --- |
| 初回、activeなし | 自動取得を開始し、段階と失敗原因を表示。全入力・正規化・検証・保存の成功後だけUIへmasterを渡す。プロフィール開始の既存操作はmaster取得と分離する |
| 起動時に互換activeあり | activeを検証して先にUIを開き、背景で小さい版確認。起動・online・利用中確認はcoordinatorで重複実行を抑える |
| canonical入力の表・使用catalog・正規化器が未変更 | full source commitに無関係な差分があっても、大きい本文取得・正規化・active書込みを省略。最後に照合したsourceと失敗状態は小さい記録で管理。判定は上流の表digest契約に基づく |
| 更新あり | Worker内で取得→構造検査→参照閉包→変換→canonical検証→receipt生成。主threadは表示と切替接続だけを担う |
| offline / timeout / 429 / 5xx / checksum不一致 | 更新失敗と利用中版を表示。互換activeがあれば明示して継続。activeなしなら利用不能と再試行を表示。Retry-After・上限付きbackoffで取得を抑える |
| 未知・不整合・参照欠落 | 候補を拒否し、同じ入力の無意味な連続再試行を抑える。新しい上流/検査版または明示的な再検査でやり直す。旧activeを更新成功と表示しない |
| quota / IDB transaction失敗 / Worker停止 | 成功済みactiveとuser storeを保持。永続化できない候補を一時的な成功版として使わない。問題を分類して再試行可能にする |
| 切替と進行中の計算 | 切替直前に旧計算・保存のguardを無効化。commit成功後、一つのmaster identityでcalculator/rankingを更新。旧reply/detail/handoffを拒否して最新入力で再計算。UI接続失敗時は状態を明示し、旧結果を新masterの結果として表示しない |
| 複数tab・再読み込み・crash | 更新取得はorigin内のlockで重複を抑え、DB transaction内でexpected active identityとpublication sequenceを比較。古い候補が後から完成しても新版を巻き戻さない。BroadcastChannelは通知用。通知脱落時はfocus時のactive確認で同期。DB commit前後のcrashを試験 |
| 保存済みdraft/history・共有URL | request/resultの版対を保持。同版は再計算一致を検査、異版はhistoricalOnlyとして表示。現在版への再計算は既存の明示操作を使い、過去結果を無言で上書きしない |

master用storeは「検証済みcandidateとactive pointer」をtransactionで扱う。検証やhash計算はtransaction外で終え、candidate書込み・pointer切替・不要候補のcleanupを一つのtransactionでcommit/abortする。activeの内容とreceiptの再読取を確認する。現行stagingの大型重複を残さず、user storeと分離する。表単位の内容address付きraw cacheはactiveへの参照がある入力を優先して保持し、保存上限・圧縮・evictionを実端末の初回/更新/容量不足の測定で決める。cache欠損は同じpublicationのAtlas APIからのみ再取得し、失敗なら候補を拒否する。cacheとcandidateが増えてもquota失敗で既存activeやuser dataを失わないことを受入条件にする。

master保存契約は更新する。旧保存masterにはAtlas snapshot証拠がないため、新契約へ黙って変換しない。旧masterの扱いは利用拒否と明示的再取得とし、利用者storeは触らない。profile/backup/shareの現行schemaを保持できる設計を優先するが、係数・相性の変更で契約変更が必要になれば影響を同じ記録へ追記する。読めなくなった利用者データの自動削除・変換はしない。実データ消失や共有の意味変更を伴う場合は製品判断として確認する。

直接callerの確認結果: `bootstrapApplication`はactiveがあってもmanifest fetchと候補保存を待ってからUIを起動し、`loadActiveMaster`は検証失敗時に`master` storeをclearする。`stageAndActivate`は`staging`と`master`へ同じ約33MBの記録を書き、旧stagingを削除しない。`App`のonline eventは表示だけを更新する。rankingの`useRanking`はmaster/context変更でWorkerを再作成し旧返信・detailを拒否するが、切替起点はまだない。共有とdraftのrequest/resultはmaster/engine版を保持し、異版は`historicalOnly`で扱う。実装時はactive保存契約の変更と計算中のguardをまとめて接続し、`user` storeには触れない。

製品のpublic/master配信を撤去する前に、現在のproductionテストが参照する同じbytesを開発専用の固定inputへ移す。source/manifestのpath更新はしても、期待値・意味digest・出自を再生成しない。新normalizerの成功を歴史baselineの再生だけで主張しない。

[データ出典文書](licenses/data-sources.md)は現在「版付きmirrorとして配信」と記載している。製品配信をAtlas直接取得へ切り替える時に、データの所在と出典表示を実態へ合わせる。計算結果の共有や利用者バックアップから過去masterを勝手に再取得・再計算する仕様にはしない。

## GitHub Actions監視

検知は三層にする。

1. Atlasのfull raw commit/tree・公開表/path一覧・schema/enum catalogの変化。公開される全enum/schemaと新しい表を観測し、実使用前の新概念も通知する。
2. 製品機能に関わるraw表の全行についてfield・function/buff/target・parameter/script・trait/形態/参照edge・係数の分類と変化。damageNp以外、計算範囲外として除外した入力もinventoryに残す。新しい表は内容を読まず無関係と決めず、分類待ちとして通知する。
3. 製品と共通の受入検証、canonical未対応、既知の意味ケースの実行。新概念、受入不能、通信障害、検査コード障害、通知/状態保存障害を分ける。

Atlasが公開入力・enum・schemaへまだ表していないゲーム規則まで検知できるとは保証しない。この限界と観測対象を公開運用文書へ明記する。全ゲーム概念を含めるために別のraw catalog/changefeedが必要と分かった場合は、取得契約と一緒に上流要件として記録する。

現在の`atlasInventory.ts`は宝具functionの`damageNp*`だけを数える。`productionAudit.ts`は正規化済みeffectの語彙と結果を監査するため、変換前に捨てたfield・entityや変換中に最初の例外で止まった後の新概念を列挙できない。監視の入力inventoryは、raw tree・catalog全体と対象raw表の全行・追加参照から正規化前に作り、対象外の項目も種類・出現件数・例示ID・field pathを持たせる。raw repository全体を毎run取得する設計にはしない。tree/catalogで未知・変更表を検知し、必要な内容へ段階的に広げる。コード変更時は元の入力が同じでも再判定する。

小さい専用の管理Issueを永続状態の正本とする案を採用する。内容は現形式の機械可読状態、最後の試行/完了/受入成功時刻、上流identity、取得/変換/検査コードfingerprint、語彙集合または必要な差分基準、problem fingerprintと通知Issue ID、直近のmetrics。ArtifactとActions cacheを状態の正本にしない。容量を実測し、GitHub本文制限へ近づくなら全文inventoryは置かず必要な集合・digestへ絞る。

- monitorのconcurrencyは一つ、cancel-in-progressはfalse。GitHubの[concurrency仕様](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency)では既定でpendingは一つだけで、追加のpendingは古いpendingを取消し得る。全tickの実行を前提にせず、最終完了時刻と遅延を監視する。PRから通知・状態更新を行わない。
- 上流と検査fingerprintが同じで、直前の完全な検査がacceptedまたはrejectedとして記録済みなら、小さい確認で終了できる。通信失敗や途中停止を検査完了と扱わない。
- 正規化器・受入schema・意味registry・監視コード・関連依存変更をfingerprintに含める。文書だけの変更をfull scanの理由にしない。コード変更では上流未変更でも再検査する。
- 問題fingerprintは分類、未知概念/field path/意味契約等で作り、更新日時や上流版を無条件に含めない。同じ未対応が新servantへ広がってもIssueを乱造しない。入力URL/版/hash、該当ID/path、再現する最小証拠、拒否理由、run URLを通知する。
- open/closed Issueを機械markerで照合し、再実行・送信成功後のstate保存失敗でも通知を再利用する。通知本文digestが同じならcommentしない。新しい有意な証拠のみ同Issueを更新する。closed後に再発した場合は同Issueで再発を記録する。
- APIの検索/全page取得失敗を「Issueなし」にしない。状態破損を空状態へ補完しない。Issue編集競合・手動編集も検出し、成功heartbeatを進めずworkflow失敗として露出させる。
- 権限はjob単位の`contents: read`、通知/state更新の`issues: write`を基本にする。既存CIがmonitor履歴を照会する箇所だけ`actions: read`を使う。PAT、contents書込み、外部secretを前提にしない。2026-10-12に実repositoryのActionsはenabled、allowed_actions=all、既定`GITHUB_TOKEN`権限はread、PR承認は不可とAPIで確認した。job権限の明示と実manual runは引き続き必要。secret値は参照していない。
- 成功・未変更時はjob summary/管理Issueの小さい記録だけ。失敗時だけ必要な診断artifactを短期間保持する案（初期候補7日）。巨大export/masterを常時uploadしない。再現入力の入手可能性もsnapshot契約で確認する。

scheduleはdefault branch上でしか実行されず、遅延・drop、公的repositoryの60日無活動による停止がある。[GitHub一次資料](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。監視の完全停止を監視自身で検出することはできないため、**独立したdead-man-switchを完成条件に含める**。[Healthchecks.ioのGitHub Actions向け手順](https://healthchecks.io/docs/github_actions/)のように、完全な監査と通知状態保存が終わったrunだけが成功pingを送り、予定時刻+許容遅延までpingが無ければ外部から運用者へ通知する。ping URLはGitHub secretで保持し、log・artifactへ出さない。監視が動いたrunの障害はActionsと管理Issue、未起動・長時間停止はwatchdogで扱い、両方の失敗注入を実運用設定で試す。管理Issueに最終成功・受入成功を残し、既存CIもheartbeat age・workflowの有効状態を照会する。独立サービスのアカウント・通知先・料金・保持条件は実装時に確認する外部運用依存であり、未設定なら「監視障害を検出できる」と完了扱いしない。

周期は6時間を候補として比較する。毎時00分を避ける。6/12/24時間の検知遅延と費用を示し、browser側の起動確認・online復帰・利用中TTLは利用状況と上流条件から別途決める。上流契約が成立する前に周期を確定しない。

## 実装単位と各達成条件

| 単位 | 作業 | その段階で閉じる条件 |
| --- | --- | --- |
| 0. Atlas publication API | Atlasの抽出成功を公開元で確定し、固定raw treeからsource全表manifest・版付きcatalog・immutable表をstaging生成。全digestと参照可能性を確認後に`current`を原子的に進め、旧版を契約期間保持する。上流への変更提案・検証・公開までをこの単位に含む | 仕様と実JP publicationが存在し、Node/実browserで同一bytesを取得。抽出失敗・部分生成・並行公開・途中停止・旧版取得・429・CORS・条件付き確認の反例で混在を受け入れない。Atlas側の実公開が無ければ未達 |
| 1. 共通raw受入 | `data-pipeline`に厳格schema、数値enum/catalog、join、位置付き値、同じregistryによる参照発見/解決、raw語彙inventory、決定的canonical/receiptを実装。Node I/Oと専用master Workerは同じ純粋producerを呼ぶ | 固定publicationのNode/実Worker出力bytes・identityが一致。新servant/CEと既知係数/参照追加はコード変更なし。未知field/意味・欠損・矛盾・循環・混在は理由付き拒否。goldenは再生成しない |
| 2. 数値規則と共通計算 | `master-data`に版付き係数/相性/card/定数を持たせ、`calculation-application`がcalculator/rankingへ同じ規則とmaster identityを渡す。`calc-core`の固定値・中立補完を除く | 既存の17×17 class、5×5属性、3カード、0.23と固定期待値が一致。既知係数の変更だけで両計算が同じ結果へ更新し、未知class/cardは拒否 |
| 3. 端末の取得・保存・UI | Atlas publicationだけを読む更新Worker、content-addressed入力cache、原子的active、起動/online/利用中coordinator、計算・保存guard、ranking再初期化、SW対象整理を接続。旧masterは明示的再取得とし、user store/draft/historyを保護 | 初回・未変更・更新・offline・429・checksum・quota・crash・複数tab・進行中計算・共有結果を実UIで検証。成功時だけactive切替。未変更の大型GET/変換/active書込みはゼロ |
| 4. 監視と独立watchdog | full raw tree/catalog差分と対象全行inventory、共通producer受入をActionsへ接続。管理Issueを永続状態と通知IDにし、独立dead-man-switchでrun不在も検出。実行条件と費用を測定 | 新表・NP以外の新概念・既知未対応増加・取得/通知/状態障害を分類。同じ問題の再実行・通知直後crashで重複なし。コード変更だけでも再検査。schedule停止を外部から検知 |
| 5. 配信整理・全体gate | `public/master`の大型配信を撤去し、固定baselineを開発fixtureへ隔離。README・architecture・calculation・testing・development・出典文書を実挙動へ更新 | Node/Worker/実UIの実経路、保存保護、初回/更新/未変更の時間・転送・端末保存、Actions時間/転送/artifact・watchdog費用を測り、[最終gate](testing.md)を通す |

段階はレビューできる責務単位とする。局所修正が同じ原因に対して増えたら、目的・不変条件・所有境界・直接callerをまとめて再検討し、この文書の計画を更新する。旧APIの温存や互換層で取り繕わない。

チェックは各達成条件と直接consumerの証拠が揃った時点で付ける。作業開始や部品の追加だけでは完了にしない。検証結果にはrevision、入力identity、実行コマンド、結果、未達条件を記載し、個人環境のpathや調査logを公開cloneの依存にしない。

- [ ] **0. Atlas publication API公開**: 抽出成功とimmutable配信を上流で実装・公開し、実browserと失敗注入で証明する。
- [ ] **1. 共通raw受入**: 固定publicationのNode/Worker一致、無コード更新、未知/混在拒否を証明する。
- [ ] **2. 数値規則と共通計算**: 既知係数の更新がcalculator/rankingに同じ入力版で反映する。
- [ ] **3. 端末の取得・保存・UI**: Atlasから実UI・計算へ到達し、失敗/競合でactiveと利用者データを保護する。
- [ ] **4. 監視と独立watchdog**: 実Actionsで新概念・障害と重複防止を示し、run停止を別時刻基盤で検知する。
- [ ] **5. 配信整理・全体gate**: 大型masterを製品から撤去し、実費用と[最終gate](testing.md)を示す。

現在の到達点: 2026-10-12に現行consumer、raw入力43表、上流の公開コードと実API、保存・計算・監視・費用をread-onlyで調査した。固定JP rawでは通常servant 470件、CE 2,706件、MC 28件を起点に、既知のskill/NP/function/buffと素材・係数の結合が成立した。旧nice入力と比較した成長6,370配列、17クラス相性289組、5属性相性25組に差はない。新しいservant 1件とCE 6件、入力から発見するcallback skill 25件を実装検証の対象にできる。これらは**変換器・ブラウザー取得の成功ではない**。checkpoint 0〜5はすべて未達。製品配信・利用者データは変更していない。

次の操作: **checkpoint 0を具体化する。** 現行公開APIの不足は実応答・OpenAPI・公開実装で確認済み。Atlas側に下記のpublication契約、抽出成功の根拠、旧版保持・利用条件を示し、上流変更の受入先とdeploy方法を確定する。上流の協力が得られれば公開実装と失敗注入を先に完了し、その実応答でFGO Labの取得単位・receiptを固定する。協力が得られなければ、直接Atlas API取得というゴールは外部依存で未達と明示し、可変APIや自前proxyで代用しない。調査だけを目的とする本セッションでは製品コードへ着手しない。

### Atlas APIへ確認・依頼する完成形の公開契約

2026-10-12に実[OpenAPI](https://api.atlasacademy.io/openapi.json)を再取得して109 pathを確認した。`/raw/{region}/info`はregionのみ、`/raw/{region}/skill/{skill_id}`と`/raw/{region}/function/{func_id}`は個別ID・展開指定等のみで、いずれも世代指定がない。実GETでは`/info`、`/raw/JP/info`、`/raw/JP/skill/961313`、`/export/JP/info.json`にCORS `*`があり、`/raw/JP/skill/961313`は結合済みの複数表を返すが、応答は同一世代へ固定されない。固定rawの同skill 1行・skillLv 10行とこの実応答は一致したが、単一skillの一致は全入力の同一世代保証ではない。`/raw/JP/skill/961313`へ無効な`hash`・`commit`・`snapshot` queryを付けても、無指定と同じ1,575 bytes・SHA-256を返した。これは隠れた版指定として使えない。`/info`と`/raw/JP/info`にETagはなく、exportのETagはbrowserへ`Access-Control-Expose-Headers`で公開されていない。これは各URLの現状確認であり、完成世代の保証ではない。版付きraw表API・完成receipt・公開後保持の契約は現行OpenAPIから確認できない。

実Chromiumを`https://example.com` originから動かすと、`/raw/JP/info`、`/raw/JP/skill/961313`、`/export/JP/info.json`と`static`の`mstClass.json`はfetch成功、exportの`ETag`はJavaScriptから読めず、Gitea `/api/v1/repos/.../branches/JP`はCORSでfetch失敗した。[現行router](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/routers/raw.py)は現在DB/Redisからraw entityを組み立てる。実稼働版と一致する公開実装には、全raw表を版付きで配るroute、完成世代のpublication、immutableな旧世代保持の仕組みがない。[API側のREADME](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/README.md)が参照する`assets.atlasacademy.io/GameData/JP/master/mstClass.json`は通常User-Agentなら`static.atlasacademy.io/JP/master/mstClass.json`へ転送され、`files.txt`と`gamedatatop.json`は404。`static`の`mstClass.json`は正しいcommit hashでも無効なhashでも無指定と同じ7,965 bytesで、`/JP/{commit}/master/mstClass.json`は404。調査用Pythonの既定User-Agentではassets側が403になるため、その403を一般のbrowser利用不能という根拠にはしない。

**着手前に決める取得契約:** API pathの名称より、以下を一つの公開単位として実証する。Atlas側の返答が現在のAPIと異なるなら、この節と取得単位・費用見積を先に改める。コードを旧想定に合わせて継ぎ足さない。

1. JPの抽出・検査が完了したfull raw commit/tree、抽出元/データ版と成功状態、単調増加するpublication sequenceとimmutable manifest digestを小さい`current`で識別できること。manifestには**source全表の一覧・内容digest**を含め、Actionsは対象外の新表・fieldも監視する。commitだけで抽出元の整合を認定しない。製品に必要な初期43表の全行と、入力から見つかる追加参照の表を同publicationで読めること。
2. raw表と同じ取得単位へschema/enum catalogとregion、表示言語資源を束縛すること。source外で作るcatalogには生成器版とdigestを含める。複数URLの全入力には内容digestまたは同等の不変性が要る。現在値だけの追加APIは受け入れない。
3. browserから必要URLをCORSで読め、条件付き確認のheaderを公開すること。旧generationの保持期間、429/Retry-After、同時取得の上限、帯域・利用条件を確認する。
4. raw sourceとcatalogの公開が完了し、全参照が読める後にだけ`current`が切り替わること。失敗・並行公開・途中停止時は旧世代を維持する。`/info`前後一致、個別ETag、取得bytesへ付けた独自hashは代用にならない。

確認依頼に対する受入証拠は、(a) 公開仕様と維持対象の上流実装で抽出成功・同一tree・表/catalogのdigest・原子的`current`を説明できること、(b) 実JP publicationでsource全表manifestと現行機能が要する43表・追加表・catalogをNodeとbrowserから取得し各digestを照合できること、(c) 取得中に次世代へ更新しても旧publicationを読み切れ、未完成・失敗した世代が`current`に出ないこと、(d) CORSの実browser確認、未変更確認の応答、旧世代の保持期限、rate/帯域条件を得ること、の4点とする。公開仕様だけ、実応答だけではgateを通さない。Atlas側の公開実装・運用が確認できるまでは(c)を仮定で埋めない。

上流への確認文面は「JPの抽出成功を示すpublication ID・sequence・full source treeを返す`current`、source全表digestのimmutable manifest、同IDで現行43表と将来の追加参照表・数値enum/trait等のcatalogをimmutableに取得できるAPIを共同で実装・公開できますか。抽出成功判定、全入力digest、原子的current、旧版保持、browser CORS、未変更確認、rate条件、失敗・並行公開・中断時の挙動と検証用publicationを確認したいです。」とする。問い合わせの送信は本調査には含めず、公開資料・実応答から確定できない外部依存として残す。

Atlas側は抽出・検査が成功したraw commitが参照するblobをimmutable API資源として公開し、その表一覧・digest・版付きcatalogの用意を完了してから`current`を切り替える。公開中は旧`current`を保持する。API pathや表の分割単位は、同一commitの証明と費用実測を満たす形で決める。FGO Labが確認する反例は、raw抽出・catalog生成中断、並行更新、参照先取得中の次世代公開、旧世代保持期間の終了である。これらで完成前の候補が見えず、旧世代または明示的な取得失敗になることを確認する。

公開実装から見る変更箇所は、[data読込みと版更新](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L791)および[export生成](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L547)の前後に、抽出成功を確認できる固定source treeからのstaging生成・digest照合・immutable公開・最後のcurrent切替を置く部分と、[raw router](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/routers/raw.py)または静的配信へ世代固定資源を出す部分である。現行`gamedatatop.json`のdataVerやGit commit単体は抽出成功receiptではない。raw repositoryの公開情報から抽出器の成功判定・失敗時のcommit公開禁止・旧publication保持運用を確認できず、ここはAtlas側の仕様・実装証拠が要る。FGO Lab側だけで現行APIを繰り返し読んでも、この不足は解消しない。

上流から同等の既存保証が提示されたら、URL・保持期間・CORS・混在反例をこの記録に追記して設計を再開する。保証がない場合は可変nice APIやGit取得の組合せでactivationを完成扱いしない。raw→canonicalの全変換と選択取得の費用もcheckpoint 1・2の必須証拠であり、取得失敗時の暗黙の配信元切替は設けない。

## 検証

- 固定したAtlas raw commit由来の完全入力をNodeと実browser Workerへ同じbytesで渡す。全入力receipt、raw join、参照閉包、canonical bytes/digest、語彙分類、拒否理由を照合する。現在のraw-hp fixtureはservant/CEだけなので、新経路の完全入力fixtureを追加する。既存goldenは再生成しない。
- 同じ製品buildと正規化器で、初期snapshot→新servant/CE・参照・既知係数の更新をAtlas経路へ供給し、実UIの取得→選択→calculator/ranking→詳細→保存/復元まで検証する。成功ケースでは製品コードや自前masterの変更を挟まない。
- 未知field/新効果/新演算、参照欠落/循環/異内容重複、異commitのraw表混在、追加参照・catalogの版不一致を拒否する。特に`/info`前後一致なのに一部入力だけ更新済みという現行APIの反例を含める。
- timeout/429/途中切断/壊れたJSON/保存容量不足/transaction abort/Worker crash/commit直前直後crash、複数tab競合・通知脱落を確認。元のactive bytes/identity、user store、draft/historyが保持されることまで照合する。
- 更新前のranking返信・detail・handoff、calculator非同期保存を遅延させ、active変更後に拒否されることを実callerで確認。共有結果の同版一致/不一致、異版historicalOnlyを確認する。
- 未変更では大型本文取得、normalizer実行、active保存がゼロであることをnetwork/呼出記録から確認する。大きいゲームJSONがpublic/.next配信物へ入っていないことも検査する。
- full source commitだけが変わりcanonical入力表のdigestが同じケースでは、master identityと計算結果を維持し、確認済みsourceだけを小さいmetaに進める。canonical入力のbytesが変わり出力bytesが偶然同じケースでは、別identityとして再検証する。両者をActionsのsource全体監査から切り離さない。
- monitorはfixture/API mockでschema変化・宝具以外の概念・既知未対応増加・通信障害を再現。実workflowのmanual runで権限、管理状態、Issueの重複防止、artifact保持を確認する。fixtureだけの成功をActions実運用の成功と呼ばない。
- 局所`test:diagnostic`→対象E2E→`test:docs`→最終`pnpm quality`。productionを含め、変更契約を所有する登録auditを追加する。matrixが必要な場合はdocs/testing.mdの手順・固定期待値・時間/並列条件を守る。cap/timeout/ratchetを緩和しない。

## 費用・性能の測り方

調査時の参考値として、自前masterは32,953,998 bytes、同じローカルbytesのgzipは2,755,994 bytes。Atlasの主要4つのnice exportはHEADのidentity表現のContent-Length合計92,688,305 bytes。手元の旧固定4export 91,887,896 bytesをgzipすると8,235,278 bytesだが、現在のAtlasの実転送量でも採用するraw表の総量でもない。Git raw masterは441表316,029,261 bytes、上流entity組立を広めに辿った73表候補は165,330,506 bytes、現製品fieldとbuff補助から選んだ43表候補は66,046,567 bytes（いずれもidentity表現）。43表の表別gzip level 6合計は手元で3,260,165 bytes。これはHTTPの圧縮wire bytesではなく、端末peakも未実測。初回取得が軽くなるとは主張しない。大きい自前配信を除くと、取得負荷はAtlas側と利用端末側へ移るため、利用者の待ち時間・上流アクセス量も測る。

測定条件は初回、未変更、既知更新、参照追加、拒否、network障害、保存失敗を分ける。browserとNodeでURL別request数・wire bytes・展開bytes、取得/parse/参照/変換/検証/保存の時間、Workerと主threadのmemory peak、IDBとcacheの保存量を記録する。browserのResource Timingに上流Timing-Allow-Originがなければ実ブラウザー観測/CDP等で転送量を取る。headersのサイズを実転送量へ代入しない。

Atlas publication側では生成・検証・公開の時間、immutable表の実保存bytesと保持期間、`current`/manifest/表のrequest数・転送bytesを測る。端末側の初回・更新・未変更の測定と合わせ、負荷をAtlasへ移した分も示す。Actionsはbootstrap/installを含むrunnerの全実行秒数とfull scan時間、上流request数と転送bytes、GitHub API回数、artifact/upload bytes・保持日数、cache使用量、独立watchdogの利用料金を測る。既存CIの実使用量・retention・アカウント枠と合わせる。依存installは小さい版確認で変更が必要と分かった後に行う構成を検討する。

30日・周期h・変更run数Cとして、R=30*24/h、月実行時間=(R-C)*軽量run時間+C*変更run時間、上流転送=(R-C)*軽量確認bytes+C*変更取得bytesを算出する。失敗/再試行を別に加算し、実runで補正する。artifactのピーク保持量とGB-hoursも示す。数値が測れてから6/12/24時間の案を比較し、未測定の金額を0円と断定しない。

GitHub public APIでivgtr/fgo-labのvisibility=public、default_branch=main、archived=false、Issues有効、CI workflow有効を確認した。直近成功CI jobは1,025秒、失敗CI jobは1,484秒で、公開artifact APIに残る2件は165,188,261 bytesと236,145,285 bytes（計401,333,546 bytes、保持14日）。これはmonitorの実行時間ではなく既存CIの実測である。現行[GitHub料金資料](https://docs.github.com/en/billing/concepts/product-billing/github-actions)ではPUBLICの標準runnerは無料だが、artifact/cacheの保持量・GB-hoursとlarger runnerは別条件。所有者の請求APIは現在の認証権限では404で利用量を取得できず、実請求額は未確認。権限追加や秘密値の参照はしていない。

現行のOpenAPIのgzip応答は97,985 bytes（identity 680,520 bytes、ETagなし）、`nice_enums.json`は15,222 bytes（identity 48,310 bytes、ETagあり）。これは旧方式の観測参考であり、raw APIの小さい`current`/catalog確認の実測値ではない。6/12/24時間で月120/60/30回という呼出数だけを先に比較し、実workflowのbootstrap、API呼出、full scanと共に測る。serverHashだけでraw schema/enum不変を断定しない。

性能比較は同一source/master/input/build・Node・並列・gzip条件で前後各3回。Worker・共有・遅延chunkを含む配信JSを合算する。HTTP初回/未変更の計測とranking計算の計測を混ぜない。

## 外部依存と実装開始の境界

Atlasへの最初の作業は「既存APIで可能か再確認する」ことではない。現行公開経路では不足が実証済みなので、publication APIの仕様、抽出器が成功を確定する位置、Atlasの公開先と保持・帯域条件を上流管理者と確定し、上流変更を提出・検証・deployする作業である。API repositoryの[現行`load_and_export`](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L860)は失敗後にも可変exportへ進めるため、既存の版更新へmanifestを後付けするだけでは成立しない。固定treeから独立stagingを作り、抽出成功の証拠と全digestを揃えた後の一回のpointer切替へ責務を移す。実稼働Atlasの公開がなければ、ローカルfixtureの成功や上流への提案だけでcheckpoint 0を閉じない。

上流へ送る内容は前節の公開契約と失敗注入の受入条件に限定する。外部Issue等の送信は明示的な指示がある場合に行う。Atlasが仕様・実装・deployを受け入れられない場合、直接Atlas APIから安全に自動追従する全要件は現在の権限・配信元では達成不能と記録する。自前mirror、可変APIの二度読み、Git pack解析、未証明snapshotの利用へ目標を縮めない。この外部依存が解決してから上表のcheckpoint 1〜5を進める。

このセッションでは製品テスト・build・全データ生成は未実行。製品のraw取得・変換・保存・監視は未実装。未達条件はAtlasのpublication公開、共通変換と実利用経路、独立watchdog、費用の実測である。
