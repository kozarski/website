const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Define paths relative to the script location (website/scripts/)
const projectRoot = path.join(__dirname, '..'); // website/
const blogDir = path.join(projectRoot, 'blog'); // website/blog/
const blogSourceDir = path.join(blogDir, 'src'); // website/blog/src/
const blogOutputDir = path.join(blogDir, '_site'); // website/blog/_site/
const finalOutputDir = path.join(projectRoot, '_final_site'); // website/_final_site/

// Items to ignore when copying from the root directory
const ignoreList = [
  '.git',
  'node_modules', // Ignore root node_modules if any
  'blog', // Ignore the entire blog source/build directory
  '_final_site', // Ignore the output directory itself
  '.github',
  'scripts', // Ignore the scripts directory
  '.DS_Store',
  '.gitignore',
  'README.md',
  'package.json', // Assuming root package.json is not for deployment
  'package-lock.json',
  // Add any other files/folders at the root that shouldn't be deployed
];

async function build() {
  try {
    console.log('Starting build process...');

    // 1. Clean up old output directories
    console.log(`Removing old directories: ${finalOutputDir} and ${blogOutputDir}`);
    await fs.rm(finalOutputDir, { recursive: true, force: true });
    await fs.rm(blogOutputDir, { recursive: true, force: true }); // Clean blog output too

    // 2. Create final output structure
    console.log(`Creating output structure: ${finalOutputDir}/blog`);
    await fs.mkdir(path.join(finalOutputDir, 'blog'), { recursive: true });

    // 3. Run Eleventy build
    console.log('Running Eleventy build (npm run build:site)...');
    // Execute from the blog directory
    execSync('npm run build:site', { cwd: blogDir, stdio: 'inherit' });
    console.log('Eleventy build complete.');

    // 4. Copy root files/folders
    console.log(`Copying root files from ${projectRoot} to ${finalOutputDir}`);
    const rootEntries = await fs.readdir(projectRoot, { withFileTypes: true });

    for (const entry of rootEntries) {
      if (!ignoreList.includes(entry.name)) {
        const sourcePath = path.join(projectRoot, entry.name);
        const destPath = path.join(finalOutputDir, entry.name);
        console.log(`  - Copying ${entry.name}...`);
        await fs.cp(sourcePath, destPath, { recursive: true });
      } else {
        console.log(`  - Ignoring ${entry.name}`);
      }
    }
    console.log('Root file copy complete.');

    // 5. Copy Eleventy build output to final destination
    console.log(`Copying Eleventy output from ${blogOutputDir} to ${path.join(finalOutputDir, 'blog')}`);
    await fs.cp(blogOutputDir, path.join(finalOutputDir, 'blog'), { recursive: true });
    console.log('Eleventy output copy complete.');

    console.log('Build process finished successfully!');

  } catch (error) {
    console.error('Build process failed:', error);
    process.exit(1); // Exit with error code
  }
}

// Run the build function
build(); 