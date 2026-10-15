const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initializePool, closePool } = require('./config/database');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares Globais
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, '../public')));

// Servir logo a partir do diretório raiz se necessário
app.get('/assets/logo.png', (req, res) => {
  const customLogo = path.join(__dirname, '../LogoGeorge.png');
  const publicLogo = path.join(__dirname, '../public/assets/logo.png');
  const fs = require('fs');
  if (fs.existsSync(customLogo)) {
    return res.sendFile(customLogo);
  }
  if (fs.existsSync(publicLogo)) {
    return res.sendFile(publicLogo);
  }
  return res.status(404).send('Logo not found');
});

// Rotas da API REST
app.use('/api', apiRoutes);

// Fallback para SPA no Frontend
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'Endpoint não encontrado.' });
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Inicialização do Servidor e Conexão Oracle
async function startServer() {
  try {
    await initializePool();
    app.listen(PORT, '0.0.0.0', () => {
      console.log('================================================================');
      console.log('🚗 SISTEMA DE CONTROLE DE LUBRIFICAÇÃO E TROCA DE ÓLEO');
      console.log('🏛️  PREFEITURA MUNICIPAL DE SÃO MIGUEL DOS CAMPOS');
      console.log(`🌐 Servidor Web ativo e rodando na porta ${PORT}`);
      console.log(`🔗 Acesso Local: http://localhost:${PORT}`);
      console.log('================================================================');
    });
  } catch (err) {
    console.error('❌ Falha crítica ao iniciar servidor:', err);
    process.exit(1);
  }
}

// Graceful Shutdown
process.on('SIGINT', async () => {
  console.log('\nFinalizando servidor com segurança...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nFinalizando servidor com segurança...');
  await closePool();
  process.exit(0);
});

startServer();
