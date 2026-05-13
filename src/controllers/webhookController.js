const crypto = require("node:crypto");
const logger = require("../logger");
const { addLog } = require("../services/logBuffer");

const ERLC_PUBLIC_KEY_SPKI =
  process.env.ERLC_PUBLIC_KEY ||
  "MCowBQYDK2VwAyEAjSICb9pp0kHizGQtdG8ySWsDChfGqi+gyFCttigBNOA=";

let subtleKey = null;

async function initWebhookKey() {
  try {
    const spkiBytes = Buffer.from(ERLC_PUBLIC_KEY_SPKI, "base64");
    const rawEd25519Key = spkiBytes.subarray(12, 44);

    subtleKey = await crypto.subtle.importKey(
      "raw",
      rawEd25519Key,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    logger.info("[Webhook] Ed25519 public key loaded OK");
  } catch (err) {
    logger.error({ err }, "[Webhook] Failed to load Ed25519 public key");
    subtleKey = null;
  }
}

async function verifyEd25519(timestamp, sigHex, rawBody) {
  if (!subtleKey) return false;

  try {
    const tsBytes = Buffer.from(timestamp, "utf8");
    const message = Buffer.concat([tsBytes, rawBody]);
    const sigBytes = Buffer.from(sigHex, "hex");

    return await crypto.subtle.verify(
      { name: "Ed25519" },
      subtleKey,
      sigBytes,
      message
    );
  } catch (err) {
    logger.error({ err }, "[Webhook] Ed25519 verification error");
    return false;
  }
}

function describeEvent(body) {
  if (body.events?.length) {
    const ev = body.events[0];
    switch (ev.event) {
      case "WebhookProbe":
        return "WebhookProbe - validacion de ER:LC";
      case "ChatCommand":
        return `ChatCommand: "${ev.data?.command}" de ${ev.data?.user?.username ?? "?"}`;
      case "EmergencyCall":
        return `EmergencyCall de ${ev.data?.caller?.username ?? "?"}`;
      case "CustomCommand":
        return `CustomCommand: "${ev.data?.command}" de ${ev.data?.user?.username ?? "?"}`;
      default:
        return `evento: ${ev.event}`;
    }
  }
  return `raw: ${JSON.stringify(body)}`;
}

const handleWebhook = async (req, res) => {
  const timestamp = req.headers["x-signature-timestamp"];
  const sigHex = req.headers["x-signature-ed25519"];

  if (!timestamp || !sigHex) {
    logger.info("[Webhook] Probe recibido (sin firma)");
    return res.status(200).json({ status: "probe_ok" });
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    logger.error("[Webhook] rawBody no disponible - verifica middleware rawBodySaver");
    return res.status(500).json({ error: "Internal server error" });
  }

  const isValid = await verifyEd25519(timestamp, sigHex, rawBody);

  if (!isValid) {
    logger.warn("[Webhook] Firma invalida rechazada");
    return res.status(401).json({ error: "Invalid signature" });
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  await processEvent(body);

  res.status(200).json({ received: true });
};

async function processEvent(body) {
  if (!body.events?.length) return;

  for (const event of body.events) {
    switch (event.event) {
      case "WebhookProbe":
        logger.info("[Webhook] Probe procesado correctamente");
        break;
      case "ChatCommand":
        await handleChatCommand(event.data);
        break;
      case "EmergencyCall":
        await handleEmergencyCall(event.data);
        break;
      case "CustomCommand":
        await handleCustomCommand(event.data);
        break;
      default:
        logger.info({ event: event.event }, "[Webhook] Evento sin handler especifico");
        break;
    }
  }
}

async function handleChatCommand(data) {
  const { command, user } = data;
  logger.info({ command, user: user?.username }, "[Webhook] ChatCommand recibido");
}

async function handleEmergencyCall(data) {
  const { caller } = data;
  logger.info({ caller: caller?.username }, "[Webhook] EmergencyCall recibido");
}

async function handleCustomCommand(data) {
  const { command, argument } = data;
  const logEntry = {
    type: "CustomCommand",
    command,
    argument: argument ?? "",
    fullCommand: `;${command} ${argument ?? ""}`.trim(),
  };
  logger.info(logEntry, "[Webhook] CustomCommand recibido");
  addLog(logEntry);
}

module.exports = {
  handleWebhook,
  initWebhookKey,
};
