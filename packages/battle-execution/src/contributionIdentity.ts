import type { ContributionComponent, ContributionId } from './contracts';

export function contributionId(
  operationId: string,
  component: ContributionComponent,
): ContributionId {
  return `${operationId}:${component}`;
}
