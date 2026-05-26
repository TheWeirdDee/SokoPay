const { execSync } = require('child_process');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch (err) {
    console.error(`Error running command: ${cmd}`);
    console.error(err.stdout || err.stderr || err.message);
    return null;
  }
}

// 1. Get git status
const statusOutput = run('git status -uall --porcelain');
if (!statusOutput) {
  console.log('No changes found or git error occurred.');
  process.exit(0);
}

const lines = statusOutput.split('\n').filter(line => line.trim() !== '');

console.log(`Found ${lines.length} changed files to push one-by-one.`);

for (const line of lines) {
  const status = line.substring(0, 2).trim();
  const filePath = line.substring(3).trim().replace(/^"|"$/g, ''); // strip quotes if any

  console.log(`\nProcessing file: ${filePath} [Status: ${status}]`);

  if (status === 'D') {
    // Deleted file
    console.log(`Running: git rm "${filePath}"`);
    run(`git rm "${filePath}"`);
    console.log(`Running: git commit -m "Remove ${filePath}"`);
    run(`git commit -m "Remove ${filePath}"`);
  } else if (status === 'M' || status === '??') {
    // Modified or untracked file
    console.log(`Running: git add "${filePath}"`);
    run(`git add "${filePath}"`);
    console.log(`Running: git commit -m "Update/Add ${filePath}"`);
    run(`git commit -m "Update/Add ${filePath}"`);
  } else {
    console.log(`Skipping unknown status: ${status} for file ${filePath}`);
    continue;
  }

  // Push
  console.log(`Running: git push origin main`);
  run(`git push origin main`);
}

console.log('\nAll files processed successfully!');
