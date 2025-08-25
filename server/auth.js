const auth = (req, res, next) => {
  console.log(`[AUTH] Middleware triggered for: ${req.method} ${req.path}`);
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    console.log('[AUTH] Failed: No Authorization header');
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.status(401).json({ message: 'Authorization header required' });
  }

  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const user = auth[0];
  const pass = auth[1];

  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;

  if (user === adminUser && pass === adminPass) {
    console.log(`[AUTH] Success: Access granted for user '${user}'`);
    next(); // Access granted
  } else {
    console.log(`[AUTH] Failed: Invalid credentials for user '${user}'`);
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.status(401).json({ message: 'Invalid credentials' });
  }
};

module.exports = auth;
