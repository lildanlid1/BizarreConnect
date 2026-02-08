const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

const jarUrl = 'https://github.com/MCXboxBroadcast/Broadcaster/releases/download/129/MCXboxBroadcastStandalone.jar';
const jarPath = './MCXboxBroadcastStandalone.jar';
const configPath = './config.yml'; // your custom config file

// Download the JAR
function downloadJar(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(`Failed to download: ${res.statusCode}`);
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
  const javaArgs = ['-jar', jarPath, '--config', configPath]; // most Java apps allow a --config flag
  const javaProcess = spawn('java', javaArgs, { stdio: 'inherit' });

  javaProcess.on('close', (code) => {
    console.log(`Process exited with code ${code}`);
  });
}

run().catch(console.error);
