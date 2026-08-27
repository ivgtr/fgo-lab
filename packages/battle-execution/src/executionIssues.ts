import type { ExecutionIssue } from './contracts';
import type { TargetResolution } from './targetContext';

export function targetResolutionIssues(resolution: TargetResolution): readonly ExecutionIssue[] {
  switch (resolution.kind) {
    case 'candidates':
      return [];
    case 'impossible':
      return [
        {
          kind: 'invalidTargetContext',
          detail: 'noSatisfiableTarget',
          sourceKeys: resolution.sourceKeys,
        },
      ];
    case 'unsupported':
      if (resolution.reason === 'targetConstraintUnsupported') return [resolution.issue];
      return [
        {
          kind: 'invalidTargetContext',
          detail: 'targetSearchLimit',
          sourceKeys: resolution.sourceKeys,
        },
      ];
  }
}
