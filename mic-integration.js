// ========== GROQ WHISPER INTEGRATION FOR MIC BUTTON ==========
let recognitionActive = false;
let mediaRecorder;
let audioChunks = [];
let stream;

const GROQ_API_KEY = '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';

async function toggleMic() {
  const micBtn = document.getElementById('micBtn');
  
  if (!recognitionActive) {
    startMicRecording();
  } else {
    stopMicRecording();
  }
}

async function startMicRecording() {
  try {
    recognitionActive = true;
    const micBtn = document.getElementById('micBtn');
    micBtn.classList.add('listening');
    
    // Request microphone permission with constraints
    stream = await navigator.mediaDevices.getUserMedia({ 
      audio: { 
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    
    // Determine the correct MIME type for the browser
    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/mp4')) {
      mimeType = 'audio/mp4';
    } else if (MediaRecorder.isTypeSupported('audio/wav')) {
      mimeType = 'audio/wav';
    } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
      mimeType = 'audio/ogg';
    }
    
    mediaRecorder = new MediaRecorder(stream, { 
      mimeType: mimeType,
      audioBitsPerSecond: 128000 
    });
    
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      await transcribeWithGroqWhisper(audioBlob);
    };
    
    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event.error);
      addMsg('ai', `<span style="color:var(--err-t)">❌ Recording error: ${event.error}</span>`);
      stopMicRecording();
    };
    
    mediaRecorder.start();
    addMsg('ai', `<span style="color:var(--accent)">🎤 Listening... (click again to stop)</span>`);
    
  } catch (error) {
    console.error('Mic Error:', error);
    recognitionActive = false;
    document.getElementById('micBtn').classList.remove('listening');
    
    // Specific error messages
    if (error.name === 'NotAllowedError') {
      addMsg('ai', `<span style="color:var(--err-t)">❌ Microphone permission denied. Please enable it in browser settings and try again.</span>`);
    } else if (error.name === 'NotFoundError') {
      addMsg('ai', `<span style="color:var(--err-t)">❌ No microphone found. Please connect a microphone.</span>`);
    } else if (error.name === 'NotReadableError') {
      addMsg('ai', `<span style="color:var(--err-t)">❌ Microphone is in use by another application.</span>`);
    } else if (error.name === 'SecurityError') {
      addMsg('ai', `<span style="color:var(--err-t)">❌ Microphone blocked by browser security policy. Try in an incognito window.</span>`);
    } else {
      addMsg('ai', `<span style="color:var(--err-t)">❌ Microphone error: ${error.message}</span>`);
    }
  }
}

function stopMicRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  
  recognitionActive = false;
  const micBtn = document.getElementById('micBtn');
  micBtn.classList.remove('listening');
}

async function transcribeWithGroqWhisper(audioBlob) {
  try {
    // Check if blob is valid
    if (audioBlob.size === 0) {
      addMsg('ai', `<span style="color:var(--err-t)">❌ No audio recorded. Please try again.</span>`);
      return;
    }
    
    showTyping();
    
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'en');
    
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: formData
    });
    
    if (!response.ok) {
      let errorMsg = 'Transcription failed';
      try {
        const error = await response.json();
        errorMsg = error.error?.message || error.message || errorMsg;
      } catch (e) {
        errorMsg = `Server error (${response.status})`;
      }
      throw new Error(errorMsg);
    }
    
    const result = await response.json();
    const transcribedText = (result.text || '').trim();
    
    hideTyping();
    
    if (transcribedText) {
      inp.value = transcribedText;
      addMsg('user', `<div class="msg user"><span class="msg-time">${ts()}</span><br>${transcribedText}</div>`);
      // Automatically send the search
      setTimeout(() => send(), 300);
    } else {
      addMsg('ai', `<span style="color:var(--text2)">🎤 No speech detected. Please try again.</span>`);
    }
    
  } catch (error) {
    hideTyping();
    console.error('Groq Whisper Error:', error);
    addMsg('ai', `<span style="color:var(--err-t)">❌ Transcription error: ${error.message}</span>`);
  }
}
// ========== END GROQ WHISPER INTEGRATION ==========
