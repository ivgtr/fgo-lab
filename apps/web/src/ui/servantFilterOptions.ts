export type ServantClassOption = {
  id: string;
  label: string;
  icon: string;
  values: string[];
};

export const standardServantClasses: ServantClassOption[] = [
  { id: 'saber', label: 'セイバー', icon: 'saber', values: ['saber'] },
  { id: 'archer', label: 'アーチャー', icon: 'archer', values: ['archer'] },
  { id: 'lancer', label: 'ランサー', icon: 'lancer', values: ['lancer'] },
  { id: 'rider', label: 'ライダー', icon: 'rider', values: ['rider'] },
  { id: 'caster', label: 'キャスター', icon: 'caster', values: ['caster'] },
  { id: 'assassin', label: 'アサシン', icon: 'assassin', values: ['assassin'] },
  { id: 'berserker', label: 'バーサーカー', icon: 'berserker', values: ['berserker'] },
];

export const extraServantClasses: ServantClassOption[] = [
  { id: 'shielder', label: 'シールダー', icon: 'shielder', values: ['shielder'] },
  { id: 'ruler', label: 'ルーラー', icon: 'ruler', values: ['ruler'] },
  { id: 'avenger', label: 'アヴェンジャー', icon: 'avenger', values: ['avenger'] },
  { id: 'moonCancer', label: 'ムーンキャンサー', icon: 'moon-cancer', values: ['moonCancer'] },
  { id: 'alterEgo', label: 'アルターエゴ', icon: 'alter-ego', values: ['alterEgo'] },
  { id: 'foreigner', label: 'フォーリナー', icon: 'foreigner', values: ['foreigner'] },
  { id: 'pretender', label: 'プリテンダー', icon: 'pretender', values: ['pretender'] },
  {
    id: 'beast',
    label: 'ビースト',
    icon: 'beast',
    values: ['beast', 'beastEresh', 'unBeastOlgaMarie'],
  },
];

export const allServantClasses = [...standardServantClasses, ...extraServantClasses];
export const servantClassLabels = new Map(
  allServantClasses.flatMap((option) =>
    option.values.map((value) => [value, option.label] as const),
  ),
);

const filterIconBase = '/filter-icons';

export function servantClassIconUrl(option: ServantClassOption): string {
  return `${filterIconBase}/class/${option.icon}.png`;
}

export function npCardIconUrl(card: 'buster' | 'arts' | 'quick'): string {
  return `${filterIconBase}/card/${card}.png`;
}

export function npCardLabel(card: 'buster' | 'arts' | 'quick'): string {
  return card === 'buster' ? 'Buster' : card === 'arts' ? 'Arts' : 'Quick';
}
