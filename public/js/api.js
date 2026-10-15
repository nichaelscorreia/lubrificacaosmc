// ==========================================================================
// CLIENTE API & UTILITÁRIOS GLOBAIS
// ==========================================================================

const API = {
  baseUrl: '/api',

  getToken() {
    return localStorage.getItem('smc_lub_token');
  },

  setToken(token) {
    if (token) localStorage.setItem('smc_lub_token', token);
    else localStorage.removeItem('smc_lub_token');
  },

  getUser() {
    try {
      const u = localStorage.getItem('smc_lub_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },

  setUser(user) {
    if (user) localStorage.setItem('smc_lub_user', JSON.stringify(user));
    else localStorage.removeItem('smc_lub_user');
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({ success: false, message: 'Resposta inválida do servidor.' }));

      if (response.status === 401 || response.status === 403) {
        if (token && !endpoint.includes('/auth/login')) {
          this.setToken(null);
          this.setUser(null);
          window.location.reload();
          return { success: false, message: 'Sessão expirada. Faça login novamente.' };
        }
      }

      if (!response.ok) {
        throw new Error(data.message || `Erro HTTP ${response.status}`);
      }

      return data;
    } catch (err) {
      console.error(`Erro na requisição para ${endpoint}:`, err);
      throw err;
    }
  },

  get(endpoint, params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v);
    });
    const qs = query.toString();
    return this.request(`${endpoint}${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body: JSON.stringify(body) });
  },

  put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body: JSON.stringify(body) });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
};

// Notificações Toast
function showToast(message, type = 'success', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : type === 'warning' ? 'toast-warning' : ''}`;
  
  const icon = type === 'error' ? 'alert-circle' : type === 'warning' ? 'alert-triangle' : 'check-circle';
  toast.innerHTML = `
    <i data-lucide="${icon}" style="width: 20px; height: 20px; color: ${type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#10b981'};"></i>
    <span style="font-size: 0.88rem; font-weight: 500;">${message}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons({ root: toast });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Formatadores
const Format = {
  currency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  },

  number(value) {
    return new Intl.NumberFormat('pt-BR').format(value || 0);
  },

  date(dateStr) {
    if (!dateStr) return '-';
    // Se YYYY-MM-DD
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  },

  statusBadge(status) {
    switch (status) {
      case 'REGULAR':
        return `<span class="badge badge-success"><i data-lucide="check" style="width: 12px; height: 12px;"></i> Em Dia</span>`;
      case 'ALERTA':
        return `<span class="badge badge-warning"><i data-lucide="alert-triangle" style="width: 12px; height: 12px;"></i> Atenção</span>`;
      case 'VENCIDO':
        return `<span class="badge badge-danger"><i data-lucide="alert-circle" style="width: 12px; height: 12px;"></i> Vencido</span>`;
      case 'SEM_REGISTRO':
      default:
        return `<span class="badge badge-neutral"><i data-lucide="help-circle" style="width: 12px; height: 12px;"></i> Sem Reg.</span>`;
    }
  }
};
