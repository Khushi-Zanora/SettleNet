const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { validate, validateIdParams } = require('../middleware/validationMiddleware');
const { requireGroupMember } = require('../middleware/groupAccessMiddleware');
const { idempotency } = require('../middleware/idempotencyMiddleware');
const { recordSettlementRules } = require('../utils/validators');
const settlementController = require('../controllers/settlementController');

const router = express.Router();

router.get(
  '/groups/:id/balances',
  authenticate, validateIdParams('id'), requireGroupMember,
  settlementController.getBalances
);

router.get(
  '/groups/:id/settlement',
  authenticate, validateIdParams('id'), requireGroupMember,
  settlementController.getSettlementPlan
);

router.get(
  '/groups/:id/settlements',
  authenticate, validateIdParams('id'), requireGroupMember,
  settlementController.listSettlements
);

router.post(
  '/groups/:id/settlements',
  authenticate, validateIdParams('id'), requireGroupMember,
  validate(recordSettlementRules),
  idempotency(),
  settlementController.recordSettlement
);

module.exports = router;