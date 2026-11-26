package service;

import model.UserAccount;

import java.util.Collection;
import java.util.List;

// Where accounts are kept: the MySQL database (MySqlUserStore) or the old data/users.tsv file (UserStore).
public interface UserStorage {
    List<UserAccount> load();

    void save(Collection<UserAccount> users);
}
