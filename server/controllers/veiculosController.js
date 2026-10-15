const { execute } = require('../config/database');
const { logAudit } = require('../middleware/auth');

// GET /api/veiculos
async function list(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit) || 15));
    const offset = (page - 1) * limit;

    const { search, secretaria, tipo_veiculo, status_troca, situacao } = req.query;

    let whereClauses = [];
    let binds = {};

    if (search && search.trim()) {
      whereClauses.push(`(
        UPPER(v.PLACA_VEICULO) LIKE UPPER(:search) OR 
        UPPER(v.DESCRICAO_VEICULOS) LIKE UPPER(:search) OR 
        UPPER(v.MARCA_VEICULO) LIKE UPPER(:search) OR 
        UPPER(v.MODELO_VEICULO) LIKE UPPER(:search) OR
        TO_CHAR(v.CODIGO_VEICULO) = :exactCode
      )`);
      binds.search = `%${search.trim()}%`;
      binds.exactCode = search.trim();
    }

    if (secretaria && secretaria.trim()) {
      whereClauses.push(`v.SECRETARIA = :secretaria`);
      binds.secretaria = secretaria.trim();
    }

    if (tipo_veiculo && tipo_veiculo.trim()) {
      whereClauses.push(`v.TIPO_VEICULO = :tipo_veiculo`);
      binds.tipo_veiculo = tipo_veiculo.trim();
    }

    if (situacao && situacao.trim()) {
      whereClauses.push(`v.SITUACAO = :situacao`);
      binds.situacao = situacao.trim();
    }

    if (status_troca && status_troca.trim()) {
      whereClauses.push(`NVL(c.STATUS_TROCA, 'SEM_REGISTRO') = :status_troca`);
      binds.status_troca = status_troca.trim();
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Contagem total
    const countQuery = `
      SELECT COUNT(*) AS TOTAL
      FROM NST_VEICULOS v
      LEFT JOIN LUB_VEICULOS_CONFIG c ON v.CODIGO_VEICULO = c.CODIGO_VEICULO
      ${whereSql}
    `;
    const countRes = await execute(countQuery, binds);
    const total = countRes.rows[0].TOTAL;

    // Busca paginada
    binds.offset = offset;
    binds.limit = limit;

    const dataQuery = `
      SELECT 
        v.CODIGO_VEICULO,
        v.DESCRICAO_VEICULOS,
        v.PLACA_VEICULO,
        v.ANO_FABRICACAO,
        v.ANO_MODELO,
        v.MARCA_VEICULO,
        v.MODELO_VEICULO,
        v.SECRETARIA,
        v.TIPO_VEICULO,
        v.SITUACAO,
        NVL(c.KM_ATUAL, 0) AS KM_ATUAL,
        NVL(c.HORAS_ATUAL, 0) AS HORAS_ATUAL,
        TO_CHAR(c.DATA_ULTIMA_TROCA, 'YYYY-MM-DD') AS DATA_ULTIMA_TROCA,
        c.KM_ULTIMA_TROCA,
        TO_CHAR(c.DATA_PROXIMA_TROCA, 'YYYY-MM-DD') AS DATA_PROXIMA_TROCA,
        c.KM_PROXIMA_TROCA,
        NVL(c.STATUS_TROCA, 'SEM_REGISTRO') AS STATUS_TROCA,
        c.MOTORISTA_RESPONSAVEL,
        c.LOCAL_GARAGEM,
        p.NOME_PLANO,
        p.CAPACIDADE_CARTER_LITROS,
        p.VISCOSIDADE_RECOMENDADA,
        p.INTERVALO_KM
      FROM NST_VEICULOS v
      LEFT JOIN LUB_VEICULOS_CONFIG c ON v.CODIGO_VEICULO = c.CODIGO_VEICULO
      LEFT JOIN LUB_PLANOS_LUBRIFICACAO p ON c.ID_PLANO = p.ID_PLANO
      ${whereSql}
      ORDER BY 
        CASE NVL(c.STATUS_TROCA, 'SEM_REGISTRO')
          WHEN 'VENCIDO' THEN 1
          WHEN 'ALERTA' THEN 2
          WHEN 'SEM_REGISTRO' THEN 3
          WHEN 'REGULAR' THEN 4
          ELSE 5
        END,
        v.SECRETARIA ASC,
        v.MODELO_VEICULO ASC
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `;

    const dataRes = await execute(dataQuery, binds);

    return res.json({
      success: true,
      data: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Erro ao listar veículos:', err);
    return res.status(500).json({ success: false, message: 'Erro ao consultar frota de veículos.' });
  }
}

// GET /api/veiculos/secretarias
async function getSecretarias(req, res) {
  try {
    const result = await execute(`
      SELECT 
        SECRETARIA,
        COUNT(*) AS TOTAL_VEICULOS
      FROM NST_VEICULOS
      WHERE SECRETARIA IS NOT NULL
      GROUP BY SECRETARIA
      ORDER BY SECRETARIA ASC
    `);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erro ao buscar secretarias:', err);
    return res.status(500).json({ success: false, message: 'Erro ao carregar secretarias.' });
  }
}

// GET /api/veiculos/tipos
async function getTipos(req, res) {
  try {
    const result = await execute(`
      SELECT 
        TIPO_VEICULO,
        COUNT(*) AS TOTAL_VEICULOS
      FROM NST_VEICULOS
      WHERE TIPO_VEICULO IS NOT NULL
      GROUP BY TIPO_VEICULO
      ORDER BY TIPO_VEICULO ASC
    `);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erro ao buscar tipos de veículos:', err);
    return res.status(500).json({ success: false, message: 'Erro ao carregar tipos de veículos.' });
  }
}

// GET /api/veiculos/search
async function searchAutocomplete(req, res) {
  try {
    const term = req.query.q || '';
    if (!term || term.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const query = `
      SELECT * FROM (
        SELECT 
          v.CODIGO_VEICULO,
          v.PLACA_VEICULO,
          v.DESCRICAO_VEICULOS,
          v.MARCA_VEICULO,
          v.MODELO_VEICULO,
          v.SECRETARIA,
          v.TIPO_VEICULO,
          NVL(c.KM_ATUAL, 0) AS KM_ATUAL,
          NVL(c.STATUS_TROCA, 'SEM_REGISTRO') AS STATUS_TROCA,
          c.KM_PROXIMA_TROCA,
          TO_CHAR(c.DATA_PROXIMA_TROCA, 'YYYY-MM-DD') AS DATA_PROXIMA_TROCA,
          p.ID_PLANO,
          p.NOME_PLANO,
          p.CAPACIDADE_CARTER_LITROS,
          p.VISCOSIDADE_RECOMENDADA,
          p.INTERVALO_KM,
          p.INTERVALO_MESES
        FROM NST_VEICULOS v
        LEFT JOIN LUB_VEICULOS_CONFIG c ON v.CODIGO_VEICULO = c.CODIGO_VEICULO
        LEFT JOIN LUB_PLANOS_LUBRIFICACAO p ON c.ID_PLANO = p.ID_PLANO
        WHERE 
          UPPER(v.PLACA_VEICULO) LIKE UPPER(:term) OR 
          UPPER(v.MODELO_VEICULO) LIKE UPPER(:term) OR 
          UPPER(v.DESCRICAO_VEICULOS) LIKE UPPER(:term) OR
          TO_CHAR(v.CODIGO_VEICULO) = :exact
        ORDER BY v.PLACA_VEICULO ASC
      ) WHERE ROWNUM <= 20
    `;

    const result = await execute(query, {
      term: `%${term.trim()}%`,
      exact: term.trim()
    });

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Erro no autocomplete de veículos:', err);
    return res.status(500).json({ success: false, message: 'Erro na busca de veículos.' });
  }
}

// GET /api/veiculos/:id
async function getById(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID do veículo inválido.' });
    }

    // 1. Dados cadastrais e configuração
    const veiculoRes = await execute(`
      SELECT 
        v.CODIGO_VEICULO,
        v.DESCRICAO_VEICULOS,
        v.PLACA_VEICULO,
        v.ANO_FABRICACAO,
        v.ANO_MODELO,
        v.MARCA_VEICULO,
        v.MODELO_VEICULO,
        v.SECRETARIA,
        v.TIPO_VEICULO,
        v.SITUACAO,
        NVL(c.KM_ATUAL, 0) AS KM_ATUAL,
        NVL(c.HORAS_ATUAL, 0) AS HORAS_ATUAL,
        TO_CHAR(c.DATA_ULTIMA_TROCA, 'YYYY-MM-DD') AS DATA_ULTIMA_TROCA,
        c.KM_ULTIMA_TROCA,
        c.HORAS_ULTIMA_TROCA,
        TO_CHAR(c.DATA_PROXIMA_TROCA, 'YYYY-MM-DD') AS DATA_PROXIMA_TROCA,
        c.KM_PROXIMA_TROCA,
        c.HORAS_PROXIMA_TROCA,
        NVL(c.STATUS_TROCA, 'SEM_REGISTRO') AS STATUS_TROCA,
        c.MOTORISTA_RESPONSAVEL,
        c.LOCAL_GARAGEM,
        c.OBSERVACOES AS OBS_CONFIG,
        c.ID_PLANO,
        p.NOME_PLANO,
        p.CAPACIDADE_CARTER_LITROS,
        p.VISCOSIDADE_RECOMENDADA,
        p.INTERVALO_KM,
        p.INTERVALO_MESES,
        p.INTERVALO_HORAS
      FROM NST_VEICULOS v
      LEFT JOIN LUB_VEICULOS_CONFIG c ON v.CODIGO_VEICULO = c.CODIGO_VEICULO
      LEFT JOIN LUB_PLANOS_LUBRIFICACAO p ON c.ID_PLANO = p.ID_PLANO
      WHERE v.CODIGO_VEICULO = :1
    `, [id]);

    if (!veiculoRes.rows || veiculoRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Veículo não encontrado.' });
    }

    const veiculo = veiculoRes.rows[0];

    // 2. Histórico de Trocas de Óleo e Lubrificação
    const historicoRes = await execute(`
      SELECT 
        t.ID_TROCA,
        t.NUMERO_OS,
        TO_CHAR(t.DATA_SERVICO, 'YYYY-MM-DD') AS DATA_SERVICO,
        t.KM_REGISTRADO,
        t.HORAS_REGISTRADO,
        t.TIPO_SERVICO,
        t.LOCAL_EXECUCAO,
        t.MECANICO_RESPONSAVEL,
        t.TROCOU_OLEO_MOTOR,
        t.TROCOU_FILTRO_OLEO,
        t.TROCOU_FILTRO_AR,
        t.TROCOU_FILTRO_COMBUSTIVEL,
        t.TROCOU_FILTRO_CABINE,
        t.LUBRIFICOU_CHASSIS,
        t.TROCOU_OLEO_CAMBIO,
        t.TROCOU_OLEO_DIFERENCIAL,
        t.TROCOU_FLUIDO_FREIO,
        t.TROCOU_ARREFECIMENTO,
        t.KM_PROXIMA_TROCA,
        TO_CHAR(t.DATA_PROXIMA_TROCA, 'YYYY-MM-DD') AS DATA_PROXIMA_TROCA,
        t.VALOR_TOTAL_SERVICO,
        t.STATUS,
        t.CHECKLIST_STATUS,
        t.OBSERVACOES,
        u.NOME_COMPLETO AS USUARIO_REGISTRO
      FROM LUB_REGISTROS_TROCA t
      LEFT JOIN LUB_USUARIOS u ON t.ID_USUARIO_REGISTRO = u.ID_USUARIO
      WHERE t.CODIGO_VEICULO = :1
      ORDER BY t.DATA_SERVICO DESC, t.ID_TROCA DESC
    `, [id]);

    return res.json({
      success: true,
      veiculo,
      historico: historicoRes.rows
    });
  } catch (err) {
    console.error('Erro ao buscar detalhes do veículo:', err);
    return res.status(500).json({ success: false, message: 'Erro ao carregar dados do veículo.' });
  }
}

// PUT /api/veiculos/:id/config
async function updateConfig(req, res) {
  try {
    const id = parseInt(req.params.id);
    const {
      kmAtual,
      horasAtual,
      idPlano,
      motoristaResponsavel,
      localGaragem,
      observacoes
    } = req.body;

    // Verifica se registro de config existe, caso contrário insere
    const existsRes = await execute(
      `SELECT COUNT(*) AS CNT FROM LUB_VEICULOS_CONFIG WHERE CODIGO_VEICULO = :1`,
      [id]
    );

    if (existsRes.rows[0].CNT === 0) {
      await execute(
        `INSERT INTO LUB_VEICULOS_CONFIG (CODIGO_VEICULO, KM_ATUAL, HORAS_ATUAL, ID_PLANO, MOTORISTA_RESPONSAVEL, LOCAL_GARAGEM, OBSERVACOES)
         VALUES (:1, :2, :3, :4, :5, :6, :7)`,
        [id, kmAtual || 0, horasAtual || 0, idPlano || null, motoristaResponsavel || null, localGaragem || null, observacoes || null]
      );
    } else {
      await execute(
        `UPDATE LUB_VEICULOS_CONFIG 
         SET KM_ATUAL = :1,
             HORAS_ATUAL = :2,
             ID_PLANO = :3,
             MOTORISTA_RESPONSAVEL = :4,
             LOCAL_GARAGEM = :5,
             OBSERVACOES = :6
         WHERE CODIGO_VEICULO = :7`,
        [kmAtual || 0, horasAtual || 0, idPlano || null, motoristaResponsavel || null, localGaragem || null, observacoes || null, id]
      );
    }

    // Recalcular status da troca
    await recalcularStatusVeiculo(id);

    await logAudit(
      req,
      'ATUALIZACAO_CONFIG_VEICULO',
      'LUB_VEICULOS_CONFIG',
      id,
      `Configuração do veículo COD=${id} atualizada (KM Atual: ${kmAtual}).`
    );

    return res.json({ success: true, message: 'Configuração do veículo atualizada com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar configuração do veículo:', err);
    return res.status(500).json({ success: false, message: 'Erro ao salvar alterações.' });
  }
}

// Helper para recalcular o status de troca do veículo
async function recalcularStatusVeiculo(codigoVeiculo) {
  try {
    const res = await execute(`
      SELECT 
        c.KM_ATUAL,
        c.KM_PROXIMA_TROCA,
        c.DATA_PROXIMA_TROCA,
        c.DATA_ULTIMA_TROCA
      FROM LUB_VEICULOS_CONFIG c
      WHERE c.CODIGO_VEICULO = :1
    `, [codigoVeiculo]);

    if (!res.rows || res.rows.length === 0) return;

    const row = res.rows[0];
    if (!row.DATA_ULTIMA_TROCA && !row.KM_PROXIMA_TROCA) {
      await execute(`UPDATE LUB_VEICULOS_CONFIG SET STATUS_TROCA = 'SEM_REGISTRO' WHERE CODIGO_VEICULO = :1`, [codigoVeiculo]);
      return;
    }

    let status = 'REGULAR';
    const kmAtual = row.KM_ATUAL || 0;
    const kmProx = row.KM_PROXIMA_TROCA;
    const dataProx = row.DATA_PROXIMA_TROCA ? new Date(row.DATA_PROXIMA_TROCA) : null;
    const hoje = new Date();

    // Regra de Vencimento
    if ((kmProx && kmAtual >= kmProx) || (dataProx && hoje >= dataProx)) {
      status = 'VENCIDO';
    } 
    // Regra de Alerta (faltando até 500 km ou 15 dias)
    else if ((kmProx && kmProx - kmAtual <= 500) || (dataProx && (dataProx - hoje) / (1000 * 60 * 60 * 24) <= 15)) {
      status = 'ALERTA';
    }

    await execute(`UPDATE LUB_VEICULOS_CONFIG SET STATUS_TROCA = :1 WHERE CODIGO_VEICULO = :2`, [status, codigoVeiculo]);
  } catch (e) {
    console.error('Erro ao recalcular status do veículo:', e);
  }
}

module.exports = {
  list,
  getSecretarias,
  getTipos,
  searchAutocomplete,
  getById,
  updateConfig,
  recalcularStatusVeiculo
};
