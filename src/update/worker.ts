// Background process of the daily version check: started detached by the
// CLI, prints nothing, exits after one registry request.
import { runUpdateCheck, type UpdateJob } from './check.js';

try {
  const job = JSON.parse(process.argv[2] ?? '{}') as UpdateJob;
  if (job.configDir && job.registryUrl) {
    await runUpdateCheck(job, (input, init) => fetch(input, init), Date.now());
  }
} catch {
  // Silent by design.
}
