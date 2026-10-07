import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fieldErrorsFrom } from '../../api';
import Alert from '../../components/Alert';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import ConfirmDialog from '../../components/ConfirmDialog';
import Field from '../../components/Field';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { useGroups } from '../../context/GroupsContext';
import { useToast } from '../../context/ToastContext';

function AddMemberModal({ groupId, onClose, onAdded }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const data = await api.post(`/groups/${groupId}/members`, { email });
      toast.success(`${data.member.name} added to the group`);
      onAdded();
    } catch (err) {
      const fields = fieldErrorsFrom(err);
      setError(fields.email || err.message);
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Add a member">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="text-sm text-ink-muted">
          They need a SettleNet account first. Enter the email address they signed up with.
        </p>
        {error && <Alert kind="error">{error}</Alert>}
        <Field
          id="member-email" label="Email" type="email" inputMode="email" autoComplete="off" autoFocus required
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" loading={submitting}>Add member</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function MembersTab({ group, onChanged }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { reload: reloadGroups } = useGroups();

  const isAdmin = group.my_role === 'admin';
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function confirmRemove() {
    await api.del(`/groups/${group.id}/members/${removeTarget.id}`);
    toast.success(`${removeTarget.name} removed`);
    setRemoveTarget(null);
    onChanged();
  }

  async function confirmLeave() {
    await api.del(`/groups/${group.id}/members/${user.id}`);
    toast.success(`You left ${group.name}`);
    reloadGroups();
    navigate('/');
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await api.download(`/groups/${group.id}/export`, 'settlenet-statement.csv');
      toast.success('Statement downloaded');
    } catch (err) {
      toast.error(err.message);
    }
    setExporting(false);
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Members ({group.members.length})
          </h2>
          {isAdmin && (
            <Button onClick={() => setAdding(true)}>
              <Icon name="userPlus" size={18} /> Add member
            </Button>
          )}
        </div>

        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-soft">
          {group.members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={member.name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {member.name}
                  {member.id === user.id && <span className="font-normal text-ink-muted"> (you)</span>}
                </p>
                <p className="truncate text-sm text-ink-muted">{member.email}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  member.role === 'admin' ? 'bg-primary-soft text-primary' : 'bg-sunken text-ink-muted'
                }`}
              >
                {member.role === 'admin' ? 'Admin' : 'Member'}
              </span>
              {isAdmin && member.id !== user.id && (
                <button
                  type="button"
                  onClick={() => setRemoveTarget(member)}
                  aria-label={`Remove ${member.name}`}
                  className="-mr-2 flex size-11 items-center justify-center rounded-field text-ink-muted hover:bg-owe-soft hover:text-owe"
                >
                  <Icon name="trash" size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>

        {group.former_members.length > 0 && (
          <p className="mt-3 text-sm text-ink-muted">
            Former members: {group.former_members.map((m) => m.name).join(', ')}
          </p>
        )}
      </section>

      <section className="rounded-card border border-line bg-surface p-4 shadow-soft">
        <h2 className="font-semibold">Statement</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Download a CSV with every expense, balances, recorded payments, and the settlement plan. Opens in Excel or Google Sheets.
        </p>
        <Button variant="secondary" className="mt-3" onClick={exportCsv} loading={exporting}>
          <Icon name="download" size={18} /> Export CSV
        </Button>
      </section>

      <section className="rounded-card border border-line bg-surface p-4 shadow-soft">
        <h2 className="font-semibold">Leave this group</h2>
        <p className="mt-1 text-sm text-ink-muted">
          You can leave once your balance is settled. The only admin of a group cannot leave.
        </p>
        <Button variant="secondary" className="mt-3 text-owe" onClick={() => setLeaving(true)}>
          <Icon name="logout" size={18} /> Leave group
        </Button>
      </section>

      {adding && (
        <AddMemberModal
          groupId={group.id}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); onChanged(); }}
        />
      )}

      {removeTarget && (
        <ConfirmDialog
          title={`Remove ${removeTarget.name}?`}
          message="They lose access to this group. Past expenses stay in the history. This only works once their balance is settled."
          confirmLabel="Remove"
          onConfirm={confirmRemove}
          onClose={() => setRemoveTarget(null)}
        />
      )}

      {leaving && (
        <ConfirmDialog
          title="Leave this group?"
          message="You will lose access until an admin adds you back. This only works once your balance is settled."
          confirmLabel="Leave group"
          onConfirm={confirmLeave}
          onClose={() => setLeaving(false)}
        />
      )}
    </div>
  );
}