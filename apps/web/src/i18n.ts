const ja = {
  'app.name': 'FGO Lab',
  'nav.home': 'ホーム',
  'nav.calculate': 'ダメージ計算',
  'nav.ranking': '火力ランキング',
  'nav.servants': '所持・育成',
  'nav.ce': '概念礼装',
  'nav.support': '支援条件',
  'nav.growth': '育成計画',
  'nav.data': 'データ管理',
  'setup.title': '初回セットアップ',
  'setup.description': '計算に必要なデータを検証し、端末内に準備します。',
  'setup.start': 'セットアップを開始',
  'setup.running': 'マスターデータを検証しています',
  'setup.error': 'セットアップを完了できませんでした',
  'setup.retry': '再試行',
} as const;
export type MessageKey = keyof typeof ja;
export function t(key: MessageKey): string {
  return ja[key];
}
export const numberFormatter = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });
