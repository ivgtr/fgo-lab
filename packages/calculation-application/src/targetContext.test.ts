import { describe, expect, it } from 'vitest';
import { applyTargetContextCommand, createDefaultTargetContext } from './targetContext';

describe('target context commands', () => {
  it('keeps class, attribute, and family updates in one reducer', () => {
    const initial = createDefaultTargetContext('saber');
    const concrete = applyTargetContextCommand(initial, {
      kind: 'setConcreteClass',
      classId: 'lancer',
    });
    const attributed = applyTargetContextCommand(concrete, {
      kind: 'setConcreteAttribute',
      attribute: 'sky',
    });
    const family = applyTargetContextCommand(attributed, {
      kind: 'setFamily',
      familyId: 'demonGodPillar',
      enabled: true,
    });
    expect(family).toEqual({
      class: { kind: 'concrete', classId: 'lancer' },
      attribute: { kind: 'concrete', attribute: 'sky' },
      families: [{ familyId: 'demonGodPillar' }],
    });
    expect(
      applyTargetContextCommand(family, {
        kind: 'setFamily',
        familyId: 'demonGodPillar',
        enabled: false,
      }),
    ).toEqual({ ...family, families: [] });
  });
});
