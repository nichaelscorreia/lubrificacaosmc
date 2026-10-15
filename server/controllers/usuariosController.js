const bcrypt = require('bcryptjs');
const { execute } = require('../config/database');
const { logAudit } = require('../middleware/auth');

// GET /api/usuarios
async function list(req, res) {
  try {
    const result = await execute(`
      SELECT 
        ID_USUARIO,
        LOGIN,
        NOME_COMPLETO,
        EMAIL,
        CARGO,
        PERFIL,
        SECRETARIA_VINCULADA,
        ATIVO,
        TO_CHAR(DATA_CADASTRO, 'YYYY-MM-DD HH24:MI') AS DATA_CADASTRO,
        TO_CHAR(ULTIMO_ACESSO, 'YYYY-MM-DD HH24:MI') AS ULTIMO_ACESSO
      FROM LUB_USUARIOS
      ORDER BY ATIVO DESC, NOME_COMPLETO ASC
    `);

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    return res.status(500).json({ success: false, message: 'Erro ao consultar usuários.' });
  }
}

// POST /api/usuarios
async function create(req, res) {
  try {
    const { login: username, senha, nomeCompleto, email, cargo, perfil, secretariaVinculada } = req.body;

    if (!username || !senha || !nomeCompleto) {
      return res.status(400).json({ success: false, message: 'Login, senha e nome completo são obrigatórios.' });
    }

    // Verificar se login já existe
    const checkRes = await execute(
      `SELECT COUNT(*) AS CNT FROM LUB_USUARIOS WHERE LOWER(LOGIN) = LOWER(:1)`,
      [username.trim()]
    );

    if (checkRes.rows[0].CNT > 0) {
      return res.status(400).json({ success: false, message: 'Este login já está em uso.' });
    }

    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);

    await execute(`
      INSERT INTO LUB_USUARIOS (
        LOGIN, SENHA_HASH, NOME_COMPLETO, EMAIL, CARGO, PERFIL, SECRETARIA_VINCULADA, ATIVO
      ) VALUES (
        :1, :2, :3, :4, :5, :6, :7, 'S'
      )
    `, [
      username.trim(),
      senhaHash,
      nomeCompleto.trim(),
      email || null,
      cargo || null,
      perfil || 'OPERADOR',
      secretariaVinculada || null
    ]);

    await logAudit(
      req,
      'CRIACAO_USUARIO',
      'LUB_USUARIOS',
      null,
      `Novo usuário criado: ${username} (${perfil})`
    );

    return res.status(201).json({ success: true, message: 'Usuário cadastrado com sucesso!' });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    return res.status(500).json({ success: false, message: 'Erro ao cadastrar usuário.' });
  }
}

// PUT /api/usuarios/:id
async function update(req, res) {
  try {
    const id = parseInt(req.params.id);
    const { nomeCompleto, email, cargo, perfil, secretariaVinculada, ativo } = req.body;

    await execute(`
      UPDATE LUB_USUARIOS
      SET NOME_COMPLETO = :1,
          EMAIL = :2,
          CARGO = :3,
          PERFIL = :4,
          SECRETARIA_VINCULADA = :5,
          ATIVO = :6
      WHERE ID_USUARIO = :7
    `, [
      nomeCompleto,
      email || null,
      cargo || null,
      perfil || 'OPERADOR',
      secretariaVinculada || null,
      ativo || 'S',
      id
    ]);

    await logAudit(
      req,
      'ALTERACAO_USUARIO',
      'LUB_USUARIOS',
      id,
      `Dados do usuário ${id} (${nomeCompleto}) atualizados.`
    );

    return res.json({ success: true, message: 'Usuário atualizado com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    return res.status(500).json({ success: false, message: 'Erro ao atualizar dados do usuário.' });
  }
}

// POST /api/usuarios/:id/reset-password
async function resetPassword(req, res) {
  try {
    const id = parseInt(req.params.id);
    const { novaSenha } = req.body;

    if (!novaSenha || novaSenha.length < 6) {
      return res.status(400).json({ success: false, message: 'A senha deve possuir pelo menos 6 caracteres.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(novaSenha, salt);

    await execute(`UPDATE LUB_USUARIOS SET SENHA_HASH = :1 WHERE ID_USUARIO = :2`, [hash, id]);

    await logAudit(
      req,
      'RESET_SENHA_ADMIN',
      'LUB_USUARIOS',
      id,
      `Senha do usuário ID=${id} resetada pelo administrador.`
    );

    return res.json({ success: true, message: 'Senha redefinida com sucesso!' });
  } catch (err) {
    console.error('Erro ao redefinir senha:', err);
    return res.status(500).json({ success: false, message: 'Erro ao redefinir senha do usuário.' });
  }
}

module.exports = {
  list,
  create,
  update,
  resetPassword
};
