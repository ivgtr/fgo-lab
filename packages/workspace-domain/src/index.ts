import type { CalculationResult, LocalProfile, PortableCalculationRequest } from '@fgo-lab/schema';

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
    .join(',')}}`;
}
export async function portableCalculationFingerprint(
  request: PortableCalculationRequest,
  digest: (data: Uint8Array) => Promise<ArrayBuffer>,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(request));
  const hash = new Uint8Array(await digest(bytes));
  return [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
export interface FinalizeHistoryCommand {
  sessionId: string;
  request: PortableCalculationRequest;
  result: CalculationResult;
  fingerprint: string;
  now: string;
  historyId: string;
}
export function finalizeHistory(
  profile: LocalProfile,
  command: FinalizeHistoryCommand,
): LocalProfile {
  if (command.result.status !== 'calculated') return profile;
  const sessionIndex = profile.history.findIndex(
    (entry) => entry.calculationSessionId === command.sessionId,
  );
  if (sessionIndex >= 0) {
    const existing = profile.history[sessionIndex]!;
    const updated = {
      ...existing,
      request: command.request,
      result: command.result,
      requestFingerprint: command.fingerprint,
      updatedAt: command.now,
      lastUsedAt: command.now,
    };
    return {
      ...profile,
      history: [
        ...profile.history.slice(0, sessionIndex),
        ...profile.history.slice(sessionIndex + 1),
        updated,
      ],
      updatedAt: command.now,
    };
  }
  const previous = profile.history.at(-1);
  if (previous?.requestFingerprint === command.fingerprint) {
    const history = [
      ...profile.history.slice(0, -1),
      {
        ...previous,
        calculationSessionId: command.sessionId,
        updatedAt: command.now,
        lastUsedAt: command.now,
      },
    ];
    return { ...profile, history, updatedAt: command.now };
  }
  const entry = {
    profileId: profile.profileId,
    calculationSessionId: command.sessionId,
    request: command.request,
    result: command.result,
    requestFingerprint: command.fingerprint,
    updatedAt: command.now,
    historyId: command.historyId,
    finalizedAt: command.now,
    lastUsedAt: command.now,
  };
  return { ...profile, history: [...profile.history, entry].slice(-20), updatedAt: command.now };
}
export interface Command<T> {
  apply(state: T): T;
  revert(state: T): T;
}
export class UndoStack<T> {
  readonly #past: Command<T>[] = [];
  execute(state: T, command: Command<T>): T {
    this.#past.push(command);
    return command.apply(state);
  }
  undo(state: T): T {
    const command = this.#past.pop();
    return command ? command.revert(state) : state;
  }
  get canUndo(): boolean {
    return this.#past.length > 0;
  }
}
export function filterRanking<
  T extends { name: string; classId: string; rarity: number; npCard: string; npTarget: string },
>(
  items: readonly T[],
  query: {
    text: string;
    classes: readonly string[];
    rarities: readonly number[];
    cards: readonly string[];
    targets: readonly string[];
  },
): T[] {
  const text = query.text.toLocaleLowerCase('ja');
  return items.filter(
    (item) =>
      item.name.toLocaleLowerCase('ja').includes(text) &&
      (query.classes.length === 0 || query.classes.includes(item.classId)) &&
      (query.rarities.length === 0 || query.rarities.includes(item.rarity)) &&
      (query.cards.length === 0 || query.cards.includes(item.npCard)) &&
      (query.targets.length === 0 || query.targets.includes(item.npTarget)),
  );
}
