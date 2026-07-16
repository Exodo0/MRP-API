const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  createSemoviEconomyService,
} = require("../src/services/semoviEconomyService");
const {
  CUSTOM_PLATE_COST_CENTS,
  createVehicleRegistrationService,
  stableAutomaticPlate,
} = require("../src/services/vehicleRegistrationService");

function query(value) {
  return { lean: async () => structuredClone(value) };
}

test("SEMOVI uses server cents and balances SAT plus SEMOVI", async (context) => {
  const previous = { sat: process.env.SAT_ID, semovi: process.env.SEMOVI_ID };
  context.after(() => {
    if (previous.sat === undefined) delete process.env.SAT_ID;
    else process.env.SAT_ID = previous.sat;
    if (previous.semovi === undefined) delete process.env.SEMOVI_ID;
    else process.env.SEMOVI_ID = previous.semovi;
  });
  process.env.SAT_ID = "sat";
  process.env.SEMOVI_ID = "semovi";
  let captured;
  let createdLicense;
  const licenseModel = {
    updateMany: async () => ({ modifiedCount: 0 }),
    create: async (documents) => {
      createdLicense = { _id: "license", ...documents[0] };
      return [createdLicense];
    },
    findOne: () => query(createdLicense),
  };
  const service = createSemoviEconomyService({
    catalog: {
      A1: {
        price: "100.01",
        expiresInDays: 365,
        allowedPaymentModes: ["paid"],
      },
    },
    economyUserModel: {
      findOne: () =>
        query({
          Efectivo: 100.01,
          CuentaCorriente: { Balance: 0, Activa: true },
          CuentaSalario: { Balance: 0, Activa: true },
        }),
      updateOne: async () => ({ matchedCount: 1 }),
    },
    ineModel: { findOne: () => query({ _id: "identity" }) },
    passportModel: { findOne: () => query(null) },
    debtModel: { create: async () => [] },
    licenseModel,
    economyService: {
      async executeEconomyOperation(request) {
        captured = request;
        await request.transactionalWork({
          session: {},
          operation: { _id: "operation" },
        });
        return { outcome: "committed", operation: { _id: "operation" } };
      },
    },
  });
  const result = await service.issue({
    guildId: "guild",
    actorUserId: "staff",
    targetUserId: "user",
    requestId: "semovi_attempt_0001",
    type: "A1",
    paymentMode: "paid",
  });
  assert.equal(
    captured.debits.reduce((sum, value) => sum + value.AmountCents, 0),
    10001,
  );
  assert.deepEqual(
    captured.credits.map((value) => value.AmountCents),
    [1600, 8401],
  );
  assert.equal(captured.flow, "balanced");
  assert.equal(createdLicense.PriceCents, 10001);
  assert.equal(result.delivery.status, "completed");
});

test("custom plate charge and vehicle creation share one economic transaction", async () => {
  let captured;
  let createdVehicle;
  const vehicleModel = {
    countDocuments: () => ({ session: async () => 0 }),
    create: async (documents) => {
      createdVehicle = { _id: "vehicle", ...documents[0] };
      return [createdVehicle];
    },
    findOne: () => query(createdVehicle),
  };
  const service = createVehicleRegistrationService({
    itemModel: {
      findOne: () =>
        query({
          _id: "507f1f77bcf86cd799439011",
          Nombre: "Auto",
          CategoriaNombre: "Vehículos",
        }),
    },
    inventoryModel: {
      findOne: () =>
        query({
          _id: "inventory",
          Revision: 1,
          Items: [{ ItemId: "507f1f77bcf86cd799439011", Cantidad: 1 }],
        }),
      findOneAndUpdate: async () => ({ _id: "inventory", Revision: 2 }),
    },
    economyUserModel: {
      findOne: () =>
        query({
          Efectivo: 50_000,
          CuentaCorriente: { Balance: 0 },
          CuentaSalario: { Balance: 0 },
        }),
    },
    verifiedModel: { findOne: () => query({ RobloxUsername: "Citizen" }) },
    vehicleModel,
    economyService: {
      async executeEconomyOperation(request) {
        captured = request;
        await request.transactionalWork({
          session: {},
          operation: { _id: "operation" },
        });
        return { outcome: "committed", operation: { _id: "operation" } };
      },
    },
  });
  const result = await service.register({
    guildId: "guild",
    userId: "user",
    discordUsername: "Citizen",
    requestId: "vehicle_attempt_0001",
    itemId: "507f1f77bcf86cd799439011",
    customPlate: true,
    requestedPlate: "MXRP-1",
    color: "#050505",
  });
  assert.equal(captured.flow, "sink");
  assert.equal(captured.debits[0].AmountCents, CUSTOM_PLATE_COST_CENTS);
  assert.equal(createdVehicle.EconomyOperationId, "operation");
  assert.equal(result.vehicle.Matricula, "MXRP-1");
});

test("automatic plates are server-generated and stable for retries", () => {
  assert.equal(
    stableAutomaticPlate("guild", "vehicle_attempt_0001"),
    stableAutomaticPlate("guild", "vehicle_attempt_0001"),
  );
  assert.notEqual(
    stableAutomaticPlate("guild", "vehicle_attempt_0001"),
    stableAutomaticPlate("guild", "vehicle_attempt_0002"),
  );
});

test("SEMOVI committed retry resumes from the durable operation", async () => {
  const operation = {
    _id: "operation",
    Status: "committed",
    ActorUserId: "staff",
    Metadata: {
      TargetUserId: "user",
      LicenseType: "A1",
      PaymentMode: "free",
      RoleAction: "add",
    },
  };
  const license = {
    _id: "license",
    UserId: "user",
    EconomyOperationId: "operation",
    RoleEffect: { Status: "not_required" },
  };
  const service = createSemoviEconomyService({
    catalog: { A1: { price: "0", allowedPaymentModes: ["free"] } },
    economyUserModel: {
      findOne: () => {
        throw new Error("must not read");
      },
    },
    ineModel: {
      findOne: () => {
        throw new Error("must not read");
      },
    },
    passportModel: {
      findOne: () => {
        throw new Error("must not read");
      },
    },
    licenseModel: { findOne: () => query(license) },
    economyService: { getEconomyOperation: async () => operation },
  });
  const result = await service.issue({
    guildId: "guild",
    actorUserId: "staff",
    targetUserId: "user",
    requestId: "semovi_attempt_0001",
    type: "A1",
    paymentMode: "free",
  });
  assert.equal(result.outcome, "already_committed");
});

test("vehicle retry returns the committed registration without charging again", async () => {
  const operation = {
    _id: "operation",
    Status: "committed",
    ActorUserId: "user",
    Metadata: {
      ItemId: "507f1f77bcf86cd799439011",
      Plate: "MXRP-1",
      CustomPlate: true,
      Color: "#050505",
    },
  };
  const vehicle = {
    _id: "vehicle",
    Matricula: "MXRP-1",
    PlacaPersonalizada: true,
  };
  const unavailable = {
    findOne: () => {
      throw new Error("must not read mutable state");
    },
  };
  const service = createVehicleRegistrationService({
    economyUserModel: unavailable,
    inventoryModel: unavailable,
    itemModel: unavailable,
    verifiedModel: unavailable,
    vehicleModel: { findOne: () => query(vehicle) },
    economyService: { getEconomyOperation: async () => operation },
  });
  const result = await service.register({
    guildId: "guild",
    userId: "user",
    requestId: "vehicle_attempt_0001",
    itemId: "507f1f77bcf86cd799439011",
    customPlate: true,
    requestedPlate: "MXRP-1",
    color: "#050505",
  });
  assert.equal(result.outcome, "already_committed");
  assert.equal(result.vehicle.Matricula, "MXRP-1");
});
