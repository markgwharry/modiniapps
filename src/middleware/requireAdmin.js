function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    if (req.accepts('json')) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return res.status(403).render('error', { message: 'Admin access required' });
  }
  next();
}

module.exports = requireAdmin;

