"use strict";

const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const {
  DEFAULT_VOICE_APP_PATTERN,
  configuredPattern,
  normalizeVoiceSource,
  processMatchesSource,
} = require("./voice-source.cjs");

const execFileAsync = promisify(execFile);

function parseMacProcessList(output) {
  return output
    .split(/\r?\n/)
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line))
    .filter(Boolean)
    .map((match) => ({
      pid: Number(match[1]),
      parentId: Number(match[2]),
      name: match[3],
      executable: match[3],
      command: "",
    }));
}

function parseMacCommandList(output) {
  return new Map(
    output
      .split(/\r?\n/)
      .map((line) => /^\s*(\d+)\s+(.+?)\s*$/.exec(line))
      .filter(Boolean)
      .map((match) => [Number(match[1]), match[2]]),
  );
}

function mergeMacProcessCommands(processes, commands) {
  return processes.map((process) => ({
    ...process,
    command: commands.get(process.pid) ?? "",
  }));
}

function parseWindowsProcessList(output) {
  const trimmed = output.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  return (Array.isArray(parsed) ? parsed : [parsed])
    .map((process) => ({
      pid: Number(process.ProcessId),
      parentId: Number(process.ParentProcessId),
      name: String(process.Name ?? ""),
      executable: String(process.ExecutablePath ?? process.Name ?? ""),
      command: String(process.CommandLine ?? ""),
    }))
    .filter((process) => Number.isInteger(process.pid) && process.pid > 0);
}

function identityMatches(process, pattern = DEFAULT_VOICE_APP_PATTERN) {
  pattern.lastIndex = 0;
  return pattern.test(
    `${process.name} ${process.executable ?? ""} ${process.command}`,
  );
}

function selectVoiceProcessTree(
  processes,
  {
    ownProcessId = process.pid,
    pattern = DEFAULT_VOICE_APP_PATTERN,
    platform = process.platform,
    sourceId = null,
  } = {},
) {
  const byId = new Map(processes.map((entry) => [entry.pid, entry]));
  const directlyMatched = new Set(
    processes
      .filter(
        (entry) =>
          entry.pid !== ownProcessId &&
          (sourceId
            ? processMatchesSource(entry, platform, sourceId)
            : identityMatches(entry, pattern)),
      )
      .map((entry) => entry.pid),
  );
  const matched = new Set();

  for (const entry of processes) {
    let current = entry;
    const visited = new Set();
    for (let depth = 0; current && depth < 20; depth += 1) {
      if (visited.has(current.pid)) break;
      visited.add(current.pid);
      if (directlyMatched.has(current.pid)) {
        matched.add(entry.pid);
        break;
      }
      current = byId.get(current.parentId);
    }
  }

  const roots = [...directlyMatched]
    .filter((pid) => !directlyMatched.has(byId.get(pid)?.parentId))
    .sort((left, right) => left - right);
  return {
    pids: [...matched].sort((left, right) => left - right),
    rootPids: roots,
  };
}

async function listPlatformProcesses({
  platform = process.platform,
  run = execFileAsync,
} = {}) {
  if (platform === "darwin") {
    const options = {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 3_000,
    };
    const [identityResult, commandResult] = await Promise.all([
      run("ps", ["-axo", "pid=,ppid=,comm="], options),
      run("ps", ["-axo", "pid=,args="], options),
    ]);
    return mergeMacProcessCommands(
      parseMacProcessList(identityResult.stdout),
      parseMacCommandList(commandResult.stdout),
    );
  }
  if (platform === "win32") {
    const command =
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress";
    const { stdout } = await run(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
      {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: 5_000,
        windowsHide: true,
      },
    );
    return parseWindowsProcessList(stdout);
  }
  return [];
}

async function discoverVoiceProcesses({
  platform = process.platform,
  run = execFileAsync,
  environment = process.env,
  ownProcessId = process.pid,
  pattern = null,
  voiceSource = null,
} = {}) {
  const processes = await listPlatformProcesses({ platform, run });
  const selected = normalizeVoiceSource(voiceSource);
  return selectVoiceProcessTree(processes, {
    ownProcessId,
    platform,
    sourceId:
      selected.mode === "application" ? selected.source_id : null,
    pattern: pattern ?? configuredPattern(environment),
  });
}

module.exports = {
  DEFAULT_VOICE_APP_PATTERN,
  configuredPattern,
  discoverVoiceProcesses,
  identityMatches,
  listPlatformProcesses,
  mergeMacProcessCommands,
  parseMacCommandList,
  parseMacProcessList,
  parseWindowsProcessList,
  selectVoiceProcessTree,
};
