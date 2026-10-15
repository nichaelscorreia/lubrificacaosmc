const { execute } = require('./server/config/database');
const bcrypt = require('bcryptjs');

async function insertAdmin() {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('admin123', salt);
  
  await execute(`DELETE FROM LUB_USUARIOS WHERE LOGIN = 'admin'`);
  
  await execute(
    `INSERT INTO LUB_USUARIOS (LOGIN, SENHA_HASH, NOME_COMPLETO, EMAIL, CARGO, PERFIL, ATIVO)
     VALUES (:1, :2, :3, :4, :5, :6, 'S')`,
    ['admin', hash, 'Administrador do Sistema', 'frotas@saomigueldoscampos.al.gov.br', 'Gestor de Frota Municipal', 'ADMIN']
  );

  const res = await execute(`SELECT ID_USUARIO, LOGIN, SENHA_HASH, ATIVO FROM LUB_USUARIOS`);
  console.log('Inserted users:', res.rows);
}

insertAdmin();
