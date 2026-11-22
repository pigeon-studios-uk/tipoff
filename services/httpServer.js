/**
 * Tipoff's only web endpoint: GET /health, for monitoring. Everything else is a plain 404.
 *
 *   200 {"status":"ok","version":"0.1.0"}                       nothing has failed
 *   503 {"status":"fail","version":"0.1.0","failing":["Database"]}   something has (names only, never details)
 */

const http = require("node:http");
const config = require("./config");
const logger = require("./logger");
const health = require("./health");

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

/** The request handler. collect is health.collect, swappable in tests. */
function handler(client, { collect = health.collect } = {}) {
  return async (req, res) => {
    const pathname = (req.url || "/").split("?")[0];
    if (pathname !== "/health" || (req.method !== "GET" && req.method !== "HEAD")) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" });
      return res.end("Not found");
    }
    try {
      const checks = await collect(client);
      const failing = checks.filter(item => item.state === "fail").map(item => item.name);
      const body = { status: failing.length ? "fail" : "ok", version: config.version, ...(failing.length ? { failing } : {}) };
      res.writeHead(failing.length ? 503 : 200, HEADERS);
      res.end(req.method === "HEAD" ? undefined : JSON.stringify(body));
    } catch (err) {
      logger.error(`Health check failed: ${err.stack || err}`);
      res.writeHead(503, HEADERS);
      res.end(JSON.stringify({ status: "fail" }));
    }
  };
}

let server = null;

function start(client, { port = config.http.port } = {}) {
  return new Promise((resolve, reject) => {
    server = http.createServer(handler(client));
    server.once("error", err => {
      health.state.httpListening = false;
      reject(err);
    });
    server.listen(port, () => {
      health.state.httpListening = true;
      logger.success(`Health endpoint listening on port ${server.address().port}`);
      resolve(server);
    });
  });
}

function stop() {
  return new Promise(resolve => {
    if (!server) return resolve();
    const closing = server;
    server = null;
    health.state.httpListening = false;
    closing.close(() => resolve());
    closing.closeAllConnections?.();
  });
}

module.exports = { handler, start, stop };
