const expenseService = require('../services/expenseService');

const createExpense = (req, res) => {
  const expense = expenseService.createExpense(req.params.id, req.user.id, req.body);
  res.status(201).json({ data: { expense } });
};

const listExpenses = (req, res) => {
  const limit = req.query.limit !== undefined ? Number(req.query.limit) : 50;
  const offset = req.query.offset !== undefined ? Number(req.query.offset) : 0;
  res.json({ data: expenseService.listExpenses(req.params.id, { limit, offset }) });
};

const getExpense = (req, res) => {
  res.json({ data: { expense: expenseService.getExpense(req.params.id, req.user.id) } });
};

const updateExpense = (req, res) => {
  const expense = expenseService.updateExpense(req.params.id, req.user.id, req.body);
  res.json({ data: { expense } });
};

const deleteExpense = (req, res) => {
  expenseService.deleteExpense(req.params.id, req.user.id);
  res.json({ data: { message: 'Expense deleted' } });
};

module.exports = { createExpense, listExpenses, getExpense, updateExpense, deleteExpense };