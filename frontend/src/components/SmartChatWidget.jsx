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

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

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
  };

  const handleSendText = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    await sendQuery(text, null);
  };

  const sendQuery = async (text, audioBlob) => {
    setIsLoading(true);
    
    // Add user message to UI
    const newMsg = {
      id: Date.now(),
      role: 'user',
      text: text ? text : '🎤 Audio Message',
    };
    setMessages((prev) => [...prev, newMsg]);

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
        <button className="chat-toggle-btn" onClick={handleToggle}>
          💬 
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
                   {isRecording ? '🛑 Release to Send' : '🎤 Hold to Speak'}
                 </button>
               </div>
            ) : (
               <form onSubmit={handleSendText} className="text-input-form">
                 <button 
                   type="button"
                   className={`small-mic-btn ${isRecording ? 'recording' : ''}`}
                   onClick={isRecording ? stopRecording : startRecording}
                   title={isRecording ? 'Stop Recording' : 'Start Recording'}
                 >
                   🎤
                 </button>
                 <input 
                   type="text" 
                   value={inputText}
                   onChange={(e) => setInputText(e.target.value)}
                   placeholder="Ask about farm intelligence..."
                   disabled={isRecording || isLoading}
                 />
                 <button type="submit" disabled={!inputText.trim() || isRecording || isLoading}>Send</button>
               </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
