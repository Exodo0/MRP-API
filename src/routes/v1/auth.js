const express = require('express');
const router = express.Router();
const { login } = require('../../controllers/authController');

// POST /v1/auth/login  — público, sin x-api-key
router.post('/login', login);

module.exports = router;
