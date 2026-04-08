import { useState, useEffect } from "react";

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

import { motion, AnimatePresence } from "motion/react";
import { 
  Volume2,
  Mic,
  MicOff,
  Upload,
  Image as ImageIcon,
  Monitor,
  Edit2,
  Save,
  X,
  Loader2,
  Languages, 
  Sparkles, 
  FileText, 
  History as HistoryIcon, 
  Trash2, 
  Wifi, 
  WifiOff, 
  Copy, 
  Check, 
  ChevronRight,
  ArrowRightLeft,
  Key
} from "lucide-react";
import { 
  translateText, 
  generateSoraniSpeech,
  performOCR,
  transcribeAudio,
  getHistory, 
  clearHistory, 
  updateHistoryItem,
  TranslationMode, 
  TranslationResult,
  setManualApiKey,
  getManualApiKey
} from "./services/gemini";

export default function App() {
  const [inputText, setInputText] = useState("");
  const [mode, setMode] = useState<TranslationMode>(TranslationMode.TRANSLATE);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [history, setHistory] = useState<TranslationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isOCRing, setIsOCRing] = useState(false);
  const [isScreenCapturing, setIsScreenCapturing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [manualKeyInput, setManualKeyInput] = useState("");
  const [isEditingOutput, setIsEditingOutput] = useState(false);
  const [editedOutput, setEditedOutput] = useState("");
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);

  useEffect(() => {
    const checkKey = async () => {
      const manual = getManualApiKey();
      if (manual) {
        setHasApiKey(true);
        setManualKeyInput(manual);
        return;
      }
      
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected || !!process.env.GEMINI_API_KEY);
      } else {
        setHasApiKey(!!process.env.GEMINI_API_KEY);
      }
    };
    checkKey();

    setHistory(getHistory());
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: "audio/wav" });
        await handleTranscription(audioBlob);
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());
      };

      setMediaRecorder(recorder);
      setAudioChunks(chunks);
      recorder.start();
      setIsRecording(true);
      setError(null);
    } catch (err: any) {
      setError("Could not access microphone. Please check your permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const handleTranscription = async (blob: Blob) => {
    setIsTranscribing(true);
    setError(null);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(",")[1];
        const text = await transcribeAudio(base64Audio, blob.type);
        if (text) {
          setInputText(prev => prev ? `${prev}\n${text}` : text);
        }
      };
    } catch (err: any) {
      setError("Transcription failed. Please try again.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleFileUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
      await handleOCR(file);
    } else if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
      await handleTranscription(file);
    } else {
      setError("Please upload an image, audio, or video file.");
    }
  };

  const handleOCR = async (blob: Blob) => {
    setIsOCRing(true);
    setError(null);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Image = (reader.result as string).split(",")[1];
        const text = await performOCR(base64Image, blob.type);
        if (text) {
          setInputText(prev => prev ? `${prev}\n${text}` : text);
        }
      };
    } catch (err: any) {
      setError("OCR failed. Please try again.");
    } finally {
      setIsOCRing(false);
    }
  };

  const handleTranslate = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true);
    setError(null);
    setResult(null); // Clear previous result
    setIsEditingOutput(false);
    try {
      const res = await translateText(inputText, mode);
      setResult(res);
      setEditedOutput(res.translated);
      setHistory(getHistory());
    } catch (err: any) {
      setError(err.message || "An error occurred during translation.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleScreenCapture = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setError("Screen capture is not supported in this browser or environment. Try opening the app in a new tab.");
      return;
    }

    setIsScreenCapturing(true);
    setError(null);
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ 
        video: { cursor: "always" } as any,
        audio: false 
      });
      
      const video = document.createElement('video');
      video.srcObject = stream;
      
      // Wait for video to be ready
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play().then(resolve);
        };
      });

      // Give it a tiny bit of time to render the first frame
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Stop all tracks immediately
      stream.getTracks().forEach(track => track.stop());

      const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      
      setIsOCRing(true);
      const text = await performOCR(base64Image, 'image/jpeg');
      if (text) {
        setInputText(prev => prev ? `${prev}\n${text}` : text);
      }
    } catch (err: any) {
      console.error("Screen capture error:", err);
      if (err.name === 'NotAllowedError') {
        setError("Permission denied. If you are in the preview window, please click 'Open in new tab' at the top right to enable screen capture.");
      } else if (window.self !== window.top) {
        setError("Screen capture is often blocked in previews. Please open the app in a new tab to use this feature.");
      } else {
        setError(`Screen capture failed: ${err.message || "Unknown error"}`);
      }
    } finally {
      setIsScreenCapturing(false);
      setIsOCRing(false);
    }
  };

  const handleSaveEdit = () => {
    if (result) {
      const updatedResult = { ...result, translated: editedOutput };
      setResult(updatedResult);
      updateHistoryItem(updatedResult);
      setHistory(getHistory());
      setIsEditingOutput(false);
    }
  };

  const handleSpeak = async (text: string) => {
    if (!text || isSpeaking) return;
    setIsSpeaking(true);
    setError(null);
    try {
      const base64Audio = await generateSoraniSpeech(text);
      
      // Decode base64 to binary
      const binaryString = window.atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Gemini TTS returns raw PCM 16-bit, 24kHz
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = audioContext.createBuffer(1, bytes.length / 2, 24000);
      const channelData = audioBuffer.getChannelData(0);
      
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < channelData.length; i++) {
        // Convert 16-bit PCM to float [-1, 1]
        channelData[i] = view.getInt16(i * 2, true) / 32768;
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.onended = () => setIsSpeaking(false);
      source.start();
    } catch (err: any) {
      setError("Text-to-speech failed. Please try again.");
      setIsSpeaking(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearHistory = () => {
    clearHistory();
    setHistory([]);
  };

  const selectFromHistory = (item: TranslationResult) => {
    setResult(item);
    setEditedOutput(item.translated);
    setIsEditingOutput(false);
    setInputText(item.original);
    setMode(item.mode);
  };

  const handleApiKeySelect = async () => {
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
      } else {
        setError("API Key selection is only available in the AI Studio environment.");
      }
    } catch (err) {
      console.error("Failed to open key selection:", err);
    }
  };

  const handleSaveManualKey = () => {
    if (manualKeyInput.trim()) {
      setManualApiKey(manualKeyInput.trim());
      setHasApiKey(true);
      setShowKeyModal(false);
      // Refresh the page or just continue
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] font-sans selection:bg-[#1a1a1a] selection:text-white">
      {/* Header */}
      <header className="border-b border-black/5 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1a1a1a] rounded-xl flex items-center justify-center text-white">
              <Languages size={24} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">Zryan</h1>
                <button 
                  onClick={handleApiKeySelect}
                  className={`p-1.5 rounded-lg transition-colors ${hasApiKey ? 'text-green-500 hover:bg-green-50' : 'text-black/30 hover:bg-black/5 hover:text-black/60'}`}
                  title={hasApiKey ? "API Key Loaded (Click to change)" : "Select API Key"}
                >
                  <Key size={14} />
                </button>
                <button 
                  onClick={() => setShowKeyModal(true)}
                  className="text-[10px] font-bold uppercase tracking-tighter px-2 py-1 bg-black/5 hover:bg-black/10 rounded-md transition-colors text-black/40"
                >
                  Manual Key
                </button>
              </div>
              <p className="text-[10px] uppercase tracking-widest text-black/40 font-mono">Professional Kurdish Sorani Translator</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium ${isOnline ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
              {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
              {isOnline ? "Online" : "Offline Mode"}
            </div>
          </div>
        </div>
      </header>

      {/* Manual Key Modal */}
      <AnimatePresence>
        {showKeyModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowKeyModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 space-y-6"
            >
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Manual API Key</h2>
                <p className="text-sm text-black/50 leading-relaxed">
                  Enter your personal Gemini API key here. It will be stored securely in your browser's local storage.
                </p>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-black/40">API Key</label>
                  <input 
                    type="password"
                    value={manualKeyInput}
                    onChange={(e) => setManualKeyInput(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full p-4 bg-black/5 border border-black/5 rounded-xl focus:ring-2 focus:ring-black/5 outline-none font-mono text-sm"
                  />
                </div>
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowKeyModal(false)}
                    className="flex-1 py-3 font-bold text-sm text-black/40 hover:bg-black/5 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSaveManualKey}
                    className="flex-1 py-3 font-bold text-sm bg-[#1a1a1a] text-white rounded-xl shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    Save Key
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Left Column: Input & Controls */}
        <div className="lg:col-span-2 space-y-8">
          <section className="space-y-4">
            <div className="flex justify-between items-end">
              <label className="text-[11px] uppercase tracking-widest text-black/40 font-mono font-bold">Input Text</label>
              <span className="text-[10px] text-black/30">{inputText.length} characters</span>
            </div>
            <div className="relative group">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Enter text or use voice/upload..."
                className="w-full min-h-[200px] p-6 bg-white border border-black/5 rounded-2xl shadow-sm focus:ring-2 focus:ring-black/5 focus:border-black/20 transition-all outline-none text-lg leading-relaxed resize-none"
              />
              <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button 
                  onClick={handleScreenCapture}
                  className="p-2 hover:bg-black/5 rounded-lg transition-colors text-black/40"
                  title="Screen OCR (Works best in a new tab)"
                 >
                   <Monitor size={16} />
                 </button>
                 <label className="p-2 hover:bg-black/5 rounded-lg transition-colors text-black/40 cursor-pointer" title="Upload Media/Image">
                   <Upload size={16} />
                   <input type="file" accept="audio/*,video/*,image/*" className="hidden" onChange={handleFileUpload} />
                 </label>
                 <button 
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`p-2 rounded-lg transition-colors ${isRecording ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'hover:bg-black/5 text-black/40'}`}
                  title={isRecording ? "Stop Recording" : "Voice Input"}
                 >
                   {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                 </button>
                 {inputText && (
                   <button 
                    onClick={() => setInputText("")}
                    className="p-2 hover:bg-black/5 rounded-lg transition-colors text-black/40"
                    title="Clear"
                   >
                     <Trash2 size={16} />
                   </button>
                 )}
              </div>
              {(isTranscribing || isOCRing || isScreenCapturing) && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] rounded-2xl flex items-center justify-center z-10">
                  <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-full shadow-lg border border-black/5">
                    <Loader2 size={20} className="animate-spin text-black/40" />
                    <span className="text-sm font-medium text-black/60">
                      {isScreenCapturing ? "Preparing screen capture..." : 
                       isOCRing ? "Extracting text from image..." : "Transcribing media..."}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Mode Selection */}
          <section className="space-y-4">
            <label className="text-[11px] uppercase tracking-widest text-black/40 font-mono font-bold">Translation Mode</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: TranslationMode.TRANSLATE, label: "Translate", icon: Languages, desc: "Direct translation" },
                { id: TranslationMode.REFINE, label: "Refine", icon: Sparkles, desc: "Translate & Refine" },
                { id: TranslationMode.SUMMARIZE, label: "Summarize", icon: FileText, desc: "Translate & Summarize" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`flex flex-col items-start p-4 rounded-2xl border transition-all text-left ${
                    mode === m.id 
                      ? "bg-[#1a1a1a] text-white border-[#1a1a1a] shadow-lg shadow-black/10" 
                      : "bg-white text-black/60 border-black/5 hover:border-black/20"
                  }`}
                >
                  <m.icon size={20} className={mode === m.id ? "text-white" : "text-black/40"} />
                  <span className="mt-3 font-semibold text-sm">{m.label}</span>
                  <span className={`text-[10px] mt-1 ${mode === m.id ? "text-white/60" : "text-black/30"}`}>{m.desc}</span>
                </button>
              ))}
            </div>
          </section>

          <button
            onClick={handleTranslate}
            disabled={isLoading || !inputText.trim() || (!isOnline && !result)}
            className={`w-full py-5 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all ${
              isLoading || !inputText.trim() || (!isOnline && !result)
                ? "bg-black/10 text-black/20 cursor-not-allowed"
                : "bg-[#1a1a1a] text-white hover:scale-[1.01] active:scale-[0.99] shadow-xl shadow-black/20"
            }`}
          >
            {isLoading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              >
                <Languages size={24} />
              </motion.div>
            ) : (
              <>
                <span>Translate to Kurdish</span>
                <ArrowRightLeft size={20} />
              </>
            )}
          </button>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm flex items-center gap-3"
            >
              <WifiOff size={18} />
              {error}
            </motion.div>
          )}

          {/* Result Area */}
          <AnimatePresence mode="wait">
            {result && (
              <motion.section
                key={result.timestamp}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-end">
                  <label className="text-[11px] uppercase tracking-widest text-black/40 font-mono font-bold">Kurdish Sorani Output</label>
                  <div className="flex gap-4">
                    {!isEditingOutput ? (
                      <button 
                        onClick={() => {
                          setEditedOutput(result.translated);
                          setIsEditingOutput(true);
                        }}
                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-black/40 hover:text-black transition-colors"
                      >
                        <Edit2 size={14} />
                        Edit
                      </button>
                    ) : (
                      <div className="flex gap-3">
                        <button 
                          onClick={handleSaveEdit}
                          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-green-600 hover:text-green-700 transition-colors"
                        >
                          <Save size={14} />
                          Save
                        </button>
                        <button 
                          onClick={() => setIsEditingOutput(false)}
                          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-red-500 hover:text-red-600 transition-colors"
                        >
                          <X size={14} />
                          Cancel
                        </button>
                      </div>
                    )}
                    <button 
                      onClick={() => handleSpeak(result.translated)}
                      disabled={isSpeaking}
                      className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${isSpeaking ? 'text-blue-500' : 'text-black/40 hover:text-black'}`}
                    >
                      {isSpeaking ? (
                        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
                          <Volume2 size={14} />
                        </motion.div>
                      ) : (
                        <Volume2 size={14} />
                      )}
                      {isSpeaking ? "Speaking..." : "Read Aloud"}
                    </button>
                    <button 
                      onClick={() => handleCopy(result.translated)}
                      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-black/40 hover:text-black transition-colors"
                    >
                      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                      {copied ? "Copied" : "Copy All"}
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-black/5 rounded-3xl p-8 shadow-sm space-y-8" dir="rtl">
                  {/* Main Output */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center mb-2" dir="ltr">
                      <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded ${
                        result.mode === TranslationMode.TRANSLATE ? 'bg-black/5 text-black/40' :
                        result.mode === TranslationMode.REFINE ? 'bg-blue-50 text-blue-600' :
                        'bg-purple-50 text-purple-600'
                      }`}>
                        {result.mode === TranslationMode.TRANSLATE ? 'Translation' :
                         result.mode === TranslationMode.REFINE ? 'Refined Translation' :
                         'Summary'}
                      </span>
                    </div>
                    {isEditingOutput ? (
                      <textarea
                        value={editedOutput}
                        onChange={(e) => setEditedOutput(e.target.value)}
                        className="w-full min-h-[150px] p-4 bg-black/5 border border-black/5 rounded-xl focus:ring-2 focus:ring-black/5 outline-none text-2xl leading-relaxed font-medium text-right font-serif resize-none"
                        dir="rtl"
                      />
                    ) : (
                      <p className="text-2xl leading-relaxed font-medium text-right font-serif">
                        {result.translated}
                      </p>
                    )}
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: History */}
        <aside className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <HistoryIcon size={18} className="text-black/40" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-black/60">History</h2>
            </div>
            {history.length > 0 && (
              <button 
                onClick={handleClearHistory}
                className="text-[10px] font-bold uppercase tracking-wider text-red-400 hover:text-red-600 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[800px] pr-2 custom-scrollbar">
            {history.length === 0 ? (
              <div className="p-8 border border-dashed border-black/10 rounded-2xl text-center">
                <p className="text-xs text-black/30">No translation history yet.</p>
              </div>
            ) : (
              history.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => selectFromHistory(item)}
                  className="w-full text-left p-4 bg-white border border-black/5 rounded-2xl hover:border-black/20 hover:shadow-md transition-all group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[9px] font-mono text-black/30">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="flex items-center gap-1">
                      {item.mode === TranslationMode.REFINE && <Sparkles size={10} className="text-blue-400" />}
                      {item.mode === TranslationMode.SUMMARIZE && <FileText size={10} className="text-purple-400" />}
                      <span className="text-[9px] font-mono uppercase tracking-tighter text-black/20">{item.mode}</span>
                    </div>
                  </div>
                  <p className="text-xs font-medium line-clamp-2 text-black/70 mb-2">{item.original}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-black/40 line-clamp-1 flex-1 italic" dir="rtl">{item.translated}</p>
                    <ChevronRight size={14} className="text-black/10 group-hover:text-black/30 transition-colors ml-2" />
                  </div>
                </button>
              ))
            )}
          </div>

          {!isOnline && (
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
              <p className="text-[10px] text-amber-700 leading-relaxed">
                <strong>Offline Mode:</strong> You can still browse your translation history, but new translations require an internet connection.
              </p>
            </div>
          )}
        </aside>
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-black/5 text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-black/20 font-mono">
          Powered by Gemini 3 Flash &bull; Kurdish Sorani Language Model
        </p>
      </footer>
    </div>
  );
}
