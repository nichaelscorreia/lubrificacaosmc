const { execute } = require('../config/database');

// GET /api/dashboard/stats
async function getStats(req, res) {
  try {
    // 1. Métricas da Frota
    const totalFrotaRes = await execute(`SELECT COUNT(*) AS TOTAL FROM NST_VEICULOS`);
    const totalFrota = totalFrotaRes.rows[0].TOTAL;

    const frotaAtivaRes = await execute(`SELECT COUNT(*) AS ATIVOS FROM NST_VEICULOS WHERE SITUACAO = 'ATIVO'`);
    const frotaAtiva = frotaAtivaRes.rows[0].ATIVOS;

    // 2. Status de Trocas da Frota
    const statusRes = await execute(`
      SELECT 
        NVL(STATUS_TROCA, 'SEM_REGISTRO') AS STATUS,
        COUNT(*) AS TOTAL
      FROM LUB_VEICULOS_CONFIG
      GROUP BY NVL(STATUS_TROCA, 'SEM_REGISTRO')
    `);

    let emDia = 0, emAlerta = 0, vencidos = 0, semRegistro = 0;
    statusRes.rows.forEach(r => {
      if (r.STATUS === 'REGULAR') emDia = r.TOTAL;
      else if (r.STATUS === 'ALERTA') emAlerta = r.TOTAL;
      else if (r.STATUS === 'VENCIDO') vencidos = r.TOTAL;
      else semRegistro += r.TOTAL;
    });

    // Se houver veículos em NST_VEICULOS que ainda não estão em LUB_VEICULOS_CONFIG, somar a semRegistro
    const totalConfig = emDia + emAlerta + vencidos + semRegistro;
    if (totalFrota > totalConfig) {
      semRegistro += (totalFrota - totalConfig);
    }

    // 3. Trocas Realizadas no Mês Atual e no Ano
    const trocasMesRes = await execute(`
      SELECT 
        COUNT(*) AS TOTAL_MES,
        NVL(SUM(VALOR_TOTAL_SERVICO), 0) AS CUSTO_MES
      FROM LUB_REGISTROS_TROCA
      WHERE EXTRACT(MONTH FROM DATA_SERVICO) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM DATA_SERVICO) = EXTRACT(YEAR FROM CURRENT_DATE)
        AND STATUS = 'CONCLUIDO'
    `);

    const trocasAnoRes = await execute(`
      SELECT 
        COUNT(*) AS TOTAL_ANO,
        NVL(SUM(VALOR_TOTAL_SERVICO), 0) AS CUSTO_ANO
      FROM LUB_REGISTROS_TROCA
      WHERE EXTRACT(YEAR FROM DATA_SERVICO) = EXTRACT(YEAR FROM CURRENT_DATE)
        AND STATUS = 'CONCLUIDO'
    `);

    // 4. Litros de Óleo de Motor Consumidos no Mês
    const litrosMesRes = await execute(`
      SELECT NVL(SUM(i.QUANTIDADE), 0) AS TOTAL_LITROS
      FROM LUB_ITENS_TROCA i
      JOIN LUB_REGISTROS_TROCA t ON i.ID_TROCA = t.ID_TROCA
      JOIN LUB_PRODUTOS p ON i.ID_PRODUTO = p.ID_PRODUTO
      JOIN LUB_CATEGORIAS_PRODUTO c ON p.ID_CATEGORIA = c.ID_CATEGORIA
      WHERE c.TIPO_APLICACAO = 'MOTOR'
        AND EXTRACT(MONTH FROM t.DATA_SERVICO) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM t.DATA_SERVICO) = EXTRACT(YEAR FROM CURRENT_DATE)
    `);

    // 5. Distribuição de Veículos por Secretaria (Top 10)
    const secretariasRes = await execute(`
      SELECT 
        NVL(SECRETARIA, 'NÃO INFORMADA') AS SECRETARIA,
        COUNT(*) AS TOTAL
      FROM NST_VEICULOS
      GROUP BY SECRETARIA
      ORDER BY TOTAL DESC
    `);

    // 6. Distribuição por Tipo de Veículo
    const tiposRes = await execute(`
      SELECT 
        NVL(TIPO_VEICULO, 'OUTROS') AS TIPO,
        COUNT(*) AS TOTAL
      FROM NST_VEICULOS
      GROUP BY TIPO_VEICULO
      ORDER BY TOTAL DESC
    `);

    // 7. Histórico dos últimos 6 meses de trocas
    const historicoMesesRes = await execute(`
      SELECT 
        TO_CHAR(DATA_SERVICO, 'YYYY-MM') AS MES_ANO,
        TO_CHAR(DATA_SERVICO, 'Mon/YY') AS ROTULO,
        COUNT(*) AS TOTAL_TROCAS,
        NVL(SUM(VALOR_TOTAL_SERVICO), 0) AS VALOR_TOTAL
      FROM LUB_REGISTROS_TROCA
      WHERE DATA_SERVICO >= ADD_MONTHS(TRUNC(CURRENT_DATE, 'MM'), -5)
      GROUP BY TO_CHAR(DATA_SERVICO, 'YYYY-MM'), TO_CHAR(DATA_SERVICO, 'Mon/YY')
      ORDER BY MES_ANO ASC
    `);

    // 8. Veículos que exigem atenção imediata (Vencidos ou Alerta)
    const alertasRes = await execute(`
      SELECT * FROM (
        SELECT 
          v.CODIGO_VEICULO,
          v.PLACA_VEICULO,
          v.DESCRICAO_VEICULOS,
          v.MARCA_VEICULO,
          v.MODELO_VEICULO,
          v.SECRETARIA,
          v.TIPO_VEICULO,
          c.KM_ATUAL,
          c.KM_PROXIMA_TROCA,
          TO_CHAR(c.DATA_PROXIMA_TROCA, 'YYYY-MM-DD') AS DATA_PROXIMA_TROCA,
          TO_CHAR(c.DATA_ULTIMA_TROCA, 'YYYY-MM-DD') AS DATA_ULTIMA_TROCA,
          NVL(c.STATUS_TROCA, 'SEM_REGISTRO') AS STATUS_TROCA,
          CASE 
            WHEN c.KM_PROXIMA_TROCA IS NOT NULL AND c.KM_ATUAL > c.KM_PROXIMA_TROCA THEN (c.KM_ATUAL - c.KM_PROXIMA_TROCA)
            ELSE 0
          END AS KM_ATRASO
        FROM NST_VEICULOS v
        JOIN LUB_VEICULOS_CONFIG c ON v.CODIGO_VEICULO = c.CODIGO_VEICULO
        WHERE c.STATUS_TROCA IN ('VENCIDO', 'ALERTA', 'SEM_REGISTRO')
        ORDER BY 
          CASE c.STATUS_TROCA
            WHEN 'VENCIDO' THEN 1
            WHEN 'ALERTA' THEN 2
            WHEN 'SEM_REGISTRO' THEN 3
            ELSE 4
          END,
          KM_ATRASO DESC
      ) WHERE ROWNUM <= 8
    `);

    // 9. Últimas 5 Trocas Realizadas
    const ultimasTrocasRes = await execute(`
      SELECT * FROM (
        SELECT 
          t.ID_TROCA,
          t.NUMERO_OS,
          t.CODIGO_VEICULO,
          v.PLACA_VEICULO,
          v.MODELO_VEICULO,
          v.SECRETARIA,
          TO_CHAR(t.DATA_SERVICO, 'YYYY-MM-DD') AS DATA_SERVICO,
          t.KM_REGISTRADO,
          t.TIPO_SERVICO,
          t.MECANICO_RESPONSAVEL,
          t.VALOR_TOTAL_SERVICO,
          t.STATUS
        FROM LUB_REGISTROS_TROCA t
        JOIN NST_VEICULOS v ON t.CODIGO_VEICULO = v.CODIGO_VEICULO
        ORDER BY t.DATA_SERVICO DESC, t.ID_TROCA DESC
      ) WHERE ROWNUM <= 5
    `);

    return res.json({
      success: true,
      stats: {
        totalFrota,
        frotaAtiva,
        emDia,
        emAlerta,
        vencidos,
        semRegistro,
        trocasMes: trocasMesRes.rows[0].TOTAL_MES,
        custoMes: trocasMesRes.rows[0].CUSTO_MES,
        trocasAno: trocasAnoRes.rows[0].TOTAL_ANO,
        custoAno: trocasAnoRes.rows[0].CUSTO_ANO,
        litrosMes: litrosMesRes.rows[0].TOTAL_LITROS
      },
      charts: {
        secretarias: secretariasRes.rows,
        tipos: tiposRes.rows,
        historicoMeses: historicoMesesRes.rows
      },
      alertas: alertasRes.rows,
      ultimasTrocas: ultimasTrocasRes.rows
    });
  } catch (err) {
    console.error('Erro ao gerar estatísticas do dashboard:', err);
    return res.status(500).json({ success: false, message: 'Erro ao carregar dados do painel.' });
  }
}

module.exports = {
  getStats
};
