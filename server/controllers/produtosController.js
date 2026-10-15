const { execute } = require('../config/database');
const { logAudit } = require('../middleware/auth');

// GET /api/produtos
async function list(req, res) {
  try {
    const { idCategoria, search, apenasAtivos, estoqueBaixo } = req.query;

    let whereClauses = [];
    let binds = {};

    if (idCategoria) {
      whereClauses.push(`p.ID_CATEGORIA = :idCategoria`);
      binds.idCategoria = parseInt(idCategoria);
    }

    if (search && search.trim()) {
      whereClauses.push(`(
        UPPER(p.NOME_PRODUTO) LIKE UPPER(:search) OR
        UPPER(p.MARCA) LIKE UPPER(:search) OR
        UPPER(p.ESPECIFICACAO) LIKE UPPER(:search) OR
        UPPER(p.CODIGO_PRODUTO) LIKE UPPER(:search)
      )`);
      binds.search = `%${search.trim()}%`;
    }

    if (apenasAtivos === 'true' || apenasAtivos === true) {
      whereClauses.push(`p.ATIVO = 'S'`);
    }

    if (estoqueBaixo === 'true' || estoqueBaixo === true) {
      whereClauses.push(`p.ESTOQUE_ATUAL <= p.ESTOQUE_MINIMO`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT 
        p.ID_PRODUTO,
        p.ID_CATEGORIA,
        c.NOME_CATEGORIA,
        c.TIPO_APLICACAO,
        p.CODIGO_PRODUTO,
        p.NOME_PRODUTO,
        p.MARCA,
        p.ESPECIFICACAO,
        p.UNIDADE_MEDIDA,
        NVL(p.ESTOQUE_ATUAL, 0) AS ESTOQUE_ATUAL,
        NVL(p.ESTOQUE_MINIMO, 0) AS ESTOQUE_MINIMO,
        NVL(p.VALOR_UNITARIO_ESTIMADO, 0) AS VALOR_UNITARIO_ESTIMADO,
        p.ATIVO,
        p.OBSERVACOES,
        CASE 
          WHEN p.ESTOQUE_ATUAL <= 0 THEN 'ZERADO'
          WHEN p.ESTOQUE_ATUAL <= p.ESTOQUE_MINIMO THEN 'BAIXO'
          ELSE 'NORMAL'
        END AS STATUS_ESTOQUE
      FROM LUB_PRODUTOS p
      JOIN LUB_CATEGORIAS_PRODUTO c ON p.ID_CATEGORIA = c.ID_CATEGORIA
      ${whereSql}
      ORDER BY c.TIPO_APLICACAO ASC, p.NOME_PRODUTO ASC
    `;

    const result = await execute(query, binds);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erro ao listar produtos:', err);
    return res.status(500).json({ success: false, message: 'Erro ao consultar catálogo de produtos.' });
  }
}

// GET /api/produtos/categorias
async function getCategorias(req, res) {
  try {
    const result = await execute(`
      SELECT 
        c.ID_CATEGORIA,
        c.NOME_CATEGORIA,
        c.DESCRICAO,
        c.TIPO_APLICACAO,
        COUNT(p.ID_PRODUTO) AS TOTAL_PRODUTOS
      FROM LUB_CATEGORIAS_PRODUTO c
      LEFT JOIN LUB_PRODUTOS p ON c.ID_CATEGORIA = p.ID_CATEGORIA
      GROUP BY c.ID_CATEGORIA, c.NOME_CATEGORIA, c.DESCRICAO, c.TIPO_APLICACAO
      ORDER BY c.NOME_CATEGORIA ASC
    `);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erro ao listar categorias:', err);
    return res.status(500).json({ success: false, message: 'Erro ao carregar categorias.' });
  }
}

// POST /api/produtos
async function create(req, res) {
  try {
    const {
      idCategoria,
      codigoProduto,
      nomeProduto,
      marca,
      especificacao,
      unidadeMedida,
      estoqueAtual,
      estoqueMinimo,
      valorUnitarioEstimado,
      observacoes
    } = req.body;

    if (!idCategoria || !nomeProduto) {
      return res.status(400).json({ success: false, message: 'Categoria e Nome do Produto são obrigatórios.' });
    }

    await execute(`
      INSERT INTO LUB_PRODUTOS (
        ID_CATEGORIA, CODIGO_PRODUTO, NOME_PRODUTO, MARCA, ESPECIFICACAO,
        UNIDADE_MEDIDA, ESTOQUE_ATUAL, ESTOQUE_MINIMO, VALOR_UNITARIO_ESTIMADO, ATIVO, OBSERVACOES
      ) VALUES (
        :1, :2, :3, :4, :5, :6, :7, :8, :9, 'S', :10
      )
    `, [
      idCategoria,
      codigoProduto || null,
      nomeProduto,
      marca || null,
      especificacao || null,
      unidadeMedida || 'LITRO',
      estoqueAtual || 0,
      estoqueMinimo || 0,
      valorUnitarioEstimado || 0,
      observacoes || null
    ]);

    await logAudit(req, 'CADASTRO_PRODUTO', 'LUB_PRODUTOS', null, `Produto cadastrado: ${nomeProduto}`);

    return res.status(201).json({ success: true, message: 'Produto cadastrado com sucesso!' });
  } catch (err) {
    console.error('Erro ao cadastrar produto:', err);
    return res.status(500).json({ success: false, message: 'Erro ao salvar produto no catálogo.' });
  }
}

// PUT /api/produtos/:id
async function update(req, res) {
  try {
    const id = parseInt(req.params.id);
    const {
      idCategoria,
      codigoProduto,
      nomeProduto,
      marca,
      especificacao,
      unidadeMedida,
      estoqueMinimo,
      valorUnitarioEstimado,
      ativo,
      observacoes
    } = req.body;

    await execute(`
      UPDATE LUB_PRODUTOS
      SET ID_CATEGORIA = :1,
          CODIGO_PRODUTO = :2,
          NOME_PRODUTO = :3,
          MARCA = :4,
          ESPECIFICACAO = :5,
          UNIDADE_MEDIDA = :6,
          ESTOQUE_MINIMO = :7,
          VALOR_UNITARIO_ESTIMADO = :8,
          ATIVO = :9,
          OBSERVACOES = :10
      WHERE ID_PRODUTO = :11
    `, [
      idCategoria,
      codigoProduto || null,
      nomeProduto,
      marca || null,
      especificacao || null,
      unidadeMedida || 'LITRO',
      estoqueMinimo || 0,
      valorUnitarioEstimado || 0,
      ativo || 'S',
      observacoes || null,
      id
    ]);

    await logAudit(req, 'ALTERACAO_PRODUTO', 'LUB_PRODUTOS', id, `Produto ${id} (${nomeProduto}) atualizado.`);

    return res.json({ success: true, message: 'Produto atualizado com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar produto:', err);
    return res.status(500).json({ success: false, message: 'Erro ao atualizar produto.' });
  }
}

// POST /api/produtos/:id/estoque (Entrada ou Ajuste de Estoque)
async function adjustStock(req, res) {
  try {
    const id = parseInt(req.params.id);
    const { tipoMovimento, quantidade, numeroDocumento, observacoes } = req.body;

    const qtd = parseFloat(quantidade);
    if (!qtd || qtd <= 0) {
      return res.status(400).json({ success: false, message: 'Informe uma quantidade válida.' });
    }

    const prodRes = await execute(`SELECT ESTOQUE_ATUAL, NOME_PRODUTO FROM LUB_PRODUTOS WHERE ID_PRODUTO = :1`, [id]);
    if (!prodRes.rows || prodRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Produto não encontrado.' });
    }

    const saldoAnterior = prodRes.rows[0].ESTOQUE_ATUAL || 0;
    let saldoPosterior = saldoAnterior;

    if (tipoMovimento === 'ENTRADA') {
      saldoPosterior = saldoAnterior + qtd;
    } else if (tipoMovimento === 'SAIDA_MANUAL') {
      saldoPosterior = Math.max(0, saldoAnterior - qtd);
    } else if (tipoMovimento === 'AJUSTE_INVENTARIO') {
      saldoPosterior = qtd;
    } else {
      return res.status(400).json({ success: false, message: 'Tipo de movimentação inválido.' });
    }

    // Atualiza saldo na tabela de produtos
    await execute(`UPDATE LUB_PRODUTOS SET ESTOQUE_ATUAL = :1 WHERE ID_PRODUTO = :2`, [saldoPosterior, id]);

    // Grava histórico
    await execute(`
      INSERT INTO LUB_ESTOQUE_MOVIMENTACOES (
        ID_PRODUTO, TIPO_MOVIMENTO, QUANTIDADE, SALDO_ANTERIOR, SALDO_POSTERIOR, NUMERO_DOCUMENTO, ID_USUARIO, OBSERVACOES
      ) VALUES (:1, :2, :3, :4, :5, :6, :7, :8)
    `, [
      id,
      tipoMovimento,
      qtd,
      saldoAnterior,
      saldoPosterior,
      numeroDocumento || null,
      req.user ? req.user.idUsuario : null,
      observacoes || `Ajuste manual de estoque`
    ]);

    await logAudit(
      req,
      'AJUSTE_ESTOQUE',
      'LUB_PRODUTOS',
      id,
      `Movimento ${tipoMovimento} de ${qtd} unidades para o produto ${prodRes.rows[0].NOME_PRODUTO}. Novo saldo: ${saldoPosterior}`
    );

    return res.json({
      success: true,
      message: 'Movimentação de estoque lançada com sucesso!',
      novoSaldo: saldoPosterior
    });
  } catch (err) {
    console.error('Erro ao ajustar estoque:', err);
    return res.status(500).json({ success: false, message: 'Erro ao movimentar estoque.' });
  }
}

// GET /api/produtos/movimentacoes
async function getMovements(req, res) {
  try {
    const idProduto = req.query.idProduto ? parseInt(req.query.idProduto) : null;
    let whereClause = idProduto ? `WHERE m.ID_PRODUTO = :1` : '';
    let binds = idProduto ? [idProduto] : [];

    const result = await execute(`
      SELECT * FROM (
        SELECT 
          m.ID_MOVIMENTACAO,
          m.ID_PRODUTO,
          p.NOME_PRODUTO,
          p.UNIDADE_MEDIDA,
          m.TIPO_MOVIMENTO,
          m.QUANTIDADE,
          m.SALDO_ANTERIOR,
          m.SALDO_POSTERIOR,
          m.NUMERO_DOCUMENTO,
          m.ID_TROCA,
          TO_CHAR(m.DATA_MOVIMENTO, 'YYYY-MM-DD HH24:MI') AS DATA_MOVIMENTO,
          m.OBSERVACOES,
          u.NOME_COMPLETO AS USUARIO_NOME
        FROM LUB_ESTOQUE_MOVIMENTACOES m
        JOIN LUB_PRODUTOS p ON m.ID_PRODUTO = p.ID_PRODUTO
        LEFT JOIN LUB_USUARIOS u ON m.ID_USUARIO = u.ID_USUARIO
        ${whereClause}
        ORDER BY m.DATA_MOVIMENTO DESC, m.ID_MOVIMENTACAO DESC
      ) WHERE ROWNUM <= 100
    `, binds);

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erro ao buscar movimentações de estoque:', err);
    return res.status(500).json({ success: false, message: 'Erro ao consultar histórico de estoque.' });
  }
}

module.exports = {
  list,
  getCategorias,
  create,
  update,
  adjustStock,
  getMovements
};
