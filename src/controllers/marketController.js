const Joi        = require("joi");
const mongoose   = require("mongoose");
const Categoria  = require("../models/Categoria");
const Item       = require("../models/Item");
const logger     = require("../logger");

const GUILD_ID = process.env.GUILD_ID;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// ─── Schemas de validación ────────────────────────────────────────────────────

const categoriaCreateSchema = Joi.object({
  Nombre:      Joi.string().trim().max(64).required(),
  Descripcion: Joi.string().trim().max(256).allow("").default(""),
  Emoji:       Joi.string().trim().max(8).default("🛒"),
  Orden:       Joi.number().integer().min(0).optional(),
  Activa:      Joi.boolean().default(true),
});

const categoriaUpdateSchema = Joi.object({
  Nombre:      Joi.string().trim().max(64).optional(),
  Descripcion: Joi.string().trim().max(256).allow("").optional(),
  Emoji:       Joi.string().trim().max(8).optional(),
  Orden:       Joi.number().integer().min(0).optional(),
  Activa:      Joi.boolean().optional(),
}).min(1);

const itemCreateSchema = Joi.object({
  CategoriaId:      Joi.string().required(),
  Nombre:           Joi.string().trim().max(128).required(),
  Descripcion:      Joi.string().trim().max(1024).allow("").default(""),
  Precio:           Joi.number().min(0).required(),
  Descuento:        Joi.number().min(0).max(100).default(0),
  Stock:            Joi.number().integer().min(-1).default(-1),
  LimitePorUsuario: Joi.number().integer().min(0).default(0),
  RolId:            Joi.string().allow(null, "").default(null),
  ImagenURL:        Joi.string().uri().allow(null, "").default(null),
  Activo:           Joi.boolean().default(true),
});

const itemUpdateSchema = Joi.object({
  CategoriaId:      Joi.string().optional(),
  Nombre:           Joi.string().trim().max(128).optional(),
  Descripcion:      Joi.string().trim().max(1024).allow("").optional(),
  Precio:           Joi.number().min(0).optional(),
  Descuento:        Joi.number().min(0).max(100).optional(),
  Stock:            Joi.number().integer().min(-1).optional(),
  LimitePorUsuario: Joi.number().integer().min(0).optional(),
  RolId:            Joi.string().allow(null, "").optional(),
  ImagenURL:        Joi.string().uri().allow(null, "").optional(),
  Activo:           Joi.boolean().optional(),
}).min(1);

const reorderSchema = Joi.array()
  .items(Joi.string().required())
  .min(1)
  .required();

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORÍAS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /v1/market/categorias */
const listCategorias = async (req, res) => {
  try {
    const { activa } = req.query;
    const query = { GuildId: GUILD_ID };
    if (activa !== undefined) query.Activa = activa === "true";

    const cats = await Categoria.find(query).sort({ Orden: 1 }).lean();
    return res.json(cats);
  } catch (err) {
    logger.error({ err }, "listCategorias error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/** POST /v1/market/categorias */
const createCategoria = async (req, res) => {
  const { error, value } = categoriaCreateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    // Si no se pasó Orden, ponerla al final
    if (value.Orden === undefined) {
      const total = await Categoria.countDocuments({ GuildId: GUILD_ID });
      value.Orden = total;
    }

    const cat = await Categoria.create({ ...value, GuildId: GUILD_ID });
    logger.info({ id: cat._id, nombre: cat.Nombre }, "Categoria created");
    return res.status(201).json(cat.toObject());
  } catch (err) {
    logger.error({ err }, "createCategoria error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/** PUT /v1/market/categorias/:id */
const updateCategoria = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid categoria ID" });

  const { error, value } = categoriaUpdateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const cat = await Categoria.findOneAndUpdate(
      { _id: id, GuildId: GUILD_ID },
      { $set: value },
      { new: true, lean: true }
    );
    if (!cat) return res.status(404).json({ error: "Categoria not found" });

    logger.info({ id }, "Categoria updated");
    return res.json(cat);
  } catch (err) {
    logger.error({ err }, "updateCategoria error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/** PATCH /v1/market/categorias/:id/toggle */
const toggleCategoria = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid categoria ID" });

  try {
    const cat = await Categoria.findOne({ _id: id, GuildId: GUILD_ID }).lean();
    if (!cat) return res.status(404).json({ error: "Categoria not found" });

    const updated = await Categoria.findByIdAndUpdate(
      id,
      { $set: { Activa: !cat.Activa } },
      { new: true, lean: true }
    );

    logger.info({ id, activa: updated.Activa }, "Categoria toggled");
    return res.json(updated);
  } catch (err) {
    logger.error({ err }, "toggleCategoria error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/** DELETE /v1/market/categorias/:id */
const deleteCategoria = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid categoria ID" });

  try {
    const cat = await Categoria.findOne({ _id: id, GuildId: GUILD_ID }).lean();
    if (!cat) return res.status(404).json({ error: "Categoria not found" });

    const deletedItems = await Item.countDocuments({ CategoriaId: id, GuildId: GUILD_ID });
    await Item.deleteMany({ CategoriaId: id, GuildId: GUILD_ID });
    await Categoria.findByIdAndDelete(id);

    logger.info({ id, deletedItems }, "Categoria deleted");
    return res.json({ ok: true, deletedItems });
  } catch (err) {
    logger.error({ err }, "deleteCategoria error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/** POST /v1/market/categorias/reorder — body: ["id1","id2","id3",...] */
const reorderCategorias = async (req, res) => {
  const { error, value: orderedIds } = reorderSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const updates = orderedIds.map((id, idx) => {
      if (!isValidObjectId(id)) throw new Error(`Invalid ID: ${id}`);
      return Categoria.findOneAndUpdate(
        { _id: id, GuildId: GUILD_ID },
        { $set: { Orden: idx } }
      );
    });

    await Promise.all(updates);
    logger.info({ count: orderedIds.length }, "Categorias reordered");
    return res.json({ ok: true });
  } catch (err) {
    if (err.message?.startsWith("Invalid ID")) {
      return res.status(400).json({ error: err.message });
    }
    logger.error({ err }, "reorderCategorias error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ITEMS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /v1/market/items?categoriaId=&activo= */
const listItems = async (req, res) => {
  try {
    const query = { GuildId: GUILD_ID };
    if (req.query.categoriaId) {
      if (!isValidObjectId(req.query.categoriaId)) {
        return res.status(400).json({ error: "Invalid categoriaId" });
      }
      query.CategoriaId = req.query.categoriaId;
    }
    if (req.query.activo !== undefined) {
      query.Activo = req.query.activo === "true";
    }

    const items = await Item.find(query).sort({ CategoriaNombre: 1, Nombre: 1 }).lean();
    return res.json(items);
  } catch (err) {
    logger.error({ err }, "listItems error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/** POST /v1/market/items */
const createItem = async (req, res) => {
  const { error, value } = itemCreateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  if (!isValidObjectId(value.CategoriaId)) {
    return res.status(400).json({ error: "Invalid CategoriaId" });
  }

  try {
    const cat = await Categoria.findOne({ _id: value.CategoriaId, GuildId: GUILD_ID }).lean();
    if (!cat) return res.status(404).json({ error: "Categoria not found" });

    const item = await Item.create({
      ...value,
      GuildId:        GUILD_ID,
      CategoriaNombre: cat.Nombre,
      RolId:           value.RolId || null,
      ImagenURL:       value.ImagenURL || null,
    });

    logger.info({ id: item._id, nombre: item.Nombre }, "Item created");
    return res.status(201).json(item.toObject());
  } catch (err) {
    logger.error({ err }, "createItem error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/** PUT /v1/market/items/:id */
const updateItem = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid item ID" });

  const { error, value } = itemUpdateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const existing = await Item.findOne({ _id: id, GuildId: GUILD_ID }).lean();
    if (!existing) return res.status(404).json({ error: "Item not found" });

    // Si cambia de categoría, actualizar CategoriaNombre
    if (value.CategoriaId && value.CategoriaId !== existing.CategoriaId?.toString()) {
      if (!isValidObjectId(value.CategoriaId)) {
        return res.status(400).json({ error: "Invalid CategoriaId" });
      }
      const newCat = await Categoria.findOne({ _id: value.CategoriaId, GuildId: GUILD_ID }).lean();
      if (!newCat) return res.status(404).json({ error: "New Categoria not found" });
      value.CategoriaNombre = newCat.Nombre;
    }

    const updated = await Item.findByIdAndUpdate(
      id,
      { $set: value },
      { new: true, lean: true }
    );

    logger.info({ id }, "Item updated");
    return res.json(updated);
  } catch (err) {
    logger.error({ err }, "updateItem error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/** PATCH /v1/market/items/:id/toggle */
const toggleItem = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid item ID" });

  try {
    const item = await Item.findOne({ _id: id, GuildId: GUILD_ID }).lean();
    if (!item) return res.status(404).json({ error: "Item not found" });

    const updated = await Item.findByIdAndUpdate(
      id,
      { $set: { Activo: !item.Activo } },
      { new: true, lean: true }
    );

    logger.info({ id, activo: updated.Activo }, "Item toggled");
    return res.json(updated);
  } catch (err) {
    logger.error({ err }, "toggleItem error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

/** DELETE /v1/market/items/:id */
const deleteItem = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid item ID" });

  try {
    const item = await Item.findOne({ _id: id, GuildId: GUILD_ID }).lean();
    if (!item) return res.status(404).json({ error: "Item not found" });

    await Item.findByIdAndDelete(id);
    logger.info({ id }, "Item deleted");
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "deleteItem error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  // Categorías
  listCategorias,
  createCategoria,
  updateCategoria,
  toggleCategoria,
  deleteCategoria,
  reorderCategorias,
  // Items
  listItems,
  createItem,
  updateItem,
  toggleItem,
  deleteItem,
};
