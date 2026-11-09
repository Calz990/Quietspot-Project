package model;

public class StudyRoom extends SpotArea {
    public StudyRoom(int id, String name, String address, double x, double y, int[] hours,
            double price, NoiseLevel noise, CrowdLevel crowd,
            Facility facility, String description, String rules) {
        super(id, name, address, x, y, hours, price, noise, crowd, facility, description, rules);
    }

    @Override
    public String getKind() {
        return "Study room";
    }

    @Override
    public String priceLabel() {
        return getPrice() == 0 ? "Free" : "₱" + (int) getPrice() + " per hour";
    }

    @Override
    public String extraInfo() {
        return "Room-based seating.";
    }
}