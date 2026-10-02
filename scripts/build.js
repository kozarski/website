const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const blogDir = path.join(rootDir, 'blog');
const blogSiteDir = path.join(blogDir, '_site');
const finalSiteDir = path.join(rootDir, '_final_site');
// Only copy files that should be public.
const siteFiles = [
  'CNAME',
  'robots.txt',
  'index.html',
  'css',
  'js',
  'images',
  'fonts',
  'projects',
  'drawplets',
  'finder',
  'lv426',
  'pride',
  'sandwich/index.html',
  'sandwich/style.css',
  'sandwich/favicon.svg',
  'sandwich/fonts',
  'sandwich/audio/service-bell-double.mp3',
  'sandwich/app.bundle.js',
  'sandwich/app.bundle.js.LEGAL.txt',
  'sandwich/THIRD_PARTY_NOTICES.txt',
  'pixel/index.html',
  'pixel/css',
  'pixel/js',
  'pixel/LICENSE'
];

execFileSync('npm', ['run', 'build:sandwich'], { cwd: rootDir, stdio: 'inherit' });

fs.rmSync(blogSiteDir, { recursive: true, force: true });
execFileSync('npm', ['run', 'build:site'], {
  cwd: blogDir,
  stdio: 'inherit',
  env: { ...process.env, ELEVENTY_ENV: 'production' }
});

fs.rmSync(finalSiteDir, { recursive: true, force: true });
fs.mkdirSync(finalSiteDir, { recursive: true });

for (const file of siteFiles) {
  const destination = path.join(finalSiteDir, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(path.join(rootDir, file), destination, {
    recursive: true,
    filter: source => !path.basename(source).startsWith('.')
  });
}

fs.cpSync(blogSiteDir, path.join(finalSiteDir, 'blog'), { recursive: true });
console.log('Built website in _final_site.');
