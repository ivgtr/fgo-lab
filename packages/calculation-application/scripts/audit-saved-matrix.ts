import { runProductionSavedAudit } from '../src/productionSavedAudit';

const [output, matrix, head] = process.argv.slice(2);
runProductionSavedAudit(output ?? '', matrix ?? '', head ?? '').catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
