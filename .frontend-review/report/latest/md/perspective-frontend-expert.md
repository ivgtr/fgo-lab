# Frontend Expert Perspective

調査日: 2026-08-24

`.frontend-review/report/latest/raw` の監査JSONは存在しなかったため、TypeScript・Lint・テストの実行結果と、`App.tsx`、`Calculator.tsx`、`CalculationResult.tsx`、`calculation.ts`、`useProfileCollection.ts` の直接調査を根拠にした。

## 良い点 Top 3

1. `features/calculator/calculation.ts` が React・DOM・ストレージに依存せず、効果解決から計算までを純粋に検証できる。
2. `app/useProfileCollection.ts` がプロファイル永続化を直列化し、同時更新で古いスナップショットを上書きしない単一の更新入口を持つ。
3. `packages/effect-resolver` は表示ラベルではなく構造化された `buffType`・カード種別・特性条件から計算入力を解決する。

## 改善した点 Top 3

1. `apps/web/src/app/App.tsx`
   - 問題: 表示時と下書き保存時にリリース検証状態の反映を別々に実装し、選択中攻撃役とは別にマスター先頭の攻撃役をホーム表示していた。
   - 改善: リリース検証状態を `calculateResolvedDamage` の単一経路へ統合し、ホームも計算入力の `attackerId` から解決した攻撃役を参照するようにした。
2. `apps/web/src/features/calculator/Calculator.tsx`
   - 問題: 条件編集、自身スキル編集、診断表示、支援、結果表示が1コンポーネントに集中していた。
   - 改善: 独立した操作単位の `AttackerSkills` と読み取り専用の `EffectiveInputDetails` を分離した。親は計算構成の調整に集中する。
3. `apps/web/src/features/calculator/specialTraitPresentation.ts`
   - 問題: 未知の特性名を日本語効果ラベルの正規表現解析で推測していた。
   - 改善: 現行マスターで利用する全41特性が辞書に存在することを確認し、構造化特性IDからのみ表示名を得るようにした。

## 構造上の懸念

`apps/web/src/app/App.tsx` は依然として起動、画面遷移、全プロファイル操作、計算ワークスペース永続化を所有している。次に分離するなら、巨大Hookではなく「計算下書きの生成・保存・確定」という状態ライフサイクルだけを専用境界へ移すべきである。現在の更新直列化を迂回する別StoreやContextは作らない。

`Calculator.tsx` には攻撃役・礼装の選択と対象条件編集が残る。次の分割候補は行数ではなく、攻撃役変更時にATK・宝具・自身スキルを同時に再初期化する操作を純粋な状態遷移として固定すること。ここを先にテスト可能にしないまま表示断片だけを追加分割すべきではない。
