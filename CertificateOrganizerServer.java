package server;

import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

public class CertificateOrganizerServer {
    private static final int PORT = 8080;
    
    private static final Path DATA_DIR = Paths.get("data");
    private static final Path USERS_FILE = DATA_DIR.resolve("users.jsonl");
    private static final Path CERTS_FILE = DATA_DIR.resolve("certificates.jsonl");
    private static final Path FILES_DIR = DATA_DIR.resolve("files");
    
    // In-memory sessions: token -> username
    private static final Map<String, String> sessions = new ConcurrentHashMap<>();

    public static void main(String[] args) {
        try {
            initStorage();
            
            HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
            
            // Handle static frontend files
            server.createContext("/", new StaticFileHandler());
            
            // Handle API routes
            server.createContext("/api/register", new RegisterHandler());
            server.createContext("/api/login", new LoginHandler());
            server.createContext("/api/certificates", new CertificatesHandler());
            server.createContext("/api/certificates/update", new CertificatesUpdateHandler());
            server.createContext("/api/certificates/delete", new CertificatesDeleteHandler());
            server.createContext("/api/certificates/download", new CertificatesDownloadHandler());
            server.createContext("/api/backup", new BackupHandler());
            server.createContext("/api/restore", new RestoreHandler());
            
            // Public share route (no auth required)
            server.createContext("/share/", new ShareViewHandler());
            
            server.setExecutor(Executors.newFixedThreadPool(10));
            server.start();
            
            System.out.println("=================================================");
            System.out.println(" Certificate Organizer Server Started Successfully");
            System.out.println(" Address: http://localhost:" + PORT);
            System.out.println(" Storage Directory: " + DATA_DIR.toAbsolutePath());
            System.out.println("=================================================");
        } catch (Exception e) {
            System.err.println("Fatal: Server failed to start: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static void initStorage() throws IOException {
        if (!Files.exists(DATA_DIR)) Files.createDirectories(DATA_DIR);
        if (!Files.exists(FILES_DIR)) Files.createDirectories(FILES_DIR);
        if (!Files.exists(USERS_FILE)) Files.createFile(USERS_FILE);
        if (!Files.exists(CERTS_FILE)) Files.createFile(CERTS_FILE);
    }
    
    private static String readRequestBody(HttpExchange exchange) throws IOException {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            return sb.toString();
        }
    }
    
    private static void sendJsonResponse(HttpExchange exchange, int statusCode, String jsonResponse) throws IOException {
        byte[] responseBytes = jsonResponse.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        setCorsHeaders(exchange);
        exchange.sendResponseHeaders(statusCode, responseBytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(responseBytes);
        }
    }
    
    private static void setCorsHeaders(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    
    private static boolean handleOptionsRequest(HttpExchange exchange) throws IOException {
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            setCorsHeaders(exchange);
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return true;
        }
        return false;
    }
    
    private static String getUsernameFromSession(HttpExchange exchange) {
        // Auth from Header
        String authHeader = exchange.getRequestHeaders().getFirst("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7).trim();
            return sessions.get(token);
        }
        // Auth from Query Parameters (useful for downloads)
        String query = exchange.getRequestURI().getQuery();
        if (query != null) {
            for (String param : query.split("&")) {
                String[] pair = param.split("=");
                if (pair.length == 2 && "token".equals(pair[0])) {
                    return sessions.get(pair[1]);
                }
            }
        }
        return null;
    }
    
    private static String hashPassword(String password) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(password.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception ex) {
            throw new RuntimeException("Error hashing password", ex);
        }
    }
    
    private static synchronized Map<String, String> findUser(String username) throws IOException {
        List<String> lines = Files.readAllLines(USERS_FILE, StandardCharsets.UTF_8);
        for (String line : lines) {
            if (line.trim().isEmpty()) continue;
            Map<String, String> user = JsonUtils.parseObject(line);
            if (username.equalsIgnoreCase(user.get("username"))) {
                return user;
            }
        }
        return null;
    }
    
    private static synchronized boolean registerUser(String username, String password) throws IOException {
        if (findUser(username) != null) {
            return false;
        }
        Map<String, String> user = new HashMap<>();
        user.put("username", username);
        user.put("passwordHash", hashPassword(password));
        String line = JsonUtils.mapToJson(user) + "\n";
        Files.write(USERS_FILE, line.getBytes(StandardCharsets.UTF_8), StandardOpenOption.APPEND);
        return true;
    }

    private static synchronized List<Map<String, String>> getUserCertificates(String username) throws IOException {
        List<Map<String, String>> certs = new ArrayList<>();
        List<String> lines = Files.readAllLines(CERTS_FILE, StandardCharsets.UTF_8);
        for (String line : lines) {
            if (line.trim().isEmpty()) continue;
            Map<String, String> cert = JsonUtils.parseObject(line);
            if (username.equalsIgnoreCase(cert.get("username"))) {
                certs.add(cert);
            }
        }
        return certs;
    }
    
    // Find a certificate by its shareToken (for public share viewing)
    private static synchronized Map<String, String> findCertByShareToken(String shareToken) throws IOException {
        List<String> lines = Files.readAllLines(CERTS_FILE, StandardCharsets.UTF_8);
        for (String line : lines) {
            if (line.trim().isEmpty()) continue;
            Map<String, String> cert = JsonUtils.parseObject(line);
            if (shareToken.equals(cert.get("shareToken"))) {
                return cert;
            }
        }
        return null;
    }

    private static synchronized void saveAllCertificates(List<Map<String, String>> allCerts) throws IOException {
        StringBuilder sb = new StringBuilder();
        for (Map<String, String> cert : allCerts) {
            sb.append(JsonUtils.mapToJson(cert)).append("\n");
        }
        Files.write(CERTS_FILE, sb.toString().getBytes(StandardCharsets.UTF_8), StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
    }

    private static synchronized void addCertificate(Map<String, String> cert) throws IOException {
        String line = JsonUtils.mapToJson(cert) + "\n";
        Files.write(CERTS_FILE, line.getBytes(StandardCharsets.UTF_8), StandardOpenOption.APPEND);
    }

    private static synchronized boolean updateCertificate(String username, String id, Map<String, String> updatedData, byte[] newFileBytes) throws IOException {
        List<String> lines = Files.readAllLines(CERTS_FILE, StandardCharsets.UTF_8);
        List<Map<String, String>> allCerts = new ArrayList<>();
        boolean found = false;
        for (String line : lines) {
            if (line.trim().isEmpty()) continue;
            Map<String, String> cert = JsonUtils.parseObject(line);
            if (id.equals(cert.get("id")) && username.equalsIgnoreCase(cert.get("username"))) {
                cert.put("title", updatedData.get("title"));
                cert.put("description", updatedData.get("description"));
                cert.put("category", updatedData.get("category"));
                if (newFileBytes != null) {
                    cert.put("fileName", updatedData.get("fileName"));
                    cert.put("fileType", updatedData.get("fileType"));
                    cert.put("fileSize", String.valueOf(newFileBytes.length));
                    Files.write(FILES_DIR.resolve(id), newFileBytes);
                }
                found = true;
            }
            allCerts.add(cert);
        }
        if (found) {
            saveAllCertificates(allCerts);
        }
        return found;
    }

    private static synchronized boolean deleteCertificate(String username, String id) throws IOException {
        List<String> lines = Files.readAllLines(CERTS_FILE, StandardCharsets.UTF_8);
        List<Map<String, String>> allCerts = new ArrayList<>();
        boolean found = false;
        for (String line : lines) {
            if (line.trim().isEmpty()) continue;
            Map<String, String> cert = JsonUtils.parseObject(line);
            if (id.equals(cert.get("id")) && username.equalsIgnoreCase(cert.get("username"))) {
                found = true;
                Path filePath = FILES_DIR.resolve(id);
                Files.deleteIfExists(filePath);
                continue;
            }
            allCerts.add(cert);
        }
        if (found) {
            saveAllCertificates(allCerts);
        }
        return found;
    }
    
    // --- Handlers ---

    static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptionsRequest(exchange)) return;
            
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/")) {
                path = "/index.html";
            }
            
            // Serve from web directory
            Path file = Paths.get("web", path.substring(1));
            
            // Safe traversal check
            Path webDir = Paths.get("web").toAbsolutePath();
            Path targetFile = file.toAbsolutePath();
            if (!targetFile.startsWith(webDir)) {
                String response = "Forbidden";
                exchange.sendResponseHeaders(403, response.length());
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(response.getBytes());
                }
                return;
            }
            
            if (!Files.exists(targetFile) || Files.isDirectory(targetFile)) {
                // Return index.html for Client-side SPA routing fallback
                targetFile = webDir.resolve("index.html");
            }
            
            if (!Files.exists(targetFile)) {
                String response = "File Not Found";
                exchange.sendResponseHeaders(404, response.length());
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(response.getBytes());
                }
                return;
            }
            
            String contentType = "text/plain";
            String fileName = targetFile.getFileName().toString().toLowerCase();
            if (fileName.endsWith(".html")) contentType = "text/html; charset=utf-8";
            else if (fileName.endsWith(".css")) contentType = "text/css; charset=utf-8";
            else if (fileName.endsWith(".js")) contentType = "application/javascript; charset=utf-8";
            else if (fileName.endsWith(".png")) contentType = "image/png";
            else if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) contentType = "image/jpeg";
            else if (fileName.endsWith(".svg")) contentType = "image/svg+xml";
            else if (fileName.endsWith(".ico")) contentType = "image/x-icon";
            
            byte[] bytes = Files.readAllBytes(targetFile);
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        }
    }
    
    // ==================== PUBLIC SHARE VIEWER ====================
    // Route: GET /share/<shareToken>
    // No authentication required. Serves a self-contained HTML page embedding the certificate.
    static class ShareViewHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptionsRequest(exchange)) return;
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                String response = "Method Not Allowed";
                exchange.sendResponseHeaders(405, response.length());
                try (OutputStream os = exchange.getResponseBody()) { os.write(response.getBytes()); }
                return;
            }
            
            try {
                // Extract shareToken from path: /share/<shareToken>
                String path = exchange.getRequestURI().getPath();
                String shareToken = path.replaceFirst("^/share/", "").trim();
                
                if (shareToken.isEmpty()) {
                    sendShareError(exchange, 400, "Missing share token.");
                    return;
                }
                
                Map<String, String> cert = findCertByShareToken(shareToken);
                if (cert == null) {
                    sendShareError(exchange, 404, "This share link is invalid or the certificate has been removed.");
                    return;
                }
                
                String id = cert.get("id");
                String title = cert.get("title");
                String description = cert.get("description");
                String fileType = cert.get("fileType");
                String fileName = cert.get("fileName");
                String uploadDate = cert.get("uploadDate");
                String category = cert.get("category");
                String notes = cert.get("notes");
                
                Path filePath = FILES_DIR.resolve(id);
                if (!Files.exists(filePath)) {
                    sendShareError(exchange, 404, "The certificate file could not be found.");
                    return;
                }
                
                byte[] fileBytes = Files.readAllBytes(filePath);
                String base64File = Base64.getEncoder().encodeToString(fileBytes);
                
                // Determine embed type
                boolean isImage = fileType != null && fileType.startsWith("image/");
                boolean isPdf   = fileType != null && fileType.contains("pdf");
                
                String embedHtml;
                if (isImage) {
                    embedHtml = "<img src=\"data:" + fileType + ";base64," + base64File + "\" alt=\"" + escapeHtml(title) + "\" style=\"max-width:100%;max-height:70vh;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,0.18);\">";
                } else if (isPdf) {
                    embedHtml = "<iframe src=\"data:application/pdf;base64," + base64File + "\" style=\"width:100%;height:70vh;border:none;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,0.18);\" title=\"" + escapeHtml(title) + "\"></iframe>";
                } else {
                    embedHtml = "<div style=\"padding:40px;text-align:center;color:#888;\"><p style=\"font-size:18px;\">&#128196; Preview not available for this file type.</p><p>Please download the file to view it.</p></div>";
                }
                
                // Download data URI
                String downloadDataUri = "data:" + (fileType != null ? fileType : "application/octet-stream") + ";base64," + base64File;
                
                String html = "<!DOCTYPE html>\n" +
                    "<html lang=\"en\">\n" +
                    "<head>\n" +
                    "  <meta charset=\"UTF-8\">\n" +
                    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
                    "  <title>" + escapeHtml(title) + " – CredFolio Share</title>\n" +
                    "  <meta name=\"description\" content=\"View shared certificate: " + escapeHtml(title) + " on CredFolio\">\n" +
                    "  <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n" +
                    "  <link href=\"https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap\" rel=\"stylesheet\">\n" +
                    "  <style>\n" +
                    "    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\n" +
                    "    body { font-family: 'Outfit', sans-serif; background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); min-height: 100vh; color: #fff; display: flex; flex-direction: column; align-items: center; padding: 40px 20px; }\n" +
                    "    .share-card { background: rgba(255,255,255,0.06); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.12); border-radius: 24px; max-width: 860px; width: 100%; padding: 36px; box-shadow: 0 30px 80px rgba(0,0,0,0.4); }\n" +
                    "    .share-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }\n" +
                    "    .share-brand-logo { width: 36px; height: 36px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; }\n" +
                    "    .share-brand-name { font-size: 18px; font-weight: 700; color: #a5b4fc; }\n" +
                    "    .share-brand-tagline { font-size: 13px; color: rgba(255,255,255,0.45); margin-left: auto; }\n" +
                    "    .share-title { font-size: 26px; font-weight: 700; color: #fff; margin-bottom: 6px; }\n" +
                    "    .share-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }\n" +
                    "    .share-badge { padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 500; background: rgba(99,102,241,0.18); border: 1px solid rgba(99,102,241,0.35); color: #a5b4fc; }\n" +
                    "    .share-desc { font-size: 15px; color: rgba(255,255,255,0.65); margin-bottom: 24px; line-height: 1.6; }\n" +
                    "    .share-embed { background: rgba(0,0,0,0.25); border-radius: 12px; overflow: hidden; margin-bottom: 28px; display: flex; align-items: center; justify-content: center; padding: 16px; min-height: 200px; }\n" +
                    "    .share-actions { display: flex; gap: 12px; flex-wrap: wrap; }\n" +
                    "    .btn-download { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border: none; border-radius: 10px; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; text-decoration: none; transition: opacity 0.2s; }\n" +
                    "    .btn-download:hover { opacity: 0.88; }\n" +
                    "    .share-footer { margin-top: 40px; text-align: center; font-size: 13px; color: rgba(255,255,255,0.35); }\n" +
                    "    .share-footer a { color: rgba(165,180,252,0.7); text-decoration: none; }\n" +
                    "  </style>\n" +
                    "</head>\n" +
                    "<body>\n" +
                    "  <div class=\"share-card\">\n" +
                    "    <div class=\"share-brand\">\n" +
                    "      <div class=\"share-brand-logo\">🛡</div>\n" +
                    "      <span class=\"share-brand-name\">CredFolio</span>\n" +
                    "      <span class=\"share-brand-tagline\">Shared Certificate</span>\n" +
                    "    </div>\n" +
                    "    <h1 class=\"share-title\">" + escapeHtml(title) + "</h1>\n" +
                    "    <div class=\"share-meta\">\n" +
                    "      <span class=\"share-badge\">📁 " + escapeHtml(category != null ? category : "Certificate") + "</span>\n" +
                    "      <span class=\"share-badge\">📅 " + escapeHtml(uploadDate != null ? uploadDate : "") + "</span>\n" +
                    (fileName != null ? "      <span class=\"share-badge\">📎 " + escapeHtml(fileName) + "</span>\n" : "") +
                    "    </div>\n" +
                    (description != null && !description.isEmpty() ? "    <p class=\"share-desc\">" + escapeHtml(description) + "</p>\n" : "") +
                    (notes != null && !notes.isEmpty() ? "    <div style=\"margin-bottom: 24px; padding: 16px; background: rgba(255,255,255,0.05); border-left: 4px solid #8b5cf6; border-radius: 8px;\"><h3 style=\"font-size: 16px; color: #a5b4fc; margin-bottom: 8px;\">Notes</h3><p class=\"share-desc\" style=\"margin-bottom:0;\">" + escapeHtml(notes).replace("\n", "<br>") + "</p></div>\n" : "") +
                    "    <div class=\"share-embed\">" + embedHtml + "</div>\n" +
                    "    <div class=\"share-actions\">\n" +
                    "      <a href=\"" + downloadDataUri + "\" download=\"" + escapeHtml(fileName != null ? fileName : "certificate") + "\" class=\"btn-download\">⬇ Download Certificate</a>\n" +
                    "    </div>\n" +
                    "  </div>\n" +
                    "  <div class=\"share-footer\"><p>Shared via <a href=\"/\">CredFolio</a> – Your Professional Certificate Portfolio</p></div>\n" +
                    "</body>\n" +
                    "</html>";
                
                byte[] htmlBytes = html.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
                exchange.sendResponseHeaders(200, htmlBytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(htmlBytes);
                }
            } catch (Exception e) {
                sendShareError(exchange, 500, "An internal error occurred.");
                e.printStackTrace();
            }
        }
        
        private void sendShareError(HttpExchange exchange, int code, String message) throws IOException {
            String html = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><title>CredFolio – Share Error</title>" +
                "<link href=\"https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap\" rel=\"stylesheet\">" +
                "<style>body{font-family:'Outfit',sans-serif;background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);min-height:100vh;display:flex;align-items:center;justify-content:center;color:#fff;}" +
                ".box{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:48px;text-align:center;max-width:440px;}" +
                "h1{font-size:22px;margin-bottom:12px;color:#f87171;}p{color:rgba(255,255,255,0.6);line-height:1.6;}" +
                "a{color:#a5b4fc;}</style></head>" +
                "<body><div class=\"box\"><h1>&#128683; " + code + " – Unable to Load</h1><p>" + escapeHtml(message) + "</p><br><p><a href=\"/\">Go to CredFolio</a></p></div></body></html>";
            byte[] bytes = html.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
            exchange.sendResponseHeaders(code, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) { os.write(bytes); }
        }
        
        private String escapeHtml(String s) {
            if (s == null) return "";
            return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
        }
    }
    
    static class RegisterHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptionsRequest(exchange)) return;
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 405, "{\"error\":\"Method Not Allowed\"}");
                return;
            }
            
            try {
                String body = readRequestBody(exchange);
                Map<String, String> req = JsonUtils.parseObject(body);
                String username = req.get("username");
                String password = req.get("password");
                
                if (username == null || username.trim().isEmpty() || password == null || password.trim().isEmpty()) {
                    sendJsonResponse(exchange, 400, "{\"error\":\"Username and password are required\"}");
                    return;
                }
                
                boolean registered = registerUser(username.trim(), password);
                if (registered) {
                    sendJsonResponse(exchange, 200, "{\"success\":true}");
                } else {
                    sendJsonResponse(exchange, 400, "{\"error\":\"Username already exists\"}");
                }
            } catch (Exception e) {
                sendJsonResponse(exchange, 500, "{\"error\":\"" + JsonUtils.escape(e.getMessage()) + "\"}");
            }
        }
    }
    
    static class LoginHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptionsRequest(exchange)) return;
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 405, "{\"error\":\"Method Not Allowed\"}");
                return;
            }
            
            try {
                String body = readRequestBody(exchange);
                Map<String, String> req = JsonUtils.parseObject(body);
                String username = req.get("username");
                String password = req.get("password");
                
                if (username == null || password == null) {
                    sendJsonResponse(exchange, 400, "{\"error\":\"Username and password are required\"}");
                    return;
                }
                
                Map<String, String> user = findUser(username.trim());
                if (user != null && user.get("passwordHash").equals(hashPassword(password))) {
                    String token = UUID.randomUUID().toString();
                    sessions.put(token, user.get("username"));
                    
                    Map<String, String> resp = new HashMap<>();
                    resp.put("token", token);
                    resp.put("username", user.get("username"));
                    sendJsonResponse(exchange, 200, JsonUtils.mapToJson(resp));
                } else {
                    sendJsonResponse(exchange, 401, "{\"error\":\"Invalid username or password\"}");
                }
            } catch (Exception e) {
                sendJsonResponse(exchange, 500, "{\"error\":\"" + JsonUtils.escape(e.getMessage()) + "\"}");
            }
        }
    }
    
    static class CertificatesHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptionsRequest(exchange)) return;
            
            String username = getUsernameFromSession(exchange);
            if (username == null) {
                sendJsonResponse(exchange, 401, "{\"error\":\"Unauthorized\"}");
                return;
            }
            
            String method = exchange.getRequestMethod();
            if ("GET".equalsIgnoreCase(method)) {
                try {
                    List<Map<String, String>> certs = getUserCertificates(username);
                    sendJsonResponse(exchange, 200, JsonUtils.listToJson(certs));
                } catch (Exception e) {
                    sendJsonResponse(exchange, 500, "{\"error\":\"" + JsonUtils.escape(e.getMessage()) + "\"}");
                }
            } else if ("POST".equalsIgnoreCase(method)) {
                try {
                    String body = readRequestBody(exchange);
                    Map<String, String> req = JsonUtils.parseObject(body);
                    String title = req.get("title");
                    String description = req.get("description");
                    String category = req.get("category");
                    String notes = req.get("notes");
                    String fileName = req.get("fileName");
                    String fileType = req.get("fileType");
                    String fileData = req.get("fileData"); // Base64
                    String isVault = req.get("isVault");   // "true" or null
                    
                    if (title == null || fileName == null || fileData == null) {
                        sendJsonResponse(exchange, 400, "{\"error\":\"Title, fileName and fileData are required\"}");
                        return;
                    }
                    
                    String id = UUID.randomUUID().toString();
                    // Generate a unique, separate share token (different from the ID for extra security)
                    String shareToken = UUID.randomUUID().toString();
                    byte[] fileBytes = Base64.getDecoder().decode(fileData);
                    
                    // Save physical file
                    Files.write(FILES_DIR.resolve(id), fileBytes);
                    
                    // Save metadata
                    Map<String, String> cert = new HashMap<>();
                    cert.put("id", id);
                    cert.put("username", username);
                    cert.put("title", title);
                    cert.put("description", description == null ? "" : description);
                    cert.put("category", category == null ? "Other" : category);
                    cert.put("notes", notes == null ? "" : notes);
                    cert.put("fileName", fileName);
                    cert.put("fileType", fileType == null ? "application/octet-stream" : fileType);
                    cert.put("fileSize", String.valueOf(fileBytes.length));
                    cert.put("uploadDate", LocalDate.now().toString());
                    cert.put("shareToken", shareToken); // Auto-generated public share token
                    cert.put("isVault", (isVault != null && isVault.equals("true")) ? "true" : "false");
                    
                    addCertificate(cert);
                    
                    Map<String, String> resp = new HashMap<>();
                    resp.put("success", "true");
                    resp.put("id", id);
                    resp.put("shareToken", shareToken);
                    sendJsonResponse(exchange, 200, JsonUtils.mapToJson(resp));
                } catch (Exception e) {
                    sendJsonResponse(exchange, 500, "{\"error\":\"" + JsonUtils.escape(e.getMessage()) + "\"}");
                }
            } else {
                sendJsonResponse(exchange, 405, "{\"error\":\"Method Not Allowed\"}");
            }
        }
    }
    
    static class CertificatesUpdateHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptionsRequest(exchange)) return;
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 405, "{\"error\":\"Method Not Allowed\"}");
                return;
            }
            
            String username = getUsernameFromSession(exchange);
            if (username == null) {
                sendJsonResponse(exchange, 401, "{\"error\":\"Unauthorized\"}");
                return;
            }
            
            try {
                String body = readRequestBody(exchange);
                Map<String, String> req = JsonUtils.parseObject(body);
                String id = req.get("id");
                String title = req.get("title");
                String description = req.get("description");
                String category = req.get("category");
                String notes = req.get("notes");
                
                if (id == null || title == null) {
                    sendJsonResponse(exchange, 400, "{\"error\":\"Certificate ID and Title are required\"}");
                    return;
                }
                
                byte[] newFileBytes = null;
                String fileName = req.get("fileName");
                String fileType = req.get("fileType");
                String fileData = req.get("fileData");
                
                if (fileData != null && !fileData.trim().isEmpty()) {
                    newFileBytes = Base64.getDecoder().decode(fileData);
                }
                
                Map<String, String> updatedData = new HashMap<>();
                updatedData.put("title", title);
                updatedData.put("description", description == null ? "" : description);
                updatedData.put("category", category == null ? "Other" : category);
                updatedData.put("notes", notes == null ? "" : notes);
                if (newFileBytes != null) {
                    updatedData.put("fileName", fileName);
                    updatedData.put("fileType", fileType);
                }
                
                boolean updated = updateCertificate(username, id, updatedData, newFileBytes);
                if (updated) {
                    sendJsonResponse(exchange, 200, "{\"success\":true}");
                } else {
                    sendJsonResponse(exchange, 404, "{\"error\":\"Certificate not found\"}");
                }
            } catch (Exception e) {
                sendJsonResponse(exchange, 500, "{\"error\":\"" + JsonUtils.escape(e.getMessage()) + "\"}");
            }
        }
    }
    
    static class CertificatesDeleteHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptionsRequest(exchange)) return;
            if (!"DELETE".equalsIgnoreCase(exchange.getRequestMethod()) && !"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 405, "{\"error\":\"Method Not Allowed\"}");
                return;
            }
            
            String username = getUsernameFromSession(exchange);
            if (username == null) {
                sendJsonResponse(exchange, 401, "{\"error\":\"Unauthorized\"}");
                return;
            }
            
            try {
                // Read from Query Parameter first, else from Body
                String id = null;
                String query = exchange.getRequestURI().getQuery();
                if (query != null) {
                    for (String param : query.split("&")) {
                        String[] pair = param.split("=");
                        if (pair.length == 2 && "id".equals(pair[0])) {
                            id = pair[1];
                        }
                    }
                }
                
                if (id == null) {
                    String body = readRequestBody(exchange);
                    Map<String, String> req = JsonUtils.parseObject(body);
                    id = req.get("id");
                }
                
                if (id == null) {
                    sendJsonResponse(exchange, 400, "{\"error\":\"Certificate ID is required\"}");
                    return;
                }
                
                boolean deleted = deleteCertificate(username, id);
                if (deleted) {
                    sendJsonResponse(exchange, 200, "{\"success\":true}");
                } else {
                    sendJsonResponse(exchange, 404, "{\"error\":\"Certificate not found\"}");
                }
            } catch (Exception e) {
                sendJsonResponse(exchange, 500, "{\"error\":\"" + JsonUtils.escape(e.getMessage()) + "\"}");
            }
        }
    }
    
    static class CertificatesDownloadHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptionsRequest(exchange)) return;
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 405, "{\"error\":\"Method Not Allowed\"}");
                return;
            }
            
            String username = getUsernameFromSession(exchange);
            if (username == null) {
                sendJsonResponse(exchange, 401, "{\"error\":\"Unauthorized\"}");
                return;
            }
            
            try {
                String id = null;
                String query = exchange.getRequestURI().getQuery();
                if (query != null) {
                    for (String param : query.split("&")) {
                        String[] pair = param.split("=");
                        if (pair.length == 2 && "id".equals(pair[0])) {
                            id = pair[1];
                        }
                    }
                }
                
                if (id == null) {
                    sendJsonResponse(exchange, 400, "{\"error\":\"Certificate ID is required\"}");
                    return;
                }
                
                // Retrieve certificate metadata to find original filename
                List<Map<String, String>> certs = getUserCertificates(username);
                Map<String, String> targetCert = null;
                for (Map<String, String> cert : certs) {
                    if (id.equals(cert.get("id"))) {
                        targetCert = cert;
                        break;
                    }
                }
                
                if (targetCert == null) {
                    sendJsonResponse(exchange, 404, "{\"error\":\"Certificate not found\"}");
                    return;
                }
                
                Path filePath = FILES_DIR.resolve(id);
                if (!Files.exists(filePath)) {
                    sendJsonResponse(exchange, 404, "{\"error\":\"Physical file not found on server\"}");
                    return;
                }
                
                byte[] fileBytes = Files.readAllBytes(filePath);
                String fileName = targetCert.get("fileName");
                String fileType = targetCert.get("fileType");
                
                exchange.getResponseHeaders().set("Content-Type", fileType);
                exchange.getResponseHeaders().set("Content-Disposition", "attachment; filename=\"" + fileName + "\"");
                setCorsHeaders(exchange);
                
                exchange.sendResponseHeaders(200, fileBytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(fileBytes);
                }
            } catch (Exception e) {
                sendJsonResponse(exchange, 500, "{\"error\":\"" + JsonUtils.escape(e.getMessage()) + "\"}");
            }
        }
    }
    
    static class BackupHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptionsRequest(exchange)) return;
            if (!"GET".equalsIgnoreCase(exchange.getRequestMethod()) && !"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 405, "{\"error\":\"Method Not Allowed\"}");
                return;
            }
            
            String username = getUsernameFromSession(exchange);
            if (username == null) {
                sendJsonResponse(exchange, 401, "{\"error\":\"Unauthorized\"}");
                return;
            }
            
            try {
                List<Map<String, String>> certs = getUserCertificates(username);
                List<Map<String, String>> backupList = new ArrayList<>();
                
                for (Map<String, String> cert : certs) {
                    Map<String, String> backupItem = new HashMap<>(cert);
                    Path filePath = FILES_DIR.resolve(cert.get("id"));
                    if (Files.exists(filePath)) {
                        byte[] fileBytes = Files.readAllBytes(filePath);
                        String base64Data = Base64.getEncoder().encodeToString(fileBytes);
                        backupItem.put("fileData", base64Data);
                    } else {
                        backupItem.put("fileData", "");
                    }
                    backupList.add(backupItem);
                }
                
                sendJsonResponse(exchange, 200, JsonUtils.listToJson(backupList));
            } catch (Exception e) {
                sendJsonResponse(exchange, 500, "{\"error\":\"" + JsonUtils.escape(e.getMessage()) + "\"}");
            }
        }
    }
    
    static class RestoreHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if (handleOptionsRequest(exchange)) return;
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 405, "{\"error\":\"Method Not Allowed\"}");
                return;
            }
            
            String username = getUsernameFromSession(exchange);
            if (username == null) {
                sendJsonResponse(exchange, 401, "{\"error\":\"Unauthorized\"}");
                return;
            }
            
            try {
                String body = readRequestBody(exchange);
                List<Map<String, String>> restoreList = JsonUtils.parseList(body);
                
                if (restoreList.isEmpty()) {
                    sendJsonResponse(exchange, 400, "{\"error\":\"Backup file contains no certificates\"}");
                    return;
                }
                
                // Read existing certificates to avoid duplicate ID conflicts or replace existing
                List<String> lines = Files.readAllLines(CERTS_FILE, StandardCharsets.UTF_8);
                Map<String, Map<String, String>> allCertsMap = new LinkedHashMap<>();
                for (String line : lines) {
                    if (line.trim().isEmpty()) continue;
                    Map<String, String> cert = JsonUtils.parseObject(line);
                    allCertsMap.put(cert.get("id"), cert);
                }
                
                int restoredCount = 0;
                for (Map<String, String> restoredCert : restoreList) {
                    String id = restoredCert.get("id");
                    String fileData = restoredCert.get("fileData");
                    
                    if (id == null || id.trim().isEmpty()) {
                        continue;
                    }
                    
                    // Set username to active user to prevent session spoofing
                    restoredCert.put("username", username);
                    
                    // Ensure a shareToken exists for restored certs that don't have one
                    if (restoredCert.get("shareToken") == null || restoredCert.get("shareToken").trim().isEmpty()) {
                        restoredCert.put("shareToken", UUID.randomUUID().toString());
                    }
                    // Ensure isVault field
                    if (restoredCert.get("isVault") == null) {
                        restoredCert.put("isVault", "false");
                    }
                    
                    // Save physical file
                    if (fileData != null && !fileData.trim().isEmpty()) {
                        byte[] fileBytes = Base64.getDecoder().decode(fileData);
                        Files.write(FILES_DIR.resolve(id), fileBytes);
                        restoredCert.put("fileSize", String.valueOf(fileBytes.length));
                    }
                    
                    // Remove fileData from database store
                    restoredCert.remove("fileData");
                    
                    allCertsMap.put(id, restoredCert);
                    restoredCount++;
                }
                
                // Rewrite database
                saveAllCertificates(new ArrayList<>(allCertsMap.values()));
                
                sendJsonResponse(exchange, 200, "{\"success\":true,\"restoredCount\":" + restoredCount + "}");
            } catch (Exception e) {
                sendJsonResponse(exchange, 500, "{\"error\":\"" + JsonUtils.escape(e.getMessage()) + "\"}");
            }
        }
    }
}
