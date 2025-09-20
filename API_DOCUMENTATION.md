# Student Dropout Prediction API Documentation

## Overview
This API provides machine learning-based predictions for student dropout risk using a CatBoost model. The system consists of a Node.js backend that interfaces with a Python FastAPI service for ML predictions.

**Base URL**: `http://localhost:3000` (Node.js Backend)  
**Python Service URL**: `http://localhost:5000` (FastAPI Service)

---

## Table of Contents
1. [Quick Route Summary](#quick-route-summary)
2. [Authentication](#authentication)
3. [Node.js Backend Routes](#nodejs-backend-routes)
4. [Python Service Routes](#python-service-routes)
5. [Data Models](#data-models)
6. [Error Handling](#error-handling)
7. [Examples](#examples)

---

## Quick Route Summary

### Node.js Backend Routes (`http://localhost:3000`)

| Method | Endpoint | Full URL | Description | Key Features |
|--------|----------|----------|-------------|--------------|
| `GET` | `/health` | `http://localhost:3000/health` | Main API health check | Service status |
| `POST` | `/api/predict/` | `http://localhost:3000/api/predict/` | Single prediction | 35 features + user data |
| `POST` | `/api/predict/batch` | `http://localhost:3000/api/predict/batch` | Batch predictions | Up to 100 predictions |
| `GET` | `/api/predict/model-info` | `http://localhost:3000/api/predict/model-info` | Model information | CatBoost details |
| `GET` | `/api/predict/health` | `http://localhost:3000/api/predict/health` | Prediction service health | Python service status |
| `GET` | `/api/history/` | `http://localhost:3000/api/history/` | Get prediction history | Pagination + filtering |
| `GET` | `/api/history/:id` | `http://localhost:3000/api/history/:id` | Get specific prediction | By database ID |
| `GET` | `/api/history/stats/summary` | `http://localhost:3000/api/history/stats/summary` | Prediction statistics | Counts and percentages |

### Python Service Routes (`http://localhost:5000`)

| Method | Endpoint | Full URL | Description | Key Features |
|--------|----------|----------|-------------|--------------|
| `GET` | `/health` | `http://localhost:5000/health` | Service health check | Model status + metadata |
| `GET` | `/model-info` | `http://localhost:5000/model-info` | Detailed model info | CatBoost classifier details |
| `POST` | `/predict` | `http://localhost:5000/predict` | Single ML prediction | Direct model access |
| `POST` | `/batch-predict` | `http://localhost:5000/batch-predict` | Batch ML predictions | Up to 100 predictions |

### Quick Reference

**Main Prediction Flow:**
1. `POST /api/predict/` → Node.js validates → Calls Python `/predict` → Returns result + saves to DB

**Data Requirements:**
- **Features**: Array of 35 numbers (required)
- **User Data**: Optional object with name, email, studentId, age, gender, course
- **Predictions**: "Dropout", "Graduate", or "Enrolled"

**Key Endpoints for Different Use Cases:**
- **Single Prediction**: `POST http://localhost:3000/api/predict/`
- **Multiple Predictions**: `POST http://localhost:3000/api/predict/batch`
- **View History**: `GET http://localhost:3000/api/history/`
- **Get Statistics**: `GET http://localhost:3000/api/history/stats/summary`
- **Check Health**: `GET http://localhost:3000/health` or `GET http://localhost:3000/api/predict/health`

---

## Authentication
Currently, no authentication is required for any endpoints.

---

## Node.js Backend Routes

### Health Check
**GET** `/health`

Check if the main API service is running.

**Response:**
```json
{
  "status": "OK",
  "message": "Dropout Prediction API is running",
  "model": "CatBoost (served via Python)"
}
```

---

### Prediction Routes (`/api/predict`)

#### 1. Single Prediction
**POST** `/api/predict/`

Make a single student dropout prediction.

**Request Body:**
```json
{
  "features": [1, 2, 3, ...], // Array of 35 numerical features
  "userInfo": {
    "name": "John Doe",
    "email": "john@example.com",
    "studentId": "STU001",
    "age": 20,
    "gender": "Male",
    "course": "Computer Science"
  }
}
```

**Response:**
```json
{
  "success": true,
  "prediction": "Graduate",
  "probabilities": {
    "Dropout": 0.15,
    "Graduate": 0.70,
    "Enrolled": 0.15
  },
  "confidence": 0.70,
  "recordId": "64f8a1b2c3d4e5f6a7b8c9d0",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "modelVersion": "catboost-v1"
}
```

**Error Responses:**
- `400` - Invalid features array or count
- `503` - Prediction service unavailable
- `500` - Internal server error

#### 2. Batch Prediction
**POST** `/api/predict/batch`

Make multiple predictions in a single request.

**Request Body:**
```json
{
  "predictions": [
    {
      "features": [1, 2, 3, ...],
      "userInfo": {
        "name": "John Doe",
        "email": "john@example.com"
      }
    },
    {
      "features": [4, 5, 6, ...],
      "userInfo": {
        "name": "Jane Smith",
        "email": "jane@example.com"
      }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "predictions": [
    {
      "prediction": "Graduate",
      "probabilities": {...},
      "confidence": 0.70
    }
  ],
  "count": 2,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Limits:**
- Maximum 100 predictions per batch request

#### 3. Model Information
**GET** `/api/predict/model-info`

Get information about the ML model.

**Response:**
```json
{
  "model_type": "CatBoost",
  "input_features": 35,
  "target_classes": ["Dropout", "Graduate", "Enrolled"],
  "service_status": "OK",
  "model_loaded": true,
  "last_updated": "2024-01-01",
  "version": "1.0.0"
}
```

#### 4. Prediction Service Health
**GET** `/api/predict/health`

Check the health of the prediction service.

**Response:**
```json
{
  "service": "Prediction API",
  "status": "OK",
  "python_service": {
    "status": "OK",
    "model_loaded": true,
    "catboost_available": true
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### History Routes (`/api/history`)

#### 1. Get All Predictions
**GET** `/api/history/`

Retrieve prediction history with pagination and filtering.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `prediction` (optional): Filter by prediction result ("Dropout", "Graduate", "Enrolled")

**Example:** `/api/history/?page=1&limit=5&prediction=Dropout`

**Response:**
```json
{
  "predictions": [
    {
      "_id": "64f8a1b2c3d4e5f6a7b8c9d0",
      "name": "John Doe",
      "email": "john@example.com",
      "studentId": "STU001",
      "features": [1, 2, 3, ...],
      "prediction": {
        "result": "Graduate",
        "probabilities": {...},
        "confidence": 0.70
      },
      "age": 20,
      "gender": "Male",
      "course": "Computer Science",
      "timestamp": "2024-01-15T10:30:00.000Z",
      "modelVersion": "catboost-v1",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "totalPages": 5,
  "currentPage": 1,
  "total": 50
}
```

#### 2. Get Prediction by ID
**GET** `/api/history/:id`

Retrieve a specific prediction by its database ID.

**Response:**
```json
{
  "_id": "64f8a1b2c3d4e5f6a7b8c9d0",
  "name": "John Doe",
  "email": "john@example.com",
  "studentId": "STU001",
  "features": [1, 2, 3, ...],
  "prediction": {
    "result": "Graduate",
    "probabilities": {
      "Dropout": 0.15,
      "Graduate": 0.70,
      "Enrolled": 0.15
    },
    "confidence": 0.70
  },
  "age": 20,
  "gender": "Male",
  "course": "Computer Science",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "modelVersion": "catboost-v1"
}
```

**Error Responses:**
- `404` - Prediction not found
- `500` - Internal server error

#### 3. Get Prediction Statistics
**GET** `/api/history/stats/summary`

Get summary statistics of all predictions.

**Response:**
```json
{
  "totalPredictions": 1000,
  "dropoutCount": 150,
  "graduateCount": 700,
  "enrolledCount": 150,
  "dropoutPercentage": "15.00",
  "graduatePercentage": "70.00",
  "enrolledPercentage": "15.00"
}
```

---

## Python Service Routes

### Health Check
**GET** `/health`

Check Python service health and model status.

**Response:**
```json
{
  "status": "OK",
  "model_loaded": true,
  "catboost_available": true,
  "model_features": 35,
  "model_classes": [0, 1, 2],
  "service": "Student Dropout Prediction API"
}
```

### Model Information
**GET** `/model-info`

Get detailed model information.

**Response:**
```json
{
  "model_type": "CatBoostClassifier",
  "input_features": 35,
  "target_classes": ["Dropout", "Graduate", "Enrolled"],
  "status": "loaded",
  "metadata": {
    "classes": [0, 1, 2],
    "n_features": 35
  }
}
```

### Single Prediction
**POST** `/predict`

Make a single prediction (called by Node.js backend).

**Request Body:**
```json
{
  "features": [1, 2, 3, ...],
  "userData": {
    "name": "John Doe",
    "email": "john@example.com",
    "studentId": "STU001",
    "age": 20,
    "gender": "Male",
    "course": "Computer Science"
  }
}
```

**Response:**
```json
{
  "prediction": "Graduate",
  "probabilities": {
    "Dropout": 0.15,
    "Graduate": 0.70,
    "Enrolled": 0.15
  },
  "confidence": 0.70,
  "userData": {
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

### Batch Prediction
**POST** `/batch-predict`

Make multiple predictions in batch.

**Request Body:**
```json
{
  "predictions": [
    {
      "features": [1, 2, 3, ...],
      "userData": {...}
    }
  ]
}
```

**Response:**
```json
{
  "predictions": [
    {
      "prediction": "Graduate",
      "probabilities": {...},
      "confidence": 0.70,
      "index": 0,
      "userData": {...}
    }
  ]
}
```

---

## Data Models

### User Data Schema
```json
{
  "name": "string (optional)",
  "email": "string (optional, validated format)",
  "studentId": "string (optional)",
  "age": "number (optional, 15-100)",
  "gender": "string (optional, enum: Male|Female|Other)",
  "course": "string (optional)"
}
```

### Features Array
- **Type**: Array of 35 numbers
- **Required**: Yes
- **Validation**: All values must be numeric

### Prediction Result
```json
{
  "result": "string (enum: Dropout|Graduate|Enrolled)",
  "probabilities": {
    "Dropout": "number (0-1)",
    "Graduate": "number (0-1)",
    "Enrolled": "number (0-1)"
  },
  "confidence": "number (0-1, highest probability)"
}
```

---

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "error": "Invalid number of features",
  "details": "Expected 35 features, received 30"
}
```

#### 404 Not Found
```json
{
  "error": "Prediction not found"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Prediction failed",
  "details": "Model prediction error"
}
```

#### 503 Service Unavailable
```json
{
  "error": "Prediction service unavailable",
  "details": "The machine learning service is currently down"
}
```

---

## Examples

### Example 1: Basic Prediction Request
```bash
curl -X POST http://localhost:3000/api/predict/ \
  -H "Content-Type: application/json" \
  -d '{
    "features": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    "userInfo": {
      "name": "John Doe",
      "email": "john@example.com",
      "studentId": "STU001"
    }
  }'
```

### Example 2: Get Prediction History
```bash
curl -X GET "http://localhost:3000/api/history/?page=1&limit=5"
```

### Example 3: Get Statistics
```bash
curl -X GET http://localhost:3000/api/history/stats/summary
```

### Example 4: Health Check
```bash
curl -X GET http://localhost:3000/health
```

---

## Feature Names Reference

The 35 features correspond to the following student attributes:

1. Marital status
2. Application mode
3. Application order
4. Course
5. Daytime/evening attendance
6. Previous qualification
7. Nacionality
8. Mother's qualification
9. Father's qualification
10. Mother's occupation
11. Father's occupation
12. Displaced
13. Educational special needs
14. Debtor
15. Tuition fees up to date
16. Gender
17. Scholarship holder
18. Age at enrollment
19. International
20. Curricular units 1st sem (credited)
21. Curricular units 1st sem (enrolled)
22. Curricular units 1st sem (evaluations)
23. Curricular units 1st sem (approved)
24. Curricular units 1st sem (grade)
25. Curricular units 1st sem (without evaluations)
26. Curricular units 2nd sem (credited)
27. Curricular units 2nd sem (enrolled)
28. Curricular units 2nd sem (evaluations)
29. Curricular units 2nd sem (approved)
30. Curricular units 2nd sem (grade)
31. Curricular units 2nd sem (without evaluations)
32. Unemployment rate
33. Inflation rate
34. GDP
35. Application year

---

## Rate Limits
- No rate limits currently implemented
- Batch predictions limited to 100 requests per call

## CORS
- CORS is enabled for all origins
- All HTTP methods and headers are allowed

---

*Last updated: January 2024*
