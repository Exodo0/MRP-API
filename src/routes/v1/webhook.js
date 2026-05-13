const express = require("express");
const router = express.Router();
const { handleWebhook } = require("../../controllers/webhookController");
const { getLogs, addSSEListener } = require("../../services/logBuffer");

router.post("/", handleWebhook);

router.get("/logs-stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  for (const log of getLogs().reverse()) {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  }

  addSSEListener(res);
});

module.exports = router;
