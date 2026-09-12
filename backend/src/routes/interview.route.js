import express from "express";
import { Interview } from "../models/Interview.js";
import { User } from "../models/User.js"; 
import nodemailer from "nodemailer"; 
import * as ics from "ics"; 

const router = express.Router();

// --- NEW: CONFIGURE EMAIL TRANSPORTER ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// 1. START OR JOIN Interview
router.post("/start", async (req, res) => {
  const { roomId, candidateId, interviewerId, candidateName, questionPool } = req.body;
  
  try {
    const updateData = {};
    if (candidateId) updateData.candidateId = candidateId;
    if (interviewerId) updateData.interviewerId = interviewerId;
    if (candidateName) updateData.candidateName = candidateName;
    if (questionPool && Array.isArray(questionPool)) updateData.questionPool = questionPool;

    updateData.status = "Live"; 

    const interview = await Interview.findOneAndUpdate(
      { roomId }, 
      { $set: updateData }, 
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json(interview);
  } catch (error) {
    console.error("Error starting interview:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// 2. END Interview 
router.post("/end", async (req, res) => {
  const { roomId, verdict } = req.body;
  try {
    const interview = await Interview.findOneAndUpdate(
      { roomId },
      { 
        endTime: Date.now(), 
        status: "Completed",
        verdict: verdict || "Pending"
      },
      { new: true }
    );
    res.status(200).json(interview);
  } catch (error) {
    res.status(500).json({ message: "Error ending interview" });
  }
});

// 3. GET HISTORY 
router.get("/history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const interviews = await Interview.find({
      $or: [{ candidateId: userId }, { interviewerId: userId }],
      status: "Completed" 
    }).sort({ startTime: -1 }); 

    res.json(interviews);
  } catch (error) {
    res.status(500).json({ message: "Error fetching history" });
  }
});

// 4. --- UPGRADED: SCHEDULE INTERVIEW & SEND CALENDAR INVITE ---
router.post("/schedule", async (req, res) => {
    const { email, scheduledDate, interviewerId, questionPool } = req.body;
    try {
        const candidate = await User.findOne({ email });
        
        if (!candidate) {
            return res.status(404).json({ message: "Candidate not found! Please check the email." });
        }

        const roomId = Math.random().toString(36).substring(2, 9);
        const meetingLink = `http://192.168.1.15:5174/interview/${roomId}`; 

        const newInterview = new Interview({
            roomId,
            candidateId: candidate._id,
            candidateName: candidate.name,
            interviewerId,
            scheduledDate,
            questionPool: questionPool || [],
            status: "Scheduled"
        });

        await newInterview.save();

        // --- GENERATE CALENDAR EVENT (.ICS) ---
        const dateObj = new Date(scheduledDate);
        
        // ICS requires date format: [Year, Month, Day, Hour, Minute] (Month is 1-indexed here)
        const eventDetails = {
            start: [dateObj.getFullYear(), dateObj.getMonth() + 1, dateObj.getDate(), dateObj.getHours(), dateObj.getMinutes()],
            duration: { hours: 1, minutes: 0 }, // Defaults to a 1 hour block
            title: 'Technical Interview - Talent Flow',
            description: `You have been invited to a technical interview on Talent Flow.\n\nPlease join using this link at the scheduled time:\n${meetingLink}`,
            location: 'Talent Flow Virtual Room',
            url: meetingLink,
            status: 'CONFIRMED',
            organizer: { name: 'Talent Flow Admin', email: process.env.EMAIL_USER },
            attendees: [{ name: candidate.name, email: email, rsvp: true }]
        };

        ics.createEvent(eventDetails, async (error, icsContent) => {
            if (error) {
                console.error("Calendar generation error:", error);
                return;
            }

            // --- SEND THE EMAIL ---
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: "Invitation: Technical Interview - Talent Flow",
                text: `Hello ${candidate.name},\n\nYour technical interview has been successfully scheduled.\n\nDate: ${dateObj.toLocaleString()}\nMeeting Link: ${meetingLink}\n\nWe have attached a calendar invite to this email. Please click "Accept" or open the attachment to add it to your schedule.\n\nBest regards,\nTalent Flow Team`,
                icalEvent: {
                    filename: 'interview-invite.ics',
                    method: 'request',
                    content: icsContent 
                }
            };

            try {
                await transporter.sendMail(mailOptions);
                console.log("Scheduling email and calendar invite sent successfully!");
            } catch (emailErr) {
                console.error("Failed to send email:", emailErr);
            }
        });

        res.status(200).json(newInterview);
    } catch (error) {
        console.error("Error scheduling:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
});

// 5. GET UPCOMING INTERVIEWS
router.get("/upcoming/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const upcoming = await Interview.find({
            $or: [{ candidateId: userId }, { interviewerId: userId }],
            status: "Scheduled"
        }).sort({ scheduledDate: 1 }); 
        
        res.json(upcoming);
    } catch (error) {
        res.status(500).json({ message: "Error fetching upcoming sessions" });
    }
});

// 6. CANCEL/DELETE SCHEDULED INTERVIEW
router.delete("/cancel/:roomId", async (req, res) => {
    try {
        const { roomId } = req.params;
        const deletedInterview = await Interview.findOneAndDelete({ roomId });
        
        if (!deletedInterview) {
            return res.status(404).json({ message: "Interview not found" });
        }
        
        res.status(200).json({ message: "Interview cancelled successfully" });
    } catch (error) {
        console.error("Error cancelling interview:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
});

// 7. RESCHEDULE INTERVIEW
router.put("/reschedule/:roomId", async (req, res) => {
    try {
        const { roomId } = req.params;
        const { scheduledDate } = req.body;

        const updatedInterview = await Interview.findOneAndUpdate(
            { roomId },
            { $set: { scheduledDate } },
            { new: true } 
        );

        if (!updatedInterview) {
            return res.status(404).json({ message: "Interview not found" });
        }

        res.status(200).json(updatedInterview);
    } catch (error) {
        console.error("Error rescheduling:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
});

// 8. SAVE INDIVIDUAL ANSWER DURING INTERVIEW
router.post("/save-answer", async (req, res) => {
    try {
        const { roomId, question, code, output } = req.body;
        
        const updatedInterview = await Interview.findOneAndUpdate(
            { roomId },
            { 
                $push: { 
                    savedAnswers: { question, code, output } 
                } 
            },
            { new: true }
        );

        res.status(200).json(updatedInterview);
    } catch (error) {
        console.error("Error saving answer:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
});

// 9. SAVE AI REVIEW 
router.post("/save-ai-review", async (req, res) => {
    try {
        const { roomId, aiReview } = req.body;
        
        const interview = await Interview.findOne({ roomId });
        
        let newReviewText = aiReview;
        if (interview && interview.aiReview && interview.aiReview.trim() !== "") {
            newReviewText = interview.aiReview + "\n\n-------------------\n\n" + aiReview;
        }

        const updatedInterview = await Interview.findOneAndUpdate(
            { roomId },
            { aiReview: newReviewText },
            { new: true }
        );
        res.status(200).json(updatedInterview);
    } catch (error) {
        console.error("AI Review Save Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

// 10. LOG PROCTORING INCIDENT 
router.post("/log-proctoring", async (req, res) => {
    try {
        const { roomId, logMessage } = req.body;
        const updatedInterview = await Interview.findOneAndUpdate(
            { roomId },
            { $push: { proctoringLogs: logMessage } },
            { new: true }
        );
        res.status(200).json(updatedInterview);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
});

// 11. JOIN EXAM & GET RANDOMLY ASSIGNED QUESTION
router.post("/join-exam", async (req, res) => {
    try {
        const { roomId, candidateId, candidateName } = req.body;
        let interview = await Interview.findOne({ roomId });

        if (!interview) {
            return res.status(404).json({ message: "Interview session not found" });
        }

        // Check if candidate already has an assigned submission
        let existingSub = interview.candidateSubmissions.find(
            (sub) => sub.candidateId && sub.candidateId.toString() === candidateId
        );

        if (existingSub) {
            return res.status(200).json({
                assignedQuestion: existingSub.assignedQuestion,
                submission: existingSub,
                questionPool: interview.questionPool || []
            });
        }

        // Randomly pick a question from the room's questionPool
        let assignedQuestion = null;
        if (interview.questionPool && interview.questionPool.length > 0) {
            const randomIndex = Math.floor(Math.random() * interview.questionPool.length);
            assignedQuestion = interview.questionPool[randomIndex];
        } else {
            // Default fallback if no pool was set
            assignedQuestion = {
                title: "General Technical Assessment",
                description: "Solve the problem presented by the interviewer."
            };
        }

        const newSubmission = {
            candidateId,
            candidateName: candidateName || "Candidate",
            assignedQuestion,
            submittedCode: "// Start coding here...",
            output: "",
            verdict: "Pending",
            proctoringLogs: []
        };

        interview.candidateSubmissions.push(newSubmission);
        await interview.save();

        res.status(200).json({
            assignedQuestion,
            submission: newSubmission,
            questionPool: interview.questionPool || []
        });
    } catch (error) {
        console.error("Error joining exam:", error);
        res.status(500).json({ message: "Server error joining exam", error: error.message });
    }
});

// 12. SUBMIT INDIVIDUAL CANDIDATE EXAM
router.post("/submit-exam", async (req, res) => {
    try {
        const { roomId, candidateId, code, output, proctoringLogs, verdict, aiReview } = req.body;

        const interview = await Interview.findOne({ roomId });
        if (!interview) {
            return res.status(404).json({ message: "Interview session not found" });
        }

        const subIndex = interview.candidateSubmissions.findIndex(
            (sub) => sub.candidateId && sub.candidateId.toString() === candidateId
        );

        if (subIndex !== -1) {
            interview.candidateSubmissions[subIndex].submittedCode = code;
            interview.candidateSubmissions[subIndex].output = output || "";
            interview.candidateSubmissions[subIndex].verdict = verdict || "Pending";
            if (proctoringLogs && Array.isArray(proctoringLogs)) {
                interview.candidateSubmissions[subIndex].proctoringLogs = proctoringLogs;
            }
            if (aiReview) {
                interview.candidateSubmissions[subIndex].aiReview = aiReview;
            }
            interview.candidateSubmissions[subIndex].submittedAt = new Date();
        } else {
            interview.candidateSubmissions.push({
                candidateId,
                submittedCode: code,
                output: output || "",
                verdict: verdict || "Pending",
                proctoringLogs: proctoringLogs || [],
                aiReview: aiReview || "",
                submittedAt: new Date()
            });
        }

        await interview.save();
        res.status(200).json({ message: "Exam submitted successfully!", interview });
    } catch (error) {
        console.error("Error submitting exam:", error);
        res.status(500).json({ message: "Server error submitting exam", error: error.message });
    }
});

// 13. GET ALL CANDIDATE SUBMISSIONS FOR A ROOM (ADMIN)
router.get("/submissions/:roomId", async (req, res) => {
    try {
        const { roomId } = req.params;
        const interview = await Interview.findOne({ roomId }).populate("candidateSubmissions.candidateId", "name email");
        if (!interview) {
            return res.status(404).json({ message: "Interview not found" });
        }
        res.status(200).json({
            roomId: interview.roomId,
            questionPool: interview.questionPool,
            submissions: interview.candidateSubmissions
        });
    } catch (error) {
        res.status(500).json({ message: "Server error fetching submissions" });
    }
});

// 14. ADMIN UPDATE INDIVIDUAL CANDIDATE VERDICT
router.post("/candidate-verdict", async (req, res) => {
    try {
        const { roomId, candidateId, verdict } = req.body;
        const interview = await Interview.findOne({ roomId });
        if (!interview) {
            return res.status(404).json({ message: "Interview session not found" });
        }

        const subIndex = interview.candidateSubmissions.findIndex(
            (sub) => sub.candidateId && sub.candidateId.toString() === candidateId
        );

        if (subIndex !== -1) {
            interview.candidateSubmissions[subIndex].verdict = verdict;
            await interview.save();
            return res.status(200).json({ message: `Candidate marked as ${verdict}`, submission: interview.candidateSubmissions[subIndex] });
        } else {
            return res.status(404).json({ message: "Candidate submission not found" });
        }
    } catch (error) {
        res.status(500).json({ message: "Server error updating candidate verdict" });
    }
});

// 15. GET INDIVIDUAL CANDIDATE RESULT
router.get("/candidate-result/:roomId/:candidateId", async (req, res) => {
    try {
        const { roomId, candidateId } = req.params;
        const interview = await Interview.findOne({ roomId });
        if (!interview) {
            return res.status(404).json({ message: "Interview session not found" });
        }

        const sub = interview.candidateSubmissions.find(
            (s) => s.candidateId && s.candidateId.toString() === candidateId
        );

        if (sub) {
            return res.status(200).json({
                roomId: interview.roomId,
                startTime: interview.startTime,
                submission: sub
            });
        } else {
            return res.status(404).json({ message: "No result found for this candidate" });
        }
    } catch (error) {
        res.status(500).json({ message: "Server error fetching candidate result" });
    }
});

export default router;