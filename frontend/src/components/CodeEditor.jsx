import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom"; 
import Editor from "@monaco-editor/react";
import io from "socket.io-client";
import { axiosInstance, SOCKET_URL } from "../lib/axios";
import { useAuth } from "../context/AuthContext"; 

const CodeEditor = ({ roomId }) => {
  const { authUser } = useAuth(); 
  const navigate = useNavigate(); 
  const [code, setCode] = useState("// Start coding here...");
  const [socket, setSocket] = useState(null);
  
  const [language, setLanguage] = useState("python");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false); 
  const [isSaving, setIsSaving] = useState(false);

  const [customInput, setCustomInput] = useState("");

  const [questionBank, setQuestionBank] = useState([]);
  const [selectedQuestionTitle, setSelectedQuestionTitle] = useState("");

  const [maxWarnings, setMaxWarnings] = useState(3);
  const warningCountRef = useRef(0);
  const maxWarningsRef = useRef(3);

  // --- FIXED: LISTEN FOR ADMIN CHANGING LIMIT & AUTO-KICK EVENTS ---
  useEffect(() => {
    if (!socket) return;
    
    socket.on("sync-limit", (limit) => {
        maxWarningsRef.current = limit;
        setMaxWarnings(limit);
    });

    socket.on("kick-out", () => {
        // FIXED: Give the Admin a clean success message, not an error!
        if (authUser?.role === "interviewer") {
            alert("✅ The candidate has been automatically removed for exceeding the maximum warnings. The session is over.");
            navigate("/admin");
        } else {
            alert("🛑 The meeting has been terminated by the Integrity System.");
            navigate("/"); 
        }
    });

    return () => {
        socket.off("sync-limit");
        socket.off("kick-out");
    }
  }, [socket, navigate, authUser]); // Added authUser to dependencies

  useEffect(() => {
    if (authUser?.role === "candidate") {
        
        const triggerProctoringAlert = async (violationType) => {
            warningCountRef.current += 1;
            const current = warningCountRef.current;
            const limit = maxWarningsRef.current;
            
            const timeString = new Date().toLocaleTimeString();
            const logMessage = `⚠️ ${violationType} at ${timeString} (Warning ${current} of ${limit})`;
            
            try {
                await axiosInstance.post("/interview/log-proctoring", { roomId, logMessage });
                
                if (socket) {
                    socket.emit("question-change", {
                        roomId,
                        question: { id: Date.now(), text: `🚨 PROCTORING ALERT:\n${logMessage}`, sender: "System Anti-Cheat", time: timeString }
                    });
                }

                if (current >= limit) {
                    await axiosInstance.post("/interview/end", { roomId, verdict: "Fail" });
                    
                    if (socket) socket.emit("question-change", {
                        roomId,
                        question: { id: Date.now(), text: `🛑 AUTO-FAIL TRIGGERED. Candidate exceeded ${limit} warnings.`, sender: "System", time: timeString }
                    });
                    
                    if (socket) socket.emit("trigger-kick", roomId);
                    
                    alert(`You have been removed from the interview for exceeding the maximum allowed proctoring warnings (${limit}).`);
                    navigate("/");
                }
            } catch (error) {
                console.error("Failed to log proctoring event", error);
            }
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                triggerProctoringAlert("Candidate switched or minimized tabs");
            }
        };

        const handleFaceAlert = (e) => {
            triggerProctoringAlert(e.detail.reason);
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("face-tracking-alert", handleFaceAlert); 

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("face-tracking-alert", handleFaceAlert);
        };
    }
  }, [authUser, roomId, socket, navigate]);

  const [activeCandidates, setActiveCandidates] = useState([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");

  useEffect(() => {
    const fetchActiveCandidates = async () => {
      if (authUser?.role === "interviewer" && roomId) {
        try {
          const res = await axiosInstance.get(`/interview/submissions/${roomId}`);
          if (res.data?.submissions) {
            setActiveCandidates(res.data.submissions);
            if (res.data.submissions.length > 0 && !selectedCandidateId) {
              setSelectedCandidateId(res.data.submissions[0].candidateId?._id || res.data.submissions[0].candidateId);
            }
          }
        } catch (err) {
          // Ignore if no submissions yet
        }
      }
    };
    fetchActiveCandidates();
    const interval = setInterval(fetchActiveCandidates, 3000);
    return () => clearInterval(interval);
  }, [authUser, roomId, selectedCandidateId]);

  useEffect(() => {
    const fetchQuestions = async () => {
      if (authUser?.role === "interviewer") {
        try {
          const res = await axiosInstance.get(`/questions/${authUser._id}`);
          setQuestionBank(res.data);
          if (res.data.length > 0) setSelectedQuestionTitle(res.data[0].title);
          else setSelectedQuestionTitle("custom");
        } catch (error) {
          console.error("Failed to fetch questions", error);
        }
      }
    };
    fetchQuestions();
  }, [authUser]);

  useEffect(() => {
    const newSocket = io(SOCKET_URL); 
    setSocket(newSocket);
    newSocket.emit("join-room", roomId);
    if (authUser?.role === "candidate" && authUser?._id) {
      newSocket.emit("join-candidate-room", { roomId, candidateId: authUser._id });
    } else if (authUser?.role === "interviewer" && selectedCandidateId) {
      newSocket.emit("join-candidate-room", { roomId, candidateId: selectedCandidateId });
    }

    newSocket.on("code-update", (data) => {
      if (data && typeof data === "object" && data.code !== undefined) {
        setCode(data.code);
      } else if (typeof data === "string") {
        setCode(data);
      }
    });

    newSocket.on("output-update", (data) => {
      if (data && typeof data === "object" && data.output !== undefined) {
        setOutput(data.output);
      } else if (typeof data === "string") {
        setOutput(data);
      }
    }); 

    return () => newSocket.disconnect();
  }, [roomId, authUser]);

  const handleEditorChange = (value) => {
    setCode(value);
    if (socket) {
      socket.emit("code-change", { 
        roomId, 
        candidateId: authUser?.role === "candidate" ? authUser._id : null, 
        code: value 
      });
    }
  };

  const runCode = async () => {
    if (!code || code.trim() === "" || code.trim() === "// Start coding here...") {
        setOutput("Please write some code first.");
        return;
    }

    setIsLoading(true);
    const startMsg = "Running...";
    setOutput(startMsg);
    if (socket) {
      socket.emit("output-change", { 
        roomId, 
        candidateId: authUser?.role === "candidate" ? authUser._id : null, 
        output: startMsg 
      });
    }

    try {
      const response = await axiosInstance.post("/compile", { 
          language, 
          code, 
          input: customInput 
      });
      const result = response.data.output;
      setOutput(result);
      if (socket) {
        socket.emit("output-change", { 
          roomId, 
          candidateId: authUser?.role === "candidate" ? authUser._id : null, 
          output: result 
        });
      }
    } catch (error) {
      console.error(error);
      const errorMsg = error.response?.data?.error || "Error: Failed to connect to server.";
      setOutput(errorMsg);
      if (socket) {
        socket.emit("output-change", { 
          roomId, 
          candidateId: authUser?.role === "candidate" ? authUser._id : null, 
          output: errorMsg 
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitExam = async () => {
    if (!code || code.trim() === "" || code.trim() === "// Start coding here...") {
      alert("Please write your solution code before submitting!");
      return;
    }

    if (!window.confirm("Are you sure you want to submit your exam answer?")) return;

    setIsSaving(true);
    try {
      await axiosInstance.post("/interview/submit-exam", {
        roomId,
        candidateId: authUser._id,
        code,
        output: output || "Executed solution",
        verdict: "Pass"
      });
      alert("🎉 Your exam submission has been recorded successfully! Admin can now review your results.");
      navigate("/");
    } catch (error) {
      console.error("Error submitting exam:", error);
      alert("Failed to submit exam. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const generateAIReview = async () => {
    if (!code || code.trim() === "" || code.trim() === "// Start coding here...") {
        alert("Wait for the candidate to write some code before requesting a review!");
        return;
    }

    setIsReviewing(true);
    try {
      const response = await axiosInstance.post("/compile/review", { language, code });
      const aiReviewText = response.data.review;

      await axiosInstance.post("/interview/save-ai-review", { roomId, aiReview: aiReviewText });

      const reviewAlert = {
        id: Date.now(),
        text: `✨ AI CODE REVIEW:\n${aiReviewText}`,
        sender: "Groq AI Assistant",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      if (socket) socket.emit("question-change", { roomId, question: reviewAlert });
    } catch (error) {
      console.error("Full AI Error:", error);
      alert("AI Review Failed. Check console.");
    } finally {
      setIsReviewing(false);
    }
  };

  const handleSaveAnswer = async () => {
    if (!code || code.trim() === "" || code.trim() === "// Start coding here...") {
        alert("There is no code to save yet!");
        return;
    }

    setIsSaving(true);
    try {
      let finalQuestionTitle = selectedQuestionTitle;

      if (finalQuestionTitle === "custom") {
          const questionPrompt = window.prompt("Which question did they just solve?", "Custom Question");
          if (!questionPrompt) {
              setIsSaving(false);
              return; 
          }
          finalQuestionTitle = questionPrompt;
      } else if (!finalQuestionTitle) {
          finalQuestionTitle = "Generic Question";
      }

      await axiosInstance.post("/interview/save-answer", {
          roomId,
          question: finalQuestionTitle,
          code: code,
          output: output || "No output generated."
      });
      
      alert(`✅ "${finalQuestionTitle}" saved successfully! You can now clear the screen.`);
      setSelectedQuestionTitle("custom");

    } catch (error) {
      console.error("Error saving answer:", error);
      alert("Failed to save answer.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full h-full bg-[#1e1e1e] border-l border-gray-700 flex flex-col">
      <div className="h-12 shrink-0 bg-[#1e1e1e] border-b border-gray-700 flex items-center px-4 justify-between">
        
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm font-medium">Language:</span>
          <select 
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-gray-800 text-white text-xs p-1 rounded border border-gray-600 outline-none focus:border-blue-500"
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript (Node)</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          
          {authUser?.role === "interviewer" && (
              <div className="flex items-center gap-2 bg-black px-2 py-1 rounded border border-gray-700">
                  <span className="text-red-400 text-[10px] font-bold uppercase tracking-wider">Max Alerts:</span>
                  <input 
                      type="number" 
                      min="1" 
                      max="15" 
                      value={maxWarnings} 
                      onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          setMaxWarnings(val);
                          maxWarningsRef.current = val;
                          if (socket) socket.emit("set-limit", { roomId, limit: val });
                      }} 
                      className="w-8 bg-transparent text-white text-xs text-center outline-none font-bold"
                  />
              </div>
          )}

          {authUser?.role === "interviewer" && (
            <div className="flex items-center gap-1 bg-gray-800 px-2 py-1 rounded border border-blue-500/50">
              <span className="text-blue-400 text-[10px] font-bold">Watch:</span>
              {activeCandidates.length > 0 ? (
                <select
                  value={selectedCandidateId}
                  onChange={(e) => {
                    setSelectedCandidateId(e.target.value);
                    if (socket) {
                      socket.emit("join-candidate-room", { roomId, candidateId: e.target.value });
                    }
                  }}
                  className="bg-transparent text-white text-xs outline-none font-semibold cursor-pointer max-w-[150px] truncate"
                >
                  {activeCandidates.map((c) => {
                    const idVal = c.candidateId?._id || c.candidateId;
                    return (
                      <option key={idVal} value={idVal} className="bg-gray-900 text-white">
                        👤 {c.candidateName || "Candidate"} ({c.assignedQuestion?.title || "Exam"})
                      </option>
                    );
                  })}
                </select>
              ) : (
                <span className="text-gray-400 text-xs italic">Waiting for candidate...</span>
              )}
            </div>
          )}

          <span className="text-gray-500 text-xs flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500"></div> Live Sync
          </span>
          
          {authUser?.role === "interviewer" && (
             <>
               <button
                 onClick={handleSaveAnswer}
                 disabled={isSaving || isLoading || isReviewing}
                 className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                   isSaving ? "bg-emerald-900 text-emerald-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/50"
                 }`}
               >
                 {isSaving ? "Saving..." : "💾 Save"}
               </button>

               <button
                  onClick={generateAIReview}
                  disabled={isReviewing || isLoading || isSaving}
                  className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                    isReviewing ? "bg-purple-900 text-purple-400 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-900/50"
                  }`}
               >
                  {isReviewing ? "Analyzing..." : "✨ AI Review"}
               </button>
             </>
          )}

          <button
            onClick={runCode}
            disabled={isLoading || isReviewing || isSaving}
            className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
              isLoading ? "bg-gray-600 text-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            {isLoading ? "Running..." : "▶ Run Code"}
          </button>

          {authUser?.role === "candidate" && (
            <button
              onClick={handleSubmitExam}
              disabled={isSaving || isLoading}
              className="px-3 py-1 rounded text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all flex items-center gap-1"
            >
              {isSaving ? "Submitting..." : "🚀 Submit Exam"}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 w-full relative min-h-[200px]">
        <Editor
          height="100%"
          defaultLanguage={language === "python" ? "python" : "javascript"} 
          language={language === "cpp" ? "cpp" : (language === "java" ? "java" : language)}
          theme="vs-dark"
          value={code} 
          onChange={handleEditorChange}
          options={{ minimap: { enabled: false }, fontSize: 14, automaticLayout: true, padding: { top: 16 } }}
        />
      </div>

      <div className="h-48 shrink-0 bg-black border-t border-gray-700 flex">
          <div className="w-1/2 p-3 border-r border-gray-700 flex flex-col">
              <div className="text-gray-500 text-xs uppercase mb-2 font-bold tracking-wider shrink-0">Custom Input</div>
              <textarea 
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Enter input here (e.g., 2, then enter, then 5)..."
                  className="flex-1 bg-transparent text-sm font-mono text-gray-300 outline-none resize-none custom-scrollbar min-h-0"
              />
          </div>

          <div className="w-1/2 p-3 flex flex-col">
              <div className="text-gray-500 text-xs uppercase mb-2 font-bold tracking-wider shrink-0">Console Output</div>
              <div className="flex-1 overflow-auto custom-scrollbar min-h-0">
                  <pre className="font-mono text-sm text-green-400 whitespace-pre-wrap">
                    {output || "> Click 'Run Code' to see output..."}
                  </pre>
              </div>
          </div>
      </div>
    </div>
  );
};

export default CodeEditor;