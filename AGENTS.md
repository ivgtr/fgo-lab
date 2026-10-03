# FGO Lab implementation principles

## 成果・作業範囲と実行権限

- 依頼された結果まで調査・修正・検証を進める。「調査だけ」「計画まで」「レビューのみ」は守る。通常の技術判断で再承認を求めず、未規定の製品判断や実質的な範囲拡張だけ確認する。
- damage correctnessを最優先にする。
- 現行要件を基準に設計を再判断する。計算機を要件外のbattle simulatorへ広げない。無関係な利用者変更を保持し、stage／commitは依頼範囲だけを対象に差分を確認する。
- 作業の承認範囲とtoolの実行権限を分ける。sandbox内の所有者表示やアクセス失敗だけで実環境の設定不正を断定せず、承認済み作業に必要なら提供された正式な権限審査で確認・実行する。環境修復を利用者へ依頼する前に、権限境界・接続／認証・提供元の入力不足を区別する。
- 権限拒否を別設定・認証情報・実行経路で迂回しない。正式な審査でも拒否された場合は、拒否理由・未達操作・必要入力を示す。システム設定の変更は通常の技術判断へ含めず、実環境の根拠と明示承認を必要とする。具体的な確認手順は[実行効率要件§4](docs/requirements/development-execution-efficiency-requirements.md#4-責務境界)に従う。
- command拒否だけを根拠に、guardrail設定の不正や権限追加の必要性を断定しない。まず拒否された操作、実際の対象集合、読取・書込、command生成と呼出側の実装を調べる。保護対象を除外したつもりでも、必要対象の欠落や危険な広域列挙がないか確認する。修正は許可対象を明示して読取前に安全性を検査し、必要な集合・入力identity・検証能力を保持する方法に限る。禁止操作の隠蔽・別経路への迂回は行わない。hook拒否、sandbox起動失敗、正式審査の否決、検査の失敗を区別し、安全に成立する実装を調べた後でのみ、実根拠がある環境対応を利用者へ依頼する。

## 計算の不変条件と責務

- servant ID・名前・label・raw keyによるruntime分岐を追加しない。typed identity、状態・遷移、網羅的なunionへ意味を集約し、互換性だけを目的とする旧経路やfallbackを残さない。
- 不足・曖昧・矛盾・部分適用の意味論はfail closedにする。無効状態をもっともらしい数値へ置き換えない。確率的失敗、対象からの除外、修正可能な入力、invalid、unsupportedを区別する。
- data pipelineだけがAtlas/raw語彙を解釈してcanonical IRを生成する。applicationがscenario commandと利用者の意図を所有し、executionがcanonical stateへ順序付きのtransactional operationを適用する。
- calculatorとrankingは同じapplication／execution経路を使う。ranking policyはscenarioを選び、独自のdamage semanticsを持たない。UIはcanonical stateを表示してcommandを送り、IDやlabelからゲーム規則を推測しない。
- 既存責務を拡張するか焦点の定まったmoduleへ抽出する。詳細をorchestratorへ戻さず、責務のないpackageを増やさない。利用可能なaction、使用したinput、適用済みeffectを区別する。
- 挙動には小さいsemantic fixture、全データには共有inventory／digestを使う。caseごとのmaster再読込・再計算を避ける。計算構造変更では影響するproduction suite・hot pathの前後を測り、candidate増加・時間増加・ratchet緩和を説明する。

## 実装と収束

- 利用者成果、不変条件、意味を決める責務、直接の生成・利用経路、対象外、必要な検証を確認する。変更境界を説明できたら実装へ進み、判断に影響する不確実性がある範囲だけ追加調査する。
- 複数層に影響する変更は、関係する代表経路を早期に接続して確認する。部品の成功だけで通信・表示・保存復元・入力修復まで完成したと判断しない。
- 不具合は共通原因と直接影響する範囲で修正する。確定済みの判断は、関連変更・新しい反例・根拠不足がある場合に、その影響範囲だけ再調査する。同条件で有効な検証証拠は再利用する。
- 製品実装は既知の対象内Blockingを解消し、必要な局所検証と差分レビューを終えてから最終qualityへ進む。全件検証を事前に重複実行しない。検証中に対象が変わった場合は、その結果を最終差分の成功証拠とみなさない。
- 判断や実装の区切りで既存Task／flowを更新する。確定判断と根拠、有効な検証、未達条件、次の操作を残し、内容を複製せず正本を参照する。圧縮・再開後は記録と現在差分を照合し、未達条件から続ける。
- 最終差分の必須ゲートが成功し、対象内Blockingがなく、記録が一致したら終了する。新しい根拠のない再レビューや独立した改善へ広げない。

## 保存集合と調査artifactの増加

- 保存対象は必要な検証・復元能力から決める。回帰入力、固有原入力・出自、調査log／receiptを区別し、参照closureや原run全体を自動的に長期保持集合へ昇格させない。保持契約は[テスト戦略§9](docs/requirements/test-strategy-redesign.md)を正本とする。
- bundleやrun全体の保持を新設・拡張するときは、直接consumer、必要な固有内容、既存保存との重複、固定identity、保持owner・参照期間、取得／不足時操作、参照終了時の処遇条件を既存Task／台帳へ記録する。取得失敗を別版・別path・再生成・暗黙の取得元変更で補わない。取得元の変更は明示判断を記録し、その提供元で実証した能力と未保証の範囲を分ける。手動名directoryのcleanup対象外を保持理由にしない。
- 同条件の有効な証拠と既存保存実体を再利用し、追加run・全復元・全履歴コピーは今回の未達条件を閉じる必要がある場合だけ行う。共有byteと原path／採取run／宣言のidentityを分け、独立測定や故障診断の完全artifactを重複として省略しない。固有原入力をdigest・判断記録・小fixtureだけで代替しない。
- 保存集合の変更ではpath数、distinct object数、圧縮bytes、復元bytes、metadataを分けて前後を示し、増加分の必要能力を説明する。保持pathから共有objectへの到達と有効な参照を検査し、一つのpathの除外だけでobjectを削除可能としない。削減量や圧縮率を先に完了条件へ置かない。
- Task終了時に採用判断・固定identity・残る取得条件を既存正本へ残し、調査artifactと補助codeの用途・参照期間・処遇条件を明示する。補助codeの恒久採用は継続的なconsumerと既存機構で不足する理由がある場合に限る。原物の移管・削除は能力損失と移管検証を確認した明示依頼の範囲で行い、容量規約を自動削除の許可にしない。

## 必要な資料と検証

- 文書入口は[docs/README.md](docs/README.md)。要件・ADR・Task・evidenceは今回の判断に必要なものだけ読む。
- Serena接続時はコードの定義・参照をシンボル単位で取得する。文書入口は上記と共通とし、ローカルmemoryは任意の参照補助に留める。全体onboardingや正本のmemoryへの複製は行わず、文字列・JSON・Git・検証には既存toolを使う。
- canonical state、outcome分類、複数の実行／書込経路を変える作業と構造的レビューには[体系レビューガイド](docs/guides/systematic-review-guidelines.md)を使う。forward／recovery、alternate path、productionにないschema-legal stateまで反証し、対象内のBlockingを残して完了としない。小さな文言修正に全体監査や記録を要求しない。
- 通常作業は親が担当する。子は独立した読み取り専用調査1つまでとし、起動する場合は下記の実行効率要件を読む。
- 検証commandと完了ゲートは[README](README.md)、長時間command・単独実行・並行sessionの作業分離・session上限は[実行効率要件](docs/requirements/development-execution-efficiency-requirements.md)を参照する。
- damage変更はcanonical inputとgoverning ruleで説明する。テスト成功だけでなく、変更に応じてproduction inventory、calculator／ranking parity、fail-closed、性能、要求されたUIの実経路を確認する。

CLAUDE.mdはこのファイルへのリンクとし、リポジトリ規約を二重管理しない。
