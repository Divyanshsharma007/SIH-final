const express = require("express");
const router = express.Router();
const PredictionModel = require("../models/predictionModel");
const UserData = require("../models/User");

// Initialize Python model connector
const predictionModel = new PredictionModel();

// Map 2-class model output to 3-class interface
function mapToThreeClasses(predictionResult, probabilities) {
  if (predictionResult === 'dropout') {
    return {
      prediction: 'Dropout',
      probabilities: {
        Dropout: probabilities.dropout || 0,
        Graduate: (probabilities.not_dropout || 0) * 0.3,
        Enrolled: (probabilities.not_dropout || 0) * 0.7
      }
    };
  } else if (predictionResult === 'not_dropout') {
    const notDropoutProb = probabilities.not_dropout || 0;
    const graduateProb = notDropoutProb * 0.7;
    const enrolledProb = notDropoutProb * 0.3;
    return {
      prediction: graduateProb > enrolledProb ? 'Graduate' : 'Enrolled',
      probabilities: {
        Dropout: probabilities.dropout || 0,
        Graduate: graduateProb,
        Enrolled: enrolledProb
      }
    };
  }
  return {
    prediction: 'Enrolled',
    probabilities: { Dropout: 0.33, Graduate: 0.33, Enrolled: 0.34 }
  };
}

// Validate structured student data
function validateStudentData(studentData) {
  const required = ['age', 'gender', 'nationality', 'highschool_score',
    'entrance_exam_score_normalized', 'current_sem_cgpa',
    'aggregate_cgpa', 'parent_education'
  ];

  const missing = required.filter(field =>
    studentData[field] === undefined || studentData[field] === null
  );

  if (missing.length > 0) throw new Error(`Missing required fields: ${missing.join(', ')}`);

  if (typeof studentData.age !== 'number' || studentData.age < 15 || studentData.age > 100)
    throw new Error('Age must be a number between 15 and 100');

  if (!['M', 'F', 'O'].includes(studentData.gender))
    throw new Error('Gender must be M, F, or O');

  if (typeof studentData.current_sem_cgpa !== 'number' ||
    studentData.current_sem_cgpa < 0 || studentData.current_sem_cgpa > 10)
    throw new Error('Current semester CGPA must be between 0 and 10');

  return true;
}

function convertToFeatures(studentData) {
  const setMissingFlag = (value) => (value === null || value === undefined ? 1 : 0);
  const getValue = (value, defaultValue = 0) => (value === undefined || value === null ? defaultValue : value);

  const genderMap = { M: 1, F: 2, O: 3 };
  const scholarshipMap = { none: 0, scholarship: 1 };
  const residenceMap = { day_scholar: 0, hostel: 1 };
  const feePaymentMap = { on_time: 0, delayed: 1 };

  return [
    getValue(studentData.age),
    genderMap[getValue(studentData.gender, "M")],
    getValue(studentData.nationality, 1),
    getValue(studentData.highschool_score, 0),
    getValue(studentData.entrance_exam_score_normalized, 0),
    getValue(studentData.department, 0),
    getValue(studentData.admission_type, 0),
    getValue(studentData.family_income_bracket, 0),
    getValue(studentData.parent_education, 0),
    scholarshipMap[getValue(studentData.scholarship_status, "none")],
    residenceMap[getValue(studentData.residence_type, "day_scholar")],
    getValue(studentData.commute_distance_km, 0),
    getValue(studentData.current_sem_cgpa, 0),
    getValue(studentData.aggregate_cgpa, 0),
    getValue(studentData.backlogs_count, 0),
    getValue(studentData.attendance_pct, 0),
    feePaymentMap[getValue(studentData.fee_payment_status, "on_time")],
    setMissingFlag(studentData.department),
    setMissingFlag(studentData.admission_type),
    setMissingFlag(studentData.backlogs_count),
    setMissingFlag(studentData.scholarship_status),
    setMissingFlag(studentData.fee_payment_status),
    setMissingFlag(studentData.residence_type),
    setMissingFlag(studentData.family_income_bracket),
    setMissingFlag(studentData.commute_distance_km),
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0 // pad remaining features to reach 35
  ];
}

// Single prediction
router.post("/", async (req, res) => {
  try {
    const body = req.body;

    // Validate structured input
    validateStudentData(body);
    const userInfo = body.userData || {};

    // Send full structured object to Python service
    const rawPrediction = await predictionModel.predict(body, userInfo);

    // Map 2-class to 3-class
    const mappedPrediction = mapToThreeClasses(rawPrediction.prediction, rawPrediction.probabilities);
    const confidence = Math.max(...Object.values(mappedPrediction.probabilities));

    let riskLevel = 'Low Risk';
    if (mappedPrediction.prediction === 'Dropout' && confidence > 0.7) riskLevel = 'High Risk';
    else if (mappedPrediction.prediction === 'Dropout') riskLevel = 'Medium Risk';

    // Save user record
    const featuresArray = convertToFeatures(body); // store features for DB only
    const userDataRecord = new UserData({
      name: userInfo?.name,
      email: userInfo?.email,
      studentId: userInfo?.studentId,
      features: featuresArray,
      prediction: {
        result: mappedPrediction.prediction,
        probabilities: mappedPrediction.probabilities,
        confidence,
        riskLevel
      },
      age: userInfo?.age,
      gender: userInfo?.gender,
      course: userInfo?.course
    });
    await userDataRecord.save();

    res.json({
      success: true,
      prediction: mappedPrediction.prediction,
      probabilities: mappedPrediction.probabilities,
      confidence,
      risk_level: riskLevel,
      recordId: userDataRecord._id,
      timestamp: new Date().toISOString(),
      modelVersion: "catboost-unified-v1",
      features_used: featuresArray.length
    });

  } catch (error) {
    console.error("Prediction error:", error.message);
    res.status(400).json({ error: "Prediction failed", details: error.message });
  }
});

// Batch prediction
router.post("/batch", async (req, res) => {
  try {
    const { predictions } = req.body;

    if (!predictions || !Array.isArray(predictions))
      return res.status(400).json({ error: "Predictions array is required" });
    if (predictions.length > 100)
      return res.status(400).json({ error: "Maximum 100 predictions per batch" });

    const featuresArray = [];
    const userInfoArray = [];

    for (let i = 0; i < predictions.length; i++) {
      const pred = predictions[i];
      validateStudentData(pred);
      featuresArray.push(pred); // send full object to Python
      userInfoArray.push(pred.userData || {});
    }

    const rawResults = await predictionModel.batchPredict(featuresArray, userInfoArray);

    const mappedResults = rawResults.predictions.map((result, i) => {
      const mapped = mapToThreeClasses(result.prediction, result.probabilities);
      const confidence = Math.max(...Object.values(mapped.probabilities));
      let riskLevel = 'Low Risk';
      if (mapped.prediction === 'Dropout' && confidence > 0.7) riskLevel = 'High Risk';
      else if (mapped.prediction === 'Dropout') riskLevel = 'Medium Risk';

      return {
        ...result,
        prediction: mapped.prediction,
        probabilities: mapped.probabilities,
        confidence,
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
    res.status(400).json({ error: "Batch prediction failed", details: error.message });
  }
});

module.exports = router;
