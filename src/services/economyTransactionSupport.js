class MongoTransactionsUnavailableError extends Error {
  constructor(message = "MongoDB no ofrece transacciones en esta conexión") {
    super(message);
    this.name = "MongoTransactionsUnavailableError";
    this.code = "MONGO_TRANSACTIONS_UNAVAILABLE";
  }
}

async function assertMongoTransactionsSupported(connection) {
  if (!connection || connection.readyState !== 1 || !connection.db) {
    throw new MongoTransactionsUnavailableError(
      "MongoDB económico no está conectado",
    );
  }
  let topology;
  try {
    topology = await connection.db.admin().command({ hello: 1 });
  } catch (error) {
    throw new MongoTransactionsUnavailableError(
      `No se pudo verificar el soporte transaccional: ${error?.code ?? "UNKNOWN"}`,
    );
  }
  const replicaSet =
    typeof topology?.setName === "string" && topology.setName.length > 0;
  const mongos = topology?.msg === "isdbgrid";
  if (!replicaSet && !mongos) {
    throw new MongoTransactionsUnavailableError(
      "MongoDB debe ejecutarse como replica set o mediante mongos",
    );
  }
  return { topology: mongos ? "mongos" : "replica_set" };
}

module.exports = {
  MongoTransactionsUnavailableError,
  assertMongoTransactionsSupported,
};
