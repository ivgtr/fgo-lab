# Repository implementation principles

## Start from the system, not the symptom

- Damage correctness is the highest priority. Before editing, state the user-visible outcome, domain invariants, and the semantic family that owns the behavior.
- Audit the whole production family before adding a local fix. Repeated exceptions or newly discovered per-servant differences are signals to pause and improve the model.
- Keep the solution bounded by the current product requirements. Do not turn the calculator into a general battle simulator without an explicit requirement.

## Converge on one canonical model

- Do not add servant IDs, names, labels, or raw external keys as runtime branches.
- Prefer typed identities, states, transitions, and exhaustive unions over growing `if`/`switch` chains, nested ternaries, or parallel candidate lists.
- Do not preserve old behavior merely for compatibility. Breaking schema changes and deletion of obsolete paths are acceptable when they produce one simpler source of truth.
- Fail closed on missing, ambiguous, contradictory, or partially applicable semantics. Never replace invalid state with a plausible numeric fallback.

## Preserve architectural boundaries

- The data pipeline alone interprets Atlas/raw vocabulary and emits canonical IR.
- Application code owns scenario commands and user intent; execution code consumes canonical state and applies ordered, transactional operations.
- Calculator and ranking must share the same application and execution path. Ranking policy may select scenarios, but must not implement its own damage semantics.
- Web/UI code presents canonical state and dispatches commands; it must not infer game rules from IDs, names, or labels.

## Control complexity and test cost

- Extend an existing responsibility or extract a focused module; do not move detail back into orchestrators or create packages without a clear ownership boundary.
- Keep invalid and executable states distinct in the type system. Separate available actions, used inputs, and already-applied effects when time or state transitions matter.
- Use small semantic fixtures for behavior and one shared production inventory/digest for full-data coverage. Do not reload, recompile, or recalculate the full master per case.
- Measure affected production suites and hot paths before and after structural work. Treat unexplained test/runtime growth, candidate explosion, or relaxed complexity ratchets as design failures.

## Work and verification discipline

- Preserve unrelated user changes. Stage and commit only the requested files, and verify the staged diff explicitly.
- Record intentional damage changes with canonical inputs and the governing semantic rule, not only snapshots of final numbers.
- Do not claim completion from passing tests alone: confirm production inventory, calculator/ranking parity, fail-closed behavior, performance, and the requested UI invariants in proportion to the change.
- Use `pnpm test:agent` for bounded output and `pnpm test:diagnostic -- <filter>` for verbose diagnosis. Long-running commands should wait at least 30 seconds between empty polls; inspect the referenced `.test-results/` artifact instead of replaying full logs.
