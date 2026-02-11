const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

// JWT 認證中間件
const authMiddleware = (req, res, next) => {
  console.log(`[AUTH] JWT Middleware triggered for: ${req.method} ${req.path}`);
  const authHeader = req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[AUTH] Failed: No valid Authorization header');
    return res.status(401).json({ message: '未提供有效的授權令牌' });
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    console.log(`[AUTH] Success: Access granted for user '${decoded.username}'`);
    next();
  } catch (error) {
    console.error('[AUTH] Token verification failed:', error);
    res.status(401).json({ message: '無效的授權令牌' });
  }
};

// 保留舊的基本認證作為備用
const basicAuth = (req, res, next) => {
  console.log(`[BASIC AUTH] Middleware triggered for: ${req.method} ${req.path}`);
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    console.log('[BASIC AUTH] Failed: No Authorization header');
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.status(401).json({ message: 'Authorization header required' });
  }

  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const user = auth[0];
  const pass = auth[1];

  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

  if (user === adminUser && pass === adminPass) {
    console.log(`[BASIC AUTH] Success: Access granted for user '${user}'`);
    next(); // Access granted
  } else {
    console.log(`[BASIC AUTH] Failed: Invalid credentials for user '${user}'`);
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.status(401).json({ message: 'Invalid credentials' });
  }
};

module.exports = { authMiddleware, basicAuth, JWT_SECRET };
