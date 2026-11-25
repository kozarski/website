# Blog

Built with [Eleventy](https://www.11ty.dev/docs/).

1. Install [Node.js 24](https://nodejs.org/en/download/).
2. Open the `blog` directory in your terminal and run `npm ci`.
3. Run `npm run dev`, then open the local address shown in your terminal.

Add or edit posts in [src/posts](src/posts/).

To build the complete website, run `npm run build` from the repository root.

## Dependency audit

As of 2026-11-02, the installed dependencies pass the audit without exceptions.
The scoped override in `package.json` pins `@11ty/recursive-copy`'s `minimatch`
to 11.0.1 to fix [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
Eleventy 3.1.7 still requests recursive-copy 4, which requests minimatch 3.
The copy helper uses the `minimatch.match` API supported by the patched release;
`npm run test:blog-dependencies` checks copying with glob filters and exclusions.
Remove the override when Eleventy's supported dependency tree includes a patched
minimatch, then rerun that test, the complete build/link checks, and both audits.
Do not use `npm audit fix --force` to downgrade Eleventy.

Run `npm run audit:blog` from the repository root for the same audit used by CI
and deployment. It blocks every npm audit finding except the temporary exceptions
below. `npm audit --prefix blog` shows the unfiltered upstream report.

The historical exceptions below have expired and do not suppress any findings.

### braces

- **Advisory:** [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
  stack exhaustion from deeply nested brace patterns in `braces` 3.0.3.
- **Reviewed:** 2026-10-03. No patched release is available. The latest stable
  Eleventy (3.1.6) uses Chokidar 3, which depends on `braces`. Forcing Chokidar 4
  would remove glob support required by Eleventy's watcher.
- **Exposure:** These are development dependencies. Eleventy's watch patterns
  come from the repository, not requests or visitor input. Deployment publishes
  only static files; it does not publish or run these Node dependencies.

### sprintf-js

- **Advisory:** [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c),
  denial of service from unbounded precision in format strings.
- **Reviewed:** 2026-10-07. No patched release is available. Eleventy 3.1.6 pulls
  in `sprintf-js` 1.0.3 through `gray-matter` → `js-yaml` 3 → `argparse` 1.
- **Exposure:** `sprintf-js` formats CLI help and errors in `argparse`, which
  `js-yaml` loads only in its command-line entry point. The blog uses the YAML
  parsing API through `gray-matter`; it does not invoke that CLI. These packages
  are development-only and are not included in the deployed static site.

### Scope and expiry

Only the advisory/version pairs above and findings caused solely by either or
both are excepted. All affected packages must be development-only in the lock
file. The audit logs each active exception. Other advisories, runtime
dependencies, and audit failures still block CI and deployment.

Both exceptions expire **2026-10-17 at 00:00 UTC**; adding `sprintf-js` does not
extend the existing deadline. Upgrade to patched stable dependencies when
available and remove the corresponding exceptions from `scripts/audit-blog.js`.
Do not automatically renew them or apply npm's suggested downgrade to Eleventy
0.6.0. Forcing `js-yaml` 4 would break `gray-matter`'s use of the removed
`safeLoad` API.
