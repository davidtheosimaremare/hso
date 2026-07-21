import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

try {
  // Get git log as JSON array with detailed info: hash, shortHash, author, date, message
  const gitLog = execSync(`git log -n 50 --pretty=format:'{"hash": "%H", "shortHash": "%h", "author": "%an", "email": "%ae", "date": "%ad", "message": "%s"}'`, { encoding: 'utf8' });
  
  // Format as valid JSON array
  const commits = gitLog
    .trim()
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        // Fallback for special characters
        return {
          hash: '',
          shortHash: '',
          author: 'System',
          date: new Date().toString(),
          message: line.replace(/['"\\/]/g, '')
        };
      }
    });

  const targetDir = './src/assets';
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  writeFileSync(`${targetDir}/commits.json`, JSON.stringify(commits, null, 2));
  console.log('Successfully generated src/assets/commits.json');
} catch (error) {
  console.error('Error generating commits.json:', error.message);
  // Ensure the asset exists with fallback data to prevent build failure
  const targetDir = './src/assets';
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }
  writeFileSync(`${targetDir}/commits.json`, JSON.stringify([
    {
      hash: 'local-fallback',
      shortHash: 'local',
      author: 'David Theo',
      date: new Date().toString(),
      message: 'Initial simplified menu navigation setup'
    }
  ], null, 2));
}
