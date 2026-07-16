const EconomyUser = require("../models/EconomyUser");
const Licencias = require("../models/Licencias");
const { createEconomyOperationService } = require("./economyOperationService");
const { StoreOrderError, buildDebitPlan } = require("./storeOrderService");
const {
  calculateBasisPoints,
  parseLegacyMoneyToCents,
  parseMoneyToCents,
} = require("../utils/money");

const LICENSE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const LICENSE_RENEWAL_MS = 3 * 24 * 60 * 60 * 1000;
const LICENSE_PRICES = Object.freeze({
  Armas: Object.freeze({
    TipoA: 900,
    TipoB: 1200,
    TipoC: 1800,
    TipoD: 2500,
    TipoJ: 3000,
    TipoK: 2500,
    TipoM: 1500,
    TipoR: 1200,
  }),
  Colectivas: Object.freeze({ CL: 5000, CC: 4000 }),
  Restringidas: Object.freeze({ TipoP: 10000, TipoZ: 10000 }),
});

function launderingQuote(grossCents) {
  const rateBasisPoints =
    grossCents < 50_000_000 ? 3000 : grossCents <= 150_000_000 ? 2000 : 1000;
  const feeCents = calculateBasisPoints(grossCents, rateBasisPoints);
  return {
    grossCents,
    rateBasisPoints,
    feeCents,
    netCents: grossCents - feeCents,
  };
}

function balances(user) {
  return {
    cash: parseLegacyMoneyToCents(user?.Efectivo ?? 0),
    checking: parseLegacyMoneyToCents(user?.CuentaCorriente?.Balance ?? 0),
    salary: parseLegacyMoneyToCents(user?.CuentaSalario?.Balance ?? 0),
  };
}

function paymentAccount(value) {
  return (
    {
      efectivo: "cash",
      corriente: "checking",
      salario: "salary",
      auto: "auto",
    }[value] ?? value
  );
}

function licensePriceCents(category, code) {
  const price = LICENSE_PRICES[category]?.[code];
  if (price === undefined)
    throw new StoreOrderError(
      "La licencia no existe en el catálogo.",
      "LICENSE_NOT_FOUND",
      404,
    );
  return parseMoneyToCents(price, { allowZero: false });
}

function licenseEntry(document, category, code) {
  const categoryEntries = document?.[category];
  if (categoryEntries instanceof Map) return categoryEntries.get(code);
  return categoryEntries?.[code];
}

function createDashboardEconomyService({
  economyUserModel = EconomyUser,
  licenseModel = Licencias,
  economyService = createEconomyOperationService(),
  now = () => new Date(),
} = {}) {
  async function launder({ guildId, userId, requestId }) {
    const idempotencyKey = `web:laundering:${guildId}:${requestId}`;
    const existing = await economyService.getEconomyOperation?.({
      guildId,
      idempotencyKey,
    });
    if (
      existing &&
      ["committed", "processing", "manual_review"].includes(existing.Status)
    ) {
      if (existing.ActorUserId !== userId) {
        throw new StoreOrderError(
          "La operación pertenece a otro usuario.",
          "IDEMPOTENCY_CONFLICT",
          409,
        );
      }
      const grossCents = existing.Debits?.[0]?.AmountCents ?? 0;
      const netCents = existing.Credits?.[0]?.AmountCents ?? 0;
      return {
        grossCents,
        netCents,
        feeCents: grossCents - netCents,
        rateBasisPoints: existing.Metadata?.FeeBasisPoints ?? 0,
        outcome:
          existing.Status === "committed"
            ? "already_committed"
            : existing.Status === "processing"
              ? "in_progress"
              : "manual_review",
        operation: existing,
      };
    }
    const user = await economyUserModel
      .findOne({ GuildId: guildId, UserId: userId }, { DineroNegro: 1 })
      .lean();
    const grossCents = parseLegacyMoneyToCents(user?.DineroNegro ?? 0);
    if (!grossCents)
      throw new StoreOrderError(
        "No tienes dinero negro disponible.",
        "NO_DIRTY_CASH",
        409,
      );
    const quote = launderingQuote(grossCents);
    const result = await economyService.executeEconomyOperation({
      guildId,
      idempotencyKey,
      type: "money_laundering",
      flow: "sink",
      actorUserId: userId,
      debits: [
        {
          AccountId: `${userId}:dirty_cash`,
          AccountType: "dirty_cash",
          OwnerUserId: userId,
          AmountCents: grossCents,
          Reason: "Lavado de dinero",
        },
      ],
      credits: [
        {
          AccountId: `${userId}:cash`,
          AccountType: "cash",
          OwnerUserId: userId,
          AmountCents: quote.netCents,
          Reason: "Neto de lavado",
        },
      ],
      metadata: { FeeBasisPoints: quote.rateBasisPoints },
    });
    return { ...quote, outcome: result.outcome, operation: result.operation };
  }

  async function payDebt({ guildId, userId, requestId, source = "auto" }) {
    const idempotencyKey = `web:debt-payment:${guildId}:${requestId}`;
    const existing = await economyService.getEconomyOperation?.({
      guildId,
      idempotencyKey,
    });
    if (
      existing &&
      ["committed", "processing", "manual_review"].includes(existing.Status)
    ) {
      if (
        existing.ActorUserId !== userId ||
        (existing.Metadata?.PaymentSource &&
          existing.Metadata.PaymentSource !== paymentAccount(source))
      ) {
        throw new StoreOrderError(
          "La operación pertenece a otro usuario.",
          "IDEMPOTENCY_CONFLICT",
          409,
        );
      }
      return {
        debtPaidCents: existing.Credits?.[0]?.AmountCents ?? 0,
        outcome:
          existing.Status === "committed"
            ? "already_committed"
            : existing.Status === "processing"
              ? "in_progress"
              : "manual_review",
        operation: existing,
      };
    }
    const user = await economyUserModel
      .findOne({ GuildId: guildId, UserId: userId })
      .lean();
    if (!user)
      throw new StoreOrderError(
        "No tienes economía registrada.",
        "ECONOMY_NOT_FOUND",
        409,
      );
    const debtCents = parseLegacyMoneyToCents(user.Deuda ?? 0);
    if (!debtCents)
      throw new StoreOrderError("No tienes deuda activa.", "NO_DEBT", 409);
    const debits = buildDebitPlan(
      userId,
      balances(user),
      debtCents,
      paymentAccount(source),
    );
    const result = await economyService.executeEconomyOperation({
      guildId,
      idempotencyKey,
      type: "debt_payment",
      flow: "balanced",
      actorUserId: userId,
      debits: debits.map((entry) => ({ ...entry, Reason: "Pago de deuda" })),
      credits: [
        {
          AccountId: `${userId}:debt`,
          AccountType: "debt",
          OwnerUserId: userId,
          AmountCents: debtCents,
          Reason: "Reducción de deuda",
        },
      ],
      metadata: {
        DebtBeforeCents: debtCents,
        PaymentSource: paymentAccount(source),
      },
    });
    return {
      debtPaidCents: debtCents,
      outcome: result.outcome,
      operation: result.operation,
    };
  }

  async function operateLicense({
    guildId,
    userId,
    requestId,
    action,
    category,
    code,
    source = "auto",
    memberRoles = [],
  }) {
    if (!["comprar", "renovar", "cancelar"].includes(action))
      throw new StoreOrderError(
        "La acción de licencia no es válida.",
        "INVALID_LICENSE_ACTION",
        400,
      );
    if (!Object.hasOwn(LICENSE_PRICES, category))
      throw new StoreOrderError(
        "La categoría no es válida.",
        "INVALID_LICENSE_CATEGORY",
        400,
      );
    const idempotencyKey = `web:license-${action}:${guildId}:${requestId}`;
    const existing = await economyService.getEconomyOperation?.({
      guildId,
      idempotencyKey,
    });
    if (
      existing &&
      ["committed", "processing", "manual_review"].includes(existing.Status)
    ) {
      if (
        existing.ActorUserId !== userId ||
        existing.Metadata?.Category !== category ||
        existing.Metadata?.Code !== code ||
        (existing.Metadata?.PaymentSource &&
          existing.Metadata.PaymentSource !== paymentAccount(source))
      ) {
        throw new StoreOrderError(
          "La operación pertenece a otra solicitud.",
          "IDEMPOTENCY_CONFLICT",
          409,
        );
      }
      const refundCents =
        action === "cancelar" ? (existing.Credits?.[0]?.AmountCents ?? 0) : 0;
      const priceCents =
        existing.Metadata?.PriceCents ??
        existing.Debits?.reduce(
          (sum, movement) => sum + movement.AmountCents,
          0,
        ) ??
        refundCents * 2;
      return {
        action,
        category,
        code,
        priceCents,
        refundCents,
        expiresAt: existing.Result?.Work?.ExpiresAt
          ? new Date(existing.Result.Work.ExpiresAt)
          : null,
        outcome:
          existing.Status === "committed"
            ? "already_committed"
            : existing.Status === "processing"
              ? "in_progress"
              : "manual_review",
        operation: existing,
      };
    }
    const priceCents = licensePriceCents(category, code);
    if (category === "Restringidas") {
      const requiredRole = process.env.ACCIONISTA_CONTROL;
      if (!requiredRole)
        throw new StoreOrderError(
          "La licencia restringida no está configurada.",
          "RESTRICTED_LICENSE_NOT_CONFIGURED",
          503,
        );
      if (!memberRoles.includes(requiredRole))
        throw new StoreOrderError(
          "No tienes autorización para esta licencia.",
          "RESTRICTED_LICENSE_FORBIDDEN",
          403,
        );
    }
    const [user, licenseDocument] = await Promise.all([
      economyUserModel.findOne({ GuildId: guildId, UserId: userId }).lean(),
      licenseModel.findOne({ GuildId: guildId, UserId: userId }).lean(),
    ]);
    const current = licenseEntry(licenseDocument, category, code);
    const active = Boolean(current?.Activa);
    const currentExpiration = current?.FechaExpiracion
      ? new Date(current.FechaExpiracion)
      : null;
    const operatedAt = now();
    let type;
    let flow;
    let debits = [];
    let credits = [];
    if (action === "comprar" || action === "renovar") {
      if (action === "comprar" && active)
        throw new StoreOrderError(
          "La licencia ya está activa.",
          "LICENSE_ALREADY_ACTIVE",
          409,
        );
      if (action === "renovar") {
        if (!active)
          throw new StoreOrderError(
            "La licencia no está activa.",
            "LICENSE_NOT_ACTIVE",
            409,
          );
        if (
          currentExpiration &&
          currentExpiration.getTime() - operatedAt.getTime() >
            LICENSE_RENEWAL_MS
        )
          throw new StoreOrderError(
            "La renovación todavía no está disponible.",
            "LICENSE_RENEWAL_NOT_AVAILABLE",
            409,
          );
      }
      if (!user)
        throw new StoreOrderError(
          "No tienes economía disponible.",
          "ECONOMY_NOT_FOUND",
          409,
        );
      debits = buildDebitPlan(
        userId,
        balances(user),
        priceCents,
        paymentAccount(source),
      ).map((entry) => ({
        ...entry,
        Reason: `${action === "comprar" ? "Compra" : "Renovación"} de licencia ${code}`,
      }));
      type = action === "comprar" ? "license_purchase" : "license_renewal";
      flow = "sink";
    } else {
      if (!active)
        throw new StoreOrderError(
          "La licencia no está activa.",
          "LICENSE_NOT_ACTIVE",
          409,
        );
      const refundCents = calculateBasisPoints(priceCents, 5000, {
        rounding: "floor",
      });
      credits = [
        {
          AccountId: `${userId}:cash`,
          AccountType: "cash",
          OwnerUserId: userId,
          AmountCents: refundCents,
          Reason: `Cancelación de licencia ${code}`,
        },
      ];
      type = "license_refund";
      flow = "source";
    }
    const expiresAt = new Date(operatedAt.getTime() + LICENSE_DURATION_MS);
    const result = await economyService.executeEconomyOperation({
      guildId,
      idempotencyKey,
      type,
      flow,
      actorUserId: userId,
      debits,
      credits,
      metadata: {
        Category: category,
        Code: code,
        PriceCents: priceCents,
        PaymentSource: paymentAccount(source),
      },
      transactionalWork: async ({ session }) => {
        const path = `${category}.${code}`;
        const filter = { GuildId: guildId, UserId: userId };
        if (action === "comprar") filter[`${path}.Activa`] = { $ne: true };
        if (action === "renovar") {
          filter[`${path}.Activa`] = true;
          if (currentExpiration)
            filter[`${path}.FechaExpiracion`] = currentExpiration;
        }
        if (action === "cancelar") filter[`${path}.Activa`] = true;
        const values =
          action === "cancelar"
            ? { [`${path}.Activa`]: false, [`${path}.FechaExpiracion`]: null }
            : {
                [`${path}.Activa`]: true,
                [`${path}.FechaCompra`]: operatedAt,
                [`${path}.FechaExpiracion`]: expiresAt,
                [`${path}.NotificacionEnviada`]: false,
                [`${path}.NotificacionExpiradaEnviada`]: false,
              };
        const updated = await licenseModel.findOneAndUpdate(
          filter,
          { $set: values, $setOnInsert: { GuildId: guildId, UserId: userId } },
          {
            upsert: action === "comprar",
            session,
            returnDocument: "after",
            runValidators: true,
          },
        );
        if (!updated)
          throw new StoreOrderError(
            "La licencia cambió concurrentemente.",
            "LICENSE_STATE_CONFLICT",
            409,
          );
        return {
          Action: action,
          Category: category,
          Code: code,
          ExpiresAt: action === "cancelar" ? null : expiresAt,
        };
      },
    });
    return {
      action,
      category,
      code,
      priceCents,
      refundCents: action === "cancelar" ? credits[0].AmountCents : 0,
      expiresAt: action === "cancelar" ? null : expiresAt,
      outcome: result.outcome,
    };
  }

  return { launder, payDebt, operateLicense };
}

module.exports = {
  LICENSE_PRICES,
  createDashboardEconomyService,
  launderingQuote,
  licensePriceCents,
};
