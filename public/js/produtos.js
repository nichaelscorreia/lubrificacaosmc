// ==========================================================================
// CATÁLOGO DE LUBRIFICANTES, FILTROS E ALMOXARIFADO
// ==========================================================================

const Produtos = {
  categorias: [],

  async init() {
    this.bindEvents();
    await this.loadCategorias();
    this.loadList();
  },

  bindEvents() {
    const searchInput = document.getElementById('produtos-search');
    if (searchInput && !searchInput.dataset.bound) {
      searchInput.dataset.bound = 'true';
      let debounce;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => this.loadList(), 350);
      });
    }

    const catFilter = document.getElementById('produtos-filter-categoria');
    if (catFilter && !catFilter.dataset.bound) {
      catFilter.dataset.bound = 'true';
      catFilter.addEventListener('change', () => this.loadList());
    }
  },

  async loadCategorias() {
    try {
      const res = await API.get('/produtos/categorias');
      if (res.success) {
        this.categorias = res.data;
        const filterSelect = document.getElementById('produtos-filter-categoria');
        const formSelect = document.getElementById('prod-form-categoria');

        const options = this.categorias.map(c => `<option value="${c.ID_CATEGORIA}">${c.NOME_CATEGORIA} (${c.TOTAL_PRODUTOS || 0})</option>`).join('');
        if (filterSelect) filterSelect.innerHTML = '<option value="">Todas as Categorias</option>' + options;
        if (formSelect) formSelect.innerHTML = '<option value="">-- Selecione a Categoria --</option>' + this.categorias.map(c => `<option value="${c.ID_CATEGORIA}">${c.NOME_CATEGORIA}</option>`).join('');
      }
    } catch (e) {
      console.error(e);
    }
  },

  async loadList() {
    const tbody = document.getElementById('tbody-produtos');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px;"><i data-lucide="loader-2" class="spin"></i> Carregando catálogo de produtos...</td></tr>`;
    if (window.lucide) lucide.createIcons({ root: tbody });

    const search = document.getElementById('produtos-search')?.value || '';
    const idCategoria = document.getElementById('produtos-filter-categoria')?.value || '';

    try {
      const res = await API.get('/produtos', { search, idCategoria });
      if (!res.success) throw new Error(res.message);

      this.renderTable(res.data);
    } catch (err) {
      console.error('Erro ao listar produtos:', err);
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--status-danger); padding: 24px;">Erro ao carregar produtos.</td></tr>`;
    }
  },

  renderTable(produtos) {
    const tbody = document.getElementById('tbody-produtos');
    if (!tbody) return;

    if (!produtos || produtos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">Nenhum produto cadastrado no momento.</td></tr>`;
      return;
    }

    tbody.innerHTML = produtos.map(p => {
      let badgeEstoque = '<span class="badge badge-success">OK</span>';
      if (p.STATUS_ESTOQUE === 'ZERADO') {
        badgeEstoque = '<span class="badge badge-danger">ZERADO</span>';
      } else if (p.STATUS_ESTOQUE === 'BAIXO') {
        badgeEstoque = '<span class="badge badge-warning">BAIXO</span>';
      }

      return `
        <tr>
          <td><strong>${p.CODIGO_PRODUTO || '-'}</strong></td>
          <td>
            <div style="font-weight: 600;">${p.NOME_PRODUTO}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${p.ESPECIFICACAO || ''}</div>
          </td>
          <td><span class="badge badge-neutral">${p.NOME_CATEGORIA}</span></td>
          <td>${p.MARCA || '-'}</td>
          <td><strong>${p.ESTOQUE_ATUAL} ${p.UNIDADE_MEDIDA}</strong></td>
          <td>${p.ESTOQUE_MINIMO} ${p.UNIDADE_MEDIDA}</td>
          <td>${badgeEstoque}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm" title="Entrada / Ajuste de Estoque" onclick="Produtos.abrirModalAjusteEstoque(${p.ID_PRODUTO}, '${p.NOME_PRODUTO}', ${p.ESTOQUE_ATUAL}, '${p.UNIDADE_MEDIDA}')">
                <i data-lucide="package-plus" style="width: 14px; height: 14px;"></i>
              </button>
              <button class="btn btn-secondary btn-sm" title="Editar Produto" onclick="Produtos.abrirModalEditar(${p.ID_PRODUTO})">
                <i data-lucide="edit" style="width: 14px; height: 14px;"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons({ root: tbody });
  },

  abrirModalNovo() {
    document.getElementById('form-produto').reset();
    document.getElementById('prod-form-id').value = '';
    document.getElementById('prod-modal-title').textContent = 'Novo Insumo / Lubrificante';
    App.openModal('modal-produto');
  },

  async abrirModalEditar(idProduto) {
    try {
      const res = await API.get('/produtos', { search: '' });
      const p = res.data.find(item => item.ID_PRODUTO === idProduto);
      if (!p) return;

      document.getElementById('prod-form-id').value = p.ID_PRODUTO;
      document.getElementById('prod-form-categoria').value = p.ID_CATEGORIA;
      document.getElementById('prod-form-codigo').value = p.CODIGO_PRODUTO || '';
      document.getElementById('prod-form-nome').value = p.NOME_PRODUTO;
      document.getElementById('prod-form-marca').value = p.MARCA || '';
      document.getElementById('prod-form-spec').value = p.ESPECIFICACAO || '';
      document.getElementById('prod-form-unidade').value = p.UNIDADE_MEDIDA || 'LITRO';
      document.getElementById('prod-form-estoque-min').value = p.ESTOQUE_MINIMO || 0;
      document.getElementById('prod-form-valor').value = p.VALOR_UNITARIO_ESTIMADO || 0;
      document.getElementById('prod-form-obs').value = p.OBSERVACOES || '';

      document.getElementById('prod-modal-title').textContent = 'Editar Produto';
      App.openModal('modal-produto');
    } catch (e) {
      console.error(e);
    }
  },

  async salvarProduto(e) {
    e.preventDefault();
    const id = document.getElementById('prod-form-id').value;

    const payload = {
      idCategoria: parseInt(document.getElementById('prod-form-categoria').value),
      codigoProduto: document.getElementById('prod-form-codigo').value.trim(),
      nomeProduto: document.getElementById('prod-form-nome').value.trim(),
      marca: document.getElementById('prod-form-marca').value.trim(),
      especificacao: document.getElementById('prod-form-spec').value.trim(),
      unidadeMedida: document.getElementById('prod-form-unidade').value,
      estoqueMinimo: parseFloat(document.getElementById('prod-form-estoque-min').value) || 0,
      valorUnitarioEstimado: parseFloat(document.getElementById('prod-form-valor').value) || 0,
      observacoes: document.getElementById('prod-form-obs').value.trim()
    };

    try {
      let res;
      if (id) {
        res = await API.put(`/produtos/${id}`, payload);
      } else {
        payload.estoqueAtual = parseFloat(document.getElementById('prod-form-estoque-min').value) || 0;
        res = await API.post('/produtos', payload);
      }

      if (res.success) {
        showToast(res.message);
        App.closeModal('modal-produto');
        this.loadList();
        Trocas.carregarProdutosCatalogo();
      }
    } catch (err) {
      showToast(err.message || 'Erro ao salvar produto.', 'error');
    }
  },

  abrirModalAjusteEstoque(idProduto, nomeProduto, estoqueAtual, unidade) {
    document.getElementById('form-ajuste-estoque').reset();
    document.getElementById('ajuste-prod-id').value = idProduto;
    document.getElementById('ajuste-prod-nome').textContent = nomeProduto;
    document.getElementById('ajuste-prod-saldo-atual').textContent = `${estoqueAtual} ${unidade}`;
    App.openModal('modal-ajuste-estoque');
  },

  async salvarAjusteEstoque(e) {
    e.preventDefault();
    const id = document.getElementById('ajuste-prod-id').value;
    const tipoMovimento = document.getElementById('ajuste-tipo').value;
    const quantidade = parseFloat(document.getElementById('ajuste-qtd').value);
    const numeroDocumento = document.getElementById('ajuste-doc').value.trim();
    const observacoes = document.getElementById('ajuste-obs').value.trim();

    try {
      const res = await API.post(`/produtos/${id}/estoque`, {
        tipoMovimento,
        quantidade,
        numeroDocumento,
        observacoes
      });

      if (res.success) {
        showToast(res.message);
        App.closeModal('modal-ajuste-estoque');
        this.loadList();
        Trocas.carregarProdutosCatalogo();
      }
    } catch (err) {
      showToast(err.message || 'Erro ao lançar movimentação.', 'error');
    }
  }
};
