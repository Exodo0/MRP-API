const AuditLog = require("../models/AuditLog");
const logger = require("../logger");

function pickEntityName(entityType, snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "";
  if (entityType === "categoria") return snapshot.Nombre || "";
  if (entityType === "item") return snapshot.Nombre || "";
  return "";
}

async function writeAuditLog({
  guildId,
  entityType,
  entityId,
  action,
  actor,
  before = null,
  after = null,
  metadata = null,
}) {
  try {
    await AuditLog.create({
      GuildId: guildId,
      entityType,
      entityId: String(entityId),
      entityName: pickEntityName(entityType, after || before),
      action,
      actor: {
        username: actor?.username || null,
        source: actor?.source || "unknown",
        apiKeyOwner: actor?.apiKeyOwner || null,
        ip: actor?.ip || null,
      },
      before,
      after,
      metadata,
    });
  } catch (err) {
    logger.error({ err, entityType, entityId, action }, "Audit log write failed");
  }
}

module.exports = { writeAuditLog };
