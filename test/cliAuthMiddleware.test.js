const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const cliAuth = require("../src/middleware/cliAuth");

process.env.CLI_JWT_SECRET = "test-cli-secret-with-enough-entropy";

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("rechaza una petición sin JWT del CLI", () => {
  const req = { header: () => "" };
  const res = responseRecorder();
  cliAuth(req, res, () => assert.fail("next no debe ejecutarse"));
  assert.equal(res.statusCode, 401);
});

test("acepta un JWT firmado para el CLI y expone el actor", () => {
  const token = jwt.sign(
    { type: "cli", username: "Staff", guildId: "guild" },
    process.env.CLI_JWT_SECRET,
    { subject: "123", issuer: "mxrp-api", audience: "mxrp-cli", expiresIn: "1m" },
  );
  const req = { header: (name) => name === "authorization" ? `Bearer ${token}` : "" };
  const res = responseRecorder();
  let called = false;
  cliAuth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.deepEqual(req.cliUser, { discordId: "123", username: "Staff", guildId: "guild" });
});
