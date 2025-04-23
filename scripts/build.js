const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create the final site directory structure
const finalSiteDir = path.resolve(__dirname, '../_final_site');
const blogOutputDir = path.resolve(finalSiteDir, 'blog');

// Create the directories if they don't exist
if (!fs.existsSync(finalSiteDir)) {
  fs.mkdirSync(finalSiteDir, { recursive: true });
}

if (!fs.existsSync(blogOutputDir)) {
  fs.mkdirSync(blogOutputDir, { recursive: true });
}

// Copy root files to _final_site (excluding blog and other special directories)
const rootDir = path.resolve(__dirname, '../');
const excludeDirs = ['.git', 'node_modules', 'blog', '_final_site', 'scripts'];

const copyDirRecursive = (src, dest, excludePaths) => {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    // Skip excluded directories
    if (excludePaths.includes(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, []);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

// Copy root content to final site directory
console.log('Copying root content to _final_site...');
copyDirRecursive(rootDir, finalSiteDir, excludeDirs);

// Ensure ELEVENTY_ENV is set to production
process.env.ELEVENTY_ENV = 'production';

// Build the blog with Eleventy
console.log('Building blog with Eleventy...');
try {
  execSync('npm run build:site', { 
    cwd: path.resolve(__dirname, '../blog'),
    stdio: 'inherit',
    env: { ...process.env, ELEVENTY_ENV: 'production' }
  });
} catch (error) {
  console.error('Error building blog:', error);
  process.exit(1);
}

// Copy the Eleventy output to the blog subdirectory in final site
const blogSiteDir = path.resolve(__dirname, '../blog/_site');
console.log('Copying blog content to _final_site/blog...');
copyDirRecursive(blogSiteDir, blogOutputDir, []);

console.log('Build complete!'); 