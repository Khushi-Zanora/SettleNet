import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { fieldErrorsFrom } from '../api';
import Alert from '../components/Alert';
import AuthLayout from '../components/AuthLayout';
import Button from '../components/Button';
import Field from '../components/Field';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { user, login, sessionExpired } = useAuth();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError('');
    try {
      await login(form.email, form.password); // on success the redirect above takes over
    } catch (err) {
      const fields = fieldErrorsFrom(err);
      setErrors(fields);
      setFormError(Object.keys(fields).length === 0 ? err.message : '');
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to see your groups and balances."
      footer={<>New to SettleNet? <Link to="/register" className="font-medium text-primary underline">Create an account</Link></>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {sessionExpired && <Alert kind="info">Your session has expired. Please log in again.</Alert>}
        {formError && <Alert kind="error">{formError}</Alert>}
        <Field
          id="email" label="Email" type="email" inputMode="email" autoComplete="email"
          value={form.email} onChange={update('email')} error={errors.email} required
        />
        <Field
          id="password" label="Password" type="password" autoComplete="current-password"
          value={form.password} onChange={update('password')} error={errors.password} required
        />
        <Button type="submit" className="w-full" loading={submitting}>Log in</Button>
      </form>
    </AuthLayout>
  );
}