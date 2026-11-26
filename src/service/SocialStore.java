package service;

import exception.InvalidInputException;

import java.sql.*;
import java.util.Base64;
import java.util.Set;

// Everything the students share with each other, kept in MySQL so every account sees the same data:
// reports (with their votes), comments (with their votes), star ratings and photos.

// Rows point to a student by username. There is deliberately NO foreign key to the users table: when a username
// changes, MySqlUserStore inserts the new row and deletes the old one, which would wipe a cascading foreign key.
// Instead Main calls renameUser(...) and deleteUserData(...) when an account is renamed or deleted,
// and deleteSpotData(...) when a spot is deleted.

public class SocialStore {
    /** A report whose votes add up to this or less is removed (same rule as before, now enforced here). */
    public static final int REMOVE_AT_NET = -3;
    public static final int MAX_PHOTOS_PER_SPOT = 12;
    private static final int MAX_PHOTO_CHARS = 3_000_000;
    private static final Set<String> IMAGE_TYPES = Set.of("image/jpeg", "image/png", "image/webp", "image/gif");

    private final Db db;

    public SocialStore(Db db) {
        this.db = db;
    }

    // A decoded photo, ready to be sent to the browser.
    public record PhotoData(String mime, byte[] bytes) { }

    // ------------------------------------------------------------------ reading

    // Everything the pages need in one go. "me" is the logged-in username ("" when nobody is logged in): it decides
    // which votes and ratings are marked as yours. Photos are listed without their pixels (the browser loads each
    // one from /api/photo?id=...).

    public String snapshotJson(String me, Set<Integer> favorites) throws SQLException {
        StringBuilder sb = new StringBuilder("{\"ok\":true");
        try (Connection c = db.connect()) {
            sb.append(",\"reports\":[");
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT r.id, r.spot_id, r.username, r.noise, r.crowd, r.note, r.created_at,"
                    + " (SELECT COUNT(*) FROM report_votes v WHERE v.report_id = r.id AND v.vote = 1) AS up,"
                    + " (SELECT COUNT(*) FROM report_votes v WHERE v.report_id = r.id AND v.vote = -1) AS down,"
                    + " COALESCE((SELECT v.vote FROM report_votes v WHERE v.report_id = r.id AND v.username = ?), 0) AS mine"
                    + " FROM reports r ORDER BY r.created_at DESC, r.id DESC")) {
                ps.setString(1, me);
                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        if (!first) sb.append(',');
                        first = false;
                        sb.append("{\"id\":").append(rs.getInt("id"))
                          .append(",\"spotId\":").append(rs.getInt("spot_id"))
                          .append(",\"user\":\"").append(esc(rs.getString("username"))).append('"')
                          .append(",\"noise\":").append(rs.getInt("noise"))
                          .append(",\"crowd\":").append(rs.getInt("crowd"))
                          .append(",\"note\":\"").append(esc(rs.getString("note"))).append('"')
                          .append(",\"ts\":").append(rs.getLong("created_at"))
                          .append(",\"up\":").append(rs.getInt("up"))
                          .append(",\"down\":").append(rs.getInt("down"))
                          .append(",\"myVote\":").append(rs.getInt("mine")).append('}');
                    }
                }
            }
            sb.append("],\"comments\":[");
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT m.id, m.spot_id, m.username, m.body, m.created_at,"
                    + " (SELECT COUNT(*) FROM comment_votes v WHERE v.comment_id = m.id AND v.vote = 1) AS up,"
                    + " (SELECT COUNT(*) FROM comment_votes v WHERE v.comment_id = m.id AND v.vote = -1) AS down,"
                    + " COALESCE((SELECT v.vote FROM comment_votes v WHERE v.comment_id = m.id AND v.username = ?), 0) AS mine"
                    + " FROM comments m ORDER BY m.created_at ASC, m.id ASC")) {
                ps.setString(1, me);
                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        if (!first) sb.append(',');
                        first = false;
                        sb.append("{\"id\":").append(rs.getInt("id"))
                          .append(",\"spotId\":").append(rs.getInt("spot_id"))
                          .append(",\"user\":\"").append(esc(rs.getString("username"))).append('"')
                          .append(",\"text\":\"").append(esc(rs.getString("body"))).append('"')
                          .append(",\"ts\":").append(rs.getLong("created_at"))
                          .append(",\"up\":").append(rs.getInt("up"))
                          .append(",\"down\":").append(rs.getInt("down"))
                          .append(",\"myVote\":").append(rs.getInt("mine")).append('}');
                    }
                }
            }
            sb.append("],\"photos\":[");
            try (Statement st = c.createStatement();
                 ResultSet rs = st.executeQuery("SELECT id, spot_id, username, caption, created_at FROM photos"
                         + " ORDER BY created_at DESC, id DESC")) {
                boolean first = true;
                while (rs.next()) {
                    if (!first) sb.append(',');
                    first = false;
                    sb.append("{\"id\":").append(rs.getInt("id"))
                      .append(",\"spotId\":").append(rs.getInt("spot_id"))
                      .append(",\"user\":\"").append(esc(rs.getString("username"))).append('"')
                      .append(",\"caption\":\"").append(esc(rs.getString("caption"))).append('"')
                      .append(",\"ts\":").append(rs.getLong("created_at")).append('}');
                }
            }
            sb.append("],\"ratings\":[");
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT spot_id, SUM(stars) AS total, COUNT(*) AS n,"
                    + " COALESCE(SUM(CASE WHEN username = ? THEN stars END), 0) AS mine"
                    + " FROM ratings GROUP BY spot_id")) {
                ps.setString(1, me);
                try (ResultSet rs = ps.executeQuery()) {
                    boolean first = true;
                    while (rs.next()) {
                        if (!first) sb.append(',');
                        first = false;
                        sb.append("{\"spotId\":").append(rs.getInt("spot_id"))
                          .append(",\"sum\":").append(rs.getInt("total"))
                          .append(",\"count\":").append(rs.getInt("n"))
                          .append(",\"mine\":").append(rs.getInt("mine")).append('}');
                    }
                }
            }
        }
        sb.append("],\"favorites\":[");
        boolean first = true;
        for (int id : favorites) {
            if (!first) sb.append(',');
            first = false;
            sb.append(id);
        }
        return sb.append("]}").toString();
    }

    // ------------------------------------------------------------------ reports

    // Saves a report. It starts with its author's own upvote. Returns {id, ts}.
    public long[] addReport(int spotId, String user, int noise, int crowd, String note) throws SQLException {
        long ts = System.currentTimeMillis();
        try (Connection c = db.connect()) {
            c.setAutoCommit(false);
            try {
                int id;
                try (PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO reports (spot_id, username, noise, crowd, note, created_at) VALUES (?,?,?,?,?,?)",
                        Statement.RETURN_GENERATED_KEYS)) {
                    ps.setInt(1, spotId);
                    ps.setString(2, user);
                    ps.setInt(3, noise);
                    ps.setInt(4, crowd);
                    ps.setString(5, clip(note, 200));
                    ps.setLong(6, ts);
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        keys.next();
                        id = keys.getInt(1);
                    }
                }
                try (PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO report_votes (report_id, username, vote) VALUES (?,?,1)")) {
                    ps.setInt(1, id);
                    ps.setString(2, user);
                    ps.executeUpdate();
                }
                c.commit();
                return new long[] { id, ts };
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        }
    }

    // Up- or downvote a report (voting the same way again takes the vote back). Returns the new totals, and removes
    // the report when it has been downvoted enough. Result: {up, down, myVote, removed(0/1)}.
    public int[] voteReport(int reportId, String user, int dir) throws SQLException, InvalidInputException {
        checkDir(dir);
        try (Connection c = db.connect()) {
            c.setAutoCommit(false);
            try {
                requireRow(c, "reports", reportId, "That report no longer exists.");
                int[] t = toggleVote(c, "report_votes", "report_id", reportId, user, dir);
                boolean removed = t[0] - t[1] <= REMOVE_AT_NET;
                if (removed) {
                    run(c, "DELETE FROM report_votes WHERE report_id = ?", reportId);
                    run(c, "DELETE FROM reports WHERE id = ?", reportId);
                }
                c.commit();
                return new int[] { t[0], t[1], t[2], removed ? 1 : 0 };
            } catch (SQLException | RuntimeException | InvalidInputException e) {
                c.rollback();
                throw e;
            }
        }
    }

    // ------------------------------------------------------------------ comments

    // Saves a comment (it starts with its author's upvote). Returns {id, ts}.
    public long[] addComment(int spotId, String user, String text) throws SQLException, InvalidInputException {
        String body = text == null ? "" : text.trim();
        if (body.isEmpty()) throw new InvalidInputException("Write a comment first.");
        if (body.length() > 500) throw new InvalidInputException("Comments can be up to 500 characters.");
        long ts = System.currentTimeMillis();
        try (Connection c = db.connect()) {
            c.setAutoCommit(false);
            try {
                int id;
                try (PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO comments (spot_id, username, body, created_at) VALUES (?,?,?,?)",
                        Statement.RETURN_GENERATED_KEYS)) {
                    ps.setInt(1, spotId);
                    ps.setString(2, user);
                    ps.setString(3, body);
                    ps.setLong(4, ts);
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        keys.next();
                        id = keys.getInt(1);
                    }
                }
                try (PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO comment_votes (comment_id, username, vote) VALUES (?,?,1)")) {
                    ps.setInt(1, id);
                    ps.setString(2, user);
                    ps.executeUpdate();
                }
                c.commit();
                return new long[] { id, ts };
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        }
    }

    // Only the student who wrote a comment can delete it.
    public void deleteComment(int commentId, String user) throws SQLException, InvalidInputException {
        try (Connection c = db.connect()) {
            c.setAutoCommit(false);
            try {
                int n;
                try (PreparedStatement ps = c.prepareStatement("DELETE FROM comments WHERE id = ? AND username = ?")) {
                    ps.setInt(1, commentId);
                    ps.setString(2, user);
                    n = ps.executeUpdate();
                }
                if (n == 0) throw new InvalidInputException("You can only delete your own comments.");
                run(c, "DELETE FROM comment_votes WHERE comment_id = ?", commentId);
                c.commit();
            } catch (SQLException | RuntimeException | InvalidInputException e) {
                c.rollback();
                throw e;
            }
        }
    }

    // Returns {up, down, myVote}. Comments are never removed by votes, they are only marked as downvoted.
    public int[] voteComment(int commentId, String user, int dir) throws SQLException, InvalidInputException {
        checkDir(dir);
        try (Connection c = db.connect()) {
            c.setAutoCommit(false);
            try {
                requireRow(c, "comments", commentId, "That comment no longer exists.");
                int[] t = toggleVote(c, "comment_votes", "comment_id", commentId, user, dir);
                c.commit();
                return t;
            } catch (SQLException | RuntimeException | InvalidInputException e) {
                c.rollback();
                throw e;
            }
        }
    }

    // ------------------------------------------------------------------ ratings

    // Saves this student's star rating for a spot (a new rating replaces their old one). Returns {firstTime, sum, count}.
    public int[] rate(int spotId, String user, int stars) throws SQLException, InvalidInputException {
        if (stars < 1 || stars > 5) throw new InvalidInputException("A rating is 1 to 5 stars.");
        try (Connection c = db.connect()) {
            c.setAutoCommit(false);
            try {
                boolean first;
                try (PreparedStatement ps = c.prepareStatement("SELECT 1 FROM ratings WHERE spot_id = ? AND username = ?")) {
                    ps.setInt(1, spotId);
                    ps.setString(2, user);
                    try (ResultSet rs = ps.executeQuery()) {
                        first = !rs.next();
                    }
                }
                try (PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO ratings (spot_id, username, stars) VALUES (?,?,?)"
                        + " ON DUPLICATE KEY UPDATE stars = VALUES(stars)")) {
                    ps.setInt(1, spotId);
                    ps.setString(2, user);
                    ps.setInt(3, stars);
                    ps.executeUpdate();
                }
                int sum = 0, count = 0;
                try (PreparedStatement ps = c.prepareStatement(
                        "SELECT COALESCE(SUM(stars), 0), COUNT(*) FROM ratings WHERE spot_id = ?")) {
                    ps.setInt(1, spotId);
                    try (ResultSet rs = ps.executeQuery()) {
                        rs.next();
                        sum = rs.getInt(1);
                        count = rs.getInt(2);
                    }
                }
                c.commit();
                return new int[] { first ? 1 : 0, sum, count };
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        }
    }

    // ------------------------------------------------------------------ photos

    // Saves a photo (a "data:image/...;base64,..." string from the browser). Returns {id, ts}.
    public long[] addPhoto(int spotId, String user, String caption, String src) throws SQLException, InvalidInputException {
        if (src == null || !src.startsWith("data:image/") || !src.contains(";base64,"))
            throw new InvalidInputException("Please choose an image file.");
        String mime = src.substring(5, src.indexOf(';'));
        if (!IMAGE_TYPES.contains(mime)) throw new InvalidInputException("Please choose a JPG, PNG, WebP or GIF image.");
        if (src.length() > MAX_PHOTO_CHARS) throw new InvalidInputException("That image is too large. Choose a smaller one.");
        long ts = System.currentTimeMillis();
        try (Connection c = db.connect()) {
            try (PreparedStatement ps = c.prepareStatement("SELECT COUNT(*) FROM photos WHERE spot_id = ?")) {
                ps.setInt(1, spotId);
                try (ResultSet rs = ps.executeQuery()) {
                    rs.next();
                    if (rs.getInt(1) >= MAX_PHOTOS_PER_SPOT)
                        throw new InvalidInputException("A spot can have up to " + MAX_PHOTOS_PER_SPOT
                                + " photos. Remove one to add another.");
                }
            }
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO photos (spot_id, username, caption, src, created_at) VALUES (?,?,?,?,?)",
                    Statement.RETURN_GENERATED_KEYS)) {
                ps.setInt(1, spotId);
                ps.setString(2, user);
                ps.setString(3, clip(caption, 100));
                ps.setString(4, src);
                ps.setLong(5, ts);
                ps.executeUpdate();
                try (ResultSet keys = ps.getGeneratedKeys()) {
                    keys.next();
                    return new long[] { keys.getInt(1), ts };
                }
            }
        }
    }

    // Only the student who added a photo can remove it.
    public void deletePhoto(int photoId, String user) throws SQLException, InvalidInputException {
        try (Connection c = db.connect();
             PreparedStatement ps = c.prepareStatement("DELETE FROM photos WHERE id = ? AND username = ?")) {
            ps.setInt(1, photoId);
            ps.setString(2, user);
            if (ps.executeUpdate() == 0) throw new InvalidInputException("You can only remove your own photos.");
        }
    }

    // The picture itself, or null if there is no such photo.
    public PhotoData photo(int photoId) throws SQLException {
        try (Connection c = db.connect();
             PreparedStatement ps = c.prepareStatement("SELECT src FROM photos WHERE id = ?")) {
            ps.setInt(1, photoId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                String src = rs.getString(1);
                int comma = src.indexOf(',');
                String mime = src.substring(5, src.indexOf(';'));
                return new PhotoData(mime, Base64.getDecoder().decode(src.substring(comma + 1)));
            }
        }
    }

    // ------------------------------------------------------------------ keeping data in step with spots and accounts

    // A spot was deleted: its reports, comments, ratings and photos go with it.
    public void deleteSpotData(int spotId) throws SQLException {
        try (Connection c = db.connect()) {
            c.setAutoCommit(false);
            try {
                run(c, "DELETE FROM report_votes WHERE report_id IN (SELECT id FROM reports WHERE spot_id = ?)", spotId);
                run(c, "DELETE FROM reports WHERE spot_id = ?", spotId);
                run(c, "DELETE FROM comment_votes WHERE comment_id IN (SELECT id FROM comments WHERE spot_id = ?)", spotId);
                run(c, "DELETE FROM comments WHERE spot_id = ?", spotId);
                run(c, "DELETE FROM ratings WHERE spot_id = ?", spotId);
                run(c, "DELETE FROM photos WHERE spot_id = ?", spotId);
                c.commit();
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        }
    }

    // A student changed their username: everything they wrote or voted follows the new name.
    public void renameUser(String oldName, String newName) throws SQLException {
        try (Connection c = db.connect()) {
            c.setAutoCommit(false);
            try {
                for (String table : new String[] { "reports", "comments", "ratings", "photos", "report_votes", "comment_votes" }) {
                    try (PreparedStatement ps = c.prepareStatement("UPDATE " + table + " SET username = ? WHERE username = ?")) {
                        ps.setString(1, newName);
                        ps.setString(2, oldName);
                        ps.executeUpdate();
                    }
                }
                c.commit();
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        }
    }

    // An account was deleted: what they wrote goes with it, and so do their votes and ratings on other things.
    public void deleteUserData(String user) throws SQLException {
        try (Connection c = db.connect()) {
            c.setAutoCommit(false);
            try {
                runUser(c, "DELETE FROM report_votes WHERE report_id IN (SELECT id FROM reports WHERE username = ?)", user);
                runUser(c, "DELETE FROM reports WHERE username = ?", user);
                runUser(c, "DELETE FROM comment_votes WHERE comment_id IN (SELECT id FROM comments WHERE username = ?)", user);
                runUser(c, "DELETE FROM comments WHERE username = ?", user);
                runUser(c, "DELETE FROM report_votes WHERE username = ?", user);
                runUser(c, "DELETE FROM comment_votes WHERE username = ?", user);
                runUser(c, "DELETE FROM ratings WHERE username = ?", user);
                runUser(c, "DELETE FROM photos WHERE username = ?", user);
                c.commit();
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        }
    }

    // ------------------------------------------------------------------ helpers

    // Applies the vote (same direction again = take it back) and returns {up, down, myVote}. Table names are fixed strings from this class.
    private int[] toggleVote(Connection c, String voteTable, String idColumn, int id, String user, int dir) throws SQLException {
        int cur = 0;
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT vote FROM " + voteTable + " WHERE " + idColumn + " = ? AND username = ?")) {
            ps.setInt(1, id);
            ps.setString(2, user);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) cur = rs.getInt(1);
            }
        }
        int next = cur == dir ? 0 : dir;
        if (next == 0) {
            try (PreparedStatement ps = c.prepareStatement(
                    "DELETE FROM " + voteTable + " WHERE " + idColumn + " = ? AND username = ?")) {
                ps.setInt(1, id);
                ps.setString(2, user);
                ps.executeUpdate();
            }
        } else {
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO " + voteTable + " (" + idColumn + ", username, vote) VALUES (?,?,?)"
                    + " ON DUPLICATE KEY UPDATE vote = VALUES(vote)")) {
                ps.setInt(1, id);
                ps.setString(2, user);
                ps.setInt(3, next);
                ps.executeUpdate();
            }
        }
        int up = 0, down = 0;
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT COALESCE(SUM(vote = 1), 0), COALESCE(SUM(vote = -1), 0) FROM " + voteTable + " WHERE " + idColumn + " = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                up = rs.getInt(1);
                down = rs.getInt(2);
            }
        }
        return new int[] { up, down, next };
    }

    private static void requireRow(Connection c, String table, int id, String message) throws SQLException, InvalidInputException {
        try (PreparedStatement ps = c.prepareStatement("SELECT 1 FROM " + table + " WHERE id = ?")) {
            ps.setInt(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) throw new InvalidInputException(message);
            }
        }
    }

    private static void checkDir(int dir) throws InvalidInputException {
        if (dir != 1 && dir != -1) throw new InvalidInputException("That is not a valid vote.");
    }

    private static void run(Connection c, String sql, int param) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, param);
            ps.executeUpdate();
        }
    }

    private static void runUser(Connection c, String sql, String user) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, user);
            ps.executeUpdate();
        }
    }

    private static String clip(String s, int max) {
        if (s == null) return "";
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", " ").replace("\t", " ");
    }
}