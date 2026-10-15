package br.com.nstech.lubrificacao.api;

import java.util.ArrayList;
import java.util.List;

/**
 * Lista de IPs ou faixas IPv4 permitidas (ex.: "74.220.48.0/24, 192.168.2.10").
 * Vazia = qualquer IP permitido.
 */
public final class IpAllowList {

    private final List<long[]> ranges;

    private IpAllowList(List<long[]> ranges) {
        this.ranges = ranges;
    }

    public static IpAllowList parse(String spec) {
        List<long[]> list = new ArrayList<long[]>();
        if (spec == null || spec.trim().isEmpty()) {
            return new IpAllowList(list);
        }
        for (String part : spec.split("[,;\\s]+")) {
            if (part.isEmpty()) continue;
            String ip = part;
            int bits = 32;
            int slash = part.indexOf('/');
            if (slash > 0) {
                ip = part.substring(0, slash);
                bits = Integer.parseInt(part.substring(slash + 1));
            }
            long addr = toLong(ip);
            if (addr < 0 || bits < 0 || bits > 32) {
                throw new IllegalArgumentException("ALLOWED_IPS inválido: " + part);
            }
            long mask = bits == 0 ? 0 : (0xFFFFFFFFL << (32 - bits)) & 0xFFFFFFFFL;
            list.add(new long[] {addr & mask, mask});
        }
        return new IpAllowList(list);
    }

    public boolean isEmpty() {
        return ranges.isEmpty();
    }

    public boolean allows(String ip) {
        if (ranges.isEmpty() || "127.0.0.1".equals(ip) || "0:0:0:0:0:0:0:1".equals(ip)) return true;
        long addr = toLong(ip);
        if (addr < 0) return false;
        for (long[] r : ranges) {
            if ((addr & r[1]) == r[0]) return true;
        }
        return false;
    }

    private static long toLong(String ip) {
        String[] p = ip.trim().split("\\.");
        if (p.length != 4) return -1;
        long v = 0;
        try {
            for (String s : p) {
                int n = Integer.parseInt(s);
                if (n < 0 || n > 255) return -1;
                v = (v << 8) | n;
            }
        } catch (NumberFormatException e) {
            return -1;
        }
        return v;
    }
}
