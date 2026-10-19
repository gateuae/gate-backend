import jwt from 'jsonwebtoken';

export function authenticateAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1]?.trim();
    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ success: false, message: 'Access denied. Invalid token.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_market_secret_jwt_key_2026_secure');
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ 
      success: false, 
      message: err.name === 'TokenExpiredError' ? 'Invalid or expired token.' : 'Invalid or expired token.' 
    });
  }
}
