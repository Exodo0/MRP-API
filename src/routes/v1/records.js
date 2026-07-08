const express = require("express");
const router = express.Router();
const {
  getUserRecord,
  getUserMultas,
  getUserArrestos,
  getUserAntecedentes,
} = require("../../controllers/recordsController");

router.get("/:userId", getUserRecord);
router.get("/:userId/multas", getUserMultas);
router.get("/:userId/arrestos", getUserArrestos);
router.get("/:userId/antecedentes", getUserAntecedentes);

module.exports = router;
