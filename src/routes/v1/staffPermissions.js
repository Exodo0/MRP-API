const express = require("express");
const {
  listGroups,
  listGroupRoles,
  createGroup,
  updateGroup,
  deleteGroup,
  listHistory,
} = require("../../controllers/staffPermissionsController");

const router = express.Router();
router.get("/groups", listGroups);
router.post("/groups", createGroup);
router.get("/groups/:group/roles", listGroupRoles);
router.put("/groups/:group", updateGroup);
router.delete("/groups/:group", deleteGroup);
router.get("/history", listHistory);

module.exports = router;
