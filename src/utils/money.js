const DECIMAL_MONEY_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

class InvalidMoneyAmountError extends Error {
  constructor(message, code = "INVALID_MONEY_AMOUNT") {
    super(message);
    this.name = "InvalidMoneyAmountError";
    this.code = code;
  }
}

function normalizedDecimal(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new InvalidMoneyAmountError(
        "El monto debe ser finito",
        "MONEY_NOT_FINITE",
      );
    }
    const text = String(value);
    if (/e/i.test(text)) {
      throw new InvalidMoneyAmountError(
        "La notación exponencial no está permitida",
        "MONEY_EXPONENTIAL_NOTATION",
      );
    }
    return text;
  }
  if (typeof value !== "string") {
    throw new InvalidMoneyAmountError(
      "El monto debe ser texto o número",
      "MONEY_INVALID_TYPE",
    );
  }
  const text = value.trim();
  if (!text)
    throw new InvalidMoneyAmountError("El monto está vacío", "MONEY_EMPTY");
  if (/e/i.test(text)) {
    throw new InvalidMoneyAmountError(
      "La notación exponencial no está permitida",
      "MONEY_EXPONENTIAL_NOTATION",
    );
  }
  return text;
}

function assertSafeMoneyAmount(
  amountCents,
  { allowNegative = false, allowZero = true } = {},
) {
  if (!Number.isSafeInteger(amountCents)) {
    throw new InvalidMoneyAmountError(
      "El monto en centavos debe ser un entero seguro",
      "MONEY_UNSAFE_INTEGER",
    );
  }
  if (!allowNegative && amountCents < 0) {
    throw new InvalidMoneyAmountError(
      "El monto no puede ser negativo",
      "MONEY_NEGATIVE",
    );
  }
  if (!allowZero && amountCents === 0) {
    throw new InvalidMoneyAmountError(
      "El monto debe ser mayor que cero",
      "MONEY_ZERO",
    );
  }
  return amountCents;
}

function parseMoneyToCents(value, options = {}) {
  const match = DECIMAL_MONEY_PATTERN.exec(normalizedDecimal(value));
  if (!match) {
    throw new InvalidMoneyAmountError(
      "El monto debe tener como máximo dos decimales",
      "MONEY_INVALID_DECIMALS",
    );
  }
  const [, sign, whole, fraction = ""] = match;
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  const signed = sign === "-" ? -cents : cents;
  const maximum = BigInt(Number.MAX_SAFE_INTEGER);
  if (signed > maximum || signed < -maximum) {
    throw new InvalidMoneyAmountError(
      "El monto excede el rango contable seguro",
      "MONEY_UNSAFE_INTEGER",
    );
  }
  return assertSafeMoneyAmount(Number(signed), options);
}

function parseLegacyMoneyToCents(value, options = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return parseMoneyToCents(value, options);
  }
  const roundedCents = Math.round(value * 100);
  assertSafeMoneyAmount(roundedCents, options);
  const canonical = roundedCents / 100;
  const tolerance =
    Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(canonical));
  if (Math.abs(value - canonical) > tolerance) {
    throw new InvalidMoneyAmountError(
      "El saldo legacy debe tener como máximo dos decimales",
      "MONEY_INVALID_DECIMALS",
    );
  }
  return roundedCents;
}

function calculateBasisPoints(
  amountCents,
  basisPoints,
  { rounding = "nearest" } = {},
) {
  assertSafeMoneyAmount(amountCents);
  if (
    !Number.isSafeInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > 10_000
  ) {
    throw new InvalidMoneyAmountError(
      "Los puntos base no son válidos",
      "MONEY_INVALID_RATE",
    );
  }
  const numerator = BigInt(amountCents) * BigInt(basisPoints);
  const result =
    rounding === "floor" ? numerator / 10_000n : (numerator + 5_000n) / 10_000n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new InvalidMoneyAmountError(
      "El resultado excede el rango seguro",
      "MONEY_UNSAFE_INTEGER",
    );
  }
  return Number(result);
}

function centsToLegacyPesos(amountCents) {
  return assertSafeMoneyAmount(amountCents, { allowZero: true }) / 100;
}

module.exports = {
  InvalidMoneyAmountError,
  assertSafeMoneyAmount,
  calculateBasisPoints,
  centsToLegacyPesos,
  parseLegacyMoneyToCents,
  parseMoneyToCents,
};
