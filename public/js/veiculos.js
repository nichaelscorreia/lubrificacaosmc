// ==========================================================================
// GESTÃO DA FROTA DE VEÍCULOS (374 VEÍCULOS DA PREFEITURA DE SMC)
// ==========================================================================

const Veiculos = {
  currentPage: 1,
  limit: 15,
  secretariasLoaded: false,
  currentVeiculoId: null,

  async init() {
    if (!this.secretariasLoaded) {
      await this.loadFiltros();
      this.secretariasLoaded = true;
    }
    this.bindEvents();
    this.loadList(1);
  },

  bindEvents() {
    const searchInput = document.getElementById('veiculos-search');
    if (searchInput && !searchInput.dataset.bound) {
      searchInput.dataset.bound = 'true';
      let debounceTimeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => this.loadList(1), 350);
      });
    }

    const secFilter = document.getElementById('veiculos-filter-secretaria');
    if (secFilter && !secFilter.dataset.bound) {
      secFilter.dataset.bound = 'true';
      secFilter.addEventListener('change', () => this.loadList(1));
    }

    const tipoFilter = document.getElementById('veiculos-filter-tipo');
    if (tipoFilter && !tipoFilter.dataset.bound) {
      tipoFilter.dataset.bound = 'true';
      tipoFilter.addEventListener('change', () => this.loadList(1));
    }

    const statusFilter = document.getElementById('veiculos-filter-status');
    if (statusFilter && !statusFilter.dataset.bound) {
      statusFilter.dataset.bound = 'true';
      statusFilter.addEventListener('change', () => this.loadList(1));
    }
  },

  async loadFiltros() {
    try {
      const [secRes, tipoRes] = await Promise.all([
        API.get('/veiculos/secretarias'),
        API.get('/veiculos/tipos')
      ]);

      const secSelect = document.getElementById('veiculos-filter-secretaria');
      if (secSelect && secRes.success) {
        secSelect.innerHTML = '<option value="">Todas as Secretarias</option>' +
          secRes.data.map(s => `<option value="${s.SECRETARIA}">${s.SECRETARIA} (${s.TOTAL_VEICULOS})</option>`).join('');
      }

      const tipoSelect = document.getElementById('veiculos-filter-tipo');
      if (tipoSelect && tipoRes.success) {
        tipoSelect.innerHTML = '<option value="">Todos os Tipos</option>' +
          tipoRes.data.map(t => `<option value="${t.TIPO_VEICULO}">${t.TIPO_VEICULO} (${t.TOTAL_VEICULOS})</option>`).join('');
      }
    } catch (e) {
      console.error('Erro ao carregar filtros de veículos:', e);
    }
  },

  async loadList(page = 1) {
    this.currentPage = page;
    const tbody = document.getElementById('tbody-veiculos');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px;"><i data-lucide="loader-2" class="spin"></i> Carregando frota de veículos...</td></tr>`;
    if (window.lucide) lucide.createIcons({ root: tbody });

    const search = document.getElementById('veiculos-search')?.value || '';
    const secretaria = document.getElementById('veiculos-filter-secretaria')?.value || '';
    const tipo_veiculo = document.getElementById('veiculos-filter-tipo')?.value || '';
    const status_troca = document.getElementById('veiculos-filter-status')?.value || '';

    try {
      const res = await API.get('/veiculos', {
        page: this.currentPage,
        limit: this.limit,
        search,
        secretaria,
        tipo_veiculo,
        status_troca
      });

      if (!res.success) throw new Error(res.message);

      this.renderTable(res.data);
      this.renderPagination(res.pagination);
    } catch (err) {
      console.error('Erro ao listar veículos:', err);
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--status-danger); padding: 24px;">Erro ao carregar veículos.</td></tr>`;
    }
  },

  renderTable(veiculos) {
    const tbody = document.getElementById('tbody-veiculos');
    if (!tbody) return;

    if (!veiculos || veiculos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">Nenhum veículo encontrado com os filtros informados.</td></tr>`;
      return;
    }

    tbody.innerHTML = veiculos.map(v => `
      <tr>
        <td><strong>${v.PLACA_VEICULO || 'S/ PLACA'}</strong></td>
        <td>
          <div style="font-weight: 600;">${v.MODELO_VEICULO || v.DESCRICAO_VEICULOS || '-'}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${v.MARCA_VEICULO || '-'} • Ano ${v.ANO_MODELO || v.ANO_FABRICACAO || '-'}</div>
        </td>
        <td>
          <span class="badge badge-neutral">${v.TIPO_VEICULO || 'OUTROS'}</span>
        </td>
        <td style="max-width: 200px; font-size: 0.8rem;" title="${v.SECRETARIA || '-'}">
          ${(v.SECRETARIA || '-').replace(/^\d+\s*-\s*/, '')}
        </td>
        <td><strong>${Format.number(v.KM_ATUAL)} km</strong></td>
        <td>
          <div>${v.KM_PROXIMA_TROCA ? `${Format.number(v.KM_PROXIMA_TROCA)} km` : '-'}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${v.DATA_PROXIMA_TROCA ? Format.date(v.DATA_PROXIMA_TROCA) : ''}</div>
        </td>
        <td>${Format.statusBadge(v.STATUS_TROCA)}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" title="Ver Detalhes e Histórico" onclick="Veiculos.abrirDetalhes(${v.CODIGO_VEICULO})">
              <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
            </button>
            <button class="btn btn-primary btn-sm" title="Registrar Troca de Óleo" onclick="Trocas.abrirNovaTrocaModal(${v.CODIGO_VEICULO})">
              <i data-lucide="droplet" style="width: 14px; height: 14px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    if (window.lucide) lucide.createIcons({ root: tbody });
  },

  renderPagination(p) {
    const infoEl = document.getElementById('veiculos-pagination-info');
    const controlsEl = document.getElementById('veiculos-pagination-controls');
    if (!infoEl || !controlsEl) return;

    const start = (p.page - 1) * p.limit + 1;
    const end = Math.min(p.page * p.limit, p.total);
    infoEl.textContent = p.total > 0 ? `Exibindo ${start}-${end} de ${Format.number(p.total)} veículos` : 'Nenhum veículo';

    controlsEl.innerHTML = `
      <button class="btn btn-secondary btn-sm" ${p.page <= 1 ? 'disabled' : ''} onclick="Veiculos.loadList(${p.page - 1})">
        <i data-lucide="chevron-left" style="width: 14px; height: 14px;"></i> Anterior
      </button>
      <span style="font-size: 0.85rem; font-weight: 600; padding: 0 8px; align-self: center;">Página ${p.page} de ${p.totalPages || 1}</span>
      <button class="btn btn-secondary btn-sm" ${p.page >= p.totalPages ? 'disabled' : ''} onclick="Veiculos.loadList(${p.page + 1})">
        Próximo <i data-lucide="chevron-right" style="width: 14px; height: 14px;"></i>
      </button>
    `;

    if (window.lucide) lucide.createIcons({ root: controlsEl });
  },

  async abrirDetalhes(codigoVeiculo) {
    this.currentVeiculoId = codigoVeiculo;
    const modal = document.getElementById('modal-detalhes-veiculo');
    if (!modal) return;

    try {
      const res = await API.get(`/veiculos/${codigoVeiculo}`);
      if (!res.success) throw new Error(res.message);

      const v = res.veiculo;
      const hist = res.historico || [];

      // Preenche cabeçalho do modal
      document.getElementById('det-veiculo-placa').textContent = v.PLACA_VEICULO || 'S/ PLACA';
      document.getElementById('det-veiculo-modelo').textContent = `${v.MARCA_VEICULO || ''} ${v.MODELO_VEICULO || v.DESCRICAO_VEICULOS || ''}`;
      document.getElementById('det-veiculo-status').innerHTML = Format.statusBadge(v.STATUS_TROCA);

      // Preenche aba Informações / Configuração
      document.getElementById('det-veiculo-secretaria').textContent = v.SECRETARIA || '-';
      document.getElementById('det-veiculo-tipo').textContent = v.TIPO_VEICULO || '-';
      document.getElementById('det-veiculo-ano').textContent = `${v.ANO_FABRICACAO || '-'}/${v.ANO_MODELO || '-'}`;
      document.getElementById('det-veiculo-situacao').textContent = v.SITUACAO || 'ATIVO';

      document.getElementById('det-km-atual').value = v.KM_ATUAL || 0;
      document.getElementById('det-motorista').value = v.MOTORISTA_RESPONSAVEL || '';
      document.getElementById('det-garagem').value = v.LOCAL_GARAGEM || '';
      document.getElementById('det-obs-config').value = v.OBS_CONFIG || '';

      // Plano recomendado
      document.getElementById('det-plano-nome').textContent = v.NOME_PLANO || 'Plano Padrão';
      document.getElementById('det-plano-oleo').textContent = v.VISCOSIDADE_RECOMENDADA || '-';
      document.getElementById('det-plano-carter').textContent = v.CAPACIDADE_CARTER_LITROS ? `${v.CAPACIDADE_CARTER_LITROS} Litros` : '-';
      document.getElementById('det-plano-intervalo').textContent = v.INTERVALO_KM ? `${Format.number(v.INTERVALO_KM)} km / ${v.INTERVALO_MESES || 6} meses` : '-';

      // Histórico de Trocas
      const tbodyHist = document.getElementById('tbody-historico-veiculo');
      if (tbodyHist) {
        if (hist.length === 0) {
          tbodyHist.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum registro de troca de óleo cadastrado para este veículo.</td></tr>`;
        } else {
          tbodyHist.innerHTML = hist.map(h => `
            <tr>
              <td><strong>${h.NUMERO_OS}</strong></td>
              <td>${Format.date(h.DATA_SERVICO)}</td>
              <td>${Format.number(h.KM_REGISTRADO)} km</td>
              <td>${h.MECANICO_RESPONSAVEL || '-'}</td>
              <td>${Format.currency(h.VALOR_TOTAL_SERVICO)}</td>
              <td>
                <button class="btn btn-secondary btn-sm" onclick="Trocas.abrirDetalhesTroca(${h.ID_TROCA})">
                  <i data-lucide="eye" style="width: 12px; height: 12px;"></i> Ver O.S.
                </button>
              </td>
            </tr>
          `).join('');
        }
      }

      App.openModal('modal-detalhes-veiculo');
      if (window.lucide) lucide.createIcons({ root: modal });
    } catch (err) {
      console.error('Erro ao abrir detalhes do veículo:', err);
      showToast('Erro ao carregar dados do veículo.', 'error');
    }
  },

  async salvarConfig() {
    if (!this.currentVeiculoId) return;

    try {
      const kmAtual = parseInt(document.getElementById('det-km-atual').value) || 0;
      const motoristaResponsavel = document.getElementById('det-motorista').value.trim();
      const localGaragem = document.getElementById('det-garagem').value.trim();
      const observacoes = document.getElementById('det-obs-config').value.trim();

      const res = await API.put(`/veiculos/${this.currentVeiculoId}/config`, {
        kmAtual,
        motoristaResponsavel,
        localGaragem,
        observacoes
      });

      if (res.success) {
        showToast('Configurações salvas com sucesso!');
        App.closeModal('modal-detalhes-veiculo');
        this.loadList(this.currentPage);
      }
    } catch (err) {
      showToast(err.message || 'Erro ao salvar configurações.', 'error');
    }
  },

  imprimirFichaHistorica() {
    window.print();
  }
};
