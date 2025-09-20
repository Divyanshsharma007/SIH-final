from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator, Field
import pandas as pd
import joblib
import os
import sys
import logging
from typing import List, Optional
import numpy as np
import joblib
model = joblib.load("models/catboost-model.pkl")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(
    title="Student Dropout Prediction Service",
    description="CatBoost model for predicting student dropout risk",
    version="1.0.0"
)

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model variable
model = None
model_metadata = {}

# Load the model
def load_model():
    global model, model_metadata
    try:
        # Build the path relative to this file (app.py)
        model_path = os.path.join(os.path.dirname(__file__), "models", "catboost-model.pkl")

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"❌ Model file not found at: {model_path}")

        logger.info(f"Loading model from: {model_path}")
        model = joblib.load(model_path)

        # Extract model metadata
        if hasattr(model, "classes_"):
            model_metadata["classes"] = model.classes_.tolist()
            logger.info(f"Model classes: {model_metadata['classes']}")
        if hasattr(model, "n_features_in_"):
            model_metadata["n_features"] = model.n_features_in_
            logger.info(f"Model features: {model_metadata['n_features']}")
        if hasattr(model, "feature_names_"):
            model_metadata["feature_names"] = model.feature_names_
            logger.info(f"Model feature names: {model.feature_names_}")

        debug_model_features()
        logger.info("✅ Model loaded successfully")
        print("✅ Model loaded. Feature names:", model.feature_names_)

    except Exception as e:
        logger.error(f"❌ Error loading model: {str(e)}")
        model = None

# Debug function to identify categorical features
def debug_model_features():
    try:
        if hasattr(model, 'get_cat_feature_indices'):
            cat_features = model.get_cat_feature_indices()
            logger.info(f"📊 Categorical feature indices: {cat_features}")
            model_metadata['categorical_features'] = cat_features
            return cat_features
        else:
            logger.info("ℹ  Model doesn't have cat feature info, trying to extract from model")
            # Try to get from CatBoost model directly
            if hasattr(model, '_cat_features'):
                cat_features = model._cat_features
                logger.info(f"📊 Found categorical features: {cat_features}")
                model_metadata['categorical_features'] = cat_features
                return cat_features
            else:
                logger.info("ℹ  Using conservative approach - identifying likely categorical features")
                # Based on your dataset, these are likely categorical
                categorical_features = [1, 2, 5, 6, 11, 12, 13, 14, 15]  # indices for categorical columns
                model_metadata['categorical_features'] = categorical_features
                return categorical_features
    except Exception as e:
        logger.warning(f"⚠ Could not determine categorical features: {str(e)}")
        return []

# Load model on startup
load_model()

# Request body schemas
class UserData(BaseModel):
    name: Optional[str] = Field(None, description="Student name")
    email: Optional[str] = Field(None, description="Student email")
    studentId: Optional[str] = Field(None, description="Student ID")

    @validator('email')
    def validate_email(cls, v):
        if v is not None:
            import re
            email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            if not re.match(email_regex, v):
                raise ValueError('Invalid email format')
        return v

class PredictionRequest(BaseModel):
    age: float = Field(..., ge=15, le=100)
    gender: str = Field(..., description="M, F, O")
    nationality: int = Field(...)
    highschool_score: float = Field(..., ge=0, le=100)
    entrance_exam_score_normalized: float = Field(..., ge=0, le=100)
    department: Optional[int] = None
    admission_type: Optional[int] = None
    family_income_bracket: Optional[int] = None
    parent_education: int = Field(...)
    scholarship_status: Optional[str] = None
    residence_type: Optional[str] = None
    commute_distance_km: Optional[float] = None
    department_missing: int = Field(0, ge=0, le=1)
    admission_type_missing: int = Field(0, ge=0, le=1)
    backlogs_count_missing: int = Field(0, ge=0, le=1)
    scholarship_status_missing: int = Field(0, ge=0, le=1)
    fee_payment_status_missing: int = Field(0, ge=0, le=1)
    residence_type_missing: int = Field(0, ge=0, le=1)
    family_income_bracket_missing: int = Field(1, ge=0, le=1)
    commute_distance_km_missing: int = Field(1, ge=0, le=1)
    
    userData: Optional[UserData] = None

    @validator('gender')
    def validate_gender(cls, v):
        if v not in ["M", "F", "O"]:
            raise ValueError('gender must be one of: "M", "F", "O"')
        return v

    @validator('scholarship_status')
    def validate_scholarship(cls, v):
        if v is not None and v not in ["none", "scholarship"]:
            raise ValueError('scholarship_status must be one of: "none", "scholarship"')
        return v

    @validator('residence_type')
    def validate_residence(cls, v):
        if v is not None and v not in ["day_scholar", "hostel"]:
            raise ValueError('residence_type must be one of: "day_scholar", "hostel"')
        return v

class BatchPredictionRequest(BaseModel):
    predictions: List[PredictionRequest]

# Health check endpoint
@app.get("/health")
async def health_check():
    feature_names = model_metadata.get('feature_names', [])
    status = 'OK' if model is not None else 'ERROR'
    return {
        'status': status,
        'model_loaded': model is not None,
        'model_features': len(feature_names),   # number of features
        'model_feature_names': feature_names,   # list of feature names
        'model_classes': model_metadata.get('classes', 'unknown'),
        'categorical_features': model_metadata.get('categorical_features', 'unknown'),
        'service': 'Student Dropout Prediction API'
    }


# Model info endpoint
@app.get("/model-info")
async def model_info():
    return {
        'model_type': 'CatBoostClassifier',
        'input_features': 25,  # Updated feature count including missing flags
        'target_classes': model_metadata.get('classes', ['dropout', 'not_dropout']),
        'status': 'loaded' if model is not None else 'not_loaded',
        'metadata': model_metadata,
        'feature_description': {
            'age': 'Student age (15-100)',
            'gender': 'Gender: M, F, or O',
            'nationality': 'Nationality code',
            'highschool_score': 'High school score (0-100)',
            'entrance_exam_score_normalized': 'Entrance exam score normalized (0-100)',
            'department': 'Department code (optional)',
            'admission_type': 'Admission type code (optional)',
            'attendance_pct': 'Attendance percentage (optional)',
            'current_sem_cgpa': 'Current semester CGPA (0-10)',
            'aggregate_cgpa': 'Aggregate CGPA (0-10)',
            'backlogs_count': 'Number of backlogs (optional)',
            'family_income_bracket': 'Family income bracket (optional)',
            'parent_education': 'Highest parent education level',
            'scholarship_status': 'Scholarship status (optional)',
            'fee_payment_status': 'Fee payment status (optional)',
            'residence_type': 'Residence type (optional)',
            'commute_distance_km': 'Commute distance in km (optional)'
        }
    }

# Get the correct feature names based on your unified dataset
def get_feature_names():
    """Return the exact feature names expected by the loaded model."""
    if model_metadata.get('feature_names'):
        return model_metadata['feature_names']
    
    # Fallback: if model has n_features_in_ but no names, generate generic names
    if hasattr(model, 'n_features_in_'):
        return [f'feature_{i}' for i in range(model.n_features_in_)]
    
    raise ValueError("Model feature names not available. Cannot create DataFrame for prediction.")


def prepare_features(data: PredictionRequest):
    features = [
        data.age,
        data.gender,
        data.nationality,
        data.highschool_score,
        data.entrance_exam_score_normalized,
        data.department if data.department is not None else np.nan,
        data.admission_type if data.admission_type is not None else np.nan,
        data.family_income_bracket if data.family_income_bracket is not None else np.nan,
        data.parent_education,
        data.scholarship_status if data.scholarship_status is not None else np.nan,
        data.residence_type if data.residence_type is not None else np.nan,
        data.commute_distance_km if data.commute_distance_km is not None else np.nan,
        data.department_missing,
        data.admission_type_missing,
        data.backlogs_count_missing,
        data.scholarship_status_missing,
        data.fee_payment_status_missing,
        data.residence_type_missing,
        data.family_income_bracket_missing,
        data.commute_distance_km_missing
    ]
    return features

# Single prediction endpoint
@app.post("/predict")
async def predict(data: PredictionRequest):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded. Please check the service status.")
    
    user_data = data.userData

    # Log user data if provided
    if user_data:
        user_info = user_data.model_dump(exclude_unset=True)
        logger.info(f"User data received: {user_info}")
    else:
        logger.info("No user data provided")

    # Get correct feature names
    feature_names = get_feature_names()
    
    try:
        # Get categorical features from model
        categorical_features = model_metadata.get('categorical_features', [])
        
        # Prepare features from request
        features = prepare_features(data)
        
        # Log the raw features for debugging
        logger.info(f"Raw features received: {features[:5]}...")  # Log first 5 for brevity
        logger.info(f"Categorical feature indices: {categorical_features}")
        
        # Process features - be more careful with type conversion
        processed_features = []
        for i, feature_value in enumerate(features):
            if i in categorical_features:
                # For categorical features, ensure they're handled properly
                if pd.isna(feature_value) or feature_value is None:
                    processed_features.append("nan")  # CatBoost can handle string "nan"
                else:
                    processed_features.append(str(feature_value))
            else:
                # For numerical features, ensure they're floats
                try:
                    if pd.isna(feature_value) or feature_value is None:
                        processed_features.append(np.nan)
                    else:
                        processed_features.append(float(feature_value))
                except (ValueError, TypeError):
                    logger.warning(f"Could not convert feature {i} to float, using NaN")
                    processed_features.append(np.nan)
        
        logger.info(f"Processed features: {processed_features[:5]}...")  # Log first 5 for brevity
        
        # Create DataFrame with correct feature names
        df = pd.DataFrame([processed_features], columns=feature_names)

        expected_cols = model_metadata.get('feature_names', [])
        df = df[expected_cols]
        
        logger.info(f"DataFrame shape: {df.shape}")
        logger.info(f"DataFrame columns: {list(df.columns)}")
        logger.info(f"First few values: {df.iloc[0, :5].tolist()}")
        
        # Make prediction
        try:
            prediction = model.predict(df)
            probabilities = model.predict_proba(df)
            
            logger.info(f"Raw prediction: {prediction}")
            logger.info(f"Raw probabilities shape: {probabilities.shape}")
            
        except Exception as pred_error:
            logger.error(f"Prediction failed: {str(pred_error)}")
            
            # Try alternative approach - pass as numpy array
            logger.info("Trying alternative prediction method with numpy array...")
            
            # Convert categorical features for numpy array approach
            numpy_features = []
            for i, feature_value in enumerate(processed_features):
                if i in categorical_features:
                    if isinstance(feature_value, str) and feature_value != "nan":
                        # Convert categorical strings to integers for numpy approach
                        try:
                            numpy_features.append(hash(feature_value) % 1000)  # Simple hash to int
                        except:
                            numpy_features.append(0)
                    else:
                        numpy_features.append(0)
                else:
                    numpy_features.append(feature_value if not pd.isna(feature_value) else 0.0)
            
            processed_array = np.array(numpy_features).reshape(1, -1)
            prediction = model.predict(processed_array)
            probabilities = model.predict_proba(processed_array)

        # Use actual model classes
        actual_classes = model_metadata.get('classes', ['dropout', 'not_dropout'])
        
        # Create class mapping
        class_mapping = {}
        for i, class_name in enumerate(actual_classes):
            class_mapping[i] = class_name

        predicted_class = class_mapping.get(prediction[0], 'Unknown')

        response = {
            'prediction': predicted_class,
            'probabilities': {
                class_mapping[i]: float(probabilities[0][i])
                for i in range(len(actual_classes))
            },
            'confidence': float(np.max(probabilities[0])),
            'risk_level': 'High Risk' if predicted_class == 'dropout' and np.max(probabilities[0]) > 0.7 else 
                        'Medium Risk' if predicted_class == 'dropout' else 'Low Risk'
        }

        # Include user data in response if provided
        if user_data:
            response['userData'] = user_data.model_dump(exclude_unset=True)

        logger.info(f"✅ Prediction made: {predicted_class} (confidence: {response['confidence']:.3f})")
        return response

    except Exception as e:
        logger.error(f"❌ Prediction error: {str(e)}")
        logger.error(f"Error type: {type(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

# Batch prediction endpoint
@app.post("/batch-predict")
async def batch_predict(batch_data: BatchPredictionRequest):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    if len(batch_data.predictions) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 predictions per batch request")

    results = []
    feature_names = get_feature_names()

    try:
        # Prepare all features for batch prediction
        all_features = []
        user_data_list = []
        categorical_features = model_metadata.get('categorical_features', [])
        
        for i, pred_request in enumerate(batch_data.predictions):
            # Prepare features from request
            features = prepare_features(pred_request)
            
            # Process features (convert categorical to string, numerical to float)
            processed_features = []
            for j, feature_value in enumerate(features):
                if j in categorical_features:
                    if pd.isna(feature_value) or feature_value is None:
                        processed_features.append("nan")
                    else:
                        processed_features.append(str(feature_value))
                else:
                    if pd.isna(feature_value) or feature_value is None:
                        processed_features.append(np.nan)
                    else:
                        try:
                            processed_features.append(float(feature_value))
                        except (ValueError, TypeError):
                            processed_features.append(np.nan)
            
            all_features.append(processed_features)
            user_data_list.append(pred_request.userData)

        # Create DataFrame for batch prediction
        df = pd.DataFrame(all_features, columns=get_feature_names())
        expected_cols = model_metadata.get('feature_names', [])
        df = df[expected_cols]

        
        # Make batch predictions
        try:
            predictions = model.predict(df)
            probabilities = model.predict_proba(df)
        except Exception as pred_error:
            logger.error(f"Batch prediction failed with DataFrame, trying numpy array: {str(pred_error)}")
            
            # Convert to numpy array with categorical handling
            numpy_batch = []
            for processed_features in all_features:
                numpy_features = []
                for j, feature_value in enumerate(processed_features):
                    if j in categorical_features:
                        if isinstance(feature_value, str) and feature_value != "nan":
                            try:
                                numpy_features.append(hash(feature_value) % 1000)
                            except:
                                numpy_features.append(0)
                        else:
                            numpy_features.append(0)
                    else:
                        numpy_features.append(feature_value if not pd.isna(feature_value) else 0.0)
                numpy_batch.append(numpy_features)
            
            processed_array = np.array(numpy_batch)
            predictions = model.predict(processed_array)
            probabilities = model.predict_proba(processed_array)

        # Use actual model classes
        actual_classes = model_metadata.get('classes', ['dropout', 'not_dropout'])
        class_mapping = {i: class_name for i, class_name in enumerate(actual_classes)}

        # Format results
        for i, (pred, prob) in enumerate(zip(predictions, probabilities)):
            predicted_class = class_mapping.get(pred, 'Unknown')
            confidence = float(np.max(prob))
            
            result = {
                'prediction': predicted_class,
                'probabilities': {
                    class_mapping[j]: float(prob[j])
                    for j in range(len(actual_classes))
                },
                'confidence': confidence,
                'risk_level': 'High Risk' if predicted_class == 'dropout' and confidence > 0.7 else 
                            'Medium Risk' if predicted_class == 'dropout' else 'Low Risk',
                'index': i
            }
            
            if user_data_list[i]:
                result['userData'] = user_data_list[i].model_dump(exclude_unset=True)
            
            results.append(result)

        logger.info(f"✅ Batch prediction completed: {len(results)} predictions")
        return {'predictions': results}

    except Exception as e:
        logger.error(f"❌ Batch prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Batch prediction failed: {str(e)}")

# Startup event
@app.on_event("startup")
async def startup_event():
    logger.info("🚀 Starting Student Dropout Prediction Service...")
    logger.info(f"Python version: {sys.version}")
    logger.info(f"Working directory: {os.getcwd()}")
    logger.info(f"Model status: {'Loaded' if model is not None else 'Not loaded'}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=5001,
        log_level="info"
    )