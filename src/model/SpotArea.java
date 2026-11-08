package model;

import java.util.ArrayList;
import java.util.List;

public abstract class SpotArea {
    private int id;
    private String name;
    private String address;
    private double x;
    private double y;
    private int[] hours;
    private double price;
    private int noise; // 1: Quiet, 2: Moderate, 3: Loud
    private int crowd; // 1: Low, 2: Medium, 3: High
    private String rules;
    private String description;
    private Facility facility;
    private long updatedAt;
    private boolean isNew;
    private List<ReportStatus> reports;

    public SpotArea(int id, String name, String address, double x, double y, int[] hours,
            double price, int noise, int crowd,
            Facility facility, String description, String rules) {
        this.id = id;
        this.name = name;
        this.address = address;
        this.x = x;
        this.y = y;
        this.hours = hours;
        this.price = price;
        this.noise = noise;
        this.crowd = crowd;
        this.facility = facility;
        this.description = description;
        this.rules = rules;
        this.updatedAt = System.currentTimeMillis();
        this.isNew = false;
        this.reports = new ArrayList<>();
    }

    public abstract String getKind();

    public abstract String priceLabel();

    public abstract String extraInfo();

    public void updateStatus(int noise, int crowd) {
        this.noise = noise;
        this.crowd = crowd;
        this.updatedAt = System.currentTimeMillis();
    }

    public int getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getAddress() {
        return address;
    }

    public double getX() {
        return x;
    }

    public double getY() {
        return y;
    }

    public int[] getHours() {
        return hours;
    }

    public double getPrice() {
        return price;
    }

    public int getNoise() {
        return noise;
    }

    public int getCrowd() {
        return crowd;
    }

    public String getRules() {
        return rules;
    }

    public String getDescription() {
        return description;
    }

    public Facility getFacility() {
        return facility;
    }

    public long getUpdatedAt() {
        return updatedAt;
    }

    public boolean isNew() {
        return isNew;
    }

    public void setNew(boolean isNew) {
        this.isNew = isNew;
    }

    public List<ReportStatus> getReports() {
        return reports;
    }
}