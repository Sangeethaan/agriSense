import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './SmartChatWidget.css';

const TypewriterText = ({ text, onComplete }) => {
  const [displayedText, setDisplayedText] = useState('');
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let i = 0;
    setDisplayedText('');
    const interval = setInterval(() => {
      setDisplayedText(text.slice(0, i + 1));
      i++;
      if (i >= text.length) {
        clearInterval(interval);
        if (onCompleteRef.current) onCompleteRef.current();
      }
    }, 15); // Adjust typing speed here
    return () => clearInterval(interval);
  }, [text]);

  return <>{displayedText}</>;
};

export default function SmartChatWidget() {
  const { user, token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const messagesEndRef = useRef(null);

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognitionRef = useRef(null);
  const recognitionTextRef = useRef('');

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const inputRef = useRef(null);

  // Auto-grow and scroll textarea as the content changes
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = '38px';
      const scrollHeight = inputRef.current.scrollHeight;
      inputRef.current.style.height = `${Math.min(scrollHeight, 120)}px`;
      
      if (isRecording) {
        inputRef.current.scrollTop = inputRef.current.scrollHeight;
      }
    }
  }, [inputText, isRecording]);

  // Don't render if not logged in
  if (!user) return null;

  const handleToggle = () => setIsOpen(!isOpen);

  const markMessageAsTyped = (id) => {
    setMessages((prev) => prev.map(m => m.id === id ? { ...m, isTyping: false } : m));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recognitionTextRef.current = '';

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendQuery(null, audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);

      // Start Speech Recognition to display text in input bar as they speak
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-IN';

        recognition.onresult = (event) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          const transcriptText = finalTranscript || interimTranscript;
          setInputText(transcriptText);
          recognitionTextRef.current = transcriptText;
        };

        recognition.onerror = (e) => {
          console.warn('Speech recognition error:', e.error);
        };

        recognitionRef.current = recognition;
        recognition.start();
      }
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check your browser permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // Stop all tracks to release the microphone
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  };

  const handleSendText = async (e) => {
    if (e) e.preventDefault();
    if (isRecording) {
      stopRecording();
      return;
    }
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    await sendQuery(text, null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText(e);
    }
  };

  const sendQuery = async (text, audioBlob) => {
    setIsLoading(true);
    
    const messageId = Date.now();
    const userText = text || recognitionTextRef.current || 'Audio Message';
    recognitionTextRef.current = '';

    // Add user message to UI
    const newMsg = {
      id: messageId,
      role: 'user',
      text: userText,
    };
    setMessages((prev) => [...prev, newMsg]);
    setInputText('');

    try {
      const formData = new FormData();
      if (text) {
        formData.append('text', text);
      }
      if (audioBlob) {
        // Some backends check the filename extension, ensure it's something acceptable
        formData.append('audio', audioBlob, 'recording.webm');
      }

      const res = await fetch('http://localhost:3000/api/chat/ask', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch response');
      }

      // Update user message with the transcribed queryText from backend if available
      if (data.queryText) {
        setMessages((prev) => prev.map(m => m.id === messageId ? { ...m, text: data.queryText } : m));
      }

      setMessages((prev) => [...prev, {
        id: Date.now() + 1,
        role: 'bot',
        text: data.reply,
        source: data.source,
        audioBase64: data.audioBase64,
        isTyping: true
      }]);

      if (data.audioBase64) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
        audio.play().catch(e => console.error('Audio playback failed:', e));
      }

    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, {
        id: Date.now() + 1,
        role: 'bot',
        text: `Error: ${err.message}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="smart-chat-wrapper">
      {!isOpen && (
        <button className="chat-toggle-btn" onClick={handleToggle} aria-label="Open assistant">
          <svg viewBox="0 0 24 24" fill="none" width="26" height="26" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="white" fillOpacity="0.9" stroke="white" strokeWidth="1.4" strokeLinejoin="round"/>
            <circle cx="9" cy="10" r="1" fill="#22c55e"/>
            <circle cx="12" cy="10" r="1" fill="#22c55e"/>
            <circle cx="15" cy="10" r="1" fill="#22c55e"/>
          </svg>
        </button>
      )}

      {isOpen && (
        <div className="chat-window">
          <div className="chat-header">
            <h3>AgriSense Assistant</h3>
            <button className="close-btn" onClick={handleToggle}>&times;</button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-welcome">
                <p>Hello {user.name}!</p>
                <p>How can I help you today?</p>
              </div>
            )}
            
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-message ${msg.role}`}>
                <div className="message-bubble">
                  {msg.role === 'bot' && msg.isTyping ? (
                    <TypewriterText 
                      text={msg.text} 
                      onComplete={() => markMessageAsTyped(msg.id)} 
                    />
                  ) : (
                    msg.text
                  )}
                </div>
                {msg.source && <div className="message-source">Source: {msg.source}</div>}
              </div>
            ))}
            {isLoading && <div className="chat-message bot"><div className="message-bubble loading">Thinking...</div></div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            {user.role === 'farmer' ? (
               <div className="farmer-input">
                 <button 
                   className={`big-mic-btn ${isRecording ? 'recording' : ''}`}
                   onMouseDown={startRecording}
                   onMouseUp={stopRecording}
                   onTouchStart={startRecording}
                   onTouchEnd={stopRecording}
                 >
                   {isRecording ? 'Release to Send' : 'Hold to Speak'}
                 </button>
               </div>
            ) : (
               <form onSubmit={handleSendText} className="text-input-form">
                 <button 
                   type="button"
                   className={`small-mic-btn ${isRecording ? 'recording' : ''}`}
                   onClick={isRecording ? stopRecording : startRecording}
                   title={isRecording ? 'Stop Recording' : 'Start Recording'}
                   aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
                 >
                   <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
                     <rect x="9" y="2" width="6" height="11" rx="3" fill="#059669" opacity="0.2" stroke="#059669" strokeWidth="1.5"/>
                     <path d="M5 10a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                     <path d="M12 19v3M8 22h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                   </svg>
                 </button>
                 <textarea 
                    ref={inputRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about farm intelligence..."
                    disabled={isLoading}
                    readOnly={isRecording}
                    rows={1}
                  />
                 <button
                   type="submit"
                   className="send-btn"
                   disabled={isLoading || !inputText.trim()}
                   title="Send"
                 >
                   <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                     <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                     <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                   </svg>
                 </button>
               </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
