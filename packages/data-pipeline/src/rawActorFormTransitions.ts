import { actorFormKey, type ActorFormId } from '@fgo-lab/master-data';
import type { AtlasFunction } from './atlasContract';

export function functionChoice(
  fn: AtlasFunction,
): { family: 'actSet' | 'actSelectIndex'; candidate: number } | null {
  const parameters = [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5].flatMap(
    (values) => values ?? [],
  );
  const values = (key: 'ActSet' | 'ActSelectIndex') => [
    ...new Set(
      parameters.flatMap((parameter) =>
        typeof parameter[key] === 'number' ? [parameter[key]] : [],
      ),
    ),
  ];
  const actSet = values('ActSet');
  const actSelect = values('ActSelectIndex');
  if (actSet.length === 1 && actSelect.length === 0)
    return { family: 'actSet', candidate: actSet[0]! };
  if (actSelect.length === 1 && actSet.length === 0)
    return { family: 'actSelectIndex', candidate: actSelect[0]! };
  if (actSet.length > 0 || actSelect.length > 0)
    throw new TypeError(`ambiguous_activation_choice:${String(fn.funcId ?? 'missing')}`);
  return null;
}

export function choiceKey(choice: ReturnType<typeof functionChoice>): string {
  return choice ? `${choice.family}:${String(choice.candidate)}` : 'automatic';
}

export function transformTarget(fn: AtlasFunction): ActorFormId | null {
  if (fn.funcType !== 'transformServant') return null;
  const values = [
    ...new Map(
      [fn.svals, fn.svals2, fn.svals3, fn.svals4, fn.svals5]
        .flatMap((parameters) => parameters ?? [])
        .flatMap((parameter) =>
          typeof parameter.Value === 'number'
            ? [
                {
                  actorId: String(parameter.Value),
                  limitCount:
                    typeof parameter.SetLimitCount === 'number' ? parameter.SetLimitCount : 0,
                },
              ]
            : [],
        )
        .map((id) => [actorFormKey(id), id]),
    ).values(),
  ];
  if (values.length !== 1)
    throw new TypeError(`ambiguous_actor_form_transition:${String(fn.funcId ?? 'missing')}`);
  return values[0]!;
}
