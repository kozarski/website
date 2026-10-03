const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateAudit } = require('../audit-blog.js');

const now = new Date('2026-10-03T00:00:00Z');

function fixture() {
  return {
    report: {
      auditReportVersion: 2,
      vulnerabilities: {
        braces: {
          nodes: ['node_modules/braces'],
          via: [{ name: 'braces', url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' }]
        },
        chokidar: { nodes: ['node_modules/chokidar'], via: ['braces'] },
        eleventy: { nodes: ['node_modules/eleventy'], via: ['chokidar'] }
      }
    },
    lock: {
      packages: {
        'node_modules/braces': { version: '3.0.3', dev: true },
        'node_modules/chokidar': { version: '3.6.0', dev: true },
        'node_modules/eleventy': { version: '3.1.6', dev: true }
      }
    }
  };
}

test('passes a clean report after the exception expires', () => {
  assert.deepEqual(evaluateAudit({ auditReportVersion: 2, vulnerabilities: {} }, {},
    new Date('2026-10-18T00:00:00Z')), { excepted: [], blocked: [] });
});

test('excepts only the reviewed advisory and its development dependency chain', () => {
  const { report, lock } = fixture();
  assert.deepEqual(evaluateAudit(report, lock, now), {
    excepted: ['braces', 'chokidar', 'eleventy'], blocked: []
  });
});

test('blocks the advisory at the expiry boundary', () => {
  const { report, lock } = fixture();
  assert.deepEqual(evaluateAudit(report, lock, new Date('2026-10-17T00:00:00Z')), {
    excepted: [], blocked: ['braces', 'chokidar', 'eleventy']
  });
});

test('blocks new advisories, including on an otherwise excepted package', () => {
  const { report, lock } = fixture();
  report.vulnerabilities.braces.via.push({ name: 'braces', url: 'https://github.com/advisories/new' });
  assert.deepEqual(evaluateAudit(report, lock, now).blocked, ['braces', 'chokidar', 'eleventy']);
});

test('blocks unrelated findings while retaining the narrow exception', () => {
  const { report, lock } = fixture();
  report.vulnerabilities.other = { nodes: ['node_modules/other'], via: [{ name: 'other', url: 'new' }] };
  assert.deepEqual(evaluateAudit(report, lock, now).blocked, ['other']);
});

test('blocks runtime, missing, and unreviewed versions of braces', () => {
  for (const replacement of [{ version: '3.0.3' }, undefined, { version: '3.0.2', dev: true }]) {
    const { report, lock } = fixture();
    lock.packages['node_modules/braces'] = replacement;
    assert.deepEqual(evaluateAudit(report, lock, now).blocked, ['braces', 'chokidar', 'eleventy']);
  }
});

test('blocks a parent package used at runtime', () => {
  const { report, lock } = fixture();
  delete lock.packages['node_modules/eleventy'].dev;
  assert.deepEqual(evaluateAudit(report, lock, now).blocked, ['eleventy']);
});

test('does not hide unknown or cyclic dependency causes', () => {
  for (const cause of ['missing', 'eleventy']) {
    const { report, lock } = fixture();
    report.vulnerabilities.chokidar.via.push(cause);
    assert.deepEqual(evaluateAudit(report, lock, now).blocked, ['chokidar', 'eleventy']);
  }
});

test('rejects audit errors and unsupported reports', () => {
  for (const report of [{}, { error: { message: 'registry unavailable' } },
    { auditReportVersion: 1, vulnerabilities: {} }, { auditReportVersion: 2, vulnerabilities: [] }]) {
    assert.throws(() => evaluateAudit(report, {}, now), /valid audit report/);
  }
});
