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
    private static final SocialStore social = Storage.social();   // null when there is no MySQL database
    private static final GameStore game = Storage.game();         // points history, streaks, leaderboard, badges (MySQL)
    private static final Map<String, UserAccount> activeUsers = new HashMap<>();

    public static void main(String[] args) throws Exception {
        repo.loadDefaultSpots();
        repo.loadUserSpots();
        try {
            if (!auth.exists("Charisse")) {
                UserAccount demo = auth.register("Charisse", "secret123", UserType.STUDENT);
                demo.setEmail("charisse@example.com");
                auth.save();
            }
        } catch (InvalidInputException ignored) {
        }

        HttpServer server = HttpServer.create(new InetSocketAddress(8080), 0);

        // 2. Serve HTML, CSS, JS, and Images from 'web' folder
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

        // 3. API: LOGIN (AuthService.java)
        server.createContext("/api/login", exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod()))
                return;
            Map<String, String> data = parseForm(readBody(exchange));
            try {
                UserAccount u = auth.login(data.get("username"), data.get("password"));
                activeUsers.put(u.getUserName().toLowerCase(), u);
                sendJson(exchange, 200, authJson(u));
            } catch (InvalidInputException e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

        // 4. API: SIGNUP (AuthService.java)
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
                UserAccount u = auth.register(data.get("username"), data.get("password"), type, data.get("email"),
                        data.get("fullName"));
                activeUsers.put(u.getUserName().toLowerCase(), u);
                sendJson(exchange, 200, authJson(u));
            } catch (InvalidInputException e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

        // 5. API: GET PROFILE (everything shown on the profile page and the setup pages)
        server.createContext("/api/profile/get", exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"ok\":false,\"error\":\"Use POST\"}");
                return;
            }
            Map<String, String> d = parseForm(readBody(exchange));
            try {
                UserAccount u = auth.getUser(d.get("username"));
                sendJson(exchange, 200, profileJson(u));
            } catch (InvalidInputException e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

        // 6. API: SAVE PROFILE (profile setup after sign up + Edit profile). Only the sent fields are changed.
        server.createContext("/api/profile/save", exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"ok\":false,\"error\":\"Use POST\"}");
                return;
            }
            Map<String, String> d = parseForm(readBody(exchange));
            try {
                UserAccount u = auth.updateProfile(d.get("username"), d);
                sendJson(exchange, 200, profileJson(u));
            } catch (InvalidInputException e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

        // 7. API: ACCOUNT DETAILS (email + member since)
        server.createContext("/api/account/details", exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod()))
                return;
            Map<String, String> d = parseForm(readBody(exchange));
            try {
                UserAccount u = auth.getUser(d.get("username"));
                sendJson(exchange, 200, String.format(
                        "{\"ok\":true,\"userName\":\"%s\",\"userType\":\"%s\",\"email\":\"%s\",\"memberSince\":\"%s\"}",
                        esc(u.getUserName()), u.getUserType().name(), esc(u.getEmail()), esc(u.getCreatedAt())));
            } catch (InvalidInputException e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

        // 8. API: FORGOT PASSWORD (username + email must match, then set a new password)
        server.createContext("/api/forgot-password", exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod()))
                return;
            Map<String, String> d = parseForm(readBody(exchange));
            try {
                auth.resetPassword(d.get("username"), d.get("email"), d.get("newPassword"));
                sendJson(exchange, 200, "{\"ok\":true}");
            } catch (InvalidInputException e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

        // 9. API: UPDATE PROFILE (username + user type)
        server.createContext("/api/account/update", exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod()))
                return;
            Map<String, String> d = parseForm(readBody(exchange));
            try {
                String oldName = d.get("username");
                String oldCanonical = auth.getUser(oldName).getUserName();
                UserAccount u = auth.changeUserName(oldName, d.get("newUsername"));
                try {
                    u.setUserType(UserType.valueOf(d.get("userType").toUpperCase()));
                } catch (Exception ignored) {
                }
                auth.save();
                repo.renameOwner(oldName.trim(), u.getUserName());          // their spots keep belonging to them
                if (social != null) {
                    try {
                        social.renameUser(oldCanonical, u.getUserName());   // and so do their reports, comments, votes, ratings, photos
                    } catch (java.sql.SQLException e) {
                        System.err.println("Could not move the data of " + oldCanonical + " to the new username: " + e.getMessage());
                    }
                }
                if (game != null) {
                    try {
                        game.renameUser(oldCanonical, u.getUserName());     // and their points history and badges
                    } catch (java.sql.SQLException e) {
                        System.err.println("Could not move the points history of " + oldCanonical + ": " + e.getMessage());
                    }
                }
                activeUsers.remove(oldName.trim().toLowerCase());
                activeUsers.put(u.getUserName().toLowerCase(), u);
                sendJson(exchange, 200, String.format("{\"ok\":true,\"userName\":\"%s\",\"userType\":\"%s\"}",
                        esc(u.getUserName()), u.getUserType().name()));
            } catch (InvalidInputException e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

        // 10. API: CHANGE PASSWORD
        server.createContext("/api/account/password", exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod()))
                return;
            Map<String, String> d = parseForm(readBody(exchange));
            try {
                auth.changePassword(d.get("username"), d.get("oldPassword"), d.get("newPassword"));
                sendJson(exchange, 200, "{\"ok\":true}");
            } catch (InvalidInputException e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

        // 11. API: DELETE ACCOUNT
        server.createContext("/api/account/delete", exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod()))
                return;
            Map<String, String> d = parseForm(readBody(exchange));
            try {
                String canonical = auth.getUser(d.get("username")).getUserName();
                auth.deleteAccount(d.get("username"), d.get("password"));
                repo.removeByOwner(d.get("username").trim());           // their spots go with the account
                if (social != null) {
                    try {
                        social.deleteUserData(canonical);               // so do their reports, comments, votes, ratings and photos
                    } catch (java.sql.SQLException e) {
                        System.err.println("Could not remove the data of " + canonical + ": " + e.getMessage());
                    }
                }
                if (game != null) {
                    try {
                        game.deleteUserData(canonical);                 // and their points history and badges
                    } catch (java.sql.SQLException e) {
                        System.err.println("Could not remove the points history of " + canonical + ": " + e.getMessage());
                    }
                }
                activeUsers.remove(d.get("username").trim().toLowerCase());
                sendJson(exchange, 200, "{\"ok\":true}");
            } catch (InvalidInputException e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

        // for map pins, x = longitude and y = latitude (decimal degrees).
        // 12. API: GET ALL SPOTS (gamit ang SpotRepository.java)
        server.createContext("/api/spots", exchange -> {
            StringBuilder sb = new StringBuilder("[");
            var list = repo.getAll();
            for (int i = 0; i < list.size(); i++) {
                SpotArea s = list.get(i);
                Facility f = s.getFacility();
                sb.append(String.format(java.util.Locale.ROOT,
                        "{\"id\":%d,\"type\":\"%s\",\"name\":\"%s\",\"address\":\"%s\",\"x\":%.6f,\"y\":%.6f," +
                        "\"hours\":[%d,%d],\"price\":%.0f,\"noise\":%d,\"crowd\":%d,\"description\":\"%s\",\"rules\":\"%s\",\"owner\":\"%s\"," +
                        "\"fac\":{\"wifi\":%b,\"mbps\":%d,\"outlets\":%b,\"aircon\":%b,\"food\":%b}}",
                        s.getId(), s.getClass().getSimpleName(), esc(s.getName()), esc(s.getAddress()), s.getX(),
                        s.getY(),
                        s.getHours()[0], s.getHours()[1], s.getPrice(),
                        s.getNoise().ordinal() + 1, s.getCrowd().ordinal() + 1,
                        esc(s.getDescription()), esc(s.getRules()), esc(s.getCreatedBy()),
                        f.isWifi(), f.getMbps(), f.isOutlets(), f.isAircon(), f.isFood()));
                if (i < list.size() - 1)
                    sb.append(",");
            }
            sb.append("]");
            sendJson(exchange, 200, sb.toString());
        });

        // 13. API: SUBMIT REPORT (gamit ang ReportService.java)
        server.createContext("/api/report", exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod()))
                return;
            Map<String, String> data = parseForm(readBody(exchange));
            try {
                SocialStore ss = needSocial();
                String uname = data.getOrDefault("username", "guest").toLowerCase();
                UserAccount u = auth.lookup(uname);   // a real account when there is one (its points and report count are saved)
                if (u == null)
                    throw new InvalidInputException("Please log in to report a status.");
                int spotId = Integer.parseInt(data.get("spotId"));
                NoiseLevel noise = NoiseLevel.values()[Integer.parseInt(data.get("noise")) - 1];
                CrowdLevel crowd = CrowdLevel.values()[Integer.parseInt(data.get("crowd")) - 1];
                String note = data.getOrDefault("note", "");

                reports.submitReport(u, spotId, noise, crowd, note);
                long[] saved = ss.addReport(spotId, u.getUserName(), noise.ordinal() + 1, crowd.ordinal() + 1, note);
                if (game != null) game.log(u.getUserName(), GameStore.REPORT, "report");   // submitReport already added the points
                auth.save();
                sendJson(exchange, 200, "{\"ok\":true,\"points\":" + u.getPoints() + ",\"id\":" + saved[0] + ",\"ts\":" + saved[1] + "}");
            } catch (Exception e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

        // 14. API: ADD NEW SPOT (gamit ang SpotRepository at Subclasses: Cafe, Library, tudyRoom, CoworkingSpace)
        server.createContext("/api/add-spot", exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod()))
                return;
            Map<String, String> data = parseForm(readBody(exchange));
            try {
                UserAccount owner = auth.lookup(data.get("username"));
                if (owner == null) throw new InvalidInputException("Please log in to add a spot.");
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

                newSpot.setCreatedBy(owner.getUserName());   // remembered so only the owner (or faculty/staff) can delete it
                repo.addSpot(newSpot);
                repo.saveUserSpots();
                owner.incrementSpotsAdded();
                award(owner, GameStore.SPOT, "spot");
                auth.save();
                sendJson(exchange, 200, "{\"ok\":true,\"id\":" + id + ",\"kind\":\"" + esc(newSpot.getKind()) + "\"}");
            } catch (Exception e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

        // 15. API: DELETE A SPOT. Allowed for the student who added it, or a faculty/staff account. Built-in spots stay.
        server.createContext("/api/delete-spot", exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"ok\":false,\"error\":\"Method not allowed.\"}");
                return;
            }
            Map<String, String> d = parseForm(readBody(exchange));
            try {
                UserAccount u = auth.lookup(d.get("username"));
                if (u == null) throw new InvalidInputException("Please log in to delete a spot.");
                int id;
                try {
                    id = Integer.parseInt(String.valueOf(d.get("spotId")).trim());
                } catch (NumberFormatException e) {
                    throw new InvalidInputException("That is not a valid spot.");
                }
                SpotArea spot = repo.findById(id);
                if (spot == null) throw new InvalidInputException("That spot no longer exists.");
                if (spot.getCreatedBy().isEmpty())
                    throw new InvalidInputException("Built-in spots cannot be deleted.");
                boolean isOwner = spot.getCreatedBy().equalsIgnoreCase(u.getUserName());
                boolean isModerator = u.getUserType() == UserType.FACULTY || u.getUserType() == UserType.STAFF;
                if (!isOwner && !isModerator)
                    throw new InvalidInputException("Only the student who added this spot, or a faculty/staff account, can delete it.");
                repo.removeById(id);
                repo.saveUserSpots();
                if (social != null) {
                    try {
                        social.deleteSpotData(id);   // its reports, comments, ratings and photos go with it
                    } catch (java.sql.SQLException e) {
                        System.err.println("Could not remove the data of deleted spot " + id + ": " + e.getMessage());
                    }
                }
                sendJson(exchange, 200, "{\"ok\":true}");
            } catch (InvalidInputException e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            }
        });

// =========================================================================================================
// What students share (reports, comments, votes, ratings, photos, favorites) lives in MySQL,
// so every account sees the same data. All of these need a logged-in username, like the endpoints above.
// =========================================================================================================

        // Everything in one go: all reports, comments, photo list, ratings, and this student's favorites.
        api(server, "/api/social", d -> {
            String me = d.getOrDefault("username", "").trim();
            UserAccount u = me.isEmpty() ? null : auth.lookup(me);
            java.util.Set<Integer> favs = u == null ? java.util.Set.of() : new java.util.TreeSet<>(u.getFavoriteSpots());
            return needSocial().snapshotJson(u == null ? "" : u.getUserName(), favs);
        });

        // Progress for the header chip and the dashboard: points, streak, this week's points, badges, leaderboard.
        api(server, "/api/game", d -> {
            UserAccount u = requireUser(d, "see your progress");
            if (game == null)
                throw new InvalidInputException("Points history and the leaderboard need the MySQL database (see docs/DATABASE_SETUP.md).");
            return game.stateJson(u);
        });

        api(server, "/api/report-vote", d -> {
            UserAccount u = requireUser(d, "vote");
            int[] r = needSocial().voteReport(intOf(d, "reportId"), u.getUserName(), intOf(d, "dir"));
            return "{\"ok\":true,\"up\":" + r[0] + ",\"down\":" + r[1] + ",\"myVote\":" + r[2] + ",\"removed\":" + (r[3] == 1) + "}";
        });

        api(server, "/api/comment-add", d -> {
            UserAccount u = requireUser(d, "comment");
            int spotId = intOf(d, "spotId");
            if (repo.findById(spotId) == null) throw new InvalidInputException("That study spot no longer exists.");
            long[] r = needSocial().addComment(spotId, u.getUserName(), d.get("text"));
            award(u, GameStore.COMMENT, "comment");
            auth.save();
            return "{\"ok\":true,\"id\":" + r[0] + ",\"ts\":" + r[1] + ",\"points\":" + u.getPoints() + "}";
        });

        api(server, "/api/comment-delete", d -> {
            UserAccount u = requireUser(d, "delete a comment");
            needSocial().deleteComment(intOf(d, "commentId"), u.getUserName());
            return "{\"ok\":true}";
        });

        api(server, "/api/comment-vote", d -> {
            UserAccount u = requireUser(d, "vote");
            int[] r = needSocial().voteComment(intOf(d, "commentId"), u.getUserName(), intOf(d, "dir"));
            return "{\"ok\":true,\"up\":" + r[0] + ",\"down\":" + r[1] + ",\"myVote\":" + r[2] + "}";
        });

        api(server, "/api/rate", d -> {
            UserAccount u = requireUser(d, "rate a spot");
            int spotId = intOf(d, "spotId");
            if (repo.findById(spotId) == null) throw new InvalidInputException("That study spot no longer exists.");
            int[] r = needSocial().rate(spotId, u.getUserName(), intOf(d, "stars"));
            if (r[0] == 1) {
                award(u, GameStore.RATING, "rating");
                auth.save();
            }
            return "{\"ok\":true,\"firstTime\":" + (r[0] == 1) + ",\"sum\":" + r[1] + ",\"count\":" + r[2] + "}";
        });

        api(server, "/api/photo-add", d -> {
            UserAccount u = requireUser(d, "add a photo");
            int spotId = intOf(d, "spotId");
            if (repo.findById(spotId) == null) throw new InvalidInputException("That study spot no longer exists.");
            long[] r = needSocial().addPhoto(spotId, u.getUserName(), d.get("caption"), d.get("src"));
            u.incrementPhotosAdded();
            award(u, GameStore.PHOTO, "photo");
            auth.save();
            return "{\"ok\":true,\"id\":" + r[0] + ",\"ts\":" + r[1] + "}";
        });

        api(server, "/api/photo-delete", d -> {
            UserAccount u = requireUser(d, "remove a photo");
            needSocial().deletePhoto(intOf(d, "photoId"), u.getUserName());
            return "{\"ok\":true}";
        });

        // The picture itself (the pages use it as <img src="/api/photo?id=7">).
        server.createContext("/api/photo", exchange -> {
            try {
                String q = exchange.getRequestURI().getQuery();
                int id = Integer.parseInt(q.replaceAll(".*(^|&)id=(\\d+).*", "$2"));
                SocialStore.PhotoData p = needSocial().photo(id);
                if (p == null) {
                    sendJson(exchange, 404, "{\"error\":\"Photo not found\"}");
                    return;
                }
                exchange.getResponseHeaders().set("Content-Type", p.mime());
                exchange.getResponseHeaders().set("Cache-Control", "public, max-age=86400");
                exchange.sendResponseHeaders(200, p.bytes().length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(p.bytes());
                }
            } catch (Exception e) {
                sendJson(exchange, 404, "{\"error\":\"Photo not found\"}");
            }
        });

        // A student's profile picture (the pages use it as <img src="/api/avatar?u=username">).
        // Answers 404 when the student has no picture, so the page falls back to the first letter of the name.
        server.createContext("/api/avatar", exchange -> {
            try {
                String q = exchange.getRequestURI().getRawQuery();
                String name = java.net.URLDecoder.decode(q.replaceAll(".*(^|&)u=([^&]*).*", "$2"), StandardCharsets.UTF_8);
                UserAccount u = auth.lookup(name);
                String av = u == null ? "" : u.getProfile().getAvatar();
                int comma = av.indexOf(',');
                int semi = av.indexOf(';');
                if (!av.startsWith("data:image/") || comma < 0 || semi < 0 || semi > comma) {
                    sendJson(exchange, 404, "{\"error\":\"No profile picture\"}");
                    return;
                }
                String etag = "\"" + Integer.toHexString(av.hashCode()) + "\"";     // changes when the picture changes
                exchange.getResponseHeaders().set("ETag", etag);
                exchange.getResponseHeaders().set("Cache-Control", "no-cache");     // the browser re-checks, so a new picture shows up
                if (etag.equals(exchange.getRequestHeaders().getFirst("If-None-Match"))) {
                    exchange.sendResponseHeaders(304, -1);
                    return;
                }
                byte[] bytes = java.util.Base64.getMimeDecoder().decode(av.substring(comma + 1));
                exchange.getResponseHeaders().set("Content-Type", av.substring(5, semi));
                exchange.sendResponseHeaders(200, bytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(bytes);
                }
            } catch (Exception e) {
                sendJson(exchange, 404, "{\"error\":\"No profile picture\"}");
            }
        });

        // What other students may see on someone's profile popup. No email and no birthday on purpose.
        api(server, "/api/profile/public", d -> {
            requireUser(d, "view profiles");
            UserAccount t = auth.lookup(d.get("target"));
            if (t == null) throw new InvalidInputException("That account no longer exists.");
            UserProfile p = t.getProfile();
            StringBuilder sb = new StringBuilder("{\"ok\":true");
            sb.append(",\"userName\":\"").append(esc(t.getUserName())).append('"');
            sb.append(",\"userType\":\"").append(t.getUserType().name()).append('"');
            sb.append(",\"memberSince\":\"").append(esc(t.getCreatedAt())).append('"');
            sb.append(",\"fullName\":\"").append(esc(p.getFullName())).append('"');
            sb.append(",\"bio\":\"").append(esc(p.getBio())).append('"');
            sb.append(",\"school\":\"").append(esc(p.getSchool())).append('"');
            sb.append(",\"course\":\"").append(esc(p.getCourse())).append('"');
            sb.append(",\"yearLevel\":\"").append(esc(p.getYearLevel())).append('"');
            sb.append(",\"location\":\"").append(esc(p.getLocation())).append('"');
            sb.append(",\"interests\":").append(jsonArray(p.getInterests()));
            sb.append(",\"studyPrefs\":").append(jsonArray(p.getStudyPrefs()));
            sb.append(",\"hasAvatar\":").append(!p.getAvatar().isEmpty());
            sb.append(",\"points\":").append(t.getPoints());
            sb.append(",\"reportsMade\":").append(t.getReportsMade());
            sb.append(",\"spotsAdded\":").append(t.getSpotsAdded());
            sb.append(",\"photosAdded\":").append(t.getPhotosAdded());
            return sb.append('}').toString();
        });

        api(server, "/api/favorite", d -> {
            UserAccount u = requireUser(d, "save favorites");
            int spotId = intOf(d, "spotId");
            if (Boolean.parseBoolean(d.get("on"))) {
                if (repo.findById(spotId) == null) throw new InvalidInputException("That study spot no longer exists.");
                u.getFavoriteSpots().add(spotId);
            } else {
                u.getFavoriteSpots().remove(spotId);
            }
            auth.save();
            return "{\"ok\":true}";
        });

        server.start();
        String url = "http://localhost:8080";
        System.out.println("=========================================");
        System.out.println("QuietSpot Java Server is running!");
        if (social == null)
            System.out.println("WARNING: no MySQL database is set up, so reports, comments, ratings, photos, streaks and the leaderboard are switched off (see docs/DATABASE_SETUP.md).");
        System.out.println("Opening " + url + "...");
        System.out.println("=========================================");
        openBrowser(url);
    }

    // Helper Methods
    private interface Api {
        String run(Map<String, String> data) throws Exception;
    }

    // A POST endpoint that answers with the JSON the handler returns, or {"ok":false,"error":...} when it throws.
    private static void api(HttpServer server, String path, Api handler) {
        server.createContext(path, exchange -> {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"ok\":false,\"error\":\"Use POST\"}");
                return;
            }
            try {
                sendJson(exchange, 200, handler.run(parseForm(readBody(exchange))));
            } catch (InvalidInputException e) {
                sendJson(exchange, 400, "{\"ok\":false,\"error\":\"" + esc(e.getMessage()) + "\"}");
            } catch (Exception e) {
                e.printStackTrace();
                sendJson(exchange, 500, "{\"ok\":false,\"error\":\"" + esc("Server error: " + e.getMessage()) + "\"}");
            }
        });
    }

    // Adds points to the account and records them in the points history (streaks and the weekly board come from it).
    private static void award(UserAccount u, int points, String reason) throws java.sql.SQLException {
        u.addPoints(points);
        if (game != null) game.log(u.getUserName(), points, reason);
    }

    private static SocialStore needSocial() throws InvalidInputException {
        if (social == null)
            throw new InvalidInputException("Reports, comments, ratings and photos need the MySQL database (see docs/DATABASE_SETUP.md).");
        return social;
    }

    private static UserAccount requireUser(Map<String, String> d, String action) throws InvalidInputException {
        UserAccount u = auth.lookup(d.get("username"));
        if (u == null) throw new InvalidInputException("Please log in to " + action + ".");
        return u;
    }

    private static int intOf(Map<String, String> d, String key) throws InvalidInputException {
        try {
            return Integer.parseInt(String.valueOf(d.get(key)).trim());
        } catch (NumberFormatException e) {
            throw new InvalidInputException("Invalid request.");
        }
    }

    // Response for login and sign up. setupDone tells the page if the profile setup was already finished.
    private static String authJson(UserAccount u) {
        return String.format(
                "{\"ok\":true,\"userName\":\"%s\",\"userType\":\"%s\",\"points\":%d,\"fullName\":\"%s\",\"setupDone\":%b}",
                esc(u.getUserName()), u.getUserType().name(), u.getPoints(),
                esc(u.getProfile().getFullName()), u.getProfile().isSetupDone());
    }

    // Full profile as JSON (used by /api/profile/get and /api/profile/save).
    private static String profileJson(UserAccount u) {
        UserProfile p = u.getProfile();
        StringBuilder sb = new StringBuilder("{\"ok\":true");
        sb.append(",\"userName\":\"").append(esc(u.getUserName())).append('"');
        sb.append(",\"userType\":\"").append(u.getUserType().name()).append('"');
        sb.append(",\"email\":\"").append(esc(u.getEmail())).append('"');
        sb.append(",\"memberSince\":\"").append(esc(u.getCreatedAt())).append('"');
        sb.append(",\"fullName\":\"").append(esc(p.getFullName())).append('"');
        sb.append(",\"bio\":\"").append(esc(p.getBio())).append('"');
        sb.append(",\"school\":\"").append(esc(p.getSchool())).append('"');
        sb.append(",\"course\":\"").append(esc(p.getCourse())).append('"');
        sb.append(",\"yearLevel\":\"").append(esc(p.getYearLevel())).append('"');
        sb.append(",\"location\":\"").append(esc(p.getLocation())).append('"');
        sb.append(",\"birthday\":\"").append(esc(p.getBirthday())).append('"');
        sb.append(",\"interests\":").append(jsonArray(p.getInterests()));
        sb.append(",\"studyPrefs\":").append(jsonArray(p.getStudyPrefs()));
        sb.append(",\"avatar\":\"").append(esc(p.getAvatar())).append('"');
        sb.append(",\"completion\":").append(p.completion());
        sb.append(",\"missing\":").append(jsonArray(p.missingItems()));
        sb.append(",\"setupDone\":").append(p.isSetupDone());
        return sb.append('}').toString();
    }

    private static String jsonArray(java.util.List<String> items) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append('"').append(esc(items.get(i))).append('"');
        }
        return sb.append(']').toString();
    }

    private static void openBrowser(String url) {                   // Opens the default browser.
        try {
            if (java.awt.Desktop.isDesktopSupported()
                    && java.awt.Desktop.getDesktop().isSupported(java.awt.Desktop.Action.BROWSE)) {
                java.awt.Desktop.getDesktop().browse(new java.net.URI(url));
                return;
            }
        } catch (Exception ignored) {                               // fall through to the OS-specific commands below

        }
        try {
            String os = System.getProperty("os.name").toLowerCase();
            if (os.contains("win")) {
                new ProcessBuilder("rundll32", "url.dll,FileProtocolHandler", url).start();
            } else if (os.contains("mac")) {
                new ProcessBuilder("open", url).start();
            } else {
                new ProcessBuilder("xdg-open", url).start();
            }
        } catch (Exception e) {
            System.out.println("Could not open the browser automatically. Please open: " + url);
        }
    }

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
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", " ").replace("\t", " ");
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