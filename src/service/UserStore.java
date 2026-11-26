package service;

import exception.InvalidInputException;
import model.UserAccount;
import model.UserProfile;
import model.UserType;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/**
 * Saves accounts (and their profiles) to a plain tab-separated file, data/users.tsv, so they are
 * still there after the server restarts. Each save writes a temp file first and then replaces the
 * real one, so a crash in the middle can never leave a half-written file.
 */
public class UserStore {
    private static final int COLUMNS = 21;
    private final Path file;

    public UserStore(Path file) {
        this.file = file;
    }

    public List<UserAccount> load() {
        List<UserAccount> out = new ArrayList<>();
        if (!Files.isRegularFile(file)) return out;
        try {
            for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                if (line.isBlank() || line.startsWith("#")) continue;
                String[] c = line.split("\t", -1);
                if (c.length != COLUMNS) {
                    System.err.println("users file: skipped a line with " + c.length + " columns");
                    continue;
                }
                try {
                    out.add(fromColumns(c));
                } catch (RuntimeException e) {
                    System.err.println("users file: skipped a bad record (" + e.getMessage() + ")");
                }
            }
        } catch (IOException e) {
            System.err.println("Could not read " + file + ": " + e.getMessage());
        }
        return out;
    }

    public void save(Collection<UserAccount> users) {
        StringBuilder sb = new StringBuilder("# QuietSpot accounts. Do not share this file: it holds password hashes.\n");
        for (UserAccount u : users) {
            UserProfile p = u.getProfile();
            String[] c = {
                u.getUserName(), u.getUserType().name(), u.getPasswordHash(), String.valueOf(u.getPoints()),
                String.valueOf(u.getReportsMade()), String.valueOf(u.getSpotsAdded()), String.valueOf(u.getPhotosAdded()),
                nz(u.getEmail()), nz(u.getCreatedAt()), joinInts(u.getFavoriteSpots()),
                nz(p.getFullName()), p.getBio(), p.getSchool(), p.getCourse(), p.getYearLevel(), p.getLocation(),
                p.getBirthday(), String.join(",", p.getInterests()), String.join(",", p.getStudyPrefs()),
                p.getAvatar(), String.valueOf(p.isSetupDone())
            };
            for (int i = 0; i < c.length; i++) {
                if (i > 0) sb.append('\t');
                sb.append(escape(c[i]));
            }
            sb.append('\n');
        }
        try {
            Path dir = file.toAbsolutePath().getParent();
            if (dir != null) Files.createDirectories(dir);
            Path tmp = Files.createTempFile(dir, "users", ".tmp");
            Files.writeString(tmp, sb.toString(), StandardCharsets.UTF_8);
            try {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            System.err.println("Could not save accounts to " + file + ": " + e.getMessage());
        }
    }

    private static UserAccount fromColumns(String[] raw) {
        String[] c = new String[raw.length];
        for (int i = 0; i < raw.length; i++) c[i] = unescape(raw[i]);
        Set<Integer> favs = new HashSet<>();
        for (String f : c[9].split(",")) if (!f.isBlank()) favs.add(Integer.parseInt(f.trim()));
        UserAccount u = UserAccount.restore(c[0], UserType.valueOf(c[1]), c[2], Integer.parseInt(c[3]),
                Integer.parseInt(c[4]), Integer.parseInt(c[5]), Integer.parseInt(c[6]), c[7].isEmpty() ? null : c[7],
                c[8], favs);
        // Profile fields go back in through the profile's own validation, one at a time, so one bad value can't lose the rest.
        String[] keys = {"fullName", "bio", "school", "course", "yearLevel", "location", "birthday", "interests", "studyPrefs", "avatar"};
        for (int i = 0; i < keys.length; i++) {
            String v = c[10 + i];
            if (v.isEmpty()) continue;
            try {
                u.getProfile().update(Map.of(keys[i], v));
            } catch (InvalidInputException e) {
                System.err.println("users file: ignored " + keys[i] + " of " + c[0] + " (" + e.getMessage() + ")");
            }
        }
        if (Boolean.parseBoolean(c[20])) u.getProfile().markSetupDone();
        return u;
    }

    private static String joinInts(Set<Integer> s) {
        StringJoiner j = new StringJoiner(",");
        for (int i : s) j.add(String.valueOf(i));
        return j.toString();
    }

    private static String nz(String s) { return s == null ? "" : s; }

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r");
    }

    private static String unescape(String s) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch == '\\' && i + 1 < s.length()) {
                char n = s.charAt(++i);
                sb.append(n == 't' ? '\t' : n == 'n' ? '\n' : n == 'r' ? '\r' : n);
            } else {
                sb.append(ch);
            }
        }
        return sb.toString();
    }
}