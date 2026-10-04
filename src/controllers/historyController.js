const historyService = require('../services/historyService');
const exportService = require('../services/exportService');

const getHistory = (req, res) => {
  const limit = req.query.limit !== undefined ? Number(req.query.limit) : 50;
  const offset = req.query.offset !== undefined ? Number(req.query.offset) : 0;
  const action = req.query.action || null;
  res.json({ data: historyService.getHistory(req.params.id, { limit, offset, action }) });
};

const exportStatement = (req, res) => {
  const section = req.query.section || 'all';
  const { filename, csv } = exportService.buildStatement({
    groupId: req.params.id,
    user: req.user,
    section,
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store'); // financial data: do not let caches keep it
  res.send(csv);
};

module.exports = { getHistory, exportStatement };