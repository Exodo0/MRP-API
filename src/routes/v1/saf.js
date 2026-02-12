const express = require('express');
const router = express.Router();
const { updateLicense } = require('../../controllers/licenseController');

router.post('/licenses', updateLicense);

module.exports = router;
