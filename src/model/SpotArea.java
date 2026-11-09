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
    private NoiseLevel noise;
    private CrowdLevel crowd;
    private String rules;
    private String description;
    private Facility facility;
    private long updatedAt;
    private boolean isNew;
    private List<ReportStatus> reports;

    public SpotArea(int id, String name, String address, double x, double y, int[] hours, 
                    double price, NoiseLevel noise, CrowdLevel crowd, 
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

    public void updateStatus(NoiseLevel noise, CrowdLevel crowd) {
        this.noise = noise;
        this.crowd = crowd;
        this.updatedAt = System.currentTimeMillis();
    }

    // Getters & Setters
    public int getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public double getX() { return x; }
    public double getY() { return y; }

    public int[] getHours() { return hours; }
    public void setHours(int[] hours) { this.hours = hours; }

    public double getPrice() { return price; }
    public void setPrice(double price) { this.price = price; }

    public NoiseLevel getNoise() { return noise; }
    public void setNoise(NoiseLevel noise) { this.noise = noise; }

    public CrowdLevel getCrowd() { return crowd; }
    public void setCrowd(CrowdLevel crowd) { this.crowd = crowd; }

    public String getRules() { return rules; }
    public void setRules(String rules) { this.rules = rules; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Facility getFacility() { return facility; }
    public void setFacility(Facility facility) { this.facility = facility; }

    public long getUpdatedAt() { return updatedAt; }

    public boolean isNew() { return isNew; }
    public void setNew(boolean isNew) { this.isNew = isNew; }

    public List<ReportStatus> getReports() { return reports; }
}
