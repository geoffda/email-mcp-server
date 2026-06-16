// dev.js
import { execSync, spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

function isNgrokRunning() {
  try {
    execSync("curl -s http://127.0.0.1:4040/api/tunnels > nul 2>&1", {
      stdio: "ignore",
      shell: true
    });
    return true;
  } catch {
    return false;
  }
}

function startNgrokInNewTerminal() {
  console.log("🚀 Starting ngrok in a new terminal...");

  const platform = os.platform();

  if (platform === "win32") {
      spawn("cmd.exe", [
          "/c",
          "start",
          "\"Ngrok\"",
          "powershell.exe",
          "-NoExit",
          "-File",
          "start-ngrok.ps1"
      ], {
          detached: true,
          stdio: "ignore"
      }).unref();
  } else {
    // Linux: xterm/gnome-terminal fallback
    spawn("x-terminal-emulator", [
      "-e",
      `ngrok http 3000 --url=https://landlady-oversold-scenic.ngrok-free.dev`
    ], {
      detached: true,
      stdio: "ignore"
    }).unref();
  }
}

function startDevServer() {
  console.log("▶ Starting dev server...");

  const child = spawn(
    process.execPath, // node.exe
    [
      "--inspect=9229",
      "--import",
      "tsx",
      "src/index.ts"
    ],
    {
      stdio: "inherit",
      shell: false
    }
  );

  child.on("close", code => {
    console.log(`Dev server exited with code ${code}`);
    process.exit(code);
  });
}


startDevServer();

if (!isNgrokRunning()) {
  startNgrokInNewTerminal();
} else {
  console.log("🔄 ngrok already running");
}
