const express = require("express");
const apiKeyAuth = require("../../middleware/auth");
const cliAuth = require("../../middleware/cliAuth");
const { startLogin, discordCallback, loginStatus, refresh, logout, me } = require("../../controllers/cliAuthController");

const router = express.Router();
router.post("/start", apiKeyAuth, startLogin);
router.get("/callback", discordCallback);
router.get("/status/:loginId", apiKeyAuth, loginStatus);
router.post("/refresh", apiKeyAuth, refresh);
router.post("/logout", apiKeyAuth, logout);
router.get("/me", apiKeyAuth, cliAuth, me);

module.exports = router;
