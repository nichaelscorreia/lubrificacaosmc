// ==========================================================================
// APLICAÇÃO PRINCIPAL & ROTEADOR SPA
// ==========================================================================

const App = {
  currentSection: 'dashboard',

  init() {
    this.initTheme();
    Auth.init();

    if (Auth.isAuthenticated()) {
      document.getElementById('login-view').style.display = 'none';
      document.getElementById('app-view').style.display = 'flex';
      this.initApp();
    } else {
      document.getElementById('login-view').style.display = 'flex';
      document.getElementById('app-view').style.display = 'none';
    }

    this.bindGlobalEvents();
  },

  initApp() {
    this.navigate(window.location.hash.replace('#', '') || 'dashboard');

    // Inicializa ícones Lucide
    if (window.lucide) {
      lucide.createIcons();
    }
  },

  bindGlobalEvents() {
    // Navegação Sidebar
    document.querySelectorAll('.nav-item').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.getAttribute('data-section');
        if (section) {
          window.location.hash = section;
          this.navigate(section);
        }
      });
    });

    // Theme Toggle
    const themeBtn = document.getElementById('btn-toggle-theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Toggle Sidebar Mobile
    const toggleSidebarBtn = document.getElementById('btn-toggle-sidebar');
    if (toggleSidebarBtn) {
      toggleSidebarBtn.addEventListener('click', () => {
        document.querySelector('.app-sidebar')?.classList.toggle('open');
      });
    }

    // Modal close buttons
    document.querySelectorAll('.modal-close-btn, .btn-modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const backdrop = btn.closest('.modal-backdrop');
        if (backdrop) backdrop.classList.remove('active');
      });
    });

    // Fecha modal clicando no backdrop
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    });

    // Esc para fechar modais
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.active').forEach(m => m.classList.remove('active'));
      }
    });

    // Atalho global: Ctrl+Alt+N ou F2 para nova troca
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        Trocas.abrirNovaTrocaModal();
      }
    });
  },

  navigate(section) {
    if (!section) section = 'dashboard';
    this.currentSection = section;

    // Atualiza links da sidebar
    document.querySelectorAll('.nav-item').forEach(link => {
      if (link.getAttribute('data-section') === section) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Oculta todas as views e exibe a selecionada
    document.querySelectorAll('.section-view').forEach(view => {
      view.classList.remove('active');
    });

    const targetView = document.getElementById(`view-${section}`);
    if (targetView) {
      targetView.classList.add('active');
    }

    // Atualiza títulos
    const titles = {
      dashboard: { title: 'Painel Geral de Lubrificação', subtitle: 'Visão consolidada da frota e monitoramento preventivo' },
      veiculos: { title: 'Frota Municipal de Veículos', subtitle: '374 veículos integrados e histórico de manutenção' },
      trocas: { title: 'Ordens de Serviço & Trocas de Óleo', subtitle: 'Registro e emissão de comprovantes de serviços executados' },
      produtos: { title: 'Catálogo de Insumos & Almoxarifado', subtitle: 'Controle de saldo e especificações técnicas de lubrificantes e filtros' },
      relatorios: { title: 'Relatórios Gerenciais & Auditoria', subtitle: 'Prestação de contas por secretaria e demonstrativo de consumo' },
      usuarios: { title: 'Gerenciamento de Acesso', subtitle: 'Controle de usuários, perfis e secretarias vinculadas' }
    };

    if (titles[section]) {
      document.getElementById('header-page-title').textContent = titles[section].title;
      document.getElementById('header-page-subtitle').textContent = titles[section].subtitle;
    }

    // Inicializa o módulo correspondente
    if (section === 'dashboard') Dashboard.load();
    else if (section === 'veiculos') Veiculos.init();
    else if (section === 'trocas') Trocas.init();
    else if (section === 'produtos') Produtos.init();
    else if (section === 'relatorios') Relatorios.init();
    else if (section === 'usuarios') Usuarios.init();

    // Fecha sidebar mobile se aberta
    document.querySelector('.app-sidebar')?.classList.remove('open');

    if (window.lucide) lucide.createIcons();
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      if (window.lucide) lucide.createIcons({ root: modal });
    }
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  },

  initTheme() {
    const savedTheme = localStorage.getItem('smc_lub_theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    this.updateThemeIcon(savedTheme);
  },

  toggleTheme() {
    const current = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('smc_lub_theme', next);
    this.updateThemeIcon(next);

    // Recarrega gráficos se no dashboard
    if (this.currentSection === 'dashboard') {
      Dashboard.load();
    }
  },

  updateThemeIcon(theme) {
    const iconContainer = document.getElementById('theme-toggle-icon');
    if (iconContainer) {
      iconContainer.innerHTML = theme === 'dark' 
        ? `<i data-lucide="sun" style="width: 18px; height: 18px; color: #f59e0b;"></i>` 
        : `<i data-lucide="moon" style="width: 18px; height: 18px;"></i>`;
      if (window.lucide) lucide.createIcons({ root: iconContainer });
    }
  }
};

// Inicialização ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
