function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }

  if (req.accepts('json')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const redirectTo = encodeURIComponent(req.originalUrl || '/');
  return res.redirect(`/login?redirect=${redirectTo}`);
}

module.exports = requireAuth;
