package br.com.nstech.lubrificacao.api;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Converte SQL com parâmetros nomeados (:nome ou :1, :2) em SQL JDBC (?)
 * e armazena os identificadores para vincular com PreparedStatement.
 * Ignora ':' dentro de strings ('...'), aspas duplas ("...") e comentários (-- ou /* *\/).
 */
public final class NamedSql {

    public final String jdbcSql;
    public final List<String> paramNames;

    private NamedSql(String jdbcSql, List<String> paramNames) {
        this.jdbcSql = jdbcSql;
        this.paramNames = Collections.unmodifiableList(paramNames);
    }

    public static NamedSql parse(String sql) {
        if (sql == null) {
            return new NamedSql("", Collections.<String>emptyList());
        }

        StringBuilder out = new StringBuilder(sql.length());
        List<String> names = new ArrayList<String>();
        int n = sql.length();
        int i = 0;

        while (i < n) {
            char c = sql.charAt(i);

            // Literais de texto e identificadores entre aspas
            if (c == '\'' || c == '"') {
                int end = i + 1;
                while (end < n) {
                    if (sql.charAt(end) == c) {
                        if (end + 1 < n && sql.charAt(end + 1) == c) {
                            end += 2; // aspas escapadas
                            continue;
                        }
                        break;
                    }
                    end++;
                }
                end = Math.min(end + 1, n);
                out.append(sql, i, end);
                i = end;
            }
            // Comentário de linha (-- ...)
            else if (c == '-' && i + 1 < n && sql.charAt(i + 1) == '-') {
                int end = sql.indexOf('\n', i);
                end = end < 0 ? n : end;
                out.append(sql, i, end);
                i = end;
            }
            // Comentário de bloco (/* ... */)
            else if (c == '/' && i + 1 < n && sql.charAt(i + 1) == '*') {
                int end = sql.indexOf("*/", i + 2);
                end = end < 0 ? n : end + 2;
                out.append(sql, i, end);
                i = end;
            }
            // Parâmetro Oracle (:1, :2 ou :nome_param)
            else if (c == ':' && i + 1 < n && (Character.isLetterOrDigit(sql.charAt(i + 1)) || sql.charAt(i + 1) == '_')) {
                int end = i + 1;
                while (end < n && (Character.isLetterOrDigit(sql.charAt(end)) || sql.charAt(end) == '_')) {
                    end++;
                }
                names.add(sql.substring(i + 1, end));
                out.append('?');
                i = end;
            }
            else {
                out.append(c);
                i++;
            }
        }

        return new NamedSql(out.toString(), names);
    }

    /**
     * Aplica os binds recebidos (seja JsonArray ou JsonObject) no PreparedStatement.
     */
    public void bind(PreparedStatement ps, JsonElement binds) throws SQLException {
        if (binds == null || binds.isJsonNull()) {
            return;
        }

        if (binds.isJsonArray()) {
            JsonArray arr = binds.getAsJsonArray();
            if (paramNames.isEmpty()) {
                // Caso o SQL já contivesse ? nativamente
                for (int i = 0; i < arr.size(); i++) {
                    setParam(ps, i + 1, arr.get(i));
                }
                return;
            }

            for (int i = 0; i < paramNames.size(); i++) {
                String name = paramNames.get(i);
                JsonElement val = null;

                // Tenta mapear :1, :2 para o índice 0-based do array
                try {
                    int pos = Integer.parseInt(name);
                    if (pos >= 1 && pos <= arr.size()) {
                        val = arr.get(pos - 1);
                    }
                } catch (NumberFormatException ignored) {}

                // Fallback para a ordem sequencial de aparição
                if (val == null && i < arr.size()) {
                    val = arr.get(i);
                }

                setParam(ps, i + 1, val);
            }
        } else if (binds.isJsonObject()) {
            JsonObject obj = binds.getAsJsonObject();
            for (int i = 0; i < paramNames.size(); i++) {
                String name = paramNames.get(i);
                JsonElement val = obj.get(name);
                if (val == null) {
                    // Fallback case-insensitive
                    for (Map.Entry<String, JsonElement> e : obj.entrySet()) {
                        if (e.getKey().equalsIgnoreCase(name)) {
                            val = e.getValue();
                            break;
                        }
                    }
                }
                setParam(ps, i + 1, val);
            }
        }
    }

    private static void setParam(PreparedStatement ps, int index, JsonElement val) throws SQLException {
        if (val == null || val.isJsonNull()) {
            ps.setNull(index, Types.NULL);
            return;
        }
        if (val.isJsonPrimitive()) {
            JsonPrimitive p = val.getAsJsonPrimitive();
            if (p.isBoolean()) {
                ps.setInt(index, p.getAsBoolean() ? 1 : 0);
            } else if (p.isNumber()) {
                Number num = p.getAsNumber();
                String s = num.toString();
                if (s.contains(".") || s.contains("e") || s.contains("E")) {
                    ps.setDouble(index, p.getAsDouble());
                } else {
                    ps.setLong(index, p.getAsLong());
                }
            } else {
                ps.setString(index, p.getAsString());
            }
        } else {
            ps.setString(index, val.toString());
        }
    }
}
