package service;

import model.*;
import java.util.ArrayList;
import java.util.List;

public class SpotRepository {
    private final List<SpotArea> spots = new ArrayList<>();
    private int nextId = 1;

    public int nextId() {
        return nextId++;
    }

    public void addSpot(SpotArea spot) {
        if (spot == null) throw new IllegalArgumentException("Spot cannot be null");
        spots.add(spot);
    }

    public List<SpotArea> getAll() {
        return new ArrayList<>(spots); // copy, so outside code can't change the list
    }

    public SpotArea findById(int id) {
        for (SpotArea s : spots) {
            if (s.getId() == id) return s;
        }
        return null;
    }

    // Any filter can be null (or false) to mean "don't filter on this"
    public List<SpotArea> search(String text, NoiseLevel maxNoise, CrowdLevel maxCrowd,
                                 Double maxPrice, boolean needOutlets, boolean needWifi) {
        List<SpotArea> results = new ArrayList<>();
        for (SpotArea s : spots) {
            if (text != null && !text.isBlank()
                    && !s.getName().toLowerCase().contains(text.toLowerCase())
                    && !s.getKind().toLowerCase().contains(text.toLowerCase())) continue;
            if (maxNoise != null && s.getNoise().compareTo(maxNoise) > 0) continue;
            if (maxCrowd != null && s.getCrowd().compareTo(maxCrowd) > 0) continue;
            if (maxPrice != null && s.getPrice() > maxPrice) continue;
            if (needOutlets && !s.getFacility().isOutlets()) continue;
            if (needWifi && !s.getFacility().isWifi()) continue;
            results.add(s);
        }
        return results;
    }

    public void loadDefaultSpots() {
        addSpot(new Library(nextId(), "Hall of Books Library", "Near campus main gate", 36, 28,
                new int[] { 8, 19 }, 0, NoiseLevel.QUIET, CrowdLevel.MEDIUM,
                new Facility(true, 15, true, true, false),
                "Air-conditioned reading hall.", "Silence policy."));
        addSpot(new Cafe(nextId(), "Kape Tahimik Café", "Corner of main road", 62, 36,
                new int[] { 9, 22 }, 120, NoiseLevel.MODERATE, CrowdLevel.HIGH,
                new Facility(true, 30, true, true, true),
                "Cozy café with outlets.", "Order at least one item."));
    }
}