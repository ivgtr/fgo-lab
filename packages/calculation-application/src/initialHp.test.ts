import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/master/fixture.json';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import { resolveInitialMaximumHp } from './initialHp';
import { createDefaultResolvedScenario, resolveScenarioPreparationOutcome } from './scenario';
import {
  createCalculatorPortableRequest,
  executePortableCalculation,
  currentCalculationVersionContext,
} from './portableCalculation';

const master = masterSnapshotSchema.parse(fixture);
const scenario = createDefaultResolvedScenario(master, undefined);
const equip = master.craftEssences[0]!;
const equipped = {
  ...scenario,
  craftEssence: { craftEssenceId: equip.id, level: 2, limitBreak: 0 },
};

describe('approved initial maximum HP basis', () => {
  it('adds fixed HP Fou independently of ATK Fou, and adds exact equipped HP', () => {
    const modified = { ...master, craftEssences: [{ ...equip, hpByLevel: { '1': 0, '2': 137 } }] };
    expect(resolveInitialMaximumHp(scenario, modified)).toEqual({
      status: 'resolved',
      maximum: 11000,
    });
    expect(
      resolveInitialMaximumHp(
        { ...equipped, attacker: { ...equipped.attacker, fouAtk: 0 } },
        modified,
      ),
    ).toEqual({ status: 'resolved', maximum: 11137 });
    expect(resolveScenarioPreparationOutcome(equipped, modified)).toMatchObject({
      status: 'executable',
      initialMaximumHp: 11137,
    });
    expect(resolveInitialMaximumHp({ ...equipped, craftEssence: null }, modified)).toEqual({
      status: 'resolved',
      maximum: 11000,
    });
  });
  it('distinguishes explicit zero HP, missing HP, and invalid equipment', () => {
    expect(resolveInitialMaximumHp(equipped, master)).toEqual({
      status: 'resolved',
      maximum: 11000,
    });
    const missing = { ...master, craftEssences: [{ ...equip, hpByLevel: {} }] };
    expect(resolveInitialMaximumHp(equipped, missing)).toMatchObject({
      status: 'invalid',
      issue: { source: 'craftEssence', reason: 'missingHp' },
    });
    expect(
      resolveInitialMaximumHp(
        { ...equipped, craftEssence: { ...equipped.craftEssence, level: 100 } },
        master,
      ),
    ).toMatchObject({ status: 'invalid', issue: { reason: 'invalidEquipment' } });
    expect(
      resolveInitialMaximumHp(
        { ...equipped, craftEssence: { ...equipped.craftEssence, craftEssenceId: 'absent' } },
        master,
      ),
    ).toMatchObject({ status: 'invalid', issue: { reason: 'invalidEquipment' } });
  });
  it('fails closed on missing servant HP even when ATK exists', () => {
    const missing = {
      ...master,
      servants: master.servants.map((servant) => ({ ...servant, hpByLevel: {} })),
    };
    expect(resolveScenarioPreparationOutcome(scenario, missing)).toMatchObject({
      status: 'invalid',
      issue: { kind: 'initialHpUnavailable', source: 'servant' },
    });
  });
  it('revalidates equipment HP through the portable replay path', () => {
    const missing = { ...master, craftEssences: [{ ...equip, hpByLevel: {} }] };
    const request = createCalculatorPortableRequest(
      equipped,
      currentCalculationVersionContext(missing),
    );
    expect(executePortableCalculation(request, missing)).toMatchObject({
      status: 'invalid',
      reason: 'initialHpUnavailable',
    });
  });
});
