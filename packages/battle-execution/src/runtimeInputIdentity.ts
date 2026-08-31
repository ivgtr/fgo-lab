import type { Origin } from './effectRouting';

export function runtimeInputKey(
  origin: Origin,
  sourceInstanceId: string,
  skillId: string,
  occurrenceId: string,
  key: string,
): string {
  if (key.startsWith('activation:'))
    return `source:${origin}:${sourceInstanceId}:${skillId}:${key}`;
  return key.startsWith('effect:')
    ? `source:${origin}:${sourceInstanceId}:${skillId}:${occurrenceId}:${key.slice('effect:'.length)}`
    : key;
}
