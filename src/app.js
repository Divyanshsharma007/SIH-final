const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require('../db'); 

const predictRoutes = require('./routes/predict');
const historyRoutes = require('./routes/history'); 

const app = express();
connectDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api/predict", predictRoutes);
app.use("/api/history", historyRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Dropout Prediction API is running",
    model: "CatBoost (served via Python)",
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Dropout Prediction API running on port ${PORT}`);
});
