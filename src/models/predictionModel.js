const axios = require("axios");

class PredictionModel {
  constructor() {
    this.pythonServiceUrl =
      process.env.PYTHON_SERVICE_URL || "http://localhost:5001";
    this.timeout = 10000; // 10 seconds
  }

  /**
   * Predict for a single student
   * @param {Object} studentData - Structured data matching FastAPI schema
   */
  async predict(studentData) {
    try {
      // Ensure content-type is JSON
      const response = await axios.post(
        `${this.pythonServiceUrl}/predict`,
        studentData,
        { timeout: this.timeout, headers: { "Content-Type": "application/json" } }
      );
      return response.data;
    } catch (error) {
      console.error("Error calling Python service:", error.message);

      if (error.code === "ECONNREFUSED") {
        throw new Error("Prediction service is not running");
      } else if (error.response) {
        throw new Error(
          `Prediction service error: ${error.response.data.detail || error.response.data.error}`
        );
      } else if (error.request) {
        throw new Error("No response from prediction service");
      } else {
        throw new Error("Error configuring prediction request");
      }
    }
  }

  /**
   * Batch predict for multiple students
   * @param {Array} studentsData - Array of structured student objects
   */
  async batchPredict(studentsData) {
    try {
      const requestBody = { predictions: studentsData };
      const response = await axios.post(
        `${this.pythonServiceUrl}/batch-predict`,
        requestBody,
        {
          timeout: this.timeout * 2, // longer timeout for batch requests
          headers: { "Content-Type": "application/json" },
        }
      );

      return response.data.predictions;
    } catch (error) {
      console.error("Error calling Python batch service:", error.message);

      if (error.code === "ECONNREFUSED") {
        throw new Error("Prediction service is not running");
      } else if (error.response) {
        throw new Error(
          `Prediction service error: ${error.response.data.detail || error.response.data.error}`
        );
      } else if (error.request) {
        throw new Error("No response from prediction service");
      } else {
        throw new Error("Error configuring batch prediction request");
      }
    }
  }

  /**
   * Health check for Python service
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.pythonServiceUrl}/health`, {
        timeout: 5000,
      });
      return response.data;
    } catch (error) {
      return { status: "ERROR", error: error.message };
    }
  }
}

module.exports = PredictionModel;
