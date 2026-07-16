const express = require("express");
const router = express.Router();
const dashboardAuth = require("../../middleware/dashboardAuth");
const dashboardEconomyAuth = require("../../middleware/dashboardEconomyAuth");
const {
  createStoreOrder,
  getStoreOrder,
} = require("../../controllers/storeOrderController");
const {
  launder,
  operateLicense,
  payDebt,
} = require("../../controllers/dashboardEconomyController");
const {
  registerVehicle,
} = require("../../controllers/vehicleRegistrationController");
const { getMarket, trade } = require("../../controllers/fxEconomyController");
const {
  getMe,
  getEconomy,
  getLicencias,
  getArresto,
  getGulag,
  getVerificacion,
  getInventario,
  getVehiculos,
  getVehiculoMultas,
  getViviendas,
  updateViviendaAlmacen,
  getTienda,
} = require("../../controllers/dashboardController");

// Todas las rutas requieren autenticación del dashboard
router.use(dashboardAuth);

// Usuario completo
router.get("/me", getMe);

// Economía
router.get("/economy", getEconomy);
router.post("/economy/lavar", dashboardEconomyAuth, launder);
router.post("/economy/launder", dashboardEconomyAuth, launder);
router.post("/economy/debt/pay", dashboardEconomyAuth, payDebt);
router.get("/economy/fx/market", dashboardEconomyAuth, getMarket);
router.post("/economy/fx/trade", dashboardEconomyAuth, trade);

// Licencias
router.get("/licencias", getLicencias);
router.post("/licencias/operate", dashboardEconomyAuth, operateLicense);

// Arrestos y antecedentes
router.get("/arresto", getArresto);

// Gulag
router.get("/gulag", getGulag);

// Verificación
router.get("/verificacion", getVerificacion);

// Inventario
router.get("/inventario", getInventario);

// Vehículos
router.get("/vehiculos", getVehiculos);
router.get("/vehiculos/:id/multas", getVehiculoMultas);
router.post("/vehiculos/register", dashboardEconomyAuth, registerVehicle);

// Viviendas
router.get("/viviendas", getViviendas);
router.put("/viviendas/:id/almacen", updateViviendaAlmacen);

// Tienda
router.get("/tienda", getTienda);
router.post("/tienda/comprar", dashboardEconomyAuth, createStoreOrder);
router.post("/store/orders", dashboardEconomyAuth, createStoreOrder);
router.get("/store/orders/:orderId", dashboardEconomyAuth, getStoreOrder);

module.exports = router;
