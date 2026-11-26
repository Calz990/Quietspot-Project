package model;

import exception.InvalidInputException;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

// The public-facing profile of a UserAccount (like a Facebook profile):
// name, photos, bio, school details, study preferences and interests.

// Encapsulation: every field is private. The only way to change them is
// update(), which validates everything first and applies it only if ALL
// values are valid (so a bad value never leaves a half-saved profile).

public class UserProfile {
    public static final int MAX_NAME = 60;
    public static final int MAX_BIO = 150;
    public static final int MAX_FIELD = 60;
    public static final int MAX_INTERESTS = 8;
    public static final int MAX_INTEREST_LENGTH = 24;
    private static final int MAX_AVATAR_CHARS = 150_000;   // base64 text, about 110 KB image

    // Study preferences the student can pick (same keys as the Reco page needs).
    public static final List<String> PREF_KEYS =
            List.of("quiet", "outlets", "wifi", "aircon", "cheap", "late");

    private String fullName;
    private String bio = "";
    private String school = "";
    private String course = "";
    private String yearLevel = "";
    private String location = "";
    private String birthday = "";                           // yyyy-MM-dd or empty
    private List<String> interests = new ArrayList<>();
    private List<String> studyPrefs = new ArrayList<>();
    private String avatar = "";                             // data:image/...;base64,... or empty
    private boolean setupDone = false;                      // finished (or skipped) the setup after sign up

    public UserProfile(String fullName) {
        this.fullName = (fullName == null || fullName.isBlank()) ? "" : clean(fullName);
    }

    // getters
    public String getFullName() { return fullName; }
    public String getBio() { return bio; }
    public String getSchool() { return school; }
    public String getCourse() { return course; }
    public String getYearLevel() { return yearLevel; }
    public String getLocation() { return location; }
    public String getBirthday() { return birthday; }
    public List<String> getInterests() { return List.copyOf(interests); }
    public List<String> getStudyPrefs() { return List.copyOf(studyPrefs); }
    public String getAvatar() { return avatar; }
    public boolean isSetupDone() { return setupDone; }
    public void markSetupDone() { this.setupDone = true; }

    // Applies only the keys that are present in the map (so saving one step of the
    // setup never erases the other steps). An empty value clears that field.
    // Keys: fullName, bio, school, course, yearLevel, location, birthday,
    //       interests (comma separated), studyPrefs (comma separated), avatar.

    public void update(Map<String, String> d) throws InvalidInputException {
        // 1. Validate into local copies first.
        String nName = fullName, nBio = bio, nSchool = school, nCourse = course,
                nYear = yearLevel, nLoc = location, nBday = birthday, nAvatar = avatar;
        List<String> nInterests = interests, nPrefs = studyPrefs;

        if (d.containsKey("fullName")) {
            nName = clean(d.get("fullName"));
            if (nName.isEmpty())
                throw new InvalidInputException("Full name cannot be empty.");
            if (nName.length() > MAX_NAME)
                throw new InvalidInputException("Full name can be up to " + MAX_NAME + " characters.");
        }
        if (d.containsKey("bio")) {
            nBio = clean(d.get("bio"));
            if (nBio.length() > MAX_BIO)
                throw new InvalidInputException("Bio can be up to " + MAX_BIO + " characters.");
        }
        if (d.containsKey("school")) nSchool = shortText(d.get("school"), "School");
        if (d.containsKey("course")) nCourse = shortText(d.get("course"), "Course");
        if (d.containsKey("yearLevel")) nYear = shortText(d.get("yearLevel"), "Year level");
        if (d.containsKey("location")) nLoc = shortText(d.get("location"), "Location");
        if (d.containsKey("birthday")) nBday = checkBirthday(d.get("birthday"));
        if (d.containsKey("interests")) nInterests = parseInterests(d.get("interests"));
        if (d.containsKey("studyPrefs")) nPrefs = parsePrefs(d.get("studyPrefs"));
        if (d.containsKey("avatar")) nAvatar = checkImage(d.get("avatar"), MAX_AVATAR_CHARS, "Profile picture");

        // 2. Everything is valid: apply.
        fullName = nName; bio = nBio; school = nSchool; course = nCourse; yearLevel = nYear;
        location = nLoc; birthday = nBday; interests = nInterests; studyPrefs = nPrefs;
        avatar = nAvatar;
    }

    // profile strength (like Facebook's "complete your profile")
    private static final String[] STRENGTH_LABELS = {
            "Add a profile picture", "Write a short bio", "Add your school",
            "Add your course", "Add your year level", "Add your location", "Add your birthday",
            "Add your interests", "Pick your study preferences"
    };

    private boolean[] filled() {
        return new boolean[] {
                !avatar.isEmpty(), !bio.isEmpty(), !school.isEmpty(),
                !course.isEmpty(), !yearLevel.isEmpty(), !location.isEmpty(), !birthday.isEmpty(),
                !interests.isEmpty(), !studyPrefs.isEmpty()
        };
    }

    // 0 to 100 (percent of the profile items that are filled in).
    public int completion() {
        int n = 0;
        for (boolean b : filled()) if (b) n++;
        return n * 100 / STRENGTH_LABELS.length;
    }

    // What is still missing, as short to-do labels.
    public List<String> missingItems() {
        List<String> out = new ArrayList<>();
        boolean[] f = filled();
        for (int i = 0; i < f.length; i++) if (!f[i]) out.add(STRENGTH_LABELS[i]);
        return out;
    }

    // validation helpers

    // Removes control characters, collapses spaces, trims. Null becomes "".
    private static String clean(String s) {
        if (s == null) return "";
        return s.replaceAll("\\p{Cntrl}", " ").replaceAll("\\s+", " ").trim();
    }

    private static String shortText(String s, String label) throws InvalidInputException {
        String v = clean(s);
        if (v.length() > MAX_FIELD)
            throw new InvalidInputException(label + " can be up to " + MAX_FIELD + " characters.");
        return v;
    }

    private static String checkBirthday(String s) throws InvalidInputException {
        String v = clean(s);
        if (v.isEmpty()) return "";
        try {
            LocalDate date = LocalDate.parse(v);
            if (date.isAfter(LocalDate.now()) || date.getYear() < 1900)
                throw new InvalidInputException("Enter a valid birthday.");
            return date.toString();
        } catch (DateTimeParseException e) {
            throw new InvalidInputException("Enter a valid birthday.");
        }
    }

    private static List<String> parseInterests(String s) throws InvalidInputException {
        Set<String> seen = new LinkedHashSet<>();
        List<String> out = new ArrayList<>();
        for (String part : clean(s).split(",")) {
            String v = part.trim();
            if (v.isEmpty()) continue;
            if (v.length() > MAX_INTEREST_LENGTH)
                throw new InvalidInputException("Each interest can be up to " + MAX_INTEREST_LENGTH + " characters.");
            if (seen.add(v.toLowerCase())) out.add(v);
        }
        if (out.size() > MAX_INTERESTS)
            throw new InvalidInputException("You can add up to " + MAX_INTERESTS + " interests.");
        return out;
    }

    private static List<String> parsePrefs(String s) throws InvalidInputException {
        Set<String> out = new LinkedHashSet<>();
        for (String part : clean(s).split(",")) {
            String v = part.trim().toLowerCase();
            if (v.isEmpty()) continue;
            if (!PREF_KEYS.contains(v))
                throw new InvalidInputException("Unknown study preference: " + v);
            out.add(v);
        }
        return new ArrayList<>(out);
    }

    // Accepts "" (remove the photo) or a small base64 image (jpeg, png, webp).
    private static String checkImage(String s, int maxChars, String label) throws InvalidInputException {
        if (s == null || s.isBlank()) return "";
        String v = s.trim();
        String prefix = null;
        for (String p : new String[] { "data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64," }) {
            if (v.startsWith(p)) { prefix = p; break; }
        }
        if (prefix == null)
            throw new InvalidInputException(label + " must be a JPG, PNG or WebP image.");
        if (v.length() > maxChars)
            throw new InvalidInputException(label + " is too large. Choose a smaller image.");
        for (int i = prefix.length(); i < v.length(); i++) {
            char c = v.charAt(i);
            boolean ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
                    || c == '+' || c == '/' || c == '=';
            if (!ok) throw new InvalidInputException(label + " could not be read. Try another image.");
        }
        return v;
    }
}