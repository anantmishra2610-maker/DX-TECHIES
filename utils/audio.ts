
let lastAlertTime = 0;

export const playAlertSound = () => {
  const now = Date.now();
  // Cooldown: Only play sound every 2 seconds
  if (now - lastAlertTime < 2000) return;
  lastAlertTime = now;

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  // Two-tone siren effect
  oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
  oscillator.frequency.linearRampToValueAtTime(600, audioContext.currentTime + 0.1);
  oscillator.frequency.linearRampToValueAtTime(800, audioContext.currentTime + 0.2);
  
  oscillator.type = 'square';
  
  gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
};
