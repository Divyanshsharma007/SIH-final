const axios = require("axios");

class PredictionModel {
  constructor() {
    this.pythonServiceUrl =
      process.env.PYTHON_SERVICE_URL || "http://localhost:5001";
    this.timeout = 10000; // 10 second timeout
  }

  async predict(features, userData = null) {
    try {
      const requestBody = {
        features: features,
      };

      // Include user data if provided - structure according to User model
      if (userData) {
        // Validate user data first
        const validation = this._validateUserData(userData);
        if (!validation.isValid) {
          console.warn("User data validation warnings:", validation.errors);
        }

        const structuredUserData = this._structureUserData(userData);
        if (Object.keys(structuredUserData).length > 0) {
          requestBody.userData = structuredUserData;
          console.log("Sending user data to Python service:", structuredUserData);
        }
      }
      console.log("jjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj")

      const response = await axios.post(
        `${this.pythonServiceUrl}/predict`,
        requestBody,
        {
          timeout: this.timeout,
        }
      );
      console.log("mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm")

      return response.data;
    } catch (error) {
      console.error("Error calling Python service:", error.message);

      if (error.code === "ECONNREFUSED") {
        throw new Error("Prediction service is not running");
      } else if (error.response) {
        // Python service returned an error
        throw new Error(
          `Prediction service error: ${error.response.data.error}`
        );
      } else if (error.request) {
        throw new Error("No response from prediction service");
      } else {
        throw new Error("Error configuring prediction request");
      }
    }
  }

  /**
   * Structure user data according to User model schema
   * @param {Object} userData - Raw user data from request
   * @returns {Object} - Structured user data matching User model
   */
  _structureUserData(userData) {
    const structuredData = {};

    // Basic user information - match User model fields exactly
    if (userData.name !== undefined) {
      structuredData.name = userData.name;
    }
    if (userData.email !== undefined) {
      structuredData.email = userData.email;
    }
    if (userData.studentId !== undefined) {
      structuredData.studentId = userData.studentId;
    }

    // Optional: Additional student information
    if (userData.age !== undefined) {
      structuredData.age = userData.age;
    }
    if (userData.gender !== undefined) {
      // Validate gender against User model enum
      const validGenders = ["Male", "Female", "Other"];
      if (validGenders.includes(userData.gender)) {
        structuredData.gender = userData.gender;
      } else {
        console.warn(`Invalid gender value: ${userData.gender}. Valid values are: ${validGenders.join(", ")}`);
      }
    }
    if (userData.course !== undefined) {
      structuredData.course = userData.course;
    }

    return structuredData;
  }

  /**
   * Validate user data against User model schema
   * @param {Object} userData - User data to validate
   * @returns {Object} - Validation result with isValid and errors
   */
  _validateUserData(userData) {
    const errors = [];
    const validGenders = ["Male", "Female", "Other"];

    // Validate gender if provided
    if (userData.gender !== undefined && !validGenders.includes(userData.gender)) {
      errors.push(`Invalid gender: ${userData.gender}. Must be one of: ${validGenders.join(", ")}`);
    }

    // Validate age if provided
    if (userData.age !== undefined && (typeof userData.age !== 'number' || userData.age < 0)) {
      errors.push(`Invalid age: ${userData.age}. Must be a positive number.`);
    }

    // Validate email format if provided
    if (userData.email !== undefined && userData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(userData.email)) {
        errors.push(`Invalid email format: ${userData.email}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Make batch predictions
   * @param {Array} featuresArray - Array of feature arrays
   * @param {Array} userInfoArray - Array of user info objects
   * @returns {Array} - Array of prediction results
   */
  async batchPredict(featuresArray, userInfoArray) {
    try {
      const requestBody = {
        predictions: featuresArray.map((features, index) => ({
          features: features,
          userData: userInfoArray[index] ? this._structureUserData(userInfoArray[index]) : null
        }))
      };

      const response = await axios.post(
        `${this.pythonServiceUrl}/batch-predict`,
        requestBody,
        {
          timeout: this.timeout * 2, // Longer timeout for batch requests
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
