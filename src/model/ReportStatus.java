package model;

public class ReportStatus {
    private int id;
    private int spotId;
    private String user;
    private int noise;
    private int crowd;
    private String note;
    private long ts;
    private int up;
    private int down;

    public ReportStatus(int id, int spotId, String user, int noise, int crowd, String note) {
        this.id = id;
        this.spotId = spotId;
        this.user = user;
        this.noise = noise;
        this.crowd = crowd;
        this.note = note;
        this.ts = System.currentTimeMillis();
        this.up = 0;
        this.down = 0;
    }

    public int getNet() {
        return up - down;
    }

    public void upvote() { this.up++; }
    public void downvote() { this.down++; }

    public int getId() { return id; }
    public int getSpotId() { return spotId; }
    public String getUser() { return user; }
    public int getNoise() { return noise; }
    public int getCrowd() { return crowd; }
    public String getNote() { return note; }
    public long getTs() { return ts; }
    public int getUp() { return up; }
    public int getDown() { return down; }
}