// A/B 驗證用：鑄測試 JWT（secret 由 env JWT_SECRET 提供，勿印出）
const jwt = require('jsonwebtoken');
const s = process.env.JWT_SECRET;
const which = process.argv[2];
const out = (p,o,sec)=>console.log(jwt.sign(p, sec||s, o||{}));
switch(which){
  case 'legacy': return out({id:1,username:'admin',role:'OWNER'}, {expiresIn:'7d'});
  case 'owner':  return out({userId:3,provider:'github',role:'OWNER'}, {expiresIn:'30d'});
  case 'linked': return out({userId:5,provider:'github'}, {expiresIn:'30d'});
  case 'user':   return out({userId:4,provider:'github',role:'USER'}, {expiresIn:'30d'});
}
