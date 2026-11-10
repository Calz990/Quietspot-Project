//For testing purposes only not yet finalized

import model.*;
import service.AuthService;
import service.SpotRepository;
import java.util.List;

import exception.InvalidInputException;

public class Main {
    public static void main(String[] args) {
        SpotRepository repo = new SpotRepository();
        repo.loadDefaultSpots();

        System.out.println("All spots:");
        for (SpotArea s : repo.getAll()) {
            System.out.println("- " + s.getName() + " (" + s.getKind() + "): " + s.priceLabel());
        }

        System.out.println("\nQuiet spots with outlets:");
        List<SpotArea> quiet = repo.search(null, NoiseLevel.QUIET, null, null, true, false);
        for (SpotArea s : quiet) {
            System.out.println("- " + s.getName());
        }

        AuthService auth = new AuthService();
        try {
            auth.register("Charisse", "secret123", UserType.STUDENT);
            UserAccount me = auth.login("charisse", "secret123");
            System.out.println("\nLogged in: " + me.getUserName() + " (" + me.getPoints() + " points)");
            auth.login("charisse", "wrongpass"); // This should throw an exception
        } catch (InvalidInputException e) {
            System.out.println("Login failed: " + e.getMessage());
        }
    }
}