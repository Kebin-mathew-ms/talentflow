import { useState, useEffect } from "react"; 
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, ArrowRight, Video, CheckCircle, XCircle, AlertCircle } from "lucide-react"; 
import { axiosInstance } from "../lib/axios"; 

const HomePage = () => {
  const { authUser } = useAuth();
  const navigate = useNavigate();
  const [meetingCode, setMeetingCode] = useState("");
  
  const [history, setHistory] = useState([]); 
  const [upcoming, setUpcoming] = useState([]); // <--- State for scheduled interviews

  // Redirect Admin
  useEffect(() => {
    if (authUser?.role === "interviewer") {
      navigate("/admin");
    }
  }, [authUser, navigate]);

  // --- Fetch Candidate Dashboard Data ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (authUser?._id) {
            // 1. Fetch History (Completed)
            const historyRes = await axiosInstance.get(`/interview/history/${authUser._id}`);
            setHistory(historyRes.data);

            // 2. Fetch Upcoming (Scheduled)
            const upcomingRes = await axiosInstance.get(`/interview/upcoming/${authUser._id}`);
            setUpcoming(upcomingRes.data);
        }
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      }
    };
    fetchData();
  }, [authUser]);

  const handleJoin = () => {
    if (meetingCode.trim()) {
      navigate(`/interview/${meetingCode}`);
    }
  };

  const [selectedResult, setSelectedResult] = useState(null);

  const fetchCandidateResult = async (roomId) => {
    try {
      const res = await axiosInstance.get(`/interview/candidate-result/${roomId}/${authUser._id}`);
      setSelectedResult(res.data);
    } catch (err) {
      console.error("Error fetching candidate result:", err);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 relative">
      {/* 1. Welcome Section */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-xl">
        <h1 className="text-3xl font-bold mb-2">
          Welcome back, {authUser?.name || "Candidate"}!
        </h1>
        <p className="text-blue-100 text-lg mb-6">
          Ready for your evaluation? Enter the meeting code provided by your interviewer.
        </p>
        
        {/* Join Interview Interface */}
        <div className="bg-white/10 p-4 rounded-xl max-w-md backdrop-blur-sm border border-white/20">
            <label className="block text-sm font-medium text-blue-100 mb-2">Join Instant Room</label>
            <div className="flex gap-2">
                <input 
                    type="text" 
                    placeholder="Enter Meeting Code"
                    className="flex-1 px-4 py-3 rounded-lg bg-white/90 text-gray-900 placeholder-gray-500 outline-none focus:ring-2 focus:ring-white"
                    value={meetingCode}
                    onChange={(e) => setMeetingCode(e.target.value)}
                />
                <button 
                    onClick={handleJoin}
                    disabled={!meetingCode}
                    className="px-6 py-3 bg-white text-blue-600 font-bold rounded-lg hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    Join <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* --- UPCOMING CARD --- */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-80 flex flex-col">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Upcoming</h3>
              <p className="text-sm text-gray-500">Scheduled sessions</p>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
             {upcoming.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400">
                    <p>No upcoming interviews scheduled</p>
                </div>
             ) : (
                upcoming.map((item) => {
                    const scheduledDate = new Date(item.scheduledDate);
                    return (
                        <div key={item._id} className="p-4 bg-purple-50 rounded-lg border border-purple-100 hover:bg-purple-100 transition flex justify-between items-center group">
                            <div>
                                <p className="font-bold text-gray-800 text-sm">
                                    {scheduledDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                                </p>
                                <p className="text-xs text-gray-600 font-medium mt-1 bg-white px-2 py-0.5 rounded border border-purple-100 inline-block">
                                    <Clock size={10} className="inline mr-1 mb-0.5"/> 
                                    {scheduledDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </p>
                            </div>
                            <button 
                                onClick={() => navigate(`/interview/${item.roomId}`)} 
                                className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-purple-700 transition transform group-hover:scale-105"
                            >
                                <Video size={16} /> Join
                            </button>
                        </div>
                    )
                })
             )}
          </div>
        </div>

        {/* --- HISTORY CARD --- */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-80 flex flex-col">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">History & Results</h3>
              <p className="text-sm text-gray-500">Past exam scorecards</p>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
            {history.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400">
                    <p>No past interviews found</p>
                </div>
            ) : (
                history.map((item) => (
                    <div 
                      key={item._id} 
                      onClick={() => fetchCandidateResult(item.roomId)}
                      className="p-4 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition flex justify-between items-center cursor-pointer group"
                    >
                        <div>
                            <p className="font-bold text-gray-800 text-sm">Room: {item.roomId}</p>
                            <p className="text-xs text-gray-500 mt-1">
                                {new Date(item.startTime).toLocaleDateString()} at {new Date(item.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </p>
                        </div>
                        
                        {/* Status & Verdict Badges */}
                        <div className="flex flex-col items-end gap-1">
                            <span className="text-xs font-bold text-blue-600 group-hover:underline">
                              View Result →
                            </span>
                            <div className="flex items-center gap-1 mt-1">
                                {item.verdict === 'Pass' && <span className="flex items-center gap-1 text-[11px] font-bold text-green-600"><CheckCircle size={10}/> Passed</span>}
                                {item.verdict === 'Fail' && <span className="flex items-center gap-1 text-[11px] font-bold text-red-600"><XCircle size={10}/> Failed</span>}
                                {item.verdict === 'Pending' && <span className="flex items-center gap-1 text-[11px] font-bold text-yellow-600"><AlertCircle size={10}/> Pending</span>}
                            </div>
                        </div>
                    </div>
                ))
            )}
          </div>
        </div>

      </div>

      {/* --- INDIVIDUAL CANDIDATE RESULT MODAL --- */}
      {selectedResult && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Your Exam Scorecard</h2>
                <p className="text-xs text-gray-500">Room Code: {selectedResult.roomId}</p>
              </div>
              <button onClick={() => setSelectedResult(null)} className="px-3 py-1 bg-gray-200 rounded-lg text-sm font-bold hover:bg-gray-300">Close</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {/* Verdict Header */}
              <div className="p-4 rounded-xl flex justify-between items-center border bg-gray-50">
                <div>
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Official Result</span>
                  <span className={`text-lg font-bold ${selectedResult.submission?.verdict === 'Pass' ? 'text-green-600' : selectedResult.submission?.verdict === 'Fail' ? 'text-red-600' : 'text-yellow-600'}`}>
                    {selectedResult.submission?.verdict || "Pending Grading"}
                  </span>
                </div>
                <span className="text-xs text-gray-400">{new Date(selectedResult.startTime).toLocaleDateString()}</span>
              </div>

              {/* Assigned Question */}
              <div className="border border-blue-100 bg-blue-50/50 p-4 rounded-xl">
                <h3 className="text-sm font-bold text-blue-900 mb-1">🎯 Assigned Problem: {selectedResult.submission?.assignedQuestion?.title || "Exam Problem"}</h3>
                <p className="text-xs text-blue-800 font-mono whitespace-pre-wrap">{selectedResult.submission?.assignedQuestion?.description}</p>
              </div>

              {/* Submitted Code */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Your Submitted Solution</h3>
                <div className="bg-[#1e1e1e] p-4 rounded-xl text-sm font-mono text-gray-200 overflow-x-auto">
                  <pre className="whitespace-pre-wrap">{selectedResult.submission?.submittedCode || "// No code submitted"}</pre>
                </div>
              </div>

              {/* Console Output */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Execution Output</h3>
                <div className="bg-black p-3 rounded-xl text-xs font-mono text-green-400">
                  <pre className="whitespace-pre-wrap">{selectedResult.submission?.output || "No output recorded"}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;