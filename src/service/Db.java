package service;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Properties;


// The MySQL connection settings and the table definitions.

// Settings come from config/db.properties (copy config/db.properties.example). For a hosted database you can
// instead set the environment variables DB_URL, DB_USER and DB_PASSWORD, which win over the file.
// The same CREATE TABLE statements are in db/schema.sql if you prefer to run them yourself in MySQL Workbench.

public final class Db {
    private static final Path CONFIG = Paths.get("config", "db.properties");
    private static final String PARAMS = "?useUnicode=true&characterEncoding=utf8&sslMode=DISABLED"
            + "&allowPublicKeyRetrieval=true&serverTimezone=UTC";

    private static final String[] SCHEMA = {
        "CREATE TABLE IF NOT EXISTS users ("
            + " username VARCHAR(100) NOT NULL PRIMARY KEY,"
            + " user_type VARCHAR(20) NOT NULL,"
            + " password_hash VARCHAR(255) NOT NULL,"
            + " points INT NOT NULL DEFAULT 0,"
            + " reports_made INT NOT NULL DEFAULT 0,"
            + " spots_added INT NOT NULL DEFAULT 0,"
            + " photos_added INT NOT NULL DEFAULT 0,"
            + " email VARCHAR(255) NULL,"
            + " created_at VARCHAR(20) NOT NULL DEFAULT '',"
            + " full_name VARCHAR(200) NOT NULL DEFAULT '',"
            + " bio VARCHAR(500) NOT NULL DEFAULT '',"
            + " school VARCHAR(200) NOT NULL DEFAULT '',"
            + " course VARCHAR(200) NOT NULL DEFAULT '',"
            + " year_level VARCHAR(200) NOT NULL DEFAULT '',"
            + " location VARCHAR(200) NOT NULL DEFAULT '',"
            + " birthday VARCHAR(20) NOT NULL DEFAULT '',"
            + " interests VARCHAR(500) NOT NULL DEFAULT '',"
            + " study_prefs VARCHAR(500) NOT NULL DEFAULT '',"
            + " avatar MEDIUMTEXT NULL,"
            + " setup_done BOOLEAN NOT NULL DEFAULT FALSE"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS favorites ("
            + " username VARCHAR(100) NOT NULL,"
            + " spot_id INT NOT NULL,"
            + " PRIMARY KEY (username, spot_id),"
            + " CONSTRAINT fk_favorites_user FOREIGN KEY (username) REFERENCES users (username)"
            + "   ON DELETE CASCADE ON UPDATE CASCADE"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS spots ("
            + " id INT NOT NULL PRIMARY KEY,"
            + " spot_type VARCHAR(30) NOT NULL,"
            + " name VARCHAR(255) NOT NULL,"
            + " address VARCHAR(500) NOT NULL,"
            + " pos_x DOUBLE NOT NULL,"
            + " pos_y DOUBLE NOT NULL,"
            + " open_hour INT NOT NULL,"
            + " close_hour INT NOT NULL,"
            + " price DOUBLE NOT NULL,"
            + " noise TINYINT NOT NULL,"
            + " crowd TINYINT NOT NULL,"
            + " wifi BOOLEAN NOT NULL,"
            + " mbps INT NOT NULL,"
            + " outlets BOOLEAN NOT NULL,"
            + " aircon BOOLEAN NOT NULL,"
            + " food BOOLEAN NOT NULL,"
            + " description TEXT NULL,"
            + " rules TEXT NULL,"
            + " created_by VARCHAR(100) NOT NULL,"
            + " INDEX idx_spots_created_by (created_by)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS reports ("
            + " id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,"
            + " spot_id INT NOT NULL,"
            + " username VARCHAR(100) NOT NULL,"
            + " noise TINYINT NOT NULL,"
            + " crowd TINYINT NOT NULL,"
            + " note VARCHAR(200) NOT NULL DEFAULT '',"
            + " created_at BIGINT NOT NULL,"
            + " INDEX idx_reports_spot (spot_id),"
            + " INDEX idx_reports_user (username)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS report_votes ("
            + " report_id INT NOT NULL,"
            + " username VARCHAR(100) NOT NULL,"
            + " vote TINYINT NOT NULL,"
            + " PRIMARY KEY (report_id, username),"
            + " INDEX idx_report_votes_user (username)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS comments ("
            + " id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,"
            + " spot_id INT NOT NULL,"
            + " username VARCHAR(100) NOT NULL,"
            + " body VARCHAR(500) NOT NULL,"
            + " created_at BIGINT NOT NULL,"
            + " INDEX idx_comments_spot (spot_id),"
            + " INDEX idx_comments_user (username)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS comment_votes ("
            + " comment_id INT NOT NULL,"
            + " username VARCHAR(100) NOT NULL,"
            + " vote TINYINT NOT NULL,"
            + " PRIMARY KEY (comment_id, username),"
            + " INDEX idx_comment_votes_user (username)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS ratings ("
            + " spot_id INT NOT NULL,"
            + " username VARCHAR(100) NOT NULL,"
            + " stars TINYINT NOT NULL,"
            + " PRIMARY KEY (spot_id, username),"
            + " INDEX idx_ratings_user (username)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS photos ("
            + " id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,"
            + " spot_id INT NOT NULL,"
            + " username VARCHAR(100) NOT NULL,"
            + " caption VARCHAR(100) NOT NULL DEFAULT '',"
            + " src MEDIUMTEXT NOT NULL,"
            + " created_at BIGINT NOT NULL,"
            + " INDEX idx_photos_spot (spot_id),"
            + " INDEX idx_photos_user (username)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
,

        "CREATE TABLE IF NOT EXISTS point_events ("
            + " id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,"
            + " username VARCHAR(100) NOT NULL,"
            + " points INT NOT NULL,"
            + " reason VARCHAR(30) NOT NULL DEFAULT '',"
            + " created_at BIGINT NOT NULL,"
            + " INDEX idx_point_events_user (username, created_at),"
            + " INDEX idx_point_events_time (created_at)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS user_badges ("
            + " username VARCHAR(100) NOT NULL,"
            + " badge_id VARCHAR(20) NOT NULL,"
            + " unlocked_at BIGINT NOT NULL,"
            + " PRIMARY KEY (username, badge_id)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    };

    private final String url;
    private final String serverUrl;   // same server without a database name; null when a full URL was given
    private final String dbName;
    private final String user;
    private final String password;

    private Db(String url, String serverUrl, String dbName, String user, String password) {
        this.url = url;
        this.serverUrl = serverUrl;
        this.dbName = dbName;
        this.user = user;
        this.password = password;
    }

    // True when there is a config/db.properties file or a DB_URL environment variable.
    public static boolean isConfigured() {
        String env = System.getenv("DB_URL");
        return Files.isRegularFile(CONFIG) || (env != null && !env.isBlank());
    }

    public static Db fromConfig() {
        Properties p = new Properties();
        if (Files.isRegularFile(CONFIG)) {
            try (InputStream in = Files.newInputStream(CONFIG);
                 InputStreamReader r = new InputStreamReader(in, StandardCharsets.UTF_8)) {
                p.load(r);
            } catch (IOException e) {
                throw new IllegalStateException("Could not read " + CONFIG + ": " + e.getMessage(), e);
            }
        }
        String fullUrl = env("DB_URL", p.getProperty("db.url", "")).trim();
        String user = env("DB_USER", p.getProperty("db.user", "root")).trim();
        String password = env("DB_PASSWORD", p.getProperty("db.password", ""));
        if (!fullUrl.isEmpty())
            return new Db(fullUrl, null, null, user, password);

        String host = p.getProperty("db.host", "localhost").trim();
        String port = p.getProperty("db.port", "3306").trim();
        String name = p.getProperty("db.name", "quietspot").trim();
        if (!name.matches("[A-Za-z0-9_]+"))
            throw new IllegalStateException("db.name may only contain letters, numbers and underscores.");
        String base = "jdbc:mysql://" + host + ":" + port + "/";
        return new Db(base + name + PARAMS, base + PARAMS, name, user, password);
    }

    private static String env(String key, String fallback) {
        String v = System.getenv(key);
        return v != null && !v.isBlank() ? v : fallback;
    }

    public Connection connect() throws SQLException {
        return DriverManager.getConnection(url, user, password);
    }

    // Creates the database (local setups only) and any missing tables. Safe to run on every start.
    public void init() throws SQLException {
        if (serverUrl != null) {
            try (Connection c = DriverManager.getConnection(serverUrl, user, password);
                 Statement st = c.createStatement()) {
                st.executeUpdate("CREATE DATABASE IF NOT EXISTS `" + dbName
                        + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            }
        }
        try (Connection c = connect(); Statement st = c.createStatement()) {
            for (String ddl : SCHEMA) st.executeUpdate(ddl);
        }
    }

    public String describe() {
        return dbName != null ? "MySQL database '" + dbName + "'" : "the MySQL database from DB_URL / db.url";
    }
}