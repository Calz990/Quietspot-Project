package model;

public class Facility {
    private boolean wifi;
    private int mbps;
    private boolean outlets;
    private boolean aircon;
    private boolean food;

    // Default Constructor (Constructor Chaining)
    public Facility() {
        this(false, 0, false, false, false);
    }

    // Parameterized Constructor
    public Facility(boolean wifi, int mbps, boolean outlets, boolean aircon, boolean food) {
        this.wifi = wifi;
        this.mbps = mbps;
        this.outlets = outlets;
        this.aircon = aircon;
        this.food = food;
    }

    // Getters & Setters
    public boolean isWifi() {
        return wifi;
    }

    public void setWifi(boolean wifi) {
        this.wifi = wifi;
    }

    public int getMbps() {
        return mbps;
    }

    public void setMbps(int mbps) {
        this.mbps = mbps;
    }

    public boolean isOutlets() {
        return outlets;
    }

    public void setOutlets(boolean outlets) {
        this.outlets = outlets;
    }

    public boolean isAircon() {
        return aircon;
    }

    public void setAircon(boolean aircon) {
        this.aircon = aircon;
    }

    public boolean isFood() {
        return food;
    }

    public void setFood(boolean food) {
        this.food = food;
    }
}