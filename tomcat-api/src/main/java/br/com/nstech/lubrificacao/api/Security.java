package br.com.nstech.lubrificacao.api;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.servlet.http.HttpServletRequest;

/**
 * Autenticação via assinatura HMAC-SHA256 ou Bearer token, mais limites de taxa por IP.
 */
public final class Security {

    private static final long MAX_CLOCK_SKEW_MS = 5 * 60000; // 5 minutos
    private static final int MAX_AUTH_FAILURES = 20;
    private static final long AUTH_FAILURE_WINDOW_MS = 10 * 60000;
    private static final int MAX_TRACKED_IPS = 10000;

    private final String secretString;
    private final byte[] secretBytes;
    private final int requestsPerMinute;
    private final Map<String, long[]> requestWindows = new ConcurrentHashMap<String, long[]>();
    private final Map<String, long[]> authFailures = new ConcurrentHashMap<String, long[]>();

    public Security(String secret, int requestsPerMinute) {
        this.secretString = secret;
        this.secretBytes = secret.getBytes(StandardCharsets.UTF_8);
        this.requestsPerMinute = requestsPerMinute;
    }

    public boolean verifyRequest(HttpServletRequest req, String body) {
        // 1. Verificação por Bearer token no cabeçalho Authorization
        String authHeader = req.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7).trim();
            if (MessageDigest.isEqual(secretBytes, token.getBytes(StandardCharsets.UTF_8))) {
                return true;
            }
        }

        // 2. Verificação por cabeçalhos HMAC
        String ts = getHeader(req, "X-Lubrificacao-Timestamp", "X-Api-Timestamp", "X-Boletim-Timestamp");
        String sig = getHeader(req, "X-Lubrificacao-Signature", "X-Api-Signature", "X-Boletim-Signature");

        if (ts != null && sig != null && ts.length() <= 20 && sig.length() == 64) {
            long t;
            try {
                t = Long.parseLong(ts);
            } catch (NumberFormatException e) {
                return false;
            }
            if (Math.abs(System.currentTimeMillis() - t) <= MAX_CLOCK_SKEW_MS) {
                String qs = req.getQueryString();
                String target = req.getRequestURI() + (qs == null ? "" : "?" + qs);

                // Assinatura com ou sem corpo (para retrocompatibilidade com chamadas GET e POST)
                String expectedWithBody = hmacHex(ts + "\n" + req.getMethod() + "\n" + target + (body != null && !body.isEmpty() ? "\n" + body : ""));
                if (MessageDigest.isEqual(expectedWithBody.getBytes(StandardCharsets.US_ASCII), sig.toLowerCase().getBytes(StandardCharsets.US_ASCII))) {
                    return true;
                }

                String expectedNoBody = hmacHex(ts + "\n" + req.getMethod() + "\n" + target);
                if (MessageDigest.isEqual(expectedNoBody.getBytes(StandardCharsets.US_ASCII), sig.toLowerCase().getBytes(StandardCharsets.US_ASCII))) {
                    return true;
                }
            }
        }

        return false;
    }

    private static String getHeader(HttpServletRequest req, String... names) {
        for (String name : names) {
            String val = req.getHeader(name);
            if (val != null && !val.trim().isEmpty()) {
                return val.trim();
            }
        }
        return null;
    }

    public boolean isLockedOut(String ip) {
        long[] f = authFailures.get(ip);
        if (f == null) return false;
        synchronized (f) {
            if (System.currentTimeMillis() - f[0] > AUTH_FAILURE_WINDOW_MS) {
                authFailures.remove(ip);
                return false;
            }
            return f[1] >= MAX_AUTH_FAILURES;
        }
    }

    public void recordAuthFailure(String ip) {
        hit(authFailures, ip, AUTH_FAILURE_WINDOW_MS);
    }

    public boolean allowRequest(String ip) {
        return hit(requestWindows, ip, 60000) <= requestsPerMinute;
    }

    private static long hit(Map<String, long[]> map, String ip, long windowMs) {
        if (map.size() > MAX_TRACKED_IPS) map.clear();
        long now = System.currentTimeMillis();
        long[] w = map.get(ip);
        if (w == null) {
            long[] fresh = new long[] {now, 0};
            w = map.putIfAbsent(ip, fresh);
            if (w == null) w = fresh;
        }
        synchronized (w) {
            if (now - w[0] > windowMs) {
                w[0] = now;
                w[1] = 0;
            }
            return ++w[1];
        }
    }

    public String hmacHex(String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secretBytes, "HmacSHA256"));
            byte[] out = mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(out.length * 2);
            for (byte b : out) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Falha ao calcular HMAC", e);
        }
    }
}
