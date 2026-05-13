const MAX_LOGS = 100;
const logs = [];
const listeners = new Set();

function addLog(entry) {
  const logEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  logs.unshift(logEntry);
  if (logs.length > MAX_LOGS) logs.pop();

  for (const listener of listeners) {
    listener.write(`data: ${JSON.stringify(logEntry)}\n\n`);
  }
}

function getLogs() {
  return [...logs];
}

function addSSEListener(res) {
  listeners.add(res);
  res.on("close", () => listeners.delete(res));
}

module.exports = { addLog, getLogs, addSSEListener };
