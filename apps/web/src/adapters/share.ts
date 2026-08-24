import type { CalculationShareSnapshot, UserDataBackup } from '@fgo-lab/schema';
import { parseCalculationShareSnapshot, parseUserDataBackup } from '@fgo-lab/schema';
export const MAX_SHARE_FRAGMENT_LENGTH = 8192;
function encode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function decode(value: string): unknown {
  const padded = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createShareFragment(snapshot: CalculationShareSnapshot): string {
  const fragment = `share=${encode(snapshot)}`;
  if (fragment.length > MAX_SHARE_FRAGMENT_LENGTH) throw new RangeError('share_too_large');
  return fragment;
}
export function readShareFragment(fragment: string): CalculationShareSnapshot | null {
  const value = new URLSearchParams(fragment.replace(/^#/, '')).get('share');
  return value ? parseCalculationShareSnapshot(decode(value)) : null;
}
export function exportBackup(backup: UserDataBackup): string {
  return JSON.stringify(backup, null, 2);
}
export function importBackup(text: string, maxBytes = 5_000_000): UserDataBackup {
  if (new Blob([text]).size > maxBytes) throw new RangeError('backup_too_large');
  return parseUserDataBackup(JSON.parse(text));
}
