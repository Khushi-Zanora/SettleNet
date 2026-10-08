import { useRef, useState } from 'react';
import { api, fieldErrorsFrom, newIdempotencyKey } from '../../api';
import Alert from '../../components/Alert';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import Field from '../../components/Field';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { useGroups } from '../../context/GroupsContext';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useFetch';
import { formatDate } from '../../utils/date';
import { formatInr, parseDecimal } from '../../utils/money';

function RecordPaymentModal({ groupId, transfer, userId, onClose, onDone }) {
  const [amount, setAmount] = useState(transfer.amount);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const keyRef = useRef({ key: newIdempotencyKey(), body: '' });

  const entered = parseDecimal(amount, 2);
  const max = parseDecimal(transfer.amount, 2);
  const valid = entered !== null && entered > 0 && entered <= max;
  const amountError = errors.amount || (amount.trim() && !valid ? `Enter an amount up to ${formatInr(transfer.amount)}` : '');

  const youPay = transfer.from.id === userId;
  const youReceive = transfer.to.id === userId;
  const title = youPay ? `Pay ${transfer.to.name}` : youReceive ? `Payment from ${transfer.from.name}` : 'Record a payment';

  async function onSubmit(e) {
    e.preventDefault();
    if (!valid) return;
    const body = { from_user: transfer.from.id, to_user: transfer.to.id, amount: amount.trim() };
    if (note.trim()) body.note = note.trim();

    const bodyText = JSON.stringify(body);
    if (keyRef.current.body !== bodyText) keyRef.current = { key: newIdempotencyKey(), body: bodyText };

    setSubmitting(true);
    setErrors({});
    setFormError('');
    try {
      await api.post(`/groups/${groupId}/settlements`, body, { idempotencyKey: keyRef.current.key });
      onDone();
    } catch (err) {
      const fields = fieldErrorsFrom(err);
      setErrors(fields);
      setFormError(Object.keys(fields).length === 0 ? err.message : '');
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={submitting ? () => {} : onClose} title={title}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="text-sm text-ink-muted">
          Record this only after the money has really been paid. {transfer.from.name} pays {transfer.to.name}.
        </p>
        {formError && <Alert kind="error">{formError}</Alert>}
        <Field
          id="pay-amount" label="Amount (INR)" inputMode="decimal" autoComplete="off" autoFocus
          hint={`Up to ${formatInr(transfer.amount)}. Lower it if only part was paid.`}
          value={amount} onChange={(e) => setAmount(e.target.value)} error={amountError}
        />
        <Field
          id="pay-note" label="Note (optional)" placeholder="Paid via UPI" maxLength={200}
          value={note} onChange={(e) => setNote(e.target.value)} error={errors.note}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" loading={submitting} disabled={!valid}>Record payment</Button>
        </div>
      </form>
    </Modal>
  );
}

function Sentence({ transfer, userId }) {
  const { from, to } = transfer;
  if (from.id === userId) return <><strong>You</strong> pay <strong>{to.name}</strong></>;
  if (to.id === userId) return <><strong>{from.name}</strong> pays <strong>you</strong></>;
  return <><strong>{from.name}</strong> pays <strong>{to.name}</strong></>;
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="space-y-3">
      <div className="h-20 animate-pulse rounded-card bg-sunken" />
      <div className="h-24 animate-pulse rounded-card bg-sunken" />
      <div className="h-24 animate-pulse rounded-card bg-sunken" />
    </div>
  );
}

export default function SettleTab({ group }) {
  const { user } = useAuth();
  const toast = useToast();
  const { reload: reloadGroups } = useGroups();
  const plan = useFetch(`/groups/${group.id}/settlement`);
  const payments = useFetch(`/groups/${group.id}/settlements`);
  const [paying, setPaying] = useState(null);

  function onRecorded() {
    setPaying(null);
    plan.reload();
    payments.reload();
    reloadGroups(); // balances changed
    toast.success('Payment recorded');
  }

  if (plan.loading && !plan.data) return <Skeleton />;
  if (plan.error && !plan.data) {
    return (
      <Alert kind="error">
        <p>{plan.error.message}</p>
        <button type="button" onClick={plan.reload} className="mt-1 font-medium underline">Try again</button>
      </Alert>
    );
  }

  const { transfers, settled, stats } = plan.data;
  const count = stats.transfer_count;

  return (
    <div className="space-y-8">
      <section aria-labelledby="plan-heading">
        <h2 id="plan-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">Settlement plan</h2>

        {settled ? (
          <Alert kind="success">All settled up. No payments are needed right now.</Alert>
        ) : (
          <>
            <div className="rounded-card bg-primary-soft p-4 text-primary">
              <p className="font-semibold">
                {count} payment{count === 1 ? '' : 's'} {count === 1 ? 'settles' : 'settle'} everyone up.
              </p>
              {stats.method === 'optimal' && count < stats.worst_case_transfers && (
                <p className="mt-1 text-sm">
                  A simple approach could need up to {stats.worst_case_transfers} for {stats.people_involved} people.
                </p>
              )}
              {stats.method === 'greedy' && (
                <p className="mt-1 text-sm">This is a large group, so the plan is good but not guaranteed to be the minimum.</p>
              )}
            </div>

            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-soft">
              {transfers.map((t) => {
                const canRecord = group.my_role === 'admin' || t.from.id === user.id || t.to.id === user.id;
                return (
                  <li key={`${t.from.id}-${t.to.id}`} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={t.from.name} size={36} />
                      <Icon name="chevronRight" size={16} className="text-ink-muted" />
                      <Avatar name={t.to.name} size={36} />
                      <p className="min-w-0 flex-1 text-sm"><Sentence transfer={t} userId={user.id} /></p>
                      <span className="money font-semibold">{formatInr(t.amount)}</span>
                    </div>
                    {canRecord && (
                      <div className="mt-3 flex justify-end">
                        <Button variant="secondary" onClick={() => setPaying(t)}>
                          <Icon name="check" size={18} /> Record payment
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-ink-muted">
              Paying through UPI, cash, or a bank transfer happens outside SettleNet. Record it here so balances update.
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="paid-heading">
        <h2 id="paid-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">Recorded payments</h2>
        {payments.loading && !payments.data && <div aria-hidden="true" className="h-20 animate-pulse rounded-card bg-sunken" />}
        {payments.error && !payments.data && (
          <Alert kind="error">
            <p>{payments.error.message}</p>
            <button type="button" onClick={payments.reload} className="mt-1 font-medium underline">Try again</button>
          </Alert>
        )}
        {payments.data && payments.data.settlements.length === 0 && (
          <p className="rounded-card border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-ink-muted">
            No payments recorded yet.
          </p>
        )}
        {payments.data && payments.data.settlements.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-soft">
            {payments.data.settlements.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gain-soft text-gain">
                  <Icon name="check" size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {p.from.id === user.id ? 'You' : p.from.name} paid {p.to.id === user.id ? 'you' : p.to.name}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {formatDate(p.created_at)}{p.note ? ` \u00B7 ${p.note}` : ''}
                  </p>
                </div>
                <span className="money font-semibold">{formatInr(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {paying && (
        <RecordPaymentModal
          groupId={group.id} transfer={paying} userId={user.id}
          onClose={() => setPaying(null)} onDone={onRecorded}
        />
      )}
    </div>
  );
}