const { execute } = require('../config/database');

// GET /api/relatorios/geral
async function getRelatorioGeral(req, res) {
  try {
    const { dataInicio, dataFim, secretaria, tipoVeiculo } = req.query;

    let whereClauses = [`t.STATUS = 'CONCLUIDO'`];
    let binds = {};

    if (dataInicio) {
      whereClauses.push(`t.DATA_SERVICO >= TO_DATE(:dataInicio, 'YYYY-MM-DD')`);
      binds.dataInicio = dataInicio;
    }

    if (dataFim) {
      whereClauses.push(`t.DATA_SERVICO <= TO_DATE(:dataFim, 'YYYY-MM-DD')`);
      binds.dataFim = dataFim;
    }

    if (secretaria && secretaria.trim()) {
      whereClauses.push(`v.SECRETARIA = :secretaria`);
      binds.secretaria = secretaria.trim();
    }

    if (tipoVeiculo && tipoVeiculo.trim()) {
      whereClauses.push(`v.TIPO_VEICULO = :tipoVeiculo`);
      binds.tipoVeiculo = tipoVeiculo.trim();
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    // Resumo dos Totais
    const totaisRes = await execute(`
      SELECT 
        COUNT(DISTINCT t.ID_TROCA) AS TOTAL_SERVICOS,
        COUNT(DISTINCT t.CODIGO_VEICULO) AS TOTAL_VEICULOS_ATENDIDOS,
        NVL(SUM(t.VALOR_TOTAL_SERVICO), 0) AS VALOR_TOTAL_GERAL,
        SUM(CASE WHEN t.TROCOU_OLEO_MOTOR = 'S' THEN 1 ELSE 0 END) AS TOTAL_TROCA_MOTOR,
        SUM(CASE WHEN t.TROCOU_FILTRO_OLEO = 'S' THEN 1 ELSE 0 END) AS TOTAL_FILTRO_OLEO,
        SUM(CASE WHEN t.TROCOU_FILTRO_AR = 'S' THEN 1 ELSE 0 END) AS TOTAL_FILTRO_AR,
        SUM(CASE WHEN t.TROCOU_FILTRO_COMBUSTIVEL = 'S' THEN 1 ELSE 0 END) AS TOTAL_FILTRO_COMB,
        SUM(CASE WHEN t.LUBRIFICOU_CHASSIS = 'S' THEN 1 ELSE 0 END) AS TOTAL_CHASSIS
      FROM LUB_REGISTROS_TROCA t
      JOIN NST_VEICULOS v ON t.CODIGO_VEICULO = v.CODIGO_VEICULO
      ${whereSql}
    `, binds);

    // Lista detalhada para o relatório
    const listaRes = await execute(`
      SELECT 
        t.ID_TROCA,
        t.NUMERO_OS,
        TO_CHAR(t.DATA_SERVICO, 'YYYY-MM-DD') AS DATA_SERVICO,
        TO_CHAR(t.DATA_SERVICO, 'DD/MM/YYYY') AS DATA_SERVICO_BR,
        v.CODIGO_VEICULO,
        v.PLACA_VEICULO,
        v.MODELO_VEICULO,
        v.MARCA_VEICULO,
        v.SECRETARIA,
        v.TIPO_VEICULO,
        t.KM_REGISTRADO,
        t.TIPO_SERVICO,
        t.MECANICO_RESPONSAVEL,
        t.KM_PROXIMA_TROCA,
        TO_CHAR(t.DATA_PROXIMA_TROCA, 'DD/MM/YYYY') AS DATA_PROXIMA_BR,
        t.VALOR_TOTAL_SERVICO,
        t.OBSERVACOES
      FROM LUB_REGISTROS_TROCA t
      JOIN NST_VEICULOS v ON t.CODIGO_VEICULO = v.CODIGO_VEICULO
      ${whereSql}
      ORDER BY t.DATA_SERVICO DESC, t.ID_TROCA DESC
    `, binds);

    return res.json({
      success: true,
      totais: totaisRes.rows[0],
      registros: listaRes.rows
    });
  } catch (err) {
    console.error('Erro ao gerar relatório geral:', err);
    return res.status(500).json({ success: false, message: 'Erro ao emitir relatório geral.' });
  }
}

// GET /api/relatorios/vencidos
async function getRelatorioVencidos(req, res) {
  try {
    const { secretaria } = req.query;
    let whereClause = `WHERE c.STATUS_TROCA IN ('VENCIDO', 'ALERTA', 'SEM_REGISTRO')`;
    let binds = {};

    if (secretaria && secretaria.trim()) {
      whereClause += ` AND v.SECRETARIA = :secretaria`;
      binds.secretaria = secretaria.trim();
    }

    const query = `
      SELECT 
        v.CODIGO_VEICULO,
        v.PLACA_VEICULO,
        v.DESCRICAO_VEICULOS,
        v.MARCA_VEICULO,
        v.MODELO_VEICULO,
        v.SECRETARIA,
        v.TIPO_VEICULO,
        NVL(c.KM_ATUAL, 0) AS KM_ATUAL,
        c.KM_PROXIMA_TROCA,
        TO_CHAR(c.DATA_PROXIMA_TROCA, 'DD/MM/YYYY') AS DATA_PROXIMA_BR,
        TO_CHAR(c.DATA_ULTIMA_TROCA, 'DD/MM/YYYY') AS DATA_ULTIMA_BR,
        c.STATUS_TROCA,
        c.MOTORISTA_RESPONSAVEL,
        c.LOCAL_GARAGEM,
        CASE 
          WHEN c.KM_PROXIMA_TROCA IS NOT NULL AND c.KM_ATUAL > c.KM_PROXIMA_TROCA THEN (c.KM_ATUAL - c.KM_PROXIMA_TROCA)
          ELSE 0
        END AS KM_ATRASO
      FROM NST_VEICULOS v
      JOIN LUB_VEICULOS_CONFIG c ON v.CODIGO_VEICULO = c.CODIGO_VEICULO
      ${whereClause}
      ORDER BY 
        CASE c.STATUS_TROCA
          WHEN 'VENCIDO' THEN 1
          WHEN 'ALERTA' THEN 2
          ELSE 3
        END,
        v.SECRETARIA ASC,
        KM_ATRASO DESC
    `;

    const result = await execute(query, binds);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erro ao gerar relatório de vencidos:', err);
    return res.status(500).json({ success: false, message: 'Erro ao emitir relatório de veículos vencidos.' });
  }
}

// GET /api/relatorios/consumo
async function getRelatorioConsumo(req, res) {
  try {
    const { dataInicio, dataFim, secretaria } = req.query;

    let whereClauses = [`t.STATUS = 'CONCLUIDO'`];
    let binds = {};

    if (dataInicio) {
      whereClauses.push(`t.DATA_SERVICO >= TO_DATE(:dataInicio, 'YYYY-MM-DD')`);
      binds.dataInicio = dataInicio;
    }

    if (dataFim) {
      whereClauses.push(`t.DATA_SERVICO <= TO_DATE(:dataFim, 'YYYY-MM-DD')`);
      binds.dataFim = dataFim;
    }

    if (secretaria && secretaria.trim()) {
      whereClauses.push(`v.SECRETARIA = :secretaria`);
      binds.secretaria = secretaria.trim();
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    // Consumo por Produto
    const consumoProdutoRes = await execute(`
      SELECT 
        p.ID_PRODUTO,
        p.NOME_PRODUTO,
        p.MARCA,
        p.UNIDADE_MEDIDA,
        c.NOME_CATEGORIA,
        SUM(i.QUANTIDADE) AS TOTAL_QUANTIDADE,
        SUM(i.VALOR_TOTAL) AS TOTAL_VALOR,
        COUNT(DISTINCT t.ID_TROCA) AS TOTAL_APLICACOES
      FROM LUB_ITENS_TROCA i
      JOIN LUB_REGISTROS_TROCA t ON i.ID_TROCA = t.ID_TROCA
      JOIN NST_VEICULOS v ON t.CODIGO_VEICULO = v.CODIGO_VEICULO
      JOIN LUB_PRODUTOS p ON i.ID_PRODUTO = p.ID_PRODUTO
      JOIN LUB_CATEGORIAS_PRODUTO c ON p.ID_CATEGORIA = c.ID_CATEGORIA
      ${whereSql}
      GROUP BY p.ID_PRODUTO, p.NOME_PRODUTO, p.MARCA, p.UNIDADE_MEDIDA, c.NOME_CATEGORIA
      ORDER BY TOTAL_QUANTIDADE DESC
    `, binds);

    // Consumo por Secretaria
    const consumoSecretariaRes = await execute(`
      SELECT 
        v.SECRETARIA,
        COUNT(DISTINCT t.ID_TROCA) AS TOTAL_TROCAS,
        COUNT(DISTINCT v.CODIGO_VEICULO) AS VEICULOS_ATENDIDOS,
        NVL(SUM(t.VALOR_TOTAL_SERVICO), 0) AS VALOR_TOTAL
      FROM LUB_REGISTROS_TROCA t
      JOIN NST_VEICULOS v ON t.CODIGO_VEICULO = v.CODIGO_VEICULO
      ${whereSql}
      GROUP BY v.SECRETARIA
      ORDER BY VALOR_TOTAL DESC
    `, binds);

    return res.json({
      success: true,
      porProduto: consumoProdutoRes.rows,
      porSecretaria: consumoSecretariaRes.rows
    });
  } catch (err) {
    console.error('Erro ao gerar relatório de consumo:', err);
    return res.status(500).json({ success: false, message: 'Erro ao emitir relatório de consumo.' });
  }
}

module.exports = {
  getRelatorioGeral,
  getRelatorioVencidos,
  getRelatorioConsumo
};
