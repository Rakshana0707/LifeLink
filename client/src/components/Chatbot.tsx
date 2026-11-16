import React, { useState, useRef, useEffect } from 'react';
import { useRouting } from '../context/RoutingContext';

interface ChatMessage {
  sender: 'bot' | 'user';
  text: string;
  metadata?: any;
}

export const Chatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'bot',
      text: "Hello! I'm LifeLink AI, an automated informational assistant (not a doctor). I can answer questions regarding blood donation criteria, ABO/Rh compatibility, and donation procedures, or help you broadcast an urgent emergency blood request. How can I assist you today?",
      metadata: { type: 'greeting' }
    },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const { navigateTo } = useRouting();

  // Conversation persistence
  const [conversationId, setConversationId] = useState<string>('');
  
  useEffect(() => {
    let cid = localStorage.getItem('lifelink_chat_id');
    if (!cid) {
      cid = 'chat_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('lifelink_chat_id', cid);
    }
    setConversationId(cid);
    
    // Attempt to load conversation history from local storage for seamless persistence
    const saved = localStorage.getItem('lifelink_chat_history');
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (messages.length > 1) {
      localStorage.setItem('lifelink_chat_history', JSON.stringify(messages));
    }
  }, [messages]);

  const scrollToBottom = () => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen, isTyping]);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setMessages((prev) => [...prev, { sender: 'user', text: trimmed }]);
    setInputVal('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, text: trimmed }),
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI Service unavailable');
      }

      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: data.reply || 'Information received. Please consult clinical staff for medical advice.',
          metadata: data
        }
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: '⚠️ LifeLink AI assistant is currently reconnecting. If you are experiencing a life-threatening medical emergency, please call 108 / 112 immediately or proceed to the Emergency tab to broadcast a request.',
          metadata: { type: 'error_fallback' }
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend(inputVal);
    }
  };

  const handleCreateEmergency = (parsedData: any) => {
    setIsOpen(false);
    // Use React Router state to pass data to Emergency page
    navigateTo('emergency', { autoFill: parsedData });
  };

  const handleQuickReply = (msg: string) => {
    handleSend(msg);
  };

  return (
    <>
      <button
        id="chatbot-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Ask LifeLink AI"
      >
        🤖
      </button>

      <div id="chat-window" className={isOpen ? 'open' : ''}>
        <div className="chat-hdr">
          <div className="chat-av">🤖</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>LifeLink AI (Assistant)</div>
            <div style={{ fontSize: '10px', opacity: 0.85, color: '#fef08a' }}>
              Informational Only · Emergency: Call 108/112
            </div>
          </div>
          <div className="chat-online" title="Service Connected" />
          <button
            onClick={() => setIsOpen(false)}
            style={{
              marginLeft: '8px',
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '18px',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <div className="chat-msgs">
          {messages.map((m, index) => (
            <div
              key={index}
              className={`msg ${m.sender === 'user' ? 'msg-user' : 'msg-bot'}`}
            >
              <div style={{ whiteSpace: 'pre-line' }}>{m.text}</div>
              
              {/* Emergency Confirmation Box */}
              {m.metadata && m.metadata.type === 'emergency_confirm' && (
                <div style={{ marginTop: '10px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', padding: '10px', borderRadius: '8px', fontSize: '12px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>🚨</span> Detected Emergency Parameters:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px', marginBottom: '8px' }}>
                    <div>Blood Group: <b style={{ color: 'var(--red)' }}>{m.metadata.parsed_data?.blood_group || 'Unknown'}</b></div>
                    <div>Units Needed: <b>{m.metadata.parsed_data?.quantity || 1}</b></div>
                    <div style={{ gridColumn: 'span 2' }}>Hospital: <b>{m.metadata.parsed_data?.hospital || 'Certified Facility'}</b></div>
                    <div>Urgency: <b style={{ color: '#fbbf24' }}>{m.metadata.parsed_data?.urgency || 'Critical'}</b></div>
                    <div style={{ textAlign: 'right', opacity: 0.7 }}>Conf: {(m.metadata.confidence * 100).toFixed(0)}%</div>
                  </div>
                  
                  <button 
                    onClick={() => handleCreateEmergency(m.metadata.parsed_data)}
                    style={{
                      background: 'var(--red)',
                      color: 'white',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      width: '100%',
                      fontSize: '12px'
                    }}>
                    🚨 Open Emergency Request Broadcast
                  </button>
                </div>
              )}

              {/* RAG Source Display */}
              {m.metadata && m.metadata.type === 'rag' && m.metadata.source && m.metadata.source.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--gr)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '4px' }}>
                  <b>Verified Sources:</b> {Array.from(new Set((m.metadata.source as any[]).map((s) => s.filename))).join(', ')}
                </div>
              )}
            </div>
          ))}
          
          {isTyping && (
            <div className="msg msg-bot" style={{ fontStyle: 'italic', opacity: 0.7 }}>
              Thinking...
            </div>
          )}
          <div ref={msgsEndRef} />
        </div>

        <div className="chat-qr">
          <button className="chat-qr-btn" onClick={() => handleQuickReply('What are the eligibility requirements to donate blood?')}>
            Eligibility?
          </button>
          <button className="chat-qr-btn" onClick={() => handleQuickReply('Who can receive O- blood?')}>
            Compatibility
          </button>
          <button className="chat-qr-btn" onClick={() => handleQuickReply('I urgently need 2 units of O+ blood at City Hospital')}>
            Emergency
          </button>
        </div>

        <div className="chat-input-row">
          <input
            className="chat-in"
            placeholder="Ask medical or donation questions..."
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isTyping}
          />
          <button className="chat-send" onClick={() => handleSend(inputVal)} disabled={isTyping}>
            Send
          </button>
        </div>
      </div>
    </>
  );
};
export default Chatbot;