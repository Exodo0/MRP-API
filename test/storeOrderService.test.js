const assert = require("node:assert/strict");
const { test } = require("node:test");
const StoreOrder = require("../src/models/StoreOrder");
const {
  createStoreOrderService,
  resolveItemPricing,
} = require("../src/services/storeOrderService");

function query(value) {
  return {
    lean: async () => structuredClone(value),
    session() {
      return this;
    },
  };
}

function createFixture({
  stock = 1,
  roleId = null,
  inventoryFailure = false,
  ledgerFailure = false,
  userCashCents = 100000,
  itemActive = true,
  userLimit = 2,
  initialInventoryQuantity = 0,
} = {}) {
  const item = {
    _id: "507f1f77bcf86cd799439011",
    GuildId: "guild",
    CategoriaId: "507f191e810c19729de860ea",
    CategoriaNombre: "General",
    Nombre: "Radio",
    Precio: 100.01,
    PrecioCents: 10001,
    Descuento: 0,
    DiscountBasisPoints: 0,
    Stock: stock,
    LimitePorUsuario: userLimit,
    RolId: roleId,
    Activo: itemActive,
  };
  const category = { _id: item.CategoriaId, GuildId: "guild", Activa: true };
  let inventory =
    initialInventoryQuantity > 0
      ? {
          _id: "inventory",
          GuildId: "guild",
          UserId: "user",
          Revision: 1,
          Items: [
            {
              ItemId: item._id,
              Cantidad: initialInventoryQuantity,
              NombreSnapshot: item.Nombre,
              CategoriaSnapshot: item.CategoriaNombre,
              PrecioSnapshot: item.Precio,
            },
          ],
        }
      : null;
  const orders = [];
  let cashCents = userCashCents;
  const operations = new Map();
  let transactionTail = Promise.resolve();

  const itemModel = {
    findOne: () => query(item.Activo ? item : null),
    async updateOne(_filter, update) {
      const quantity = -(update.$inc?.Stock ?? 0);
      if (!item.Activo || (item.Stock !== -1 && item.Stock < quantity))
        return { modifiedCount: 0 };
      if (item.Stock !== -1) item.Stock -= quantity;
      return { modifiedCount: 1 };
    },
  };
  const categoryModel = {
    findOne: () => query(category.Activa ? category : null),
  };
  const economyUserModel = {
    findOne: () =>
      query({
        GuildId: "guild",
        UserId: "user",
        Efectivo: cashCents,
        CuentaCorriente: { Balance: 0 },
        CuentaSalario: { Balance: 0 },
      }),
  };
  const inventoryModel = {
    findOne: () => query(inventory),
    async create(documents) {
      if (inventoryFailure)
        throw Object.assign(new Error("inventory failed"), {
          code: "INVENTORY_WRITE_FAILED",
        });
      inventory = { _id: "inventory", ...structuredClone(documents[0]) };
      return [inventory];
    },
    async updateOne(filter, update) {
      if (!inventory || filter.Revision !== inventory.Revision)
        return { modifiedCount: 0 };
      Object.assign(inventory, structuredClone(update.$set));
      inventory.Revision += update.$inc?.Revision ?? 0;
      return { modifiedCount: 1 };
    },
  };
  const orderModel = {
    findOne(filter) {
      return query(
        orders.find(
          (entry) =>
            entry.GuildId === filter.GuildId &&
            entry.OrderId === filter.OrderId,
        ) ?? null,
      );
    },
    async findOneAndUpdate(filter, update) {
      let order = orders.find(
        (entry) =>
          entry.GuildId === filter.GuildId && entry.OrderId === filter.OrderId,
      );
      if (!order) {
        order = {
          _id: `order-${orders.length + 1}`,
          ...structuredClone(update.$setOnInsert),
        };
        orders.push(order);
      }
      return structuredClone(order);
    },
    async updateOne(filter, update) {
      const order = orders.find((entry) => entry._id === filter._id);
      if (!order) return { matchedCount: 0, modifiedCount: 0 };
      if (filter.Status?.$in && !filter.Status.$in.includes(order.Status))
        return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(order, structuredClone(update.$set ?? {}));
      if (update.$inc)
        for (const [key, amount] of Object.entries(update.$inc))
          if (!key.includes("$.")) order[key] = (order[key] ?? 0) + amount;
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
  const economyService = {
    async executeEconomyOperation(request) {
      const existing = operations.get(request.idempotencyKey);
      if (existing === "committed")
        return {
          outcome: "already_committed",
          operation: { _id: request.idempotencyKey },
        };
      if (existing === "processing")
        return {
          outcome: "in_progress",
          operation: { _id: request.idempotencyKey },
        };
      operations.set(request.idempotencyKey, "processing");
      const previousTransaction = transactionTail;
      let releaseTransaction;
      transactionTail = new Promise((resolve) => {
        releaseTransaction = resolve;
      });
      await previousTransaction;
      const snapshot = {
        cashCents,
        stock: item.Stock,
        inventory: structuredClone(inventory),
        orders: structuredClone(orders),
      };
      try {
        const debit = request.debits.reduce(
          (sum, entry) => sum + entry.AmountCents,
          0,
        );
        if (cashCents < debit)
          throw Object.assign(new Error("insufficient"), {
            code: "INSUFFICIENT_FUNDS",
          });
        cashCents -= debit;
        await new Promise((resolve) => setImmediate(resolve));
        await request.transactionalWork({
          session: {},
          operation: { _id: request.idempotencyKey },
        });
        if (ledgerFailure) {
          throw Object.assign(new Error("ledger failed"), {
            code: "LEDGER_WRITE_FAILED",
          });
        }
        operations.set(request.idempotencyKey, "committed");
        return {
          outcome: "committed",
          operation: { _id: request.idempotencyKey },
        };
      } catch (error) {
        cashCents = snapshot.cashCents;
        item.Stock = snapshot.stock;
        inventory = snapshot.inventory;
        orders.splice(0, orders.length, ...snapshot.orders);
        operations.set(request.idempotencyKey, "failed");
        throw error;
      } finally {
        releaseTransaction();
      }
    },
  };
  const service = createStoreOrderService({
    itemModel,
    categoryModel,
    economyUserModel,
    inventoryModel,
    orderModel,
    economyService,
    roleGrant: async () => {},
  });
  return {
    service,
    item,
    orders,
    get cashCents() {
      return cashCents;
    },
    get inventory() {
      return inventory;
    },
  };
}

const request = (orderId = "attempt_0000000001") => ({
  guildId: "guild",
  userId: "user",
  itemId: "507f1f77bcf86cd799439011",
  quantity: 1,
  paymentAccount: "cash",
  attemptId: orderId,
});

test("store pricing uses authoritative integer cents", () => {
  assert.deepEqual(
    resolveItemPricing({
      Precio: 100.01,
      PrecioCents: 10001,
      Descuento: 16,
      DiscountBasisPoints: 1600,
    }),
    {
      listUnitPriceCents: 10001,
      discountBasisPoints: 1600,
      unitPriceCents: 8401,
    },
  );
});

test("successful purchase debits, decrements stock and creates one inventory entry", async () => {
  const fixture = createFixture();
  const result = await fixture.service.executeStoreOrder(request());
  assert.equal(result.order.Status, "completed");
  assert.equal(fixture.cashCents, 89999);
  assert.equal(fixture.item.Stock, 0);
  assert.equal(fixture.inventory.Items.length, 1);
  assert.equal(fixture.inventory.Items[0].PrecioSnapshotCents, 10001);
});

test("repeating an order id does not charge or deliver inventory twice", async () => {
  const fixture = createFixture({ stock: 2 });
  await fixture.service.executeStoreOrder(request());
  await fixture.service.executeStoreOrder(request());
  assert.equal(fixture.cashCents, 89999);
  assert.equal(fixture.item.Stock, 1);
  assert.equal(fixture.inventory.Items[0].Cantidad, 1);
  assert.equal(fixture.orders.length, 1);
});

test("two buyers for the last unit have one winner", async () => {
  const fixture = createFixture({ stock: 1 });
  const results = await Promise.allSettled([
    fixture.service.executeStoreOrder(request("attempt_0000000001")),
    fixture.service.executeStoreOrder(request("attempt_0000000002")),
  ]);
  assert.equal(
    results.filter((entry) => entry.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((entry) => entry.status === "rejected").length,
    1,
  );
  assert.equal(fixture.item.Stock, 0);
  assert.equal(fixture.inventory.Items[0].Cantidad, 1);
});

test("inventory failure rolls back balance, stock and order effects", async () => {
  const fixture = createFixture({ inventoryFailure: true });
  await assert.rejects(fixture.service.executeStoreOrder(request()), {
    code: "INVENTORY_WRITE_FAILED",
  });
  assert.equal(fixture.cashCents, 100000);
  assert.equal(fixture.item.Stock, 1);
  assert.equal(fixture.inventory, null);
});

test("StoreOrder declares both durable unique indexes", () => {
  const indexes = StoreOrder.schema.indexes();
  assert.equal(
    indexes.filter(
      ([keys]) =>
        keys.GuildId === 1 &&
        keys.OrderId === 1 &&
        keys.IdempotencyKey === undefined,
    ).length,
    1,
  );
  assert.equal(
    indexes.filter(([keys]) => keys.GuildId === 1 && keys.IdempotencyKey === 1)
      .length,
    1,
  );
});

test("insufficient funds fail before creating inventory or stock effects", async () => {
  const fixture = createFixture({ userCashCents: 100 });
  await assert.rejects(fixture.service.executeStoreOrder(request()), {
    code: "INSUFFICIENT_FUNDS",
  });
  assert.equal(fixture.item.Stock, 1);
  assert.equal(fixture.inventory, null);
});

test("inactive item and insufficient stock are rejected", async () => {
  const inactive = createFixture({ itemActive: false });
  await assert.rejects(inactive.service.executeStoreOrder(request()), {
    code: "ITEM_NOT_FOUND",
  });
  const noStock = createFixture({ stock: 0 });
  await assert.rejects(noStock.service.executeStoreOrder(request()), {
    code: "INSUFFICIENT_STOCK",
  });
  assert.equal(noStock.cashCents, 100000);
});

test("per-user limit rolls back stock and balance", async () => {
  const fixture = createFixture({
    stock: 2,
    userLimit: 1,
    initialInventoryQuantity: 1,
  });
  await assert.rejects(fixture.service.executeStoreOrder(request()), {
    code: "USER_LIMIT_REACHED",
  });
  assert.equal(fixture.item.Stock, 2);
  assert.equal(fixture.cashCents, 100000);
  assert.equal(fixture.inventory.Items[0].Cantidad, 1);
});

test("ledger failure rolls back balance, stock, inventory and order", async () => {
  const fixture = createFixture({ ledgerFailure: true });
  await assert.rejects(fixture.service.executeStoreOrder(request()), {
    code: "LEDGER_WRITE_FAILED",
  });
  assert.equal(fixture.item.Stock, 1);
  assert.equal(fixture.cashCents, 100000);
  assert.equal(fixture.inventory, null);
  assert.equal(fixture.orders[0].Status, "failed");
});
