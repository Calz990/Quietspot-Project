package service;

import model.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.ArrayList;
import java.util.List;

/**
 * Saves the spots that students added (not the built-in ones) to data/spots.tsv, so they are
 * still there after the server restarts and can be deleted for real. Same temp-file-then-replace
 * saving as UserStore.
 */
public class SpotStore {
    private static final int COLUMNS = 19;
    private final Path file;

    public SpotStore(Path file) {
        this.file = file;
    }

    public List<SpotArea> load() {
        List<SpotArea> out = new ArrayList<>();
        if (!Files.isRegularFile(file)) return out;
        try {
            for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                if (line.isBlank() || line.startsWith("#")) continue;
                String[] c = line.split("\t", -1);
                if (c.length != COLUMNS) {
                    System.err.println("spots file: skipped a line with " + c.length + " columns");
                    continue;
                }
                try {
                    out.add(fromColumns(c));
                } catch (RuntimeException e) {
                    System.err.println("spots file: skipped a bad record (" + e.getMessage() + ")");
                }
            }
        } catch (IOException e) {
            System.err.println("Could not read " + file + ": " + e.getMessage());
        }
        return out;
    }

    public void save(List<SpotArea> spots) {
        StringBuilder sb = new StringBuilder("# QuietSpot: spots added by students\n");
        for (SpotArea s : spots) {
            if (s.getCreatedBy().isEmpty()) continue;   // built-in spots are created by the server itself
            Facility f = s.getFacility();
            String[] c = {
                String.valueOf(s.getId()), s.getClass().getSimpleName(), s.getName(), s.getAddress(),
                String.valueOf(s.getX()), String.valueOf(s.getY()),
                String.valueOf(s.getHours()[0]), String.valueOf(s.getHours()[1]), String.valueOf(s.getPrice()),
                String.valueOf(s.getNoise().ordinal()), String.valueOf(s.getCrowd().ordinal()),
                String.valueOf(f.isWifi()), String.valueOf(f.getMbps()), String.valueOf(f.isOutlets()),
                String.valueOf(f.isAircon()), String.valueOf(f.isFood()),
                nz(s.getDescription()), nz(s.getRules()), s.getCreatedBy()
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
            Path tmp = Files.createTempFile(dir, "spots", ".tmp");
            Files.writeString(tmp, sb.toString(), StandardCharsets.UTF_8);
            try {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            System.err.println("Could not save spots to " + file + ": " + e.getMessage());
        }
    }

    private static SpotArea fromColumns(String[] raw) {
        String[] c = new String[raw.length];
        for (int i = 0; i < raw.length; i++) c[i] = unescape(raw[i]);
        int id = Integer.parseInt(c[0]);
        int[] hours = {Integer.parseInt(c[6]), Integer.parseInt(c[7])};
        double price = Double.parseDouble(c[8]);
        NoiseLevel noise = NoiseLevel.values()[Integer.parseInt(c[9])];
        CrowdLevel crowd = CrowdLevel.values()[Integer.parseInt(c[10])];
        Facility fac = new Facility(Boolean.parseBoolean(c[11]), Integer.parseInt(c[12]),
                Boolean.parseBoolean(c[13]), Boolean.parseBoolean(c[14]), Boolean.parseBoolean(c[15]));
        double x = Double.parseDouble(c[4]), y = Double.parseDouble(c[5]);
        SpotArea s = switch (c[1]) {
            case "Library" -> new Library(id, c[2], c[3], x, y, hours, price, noise, crowd, fac, c[16], c[17]);
            case "StudyRoom" -> new StudyRoom(id, c[2], c[3], x, y, hours, price, noise, crowd, fac, c[16], c[17]);
            case "CoworkingSpace" -> new CoworkingSpace(id, c[2], c[3], x, y, hours, price, noise, crowd, fac, c[16], c[17]);
            default -> new Cafe(id, c[2], c[3], x, y, hours, price, noise, crowd, fac, c[16], c[17]);
        };
        s.setCreatedBy(c[18]);
        return s;
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