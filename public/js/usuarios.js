// ==========================================================================
// CONTROLE DE USUÁRIOS E PERMISSÕES (ADMIN)
// ==========================================================================

const Usuarios = {
  async init() {
    this.bindEvents();
    this.loadList();
  },

  bindEvents() {
    const btnNovo = document.getElementById('btn-novo-usuario');
    if (btnNovo && !btnNovo.dataset.bound) {
      btnNovo.dataset.bound = 'true';
      btnNovo.addEventListener('click', () => this.abrirModalNovo());
    }
  },

  async loadList() {
    const tbody = document.getElementById('tbody-usuarios');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px;"><i data-lucide="loader-2" class="spin"></i> Carregando usuários...</td></tr>`;
    if (window.lucide) lucide.createIcons({ root: tbody });

    try {
      const res = await API.get('/usuarios');
      if (!res.success) throw new Error(res.message);

      this.renderTable(res.data);
    } catch (err) {
      console.error('Erro ao listar usuários:', err);
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--status-danger); padding: 24px;">Erro ao carregar usuários.</td></tr>`;
    }
  },

  renderTable(usuarios) {
    const tbody = document.getElementById('tbody-usuarios');
    if (!tbody) return;

    if (!usuarios || usuarios.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">Nenhum usuário cadastrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = usuarios.map(u => `
      <tr>
        <td><strong>${u.LOGIN}</strong></td>
        <td>${u.NOME_COMPLETO}</td>
        <td>${u.CARGO || '-'}</td>
        <td>
          <span class="badge ${u.PERFIL === 'ADMIN' ? 'badge-danger' : u.PERFIL === 'GESTOR' ? 'badge-warning' : 'badge-info'}">
            ${u.PERFIL}
          </span>
        </td>
        <td>${u.SECRETARIA_VINCULADA ? u.SECRETARIA_VINCULADA.replace(/^\d+\s*-\s*/, '') : 'Geral (Todas)'}</td>
        <td>
          <span class="badge ${u.ATIVO === 'S' ? 'badge-success' : 'badge-neutral'}">
            ${u.ATIVO === 'S' ? 'ATIVO' : 'INATIVO'}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" title="Editar Usuário" onclick="Usuarios.abrirModalEditar(${JSON.stringify(u).replace(/"/g, '&quot;')})">
              <i data-lucide="edit" style="width: 14px; height: 14px;"></i>
            </button>
            <button class="btn btn-warning btn-sm" title="Redefinir Senha" onclick="Usuarios.abrirModalResetSenha(${u.ID_USUARIO}, '${u.LOGIN}')">
              <i data-lucide="key" style="width: 14px; height: 14px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    if (window.lucide) lucide.createIcons({ root: tbody });
  },

  abrirModalNovo() {
    document.getElementById('form-usuario').reset();
    document.getElementById('user-form-id').value = '';
    document.getElementById('user-form-login').disabled = false;
    document.getElementById('user-group-senha').style.display = 'block';
    document.getElementById('user-modal-title').textContent = 'Novo Usuário do Sistema';
    App.openModal('modal-usuario');
  },

  abrirModalEditar(u) {
    document.getElementById('form-usuario').reset();
    document.getElementById('user-form-id').value = u.ID_USUARIO;
    document.getElementById('user-form-login').value = u.LOGIN;
    document.getElementById('user-form-login').disabled = true;
    document.getElementById('user-form-nome').value = u.NOME_COMPLETO;
    document.getElementById('user-form-email').value = u.EMAIL || '';
    document.getElementById('user-form-cargo').value = u.CARGO || '';
    document.getElementById('user-form-perfil').value = u.PERFIL;
    document.getElementById('user-form-ativo').value = u.ATIVO;

    document.getElementById('user-group-senha').style.display = 'none';
    document.getElementById('user-modal-title').textContent = 'Editar Usuário';
    App.openModal('modal-usuario');
  },

  async salvarUsuario(e) {
    e.preventDefault();
    const id = document.getElementById('user-form-id').value;

    const payload = {
      login: document.getElementById('user-form-login').value.trim(),
      senha: document.getElementById('user-form-senha')?.value,
      nomeCompleto: document.getElementById('user-form-nome').value.trim(),
      email: document.getElementById('user-form-email').value.trim(),
      cargo: document.getElementById('user-form-cargo').value.trim(),
      perfil: document.getElementById('user-form-perfil').value,
      secretariaVinculada: document.getElementById('user-form-secretaria')?.value || null,
      ativo: document.getElementById('user-form-ativo')?.value || 'S'
    };

    try {
      let res;
      if (id) {
        res = await API.put(`/usuarios/${id}`, payload);
      } else {
        res = await API.post('/usuarios', payload);
      }

      if (res.success) {
        showToast(res.message);
        App.closeModal('modal-usuario');
        this.loadList();
      }
    } catch (err) {
      showToast(err.message || 'Erro ao salvar usuário.', 'error');
    }
  },

  abrirModalResetSenha(idUsuario, login) {
    const novaSenha = prompt(`Digite a nova senha para o usuário [${login}] (mínimo 6 caracteres):`);
    if (!novaSenha) return;
    if (novaSenha.length < 6) {
      showToast('A senha deve possuir pelo menos 6 caracteres.', 'error');
      return;
    }

    this.executarResetSenha(idUsuario, novaSenha);
  },

  async executarResetSenha(idUsuario, novaSenha) {
    try {
      const res = await API.post(`/usuarios/${idUsuario}/reset-password`, { novaSenha });
      if (res.success) {
        showToast(res.message);
      }
    } catch (err) {
      showToast(err.message || 'Erro ao redefinir senha.', 'error');
    }
  }
};
