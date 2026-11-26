package service;

import model.UserAccount;

import java.sql.*;
import java.util.*;

// Saves accounts to MySQL (tables users and favorites). Same two methods as the TSV UserStore, so AuthService
// does not care which one it gets. save() writes the whole set in one transaction: it updates or inserts every
// account and removes the ones that no longer exist. UserStore.toValues / fromValues turn an account into the
// 21 text values and back, so the validation rules stay in one place.

public class MySqlUserStore implements UserStorage {
    private final Db db;

    public MySqlUserStore(Db db) {
        this.db = db;
    }

    @Override
    public List<UserAccount> load() {
        Map<String, Set<Integer>> favorites = new HashMap<>();
        List<UserAccount> out = new ArrayList<>();
        try (Connection c = db.connect()) {
            try (Statement st = c.createStatement();
                 ResultSet rs = st.executeQuery("SELECT username, spot_id FROM favorites ORDER BY spot_id")) {
                while (rs.next())
                    favorites.computeIfAbsent(rs.getString(1).toLowerCase(), k -> new TreeSet<>()).add(rs.getInt(2));
            }
            try (Statement st = c.createStatement();
                 ResultSet rs = st.executeQuery("SELECT username, user_type, password_hash, points, reports_made, spots_added,"
                         + " photos_added, email, created_at, full_name, bio, school, course, year_level, location, birthday,"
                         + " interests, study_prefs, avatar, setup_done FROM users ORDER BY username")) {
                while (rs.next()) {
                    String name = rs.getString("username");
                    StringJoiner favs = new StringJoiner(",");
                    for (int id : favorites.getOrDefault(name.toLowerCase(), Set.of())) favs.add(String.valueOf(id));
                    String[] v = {
                        name, rs.getString("user_type"), rs.getString("password_hash"),
                        String.valueOf(rs.getInt("points")), String.valueOf(rs.getInt("reports_made")),
                        String.valueOf(rs.getInt("spots_added")), String.valueOf(rs.getInt("photos_added")),
                        text(rs, "email"), text(rs, "created_at"), favs.toString(),
                        text(rs, "full_name"), text(rs, "bio"), text(rs, "school"), text(rs, "course"),
                        text(rs, "year_level"), text(rs, "location"), text(rs, "birthday"),
                        text(rs, "interests"), text(rs, "study_prefs"), text(rs, "avatar"),
                        String.valueOf(rs.getBoolean("setup_done"))
                    };
                    try {
                        out.add(UserStore.fromValues(v));
                    } catch (RuntimeException e) {
                        System.err.println("database: skipped a bad account record (" + e.getMessage() + ")");
                    }
                }
            }
        } catch (SQLException e) {
            // Stopping here is deliberate: carrying on with an empty list would make the next save() delete everyone.
            throw new IllegalStateException("Could not read accounts from MySQL: " + e.getMessage(), e);
        }
        return out;
    }

    @Override
    public void save(Collection<UserAccount> users) {
        String upsert = "INSERT INTO users (username, user_type, password_hash, points, reports_made, spots_added,"
                + " photos_added, email, created_at, full_name, bio, school, course, year_level, location, birthday,"
                + " interests, study_prefs, avatar, setup_done) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
                + " ON DUPLICATE KEY UPDATE username=VALUES(username), user_type=VALUES(user_type),"
                + " password_hash=VALUES(password_hash), points=VALUES(points), reports_made=VALUES(reports_made),"
                + " spots_added=VALUES(spots_added), photos_added=VALUES(photos_added), email=VALUES(email),"
                + " created_at=VALUES(created_at), full_name=VALUES(full_name), bio=VALUES(bio), school=VALUES(school),"
                + " course=VALUES(course), year_level=VALUES(year_level), location=VALUES(location),"
                + " birthday=VALUES(birthday), interests=VALUES(interests), study_prefs=VALUES(study_prefs),"
                + " avatar=VALUES(avatar), setup_done=VALUES(setup_done)";
        try (Connection c = db.connect()) {
            c.setAutoCommit(false);
            try {
                Set<String> keep = new HashSet<>();
                try (PreparedStatement ps = c.prepareStatement(upsert)) {
                    for (UserAccount u : users) {
                        String[] v = UserStore.toValues(u);
                        keep.add(v[0].toLowerCase());
                        ps.setString(1, v[0]);
                        ps.setString(2, v[1]);
                        ps.setString(3, v[2]);
                        ps.setInt(4, Integer.parseInt(v[3]));
                        ps.setInt(5, Integer.parseInt(v[4]));
                        ps.setInt(6, Integer.parseInt(v[5]));
                        ps.setInt(7, Integer.parseInt(v[6]));
                        if (v[7].isEmpty()) ps.setNull(8, Types.VARCHAR); else ps.setString(8, v[7]);
                        ps.setString(9, v[8]);
                        for (int i = 10; i <= 18; i++)
                            ps.setString(i, v[i]);          // full_name .. study_prefs (v[9], the favorites, has its own table)
                        if (v[19].isEmpty()) ps.setNull(19, Types.LONGVARCHAR); else ps.setString(19, v[19]);
                        ps.setBoolean(20, Boolean.parseBoolean(v[20]));
                        ps.addBatch();
                    }
                    ps.executeBatch();
                }
                // Accounts that were deleted (or renamed) are removed; their favorites go with them.
                List<String> gone = new ArrayList<>();
                try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT username FROM users")) {
                    while (rs.next()) if (!keep.contains(rs.getString(1).toLowerCase())) gone.add(rs.getString(1));
                }
                try (PreparedStatement ps = c.prepareStatement("DELETE FROM users WHERE username = ?")) {
                    for (String name : gone) {
                        ps.setString(1, name);
                        ps.addBatch();
                    }
                    ps.executeBatch();
                }
                // Favorites are simply rewritten.
                try (Statement st = c.createStatement()) {
                    st.executeUpdate("DELETE FROM favorites");
                }
                try (PreparedStatement ps = c.prepareStatement("INSERT INTO favorites (username, spot_id) VALUES (?, ?)")) {
                    for (UserAccount u : users) {
                        for (int spotId : u.getFavoriteSpots()) {
                            ps.setString(1, u.getUserName());
                            ps.setInt(2, spotId);
                            ps.addBatch();
                        }
                    }
                    ps.executeBatch();
                }
                c.commit();
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        } catch (SQLException | RuntimeException e) {
            System.err.println("Could not save accounts to MySQL: " + e.getMessage());
        }
    }

    // First run with MySQL: if the users table is empty, copy the accounts from the old TSV file.
    public void importIfEmpty(UserStorage legacy) {
        try (Connection c = db.connect();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM users")) {
            rs.next();
            if (rs.getInt(1) > 0) return;
        } catch (SQLException e) {
            throw new IllegalStateException("Could not check the users table: " + e.getMessage(), e);
        }
        List<UserAccount> old = legacy.load();
        if (old.isEmpty()) return;
        save(old);
        System.out.println("Copied " + old.size() + " account(s) from data/users.tsv into MySQL (the file is left as a backup).");
    }

    private static String text(ResultSet rs, String column) throws SQLException {
        String s = rs.getString(column);
        return s == null ? "" : s;
    }
}
