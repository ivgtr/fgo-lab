export type AtlasMaterialStep = Record<
  string,
  { items?: { item?: { id?: number }; amount?: number }[]; qp?: number }
>;
export type AtlasTraitRef = { id?: number; name?: string; negative?: boolean };
export type AtlasBuff = {
  type?: string;
  vals?: AtlasTraitRef[];
  tvals?: AtlasTraitRef[];
  ckSelfIndv?: AtlasTraitRef[];
  ckOpIndv?: AtlasTraitRef[];
  script?: {
    UpBuffRateBuffIndiv?: AtlasTraitRef[];
    checkIndvType?: number;
    INDIVIDUALITIE?: AtlasTraitRef;
    HP_LOWER?: unknown;
    HP_HIGHER?: unknown;
  };
};
export type AtlasFunction = {
  funcId?: number;
  funcType?: string;
  funcTargetType?: string;
  funcTargetTeam?: 'player' | 'enemy' | 'playerAndEnemy';
  funcPopupText?: string;
  functvals?: AtlasTraitRef[];
  funcquestTvals?: AtlasTraitRef[];
  traitVals?: AtlasTraitRef[];
  script?: Record<string, unknown> & { funcIndividuality?: AtlasTraitRef[] };
  buffs?: AtlasBuff[];
  overWriteTvalsList?: unknown[];
  svals?: AtlasFunctionValue[];
  svals2?: AtlasFunctionValue[];
  svals3?: AtlasFunctionValue[];
  svals4?: AtlasFunctionValue[];
  svals5?: AtlasFunctionValue[];
};
export type AtlasFunctionValue = Record<string, unknown> & {
  Rate?: number;
  Value?: number;
  Value2?: number;
  Target?: number;
  Correction?: number;
  TargetList?: number[];
  ParamAddMaxCount?: number;
  TargetRarityList?: number[];
  AndCheckIndividualityList?: number[];
  AddIndividualty?: number;
  AddIndividualtyList?: number[];
  IncludeIgnoreIndividuality?: number;
  IgnoreIndivUnreleaseable?: number;
  CheckDead?: number;
  HideMiss?: number;
  HideNoEffect?: number;
  FieldIndividuality?: number[];
  SetLimitCount?: number;
  CancelTransform?: number;
};
export type AtlasReferencedSkill = {
  id?: number;
  functions?: AtlasFunction[];
};
export type AtlasReleaseCondition = {
  condType?: string;
  condTargetId?: number;
  condNum?: number;
  condGroup?: number;
};
export type AtlasServantAssociation = {
  releaseConditions?: AtlasReleaseCondition[];
};
export type AtlasServant = {
  id?: number;
  collectionNo?: number;
  type?: string;
  name?: string;
  script?: {
    transformInfo?: {
      saveTransform?: number;
      saveTransformDefault?: number;
    };
  };
  className?: string;
  attribute?: string;
  rarity?: number;
  atkGrowth?: number[];
  traits?: { id?: number; name?: string }[];
  battlePoints?: { id?: number; phases?: { phase?: number }[] }[];
  skills?: {
    id?: number;
    num?: number;
    priority?: number;
    name?: string;
    detail?: string;
    icon?: string;
    functions?: AtlasFunction[];
    skillSvts?: AtlasServantAssociation[];
  }[];
  classPassive?: AtlasServant['skills'];
  noblePhantasms?: AtlasNp[];
  extraAssets?: {
    faces?: { ascension?: Record<string, string>; costume?: Record<string, string> };
  };
  ascensionAdd?: {
    individuality?: {
      ascension?: Record<string, AtlasTraitRef[]>;
      costume?: Record<string, AtlasTraitRef[]>;
    };
  };
  ascensionMaterials?: AtlasMaterialStep;
  skillMaterials?: AtlasMaterialStep;
  appendSkillMaterials?: AtlasMaterialStep;
};
export type AtlasNp = {
  id?: number;
  name?: string;
  card?: string;
  priority?: number;
  script?: {
    tdTypeChangeIDs?: number[];
    excludeTdChangeTypes?: number[];
  };
  functions?: AtlasFunction[];
  npSvts?: AtlasServantAssociation[];
};
export type AtlasEquip = {
  id?: number;
  collectionNo?: number;
  name?: string;
  lvMax?: number;
  atkBase?: number;
  atkMax?: number;
  skills?: {
    id?: number;
    condLimitCount?: number;
    priority?: number;
    functions?: AtlasFunction[];
  }[];
  extraAssets?: { equipFace?: { equip?: Record<string, string> } };
};
export type AtlasMysticCode = {
  id?: number;
  name?: string;
  maxLv?: number;
  extraAssets?: { item?: { male?: string; female?: string } };
  skills?: {
    id?: number;
    name?: string;
    detail?: string;
    icon?: string;
    priority?: number;
    functions?: AtlasFunction[];
  }[];
};
export type AtlasItem = {
  id?: number;
  name?: string;
  type?: string;
  priority?: number;
  icon?: string;
  uses?: string[];
};
