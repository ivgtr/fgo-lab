// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { masterSnapshotSchema } from '@fgo-lab/master-data';
import fixture from '../../../../../packages/test-fixtures/master/fixture.json';
import { AttackerSkills } from './AttackerSkills';

afterEach(cleanup);

const attacker = masterSnapshotSchema.parse({
  ...fixture,
  servants: [
    {
      ...fixture.servants[0],
      skills: [
        {
          id: 'skill-1',
          slot: 1,
          priority: 1,
          name: '検証スキル',
          detail: '',
          imageKey: null,
          effects: [],
        },
      ],
    },
  ],
}).servants[0]!;

describe('attacker skill level presentation', () => {
  it('keeps the skill row static while exposing only level editing', () => {
    const onChange = vi.fn();
    const { getByLabelText, getByRole, queryAllByRole } = render(
      <AttackerSkills
        attacker={attacker}
        attackerSource="master"
        selectedSkills={[{ skillId: 'skill-1', skillLevel: 10 }]}
        savedBuild={undefined}
        hidden={false}
        onChange={onChange}
      />,
    );

    const row = getByRole('listitem');
    expect(row.querySelector('[aria-pressed]')).toBeNull();
    expect(queryAllByRole('button')).toEqual([]);
    expect(row.textContent).toContain('検証スキル');
    fireEvent.change(getByLabelText('検証スキルのスキルレベル'), {
      target: { value: '8' },
    });
    expect(onChange).toHaveBeenCalledWith('skill-1', { skillLevel: 8 });
  });
});
