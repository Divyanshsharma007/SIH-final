const mongoose = require("mongoose");

const userDataSchema = new mongoose.Schema(
  {
    // Basic user information
    name: {
      type: String,
      required: false,
      trim: true,
    },
    email: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address']
    },
    studentId: {
      type: String,
      required: false,
      trim: true,
    },

    // Prediction input features (all 35 features)
    features: {
      type: [Number],
      required: true,
      validate: {
        validator: function(features) {
          return features && features.length === 35;
        },
        message: "Must provide exactly 35 features"
      }
    },

    // Prediction results
    prediction: {
      result: {
        type: String,
        enum: ["Dropout", "Graduate", "Enrolled"],
        required: true,
      },
      probabilities: {
        Dropout: { 
          type: Number, 
          required: true,
          min: 0,
          max: 1
        },
        Graduate: { 
          type: Number, 
          required: true,
          min: 0,
          max: 1
        },
        Enrolled: { 
          type: Number, 
          required: true,
          min: 0,
          max: 1
        },
      },
      confidence: {
        type: Number,
        required: true,
        min: 0,
        max: 1
      },
    },

    // Additional metadata
    timestamp: {
      type: Date,
      default: Date.now,
    },
    modelVersion: {
      type: String,
      default: "catboost-v1",
    },

    // Optional: Additional student information
    age: {
      type: Number,
      required: false,
      min: 15,
      max: 100
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", null],
      required: false,
    },
    course: {
      type: String,
      required: false,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
userDataSchema.index({ timestamp: -1 });
userDataSchema.index({ studentId: 1 });
userDataSchema.index({ "prediction.result": 1 });
userDataSchema.index({ email: 1 });

// Add a virtual for formatted date
userDataSchema.virtual('formattedDate').get(function() {
  return this.timestamp.toLocaleDateString();
});

module.exports = mongoose.model("UserData", userDataSchema);