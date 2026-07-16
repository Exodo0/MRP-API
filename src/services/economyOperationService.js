const { createHash, randomUUID } = require("node:crypto");
const webConn = require("../dbWebConn");
const EconomyOperation = require("../models/EconomyOperation");
const EconomyLedgerEntry = require("../models/EconomyLedgerEntry");
const { assertSafeMoneyAmount } = require("../utils/money");
const { redactData, sanitizeError } = require("../utils/safeError");
const {
  createLegacyEconomyAccountStore,
} = require("./legacyEconomyAccountStore");
const {
  assertMongoTransactionsSupported,
} = require("./economyTransactionSupport");

const SOURCE_TYPES = new Set([
  "store_refund",
  "license_refund",
  "semovi_debt_issue",
  "fx_sell",
]);
const SINK_TYPES = new Set([
  "store_purchase",
  "money_laundering",
  "debt_payment",
  "license_purchase",
  "license_renewal",
  "semovi_license",
  "custom_plate",
  "fx_buy",
]);

class EconomyOperationError extends Error {
  constructor(
    message,
    code,
    { operation = null, cause = null, details = null } = {},
  ) {
    super(message, { cause });
    this.name = "EconomyOperationError";
    this.code = code;
    this.operation = operation;
    this.details = details;
  }
}

function identifier(value, field) {
  if (typeof value !== "string" || !value.trim() || value.length > 180) {
    throw new EconomyOperationError(
      `${field} no es válido`,
      "ECONOMY_INVALID_REQUEST",
    );
  }
  return value.trim();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function hashRequest(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function normalizeMovements(entries, direction) {
  if (!Array.isArray(entries)) {
    throw new EconomyOperationError(
      `${direction} debe ser un arreglo`,
      "ECONOMY_INVALID_REQUEST",
    );
  }
  const seen = new Set();
  return entries.map((entry) => {
    const movement = {
      AccountId: identifier(entry?.AccountId, "AccountId"),
      AccountType: identifier(entry?.AccountType, "AccountType"),
      OwnerUserId: identifier(entry?.OwnerUserId, "OwnerUserId"),
      AmountCents: assertSafeMoneyAmount(entry?.AmountCents, {
        allowZero: false,
      }),
      Reason: identifier(entry?.Reason, "Reason").slice(0, 200),
    };
    const key = `${movement.AccountType}:${movement.AccountId}`;
    if (seen.has(key)) {
      throw new EconomyOperationError(
        `La cuenta ${key} está repetida en ${direction}`,
        "ECONOMY_DUPLICATE_ACCOUNT",
      );
    }
    seen.add(key);
    return movement;
  });
}

function validateFlow(type, flow, debits, credits) {
  const debitTotal = debits.reduce((sum, entry) => sum + entry.AmountCents, 0);
  const creditTotal = credits.reduce(
    (sum, entry) => sum + entry.AmountCents,
    0,
  );
  assertSafeMoneyAmount(debitTotal);
  assertSafeMoneyAmount(creditTotal);
  if (flow === "balanced" && debitTotal !== creditTotal) {
    throw new EconomyOperationError(
      "Una operación balanceada debe conservar el ledger",
      "ECONOMY_UNBALANCED_LEDGER",
    );
  }
  if (
    flow === "source" &&
    (!SOURCE_TYPES.has(type) || creditTotal <= debitTotal)
  ) {
    throw new EconomyOperationError(
      "La fuente monetaria no está autorizada",
      "ECONOMY_SOURCE_NOT_AUTHORIZED",
    );
  }
  if (flow === "sink" && (!SINK_TYPES.has(type) || debitTotal <= creditTotal)) {
    throw new EconomyOperationError(
      "El sumidero monetario no está autorizado",
      "ECONOMY_SINK_NOT_AUTHORIZED",
    );
  }
  if (!new Set(["balanced", "source", "sink"]).has(flow)) {
    throw new EconomyOperationError(
      "Flow no es válido",
      "ECONOMY_INVALID_REQUEST",
    );
  }
  return { debitTotal, creditTotal };
}

function plain(value) {
  return value?.toObject ? value.toObject() : value;
}

function createEconomyOperationService({
  connection = webConn,
  operationModel = EconomyOperation,
  ledgerModel = EconomyLedgerEntry,
  accountStore = createLegacyEconomyAccountStore(),
  transactionSupportCheck = assertMongoTransactionsSupported,
  leaseDurationMs = 5 * 60 * 1000,
  now = () => new Date(),
  createLeaseToken = randomUUID,
  transactionRunner = null,
} = {}) {
  const findOperation = (guildId, idempotencyKey) =>
    operationModel
      .findOne({ GuildId: guildId, IdempotencyKey: idempotencyKey })
      .lean();

  async function createOrLoad(request) {
    try {
      return plain(
        await operationModel.findOneAndUpdate(
          { GuildId: request.GuildId, IdempotencyKey: request.IdempotencyKey },
          {
            $setOnInsert: {
              ...request,
              Status: "pending",
              MonetaryVersion: 2,
              AttemptCount: 0,
            },
          },
          { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
        ),
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return findOperation(request.GuildId, request.IdempotencyKey);
    }
  }

  async function acquire(operation) {
    const acquiredAt = now();
    return plain(
      await operationModel.findOneAndUpdate(
        {
          _id: operation._id,
          RequestHash: operation.RequestHash,
          Status: { $in: ["pending", "failed", "processing"] },
          $or: [
            { Status: { $in: ["pending", "failed"] } },
            { LeaseToken: null },
            { LeaseExpiresAt: null },
            { LeaseExpiresAt: { $lte: acquiredAt } },
          ],
        },
        {
          $set: {
            Status: "processing",
            LeaseToken: createLeaseToken(),
            LeaseExpiresAt: new Date(acquiredAt.getTime() + leaseDurationMs),
            Error: null,
          },
          $inc: { AttemptCount: 1 },
        },
        { returnDocument: "after" },
      ),
    );
  }

  async function runTransaction(callback) {
    if (transactionRunner) return transactionRunner(callback);
    return connection.transaction(callback, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });
  }

  async function commit(operation, transactionalWork) {
    const entries = [];
    let workResult = null;
    await runTransaction(async (session) => {
      const movements = [...operation.Debits, ...operation.Credits];
      await accountStore.ensureAccounts(movements, {
        guildId: operation.GuildId,
        session,
      });
      let sequence = 0;
      for (const [direction, list] of [
        ["debit", operation.Debits],
        ["credit", operation.Credits],
      ]) {
        for (const movement of list) {
          const balances = await accountStore[direction](
            movement,
            movement.AmountCents,
            {
              guildId: operation.GuildId,
              session,
            },
          );
          entries.push({
            GuildId: operation.GuildId,
            OperationId: operation._id,
            Sequence: sequence++,
            AccountId: movement.AccountId,
            AccountType: movement.AccountType,
            Direction: direction,
            AmountCents: movement.AmountCents,
            BalanceBeforeCents: balances.balanceBeforeCents,
            BalanceAfterCents: balances.balanceAfterCents,
            Reason: movement.Reason,
            MonetaryVersion: 2,
            CreatedAt: now(),
          });
        }
      }
      if (transactionalWork) {
        workResult = await transactionalWork({
          session,
          operation,
          ledgerEntries: entries,
        });
      }
      if (entries.length)
        await ledgerModel.insertMany(entries, { session, ordered: true });
      const completedAt = now();
      const result = await operationModel.updateOne(
        {
          _id: operation._id,
          Status: "processing",
          LeaseToken: operation.LeaseToken,
        },
        {
          $set: {
            Status: "committed",
            CompletedAt: completedAt,
            LeaseToken: null,
            LeaseExpiresAt: null,
            Error: null,
            Result: {
              LedgerEntryCount: entries.length,
              DebitTotalCents: operation.Debits.reduce(
                (sum, entry) => sum + entry.AmountCents,
                0,
              ),
              CreditTotalCents: operation.Credits.reduce(
                (sum, entry) => sum + entry.AmountCents,
                0,
              ),
              Work: redactData(workResult),
            },
          },
        },
        { session },
      );
      if (result.matchedCount !== 1) {
        throw new EconomyOperationError(
          "La operación perdió su lease antes del commit",
          "ECONOMY_LEASE_LOST",
        );
      }
    });
    return findOperation(operation.GuildId, operation.IdempotencyKey);
  }

  async function persistFailure(operation, error) {
    const unknownCommit =
      error?.hasErrorLabel?.("UnknownTransactionCommitResult") === true;
    const status = unknownCommit ? "manual_review" : "failed";
    const safe = sanitizeError(error);
    await operationModel.updateOne(
      {
        _id: operation._id,
        Status: "processing",
        LeaseToken: operation.LeaseToken,
      },
      {
        $set: {
          Status: status,
          Error: {
            Code: String(error?.code ?? safe.code ?? "ECONOMY_FAILED"),
            Message: safe.message,
            At: now(),
          },
          LeaseToken: null,
          LeaseExpiresAt: null,
        },
      },
    );
    return findOperation(operation.GuildId, operation.IdempotencyKey);
  }

  async function executeEconomyOperation({
    guildId,
    idempotencyKey,
    type,
    flow = "balanced",
    actorUserId,
    debits = [],
    credits = [],
    metadata = {},
    effects = [],
    transactionalWork = null,
  }) {
    const normalizedDebits = normalizeMovements(debits, "debits");
    const normalizedCredits = normalizeMovements(credits, "credits");
    const normalizedType = identifier(type, "type");
    validateFlow(normalizedType, flow, normalizedDebits, normalizedCredits);
    const request = {
      GuildId: identifier(guildId, "guildId"),
      IdempotencyKey: identifier(idempotencyKey, "idempotencyKey"),
      Type: normalizedType,
      Flow: flow,
      ActorUserId: identifier(actorUserId, "actorUserId"),
      Metadata: redactData(metadata),
      Debits: normalizedDebits,
      Credits: normalizedCredits,
      Effects: redactData(effects),
    };
    const requestHash = hashRequest(request);
    await transactionSupportCheck(connection);
    let operation = await createOrLoad({
      ...request,
      RequestHash: requestHash,
    });
    if (operation.RequestHash !== requestHash) {
      throw new EconomyOperationError(
        "La clave de idempotencia ya pertenece a otra solicitud",
        "ECONOMY_IDEMPOTENCY_CONFLICT",
        { operation },
      );
    }
    if (operation.Status === "committed")
      return { outcome: "already_committed", operation };
    if (operation.Status === "manual_review")
      return { outcome: "manual_review", operation };
    operation = await acquire(operation);
    if (!operation) {
      return {
        outcome: "in_progress",
        operation: await findOperation(request.GuildId, request.IdempotencyKey),
      };
    }
    try {
      return {
        outcome: "committed",
        operation: await commit(operation, transactionalWork),
      };
    } catch (error) {
      const failed = await persistFailure(operation, error);
      throw new EconomyOperationError(
        failed?.Status === "manual_review"
          ? "La operación requiere revisión manual"
          : "La operación económica fue revertida",
        failed?.Status === "manual_review"
          ? "ECONOMY_MANUAL_REVIEW_REQUIRED"
          : String(error?.code ?? "ECONOMY_TRANSACTION_FAILED"),
        { operation: failed, cause: error, details: error?.details ?? null },
      );
    }
  }

  return {
    executeEconomyOperation,
    getEconomyOperation: ({ guildId, idempotencyKey }) =>
      findOperation(
        identifier(guildId, "guildId"),
        identifier(idempotencyKey, "idempotencyKey"),
      ),
  };
}

module.exports = {
  EconomyOperationError,
  createEconomyOperationService,
  executeEconomyOperation:
    createEconomyOperationService().executeEconomyOperation,
  hashRequest,
};
