const express = require("express");
const requireStaffGroup = require("../../middleware/requireStaffGroup");
const { refundStoreOrder } = require("../../controllers/storeRefundController");

const router = express.Router();
router.use(requireStaffGroup("store_refund"));
router.post("/orders/:orderId/refunds", refundStoreOrder);

module.exports = router;
