const express = require("express");
const {
  listGroups,
  listGroupRoles,
  updateGroup,
  listHistory,
} = require("../../controllers/staffPermissionsController");

const router = express.Router();
router.get("/groups", listGroups);
router.get("/groups/:group/roles", listGroupRoles);
router.put("/groups/:group", updateGroup);
router.get("/history", listHistory);

module.exports = router;
