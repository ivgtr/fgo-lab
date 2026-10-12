# Atlas直接取得・自動追従・未対応監視の実装計画

設計確認日: 2026-10-12。対象revision: adafb00940ebc2ac4f691065c6c6545c4cd420bf。
直接取得・自動更新・定期監視は未実装。この文書は[アーキテクチャの設計要件](architecture.md#atlas直接取得と自動更新の設計要件)を実装へ接続する取得契約・責務・達成条件を定める。チェックポイントの状態と再現可能な証拠をここで管理する。

## 結論と成立条件

採用する構造は「Atlasの整合性を証明できる入力一式 → browserの専用Workerで共通変換・検証 → IndexedDBのactiveをtransactionで切替 → 同じmaster identityでcalculatorとrankingを更新」。Actionsも同じ取得・受入契約を使う。大きい自前masterの製品配信は廃止し、固定回帰入力は開発専用として保持する。

ただし、現時点で確認した公開Atlas export/APIには、複数exportと追加参照を一つのsnapshotへ束縛する契約が見つかっていない。ここは実装前の成立条件であり、既存APIを組み合わせれば達成できるとは認定しない。取得契約を確定する前に、その契約を前提とする製品切替は実装しない。

### 利用者の振る舞いから決める受入境界

Atlas APIを製品の取得元とする。初回は取得・検証・保存が終わるまで計算可能なmasterを見せず、進行状況または再試行可能な失敗を示す。互換性を確認できるactiveが端末にある場合は先にそれでUIと計算を開き、更新を背景で調べる。更新候補に未知の意味、欠損、矛盾、取得世代の不明点があれば切り替えず、activeの出典と更新失敗を明示する。上流取得失敗のたびに既存masterを消したり、自前配信先から補ったりしない。新候補は全入力の受入後に一回の保存transactionで切り替え、calculatorとrankingは同じidentityへ同時に移る。切替前の計算結果・共有結果は新しいmasterで計算したものとして扱わない。

この振る舞いに必要な保証を、候補内部の**意味・参照整合性**と、候補全入力の**上流世代の整合性**に分ける。前者は共通validatorで確認できる。後者は、取得したbytesへ自分でhashを付けても、`/info`の前後一致や個別ETagを照合しても証明できない。`info.json`が関連exportより後で書かれる現行実装は有用な完了の手掛かりだが、版指定できないskill API応答やCDNでの公開単位まで束縛しない。「同じ時点で読めて計算できた」ことを「同じ上流generation」と表示・保存しない。したがって、現行公開APIだけを使う初回activationを安全と認定する設計にはまだ到達していない。この不足を隠して実装を進める製品判断はしない。

取得契約が整うまでにも、Atlas APIの現形式を用いた変換・参照発見・Node/Worker照合、既存activeの先行表示、保存/計算の競合試験、監視のinventoryと通知重複防止は独立に設計・検証できる。最終的な製品切替と「未変更」の軽量判定だけを上流の保証に依存させる。Git経路は現在のAPI直接取得案を自動で置き換えるものではない。

2026-10-12の追加調査で、AtlasのrawゲームデータGit repositoryにはimmutableなcommit/tree/blobがあることを確認した。しかし、そのraw入力は現行nice変換入力と異なり、ブラウザーから通常のGit APIを読むとCORS設定で拒否される。Git packのRange取得を使う独自Git clientとAtlas API側のnice変換に相当するraw→canonical実装は、取得・変換に新しい大きな責務を生む。現在はnice入力を同一generationに束縛する上流契約を優先する設計判断とし、契約取得までは製品切替を実装しない。raw Git経路は技術的に不可能とは認定しておらず、上流契約が得られない場合の設計再判断対象とする。自前hash一覧、二回の同一取得、待機時間、infoの前後一致で穴を埋めない。

## 現行経路と変更境界

| 現行の根拠 | 現行挙動・問題 | 変更する責務 |
| --- | --- | --- |
| [cli.ts](../packages/data-pipeline/src/cli.ts) | ローカルの4exportと固定referenced_skills/battle_pointsを読み、自前public/masterへ生成。versionは手動または日付 | Node専用I/Oと、Atlas取得・共通変換・検証を分離。製品配信へのnormalize出力を撤去 |
| [snapshotNormalization.ts](../packages/data-pipeline/src/snapshotNormalization.ts)、[atlasContract.ts](../packages/data-pipeline/src/atlasContract.ts) | unknownを型assertionで解釈。配列検査以外のraw構造検査は限定的。ID重複のMap上書きや不正項目の除外がある | 現行Atlas形式の構造検証、明示的な対象範囲、参照閉包、語彙分類を変換前の受入境界にする |
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
- 実OpenAPIの`/nice/{region}/skill/{skill_id}`の引数はregion、skill_id、reverse、reverseData、langであり、snapshot/commit指定はない。[routerの一次資料](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/routers/nice.py)。
- このskill routeは現在のDBから応答し、server側cacheは通常7日で、更新処理がexport前後でcacheを消す。cache消去は静的exportと一つの公開transactionではない。[skillの取得処理](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/core/nice/nice.py#L174)、[cache設定](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/main.py#L280)、[消去順](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/tasks.py#L876)。
- HEADで各exportにCORS `Access-Control-Allow-Origin: *`、ETag、Last-Modifiedを確認。ただしETagをbrowserへ公開するExpose-Headersは確認できなかった。ヘッダーとCORSの実利用はbrowserで改めて検証する。ETagは単一資源の再取得抑制にしか使わない。
- 実応答の`Cache-Control: no-cache`は個々のURLの再検証を促すが、公開完了や全入力の同一generationを示さない。`/info`はexportより早く変わり得るため、そのhashだけで大型GET・正規化を省略すると新旧混在や未完了を見逃す。現行公開APIで要求する「小さい確認だけで安全に未変更と判定する」契約も未確認である。
- Atlasの[rawデータGit repository](https://git.atlasacademy.io/atlasacademy/fgo-game-data)のJP HEADは`5d3cbcc79ebcea42ec99dbecd5279e6e64effa3c`で、`/info`の短いhashと一致する。このcommitからroot tree `9ef4ebf08375bfdb974ed6e60ccf2aaa691f9b5d`、master tree `379b2ca7ccfed7a9062e82b91773c0a8a9d6803c`、各raw tableのblob SHAをたどれる。個別のGit object IDはそのbytesに結び付くので、raw Git tableだけなら同一snapshotを証明できる。ただしnice export・API追加参照・API変換器版はこのtreeに含まれない。
- 実ChromiumからGitea `/api/v1/repos/.../branches/JP`、`/git/blobs/{sha}`、`/raw/master/...?...`をfetchすると、`Access-Control-Allow-Origin: *, *`という重複値でCORS拒否される。Pythonで各応答に二つの同名headerがあることも確認した。これはbrowserのfetch設定で解消できない。
- GiteaのGit HTTP `/objects/{sha}`と`/objects/pack/*.idx`はbrowserからCORSで読めるが、必要なblobの多くはpack内にある。`git-upload-pack`のPOSTはbrowserでpreflightが400となり、simple requestは本体が400となる。packのRange GETは206で成功する。`mstBattlePoint.json`の203-byte rangeから335-byte blobを復号し、Git blob SHAと一致することまで検証した。現公開packの最大は32,733,824,054 bytes、index総計は7,254,320 bytes。必要な現在blobの例`mstFunc`（6,567,712 bytes）、`mstSvtLimit`（9,184,397 bytes）、`mstSvtSkill`（1,932,755 bytes）はpack中の通常blobと確認したが、将来分も含めるにはindex・pack・delta復号、範囲取得、raw relational tableのjoinと意味変換を製品側で維持する必要がある。これは複雑さと端末への初回転送を増やすため、現時点の第一候補にはしない。pack全体の転送が必須だとは主張しない。
- Git HTTP経路を将来採るなら、commitが参照する全blobを必要期間取得できる保持契約と、pack再編成時にindexを取り直しても同じGit object IDで再検証できる実証が要る。現在の一commitでの成功を旧commitの長期提供保証とはしない。
- 小さい`NiceClass.json`を`?hash={JPのfull commit}`と`?hash=definitely-invalid`でもGETした。双方とも版指定なしと同じ30,970 bytes・SHA-256・ETagを返した。このqueryは版指定として機能しない。固定入力の`referenced_skills.json`には28件あり、例の`/nice/JP/skill/961313`は取得できるが版を指定できない。実GETの応答は1,634 bytesで、本文にgeneration/版のfieldがなく、ETag・Last-Modifiedもない。HEADは405だった。
- ローカル固定入力の28件のreferenced skill IDは、`nice_servant`・`nice_equip`・`nice_mystic_code`のfunctionを持つ埋込みskill ID集合には**一件も含まれない**。単にbulk export内を探すだけでは現在の追加参照すら閉じない。現行OpenAPI 109 pathにはsnapshot/version/manifest/exportのrouteがなく、skillの版指定入力もない。これは公開APIで必要な追加参照の取得方法を上流へ確認すべき理由であり、将来の追加参照方式も固定28件から推定しない。
- Atlas APIの[現行server実装](https://github.com/atlasacademy/fgo-game-data-api/blob/35cadc444e20c78cc60e56082ad1b64607d4d2e2/app/main.py)は429で`Retry-After`を返し、多数の小さいAPI呼出よりexportを推奨している。追加参照の参照閉包では並列上限・重複排除・Retry-After尊重が上流負荷の条件となる。Atlasが[公表するデータライセンス](https://atlasacademy.io/about-us/)はODC-BY 1.0で、実装後も出典表示を保持する。

必要入力候補:

| 入力 | 用途・追加解決 |
| --- | --- |
| nice_servant.json / nice_equip.json / nice_mystic_code.json / nice_item.json | actor・形態・宝具・通常/LB礼装・魔術礼装・素材の現行範囲 |
| nice_battle_point.json | 固定battle_points.jsonの製品依存を除く。ActorのBPとfunction/script/条件から必要domainを検査 |
| NiceClass.json / NiceClassAttackRate.json / NiceClassRelation.json / NiceAttributeRelation.json / NiceCard.json / NiceConstant.json | クラスIDと名称・補正・相性・カード・計算定数。現在利用する数値と意味を対応づけ、出典位置と単位を記録 |
| nice_trait.json / nice_enums.json、必要な上流schema catalog | 特性・全enumの語彙観測、型・field追加の検知。trait名だけから新意味を推定しない |
| 入力から発見するskill等の追加参照 | SkillID、既知callbackのValue、関係するactor/形態・domain等を型付きedgeとして列挙。将来の未知参照方式は受入不能 |

上記の現行JP exportはすべてGET/HEADで存在とCORS `*`を確認した。`NiceClass`は84件、`NiceClassAttackRate`は84 key、`NiceClassRelation`は75行、`NiceAttributeRelation`は5属性、`NiceConstant`は341 key、`nice_enums`は40 enum group、`nice_trait`は360 key、`nice_battle_point`は2件。これらは個別の可変URLであり、同時に取得できても一つのgenerationを証明しない。`/openapi.json`は680,520 bytesの現在schemaで、独立に変わり得る監視対象とする。

現行計算で使う17クラスはすべて`NiceClassAttackRate`と`NiceClassRelation`にあり、17×17の相性値は現在の`calc-core/affinities.ts`の値と一致した。`NiceAttributeRelation`の`human`はcanonicalの`man`に対応する。`NiceCard`のArts/Buster/Quickの第1行`adjustAtk`は1000/1500/800、`NiceConstant.ATTACK_RATE`は230で現行0.23に対応する。同定したfieldと単位を共通変換の契約にし、`ATTACK_RATE_RANDOM_MIN/MAX`の900/1100は既存の200通り（上限排他）と独立に仕様照合する。新しいクラスやカード種別が現れる場合は既知の係数値だけで意味を推測せず、対応範囲を審査する。

各入力は同じregion、言語、上流snapshot、必要なら上流変換器版へ束縛する。四つのnice exportだけのゲームcommit一致では、サーバー変換器・enum/trait mapping・追加APIの整合を証明できない。

採用可能な証拠は、(a) 上流が完了したgenerationとして公表するmanifestが全入力のdigestと版を束縛し、追加参照もその版で取得できること、または(b) 必要入力がすべてimmutableな同一commit/treeから取得でき、変換に必要なmappingも版付きで揃うこと。単一snapshot archiveなら、その内部の生成・完了契約も確認する。現行raw Git repositoryは(b)のraw tableだけを満たし、製品が必要とするnice入力まで満たさない。どれを実装するかは成立した一方式へ絞り、複数の主配信経路や自動代替を設けない。

上流manifestのdigestがある場合はmutable URLからでもそのdigestとの一致を必須にし、不一致は更新失敗とする。自分で計算したdigestは同じsnapshotを証明せず、取得bytesの同一性を記録するだけ。短いhash単独を一意なmaster identityにしない。

取得receiptには取得方式・証拠、上流版、region/locale、入力URLとbytes/hash、参照edge、正規化器/受入契約版、canonical digestを記録する。master identityはこれらの意味に影響する版と入力集合から決定的に作り、同じidentityに違う内容を保存しない。確認・取得時刻はidentityの意味値へ混ぜない。

## 共通変換、参照、数値、未知の境界

- browser WorkerとNodeで一つのraw validator、dependency resolver、normalizer、canonical validatorを使う。I/Oはfetch・IndexedDB・Nodeファイルの各adapterへ置く。専用master Workerとranking Workerは処理の寿命が違うため分けるが、意味変換コードは複製しない。
- rawの既知fieldは構造・型を検査し、「利用する」「明示的に範囲外」「既知だが計算未対応」を根拠付きで分類する。必要field欠落、不正値、未知field、未知効果/条件/演算、矛盾は拒否。Zodで未知項目をstripして受理しない。
- 除外対象であっても入力の存在と除外理由をinventoryへ記録する。宝具攻撃以外の全skill/passive、支援宝具、礼装通常/LB、MC、callback、形態、BP、scripts、パラメーターを観測する。変換がthrowする前の語彙inventoryを残し、最初の一件だけで監視を終えない。
- 参照閉包は入力を走査し、必要IDを重複排除して解決、解決先から新edgeを発見して完了まで反復する。ID重複・同ID異内容、ID不一致、欠落、循環は経路付きで拒否する。共有参照を循環と混同しない。network並列数・深さ・総量・timeoutを明示し、超過を成功扱いしない。
- 固定referenced_skills/battle_pointsは製品入力から除き、必要な固定ケースのfixtureとしてだけ残す。未知の数値を「参照IDらしい」と推測して取りに行かない。
- 既知のschema・意味による新servant/CE、成長curve、倍率、既存係数表の値、既知参照先の追加はコード変更なしで対応する。新効果族、演算順、条件・対象・選択規則、未定義のカード/クラス意味などはコードと証拠が必要。
- クラス/属性相性・カード補正・基礎係数をmasterの版に含める。relativeな相性指定も新しい表と矛盾しないよう、target候補生成・UI選択・scenario組立・battleの直接callerまで変更する。数値だけ更新して旧表による候補を残さない。
- 既存の範囲・計算量capを値更新のために緩和しない。ランダム上限の排他性、permille、float32境界等を上流仕様と照合する。新値が現在の意味・予算に収まらなければ拒否して理由を出す。
- 現masterに`unsupported`が28件あることを確認した（operationSemantics 18、unresolvedTarget 2、partyCompositionMutation 4、contextReference 4）。全unsupportedを禁止すると現行範囲まで凍結する。既知で明示的な非計算結果として保持できる未対応と、意味を定義できない未知を区別する。前者は通知・計算拒否を保持し、後者はcandidate activationを拒否する。既存に出現したという理由だけのallowlistは作らない。

現行ローカルAtlas入力の実測では`nice_servant`は485行・top-level 61 key、全skill/passive/NPに10,903 function・49 `funcType`・121 parameter keyがある。`nice_equip`は2,700行・top-level 27 key、`nice_mystic_code`は28行・10 key、`nice_item`は1,959行・18 key。現在の`atlasContract.ts`は多くをoptionalなTypeScript型で記述し、`normalizeAtlasSnapshot`は配列検査後に型assertionを使う。実装時の厳格な受入では既存の大量のfieldを「使用・既知の範囲外・明示的未対応」に先に分類し、未知fieldをparse時にstripした成功としない。元入力からのinventoryはnormalizationのthrowより先に作る。

## 更新・保存・UIの利用経路

| 状況 | 計画する挙動 |
| --- | --- |
| 初回、activeなし | 自動取得を開始し、段階と失敗原因を表示。全入力・正規化・検証・保存の成功後だけUIへmasterを渡す。プロフィール開始の既存操作はmaster取得と分離する |
| 起動時に互換activeあり | activeを検証して先にUIを開き、背景で小さい版確認。起動・online・利用中確認はcoordinatorで重複実行を抑える |
| 上流も正規化器も未変更 | 大きい本文取得・正規化・active書込みを省略。最後の確認時刻と失敗状態は小さい記録で管理。未変更の判定は成立した上流契約に基づく |
| 更新あり | Worker内で取得→構造検査→参照閉包→変換→canonical検証→receipt生成。主threadは表示と切替接続だけを担う |
| offline / timeout / 429 / 5xx / checksum不一致 | 更新失敗と利用中版を表示。互換activeがあれば明示して継続。activeなしなら利用不能と再試行を表示。Retry-After・上限付きbackoffで取得を抑える |
| 未知・不整合・参照欠落 | 候補を拒否し、同じ入力の無意味な連続再試行を抑える。新しい上流/検査版または明示的な再検査でやり直す。旧activeを更新成功と表示しない |
| quota / IDB transaction失敗 / Worker停止 | 成功済みactiveとuser storeを保持。永続化できない候補を一時的な成功版として使わない。問題を分類して再試行可能にする |
| 切替と進行中の計算 | 切替直前に旧計算・保存のguardを無効化。commit成功後、一つのmaster identityでcalculator/rankingを更新。旧reply/detail/handoffを拒否して最新入力で再計算。UI接続失敗時は状態を明示し、旧結果を新masterの結果として表示しない |
| 複数tab・再読み込み・crash | 更新取得はorigin内のlockで重複を抑え、DBのexpected active identityをtransaction内でも比較。BroadcastChannelは通知用。通知脱落時はfocus時のactive確認で同期。DB commit前後のcrashを試験 |
| 保存済みdraft/history・共有URL | request/resultの版対を保持。同版は再計算一致を検査、異版はhistoricalOnlyとして表示。現在版への再計算は既存の明示操作を使い、過去結果を無言で上書きしない |

master用storeは「candidateの検証済み記録とactive pointer」をtransactionで扱う。検証やhash計算はtransaction外で終え、書込みとpointer切替、不要候補のcleanupは一つのtransactionでcommit/abortする。activeの内容とreceiptの再読取を確認する。候補とcanonicalの保存を重複させる現行staging形式を残さず、保持数を限定する。raw全exportを端末内で無期限に保存しない。初期はcanonical+receiptを保持し、差分更新用raw cacheは必要性と費用が実証された場合だけ判断する。

master保存契約は更新する。旧保存masterにはAtlas snapshot証拠がないため、新契約へ黙って変換しない。旧masterの扱いは利用拒否と明示的再取得とし、利用者storeは触らない。profile/backup/shareの現行schemaを保持できる設計を優先するが、係数・相性の変更で契約変更が必要になれば影響を同じ記録へ追記する。読めなくなった利用者データの自動削除・変換はしない。実データ消失や共有の意味変更を伴う場合は製品判断として確認する。

直接callerの確認結果: `bootstrapApplication`はactiveがあってもmanifest fetchと候補保存を待ってからUIを起動し、`loadActiveMaster`は検証失敗時に`master` storeをclearする。`stageAndActivate`は`staging`と`master`へ同じ約33MBの記録を書き、旧stagingを削除しない。`App`のonline eventは表示だけを更新する。rankingの`useRanking`はmaster/context変更でWorkerを再作成し旧返信・detailを拒否するが、切替起点はまだない。共有とdraftのrequest/resultはmaster/engine版を保持し、異版は`historicalOnly`で扱う。実装時はactive保存契約の変更と計算中のguardをまとめて接続し、`user` storeには触れない。

製品のpublic/master配信を撤去する前に、現在のproductionテストが参照する同じbytesを開発専用の固定inputへ移す。source/manifestのpath更新はしても、期待値・意味digest・出自を再生成しない。新normalizerの成功を歴史baselineの再生だけで主張しない。

[データ出典文書](licenses/data-sources.md)は現在「版付きmirrorとして配信」と記載している。製品配信をAtlas直接取得へ切り替える時に、データの所在と出典表示を実態へ合わせる。計算結果の共有や利用者バックアップから過去masterを勝手に再取得・再計算する仕様にはしない。

## GitHub Actions監視

検知は三層にする。

1. Atlasの版・サーバー変換器版・schema/enum catalogの変化。公開される全enum/schemaを観測し、実使用前の新概念も通知する。
2. raw全入力のfield・function/buff/target・parameter/script・trait/形態/参照edge・係数の分類と変化。damageNp以外、範囲外として除外した入力もinventoryに残す。
3. 製品と共通の受入検証、canonical未対応、既知の意味ケースの実行。新概念、受入不能、通信障害、検査コード障害、通知/状態保存障害を分ける。

Atlasが公開入力・enum・schemaへまだ表していないゲーム規則まで検知できるとは保証しない。この限界と観測対象を公開運用文書へ明記する。全ゲーム概念を含めるために別のraw catalog/changefeedが必要と分かった場合は、取得契約と一緒に上流要件として記録する。

現在の`atlasInventory.ts`は宝具functionの`damageNp*`だけを数える。`productionAudit.ts`は正規化済みeffectの語彙と結果を監査するため、変換前に捨てたfield・entityや変換中に最初の例外で止まった後の新概念を列挙できない。監視の入力inventoryは、全4 exportと追加参照、係数・trait・enum、OpenAPI schemaを同一generation契約の下で別に作り、対象外の項目も種類・出現件数・例示ID・field pathを持たせる。コード変更時は元の入力が同じでも再判定する。

小さい専用の管理Issueを永続状態の正本とする案を採用する。内容は現形式の機械可読状態、最後の試行/完了/受入成功時刻、上流identity、取得/変換/検査コードfingerprint、語彙集合または必要な差分基準、problem fingerprintと通知Issue ID、直近のmetrics。ArtifactとActions cacheを状態の正本にしない。容量を実測し、GitHub本文制限へ近づくなら全文inventoryは置かず必要な集合・digestへ絞る。

- monitorのconcurrencyは一つ、cancel-in-progressはfalse。GitHubの[concurrency仕様](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency)では既定でpendingは一つだけで、追加のpendingは古いpendingを取消し得る。全tickの実行を前提にせず、最終完了時刻と遅延を監視する。PRから通知・状態更新を行わない。
- 上流と検査fingerprintが同じで、直前の完全な検査がacceptedまたはrejectedとして記録済みなら、小さい確認で終了できる。通信失敗や途中停止を検査完了と扱わない。
- 正規化器・受入schema・意味registry・監視コード・関連依存変更をfingerprintに含める。文書だけの変更をfull scanの理由にしない。コード変更では上流未変更でも再検査する。
- 問題fingerprintは分類、未知概念/field path/意味契約等で作り、更新日時や上流版を無条件に含めない。同じ未対応が新servantへ広がってもIssueを乱造しない。入力URL/版/hash、該当ID/path、再現する最小証拠、拒否理由、run URLを通知する。
- open/closed Issueを機械markerで照合し、再実行・送信成功後のstate保存失敗でも通知を再利用する。通知本文digestが同じならcommentしない。新しい有意な証拠のみ同Issueを更新する。closed後に再発した場合は同Issueで再発を記録する。
- APIの検索/全page取得失敗を「Issueなし」にしない。状態破損を空状態へ補完しない。Issue編集競合・手動編集も検出し、成功heartbeatを進めずworkflow失敗として露出させる。
- 権限はjob単位の`contents: read`、通知/state更新の`issues: write`を基本にする。既存CIがmonitor履歴を照会する箇所だけ`actions: read`を使う。PAT、contents書込み、外部secretを前提にしない。2026-10-12に実repositoryのActionsはenabled、allowed_actions=all、既定`GITHUB_TOKEN`権限はread、PR承認は不可とAPIで確認した。job権限の明示と実manual runは引き続き必要。secret値は参照していない。
- 成功・未変更時はjob summary/管理Issueの小さい記録だけ。失敗時だけ必要な診断artifactを短期間保持する案（初期候補7日）。巨大export/masterを常時uploadしない。再現入力の入手可能性もsnapshot契約で確認する。

scheduleはdefault branch上でしか実行されず、遅延・drop、公的repositoryの60日無活動による停止がある。[GitHub一次資料](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。一つのscheduleが完全停止したことを、そのschedule自身だけで通知できるとはしない。管理Issueに最終成功を残し、既存CIの起動時にもheartbeat age・workflowの有効状態を照会する。GitHubの[workflow通知](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs)は実行されたrunの終了を通知する設定で、runが存在しない停止の代替ではない。未起動期間の確認、workflow_dispatchによる復旧、権限・actor変更時の手順を文書化する。停止中の無条件な自動通知保証が必要なら、独立した外部watchdogが追加の製品/運用判断になる。

周期は6時間を候補として比較する。毎時00分を避ける。6/12/24時間の検知遅延と費用を示し、browser側の起動確認・online復帰・利用中TTLは利用状況と上流条件から別途決める。上流契約が成立する前に周期を確定しない。

## 実装単位と各達成条件

| 単位 | 作業 | その段階で閉じる条件 |
| --- | --- | --- |
| 1. 取得契約の確定 | immutable generation/manifest/追加参照の契約、CORS・条件付き取得・取得上限・保持期間・利用条件を確認。Nodeで最小の取得試験と混在反例を作る | 全必須入力を同一snapshotへ束縛できる根拠がある。無ければ不足を明示して目的/取得方式を再判断し、activationへ進まない |
| 2. 共通受入・生成と係数 | raw検証、語彙/参照閉包、portable hashing、canonical receipt・数値table。Nodeと専用browser Workerのproducer | 同じ固定入力のcanonical bytes/意味digest/receiptが一致。新entity・既知係数変更が無コード変更で生成され、未知と不整合を拒否 |
| 3. 保存・UI・計算への接続 | atomic active、更新coordinator、起動/online/利用中、計算guard、ranking再初期化、historical結果、SW範囲の整理 | 新Atlas入力からUI選択、calculator、ranking、detail/handoffまで同じidentityで利用。取得・保存・crash失敗でactive/user data保持 |
| 4. 監視と重複防止 | 共通契約のNode monitor、状態schema、Issue通知、workflow、手動復旧、heartbeat、軽量未変更経路 | 新概念/受入不能/障害を区別。実再実行と通知後crashで重複なし。コード変更のみでも再検査。API失敗を正常扱いしない |
| 5. 配信整理・全体検証・文書 | 大きい製品master撤去、固定baseline隔離、費用測定、公開文書更新 | 自前大型配信無しに実経路が動く。最終gateと実測証拠が揃い、未実施・外部依存を残して完了と呼ばない |

段階はレビューできる責務単位とする。局所修正が同じ原因に対して増えたら、目的・不変条件・所有境界・直接callerをまとめて再検討し、この文書の計画を更新する。旧APIの温存や互換層で取り繕わない。

チェックは各達成条件と直接consumerの証拠が揃った時点で付ける。作業開始や部品の追加だけでは完了にしない。検証結果にはrevision、入力identity、実行コマンド、結果、未達条件を記載し、個人環境のpathや調査logを公開cloneの依存にしない。

- [ ] **1. 取得契約の確定**: 全入力・追加参照を束縛する上流証拠、CORSと取得制約、混在拒否の再現試験を揃える。
- [ ] **2. 共通受入・生成と係数**: 固定入力のNode／実Worker一致、新entity・係数の自動追従、未知・参照不整合の拒否を確認する。
- [ ] **3. 保存・UI・計算への接続**: 新入力からcalculator／ranking／detail／handoffへ到達し、更新・offline・保存失敗・競合・過去共有の挙動を確認する。
- [ ] **4. 監視と重複防止**: 実Actionsの権限・永続状態・通知の再実行、検査コード変更時の再検査、停止時の運用を確認する。
- [ ] **5. 配信整理・全体検証・文書**: 大型masterの製品配信を撤去し、費用実測、公開文書、[最終gate](testing.md)と必要な追加auditを完了する。

現在の到達点: 計画commit `ac1a6f3`と取得契約の再判断commit `bc7570e`を作成済み。2026-10-12に取得、係数、保存・計算、監視、費用のread-only調査を完了した。raw Git commitの整合性は確認したが、現行nice exportと追加参照の同一generationを証明できず、実ブラウザーのGitea APIもCORS拒否された。1の取得契約は外部依存で未達、2〜5は未着手。製品実装・既存master配信の撤去は行っていない。

次の操作: Atlas APIに以下の最小保証が既に存在するか確認し、存在しなければ提供を依頼する。外部へのIssue送信は、この記録を具体的な依頼内容として用い、送信権限を得てから行う。保証を示す実API応答をbrowserとNodeで取得し、異版・欠落の拒否を再現する。これが通るまで1にチェックを付けず、製品のactivation切替と自前大型master撤去を行わない。独立に検証可能な2〜4の内部境界は、将来の実装で進められる。

### Atlas APIへ確認・依頼する最小保証

1. JPの完了済みgenerationをAPIから識別でき、必要なnice export、係数、trait、enum/schema catalog、後から発見するskill等の追加参照がそのgenerationに属すると確認できること。immutableなexport URLと版指定API、完全集合を含むarchive、完成後に公開するmanifest等の形は上流に委ねる。選んだ方式の公開・完了・保持契約を確認する。
2. ゲームデータcommitに加え、API変換器・enum/schema/mappingの版とregion/localeを同じ取得単位に結び付けること。複数URLの方式なら入力ごとの内容digestまたは同等の不変性が要る。版指定なしで現在値だけを返す追加APIは、候補の一部として受け入れない。
3. browserから必要URLをCORSで読めること。条件付き取得にETag等を使う場合はブラウザーへheaderを公開し、未変更確認が何を保証するか明確にする。旧generationを障害後の再試行に使える保持期間も確認する。
4. 公開済みgenerationは全入力と追加参照が揃った後に見えること。`/info`の前後一致、個別ETag、取得bytesへ付けた独自hashだけでは、この保証を代替しない。

上流から同等の既存保証が提示されたら、URL・保持期間・CORS・混在反例をこの記録に追記して設計を再開する。保証がない場合は現行nice APIの組合せでのactivationを完成扱いしない。raw Gitは同一raw commitの証拠にはなるが、API直接取得の簡潔な主方式を自動で置き換えない。採用するならraw→canonical全変換と費用を別途実証して一つの主方式として再判断する。取得失敗時の暗黙の配信元切替は設けない。

## 検証

- 固定の現形式Atlas入力をNodeと実browser Workerへ同じbytesで渡す。全入力receipt、参照閉包、canonical bytes/digest、語彙分類、拒否理由を照合する。現在のraw-hp fixtureはservant/CEだけなので、新経路の完全入力fixtureを追加する。既存goldenは再生成しない。
- 同じ製品buildと正規化器で、初期snapshot→新servant/CE・参照・既知係数の更新をAtlas経路へ供給し、実UIの取得→選択→calculator/ranking→詳細→保存/復元まで検証する。成功ケースでは製品コードや自前masterの変更を挟まない。
- 未知field/新効果/新演算、参照欠落/循環/異内容重複、old/new export混在、追加APIの版不一致を拒否する。特にinfo前後一致なのに一部入力だけ更新済みという反例を含める。
- timeout/429/途中切断/壊れたJSON/保存容量不足/transaction abort/Worker crash/commit直前直後crash、複数tab競合・通知脱落を確認。元のactive bytes/identity、user store、draft/historyが保持されることまで照合する。
- 更新前のranking返信・detail・handoff、calculator非同期保存を遅延させ、active変更後に拒否されることを実callerで確認。共有結果の同版一致/不一致、異版historicalOnlyを確認する。
- 未変更では大型本文取得、normalizer実行、active保存がゼロであることをnetwork/呼出記録から確認する。大きいゲームJSONがpublic/.next配信物へ入っていないことも検査する。
- monitorはfixture/API mockでschema変化・宝具以外の概念・既知未対応増加・通信障害を再現。実workflowのmanual runで権限、管理状態、Issueの重複防止、artifact保持を確認する。fixtureだけの成功をActions実運用の成功と呼ばない。
- 局所`test:diagnostic`→対象E2E→`test:docs`→最終`pnpm quality`。productionを含め、変更契約を所有する登録auditを追加する。matrixが必要な場合はdocs/testing.mdの手順・固定期待値・時間/並列条件を守る。cap/timeout/ratchetを緩和しない。

## 費用・性能の測り方

調査時の参考値として、自前masterは32,953,998 bytes、同じローカルbytesのgzipは2,755,994 bytes。Atlasの主要4exportはHEADのidentity表現のContent-Length合計92,688,305 bytes。手元の旧固定4export 91,887,896 bytesをgzipすると8,235,278 bytesだが、現在のAtlasの実転送量ではない。初回取得が軽くなるとは現時点で主張しない。大きい自前配信を除くと、取得負荷はAtlas側と利用端末側へ移るため、利用者の待ち時間・上流アクセス量も測る。

測定条件は初回、未変更、既知更新、参照追加、拒否、network障害、保存失敗を分ける。browserとNodeでURL別request数・wire bytes・展開bytes、取得/parse/参照/変換/検証/保存の時間、Workerと主threadのmemory peak、IDBとcacheの保存量を記録する。browserのResource Timingに上流Timing-Allow-Originがなければ実ブラウザー観測/CDP等で転送量を取る。headersのサイズを実転送量へ代入しない。

Actionsはbootstrap/installを含むrunnerの全実行秒数とfull scan時間、上流request数と転送bytes、GitHub API回数、artifact/upload bytes・保持日数、cache使用量を測る。既存CIの実使用量・retention・アカウント枠と合わせる。依存installは小さい版確認で変更が必要と分かった後に行う構成を検討する。

30日・周期h・変更run数Cとして、R=30*24/h、月実行時間=(R-C)*軽量run時間+C*変更run時間、上流転送=(R-C)*軽量確認bytes+C*変更取得bytesを算出する。失敗/再試行を別に加算し、実runで補正する。artifactのピーク保持量とGB-hoursも示す。数値が測れてから6/12/24時間の案を比較し、未測定の金額を0円と断定しない。

GitHub public APIでivgtr/fgo-labのvisibility=public、default_branch=main、archived=false、Issues有効、CI workflow有効を確認した。直近成功CI jobは1,025秒、失敗CI jobは1,484秒で、公開artifact APIに残る2件は165,188,261 bytesと236,145,285 bytes（計401,333,546 bytes、保持14日）。これはmonitorの実行時間ではなく既存CIの実測である。現行[GitHub料金資料](https://docs.github.com/en/billing/concepts/product-billing/github-actions)ではPUBLICの標準runnerは無料だが、artifact/cacheの保持量・GB-hoursとlarger runnerは別条件。所有者の請求APIは現在の認証権限では404で利用量を取得できず、実請求額は未確認。権限追加や秘密値の参照はしていない。

未変更の小さい確認でもOpenAPIを毎回観測するなら、現在のgzip応答は97,985 bytes（identity 680,520 bytes、ETagなし）、`nice_enums.json`は15,222 bytes（identity 48,310 bytes、ETagあり）。これは実GETの本文長でありHTTP全体・runner転送量ではない。6/12/24時間で月120/60/30回という呼出数だけを先に比較し、実workflowのbootstrap、API呼出、full scanと共に測る。OpenAPIを省略してserverHashだけでschema不変を断定しない。

性能比較は同一source/master/input/build・Node・並列・gzip条件で前後各3回。Worker・共有・遅延chunkを含む配信JSを合算する。HTTP初回/未変更の計測とranking計算の計測を混ぜない。

## 未確定事項、未達条件、次の操作

1. 最大の未達: 上流から同一snapshotとして全入力を得る証拠。nice export＋版指定なしskill APIでは成立を認定できない。raw Git commitは同一raw snapshotを示すがnice出力・追加参照との束縛を示さず、通常Git APIは実ブラウザーでCORS拒否される。
2. 現行17クラス・5属性・3カード・基礎定数の出典と値は同定済み。今後は新class/cardのscope、relative target選択、ランダム上限排他の上流仕様と、直接caller変更が保存schemaへ及ぶかを実装時に確定する。
3. 全raw/schema/enum観測で取得可能な新概念の範囲。上流が未公開の概念に対する監視保証はできない。
4. 周期、取得上限、保存保持数、実端末memory、現在Atlasの大型export転送、monitorの実Actions所要時間、請求額は未実測または未確認。repository権限設定と既存CIの時間・artifactは上記の通り確認済み。
5. 監視完全停止中も自動で通知する保証は、外部watchdogなしでは満たせない。基本案は最終成功の可視化・既存CIでの検知・手動復旧。

計画時点ではテスト・build・全データ生成は未実行。上流の版/小さい定数/HEAD/API schema/公開sourceを確認し、主要大型exportの全本文は取得していない。

取得契約が成立すれば、証明できた一方式で2以降を進める。第一候補のnice方式には上記の外部契約が必要。raw Git方式は別の主方式として実装可能性の根拠があるが、全変換と費用の成立は未検証。製品を不整合な入力で切り替える実装は行わない。
