import type {
  CanonicalNpResourceSemantics,
  MasterDataSnapshot,
  ServantMaster,
} from '@fgo-lab/master-data';
import type { CalculationScenario, PreNoblePhantasmCommand } from '@fgo-lab/schema';
import type { PreparationContextOptions, PreparationContextSnapshot } from './preparationContracts';
import { createAttackerPreparationContext } from './preparationState';
import { forkPreparationState } from './preparationState';
import { createPreNoblePhantasmState, reducePreNoblePhantasmAction } from './preNoblePhantasm';
import { stochasticWitnessEntries } from './stochasticPossibilities';
import type {
  PreparationActionExecution,
  PreparationInitializationExecution,
} from './preparationExecution';

interface PreparationPrefix {
  readonly execution: PreparationInitializationExecution | PreparationActionExecution;
  readonly context: PreparationContextSnapshot;
  readonly attacker: ServantMaster;
}
interface PreparationActionPrefix extends PreparationPrefix {
  readonly execution: PreparationActionExecution;
}
interface PreparationRoot {
  readonly context: PreparationContextSnapshot;
  readonly prefix: PreparationPrefix & { readonly execution: PreparationInitializationExecution };
}

export interface PreparationContextIdentity {
  scenario: Extract<CalculationScenario, { mode: 'resolved' }>;
  attacker: ServantMaster;
  resourceSemantics: CanonicalNpResourceSemantics;
  initialGauge: number;
  options: PreparationContextOptions;
  diagnoseRejectedActions: boolean;
  observed: boolean;
}

/** The same canonical initialization owns standalone and shared execution. */
export function initializePreparationRoot(input: PreparationContextIdentity) {
  const context = createAttackerPreparationContext(
    input.scenario,
    input.attacker,
    input.resourceSemantics,
    input.initialGauge,
    input.options,
  );
  return {
    context,
    execution: createPreNoblePhantasmState(
      input.attacker,
      input.scenario.attacker.initialActorFormId,
      context,
    ),
  };
}

/** A single request/servant batch owns these completed ordered prefixes. No state quotient. */
export class PreparationExecutionSession {
  private readonly roots = new Map<string, PreparationRoot>();
  private readonly children = new WeakMap<
    PreparationPrefix,
    Map<string, PreparationActionPrefix>
  >();
  readonly inventory = {
    initializationCount: 0,
    actionCount: 0,
    sharedInitializationCount: 0,
    sharedActionCount: 0,
    branchForkCount: 0,
  };

  constructor(readonly master: MasterDataSnapshot) {}

  checkout(prefix: PreparationPrefix) {
    if (!this.children.has(prefix)) throw new TypeError('preparation_session_prefix_mismatch');
    this.inventory.branchForkCount++;
    return forkPreparationState(prefix.execution.state);
  }

  root(input: PreparationContextIdentity): PreparationRoot {
    const { scenario, attacker, resourceSemantics, initialGauge, options } = input;
    if (options.master !== this.master) throw new TypeError('preparation_session_master_mismatch');
    if (
      attacker !== this.master.servants.find(({ id }) => id === scenario.attacker.servantId) ||
      resourceSemantics !== this.master.npResourceSemantics
    )
      throw new TypeError('preparation_session_canonical_input_mismatch');
    const selection = options.stochasticSelection;
    const key = JSON.stringify({
      scenario: { ...scenario, preNoblePhantasmPlan: undefined },
      initialGauge,
      initialMaximumHp: options.initialMaximumHp,
      initialOvercharge: options.initialOvercharge,
      initialBattlePointPoints: options.initialBattlePointPoints,
      policy: options.policy,
      stochasticSelection:
        selection?.kind === 'possibility'
          ? stochasticWitnessEntries(selection)
          : (selection?.kind ?? 'declared'),
      diagnoseRejectedActions: input.diagnoseRejectedActions,
      observePreparationTransition: input.observed,
    });
    const cached = this.roots.get(key);
    if (cached) {
      this.inventory.sharedInitializationCount++;
      return cached;
    }
    const callerOptions: PreparationContextOptions = {};
    if (options.stochasticSelection !== undefined)
      callerOptions.stochasticSelection = options.stochasticSelection;
    if (options.initialMaximumHp !== undefined)
      callerOptions.initialMaximumHp = options.initialMaximumHp;
    if (options.initialOvercharge !== undefined)
      callerOptions.initialOvercharge = options.initialOvercharge;
    if (options.initialBattlePointPoints !== undefined)
      callerOptions.initialBattlePointPoints = options.initialBattlePointPoints;
    if (options.policy !== undefined) callerOptions.policy = options.policy;
    const { scenario: ownedScenario, options: ownedOptions } = structuredClone({
      scenario,
      options: callerOptions,
    });
    const initialized = initializePreparationRoot({
      ...input,
      scenario: ownedScenario,
      options: { ...ownedOptions, master: this.master },
    }); // Throws never publish a prefix; caller-owned intent never becomes cached state.
    const root = {
      context: initialized.context,
      prefix: {
        execution: initialized.execution,
        context: initialized.context,
        attacker,
      },
    };
    this.children.set(root.prefix, new Map());
    this.roots.set(key, root);
    this.inventory.initializationCount++;
    return root;
  }

  step(prefix: PreparationPrefix, command: PreNoblePhantasmCommand): PreparationActionPrefix {
    const key = JSON.stringify(command);
    const children = this.children.get(prefix);
    if (!children) throw new TypeError('preparation_session_prefix_mismatch');
    const cached = children.get(key);
    if (cached) {
      this.inventory.sharedActionCount++;
      return cached;
    }
    const execution = reducePreNoblePhantasmAction(
      prefix.attacker,
      prefix.execution.state,
      structuredClone(command),
      { ...prefix.context },
    );
    const next = { execution, context: prefix.context, attacker: prefix.attacker };
    this.children.set(next, new Map());
    children.set(key, next);
    this.inventory.actionCount++;
    return next;
  }
}
