#!/usr/bin/env node
import { run } from './cli.js';
import { nodeDeps } from './deps.js';

const controller = new AbortController();
let interrupted = false;
process.on('SIGINT', () => {
  // First Ctrl+C stops gracefully (state is saved); a second one exits now.
  if (interrupted) process.exit(130);
  interrupted = true;
  controller.abort();
});

const code = await run(process.argv.slice(2), nodeDeps(controller.signal));
process.exitCode = code;
// Do not let a lingering handle (stdin, sockets) keep the process alive.
setTimeout(() => process.exit(code), 1500).unref();
