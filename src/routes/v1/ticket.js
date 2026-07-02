const express = require("express");
const router = express.Router();
const {
  listTickets,
  getTicketStats,
  getTicketSetup,
  getTicketCategories,
  getTicketHistory,
  closeTicket,
  unclaimTicket,
  deleteTicket,
  bulkDeleteTickets,
} = require("../../controllers/ticketController");

router.get("/", listTickets);
router.get("/stats", getTicketStats);
router.get("/setup", getTicketSetup);
router.get("/categories", getTicketCategories);
router.get("/:id", getTicketHistory);
router.post("/:channelId/close", closeTicket);
router.post("/:channelId/unclaim", unclaimTicket);
router.delete("/bulk", bulkDeleteTickets);
router.delete("/:id", deleteTicket);

module.exports = router;
