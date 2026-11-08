package model;

public class Cafe extends SpotArea {
    public Cafe(int id, String name, String address, double x, double y, int[] hours,
            double price, int noise, int crowd,
            Facility facility, String description, String rules) {
        super(id, name, address, x, y, hours, price, noise, crowd, facility, description, rules);
    }

    @Override
    public String getKind() {
        return "Café";
    }

    @Override
    public String priceLabel() {
        return getPrice() == 0 ? "No minimum" : "₱" + (int) getPrice() + " min. purchase";
    }

    @Override
    public String extraInfo() {
        return "Purchase expected while seated.";
    }
}
