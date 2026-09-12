import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { List, LogOut, Video, Clock, X, CheckCircle, XCircle, AlertCircle, CalendarPlus, Mail, Calendar, Trash2, Edit, BookOpen, Plus, FileDown, ShieldAlert, Cpu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios"; 

// --- NEW IMPORTS FOR PDF ---
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const AdminDashboard = () => {
  const { authUser, logout } = useAuth(); 
  const navigate = useNavigate();
  
  // --- Data States ---
  const [history, setHistory] = useState([]); 
  const [upcoming, setUpcoming] = useState([]); 
  const [questionBank, setQuestionBank] = useState([]); 
  
  // --- Modal States ---
  const [selectedInterview, setSelectedInterview] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleData, setScheduleData] = useState({ email: "", date: "", time: "" });
  const [selectedPoolQuestions, setSelectedPoolQuestions] = useState([]);
  
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleData, setRescheduleData] = useState({ roomId: "", date: "", time: "" });

  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [newQuestion, setNewQuestion] = useState({ title: "", description: "" });

  // --- NEW: PDF Loading State ---
  const [isDownloading, setIsDownloading] = useState(false);

  // --- Fetch Admin Data ---
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        if (authUser?._id) {
            const historyRes = await axiosInstance.get(`/interview/history/${authUser._id}`);
            setHistory(historyRes.data);

            const upcomingRes = await axiosInstance.get(`/interview/upcoming/${authUser._id}`);
            setUpcoming(upcomingRes.data);

            const questionsRes = await axiosInstance.get(`/questions/${authUser._id}`);
            setQuestionBank(questionsRes.data);
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      }
    };
    fetchDashboardData();
  }, [authUser]);

  const createNewInterview = () => {
    const randomId = Math.random().toString(36).substring(2, 9);
    navigate(`/interview/${randomId}`);
  };

  const handleUpdateVerdict = async (verdict) => {
    try {
        await axiosInstance.post("/interview/end", {
            roomId: selectedInterview.roomId,
            verdict: verdict
        });

        setHistory(history.map(item => 
            item.roomId === selectedInterview.roomId 
                ? { ...item, verdict: verdict, status: "Completed" } 
                : item
        ));
        
        setSelectedInterview({...selectedInterview, verdict: verdict, status: "Completed"});
        toast.success(`Candidate marked as ${verdict}`);
    } catch (error) {
        console.error("Error saving verdict:", error);
        toast.error("Failed to update result.");
    }
  };

  const handleIndividualVerdict = async (candidateId, verdict) => {
    try {
      await axiosInstance.post("/interview/candidate-verdict", {
        roomId: selectedInterview.roomId,
        candidateId,
        verdict
      });

      setSelectedInterview(prev => {
        if (!prev) return prev;
        const updatedSubs = (prev.candidateSubmissions || []).map(sub => {
          const idVal = sub.candidateId?._id || sub.candidateId;
          if (idVal === candidateId) {
            return { ...sub, verdict };
          }
          return sub;
        });
        return { ...prev, candidateSubmissions: updatedSubs };
      });
      toast.success(`Candidate marked as ${verdict}`);
    } catch (error) {
      console.error("Error updating candidate verdict:", error);
      toast.error("Failed to update candidate verdict.");
    }
  };

  const handleScheduleSubmit = async (e) => {
      e.preventDefault();
      try {
          const combinedDateTime = new Date(`${scheduleData.date}T${scheduleData.time}`).toISOString();
          
          const res = await axiosInstance.post("/interview/schedule", {
              email: scheduleData.email,
              scheduledDate: combinedDateTime,
              interviewerId: authUser._id,
              questionPool: selectedPoolQuestions
          });

          toast.success("Interview Scheduled Successfully with Question Pool!");
          setShowScheduleModal(false);
          setScheduleData({ email: "", date: "", time: "" });
          setSelectedPoolQuestions([]);

          setUpcoming(prev => [...prev, res.data].sort((a,b) => new Date(a.scheduledDate) - new Date(b.scheduledDate)));
      } catch (error) {
          toast.error(error.response?.data?.message || "Failed to schedule interview");
      }
  };

  const handleCancelInterview = async (roomId) => {
      if (!window.confirm("Are you sure you want to cancel this scheduled interview?")) return;

      try {
          await axiosInstance.delete(`/interview/cancel/${roomId}`);
          setUpcoming(upcoming.filter(item => item.roomId !== roomId));
          toast.success("Interview cancelled successfully!");
      } catch (error) {
          console.error("Error cancelling interview:", error);
          toast.error("Failed to cancel interview");
      }
  };

  const openRescheduleModal = (interview) => {
      const d = new Date(interview.scheduledDate);
      const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const timeStr = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

      setRescheduleData({ roomId: interview.roomId, date: dateStr, time: timeStr });
      setShowRescheduleModal(true);
  };

  const handleRescheduleSubmit = async (e) => {
      e.preventDefault();
      try {
          const combinedDateTime = new Date(`${rescheduleData.date}T${rescheduleData.time}`).toISOString();
          const res = await axiosInstance.put(`/interview/reschedule/${rescheduleData.roomId}`, {
              scheduledDate: combinedDateTime
          });

          toast.success("Interview Rescheduled Successfully!");
          setShowRescheduleModal(false);
          setUpcoming(upcoming.map(item => item.roomId === rescheduleData.roomId ? res.data : item).sort((a,b) => new Date(a.scheduledDate) - new Date(b.scheduledDate)));
      } catch (error) {
          console.error("Error rescheduling:", error);
          toast.error("Failed to reschedule interview");
      }
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    try {
        const res = await axiosInstance.post("/questions/add", {
            interviewerId: authUser._id,
            title: newQuestion.title,
            description: newQuestion.description
        });
        
        setQuestionBank([res.data, ...questionBank]);
        setNewQuestion({ title: "", description: "" });
        toast.success("Question added to bank!");
    } catch (error) {
        toast.error("Failed to add question");
    }
  };

  const handleDeleteQuestion = async (id) => {
    if (!window.confirm("Delete this question?")) return;
    try {
        await axiosInstance.delete(`/questions/${id}`);
        setQuestionBank(questionBank.filter(q => q._id !== id));
        toast.success("Question deleted");
    } catch (error) {
        toast.error("Failed to delete question");
    }
  };

  // --- FIXED: MULTI-PAGE PDF GENERATION ---
  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    const element = document.getElementById("pdf-scorecard");
    
    try {
        // windowHeight ensures html2canvas captures the full scrolling height
        const canvas = await html2canvas(element, { 
            scale: 2, 
            useCORS: true,
            windowHeight: element.scrollHeight 
        });
        const imgData = canvas.toDataURL("image/png");
        
        const pdf = new jsPDF("p", "mm", "a4");
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;
        
        let heightLeft = imgHeight;
        let position = 0;

        // Print first page
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
        heightLeft -= pageHeight;

        // Automatically add new pages if the content is still going!
        while (heightLeft > 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
            heightLeft -= pageHeight;
        }
        
        pdf.save(`TalentFlow_Report_${selectedInterview.candidateName || "Candidate"}.pdf`);
        toast.success("PDF Downloaded Successfully!");
    } catch (error) {
        console.error("PDF Generation Error:", error);
        toast.error("Failed to generate PDF.");
    } finally {
        setIsDownloading(false);
    }
  };

  return (
    <div className="p-10 max-w-7xl mx-auto relative">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
            <h1 className="text-3xl font-bold text-gray-800">Interviewer Dashboard</h1>
            <p className="text-gray-500 mt-1">Manage your sessions, candidates, and question bank.</p>
        </div>
        <button onClick={logout} className="flex items-center gap-2 text-red-600 hover:text-red-700 font-medium px-4 py-2 hover:bg-red-50 rounded-lg transition">
          <LogOut size={20} />
          Logout
        </button>
      </div>

      {/* --- TOP ROW: ACTION CARDS --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        
        <div onClick={createNewInterview} className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition cursor-pointer group hover:border-blue-500 h-72 flex flex-col items-center justify-center text-center">
          <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center text-blue-600 mb-6 group-hover:scale-110 transition">
            <Video size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-gray-800">Instant Interview</h2>
          <p className="text-gray-500 mb-8 max-w-xs text-sm">Start a live video session instantly with a unique room code.</p>
          <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 w-full max-w-[200px] font-medium shadow-lg shadow-blue-200">
            Start Meeting
          </button>
        </div>

        <div onClick={() => setShowScheduleModal(true)} className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition cursor-pointer group hover:border-purple-500 h-72 flex flex-col items-center justify-center text-center">
          <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center text-purple-600 mb-6 group-hover:scale-110 transition">
            <CalendarPlus size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-gray-800">Schedule Interview</h2>
          <p className="text-gray-500 mb-8 max-w-xs text-sm">Invite a candidate to a future meeting using their email address.</p>
          <button className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 w-full max-w-[200px] font-medium shadow-lg shadow-purple-200">
            Schedule
          </button>
        </div>

        <div onClick={() => setShowQuestionModal(true)} className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition cursor-pointer group hover:border-emerald-500 h-72 flex flex-col items-center justify-center text-center">
          <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition">
            <BookOpen size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-gray-800">Question Bank</h2>
          <p className="text-gray-500 mb-8 max-w-xs text-sm">Manage technical questions to instantly send during live interviews.</p>
          <button className="bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700 w-full max-w-[200px] font-medium shadow-lg shadow-emerald-200">
            Manage Questions
          </button>
        </div>

      </div>

      {/* --- BOTTOM ROW: LIST CARDS --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-96 flex flex-col">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-purple-100 w-12 h-12 rounded-full flex items-center justify-center text-purple-600">
              <Calendar size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Upcoming Interviews</h2>
              <p className="text-gray-500 text-sm">Scheduled sessions waiting to start.</p>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
            {upcoming.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <Calendar size={40} className="mb-2 opacity-20"/>
                    <p>No upcoming interviews.</p>
                </div>
            ) : (
                upcoming.map((interview) => (
                    <div key={interview._id} className="p-4 bg-purple-50 rounded-lg border border-purple-100 hover:bg-purple-100 transition flex justify-between items-center group">
                        <div>
                            <p className="font-bold text-gray-900">{interview.candidateName || "Unknown Candidate"}</p>
                            <p className="text-xs text-gray-600 mt-1">
                                <Clock size={12} className="inline mr-1 mb-0.5" />
                                {new Date(interview.scheduledDate).toLocaleDateString()} at {new Date(interview.scheduledDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => openRescheduleModal(interview)} className="flex items-center justify-center bg-white border border-blue-200 text-blue-500 p-2 rounded-lg shadow-sm hover:bg-blue-50 hover:text-blue-700 transition" title="Reschedule Interview">
                                <Edit size={16} />
                            </button>
                            <button onClick={() => handleCancelInterview(interview.roomId)} className="flex items-center justify-center bg-white border border-red-200 text-red-500 p-2 rounded-lg shadow-sm hover:bg-red-50 hover:text-red-700 transition" title="Cancel Interview">
                                <Trash2 size={16} />
                            </button>
                            <button onClick={() => navigate(`/interview/${interview.roomId}`)} className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-purple-700 transition">
                                <Video size={16} /> Join
                            </button>
                        </div>
                    </div>
                ))
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-96 flex flex-col">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-green-100 w-12 h-12 rounded-full flex items-center justify-center text-green-600">
              <List size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Past Interviews</h2>
              <p className="text-gray-500 text-sm">Recent candidate sessions.</p>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
            {history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <Clock size={40} className="mb-2 opacity-20"/>
                    <p>No interviews found.</p>
                </div>
            ) : (
                history.map((interview) => (
                    <div key={interview._id} onClick={() => setSelectedInterview(interview)} className="p-4 bg-gray-50 rounded-lg border border-gray-100 hover:bg-blue-50 hover:border-blue-200 transition cursor-pointer group">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <p className="font-bold text-gray-900">{interview.candidateName || "Unknown Candidate"}</p>
                                <p className="text-xs text-gray-500 font-mono mt-0.5">ID: {interview.roomId}</p>
                            </div>
                            <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider ${interview.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                {interview.status}
                            </span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-200 mt-2">
                             <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Clock size={12}/> {new Date(interview.startTime).toLocaleDateString()}
                             </span>
                             <span className="text-xs font-bold text-blue-500 group-hover:text-blue-700">View Details →</span>
                        </div>
                    </div>
                ))
            )}
          </div>
        </div>
      </div>

      {/* --- ALL MODALS --- */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <CalendarPlus size={20} className="text-purple-600"/> Schedule Meeting
                    </h2>
                    <button onClick={() => setShowScheduleModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition text-gray-500"><X size={20} /></button>
                </div>
                <form onSubmit={handleScheduleSubmit} className="p-6 space-y-5">
                    <div>
                        <label className="text-sm font-semibold text-gray-700 mb-1 block">Candidate Email</label>
                        <div className="relative">
                            <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="email" required placeholder="Enter candidate's email" value={scheduleData.email} onChange={(e) => setScheduleData({...scheduleData, email: e.target.value})} className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-semibold text-gray-700 mb-1 block">Date</label>
                            <input type="date" required value={scheduleData.date} onChange={(e) => setScheduleData({...scheduleData, date: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none" />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-gray-700 mb-1 block">Time</label>
                            <input type="time" required value={scheduleData.time} onChange={(e) => setScheduleData({...scheduleData, time: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none" />
                        </div>
                    </div>

                    {questionBank.length > 0 && (
                      <div>
                        <label className="text-sm font-semibold text-gray-700 mb-1 block">Question Pool for Exam (Random Assignment)</label>
                        <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1.5 bg-gray-50">
                          {questionBank.map((q) => {
                            const isSelected = selectedPoolQuestions.some(item => (item._id && q._id ? item._id === q._id : item.title === q.title && item.description === q.description));
                            return (
                              <label key={q._id} className="flex items-center gap-2 text-xs text-gray-800 cursor-pointer p-1 rounded hover:bg-white">
                                <input 
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedPoolQuestions(prev => [...prev, { _id: q._id, title: q.title, description: q.description }]);
                                    } else {
                                      setSelectedPoolQuestions(prev => prev.filter(item => (item._id && q._id ? item._id !== q._id : item.title !== q.title)));
                                    }
                                  }}
                                  className="rounded text-purple-600 focus:ring-purple-500"
                                />
                                <span className="font-semibold truncate">{q.title}</span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-purple-600 mt-1 font-medium">Selected {selectedPoolQuestions.length} questions for random assignment.</p>
                      </div>
                    )}

                    <button type="submit" className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-md transition mt-4">Confirm Schedule</button>
                </form>
            </div>
        </div>
      )}

      {showRescheduleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 z-[60]">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Edit size={20} className="text-blue-600"/> Reschedule Meeting</h2>
                    <button onClick={() => setShowRescheduleModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition text-gray-500"><X size={20} /></button>
                </div>
                <form onSubmit={handleRescheduleSubmit} className="p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-sm font-semibold text-gray-700 mb-1 block">New Date</label><input type="date" required value={rescheduleData.date} onChange={(e) => setRescheduleData({...rescheduleData, date: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                        <div><label className="text-sm font-semibold text-gray-700 mb-1 block">New Time</label><input type="time" required value={rescheduleData.time} onChange={(e) => setRescheduleData({...rescheduleData, time: e.target.value})} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                    </div>
                    <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition mt-4">Save Changes</button>
                </form>
            </div>
        </div>
      )}

      {selectedInterview && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-800">Exam Room Submissions & Evaluation</h2>
                    <button onClick={() => setSelectedInterview(null)} className="p-2 hover:bg-gray-200 rounded-full transition text-gray-500"><X size={20} /></button>
                </div>
                
                <div className="p-6 space-y-5 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <div><p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Room ID</p><p className="font-medium text-gray-800 font-mono">{selectedInterview.roomId}</p></div>
                        <div><p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Date</p><p className="font-medium text-gray-800">{new Date(selectedInterview.startTime).toLocaleDateString()}</p></div>
                    </div>

                    {selectedInterview.candidateSubmissions && selectedInterview.candidateSubmissions.length > 0 ? (
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Candidate Exam Results ({selectedInterview.candidateSubmissions.length})</h3>
                            {selectedInterview.candidateSubmissions.map((sub) => {
                                const candId = sub.candidateId?._id || sub.candidateId;
                                return (
                                    <div key={candId || Math.random()} className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
                                        <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                                            <div>
                                                <h4 className="font-bold text-gray-900">{sub.candidateName || "Candidate"}</h4>
                                                <p className="text-xs text-purple-700 font-semibold">Question: {sub.assignedQuestion?.title || "Exam Task"}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${sub.verdict === 'Pass' ? 'bg-green-100 text-green-700' : sub.verdict === 'Fail' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                    {sub.verdict || "Pending"}
                                                </span>
                                                <button onClick={() => handleIndividualVerdict(candId, 'Pass')} className="px-2.5 py-1 text-xs bg-green-600 hover:bg-green-700 text-white font-bold rounded shadow-sm">Pass</button>
                                                <button onClick={() => handleIndividualVerdict(candId, 'Fail')} className="px-2.5 py-1 text-xs bg-red-600 hover:bg-red-700 text-white font-bold rounded shadow-sm">Fail</button>
                                            </div>
                                        </div>
                                        <div className="bg-[#1e1e1e] p-3 rounded font-mono text-xs text-gray-300 max-h-36 overflow-y-auto">
                                            <pre className="whitespace-pre-wrap">{sub.submittedCode || "// No code submitted"}</pre>
                                        </div>
                                        <div className="bg-black p-2 rounded font-mono text-xs text-green-400">
                                            <pre className="whitespace-pre-wrap">{sub.output || "No output"}</pre>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Overall Result</p>
                            <div className="flex items-center gap-2">
                                {selectedInterview.verdict === 'Pass' && <span className="flex items-center gap-1.5 text-sm font-bold text-green-700 bg-green-100 px-3 py-1.5 rounded-lg border border-green-200"><CheckCircle size={16}/> Passed</span>}
                                {selectedInterview.verdict === 'Fail' && <span className="flex items-center gap-1.5 text-sm font-bold text-red-700 bg-red-100 px-3 py-1.5 rounded-lg border border-red-200"><XCircle size={16}/> Failed</span>}
                                {selectedInterview.verdict === 'Pending' && <span className="flex items-center gap-1.5 text-sm font-bold text-yellow-700 bg-yellow-100 px-3 py-1.5 rounded-lg border border-yellow-200"><AlertCircle size={16}/> Pending Grading</span>}
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                    <button 
                        onClick={handleDownloadPDF} 
                        disabled={isDownloading}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition font-bold text-sm shadow-md ${isDownloading ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'}`}
                    >
                        <FileDown size={18} /> {isDownloading ? "Generating..." : "Download Report PDF"}
                    </button>
                    <button onClick={() => setSelectedInterview(null)} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition font-medium">Close</button>
                </div>
            </div>
        </div>
      )}

      {/* --- QUESTION BANK MODAL --- */}
      {showQuestionModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <BookOpen size={20} className="text-emerald-600"/> Question Bank
                    </h2>
                    <button onClick={() => setShowQuestionModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition text-gray-500"><X size={20} /></button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-gray-50/50">
                    <form onSubmit={handleAddQuestion} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm mb-6">
                        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-1.5"><Plus size={16}/> Add New Question</h3>
                        <div className="space-y-3">
                            <input 
                                type="text" 
                                required 
                                placeholder="Question Title (e.g. 'Two Sum')" 
                                value={newQuestion.title} 
                                onChange={(e) => setNewQuestion({...newQuestion, title: e.target.value})} 
                                className="w-full px-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-semibold text-gray-800" 
                            />
                            <textarea 
                                required 
                                placeholder="Write the full question description or code snippet here..." 
                                value={newQuestion.description} 
                                onChange={(e) => setNewQuestion({...newQuestion, description: e.target.value})} 
                                rows="3"
                                className="w-full px-4 py-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-gray-700 resize-none font-mono" 
                            />
                            <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-md transition text-sm">
                                Save Question
                            </button>
                        </div>
                    </form>

                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Your Saved Questions ({questionBank.length})</h3>
                    <div className="space-y-3">
                        {questionBank.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-6 bg-white rounded-xl border border-dashed border-gray-200">No questions saved yet. Add one above!</p>
                        ) : (
                            questionBank.map((q) => (
                                <div key={q._id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-start group hover:border-emerald-300 transition">
                                    <div className="pr-4 w-full">
                                        <h4 className="font-bold text-gray-800 text-base mb-1">{q.title}</h4>
                                        <p className="text-sm text-gray-600 font-mono bg-gray-50 p-3 rounded border border-gray-100 whitespace-pre-wrap break-words">{q.description}</p>
                                    </div>
                                    <button onClick={() => handleDeleteQuestion(q._id)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition shrink-0 opacity-0 group-hover:opacity-100">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
      )}

      {/* --- FIXED: HIDDEN PDF TEMPLATE (Now uses absolute position so html2canvas isn't squished) --- */}
      <div className="absolute left-[9999px] top-[-9999px] opacity-0 pointer-events-none">
          <div id="pdf-scorecard" className="w-[800px] bg-white text-black p-12 font-sans">
              
              {/* Brand Header */}
              <div className="border-b-4 border-blue-600 pb-6 mb-8 flex justify-between items-end">
                  <div>
                      <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Talent Flow</h1>
                      <p className="text-gray-500 text-lg font-medium mt-1">Official Technical Interview Scorecard</p>
                  </div>
                  <div className="text-right">
                      <span className={`px-4 py-2 rounded-lg font-bold text-lg border-2 uppercase tracking-wider ${selectedInterview?.verdict === 'Pass' ? 'bg-green-50 text-green-700 border-green-200' : selectedInterview?.verdict === 'Fail' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                          Result: {selectedInterview?.verdict}
                      </span>
                  </div>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-6 mb-10 bg-gray-50 p-6 rounded-xl border border-gray-200">
                  <div><p className="text-gray-400 text-xs uppercase font-bold tracking-widest mb-1">Candidate</p><p className="font-bold text-xl text-gray-800">{selectedInterview?.candidateName || "N/A"}</p></div>
                  <div><p className="text-gray-400 text-xs uppercase font-bold tracking-widest mb-1">Date</p><p className="font-bold text-xl text-gray-800">{selectedInterview ? new Date(selectedInterview.startTime).toLocaleDateString() : ""}</p></div>
                  <div><p className="text-gray-400 text-xs uppercase font-bold tracking-widest mb-1">Room ID</p><p className="font-medium text-lg text-gray-600 font-mono">{selectedInterview?.roomId}</p></div>
                  <div><p className="text-gray-400 text-xs uppercase font-bold tracking-widest mb-1">Language</p><p className="font-bold text-lg text-gray-800 uppercase">{selectedInterview?.languageUsed || "Python"}</p></div>
              </div>

              {/* AI Assessment & Proctoring Logs */}
              <div className="grid grid-cols-2 gap-6 mb-10">
                   {/* AI Review Box */}
                  <div className="border border-purple-200 bg-purple-50 rounded-xl p-5">
                      <h3 className="font-bold text-purple-800 flex items-center gap-2 mb-3 border-b border-purple-200 pb-2"><Cpu size={18}/> Groq AI Evaluation</h3>
                      <p className="text-sm text-purple-900 whitespace-pre-wrap leading-relaxed">{selectedInterview?.aiReview || "No AI Review generated during this session."}</p>
                  </div>
                  
                  {/* Trust & Proctoring Box */}
                  <div className="border border-red-200 bg-red-50 rounded-xl p-5">
                      <h3 className="font-bold text-red-800 flex items-center gap-2 mb-3 border-b border-red-200 pb-2"><ShieldAlert size={18}/> Integrity & Proctoring</h3>
                      {selectedInterview?.proctoringLogs && selectedInterview.proctoringLogs.length > 0 ? (
                          <ul className="list-disc pl-5 text-sm text-red-900 space-y-1">
                              {selectedInterview.proctoringLogs.map((log, i) => <li key={i}>{log}</li>)}
                          </ul>
                      ) : (
                          <div className="flex items-center gap-2 text-green-700 font-bold bg-green-100 p-3 rounded-lg border border-green-200">
                              <CheckCircle size={18}/> No suspicious behavior detected.
                          </div>
                      )}
                  </div>
              </div>

              {/* Saved Code Answers & Multi-Candidate Exam Submissions */}
              <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6 border-b-2 border-gray-100 pb-2 flex items-center gap-2"><BookOpen size={24}/> Candidate Solutions & Exam Submissions</h2>
                  
                  {selectedInterview?.candidateSubmissions && selectedInterview.candidateSubmissions.length > 0 && (
                    <div className="space-y-6 mb-8">
                      <h3 className="text-lg font-bold text-purple-800">Multi-Candidate Exam Submissions</h3>
                      {selectedInterview.candidateSubmissions.map((sub, idx) => (
                        <div key={idx} className="border border-purple-200 bg-purple-50/50 rounded-xl overflow-hidden p-4">
                          <div className="flex justify-between items-center mb-2 border-b border-purple-100 pb-2">
                            <span className="font-bold text-purple-900">{sub.candidateName || "Candidate"}</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-200 text-purple-800">Assigned: {sub.assignedQuestion?.title || "Exam Problem"}</span>
                          </div>
                          <p className="text-xs text-gray-700 mb-2 font-mono">{sub.assignedQuestion?.description}</p>
                          <div className="bg-[#1e1e1e] p-3 rounded text-sm font-mono text-gray-200 mb-2">
                            <pre className="whitespace-pre-wrap">{sub.submittedCode || "// No code submitted"}</pre>
                          </div>
                          <div className="bg-black p-2 rounded text-xs font-mono text-green-400">
                            <pre className="whitespace-pre-wrap">{sub.output || "No output"}</pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedInterview?.savedAnswers && selectedInterview.savedAnswers.length > 0 ? (
                      <div className="space-y-8">
                          {selectedInterview.savedAnswers.map((ans, idx) => (
                              <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden">
                                  <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex items-center gap-2">
                                      <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">Q{idx + 1}</span>
                                      <h3 className="font-bold text-gray-800">{ans.question}</h3>
                                  </div>
                                  <div className="p-4 bg-[#1e1e1e]">
                                      <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap break-words">{ans.code}</pre>
                                  </div>
                                  <div className="p-3 bg-black border-t border-gray-800">
                                      <p className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">Terminal Output</p>
                                      <pre className="text-sm font-mono text-green-400 whitespace-pre-wrap">{ans.output}</pre>
                                  </div>
                              </div>
                          ))}
                      </div>
                  ) : (
                      (!selectedInterview?.candidateSubmissions || selectedInterview.candidateSubmissions.length === 0) && (
                        <p className="text-gray-500 italic p-6 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-center">No code answers were manually saved during this interview.</p>
                      )
                  )}
              </div>

          </div>
      </div>

    </div>
  );
};

export default AdminDashboard;