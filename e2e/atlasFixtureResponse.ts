import type { Request } from '@playwright/test';

// Chromium can report ERR_ABORTED after Playwright has fulfilled a routed Atlas response.
// The Atlas journey verifies the complete stored digest and the rejected update separately.
const delivered = new WeakSet<Request>();

export function markDeliveredAtlasFixtureResponse(request: Request): void {
  delivered.add(request);
}

export function wasDeliveredAtlasFixtureResponse(request: Request): boolean {
  return delivered.has(request);
}
