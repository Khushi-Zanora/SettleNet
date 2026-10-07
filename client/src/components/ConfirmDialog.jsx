import { useState } from 'react';
import Alert from './Alert';
import Button from './Button';
import Modal from './Modal';

export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    try {
      await onConfirm(); // the parent closes the dialog on success
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <Modal onClose={busy ? () => {} : onClose} title={title}>
      <p className="text-ink-muted">{message}</p>
      {error && <Alert kind="error" className="mt-4">{error}</Alert>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="danger" onClick={run} loading={busy}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}