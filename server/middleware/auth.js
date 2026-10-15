const jwt = require('jsonwebtoken');
const { execute } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'smc_lubrificacao_secret_key_2026_prefeitura';

// Middleware de autenticação JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Acesso não autorizado. Faça login para continuar.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Sessão expirada ou token inválido.' });
    }
    req.user = user;
    next();
  });
}

// Middleware de autorização por perfil
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Não autenticado.' });
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.perfil) && req.user.perfil !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Acesso restrito ao seu perfil de usuário.' });
    }
    next();
  };
}

// Helper para gravação de log de auditoria
async function logAudit(req, acao, tabela = null, idRegistro = null, detalhes = '') {
  try {
    const idUsuario = req.user ? req.user.idUsuario : null;
    const login = req.user ? req.user.login : 'SISTEMA';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    await execute(
      `INSERT INTO LUB_LOGS_AUDITORIA (ID_USUARIO, LOGIN, ACAO, TABELA_AFETADA, ID_REGISTRO_AFETADO, DETALHES, IP_ORIGEM)
       VALUES (:1, :2, :3, :4, :5, :6, :7)`,
      [idUsuario, login, acao, tabela, idRegistro, String(detalhes).substring(0, 2000), String(ip).substring(0, 50)]
    );
  } catch (err) {
    console.error('Erro ao gravar log de auditoria:', err.message);
  }
}

module.exports = {
  authenticateToken,
  requireRole,
  logAudit,
  JWT_SECRET
};
