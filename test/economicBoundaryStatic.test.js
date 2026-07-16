const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

const root = join(__dirname, "..");

test("legacy SEMOVI controllers contain no economic writer", () => {
  const source = readFileSync(
    join(root, "src/controllers/licenseController.js"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /EconomyUser|\$inc|startSession|withTransaction|\.save\(/,
  );
});

test("all dashboard economic routes point to authorized services", () => {
  const source = readFileSync(join(root, "src/routes/v1/dashboard.js"), "utf8");
  for (const path of [
    "/economy/launder",
    "/economy/debt/pay",
    "/economy/fx/trade",
    "/licencias/operate",
    "/vehiculos/register",
    "/store/orders",
  ]) {
    assert.match(source, new RegExp(path.replaceAll("/", "\\/")));
  }
  assert.match(source, /dashboardEconomyAuth/);
});

test("preflight is opt-in and covers every durable economic collection", () => {
  const source = readFileSync(
    join(root, "scripts/economy-preflight.js"),
    "utf8",
  );
  assert.match(source, /ALLOW_READONLY_ECONOMY_PREFLIGHT/);
  assert.doesNotMatch(source, /syncIndexes|dropIndexes|createIndex/);
  for (const collection of [
    "economyoperations",
    "economyledgerentries",
    "economyassetledgerentries",
    "fxquotes",
    "storeorders",
    "storerefunds",
  ]) {
    assert.match(source, new RegExp(collection));
  }
});

test("Redis is not an accounting authority", () => {
  for (const file of [
    "src/services/economyOperationService.js",
    "src/services/storeOrderService.js",
    "src/services/storeRefundService.js",
    "src/services/dashboardEconomyService.js",
    "src/services/semoviEconomyService.js",
    "src/services/vehicleRegistrationService.js",
    "src/services/fxEconomyService.js",
  ]) {
    const source = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(source, /redis|ioredis/i, file);
  }
});
