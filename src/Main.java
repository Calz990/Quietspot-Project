import model.*;
import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<SpotArea> spots = new ArrayList<>();

        Facility libFac = new Facility(true, 15, true, true, false);
        Library lib = new Library(
                1, "Hall of Books Library", "Near campus main gate", 36, 28,
                new int[] { 8, 19 }, 0, NoiseLevel.QUIET, CrowdLevel.MEDIUM, libFac,
                "Air-conditioned reading hall.", "Silence policy.");

        Facility cafeFac = new Facility(true, 30, true, true, true);
        Cafe cafe = new Cafe(
                2, "Kape Tahimik Café", "Corner of main road", 62, 36,
                new int[] { 9, 22 }, 120, NoiseLevel.MODERATE, CrowdLevel.HIGH, cafeFac,
                "Cozy café with outlets.", "Order at least one item.");

        spots.add(lib);
        spots.add(cafe);

        UserAccount user = new UserAccount("Charisse", "Student");
        user.toggleFavorite(lib.getId());

        System.out.println("QuietSpot Java Backend Initialized!");
        for (SpotArea spot : spots) {
            System.out.println("- " + spot.getName() + " (" + spot.getKind() + "): " + spot.priceLabel() + " ["
                    + spot.getNoise() + " Noise]");
        }
    }
}