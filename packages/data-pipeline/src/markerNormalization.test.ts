import { expect, it } from 'vitest';
import { normalizeMarkerInstance } from './markerNormalization';
import type { AtlasFunction } from './atlasContract';
const fn: AtlasFunction = {
  funcType: 'addState',
  funcTargetType: 'self',
  funcTargetTeam: 'player',
  buffs: [{ id: 72, type: 'addIndividuality', vals: [{ id: 9, name: 'buff-marker' }] }],
  svals: [{ Rate: 1000, Turn: 3, Count: -1, Value: 0 }],
};
it('keeps unnamed actor individuality, buff identity and extra instance traits separate in every cell', () => {
  for (const value of [0, 9999, 10002]) {
    const cells = [
      {
        ...fn.svals![0]!,
        Value: value,
        AddIndividualty: 8,
        AddIndividualtyList: [8],
        AddLinkageTargetIndividualty: 8,
      },
    ];
    const operations = normalizeMarkerInstance(
      { ...fn, svals: cells, svals2: cells },
      new Map(),
      false,
    )!;
    expect(operations).toEqual([
      {
        kind: 'buffInstanceMutation',
        mutation: 'grant',
        recipient: 'sourceSelf',
        traits: ['buffId:72', 'buff-marker', 'traitId:8'],
        lifetime: 'active',
        marker: {
          actorTrait: `traitId:${value}`,
          buffIdentity: 'buffId:72',
          removable: true,
          onField: false,
          recipientSide: 'ally',
        },
      },
    ]);
  }
});
it('keeps unclassified instance lifecycle and conflicting cells unresolved', () => {
  for (const extra of [{ Future: 1 }, { BehaveAsFamilyBuff: 1 }, { Count: 2 }])
    expect(
      normalizeMarkerInstance({ ...fn, svals: [{ ...fn.svals![0]!, ...extra }] }, new Map(), false),
    ).toBeNull();
  expect(
    normalizeMarkerInstance({ ...fn, svals2: [{ ...fn.svals![0]!, Value: 7 }] }, new Map(), false),
  ).toBeNull();
});
