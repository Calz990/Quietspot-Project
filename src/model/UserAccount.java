package model;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

public class UserAccount {
    private static final int INITIAL_POINTS = 20;
    private static final int POINTS_PER_REPORT = 5;

    private String userName;
    private UserType userType;
    private String passwordHash;
    private int points;
    private Set<Integer> favoriteSpots;
    private int reportsMade;
    private int spotsAdded;
    private int photosAdded;

    // Constructor Overloading: Default User
    public UserAccount(String userName, String password) {
        this(userName, password, UserType.STUDENT);
    }

    // Parameterized Constructor
    public UserAccount(String userName, String password, UserType userType){
        this.userName = userName;
        this.userType = userType;
        this.passwordHash = hash(password);
        this.points = INITIAL_POINTS;
        this.favoriteSpots = new HashSet<>();
    }

    public boolean checkPassword(String password) {
        return this.passwordHash.equals(hash(password));
    }

    private String hash(String password) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] Bytes = digest.digest(password.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : Bytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        }
        
        catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    public boolean toggleFavorite(int spotId) {
        if (favoriteSpots.contains(spotId)) {
            favoriteSpots.remove(spotId);
            return false; // Removed from favorites
        } else {
            favoriteSpots.add(spotId);
            return true; // Added to favorites
        }
    }
    
    public void addPoints(int pts) {
        this.points += pts;
    }

    // Reports and points always go together
    public void recordReport() {
        reportsMade++;
        addPoints(POINTS_PER_REPORT);
    }

    public String getUserName() { return userName; }
    public void setUserName(String userName) { this.userName = userName; }

    public UserType getUserType() { return userType; }
    public void setUserType(UserType userType) { this.userType = userType; }

    public int getPoints() { return points; }
    public Set<Integer> getFavoriteSpots() { return favoriteSpots; }

    public int getReportsMade() { return reportsMade; }
    public void incrementReports() { this.reportsMade++; }

    public int getSpotsAdded() { return spotsAdded; }
    public void incrementSpotsAdded() { this.spotsAdded++; }

    public int getPhotosAdded() { return photosAdded; }
    public void incrementPhotosAdded() { this.photosAdded++; }
}