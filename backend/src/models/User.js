import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    image: { type: String, default: "" },
    
    // --- NEW FIELD: Role ---
    role: { 
      type: String, 
      enum: ["candidate","interviewer"], // Only allows these two values
      default: "candidate" // Everyone starts as a candidate
    },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);