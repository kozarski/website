const fs = require('node:fs');
const path = require('node:path');

const siteDir = path.resolve(__dirname, '../_final_site');
const origin = 'https://www.coreykozarski.com';
const missing = [];

function checkLink(reference, source) {
  const relative = path.relative(siteDir, source).split(path.sep).join('/');
  const url = new URL(reference, `${origin}/${relative}`);
  if (!['coreykozarski.com', 'www.coreykozarski.com'].includes(url.hostname)) return;

  let target = path.join(siteDir, decodeURIComponent(url.pathname));
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, 'index.html');
  }
  if (!fs.existsSync(target)) missing.push(`${relative}: ${reference}`);
}

function checkDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      checkDirectory(file);
      continue;
    }

    const extension = path.extname(file);
    if (!['.html', '.css', '.xml'].includes(extension)) continue;
    const content = fs.readFileSync(file, 'utf8');

    if (extension === '.css') {
      for (const match of content.matchAll(/url\(\s*['"]?([^)'"\s]+)|@import\s+['"]([^'"]+)/g)) {
        checkLink(match[1] || match[2], file);
      }
    } else {
      for (const match of content.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
        checkLink(match[1].replaceAll('&amp;', '&'), file);
      }
      for (const [tag] of content.matchAll(/<meta\b[^>]*>/gi)) {
        if (!/(?:property|name)=["'](?:og:image|twitter:image)["']/i.test(tag)) continue;
        const reference = tag.match(/content=["']([^"']+)["']/i);
        if (reference) checkLink(reference[1].replaceAll('&amp;', '&'), file);
      }
      if (extension === '.xml') {
        for (const match of content.matchAll(/<(?:loc|id)>([^<]+)<\//g)) {
          checkLink(match[1].trim(), file);
        }
      }
    }
  }
}

checkDirectory(siteDir);

if (missing.length) {
  console.error('Missing local links or assets:\n' + missing.join('\n'));
  process.exitCode = 1;
} else {
  console.log('All local links and assets exist.');
}
