import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import axios from "axios";

dotenv.config();

const BASE_URL = "http://localhost:3000/api";
let testRoomId = "test_reg_" + Math.random().toString(36).substring(2, 8);
let candidate1Id, candidate2Id, interviewerId;

async function runTests() {
  console.log("=================================================");
  console.log("🚀 STARTING TALENT FLOW REGRESSION TEST SUITE");
  console.log("=================================================\n");

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passedTests++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failedTests++;
    }
  }

  try {
    // 1. Test Database Connection
    console.log("--- 1. Database Connection Test ---");
    const conn = await mongoose.connect(process.env.DB_URL);
    assert(conn.connection.readyState === 1, "Connected to MongoDB Atlas");

    const db = conn.connection.db;

    // Retrieve or Create Test Accounts
    console.log("\n--- 2. User Authentication & Role Verification ---");
    let adminUser = await db.collection("users").findOne({ email: "admin@gmail.com" });
    if (!adminUser) {
      const hash = await bcrypt.hash("admin123", 10);
      const res = await db.collection("users").insertOne({ name: "Admin Interviewer", email: "admin@gmail.com", password: hash, role: "interviewer" });
      adminUser = { _id: res.insertedId, email: "admin@gmail.com", role: "interviewer" };
    }
    interviewerId = adminUser._id.toString();

    let candidate1 = await db.collection("users").findOne({ email: "sona@gmail.com" });
    if (!candidate1) {
      const hash = await bcrypt.hash("candidate123", 10);
      const res = await db.collection("users").insertOne({ name: "Sona Candidate", email: "sona@gmail.com", password: hash, role: "candidate" });
      candidate1 = { _id: res.insertedId, email: "sona@gmail.com", role: "candidate" };
    }
    candidate1Id = candidate1._id.toString();

    let candidate2 = await db.collection("users").findOne({ email: "aromal31919@gmail.com" });
    if (!candidate2) {
      const hash = await bcrypt.hash("candidate123", 10);
      const res = await db.collection("users").insertOne({ name: "Aromal Candidate", email: "aromal31919@gmail.com", password: hash, role: "candidate" });
      candidate2 = { _id: res.insertedId, email: "aromal31919@gmail.com", role: "candidate" };
    }
    candidate2Id = candidate2._id.toString();

    assert(interviewerId && candidate1Id && candidate2Id, "Test user accounts ready in DB");

    // 3. Test API Auth Login Route
    console.log("\n--- 3. API Login Endpoint Test ---");
    try {
      const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
        email: "admin@gmail.com",
        password: "admin123"
      });
      assert(loginRes.status === 200 && loginRes.data.token, "Interviewer login successful with valid JWT");
    } catch (e) {
      assert(false, `Login failed: ${e.message}`);
    }

    // 4. Test Schedule Interview with Question Pool
    console.log("\n--- 4. Interview Creation & Question Pool Setup ---");
    const questionPool = [
      { title: "Two Sum", description: "Find two numbers in array that sum to target." },
      { title: "Reverse String", description: "Reverse a string in-place." },
      { title: "Palindrome Check", description: "Check if string is palindrome." }
    ];

    const scheduleRes = await axios.post(`${BASE_URL}/interview/schedule`, {
      email: "sona@gmail.com",
      scheduledDate: new Date().toISOString(),
      interviewerId,
      questionPool
    });

    assert(scheduleRes.status === 200 && scheduleRes.data.roomId, `Scheduled interview room: ${scheduleRes.data.roomId}`);
    testRoomId = scheduleRes.data.roomId;
    assert(scheduleRes.data.questionPool.length === 3, "Question pool correctly attached to interview room");

    // 5. Test Multi-Candidate Join & Randomized Question Assignment
    console.log("\n--- 5. Multi-Candidate Join & Random Question Assignment ---");
    
    // Candidate 1 Joins
    const joinRes1 = await axios.post(`${BASE_URL}/interview/join-exam`, {
      roomId: testRoomId,
      candidateId: candidate1Id,
      candidateName: "Sona Candidate"
    });
    assert(joinRes1.status === 200 && joinRes1.data.assignedQuestion?.title, `Candidate 1 assigned question: "${joinRes1.data.assignedQuestion?.title}"`);

    // Candidate 2 Joins
    const joinRes2 = await axios.post(`${BASE_URL}/interview/join-exam`, {
      roomId: testRoomId,
      candidateId: candidate2Id,
      candidateName: "Aromal Candidate"
    });
    assert(joinRes2.status === 200 && joinRes2.data.assignedQuestion?.title, `Candidate 2 assigned question: "${joinRes2.data.assignedQuestion?.title}"`);

    // 6. Test Candidate Exam Submissions
    console.log("\n--- 6. Candidate Exam Submissions ---");
    
    const subRes1 = await axios.post(`${BASE_URL}/interview/submit-exam`, {
      roomId: testRoomId,
      candidateId: candidate1Id,
      code: "def two_sum(nums, target):\n    return [0, 1]",
      output: "[0, 1]",
      verdict: "Pending"
    });
    assert(subRes1.status === 200, "Candidate 1 exam submission recorded");

    const subRes2 = await axios.post(`${BASE_URL}/interview/submit-exam`, {
      roomId: testRoomId,
      candidateId: candidate2Id,
      code: "def reverse_string(s):\n    return s[::-1]",
      output: "'olleh'",
      verdict: "Pending"
    });
    assert(subRes2.status === 200, "Candidate 2 exam submission recorded");

    // 7. Test Admin Submissions Retrieval
    console.log("\n--- 7. Admin Submissions & Evaluation Fetch ---");
    const adminSubsRes = await axios.get(`${BASE_URL}/interview/submissions/${testRoomId}`);
    assert(adminSubsRes.status === 200 && adminSubsRes.data.submissions.length === 2, "Admin retrieved all 2 candidate submissions for the room");

    // 8. Test Admin Individual Candidate Verdict Grading
    console.log("\n--- 8. Admin Individual Candidate Verdict Grading ---");
    const verdictRes1 = await axios.post(`${BASE_URL}/interview/candidate-verdict`, {
      roomId: testRoomId,
      candidateId: candidate1Id,
      verdict: "Pass"
    });
    assert(verdictRes1.status === 200 && verdictRes1.data.submission.verdict === "Pass", "Admin successfully marked Candidate 1 as PASS");

    const verdictRes2 = await axios.post(`${BASE_URL}/interview/candidate-verdict`, {
      roomId: testRoomId,
      candidateId: candidate2Id,
      verdict: "Fail"
    });
    assert(verdictRes2.status === 200 && verdictRes2.data.submission.verdict === "Fail", "Admin successfully marked Candidate 2 as FAIL");

    // 9. Test Candidate Individual Result Retrieval
    console.log("\n--- 9. Candidate Individual Result Retrieval ---");
    const candResultRes1 = await axios.get(`${BASE_URL}/interview/candidate-result/${testRoomId}/${candidate1Id}`);
    assert(candResultRes1.status === 200 && candResultRes1.data.submission.verdict === "Pass", "Candidate 1 retrieved their individual score: PASS");

    const candResultRes2 = await axios.get(`${BASE_URL}/interview/candidate-result/${testRoomId}/${candidate2Id}`);
    assert(candResultRes2.status === 200 && candResultRes2.data.submission.verdict === "Fail", "Candidate 2 retrieved their individual score: FAIL");

    // Clean up test document
    await db.collection("interviews").deleteOne({ roomId: testRoomId });
    console.log("\n🧹 Cleaned up temporary test interview document");

  } catch (err) {
    console.error("Test Execution Error:", err.message);
    failedTests++;
  } finally {
    await mongoose.disconnect();
    console.log("\n=================================================");
    console.log(`📊 REGRESSION TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log("=================================================");
    if (failedTests > 0) process.exit(1);
    else process.exit(0);
  }
}

runTests();
