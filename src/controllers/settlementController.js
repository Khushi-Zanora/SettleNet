const balanceService = require('../services/balanceService');
const settlementService = require('../services/settlementService');

const getBalances = (req, res) => {
  res.json({ data: balanceService.getGroupBalances(req.params.id) });
};

const getSettlementPlan = (req, res) => {
  res.json({ data: settlementService.generatePlan(req.params.id, req.user.id) });
};

const recordSettlement = (req, res) => {
  const actor = { id: req.user.id, role: req.membership.role };
  const settlement = settlementService.recordSettlement(req.params.id, actor, req.body);
  res.status(201).json({ data: { settlement } });
};

const listSettlements = (req, res) => {
  res.json({ data: { settlements: settlementService.listSettlements(req.params.id) } });
};

module.exports = { getBalances, getSettlementPlan, recordSettlement, listSettlements };