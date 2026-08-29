# 条件付き火力の適用契約統合レポート

日付: 2026-08-25

## 結論

resolved計算から対象trait・対象状態trait・対象rarity・攻撃役状態trait・field traitの
入力経路を削除した。条件付き火力は火力効果の選択を成立宣言とする。旧入力と新入力の
移行・併存は行わず、schema 9 / engine 7.0.0で旧scenarioを拒否する。

## 対応範囲

- skill、passive、概念礼装、魔術礼装、支援、宝具前効果の正規化済みtrait/field条件
- trait特攻宝具、状態trait特攻宝具、複合trait特攻宝具、rarity特攻宝具
- 対象trait数で倍率が増える宝具（traitごとに個別選択）

HP割合とバトルポイント段階は数値で倍率が変わるため、booleanの成立宣言へ変換して
いない。カード種別、効果の付与先、レベル値、parameter/function metadataの解決可否も
選択では上書きしない。

## UI

旧「対象特性 / 特攻宝具の成立条件」を削除し、特攻宝具を`自身の適用内容`へ統合した。
条件名、倍率、宝具の付与元を同じmodifier chipで表示し、共有scenarioには通常効果と
同じ`effectDecisions`の安定キーを保存する。

## 検証

- unit/integration: 23 files / 142 tests
- conditional NP: offで1.00倍、onで1.50倍となるscenario回帰試験
- effect resolver: 明示onでtrait条件が成立し、card不一致等は別判定のまま
- focused Playwright: ジークフリートの竜特攻宝具と対竜威力アップを同じ一覧から適用
- typecheck / lint / production build: 成功
