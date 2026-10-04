const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { validate, validateIdParams } = require('../middleware/validationMiddleware');
const { requireGroupMember } = require('../middleware/groupAccessMiddleware');
const { historyQueryRules, exportQueryRules } = require('../utils/validators');
const historyController = require('../controllers/historyController');

const router = express.Router();

router.get(
  '/groups/:id/history',
  authenticate, validateIdParams('id'), requireGroupMember,
  validate(historyQueryRules),
  historyController.getHistory
);

router.get(
  '/groups/:id/export',
  authenticate, validateIdParams('id'), requireGroupMember,
  validate(exportQueryRules),
  historyController.exportStatement
);

module.exports = router;