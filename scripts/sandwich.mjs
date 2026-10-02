import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
writeFileSync(
  join(root, 'sandwich/THIRD_PARTY_NOTICES.txt'),
  ['three', 'cannon-es']
    .map(
      (name) =>
        `${name}\n\n${readFileSync(join(root, 'node_modules', name, 'LICENSE'), 'utf8')}`,
    )
    .join('\n\n'),
);
const performanceReview = process.argv.includes('--performance');
const options = {
  absWorkingDir: root,
  entryPoints: [performanceReview ? 'sandwich/tests/performance.mjs' : 'sandwich/src/app.mjs'],
  bundle: true,
  outfile: performanceReview ? 'sandwich/tests/performance.bundle.js' : 'sandwich/app.bundle.js',
  // Keep the bundled playground usable from file:// as well as a web server.
  // Module script loading requires CORS even when all imports are bundled.
  format: 'iife',
  target: ['es2022'],
  minify: !process.argv.includes('--serve'),
  legalComments: 'external',
  logLevel: 'info',
};
if (process.argv.includes('--serve')) {
  const context = await esbuild.context(options);
  await context.watch();
  const { port } = await context.serve({
    servedir: root,
    host: '127.0.0.1',
    port: 4173,
  });
  console.log(`Sandwich playground: http://127.0.0.1:${port}/sandwich/`);
} else {
  await esbuild.build(options);
}
