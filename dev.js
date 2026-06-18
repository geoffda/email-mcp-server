// dev.js
// dev runner that preserves original behavior: opens ngrok in a visible terminal window,
// loads .env into the spawned server process, and avoids duplicate Node processes.

import { execSync, spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import chokidar from "chokidar";
import { config as loadDotenv } from "dotenv";

// Load .env into this launcher process so we can pass values to the child
loadDotenv({ path: path.resolve(process.cwd(), ".env") });

let child = null;
let ngrokStarter = null;

function isNgrokRunning() {
  try {
    // On Windows, use PowerShell to check the ngrok API; on other platforms use curl
    if (process.platform === "win32") {
      execSync(
        'powershell -Command "try { Invoke-RestMethod -Uri http://127.0.0.1:4040/api/tunnels -Method Get -ErrorAction Stop | Out-Null; exit 0 } catch { exit 1 }"',
        { stdio: "ignore", shell: true },
      );
    } else {
      execSync("curl -s http://127.0.0.1:4040/api/tunnels > /dev/null 2>&1", {
        stdio: "ignore",
        shell: true,
      });
    }
    return true;
  } catch {
    return false;
  }
}

function startNgrokInNewTerminal() {
  console.log("🚀 Starting ngrok in a new terminal...");

  const platform = os.platform();

  if (platform === "win32") {
    // Use cmd.exe /c start to open a new window reliably on Windows.
    // This opens a new PowerShell window and runs ngrok, keeping it open so you can see logs.
    try {
      // The arguments after 'start' are the window title (empty string) and the command to run.
      // Using 'powershell' with -NoExit keeps the window open after ngrok exits.
      spawn("cmd.exe", ["/c", "start", "powershell", "-NoExit", "-Command", "ngrok http 3000"], {
        stdio: "ignore",
        env: { ...process.env },
        shell: false,
      });
      console.log("Launched ngrok in a new PowerShell window.");
    } catch (err) {
      console.error("Failed to launch ngrok in new window:", err);
    }
    return;
  }

  if (platform === "darwin") {
    // macOS: open a new Terminal window and run ngrok
    const appleScript = `tell application "Terminal" to do script "ngrok http 3000; exec $SHELL"`;
    try {
      ngrokStarter = spawn("osascript", ["-e", appleScript], { stdio: "ignore", env: { ...process.env } });
    } catch (err) {
      console.error("Failed to open Terminal on macOS for ngrok:", err);
    }
    return;
  }

  // Linux: try to open a visible terminal; fallback to background spawn
  const terminals = [
    ["gnome-terminal", ["--", "bash", "-lc", "ngrok http 3000; exec bash"]],
    ["x-terminal-emulator", ["-e", "bash -lc 'ngrok http 3000; exec bash'"]],
    ["konsole", ["-e", "bash", "-lc", "ngrok http 3000; exec bash"]],
    ["xfce4-terminal", ["-e", "bash -lc 'ngrok http 3000; exec bash'"]],
  ];

  let started = false;
  for (const [bin, args] of terminals) {
    try {
      ngrokStarter = spawn(bin, args, { stdio: "ignore", env: { ...process.env } });
      started = true;
      break;
    } catch {
      // try next
    }
  }

  if (!started) {
    // fallback: spawn ngrok in background (no visible window)
    try {
      ngrokStarter = spawn("ngrok", ["http", "3000"], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });
      ngrokStarter.stdout?.on("data", (d) => process.stdout.write(`[ngrok] ${d.toString()}`));
      ngrokStarter.stderr?.on("data", (d) => process.stderr.write(`[ngrok] ${d.toString()}`));
    } catch (err) {
      console.error("Failed to spawn ngrok in background:", err);
    }
  }
}

function spawnServer() {
  // Ensure we use the built output you expect; adjust if your build writes elsewhere
  const entry = path.resolve(process.cwd(), "dist/index.js");
  if (!fs.existsSync(entry)) {
    console.error(`❌ Entry not found: ${entry}`);
    console.error("Run your build first (npm run build) or adjust the entry path in dev.js.");
    return;
  }

  if (child) {
    console.log("🔄 Restarting server...");
    try {
      child.kill();
    } catch {}
    child = null;
  }

  // Merge current process.env (which includes .env) into the child env
  const childEnv = {
    ...process.env,
    NODE_ENV: "development",
  };

  console.log("🚀 Spawning server with SERVER_BASE =", childEnv.SERVER_BASE);
  console.log("Node entry:", entry);

  child = spawn(process.execPath, ["--inspect=9229", entry], {
    stdio: "inherit",
    env: childEnv,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`❌ Server terminated with signal ${signal}`);
    } else if (code !== null && code !== 0) {
      console.log(`❌ Server exited with code ${code}`);
    }
  });

  child.on("error", (err) => {
    console.error("Failed to start child process:", err);
  });
}

function start() {
  // Start ngrok if not running and if autostart not disabled
  if (process.env.NGROK_AUTOSTART !== "false") {
    if (!isNgrokRunning()) {
      startNgrokInNewTerminal();
    } else {
      console.log("ngrok appears to be running already (127.0.0.1:4040 responding).");
    }
  } else {
    console.log("NGROK_AUTOSTART=false, skipping ngrok auto-start.");
  }

  spawnServer();
}

console.log("🚀 Starting dev server…");
start();

// Watch src/ for changes and restart (preserve original behavior)
const watcher = chokidar.watch("./src", {
  ignoreInitial: true,
});

watcher.on("all", (event, file) => {
  console.log(`📁 File changed: ${file} (${event})`);
  // If you want automatic builds, run your build command here before spawnServer()
  // e.g. execSync("npm run build", { stdio: "inherit" });
  spawnServer();
});

// Clean exit
process.on("SIGINT", () => {
  console.log("🛑 Shutting down…");
  if (child) {
    try { child.kill(); } catch {}
  }
  if (ngrokStarter) {
    try { ngrokStarter.kill(); } catch {}
  }
  watcher.close();
  process.exit(0);
});
