// ==========================================================================
// REGISTRO DE TROCAS DE ÓLEO & ORDENS DE SERVIÇO (O.S.)
// ==========================================================================

const Trocas = {
  currentPage: 1,
  limit: 15,
  produtosCatalogo: [],
  currentVeiculoSelecionado: null,

  async init() {
    this.bindEvents();
    await this.carregarProdutosCatalogo();
    this.loadList(1);
  },

  bindEvents() {
    const searchInput = document.getElementById('trocas-search');
    if (searchInput && !searchInput.dataset.bound) {
      searchInput.dataset.bound = 'true';
      let debounce;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => this.loadList(1), 350);
      });
    }

    const dataInicio = document.getElementById('trocas-filter-data-inicio');
    if (dataInicio && !dataInicio.dataset.bound) {
      dataInicio.dataset.bound = 'true';
      dataInicio.addEventListener('change', () => this.loadList(1));
    }

    const dataFim = document.getElementById('trocas-filter-data-fim');
    if (dataFim && !dataFim.dataset.bound) {
      dataFim.dataset.bound = 'true';
      dataFim.addEventListener('change', () => this.loadList(1));
    }

    // Autocomplete do Veículo na Nova Troca
    const inputBuscaVeiculo = document.getElementById('troca-busca-veiculo');
    if (inputBuscaVeiculo && !inputBuscaVeiculo.dataset.bound) {
      inputBuscaVeiculo.dataset.bound = 'true';
      let searchTimeout;
      inputBuscaVeiculo.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => this.buscarVeiculoAutocomplete(e.target.value), 300);
      });
    }

    // Recalcular próxima troca quando alterar KM Registrado ou Data
    const kmInput = document.getElementById('troca-km-registrado');
    if (kmInput && !kmInput.dataset.bound) {
      kmInput.dataset.bound = 'true';
      kmInput.addEventListener('input', () => this.calcularPrevisaoProximaTroca());
    }

    const dataInput = document.getElementById('troca-data-servico');
    if (dataInput && !dataInput.dataset.bound) {
      dataInput.dataset.bound = 'true';
      dataInput.addEventListener('change', () => this.calcularPrevisaoProximaTroca());
    }
  },

  async carregarProdutosCatalogo() {
    try {
      const res = await API.get('/produtos', { apenasAtivos: true });
      if (res.success) {
        this.produtosCatalogo = res.data;
      }
    } catch (e) {
      console.error('Erro ao carregar catálogo de produtos para trocas:', e);
    }
  },

  async loadList(page = 1) {
    this.currentPage = page;
    const tbody = document.getElementById('tbody-trocas');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px;"><i data-lucide="loader-2" class="spin"></i> Carregando registros de trocas...</td></tr>`;
    if (window.lucide) lucide.createIcons({ root: tbody });

    const search = document.getElementById('trocas-search')?.value || '';
    const dataInicio = document.getElementById('trocas-filter-data-inicio')?.value || '';
    const dataFim = document.getElementById('trocas-filter-data-fim')?.value || '';

    try {
      const res = await API.get('/trocas', {
        page: this.currentPage,
        limit: this.limit,
        search,
        dataInicio,
        dataFim
      });

      if (!res.success) throw new Error(res.message);

      this.renderTable(res.data);
      this.renderPagination(res.pagination);
    } catch (err) {
      console.error('Erro ao listar trocas:', err);
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--status-danger); padding: 24px;">Erro ao carregar registros.</td></tr>`;
    }
  },

  renderTable(trocas) {
    const tbody = document.getElementById('tbody-trocas');
    if (!tbody) return;

    if (!trocas || trocas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">Nenhum registro de troca de óleo encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = trocas.map(t => `
      <tr>
        <td><strong>${t.NUMERO_OS}</strong></td>
        <td><strong>${Format.date(t.DATA_SERVICO)}</strong></td>
        <td>
          <div style="font-weight: 600;">${t.PLACA_VEICULO || '-'}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${t.MODELO_VEICULO || t.DESCRICAO_VEICULOS || '-'}</div>
        </td>
        <td style="font-size: 0.8rem;">${(t.SECRETARIA || '-').replace(/^\d+\s*-\s*/, '')}</td>
        <td>${Format.number(t.KM_REGISTRADO)} km</td>
        <td>
          <span class="badge badge-info">${t.TIPO_SERVICO}</span>
        </td>
        <td>${Format.currency(t.VALOR_TOTAL_SERVICO)}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" title="Ver O.S. e Detalhes" onclick="Trocas.abrirDetalhesTroca(${t.ID_TROCA})">
              <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
            </button>
            <button class="btn btn-secondary btn-sm" title="Imprimir Etiqueta de Para-brisa" onclick="Trocas.abrirEtiquetaModal(${t.ID_TROCA})">
              <i data-lucide="tag" style="width: 14px; height: 14px;"></i>
            </button>
            ${Auth.isAdmin() ? `
              <button class="btn btn-danger btn-sm" title="Excluir Registro" onclick="Trocas.excluirTroca(${t.ID_TROCA}, '${t.NUMERO_OS}')">
                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    if (window.lucide) lucide.createIcons({ root: tbody });
  },

  renderPagination(p) {
    const infoEl = document.getElementById('trocas-pagination-info');
    const controlsEl = document.getElementById('trocas-pagination-controls');
    if (!infoEl || !controlsEl) return;

    const start = (p.page - 1) * p.limit + 1;
    const end = Math.min(p.page * p.limit, p.total);
    infoEl.textContent = p.total > 0 ? `Exibindo ${start}-${end} de ${Format.number(p.total)} registros` : 'Nenhum registro';

    controlsEl.innerHTML = `
      <button class="btn btn-secondary btn-sm" ${p.page <= 1 ? 'disabled' : ''} onclick="Trocas.loadList(${p.page - 1})">
        <i data-lucide="chevron-left" style="width: 14px; height: 14px;"></i> Anterior
      </button>
      <span style="font-size: 0.85rem; font-weight: 600; padding: 0 8px; align-self: center;">Página ${p.page} de ${p.totalPages || 1}</span>
      <button class="btn btn-secondary btn-sm" ${p.page >= p.totalPages ? 'disabled' : ''} onclick="Trocas.loadList(${p.page + 1})">
        Próximo <i data-lucide="chevron-right" style="width: 14px; height: 14px;"></i>
      </button>
    `;

    if (window.lucide) lucide.createIcons({ root: controlsEl });
  },

  async buscarVeiculoAutocomplete(termo) {
    const dropdown = document.getElementById('troca-veiculo-autocomplete-list');
    if (!dropdown) return;

    if (!termo || termo.length < 2) {
      dropdown.style.display = 'none';
      return;
    }

    try {
      const res = await API.get('/veiculos/search', { q: termo });
      if (res.success && res.data.length > 0) {
        dropdown.innerHTML = res.data.map(v => `
          <div class="autocomplete-item" style="padding: 10px 14px; border-bottom: 1px solid var(--border-color); cursor: pointer;" onclick="Trocas.selecionarVeiculo(${JSON.stringify(v).replace(/"/g, '&quot;')})">
            <div style="font-weight: 700; color: var(--primary-700);">[${v.PLACA_VEICULO || 'S/ PLACA'}] ${v.MODELO_VEICULO || v.DESCRICAO_VEICULOS}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${(v.SECRETARIA || '').replace(/^\d+\s*-\s*/, '')} • ${v.TIPO_VEICULO || ''} • KM Atual: ${Format.number(v.KM_ATUAL)}</div>
          </div>
        `).join('');
        dropdown.style.display = 'block';
      } else {
        dropdown.innerHTML = `<div style="padding: 12px; color: var(--text-muted); font-size: 0.82rem;">Nenhum veículo encontrado com este termo.</div>`;
        dropdown.style.display = 'block';
      }
    } catch (e) {
      console.error(e);
    }
  },

  selecionarVeiculo(v) {
    this.currentVeiculoSelecionado = v;
    document.getElementById('troca-codigo-veiculo').value = v.CODIGO_VEICULO;
    document.getElementById('troca-busca-veiculo').value = `[${v.PLACA_VEICULO || 'S/ PLACA'}] ${v.MODELO_VEICULO || v.DESCRICAO_VEICULOS}`;
    document.getElementById('troca-veiculo-autocomplete-list').style.display = 'none';

    // Mostra box com dados do veículo e recomendações
    const infoBox = document.getElementById('troca-veiculo-info-card');
    if (infoBox) {
      infoBox.style.display = 'block';
      document.getElementById('troca-card-placa').textContent = v.PLACA_VEICULO || 'S/ PLACA';
      document.getElementById('troca-card-modelo').textContent = v.MODELO_VEICULO || v.DESCRICAO_VEICULOS;
      document.getElementById('troca-card-secretaria').textContent = v.SECRETARIA || '-';
      document.getElementById('troca-card-plano').textContent = v.NOME_PLANO || 'Plano Padrão';
      document.getElementById('troca-card-oleo-rec').textContent = v.VISCOSIDADE_RECOMENDADA || '15W40 / 5W30';
      document.getElementById('troca-card-carter').textContent = v.CAPACIDADE_CARTER_LITROS ? `${v.CAPACIDADE_CARTER_LITROS} Litros` : '-';
    }

    const intervaloKm = parseInt(v.INTERVALO_KM) || 10000;
    const intervaloMeses = parseInt(v.INTERVALO_MESES) || 6;
    const badgeIntervalo = document.getElementById('badge-intervalo-troca');
    if (badgeIntervalo) {
      badgeIntervalo.textContent = `Intervalo: +${Format.number(intervaloKm)} km / ${intervaloMeses} meses`;
    }

    // Preenche KM sugerido
    const kmInput = document.getElementById('troca-km-registrado');
    if (kmInput && (!kmInput.value || parseInt(kmInput.value) === 0)) {
      kmInput.value = v.KM_ATUAL || 0;
    }

    this.calcularPrevisaoProximaTroca();

    // Auto sugere linha de óleo de motor padrão na tabela de itens
    this.limparItens();
    if (v.CAPACIDADE_CARTER_LITROS) {
      this.adicionarLinhaItem({
        descricao: `Óleo de Motor Recomendado (${v.VISCOSIDADE_RECOMENDADA || 'SMC'})`,
        quantidade: v.CAPACIDADE_CARTER_LITROS,
        unidade: 'LITRO',
        valorUnitario: 30.00
      });
      this.adicionarLinhaItem({
        descricao: 'Filtro de Óleo Lubrificante',
        quantidade: 1,
        unidade: 'UNIDADE',
        valorUnitario: 45.00
      });
    }
  },

  async abrirNovaTrocaModal(codigoVeiculo = null) {
    const modal = document.getElementById('modal-nova-troca');
    if (!modal) return;

    // Reseta form
    document.getElementById('form-nova-troca').reset();
    document.getElementById('troca-codigo-veiculo').value = '';
    document.getElementById('troca-data-servico').value = new Date().toISOString().split('T')[0];
    document.getElementById('troca-veiculo-info-card').style.display = 'none';
    this.limparItens();

    if (codigoVeiculo) {
      try {
        const res = await API.get(`/veiculos/${codigoVeiculo}`);
        if (res.success) {
          this.selecionarVeiculo(res.veiculo);
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      this.adicionarLinhaItem();
    }

    App.openModal('modal-nova-troca');
  },

  calcularPrevisaoProximaTroca() {
    const kmRegistradoEl = document.getElementById('troca-km-registrado');
    const kmAtual = parseInt(kmRegistradoEl ? kmRegistradoEl.value : 0) || 0;
    const dataServicoStr = document.getElementById('troca-data-servico').value;

    const v = this.currentVeiculoSelecionado;
    const intervaloKm = (v && v.INTERVALO_KM) ? parseInt(v.INTERVALO_KM) : 10000;
    const intervaloMeses = (v && v.INTERVALO_MESES) ? parseInt(v.INTERVALO_MESES) : 6;

    const kmProxInput = document.getElementById('troca-km-proxima');
    const kmAlvo = kmAtual + intervaloKm;
    if (kmProxInput) {
      kmProxInput.value = kmAlvo;
    }

    const ajudaKmProx = document.getElementById('ajuda-km-proxima');
    if (ajudaKmProx) {
      ajudaKmProx.textContent = kmAtual > 0
        ? `Previsão: ${Format.number(kmAtual)} km + ${Format.number(intervaloKm)} km = ${Format.number(kmAlvo)} km`
        : `Intervalo padrão: +${Format.number(intervaloKm)} km`;
    }

    const dataProxInput = document.getElementById('troca-data-proxima');
    if (dataProxInput && dataServicoStr) {
      const dataServ = new Date(dataServicoStr + 'T12:00:00');
      dataServ.setMonth(dataServ.getMonth() + intervaloMeses);
      dataProxInput.value = dataServ.toISOString().split('T')[0];
    }
  },

  limparItens() {
    const tbody = document.getElementById('tbody-itens-troca');
    if (tbody) tbody.innerHTML = '';
    this.atualizarTotalServico();
  },

  adicionarLinhaItem(itemData = {}) {
    const tbody = document.getElementById('tbody-itens-troca');
    if (!tbody) return;

    const rowId = 'item-row-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const tr = document.createElement('tr');
    tr.id = rowId;

    const optionsProdutos = this.produtosCatalogo.map(p => `
      <option value="${p.ID_PRODUTO}" data-preco="${p.VALOR_UNITARIO_ESTIMADO}" data-unid="${p.UNIDADE_MEDIDA}">
        ${p.NOME_PRODUTO} (${p.MARCA || ''}) - Estq: ${p.ESTOQUE_ATUAL} ${p.UNIDADE_MEDIDA}
      </option>
    `).join('');

    tr.innerHTML = `
      <td>
        <input type="text" class="form-control form-control-sm item-descricao" value="${itemData.descricao || ''}" placeholder="Ex: Óleo 15W40 Diesel ou Filtro" required>
      </td>
      <td style="width: 200px;">
        <select class="form-select form-select-sm item-produto-select" onchange="Trocas.onProdutoSelecionado('${rowId}')">
          <option value="">-- Vincular Produto do Estoque --</option>
          ${optionsProdutos}
        </select>
      </td>
      <td style="width: 100px;">
        <input type="number" step="0.5" class="form-control form-control-sm item-qtd" value="${itemData.quantidade || 1}" oninput="Trocas.atualizarTotalServico()" required>
      </td>
      <td style="width: 100px;">
        <input type="text" class="form-control form-control-sm item-unid" value="${itemData.unidade || 'LITRO'}" required>
      </td>
      <td style="width: 110px;">
        <input type="number" step="0.01" class="form-control form-control-sm item-vunit" value="${itemData.valorUnitario || 0}" oninput="Trocas.atualizarTotalServico()">
      </td>
      <td style="width: 110px; font-weight: 700; text-align: right; vertical-align: middle;" class="item-subtotal">
        ${Format.currency((itemData.quantidade || 1) * (itemData.valorUnitario || 0))}
      </td>
      <td style="width: 50px; text-align: center; vertical-align: middle;">
        <button type="button" class="btn btn-danger btn-sm" onclick="document.getElementById('${rowId}').remove(); Trocas.atualizarTotalServico();">
          <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
    if (window.lucide) lucide.createIcons({ root: tr });
    this.atualizarTotalServico();
  },

  onProdutoSelecionado(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;

    const select = row.querySelector('.item-produto-select');
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption && select.value) {
      const descInput = row.querySelector('.item-descricao');
      const vunitInput = row.querySelector('.item-vunit');
      const unidInput = row.querySelector('.item-unid');

      if (!descInput.value || descInput.value.startsWith('Óleo de Motor Recomendado')) {
        descInput.value = selectedOption.text.split(' - Estq:')[0];
      }
      vunitInput.value = selectedOption.dataset.preco || 0;
      unidInput.value = selectedOption.dataset.unid || 'LITRO';
      this.atualizarTotalServico();
    }
  },

  atualizarTotalServico() {
    const rows = document.querySelectorAll('#tbody-itens-troca tr');
    let total = 0;

    rows.forEach(row => {
      const qtd = parseFloat(row.querySelector('.item-qtd')?.value) || 0;
      const vunit = parseFloat(row.querySelector('.item-vunit')?.value) || 0;
      const subtotal = qtd * vunit;
      const subtotalEl = row.querySelector('.item-subtotal');
      if (subtotalEl) subtotalEl.textContent = Format.currency(subtotal);
      total += subtotal;
    });

    const totalInput = document.getElementById('troca-valor-total');
    if (totalInput) totalInput.value = total.toFixed(2);

    const totalDisplay = document.getElementById('troca-total-itens-display');
    if (totalDisplay) totalDisplay.textContent = Format.currency(total);
  },

  async salvarNovaTroca(e) {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-salvar-troca');
    const originalHtml = btnSubmit.innerHTML;

    try {
      const codigoVeiculo = document.getElementById('troca-codigo-veiculo').value;
      if (!codigoVeiculo) {
        showToast('Selecione um veículo válido para a troca.', 'warning');
        return;
      }

      btnSubmit.disabled = true;
      btnSubmit.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Gravando O.S...`;

      // Coleta itens da tabela
      const itens = [];
      document.querySelectorAll('#tbody-itens-troca tr').forEach(row => {
        const desc = row.querySelector('.item-descricao')?.value.trim();
        const idProd = row.querySelector('.item-produto-select')?.value;
        const qtd = parseFloat(row.querySelector('.item-qtd')?.value) || 0;
        const unid = row.querySelector('.item-unid')?.value.trim();
        const vunit = parseFloat(row.querySelector('.item-vunit')?.value) || 0;

        if (desc && qtd > 0) {
          itens.push({
            idProduto: idProd ? parseInt(idProd) : null,
            descricao: desc,
            quantidade: qtd,
            unidade: unid || 'UNIDADE',
            valorUnitario: vunit
          });
        }
      });

      const kmRegistrado = parseInt(document.getElementById('troca-km-registrado').value) || 0;
      let kmProximaTroca = parseInt(document.getElementById('troca-km-proxima').value) || null;
      if (!kmProximaTroca && kmRegistrado > 0) {
        kmProximaTroca = kmRegistrado + 10000;
      }

      const payload = {
        codigoVeiculo: parseInt(codigoVeiculo),
        dataServico: document.getElementById('troca-data-servico').value,
        kmRegistrado: kmRegistrado,
        horasRegistrado: parseInt(document.getElementById('troca-horas-registrado')?.value) || 0,
        tipoServico: document.getElementById('troca-tipo-servico').value,
        localExecucao: document.getElementById('troca-local-execucao').value,
        mecanicoResponsavel: document.getElementById('troca-mecanico').value,
        trocouOleoMotor: document.getElementById('chk-oleo-motor').checked,
        trocouFiltroOleo: document.getElementById('chk-filtro-oleo').checked,
        trocouFiltroAr: document.getElementById('chk-filtro-ar').checked,
        trocouFiltroCombustivel: document.getElementById('chk-filtro-combustivel').checked,
        trocouFiltroCabine: document.getElementById('chk-filtro-cabine').checked,
        lubrificouChassis: document.getElementById('chk-chassis').checked,
        trocouOleoCambio: document.getElementById('chk-oleo-cambio').checked,
        trocouOleoDiferencial: document.getElementById('chk-oleo-diferencial').checked,
        trocouFluidoFreio: document.getElementById('chk-fluido-freio').checked,
        trocouArrefecimento: document.getElementById('chk-arrefecimento').checked,
        kmProximaTroca: kmProximaTroca,
        dataProximaTroca: document.getElementById('troca-data-proxima').value || null,
        valorTotalServico: parseFloat(document.getElementById('troca-valor-total').value) || 0,
        checklistStatus: document.getElementById('troca-checklist-status').value,
        observacoes: document.getElementById('troca-observacoes').value.trim(),
        itens
      };

      const res = await API.post('/trocas', payload);

      if (res.success) {
        showToast(res.message);
        App.closeModal('modal-nova-troca');
        this.loadList(1);
        Dashboard.load();
        Veiculos.loadList(Veiculos.currentPage);

        // Abre diálogo com opções de impressão
        this.abrirPosSalvamento(res.idTroca, res.numeroOS);
      }
    } catch (err) {
      console.error('Erro ao salvar troca:', err);
      showToast(err.message || 'Erro ao registrar troca de óleo.', 'error');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalHtml;
      if (window.lucide) lucide.createIcons();
    }
  },

  abrirPosSalvamento(idTroca, numeroOS) {
    const modal = document.getElementById('modal-pos-salvamento');
    if (!modal) return;

    document.getElementById('pos-os-numero').textContent = numeroOS;
    document.getElementById('btn-pos-imprimir-etiqueta').onclick = () => {
      App.closeModal('modal-pos-salvamento');
      Trocas.abrirEtiquetaModal(idTroca);
    };
    document.getElementById('btn-pos-imprimir-os').onclick = () => {
      App.closeModal('modal-pos-salvamento');
      Trocas.abrirDetalhesTroca(idTroca);
    };

    App.openModal('modal-pos-salvamento');
  },

  async abrirDetalhesTroca(idTroca) {
    const modal = document.getElementById('modal-detalhes-troca');
    if (!modal) return;

    try {
      const res = await API.get(`/trocas/${idTroca}`);
      if (!res.success) throw new Error(res.message);

      const t = res.troca;
      const itens = res.itens || [];

      // Preenche cabeçalho e dados da OS
      document.getElementById('os-det-numero').textContent = t.NUMERO_OS;
      document.getElementById('os-det-data').textContent = Format.date(t.DATA_SERVICO);
      document.getElementById('os-det-tipo').textContent = t.TIPO_SERVICO;
      document.getElementById('os-det-status').textContent = t.STATUS;

      document.getElementById('os-det-placa').textContent = t.PLACA_VEICULO || 'S/ PLACA';
      document.getElementById('os-det-modelo').textContent = `${t.MARCA_VEICULO || ''} ${t.MODELO_VEICULO || t.DESCRICAO_VEICULOS || ''}`;
      document.getElementById('os-det-secretaria').textContent = t.SECRETARIA || '-';
      document.getElementById('os-det-km').textContent = `${Format.number(t.KM_REGISTRADO)} km`;

      document.getElementById('os-det-km-prox').textContent = t.KM_PROXIMA_TROCA ? `${Format.number(t.KM_PROXIMA_TROCA)} km` : '-';
      document.getElementById('os-det-data-prox').textContent = t.DATA_PROXIMA_TROCA ? Format.date(t.DATA_PROXIMA_TROCA) : '-';
      document.getElementById('os-det-mecanico').textContent = t.MECANICO_RESPONSAVEL || '-';
      document.getElementById('os-det-local').textContent = t.LOCAL_EXECUCAO || '-';
      document.getElementById('os-det-obs').textContent = t.OBSERVACOES || 'Nenhuma observação informada.';

      // Checkboxes marcados
      document.getElementById('os-chk-motor').textContent = t.TROCOU_OLEO_MOTOR === 'S' ? 'SIM' : 'NÃO';
      document.getElementById('os-chk-filtro-oleo').textContent = t.TROCOU_FILTRO_OLEO === 'S' ? 'SIM' : 'NÃO';
      document.getElementById('os-chk-filtro-ar').textContent = t.TROCOU_FILTRO_AR === 'S' ? 'SIM' : 'NÃO';
      document.getElementById('os-chk-filtro-comb').textContent = t.TROCOU_FILTRO_COMBUSTIVEL === 'S' ? 'SIM' : 'NÃO';
      document.getElementById('os-chk-filtro-cab').textContent = t.TROCOU_FILTRO_CABINE === 'S' ? 'SIM' : 'NÃO';
      document.getElementById('os-chk-chassis').textContent = t.LUBRIFICOU_CHASSIS === 'S' ? 'SIM' : 'NÃO';

      // Itens
      const tbodyItens = document.getElementById('os-det-tbody-itens');
      if (tbodyItens) {
        tbodyItens.innerHTML = itens.map(i => `
          <tr>
            <td>${i.DESCRICAO_ITEM}</td>
            <td>${i.MARCA || '-'}</td>
            <td>${i.QUANTIDADE} ${i.UNIDADE || 'UN'}</td>
            <td>${Format.currency(i.VALOR_UNITARIO)}</td>
            <td style="text-align: right;"><strong>${Format.currency(i.VALOR_TOTAL)}</strong></td>
          </tr>
        `).join('');
      }

      document.getElementById('os-det-total').textContent = Format.currency(t.VALOR_TOTAL_SERVICO);

      App.openModal('modal-detalhes-troca');
      if (window.lucide) lucide.createIcons({ root: modal });
    } catch (err) {
      console.error('Erro ao abrir OS:', err);
      showToast('Erro ao carregar detalhes da ordem de serviço.', 'error');
    }
  },

  async abrirEtiquetaModal(idTroca) {
    const modal = document.getElementById('modal-etiqueta-oleo');
    if (!modal) return;

    try {
      const res = await API.get(`/trocas/${idTroca}/etiqueta`);
      if (!res.success) throw new Error(res.message);

      const e = res.etiqueta;

      document.getElementById('lbl-etiqueta-os').textContent = e.NUMERO_OS;
      document.getElementById('lbl-etiqueta-placa').textContent = e.PLACA_VEICULO || 'S/ PLACA';
      document.getElementById('lbl-etiqueta-modelo').textContent = e.MODELO_VEICULO || '-';
      document.getElementById('lbl-etiqueta-secretaria').textContent = (e.SECRETARIA || '-').replace(/^\d+\s*-\s*/, '');
      document.getElementById('lbl-etiqueta-data-troca').textContent = e.DATA_TROCA_BR || '-';
      document.getElementById('lbl-etiqueta-km-troca').textContent = `${Format.number(e.KM_TROCA)} km`;
      document.getElementById('lbl-etiqueta-km-prox').textContent = `${Format.number(e.KM_PROXIMA)} km`;
      document.getElementById('lbl-etiqueta-data-prox').textContent = e.DATA_PROXIMA_BR || '-';
      document.getElementById('lbl-etiqueta-mecanico').textContent = e.MECANICO_RESPONSAVEL || 'Oficina SMC';
      document.getElementById('lbl-etiqueta-itens').textContent = e.ITENS_RESUMO || 'Óleo e filtros trocados';

      const filtros = [];
      if (e.TROCOU_FILTRO_OLEO) filtros.push('Óleo');
      if (e.TROCOU_FILTRO_AR) filtros.push('Ar');
      if (e.TROCOU_FILTRO_COMBUSTIVEL) filtros.push('Combustível');
      if (e.TROCOU_FILTRO_CABINE) filtros.push('Cabine');
      const filtrosEl = document.getElementById('lbl-etiqueta-filtros');
      if (filtrosEl) {
        filtrosEl.textContent = filtros.length > 0 ? filtros.join(', ') : 'Nenhum filtro trocado';
      }

      App.openModal('modal-etiqueta-oleo');
    } catch (err) {
      console.error('Erro ao carregar etiqueta:', err);
      showToast('Erro ao emitir etiqueta de óleo.', 'error');
    }
  },

  async excluirTroca(idTroca, numeroOS) {
    if (!confirm(`Tem certeza que deseja EXCLUIR a Ordem de Serviço ${numeroOS}? Esta ação reverterá o status do veículo.`)) {
      return;
    }

    try {
      const res = await API.delete(`/trocas/${idTroca}`);
      if (res.success) {
        showToast(res.message);
        this.loadList(this.currentPage);
        Dashboard.load();
      }
    } catch (err) {
      showToast(err.message || 'Erro ao excluir troca.', 'error');
    }
  }
};
