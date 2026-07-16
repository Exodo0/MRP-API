const express = require("express");
const router = express.Router();
const {
  getIdentity,
  getDigitalLicense,
} = require("../../controllers/licenseController");
const {
  issueDigitalLicense,
  updateLicense,
} = require("../../controllers/semoviEconomyController");
const cliAuth = require("../../middleware/cliAuth");
const requireStaffGroup = require("../../middleware/requireStaffGroup");

router.get("/identity/:userId", getIdentity);
router.get("/digital-licenses/:userId", getDigitalLicense);
router.post(
  "/digital-licenses",
  cliAuth,
  requireStaffGroup("semovi_license"),
  issueDigitalLicense,
);
router.post(
  "/licenses",
  cliAuth,
  requireStaffGroup("semovi_license"),
  updateLicense,
);

module.exports = router;
