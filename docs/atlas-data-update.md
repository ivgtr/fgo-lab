# Atlas直接取得・自動追従・未対応監視の実装計画

設計確認日: 2026-10-12。対象revision: adafb00940ebc2ac4f691065c6c6545c4cd420bf。
直接取得・自動更新・定期監視は未実装。この文書は[アーキテクチャの設計要件](architecture.md#atlas直接取得と自動更新の設計要件)を実装へ接続する取得契約・責務・達成条件を定める。チェックポイントの状態と再現可能な証拠をここで管理する。

## 結論と成立条件

完成形は、Atlasが**抽出・検査済みの一つのsourceから作る自己完結したraw入力**を一つのAPI応答として公開し、browserが直接取得する形とする。Webのdeploy先は大型ゲームデータを配信しない。人が管理する版番号や過去世代の選択APIは設けないが、calculator/rankingと保存結果を区別するため、端末内では受信内容・変換器・規則のdigestを保持する。監査は独立した実行プロジェクトがAtlasのraw Git source・schema/enum source・公開APIを照合し、停止は独立watchdogが検出する。Webのdeploy先からmaster/manifest/監査データを配信せず、固定回帰入力は製品buildから隔離する。

最終ゴールは、**Atlas APIを唯一の大きいゲームデータ配信元とし、端末が最新の完成済み入力へ安全に自動追従すること**。FGO Labはraw語彙からcanonicalへの唯一の意味変換・検証、端末内activeの切替、監視と利用者への状態表示を所有する。新しいservant・礼装・既知係数の追加はアプリ再deployも自前masterの再配信もなく反映する。未知の意味を含む候補は拒否し、既存の互換activeと更新失敗を明示する。「Atlasで現在公開中の入力」と「最後に安全に受け入れた入力」をUI上でも区別する。

| 元のゴール | 達成と判断する観測結果 |
| --- | --- |
| 自前serverからの大型データ送信をなくす | Vercelのbuild出力・実URL・Service Worker cacheにraw/canonical masterがなく、browser networkにAtlas直接取得が現れる |
| 未変更時の無駄を抑える | Atlasの一つの完成済み入力に条件付きGETまたはHEADで変更を確認し、未変更なら大型本文・変換・active書込みを省く。変更時にAtlasから端末へ全入力を送る量は削減目標にしない |
| 既知のAtlas更新へ自動追従 | アプリ再deployなしで新servant/CE・既知係数・追加参照がAtlasの完成済み入力からcalculator/rankingまで反映し、同じ入力identityを使う。未知の意味・欠損・取得失敗では旧activeを保持する |
| 監査をWebから分離する | 独立Actions projectがraw全体・schema/enum・公開API・production buildを別々に調べ、根拠付きIssueの重複と監視停止を検出する |


Actionsは端末更新の中央承認者にしない。scheduleは遅延・停止し得るため、各端末が同じ契約で候補を検証して切り替える。Actionsは端末より広い語彙を観測し、未知・未対応・監視障害を重複なく開発者へ届ける。小さい自前manifestを後から作ってAtlas応答のhashを並べても、元の応答が一世代だった証拠にはならないため、それを上流の完了通知の代用にしない。

データ面は**Atlasが公開する自己完結した単一raw応答**を採る。変換済みniceを上流とFGO Labで二重に意味変換せず、FGO Labがraw→canonicalを唯一所有する。AtlasのGit treeは公開入力の生成元を固定する材料であり、監査プロジェクトの独立したraw語彙入力にも使う。Git transportはbrowserの製品経路にしない。Atlasの現行DB/Redis APIや可変CDNの個別応答を一つの入力と推定しない。新APIの実装・公開・実応答検証を第一checkpointとし、上流の協力がなければ達成不能と記録する。自前mirrorやproxyに置き換えて完了扱いしない。

現行[Atlas OpenAPI](https://api.atlasacademy.io/openapi.json)にこの取得契約はない。Atlas側の協力・公開までを完了条件とし、APIが未公開のままFGO Lab側の部品だけを完成と呼ばない。

### 利用者の振る舞いから決める受入境界

Atlas APIを製品の取得元とする。初回は取得・検証・保存が終わるまで計算可能なmasterを見せず、進行状況または再試行可能な失敗を示す。互換性を確認できるactiveが端末にある場合は先にそれでUIと計算を開き、更新を背景で調べる。更新候補に未知の意味、欠損、矛盾、生成元の不明点があれば切り替えず、activeの出典と更新失敗を明示する。上流取得失敗のたびに既存masterを消したり、自前配信先から補ったりしない。新候補は全入力の受入後に一回の保存transactionで切り替え、calculatorとrankingは同じidentityへ同時に移る。切替前の計算結果・共有結果は新しいmasterで計算したものとして扱わない。

この振る舞いに必要な保証を、候補内部の**意味・参照整合性**と、候補全入力の**生成元の整合性**に分ける。前者は共通validatorで確認できる。後者はAtlasが成功済みsourceから全表・catalogを組み立て、完成した一つの応答へ公開pointerを原子的に切り替えることで保証する。取得後にbytesへ自分でhashを付けても、`/info`の前後一致や個別ETagを照合しても生成元の整合性は証明できない。現行公開APIの複数応答だけを使う初回activationは安全と認定しない。

Atlas側の公開契約が決まる前に取得器・receiptの形を固定しない。調査用に固定したGit commitは上流APIの受入試験とNode/Worker比較の入力に使えるが、製品ブラウザーがGitから読む設計ではない。上流の単一raw応答・原子的公開・更新反例が揃ってから、FGO Labの入力・保存契約を確定する。

2026-10-12の追加調査で、AtlasのrawゲームデータGit repositoryにはimmutableなcommit/tree/blobがあることを確認した。一方、通常のGit APIは実ブラウザーでCORS拒否され、Git packのRange取得は専用clientの維持が要る。完成形でAtlasへ求めるのは、同じ成功済みsource treeに束縛したraw表とcatalogを**一つの完成応答**としてAPIから読む契約である。APIがraw bytesを返すなら、Atlasのnice変換器版を入力identityに含める必要はなくなる。FGO Lab側に必要なraw join・意味変換は一つの共通実装として作る。自前hash一覧、二回の同一取得、待機時間、infoの前後一致で上流の公開保証を埋めない。

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
| [ci.yml](../.github/workflows/ci.yml) | PR/push/manualのquality:ciだけ。全.test-resultsを14日保持 | deployしない監査アプリの専用workflowを追加し、CI全qualityと独立して実行する |

rawの意味はdata-pipeline、scenarioはcalculation-application、順序付き状態遷移はbattle-execution、数値演算はcalc-coreのままにする。UIやWorkerへキャラクター固有解釈を移さない。

### 配信と監査のプロジェクト境界

| プロジェクト | 実行場所と入力 | 出力・権限 |
| --- | --- | --- |
| `apps/web` | Vercelではこのアプリだけをbuild。ブラウザーの取得WorkerがAtlas APIをcross-originで直接GETし、共通data-pipelineを実行する | HTML/JS/CSS/小さいbuild provenanceを配信。raw/master、データproxy、API route、構造化データのService Worker cacheを配信しない。検証済みactiveと利用者データは端末のIndexedDBにのみ保存 |
| `packages/data-pipeline`等の共通ライブラリー | raw契約、参照発見、意味変換、canonical検証。browser Workerと監査CLIが**同じrepository revisionの同じ実装**をimport | ゲームデータ本文をpackageへ埋め込まない。Node専用I/Oと監査通知をbrowser依存グラフから外す |
| 新設`apps/data-audit` | GitHub Actions上の独立実行プロジェクト。Atlas raw Gitのimmutable commit/tree全体、Atlas APIのschema/enum source、公開OpenAPIと製品用の単一raw応答を観測する | 全語彙inventory、製品受入、障害を分類し、管理Issueと根拠付き通知を更新する。Vercel projectを作らず、masterやraw全量をdeployしない |
| Atlas側 | 成功済みraw sourceとcatalogから自己完結した単一raw応答を公開する | Atlas APIが大きいゲーム入力の唯一の製品配信元。FGO Labのdeploy先や監査projectはその代替配信元にならない |

同じmonorepo内の**二つの実行プロジェクト**とし、別repositoryへのpackage複製・release同期は増やさない。独立性はworkspace依存方向、Vercel build入力/出力、HTTP公開経路、Actions権限で検証する。現行は[webのpublic/master](../apps/web/public/master/manifest.json)に約33 MBのmasterがあり、[repository.ts](../apps/web/src/adapters/repository.ts)は同一originから取得し、[cli.ts](../packages/data-pipeline/src/cli.ts)はそこへ書き込む。Next.jsの`public`はURLで配信されるため、この三つの経路を廃止しなければ「deploy先で配信しない」は成立しない。[Next.js public仕様](https://nextjs.org/docs/app/api-reference/file-conventions/public-folder)。公開[開発ガイド](development.md#buildとデプロイ)はVercelのRoot Directoryを`apps/web`、workspace外sourceの取込みを有効にすると定めている。実dashboard設定は未確認なので、fixture・監査appを公開build入力から除く設定と実deployの出力検査も必要。[Vercel monorepo仕様](https://vercel.com/docs/monorepos/monorepo-faq)、[.vercelignore仕様](https://vercel.com/docs/deployments/vercel-ignore)。

配信gateはbuild成果物と実URLの両方で確認する。`/master/master.json`、`/master/manifest.json`および同等のdata routeは404、配信JS/static/functionとService Worker cacheにraw/canonical本文を含めず、初回UIのnetworkにはbrowser→Atlasの直接GETが現れることを検査する。監査runを起点とするVercel deployやraw/master uploadも許さない。小さいbuild provenanceにはdeployed commitと変換契約fingerprintだけを含め、監査は現在のproduction buildとmain上の候補buildを区別して受入検査する。

## 上流入力の調査と現在の不足

2026-10-12のHTTP read-only確認:

- `/info`のJPはhash=5d3cbc、timestamp=1791730860。
- `/export/JP/info.json`は同じJP hashのほかserverHash=35cadc、dataVer=2681等を持つ。入力ごとのdigest、snapshot manifest、immutable URL一覧は含まれない。
- `/openapi.json`が申告するAPI版は6.0.0、serverHashは35cadc。上流GitHubで解決したcommitは35cadc444e20c78cc60e56082ad1b64607d4d2e2。現master a937bbb0f7eced10f45f57568786da10d9994027も同じ問題を持つ。
- 上流[app/tasks.py](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L99)は各exportを既存pathへ個別に書く。[generate_exports](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L547)は定数、各export、servant/equipを順番に生成し、FGO Labが使う既定言語exportより後でinfoを更新する。ただしinfo更新後も別のexport生成が続く。公開コードからは全体のatomic publicationを確認できない。実CDNの運用までコードだけで断定しない。
- 稼働中のserverHashに一致する同revisionの[load_and_export](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L857)では、DBとRedisの読込み後、`update_master_repo_info`が`/info`用のRedis版を**export生成前**に更新する。読込み中の例外を記録しても後段のexport生成へ進み、export生成中の例外も記録して戻る。したがって`/info`の新版は完了通知ではない。例としてraw repository更新後にDB読込みが失敗すると、新rawから作る係数と旧DBから作るservantが混在し得る。これは公開コードから導く失敗経路であり、実運用で発生したとの主張ではない。[旧/新の`/info`一致](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/main.py#L321)だけで混在を否定できない理由になる。
- [DB import](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/db/load.py#L554)はtable groupごとのtransaction、[Redis import](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/redis/load.py#L22)はkeyごとのdelete/writeで進む。失敗時に全DB/Redisを一括rollbackする構造ではない。このため単一raw応答を新設するなら、読込み成功後の一貫した生成元から作り、失敗時は現在公開中の完成応答を維持する必要がある。並行更新を排除する運用・実装契約も確認する。
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

JP commit `5d3cbcc79ebcea42ec99dbecd5279e6e64effa3c`の43表を同じGit treeから読んだ。調査用のpartial cloneを使ったので、これはAtlas製品APIの公開成功・CORS・一応答の整合性の証拠ではない。現行[正規化器](../packages/data-pipeline/src/snapshotNormalization.ts)が採る`collectionNo > 0`かつtypeがnormal/heroineのraw 470 servant、typeがservantEquipの2,706 CE、`mstEquip`の28 MCを起点に、上流の[skill join](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/db/helpers/skill.py#L27)・[NP join](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/db/helpers/td.py#L19)に従って調べた。手元の旧nice入力との差は通常servant ID `705400`とCE ID `9312570`, `9409490`〜`9409530`の計7件で、将来の無コード更新検証に使える。

| canonical用途 | 固定rawで確認した結合・値 | 実装で保持する検査 |
| --- | --- | --- |
| servant/CE・成長 | `mstSvt.id`→`mstSvtLimit.svtId`、`mstSvt.expType`→`mstSvtExp.type`。最高limitのbase/maxと`curve/1000`によるHP/ATK成長は旧niceの485 servantと2,700 CE、計6,370配列と全件一致 | `(svtId,limitCount)`と`(type,lv)`の一意性、必要levelの連続性、上限・計算丸め。旧fixtureと新版rawを一世代と見なさない |
| skill/NP/MC | servant/CEの`mstSvtSkill.skillId`、passiveの`mstSvt.classPassive`、MCの`mstEquipSkill.skillId`→`mstSkill.id`→`mstSkillLv.skillId`→同じ位置の`funcId`/`svals`→`mstFunc.id`→意味に応じた`mstBuff.id`。NPは`mstSvtTreasureDevice.treasureDeviceId`→`mstTreasureDeviceLv.treaureDeviceId`、releaseは`(svtId,num,priority)`で結合 | 位置・level・priority・releaseの保持、重複key/長さ不一致の拒否、raw数値enumと位置付き値の厳格解釈 |
| 追加参照 | 広めのrootから直接skill 7,316 ID、既知の`SkillID`とcallback buff type 160/203の`Value`から追加25 IDを発見し、同一表内で全件解決。残りの固定28参照の3 IDはrootに既存。NPを含む738 TD、2,682 function、1,066 buff、`DependFuncId*`から10 functionも同じ43表に存在 | 値をIDと解釈する条件をregistryで一元化し、参照元・位置・levelのedgeを記録。未知の参照形、欠落、循環は拒否。これらの件数は調査用走査であり共通変換器の成功証拠ではない |
| 素材・BP | `mstItem`のuse区分はraw fieldでなく[上流item生成](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/data/item.py#L21)が全`mstCombineLimit`/`Skill`/`AppendPassiveSkill`から導出する。旧niceの採用152素材IDと固定rawの導出集合は一致。BP 2 IDは`mstBattlePoint`/`Phase`/`mstSvtBattlePoint`で閉じる | 素材IDと個数、BP位相・資格の検査。Mashの`combineLimitId=800100`に対応する行は無いが、上流も空の昇段素材として扱う明示的な省略であり、一般的な欠損許容へ広げない |
| 数値規則 | `mstClass.attackRate`と`mstClassRelation(atkClass,defClass)`は既存17クラスの全289組で現行値と一致。`mstAttriRelation`の5×5、`mstCard(id, num=1)`のArts/Buster/Quick 1000/1500/800、`mstConstant.ATTACK_RATE=230`も一致 | class/attribute/cardの数値ID→意味名は同じ完成応答に含むcatalogで定義。既知classの値変更はmaster更新で追従し、新class/cardの意味は未知として拒否 |

level配列は固定rawの`mstSkillLv` 47,647行で`funcId`と`svals`、`mstTreasureDeviceLv` 9,232行で`funcId`と`svals`〜`svals5`がすべて同長だった。代表的な17表の主keyにも重複は無かった。変換器はこの観測を既定値にせず、候補ごとに再検査する。trait名、class名、function/buff/target/condition/cardの数値enum、`FUNC_VALS_NOT_BUFF`はraw表のfieldだけからは復元できず、上流[enum定義](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/schemas/gameenums.py)と[trait定義](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/schemas/enums.py#L1127)に相当する**同じ完成応答に含まれるcatalog**が必須である。

この固定世代では既知のjoinと追加参照に43表内の未解決IDは無かった。ただしraw script・位置付きparameterの**全ての未知の意味**を調査用走査で解釈したわけではない。実装の共通registry/parserで全fieldを分類し、NodeとWorkerの生成結果を照合して初めて受入閉包と認定する。新しい参照形式や表が現れた世代は拒否し、Actionsの監視へ根拠を渡す。

- 画像については、現製品の`imageKey`がservant初期顔、CE顔、MC・素材・skillのアイコンURLを使う。[Atlasの画像URL生成](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/core/nice/svt/asset.py#L77)と[URL規則](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/schemas/nice.py#L111)では現在の主要画像をrawのIDと定型pathから組み立てる。現masterのservant・CE・MC・素材の各1例はAtlas staticでHEAD 200とCORS `*`を確認した。現UIが使う初期顔には`mstSvtExtra`を使わず、同表のniceでの用途はbond/Valentine情報と一部costume IDである。現UIの画像URL生成だけならrootの大型asset catalogを必須入力とする根拠は見つからない。画像URL規則と取得baseは変換器版で固定し、新画像の存在は実UIで検査する。
- 実ChromiumからGitea `/api/v1/repos/.../branches/JP`、`/git/blobs/{sha}`、`/raw/master/...?...`をfetchすると、`Access-Control-Allow-Origin: *, *`という重複値でCORS拒否される。Pythonで各応答に二つの同名headerがあることも確認した。これはbrowserのfetch設定で解消できない。
- GiteaのGit HTTP `/objects/{sha}`と`/objects/pack/*.idx`はbrowserからCORSで読めるが、必要なblobの多くはpack内にある。`git-upload-pack`のPOSTはbrowserでpreflightが400となり、simple requestは本体が400となる。packのRange GETは206で成功する。`mstBattlePoint.json`の203-byte rangeから335-byte blobを復号し、Git blob SHAと一致することまで検証した。現公開packの最大は32,733,824,054 bytes、index総計は7,254,320 bytes。必要な現在blobの例`mstFunc`（6,567,712 bytes）、`mstSvtLimit`（9,184,397 bytes）、`mstSvtSkill`（1,932,755 bytes）はpack中の通常blobと確認した。pack全体の転送が必須だとは主張しない。rawをAtlas APIの単一完成応答で配信すればbrowserのGit pack解析は不要になるが、raw joinと意味変換はFGO Labが所有する。
- 小さい`NiceClass.json`を`?hash={JPのfull commit}`と`?hash=definitely-invalid`でもGETした。双方とも版指定なしと同じ30,970 bytes・SHA-256・ETagを返した。このqueryは版指定として機能しない。固定入力の`referenced_skills.json`には28件あり、例の`/nice/JP/skill/961313`は取得できるが版を指定できない。実GETの応答は1,634 bytesで、本文にgeneration/版のfieldがなく、ETag・Last-Modifiedもない。HEADは405だった。
- ローカル固定入力の28件のreferenced skill IDは、`nice_servant`・`nice_equip`・`nice_mystic_code`のfunctionを持つ埋込みskill ID集合には**一件も含まれない**。単にbulk export内を探すだけでは現在の追加参照すら閉じない。現行OpenAPI 109 pathにはsnapshot/version/manifest/exportのrouteがなく、skillの版指定入力もない。これは公開APIで必要な追加参照の取得方法を上流へ確認すべき理由であり、将来の追加参照方式も固定28件から推定しない。
- この28件を固定JP raw commit `5d3cbcc79ebcea42ec99dbecd5279e6e64effa3c`で追跡した。`mstSkill`には28件すべて、同じcommitの`mstSkillLv`には対応する64行、`mstFunc`にはそこから直接参照する24 function IDがすべて存在した。Git blob SHAはそれぞれ`4e2167b4f17dc6842808306186cdd6bdd890a027`、`74dbf2e0b6e6f7e3e0d4207fc0ac665d1ec9613d`、`59a7c9687a94f6d416974023809f2cf238b0f8bc`と照合した。これは**固定fixtureの第一段の参照**が同じGit treeにあるという証拠であり、全servant/CEからの発見、function値内の再帰参照、buff等へのjoinの閉包や、製品browserのAPI取得保証ではない。
- `mstSkillLv`は12,112,638 bytesで、Gitea blob/contents APIはメタ情報のみ返し本文を返さなかったため、調査ではJP branchのpartial cloneから同commitのblobを読んだ。可変raw CDNの同名ファイルは2,777,245 bytes・16,881行で、この28件に対応するskill IDは3件だけだった。固定Git blobは47,647行であり、可変CDNをこのcommitの欠けた表の代用にできない。Git経由の取得は調査手段であって製品経路ではない。
- Atlasのraw配信`https://assets.atlasacademy.io/GameData/JP/master/mstSkill.json`もGETでき、2026-10-12の確認ではCORS `*`、1,163,559 bytes、7,107行だった。`mstConstant.json`・`mstSvt.json`も読める。しかし確認したURLは可変の現在値、`Cache-Control: max-age=86400`で、同じbaseの`files.txt`・`gamedatatop.json`は404。版付きraw URLまたは完成manifestは見つからず、現在のCDNを世代固定raw APIと同一視できない。
- 同じ日に[可変raw CDNの`mstClass.json`](https://static.atlasacademy.io/JP/master/mstClass.json)を取得すると38行・7,965 bytesだったが、[JP full commitの`mstClass` blob](https://git.atlasacademy.io/api/v1/repos/atlasacademy/fgo-game-data/git/blobs/1520cbee600fd3649b6137ca5ae55759f1340c50)は84行・27,684 bytesで、CDN側にないIDが46件あった。共通IDの行にもGit側だけのfieldがある。URLが返す本文をGitの当該commitのblobと見なせない**実例**であり、原因やCDN全体の状態はこの比較だけで断定しない。`mstCard`等の小表もbytes/blob SHAが一致しなかった。固定commitの表ごとのdigest照合が必要である。
- Atlas APIの[現行server実装](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/main.py)は429で`Retry-After`を返し、多数の小さいAPI呼出よりexportを推奨している。追加参照の参照閉包では並列上限・重複排除・Retry-After尊重が上流負荷の条件となる。Atlasが[公表するデータライセンス](https://atlasacademy.io/about-us/)はODC-BY 1.0で、実装後も出典表示を保持する。

必要なraw入力はnice export名から機械的に置き換えない。上記43表は**現行consumerから導いた初回受入試験の入力集合**であり、Atlas APIの固定表数や将来の参照先上限ではない。data-pipelineは既知の意味定義から必要な表種別を指定し、その表の全行から新しい参照IDを発見・解決する。未知の表・参照形式は推測せず拒否する。固定sourceの43表はidentity 66,046,567 bytes、表別gzip level 6の合計3,260,165 bytesと手元で測った。これはHTTP実転送量・端末peak memoryの代用ではない。[raw function値の解釈](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/core/nice/func.py#L129)は数値ID、位置、文字列内の参照で意味が変わるため、FGO Labのregistry・parser・参照解決で一元化する。

現行JP nice exportはGET/HEADで存在とCORS `*`を確認した。`NiceClass`は84件、`NiceClassAttackRate`は84 key、`NiceClassRelation`は75行、`NiceAttributeRelation`は5属性、`NiceConstant`は341 key、`nice_enums`は40 enum group、`nice_trait`は360 key、`nice_battle_point`は2件。個別の可変URLであり、同時取得しても一世代を証明しない。現行計算の17クラス相性はnice係数と一致し、Arts/Buster/Quickの`adjustAtk`は1000/1500/800、`ATTACK_RATE`は230で現行0.23に対応した。これはraw実装時の照合資料であってnice応答を製品入力とする根拠ではない。rawの出典field・単位・境界は別に同定し、固定期待値を再生成せずに照合する。

## 採用する取得契約と転送量の判断

ここで削減する送信は**FGO Labのdeploy先から各端末への大型master配信**である。Atlasから端末へ送る量は削減目標ではない。前案の表別descriptor/blobは部分更新の転送を減らすが、複数応答を揃えるための公開資源保持、端末cache、期限処理を増やす。ユーザーが求める一貫性と自動追従には、Atlasが必要なraw表とcatalogを一つの完成応答にまとめる方が直接的である。固定raw 43表のtar+gzip level 6は3,292,112 bytesで、変更時は全体を取り直す。この参考値を帯域上限や実HTTP応答量とは扱わない。

Atlas APIには、`GET /raw/JP/current?tables=<canonical順の表名>`が**一つの自己完結したarchive**を返す契約を求める。archiveには要求表の全行と、同じ入力に必要なenum/trait/表示資源等のcatalog、region、full source commit/tree、生成器の出典・契約、抽出とarchive生成の成功証拠、各入力のpath/bytes/digestを含める。表名はdata-pipelineの既知意味registryが決める。43表は調査例であり、ID追加の上限ではない。Atlasは一つの成功済みsourceから全内容を作って検証し、完成archiveへのcurrent pointerを原子的に切り替える。抽出・生成失敗時は前の完成応答を維持する。切替と並行するGETも、応答開始時に確定した完成archiveだけを最後まで返す。

同じURLで`ETag`と条件付きGETまたはHEADをbrowserから使えるようにする。未変更なら本文を送らず、変更時はarchive全体を返す。取得した端末はHTTP圧縮展開後のarchive全体と内部入力の長さ・digest・schemaを検証し、共通変換器へ渡す。Git treeのcommitや受信後に自分で付けたhashだけを抽出成功の証明にしない。Git treeにない必要入力やコード由来catalogも同じ応答へ含め、生成器と出典を明示する。APIはDB/Redisの可変値を別応答で後から補わない。現在の公開APIにはこの契約がないため、Atlas側の実装・公開・失敗注入がcheckpoint 0の必須成果である。

端末は起動・online復帰・利用中に条件付き確認を行う。未変更なら大型本文・変換・active書込みを省く。変更時は全archiveをWorkerで共通変換し、新servant/CEや既知の参照先IDを表の全行から発見・解決する。新しい表種別や意味は推測せず拒否する。検証済みmaster・その受入receipt・active pointerは一つのIndexedDB transactionで確定する。保存失敗や容量不足では既存activeと利用者の保存データを保持する。archiveの永続cacheは前提にせず、再取得が必要ならAtlasの現在の完成応答からやり直す。

変更時のAtlas→端末の転送量、Workerの展開・parse peak、端末保存量、Atlasの公開条件は実応答で測るが、Atlas側の全量送信を失敗条件にしない。条件付き確認のCORS、ETagの公開、429/Retry-Afterと未変更時の実wire bytesは検証する。版情報を完全に持たずに可変URLを順読みする方式は、複数入力の整合性を証明できないため採用しない。

### 端末の受入と保存契約

取得receiptにはregion、producerが提示するsource出典、archive全体と各入力のdigest、表/catalog一覧、実際にcanonicalへ入れた行・参照edge、変換器・受入契約・policyのdigest、canonical digestを記録する。master identityはcanonical生成に影響する入力と規則から決定的に作る。これは公開版の選択番号ではなく、計算・保存結果の比較に必要な端末内の識別子である。無関係な表だけが変わってcanonical入力が同じなら計算identityを保つ。canonical入力が変わり出力bytesが偶然同じでも再検証する。確認時刻はidentityに混ぜない。

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
| 初回、activeなし | Atlasの完成archive取得・検証・保存の成功後だけ計算可能にする。失敗は原因と再試行を表示する |
| 互換activeあり | activeを検証して先にUIを開き、起動・online復帰・利用中に背景確認する |
| 未変更 | 条件付き確認で同一内容と確かめた場合は本文取得、変換、active書込みを省く。確認metaだけ更新する |
| 新候補 | Workerで一つの完成archiveを取得し、全体と各入力のdigest・表/catalog・参照・意味・canonicalを検証してから一つのIDB transactionでactiveを切り替える |
| offline / 429 / 5xx / 途中切断 / 不整合 | 候補を拒否し、互換activeと失敗状態を表示する。activeなしなら計算不能とする。別配信先で補わない |
| quota / 保存失敗 / crash | 既存activeとuser storeを保持し、永続化できない候補を成功として使わない |
| 進行中の計算・複数tab | active identityの変更時にcalculator/rankingの古いreply、detail、handoff、保存を拒否する。DB transactionで期待active digestを比較し、競合した候補を破棄する。通知脱落はfocus時の再読取と次回のAtlas確認で回復する |
| draft/history・共有URL | request/resultのmaster・engine identityを保持。同じ入力なら検証して再利用し、異なる場合はhistoricalOnlyとして表示する。自動再計算・上書きをしない |

旧保存masterには新しい完成archiveの生成元証拠がないため黙って移行しない。新しいmasterを明示的に取得し、既存user store、profile、draft、history、backupを消さない。保存契約の変更で利用者データが読めなくなるなら実装前に影響を示す。`public/master`の固定baselineは開発fixtureへ移し、回帰期待値を更新のために再生成しない。

現行の直接callerでは、`bootstrapApplication`が候補確認・保存を待ってからUIを起動し、`loadActiveMaster`が検証失敗時にmaster storeをclearする。`stageAndActivate`は約33MBをstaging/masterへ重複保存する。rankingはmaster/context変更時のWorker再作成と旧reply拒否を備えるが、active切替起点はない。これらを保存・計算の一つの境界として変更する。Service WorkerはAtlas応答をshell代替や独自cacheの対象にしない。

## 独立監査プロジェクトとGitHub Actions

`apps/data-audit`はWebの起動・更新承認に介入しない。入力は三系統に分け、時点を混同しない。

1. Atlas raw GitのJP commit/treeから、全表/pathとroot資源の追加・削除・変更を検出する。変更表だけでなく、新表、新field、全skill/passive・NP・礼装・MC・BP・script・形態・係数を正規化**前**のscannerで分類する。raw Git commitはbytesを固定するが抽出成功の証明ではない。
2. Atlas API実装のschema/enum/trait定義と稼働中のOpenAPI・公開catalogを観測する。raw表だけでは分からない数値enumや新route、生成器差分を検出する。raw GitとAPI codeのcommitが異なっても一つのsnapshotと推定しない。
3. Atlasの**現在公開中の完成archive**をbrowserと同じ取得契約で検証し、共通data-pipelineをNodeで実行する。archiveのsource出典とraw Git HEADとの差・遅延、CORS/ETag/取得失敗、canonical未対応を別々に報告する。Webが配信する小さいbuild provenanceからproductionのcommit/変換契約を得て、そのrevisionの共通変換を実行する。mainの候補buildも別に検査し、「本番で未対応」と「次のbuildでは対応済み」を混同しない。

現在の`atlasInventory.ts`は宝具functionの`damageNp*`だけを数え、`productionAudit.ts`は正規化後で捨てられた入力を復元できない。raw scannerは全表のpath・field・値種別・意味候補・出現件数・例示IDを受入前に記録し、新しい表を内容を読まず「無関係」と決めない。未知の意味を全件列挙してから共通変換器の拒否理由と突き合わせる。Atlasが公開source/enumへまだ表していないゲーム規則の検出は保証しない。この限界を運用文書に明記する。

未変更runはraw Git HEAD、API source commit/OpenAPI validator、製品archiveのETag、監査コードfingerprintとproduction build provenanceを小さく確認する。すべて前回の**完了した**監査と同じなら大型取得・全変換・artifact uploadを省く。変更があれば不変treeから変更表と必要な基準を取得し、監査コード変更や基準破損時には全sourceを再走査する。Git fetchの転送量、全441表の展開量、製品archive取得量を別々に記録する。上流通信・検査・状態保存の失敗を未変更成功として扱わない。

小さい専用の管理Issueを監査状態の正本とする。最後の試行/完全成功、raw Git commit/tree、API schema fingerprint、公開archive digest/source、production build SHA、scanner/変換器fingerprint、inventory基準、問題fingerprint→通知Issue ID、metricsを機械可読で記録する。ArtifactやActions cacheを状態の正本にしない。problem fingerprintは分類・未知概念/field path/意味契約で作り、時刻やsource commitを無条件に入れない。open/closed Issueを機械markerで全page照合し、送信後に状態保存が失敗しても再実行時に同Issueを再利用する。同じ本文ならcommentしない。検索失敗・状態破損・編集競合を空状態へ補完しない。

専用workflowはschedule/manualを持ち、concurrencyを一つ、`cancel-in-progress: false`とする。PRから通知を出さず、jobごとに`contents: read`と通知/state用`issues: write`だけを付ける。GitHubの[concurrency仕様](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency)では全tickの実行は保証されないため、最終完全成功時刻と遅延を評価する。失敗時だけ最小再現証拠を短期間artifactに残し、raw全量やmasterをuploadしない。公開archiveが更新後に再取得できない場合に備え、Issueには出典commit、入力digest、ID/path、観測した値と拒否理由を再現可能な範囲で記録する。

GitHubのscheduleは遅延・drop、public repositoryの60日無活動で停止し得る。[GitHub一次資料](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。独立したwatchdogは完全監査と通知状態保存の後だけ成功pingを受け、予定時刻+許容遅延を過ぎたら運用者へ通知する。未起動・長時間停止と、起動後の取得/通知障害を両方失敗注入する。独立サービスのアカウント・通知先・料金は実装時に確認し、未設定なら停止監視は未達とする。6/12/24時間の周期は、実runの転送・runner時間・検知遅延から選ぶ。

## 実装単位と各達成条件

| 単位 | 作業 | 閉じる条件 |
| --- | --- | --- |
| 0. Atlas取得API | 成功済みsourceとcatalogから自己完結した単一archiveを作り、現在pointerを原子的に公開する。CORS・ETag・条件付き確認を契約化する | 実JP応答をNode/browserで取得。抽出失敗・部分生成・並行更新・GET中のpointer切替を失敗注入し、一応答の混在を受け入れない。Atlas側の実公開がなければ未達 |
| 1. 共通raw受入 | data-pipelineに厳格schema、catalog、join、参照閉包、inventory、決定的canonical/receiptを実装しNode/Workerで共有する | 同じ固定archiveでNode/実Workerの出力bytes・digestが一致。新servant/CE・既知係数・参照追加に無コード追従し、未知/欠損/矛盾を拒否 |
| 2. 数値規則と共通計算 | 係数・相性・card・定数をmasterへ移し、calculator/rankingが同じ規則・identityを使う | 既存17×17 class、5×5属性、3カード、0.23と固定期待値が一致。既知値だけの変更が両計算へ反映し、未知class/cardは拒否 |
| 3. 端末の取得・保存・UI | Atlasの単一archive取得Worker、原子的active、更新coordinator、計算/保存guard、SW対象整理を実利用経路へ接続する | 初回/更新/未変更/offline/429/hash/quota/crash/複数tab/計算中/共有結果を実UIで確認。成功時だけ切替。未変更の大型本文/変換/active書込みはゼロ |
| 4. Actions監視と独立watchdog | `apps/data-audit`でraw Git全表・API schema/enum・製品archiveを別入力として監査し、production buildの変換契約も照合する。管理Issueで重複防止し、独立watchdogを設定する | NP以外も含む新概念・未対応・取得/状態/通知障害を分類し、再実行・crashでIssue重複なし。schedule停止を別時刻基盤で検出 |
| 5. 配信整理・全体gate | `public/master`と同一origin取得・生成CLI出力を製品経路から撤去し、fixtureと監査appをVercel buildから隔離する。公開文書を更新し、費用・性能と最終gateを実測する | 新データから実UI/計算、失敗時の保持、Node/Worker一致に加え、deploy出力と実URLにmaster/raw配信がないこと、端末/Atlas/Actionsの転送・保存費用を示し、[最終gate](testing.md)を通す |

各checkpointは実経路と証拠が揃ってからチェックする。途中で参照の閉包、端末の保存・処理量、上流の抽出成功や一応答の固定が成立しないと判明したら局所的に足さず、目的・不変条件・生成/利用経路を見直してこの記録を更新する。

- [ ] **0. Atlas取得API公開**
- [ ] **1. 共通raw受入**
- [ ] **2. 数値規則と共通計算**
- [ ] **3. 端末の取得・保存・UI**
- [ ] **4. Actions監視と独立watchdog**
- [ ] **5. 配信整理・全体gate**

## 調査証拠・費用と未達条件

2026-10-12の固定JP rawでは通常servant 470件、CE 2,706件、MC 28件を起点に、既知skill/NP/function/buffと素材・係数の結合が成立した。旧nice入力と比較した成長6,370配列、17クラス相性289組、5属性相性25組に差はない。新servant 1件、CE 6件、入力から発見するcallback skill 25件を実装検証の対象にできる。これらは**共通変換器・ブラウザー取得の成功ではない**。製品コード・利用者データは変更していない。

参考量: 現行自前masterは32,953,998 bytes、ローカルgzip 2,755,994 bytes。Atlasの現行主要nice exportはidentity合計92,688,305 bytes。固定Git treeのraw全441表はidentity合計316,029,261 bytes、製品用候補43表は66,046,567 bytesで、同じ43ファイルのtar+gzip level 6は3,292,112 bytes。これはAtlas新APIの実転送量でも監査のGit fetch量でもない。初回・変更・未変更のwire bytes、Worker展開・parse peak、active masterの端末保存量をそれぞれ測る。未変更はHEAD/条件付きGETのrequest数・wire bytes・時間を測る。Atlas producerの生成/応答時間、Actionsのraw Git fetch、API schema、製品archive、runner秒・GitHub API回数・artifact GB-hours、独立watchdog費用を別々に実測する。Vercelのbuild upload・配信容量もmaster撤去前後で比較する。Atlasから端末への変更時転送量は記録するが削減gateにしない。

周期h、月の変更run数Cなら月run数R=720/h、監査転送=(R-C)×小確認bytes+C×(変更raw Git fetch+製品archive+schema取得)+失敗再試行分。6/12/24時間を比較し、料金・上流制限・実設定は実装時の証拠で確認する。2026-10-12時点でrepositoryはpublic、直近のCI jobは成功1,025秒・失敗1,484秒、公開artifact 2件は計401,333,546 bytesで14日保持。これはmonitorの費用を示さない。[GitHub料金資料](https://docs.github.com/en/billing/concepts/product-billing/github-actions)の条件と実run/請求情報を区別する。

固定archiveをNodeと実browser Workerへ同じbytesで渡し、参照閉包、canonical bytes/digest、inventory、拒否理由を照合する。Atlas APIをmockした実UIで新servant/CE・既知係数の更新からcalculator/ranking、保存復元、共有結果まで確認する。未知field/効果、参照欠落、catalog欠落、壊れたarchive、digest不一致、途中切断、quota、複数tab、遅延中の計算を拒否・保持する。Atlas側の抽出失敗・部分source・GET中のpointer切替の失敗注入は別に必要であり、FGO Labのfixture成功で代用しない。監視はraw Git新表・schema/enum・NP以外の概念、production/main差、公開遅延、通知直後crashをfixtureと実workflowで検証する。固定回帰期待値の再生成、cap/timeout/ratchetの緩和をしない。最終gateは[testing.md](testing.md)に従う。

### Atlasへ確認する公開契約

現行[OpenAPI](https://api.atlasacademy.io/openapi.json)は109 pathで、成功済みsourceへ束縛した自己完結raw応答のAPIはない。現行`/raw/JP/skill/961313`の`hash`/`commit`/`snapshot` queryは無指定と同じ応答を返す。実browserではAtlas raw APIはCORSで読めるがGit APIは拒否される。現行上流の[load_and_export](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L857)は一括成功と原子的配信の根拠にならない。

上流へ求めるのは、成功済みsource treeとcatalogから作った自己完結archiveの原子的公開、生成元の成功判定とsource commit/生成器の出典、CORS/ETag/条件付き確認、429/Retry-After、公開条件である。全raw表の再配信APIは監査の前提にしない。実JP応答と維持対象の上流実装の双方で確認し、公開pointer切替中も一つのGETに異なる元の表が混入しないこと、抽出失敗中にcurrentが進まないことを失敗注入する。問い合わせの送信は本調査に含めない。Atlas側の協力・公開が得られなければ直接Atlas API取得の完成条件は未達と記録する。

今回の再判断: ユーザーの削減対象はFGO Labのdeploy先からの大型master送信であり、Atlasから各端末への変更時の全量送信は問題ではない。前案はこの二つを混同して表別差分取得を必須とした。Webのdeploy先はHTML/JS/CSSと小さいbuild provenanceのみを配信し、ゲーム入力はbrowserがAtlasから直接取得する。監査はdeploy不要の別projectに分け、全raw語彙はAtlas raw Git、製品受入はAtlas APIで見る。変更時は自己完結した一応答を取得する。未変更時だけ条件付き確認で大型本文を省く。公開版番号・過去世代の選択APIは設けず、端末の計算identityは進行中計算・共有結果・保存済み入力の区別に残す。同じrepository revisionの意味変換をWeb/監査で共有するため、別repositoryへの分割は採用しない。

未確定事項: Atlas管理者がこのAPI契約と公開運用を引き受けられるか、成功済み抽出元・catalogから一応答を原子的に公開できるか、CORS/ETag/rate/公開条件は未確認。Vercelの実project設定、`.vercelignore`のmonorepoでの適用、監査が参照するproduction build provenance、raw Git/API sourceの取得制限、watchdogの通知先と料金も実設定で確認する。これらをfixtureや推測で完了扱いしない。Atlas協力が得られなければ、要件を縮めず外部依存で未達と明示する。

次の操作: checkpoint 0でAtlas側へ自己完結raw応答、抽出成功判定、公開pointerの原子的切替と条件付き確認の契約を提示し、受入先と公開方法を確定する。並行して監査projectのraw Git/source API取得、production build照合、Vercel build隔離を設計して固定fixtureで検証する。Atlas公開後に実JP応答のCORS、ETag、GET中の固定、Node/browser取得を確認してcheckpoint 1〜5を進める。このセッションは調査・計画までとし、製品実装は行わない。
