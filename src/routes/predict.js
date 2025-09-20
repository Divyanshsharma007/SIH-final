const express = require("express");
const router = express.Router();
const PredictionModel = require("../models/predictionModel");
const UserData = require("../models/User"); 

// Initialize model connector
const predictionModel = new PredictionModel();

// Function to map 2-class model output to 3-class interface
function mapToThreeClasses(predictionResult, probabilities) {
  // Your model returns: ['dropout', 'not_dropout']
  // You want to return: ['Dropout', 'Graduate', 'Enrolled']
  
  if (predictionResult === 'dropout') {
    return {
      prediction: 'Dropout',
      probabilities: {
        Dropout: probabilities.dropout || 0,
        Graduate: (probabilities.not_dropout || 0) * 0.3, // Split not_dropout probability
        Enrolled: (probabilities.not_dropout || 0) * 0.7  // between Graduate and Enrolled
      }
    };
  } else if (predictionResult === 'not_dropout') {
    // For not_dropout, we need to decide between Graduate and Enrolled
    // Simple heuristic: if probability is high, more likely to graduate
    const notDropoutProb = probabilities.not_dropout || 0;
    const graduateProb = notDropoutProb * 0.7; // 70% chance to graduate
    const enrolledProb = notDropoutProb * 0.3; // 30% chance to remain enrolled
    
    return {
      prediction: graduateProb > enrolledProb ? 'Graduate' : 'Enrolled',
      probabilities: {
        Dropout: probabilities.dropout || 0,
        Graduate: graduateProb,
        Enrolled: enrolledProb
      }
    };
  }
  
  // Fallback
  return {
    prediction: 'Enrolled',
    probabilities: {
      Dropout: 0.33,
      Graduate: 0.33,
      Enrolled: 0.34
    }
  };
}

// Function to validate student data structure
function validateStudentData(studentData) {
  const required = ['age', 'gender', 'nationality', 'highschool_score', 
                   'entrance_exam_score_normalized', 'current_sem_cgpa', 
                   'aggregate_cgpa', 'parent_education'];
  
  const missing = required.filter(field => 
    studentData[field] === undefined || studentData[field] === null
  );
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  // Validate data types and ranges
  if (typeof studentData.age !== 'number' || studentData.age < 15 || studentData.age > 100) {
    throw new Error('Age must be a number between 15 and 100');
  }

  if (!['M', 'F', 'O'].includes(studentData.gender)) {
    throw new Error('Gender must be M, F, or O');
  }

  if (typeof studentData.current_sem_cgpa !== 'number' || 
      studentData.current_sem_cgpa < 0 || studentData.current_sem_cgpa > 10) {
    throw new Error('Current semester CGPA must be between 0 and 10');
  }

  return true;
}

// Function to convert structured data to features array for the model
function convertToFeatures(studentData) {
  // Handle missing values and set missing flags
  const setMissingFlag = (value) => (value === null || value === undefined) ? 1 : 0;
  const getValue = (value, defaultValue = 0) => 
    (value === null || value === undefined) ? defaultValue : value;

  return [
    studentData.age,
    studentData.gender,
    getValue(studentData.nationality, 1),
    getValue(studentData.highschool_score, 0),
    getValue(studentData.entrance_exam_score_normalized, 0),
    getValue(studentData.department),
    getValue(studentData.admission_type),
    getValue(studentData.attendance_pct),
    getValue(studentData.current_sem_cgpa, 0),
    getValue(studentData.aggregate_cgpa, 0),
    getValue(studentData.backlogs_count),
    getValue(studentData.family_income_bracket),
    getValue(studentData.parent_education, 0),
    getValue(studentData.scholarship_status, "none"),
    getValue(studentData.fee_payment_status, "on_time"),
    getValue(studentData.residence_type, "day_scholar"),
    getValue(studentData.commute_distance_km),
    setMissingFlag(studentData.department),
    setMissingFlag(studentData.admission_type),
    setMissingFlag(studentData.backlogs_count),
    setMissingFlag(studentData.scholarship_status),
    setMissingFlag(studentData.fee_payment_status),
    setMissingFlag(studentData.residence_type),
    setMissingFlag(studentData.family_income_bracket),
    setMissingFlag(studentData.commute_distance_km)
  ];
}

// Updated prediction endpoint - accepts both formats
router.post("/", async (req, res) => {
  try {
    let features, userInfo;

    // Check if request uses old format (features array) or new format (structured data)
    if (req.body.features && Array.isArray(req.body.features)) {
      // Old format - features array
      features = req.body.features;
      userInfo = req.body.userInfo;

      if (features.length !== 25 && features.length !== 35) {
        return res.status(400).json({
          error: "Invalid number of features",
          details: `Expected 25 features for unified model, received ${features.length}`
        });
      }

      // Validate that all features are numbers or valid strings for categorical
      const invalidFeatures = features.filter((f, index) => {
        // Categorical features can be strings
        const categoricalIndices = [1, 2, 5, 6, 11, 12, 13, 14, 15]; // Based on your model
        if (categoricalIndices.includes(index)) {
          return f === null || f === undefined;
        }
        return typeof f !== 'number' || isNaN(f);
      });

      if (invalidFeatures.length > 0) {
        return res.status(400).json({
          error: "Invalid feature values",
          details: "Features must be valid numbers or strings for categorical features",
          invalidCount: invalidFeatures.length
        });
      }

    } else {
      // New format - structured student data
      const studentData = req.body;
      userInfo = studentData.userData;

      // Validate structured data
      validateStudentData(studentData);

      // Convert to features array
      features = convertToFeatures(studentData);
    }
    console.log("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")

    // Forward prediction request to Python service with user data
    const rawPrediction = await predictionModel.predict(features, userInfo);
    console.log("hihelloefhefhehehififiehfirhi")

    // Map 2-class output to 3-class interface
    const mappedPrediction = mapToThreeClasses(
      rawPrediction.prediction, 
      rawPrediction.probabilities
    );

    // Calculate confidence (highest probability)
    const confidence = Math.max(...Object.values(mappedPrediction.probabilities));

    // Determine risk level
    let riskLevel = 'Low Risk';
    if (mappedPrediction.prediction === 'Dropout' && confidence > 0.7) {
      riskLevel = 'High Risk';
    } else if (mappedPrediction.prediction === 'Dropout') {
      riskLevel = 'Medium Risk';
    }

    // Save user data and prediction to database
    const userData = new UserData({
      name: userInfo?.name,
      email: userInfo?.email,
      studentId: userInfo?.studentId,
      features: features,
      prediction: {
        result: mappedPrediction.prediction,
        probabilities: mappedPrediction.probabilities,
        confidence: confidence,
        riskLevel: riskLevel
      },
      age: userInfo?.age,
      gender: userInfo?.gender,
      course: userInfo?.course,
    });

    await userData.save();

    res.json({
      success: true,
      prediction: mappedPrediction.prediction,
      probabilities: mappedPrediction.probabilities,
      confidence: confidence,
      risk_level: riskLevel,
      recordId: userData._id,
      timestamp: new Date().toISOString(),
      modelVersion: "catboost-unified-v1",
      features_used: features.length
    });
  } catch (error) {
    console.error("Prediction error:", error.message);
    
    // More specific error handling
    if (error.message.includes("not running") || error.message.includes("No response")) {
      return res.status(503).json({
        error: "Prediction service unavailable",
        details: "The machine learning service is currently down. Please try again later."
      });
    }

    if (error.message.includes("Missing required fields") || 
        error.message.includes("must be") || 
        error.message.includes("Invalid")) {
      return res.status(400).json({
        error: "Validation error",
        details: error.message
      });
    }

    res.status(500).json({
      error: "Prediction failed",
      details: error.message,
    });
  }
});

// Batch prediction endpoint - updated for both formats
router.post("/batch", async (req, res) => {
  try {
    const { predictions } = req.body;

    if (!predictions || !Array.isArray(predictions)) {
      return res.status(400).json({
        error: "Predictions array is required"
      });
    }

    if (predictions.length > 100) {
      return res.status(400).json({
        error: "Too many predictions",
        details: "Maximum 100 predictions per batch request"
      });
    }

    let featuresArray = [];
    let userInfoArray = [];

    // Process each prediction - handle both formats
    for (let i = 0; i < predictions.length; i++) {
      const pred = predictions[i];
      
      if (pred.features && Array.isArray(pred.features)) {
        // Old format
        if (pred.features.length !== 25) {
          return res.status(400).json({
            error: `Invalid feature count at index ${i}`,
            details: `Expected 25 features, got ${pred.features.length}`
          });
        }
        featuresArray.push(pred.features);
        userInfoArray.push(pred.userInfo);
      } else {
        // New format - structured data
        try {
          validateStudentData(pred);
          const features = convertToFeatures(pred);
          featuresArray.push(features);
          userInfoArray.push(pred.userData);
        } catch (error) {
          return res.status(400).json({
            error: `Invalid data at index ${i}`,
            details: error.message
          });
        }
      }
    }

    const rawResults = await predictionModel.batchPredict(featuresArray, userInfoArray);
    
    // Map all batch results
    const mappedResults = rawResults.predictions.map((result, index) => {
      const mapped = mapToThreeClasses(result.prediction, result.probabilities);
      const confidence = Math.max(...Object.values(mapped.probabilities));
      
      let riskLevel = 'Low Risk';
      if (mapped.prediction === 'Dropout' && confidence > 0.7) {
        riskLevel = 'High Risk';
      } else if (mapped.prediction === 'Dropout') {
        riskLevel = 'Medium Risk';
      }

      return {
        ...result,
        prediction: mapped.prediction,
        probabilities: mapped.probabilities,
        confidence: confidence,
        risk_level: riskLevel
      };
    });

    res.json({
      success: true,
      predictions: mappedResults,
      count: mappedResults.length,
      timestamp: new Date().toISOString(),
      modelVersion: "catboost-unified-v1"
    });
  } catch (error) {
    console.error("Batch prediction error:", error);
    res.status(500).json({
      error: "Batch prediction failed",
      details: error.message
    });
  }
});

// Model info endpoint - Updated for unified model
router.get("/model-info", async (req, res) => {
  try {
    const health = await predictionModel.healthCheck();
    
    res.json({
      model_type: "CatBoost Unified",
      input_features: 25,
      target_classes: ["Dropout", "Graduate", "Enrolled"], // Keep 3-class interface
      service_status: health.status,
      model_loaded: health.model_loaded || false,
      last_updated: "2024-01-01",
      version: "2.0.0",
      note: "Unified model with 25 features, supports both UCI and Kaggle datasets",
      supported_formats: ["structured_data", "features_array"],
      feature_description: {
        core_demographics: ["age", "gender", "nationality", "parent_education"],
        academic_scores: ["highschool_score", "entrance_exam_score_normalized", "current_sem_cgpa", "aggregate_cgpa"],
        enrollment_info: ["department", "admission_type", "attendance_pct", "backlogs_count"],
        financial_support: ["family_income_bracket", "scholarship_status", "fee_payment_status", "commute_distance_km"],
        housing: ["residence_type"],
        missing_flags: ["department_missing", "admission_type_missing", "backlogs_count_missing", "scholarship_status_missing", "fee_payment_status_missing", "residence_type_missing", "family_income_bracket_missing", "commute_distance_km_missing"]
      }
    });
  } catch (error) {
    res.json({
      model_type: "CatBoost Unified",
      input_features: 25,
      target_classes: ["Dropout", "Graduate", "Enrolled"],
      service_status: "unknown",
      model_loaded: false,
      error: "Unable to check service status"
    });
  }
});

// Health check endpoint for prediction service
router.get("/health", async (req, res) => {
  try {
    const health = await predictionModel.healthCheck();
    res.json({
      service: "Prediction API",
      status: "OK",
      python_service: health,
      model_version: "unified-v2",
      supported_input_formats: ["structured_data", "features_array"],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      service: "Prediction API",
      status: "ERROR",
      python_service: { status: "ERROR", error: error.message },
      timestamp: new Date().toISOString()
    });
  }
});

// New endpoint to get feature template
router.get("/feature-template", (req, res) => {
  res.json({
    structured_format: {
      age: 20,
      gender: "M",
      nationality: 1,
      highschool_score: 75.5,
      entrance_exam_score_normalized: 82.3,
      department: 171,
      admission_type: 17,
      attendance_pct: 85.5,
      current_sem_cgpa: 7.2,
      aggregate_cgpa: 7.1,
      backlogs_count: 0,
      family_income_bracket: null,
      parent_education: 19,
      scholarship_status: "none",
      fee_payment_status: "on_time",
      residence_type: "day_scholar",
      commute_distance_km: null,
      userData: {
        name: "Student Name",
        email: "student@university.edu",
        studentId: "STU001"
      }
    },
    features_array_format: {
      features: [20, "M", 1, 75.5, 82.3, 171, 17, 85.5, 7.2, 7.1, 0, null, 19, "none", "on_time", "day_scholar", null, 0, 0, 0, 0, 0, 0, 1, 1],
      userInfo: {
        name: "Student Name",
        email: "student@university.edu",
        studentId: "STU001"
      }
    },
    required_fields: ["age", "gender", "nationality", "highschool_score", "entrance_exam_score_normalized", "current_sem_cgpa", "aggregate_cgpa", "parent_education"],
    categorical_values: {
      gender: ["M", "F", "O"],
      scholarship_status: ["none", "scholarship"],
      fee_payment_status: ["on_time", "delayed"],
      residence_type: ["day_scholar", "hostel"]
    }
  });
});

module.exports = router;