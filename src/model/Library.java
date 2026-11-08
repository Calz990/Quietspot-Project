package model;

public class Library extends SpotArea {
    public Library(int id, String name, String address, double x, double y, int[] hours,
            double price, int noise, int crowd,
            Facility facility, String description, String rules) {
        super(id, name, address, x, y, hours, price, noise, crowd, facility, description, rules);
    }

    @Override
    public String getKind() {
        return "Library";
    }

    @Override
    public String priceLabel() {
        return getPrice() == 0 ? "Free" : "₱" + (int) getPrice();
    }

    @Override
    public String extraInfo() {
        return "Silence policy applies.";
    }
}
