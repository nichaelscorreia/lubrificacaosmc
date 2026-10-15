const crypto = require('crypto');
require('dotenv').config();

let oracledb = null;
try {
  oracledb = require('oracledb');
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.autoCommit = true;
} catch (err) {
  // Driver Oracle local opcional caso esteja rodando em modo API no Render/Cloud
}

let pool = null;

const isApiMode = () => Boolean(process.env.LUBRIFICACAO_API_URL || process.env.TOMCAT_API_URL);

/**
 * Inicialização do pool local ou verificação da API remota
 */
async function initializePool() {
  if (isApiMode()) {
    const apiUrl = (process.env.LUBRIFICACAO_API_URL || process.env.TOMCAT_API_URL).replace(/\/+$/, '');
    console.log(`🌐 [Database] Modo API Ativo! Conectando via Tomcat API em: ${apiUrl}`);
    try {
      const res = await fetch(`${apiUrl}/api/health`, {
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        console.log(`✅ [Database] Conexão com Tomcat API validada com sucesso!`);
      } else {
        console.warn(`⚠️ [Database] Tomcat API respondeu com status ${res.status}`);
      }
    } catch (err) {
      console.warn(`⚠️ [Database] Não foi possível verificar Tomcat API de imediato (${err.message}). Tentará nas requisições.`);
    }
    return null;
  }

  if (pool) return pool;
  if (!oracledb) {
    throw new Error('Driver oracledb não está disponível no ambiente e nenhuma URL de API foi configurada.');
  }

  try {
    pool = await oracledb.createPool({
      user: process.env.ORACLE_USER || 'c##nstecholeo',
      password: process.env.ORACLE_PASSWORD || 'nstech',
      connectString: process.env.ORACLE_CONNECT_STRING || '192.168.2.136:1521/xe',
      poolMin: 2,
      poolMax: 10,
      poolIncrement: 1,
      poolTimeout: 60
    });
    console.log('✅ Oracle Database Connection Pool local inicializado com sucesso!');
    return pool;
  } catch (err) {
    console.error('❌ Falha ao inicializar Pool local do Oracle Database:', err);
    throw err;
  }
}

/**
 * Executa chamada HTTP para a API Tomcat com autenticação Bearer e HMAC-SHA256
 */
async function executeViaTomcat(sql, binds = []) {
  const apiUrl = (process.env.LUBRIFICACAO_API_URL || process.env.TOMCAT_API_URL).replace(/\/+$/, '');
  const secret = process.env.LUBRIFICACAO_API_SECRET || process.env.TOMCAT_API_SECRET || 'smc_lubrificacao_secret_key_2026_prefeitura_producao';

  const targetUrl = new URL(apiUrl + '/api/sql');
  const timestamp = String(Date.now());
  const body = JSON.stringify({ sql, binds });

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}\nPOST\n${targetUrl.pathname}${targetUrl.search ? '?' + targetUrl.search : ''}\n${body}`)
    .digest('hex');

  const timeoutMs = parseInt(process.env.API_TIMEOUT_MS, 10) || 60000;

  const res = await fetch(targetUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${secret}`,
      'X-Lubrificacao-Timestamp': timestamp,
      'X-Lubrificacao-Signature': signature
    },
    body,
    signal: AbortSignal.timeout(timeoutMs)
  });

  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    // Resposta não-JSON (ex: erro 502/504 do gateway ou proxy)
  }

  if (!res.ok) {
    const errorMsg = data && (data.error || data.message) ? (data.error || data.message) : `HTTP ${res.status}`;
    const ref = data && data.ref ? ` [Ref: ${data.ref}]` : '';
    throw new Error(`Erro na API Tomcat: ${errorMsg}${ref}`);
  }

  return {
    rows: data && Array.isArray(data.rows) ? data.rows : [],
    rowsAffected: data && typeof data.rowsAffected === 'number' ? data.rowsAffected : 0
  };
}

async function getConnection() {
  if (isApiMode()) {
    throw new Error('getConnection() direto não é suportado no modo API Tomcat. Use execute(sql, binds).');
  }
  if (!pool) {
    await initializePool();
  }
  return await pool.getConnection();
}

/**
 * Função unificada de execução de SQL (suporta modo Local direto e modo API Tomcat)
 */
async function execute(sql, binds = [], opts = {}) {
  if (isApiMode()) {
    return await executeViaTomcat(sql, binds);
  }

  let connection;
  try {
    connection = await getConnection();
    const options = {
      autoCommit: true,
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...opts
    };
    const result = await connection.execute(sql, binds, options);
    return result;
  } catch (err) {
    console.error('SQL Execution Error:', err.message, '\nQuery:', sql);
    throw err;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
}

async function closePool() {
  if (pool) {
    try {
      await pool.close(10);
      console.log('Oracle Database Pool closed.');
      pool = null;
    } catch (err) {
      console.error('Error closing pool:', err);
    }
  }
}

module.exports = {
  initializePool,
  getConnection,
  execute,
  closePool,
  oracledb,
  isApiMode
};
