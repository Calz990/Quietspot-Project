# QuietSpot

## 1. Project Title
**QuietSpot** – Real-Time Study Area Tracker and Finder

## 2. Project Description
QuietSpot is a Java-based **web application** designed to help students and faculty find conducive places to study around Batangas City (specifically near BatStateU Alangilan Campus). It provides real-time information about study spots, including their location, crowd level, noise level, available facilities, Wi-Fi availability, and pricing.

The system allows users to search and filter study spots based on their preferences, submit crowd-sourced status updates on current noise and crowd levels, and recommend new study areas.

## 3. Problem Being Addressed
Students and faculty often spend unnecessary time searching for a quiet, comfortable, and suitable place to study or work, especially during breaks and examination periods. While libraries, cafés, and co-working spaces exist around Batangas City, users have no way of knowing beforehand whether a location is overcrowded, noisy, or equipped with essential amenities like power outlets and reliable Wi-Fi.

QuietSpot solves this problem by centralizing study spot information and enabling real-time, community-driven status updates.

## 4. Justification of OOP Approach
An Object-Oriented Programming (OOP) approach is ideal for QuietSpot because the domain consists of distinct, interacting real-world entities—different types of study locations (`Library`, `CoworkingSpace`, `StudyRoom`), user accounts (`UserAccount`), facilities (`Facility`), and status reports (`ReportStatus`).

- **Modularity & Scalability:** Modeling each study spot type as a subclass of an abstract `SpotArea` allows new categories of study venues to be added without rewriting core search or reporting logic.
- **Data Integrity & Security:** Encapsulating sensitive user data (such as passwords and reward points) and enforcing validation rules through custom exceptions (`InvalidInputException`) ensures reliable and secure system operations.
- **Maintainability:** Separating data models (`model`), business logic (`service`), and HTTP routing (`Main`) creates a clean, maintainable architecture.

## 5. Project Objectives

### General Objective
To develop a Java-based web application that helps users locate, filter, and monitor the real-time status of study spots within Batangas City.

### Specific Objectives
1. Provide search and custom filtering based on noise level, crowd level, facilities, and price.
2. Enable real-time, crowd-sourced updates on study spot crowd and noise levels.
3. Allow users to submit and recommend new study spots.
4. Demonstrate core Java Object-Oriented Programming (OOP) principles—Abstraction, Encapsulation, Inheritance, Polymorphism, and Exception Handling—in a working full-stack application.

## 6. Target Users
- **Students:** Use QuietSpot to quickly locate quiet, budget-friendly, and well-equipped spaces for studying, reviewing, or working on academic requirements.
- **Faculty and Staff:** Use the platform to find suitable spaces for student consultations, paper grading, or focused work.

## 7. Main Features
- **Location-Based Discovery:** Displays study spots near the user in Batangas City with distance and area details.
- **Custom Filtering:** Filters study spots by `NoiseLevel`, `CrowdLevel`, available `Facility` amenities (Wi-Fi, outlets), and price.
- **Live Spot Status:** Reflects real-time crowd and noise conditions updated through user reports.
- **Detailed Spot Profiles:** Shows operating hours, location, facilities, and category-specific attributes (e.g., silent zones for libraries, hourly rates for co-working spaces).
- **Crowd-Sourced Spot & Status Submission:** Allows registered users to submit live noise/crowd reports and recommend new study locations.
- **Community Verification & Gamification:** Awards points to active contributors and supports report verification.
- **Favorites & Navigation:** Lets users bookmark preferred study spots and open directions via external mapping services.

## 8. Technologies Used
- **Backend:** Java (`com.sun.net.httpserver.HttpServer`, OOP Architecture)
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (`fetch` API)
- **Version Control:** Git & GitHub

## 9. OOP Concepts Demonstrated

| OOP Concept | Implementation in QuietSpot |
| :--- | :--- |
| **Abstraction** | `SpotArea` is implemented as an `abstract` base class defining shared attributes and abstract methods (`getAreaCategory()`) for all study venues. |
| **Encapsulation** | Model classes (`SpotArea`, `UserAccount`, `ReportStatus`, `Facility`) keep fields `private` and expose controlled access via constructors, getters, and state-updating methods. |
| **Inheritance** | `Library`, `CoworkingSpace`, and `StudyRoom` extend `SpotArea`, inheriting common properties while defining specialized attributes (e.g., `hasSilentZone`, `hourlyRate`, `maxCapacity`). |
| **Polymorphism** | Subclasses override `SpotArea` methods to provide category-specific behavior while being managed uniformly inside `List<SpotArea>` collections in `SpotRepository`. |
| **Exception Handling & Validation** | Custom `InvalidInputException` validates user registration, login credentials, and report submissions, preventing invalid data states. |
| **Collections & Enumerations** | Uses `List`, `Map`, and `HashMap` (`SpotRepository`, `AuthService`, `ReportService`) alongside type-safe `enum` classes (`NoiseLevel`, `CrowdLevel`, `UserType`). |

## 10. System Architecture & UML Class Diagram
> *Note: The finalized UML Class Diagram (`uml-class-diagram.png`) will be uploaded here upon completion of final code integration.*

## 11. Instructions for Running the Program
1. Ensure **Java Development Kit (JDK 17 or higher)** is installed on your machine.
2. Clone the repository:
   ```bash
   git clone [https://github.com/Calz990/Quietspot-Project.git](https://github.com/Calz990/Quietspot-Project.git)
   ```
3. Open the `Quietspot-Project` folder in VS Code (with the Extension Pack for Java) or any Java-supported IDE.
4. Navigate to `src/Main.java` and run the `main` method to start the built-in Java HTTP server on port `8080`.
5. Open a web browser and go to:
   ```text
   http://localhost:8080
   ```

## 12. Sample Screenshots & Test Cases
> *Note: Application screenshots and validation test case outputs will be added in the `screenshots/` directory once the web interface is finalized.*

Planned visual documentation includes:
- Backend Server Startup (`http://localhost:8080` running in terminal)
- Landing Page & Study Spot Dashboard
- Custom Search and Filtering (`NoiseLevel` & `CrowdLevel`)
- User Registration & Login (Valid Case & `InvalidInputException` Error Handling Case)
- Live Status Report Submission & Points Update

## 13. Known Limitations
1. Coverage is currently limited to study spots within Batangas City (primarily near Alangilan Campus).
2. Users must register and log in to submit live reports or add new study spots.
3. The system comes with pre-loaded study spots in memory (`SpotRepository`) and does not yet use an external persistent database.
4. Crowd and noise levels rely on user-submitted reports rather than IoT sensors or cameras.
5. Wi-Fi availability is informational and does not perform live bandwidth speed tests.
6. Seat reservation, booking, and online payments are outside the scope of the system.
7. Navigation relies on external mapping services (e.g., Google Maps).
8. Gamification is limited to points and badges with no monetary rewards.

## 14. Future Improvements
- Integrate a relational database (e.g., MySQL/PostgreSQL) for persistent storage of users, spots, and report history.
- Expand geographic coverage beyond Batangas City.
- Add automated report credibility scoring and timestamp decay for outdated reports.

## 15. Team Members and Roles

### Java thRICE – Team 6

| Name | GitHub Username | Key Responsibilities |
| :--- | :--- | :--- |
| **Bagsit, Charisse T.** | `Charisse-Bagsit` | Project coordination, instructor communication, `README.md` & documentation, test case screenshots, QA testing |
| **Robines, Princess Khaila L.** | `khailarobines_tech` | System requirements analysis, UML Class Diagram design, overall architecture, UI & feature integration |
| **Servando, Joshua R.** | `Calz990` | Backend Java classes & OOP implementation, input validation, `InvalidInputException`, core service logic |
