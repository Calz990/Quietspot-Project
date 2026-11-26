package service;

import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;
import model.UserAccount;
import model.UserType;
import exception.InvalidInputException;

public class AuthService {
    private final Map<String, UserAccount> users = new HashMap<>();
    private final UserStore store;

    // Accounts are saved in data/users.tsv, so they are still there after the server restarts.
    public AuthService() {
        this(new UserStore(Paths.get("data", "users.tsv")));
    }

    public AuthService(UserStore store) {
        this.store = store;
        for (UserAccount u : store.load()) users.put(u.getUserName().toLowerCase(), u);
    }

    // Call after anything about an account changes (points, counts, profile...).
    public synchronized void save() {
        store.save(users.values());
    }

    public synchronized boolean exists(String userName) {
        return userName != null && users.containsKey(userName.trim().toLowerCase());
    }

    // The real account for this name, or null if there is none.
    public synchronized UserAccount lookup(String userName) {
        return userName == null ? null : users.get(userName.trim().toLowerCase());
    }

    public UserAccount register(String userName, String password, UserType userType) throws InvalidInputException {
        return register(userName, password, userType, null);
    }

    public UserAccount register(String userName, String password, UserType userType, String email) throws InvalidInputException {
        return register(userName, password, userType, email, null);
    }

    // Sign up with a full name too: the name is saved in the new account's profile.
    public UserAccount register(String userName, String password, UserType userType, String email, String fullName) throws InvalidInputException {
        if (userName == null || userName.isBlank()) {
            throw new InvalidInputException("Username cannot be empty");
        }
        if (password == null || password.length() < 6) {
            throw new InvalidInputException("Password must be at least 6 characters.");
        }
        String mail = email == null ? "" : email.trim();
        if (!mail.isEmpty() && !mail.matches("^\\S+@\\S+\\.\\S+$")) {
            throw new InvalidInputException("Enter a valid email.");
        }
        String key = userName.toLowerCase();
        if (users.containsKey(key)) {
            throw new InvalidInputException("Username already exists");
        }

        UserAccount user = new UserAccount(userName.trim(), password, userType);
        if (!mail.isEmpty()) user.setEmail(mail);
        // Validate the full name BEFORE the account is stored, so a bad name never creates a half-made account.
        if (fullName != null && !fullName.isBlank()) {
            user.getProfile().update(Map.of("fullName", fullName));
        }
        users.put(key, user);
        save();
        return user;
    }

    public UserAccount login(String userName, String password) throws InvalidInputException {
        UserAccount user = userName == null ? null : users.get(userName.trim().toLowerCase());
        // The username must be typed exactly as it was created ("Calz" is not "calz").
        if (user == null || !user.getUserName().equals(userName.trim()) || password == null || !user.checkPassword(password)) {
            throw new InvalidInputException("Incorrect username or password.");
        }
        return user;
    }

    private UserAccount find(String userName) throws InvalidInputException {
        UserAccount u = userName == null ? null : users.get(userName.trim().toLowerCase());
        if (u == null) throw new InvalidInputException("Account not found.");
        return u;
    }

    public UserAccount changeUserName(String oldName, String newName) throws InvalidInputException {
        UserAccount user = find(oldName);
        if (newName == null || newName.isBlank())
            throw new InvalidInputException("Username cannot be empty");
        String oldKey = user.getUserName().toLowerCase();
        String newKey = newName.trim().toLowerCase();
        if (!newKey.equals(oldKey) && users.containsKey(newKey))
            throw new InvalidInputException("Username already exists");
        users.remove(oldKey);
        user.setUserName(newName.trim());
        users.put(newKey, user);
        save();
        return user;
    }

    public void changePassword(String userName, String oldPw, String newPw) throws InvalidInputException {
        UserAccount user = find(userName);
        if (oldPw == null || !user.checkPassword(oldPw))
            throw new InvalidInputException("Current password is incorrect.");
        if (newPw == null || newPw.length() < 6)
            throw new InvalidInputException("Password must be at least 6 characters.");
        user.setPassword(newPw);
        save();
    }

    public void deleteAccount(String userName, String password) throws InvalidInputException {
        UserAccount user = find(userName);
        if (password == null || !user.checkPassword(password))
            throw new InvalidInputException("Incorrect password.");
        users.remove(user.getUserName().toLowerCase());
        save();
    }

    public UserAccount getUser(String userName) throws InvalidInputException {
        return find(userName);
    }

    // Profile setup / edit profile. Only the keys present in "data" are changed (see UserProfile.update).
    // Extra keys: userType (STUDENT, FACULTY, STAFF) and setupDone ("true" when the person finishes or skips the setup).
    public UserAccount updateProfile(String userName, Map<String, String> data) throws InvalidInputException {
        UserAccount user = find(userName);
        UserType newType = null;
        String type = data.get("userType");
        if (type != null && !type.isBlank()) {
            try {
                newType = UserType.valueOf(type.trim().toUpperCase());
            } catch (IllegalArgumentException e) {
                throw new InvalidInputException("Choose Student, Faculty or Staff.");
            }
        }
        user.getProfile().update(data);        // throws if anything is invalid, nothing is saved then
        if (newType != null) user.setUserType(newType);
        if ("true".equalsIgnoreCase(data.get("setupDone"))) user.getProfile().markSetupDone();
        save();
        return user;
    }

    // Forgot password: the username and the email on file must both match.
    public void resetPassword(String userName, String email, String newPw) throws InvalidInputException {
        UserAccount user;
        try {
            user = find(userName);
        } catch (InvalidInputException e) {
            throw new InvalidInputException("Username and email do not match.");
        }
        if (user.getEmail() == null || email == null || !user.getEmail().equalsIgnoreCase(email.trim())) {
            throw new InvalidInputException("Username and email do not match.");
        }
        if (newPw == null || newPw.length() < 6) {
            throw new InvalidInputException("Password must be at least 6 characters.");
        }
        user.setPassword(newPw);
        save();
    }
}