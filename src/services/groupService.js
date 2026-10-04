const db = require('../config/db');
const audit = require('./auditService');
const { conflict, forbidden, notFound } = require('../utils/errors');

// NOTE: "groups" is quoted everywhere because GROUPS is a reserved word in SQLite.
const findGroup = db.prepare('SELECT id, name, description, created_by, created_at FROM "groups" WHERE id = ?');
const insertGroup = db.prepare('INSERT INTO "groups" (name, description, created_by) VALUES (?, ?, ?)');

const findActiveMembership = db.prepare(
  'SELECT id, role FROM group_members WHERE group_id = ? AND user_id = ? AND removed_at IS NULL'
);
const findAnyMembership = db.prepare(
  'SELECT id, removed_at FROM group_members WHERE group_id = ? AND user_id = ?'
);
const insertMember = db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)');
const reactivateMember = db.prepare(
  "UPDATE group_members SET removed_at = NULL, role = 'member', joined_at = datetime('now') WHERE id = ?"
);
const softRemoveMember = db.prepare(
  "UPDATE group_members SET removed_at = datetime('now') WHERE id = ?"
);
const countActiveAdmins = db.prepare(
  "SELECT COUNT(*) AS n FROM group_members WHERE group_id = ? AND role = 'admin' AND removed_at IS NULL"
);

const findUserByEmail = db.prepare('SELECT id, name FROM users WHERE email = ?');

const listActiveMembers = db.prepare(`
  SELECT u.id, u.name, u.email, gm.role, gm.joined_at
  FROM group_members gm
  JOIN users u ON u.id = gm.user_id
  WHERE gm.group_id = ? AND gm.removed_at IS NULL
  ORDER BY gm.joined_at, gm.id
`);

// Former members are returned (without email) so the UI can still show names
// on old expenses that involve someone who has since left.
const listFormerMembers = db.prepare(`
  SELECT u.id, u.name, gm.removed_at
  FROM group_members gm
  JOIN users u ON u.id = gm.user_id
  WHERE gm.group_id = ? AND gm.removed_at IS NOT NULL
  ORDER BY gm.removed_at
`);

const listGroupsForUser = db.prepare(`
  SELECT g.id, g.name, g.description, g.created_at, gm.role AS my_role,
         (SELECT COUNT(*) FROM group_members m
           WHERE m.group_id = g.id AND m.removed_at IS NULL) AS member_count
  FROM "groups" g
  JOIN group_members gm
    ON gm.group_id = g.id AND gm.user_id = ? AND gm.removed_at IS NULL
  ORDER BY g.created_at DESC, g.id DESC
`);

const memberById = db.prepare(`
  SELECT u.id, u.name, u.email, gm.role, gm.joined_at
  FROM group_members gm JOIN users u ON u.id = gm.user_id
  WHERE gm.id = ?
`);

/*
 * Net balance of one user in one group, in paise.
 *   + paid for expenses     (they fronted money)
 *   - their share of every expense
 *   + settlements they paid (reduces what they owe)
 *   - settlements they received
 * Positive = group owes them. Negative = they owe the group. Zero = settled.
 * Used only to block removing someone who is not settled up. Part 5 adds the
 * full balance service, which will replace this query so there is one source of truth.
 */
const netBalanceStmt = db.prepare(`
  SELECT
    (SELECT COALESCE(SUM(amount_minor), 0) FROM expenses WHERE group_id = @g AND paid_by = @u)
  - (SELECT COALESCE(SUM(es.share_minor), 0)
       FROM expense_splits es JOIN expenses e ON e.id = es.expense_id
      WHERE e.group_id = @g AND es.user_id = @u)
  + (SELECT COALESCE(SUM(amount_minor), 0) FROM settlements WHERE group_id = @g AND from_user = @u)
  - (SELECT COALESCE(SUM(amount_minor), 0) FROM settlements WHERE group_id = @g AND to_user = @u)
    AS net
`);

function getNetBalanceMinor(groupId, userId) {
  return netBalanceStmt.get({ g: groupId, u: userId }).net;
}

// ---- Authorization checks (reused by middleware and by later services) ----

// 404 if the group does not exist, 403 if the user is not an active member.
// Returns { id, role } of the membership.
function assertMember(groupId, userId) {
  if (!findGroup.get(groupId)) throw notFound('Group not found');
  const membership = findActiveMembership.get(groupId, userId);
  if (!membership) throw forbidden('You are not a member of this group');
  return membership;
}

function assertAdmin(groupId, userId) {
  const membership = assertMember(groupId, userId);
  if (membership.role !== 'admin') throw forbidden('Only a group admin can do this');
  return membership;
}

// ---- Use cases ----

function getGroupDetails(groupId, userId) {
  const group = findGroup.get(groupId);
  const members = listActiveMembers.all(groupId);
  const me = members.find((m) => m.id === userId);
  return {
    ...group,
    my_role: me ? me.role : null,
    members,
    former_members: listFormerMembers.all(groupId),
  };
}

function createGroup(userId, { name, description }) {
  const cleanDescription = typeof description === 'string' && description.trim() ? description.trim() : null;

  const groupId = db.transaction(() => {
    const id = Number(insertGroup.run(name.trim(), cleanDescription, userId).lastInsertRowid);
    insertMember.run(id, userId, 'admin'); // the creator is the first admin
    audit.log({
      userId,
      groupId: id,
      action: audit.ACTIONS.GROUP_CREATED,
      entityType: 'group',
      entityId: id,
      metadata: { name: name.trim() },
    });
    return id;
  })();

  return getGroupDetails(groupId, userId);
}

function listGroups(userId) {
  return listGroupsForUser.all(userId);
}

function addMember(groupId, actorId, email) {
  const user = findUserByEmail.get(email.trim().toLowerCase());
  if (!user) throw notFound('No registered user with this email. Ask them to sign up first.');

  try {
    const membershipId = db.transaction(() => {
      const existing = findAnyMembership.get(groupId, user.id);
      let id;
      let reactivated = false;

      if (existing && existing.removed_at === null) {
        throw conflict('This user is already a member of the group');
      } else if (existing) {
        reactivateMember.run(existing.id); // they left earlier: bring the same row back
        id = existing.id;
        reactivated = true;
      } else {
        id = Number(insertMember.run(groupId, user.id, 'member').lastInsertRowid);
      }

      audit.log({
        userId: actorId,
        groupId,
        action: audit.ACTIONS.MEMBER_ADDED,
        entityType: 'group_member',
        entityId: id,
        metadata: { memberUserId: user.id, memberName: user.name, reactivated },
      });
      return id;
    })();

    return memberById.get(membershipId);
  } catch (err) {
    // Two admins adding the same person at the same moment: UNIQUE constraint wins.
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw conflict('This user is already a member of the group');
    }
    throw err;
  }
}

/*
 * Removes (soft-deletes) a member. Rules, all checked inside one transaction:
 *   1. the target must be an active member
 *   2. only an admin may remove somebody else; anyone may remove themselves
 *   3. the target's balance must be zero (settle up before leaving)
 *   4. the group must never be left without an admin
 */
function removeMember(groupId, actor, targetUserId) {
  db.transaction(() => {
    const target = findActiveMembership.get(groupId, targetUserId);
    if (!target) throw notFound('That user is not an active member of this group');

    const isSelf = targetUserId === actor.id;
    if (!isSelf && actor.role !== 'admin') {
      throw forbidden('Only a group admin can remove other members');
    }

    if (getNetBalanceMinor(groupId, targetUserId) !== 0) {
      throw conflict('This member still has an unsettled balance. Settle up before removing them.');
    }

    if (target.role === 'admin' && countActiveAdmins.get(groupId).n <= 1) {
      throw conflict('The only admin of a group cannot be removed');
    }

    softRemoveMember.run(target.id);
    audit.log({
      userId: actor.id,
      groupId,
      action: audit.ACTIONS.MEMBER_REMOVED,
      entityType: 'group_member',
      entityId: target.id,
      metadata: { memberUserId: targetUserId, selfRemoved: isSelf },
    });
  })();
}

module.exports = {
  assertMember,
  assertAdmin,
  getNetBalanceMinor,
  getGroupDetails,
  createGroup,
  listGroups,
  addMember,
  removeMember,
};