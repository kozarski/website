import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const vendorDir = join(root, 'form/vendor/mediapipe');
mkdirSync(vendorDir, { recursive: true });

for (const file of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  const src = join(root, 'node_modules/@mediapipe/tasks-vision/wasm', file);
  const dst = join(vendorDir, file);
  if (existsSync(src)) {
    copyFileSync(src, dst);
  }
}

writeFileSync(
  join(root, 'form/THIRD_PARTY_NOTICES.txt'),
  ['three', '@mediapipe/tasks-vision']
    .map((name) => {
      const licPath = join(root, 'node_modules', name, 'LICENSE');
      const lic = existsSync(licPath) ? readFileSync(licPath, 'utf8') : 'MIT / Apache-2.0';
      return `${name}\n\n${lic}`;
    })
    .join('\n\n'),
);

const options = {
  absWorkingDir: root,
  entryPoints: ['form/src/app.mjs'],
  bundle: true,
  outfile: 'form/app.bundle.js',
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
    port: 4175,
  });
  console.log(`Form studio dev server: http://127.0.0.1:${port}/form/`);
} else {
  await esbuild.build(options);
}
