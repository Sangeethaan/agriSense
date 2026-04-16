const jwt = require('jsonwebtoken');

/**
 * authenticate  –  validates the Bearer JWT in the Authorization header.
 * On success: attaches the decoded payload to req.user and calls next().
 * On failure: returns 401.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized – missing or malformed token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Decode payload: { id, email, role, name, iat, exp }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Unauthorized – token has expired'
        : 'Unauthorized – invalid token';
    return res.status(401).json({ error: message });
  }
};

module.exports = { authenticate };
