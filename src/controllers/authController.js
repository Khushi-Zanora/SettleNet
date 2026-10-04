const authService = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');

const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const result = await authService.register({ name, email, password });
  res.status(201).json({ data: result });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login({ email, password });
  res.json({ data: result });
});

const logout = (req, res) => {
  authService.logout(req.user.id, req.auth);
  res.json({ data: { message: 'Logged out successfully' } });
};

module.exports = { register, login, logout };