// ==========================================================================
// RELATÓRIOS OFICIAIS & EXPORTAÇÃO
// ==========================================================================

const Relatorios = {
  dadosAtuais: null,
  tipoRelatorioAtual: 'geral',

  init() {
    this.carregarFiltrosSecretarias();
    this.definirDatasPadrao();
    this.bindEvents();
  },

  definirDatasPadrao() {
    const hoje = new Date();
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    const inicioEl = document.getElementById('rel-data-inicio');
    const fimEl = document.getElementById('rel-data-fim');

    if (inicioEl && !inicioEl.value) inicioEl.value = primeiroDiaMes.toISOString().split('T')[0];
    if (fimEl && !fimEl.value) fimEl.value = hoje.toISOString().split('T')[0];
  },

  async carregarFiltrosSecretarias() {
    try {
      const res = await API.get('/veiculos/secretarias');
      if (res.success) {
        const secSelect = document.getElementById('rel-filter-secretaria');
        if (secSelect) {
          secSelect.innerHTML = '<option value="">Todas as Secretarias</option>' +
            res.data.map(s => `<option value="${s.SECRETARIA}">${s.SECRETARIA}</option>`).join('');
        }
      }
    } catch (e) {
      console.error(e);
    }
  },

  bindEvents() {
    const btnGerar = document.getElementById('btn-gerar-relatorio');
    if (btnGerar && !btnGerar.dataset.bound) {
      btnGerar.dataset.bound = 'true';
      btnGerar.addEventListener('click', () => this.gerar());
    }

    const btnExportar = document.getElementById('btn-exportar-csv');
    if (btnExportar && !btnExportar.dataset.bound) {
      btnExportar.dataset.bound = 'true';
      btnExportar.addEventListener('click', () => this.exportarCSV());
    }

    const btnImprimir = document.getElementById('btn-imprimir-relatorio');
    if (btnImprimir && !btnImprimir.dataset.bound) {
      btnImprimir.dataset.bound = 'true';
      btnImprimir.addEventListener('click', () => window.print());
    }

    const tipoSelect = document.getElementById('rel-tipo-selecionado');
    if (tipoSelect && !tipoSelect.dataset.bound) {
      tipoSelect.dataset.bound = 'true';
      tipoSelect.addEventListener('change', (e) => {
        this.tipoRelatorioAtual = e.target.value;
        this.gerar();
      });
    }
  },

  async gerar() {
    const tipo = document.getElementById('rel-tipo-selecionado')?.value || 'geral';
    const dataInicio = document.getElementById('rel-data-inicio')?.value;
    const dataFim = document.getElementById('rel-data-fim')?.value;
    const secretaria = document.getElementById('rel-filter-secretaria')?.value;

    const container = document.getElementById('relatorio-conteudo-resultado');
    if (!container) return;

    container.innerHTML = `<div style="text-align: center; padding: 40px;"><i data-lucide="loader-2" class="spin"></i> Gerando relatório oficial...</div>`;
    if (window.lucide) lucide.createIcons({ root: container });

    try {
      if (tipo === 'geral') {
        const res = await API.get('/relatorios/geral', { dataInicio, dataFim, secretaria });
        this.dadosAtuais = res;
        this.renderRelatorioGeral(res, dataInicio, dataFim, secretaria);
      } else if (tipo === 'vencidos') {
        const res = await API.get('/relatorios/vencidos', { secretaria });
        this.dadosAtuais = res;
        this.renderRelatorioVencidos(res, secretaria);
      } else if (tipo === 'consumo') {
        const res = await API.get('/relatorios/consumo', { dataInicio, dataFim, secretaria });
        this.dadosAtuais = res;
        this.renderRelatorioConsumo(res, dataInicio, dataFim, secretaria);
      }
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      container.innerHTML = `<div style="text-align: center; color: var(--status-danger); padding: 30px;">Erro ao gerar relatório oficial.</div>`;
    }
  },

  renderRelatorioGeral(res, dataInicio, dataFim, secretaria) {
    const container = document.getElementById('relatorio-conteudo-resultado');
    const t = res.totais || {};
    const reg = res.registros || [];

    container.innerHTML = `
      <div class="print-header-institucional print-only">
        <img src="/assets/logo.png" class="print-logo" alt="Brasão SMC">
        <div class="print-title-group">
          <div class="print-main-title">Prefeitura Municipal de São Miguel dos Campos</div>
          <div class="print-sub-title">Relatório Geral de Trocas de Óleo e Lubrificação da Frota</div>
          <div style="font-size: 8pt; color: #64748b;">Período: ${Format.date(dataInicio)} até ${Format.date(dataFim)} | Secretaria: ${secretaria || 'Todas'}</div>
        </div>
      </div>

      <div class="kpi-grid" style="margin-bottom: 20px;">
        <div class="kpi-card">
          <div class="kpi-details">
            <div class="kpi-label">Total de Serviços</div>
            <div class="kpi-value">${Format.number(t.TOTAL_SERVICOS)}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-details">
            <div class="kpi-label">Veículos Atendidos</div>
            <div class="kpi-value">${Format.number(t.TOTAL_VEICULOS_ATENDIDOS)}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-details">
            <div class="kpi-label">Valor Total Estimado</div>
            <div class="kpi-value">${Format.currency(t.VALOR_TOTAL_GERAL)}</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-details">
            <div class="kpi-label">Filtros Substituídos</div>
            <div class="kpi-value">${Format.number((t.TOTAL_FILTRO_OLEO || 0) + (t.TOTAL_FILTRO_AR || 0) + (t.TOTAL_FILTRO_COMB || 0))}</div>
          </div>
        </div>
      </div>

      <div class="table-responsive">
        <table class="data-table print-table">
          <thead>
            <tr>
              <th>O.S.</th>
              <th>Data</th>
              <th>Placa</th>
              <th>Veículo</th>
              <th>Secretaria</th>
              <th>KM Troca</th>
              <th>Próx. Troca</th>
              <th>Mecânico</th>
              <th style="text-align: right;">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${reg.length === 0 ? `<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted);">Nenhum serviço realizado no período informado.</td></tr>` : 
              reg.map(r => `
                <tr>
                  <td><strong>${r.NUMERO_OS}</strong></td>
                  <td>${r.DATA_SERVICO_BR}</td>
                  <td><strong>${r.PLACA_VEICULO || '-'}</strong></td>
                  <td>${r.MODELO_VEICULO || r.MARCA_VEICULO || '-'}</td>
                  <td>${(r.SECRETARIA || '-').replace(/^\d+\s*-\s*/, '')}</td>
                  <td>${Format.number(r.KM_REGISTRADO)} km</td>
                  <td>${r.KM_PROXIMA_TROCA ? `${Format.number(r.KM_PROXIMA_TROCA)} km` : '-'}</td>
                  <td>${r.MECANICO_RESPONSAVEL || '-'}</td>
                  <td style="text-align: right;">${Format.currency(r.VALOR_TOTAL_SERVICO)}</td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>

      <div class="print-signatures print-only">
        <div class="signature-box">
          Responsável pelo Setor de Frota<br>Prefeitura de São Miguel dos Campos
        </div>
        <div class="signature-box">
          Gestor / Secretário Municipal<br>Visto Oficial
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons({ root: container });
  },

  renderRelatorioVencidos(res, secretaria) {
    const container = document.getElementById('relatorio-conteudo-resultado');
    const data = res.data || [];

    container.innerHTML = `
      <div class="print-header-institucional print-only">
        <img src="/assets/logo.png" class="print-logo" alt="Brasão SMC">
        <div class="print-title-group">
          <div class="print-main-title">Prefeitura Municipal de São Miguel dos Campos</div>
          <div class="print-sub-title">Relatório de Auditoria: Veículos com Troca Vencida ou em Alerta</div>
          <div style="font-size: 8pt; color: #64748b;">Secretaria: ${secretaria || 'Todas'} | Total de Inconformidades: ${data.length}</div>
        </div>
      </div>

      <div class="table-responsive">
        <table class="data-table print-table">
          <thead>
            <tr>
              <th>Placa</th>
              <th>Veículo / Modelo</th>
              <th>Secretaria</th>
              <th>KM Atual</th>
              <th>KM Previsto</th>
              <th>Data Limite</th>
              <th>Status</th>
              <th>KM Atraso</th>
            </tr>
          </thead>
          <tbody>
            ${data.length === 0 ? `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--status-success);">Nenhum veículo em atraso. Frota 100% regularizada!</td></tr>` :
              data.map(v => `
                <tr>
                  <td><strong>${v.PLACA_VEICULO || 'S/ PLACA'}</strong></td>
                  <td>${v.MODELO_VEICULO || v.DESCRICAO_VEICULOS}</td>
                  <td>${(v.SECRETARIA || '-').replace(/^\d+\s*-\s*/, '')}</td>
                  <td>${Format.number(v.KM_ATUAL)} km</td>
                  <td>${v.KM_PROXIMA_TROCA ? `${Format.number(v.KM_PROXIMA_TROCA)} km` : '-'}</td>
                  <td>${v.DATA_PROXIMA_BR || '-'}</td>
                  <td>${Format.statusBadge(v.STATUS_TROCA)}</td>
                  <td style="color: var(--status-danger); font-weight: bold;">
                    ${v.KM_ATRASO > 0 ? `+${Format.number(v.KM_ATRASO)} km` : '-'}
                  </td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
    `;

    if (window.lucide) lucide.createIcons({ root: container });
  },

  renderRelatorioConsumo(res, dataInicio, dataFim, secretaria) {
    const container = document.getElementById('relatorio-conteudo-resultado');
    const porProd = res.porProduto || [];
    const porSec = res.porSecretaria || [];

    container.innerHTML = `
      <div class="print-header-institucional print-only">
        <img src="/assets/logo.png" class="print-logo" alt="Brasão SMC">
        <div class="print-title-group">
          <div class="print-main-title">Prefeitura Municipal de São Miguel dos Campos</div>
          <div class="print-sub-title">Relatório Consolidado de Consumo de Lubrificantes e Insumos</div>
          <div style="font-size: 8pt; color: #64748b;">Período: ${Format.date(dataInicio)} até ${Format.date(dataFim)}</div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="content-card">
          <h3 class="card-title" style="margin-bottom: 16px;">Consumo por Insumo / Lubrificante</h3>
          <div class="table-responsive">
            <table class="data-table print-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Qtd. Total</th>
                  <th style="text-align: right;">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                ${porProd.map(p => `
                  <tr>
                    <td><strong>${p.NOME_PRODUTO}</strong></td>
                    <td>${p.NOME_CATEGORIA}</td>
                    <td><strong>${p.TOTAL_QUANTIDADE} ${p.UNIDADE_MEDIDA}</strong></td>
                    <td style="text-align: right;">${Format.currency(p.TOTAL_VALOR)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="content-card">
          <h3 class="card-title" style="margin-bottom: 16px;">Consumo por Secretaria</h3>
          <div class="table-responsive">
            <table class="data-table print-table">
              <thead>
                <tr>
                  <th>Secretaria</th>
                  <th>Trocas</th>
                  <th style="text-align: right;">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${porSec.map(s => `
                  <tr>
                    <td><strong>${(s.SECRETARIA || '-').replace(/^\d+\s*-\s*/, '')}</strong></td>
                    <td>${s.TOTAL_TROCAS}</td>
                    <td style="text-align: right;">${Format.currency(s.VALOR_TOTAL)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons({ root: container });
  },

  exportarCSV() {
    if (!this.dadosAtuais) {
      showToast('Gere o relatório primeiro antes de exportar.', 'warning');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    const tipo = document.getElementById('rel-tipo-selecionado')?.value || 'geral';

    if (tipo === 'geral' && this.dadosAtuais.registros) {
      csvContent += 'OS;Data;Placa;Modelo;Marca;Secretaria;Tipo Veiculo;KM Troca;Proxima Troca KM;Proxima Troca Data;Mecanico;Valor Total\n';
      this.dadosAtuais.registros.forEach(r => {
        csvContent += `"${r.NUMERO_OS}";"${r.DATA_SERVICO_BR}";"${r.PLACA_VEICULO || ''}";"${r.MODELO_VEICULO || ''}";"${r.MARCA_VEICULO || ''}";"${r.SECRETARIA || ''}";"${r.TIPO_VEICULO || ''}";"${r.KM_REGISTRADO || ''}";"${r.KM_PROXIMA_TROCA || ''}";"${r.DATA_PROXIMA_BR || ''}";"${r.MECANICO_RESPONSAVEL || ''}";"${r.VALOR_TOTAL_SERVICO || ''}"\n`;
      });
    } else if (tipo === 'vencidos' && this.dadosAtuais.data) {
      csvContent += 'Placa;Modelo;Marca;Secretaria;Tipo;KM Atual;KM Previsto;Data Limite;Status;KM Atraso\n';
      this.dadosAtuais.data.forEach(v => {
        csvContent += `"${v.PLACA_VEICULO || ''}";"${v.MODELO_VEICULO || ''}";"${v.MARCA_VEICULO || ''}";"${v.SECRETARIA || ''}";"${v.TIPO_VEICULO || ''}";"${v.KM_ATUAL || 0}";"${v.KM_PROXIMA_TROCA || ''}";"${v.DATA_PROXIMA_BR || ''}";"${v.STATUS_TROCA || ''}";"${v.KM_ATRASO || 0}"\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_lubrificacao_smc_${tipo}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Relatório exportado para CSV com sucesso!');
  }
};
