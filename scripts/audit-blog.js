const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const expires = '2026-10-17T00:00:00Z';
const exceptions = [
  { name: 'braces', version: '3.0.3', url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' },
  { name: 'sprintf-js', version: '1.0.3', url: 'https://github.com/advisories/GHSA-hp3w-g68c-fv3c' }
];

// No patched releases exist for these development-only dependencies. The
// deployed site is static. See blog/README.md for exposure and removal criteria.
function evaluateAudit(report, lock, now = new Date()) {
  if (report.error || report.auditReportVersion !== 2 || !report.vulnerabilities ||
      typeof report.vulnerabilities !== 'object' || Array.isArray(report.vulnerabilities)) {
    throw new Error('npm did not return a valid audit report.');
  }

  function isExcepted(name, ancestors = new Set()) {
    const finding = report.vulnerabilities[name];
    if (!finding || ancestors.has(name) || !(now < new Date(expires))) return false;
    if (!finding.nodes?.length || !finding.nodes.every(node => lock.packages?.[node]?.dev === true)) {
      return false;
    }
    if (!finding.via?.length) return false;

    const visited = new Set([...ancestors, name]);
    return finding.via.every(cause => {
      if (typeof cause === 'string') return isExcepted(cause, visited);
      return exceptions.some(exception => name === exception.name && cause.name === exception.name &&
        cause.url === exception.url &&
        finding.nodes.every(node => lock.packages[node].version === exception.version));
    });
  }

  const excepted = [];
  const blocked = [];
  for (const name of Object.keys(report.vulnerabilities)) {
    (isExcepted(name) ? excepted : blocked).push(name);
  }
  return { excepted, blocked };
}

function main() {
  const blogDir = path.resolve(__dirname, '../blog');
  const audit = spawnSync('npm', ['audit', '--json'], { cwd: blogDir, encoding: 'utf8' });
  // npm exits 1 for findings. All other failures must stay blocking.
  if (audit.error || audit.signal || ![0, 1].includes(audit.status)) {
    throw new Error(audit.error?.message || audit.stderr || 'npm audit failed to run.');
  }

  const report = JSON.parse(audit.stdout);
  const lock = JSON.parse(fs.readFileSync(path.join(blogDir, 'package-lock.json'), 'utf8'));
  const { excepted, blocked } = evaluateAudit(report, lock);
  if (audit.status === 1 && !Object.keys(report.vulnerabilities).length) {
    throw new Error('npm audit failed without reporting vulnerabilities.');
  }
  if (excepted.length) {
    for (const exception of exceptions.filter(exception => excepted.includes(exception.name))) {
      console.warn(`Temporary development-only exception: ${exception.url} (${exception.name}@${exception.version}).`);
    }
    console.warn(`Expires ${expires}; excepted dependency findings: ${excepted.join(', ')}.`);
  }
  if (blocked.length) {
    console.error(`Blocking vulnerabilities: ${blocked.join(', ')}.`);
    console.error('Run npm audit --prefix blog for details.');
    process.exitCode = 1;
  } else {
    console.log('Blog dependency audit passed' + (excepted.length ? ' with the exceptions above.' : ': no vulnerabilities.'));
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { evaluateAudit };
