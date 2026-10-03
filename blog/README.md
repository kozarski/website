# Blog

Built with [Eleventy](https://www.11ty.dev/docs/).

1. Install [Node.js 24](https://nodejs.org/en/download/).
2. Open the `blog` directory in your terminal and run `npm ci`.
3. Run `npm run dev`, then open the local address shown in your terminal.

Add or edit posts in [src/posts](src/posts/).

To build the complete website, run `npm run build` from the repository root.

## Dependency audit

Run `npm run audit:blog` from the repository root for the same audit used by CI
and deployment. It blocks every npm audit finding except the temporary exception
below. `npm audit --prefix blog` shows the unfiltered upstream report.

- **Advisory:** [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
  stack exhaustion from deeply nested brace patterns in `braces` 3.0.3.
- **Reviewed:** 2026-10-03. No patched release is available. The latest stable
  Eleventy (3.1.6) uses Chokidar 3, which depends on `braces`. Forcing Chokidar 4
  would remove glob support required by Eleventy's watcher.
- **Exposure:** These are development dependencies. Eleventy's watch patterns
  come from the repository, not requests or visitor input. Deployment publishes
  only static files; it does not publish or run these Node dependencies.
- **Scope:** Only this advisory, `braces` version 3.0.3, and findings caused solely
  by it are excepted. All affected packages must be development-only in the lock
  file. The audit logs the exception on every run. Other advisories, runtime
  dependencies, and audit failures still block CI and deployment.
- **Expiry:** 2026-10-17 at 00:00 UTC. After this date, the finding blocks again.
  Upgrade to a patched stable dependency as soon as one is available and remove
  the exception from `scripts/audit-blog.js`. Do not automatically renew it or
  apply npm's suggested downgrade to Eleventy 0.6.0.
