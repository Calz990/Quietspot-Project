-- QuietSpot tables. The Java server runs the same statements on every start (CREATE ... IF NOT EXISTS),
-- so you only need this file if you want to create the database yourself in MySQL Workbench.

CREATE DATABASE IF NOT EXISTS quietspot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE quietspot;

CREATE TABLE IF NOT EXISTS users (
    username      VARCHAR(100) NOT NULL PRIMARY KEY,
    user_type     VARCHAR(20)  NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    points        INT NOT NULL DEFAULT 0,
    reports_made  INT NOT NULL DEFAULT 0,
    spots_added   INT NOT NULL DEFAULT 0,
    photos_added  INT NOT NULL DEFAULT 0,
    email         VARCHAR(255) NULL,
    created_at    VARCHAR(20)  NOT NULL DEFAULT '',
    full_name     VARCHAR(200) NOT NULL DEFAULT '',
    bio           VARCHAR(500) NOT NULL DEFAULT '',
    school        VARCHAR(200) NOT NULL DEFAULT '',
    course        VARCHAR(200) NOT NULL DEFAULT '',
    year_level    VARCHAR(200) NOT NULL DEFAULT '',
    location      VARCHAR(200) NOT NULL DEFAULT '',
    birthday      VARCHAR(20)  NOT NULL DEFAULT '',
    interests     VARCHAR(500) NOT NULL DEFAULT '',
    study_prefs   VARCHAR(500) NOT NULL DEFAULT '',
    avatar        MEDIUMTEXT NULL,
    setup_done    BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS favorites (
    username VARCHAR(100) NOT NULL,
    spot_id  INT NOT NULL,
    PRIMARY KEY (username, spot_id),
    CONSTRAINT fk_favorites_user FOREIGN KEY (username) REFERENCES users (username)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Only spots added by students. The built-in spots are created by the server itself.
CREATE TABLE IF NOT EXISTS spots (
    id          INT NOT NULL PRIMARY KEY,
    spot_type   VARCHAR(30)  NOT NULL,
    name        VARCHAR(255) NOT NULL,
    address     VARCHAR(500) NOT NULL,
    pos_x       DOUBLE NOT NULL,
    pos_y       DOUBLE NOT NULL,
    open_hour   INT NOT NULL,
    close_hour  INT NOT NULL,
    price       DOUBLE NOT NULL,
    noise       TINYINT NOT NULL,
    crowd       TINYINT NOT NULL,
    wifi        BOOLEAN NOT NULL,
    mbps        INT NOT NULL,
    outlets     BOOLEAN NOT NULL,
    aircon      BOOLEAN NOT NULL,
    food        BOOLEAN NOT NULL,
    description TEXT NULL,
    rules       TEXT NULL,
    created_by  VARCHAR(100) NOT NULL,
    INDEX idx_spots_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- what students share. Rows point to a student by username on purpose (no foreign key to users):
-- the Java server moves or removes these rows itself when an account is renamed or deleted.

CREATE TABLE IF NOT EXISTS reports (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    spot_id INT NOT NULL,
    username VARCHAR(100) NOT NULL,
    noise TINYINT NOT NULL,
    crowd TINYINT NOT NULL,
    note VARCHAR(200) NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    INDEX idx_reports_spot (spot_id),
    INDEX idx_reports_user (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS report_votes (
    report_id INT NOT NULL,
    username VARCHAR(100) NOT NULL,
    vote TINYINT NOT NULL,
    PRIMARY KEY (report_id, username),
    INDEX idx_report_votes_user (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comments (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    spot_id INT NOT NULL,
    username VARCHAR(100) NOT NULL,
    body VARCHAR(500) NOT NULL,
    created_at BIGINT NOT NULL,
    INDEX idx_comments_spot (spot_id),
    INDEX idx_comments_user (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comment_votes (
    comment_id INT NOT NULL,
    username VARCHAR(100) NOT NULL,
    vote TINYINT NOT NULL,
    PRIMARY KEY (comment_id, username),
    INDEX idx_comment_votes_user (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ratings (
    spot_id INT NOT NULL,
    username VARCHAR(100) NOT NULL,
    stars TINYINT NOT NULL,
    PRIMARY KEY (spot_id, username),
    INDEX idx_ratings_user (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS photos (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    spot_id INT NOT NULL,
    username VARCHAR(100) NOT NULL,
    caption VARCHAR(100) NOT NULL DEFAULT '',
    src MEDIUMTEXT NOT NULL,
    created_at BIGINT NOT NULL,
    INDEX idx_photos_spot (spot_id),
    INDEX idx_photos_user (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- points history (streaks, weekly leaderboard) and unlocked badges. Also keyed by username, no foreign key.

CREATE TABLE IF NOT EXISTS point_events (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    points INT NOT NULL,
    reason VARCHAR(30) NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    INDEX idx_point_events_user (username, created_at),
    INDEX idx_point_events_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_badges (
    username VARCHAR(100) NOT NULL,
    badge_id VARCHAR(20) NOT NULL,
    unlocked_at BIGINT NOT NULL,
    PRIMARY KEY (username, badge_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;