/** A missing level is unavailable data, never zero HP or an interpolated ATK-derived value. */
export function readHpAtLevel(
  hpByLevel: Readonly<Record<string, number>>,
  level: number,
): number | null {
  if (!Number.isSafeInteger(level) || level < 1) return null;
  const hp = hpByLevel[String(level)];
  return hp !== undefined && Number.isSafeInteger(hp) && hp >= 0 ? hp : null;
}
