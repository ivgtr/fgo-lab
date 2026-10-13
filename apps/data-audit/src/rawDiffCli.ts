import { diffRawGitRevisions } from './rawGitDiff';

const [repo, before, after, ...extra] = process.argv.slice(2);
if (!repo || !before || !after || extra.length)
  throw new TypeError(
    'usage: pnpm --filter @fgo-lab/data-audit raw-diff <raw-git-repo> <before-full-sha> <after-full-sha>',
  );

const result = await diffRawGitRevisions({ repo, before, after });
console.log(JSON.stringify(result, null, 2));
