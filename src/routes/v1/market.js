const express = require("express");
const router  = express.Router();
const {
  listCategorias,
  createCategoria,
  updateCategoria,
  toggleCategoria,
  deleteCategoria,
  reorderCategorias,
  listItems,
  createItem,
  updateItem,
  toggleItem,
  deleteItem,
} = require("../../controllers/marketController");

// ── Categorías ────────────────────────────────────────────────────────────────
router.get   ("/categorias",             listCategorias);
router.post  ("/categorias",             createCategoria);
router.post  ("/categorias/reorder",     reorderCategorias);   // antes de /:id
router.put   ("/categorias/:id",         updateCategoria);
router.patch ("/categorias/:id/toggle",  toggleCategoria);
router.delete("/categorias/:id",         deleteCategoria);

// ── Items ─────────────────────────────────────────────────────────────────────
router.get   ("/items",            listItems);
router.post  ("/items",            createItem);
router.put   ("/items/:id",        updateItem);
router.patch ("/items/:id/toggle", toggleItem);
router.delete("/items/:id",        deleteItem);

module.exports = router;
