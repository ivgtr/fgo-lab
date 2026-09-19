import type {
  ActorFormId,
  ActorFormNode,
  EffectExecutionOperation,
  NoblePhantasmVariantRef,
} from '@fgo-lab/master-data';
import type { AtlasFunction } from './atlasContract';
import type { RawSkill } from './actorFormSkillNormalization';
import type { RawVariantGroup } from './rawActorFormExtraction';

export interface NoblePhantasmVariantNormalization {
  actorForms: {
    baseHp: ActorFormNode['baseHp'];
    id: ActorFormId;
    name: string;
    initial: boolean;
    defaultInitial: boolean;
    traits: string[];
    skillIds: string[];
    passiveIds: string[];
    baseNoblePhantasmVariant: NoblePhantasmVariantRef | null;
  }[];
  initialFormIds: ActorFormId[];
  defaultInitialFormId: ActorFormId;
  baseNoblePhantasmGroupId: string | null;
  groups: RawVariantGroup[];
  skills: RawSkill[];
  passives: RawSkill[];
  transitions: {
    from: ActorFormId;
    to: ActorFormId;
    direction: 'forward' | 'reverse';
    sourceKind: 'skill' | 'passive' | 'noblePhantasm';
    sourceId: string;
    effectOccurrenceId: string;
  }[];
  canonicalOperationsByFunction: ReadonlyMap<AtlasFunction, readonly EffectExecutionOperation[]>;
  variantStateTraits: ReadonlySet<string>;
}
