# Repository implementation principles

## Start from the system, not the symptom

- Damage correctness is the highest priority. Before editing, state the user-visible outcome, domain invariants, and the semantic family that owns the behavior.
- Audit the whole production family before adding a local fix. Repeated exceptions or newly discovered per-servant differences are signals to pause and improve the model.
- Keep the solution bounded by the current product requirements. Do not turn the calculator into a general battle simulator without an explicit requirement.

## Plan the whole execution family

- For structural or semantic reviews, follow `docs/guides/systematic-review-guidelines.md` before finalizing findings. If a later review expands the recurrence scope of the same mechanism, identify the earlier review gap before requesting another implementation patch.
- Apply flow closure when a task changes canonical state, outcome classification, or multiple execution/write paths. Otherwise close it with one `N/A: reason` line.
- For an applicable change, trace each canonical state through the forward execution flow and any recovery flow back to application or UI. Scope the inventory to direct readers/writers and paths that can change damage, precision, operation outcome, required input, or UI commands; include indirect dependencies only when they transform one of those results.
- Define externally meaningful outcome classes before composing them. Do not collapse stochastic failure, disabled inclusion, repairable user input, semantic invalidity, and unsupported execution merely because they all avoid a numeric result.
- Plan counterexamples as a state-by-path matrix. Cover alternate execution paths and schema-legal states absent from production, rather than proving only the central path or current production defaults.
- Keep one canonical flow note per semantic family. After its initial inventory, update only changed or newly discovered producers, consumers, writers, and counterexamples; plans and handoffs reference the note and current delta instead of copying it.
- Classify each scoped path as `Verified`, `N/A: reason`, `Deferred: TSK-ID`, or `Blocking: reason`. Completion requires zero `Blocking` items. A production-negative case can become `Verified` through a schema-legal focused fixture.
- Treat a structural review finding as evidence that the flow inventory or ownership model may be incomplete. Update the plan and its counterexamples before adding another patch. Review iteration is acceptable; minimizing or hiding the unresolved scope before resubmission is not.
- For a structural review finding, record the mechanism, implementation mismatch, missed detection, and recurrence scope/minimum guardrail once. Separate confirmed facts from inference and cite the supporting code or test; keep the detailed template in `docs/guides/prompt-engineering-guidelines.md`.

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

## Keep execution single-agent by default

- One parent agent owns normal diagnosis, planning, implementation, test changes, test execution, integration, review handoff, and final verification. Do not delegate these activities to subagents.
- A subagent is permitted only for a bounded, independent, read-only investigation whose result the parent can use without another delegated action. It must not edit files, stage or commit, create artifacts, run builds or tests, change external state, or approve/review its own implementation.
- Before spawning an allowed subagent, the parent must state the independent question and why a single-agent investigation is insufficient. Give it only the paths, comparison boundary, and facts needed for that question; do not fork full conversation history.
- Use at most one subagent at a time. The parent remains responsible for integrating evidence, making decisions, and performing every write and verification step.
- An allowed subagent returns a concise evidence note: conclusion, uncertainty, and only the file/symbol references needed to support it. Do not transfer raw command output, full logs, or a restatement of repository instructions.

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
- Expand verification from `pnpm test:diagnostic -- <filter>` to `pnpm test:unit` or `pnpm test:production` as appropriate, then use `pnpm quality` as the only phase-completion gate. Do not append `validate:evidence` or another Vitest run to `quality`; its contracts are already in the production suite.
