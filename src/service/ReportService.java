package service;

import exception.InvalidInputException;
import model.*;

public class ReportService {
    private final SpotRepository repo;
    private int nextReportId = 1;

    public ReportService(SpotRepository repo) {
        this.repo = repo;
    }

    public ReportStatus submitReport(UserAccount user, int spotId, NoiseLevel noise,
        CrowdLevel crowd, String note) throws InvalidInputException {
        if (user == null)
            throw new InvalidInputException("You must be logged in to submit a report.");
        if (noise == null || crowd == null)
            throw new InvalidInputException("Please select both a noise level and a crowd level.");

        SpotArea spot = repo.findById(spotId);
        if (spot == null)
            throw new InvalidInputException("That study spot no longer exists.");

        ReportStatus report = new ReportStatus(nextReportId++, spotId, user.getUserName(), noise, crowd, note);
        spot.addReport(report);   // also updates the spot's current noise/crowd
        user.recordReport();      // +1 report, +points
        return report;
    }
}