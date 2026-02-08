const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");

const JAR_URL =
  "https://github.com/MCXboxBroadcast/Broadcaster/releases/download/129/MCXboxBroadcastStandalone.jar";
const WORK_DIR = path.join(__dirname, "broadcaster");
const JAR_PATH = path.join(WORK_DIR, "MCXboxBroadcastStandalone.jar");
const CONFIG_PATH = path.join(WORK_DIR, "config.yml");
const PORT = process.env.PORT || 8080;

let jarProcess = null;
let status = "starting";
let logs = [];
let javaPath = "java";

// ============================================
// EDIT YOUR CONFIG HERE
// ============================================
const CUSTOM_CONFIG = `
# MCXboxBroadcast Configuration
# Edit these values to your needs

# The IP and port of the Bedrock server to broadcast
remote-address: "your-server-ip"
remote-port: 19132

# The name that shows up on the Friends tab
session-name: "My Awesome Server"

# The number of players shown (set to -1 to pull from server)
player-count: -1
max-player-count: 20

# The protocol version to use (-1 for auto)
protocol-version: -1

# How often to update the session (in seconds)
update-interval: 30

# Logging level (INFO, DEBUG, WARNING, ERROR)
log-level: "INFO"

# Xbox Live authentication
# Leave blank to trigger interactive login on first run
# After first login, tokens are saved automatically
`.trim();
// ============================================

function addLog(message) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}`;
  console.log(entry);
  logs.push(entry);
  if (logs.length > 300) logs.shift();
}

function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function installJava() {
  if (commandExists("java")) {
    addLog("Java is already installed.");
    javaPath = "java";
    return true;
  }

  addLog("Java not found. Installing JRE...");
  status = "installing java";

  try {
    addLog("Trying apt-get install...");
    execSync(
      "apt-get update -qq && apt-get install -y -qq --no-install-recommends openjdk-17-jre-headless",
      { stdio: "pipe", timeout: 120000 }
    );
    javaPath = "java";
    addLog("Java installed via apt-get successfully.");
    return true;
  } catch (e) {
    addLog("apt-get failed, trying manual install...");
  }

  try {
    addLog("Downloading portable JRE from Adoptium...");
    const jreDir = path.join(__dirname, "jre");
    execSync(
      `curl -fsSL "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jre/hotspot/normal/eclipse?project=jdk" -o jre.tar.gz && ` +
        `mkdir -p ${jreDir} && ` +
        `tar -xzf jre.tar.gz -C ${jreDir} --strip-components=1 && ` +
        `rm jre.tar.gz`,
      { stdio: "pipe", timeout: 120000, cwd: __dirname }
    );

    javaPath = path.join(jreDir, "bin", "java");
    if (fs.existsSync(javaPath)) {
      addLog(`Portable JRE installed at: ${javaPath}`);
      return true;
    }

    const dirs = fs.readdirSync(jreDir);
    for (const dir of dirs) {
      const altPath = path.join(jreDir, dir, "bin", "java");
      if (fs.existsSync(altPath)) {
        javaPath = altPath;
        addLog(`Portable JRE found at: ${javaPath}`);
        return true;
      }
    }
    return false;
  } catch (e) {
    addLog(`Manual JRE install failed: ${e.message}`);
    return false;
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    addLog(`Downloading from: ${url}`);
    const client = url.startsWith("https") ? https : http;

    const request = client.get(url, (response) => {
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        addLog("Redirected...");
        downloadFile(response.headers.location, dest)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status: ${response.statusCode}`));
        return;
      }

      const totalBytes = parseInt(response.headers["content-length"], 10) || 0;
      let downloadedBytes = 0;
      const file = fs.createWriteStream(dest);

      response.on("data", (chunk) => {
        downloadedBytes += chunk.length;
      });

      response.pipe(file);

      file.on("finish", () => {
        file.close();
        addLog(`Download complete: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`);
        resolve();
      });

      file.on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });

    request.on("error", reject);
  });
}

function writeConfig() {
  // Always overwrite config with our custom version
  addLog("Writing custom config.yml...");
  fs.writeFileSync(CONFIG_PATH, CUSTOM_CONFIG, "utf8");
  addLog(`Config written to: ${CONFIG_PATH}`);
  addLog("--- Config Contents ---");
  CUSTOM_CONFIG.split("\n").forEach((line) => {
    addLog(`  ${line}`);
  });
  addLog("--- End Config ---");
}

function startJar() {
  // Re-write config every time before starting to prevent JAR from overwriting it
  writeConfig();

  addLog(`Starting JAR with: ${javaPath}`);
  status = "running";

  // Run from the working directory so the JAR finds config.yml in current dir
  jarProcess = spawn(javaPath, ["-jar", JAR_PATH], {
    cwd: WORK_DIR,
    stdio: ["pipe", "pipe", "pipe"],
  });

  jarProcess.stdout.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) addLog(`[JAR] ${msg}`);
  });

  jarProcess.stderr.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) addLog(`[JAR ERR] ${msg}`);
  });

  jarProcess.on("close", (code) => {
    addLog(`JAR process exited with code ${code}`);
    status = `stopped (exit code: ${code})`;

    addLog("Restarting in 10 seconds...");
    setTimeout(() => {
      startJar();
    }, 10000);
  });

  jarProcess.on("error", (err) => {
    addLog(`Failed to start JAR: ${err.message}`);
    status = "error";
  });
}

function startWebServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", jar: status }));
      return;
    }

    if (req.url === "/logs") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(logs.join("\n"));
      return;
    }

    if (req.url === "/config") {
      let currentConfig = "Config not found";
      try {
        currentConfig = fs.readFileSync(CONFIG_PATH, "utf8");
      } catch (e) {}

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(currentConfig);
      return;
    }

    // List all files in work directory
    let fileList = "Directory not found";
    try {
      fileList = fs
        .readdirSync(WORK_DIR, { recursive: true })
        .map((f) => {
          const fullPath = path.join(WORK_DIR, f.toString());
          try {
            const stat = fs.statSync(fullPath);
            return `${stat.isDirectory() ? "[DIR] " : "      "}${f} (${(stat.size / 1024).toFixed(1)} KB)`;
          } catch {
            return `      ${f}`;
          }
        })
        .join("\n");
    } catch (e) {}

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>MCXboxBroadcast on Koyeb</title>
        <meta http-equiv="refresh" content="10">
        <style>
          body { background: #1a1a2e; color: #eee; font-family: monospace; padding: 20px; }
          h1 { color: #00d4aa; }
          h2 { color: #00a896; }
          .status { padding: 10px; background: #16213e; border-radius: 8px; margin: 10px 0; }
          .logs { background: #0f0f23; padding: 15px; border-radius: 8px; max-height: 500px; overflow-y: auto; white-space: pre-wrap; font-size: 13px; }
          a { color: #00d4aa; }
          .files { background: #0f0f23; padding: 15px; border-radius: 8px; white-space: pre-wrap; font-size: 13px; }
        </style>
      </head>
      <body>
        <h1>MCXboxBroadcast Standalone</h1>
        <div class="status">
          <strong>Status:</strong> ${status}<br>
          <strong>Java:</strong> ${javaPath}<br>
          <strong>Work Dir:</strong> ${WORK_DIR}<br>
          <strong>Uptime:</strong> ${(process.uptime() / 60).toFixed(1)} min<br>
          <strong>Memory:</strong> ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB
        </div>
        <p>
          <a href="/logs">Raw Logs</a> |
          <a href="/health">Health</a> |
          <a href="/config">View Config</a>
        </p>
        <h2>Files in Work Directory</h2>
        <div class="files">${fileList}</div>
        <h2>Recent Logs</h2>
        <div class="logs">${logs.slice(-50).join("\n")}</div>
      </body>
      </html>
    `);
  });

  server.listen(PORT, () => {
    addLog(`Web server listening on port ${PORT}`);
  });
}

async function main() {
  addLog("=== MCXboxBroadcast Koyeb Launcher ===");

  // Create working directory
  if (!fs.existsSync(WORK_DIR)) {
    fs.mkdirSync(WORK_DIR, { recursive: true });
    addLog(`Created work directory: ${WORK_DIR}`);
  }

  // Start web server first
  startWebServer();

  // Step 1: Install Java
  const javaReady = installJava();
  if (!javaReady) {
    addLog("FATAL: Could not install Java.");
    status = "error - no java";
    return;
  }

  try {
    const version = execSync(`${javaPath} -version 2>&1`).toString().trim();
    addLog(`Java version: ${version.split("\n")[0]}`);
  } catch (e) {
    addLog(`Warning: could not verify java version`);
  }

  // Step 2: Download JAR
  if (fs.existsSync(JAR_PATH)) {
    addLog("JAR already exists, skipping download.");
  } else {
    try {
      status = "downloading jar";
      await downloadFile(JAR_URL, JAR_PATH);
    } catch (err) {
      addLog(`Download error: ${err.message}`);
      status = "download failed";
      return;
    }
  }

  // Step 3: Write config and start
  startJar();
}

main();
