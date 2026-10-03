const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const advisory = 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm';
const expires = '2026-10-17T00:00:00Z';

// No patched braces release exists. Only repository-controlled watch patterns
// reach it, and the deployed site is static. See blog/README.md for the review.
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
      return name === 'braces' && cause.name === 'braces' && cause.url === advisory &&
        finding.nodes.every(node => lock.packages[node].version === '3.0.3');
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
    console.warn(`Temporary development-only exception: ${advisory}`);
    console.warn(`Expires ${expires}; affected dependency chain: ${excepted.join(', ')}.`);
  }
  if (blocked.length) {
    console.error(`Blocking vulnerabilities: ${blocked.join(', ')}.`);
    console.error('Run npm audit --prefix blog for details.');
    process.exitCode = 1;
  } else {
    console.log('Blog dependency audit passed' + (excepted.length ? ' with the exception above.' : ': no vulnerabilities.'));
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
