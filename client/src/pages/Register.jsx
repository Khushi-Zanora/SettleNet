import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { fieldErrorsFrom } from '../api';
import Alert from '../components/Alert';
import AuthLayout from '../components/AuthLayout';
import Button from '../components/Button';
import Field from '../components/Field';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { user, register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError('');
    try {
      await register(form.name, form.email, form.password);
    } catch (err) {
      const fields = fieldErrorsFrom(err);
      setErrors(fields);
      setFormError(Object.keys(fields).length === 0 ? err.message : '');
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start splitting expenses with friends in a minute."
      footer={<>Already have an account? <Link to="/login" className="font-medium text-primary underline">Log in</Link></>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert kind="error">{formError}</Alert>}
        <Field
          id="name" label="Name" autoComplete="name"
          value={form.name} onChange={update('name')} error={errors.name} required
        />
        <Field
          id="email" label="Email" type="email" inputMode="email" autoComplete="email"
          value={form.email} onChange={update('email')} error={errors.email} required
        />
        <Field
          id="password" label="Password" type="password" autoComplete="new-password"
          hint="At least 8 characters, with a letter and a number."
          value={form.password} onChange={update('password')} error={errors.password} required
        />
        <Button type="submit" className="w-full" loading={submitting}>Create account</Button>
      </form>
    </AuthLayout>
  );
}