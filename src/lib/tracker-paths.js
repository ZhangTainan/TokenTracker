const os = require("node:os");
const path = require("node:path");

function resolveHomeDir(env = process.env) {
  return env.TOKENTRACKER_HOME || env.HOME || os.homedir();
}

async function resolveTrackerPaths({ home = resolveHomeDir() } = {}) {
  const rootDir = path.join(home, ".tokentracker");
  return {
    rootDir,
    trackerDir: path.join(rootDir, "tracker"),
    binDir: path.join(rootDir, "bin"),
    cacheDir: path.join(rootDir, "cache"),
  };
}

module.exports = {
  resolveHomeDir,
  resolveTrackerPaths,
};
