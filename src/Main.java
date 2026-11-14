import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import exception.InvalidInputException;
import model.*;
import service.*;

import java.io.*;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.Map;

public class Main {
    private static final SpotRepository repo = new SpotRepository();
    private static final AuthService auth = new AuthService();
    private static final ReportService reports = new ReportService(repo);
    private static final Map<String, UserAccount> activeUsers = new HashMap<>();

    public static void main(String[] args) throws Exception {
        // 1. I-load ang default spots at sample account sa Java backend
        repo.loadDefaultSpots();
        try {
            UserAccount demo = auth.register("Charisse", "secret123", UserType.STUDENT);
            activeUsers.put("charisse", demo);
        } catch (InvalidInputException ignored) {
        }

        HttpServer server = HttpServer.create(new InetSocketAddress(8080), 0);

        // 2. Serve HTML, CSS, JS, and Images mula sa 'web' folder
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/"))
                path = "/index.html";

            File file = new File("web" + path);
            if (file.exists() && !file.isDirectory()) {
                String contentType = getMimeType(path);
                exchange.getResponseHeaders().set("Content-Type", contentType);
                byte[] bytes = Files.readAllBytes(file.toPath());
                exchange.sendResponseHeaders(200, bytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(bytes);
                }
            } else {
                sendJson(exchange, 404, "{\"error\":\"File not found\"}");
            }
        });

        // 3. API: LOGIN (gamit ang AuthService.java)
        server.createContext("/api/login", exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod()))
                return;
            Map<String, String> data = parseForm(readBody(exchange));
            try {
                UserAccount u = auth.login(data.get("username"), data.get("password"));
                activeUsers.put(u.getUserName().toLowerCase(), u);
                String json = String.format("{\"ok\":true,\"userName\":\"%s\",\"userType\":\"%s\",\"points\":%d}",
                        esc(u.getUserName()), u.getUserType().name(), u.getPoints());
                sendJson(exchange, 200, json);
            } catch (InvalidInputException e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

        // 4. API: SIGNUP (gamit ang AuthService.java)
        server.createContext("/api/signup", exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod()))
                return;
            Map<String, String> data = parseForm(readBody(exchange));
            try {
                UserType type = UserType.STUDENT;
                if (data.get("userType") != null) {
                    try {
                        type = UserType.valueOf(data.get("userType").toUpperCase());
                    } catch (Exception ignored) {
                    }
                }
                UserAccount u = auth.register(data.get("username"), data.get("password"), type);
                activeUsers.put(u.getUserName().toLowerCase(), u);
                String json = String.format("{\"ok\":true,\"userName\":\"%s\",\"userType\":\"%s\",\"points\":%d}",
                        esc(u.getUserName()), u.getUserType().name(), u.getPoints());
                sendJson(exchange, 200, json);
            } catch (InvalidInputException e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

        // 5. API: GET ALL SPOTS (gamit ang SpotRepository.java)
        server.createContext("/api/spots", exchange -> {
            StringBuilder sb = new StringBuilder("[");
            var list = repo.getAll();
            for (int i = 0; i < list.size(); i++) {
                SpotArea s = list.get(i);
                Facility f = s.getFacility();
                sb.append(String.format(
                        "{\"id\":%d,\"type\":\"%s\",\"name\":\"%s\",\"address\":\"%s\",\"x\":%.1f,\"y\":%.1f," +
                                "\"hours\":[%d,%d],\"price\":%.0f,\"noise\":%d,\"crowd\":%d,\"description\":\"%s\",\"rules\":\"%s\","
                                +
                                "\"fac\":{\"wifi\":%b,\"mbps\":%d,\"outlets\":%b,\"aircon\":%b,\"food\":%b}}",
                        s.getId(), s.getClass().getSimpleName(), esc(s.getName()), esc(s.getAddress()), s.getX(),
                        s.getY(),
                        s.getHours()[0], s.getHours()[1], s.getPrice(),
                        s.getNoise().ordinal() + 1, s.getCrowd().ordinal() + 1,
                        esc(s.getDescription()), esc(s.getRules()),
                        f.isWifi(), f.getMbps(), f.isOutlets(), f.isAircon(), f.isFood()));
                if (i < list.size() - 1)
                    sb.append(",");
            }
            sb.append("]");
            sendJson(exchange, 200, sb.toString());
        });

        // 6. API: SUBMIT REPORT (gamit ang ReportService.java)
        server.createContext("/api/report", exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod()))
                return;
            Map<String, String> data = parseForm(readBody(exchange));
            try {
                String uname = data.getOrDefault("username", "guest").toLowerCase();
                UserAccount u = activeUsers.computeIfAbsent(uname,
                        k -> new UserAccount(data.getOrDefault("username", "Guest"), "default123"));
                int spotId = Integer.parseInt(data.get("spotId"));
                NoiseLevel noise = NoiseLevel.values()[Integer.parseInt(data.get("noise")) - 1];
                CrowdLevel crowd = CrowdLevel.values()[Integer.parseInt(data.get("crowd")) - 1];
                String note = data.getOrDefault("note", "");

                reports.submitReport(u, spotId, noise, crowd, note);
                sendJson(exchange, 200, "{\"ok\":true,\"points\":" + u.getPoints() + "}");
            } catch (Exception e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

        // 7. API: ADD NEW SPOT (gamit ang SpotRepository at Subclasses: Cafe, Library,
        // StudyRoom, CoworkingSpace)
        server.createContext("/api/add-spot", exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod()))
                return;
            Map<String, String> data = parseForm(readBody(exchange));
            try {
                String type = data.get("type");
                String name = data.get("name");
                String addr = data.getOrDefault("address", "Location pinned on the map");
                double x = Double.parseDouble(data.getOrDefault("x", "50"));
                double y = Double.parseDouble(data.getOrDefault("y", "50"));
                int[] hours = new int[] {
                        Integer.parseInt(data.getOrDefault("open", "8")),
                        Integer.parseInt(data.getOrDefault("close", "20"))
                };
                double price = Double.parseDouble(data.getOrDefault("price", "0"));
                NoiseLevel noise = NoiseLevel.values()[Integer.parseInt(data.getOrDefault("noise", "2")) - 1];
                CrowdLevel crowd = CrowdLevel.values()[Integer.parseInt(data.getOrDefault("crowd", "2")) - 1];

                int mbps = Integer.parseInt(data.getOrDefault("mbps", "0"));
                Facility fac = new Facility(
                        mbps > 0,
                        mbps,
                        Boolean.parseBoolean(data.get("outlets")),
                        Boolean.parseBoolean(data.get("aircon")),
                        Boolean.parseBoolean(data.get("food")));

                String desc = data.getOrDefault("description", "");
                String rules = data.getOrDefault("rules", "");
                int id = repo.nextId();

                SpotArea newSpot = switch (type) {
                    case "Library" -> new Library(id, name, addr, x, y, hours, price, noise, crowd, fac, desc, rules);
                    case "StudyRoom" ->
                        new StudyRoom(id, name, addr, x, y, hours, price, noise, crowd, fac, desc, rules);
                    case "CoworkingSpace" ->
                        new CoworkingSpace(id, name, addr, x, y, hours, price, noise, crowd, fac, desc, rules);
                    default -> new Cafe(id, name, addr, x, y, hours, price, noise, crowd, fac, desc, rules);
                };

                repo.addSpot(newSpot);
                sendJson(exchange, 200, "{\"ok\":true,\"id\":" + id + ",\"kind\":\"" + esc(newSpot.getKind()) + "\"}");
            } catch (Exception e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

        server.start();
        System.out.println("=========================================");
        System.out.println("QuietSpot Java Server is running!");
        System.out.println("Open in browser: http://localhost:8080");
        System.out.println("=========================================");
    }

    // --- Helper Methods ---
    private static String readBody(HttpExchange ex) throws IOException {
        return new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    private static Map<String, String> parseForm(String body) {
        Map<String, String> map = new HashMap<>();
        if (body == null || body.isEmpty())
            return map;
        for (String pair : body.split("&")) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2) {
                map.put(URLDecoder.decode(kv[0], StandardCharsets.UTF_8),
                        URLDecoder.decode(kv[1], StandardCharsets.UTF_8));
            }
        }
        return map;
    }

    private static void sendJson(HttpExchange ex, int code, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        ex.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ");
    }

    private static String getMimeType(String path) {
        if (path.endsWith(".html"))
            return "text/html; charset=UTF-8";
        if (path.endsWith(".css"))
            return "text/css; charset=UTF-8";
        if (path.endsWith(".js"))
            return "application/javascript; charset=UTF-8";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg"))
            return "image/jpeg";
        if (path.endsWith(".png"))
            return "image/png";
        if (path.endsWith(".svg"))
            return "image/svg+xml";
        return "application/octet-stream";
    }
}