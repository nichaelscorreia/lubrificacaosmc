// ==========================================================================
// PAINEL / DASHBOARD EXECUTIVO
// ==========================================================================

const Dashboard = {
  charts: {
    secretarias: null,
    status: null,
    historico: null
  },

  async load() {
    try {
      const res = await API.get('/dashboard/stats');
      if (!res.success) throw new Error(res.message);

      this.renderKPIs(res.stats);
      this.renderCharts(res.charts, res.stats);
      this.renderAlertas(res.alertas);
      this.renderUltimasTrocas(res.ultimasTrocas);
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err);
      showToast('Não foi possível atualizar o painel.', 'error');
    }
  },

  renderKPIs(stats) {
    document.getElementById('kpi-total-frota').textContent = Format.number(stats.totalFrota);
    document.getElementById('kpi-em-dia').textContent = Format.number(stats.emDia);
    document.getElementById('kpi-em-alerta').textContent = Format.number(stats.emAlerta);
    document.getElementById('kpi-vencidos').textContent = Format.number(stats.vencidos);
    document.getElementById('kpi-trocas-mes').textContent = Format.number(stats.trocasMes);
    document.getElementById('kpi-litros-mes').textContent = `${Format.number(stats.litrosMes)} L`;
  },

  renderCharts(chartsData, stats) {
    // 1. Gráfico de Status da Frota (Donut)
    const ctxStatus = document.getElementById('chart-status-frota');
    if (ctxStatus) {
      if (this.charts.status) this.charts.status.destroy();

      this.charts.status = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
          labels: ['Em Dia', 'Alerta', 'Vencidos', 'Sem Registro'],
          datasets: [{
            data: [stats.emDia, stats.emAlerta, stats.vencidos, stats.semRegistro],
            backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#94a3b8'],
            borderWidth: 2,
            borderColor: document.body.getAttribute('data-theme') === 'dark' ? '#111827' : '#ffffff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 12,
                font: { size: 11, family: 'Inter' },
                color: document.body.getAttribute('data-theme') === 'dark' ? '#cbd5e1' : '#475569'
              }
            }
          },
          cutout: '68%'
        }
      });
    }

    // 2. Gráfico por Secretarias (Horizontal Bar)
    const ctxSec = document.getElementById('chart-secretarias');
    if (ctxSec && chartsData.secretarias) {
      if (this.charts.secretarias) this.charts.secretarias.destroy();

      const labels = chartsData.secretarias.slice(0, 8).map(s => {
        // Encurta nome da secretaria para caber no gráfico
        return s.SECRETARIA.replace(/^\d+\s*-\s*/, '').substring(0, 24);
      });
      const data = chartsData.secretarias.slice(0, 8).map(s => s.TOTAL);

      this.charts.secretarias = new Chart(ctxSec, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Veículos',
            data,
            backgroundColor: '#059669',
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: document.body.getAttribute('data-theme') === 'dark' ? '#94a3b8' : '#64748b' }
            },
            y: {
              grid: { display: false },
              ticks: {
                font: { size: 11, family: 'Inter' },
                color: document.body.getAttribute('data-theme') === 'dark' ? '#cbd5e1' : '#334155'
              }
            }
          }
        }
      });
    }

    // 3. Gráfico Histórico de Trocas (Linha / Área)
    const ctxHist = document.getElementById('chart-historico-trocas');
    if (ctxHist && chartsData.historicoMeses) {
      if (this.charts.historico) this.charts.historico.destroy();

      const labels = chartsData.historicoMeses.map(h => h.ROTULO || h.MES_ANO);
      const data = chartsData.historicoMeses.map(h => h.TOTAL_TROCAS);

      this.charts.historico = new Chart(ctxHist, {
        type: 'line',
        data: {
          labels: labels.length > 0 ? labels : ['Mês Atual'],
          datasets: [{
            label: 'Trocas Realizadas',
            data: data.length > 0 ? data : [stats.trocasMes],
            borderColor: '#059669',
            backgroundColor: 'rgba(5, 150, 105, 0.1)',
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#059669',
            pointRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { precision: 0 }
            }
          }
        }
      });
    }
  },

  renderAlertas(alertas) {
    const tbody = document.getElementById('tbody-alertas-dashboard');
    if (!tbody) return;

    if (!alertas || alertas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">Nenhum veículo com alerta crítico no momento. Toda a frota em dia!</td></tr>`;
      return;
    }

    tbody.innerHTML = alertas.map(a => `
      <tr>
        <td><strong>${a.PLACA_VEICULO || 'S/ PLACA'}</strong></td>
        <td>${a.MODELO_VEICULO || a.DESCRICAO_VEICULOS || '-'}</td>
        <td style="font-size: 0.78rem; color: var(--text-muted);">${(a.SECRETARIA || '-').replace(/^\d+\s*-\s*/, '')}</td>
        <td>${Format.number(a.KM_ATUAL)} km</td>
        <td>${Format.statusBadge(a.STATUS_TROCA)}</td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="Trocas.abrirNovaTrocaModal(${a.CODIGO_VEICULO})">
            <i data-lucide="droplet" style="width: 14px; height: 14px;"></i> Trocar
          </button>
        </td>
      </tr>
    `).join('');

    if (window.lucide) lucide.createIcons({ root: tbody });
  },

  renderUltimasTrocas(trocas) {
    const tbody = document.getElementById('tbody-ultimas-trocas');
    if (!tbody) return;

    if (!trocas || trocas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">Nenhum registro de troca recente.</td></tr>`;
      return;
    }

    tbody.innerHTML = trocas.map(t => `
      <tr>
        <td><strong>${t.NUMERO_OS}</strong></td>
        <td>${t.PLACA_VEICULO || '-'} (${t.MODELO_VEICULO || '-'})</td>
        <td>${Format.date(t.DATA_SERVICO)}</td>
        <td>${Format.number(t.KM_REGISTRADO)} km</td>
        <td>${t.MECANICO_RESPONSAVEL || '-'}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="Trocas.abrirDetalhesTroca(${t.ID_TROCA})">
            <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
          </button>
        </td>
      </tr>
    `).join('');

    if (window.lucide) lucide.createIcons({ root: tbody });
  }
};
