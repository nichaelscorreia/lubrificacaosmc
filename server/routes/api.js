const express = require('express');
const router = express.Router();

const { authenticateToken, requireRole } = require('../middleware/auth');
const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const veiculosController = require('../controllers/veiculosController');
const trocasController = require('../controllers/trocasController');
const produtosController = require('../controllers/produtosController');
const relatoriosController = require('../controllers/relatoriosController');
const usuariosController = require('../controllers/usuariosController');

// --- ROTAS PÚBLICAS (HEALTH CHECK E AUTENTICAÇÃO) ---
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'controle-lubrificacao-smc', timestamp: Date.now() });
});
router.get('/status', (req, res) => {
  res.json({ status: 'ok', service: 'controle-lubrificacao-smc', timestamp: Date.now() });
});

router.post('/auth/login', authController.login);

// --- ROTAS PROTEGIDAS ---
router.use(authenticateToken);

// Perfil do Usuário Logado
router.get('/auth/me', authController.me);
router.post('/auth/change-password', authController.changePassword);

// Dashboard
router.get('/dashboard/stats', dashboardController.getStats);

// Veículos da Frota (374 veículos de NST_VEICULOS)
router.get('/veiculos', veiculosController.list);
router.get('/veiculos/secretarias', veiculosController.getSecretarias);
router.get('/veiculos/tipos', veiculosController.getTipos);
router.get('/veiculos/search', veiculosController.searchAutocomplete);
router.get('/veiculos/:id', veiculosController.getById);
router.put('/veiculos/:id/config', requireRole(['ADMIN', 'OPERADOR', 'GESTOR']), veiculosController.updateConfig);

// Trocas de Óleo / Ordens de Serviço
router.get('/trocas', trocasController.list);
router.get('/trocas/:id', trocasController.getById);
router.get('/trocas/:id/etiqueta', trocasController.getEtiqueta);
router.post('/trocas', requireRole(['ADMIN', 'OPERADOR']), trocasController.create);
router.delete('/trocas/:id', requireRole(['ADMIN']), trocasController.deleteTroca);

// Catálogo de Insumos e Almoxarifado
router.get('/produtos', produtosController.list);
router.get('/produtos/categorias', produtosController.getCategorias);
router.get('/produtos/movimentacoes', produtosController.getMovements);
router.post('/produtos', requireRole(['ADMIN', 'OPERADOR', 'GESTOR']), produtosController.create);
router.put('/produtos/:id', requireRole(['ADMIN', 'OPERADOR', 'GESTOR']), produtosController.update);
router.post('/produtos/:id/estoque', requireRole(['ADMIN', 'OPERADOR']), produtosController.adjustStock);

// Relatórios Oficiais
router.get('/relatorios/geral', relatoriosController.getRelatorioGeral);
router.get('/relatorios/vencidos', relatoriosController.getRelatorioVencidos);
router.get('/relatorios/consumo', relatoriosController.getRelatorioConsumo);

// Gerenciamento de Usuários (Apenas Administrador)
router.get('/usuarios', requireRole(['ADMIN']), usuariosController.list);
router.post('/usuarios', requireRole(['ADMIN']), usuariosController.create);
router.put('/usuarios/:id', requireRole(['ADMIN']), usuariosController.update);
router.post('/usuarios/:id/reset-password', requireRole(['ADMIN']), usuariosController.resetPassword);

module.exports = router;
