const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

const jarUrl = 'https://github.com/MCXboxBroadcast/Broadcaster/releases/download/129/MCXboxBroadcastStandalone.jar';
const jarPath = './MCXboxBroadcastStandalone.jar';
const configPath = './config.yml';

// Helper to download a file and follow redirects
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(`Failed to download: ${res.statusCode}`);
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => reject(err));
  });
}

// Check if Java is installed
function javaExists() {
  try {
    const result = spawn('java', ['-version']);
    result.on('error', () => {}); // prevent crashing here
    return true;
  } catch {
    return false;
  }
}

async function run() {
  try {
    if (!fs.existsSync(jarPath)) {
      console.log('Downloading JAR...');
      await downloadFile(jarUrl, jarPath);
      console.log('Download complete.');
    }

    // Check if Java is available
    const javaCheck = spawn('java', ['-version']);
    javaCheck.on('error', () => {
      console.error('Java is not installed or not found in PATH. Cannot run the JAR.');
      process.exit(1);
    });

    // Run the JAR if Java exists
    javaCheck.on('close', () => {
      console.log('Starting JAR...');
      const javaProcess = spawn('java', ['-jar', jarPath, '--config', configPath], { stdio: 'inherit' });

      javaProcess.on('close', (code) => {
        console.log(`Process exited with code ${code}`);
      });

      javaProcess.on('error', (err) => {
        console.error('Failed to run Java process:', err.message);
      });
    });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
