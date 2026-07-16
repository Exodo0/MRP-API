const TIME_ZONE = "America/Mexico_City";
const ANCHOR_DATE = "2025-01-01";
const CONFIG = Object.freeze({
  USD: Object.freeze({
    base: 25,
    min: 17,
    max: 26,
    volatility: 0.03,
    meanReversion: 0.12,
    spread: 0.14,
    precision: 4,
  }),
  BTC: Object.freeze({
    base: 2_500_000,
    min: 1_800_000,
    max: 4_500_000,
    volatility: 0.08,
    meanReversion: 0.08,
    spread: 0.18,
    precision: 2,
  }),
});

function roundTo(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function toDayKey(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

function addDays(day, days) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function differenceInDays(start, end) {
  return Math.max(
    0,
    Math.floor(
      (new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) /
        86_400_000,
    ),
  );
}

function pseudoRandom(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function history(asset, days, endDate = new Date()) {
  const config = CONFIG[asset];
  const endDay = toDayKey(endDate);
  const endIndex = differenceInDays(ANCHOR_DATE, endDay);
  const startIndex = Math.max(
    0,
    endIndex - (Math.max(2, Math.min(days, 365)) - 1),
  );
  let price = config.base;
  const points = [];
  for (let index = 0; index <= endIndex; index += 1) {
    const day = addDays(ANCHOR_DATE, index);
    const shock =
      (pseudoRandom(`mxrp-${asset}-mxn-${day}`) - 0.5) * config.volatility;
    const reversion =
      ((config.base - price) / config.base) * config.meanReversion;
    price = Math.max(
      config.min,
      Math.min(config.max, price * (1 + shock + reversion)),
    );
    if (index >= startIndex) {
      points.push({ date: day, close: roundTo(price, config.precision) });
    }
  }
  return points;
}

function snapshot(now = new Date()) {
  const assets = {};
  for (const asset of ["USD", "BTC"]) {
    const points = history(asset, 2, now);
    const latest = points.at(-1);
    const previous = points.at(-2);
    const config = CONFIG[asset];
    assets[asset] = {
      date: latest.date,
      mid: latest.close,
      buy: roundTo(latest.close * (1 + config.spread), config.precision),
      sell: roundTo(latest.close * (1 - config.spread), config.precision),
      changePct: previous
        ? roundTo(((latest.close - previous.close) / previous.close) * 100, 3)
        : 0,
      precision: config.precision,
    };
  }
  return { date: assets.USD.date, assets };
}

module.exports = { CONFIG, history, snapshot, toDayKey };
