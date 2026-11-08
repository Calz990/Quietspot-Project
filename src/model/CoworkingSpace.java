package model;

public class CoworkingSpace extends SpotArea {
    public CoworkingSpace(int id, String name, String address, double x, double y, int[] hours, 
                          double price, int noise, int crowd, 
                          Facility facility, String description, String rules) {
        super(id, name, address, x, y, hours, price, noise, crowd, facility, description, rules);
    }

    @Override
    public String getKind() { return "Co-working space"; }

    @Override
    public String priceLabel() {
        return getPrice() == 0 ? "Free" : "₱" + (int)getPrice() + " per hour";
    }

    @Override
    public String extraInfo() { return "Day and hourly passes may be offered."; }
}
