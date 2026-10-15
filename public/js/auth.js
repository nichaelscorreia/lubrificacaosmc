// ==========================================================================
// AUTENTICAÇÃO E GESTÃO DE SESSÃO
// ==========================================================================

const Auth = {
  currentUser: null,

  init() {
    this.currentUser = API.getUser();
    this.updateUserUI();

    const loginForm = document.getElementById('form-login');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => this.logout());
    }
  },

  isAuthenticated() {
    return !!API.getToken() && !!this.currentUser;
  },

  isAdmin() {
    return this.currentUser && this.currentUser.perfil === 'ADMIN';
  },

  async handleLogin(e) {
    e.preventDefault();
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    const originalText = btnSubmit.innerHTML;

    try {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Entrando...`;

      const loginInput = document.getElementById('login-username').value.trim();
      const senhaInput = document.getElementById('login-password').value;

      const res = await API.post('/auth/login', { login: loginInput, senha: senhaInput });

      if (res.success) {
        API.setToken(res.token);
        API.setUser(res.user);
        this.currentUser = res.user;

        showToast(`Bem-vindo(a), ${res.user.nomeCompleto}!`);
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('app-view').style.display = 'flex';

        this.updateUserUI();
        App.initApp();
      }
    } catch (err) {
      showToast(err.message || 'Falha ao realizar login.', 'error');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalText;
      if (window.lucide) lucide.createIcons();
    }
  },

  logout() {
    API.setToken(null);
    API.setUser(null);
    this.currentUser = null;
    showToast('Sessão encerrada com sucesso.');
    window.location.reload();
  },

  updateUserUI() {
    if (!this.currentUser) return;

    const nameEls = document.querySelectorAll('.user-name-display');
    nameEls.forEach(el => el.textContent = this.currentUser.nomeCompleto || this.currentUser.login);

    const roleEls = document.querySelectorAll('.user-role-display');
    roleEls.forEach(el => {
      let roleLabel = 'Operador';
      if (this.currentUser.perfil === 'ADMIN') roleLabel = 'Administrador';
      else if (this.currentUser.perfil === 'GESTOR') roleLabel = 'Gestor de Frota';
      else if (this.currentUser.perfil === 'CONSULTA') roleLabel = 'Consulta';
      el.textContent = roleLabel;
    });

    // Controlar visibilidade de itens restritos ao Administrador
    const adminOnlyEls = document.querySelectorAll('.admin-only');
    adminOnlyEls.forEach(el => {
      el.style.display = this.isAdmin() ? '' : 'none';
    });
  }
};
