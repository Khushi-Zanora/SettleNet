const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const { validate, validateIdParams } = require('../middleware/validationMiddleware');
const { requireGroupMember, requireGroupAdmin } = require('../middleware/groupAccessMiddleware');
const { idempotency } = require('../middleware/idempotencyMiddleware');
const { createGroupRules, addMemberRules } = require('../utils/validators');
const groupController = require('../controllers/groupController');

const router = express.Router();

// Every group route needs a logged-in user.
router.use(authenticate);

router.post('/', validate(createGroupRules), idempotency(), groupController.createGroup);
router.get('/', groupController.listGroups);

router.get('/:id', validateIdParams('id'), requireGroupMember, groupController.getGroup);

router.post(
  '/:id/members',
  validateIdParams('id'),
  requireGroupAdmin,
  validate(addMemberRules),
  groupController.addMember
);

// requireGroupMember (not Admin) because members may remove themselves;
// the service enforces "admin only" when removing someone else.
router.delete(
  '/:id/members/:userId',
  validateIdParams('id', 'userId'),
  requireGroupMember,
  groupController.removeMember
);

module.exports = router;