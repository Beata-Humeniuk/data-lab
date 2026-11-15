function runChecks(checks) {
  let failed = false;
  for (const [ok, name] of checks) {
    if (!ok) { console.error('FAIL: ' + name); failed = true; }
    else console.log('OK: ' + name);
  }
  if (failed) process.exit(1);
}

module.exports = { runChecks };
