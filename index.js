const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const JAR_URL =
  "https://github.com/MCXboxBroadcast/Broadcaster/releases/download/129/MCXboxBroadcastStandalone.jar";
const JAR_PATH = path.join(__dirname, "MCXboxBroadcastStandalone.jar");
const PORT = process.env.PORT || 8080;

let jarProcess = null;
let status = "starting";
let logs = [];

function addLog(message) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}`;
  console.log(entry);
  logs.push(entry);
  // Keep only last 200 log lines
  if (logs.length > 200) logs.shift();
}

// Follow redirects (GitHub uses them for release downloads)
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    addLog(`Downloading from: ${url}`);

    const request = https.get(url, (response) => {
      // Handle redirects (301, 302, 303, 307, 308)
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        addLog(`Redirected to: ${response.headers.location}`);
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
        if (totalBytes > 0) {
          const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
          process.stdout.write(`\rDownloading: ${percent}%`);
        }
      });

      response.pipe(file);

      file.on("finish", () => {
        file.close();
        console.log(""); // newline after progress
        addLog(
          `Download complete: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`
        );
        resolve();
      });

      file.on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });

    request.on("error", (err) => {
      reject(err);
    });
  });
}

function startJar() {
  addLog("Starting MCXboxBroadcastStandalone.jar...");
  status = "running";

  jarProcess = spawn("java", ["-jar", JAR_PATH], {
    cwd: __dirname,
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

    // Auto-restart after 5 seconds
    addLog("Restarting in 5 seconds...");
    setTimeout(() => {
      startJar();
    }, 5000);
  });

  jarProcess.on("error", (err) => {
    addLog(`Failed to start JAR: ${err.message}`);
    status = "error";
  });
}

// Simple HTTP server so Koyeb sees a healthy service
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

    // Main status page
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
          .status { padding: 10px; background: #16213e; border-radius: 8px; margin: 10px 0; }
          .logs { background: #0f0f23; padding: 15px; border-radius: 8px; max-height: 500px; overflow-y: auto; white-space: pre-wrap; font-size: 13px; }
          a { color: #00d4aa; }
        </style>
      </head>
      <body>
        <h1>MCXboxBroadcast Standalone</h1>
        <div class="status">
          <strong>Status:</strong> ${status}<br>
          <strong>Uptime:</strong> ${(process.uptime() / 60).toFixed(1)} minutes<br>
          <strong>Memory:</strong> ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB
        </div>
        <p><a href="/logs">View Raw Logs</a> | <a href="/health">Health Check</a></p>
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

// Main
async function main() {
  addLog("=== MCXboxBroadcast Koyeb Launcher ===");

  // Start web server first so Koyeb health checks pass
  startWebServer();

  // Check if JAR already exists
  if (fs.existsSync(JAR_PATH)) {
    addLog("JAR already exists, skipping download.");
  } else {
    try {
      status = "downloading";
      await downloadFile(JAR_URL, JAR_PATH);
    } catch (err) {
      addLog(`Download error: ${err.message}`);
      status = "download failed";
      return;
    }
  }

  // Start the JAR
  startJar();
}

main();
