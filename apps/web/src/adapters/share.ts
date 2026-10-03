import type { CalculationShareSnapshot, UserDataBackup } from '@fgo-lab/schema';
import { parseCalculationShareSnapshot, parseUserDataBackup } from '@fgo-lab/schema';
import { validateProfileCollection } from '@fgo-lab/workspace-domain';
export const MAX_SHARE_FRAGMENT_LENGTH = 16_384;
export const RESULT_CARD_EXPORT_WIDTH = 560;
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
  const fragment = `share=${encode(parseCalculationShareSnapshot(snapshot))}`;
  if (fragment.length > MAX_SHARE_FRAGMENT_LENGTH) throw new RangeError('share_too_large');
  return fragment;
}
export function readShareFragment(fragment: string): CalculationShareSnapshot | null {
  if (fragment.length > MAX_SHARE_FRAGMENT_LENGTH + 1) throw new RangeError('share_too_large');
  const value = new URLSearchParams(fragment.replace(/^#/, '')).get('share');
  return value ? parseCalculationShareSnapshot(decode(value)) : null;
}
export async function exportBackup(backup: UserDataBackup): Promise<string> {
  const parsed = parseUserDataBackup(backup);
  await validateProfileCollection(parsed.profiles, digestProfileRequest);
  return JSON.stringify(parsed, null, 2);
}
export async function importBackup(text: string, maxBytes = 5_000_000): Promise<UserDataBackup> {
  if (new Blob([text]).size > maxBytes) throw new RangeError('backup_too_large');
  const backup = parseUserDataBackup(JSON.parse(text));
  await validateProfileCollection(backup.profiles, digestProfileRequest);
  return backup;
}
function digestProfileRequest(data: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new Uint8Array(data));
}

async function blobDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('image_data_url_missing'));
    reader.onerror = () => reject(reader.error ?? new Error('image_read_failed'));
    reader.readAsDataURL(blob);
  });
}

async function inlineRenderedElement(source: Element, clone: Element): Promise<void> {
  const computed = getComputedStyle(source);
  const style = Array.from(computed)
    .map((property) => `${property}:${computed.getPropertyValue(property)};`)
    .join('');
  clone.setAttribute('style', style);

  if (source instanceof HTMLImageElement && clone instanceof HTMLImageElement) {
    clone.removeAttribute('loading');
    const imageUrl = source.currentSrc || source.src;
    if (imageUrl) {
      try {
        const response = await fetch(imageUrl, { signal: AbortSignal.timeout(2000) });
        if (!response.ok) throw new Error(`image_fetch_failed:${String(response.status)}`);
        clone.src = await blobDataUrl(await response.blob());
      } catch {
        clone.removeAttribute('src');
      }
    }
  }

  await Promise.all(
    Array.from(source.children).map((child, index) => {
      const cloneChild = clone.children.item(index);
      return cloneChild ? inlineRenderedElement(child, cloneChild) : Promise.resolve();
    }),
  );
}

export async function resultCardPng(element: HTMLElement, scale = 2): Promise<Blob> {
  if (!Number.isFinite(scale) || scale < 1 || scale > 4) throw new RangeError('invalid_png_scale');
  await Promise.race([
    document.fonts.ready,
    new Promise<void>((resolve) => setTimeout(resolve, 1000)),
  ]);
  const bounds = element.getBoundingClientRect();
  const width = Math.ceil(bounds.width);
  const height = Math.ceil(bounds.height);
  if (width < 1 || height < 1 || width > 4096 || height > 4096)
    throw new RangeError('invalid_result_card_size');

  const clone = element.cloneNode(true) as HTMLElement;
  await inlineRenderedElement(element, clone);
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  const markup = new XMLSerializer().serializeToString(clone);
  const exportWidth = Math.ceil(RESULT_CARD_EXPORT_WIDTH * scale);
  const exportHeight = Math.ceil((height / width) * RESULT_CARD_EXPORT_WIDTH * scale);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(exportWidth)}" height="${String(exportHeight)}" viewBox="0 0 ${String(width)} ${String(height)}"><foreignObject width="${String(width)}" height="${String(height)}">${markup}</foreignObject></svg>`;
  const sourceUrl = await blobDataUrl(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('result_card_render_timeout')), 5000);
    image.onload = () => {
      clearTimeout(timeout);
      resolve();
    };
    image.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('result_card_render_failed'));
    };
    image.src = sourceUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = exportWidth;
  canvas.height = exportHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');
  context.drawImage(image, 0, 0, exportWidth, exportHeight);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('png_encode_failed'))),
      'image/png',
    ),
  );
}
