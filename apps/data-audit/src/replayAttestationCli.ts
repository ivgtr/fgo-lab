import { attestReplayBytes } from './replayAttestation';

const [, , observedDirectory, replayDirectory, ...extra] = process.argv;
if (!observedDirectory || !replayDirectory || extra.length)
  throw new TypeError('usage: attest-replay <observed-directory> <replay-export-directory>');

process.stdout.write(
  `${JSON.stringify(await attestReplayBytes({ observedDirectory, replayDirectory }))}\n`,
);
