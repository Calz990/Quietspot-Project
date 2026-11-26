package service;

import model.SpotArea;

import java.util.List;

// Where student-added spots are kept: the MySQL database (MySqlSpotStore) or the old data/spots.tsv file (SpotStore).
public interface SpotStorage {
    List<SpotArea> load();

    void save(List<SpotArea> spots);
}
