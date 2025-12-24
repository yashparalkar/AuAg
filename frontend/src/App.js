import React, { useState, useEffect, useRef } from 'react';
import { Mail, Send, User, X, Check, Inbox, RefreshCw, ArrowLeft, Clock, Mic, Square, Reply } from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_BASE;

// Simple markdown to HTML converter
const parseMarkdown = (text) => {
  let html = text;
  
  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>');
  
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong class="font-semibold">$1</strong>');
  
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>');
  html = html.replace(/_(.+?)_/g, '<em class="italic">$1</em>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Code blocks
  html = html.replace(/```(\w+)?\n([\s\S]+?)```/g, '<pre class="bg-gray-100 p-3 rounded-lg my-2 overflow-x-auto"><code>$2</code></pre>');
  
  // Inline code
  html = html.replace(/`(.+?)`/g, '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');
  
  // Unordered lists
  html = html.replace(/^\* (.+)$/gim, '<li class="ml-4">$1</li>');
  html = html.replace(/^- (.+)$/gim, '<li class="ml-4">$1</li>');
  html = html.replace(/(<li class="ml-4">.*<\/li>)/s, '<ul class="list-disc list-inside my-2">$1</ul>');
  
  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gim, '<li class="ml-4">$1</li>');
  
  // Line breaks
  html = html.replace(/\n\n/g, '</p><p class="mb-2">');
  html = html.replace(/\n/g, '<br>');
  
  // Wrap in paragraph
  html = '<p class="mb-2">' + html + '</p>';
  
  return html;
};

// Detect if text contains markdown
const hasMarkdown = (text) => {
  const markdownPatterns = [
    /^#{1,6}\s/m,           // Headers
    /\*\*.*\*\*/,           // Bold
    /\[.*\]\(.*\)/,         // Links
    /```[\s\S]*```/,        // Code blocks
    /`.*`/,                 // Inline code
    /^\* /m,                // Unordered list
    /^- /m,                 // Unordered list
    /^\d+\. /m              // Ordered list
  ];
  
  return markdownPatterns.some(pattern => pattern.test(text));
};

const GmailComposeApp = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [toField, setToField] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [status, setStatus] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [loading, setLoading] = useState(false);

  // Inbox states
  const [currentView, setCurrentView] = useState('inbox'); // 'inbox', 'compose', 'message'
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);

  const [composeContext, setComposeContext] = useState(null);
  const [emailGenerated, setEmailGenerated] = useState(false);
  const [mediatorState, setMediatorState] = useState(null);
  const [prevMediatorState, setPrevMediatorState] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [ccField, setCcField] = useState('');
  const [bccField, setBccField] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);

  // ... existing state ...
  
  // NEW STATES FOR REPLY LOGIC
  const [showReplyMenu, setShowReplyMenu] = useState(false);
  const [inlineReplyOpen, setInlineReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  
  // Function to handle the "Reply" button click (Show options)
  const handleReplyClick = () => {
    setShowReplyMenu(true);
  };

  // Option 1: Reply to Thread (Inline)
  const handleReplyThread = () => {
    setShowReplyMenu(false);
    setInlineReplyOpen(true);
    // Auto-scroll to bottom to show input
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  // Option 2: New Message (Full Compose)
  const handleReplyNew = () => {
    setShowReplyMenu(false);
    // Logic to open full compose
    const emailMatch = selectedMessage.from.match(/<([^>]+)>/);
    const replyToEmail = emailMatch ? emailMatch[1] : selectedMessage.from;
    
    setToField(replyToEmail);
    setSubject(selectedMessage.subject); // Keep subject but it's a new mail
    setBody('');
    setShowCompose(true);
    setCurrentView('compose');
  };

  const sendInlineReply = async () => {
    if (!replyBody.trim()) return;
    
    setLoading(true);
    setStatus('Sending reply...');

    try {
      const emailMatch = selectedMessage.from.match(/<([^>]+)>/);
      const replyToEmail = emailMatch ? emailMatch[1] : selectedMessage.from;

      const response = await fetch(`${API_BASE}/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          to: replyToEmail, 
          subject: selectedMessage.subject, 
          body: replyBody,
          threadId: selectedMessage.threadId,
          messageId: selectedMessage.id  // <--- ADD THIS LINE (Pass the ID of the mail we are reading)
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStatus('Reply sent!');
        setReplyBody('');
        setInlineReplyOpen(false);
      } else {
        setStatus('Failed: ' + data.error);
      }
    } catch (error) {
      setStatus('Error: ' + error.message);
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(''), 2000);
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Load inbox when authenticated
  useEffect(() => {
    if (isAuthenticated && currentView === 'inbox') {
      loadInbox();
    }
  }, [isAuthenticated, currentView]);

  const loadInbox = async (pageToken = null) => {
    setLoadingMessages(true);
    try {
      const url = pageToken 
        ? `${API_BASE}/inbox/messages?pageToken=${pageToken}`
        : `${API_BASE}/inbox/messages`;

      const response = await fetch(url, {
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        setMessages(prev => pageToken ? [...prev, ...data.messages] : data.messages);
        setNextPageToken(data.nextPageToken);
      }
    } catch (error) {
      console.error('Failed to load inbox:', error);
      setStatus('Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadMessageDetail = async (messageId) => {
  try {
    const response = await fetch(`${API_BASE}/inbox/message/${messageId}`, {
      credentials: 'include'
    });

    const data = await response.json();

    if (data.success) {
      // Store the complete message including threadId
      setSelectedMessage({
        ...data.message,
        threadId: data.message.threadId || data.message.id // Ensure threadId is present
      });
      setCurrentView('message');
      
      // Update unread status in list
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, isUnread: false } : msg
      ));
    }
  } catch (error) {
    console.error('Failed to load message:', error);
  }
};

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const extractSenderName = (fromString) => {
    const match = fromString.match(/^([^<]+)</);
    return match ? match[1].trim() : fromString.split('<')[0].trim();
  };

  useEffect(() => {
    if (!showCompose) return;

    const loadComposeContext = async () => {
      try {
        const response = await fetch(`${API_BASE}/compose/context`, {
          credentials: 'include'
        });

        const data = await response.json();

        if (data.recipient_name) {
          setToField(data.recipient_name);
        }

        setComposeContext(data);
      } catch (err) {
        console.error('Failed to load compose context', err);
      }
    };

    loadComposeContext();
  }, [showCompose]);

  useEffect(() => {
    if (!showCompose) {
      setEmailGenerated(false);
    }
  }, [showCompose]);

  const handleAudioToggle = async () => {
    if (!isRecording) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm"
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm"
        });

        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");

        const response = await fetch(`${API_BASE}/audio/transcribe`, {
          method: "POST",
          credentials: "include",
          body: formData
        });

        const data = await response.json();

        if (data.success) {
          await fetch(`${API_BASE}/mediator/advance`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ input: data.text })
          });
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);

    } else {
      mediaRecorderRef.current.stop();
      streamRef.current.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
      streamRef.current = null;
      setIsRecording(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/mediator/state`, {
          credentials: 'include'
        });

        const newState = await response.json();

        setMediatorState(prev => {
          setPrevMediatorState(prev);
          return newState;
        });
      } catch (err) {
        console.error('Mediator polling failed', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!mediatorState || !prevMediatorState) return;

    if (
      mediatorState.recipient_name &&
      mediatorState.recipient_name !== prevMediatorState.recipient_name &&
      mediatorState.recipient_name !== toField
    ) {
      setToField(mediatorState.recipient_name);
    }

    if (
      mediatorState.description &&
      mediatorState.description !== prevMediatorState.description
    ) {
      setEmailGenerated(false);
    }

  }, [mediatorState, prevMediatorState, toField]);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/status`, {
        credentials: 'include'
      });
      const data = await response.json();
      setIsAuthenticated(data.authenticated);
      if (data.email) setUserEmail(data.email);
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  };

  const handleAuth = () => {
    setStatus('Redirecting to Google...');
    window.location.href = `${API_BASE}/auth/google/login`;
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      setIsAuthenticated(false);
      setUserEmail('');
      setShowCompose(false);
      setStatus('Logged out');
      setTimeout(() => setStatus(''), 2000);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  useEffect(() => {
    const searchContacts = async () => {
      if (toField.trim().length < 2) {
        setSuggestions([]);
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE}/contacts/search?q=${encodeURIComponent(toField)}`,
          { credentials: 'include' }
        );
        const data = await response.json();
        setSuggestions(data.contacts || []);
        setSelectedIndex(-1);
      } catch (error) {
        console.error('Contact search failed:', error);
      }
    };

    const timeoutId = setTimeout(searchContacts, 300);
    return () => clearTimeout(timeoutId);
  }, [toField]);

  useEffect(() => {
    if (!composeContext) return;
    if (composeContext.recipient_option_index === null) return;
    if (suggestions.length === 0) return;
    if (toField.includes('@')) return;

    const index = composeContext.recipient_option_index;

    if (index < 0 || index >= suggestions.length) {
      console.warn('Mediator provided invalid recipient option index');
      return;
    }

    const selectedContact = suggestions[index];
    setToField(selectedContact.email);
    setSuggestions([]);
    setSelectedIndex(-1);
  }, [suggestions, composeContext, toField]);

  useEffect(() => {
    if (!showCompose) return;
    if (emailGenerated) return;
    if (!mediatorState) return;
    if (!mediatorState.description) return;

    const generateEmail = async () => {
      setLoading(true);
      setStatus('Generating email...');

      try {
        const response = await fetch(`${API_BASE}/email/generate`, {
          method: 'POST',
          credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
          setSubject(data.subject);
          setBody(data.body);
          setEmailGenerated(true);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    generateEmail();
  }, [showCompose, mediatorState, emailGenerated]);

  const handleKeyDown = (e) => {
    if (suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[selectedIndex]);
    }
  };

  const selectSuggestion = (contact) => {
    setToField(contact.email);
    setSuggestions([]);
    setSelectedIndex(-1);
  };

  const handleSend = async () => {
    if (!toField || !subject) {
      setStatus('Please fill in recipient and subject');
      setTimeout(() => setStatus(''), 2000);
      return;
    }

    setLoading(true);
    setStatus('Sending email...');
    
    try {
      const response = await fetch(`${API_BASE}/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to: toField, subject, body })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStatus('Email sent successfully!');
        setToField('');
        setSubject('');
        setBody('');
        setShowCompose(false);
        setCurrentView('inbox');
      } else {
        setStatus('Failed to send: ' + data.error);
      }
    } catch (error) {
      setStatus('Error: ' + error.message);
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(''), 3000);
    }
  };


  const handleReply = () => {
    if (!selectedMessage) return;

    // 1. Extract email address from "Name <email@domain.com>" format
    const emailMatch = selectedMessage.from.match(/<([^>]+)>/);
    const replyToEmail = emailMatch ? emailMatch[1] : selectedMessage.from;

    // 2. Add "Re:" to subject if not already there
    const replySubject = selectedMessage.subject.startsWith('Re:') 
      ? selectedMessage.subject 
      : `Re: ${selectedMessage.subject}`;

    // 3. Set state
    setToField(replyToEmail);
    setSubject(replySubject);
    setBody(''); // Optional: You could add "\n\n--- Original Message ---" here
    
    // 4. Switch view
    setShowCompose(true);
    setCurrentView('compose');
  };

  const handleCompose = () => {
    setShowCompose(true);
    setCurrentView('compose');
    setToField('');
    setSubject('');
    setBody('');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-6 sm:p-8 max-w-md w-full mx-auto">
          <div className="text-center mb-6">
            <div className="inline-block p-4 bg-blue-100 rounded-full mb-4">
              <Mail className="w-10 h-10 sm:w-12 sm:h-12 text-blue-600" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">Gmail Assistant</h1>
            <p className="text-sm sm:text-base text-gray-600">Authenticate with Google to access your inbox</p>
          </div>
          
          <button
            onClick={handleAuth}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {/* SVG Icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            {loading ? 'Authenticating...' : 'Sign in with Google'}
          </button>

          {status && (
            <div className="mt-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm text-center">
              {status}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Mail className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
            <h1 className="text-lg sm:text-xl font-semibold text-gray-800">Gmail Assistant</h1>
          </div>
          <div className="flex items-center gap-3">
             <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
               <User className="w-4 h-4" />
               <span className="truncate max-w-[150px]">{userEmail}</span>
             </div>
             <button onClick={handleLogout} className="text-sm text-gray-600 hover:text-gray-800 border px-3 py-1 rounded-md">
               Logout
             </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto p-2 sm:p-6 pb-24 sm:pb-6">
        {status && (
          <div className="mb-4 p-3 sm:p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-2 text-sm sm:text-base">
            <Check className="w-5 h-5 flex-shrink-0" />
            {status}
          </div>
        )}

        {/* --- INBOX VIEW --- */}
        {currentView === 'inbox' && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 bg-gray-50 sm:bg-white">
              <div className="flex items-center gap-2">
                <Inbox className="w-5 h-5 text-gray-600" />
                <h2 className="text-md sm:text-lg font-semibold text-gray-800">Inbox</h2>
              </div>
              <div className="flex gap-2">
                <button onClick={() => loadInbox()} disabled={loadingMessages} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <RefreshCw className={`w-5 h-5 ${loadingMessages ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={handleCompose} className="hidden sm:inline-flex bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Compose
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-200">
              {loadingMessages && messages.length === 0 ? (
                <div className="p-8 text-center text-gray-500">Loading...</div>
              ) : messages.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No messages found</div>
              ) : (
                <>
                  {messages.map((message) => (
                    <button
                      key={message.id}
                      onClick={() => loadMessageDetail(message.id)}
                      className={`w-full text-left p-3 sm:p-4 hover:bg-gray-50 cursor-pointer transition-colors ${message.isUnread ? 'bg-blue-50' : ''}`}
                    >
                      <div className="flex justify-between items-baseline mb-1 gap-2">
                        <span className={`font-medium text-sm sm:text-base text-gray-900 truncate flex-1 ${message.isUnread ? 'font-bold' : ''}`}>
                          {extractSenderName(message.from)}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0">
                          {message.isUnread && <span className="w-2 h-2 bg-blue-600 rounded-full mr-1"></span>}
                          <Clock className="w-3 h-3" />
                          {formatDate(message.date)}
                        </div>
                      </div>
                      <div className={`text-sm mb-1 truncate ${message.isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{message.subject}</div>
                      <div className="text-sm text-gray-500 line-clamp-2 sm:truncate">{message.snippet}</div>
                    </button>
                  ))}
                  {nextPageToken && (
                    <div className="p-4 text-center">
                      <button onClick={() => loadInbox(nextPageToken)} disabled={loadingMessages} className="text-blue-600 font-medium">Load More</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* --- MESSAGE DETAIL VIEW --- */}
        {currentView === 'message' && selectedMessage && (
          <div className="bg-white rounded-lg shadow-lg flex flex-col h-full sm:h-auto pb-4">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <button
                onClick={() => {
                  setCurrentView('inbox');
                  setSelectedMessage(null);
                  setInlineReplyOpen(false); // Close inline reply when going back
                }}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 py-2"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline">Back</span>
              </button>
              
              {/* Desktop Reply Button */}
              <button
                onClick={handleReplyClick}
                className="hidden sm:flex bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg items-center gap-2"
              >
                <Reply className="w-4 h-4" />
                Reply
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto">
              <h2 className="text-lg sm:text-2xl font-semibold text-gray-900 mb-4 break-words">{selectedMessage.subject}</h2>
              <div className="mb-6 space-y-2 bg-gray-50 p-3 rounded-lg text-xs sm:text-sm">
                <div className="flex flex-col sm:flex-row gap-1">
                  <span className="font-medium text-gray-700 min-w-[3rem]">From:</span>
                  <span className="text-gray-600 break-all">{selectedMessage.from}</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-1">
                  <span className="font-medium text-gray-700 min-w-[3rem]">To:</span>
                  <span className="text-gray-600 break-all">{selectedMessage.to}</span>
                </div>
              </div>

              {/* Email Body */}
              <div className="border-t border-gray-200 pt-6 overflow-x-auto mb-6">
                {selectedMessage.isHtml ? (
                  <div className="prose prose-sm sm:prose max-w-none text-gray-800" dangerouslySetInnerHTML={{ __html: selectedMessage.body }} />
                ) : (
                  <pre className="whitespace-pre-wrap text-gray-800 font-sans text-sm sm:text-base font-normal">{selectedMessage.body}</pre>
                )}
              </div>

              {/* --- INLINE REPLY SECTION --- */}
              {inlineReplyOpen && (
                <div className="mt-6 border border-gray-300 rounded-lg shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-300 flex justify-between items-center rounded-t-lg">
                    <span className="text-sm font-medium text-gray-700">Replying to {extractSenderName(selectedMessage.from)}</span>
                    <button onClick={() => setInlineReplyOpen(false)} className="text-gray-500 hover:text-gray-700"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="p-4">
                    <textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Type your reply here..."
                      className="w-full min-h-[150px] p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none resize-y mb-4"
                      autoFocus
                    />
                    <div className="flex gap-3">
                      <button onClick={sendInlineReply} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg flex items-center gap-2">
                        <Send className="w-4 h-4" /> {loading ? 'Sending...' : 'Send Reply'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- COMPOSE VIEW (Full Screen) --- */}
        {/* --- COMPOSE VIEW (Full Screen on Mobile, Modal on Desktop) --- */}
        {currentView === 'compose' && (
          <div className="fixed inset-0 z-50 bg-white sm:relative sm:z-0 sm:bg-transparent sm:h-auto overflow-y-auto">
            <div className="bg-white sm:rounded-lg sm:shadow-lg min-h-screen sm:min-h-0">
              
              {/* Compose Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
                <h2 className="text-lg font-semibold text-gray-800">New Message</h2>
                <button
                  onClick={() => {
                    setShowCompose(false);
                    setCurrentView('inbox');
                  }}
                  className="p-2 -mr-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-4 sm:p-6 pb-24">
                
                {/* Desktop Voice Panel (Hidden on Mobile, shown on Desktop) */}
                <div className="hidden sm:block mb-6 bg-indigo-50 border border-indigo-100 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-indigo-900">Voice Assistant</h3>
                    {isRecording && <span className="text-xs text-red-600 font-bold animate-pulse">● Recording...</span>}
                  </div>
                  <button
                    onClick={handleAudioToggle}
                    className={`w-full py-3 rounded-lg font-medium text-white transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 ${
                      isRecording
                        ? 'bg-red-600 hover:bg-red-700'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {isRecording ? 'Stop Recording' : 'Tap to Speak'}
                  </button>
                </div>

                {/* To Field with Search Suggestions (RESTORED) */}
                <div className="mb-4 relative">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-gray-700">To</label>
                    <button
                      type="button"
                      onClick={() => setShowCcBcc(prev => !prev)}
                      className="text-xs text-blue-600 hover:underline px-2 py-1"
                    >
                      {showCcBcc ? 'Hide CC/BCC' : 'Add CC/BCC'}
                    </button>
                  </div>
                  
                  <div className="relative">
                    <input
                      type="text"
                      value={toField}
                      onChange={(e) => setToField(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Recipient email or name"
                      className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      autoComplete="off"
                    />

                    {/* Suggestions Dropdown (RESTORED) */}
                    {suggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                        {suggestions.map((contact, index) => (
                          <div
                            key={contact.email}
                            onClick={() => selectSuggestion(contact)}
                            className={`px-4 py-3 cursor-pointer transition-colors border-b last:border-0 ${
                              index === selectedIndex
                                ? 'bg-blue-50 border-l-4 border-blue-600'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="font-medium text-gray-800">{contact.name}</div>
                            <div className="text-sm text-gray-500">{contact.email}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* CC & BCC Fields */}
                {showCcBcc && (
                  <div className="mb-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CC</label>
                      <input
                        type="text"
                        value={ccField}
                        onChange={(e) => setCcField(e.target.value)}
                        placeholder="Cc recipients"
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">BCC</label>
                      <input
                        type="text"
                        value={bccField}
                        onChange={(e) => setBccField(e.target.value)}
                        placeholder="Bcc recipients"
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject"
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="mb-4 flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Compose email..."
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-y min-h-[200px]"
                  />
                </div>

                {/* Footer Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSend}
                    disabled={loading}
                    className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-3 px-6 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    {loading ? 'Sending...' : 'Send'}
                  </button>

                  <button
                    onClick={() => {
                      setShowCompose(false);
                      setCurrentView('inbox');
                    }}
                    className="hidden sm:block bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-6 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* --- REPLY OPTIONS MODAL / MENU --- */}
      {showReplyMenu && (
        <div className="fixed inset-0 z-[70] bg-black bg-opacity-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-200">
            <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-semibold text-gray-800">Choose Reply Option</h3>
              <button onClick={() => setShowReplyMenu(false)} className="text-gray-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-2 space-y-1">
              <button onClick={handleReplyThread} className="w-full text-left px-4 py-4 hover:bg-gray-50 flex items-center gap-3 rounded-lg group">
                <div className="bg-blue-100 p-2 rounded-full group-hover:bg-blue-200"><Reply className="w-5 h-5 text-blue-600" /></div>
                <div>
                  <div className="font-semibold text-gray-800">Reply to Thread</div>
                  <div className="text-xs text-gray-500">Keep conversation history</div>
                </div>
              </button>
              <button onClick={handleReplyNew} className="w-full text-left px-4 py-4 hover:bg-gray-50 flex items-center gap-3 rounded-lg group">
                <div className="bg-gray-100 p-2 rounded-full group-hover:bg-gray-200"><Mail className="w-5 h-5 text-gray-600" /></div>
                <div>
                  <div className="font-semibold text-gray-800">Edit as New Message</div>
                  <div className="text-xs text-gray-500">Start a separate email</div>
                </div>
              </button>
            </div>
            <div className="p-2 border-t">
              <button onClick={() => setShowReplyMenu(false)} className="w-full py-3 text-gray-600 font-medium hover:bg-gray-50 rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* --- FLOATING ACTION BUTTONS --- */}
      
      {/* 1. Inbox: Compose */}
      {currentView === 'inbox' && (
        <button onClick={handleCompose} className="fixed right-6 bottom-6 sm:hidden bg-blue-600 text-white p-4 rounded-full shadow-lg z-30">
          <Mail className="w-6 h-6" />
        </button>
      )}

      {/* 2. Message View: Reply FAB (Opens Options Menu) */}
      {currentView === 'message' && !inlineReplyOpen && (
        <button onClick={handleReplyClick} className="fixed right-6 bottom-6 sm:hidden bg-blue-600 text-white p-4 rounded-full shadow-lg z-30">
          <Reply className="w-6 h-6" />
        </button>
      )}
      
      {/* 3. Voice FAB (Keep existing) */}
      {currentView === 'compose' && (
         <button onClick={handleAudioToggle} className={`fixed right-6 bottom-6 sm:hidden p-4 rounded-full shadow-xl z-[60] ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-indigo-600'} text-white`}>
          {isRecording ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
      )}
    </div>
  );
};

export default GmailComposeApp;