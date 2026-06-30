package server;

import java.util.*;

public class JsonUtils {
    public static Map<String, String> parseObject(String json) {
        Map<String, String> map = new HashMap<>();
        if (json == null) return map;
        json = json.trim();
        if (json.startsWith("{") && json.endsWith("}")) {
            json = json.substring(1, json.length() - 1);
        }
        
        int i = 0;
        int len = json.length();
        while (i < len) {
            // Find key starting quote
            while (i < len && json.charAt(i) != '"') i++;
            if (i >= len) break;
            i++; // skip quote
            int startKey = i;
            while (i < len && json.charAt(i) != '"') {
                if (json.charAt(i) == '\\' && i + 1 < len) i++; // skip escaped quote character
                i++;
            }
            if (i >= len) break;
            String key = json.substring(startKey, i);
            i++; // skip ending quote of key
            
            // Find colon separator
            while (i < len && json.charAt(i) != ':') i++;
            if (i >= len) break;
            i++; // skip colon
            
            // Find value start (skip whitespaces)
            while (i < len && Character.isWhitespace(json.charAt(i))) i++;
            if (i >= len) break;
            
            String value = "";
            if (json.charAt(i) == '"') {
                // String value type
                i++; // skip quote
                int startVal = i;
                while (i < len && json.charAt(i) != '"') {
                    if (json.charAt(i) == '\\' && i + 1 < len) i++; // skip escaped character
                    i++;
                }
                value = json.substring(startVal, i);
                i++; // skip ending quote
            } else {
                // Numeric, boolean or null value type
                int startVal = i;
                while (i < len && json.charAt(i) != ',' && json.charAt(i) != '}') {
                    i++;
                }
                value = json.substring(startVal, i).trim();
            }
            
            map.put(key, deescape(value));
            
            // Skip forward to the next comma
            while (i < len && json.charAt(i) != ',' && json.charAt(i) != '}') i++;
            if (i < len && json.charAt(i) == ',') {
                i++; // skip comma
            }
        }
        
        return map;
    }
    
    private static String deescape(String val) {
        if (val.equals("null")) return null;
        // Unescape standard sequences
        StringBuilder sb = new StringBuilder();
        int len = val.length();
        for (int i = 0; i < len; i++) {
            char c = val.charAt(i);
            if (c == '\\' && i + 1 < len) {
                char next = val.charAt(i + 1);
                switch (next) {
                    case '"': sb.append('"'); i++; break;
                    case '\\': sb.append('\\'); i++; break;
                    case 'n': sb.append('\n'); i++; break;
                    case 'r': sb.append('\r'); i++; break;
                    case 't': sb.append('\t'); i++; break;
                    case 'b': sb.append('\b'); i++; break;
                    case 'f': sb.append('\f'); i++; break;
                    default: sb.append(c); break;
                }
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    public static String escape(String val) {
        if (val == null) return "null";
        StringBuilder sb = new StringBuilder();
        int len = val.length();
        for (int i = 0; i < len; i++) {
            char c = val.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                default:
                    if (c < 0x20 || c > 0x7E) {
                        // Unicode escaping for special non-ascii or control characters
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                    break;
            }
        }
        return sb.toString();
    }
    
    public static String mapToJson(Map<String, String> map) {
        StringBuilder sb = new StringBuilder();
        sb.append("{");
        boolean first = true;
        for (Map.Entry<String, String> entry : map.entrySet()) {
            if (!first) sb.append(",");
            first = false;
            sb.append("\"").append(escape(entry.getKey())).append("\":");
            if (entry.getValue() == null) {
                sb.append("null");
            } else {
                sb.append("\"").append(escape(entry.getValue())).append("\"");
            }
        }
        sb.append("}");
        return sb.toString();
    }
    
    public static String listToJson(List<Map<String, String>> list) {
        StringBuilder sb = new StringBuilder();
        sb.append("[");
        boolean first = true;
        for (int i = 0; i < list.size(); i++) {
            if (!first) sb.append(",");
            first = false;
            sb.append(mapToJson(list.get(i)));
        }
        sb.append("]");
        return sb.toString();
    }

    public static List<Map<String, String>> parseList(String json) {
        List<Map<String, String>> list = new ArrayList<>();
        if (json == null) return list;
        json = json.trim();
        if (json.startsWith("[") && json.endsWith("]")) {
            json = json.substring(1, json.length() - 1);
        }
        
        int i = 0;
        int len = json.length();
        while (i < len) {
            // Find next '{'
            while (i < len && json.charAt(i) != '{') i++;
            if (i >= len) break;
            
            int start = i;
            int braces = 1;
            i++;
            while (i < len && braces > 0) {
                char c = json.charAt(i);
                if (c == '"') {
                    // Skip string to avoid matching brace inside string
                    i++;
                    while (i < len && json.charAt(i) != '"') {
                        if (json.charAt(i) == '\\' && i + 1 < len) i++;
                        i++;
                    }
                } else if (c == '{') {
                    braces++;
                } else if (c == '}') {
                    braces--;
                }
                i++;
            }
            
            String objStr = json.substring(start, i);
            list.add(parseObject(objStr));
        }
        return list;
    }
}
