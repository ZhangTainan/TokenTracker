const os = require("node:os");
const path = require("node:path");
const fssync = require("node:fs");
const cp = require("node:child_process");

function splitEnvList(value) {
  if (typeof value !== "string") return [];
  return value
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isWindowsNative({ env = process.env, platform = process.platform } = {}) {
  return platform === "win32" && !env.WSL_DISTRO_NAME;
}

function resolveWslShareRoots({ env = process.env, platform = process.platform } = {}) {
  const explicit = splitEnvList(env.TOKENTRACKER_WSL_ROOTS);
  if (explicit.length > 0) return explicit;
  if (!isWindowsNative({ env, platform })) return [];
  return ["\\\\wsl$", "\\\\wsl.localhost"];
}

function listWslHomeDirs({ env = process.env, platform = process.platform } = {}) {
  const roots = resolveWslShareRoots({ env, platform });
  if (roots.length === 0) return [];

  const distroFilter = new Set(splitEnvList(env.TOKENTRACKER_WSL_DISTROS).map((d) => d.toLowerCase()));
  const out = [];
  const seen = new Set();

  for (const root of roots) {
    let distros = [];
    try {
      distros = fssync
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (_err) {
      distros = listWslDistroNames({ env, platform });
    }

    for (const distroName of distros) {
      if (distroFilter.size > 0 && !distroFilter.has(distroName.toLowerCase())) continue;

      const distroRoot = path.join(root, distroName);
      const homeRoot = path.join(distroRoot, "home");
      let users = [];
      try {
        users = fssync.readdirSync(homeRoot, { withFileTypes: true });
      } catch (_err) {
        users = [];
      }

      for (const user of users) {
        if (!user.isDirectory()) continue;
        addUnique(out, seen, path.join(homeRoot, user.name));
      }

      addUnique(out, seen, path.join(distroRoot, "root"));
    }
  }

  return out;
}

function listWslDistroNames({ env = process.env, platform = process.platform } = {}) {
  if (!isWindowsNative({ env, platform })) return [];
  let raw = "";
  try {
    raw = cp.execFileSync("wsl.exe", ["-l", "-q"], {
      encoding: "utf16le",
      timeout: 5000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (_err) {
    try {
      raw = cp.execFileSync("wsl.exe", ["-l", "-q"], {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch (_fallbackErr) {
      return [];
    }
  }

  return raw
    .replace(/\u0000/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+\(Default\)\s*$/i, "").trim())
    .filter(Boolean);
}

function addUnique(out, seen, value) {
  const key = path.resolve(value).toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push(value);
}

module.exports = {
  isWindowsNative,
  listWslDistroNames,
  listWslHomeDirs,
  resolveWslShareRoots,
  splitEnvList,
};
