package service;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.SQLException;

/**
 * Picks where accounts, spots and (MySQL only) the shared reports, comments, ratings and photos are saved.
 *  - config/db.properties exists (or DB_URL is set): MySQL. If MySQL cannot be reached the server stops with a
 *    clear message, so data is never saved somewhere you did not expect.
 *  - no config: the old data/users.tsv and data/spots.tsv files, exactly as before.
 * The first time MySQL is used and its tables are empty, the existing .tsv data is copied in (the files stay as a backup).
 */
public final class Storage {
    private static Db db;
    private static boolean tried;

    private Storage() { }

    private static synchronized Db db() {
        if (!tried) {
            tried = true;
            if (Db.isConfigured()) {
                try {
                    db = Db.fromConfig();
                    db.init();
                    System.out.println("Saving accounts and spots to " + db.describe() + ".");
                } catch (SQLException | IllegalStateException e) {
                    fail(e);
                }
            } else {
                System.out.println("No config/db.properties found: saving to the data/*.tsv files.");
            }
        }
        return db;
    }

    public static UserStorage users() {
        Path tsv = Paths.get("data", "users.tsv");
        Db d = db();
        if (d == null) return new UserStore(tsv);
        MySqlUserStore store = new MySqlUserStore(d);
        store.importIfEmpty(new UserStore(tsv));
        return store;
    }

    public static SpotStorage spots() {
        Path tsv = Paths.get("data", "spots.tsv");
        Db d = db();
        if (d == null) return new SpotStore(tsv);
        MySqlSpotStore store = new MySqlSpotStore(d);
        store.importIfEmpty(new SpotStore(tsv));
        return store;
    }

    // Reports, comments, votes, ratings and photos. They live only in MySQL, so this is null when no database is set up.
    public static SocialStore social() {
        Db d = db();
        return d == null ? null : new SocialStore(d);
    }

    // Points history, streaks, weekly leaderboard and badges. MySQL only, so this is null when no database is set up.
    public static GameStore game() {
        Db d = db();
        return d == null ? null : new GameStore(d);
    }

    private static void fail(Exception e) {
        System.err.println();
        System.err.println("Could not start the database: " + e.getMessage());
        if (String.valueOf(e.getMessage()).contains("No suitable driver"))
            System.err.println("-> The MySQL driver is missing. Put mysql-connector-j-x.y.z.jar in the lib/ folder and reload the Java project.");
        else
            System.err.println("-> Check that MySQL is running and that the host, port, user and password in config/db.properties are right.");
        System.err.println("   (Delete config/db.properties to go back to saving in the data/*.tsv files.)");
        System.exit(1);
    }
}