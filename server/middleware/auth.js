const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: missing token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.decode(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Unauthorized: invalid token' });
    }

    req.user = {
      userId: decoded.userId,
      tier: decoded.tier || 'free'
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: token decode failed' });
  }
}

module.exports = authMiddleware;
