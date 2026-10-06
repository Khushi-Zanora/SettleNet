import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fieldErrorsFrom, newIdempotencyKey } from '../api';
import Alert from '../components/Alert';
import Button, { buttonClass } from '../components/Button';
import Field, { inputClass } from '../components/Field';
import { useGroups } from '../context/GroupsContext';
import { useToast } from '../context/ToastContext';

export default function CreateGroup() {
  const navigate = useNavigate();
  const toast = useToast();
  const { reload } = useGroups();

  const [form, setForm] = useState({ name: '', description: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    idempotencyKey.current = newIdempotencyKey(); // the request changed, so it needs a new key
  };

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError('');
    try {
      const body = { name: form.name };
      if (form.description.trim()) body.description = form.description;
      await api.post('/groups', body, { idempotencyKey: idempotencyKey.current });
      reload(); // refresh the sidebar and the dashboard
      toast.success('Group created');
      navigate('/'); // Step 3 changes this to the new group's page
    } catch (err) {
      const fields = fieldErrorsFrom(err);
      setErrors(fields);
      setFormError(Object.keys(fields).length === 0 ? err.message : '');
      setSubmitting(false);
    }
  }

  return (
    <div className="anim-rise mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight">Create a group</h1>
      <p className="mt-1 text-ink-muted">You will be the admin and can add the others by email afterwards.</p>

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4 rounded-card border border-line bg-surface p-5 shadow-soft">
        {formError && <Alert kind="error">{formError}</Alert>}

        <Field
          id="name" label="Group name" placeholder="Goa Trip" maxLength={100} autoFocus required
          value={form.name} onChange={update('name')} error={errors.name}
        />

        <div>
          <label htmlFor="description" className="mb-1.5 block text-sm font-medium">
            Description <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <textarea
            id="description" rows={3} maxLength={500} placeholder="Beach trip with friends"
            className={`${inputClass} min-h-24 py-2 ${errors.description ? 'border-owe' : ''}`}
            value={form.description} onChange={update('description')}
            aria-invalid={Boolean(errors.description)}
          />
          {errors.description && <p role="alert" className="mt-1.5 text-sm text-owe">{errors.description}</p>}
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Link to="/" className={buttonClass('secondary')}>Cancel</Link>
          <Button type="submit" loading={submitting}>Create group</Button>
        </div>
      </form>
    </div>
  );
}