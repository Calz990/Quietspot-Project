package service;

import model.SpotArea;

import java.sql.*;
import java.util.*;


// Saves the spots students added to MySQL (table spots). The built-in spots are still created by the server
// (SpotRepository.loadDefaultSpots), exactly as with the TSV file. Same two methods as SpotStore.

public class MySqlSpotStore implements SpotStorage {
    private final Db db;

    public MySqlSpotStore(Db db) {
        this.db = db;
    }

    @Override
    public List<SpotArea> load() {
        List<SpotArea> out = new ArrayList<>();
        try (Connection c = db.connect();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT id, spot_type, name, address, pos_x, pos_y, open_hour, close_hour, price,"
                     + " noise, crowd, wifi, mbps, outlets, aircon, food, description, rules, created_by FROM spots ORDER BY id")) {
            while (rs.next()) {
                String[] v = {
                    String.valueOf(rs.getInt("id")), rs.getString("spot_type"), rs.getString("name"), rs.getString("address"),
                    String.valueOf(rs.getDouble("pos_x")), String.valueOf(rs.getDouble("pos_y")),
                    String.valueOf(rs.getInt("open_hour")), String.valueOf(rs.getInt("close_hour")),
                    String.valueOf(rs.getDouble("price")),
                    String.valueOf(rs.getInt("noise")), String.valueOf(rs.getInt("crowd")),
                    String.valueOf(rs.getBoolean("wifi")), String.valueOf(rs.getInt("mbps")),
                    String.valueOf(rs.getBoolean("outlets")), String.valueOf(rs.getBoolean("aircon")),
                    String.valueOf(rs.getBoolean("food")),
                    text(rs, "description"), text(rs, "rules"), rs.getString("created_by")
                };
                try {
                    out.add(SpotStore.fromValues(v));
                } catch (RuntimeException e) {
                    System.err.println("database: skipped a bad spot record (" + e.getMessage() + ")");
                }
            }
        } catch (SQLException e) {
            // Stopping here is deliberate: an empty list would make the next save() delete every spot.
            throw new IllegalStateException("Could not read spots from MySQL: " + e.getMessage(), e);
        }
        return out;
    }

    @Override
    public void save(List<SpotArea> spots) {
        String upsert = "INSERT INTO spots (id, spot_type, name, address, pos_x, pos_y, open_hour, close_hour, price, noise,"
                + " crowd, wifi, mbps, outlets, aircon, food, description, rules, created_by)"
                + " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
                + " ON DUPLICATE KEY UPDATE spot_type=VALUES(spot_type), name=VALUES(name), address=VALUES(address),"
                + " pos_x=VALUES(pos_x), pos_y=VALUES(pos_y), open_hour=VALUES(open_hour), close_hour=VALUES(close_hour),"
                + " price=VALUES(price), noise=VALUES(noise), crowd=VALUES(crowd), wifi=VALUES(wifi), mbps=VALUES(mbps),"
                + " outlets=VALUES(outlets), aircon=VALUES(aircon), food=VALUES(food), description=VALUES(description),"
                + " rules=VALUES(rules), created_by=VALUES(created_by)";
        try (Connection c = db.connect()) {
            c.setAutoCommit(false);
            try {
                Set<Integer> keep = new HashSet<>();
                try (PreparedStatement ps = c.prepareStatement(upsert)) {
                    for (SpotArea s : spots) {
                        if (s.getCreatedBy().isEmpty()) continue;   // built-in spots are not stored
                        String[] v = SpotStore.toValues(s);
                        keep.add(Integer.parseInt(v[0]));
                        ps.setInt(1, Integer.parseInt(v[0]));
                        ps.setString(2, v[1]);
                        ps.setString(3, v[2]);
                        ps.setString(4, v[3]);
                        ps.setDouble(5, Double.parseDouble(v[4]));
                        ps.setDouble(6, Double.parseDouble(v[5]));
                        ps.setInt(7, Integer.parseInt(v[6]));
                        ps.setInt(8, Integer.parseInt(v[7]));
                        ps.setDouble(9, Double.parseDouble(v[8]));
                        ps.setInt(10, Integer.parseInt(v[9]));
                        ps.setInt(11, Integer.parseInt(v[10]));
                        ps.setBoolean(12, Boolean.parseBoolean(v[11]));
                        ps.setInt(13, Integer.parseInt(v[12]));
                        ps.setBoolean(14, Boolean.parseBoolean(v[13]));
                        ps.setBoolean(15, Boolean.parseBoolean(v[14]));
                        ps.setBoolean(16, Boolean.parseBoolean(v[15]));
                        ps.setString(17, v[16]);
                        ps.setString(18, v[17]);
                        ps.setString(19, v[18]);
                        ps.addBatch();
                    }
                    ps.executeBatch();
                }
                List<Integer> gone = new ArrayList<>();
                try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT id FROM spots")) {
                    while (rs.next()) if (!keep.contains(rs.getInt(1))) gone.add(rs.getInt(1));
                }
                try (PreparedStatement ps = c.prepareStatement("DELETE FROM spots WHERE id = ?")) {
                    for (int id : gone) {
                        ps.setInt(1, id);
                        ps.addBatch();
                    }
                    ps.executeBatch();
                }
                c.commit();
            } catch (SQLException | RuntimeException e) {
                c.rollback();
                throw e;
            }
        } catch (SQLException | RuntimeException e) {
            System.err.println("Could not save spots to MySQL: " + e.getMessage());
        }
    }

    // First run with MySQL: if the spots table is empty, copy the spots from the old TSV file.
    public void importIfEmpty(SpotStorage legacy) {
        try (Connection c = db.connect();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM spots")) {
            rs.next();
            if (rs.getInt(1) > 0) return;
        } catch (SQLException e) {
            throw new IllegalStateException("Could not check the spots table: " + e.getMessage(), e);
        }
        List<SpotArea> old = legacy.load();
        if (old.isEmpty()) return;
        save(old);
        System.out.println("Copied " + old.size() + " spot(s) from data/spots.tsv into MySQL (the file is left as a backup).");
    }

    private static String text(ResultSet rs, String column) throws SQLException {
        String s = rs.getString(column);
        return s == null ? "" : s;
    }
}
