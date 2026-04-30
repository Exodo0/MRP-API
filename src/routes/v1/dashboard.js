const express = require("express");
const router = express.Router();
const dashboardAuth = require("../../middleware/dashboardAuth");
const {
  getMe,
  getEconomy,
  lavarDinero,
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
  comprarItem,
} = require("../../controllers/dashboardController");

// Todas las rutas requieren autenticación del dashboard
router.use(dashboardAuth);

// Usuario completo
router.get("/me", getMe);

// Economía
router.get("/economy", getEconomy);
router.post("/economy/lavar", lavarDinero);

// Licencias
router.get("/licencias", getLicencias);

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

// Viviendas
router.get("/viviendas", getViviendas);
router.put("/viviendas/:id/almacen", updateViviendaAlmacen);

// Tienda
router.get("/tienda", getTienda);
router.post("/tienda/comprar", comprarItem);

module.exports = router;
