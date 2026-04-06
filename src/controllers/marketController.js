const Joi        = require("joi");
const mongoose   = require("mongoose");
const Categoria  = require("../models/Categoria");
const Item       = require("../models/Item");
const logger     = require("../logger");
const { uploadMarketImage } = require("../services/marketImageService");

function getGuildId() {
  const id = process.env.GUILD_ID;
  if (!id) throw new Error("GUILD_ID env var is not set - add it with: fly secrets set GUILD_ID=...");
  return id;
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function handleEnvError(err, res) {
  if (err.message?.includes("GUILD_ID env var")) {
    logger.error(err.message);
    return res.status(503).json({ error: "Server misconfiguration: GUILD_ID not set" });
  }
  return null;
}

const categoriaCreateSchema = Joi.object({
  Nombre: Joi.string().trim().max(64).required(),
  Descripcion: Joi.string().trim().max(256).allow("").default(""),
  Emoji: Joi.string().trim().max(8).default("🛒"),
  Orden: Joi.number().integer().min(0).optional(),
  Activa: Joi.boolean().default(true),
});

const categoriaUpdateSchema = Joi.object({
  Nombre: Joi.string().trim().max(64).optional(),
  Descripcion: Joi.string().trim().max(256).allow("").optional(),
  Emoji: Joi.string().trim().max(8).optional(),
  Orden: Joi.number().integer().min(0).optional(),
  Activa: Joi.boolean().optional(),
}).min(1);

const itemCreateSchema = Joi.object({
  CategoriaId: Joi.string().required(),
  Nombre: Joi.string().trim().max(128).required(),
  Descripcion: Joi.string().trim().max(1024).allow("").default(""),
  Precio: Joi.number().min(0).required(),
  Descuento: Joi.number().min(0).max(100).default(0),
  Stock: Joi.number().integer().min(-1).default(-1),
  LimitePorUsuario: Joi.number().integer().min(0).default(0),
  RolId: Joi.string().allow(null, "").default(null),
  ImagenURL: Joi.string().uri().allow(null, "").default(null),
  Activo: Joi.boolean().default(true),
});

const itemUpdateSchema = Joi.object({
  CategoriaId: Joi.string().optional(),
  Nombre: Joi.string().trim().max(128).optional(),
  Descripcion: Joi.string().trim().max(1024).allow("").optional(),
  Precio: Joi.number().min(0).optional(),
  Descuento: Joi.number().min(0).max(100).optional(),
  Stock: Joi.number().integer().min(-1).optional(),
  LimitePorUsuario: Joi.number().integer().min(0).optional(),
  RolId: Joi.string().allow(null, "").optional(),
  ImagenURL: Joi.string().uri().allow(null, "").optional(),
  Activo: Joi.boolean().optional(),
}).min(1);

const reorderSchema = Joi.array()
  .items(Joi.string().required())
  .min(1)
  .required();

const uploadImageQuerySchema = Joi.object({
  categoriaId: Joi.string().required(),
});

const listCategorias = async (req, res) => {
  try {
    const GUILD_ID = getGuildId();
    const { activa } = req.query;
    const query = { GuildId: GUILD_ID };
    if (activa !== undefined) query.Activa = activa === "true";

    const cats = await Categoria.find(query).sort({ Orden: 1 }).lean();
    return res.json(cats);
  } catch (err) {
    if (handleEnvError(err, res)) return;
    logger.error({ err }, "listCategorias error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const createCategoria = async (req, res) => {
  const { error, value } = categoriaCreateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const GUILD_ID = getGuildId();

    if (value.Orden === undefined) {
      const total = await Categoria.countDocuments({ GuildId: GUILD_ID });
      value.Orden = total;
    }

    const cat = await Categoria.create({ ...value, GuildId: GUILD_ID });
    logger.info({ id: cat._id, nombre: cat.Nombre }, "Categoria created");
    return res.status(201).json(cat.toObject());
  } catch (err) {
    if (handleEnvError(err, res)) return;
    logger.error({ err }, "createCategoria error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const updateCategoria = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid categoria ID" });

  const { error, value } = categoriaUpdateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const GUILD_ID = getGuildId();
    const cat = await Categoria.findOneAndUpdate(
      { _id: id, GuildId: GUILD_ID },
      { $set: value },
      { new: true, lean: true }
    );
    if (!cat) return res.status(404).json({ error: "Categoria not found" });

    logger.info({ id }, "Categoria updated");
    return res.json(cat);
  } catch (err) {
    if (handleEnvError(err, res)) return;
    logger.error({ err }, "updateCategoria error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const toggleCategoria = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid categoria ID" });

  try {
    const GUILD_ID = getGuildId();
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
    if (handleEnvError(err, res)) return;
    logger.error({ err }, "toggleCategoria error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteCategoria = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid categoria ID" });

  try {
    const GUILD_ID = getGuildId();
    const cat = await Categoria.findOne({ _id: id, GuildId: GUILD_ID }).lean();
    if (!cat) return res.status(404).json({ error: "Categoria not found" });

    const deletedItems = await Item.countDocuments({ CategoriaId: id, GuildId: GUILD_ID });
    await Item.deleteMany({ CategoriaId: id, GuildId: GUILD_ID });
    await Categoria.findByIdAndDelete(id);

    logger.info({ id, deletedItems }, "Categoria deleted");
    return res.json({ ok: true, deletedItems });
  } catch (err) {
    if (handleEnvError(err, res)) return;
    logger.error({ err }, "deleteCategoria error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const reorderCategorias = async (req, res) => {
  const { error, value: orderedIds } = reorderSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const GUILD_ID = getGuildId();
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
    if (handleEnvError(err, res)) return;
    if (err.message?.startsWith("Invalid ID")) {
      return res.status(400).json({ error: err.message });
    }
    logger.error({ err }, "reorderCategorias error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const listItems = async (req, res) => {
  try {
    const GUILD_ID = getGuildId();
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
    if (handleEnvError(err, res)) return;
    logger.error({ err }, "listItems error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const uploadItemImage = async (req, res) => {
  const { error, value } = uploadImageQuerySchema.validate(req.query);
  if (error) return res.status(400).json({ error: error.message });

  if (!isValidObjectId(value.categoriaId)) {
    return res.status(400).json({ error: "Invalid CategoriaId" });
  }

  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error: "Image body is required" });
  }

  try {
    const GUILD_ID = getGuildId();
    const cat = await Categoria.findOne({ _id: value.categoriaId, GuildId: GUILD_ID }).lean();
    if (!cat) return res.status(404).json({ error: "Categoria not found" });

    const uploaded = await uploadMarketImage({
      categoryName: cat.Nombre,
      buffer: req.body,
      contentType: req.headers["content-type"] || "image/webp",
    });

    logger.info({ categoriaId: value.categoriaId, path: uploaded.path }, "Item image uploaded");
    return res.status(201).json(uploaded);
  } catch (err) {
    if (handleEnvError(err, res)) return;
    if (err.message?.includes("Supabase storage env vars")) {
      logger.error({ err }, "uploadItemImage misconfiguration");
      return res.status(503).json({ error: "Server misconfiguration: storage not set" });
    }
    logger.error({ err }, "uploadItemImage error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const createItem = async (req, res) => {
  const { error, value } = itemCreateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  if (!isValidObjectId(value.CategoriaId)) {
    return res.status(400).json({ error: "Invalid CategoriaId" });
  }

  try {
    const GUILD_ID = getGuildId();
    const cat = await Categoria.findOne({ _id: value.CategoriaId, GuildId: GUILD_ID }).lean();
    if (!cat) return res.status(404).json({ error: "Categoria not found" });

    const item = await Item.create({
      ...value,
      GuildId: GUILD_ID,
      CategoriaNombre: cat.Nombre,
      RolId: value.RolId || null,
      ImagenURL: value.ImagenURL || null,
    });

    logger.info({ id: item._id, nombre: item.Nombre }, "Item created");
    return res.status(201).json(item.toObject());
  } catch (err) {
    if (handleEnvError(err, res)) return;
    logger.error({ err }, "createItem error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const updateItem = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid item ID" });

  const { error, value } = itemUpdateSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const GUILD_ID = getGuildId();
    const existing = await Item.findOne({ _id: id, GuildId: GUILD_ID }).lean();
    if (!existing) return res.status(404).json({ error: "Item not found" });

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
    if (handleEnvError(err, res)) return;
    logger.error({ err }, "updateItem error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const toggleItem = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid item ID" });

  try {
    const GUILD_ID = getGuildId();
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
    if (handleEnvError(err, res)) return;
    logger.error({ err }, "toggleItem error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteItem = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid item ID" });

  try {
    const GUILD_ID = getGuildId();
    const item = await Item.findOne({ _id: id, GuildId: GUILD_ID }).lean();
    if (!item) return res.status(404).json({ error: "Item not found" });

    await Item.findByIdAndDelete(id);
    logger.info({ id }, "Item deleted");
    return res.json({ ok: true });
  } catch (err) {
    if (handleEnvError(err, res)) return;
    logger.error({ err }, "deleteItem error");
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
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
};
