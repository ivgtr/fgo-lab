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

export async function resultCardPng(snapshot: CalculationShareSnapshot): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 620;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#18233a';
  context.fillRect(0, 0, canvas.width, 72);
  context.fillStyle = '#fff';
  context.font = '700 28px sans-serif';
  context.fillText('FGO Lab / 宝具ダメージ', 36, 46);
  context.fillStyle = '#182033';
  context.font = '700 25px sans-serif';
  context.fillText(
    `攻撃役 ${snapshot.input.attackerId}  Lv.${String(snapshot.input.attackerLevel)}`,
    36,
    125,
  );
  context.font = '18px sans-serif';
  context.fillText(
    `対象 ${snapshot.input.target.classId} / ${snapshot.input.target.attribute}`,
    36,
    160,
  );
  context.font = '700 20px monospace';
  context.fillText('NP       平均          最低          最大', 36, 220);
  context.font = '24px monospace';
  for (const [index, row] of snapshot.result.results.entries()) {
    context.fillText(
      `NP${String(row.npLevel)}  ${Math.round(row.average).toLocaleString('ja-JP').padStart(12)}  ${row.minimum.toLocaleString('ja-JP').padStart(12)}  ${row.maximum.toLocaleString('ja-JP').padStart(12)}`,
      36,
      270 + index * 58,
    );
  }
  context.font = '16px sans-serif';
  context.fillText(
    `精度 ${snapshot.result.precision} / DB ${snapshot.result.versions.masterDataVersion} / engine ${snapshot.result.versions.engineVersion}`,
    36,
    590,
  );
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('png_encode_failed'))),
      'image/png',
    ),
  );
}
