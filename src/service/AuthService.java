package service;

import java.util.HashMap;
import java.util.Map;
import model.UserAccount;
import model.UserType;
import exception.InvalidInputException;

public class AuthService {
    private final Map<String, UserAccount> users = new HashMap<>();

    public UserAccount register(String userName, String password, UserType userType) throws InvalidInputException {
        if (userName == null || userName.isBlank()) {
            throw new InvalidInputException("Username cannot be empty");
        }
        if (password == null || password.length() < 6) {
            throw new InvalidInputException("Password must be at least 6 characters.");
        }
        String key = userName.toLowerCase();
        if (users.containsKey(key)) {
            throw new InvalidInputException("Username already exists");
        }

        UserAccount user = new UserAccount(userName.trim(), password, userType);
        users.put(key, user);
        return user;
    }

    public UserAccount login(String userName, String password) throws InvalidInputException {
        UserAccount user = userName == null ? null : users.get(userName.trim().toLowerCase());
        if (user == null || password == null || !user.checkPassword(password)) {
            throw new InvalidInputException("Incorrect username or password.");
        }
        return user;
    }
}
