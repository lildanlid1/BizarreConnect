const { spawn } = require("child_process");

const jarPath = __dirname + "/Xbox.jar"; // path to your JAR
const javaPath = "/usr/bin/java"; // output from `which java`

const jar = spawn(javaPath, ["-jar", jarPath], {
  cwd: __dirname,
  stdio: "inherit",
});

jar.on("error", (err) => {
  console.error("Failed to start JAR:", err);
});

process.on("SIGINT", () => {
  jar.kill("SIGINT");
  process.exit();
});
