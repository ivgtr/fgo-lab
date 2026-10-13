import { scanRawGitRevision } from './rawGitDiff';

const [repo, revision, ...extra] = process.argv.slice(2);
if (!repo || !revision || extra.length)
  throw new TypeError(
    'usage: pnpm --filter @fgo-lab/data-audit raw-scan <raw-git-repo> <full-sha>',
  );

const result = await scanRawGitRevision({ repo, revision });
console.log(JSON.stringify(result, null, 2));
