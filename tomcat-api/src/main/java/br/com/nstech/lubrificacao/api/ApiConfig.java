package br.com.nstech.lubrificacao.api;

import java.util.ArrayList;
import java.util.List;
import javax.servlet.ServletContext;

/**
 * Configuração da API de Lubrificação no Tomcat.
 * Cada chave é lida, nesta ordem, de:
 *   1. &lt;Parameter name="CHAVE"&gt; no context.xml do Tomcat (conf/Catalina/localhost/lubrificacao-api.xml)
 *   2. Variável de ambiente LUBRIFICACAO_CHAVE ou BOLETIM_CHAVE
 *   3. Valor padrão
 */
public final class ApiConfig {

    public final String dbUrl;
    public final String dbUser;
    public final String dbPassword;
    public final int poolSize;
    public final int queryTimeoutSeconds;
    public final int maxRows;

    public final String secret;
    public final IpAllowList allowedIps;
    public final int rateLimitPerMinute;

    /** Problemas de configuração que impedem a API de atender (lista vazia = OK). */
    public final List<String> problems = new ArrayList<String>();

    private ApiConfig(ServletContext ctx) {
        dbUrl = get(ctx, "DB_URL", "jdbc:oracle:thin:@192.168.2.136:1521/xe");
        dbUser = get(ctx, "DB_USER", "c##nstecholeo");
        dbPassword = get(ctx, "DB_PASSWORD", "nstech");
        poolSize = getInt(ctx, "DB_POOL_SIZE", 10, 1, 50);
        queryTimeoutSeconds = getInt(ctx, "DB_QUERY_TIMEOUT_SECONDS", 120, 5, 900);
        maxRows = getInt(ctx, "MAX_ROWS", 50000, 1, 1000000);

        secret = get(ctx, "API_SECRET", "smc_lubrificacao_secret_key_2026_prefeitura_producao");
        allowedIps = IpAllowList.parse(get(ctx, "ALLOWED_IPS", ""));
        rateLimitPerMinute = getInt(ctx, "RATE_LIMIT_PER_MINUTE", 1200, 1, 100000);

        if (dbUser.isEmpty() || dbPassword.isEmpty()) {
            problems.add("DB_USER ou DB_PASSWORD não configurados");
        }
        if (secret.length() < 16) {
            problems.add("API_SECRET ausente ou muito curto (mínimo 16 caracteres)");
        }
    }

    public static ApiConfig load(ServletContext ctx) {
        return new ApiConfig(ctx);
    }

    private static String get(ServletContext ctx, String key, String def) {
        String v = ctx.getInitParameter(key);
        if (v == null || v.trim().isEmpty()) {
            v = System.getenv("LUBRIFICACAO_" + key);
        }
        if (v == null || v.trim().isEmpty()) {
            v = System.getenv(key);
        }
        return (v == null || v.trim().isEmpty()) ? def : v.trim();
    }

    private static int getInt(ServletContext ctx, String key, int def, int min, int max) {
        String v = get(ctx, key, null);
        if (v == null) return def;
        try {
            int n = Integer.parseInt(v);
            return Math.max(min, Math.min(max, n));
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
