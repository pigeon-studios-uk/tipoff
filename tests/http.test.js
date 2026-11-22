/**
 * GET /health, Tipoff's only web endpoint (services/httpServer.js). No database.
 */

require("./helpers");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const httpServer = require("../services/httpServer");

function get(server, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ port: server.address().port, path: pathname }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    }).on("error", reject);
  });
}

test("/health: 200 when nothing failed, 503 with names only when something did, 404 for anything else", async () => {
  let checks = [{ name: "Discord", state: "ok", detail: "Connected, 40 ms" }];
  const server = http.createServer(httpServer.handler(null, { collect: async () => checks }));
  await new Promise(resolve => server.listen(0, resolve));
  try {
    let res = await get(server, "/health");
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(res.body).status, "ok");

    checks = [{ name: "Database", state: "fail", detail: "Can't connect to db.internal:3306" }];
    res = await get(server, "/health");
    assert.equal(res.status, 503);
    assert.deepEqual(JSON.parse(res.body).failing, ["Database"]);
    assert.ok(!res.body.includes("db.internal"), "never the details");

    assert.equal((await get(server, "/")).status, 404);
    assert.equal((await get(server, "/health/../.env")).status, 404);
  } finally {
    server.close();
  }
});
