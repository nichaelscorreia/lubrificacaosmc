const { execute } = require('../config/database');
const { logAudit } = require('../middleware/auth');
const { recalcularStatusVeiculo } = require('./veiculosController');

// Helper para gerar número sequencial da OS (ex: OS-2026-0001)
async function gerarNumeroOS() {
  const ano = new Date().getFullYear();
  const res = await execute(`
    SELECT COUNT(*) AS TOTAL
    FROM LUB_REGISTROS_TROCA
    WHERE EXTRACT(YEAR FROM DATA_CRIACAO) = :1
  `, [ano]);

  const seq = (res.rows[0].TOTAL + 1).toString().padStart(4, '0');
  return `OS-${ano}-${seq}`;
}

// POST /api/trocas
async function create(req, res) {
  try {
    const {
      codigoVeiculo,
      dataServico,
      kmRegistrado,
      horasRegistrado,
      tipoServico,
      localExecucao,
      mecanicoResponsavel,
      trocouOleoMotor,
      trocouFiltroOleo,
      trocouFiltroAr,
      trocouFiltroCombustivel,
      trocouFiltroCabine,
      lubrificouChassis,
      trocouOleoCambio,
      trocouOleoDiferencial,
      trocouFluidoFreio,
      trocouArrefecimento,
      kmProximaTroca,
      dataProximaTroca,
      horasProximaTroca,
      valorTotalServico,
      checklistStatus,
      observacoes,
      itens // array de { idProduto, descricao, quantidade, unidade, valorUnitario }
    } = req.body;

    if (!codigoVeiculo || !dataServico) {
      return res.status(400).json({ success: false, message: 'Selecione o veículo e a data do serviço.' });
    }

    // 1. Gerar número de OS único
    let numeroOS = await gerarNumeroOS();

    // 2. Inserir Registro de Troca
    const insertTrocaSql = `
      INSERT INTO LUB_REGISTROS_TROCA (
        NUMERO_OS,
        CODIGO_VEICULO,
        DATA_SERVICO,
        KM_REGISTRADO,
        HORAS_REGISTRADO,
        TIPO_SERVICO,
        LOCAL_EXECUCAO,
        MECANICO_RESPONSAVEL,
        ID_USUARIO_REGISTRO,
        TROCOU_OLEO_MOTOR,
        TROCOU_FILTRO_OLEO,
        TROCOU_FILTRO_AR,
        TROCOU_FILTRO_COMBUSTIVEL,
        TROCOU_FILTRO_CABINE,
        LUBRIFICOU_CHASSIS,
        TROCOU_OLEO_CAMBIO,
        TROCOU_OLEO_DIFERENCIAL,
        TROCOU_FLUIDO_FREIO,
        TROCOU_ARREFECIMENTO,
        KM_PROXIMA_TROCA,
        DATA_PROXIMA_TROCA,
        HORAS_PROXIMA_TROCA,
        VALOR_TOTAL_SERVICO,
        STATUS,
        CHECKLIST_STATUS,
        OBSERVACOES
      ) VALUES (
        :1, :2, TO_DATE(:3, 'YYYY-MM-DD'), :4, :5, :6, :7, :8, :9,
        :10, :11, :12, :13, :14, :15, :16, :17, :18, :19,
        :20, TO_DATE(:21, 'YYYY-MM-DD'), :22, :23, 'CONCLUIDO', :24, :25
      )
    `;

    const bindsTroca = [
      numeroOS,
      codigoVeiculo,
      dataServico,
      kmRegistrado || 0,
      horasRegistrado || 0,
      tipoServico || 'PREVENTIVA',
      localExecucao || 'Garagem Central SMC',
      mecanicoResponsavel || 'Mecânico da Garagem Central',
      req.user ? req.user.idUsuario : null,
      trocouOleoMotor ? 'S' : 'N',
      trocouFiltroOleo ? 'S' : 'N',
      trocouFiltroAr ? 'S' : 'N',
      trocouFiltroCombustivel ? 'S' : 'N',
      trocouFiltroCabine ? 'S' : 'N',
      lubrificouChassis ? 'S' : 'N',
      trocouOleoCambio ? 'S' : 'N',
      trocouOleoDiferencial ? 'S' : 'N',
      trocouFluidoFreio ? 'S' : 'N',
      trocouArrefecimento ? 'S' : 'N',
      kmProximaTroca || null,
      dataProximaTroca || null,
      horasProximaTroca || null,
      valorTotalServico || 0,
      checklistStatus || 'APROVADO',
      observacoes || null
    ];

    await execute(insertTrocaSql, bindsTroca);

    // Recupera o ID gerado
    const getInsertedRes = await execute(`SELECT ID_TROCA FROM LUB_REGISTROS_TROCA WHERE NUMERO_OS = :1`, [numeroOS]);
    const idTroca = getInsertedRes.rows[0].ID_TROCA;

    // 3. Inserir itens e baixar estoque se aplicável
    let valorTotalItens = 0;
    if (itens && Array.isArray(itens) && itens.length > 0) {
      for (const item of itens) {
        if (!item.descricao || !item.quantidade) continue;
        const vUnit = parseFloat(item.valorUnitario) || 0;
        const qtd = parseFloat(item.quantidade) || 0;
        const vTotal = vUnit * qtd;
        valorTotalItens += vTotal;

        await execute(`
          INSERT INTO LUB_ITENS_TROCA (
            ID_TROCA, ID_PRODUTO, DESCRICAO_ITEM, QUANTIDADE, UNIDADE, VALOR_UNITARIO, VALOR_TOTAL
          ) VALUES (:1, :2, :3, :4, :5, :6, :7)
        `, [
          idTroca,
          item.idProduto || null,
          item.descricao,
          qtd,
          item.unidade || 'UNIDADE',
          vUnit,
          vTotal
        ]);

        // Baixa de estoque se houver produto vinculado
        if (item.idProduto) {
          const prodRes = await execute(`SELECT ESTOQUE_ATUAL FROM LUB_PRODUTOS WHERE ID_PRODUTO = :1`, [item.idProduto]);
          if (prodRes.rows && prodRes.rows.length > 0) {
            const saldoAnt = prodRes.rows[0].ESTOQUE_ATUAL || 0;
            const saldoPost = Math.max(0, saldoAnt - qtd);

            await execute(`UPDATE LUB_PRODUTOS SET ESTOQUE_ATUAL = :1 WHERE ID_PRODUTO = :2`, [saldoPost, item.idProduto]);

            await execute(`
              INSERT INTO LUB_ESTOQUE_MOVIMENTACOES (
                ID_PRODUTO, TIPO_MOVIMENTO, QUANTIDADE, SALDO_ANTERIOR, SALDO_POSTERIOR, NUMERO_DOCUMENTO, ID_TROCA, ID_USUARIO, OBSERVACOES
              ) VALUES (:1, 'SAIDA_TROCA', :2, :3, :4, :5, :6, :7, :8)
            `, [
              item.idProduto,
              qtd,
              saldoAnt,
              saldoPost,
              numeroOS,
              idTroca,
              req.user ? req.user.idUsuario : null,
              `Saída para OS ${numeroOS}`
            ]);
          }
        }
      }

      // Se valor total não foi informado manualmente, atualiza com a soma dos itens
      if (!valorTotalServico && valorTotalItens > 0) {
        await execute(`UPDATE LUB_REGISTROS_TROCA SET VALOR_TOTAL_SERVICO = :1 WHERE ID_TROCA = :2`, [valorTotalItens, idTroca]);
      }
    }

    // 4. Atualizar LUB_VEICULOS_CONFIG com a nova situação
    const configCheck = await execute(`SELECT CODIGO_VEICULO, KM_ATUAL FROM LUB_VEICULOS_CONFIG WHERE CODIGO_VEICULO = :1`, [codigoVeiculo]);
    const kmNovo = Math.max(configCheck.rows.length > 0 ? (configCheck.rows[0].KM_ATUAL || 0) : 0, kmRegistrado || 0);

    if (configCheck.rows.length === 0) {
      await execute(`
        INSERT INTO LUB_VEICULOS_CONFIG (
          CODIGO_VEICULO, KM_ATUAL, HORAS_ATUAL, DATA_ULTIMA_TROCA, KM_ULTIMA_TROCA, HORAS_ULTIMA_TROCA,
          DATA_PROXIMA_TROCA, KM_PROXIMA_TROCA, HORAS_PROXIMA_TROCA, STATUS_TROCA
        ) VALUES (
          :1, :2, :3, TO_DATE(:4, 'YYYY-MM-DD'), :5, :6,
          TO_DATE(:7, 'YYYY-MM-DD'), :8, :9, 'REGULAR'
        )
      `, [
        codigoVeiculo,
        kmNovo,
        horasRegistrado || 0,
        dataServico,
        kmRegistrado || 0,
        horasRegistrado || 0,
        dataProximaTroca || null,
        kmProximaTroca || null,
        horasProximaTroca || null
      ]);
    } else {
      await execute(`
        UPDATE LUB_VEICULOS_CONFIG
        SET KM_ATUAL = :1,
            HORAS_ATUAL = :2,
            DATA_ULTIMA_TROCA = TO_DATE(:3, 'YYYY-MM-DD'),
            KM_ULTIMA_TROCA = :4,
            HORAS_ULTIMA_TROCA = :5,
            DATA_PROXIMA_TROCA = TO_DATE(:6, 'YYYY-MM-DD'),
            KM_PROXIMA_TROCA = :7,
            HORAS_PROXIMA_TROCA = :8,
            STATUS_TROCA = 'REGULAR'
        WHERE CODIGO_VEICULO = :9
      `, [
        kmNovo,
        horasRegistrado || 0,
        dataServico,
        kmRegistrado || 0,
        horasRegistrado || 0,
        dataProximaTroca || null,
        kmProximaTroca || null,
        horasProximaTroca || null,
        codigoVeiculo
      ]);
    }

    // Recalcular regras finas de status
    await recalcularStatusVeiculo(codigoVeiculo);

    // 5. Auditoria
    await logAudit(
      req,
      'REGISTRO_NOVA_TROCA',
      'LUB_REGISTROS_TROCA',
      idTroca,
      `Nova OS ${numeroOS} registrada para o veículo COD=${codigoVeiculo} (KM: ${kmRegistrado}).`
    );

    return res.status(201).json({
      success: true,
      message: `Ordem de Serviço ${numeroOS} registrada com sucesso!`,
      idTroca,
      numeroOS
    });
  } catch (err) {
    console.error('Erro ao registrar troca de óleo:', err);
    return res.status(500).json({ success: false, message: 'Erro ao salvar registro de troca.' });
  }
}

// GET /api/trocas
async function list(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit) || 15));
    const offset = (page - 1) * limit;

    const { search, secretaria, tipoServico, dataInicio, dataFim, codigoVeiculo } = req.query;

    let whereClauses = [];
    let binds = {};

    if (codigoVeiculo) {
      whereClauses.push(`t.CODIGO_VEICULO = :codigoVeiculo`);
      binds.codigoVeiculo = parseInt(codigoVeiculo);
    }

    if (search && search.trim()) {
      whereClauses.push(`(
        UPPER(t.NUMERO_OS) LIKE UPPER(:search) OR
        UPPER(v.PLACA_VEICULO) LIKE UPPER(:search) OR 
        UPPER(v.DESCRICAO_VEICULOS) LIKE UPPER(:search) OR 
        UPPER(t.MECANICO_RESPONSAVEL) LIKE UPPER(:search)
      )`);
      binds.search = `%${search.trim()}%`;
    }

    if (secretaria && secretaria.trim()) {
      whereClauses.push(`v.SECRETARIA = :secretaria`);
      binds.secretaria = secretaria.trim();
    }

    if (tipoServico && tipoServico.trim()) {
      whereClauses.push(`t.TIPO_SERVICO = :tipoServico`);
      binds.tipoServico = tipoServico.trim();
    }

    if (dataInicio) {
      whereClauses.push(`t.DATA_SERVICO >= TO_DATE(:dataInicio, 'YYYY-MM-DD')`);
      binds.dataInicio = dataInicio;
    }

    if (dataFim) {
      whereClauses.push(`t.DATA_SERVICO <= TO_DATE(:dataFim, 'YYYY-MM-DD')`);
      binds.dataFim = dataFim;
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) AS TOTAL
      FROM LUB_REGISTROS_TROCA t
      JOIN NST_VEICULOS v ON t.CODIGO_VEICULO = v.CODIGO_VEICULO
      ${whereSql}
    `;
    const countRes = await execute(countQuery, binds);
    const total = countRes.rows[0].TOTAL;

    binds.offset = offset;
    binds.limit = limit;

    const dataQuery = `
      SELECT 
        t.ID_TROCA,
        t.NUMERO_OS,
        t.CODIGO_VEICULO,
        v.PLACA_VEICULO,
        v.DESCRICAO_VEICULOS,
        v.MARCA_VEICULO,
        v.MODELO_VEICULO,
        v.SECRETARIA,
        v.TIPO_VEICULO,
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
        t.KM_PROXIMA_TROCA,
        TO_CHAR(t.DATA_PROXIMA_TROCA, 'YYYY-MM-DD') AS DATA_PROXIMA_TROCA,
        t.VALOR_TOTAL_SERVICO,
        t.STATUS,
        t.CHECKLIST_STATUS,
        u.NOME_COMPLETO AS USUARIO_NOME
      FROM LUB_REGISTROS_TROCA t
      JOIN NST_VEICULOS v ON t.CODIGO_VEICULO = v.CODIGO_VEICULO
      LEFT JOIN LUB_USUARIOS u ON t.ID_USUARIO_REGISTRO = u.ID_USUARIO
      ${whereSql}
      ORDER BY t.DATA_SERVICO DESC, t.ID_TROCA DESC
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
    console.error('Erro ao listar trocas de óleo:', err);
    return res.status(500).json({ success: false, message: 'Erro ao consultar registros de trocas.' });
  }
}

// GET /api/trocas/:id
async function getById(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID da troca inválido.' });
    }

    const trocaRes = await execute(`
      SELECT 
        t.ID_TROCA,
        t.NUMERO_OS,
        t.CODIGO_VEICULO,
        v.PLACA_VEICULO,
        v.DESCRICAO_VEICULOS,
        v.MARCA_VEICULO,
        v.MODELO_VEICULO,
        v.SECRETARIA,
        v.TIPO_VEICULO,
        v.ANO_FABRICACAO,
        v.ANO_MODELO,
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
        t.HORAS_PROXIMA_TROCA,
        t.VALOR_TOTAL_SERVICO,
        t.STATUS,
        t.CHECKLIST_STATUS,
        t.OBSERVACOES,
        TO_CHAR(t.DATA_CRIACAO, 'YYYY-MM-DD HH24:MI') AS DATA_CRIACAO,
        u.NOME_COMPLETO AS USUARIO_NOME,
        u.CARGO AS USUARIO_CARGO
      FROM LUB_REGISTROS_TROCA t
      JOIN NST_VEICULOS v ON t.CODIGO_VEICULO = v.CODIGO_VEICULO
      LEFT JOIN LUB_USUARIOS u ON t.ID_USUARIO_REGISTRO = u.ID_USUARIO
      WHERE t.ID_TROCA = :1
    `, [id]);

    if (!trocaRes.rows || trocaRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Registro de troca não encontrado.' });
    }

    const itensRes = await execute(`
      SELECT 
        i.ID_ITEM,
        i.ID_PRODUTO,
        i.DESCRICAO_ITEM,
        i.QUANTIDADE,
        i.UNIDADE,
        i.VALOR_UNITARIO,
        i.VALOR_TOTAL,
        p.MARCA,
        p.ESPECIFICACAO
      FROM LUB_ITENS_TROCA i
      LEFT JOIN LUB_PRODUTOS p ON i.ID_PRODUTO = p.ID_PRODUTO
      WHERE i.ID_TROCA = :1
      ORDER BY i.ID_ITEM ASC
    `, [id]);

    return res.json({
      success: true,
      troca: trocaRes.rows[0],
      itens: itensRes.rows
    });
  } catch (err) {
    console.error('Erro ao buscar detalhes da troca:', err);
    return res.status(500).json({ success: false, message: 'Erro ao carregar dados da ordem de serviço.' });
  }
}

// GET /api/trocas/:id/etiqueta
async function getEtiqueta(req, res) {
  try {
    const id = parseInt(req.params.id);
    const result = await execute(`
      SELECT 
        t.ID_TROCA,
        t.NUMERO_OS,
        v.PLACA_VEICULO,
        v.MODELO_VEICULO,
        v.SECRETARIA,
        TO_CHAR(t.DATA_SERVICO, 'DD/MM/YYYY') AS DATA_TROCA_BR,
        t.KM_REGISTRADO AS KM_TROCA,
        t.KM_PROXIMA_TROCA AS KM_PROXIMA,
        TO_CHAR(t.DATA_PROXIMA_TROCA, 'DD/MM/YYYY') AS DATA_PROXIMA_BR,
        t.MECANICO_RESPONSAVEL,
        (
          SELECT LISTAGG(i.DESCRICAO_ITEM, ', ') WITHIN GROUP (ORDER BY i.ID_ITEM)
          FROM LUB_ITENS_TROCA i
          WHERE i.ID_TROCA = t.ID_TROCA
        ) AS ITENS_RESUMO
      FROM LUB_REGISTROS_TROCA t
      JOIN NST_VEICULOS v ON t.CODIGO_VEICULO = v.CODIGO_VEICULO
      WHERE t.ID_TROCA = :1
    `, [id]);

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ordem de serviço não encontrada.' });
    }

    return res.json({
      success: true,
      etiqueta: result.rows[0]
    });
  } catch (err) {
    console.error('Erro ao gerar etiqueta de óleo:', err);
    return res.status(500).json({ success: false, message: 'Erro ao emitir etiqueta.' });
  }
}

// DELETE /api/trocas/:id (Admin only)
async function deleteTroca(req, res) {
  try {
    const id = parseInt(req.params.id);
    const trocaRes = await execute(`SELECT CODIGO_VEICULO, NUMERO_OS FROM LUB_REGISTROS_TROCA WHERE ID_TROCA = :1`, [id]);
    if (!trocaRes.rows || trocaRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Registro não encontrado.' });
    }

    const { CODIGO_VEICULO, NUMERO_OS } = trocaRes.rows[0];

    // Deletar itens
    await execute(`DELETE FROM LUB_ITENS_TROCA WHERE ID_TROCA = :1`, [id]);
    // Deletar troca
    await execute(`DELETE FROM LUB_REGISTROS_TROCA WHERE ID_TROCA = :1`, [id]);

    // Recalcular status do veículo
    await recalcularStatusVeiculo(CODIGO_VEICULO);

    await logAudit(
      req,
      'EXCLUSAO_TROCA',
      'LUB_REGISTROS_TROCA',
      id,
      `Ordem de Serviço ${NUMERO_OS} excluída pelo administrador.`
    );

    return res.json({ success: true, message: `Ordem de Serviço ${NUMERO_OS} excluída com sucesso.` });
  } catch (err) {
    console.error('Erro ao excluir troca:', err);
    return res.status(500).json({ success: false, message: 'Erro ao excluir registro.' });
  }
}

module.exports = {
  create,
  list,
  getById,
  getEtiqueta,
  deleteTroca
};
