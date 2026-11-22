/**
 * Node's process warnings, through our logger instead of raw stderr. Required first in index.js, before anything
 * that could emit one.
 *
 * Each line says where the warning came from: the first place in the stack outside Node itself, usually a package in
 * node_modules. A deprecation warning is made where the deprecated thing is used, so that's the code to update.
 */

const IGNORED = new Set();

/** The first stack frame outside Node's own code, as "file:line", or null. Exported for tests. */
function origin(stack) {
  const frames = String(stack || "").split("\n").slice(1).map(line => line.trim());
  const frame = frames.find(line => line.startsWith("at ") && !/\(node:|at node:|\(internal\/|at internal\//.test(line));
  if (!frame) return null;
  const match = /\(([^)]+)\)$/.exec(frame) || /^at (.+)$/.exec(frame);
  return match ? match[1].replace(/^.*?node_modules[\\/]/, "node_modules/").replace(/:\d+$/, "") : null;
}

function install(logger) {
  process.removeAllListeners("warning");
  process.on("warning", warning => {
    if (IGNORED.has(warning.code)) return;
    const from = origin(warning.stack);
    logger.warn(`Node warning${warning.code ? ` ${warning.code}` : ""}: ${warning.message}${from ? ` (from ${from})` : ""}`);
  });
}

module.exports = { install, origin, IGNORED };
