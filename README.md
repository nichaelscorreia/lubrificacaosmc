# 🚗 Sistema de Controle de Lubrificação e Troca de Óleo Automotivo
### 🏛️ Prefeitura Municipal de São Miguel dos Campos - AL

Sistema institucional profissional para gestão completa de lubrificação, trocas de óleo, filtros, insumos e manutenção preventiva da frota municipal (integrado aos **374 veículos** cadastrados na tabela oficial `NST_VEICULOS`).

---

## 🏗️ Arquitetura do Sistema

```
                                  [ NUVEM / RENDER ]
                                +---------------------+
                                |  App Web (Node.js)  |
                                |  Frontend SPA + API |
                                +----------+----------+
                                           |
                              HTTP / HMAC-SHA256 / Bearer
                                           |
                                           v
                               [ REDE INTERNA / TOMCAT ]
                                +---------------------+
                                |   Tomcat 8.5 / 9    |
                                |  (lubrificacao-api) |
                                +----------+----------+
                                           |
                                      JDBC Oracle
                                           |
                                           v
                              +--------------------------+
                              | Oracle Database 19c / XE |
                              | 192.168.2.136:1521/xe    |
                              | Owner: c##nstecholeo     |
                              +--------------------------+
```

1. **Frontend Web (SPA):**
   - Interface institucional moderna com as cores oficiais da Prefeitura de São Miguel dos Campos.
   - Dashboard analítico em tempo real com indicadores de trocas, filtros por secretaria e alertas de veículos vencidos/em atenção.
   - Emissão e impressão de etiquetas térmicas/adesivas de troca de óleo para para-brisa.
   - Controle de estoque de lubrificantes, filtros e insumos com alertas de nível mínimo.
   - Exportação de relatórios gerenciais em CSV e impressão em formato A4 institucional.

2. **Backend Node.js (Render / Nuvem):**
   - API RESTful estruturada em Express.
   - Autenticação JWT com controle de perfis de acesso (`ADMIN`, `OPERADOR`, `GESTOR`, `LEITURA`).
   - Mapeamento transparente: opera localmente conectado direto ao Oracle ou em produção na nuvem consumindo o backend Tomcat via HMAC.

3. **Backend Tomcat (`tomcat-api`):**
   - Pacote WAR (`lubrificacao-api.war`) desenvolvido em Java com driver `ojdbc6.jar` embutido.
   - Pool de conexões otimizado, proteção contra SQL Injection, validação de IP e autenticação criptográfica por assinatura HMAC-SHA256 ou Bearer token.
   - Faz a ponte entre a nuvem e o servidor de banco Oracle na rede local.

---

## 📦 Estrutura de Pastas

```
├── .env.example              # Modelo de configuração de ambiente
├── render.yaml               # Blueprint de deploy automático no Render
├── package.json              # Dependências e scripts Node.js
├── public/                   # Frontend estático (HTML, CSS, JS, Assets)
│   ├── css/                  # Estilos institucionais
│   ├── js/                   # Controladores SPA do cliente
│   └── index.html            # Aplicação principal
├── server/                   # Backend Node.js
│   ├── config/               # database.js com chaveamento local/Tomcat
│   ├── controllers/          # Lógica de negócios de cada módulo
│   ├── middleware/           # Autenticação JWT e auditoria
│   └── routes/               # Definição das rotas REST
├── scripts/                  # Scripts auxiliares (seed de produtos, admin inicial)
└── tomcat-api/               # Backend Java WAR para Apache Tomcat
    ├── deploy/               # lubrificacao-api.war e lubrificacao-api.xml
    ├── ddl/                  # Scripts DDL de criação das tabelas Oracle
    └── src/main/java/        # Código fonte Java da API
```

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- Node.js 18+ (ou 20+)
- Conexão de rede com o servidor Oracle (`192.168.2.136:1521/xe`)

### Passos:
1. Clone o repositório:
   ```bash
   git clone https://github.com/nichaelscorreia/lubrificacaosmc.git
   cd lubrificacaosmc
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Configure o arquivo `.env`:
   ```bash
   cp .env.example .env
   ```

4. Inicie o servidor:
   ```bash
   npm run dev
   ```
   Acesse no navegador: `http://localhost:3000`

---

## 🌐 Como Colocar em Produção (Tomcat + Render)

### Passo 1: Deploy da API no Tomcat (Rede Local do Oracle)

1. No servidor onde está o Tomcat na rede local (ex: porta 8080 ou 8086):
   - Copie `tomcat-api/deploy/lubrificacao-api.xml` para:
     ```bash
     $CATALINA_BASE/conf/Catalina/localhost/lubrificacao-api.xml
     ```
   - Ajuste o usuário, senha do Oracle e defina a chave `API_SECRET`.
   - Copie `tomcat-api/deploy/lubrificacao-api.war` para a pasta `webapps` do Tomcat:
     ```bash
     cp tomcat-api/deploy/lubrificacao-api.war $CATALINA_BASE/webapps/lubrificacao-api.war
     ```
2. Teste o endpoint de saúde:
   ```bash
   curl http://SEU_IP_OU_DDNS:8080/lubrificacao-api/api/health
   # Resposta esperada: {"status":"ok","service":"smc-lubrificacao-api","databaseConfigured":true,...}
   ```

### Passo 2: Deploy no Render

1. No Render Dashboard:
   - Clique em **New** > **Blueprint**.
   - Conecte o repositório: `https://github.com/nichaelscorreia/lubrificacaosmc`.
   - O Render lerá o arquivo `render.yaml`.
2. Configure as seguintes variáveis de ambiente no Render:
   - `LUBRIFICACAO_API_URL`: Ex: `http://nstech.ddns.net:8086/lubrificacao-api`
   - `LUBRIFICACAO_API_SECRET`: O mesmo segredo configurado no XML do Tomcat.
   - `JWT_SECRET`: Uma chave segura para assinar tokens dos usuários.
3. Clique em **Apply** e a aplicação estará no ar!

---

## 👥 Credenciais Iniciais de Acesso

- **Usuário:** `admin`
- **Senha Padrão:** `admin123` *(recomendado alterar no primeiro acesso através do menu de perfil)*
