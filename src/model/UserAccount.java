package model;

import java.util.HashSet;
import java.util.Set;

public class UserAccount {
    private String userName;
    private String userType;
    private int points;
    private Set<Integer> favoriteSpots;
    private int reportsMade;
    private int spotsAdded;
    private int photosAdded;

    // Constructor Overloading: Default User
    public UserAccount(String userName) {
        this(userName, "Student");
    }

    // Parameterized Constructor
    public UserAccount(String userName, String userType) {
        this.userName = userName;
        this.userType = userType;
        this.points = 20;
        this.favoriteSpots = new HashSet<>();
        this.reportsMade = 0;
        this.spotsAdded = 0;
        this.photosAdded = 0;
    }

    public boolean toggleFavorite(int spotId) {
        if (favoriteSpots.contains(spotId)) {
            favoriteSpots.remove(spotId);
            return false;
        }
        favoriteSpots.add(spotId);
        return true;
    }

    public void addPoints(int pts) {
        this.points += pts;
    }

    public String getUserName() { return userName; }
    public void setUserName(String userName) { this.userName = userName; }

    public String getUserType() { return userType; }
    public void setUserType(String userType) { this.userType = userType; }

    public int getPoints() { return points; }
    public Set<Integer> getFavoriteSpots() { return favoriteSpots; }

    public int getReportsMade() { return reportsMade; }
    public void incrementReports() { this.reportsMade++; }

    public int getSpotsAdded() { return spotsAdded; }
    public void incrementSpotsAdded() { this.spotsAdded++; }

    public int getPhotosAdded() { return photosAdded; }
    public void incrementPhotosAdded() { this.photosAdded++; }
}