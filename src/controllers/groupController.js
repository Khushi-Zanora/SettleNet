const groupService = require('../services/groupService');

const createGroup = (req, res) => {
  const group = groupService.createGroup(req.user.id, req.body);
  res.status(201).json({ data: { group } });
};

const listGroups = (req, res) => {
  res.json({ data: groupService.listGroups(req.user.id) });
};

const getGroup = (req, res) => {
  res.json({ data: { group: groupService.getGroupDetails(req.params.id, req.user.id) } });
};

const addMember = (req, res) => {
  const member = groupService.addMember(req.params.id, req.user.id, req.body.email);
  res.status(201).json({ data: { member } });
};

const removeMember = (req, res) => {
  const actor = { id: req.user.id, role: req.membership.role };
  groupService.removeMember(req.params.id, actor, req.params.userId);
  res.json({ data: { message: 'Member removed' } });
};

module.exports = { createGroup, listGroups, getGroup, addMember, removeMember };