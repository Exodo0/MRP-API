const express = require("express");
const router  = express.Router();
const {
  listAuditLogs,
  listCategorias,
  createCategoria,
  updateCategoria,
  toggleCategoria,
  deleteCategoria,
  reorderCategorias,
  listItems,
  uploadItemImage,
  createItem,
  updateItem,
  toggleItem,
  deleteItem,
} = require("../../controllers/marketController");

router.get   ("/audit-logs",             listAuditLogs);
router.get   ("/categorias",             listCategorias);
router.post  ("/categorias",             createCategoria);
router.post  ("/categorias/reorder",     reorderCategorias);
router.put   ("/categorias/:id",         updateCategoria);
router.patch ("/categorias/:id/toggle",  toggleCategoria);
router.delete("/categorias/:id",         deleteCategoria);

router.get   ("/items",                  listItems);
router.post  ("/uploads/item-image",     express.raw({ type: ["image/webp", "application/octet-stream"], limit: "10mb" }), uploadItemImage);
router.post  ("/items",                  createItem);
router.put   ("/items/:id",              updateItem);
router.patch ("/items/:id/toggle",       toggleItem);
router.delete("/items/:id",              deleteItem);

module.exports = router;
