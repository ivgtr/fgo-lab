/** Keep the source identity in state and records; compact only its visual label. */
export function masterVersionLabel(version: string): string {
  return /^atlas:[0-9a-f]{64}$/.test(version) ? 'Atlas JP' : version;
}
