import { 
  StreamVideo, 
  StreamVideoClient, 
  StreamCall, 
  StreamTheme, 
  PaginatedGridLayout, 
  SpeakerLayout, 
  useCallStateHooks, 
  useCall
} from '@stream-io/video-react-sdk';
import { useAuth } from "../context/AuthContext";
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '@stream-io/video-react-sdk/dist/css/styles.css';

import { Loader2, Send, Mic, MicOff, Video, VideoOff, PhoneOff, Users, MessageSquare, MonitorUp, AlertTriangle, RefreshCw, EyeOff, MoveHorizontal, Code, PenTool, BookOpen } from 'lucide-react'; 
import CodeEditor from "../components/CodeEditor"; 
import Whiteboard from "../components/Whiteboard"; 

import io from "socket.io-client"; 
import toast from "react-hot-toast";
import * as faceapi from 'face-api.js'; 
import { axiosInstance, SOCKET_URL } from "../lib/axios";

const apiKey = "mptsv46er4qt"; 

const MeetingRoom = () => {
  const navigate = useNavigate();
  const call = useCall(); 
  
  const { useMicrophoneState, useCameraState, useParticipantCount, useHasOngoingScreenShare, useLocalParticipant } = useCallStateHooks();
  
  const { isEnabled: isMicOn } = useMicrophoneState();
  const { isEnabled: isCamOn } = useCameraState();
  const participantCount = useParticipantCount();
  const hasOngoingScreenShare = useHasOngoingScreenShare(); 

  const { authUser } = useAuth();
  const { id: roomId } = useParams();

  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [socket, setSocket] = useState(null);
  
  const [savedQuestions, setSavedQuestions] = useState([]);
  
  const [activeTab, setActiveTab] = useState("code"); 
  
  const localParticipant = useLocalParticipant();
  const videoRef = useRef(null); 
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceWarning, setFaceWarning] = useState(""); 
  const lastWarningTime = useRef(0);

  useEffect(() => {
    const fetchQuestions = async () => {
      if (authUser?.role === "interviewer") {
        try {
          const res = await axiosInstance.get(`/questions/${authUser._id}`);
          setSavedQuestions(res.data);
        } catch (error) {
          console.error("Error fetching question bank:", error);
        }
      }
    };
    fetchQuestions();
  }, [authUser]);

  useEffect(() => {
    const initExamQuestion = async () => {
      if (authUser?.role === "candidate" && authUser?._id && roomId) {
        try {
          const res = await axiosInstance.post("/interview/join-exam", {
            roomId,
            candidateId: authUser._id,
            candidateName: authUser.name
          });
          if (res.data?.assignedQuestion) {
            const q = res.data.assignedQuestion;
            setQuestions((prev) => {
              if (prev.some(item => item.isAssigned)) return prev;
              return [{
                id: "assigned-" + Date.now(),
                text: `🎯 YOUR RANDOMLY ASSIGNED EXAM QUESTION:\n\n📌 ${q.title}\n${q.description}`,
                sender: "System Exam Engine",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isAssigned: true
              }, ...prev];
            });
          }
        } catch (error) {
          console.error("Error fetching assigned exam question:", error);
        }
      }
    };
    initExamQuestion();
  }, [authUser, roomId]);

  const [selectedQuestionsPool, setSelectedQuestionsPool] = useState([]);

  useEffect(() => {
    const newSocket = io(SOCKET_URL); 
    setSocket(newSocket);
    newSocket.emit("join-room", roomId);

    newSocket.on("question-update", (questionData) => {
      setQuestions((prev) => [...prev, questionData]);
    });

    newSocket.on("question-pool-dispatched", async () => {
      toast.success("⚡ Question pool dispatched! Assigning random question...");
      if (authUser?.role === "candidate" && authUser?._id) {
        try {
          const res = await axiosInstance.post("/interview/join-exam", {
            roomId,
            candidateId: authUser._id,
            candidateName: authUser.name
          });
          if (res.data?.assignedQuestion) {
            const q = res.data.assignedQuestion;
            setQuestions((prev) => [
              {
                id: "assigned-" + Date.now(),
                text: `🎯 YOUR RANDOMLY ASSIGNED EXAM QUESTION:\n\n📌 ${q.title}\n${q.description}`,
                sender: "System Exam Engine",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isAssigned: true
              },
              ...prev
            ]);
          }
        } catch (err) {
          console.error("Error assigning question:", err);
        }
      }
    });
    
    newSocket.on("meeting-ended", () => {
        toast.error("Host has ended the meeting.");
        navigate("/"); 
    });

    newSocket.on("tab-update", (tab) => {
        setActiveTab(tab);
    });

    return () => newSocket.disconnect();
  }, [roomId, navigate, authUser]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (socket) {
        socket.emit("tab-change", { roomId, tab });
    }
  };

  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = '/models'; 
      try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
        ]);
        setModelsLoaded(true);
      } catch (error) {
        console.error("Error loading models:", error);
      }
    };
    loadModels();
  }, []);

  // --- UPGRADED: AI Proctoring Loop wired to the Auto-Kick Engine! ---
  useEffect(() => {
    if (!modelsLoaded || authUser.role === 'interviewer') return;
    
    const stream = localParticipant?.videoStream;
    if (!stream || !videoRef.current) return;

    videoRef.current.srcObject = stream;

    const detectBehavior = async () => {
      if (!videoRef.current) return;
      
      const detections = await faceapi.detectAllFaces(
        videoRef.current, 
        new faceapi.TinyFaceDetectorOptions()
      ).withFaceLandmarks();

      const now = Date.now();
      let currentIssue = ""; 

      if (detections.length === 0) {
        currentIssue = "Face not visible or completely turned away";
      } else if (detections.length > 1) {
        currentIssue = "Multiple faces detected in frame";
      } else {
        const landmarks = detections[0].landmarks;
        const nose = landmarks.getNose()[3];
        const jaw = landmarks.getJawOutline();
        const leftJaw = jaw[0];
        const rightJaw = jaw[16];

        const distToLeft = Math.abs(nose.x - leftJaw.x);
        const distToRight = Math.abs(nose.x - rightJaw.x);
        const ratio = distToLeft / distToRight;

        if (ratio < 0.5 || ratio > 2.0) {
            currentIssue = "Candidate is looking off-screen";
        }
      }

      if (currentIssue) {
        setFaceWarning(currentIssue);

        // Send alert to CodeEditor Auto-Kick Engine (with 4 second cooldown)
        if (now - lastWarningTime.current > 4000) {
            lastWarningTime.current = now;
            
            // This is the magic line that connects ML to your database kicking system!
            window.dispatchEvent(new CustomEvent('face-tracking-alert', { 
                detail: { reason: currentIssue } 
            }));
        }
      } else {
        setFaceWarning(""); 
      }
    };

    // Scans the face every 1.5 seconds to save computer performance
    const interval = setInterval(detectBehavior, 1500); 
    return () => clearInterval(interval);

  }, [modelsLoaded, localParticipant, authUser.role]);

  // (Removed the old redundant visibilitychange code here since CodeEditor handles it now!)

  const handleDispatchPool = () => {
    if (selectedQuestionsPool.length === 0) {
      toast.error("Please select at least 1 question for the pool!");
      return;
    }

    if (socket) {
      socket.emit("dispatch-question-pool", { roomId, questions: selectedQuestionsPool });
      toast.success(`⚡ Dispatched ${selectedQuestionsPool.length} questions! Candidates received random assignments.`);
      
      const poolNotice = {
        id: Date.now(),
        text: `⚡ QUESTION POOL DISPATCHED (${selectedQuestionsPool.length} Problems):\n` + selectedQuestionsPool.map(q => `• ${q.title}`).join("\n"),
        sender: "System Exam Engine",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      socket.emit("question-change", { roomId, question: poolNotice });
    }
  };

  const handleAddQuestion = () => {
    if (!newQuestion.trim()) return;
    const questionData = {
      id: Date.now(),
      text: newQuestion,
      sender: authUser.name,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    socket.emit("question-change", { roomId, question: questionData });
    setNewQuestion("");
  };

  const handleLeaveCall = async () => {
    if (authUser.role === 'interviewer') {
        try {
            await axiosInstance.post("/interview/end", {
                roomId,
                verdict: "Pending" 
            });
        } catch (error) {
            console.error("Error saving interview end:", error);
        }

        if (socket) socket.emit("end-meeting", roomId);
        navigate("/admin");
    } else {
        navigate("/");
    }
  };

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Hidden local video element used ONLY for AI face tracking */}
      <video ref={videoRef} autoPlay muted playsInline className="absolute top-0 left-0 w-1 h-1 opacity-0 pointer-events-none" />
      
      {/* --- TOP ROW --- */}
      <div className="h-[50%] bg-gray-900 relative border-b border-gray-700 flex flex-col min-h-0 overflow-hidden">
          <div className="absolute top-2 left-2 z-10 flex flex-col gap-2 pointer-events-none">
            <div className="bg-black/60 px-3 py-1 rounded-full text-white text-xs flex items-center gap-2 backdrop-blur-md border border-white/10 w-fit">
                <Users size={12} /> {participantCount} Active
            </div>
            {authUser.role === 'candidate' && !hasOngoingScreenShare && (
                <div className="bg-red-600/90 px-3 py-1 rounded-full text-white text-xs flex items-center gap-2 animate-pulse font-bold w-fit">
                    <MonitorUp size={12} /> SHARE SCREEN
                </div>
            )}
            
            {/* Visual warning for the candidate on their own video feed */}
            {faceWarning && authUser.role === 'candidate' && (
                <div className="bg-red-600 px-3 py-1 rounded-full text-white text-xs flex items-center gap-2 font-bold w-fit shadow-[0_0_15px_rgba(220,38,38,0.8)]">
                    <AlertTriangle size={12} /> AI WARNING: {faceWarning}
                </div>
            )}
          </div>

          <div className="flex-1 w-full h-full relative overflow-hidden">
              {hasOngoingScreenShare ? (
                  <SpeakerLayout participantsBarPosition="right" />
              ) : (
                  <div className="w-full h-full">
                      <PaginatedGridLayout groupSize={2} participantBarPosition="bottom" videoPlaceholder={false} />
                  </div>
              )}
          </div>

          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-3 z-20">
              <button onClick={() => call.microphone.toggle()} className={`p-3 rounded-full text-white transition-all shadow-lg ${isMicOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500'}`}>
                {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              <button onClick={() => call.camera.toggle()} className={`p-3 rounded-full text-white transition-all shadow-lg ${isCamOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500'}`}>
                {isCamOn ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
              <button onClick={() => call.screenShare.toggle()} className={`p-3 rounded-full text-white transition-all shadow-lg ${hasOngoingScreenShare ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-600'}`}>
                <MonitorUp size={20} />
              </button>
              <button onClick={handleLeaveCall} className="p-3 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all shadow-lg">
                <PhoneOff size={20} />
              </button>
          </div>
      </div>

      {/* --- BOTTOM ROW --- */}
      <div className="h-[50%] flex min-h-0 relative z-30 bg-gray-900">
          
          <div className="w-1/2 bg-gray-900 border-r border-gray-700 flex flex-col">
            <div className="p-2 bg-gray-800 border-b border-gray-700 flex justify-between items-center px-4">
                <h2 className="font-bold text-white text-sm flex items-center gap-2">
                    <MessageSquare size={16} className="text-blue-400" /> Questions & Alerts
                </h2>
                <span className="text-[10px] bg-green-900 text-green-200 px-2 py-0.5 rounded-full">Live</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {questions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-60">
                        <p className="text-sm">No questions yet.</p>
                    </div>
                ) : (
                    questions.map((q) => (
                    <div key={q.id} className={`p-3 rounded-lg border shadow-sm ${q.sender === "System Anti-Cheat" || q.sender === "System" ? "bg-red-900/30 border-red-500/50" : "bg-gray-800 border-gray-700"}`}>
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-xs font-bold ${q.sender === "System Anti-Cheat" || q.sender === "System" ? "text-red-400" : "text-blue-400"}`}>{q.sender}</span>
                            <span className="text-[10px] text-gray-500">{q.time}</span>
                        </div>
                        <p className={`text-sm ${q.sender === "System Anti-Cheat" || q.sender === "System" ? "text-red-200 font-semibold" : "text-white"}`}>{q.text}</p>
                    </div>
                    ))
                )}
            </div>
            
            {authUser.role === "interviewer" && (
                <div className="p-3 bg-gray-800 border-t border-gray-700 shrink-0 flex flex-col gap-2">
                    {savedQuestions.length > 0 && (
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 space-y-2">
                            <div className="flex justify-between items-center text-xs font-bold text-gray-300">
                                <span className="flex items-center gap-1.5 text-blue-400">
                                    <BookOpen size={14} /> Select Questions for Pool
                                </span>
                                <span className="text-[10px] text-purple-400">{selectedQuestionsPool.length} Selected</span>
                            </div>
                            <div className="max-h-28 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                                {savedQuestions.map((q) => {
                                    const isSelected = selectedQuestionsPool.some(item => (item._id && q._id ? item._id === q._id : item.title === q.title && item.description === q.description));
                                    return (
                                        <label key={q._id} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer p-1 rounded hover:bg-gray-800">
                                            <input 
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedQuestionsPool(prev => [...prev, { _id: q._id, title: q.title, description: q.description }]);
                                                    } else {
                                                        setSelectedQuestionsPool(prev => prev.filter(item => (item._id && q._id ? item._id !== q._id : item.title !== q.title)));
                                                    }
                                                }}
                                                className="rounded text-purple-600 focus:ring-purple-500 bg-gray-900 border-gray-700"
                                            />
                                            <span className="truncate">{q.title}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            <button
                                onClick={handleDispatchPool}
                                disabled={selectedQuestionsPool.length === 0}
                                className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition flex justify-center items-center gap-1.5 shadow-md shadow-purple-900/30"
                            >
                                ⚡ Dispatch Question Pool ({selectedQuestionsPool.length})
                            </button>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Type custom note or question..."
                            className="flex-1 bg-black/30 text-white text-xs px-3 py-2 rounded-lg outline-none border border-gray-600 focus:border-blue-500"
                            value={newQuestion}
                            onChange={(e) => setNewQuestion(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddQuestion()}
                        />
                        <button onClick={handleAddQuestion} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                            <Send size={14} /> Send
                        </button>
                    </div>
                </div>
            )}
          </div>

          <div className="w-1/2 bg-[#1e1e1e] flex flex-col border-l border-gray-700">
              <div className="flex bg-gray-900 border-b border-gray-700 shrink-0">
                  <button 
                      onClick={() => handleTabChange('code')} 
                      className={`flex-1 py-3 text-sm font-bold transition flex justify-center items-center gap-2 ${activeTab === 'code' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
                  >
                     <Code size={16}/> Code Editor
                  </button>
                  <button 
                      onClick={() => handleTabChange('whiteboard')} 
                      className={`flex-1 py-3 text-sm font-bold transition flex justify-center items-center gap-2 ${activeTab === 'whiteboard' ? 'text-purple-400 border-b-2 border-purple-400 bg-gray-800' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
                  >
                     <PenTool size={16}/> Whiteboard
                  </button>
              </div>
              
              <div className="flex-1 min-h-0 relative">
                  <div className={`absolute inset-0 transition-opacity duration-200 ${activeTab === 'code' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'}`}>
                      <CodeEditor roomId={roomId} />
                  </div>
                  <div className={`absolute inset-0 transition-opacity duration-200 ${activeTab === 'whiteboard' ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'}`}>
                      <Whiteboard socket={socket} roomId={roomId} />
                  </div>
              </div>
          </div>

      </div>
    </div>
  );
};

// --- MAIN WRAPPER ---
const InterviewPage = () => {
  const { authUser } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [call, setCall] = useState(null);

  useEffect(() => {
    if (!authUser) { navigate('/login'); return; }
    if (!authUser.streamToken) { toast.error("Auth Error"); navigate('/login'); return; }

    let myClient = null;
    let myCall = null;

    const initCall = async () => {
      try {
        myClient = new StreamVideoClient({
            apiKey,
            user: { id: authUser._id, name: authUser.name, image: authUser.image },
            token: authUser.streamToken,
        });
        setClient(myClient);

        myCall = myClient.call('default', id);
        await myCall.join({ create: true });
        setCall(myCall);

        const payload = { roomId: id };
        
        if (authUser.role === 'candidate') {
            payload.candidateId = authUser._id;
            payload.candidateName = authUser.name; 
        } else if (authUser.role === 'interviewer') {
            payload.interviewerId = authUser._id;
        }

        await axiosInstance.post("/interview/start", payload);

      } catch (error) {
        console.error(error);
        if (error.code === 40 || error.message?.includes('expired')) {
            toast.error("Session expired. Please login again.");
            navigate('/login');
        }
      }
    };
    initCall();

    return () => {
        if (myCall) myCall.leave().catch(console.error);
        if (myClient) myClient.disconnectUser().catch(console.error);
        setClient(null); setCall(null);
    };
  }, [authUser, id, navigate]);

  if (!client || !call) return (
    <div className="flex h-[calc(100vh-80px)] items-center justify-center bg-gray-900 flex-col gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
      <span className="text-gray-400">Loading AI Proctoring...</span>
      <button onClick={() => window.location.reload()} className="text-sm text-blue-400 hover:underline flex items-center gap-2"><RefreshCw size={14} /> Stuck? Reload</button>
    </div>
  );

  return (
    <div className="h-[calc(100vh-80px)] bg-black text-white flex flex-col">
      <StreamVideo client={client}>
        <StreamCall call={call}>
          <StreamTheme><MeetingRoom /></StreamTheme>
        </StreamCall>
      </StreamVideo>
    </div>
  );
};

export default InterviewPage;