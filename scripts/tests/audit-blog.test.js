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

function combinedFixture() {
  const { report, lock } = fixture();
  Object.assign(report.vulnerabilities, {
    'sprintf-js': {
      nodes: ['node_modules/sprintf-js'],
      via: [{ name: 'sprintf-js', url: 'https://github.com/advisories/GHSA-hp3w-g68c-fv3c' }]
    },
    argparse: { nodes: ['node_modules/gray-matter/node_modules/argparse'], via: ['sprintf-js'] },
    'js-yaml': { nodes: ['node_modules/gray-matter/node_modules/js-yaml'], via: ['argparse'] },
    'gray-matter': { nodes: ['node_modules/gray-matter'], via: ['js-yaml'] }
  });
  report.vulnerabilities.eleventy.via.push('gray-matter');
  Object.assign(lock.packages, {
    'node_modules/sprintf-js': { version: '1.0.3', dev: true },
    'node_modules/gray-matter/node_modules/argparse': { version: '1.0.10', dev: true },
    'node_modules/gray-matter/node_modules/js-yaml': { version: '3.15.2', dev: true },
    'node_modules/gray-matter': { version: '4.0.3', dev: true }
  });
  return { report, lock };
}

const sprintfChain = ['eleventy', 'sprintf-js', 'argparse', 'js-yaml', 'gray-matter'];

test('excepts both reviewed development advisories at their shared parent', () => {
  const { report, lock } = combinedFixture();
  assert.deepEqual(evaluateAudit(report, lock, now), {
    excepted: Object.keys(report.vulnerabilities), blocked: []
  });
});

test('excepts sprintf-js independently of the braces finding', () => {
  const { report, lock } = combinedFixture();
  delete report.vulnerabilities.braces;
  delete report.vulnerabilities.chokidar;
  report.vulnerabilities.eleventy.via = ['gray-matter'];
  assert.deepEqual(evaluateAudit(report, lock, now), { excepted: sprintfChain, blocked: [] });
});

test('blocks both advisories at the unchanged expiry boundary', () => {
  const { report, lock } = combinedFixture();
  assert.deepEqual(evaluateAudit(report, lock, new Date('2026-10-17T00:00:00Z')), {
    excepted: [], blocked: Object.keys(report.vulnerabilities)
  });
});

test('blocks runtime, missing, and unreviewed versions of sprintf-js', () => {
  for (const replacement of [{ version: '1.0.3' }, undefined, { version: '1.1.3', dev: true }]) {
    const { report, lock } = combinedFixture();
    lock.packages['node_modules/sprintf-js'] = replacement;
    assert.deepEqual(evaluateAudit(report, lock, now).blocked, sprintfChain);
  }
});

test('blocks a new advisory on sprintf-js and every affected parent', () => {
  const { report, lock } = combinedFixture();
  report.vulnerabilities['sprintf-js'].via.push({ name: 'sprintf-js', url: 'https://github.com/advisories/new' });
  assert.deepEqual(evaluateAudit(report, lock, now), {
    excepted: ['braces', 'chokidar'], blocked: sprintfChain
  });
});

test('blocks an unreviewed second installation of sprintf-js', () => {
  const { report, lock } = combinedFixture();
  const node = 'node_modules/other/node_modules/sprintf-js';
  report.vulnerabilities['sprintf-js'].nodes.push(node);
  lock.packages[node] = { version: '1.1.3', dev: true };
  assert.deepEqual(evaluateAudit(report, lock, now).blocked, sprintfChain);
});

test('blocks a runtime parent in the sprintf-js chain', () => {
  const { report, lock } = combinedFixture();
  delete lock.packages['node_modules/gray-matter'].dev;
  assert.deepEqual(evaluateAudit(report, lock, now).blocked, ['eleventy', 'gray-matter']);
});

test('requires the advisory package name and URL to match the exception', () => {
  for (const cause of [
    { name: 'braces', url: 'https://github.com/advisories/GHSA-hp3w-g68c-fv3c' },
    { name: 'sprintf-js', url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm' }
  ]) {
    const { report, lock } = combinedFixture();
    report.vulnerabilities['sprintf-js'].via = [cause];
    assert.deepEqual(evaluateAudit(report, lock, now).blocked, sprintfChain);
  }
});

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
