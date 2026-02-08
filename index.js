const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

const jarUrl = 'https://github.com/MCXboxBroadcast/Broadcaster/releases/download/129/MCXboxBroadcastStandalone.jar';
const jarPath = './MCXboxBroadcastStandalone.jar';
const configPath = './config.yml';

function downloadJar(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // Handle redirect
      if (res.statusCode === 302 || res.statusCode === 301) {
        return downloadJar(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(`Failed to download: ${res.statusCode}`);

      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => reject(err));
  });
}

async function run() {
  if (!fs.existsSync(jarPath)) {
    console.log('Downloading JAR...');
    await downloadJar(jarUrl, jarPath);
    console.log('Download complete.');
  }

  // Run the JAR with custom config
  const javaArgs = ['-jar', jarPath, '--config', configPath];
  const javaProcess = spawn('java', javaArgs, { stdio: 'inherit' });

  javaProcess.on('close', (code) => {
    console.log(`Process exited with code ${code}`);
  });
}

run().catch(console.error);
