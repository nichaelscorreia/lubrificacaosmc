const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { execute } = require('../config/database');
const { JWT_SECRET, logAudit } = require('../middleware/auth');

// POST /api/auth/login
async function login(req, res) {
  try {
    const { login: username, senha } = req.body;

    if (!username || !senha) {
      return res.status(400).json({ success: false, message: 'Informe o usuário e a senha.' });
    }

    const result = await execute(
      `SELECT ID_USUARIO, LOGIN, SENHA_HASH, NOME_COMPLETO, EMAIL, CARGO, PERFIL, SECRETARIA_VINCULADA, ATIVO 
       FROM LUB_USUARIOS 
       WHERE LOWER(LOGIN) = LOWER(:1)`,
      [username.trim()]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuário ou senha inválidos.' });
    }

    const user = result.rows[0];

    if (user.ATIVO !== 'S') {
      return res.status(403).json({ success: false, message: 'Usuário inativo. Contate o administrador.' });
    }

    const isMatch = await bcrypt.compare(senha, user.SENHA_HASH);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Usuário ou senha inválidos.' });
    }

    // Atualiza data do último acesso
    await execute(
      `UPDATE LUB_USUARIOS SET ULTIMO_ACESSO = CURRENT_TIMESTAMP WHERE ID_USUARIO = :1`,
      [user.ID_USUARIO]
    );

    // Payload do Token JWT
    const payload = {
      idUsuario: user.ID_USUARIO,
      login: user.LOGIN,
      nomeCompleto: user.NOME_COMPLETO,
      cargo: user.CARGO,
      perfil: user.PERFIL,
      secretaria: user.SECRETARIA_VINCULADA
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    });

    // Grava log de auditoria
    await logAudit(
      { user: payload, headers: req.headers, socket: req.socket },
      'LOGIN_SUCESSO',
      'LUB_USUARIOS',
      user.ID_USUARIO,
      `Usuário ${user.LOGIN} efetuou login com sucesso.`
    );

    return res.json({
      success: true,
      message: 'Login realizado com sucesso!',
      token,
      user: {
        idUsuario: user.ID_USUARIO,
        login: user.LOGIN,
        nomeCompleto: user.NOME_COMPLETO,
        email: user.EMAIL,
        cargo: user.CARGO,
        perfil: user.PERFIL,
        secretaria: user.SECRETARIA_VINCULADA
      }
    });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao autenticar usuário.' });
  }
}

// GET /api/auth/me
async function me(req, res) {
  try {
    const result = await execute(
      `SELECT ID_USUARIO, LOGIN, NOME_COMPLETO, EMAIL, CARGO, PERFIL, SECRETARIA_VINCULADA, ATIVO, ULTIMO_ACESSO 
       FROM LUB_USUARIOS 
       WHERE ID_USUARIO = :1`,
      [req.user.idUsuario]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    return res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (err) {
    console.error('Erro ao buscar dados do usuário:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao obter dados.' });
  }
}

// POST /api/auth/change-password
async function changePassword(req, res) {
  try {
    const { senhaAtual, novaSenha } = req.body;

    if (!senhaAtual || !novaSenha) {
      return res.status(400).json({ success: false, message: 'Informe a senha atual e a nova senha.' });
    }

    if (novaSenha.length < 6) {
      return res.status(400).json({ success: false, message: 'A nova senha deve possuir no mínimo 6 caracteres.' });
    }

    const result = await execute(
      `SELECT SENHA_HASH FROM LUB_USUARIOS WHERE ID_USUARIO = :1`,
      [req.user.idUsuario]
    );

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(senhaAtual, user.SENHA_HASH);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'A senha atual está incorreta.' });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(novaSenha, salt);

    await execute(
      `UPDATE LUB_USUARIOS SET SENHA_HASH = :1 WHERE ID_USUARIO = :2`,
      [newHash, req.user.idUsuario]
    );

    await logAudit(
      req,
      'ALTERACAO_SENHA',
      'LUB_USUARIOS',
      req.user.idUsuario,
      'Usuário alterou sua própria senha.'
    );

    return res.json({ success: true, message: 'Senha alterada com sucesso!' });
  } catch (err) {
    console.error('Erro ao alterar senha:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao alterar senha.' });
  }
}

module.exports = {
  login,
  me,
  changePassword
};
