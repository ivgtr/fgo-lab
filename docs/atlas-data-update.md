# Atlas直接取得・自動追従・未対応監視

更新: 2026-10-13。対象作業の起点は`a7e586f5217c4ae7e58d747100481491594a7d93`。この文書を設計判断・進捗・未達条件の正本とする。Atlasは別プロジェクトであり、FGO Labから変更・連絡できない。製品からAtlasのGitやFGO Labの大型masterを取得させない。

## 結果と現在の境界

FGO Lab側だけで整合性を証明する方式をローカルに実装・検証した。監査がAtlasの固定raw Git commitと公開API実装commitを再生し、実際のAPI応答bytesと一致した場合だけ、小さい証明書を公開する。ブラウザーはその証明書を先に確認し、変更時だけAtlas APIから本文を直接取得する。各本文のSHA-256、追加skillの参照閉包、canonical digestが一致したときに限りIndexedDBのactiveを原子的に切り替える。証明済みの本文がAtlasから消えた場合は候補を拒否し、端末内の検証済みactiveを明示して使う。初回端末には取得失敗を表示する。

コードと固定入力によるNode・実Chromium Workerの一致は確認した。明示的な`pnpm dev:local-certificate`だけが固定世代の開発用証明書を配信するが、**証明書の公開branchは未作成で、実公開URLは404**。定期ActionsとVercel watchdogも実環境ではまだ動いておらず、現在の接続環境ではFGO LabのVercelプロジェクトを確認できていない。従って公開環境の初回取得・自動追従・監視通知は完了していない。監査・製品コードをこの状態で配備した場合、初回利用者はセットアップできない。公開への切替は後述のgateと最終承認後に行う。

現行Atlasの`/export/JP/info.json`はexport完了前に更新され得て、個別exportは直接上書きされる。`/info`やETagの二度読みだけでは、安定した混在世代を排除できない。提案していた単一archive APIは公開されておらず、外部プロジェクトの変更を前提にしない。GitHub rawの小容量証明書は製品のゲームデータ本文ではなく、取得bytesの許可リストとして使う。

## 実行経路と責務

| 境界 | 現在の実装と不変条件 |
| --- | --- |
| 監査入力 | [auditRunCli](../apps/data-audit/src/auditRunCli.ts)がJP raw Gitのfull commitと`/info`のserver hashから解決したAPI実装commitを固定し、13 exportと発見した追加skillを観測する。Postgres・Redis上で公開APIの生成関数を再生し、全応答のbytes一致を検査する。raw全441表とnice応答のfield/type/意味語彙、公開対象・ID・成長・素材・効果値・係数・参照閉包・canonicalを独立に検査する。未知・欠損・不一致は証明書を出さない。|
| 証明書 | [発行器](../apps/data-audit/src/issueCertificate.ts)は本文を含まず、契約fingerprint、raw/API commit、13 exportと全追加skillのサイズ・SHA-256、canonical digestを記録する。[公開器](../apps/data-audit/src/publishCertificate.ts)は専用小容量branchでgenerationを単調増加させ、公開URLの厳密なbytes/CORS確認後だけ成功heartbeatを進める。並行pushは失敗させる。|
| 製品取得 | [atlasSource](../apps/web/src/adapters/atlasSource.ts)が小さい証明書を確認し、同じgenerationなら大型本文を取得しない。変更時はAtlas APIの13 exportと閉包上のskillを直接取得し、各bytesを証明書に照合する。[Worker](../apps/web/src/workers/atlasMasterWorker.ts)で共通data-pipelineを実行し、監査と同じcanonical digestを要求する。Git・raw checkout・Pythonは製品へ入れない。|
| 保存とUI | [atlasRepository](../apps/web/src/adapters/atlasRepository.ts)は契約別activeと証明書identityをIndexedDB v2に保存し、世代/CAS・canonicalを検査してから一transactionで切り替える。失敗候補は保存しない。[startup](../apps/web/src/app/startup.ts)と[App](../apps/web/src/app/App.tsx)は初回、10分周期、オンライン復帰、表示復帰で確認し、変更後の計算結果を再評価する。profile・draft・history・backupはmasterとは独立に保持する。|
| 計算 | [master-data](../packages/master-data/src/index.ts)は認証済みmasterに17クラスの攻撃補正・289相性・25属性相性・3カード率・ダメージ定数を要求する。[calc-core](../packages/calc-core/src/index.ts)とbattle-execution、calculation-applicationは同じ値をcalculator/rankingに通す。元の付与率は1000超を保持し、対象の付与成功補正・耐性との合成後に判定する。未知の規則を数値fallbackで埋めない。|
| Service Worker | [sw.js](../apps/web/public/sw.js) v5は同一originのshell/staticだけをcacheする。旧cacheをactivate時に削除し、Atlas・証明書・旧masterへshell代替を返さない。新版JSは旧SWが制御中なら証明書確認を保留し、controller変更後に再試行する。|
| 監視 | [Actions](../.github/workflows/atlas-audit.yml)は6時間ごとに完全監査し、失敗段階と出典を[管理Issue](../packages/atlas-monitor/src/managedIssues.ts)へ同一原因ごとに重複なく報告する。[watchdog](../apps/web/src/app/api/atlas-watchdog/route.ts)は別のVercel Cronから公開statusと証明書を読む。完全成功のheartbeatが18時間を超えるとIssueを更新する。|

raw Atlas語彙はdata-pipeline、scenario組立はcalculation-application、順序付き適用はbattle-execution、数値計算はcalc-coreが所有する。証明書は`master`の内容digestと取得源のcommitを別々に保持し、sourceが異なる結果を混同しない。監査の観測時刻、証明書の公開時刻、端末のactive時刻を同じ概念として扱わない。

スキル・宝具の解放条件については、利用者の指定により現行の「強化済みを選ぶ」前提を維持する。クエスト達成や霊基再臨の進行度を編成ごとに入力する機能は追加しない。形態に結びつく条件と優先順位は既存の選択規則で判定し、rawとniceの対応を監査する。

## 保存契約と利用者の挙動

- 初回: activeがなければ証明書と全本文を検証し、保存後にプロフィール作成・UIを開く。取得不能・未知語彙・参照漏れ・canonical不一致なら計算を開始しない。
- 未変更: 証明書identityだけを確認し、Atlasの大型本文・変換・active書込みを省く。
- 更新: 世代が進めば全本文を検証する。検証中は旧activeを維持し、成功時だけ切替える。古い結果を新しいmasterの結果として再利用しない。
- オフライン/失敗: 既存activeを再検証して使用し、更新確認失敗を表示する。active自体が破損している場合は計算を止め、元bytesと利用者データを削除しない。証明済みの新候補でのみ修復する。
- 旧端末: IndexedDBをv1からv2へ上げる。旧タブが接続を保持してblockedとなる間は「旧タブを閉じて再読み込み」を表示する。旧masterは新しい証明済みmasterのcommit後だけ取り除く。旧profile・draft・history・backupは保持する。旧JSが動くタブは閉じるまで旧計算を続け得る。

公開固定masterの32,953,998 bytesは製品の`public/master`から[テスト専用](../packages/test-fixtures/production-master/manifest.json)へ移した。旧同一origin取得と生成CLIの出力経路は撤去する。固定回帰期待値は更新のために再生成しない。

## 出典確認と検証証拠

[固定raw係数入力](../packages/data-pipeline/test-fixtures/README.md)の元はJP raw commit `5d3cbc…`である。監査再生には新しいJP raw commit `0dc8727576f8c1a99fbe51339246ffabd62309b3`と公開API実装commit `35cadc444e20c78cc60e56082ad1b64607d4d2e2`を使った。2026-10-13取得の38応答（13 export + 25 skill、identity合計92,981,119 bytes）は再生bytesと全件一致した。発行器の現行前段検査は係数335セル、identity 5,191件、成長543,392セル、素材10,362段階、skill/NP値158,747セルを照合した。raw全441表とnice38応答の語彙差分もゼロだった。これは**この固定世代**の証拠であり、以後の未知概念を自動受入する許可ではない。

固定応答は[テスト入力](../packages/test-fixtures/atlas-observed-jp-20261013.README.md)に固定する。現行契約fingerprint `fa3211bcffd9d4ab2c0d9e1c7e03ae261108830cb64c02eba97eee86cb7dfe42`で上流再生markerを伴う証明書候補を発行し、38応答の全bytes一致と上記の意味検査を再確認した。証明書候補は4,656 bytes、canonical本文は39,282,119 bytes、canonical SHA-256は`d26af05134dec28e51eb25b185d9dba8ca3728afd8548fc8f8bb0e31dd9af469`。最終buildを使う実Chromium WorkerプローブでもNode・保存したWorker生成物のSHA-256が一致した。470通常servant・2706礼装を扱い、実画面の初回取得からcalculator/ranking、未変更時の大型本文再取得ゼロ、壊れた次世代の拒否、旧Service Workerからの移行、旧activeから次世代への成功更新とprofile bytes保持を確認した。プローブは証明書を5回確認し、初回38応答に加えて壊れた次世代の拒否までに計50応答・116,837,161 bytesを受けた。最終`pnpm quality`は単体5,511件・本番監査176件・Playwright37件が成功し、skip・retry・警告・予期しないconsoleはいずれも0件だった。独立した全監査`pnpm test:audit`も88件成功・警告0件。全件rankingの一回のNode測定は約42.5秒であり、利用環境の保証値ではない。公開環境の動作確認は未完了。

[Atlasの発動判定資料](https://github.com/atlasacademy/fgo-docs#how-miss-and-guard-are-determined)に従い、混合`Rate`系列700〜1200を無言でclampしない。実効率は対象の付与補正と耐性を明示した後に求める。現行監査ではAPI生成器がrawの12表13列を無視する警告を出すため、再生器はその列値の既知形以外を拒否する。`mstSvtPassiveSkill.condIndividuality`の現行50行はevent drop用途と確認したが、形や用途が変われば拒否する。

## 運用と未達条件

- ローカルでは再生markerを伴う現行コードでの証明書発行、Node/Workerのbytes一致、初回・更新・拒否・保存復元・旧SW/旧タブ移行、calculator/ranking、Issue重複防止を実ブラウザーと局所testで確認した。[最終gate](testing.md)の`pnpm quality`も成功した。固定期待値・cap・timeout・ratchetは緩めていない。
- Actionsの実run、証明書branchの公開CORS/鮮度、Vercel Cron・`CRON_SECRET`・`ATLAS_MONITOR_GITHUB_TOKEN`の設定、Issue通知を実環境で確認する。現在これらは未設定/未公開であり、実通知や自動追従の完了と呼ばない。外部書込みは検証可能な候補と手順が揃った後に承認を受けて行う。
- 6時間のActions scheduleは遅延・欠落し得る。watchdogはVercelのHobby制限に合わせて1日1回で、18時間超を判定するため、停止検知は最大で約42時間になる。以前の10分配信鮮度・30分通知案は現行契約で保証できない。公開遅延と監査停止を別の時刻として実測し、必要なら運用基盤の製品判断を行う。
- 費用は同じ入力・build・圧縮条件で測る。今回のraw full checkoutは約529 MiB、監査再生DBは約910 MiB、再生は約2分。固定38応答のidentity合計92,981,119 bytesを各応答gzip level 6で圧縮すると合計8,356,336 bytes、旧master 32,953,998 bytesは同条件で2,765,758 bytesだった。これは実ネットワークのContent-EncodingやHTTP overheadを含まない。canonicalの保存本文は39,282,119 bytesで、IndexedDBの実占有量には別途overheadがある。未変更時の大型本文再取得はE2EとWorkerプローブで0件。今回のbuildの`_next/static` JS全48ファイルはidentity 2,206,460 bytes、同条件のgzip合計650,381 bytes。これは実際の初回画面が全ファイルを取得する量ではない。製品配信から撤去した旧master本文は32,953,998 bytes。Actions runner秒/転送量/API回数、実ネットワーク・IndexedDB増分、失敗artifact保存量は実運用時に別々に記録する。これらの一回の値は将来の料金や遅延保証ではない。

上流の新field・効果・部分公開、実応答と再生の不一致、監査停止、証明書の古さは成功として扱わない。新servant・礼装・既知係数・発見できる追加参照は再発行だけで追従し、未知の意味は根拠とともに拒否してIssueへ通知する。
