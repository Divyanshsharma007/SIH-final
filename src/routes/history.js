const express = require("express");
const router = express.Router();
const UserData = require("../models/User");

// Get all predictions
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, prediction } = req.query;

    const query = {};
    if (prediction) {
      query["prediction.result"] = prediction;
    }

    const predictions = await UserData.find(query)
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await UserData.countDocuments(query);

    res.json({
      predictions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error("History fetch error:", error);
    res.status(500).json({ error: "Failed to fetch prediction history" });
  }
});

// Get prediction by ID
router.get("/:id", async (req, res) => {
  try {
    const prediction = await UserData.findById(req.params.id);

    if (!prediction) {
      return res.status(404).json({ error: "Prediction not found" });
    }

    res.json(prediction);
  } catch (error) {
    console.error("Prediction fetch error:", error);
    res.status(500).json({ error: "Failed to fetch prediction" });
  }
});

// Get prediction statistics
router.get("/stats/summary", async (req, res) => {
  try {
    const totalPredictions = await UserData.countDocuments();
    const dropoutCount = await UserData.countDocuments({
      "prediction.result": "Dropout",
    });
    const graduateCount = await UserData.countDocuments({
      "prediction.result": "Graduate",
    });
    const enrolledCount = await UserData.countDocuments({
      "prediction.result": "Enrolled",
    });

    res.json({
      totalPredictions,
      dropoutCount,
      graduateCount,
      enrolledCount,
      dropoutPercentage:
        totalPredictions > 0
          ? ((dropoutCount / totalPredictions) * 100).toFixed(2)
          : 0,
      graduatePercentage:
        totalPredictions > 0
          ? ((graduateCount / totalPredictions) * 100).toFixed(2)
          : 0,
      enrolledPercentage:
        totalPredictions > 0
          ? ((enrolledCount / totalPredictions) * 100).toFixed(2)
          : 0,
    });
  } catch (error) {
    console.error("Stats fetch error:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

module.exports = router;
