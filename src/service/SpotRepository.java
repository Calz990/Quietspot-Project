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
        if (spot == null) 
            throw new IllegalArgumentException("Spot cannot be null");
        spots.add(spot);
    }

    public List<SpotArea> getAll() {
        return new ArrayList<>(spots); // return a copy
    }

    public SpotArea findById(int id) {
        for (SpotArea s : spots) {
            if (s.getId() == id) 
                return s;
        }
        return null;
    }

    // Any filter can be null (or false) to mean "don't filter on this"
    public List<SpotArea> search(
        String text, 
        NoiseLevel maxNoise, 
        CrowdLevel maxCrowd, 
        Double maxPrice, 
        boolean needOutlets, 
        boolean needWifi
    ) {
        List<SpotArea> results = new ArrayList<>();
        for (SpotArea s : spots) {
            if (text != null && !text.isBlank() && !s.getName().toLowerCase().contains(text.toLowerCase()) && !s.getKind().toLowerCase().contains(text.toLowerCase())) 
                continue;
            if (maxNoise != null && s.getNoise().compareTo(maxNoise) > 0) 
                continue;
            if (maxCrowd != null && s.getCrowd().compareTo(maxCrowd) > 0) 
                continue;
            if (maxPrice != null && s.getPrice() > maxPrice) 
                continue;
            if (needOutlets && !s.getFacility().isOutlets()) 
                continue;
            if (needWifi && !s.getFacility().isWifi()) 
                continue;
            results.add(s);
        }
        return results;
    }

    public void loadDefaultSpots() {
        // 1.Libro Espresso
        addspot(
            new Cafe(
                nextID(),
                "Libro Espresso",
                "Gulod Labac, Batangas City", 
                82, 56, 
                new int[] {
                    11, 21
                }, 
                150, 
                NoiseLevel.MODERATE, 
                CrowdLevel.MEDIUM, 
                new Facility(
                    true, 
                    20, 
                    true, 
                    true, 
                    true
                ), 
                "A book-themed café with comfortable tables, coffee, and meals. A relaxed place to read or work on laptop tasks, and calmer on weekday mornings.", 
                "Order at least one item. Keep calls short."
            )
        );

        // 2.But First, Coffee
        addspot(
            new Cafe(
                nextId(),
                "But First, Coffee",
                "Alangilan, Batangas City",
                62, 36,
                new int[]{
                    9, 21
                },
                100,
                NoiseLevel.MODERATE,
                CrowdLevel.HIGH,
                new Facility(
                    true, 
                    15, 
                    true, 
                    true, 
                    true
                ),
                "A popular coffee shop in Alangilan that students visit after class. It fills up in the late afternoon, so go earlier if you need a seat.",
                "Order at least one item."
            )
        );

        // 3.BSU Student Area
        addspot(
            new StudyRoom(
                nextId(),
                "BSU Student Area",
                "BatStateU Alangilan Campus, Golden Country Home",
                36, 28,
                new int[]{
                    7, 19
                },
                0,
                NoiseLevel.MODERATE,
                CrowdLevel.MEDIUM,
                new Facility(
                    true,
                    10,
                    true,
                    false,
                    false
                ),
                "An open student area on campus with free seating for group work and review between classes. It can get noisy when classes break.",
                "Keep noise down. Clean up after use."
            ),
        );

        // 4.BSU Library
        addspot(
            new Library(
                nextId(),
                "BSU Library",
                "2/F College of Engineering Building, BatStateU-Alangilan, Golden Country Homes",
                44, 20,
                new int[]{
                    7, 19
                },
                0,
                Noicelevel.MODERATE,
                CrowdLevel.LOW,
                new Facility(
                    true,
                    20,
                    true,
                    true,
                    false
                ),
                "The campus library on the second floor of the College of Engineering Building. Quiet reading areas and shared tables, good for deep focus and exam review.",
                "Silence. No calls. Food and drinks are not allowed."
            )
        );

        //5.Batangas City Public Library
        addSpot(
            new Library(
                nextId(),
                "Batangas City Public Library and Information Center",
                "City Library Building, City Hall Complex, P. Burgos Street, Batangas City",
                18, 54,
                new int[]{
                    8, 17
                },
                0,
                Noicelevel.MODERATE,
                CrowdLevel.LOW,
                new Facility(
                    true,
                    10,
                    true,
                    true,
                    false
                ),
                "The city public library with a reading area open to everyone. A calm choice for reading and review, and usually less crowded than the campus spots.",
                "Silence. Food and drinks are not allowed."
            )
        );
    }
}