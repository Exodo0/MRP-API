const express = require("express");
const router = express.Router();
const {
  createApiKey,
  listApiKeys,
  toggleApiKey,
  deleteApiKey,
  createUser,
  listUsers,
  toggleUser,
  deleteUser,
} = require("../../controllers/adminController");

// API Keys
router.post("/keys", createApiKey);
router.get("/keys", listApiKeys);
router.patch("/keys/:id/toggle", toggleApiKey);
router.delete("/keys/:id", deleteApiKey);

// Users
router.post("/users", createUser);
router.get("/users", listUsers);
router.patch("/users/:id/toggle", toggleUser);
router.delete("/users/:id", deleteUser);

module.exports = router;
