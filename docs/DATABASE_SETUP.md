# Running QuietSpot with MySQL

Accounts, student-added spots and everything students share are saved in MySQL. Without a config file the app still works the old way (data/*.tsv files).

## One-time setup
1. **Install MySQL** (MySQL Community Server + Workbench, or XAMPP) and start it.
2. **Get the driver:** download *MySQL Connector/J* (Platform Independent, .zip) from https://dev.mysql.com/downloads/connector/j/ and put the `mysql-connector-j-x.y.z.jar` file in a folder named `lib/` at the project root (next to `src/`).
   In VS Code, if the Java project does not pick it up, run *Java: Clean Java Language Server Workspace* or check "Referenced Libraries" in the Java Projects panel.
3. **Settings:** copy `config/db.properties.example` to `config/db.properties` and set `db.user` / `db.password` to your MySQL login.
4. **Run `Main.java`.** On the first start it creates the `quietspot` database and tables, and copies any accounts and spots from `data/users.tsv` / `data/spots.tsv` into MySQL (the .tsv files are left untouched as a backup).

Expected console output: `Saving accounts and spots to MySQL database 'quietspot'.`

## Check the data
In MySQL Workbench (or the `mysql` command): `USE quietspot; SELECT username, points FROM users;`

## Hosted database later
Set `db.url` in `config/db.properties` to the JDBC URL from your provider (or set the environment variables `DB_URL`, `DB_USER`, `DB_PASSWORD`). The database must already exist; the server creates the tables.

## Notes
- Reports, comments, votes, ratings, photos and favorites are saved in MySQL too (tables `reports`, `report_votes`, `comments`, `comment_votes`, `ratings`, `photos`, `favorites`), so every account sees the same ones. They need MySQL: with no `config/db.properties` these features are switched off.
- Those tables point to a student by username without a foreign key. The server moves the rows when an account is renamed and removes them when an account or a spot is deleted.
- Photos are stored in the `photos` table and sent to the page from `/api/photo?id=...`.
- Points, streaks, the weekly leaderboard and unlocked badges are saved in MySQL too (tables `point_events` and `user_badges`; the totals stay in `users`). Every action that earns points adds a row to `point_events`; the streak, this week's points and the leaderboard are worked out from those rows, so they follow the account to any browser. "Today" and "Monday" use the time zone of the computer running `Main.java`.
- Only the "already celebrated" popup bookkeeping (which badges and levels you have seen) is still kept in the browser.
- Never commit `config/db.properties` (it holds your password). It is listed in `.gitignore`.