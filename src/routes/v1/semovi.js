const express = require('express');
const router = express.Router();
const {
  getIdentity,
  getDigitalLicense,
  issueDigitalLicense,
  updateLicense,
} = require('../../controllers/licenseController');

router.get('/identity/:userId', getIdentity);
router.get('/digital-licenses/:userId', getDigitalLicense);
router.post('/digital-licenses', issueDigitalLicense);
router.post('/licenses', updateLicense);

module.exports = router;
