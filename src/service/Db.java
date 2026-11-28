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
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Properties;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;


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

    // ---- Connection pool -------------------------------------------------------------------------------------
    // Opening a MySQL connection (especially to a hosted database over TLS) is far slower than running a query.
    // So connections are kept open and reused: connect() hands out an idle one, and close() on it (including the
    // try-with-resources used all over the stores) puts it back instead of closing it. No other file needs to change.
    
    private static final int DEFAULT_POOL_SIZE = 8;          // override with db.poolSize in config/db.properties
    private static final long CHECK_IF_IDLE_MS = 20_000;     // test a connection that sat unused longer than this
    private static final long MAX_LIFETIME_MS = 5 * 60_000;  // replace connections older than this
    private static final long WAIT_MS = 15_000;              // how long a request waits when all connections are busy

    private final int poolSize;
    private final Semaphore permits;
    private final ConcurrentLinkedDeque<Pooled> idle = new ConcurrentLinkedDeque<>();

    private static final class Pooled {
        final Connection real;
        final long created = System.currentTimeMillis();
        volatile long lastUsed = created;
        volatile boolean broken;   // a network-level error happened; do not reuse
        volatile boolean dirty;    // a transaction may be open
        Pooled(Connection real) { this.real = real; }
    }

    private final String url;
    private final String serverUrl;   // same server without a database name; null when a full URL was given
    private final String dbName;
    private final String user;
    private final String password;

    private Db(String url, String serverUrl, String dbName, String user, String password, int poolSize) {
        this.poolSize = poolSize;
        this.permits = new Semaphore(poolSize);
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
            return new Db(fullUrl, null, null, user, password, poolSize(p));

        String host = p.getProperty("db.host", "localhost").trim();
        String port = p.getProperty("db.port", "3306").trim();
        String name = p.getProperty("db.name", "quietspot").trim();
        if (!name.matches("[A-Za-z0-9_]+"))
            throw new IllegalStateException("db.name may only contain letters, numbers and underscores.");
        String base = "jdbc:mysql://" + host + ":" + port + "/";
        return new Db(base + name + PARAMS, base + PARAMS, name, user, password, poolSize(p));
    }

    private static int poolSize(Properties p) {
        try {
            int n = Integer.parseInt(p.getProperty("db.poolSize", String.valueOf(DEFAULT_POOL_SIZE)).trim());
            return Math.max(1, Math.min(n, 30));
        } catch (NumberFormatException e) {
            return DEFAULT_POOL_SIZE;
        }
    }

    private static String env(String key, String fallback) {
        String v = System.getenv(key);
        return v != null && !v.isBlank() ? v : fallback;
    }

    // Gives out a pooled connection. Use it exactly as before: try (Connection c = db.connect()) { ... }
    public Connection connect() throws SQLException {
        try {
            if (!permits.tryAcquire(WAIT_MS, TimeUnit.MILLISECONDS))
                throw new SQLException("No free database connection (all " + poolSize + " are busy).");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new SQLException("Interrupted while waiting for a database connection.", e);
        }
        try {
            Pooled p = takeIdle();
            if (p == null) p = new Pooled(DriverManager.getConnection(url, user, password));
            return wrap(p);
        } catch (SQLException | RuntimeException e) {
            permits.release();
            throw e;
        }
    }

    // Most recently used idle connection that is still healthy, or null when there is none.
    private Pooled takeIdle() {
        Pooled p;
        while ((p = idle.pollFirst()) != null) {
            long now = System.currentTimeMillis();
            boolean tooOld = now - p.created > MAX_LIFETIME_MS;
            boolean needsCheck = now - p.lastUsed > CHECK_IF_IDLE_MS;
            if (!tooOld && (!needsCheck || isValid(p.real))) return p;
            closeQuietly(p.real);
        }
        return null;
    }

    private static boolean isValid(Connection c) {
        try { return c.isValid(3); } catch (SQLException e) { return false; }
    }

    private static void closeQuietly(Connection c) {
        try { c.close(); } catch (SQLException ignored) { }
    }

    private Connection wrap(Pooled p) {
        return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(),
                new Class<?>[] { Connection.class }, new Lease(p));
    }

    // What the caller holds: behaves like the real connection, except close() returns it to the pool.
    private final class Lease implements InvocationHandler {
        private final Pooled p;
        private final AtomicBoolean returned = new AtomicBoolean(false);

        Lease(Pooled p) { this.p = p; }

        @Override
        public Object invoke(Object proxy, Method m, Object[] args) throws Throwable {
            String name = m.getName();
            if (m.getDeclaringClass() == Object.class) {
                if (name.equals("equals")) return proxy == args[0];
                if (name.equals("hashCode")) return System.identityHashCode(proxy);
                return "PooledConnection[" + p.real + "]";
            }
            if (name.equals("close") && m.getParameterCount() == 0) { giveBack(); return null; }
            if (name.equals("isClosed")) return returned.get() || p.real.isClosed();
            if (returned.get()) throw new SQLException("Connection is closed.");
            try {
                Object result = m.invoke(p.real, args);
                trackTransaction(name, args);
                return result;
            } catch (InvocationTargetException e) {
                Throwable t = e.getCause();
                if (t instanceof SQLException) {
                    String state = ((SQLException) t).getSQLState();
                    if (state != null && state.startsWith("08")) p.broken = true;   // lost connection
                }
                throw t;
            }
        }

        private void trackTransaction(String name, Object[] args) {
            switch (name) {
                case "setAutoCommit":
                    if (args != null && args.length == 1 && Boolean.FALSE.equals(args[0])) p.dirty = true;
                    break;
                case "commit":
                case "rollback":
                    p.dirty = false;
                    break;
                case "createStatement":
                case "prepareStatement":
                case "prepareCall":
                    try { if (!p.real.getAutoCommit()) p.dirty = true; } catch (SQLException ignored) { }
                    break;
                default:
            }
        }

        private void giveBack() {
            if (!returned.compareAndSet(false, true)) return;   // closing twice is harmless
            try {
                boolean reusable = !p.broken && !p.real.isClosed();
                if (reusable) {
                    try {
                        if (!p.real.getAutoCommit()) {
                            if (p.dirty) p.real.rollback();     // never leak half-finished work to the next user
                            p.real.setAutoCommit(true);
                        }
                        p.dirty = false;
                    } catch (SQLException e) {
                        reusable = false;
                    }
                }
                if (reusable) {
                    p.lastUsed = System.currentTimeMillis();
                    idle.addFirst(p);
                } else {
                    closeQuietly(p.real);
                }
            } catch (SQLException e) {
                closeQuietly(p.real);
            } finally {
                permits.release();
            }
        }
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