package service;

import model.UserAccount;

import java.sql.*;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

// Points history, daily streaks, the weekly leaderboard and unlocked badges, kept in MySQL so they follow the account
// to any browser. Every time a student earns points, log(...) saves one row in point_events. The streak, this week's
// points and the leaderboard are all worked out from those rows, so they can never disagree with each other.

// Like SocialStore, rows point to a student by username with no foreign key: renameUser(...) and deleteUserData(...)
// are called by Main when an account is renamed or deleted.

public class GameStore {
    // Points for each action. The server decides; the page only shows these numbers in "How to earn points".
    public static final int REPORT = 5, SPOT = 25, PHOTO = 5, RATING = 2, COMMENT = 3;
    private static final int BOARD_SIZE = 10;
    private static final int DAYS_SHOWN = 21;

    private final Db db;

    public GameStore(Db db) {
        this.db = db;
    }

    // Saves one "earned points" row (the points themselves are added to the account by the caller).
    public void log(String user, int points, String reason) throws SQLException {
        try (Connection c = db.connect();
             PreparedStatement ps = c.prepareStatement(
                     "INSERT INTO point_events (username, points, reason, created_at) VALUES (?,?,?,?)")) {
            ps.setString(1, user);
            ps.setInt(2, points);
            ps.setString(3, reason);
            ps.setLong(4, System.currentTimeMillis());
            ps.executeUpdate();
        }
    }


    // Everything the dashboard and the header chip need for one student: totals from the account, the streak, this
    // week's points, the unlocked badges, and the top of the weekly leaderboard. New badges are saved here (a badge is
    // never taken back, even if the number later drops, for example after un-favoriting a spot).

    public String stateJson(UserAccount u) throws SQLException {
        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = LocalDate.now(zone);
        long weekStart = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                .atStartOfDay(zone).toInstant().toEpochMilli();
        String name = u.getUserName();

        TreeSet<LocalDate> days = new TreeSet<>();
        int weekPoints = 0;
        Set<String> unlocked = new LinkedHashSet<>();
        List<String[]> board = new ArrayList<>();
        int best;
        int streak;
        LocalDate last;

        try (Connection c = db.connect()) {
            try (PreparedStatement ps = c.prepareStatement("SELECT created_at, points FROM point_events WHERE username = ?")) {
                ps.setString(1, name);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        long ts = rs.getLong(1);
                        days.add(Instant.ofEpochMilli(ts).atZone(zone).toLocalDate());
                        if (ts >= weekStart) weekPoints += rs.getInt(2);
                    }
                }
            }

            // Streak = days in a row with at least one earned action, ending today or yesterday. Best = longest run ever.
            int run = 0, bestRun = 0;
            LocalDate prev = null;
            for (LocalDate d : days) {
                run = prev != null && prev.plusDays(1).equals(d) ? run + 1 : 1;
                bestRun = Math.max(bestRun, run);
                prev = d;
            }
            best = bestRun;
            last = days.isEmpty() ? null : days.last();
            streak = last != null && !last.isBefore(today.minusDays(1)) ? run : 0;

            // Badges: save the ones earned now, return everything ever earned.
            try (PreparedStatement ps = c.prepareStatement("SELECT badge_id FROM user_badges WHERE username = ?")) {
                ps.setString(1, name);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) unlocked.add(rs.getString(1));
                }
            }
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT IGNORE INTO user_badges (username, badge_id, unlocked_at) VALUES (?,?,?)")) {
                for (String id : earnedNow(u, best)) {
                    if (unlocked.add(id)) {
                        ps.setString(1, name);
                        ps.setString(2, id);
                        ps.setLong(3, System.currentTimeMillis());
                        ps.executeUpdate();
                    }
                }
            }

            // Weekly leaderboard: points earned since Monday, by everyone.
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT username, SUM(points) AS total FROM point_events WHERE created_at >= ?"
                    + " GROUP BY username ORDER BY total DESC, username ASC LIMIT " + BOARD_SIZE)) {
                ps.setLong(1, weekStart);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) board.add(new String[] { rs.getString(1), String.valueOf(rs.getInt(2)) });
                }
            }
        }

        List<LocalDate> recent = new ArrayList<>(days.descendingSet());
        if (recent.size() > DAYS_SHOWN) recent = recent.subList(0, DAYS_SHOWN);
        Collections.reverse(recent);

        StringBuilder sb = new StringBuilder("{\"ok\":true");
        sb.append(",\"points\":").append(u.getPoints());
        sb.append(",\"reportsMade\":").append(u.getReportsMade());
        sb.append(",\"spotsAdded\":").append(u.getSpotsAdded());
        sb.append(",\"photosAdded\":").append(u.getPhotosAdded());
        sb.append(",\"streak\":").append(streak);
        sb.append(",\"best\":").append(best);
        sb.append(",\"last\":\"").append(last == null ? "" : last.toString()).append('"');
        sb.append(",\"days\":[");
        for (int i = 0; i < recent.size(); i++) sb.append(i > 0 ? "," : "").append('"').append(recent.get(i)).append('"');
        sb.append("],\"weekPoints\":").append(weekPoints);
        sb.append(",\"unlocked\":[");
        int i = 0;
        for (String id : unlocked) sb.append(i++ > 0 ? "," : "").append('"').append(esc(id)).append('"');
        sb.append("],\"board\":[");
        for (int k = 0; k < board.size(); k++) {
            sb.append(k > 0 ? "," : "").append("{\"name\":\"").append(esc(board.get(k)[0]))
              .append("\",\"points\":").append(board.get(k)[1]).append('}');
        }
        return sb.append("]}").toString();
    }

    // Which badges the numbers say this student has earned right now (same rules as the badge shelf on the dashboard).
    private static List<String> earnedNow(UserAccount u, int bestStreak) {
        List<String> out = new ArrayList<>();
        if (u.getReportsMade() >= 1) out.add("first");
        if (u.getSpotsAdded() >= 1) out.add("scout");
        if (u.getPhotosAdded() >= 1) out.add("photo");
        if (u.getFavoriteSpots().size() >= 3) out.add("fans");
        if (u.getPoints() >= 50) out.add("trusted");
        if (u.getPoints() >= 100) out.add("century");
        if (bestStreak >= 3) out.add("roll");
        if (bestStreak >= 7) out.add("week");
        return out;
    }

    // A student changed their username: their history and badges follow the new name.
    public void renameUser(String oldName, String newName) throws SQLException {
        try (Connection c = db.connect()) {
            c.setAutoCommit(false);
            try {
                for (String table : new String[] { "point_events", "user_badges" }) {
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

    // An account was deleted: its points history and badges go with it (and drop off the leaderboard).
    public void deleteUserData(String user) throws SQLException {
        try (Connection c = db.connect()) {
            c.setAutoCommit(false);
            try {
                for (String table : new String[] { "point_events", "user_badges" }) {
                    try (PreparedStatement ps = c.prepareStatement("DELETE FROM " + table + " WHERE username = ?")) {
                        ps.setString(1, user);
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

    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", " ").replace("\t", " ");
    }
}