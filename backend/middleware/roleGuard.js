/**
 * roleGuard  –  middleware factory
 *
 * Restricts access to users whose role is in the allowed list.
 * Must be used AFTER the `authenticate` middleware so req.user is populated.
 *
 * Usage:
 *   router.get('/admin-only', authenticate, roleGuard('supervisor'), handler);
 *   router.get('/shared',     authenticate, roleGuard('supervisor', 'farmer'), handler);
 */
const roleGuard = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized – not authenticated' });
  }

  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      error: `Forbidden – role '${req.user.role}' is not permitted for this resource`,
    });
  }

  next();
};

module.exports = roleGuard;
