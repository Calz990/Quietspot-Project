package model;

public class Facility {
    private boolean wifi;
    private int mbps;
    private boolean outlets;
    private boolean aircon;
    private boolean food;

    public Facility(boolean wifi, int mbps, boolean outlets, boolean aircon, boolean food) {
        this.wifi = wifi;
        this.mbps = mbps;
        this.outlets = outlets;
        this.aircon = aircon;
        this.food = food;
    }

    public boolean isWifi() { return wifi; }
    public int getMbps() { return mbps; }
    public boolean isOutlets() { return outlets; }
    public boolean isAircon() { return aircon; }
    public boolean isFood() { return food; }
}
