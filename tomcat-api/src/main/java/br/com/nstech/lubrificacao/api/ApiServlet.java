package br.com.nstech.lubrificacao.api;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.Driver;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Enumeration;
import java.util.UUID;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * Servlet principal da API de Controle de Lubrificação.
 *
 * Endpoints:
 *   GET  /api/health      (público) Verifica integridade do serviço
 *   GET  /api/ping        (autenticado) Testa conectividade com o Oracle (SELECT 1 FROM DUAL)
 *   POST /api/sql         (autenticado) Executa SQL dinâmico com binds (SELECT ou DML)
 *   POST /api/execute     (autenticado) Alias para /api/sql
 *   POST /api/query       (autenticado) Alias para /api/sql
 */
public class ApiServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    private transient ApiConfig cfg;
    private transient ConnectionPool pool;
    private transient Security security;

    @Override
    public void init() throws ServletException {
        cfg = ApiConfig.load(getServletContext());
        if (!cfg.problems.isEmpty()) {
            log("AVISO: SMC Lubrificacao API com pendências de configuração: " + cfg.problems);
        }
        try {
            pool = new ConnectionPool(cfg);
            log("Pool Oracle inicializado com sucesso para: " + cfg.dbUrl + " (" + cfg.dbUser + ")");
        } catch (ClassNotFoundException e) {
            log("ERRO: Driver Oracle JDBC não encontrado no WAR", e);
        }
        security = new Security(cfg.secret, cfg.rateLimitPerMinute);
    }

    @Override
    public void destroy() {
        if (pool != null) {
            pool.close();
        }
        // Desregistra drivers JDBC para prevenir memory leaks em redeploys
        ClassLoader cl = getClass().getClassLoader();
        Enumeration<Driver> drivers = DriverManager.getDrivers();
        while (drivers.hasMoreElements()) {
            Driver d = drivers.nextElement();
            if (d.getClass().getClassLoader() == cl) {
                try {
                    DriverManager.deregisterDriver(d);
                } catch (SQLException ignore) {}
            }
        }
    }

    @Override
    protected void doOptions(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        setCorsHeaders(resp);
        resp.setStatus(HttpServletResponse.SC_NO_CONTENT);
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        handle(req, resp, "GET");
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        handle(req, resp, "POST");
    }

    private void handle(HttpServletRequest req, HttpServletResponse resp, String method) throws IOException {
        setCorsHeaders(resp);
        resp.setCharacterEncoding("UTF-8");
        resp.setContentType("application/json; charset=UTF-8");

        String path = req.getPathInfo();
        if (path == null || path.isEmpty()) {
            path = "/";
        }

        // 1. Endpoint /health (sem autenticação)
        if ("/health".equals(path)) {
            boolean hasPool = pool != null;
            String json = "{\"status\":\"ok\",\"service\":\"smc-lubrificacao-api\",\"databaseConfigured\":"
                    + hasPool + ",\"timestamp\":" + System.currentTimeMillis() + "}";
            send(resp, 200, json);
            return;
        }

        if (pool == null) {
            send(resp, 503, "{\"error\":\"Pool Oracle não inicializado\",\"problems\":"
                    + cfg.problems.toString() + "}");
            return;
        }

        // 2. Validação de IP permitido
        String ip = req.getRemoteAddr();
        if (!cfg.allowedIps.allows(ip)) {
            log("Acesso bloqueado por ALLOWED_IPS: " + ip);
            send(resp, 403, "{\"error\":\"Acesso negado para o IP de origem\"}");
            return;
        }

        // 3. Rate Limit & Lockout
        if (security.isLockedOut(ip)) {
            send(resp, 429, "{\"error\":\"Muitas tentativas inválidas. Bloqueado temporariamente.\"}");
            return;
        }

        // Ler corpo da requisição
        String body = readBody(req);

        // 4. Autenticação (HMAC-SHA256 ou Bearer)
        if (!security.verifyRequest(req, body)) {
            security.recordAuthFailure(ip);
            log("Falha de autenticação de IP: " + ip + " para URI: " + req.getRequestURI());
            send(resp, 401, "{\"error\":\"Não autorizado. Assinatura HMAC ou Bearer token inválido.\"}");
            return;
        }

        if (!security.allowRequest(ip)) {
            send(resp, 429, "{\"error\":\"Limite de requisições excedido. Tente novamente em breve.\"}");
            return;
        }

        // 5. Roteamento de endpoints autenticados
        if ("/ping".equals(path)) {
            handlePing(resp);
        } else if ("/sql".equals(path) || "/execute".equals(path) || "/query".equals(path)) {
            handleSql(req, resp, body);
        } else {
            send(resp, 404, "{\"error\":\"Endpoint não encontrado: " + path + "\"}");
        }
    }

    private void handlePing(HttpServletResponse resp) throws IOException {
        ConnectionPool.Pooled p = null;
        boolean broken = false;
        try {
            p = pool.borrow();
            PreparedStatement ps = null;
            ResultSet rs = null;
            try {
                ps = p.con.prepareStatement("SELECT 1 AS TESTE FROM DUAL");
                rs = ps.executeQuery();
                if (rs.next()) {
                    send(resp, 200, "{\"status\":\"ok\",\"database\":\"connected\",\"time\":" + System.currentTimeMillis() + "}");
                } else {
                    send(resp, 500, "{\"error\":\"Falha ao consultar DUAL\"}");
                }
            } finally {
                if (rs != null) try { rs.close(); } catch (SQLException ignore) {}
                if (ps != null) try { ps.close(); } catch (SQLException ignore) {}
            }
        } catch (Exception e) {
            broken = true;
            log("Erro ao executar ping no Oracle", e);
            send(resp, 500, "{\"error\":\"Falha na conexão com Oracle: " + Json.quote(e.getMessage()) + "\"}");
        } finally {
            if (p != null) {
                pool.release(p, broken);
            }
        }
    }

    private void handleSql(HttpServletRequest req, HttpServletResponse resp, String body) throws IOException {
        String sql = null;
        JsonElement binds = null;

        if (body != null && !body.trim().isEmpty()) {
            try {
                JsonElement json = Json.parse(body);
                if (json.isJsonObject()) {
                    JsonObject obj = json.getAsJsonObject();
                    if (obj.has("sql")) {
                        sql = obj.get("sql").getAsString();
                    }
                    if (obj.has("binds")) {
                        binds = obj.get("binds");
                    }
                }
            } catch (Exception e) {
                send(resp, 400, "{\"error\":\"JSON de requisição inválido: " + Json.quote(e.getMessage()) + "\"}");
                return;
            }
        }

        // Fallback para parâmetros de formulário/query string se não vier no body
        if (sql == null || sql.trim().isEmpty()) {
            sql = req.getParameter("sql");
        }

        if (sql == null || sql.trim().isEmpty()) {
            send(resp, 400, "{\"error\":\"Parâmetro 'sql' obrigatório\"}");
            return;
        }

        sql = sql.trim();
        NamedSql parsed = NamedSql.parse(sql);

        ConnectionPool.Pooled p = null;
        boolean broken = false;
        long start = System.currentTimeMillis();

        try {
            p = pool.borrow();
            PreparedStatement ps = null;
            ResultSet rs = null;

            try {
                ps = p.con.prepareStatement(parsed.jdbcSql);
                ps.setQueryTimeout(cfg.queryTimeoutSeconds);

                parsed.bind(ps, binds);

                boolean hasResultSet = ps.execute();

                if (hasResultSet) {
                    rs = ps.getResultSet();
                    JsonArray rows = Json.serializeResultSet(rs, cfg.maxRows);

                    JsonObject result = new JsonObject();
                    result.add("rows", rows);
                    result.addProperty("rowsAffected", 0);

                    send(resp, 200, result.toString());
                } else {
                    int affected = ps.getUpdateCount();
                    if (affected < 0) affected = 0;

                    JsonObject result = new JsonObject();
                    result.add("rows", new JsonArray());
                    result.addProperty("rowsAffected", affected);

                    send(resp, 200, result.toString());
                }

                long elapsed = System.currentTimeMillis() - start;
                if (elapsed > 3000) {
                    log("Query lenta (" + elapsed + " ms): " + parsed.jdbcSql);
                }
            } finally {
                if (rs != null) try { rs.close(); } catch (SQLException ignore) {}
                if (ps != null) try { ps.close(); } catch (SQLException ignore) {}
            }

        } catch (SQLException e) {
            String ref = UUID.randomUUID().toString().substring(0, 8);
            log("Erro SQL [" + ref + "] ao executar: " + parsed.jdbcSql + " - " + e.getMessage());
            send(resp, 400, "{\"error\":" + Json.quote(e.getMessage()) + ",\"ref\":\"" + ref + "\"}");
        } catch (Exception e) {
            broken = true;
            String ref = UUID.randomUUID().toString().substring(0, 8);
            log("Erro interno [" + ref + "] na execução do SQL", e);
            send(resp, 500, "{\"error\":" + Json.quote(e.getMessage()) + ",\"ref\":\"" + ref + "\"}");
        } finally {
            if (p != null) {
                pool.release(p, broken);
            }
        }
    }

    private static String readBody(HttpServletRequest req) throws IOException {
        InputStream in = req.getInputStream();
        if (in == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int r;
        while ((r = in.read(buf)) != -1) {
            out.write(buf, 0, r);
        }
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private static void setCorsHeaders(HttpServletResponse resp) {
        resp.setHeader("Access-Control-Allow-Origin", "*");
        resp.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        resp.setHeader("Access-Control-Allow-Headers",
                "Content-Type, Authorization, X-Lubrificacao-Timestamp, X-Lubrificacao-Signature, "
                + "X-Api-Timestamp, X-Api-Signature, X-Boletim-Timestamp, X-Boletim-Signature");
        resp.setHeader("Cache-Control", "no-store");
        resp.setHeader("X-Content-Type-Options", "nosniff");
    }

    private static void send(HttpServletResponse resp, int status, String json) throws IOException {
        resp.setStatus(status);
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        resp.setContentLength(bytes.length);
        OutputStream out = resp.getOutputStream();
        out.write(bytes);
        out.flush();
    }
}
