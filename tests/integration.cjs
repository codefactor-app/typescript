'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {Codefactor, CodefactorError} = require('../dist');

test('installed engine supports five languages, queries, violations, failures and timeout', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codefactor typescript ; '));
  const sources = {
    'calls.php': '<?php function leaf(){return 1;} function caller(){return leaf();}',
    'calls.py': 'def leaf():\n    return 1\ndef caller(a, b, c):\n    return leaf()\n',
    'calls.ts': 'export function leaf(){return 1;} export function caller(){return leaf();}',
    'calls.js': 'function leaf(){return 1;} function caller(){return leaf();}',
    'calls.rs': 'fn leaf()->i32{1} fn caller()->i32{leaf()}',
  };
  try {
    for (const [name, source] of Object.entries(sources)) fs.writeFileSync(path.join(root, name), source);
    const client = new Codefactor();
    const {data: report} = await client.scan(root, {architecture: false});
    assert.equal(report.summary.files, 5);
    assert.equal(report.summary.functions, 10);
    assert.deepEqual(report.parse_errors, []);
    assert.equal((await client.scan(root, {languages: ['python']})).data.summary.files, 1);
    assert.ok((await client.ast(path.join(root, 'calls.py'))).data.root);
    assert.ok((await client.graph('calls.caller', root, 'callees', 2)).data.edges.length);
    const config = path.join(root, 'limits.yaml');
    fs.writeFileSync(config, 'limits:\n  function_params: {warn: 1, error: 2}\ncache:\n  enabled: false\n');
    const violations = await client.scan(root, {config});
    assert.equal(violations.exitCode, 2);
    assert.ok(violations.data.summary.errors > 0);
    fs.writeFileSync(config, '[invalid: yaml');
    await assert.rejects(client.scan(root, {config}), error => error instanceof CodefactorError && error.exitCode === 3);
    await assert.rejects(client.scan(path.join(root, 'missing')), CodefactorError);
    if (process.platform !== 'win32') {
      const fake = path.join(root, 'slow');
      fs.writeFileSync(fake, `#!${process.execPath}\nsetTimeout(() => {}, 30000);\n`, {mode: 0o755});
      await assert.rejects(new Codefactor({binary: fake, timeoutMs: 50}).scan(root), /timed out/);
    }
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
