import mongoose from "mongoose";

const interviewSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  interviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  candidateName: { type: String, default: "Unknown" }, // Helps Admin see who they interviewed
  
  // --- EXISTING FIELD FOR SCHEDULING ---
  scheduledDate: { type: Date }, 
  
  startTime: { type: Date, default: Date.now },
  endTime: Date,
  
  // --- EXISTING STATUSES ---
  status: { type: String, enum: ["Scheduled", "Live", "Completed"], default: "Live" },
  
  verdict: { type: String, enum: ["Pass", "Fail", "Pending"], default: "Pending" },

  // --- DATA FOR OUR PDF SCORECARDS ---
  languageUsed: { type: String, default: "python" },
  aiReview: { type: String, default: "" },
  proctoringLogs: { type: [String], default: [] },
  
  // --- NEW: QUESTION POOL & MULTI-CANDIDATE SUBMISSIONS ---
  questionPool: [{
    title: { type: String },
    description: { type: String }
  }],

  candidateSubmissions: [{
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    candidateName: { type: String, default: "Unknown Candidate" },
    assignedQuestion: {
      title: { type: String },
      description: { type: String }
    },
    submittedCode: { type: String, default: "" },
    output: { type: String, default: "" },
    verdict: { type: String, enum: ["Pass", "Fail", "Pending"], default: "Pending" },
    proctoringLogs: { type: [String], default: [] },
    aiReview: { type: String, default: "" },
    submittedAt: { type: Date }
  }],

  // --- NEW: INCREMENTAL SAVED ANSWERS ---
  savedAnswers: [{
      question: String,
      code: String,
      output: String
  }]
});

export const Interview = mongoose.model("Interview", interviewSchema);