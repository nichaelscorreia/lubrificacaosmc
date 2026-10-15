package br.com.nstech.lubrificacao.api;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.sql.Clob;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Types;

/**
 * Utilitários de serialização JSON e conversão de ResultSet.
 */
public final class Json {

    private Json() {}

    public static String quote(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (ch < ' ' || ch == '\u2028' || ch == '\u2029') {
                        sb.append(String.format("\\u%04x", (int) ch));
                    } else {
                        sb.append(ch);
                    }
            }
        }
        return sb.append('"').toString();
    }

    public static JsonElement parse(String json) {
        if (json == null || json.trim().isEmpty()) {
            return JsonNull.INSTANCE;
        }
        return JsonParser.parseString(json);
    }

    public static JsonArray serializeResultSet(ResultSet rs, int maxRows) throws SQLException {
        JsonArray array = new JsonArray();
        ResultSetMetaData meta = rs.getMetaData();
        int colCount = meta.getColumnCount();
        String[] colNames = new String[colCount];

        for (int i = 0; i < colCount; i++) {
            String label = meta.getColumnLabel(i + 1);
            if (label == null || label.trim().isEmpty()) {
                label = meta.getColumnName(i + 1);
            }
            colNames[i] = label.toUpperCase();
        }

        int count = 0;
        while (rs.next() && (maxRows <= 0 || count < maxRows)) {
            JsonObject row = new JsonObject();
            for (int i = 0; i < colCount; i++) {
                Object val = rs.getObject(i + 1);
                if (val == null) {
                    row.add(colNames[i], JsonNull.INSTANCE);
                } else if (val instanceof Number) {
                    row.addProperty(colNames[i], (Number) val);
                } else if (val instanceof Boolean) {
                    row.addProperty(colNames[i], (Boolean) val);
                } else if (val instanceof Clob) {
                    Clob clob = (Clob) val;
                    long len = clob.length();
                    int take = (int) Math.min(len, 2000000L);
                    row.addProperty(colNames[i], clob.getSubString(1, take));
                } else {
                    row.addProperty(colNames[i], rs.getString(i + 1));
                }
            }
            array.add(row);
            count++;
        }
        return array;
    }
}
