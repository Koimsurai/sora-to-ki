const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');

if (!process.env.JWT_SECRET) {
  console.warn('[SECURITY] JWT_SECRET is not set. Using an ephemeral in-memory secret. Set JWT_SECRET in server/.env for stable auth tokens.');
}

// 基礎 JWT 認證中間件（任何有效 token 都可通過）
const authMiddleware = (req, res, next) => {
  const authHeader = req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: '未提供有效的授權令牌' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: '無效的授權令牌' });
  }
};

// requireAdmin: 需要 ADMIN 或 OWNER 角色
// 會從 DB 查詢最新 role（確保權限變更即時生效）
function createRequireAdmin(db) {
  return (req, res, next) => {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: '未提供有效的授權令牌' });
    }

    try {
      const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
      req.user = decoded;

      // OAuth user token（有 userId）
      if (decoded.userId) {
        db.get('SELECT * FROM oauth_users WHERE id = ?', [decoded.userId], (err, user) => {
          if (err || !user) return res.status(401).json({ message: '使用者不存在' });
          // 如果是關聯帳號，查主帳號
          const targetId = user.linked_to || user.id;
          db.get('SELECT * FROM oauth_users WHERE id = ?', [targetId], (err2, primary) => {
            if (err2 || !primary) return res.status(401).json({ message: '使用者不存在' });
            if (primary.role !== 'ADMIN' && primary.role !== 'OWNER') {
              return res.status(403).json({ message: '權限不足，需要管理員權限' });
            }
            req.user = { ...decoded, role: primary.role, dbUser: primary };
            next();
          });
        });
      } else if (decoded.username) {
        // 舊版管理員 token（向下相容）
        req.user = { ...decoded, role: 'OWNER' };
        next();
      } else {
        return res.status(403).json({ message: '權限不足' });
      }
    } catch (error) {
      res.status(401).json({ message: '無效的授權令牌' });
    }
  };
}

// requireOwner: 僅 OWNER 角色
function createRequireOwner(db) {
  return (req, res, next) => {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: '未提供有效的授權令牌' });
    }

    try {
      const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
      req.user = decoded;

      if (decoded.userId) {
        db.get('SELECT * FROM oauth_users WHERE id = ?', [decoded.userId], (err, user) => {
          if (err || !user) return res.status(401).json({ message: '使用者不存在' });
          const targetId = user.linked_to || user.id;
          db.get('SELECT * FROM oauth_users WHERE id = ?', [targetId], (err2, primary) => {
            if (err2 || !primary) return res.status(401).json({ message: '使用者不存在' });
            if (primary.role !== 'OWNER') {
              return res.status(403).json({ message: '權限不足，需要擁有者權限' });
            }
            req.user = { ...decoded, role: primary.role, dbUser: primary };
            next();
          });
        });
      } else if (decoded.username) {
        req.user = { ...decoded, role: 'OWNER' };
        next();
      } else {
        return res.status(403).json({ message: '權限不足' });
      }
    } catch (error) {
      res.status(401).json({ message: '無效的授權令牌' });
    }
  };
}

// 保留舊的基本認證作為備用
const basicAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.status(401).json({ message: 'Authorization header required' });
  }

  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const user = auth[0];
  const pass = auth[1];

  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;

  if (!adminUser || !adminPass) {
    return res.status(503).json({ message: 'Admin basic auth is not configured' });
  }

  if (user === adminUser && pass === adminPass) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.status(401).json({ message: 'Invalid credentials' });
  }
};

module.exports = { authMiddleware, createRequireAdmin, createRequireOwner, basicAuth, JWT_SECRET };
