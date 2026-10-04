const getMe = (req, res) => {
  res.json({ data: { user: req.user } });
};

module.exports = { getMe };