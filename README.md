<div align="center">

<!-- TIP: Gumawa ng banner sa Canva (1200x400px) gamit ang Rose & Teal theme at i-save sa web/images/banner.png -->
<img src="web/images/banner.png" alt="QuietSpot Banner" width="100%" />

# QuietSpot
### *"Find your focus, skip the crowd."*
**Real-Time Study Area Tracker and Finder in Batangas City**

![Java](https://img.shields.io/badge/Backend-Java_17+-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white)
![Frontend](https://img.shields.io/badge/Frontend-HTML5_%7C_CSS3_%7C_JS-3178C6?style=for-the-badge&logo=javascript&logoColor=white)
![Architecture](https://img.shields.io/badge/Architecture-Object--Oriented-2EA44F?style=for-the-badge)
![Theme](https://img.shields.io/badge/Theme-Rose_&_Teal-e91e63?style=for-the-badge)

[Features](#-project-features) • [Architecture](#-oop-principles-applied) • [Run Locally](#-how-to-run-the-program) • [Team](#-team-members)

</div>

---

## 🎯 Project Overview
**QuietSpot** is a Java-based productivity web application designed to help students, faculty, and remote workers locate conducive study spots around Batangas City (specifically near BatStateU Alangilan Campus). Instead of walking from one packed café or library to another, users can check real-time crowd levels, noise conditions, available amenities, and pricing in one centralized platform—and contribute live updates for the community.

> [!IMPORTANT]
> **The Problem We Solve:** During regular class days and exam weeks, finding a quiet seat with reliable Wi-Fi and power outlets is a guessing game. Existing map apps only show static addresses—not whether a spot is currently noisy or full.
>
> **Why OOP?** Modeling the domain with Object-Oriented Programming lets different venue types (`Library`, `CoworkingSpace`, `Cafe`, `StudyRoom`), user accounts (`UserAccount`), amenities (`Facility`), and live reports (`ReportStatus`) interact cleanly. Using an `abstract` parent class (`SpotArea`) makes the system easy to scale, while custom exceptions (`InvalidInputException`) keep data valid and secure.

---

## ✨ Project Features
- 📍 **Location-Based Discovery:** Browse study spots around Batangas City with distance and area information.
- 🎛️ **Smart Custom Filtering:** Filter spots by `NoiseLevel` (*Silent, Quiet, Moderate, Loud*), `CrowdLevel` (*Empty, Low, Moderate, Crowded*), available `Facility` amenities (*Wi-Fi, outlets*), and price range.
- 📡 **Live Crowd-Sourced Status:** View real-time updates on seat availability, noise, and crowd conditions submitted by active users.
- 🏢 **Detailed Spot Profiles:** Inspect operating hours, rules, amenities, and category-specific features (e.g., silent zones for libraries, hourly rates for co-working spaces).
- 📝 **Spot & Report Submission:** Registered users can submit real-time status reports or recommend new study locations.
- 🏆 **Community Verification & Gamification:** Earn contributor points and badges for submitting accurate status updates.
- ⭐ **Favorites & Navigation:** Bookmark preferred study spaces and launch directions via external mapping services.

---

## 🧱 OOP Principles Applied

| OOP Principle | How It Is Applied in QuietSpot |
| :--- | :--- |
| **Abstraction** | `SpotArea` is declared as an `abstract` base class defining shared properties and abstract behaviors (`getAreaCategory()`) for all study venues without exposing internal implementation details. |
| **Encapsulation** | Core model classes (`SpotArea`, `UserAccount`, `ReportStatus`, `Facility`) restrict direct field access using `private` modifiers and provide controlled access via constructors, getters, and validated update methods. |
| **Inheritance** | Specialized venue classes—`Library`, `CoworkingSpace`, `Cafe`, and `StudyRoom`—extend `SpotArea`, inheriting common properties while adding their own fields (e.g., `hasSilentZone`, `hourlyRate`, `maxCapacity`). |
| **Polymorphism** | Subclasses override `SpotArea` methods to provide category-specific outputs while being stored and processed uniformly inside `List<SpotArea>` collections in `SpotRepository`. |
| **Exception Handling & Data Structures** | Custom `InvalidInputException` handles invalid user inputs and authentication errors gracefully, backed by Java Collections (`List`, `Map`, `HashMap`) and type-safe `enum` classes (`NoiseLevel`, `CrowdLevel`, `UserType`). |

---

## 📂 Project Structure (Updated)
```text
Quietspot-Project/
├── bin/                                 # Compiled .class files
├── docs/                                # Project documentation (e.g., requirements)
├── screenshots/                         # Output, test cases, & UML diagram
├── src/                                 # Java Source Code
│   ├── Main.java                        # Entry point & custom Java HTTP Server (Port 8080)
│   ├── exception/
│   │   └── InvalidInputException.java   # Custom exception for input & auth validation
│   ├── model/
│   │   ├── SpotArea.java                # Abstract parent class for all study spots
│   │   ├── Library.java                 # Subclass extending SpotArea
│   │   ├── CoworkingSpace.java          # Subclass extending SpotArea
│   │   ├── Cafe.java                    # Subclass extending SpotArea
│   │   ├── StudyRoom.java               # Subclass extending SpotArea
│   │   ├── Facility.java                # Represents spot amenities (Wi-Fi, outlets, etc.)
│   │   ├── UserAccount.java             # Encapsulates user credentials, roles, and points
│   │   ├── ReportStatus.java            # Models real-time crowd/noise reports
│   │   ├── NoiseLevel.java              # Enum (SILENT, QUIET, MODERATE, LOUD)
│   │   ├── CrowdLevel.java              # Enum (EMPTY, LOW, MODERATE, CROWDED)
│   │   └── UserType.java                # Enum (STUDENT, FACULTY, GUEST)
│   └── service/
│       ├── AuthService.java             # Handles user registration, login, and validation
│       ├── SpotRepository.java          # Manages study spot data & filtering operations
│       └── ReportService.java           # Processes live reports and updates spot states
├── web/                                 # Frontend Web Application
│   ├── about.html                       # About QuietSpot & team info
│   ├── dashboard.html                   # Main study spot tracker & dashboard
│   ├── feed.html                        # Live community status feed
│   ├── index.html                       # Landing page (Rose & Teal Theme)
│   ├── login.html                       # User login page
│   ├── reco.html                        # Spot recommendation page
│   ├── signup.html                      # User sign-up page
│   ├── spots.html                       # Full spot listing page
│   ├── css/
│   │   └── style.css                    # Stylesheets (Responsive UI)
│   ├── js/
│   │   └── script.js                    # Frontend interactivity & fetch() API calls
│   └── images/                          # UI assets, banner, logo, & spot thumbnails
└── README.md                            # Project documentation
```

---

## 🚀 How to Run the Program
1. **Check Prerequisites:** Ensure **Java Development Kit (JDK 17 or higher)** is installed on your computer.
2. **Clone the Repository:**
   ```bash
   git clone [https://github.com/Calz990/Quietspot-Project.git](https://github.com/Calz990/Quietspot-Project.git)
   ```
3. **Open in IDE (IMPORTANT):** Open the `Quietspot-Project` root folder directly in **Visual Studio Code** (with the *Extension Pack for Java*) or any Java IDE.
   > *Note: Do not open the parent folder (`FP2`) to ensure correct file path resolution.*
4. **Start the Java Backend Server:** Open `src/Main.java` and click **Run** to start the built-in `HttpServer` on port `8080`.
   > *Expected Console Output:* `QuietSpot Java Server is running! Open in browser: http://localhost:8080`
5. **Launch the Web Application:** Open any web browser and visit:
   ```text
   http://localhost:8080
   ```

> [!TIP]
> If port `8080` is already occupied from a previous session on Windows, run `taskkill /F /IM java.exe` in your terminal before starting `Main.java` again.

---

## 📐 System Architecture & UML Class Diagram
> [!NOTE]
> *The finalized UML Class Diagram (`screenshots/uml-class-diagram.png`) will be embedded here once final code integration is completed.*

---

## 📸 Sample Screenshots, Output & Highlights
> [!NOTE]
> *Application screenshots, Light/Dark mode previews, and validation test case outputs will be uploaded to the `screenshots/` folder once the web interface is finalized.*

Planned highlights to be showcased:
- 🖥️ **Backend Server Execution:** Terminal proof of `Main.java` running on `http://localhost:8080`
- 🏠 **Landing & Dashboard Views:** Study spot listings, real-time status indicators, and distance view
- 🔍 **Custom Filtering:** Filtering study spots by `NoiseLevel` and `CrowdLevel`
- 🔐 **Authentication & Validation Test Cases:** Successful login/sign-up and `InvalidInputException` error handling
- 📊 **Live Status Reporting:** Submitting a spot update and earning contributor points

---

<details>
<summary><b>📌 Click to View Known Limitations & Future Improvements</b></summary>

### Known Limitations
- Covers study spots within Batangas City (primarily near Alangilan Campus) using in-memory data storage (`SpotRepository`).
- Crowd and noise levels rely on user-submitted reports rather than IoT sensors or cameras.
- Wi-Fi availability is informational and does not perform live bandwidth speed tests.
- Seat reservations, online payments, and monetary rewards are outside the current system scope.

### Future Improvements
- Integrate a persistent relational database (MySQL/PostgreSQL) for storing users, spots, and report history.
- Add automated timestamp decay and credibility scoring for older status reports.
- Expand geographic coverage beyond Batangas City.

</details>

---

## 👥 Team Members
### Team 6 – Java thRICE (`IT-2105`)

| Member Name | Title | GitHub | Key Contributions |
| :--- | :--- | :--- | :--- |
| **Bagsit, Charisse T.** | *Project Lead & Docs Architect* | [@Charisse-Bagsit](https://github.com/Charisse-Bagsit) | Team coordination, documentation (`README.md`), test case screenshots, QA testing |
| **Robines, Princess Khaila L.** | *System & UI/UX Designer* | [@khailarobines_tech](https://github.com/khailarobines_tech) | System analysis, UML Class Diagram design, overall architecture, UI & feature integration |
| **Servando, Joshua R.** | *Lead Backend & OOP Engineer* | [@Calz990](https://github.com/Calz990) | Java OOP models & services, HTTP server routing, input validation (`InvalidInputException`) |

---

## 🙏 Acknowledgment
We extend our sincere gratitude to our Object-Oriented Programming instructor at **Batangas State University – The National Engineering University (Alangilan Campus)**, College of Informatics and Computing Sciences (CICS), for guiding us in applying Java OOP concepts to real-world software solutions. We also thank our classmates and peer testers who shared valuable feedback on study spot needs around campus.

---

<div align="center">

## 💖 Thank You!
Thank you for checking out **QuietSpot**! We hope this project helps students and faculty find their ideal space to focus, collaborate, and stay productive.

*Made with ☕ and Java by **Team 6 – Java thRICE***

</div>
