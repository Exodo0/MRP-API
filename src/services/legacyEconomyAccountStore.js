const EconomyUser = require("../models/EconomyUser");
const {
  assertSafeMoneyAmount,
  centsToLegacyPesos,
  parseLegacyMoneyToCents,
} = require("../utils/money");

const ACCOUNT_FIELDS = Object.freeze({
  salary: {
    balancePath: "CuentaSalario.Balance",
    activePath: "CuentaSalario.Activa",
  },
  checking: {
    balancePath: "CuentaCorriente.Balance",
    activePath: "CuentaCorriente.Activa",
  },
  cash: { balancePath: "Efectivo" },
  dirty_cash: { balancePath: "DineroNegro" },
  debt: { balancePath: "Deuda" },
});

class EconomyAccountMutationError extends Error {
  constructor(message, code, details = null) {
    super(message);
    this.name = "EconomyAccountMutationError";
    this.code = code;
    this.details = details;
  }
}

function definitionFor(account) {
  const definition = ACCOUNT_FIELDS[account.AccountType];
  if (!definition) {
    throw new EconomyAccountMutationError(
      `Tipo de cuenta no soportado: ${account.AccountType}`,
      "ECONOMY_ACCOUNT_TYPE_UNSUPPORTED",
    );
  }
  return definition;
}

function getPath(document, path) {
  return path.split(".").reduce((value, key) => value?.[key], document);
}

function createLegacyEconomyAccountStore({ model = EconomyUser } = {}) {
  async function ensureAccounts(accounts, { guildId, session }) {
    for (const userId of new Set(accounts.map((entry) => entry.OwnerUserId))) {
      await model.updateOne(
        { GuildId: guildId, UserId: userId },
        { $setOnInsert: { GuildId: guildId, UserId: userId } },
        { upsert: true, session, setDefaultsOnInsert: true },
      );
    }
  }

  async function mutate(account, amountCents, direction, { guildId, session }) {
    const definition = definitionFor(account);
    const pesos = centsToLegacyPesos(amountCents);
    const decreases = direction === "debit" || account.AccountType === "debt";
    const filter = {
      GuildId: guildId,
      UserId: account.OwnerUserId,
      [definition.balancePath]: decreases
        ? { $gte: pesos }
        : { $lte: Number.MAX_SAFE_INTEGER / 100 - pesos },
    };
    if (definition.activePath) filter[definition.activePath] = true;
    const before = await model.findOneAndUpdate(
      filter,
      { $inc: { [definition.balancePath]: decreases ? -pesos : pesos } },
      { session, returnDocument: "before", runValidators: true },
    );
    if (!before) {
      throw new EconomyAccountMutationError(
        direction === "debit"
          ? "Saldo insuficiente o cuenta inactiva"
          : "Cuenta inexistente, inactiva o saldo fuera de rango",
        direction === "debit"
          ? "INSUFFICIENT_FUNDS"
          : "ACCOUNT_CREDIT_REJECTED",
      );
    }
    const beforeCents = parseLegacyMoneyToCents(
      getPath(before, definition.balancePath) ?? 0,
    );
    const afterCents = decreases
      ? beforeCents - amountCents
      : beforeCents + amountCents;
    assertSafeMoneyAmount(afterCents);
    return { balanceBeforeCents: beforeCents, balanceAfterCents: afterCents };
  }

  return {
    ensureAccounts,
    debit: (account, amount, context) =>
      mutate(account, amount, "debit", context),
    credit: (account, amount, context) =>
      mutate(account, amount, "credit", context),
  };
}

module.exports = {
  EconomyAccountMutationError,
  createLegacyEconomyAccountStore,
};
