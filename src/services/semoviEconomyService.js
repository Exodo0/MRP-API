const { createHash, randomUUID } = require("node:crypto");
const Debt = require("../models/Debt");
const EconomyUser = require("../models/EconomyUser");
const Ine = require("../models/Ine");
const Pasaporte = require("../models/Pasaporte");
const SemoviLicense = require("../models/SemoviLicense");
const { createEconomyOperationService } = require("./economyOperationService");
const { StoreOrderError, buildDebitPlan } = require("./storeOrderService");
const {
  calculateBasisPoints,
  centsToLegacyPesos,
  parseLegacyMoneyToCents,
  parseMoneyToCents,
} = require("../utils/money");
const { sanitizeError } = require("../utils/safeError");

const EFFECT_LEASE_MS = 30_000;

function configuredCatalog(value = process.env.SEMOVI_LICENSE_CATALOG_JSON) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function catalogEntry(catalog, type) {
  const entry = catalog?.[type];
  if (!entry || typeof entry !== "object") {
    throw new StoreOrderError(
      "El tipo de licencia no está configurado por SEMOVI.",
      "SEMOVI_LICENSE_NOT_CONFIGURED",
      503,
    );
  }
  const priceCents = parseMoneyToCents(entry.price, { allowZero: true });
  const expiresInDays = Number(entry.expiresInDays ?? 365);
  if (
    !Number.isSafeInteger(expiresInDays) ||
    expiresInDays < 1 ||
    expiresInDays > 3650
  ) {
    throw new StoreOrderError(
      "La vigencia configurada para la licencia no es válida.",
      "SEMOVI_LICENSE_NOT_CONFIGURED",
      503,
    );
  }
  return {
    priceCents,
    expiresInDays,
    roleId:
      typeof entry.roleId === "string" && entry.roleId ? entry.roleId : null,
    allowedPaymentModes: Array.isArray(entry.allowedPaymentModes)
      ? entry.allowedPaymentModes
      : priceCents === 0
        ? ["free"]
        : ["paid", "debt"],
  };
}

function userBalances(user) {
  return {
    cash: parseLegacyMoneyToCents(user?.Efectivo ?? 0),
    checking: parseLegacyMoneyToCents(user?.CuentaCorriente?.Balance ?? 0),
    salary: parseLegacyMoneyToCents(user?.CuentaSalario?.Balance ?? 0),
  };
}

function stableLicenseNumber(guildId, requestId, type) {
  const suffix = createHash("sha256")
    .update(`${guildId}:${requestId}:${type}`)
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
  return `SEMOVI-${String(type).toUpperCase().slice(0, 12)}-${suffix}`;
}

async function defaultRoleUpdate({ guildId, userId, roleId, action }) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw Object.assign(new Error("Discord role delivery is not configured"), {
      code: "DISCORD_NOT_CONFIGURED",
      retryable: false,
    });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
      {
        method: action === "remove" ? "DELETE" : "PUT",
        headers: { Authorization: `Bot ${token}` },
        signal: controller.signal,
      },
    );
    if (response.ok) return;
    const retryable = response.status === 429 || response.status >= 500;
    throw Object.assign(new Error("Discord role delivery failed"), {
      code: `DISCORD_${response.status}`,
      retryable,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function createSemoviEconomyService({
  catalog = configuredCatalog(),
  economyUserModel = EconomyUser,
  ineModel = Ine,
  passportModel = Pasaporte,
  debtModel = Debt,
  licenseModel = SemoviLicense,
  economyService = createEconomyOperationService(),
  roleUpdate = defaultRoleUpdate,
  now = () => new Date(),
  createLeaseToken = randomUUID,
} = {}) {
  async function resumeRoleEffect({ guildId, operationId }) {
    let license = await licenseModel
      .findOne({ GuildId: guildId, EconomyOperationId: operationId })
      .lean();
    if (!license || license.RoleEffect?.Status === "not_required") {
      return { status: "completed", license };
    }
    if (license.RoleEffect?.Status === "completed") {
      return { status: "completed", license, idempotent: true };
    }
    if (license.RoleEffect?.Status === "manual_review") {
      return { status: "manual_review", license };
    }
    const acquiredAt = now();
    const leaseToken = createLeaseToken();
    license = await licenseModel.findOneAndUpdate(
      {
        _id: license._id,
        "RoleEffect.Status": { $in: ["pending", "failed", "processing"] },
        $or: [
          { "RoleEffect.Status": { $in: ["pending", "failed"] } },
          { "RoleEffect.LeaseExpiresAt": null },
          { "RoleEffect.LeaseExpiresAt": { $lte: acquiredAt } },
        ],
      },
      {
        $set: {
          "RoleEffect.Status": "processing",
          "RoleEffect.LeaseToken": leaseToken,
          "RoleEffect.LeaseExpiresAt": new Date(
            acquiredAt.getTime() + EFFECT_LEASE_MS,
          ),
          "RoleEffect.LastError": null,
        },
        $inc: { "RoleEffect.AttemptCount": 1 },
      },
      { returnDocument: "after" },
    );
    if (!license) return { status: "processing" };
    try {
      await roleUpdate({
        guildId,
        userId: license.UserId,
        roleId: license.RoleEffect.RoleId,
        action: license.RoleEffect.Action,
      });
      const completed = await licenseModel.findOneAndUpdate(
        { _id: license._id, "RoleEffect.LeaseToken": leaseToken },
        {
          $set: {
            "RoleEffect.Status": "completed",
            "RoleEffect.CompletedAt": now(),
            "RoleEffect.LeaseToken": null,
            "RoleEffect.LeaseExpiresAt": null,
          },
        },
        { returnDocument: "after" },
      );
      return completed
        ? { status: "completed", license: completed }
        : { status: "processing" };
    } catch (error) {
      const safe = sanitizeError(error);
      const status = error?.retryable === true ? "failed" : "manual_review";
      await licenseModel.updateOne(
        { _id: license._id, "RoleEffect.LeaseToken": leaseToken },
        {
          $set: {
            "RoleEffect.Status": status,
            "RoleEffect.LastError":
              `${String(error?.code ?? "ROLE_EFFECT_FAILED")}: ${safe.message}`.slice(
                0,
                300,
              ),
            "RoleEffect.LeaseToken": null,
            "RoleEffect.LeaseExpiresAt": null,
          },
        },
      );
      return { status, license };
    }
  }

  async function issue({
    guildId,
    actorUserId,
    targetUserId,
    requestId,
    type,
    paymentMode,
    roleAction = "add",
  }) {
    if (!/^[A-Za-z0-9_-]{2,80}$/.test(String(targetUserId ?? ""))) {
      throw new StoreOrderError(
        "El usuario objetivo no es válido.",
        "INVALID_TARGET_USER",
        400,
      );
    }
    const idempotencyKey = `semovi:license:${guildId}:${requestId}`;
    const existing = await economyService.getEconomyOperation?.({
      guildId,
      idempotencyKey,
    });
    if (
      existing &&
      ["committed", "processing", "manual_review"].includes(existing.Status)
    ) {
      if (
        existing.ActorUserId !== actorUserId ||
        existing.Metadata?.TargetUserId !== targetUserId ||
        existing.Metadata?.LicenseType !== type ||
        existing.Metadata?.PaymentMode !== paymentMode ||
        existing.Metadata?.RoleAction !== roleAction
      ) {
        throw new StoreOrderError(
          "La operación pertenece a otra solicitud.",
          "IDEMPOTENCY_CONFLICT",
          409,
        );
      }
      if (existing.Status !== "committed") {
        return {
          outcome:
            existing.Status === "processing" ? "in_progress" : "manual_review",
          operation: existing,
        };
      }
      const delivery = await resumeRoleEffect({
        guildId,
        operationId: existing._id,
      });
      const license = await licenseModel
        .findOne({ GuildId: guildId, EconomyOperationId: existing._id })
        .lean();
      return {
        outcome: "already_committed",
        operation: existing,
        license,
        delivery,
      };
    }
    const configuredEntry = catalogEntry(catalog, type);
    const entry =
      roleAction === "remove"
        ? { ...configuredEntry, priceCents: 0, allowedPaymentModes: ["free"] }
        : configuredEntry;
    if (!entry.allowedPaymentModes.includes(paymentMode)) {
      throw new StoreOrderError(
        "La forma de pago no está autorizada para esta licencia.",
        "SEMOVI_PAYMENT_MODE_NOT_ALLOWED",
        422,
      );
    }
    const semoviId = process.env.SEMOVI_ID;
    const satId = process.env.SAT_ID;
    if (entry.priceCents > 0 && (!semoviId || !satId)) {
      throw new StoreOrderError(
        "Las cuentas gubernamentales de SEMOVI no están configuradas.",
        "SEMOVI_ACCOUNTS_NOT_CONFIGURED",
        503,
      );
    }
    const [user, ine, passport] = await Promise.all([
      economyUserModel
        .findOne({ GuildId: guildId, UserId: targetUserId })
        .lean(),
      ineModel.findOne({ GuildId: guildId, UserId: targetUserId }).lean(),
      passportModel.findOne({ GuildId: guildId, UserId: targetUserId }).lean(),
    ]);
    if (!ine && !passport) {
      throw new StoreOrderError(
        "El usuario objetivo no tiene un documento de identidad válido.",
        "IDENTITY_NOT_FOUND",
        404,
      );
    }
    const taxCents = calculateBasisPoints(entry.priceCents, 1600);
    const semoviCents = entry.priceCents - taxCents;
    let debits = [];
    const credits = [];
    let flow = "balanced";
    let operationType = "semovi_license";
    if (entry.priceCents > 0) {
      credits.push(
        {
          AccountId: `${satId}:cash`,
          AccountType: "cash",
          OwnerUserId: satId,
          AmountCents: taxCents,
          Reason: `IVA licencia SEMOVI ${type}`,
        },
        {
          AccountId: `${semoviId}:cash`,
          AccountType: "cash",
          OwnerUserId: semoviId,
          AmountCents: semoviCents,
          Reason: `Ingreso licencia SEMOVI ${type}`,
        },
      );
      for (let index = credits.length - 1; index >= 0; index -= 1) {
        if (credits[index].AmountCents === 0) credits.splice(index, 1);
      }
      if (paymentMode === "paid") {
        if (!user) {
          throw new StoreOrderError(
            "El usuario no tiene economía registrada.",
            "ECONOMY_NOT_FOUND",
            404,
          );
        }
        debits = buildDebitPlan(
          targetUserId,
          userBalances(user),
          entry.priceCents,
          "auto",
        ).map((movement) => ({
          ...movement,
          Reason: `Licencia SEMOVI ${type}`,
        }));
      } else {
        flow = "source";
        operationType = "semovi_debt_issue";
      }
    }
    const issuedAt = now();
    const expiresAt = new Date(
      issuedAt.getTime() + entry.expiresInDays * 24 * 60 * 60 * 1000,
    );
    const number = stableLicenseNumber(guildId, requestId, type);
    const result = await economyService.executeEconomyOperation({
      guildId,
      idempotencyKey,
      type: operationType,
      flow,
      actorUserId,
      debits,
      credits,
      metadata: {
        TargetUserId: targetUserId,
        LicenseType: type,
        PaymentMode: paymentMode,
        PriceCents: entry.priceCents,
        TaxCents: taxCents,
        RoleAction: roleAction,
      },
      effects: entry.roleId
        ? [
            {
              Type: "discord_role",
              Payload: { RoleId: entry.roleId, Action: roleAction },
            },
          ]
        : [],
      transactionalWork: async ({ session, operation }) => {
        await licenseModel.updateMany(
          { GuildId: guildId, UserId: targetUserId, Active: true },
          { $set: { Active: false, CancelledAt: issuedAt } },
          { session },
        );
        let debtId = null;
        if (paymentMode === "debt" && entry.priceCents > 0) {
          const debt = await debtModel
            .create(
              [
                {
                  GuildId: guildId,
                  UserId: targetUserId,
                  Institution: "SEMOVI",
                  Concept: `Licencia de conducir tipo ${type}`,
                  Amount: centsToLegacyPesos(entry.priceCents),
                  AmountCents: entry.priceCents,
                  PaidAmount: 0,
                  PaidAmountCents: 0,
                  MoneyVersion: 2,
                  EconomyOperationId: operation._id,
                  Status: "pending",
                  Metadata: { type },
                  CreatedBy: actorUserId,
                },
              ],
              { session },
            )
            .then((documents) => documents[0]);
          debtId = debt._id;
          await economyUserModel.updateOne(
            { GuildId: guildId, UserId: targetUserId },
            {
              $inc: { Deuda: centsToLegacyPesos(entry.priceCents) },
              $setOnInsert: { GuildId: guildId, UserId: targetUserId },
            },
            { upsert: true, session },
          );
        }
        if (satId) {
          await economyUserModel.updateOne(
            { GuildId: guildId, UserId: satId },
            { $set: { Sat: true } },
            { session },
          );
        }
        const document = await licenseModel
          .create(
            [
              {
                GuildId: guildId,
                UserId: targetUserId,
                Type: type,
                Number: number,
                IssuedAt: issuedAt,
                ExpiresAt: expiresAt,
                Active: roleAction !== "remove",
                Price: centsToLegacyPesos(entry.priceCents),
                PriceCents: entry.priceCents,
                MoneyVersion: 2,
                PaymentStatus:
                  roleAction === "remove" ? "cancelled" : paymentMode,
                DebtId: debtId,
                CreatedBy: actorUserId,
                CancelledAt: roleAction === "remove" ? issuedAt : null,
                EconomyOperationId: operation._id,
                RoleEffect: entry.roleId
                  ? {
                      RoleId: entry.roleId,
                      Action: roleAction,
                      Status: "pending",
                    }
                  : { Status: "not_required" },
              },
            ],
            { session },
          )
          .then((documents) => documents[0]);
        return { LicenseId: document._id, Number: number };
      },
    });
    if (
      result.outcome === "in_progress" ||
      result.outcome === "manual_review"
    ) {
      return { outcome: result.outcome, operation: result.operation };
    }
    const delivery = await resumeRoleEffect({
      guildId,
      operationId: result.operation._id,
    });
    const license = await licenseModel
      .findOne({ GuildId: guildId, EconomyOperationId: result.operation._id })
      .lean();
    return {
      outcome: result.outcome,
      operation: result.operation,
      license,
      delivery,
    };
  }

  return { issue, resumeRoleEffect };
}

module.exports = {
  catalogEntry,
  configuredCatalog,
  createSemoviEconomyService,
  stableLicenseNumber,
};
