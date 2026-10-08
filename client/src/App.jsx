import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import CreateGroup from './pages/CreateGroup';
import Dashboard from './pages/Dashboard';
import ExpenseForm from './pages/ExpenseForm';
import Group from './pages/Group';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import Profile from './pages/Profile';
import Register from './pages/Register';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="groups/new" element={<CreateGroup />} />
          <Route path="groups/:id" element={<Group />} />
          <Route path="groups/:id/expenses/new" element={<ExpenseForm />} />
          <Route path="groups/:id/expenses/:expenseId/edit" element={<ExpenseForm />} />
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}