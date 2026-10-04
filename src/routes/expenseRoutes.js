const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { validate, validateIdParams } = require('../middleware/validationMiddleware');
const { requireGroupMember } = require('../middleware/groupAccessMiddleware');
const { expenseRules, listExpensesQueryRules } = require('../utils/validators');
const expenseController = require('../controllers/expenseController');

const router = express.Router();

router.post(
  '/groups/:id/expenses',
  authenticate,
  validateIdParams('id'),
  requireGroupMember,
  validate(expenseRules),
  expenseController.createExpense
);

router.get(
  '/groups/:id/expenses',
  authenticate,
  validateIdParams('id'),
  requireGroupMember,
  validate(listExpensesQueryRules),
  expenseController.listExpenses
);

router.get('/expenses/:id', authenticate, validateIdParams('id'), expenseController.getExpense);

router.put(
  '/expenses/:id',
  authenticate,
  validateIdParams('id'),
  validate(expenseRules),
  expenseController.updateExpense
);

router.delete('/expenses/:id', authenticate, validateIdParams('id'), expenseController.deleteExpense);

module.exports = router;