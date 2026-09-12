import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./lib/db.js";
import authRoutes from "./routes/auth.route.js";
import compileRoutes from "./routes/compile.route.js"; 
import interviewRoutes from "./routes/interview.route.js"; 
import questionRoutes from "./routes/question.route.js"; 
import { createServer } from "http";
import { Server } from "socket.io";

dotenv.config();

const app = express();
const httpServer = createServer(app);

const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://192.168.1.2:5174",
].filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):5174$/.test(origin)) return true;
  return true; // Allow local LAN connections
};

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors({
  origin: (origin, callback) => {
    callback(null, true);
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" })); 

app.use("/api/auth", authRoutes);
app.use("/api/compile", compileRoutes); 
app.use("/api/interview", interviewRoutes); 
app.use("/api/questions", questionRoutes); 

// --- FIXED: Global memory to remember the Admin's limit! ---
const roomLimits = {}; 

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    
    // FIXED: If the Admin already set a limit, send it to the Candidate immediately upon joining!
    if (roomLimits[roomId]) {
        socket.emit("sync-limit", roomLimits[roomId]);
    }
  });

  socket.on("join-candidate-room", ({ roomId, candidateId }) => {
    if (roomId && candidateId) {
      socket.join(`${roomId}:${candidateId}`);
    }
  });

  socket.on("code-change", ({ roomId, candidateId, code }) => {
    if (candidateId) {
      socket.to(`${roomId}:${candidateId}`).emit("code-update", { candidateId, code });
      socket.to(roomId).emit("code-update", { candidateId, code });
    } else {
      socket.to(roomId).emit("code-update", { code });
    }
  });

  socket.on("output-change", ({ roomId, candidateId, output }) => {
    if (candidateId) {
      socket.to(`${roomId}:${candidateId}`).emit("output-update", { candidateId, output });
      socket.to(roomId).emit("output-update", { candidateId, output });
    } else {
      socket.to(roomId).emit("output-update", { output });
    }
  });

  socket.on("question-change", ({ roomId, question }) => {
    io.in(roomId).emit("question-update", question);
  });

  socket.on("dispatch-question-pool", async ({ roomId, questions }) => {
    try {
      const { Interview } = await import("./models/Interview.js");
      await Interview.findOneAndUpdate(
        { roomId },
        { $set: { questionPool: questions } },
        { new: true, upsert: true }
      );
      io.in(roomId).emit("question-pool-dispatched", { roomId, questions });
    } catch (err) {
      console.error("Error dispatching question pool:", err);
    }
  });

  socket.on("tab-change", ({ roomId, tab }) => {
    socket.to(roomId).emit("tab-update", tab);
  });

  socket.on("draw", ({ roomId, drawData }) => {
    socket.to(roomId).emit("draw-update", drawData);
  });

  socket.on("clear-whiteboard", (roomId) => {
    socket.to(roomId).emit("whiteboard-cleared");
  });

  socket.on("set-limit", ({ roomId, limit }) => {
    roomLimits[roomId] = limit; // Save it in memory
    socket.to(roomId).emit("sync-limit", limit); // Broadcast it live
  });

  socket.on("trigger-kick", (roomId) => {
    socket.to(roomId).emit("kick-out");
  });

  socket.on("end-meeting", (roomId) => {
    socket.to(roomId).emit("meeting-ended");
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  connectDB();
});