const groupService = require('../services/groupService');

function requireGroupMember(req, res, next) {
  try {
    req.membership = groupService.assertMember(req.params.id, req.user.id);
    next();
  } catch (err) {
    next(err);
  }
}

function requireGroupAdmin(req, res, next) {
  try {
    req.membership = groupService.assertAdmin(req.params.id, req.user.id);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireGroupMember, requireGroupAdmin };