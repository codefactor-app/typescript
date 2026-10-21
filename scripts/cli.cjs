#!/usr/bin/env node
'use strict';
const {spawn} = require('node:child_process');

const core = require('./core.cjs');
if (process.argv[2] === 'core') {
  core.updateCommand(process.argv.slice(3)).catch(error => {console.error(error.message); process.exitCode = error instanceof core.ConfigError ? 3 : 1;});
} else {
  run();
}

function run() {
  let binary;
  try { binary = core.resolveBinary(core.argumentContext(process.argv.slice(2))); }
  catch (error) { console.error(error.message); process.exit(error instanceof core.ConfigError ? 3 : 1); }
  const child = spawn(binary, process.argv.slice(2), {stdio: 'inherit', shell: false});
  const handlers = new Map();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const handler = () => child.kill(signal);
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  function cleanup() {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  }
  child.on('error', error => {
    cleanup();
    console.error(`Cannot start Codefactor binary: ${error.message}. Run codefactor core update or check CODEFACTOR_BINARY.`);
    process.exitCode = error.code === 'ENOENT' ? 127 : 126;
  });
  child.on('exit', (code, signal) => {
    cleanup();
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}
