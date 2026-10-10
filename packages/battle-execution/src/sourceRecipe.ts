import type { MasterEffect, ServantMaster } from '@fgo-lab/master-data';
import type { SourceEffect } from './sourceCollection';
import type { CompiledOperations } from './operationCompiler';
import type { OcSourceProgram } from './ocSourceProgram';
import type { ConditionExpression } from './contracts';

interface CompiledSourceRecipe {
  readonly key: string;
  readonly source: SourceEffect;
  readonly actorForms: ServantMaster['actorFormGraph']['forms'] | undefined;
  damage?: CompiledOperations;
}
type SourceIdentity = Pick<SourceEffect, 'origin' | 'sourceId' | 'sourceInstanceId' | 'skillId'>;
interface SourceFamily {
  recipes: CompiledSourceRecipe[];
  oc?: Omit<OcSourceProgram, 'source'>;
  attackerCondition?: ConditionExpression;
  sourceCondition?: ConditionExpression;
}
const families = new WeakMap<MasterEffect, Map<string, SourceFamily>>();

export function sourceFamily(effect: MasterEffect, identity: SourceIdentity): SourceFamily {
  const entries = families.get(effect) ?? new Map<string, SourceFamily>();
  const key = JSON.stringify([
    identity.origin,
    identity.sourceId,
    identity.sourceInstanceId,
    identity.skillId,
  ]);
  const cached = entries.get(key);
  if (cached) return cached;
  const created = {
    recipes: [],
  };
  entries.set(key, created);
  families.set(effect, entries);
  return created;
}
/** Pure master/source recipes only. Runtime activation, physical bindings and order stay local. */
export function sourceRecipe(
  source: SourceEffect,
  actorForms?: ServantMaster['actorFormGraph']['forms'],
): CompiledSourceRecipe {
  // Every empty inventory describes the same absent transform target. Dependency readers
  // create fresh empty arrays; their allocation identity must not grow the master cache.
  const forms =
    actorForms?.length && source.effect.execution.some(({ kind }) => kind === 'transformActorForm')
      ? actorForms
      : undefined;
  const entries = sourceFamily(source.effect, source).recipes;
  // Include every static field, including future fields. The effect is the WeakMap owner;
  // markerReaders is the only Set and its membership, rather than insertion order, matters.
  const key = JSON.stringify({
    ...source,
    effect: undefined,
    sourceActivation: { kind: 'unread' },
    runtimeBinding: undefined,
    markerReaders:
      source.markerReaders === undefined ? undefined : [...source.markerReaders].sort(),
  });
  const recipe = entries.find((previous) => previous.actorForms === forms && previous.key === key);
  if (recipe) return recipe;
  const staticSource = { ...source, sourceActivation: { kind: 'unread' as const } };
  delete staticSource.runtimeBinding;
  const created = {
    key,
    source: staticSource,
    actorForms: forms,
  };
  entries.push(created);
  return created;
}
