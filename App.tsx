
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { 
  Camera, 
  Square, 
  // Changed non-existent 'Screenshot' icon to 'Image'
  Image as ScreenshotIcon, 
  Radio, 
  Settings as SettingsIcon,
  Activity,
  History,
  TrendingUp,
  AlertTriangle,
  Download,
  Upload,
  Clock,
  Circle
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Detection, 
  Screenshot, 
  LogEntry, 
  Stats, 
  DetectionSpeed 
} from './types';
import { playAlertSound } from './utils/audio';

const App: React.FC = () => {
  // State
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);
  const [isSystemReady, setIsSystemReady] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'logs' | 'gallery'>('stats');

  // Stats State
  const [stats, setStats] = useState<Stats>({
    currentCount: 0,
    peakCount: 0,
    avgCount: 0,
    totalDetections: 0,
    sessionStartTime: null
  });
  const [chartData, setChartData] = useState<{ time: string, count: number }[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [sessionDuration, setSessionDuration] = useState('00:00');
  const [fps, setFps] = useState(0);

  // Configuration
  const [threshold, setThreshold] = useState(3);
  const [confidence, setConfidence] = useState(0.5);
  const [detectionSpeed, setDetectionSpeed] = useState<DetectionSpeed>(DetectionSpeed.NORMAL);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const detectionLoopRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());
  const historyRef = useRef<number[]>([]);

  // Logger
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      time: new Date().toLocaleTimeString(),
      message,
      type
    };
    setLogs(prev => [entry, ...prev].slice(0, 100));
  }, []);

  // Initialize Model
  useEffect(() => {
    const loadModel = async () => {
      try {
        await tf.ready();
        const loadedModel = await cocoSsd.load();
        setModel(loadedModel);
        setIsSystemReady(true);
        addLog("Neural network initialized and ready.", "success");
      } catch (err) {
        console.error("Model loading failed:", err);
        addLog("Failed to initialize detection engine.", "error");
      }
    };
    loadModel();
  }, [addLog]);

  // Session timer
  useEffect(() => {
    let interval: any;
    if (isMonitoring && stats.sessionStartTime) {
      interval = setInterval(() => {
        const seconds = Math.floor((Date.now() - stats.sessionStartTime!) / 1000);
        const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
        const ss = String(seconds % 60).padStart(2, '0');
        setSessionDuration(`${mm}:${ss}`);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isMonitoring, stats.sessionStartTime]);

  // Render detections
  const renderDetections = useCallback((detections: Detection[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 14px Inter';
    ctx.textBaseline = 'top';

    detections.forEach(detection => {
      const [x, y, width, height] = detection.bbox;
      const score = Math.round(detection.score * 100);

      // Bounding box
      ctx.strokeStyle = '#10b981'; // emerald-500
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);

      // Label background
      const label = `PERSON ${score}%`;
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
      ctx.fillRect(x, y - 22, textWidth + 10, 22);

      // Label text
      ctx.fillStyle = '#000';
      ctx.fillText(label, x + 5, y - 18);
    });
  }, []);

  // Detection loop
  const runDetection = useCallback(async () => {
    if (!model || !isMonitoring || !videoRef.current) return;

    if (videoRef.current.readyState === 4) {
      try {
        const predictions = await model.detect(videoRef.current);
        const people = predictions.filter(p => p.class === 'person' && p.score >= confidence) as unknown as Detection[];
        const count = people.length;

        // Update stats
        setStats(prev => ({
          ...prev,
          currentCount: count,
          peakCount: Math.max(prev.peakCount, count),
          totalDetections: prev.totalDetections + (count > 0 ? 1 : 0)
        }));

        historyRef.current.push(count);
        renderDetections(people);

        // Sound alert
        if (soundEnabled && count >= threshold) {
          playAlertSound();
        }

        // FPS calculation
        frameCountRef.current++;
        const now = Date.now();
        const delta = now - lastFpsTimeRef.current;
        if (delta >= 1000) {
          setFps(Math.round((frameCountRef.current * 1000) / delta));
          frameCountRef.current = 0;
          lastFpsTimeRef.current = now;

          // Push to chart every second
          setChartData(prev => [...prev, { 
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), 
            count 
          }].slice(-30));
        }

      } catch (err) {
        console.warn("Detection cycle skipped:", err);
      }
    }

    const delay = detectionSpeed === DetectionSpeed.FAST ? 30 : detectionSpeed === DetectionSpeed.NORMAL ? 100 : 250;
    setTimeout(() => {
      detectionLoopRef.current = requestAnimationFrame(runDetection);
    }, delay);
  }, [model, isMonitoring, confidence, threshold, soundEnabled, detectionSpeed, renderDetections]);

  // Start Webcam
  const handleStartWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'environment' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          if (canvasRef.current && videoRef.current) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
          }
          setIsMonitoring(true);
          setStats(s => ({ ...s, sessionStartTime: Date.now() }));
          addLog("Live monitoring started via webcam.", "success");
        };
      }
    } catch (err) {
      addLog("Failed to access camera. Check permissions.", "error");
    }
  };

  // Upload Video
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && videoRef.current) {
      const url = URL.createObjectURL(file);
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play();
        if (canvasRef.current && videoRef.current) {
          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;
        }
        setIsMonitoring(true);
        setStats(s => ({ ...s, sessionStartTime: Date.now() }));
        addLog(`Processing video file: ${file.name}`, "info");
      };
    }
  };

  // Stop everything
  const handleStop = () => {
    setIsMonitoring(false);
    setIsRecording(false);
    if (detectionLoopRef.current) cancelAnimationFrame(detectionLoopRef.current);
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
      videoRef.current.srcObject = null;
    }
    setSessionDuration('00:00');
    addLog("Monitoring halted.", "warning");
  };

  // Screenshots
  const takeScreenshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const shotCanvas = document.createElement('canvas');
    shotCanvas.width = videoRef.current.videoWidth;
    shotCanvas.height = videoRef.current.videoHeight;
    const ctx = shotCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      ctx.drawImage(canvasRef.current, 0, 0);
      const url = shotCanvas.toDataURL('image/png');
      const newShot: Screenshot = {
        id: Math.random().toString(36).substr(2, 9),
        url,
        timestamp: new Date().toLocaleTimeString(),
        count: stats.currentCount
      };
      setScreenshots(prev => [newShot, ...prev]);
      addLog("Manual screenshot captured.", "success");
    }
  };

  // Recording
  const toggleRecording = () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      addLog("Recording saved.", "success");
    } else {
      if (!videoRef.current || !canvasRef.current) return;
      
      const recordCanvas = document.createElement('canvas');
      recordCanvas.width = videoRef.current.videoWidth;
      recordCanvas.height = videoRef.current.videoHeight;
      const ctx = recordCanvas.getContext('2d');
      
      const stream = recordCanvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DX_Surveillance_${Date.now()}.webm`;
        a.click();
      };

      const drawLoop = () => {
        if (recorder.state === 'recording') {
          ctx?.drawImage(videoRef.current!, 0, 0);
          ctx?.drawImage(canvasRef.current!, 0, 0);
          requestAnimationFrame(drawLoop);
        }
      };

      recorder.start();
      setIsRecording(true);
      drawLoop();
      addLog("Video recording started.", "info");
      mediaRecorderRef.current = recorder;
    }
  };

  // Launch loop
  useEffect(() => {
    if (isMonitoring) {
      runDetection();
    }
    return () => {
      if (detectionLoopRef.current) cancelAnimationFrame(detectionLoopRef.current);
    };
  }, [isMonitoring, runDetection]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-neutral-900 border-b border-emerald-500/30 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500 p-2 rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.4)]">
            <Radio className="text-black w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">DX TECHIES <span className="text-emerald-500">SURVEILLANCE</span></h1>
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-semibold">Pro AI Detection Suite</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${stats.currentCount >= threshold ? 'bg-red-500 animate-ping' : 'bg-emerald-500'}`} />
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">
              {stats.currentCount >= threshold ? 'Crowd Alert' : 'Normal Activity'}
            </span>
          </div>
          <div className="bg-neutral-800 px-3 py-1 rounded border border-neutral-700">
            <span className="text-xs font-mono text-emerald-400">
              {isSystemReady ? 'MODEL: COCO-SSD-V2' : 'LOADING NEURAL ENGINE...'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-hidden">
        
        {/* Left Column: Feed & Controls */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Feed Card */}
          <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-1 shadow-2xl relative group">
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center">
              {!isMonitoring && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950/80 z-20 text-center p-8">
                  <Camera className="w-16 h-16 text-emerald-500/20 mb-4" />
                  <h2 className="text-xl font-medium mb-2">No Active Feed</h2>
                  <p className="text-neutral-500 max-w-xs text-sm">Start your webcam or upload a video file to begin AI crowd monitoring.</p>
                </div>
              )}

              <video 
                ref={videoRef} 
                className="w-full h-full object-contain"
                muted
                playsInline
              />
              <canvas 
                ref={canvasRef} 
                className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
              />

              {/* HUD Overlays */}
              {isMonitoring && (
                <div className="absolute top-4 left-4 flex flex-col gap-2 z-30 pointer-events-none">
                  <div className="bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-neutral-400 uppercase font-bold">FPS</span>
                      <span className="text-sm font-mono text-emerald-400">{fps}</span>
                    </div>
                    <div className="w-px h-6 bg-white/10" />
                    <div className="flex flex-col">
                      <span className="text-[10px] text-neutral-400 uppercase font-bold">Res</span>
                      <span className="text-sm font-mono text-white">720p</span>
                    </div>
                  </div>
                </div>
              )}

              {isMonitoring && (
                 <div className="absolute top-4 right-4 z-30 pointer-events-none">
                    <div className="bg-red-600/90 backdrop-blur px-3 py-1 rounded-full flex items-center gap-2 animate-pulse">
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      <span className="text-xs font-bold text-white uppercase">Live Monitoring</span>
                    </div>
                 </div>
              )}
            </div>

            {/* Quick Actions Bar */}
            <div className="flex items-center justify-between p-4 bg-neutral-900 border-t border-neutral-800 rounded-b-2xl">
              <div className="flex gap-3">
                <button 
                  onClick={handleStartWebcam}
                  disabled={isMonitoring || !isSystemReady}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-emerald-900/20"
                >
                  <Camera className="w-4 h-4" /> Start Webcam
                </button>
                <button 
                  onClick={handleStop}
                  disabled={!isMonitoring}
                  className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-all"
                >
                  <Square className="w-4 h-4" /> Stop Feed
                </button>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={takeScreenshot}
                  disabled={!isMonitoring}
                  className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-all border border-transparent hover:border-neutral-700"
                  title="Capture Frame"
                >
                  <ScreenshotIcon className="w-5 h-5" />
                </button>
                <button 
                  onClick={toggleRecording}
                  disabled={!isMonitoring}
                  className={`p-2 rounded-lg transition-all border ${isRecording ? 'bg-red-500/20 text-red-500 border-red-500/50' : 'hover:bg-neutral-800 text-neutral-400 hover:text-white border-transparent hover:border-neutral-700'}`}
                  title={isRecording ? 'Stop Recording' : 'Start Recording'}
                >
                  <Circle className={`w-5 h-5 ${isRecording ? 'fill-red-500' : ''}`} />
                </button>
                <div className="relative group">
                  <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-all border border-transparent hover:border-neutral-700">
                    <Upload className="w-5 h-5" />
                    <input type="file" className="hidden" accept="video/*" onChange={handleUpload} />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Settings Section */}
          <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6">
            <div className="flex items-center gap-2 mb-6">
              <SettingsIcon className="w-5 h-5 text-emerald-500" />
              <h3 className="text-lg font-bold">Detection Parameters</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-xs text-neutral-400 font-bold uppercase">Alert Threshold</label>
                  <span className="text-emerald-500 font-bold text-sm">{threshold} People</span>
                </div>
                <input 
                  type="range" min="1" max="20" step="1"
                  value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-xs text-neutral-400 font-bold uppercase">Confidence Level</label>
                  <span className="text-emerald-500 font-bold text-sm">{Math.round(confidence * 100)}%</span>
                </div>
                <input 
                  type="range" min="0.1" max="0.9" step="0.05"
                  value={confidence} onChange={(e) => setConfidence(Number(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs text-neutral-400 font-bold uppercase block">Processing Mode</label>
                <select 
                  value={detectionSpeed}
                  onChange={(e) => setDetectionSpeed(e.target.value as DetectionSpeed)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                >
                  <option value={DetectionSpeed.FAST}>Efficiency (High FPS)</option>
                  <option value={DetectionSpeed.NORMAL}>Balanced</option>
                  <option value={DetectionSpeed.ACCURATE}>Precision (Deep Search)</option>
                </select>
              </div>

              <div className="space-y-3 flex flex-col justify-end">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors ${soundEnabled ? 'bg-emerald-500' : 'bg-neutral-700'}`}>
                    <input type="checkbox" className="hidden" checked={soundEnabled} onChange={() => setSoundEnabled(!soundEnabled)} />
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transition-transform ${soundEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                  <span className="text-xs text-neutral-300 font-bold uppercase group-hover:text-white">Audible Alerts</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Analytics */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Stats Dashboard */}
          <div className="bg-neutral-900 rounded-2xl border border-neutral-800 flex flex-col h-full overflow-hidden">
            {/* Tabs Header */}
            <div className="flex border-b border-neutral-800 p-1">
              {[
                { id: 'stats', label: 'Dashboard', icon: Activity },
                { id: 'logs', label: 'Activity Log', icon: History },
                { id: 'gallery', label: 'Screenshots', icon: ScreenshotIcon },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${activeTab === tab.id ? 'bg-neutral-800 text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
              {activeTab === 'stats' && (
                <div className="space-y-8">
                  {/* Real-time Counters */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-neutral-800/50 p-4 rounded-2xl border border-neutral-700">
                      <span className="text-[10px] text-neutral-500 uppercase font-black">Present Count</span>
                      <div className="flex items-end gap-2 mt-1">
                        <span className={`text-4xl font-mono font-bold leading-none ${stats.currentCount >= threshold ? 'text-red-500' : 'text-emerald-400'}`}>
                          {stats.currentCount}
                        </span>
                        <TrendingUp className={`w-4 h-4 mb-1 ${stats.currentCount > 0 ? 'text-emerald-500' : 'text-neutral-600'}`} />
                      </div>
                    </div>
                    <div className="bg-neutral-800/50 p-4 rounded-2xl border border-neutral-700">
                      <span className="text-[10px] text-neutral-500 uppercase font-black">Peak Density</span>
                      <div className="flex items-end gap-2 mt-1">
                        <span className="text-4xl font-mono font-bold leading-none text-white">
                          {stats.peakCount}
                        </span>
                        <div className="text-[10px] mb-1 text-neutral-500">MAX</div>
                      </div>
                    </div>
                  </div>

                  {/* Trends Chart */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                        <TrendingUp className="w-3 h-3" /> Population Trend
                      </h4>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-[10px] text-neutral-500 font-bold uppercase">Real-time</span>
                      </div>
                    </div>
                    <div className="h-48 w-full bg-neutral-950/50 rounded-xl p-2 border border-neutral-800">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                          <XAxis dataKey="time" hide />
                          <YAxis domain={[0, 'auto']} hide />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#171717', border: '1px solid #404040', fontSize: '10px' }}
                            itemStyle={{ color: '#10b981' }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="count" 
                            stroke="#10b981" 
                            strokeWidth={3} 
                            dot={false}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Secondary Metrics */}
                  <div className="space-y-4">
                     <div className="flex items-center justify-between p-4 bg-neutral-800/30 rounded-xl border border-neutral-700/50">
                        <div className="flex items-center gap-3">
                          <Clock className="w-4 h-4 text-neutral-500" />
                          <span className="text-xs text-neutral-400 font-medium">Session Duration</span>
                        </div>
                        <span className="font-mono text-sm text-white">{sessionDuration}</span>
                     </div>
                     <div className="flex items-center justify-between p-4 bg-neutral-800/30 rounded-xl border border-neutral-700/50">
                        <div className="flex items-center gap-3">
                          <Activity className="w-4 h-4 text-neutral-500" />
                          <span className="text-xs text-neutral-400 font-medium">Capture Instances</span>
                        </div>
                        <span className="font-mono text-sm text-white">{stats.totalDetections}</span>
                     </div>
                  </div>

                  {/* Team Branding */}
                  <div className="pt-6 border-t border-neutral-800/50">
                    <div className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-xl">
                      <h4 className="text-[10px] font-black uppercase text-emerald-500 mb-2 tracking-widest">Project Team</h4>
                      <div className="grid grid-cols-2 gap-y-1">
                        <div className="text-[11px] text-neutral-300 font-bold underline decoration-emerald-500/50">Anant Mishra</div>
                        <div className="text-[11px] text-neutral-400">Lead Architecture</div>
                        <div className="text-[11px] text-neutral-300 font-bold underline decoration-emerald-500/50">Mohammad Areeb</div>
                        <div className="text-[11px] text-neutral-400">Frontend DevOps</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'logs' && (
                <div className="space-y-2">
                  {logs.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-xs text-neutral-600 font-bold uppercase tracking-widest">No activity reported</p>
                    </div>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="group border-b border-neutral-800 pb-2 last:border-0">
                        <div className="flex gap-3">
                          <span className="text-[10px] font-mono text-neutral-600 shrink-0 mt-1">[{log.time}]</span>
                          <p className={`text-xs font-medium leading-relaxed ${
                            log.type === 'alert' ? 'text-red-400' : 
                            log.type === 'success' ? 'text-emerald-400' :
                            log.type === 'warning' ? 'text-amber-400' :
                            'text-neutral-400'
                          }`}>
                            {log.type === 'alert' && <AlertTriangle className="inline w-3 h-3 mr-1 mb-0.5" />}
                            {log.message}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'gallery' && (
                <div className="grid grid-cols-1 gap-4">
                  {screenshots.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-xs text-neutral-600 font-bold uppercase tracking-widest">Gallery empty</p>
                    </div>
                  ) : (
                    screenshots.map(shot => (
                      <div key={shot.id} className="bg-neutral-800 rounded-xl overflow-hidden border border-neutral-700 flex flex-col group">
                        <div className="relative aspect-video">
                          <img src={shot.url} alt="Security Capture" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <a href={shot.url} download={`capture_${shot.id}.png`} className="bg-emerald-500 p-2 rounded-full text-black hover:scale-110 transition-transform">
                              <Download className="w-5 h-5" />
                            </a>
                          </div>
                        </div>
                        <div className="p-3 flex justify-between items-center bg-neutral-900">
                          <div>
                            <p className="text-[10px] text-neutral-500 font-bold uppercase">{shot.timestamp}</p>
                            <p className="text-xs font-bold text-white">Count: {shot.count} People</p>
                          </div>
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Alert Banner */}
      {isMonitoring && stats.currentCount >= threshold && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-lg px-6">
          <div className="bg-red-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between border-2 border-white/20 animate-bounce">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider">Crowd Warning</h4>
                <p className="text-xs font-bold text-white/80">Threshold of {threshold} exceeded in primary zone.</p>
              </div>
            </div>
            <span className="text-3xl font-mono font-black">{stats.currentCount}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
