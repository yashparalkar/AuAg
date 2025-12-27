import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mail, Send, User, X, Check, Inbox, RefreshCw, ArrowLeft, Clock, Mic, Square, Reply, Sparkles, FileText, Paperclip, Download, Plus, Keyboard, MessageSquare } from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_BASE || '';

/* -------------------------
   Main component
   ------------------------- */
const GmailComposeApp = () => {
  // Auth & user
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // Compose fields
  const [toField, setToField] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Suggest / contacts
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [activeField, setActiveField] = useState(null);

  // Summarization state
  const [summary, setSummary] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  // Views: 'inbox' | 'compose' | 'message'
  const [currentView, setCurrentView] = useState('inbox');
  const [showCompose, setShowCompose] = useState(false);

  // Inbox / messages
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);

  // Reply / inline
  const [showReplyMenu, setShowReplyMenu] = useState(false);
  const [inlineReplyOpen, setInlineReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');

  // CC / BCC
  const [ccField, setCcField] = useState('');
  const [bccField, setBccField] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);

  // Mediator / AI State
  const [mediatorState, setMediatorState] = useState(null);
  const [prevMediatorState, setPrevMediatorState] = useState(null);
  const [emailGenerated, setEmailGenerated] = useState(false);
  const [composeContext, setComposeContext] = useState(null);

  // AI Input Modes
  const [aiMode, setAiMode] = useState('voice'); // 'voice' | 'text'
  const [aiInstruction, setAiInstruction] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // Audio Recording
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);

  // file attachment
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);

  /* -------------------------
     Utility functions
     ------------------------- */
  const extractSenderName = (fromString) => {
    const match = fromString && fromString.match(/^([^<]+)</);
    return match ? match[1].trim() : (fromString ? fromString.split('<')[0].trim() : '');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
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

  const handleDownload = async (messageId, attachmentId, filename) => {
    try {
      const response = await fetch(`${API_BASE}/email/attachment?messageId=${messageId}&attachmentId=${attachmentId}&filename=${encodeURIComponent(filename)}`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download error:", error);
      alert("Failed to download attachment");
    }
  };

  const getLastTerm = (text) => {
    if (!text) return '';
    const parts = text.split(',');
    return parts[parts.length - 1].trim();
  };

  const stripHtml = (html) => {
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  const replaceLastTerm = (text, newEmail) => {
    const parts = text.split(',');
    parts.pop();
    parts.push(' ' + newEmail);
    const result = parts.map(p => p.trim()).filter(p => p).join(', ') + ', ';
    return result;
  };

  /* -------------------------
     History helpers
     ------------------------- */
  const pushInboxState = useCallback((replace = false) => {
    const state = { view: 'inbox' };
    const url = window.location.pathname + '#inbox';
    if (replace) window.history.replaceState(state, '', url);
    else window.history.pushState(state, '', url);
  }, []);

  /* -------------------------
     API & load functions
     ------------------------- */
  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/status`, {
        credentials: 'include'
      });
      const data = await response.json();
      setIsAuthenticated(Boolean(data.authenticated));
      if (data.email) setUserEmail(data.email);
      if (data.authenticated) {
        window.history.replaceState({ view: 'inbox' }, '', window.location.pathname + '#inbox');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  }, []);

  const loadInbox = useCallback(async (pageToken = null) => {
    setLoadingMessages(true);
    try {
      const url = pageToken ? `${API_BASE}/inbox/messages?pageToken=${pageToken}` : `${API_BASE}/inbox/messages`;
      const response = await fetch(url, { credentials: 'include' });
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
  }, []);

  const loadMessageDetail = useCallback(async (messageId, pushHistory = true) => {
    // RESET SUMMARY STATE
    setSummary(''); 
    setShowSummary(false);
    setIsSummarizing(false);

    try {
      const response = await fetch(`${API_BASE}/inbox/message/${messageId}`, {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (data.success) {
        const attachments = extractAttachments(data.message.payload);
        const complete = { 
          ...data.message, 
          threadId: data.message.threadId || data.message.id,
          attachments: attachments
        };
        
        setSelectedMessage(complete);
        setCurrentView('message');
        setMessages(prev => prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, isUnread: false, attachments: attachments } 
            : msg
        ));
        if (pushHistory) {
          window.history.pushState(
            { view: 'message', messageId },
            '',
            `${window.location.pathname}#message-${messageId}`
          );
        }
      }
    } catch (error) {
      console.error('Failed to load message:', error);
    }
  }, []);

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachments(prev => [...prev, ...Array.from(e.target.files)]);
    }
  };

  const removeAttachment = (indexToRemove) => {
    setAttachments(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const clearAttachments = () => {
    setAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* -------------------------
     Effects
     ------------------------- */
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    if (isAuthenticated && currentView === 'inbox') {
      loadInbox();
    }
  }, [isAuthenticated, currentView, loadInbox]);

  const extractAttachments = (payload) => {
    if (!payload) return [];
    let attachments = [];
    const traverse = (parts) => {
      if (!parts) return;
      parts.forEach(part => {
        if (part.filename && part.body && part.body.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size,
            attachmentId: part.body.attachmentId
          });
        }
        if (part.parts) traverse(part.parts);
      });
    };
    if (payload.parts) traverse(payload.parts);
    return attachments;
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    let mounted = true;
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/mediator/state`, { credentials: 'include' });
        const newState = await response.json();
        if (!mounted) return;
        setMediatorState(prev => {
          setPrevMediatorState(prev);
          return newState;
        });
      } catch (err) {
        console.error('Mediator polling failed', err);
      }
    }, 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
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

    const prevCcParams = JSON.stringify(prevMediatorState.cc || []);
    const newCcParams = JSON.stringify(mediatorState.cc || []);
    if (newCcParams !== prevCcParams && Array.isArray(mediatorState.cc) && mediatorState.cc.length > 0) {
      const emailsToAdd = mediatorState.cc.join(', ') + ', ';
      setCcField(prev => {
        const cleanPrev = prev ? prev.trim() : '';
        if (!cleanPrev) return emailsToAdd;
        return cleanPrev.endsWith(',') ? `${cleanPrev} ${emailsToAdd}` : `${cleanPrev}, ${emailsToAdd}`;
      });
      setShowCcBcc(true);
    }

    const prevBccParams = JSON.stringify(prevMediatorState.bcc || []);
    const newBccParams = JSON.stringify(mediatorState.bcc || []);
    if (newBccParams !== prevBccParams && Array.isArray(mediatorState.bcc) && mediatorState.bcc.length > 0) {
      const emailsToAdd = mediatorState.bcc.join(', ') + ', ';
      setBccField(prev => {
        const cleanPrev = prev ? prev.trim() : '';
        if (!cleanPrev) return emailsToAdd;
        return cleanPrev.endsWith(',') ? `${cleanPrev} ${emailsToAdd}` : `${cleanPrev}, ${emailsToAdd}`;
      });
      setShowCcBcc(true);
    }

    if (mediatorState.description && mediatorState.description !== prevMediatorState.description) {
      setEmailGenerated(false);
    }
  }, [mediatorState, prevMediatorState, toField]);

  useEffect(() => {
    if (!showCompose) return;
    const loadComposeContext = async () => {
      try {
        const response = await fetch(`${API_BASE}/compose/context`, { credentials: 'include' });
        const data = await response.json();
        if (data.recipient_name) setToField(data.recipient_name);
        setComposeContext(data);
      } catch (err) {
        console.error('Failed to load compose context', err);
      }
    };
    loadComposeContext();
  }, [showCompose]);

  useEffect(() => {
    if (!showCompose || emailGenerated || !mediatorState || !mediatorState.description) return;
    const generateEmail = async () => {
      setLoading(true);
      setStatus('Generating email...');
      try {
        const response = await fetch(`${API_BASE}/email/generate`, { method: 'POST', credentials: 'include' });
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
        setStatus('');
      }
    };
    generateEmail();
  }, [showCompose, mediatorState, emailGenerated]);

  /* -------------------------
     Browser back/forward
     ------------------------- */
  useEffect(() => {
    const onPopState = (event) => {
      const state = event.state;
      if (!state) {
        const hash = window.location.hash || '#inbox';
        if (hash.startsWith('#message-')) {
          const id = hash.replace('#message-', '');
          loadMessageDetail(id, false);
        } else if (hash === '#compose') {
          setShowCompose(true);
          setCurrentView('compose');
        } else {
          setCurrentView('inbox');
          setShowCompose(false);
          setSelectedMessage(null);
          setInlineReplyOpen(false);
        }
        return;
      }
      if (state.view === 'inbox') {
        setCurrentView('inbox');
        setShowCompose(false);
        setSelectedMessage(null);
        setInlineReplyOpen(false);
      } else if (state.view === 'message') {
        setCurrentView('message');
        setInlineReplyOpen(false);
        if (state.messageId) {
          const found = messages.find(m => m.id === state.messageId);
          if (found) setSelectedMessage(found);
          else loadMessageDetail(state.messageId, false);
        }
      } else if (state.view === 'compose') {
        setShowCompose(true);
        setCurrentView('compose');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [messages, loadMessageDetail]);

  /* -------------------------
     Contact suggestions
     ------------------------- */
  useEffect(() => {
    let currentText = '';
    if (activeField === 'to') currentText = toField;
    else if (activeField === 'cc') currentText = ccField;
    else if (activeField === 'bcc') currentText = bccField;
    const term = getLastTerm(currentText);

    if (!activeField || term.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const searchContacts = async () => {
      try {
        const response = await fetch(`${API_BASE}/contacts/search?q=${encodeURIComponent(term)}`, {
          credentials: 'include',
          signal: controller.signal
        });
        const data = await response.json();
        setSuggestions(data.contacts || []);
        setSelectedIndex(-1);
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Contact search failed:', error);
      }
    };
    const id = setTimeout(searchContacts, 300);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [toField, ccField, bccField, activeField]);

  const handleKeyDown = (e, fieldType) => {
    if (activeField !== fieldType || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      const contact = suggestions[selectedIndex];
      selectSuggestion(contact);
    }
  };

  const selectSuggestion = (contact) => {
    if (activeField === 'to') setToField(prev => replaceLastTerm(prev, contact.email));
    else if (activeField === 'cc') setCcField(prev => replaceLastTerm(prev, contact.email));
    else if (activeField === 'bcc') setBccField(prev => replaceLastTerm(prev, contact.email));
    setSuggestions([]);
    setSelectedIndex(-1);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setActiveField(null);
      setSuggestions([]);
    }, 200);
  };

  /* -------------------------
     Auth & logout
     ------------------------- */
  const handleAuth = () => {
    setStatus('Redirecting to Google...');
    window.location.href = `${API_BASE}/auth/google/login`;
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
      setIsAuthenticated(false);
      setUserEmail('');
      setShowCompose(false);
      setStatus('Logged out');
      setTimeout(() => setStatus(''), 2000);
      pushInboxState(true);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleSummarize = async () => {
    if (!selectedMessage) return;
    setIsSummarizing(true);
    try {
      const bodyText = selectedMessage.isHtml ? stripHtml(selectedMessage.body) : selectedMessage.body;
      const textToSummarize = `Subject: ${selectedMessage.subject}\n\n${bodyText}`;
      const response = await fetch(`${API_BASE}/email/summarize`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: textToSummarize })
      });
      const data = await response.json();
      if (data.success) {
        setSummary(data.summary);
        setShowSummary(true);
      } else {
        setStatus('Failed to generate summary');
        setTimeout(() => setStatus(''), 2000);
      }
    } catch (error) {
      console.error('Summarize failed:', error);
      setStatus('Error summarizing email');
      setTimeout(() => setStatus(''), 2000);
    } finally {
      setIsSummarizing(false);
    }
  };

  /* -------------------------
     Compose / Send / Reply
     ------------------------- */
  const handleCompose = () => {
    setShowCompose(true);
    setCurrentView('compose');
    setToField('');
    setCcField('');
    setBccField('');
    setSubject('');
    setBody('');
    setAiInstruction('');
    setAiMode('voice');
    window.history.pushState({ view: 'compose' }, '', window.location.pathname + '#compose');
  };

  const handleReplyNew = () => {
    setShowReplyMenu(false);
    if (!selectedMessage) return;
    const emailMatch = selectedMessage.from.match(/<([^>]+)>/);
    const replyToEmail = emailMatch ? emailMatch[1] : selectedMessage.from;
    setToField(replyToEmail);
    setSubject(selectedMessage.subject || '');
    setBody('');
    setAiInstruction('');
    setAiMode('voice');
    setShowCompose(true);
    setCurrentView('compose');
    window.history.pushState({ view: 'compose' }, '', window.location.pathname + '#compose');
  };

  const handleReplyClick = () => setShowReplyMenu(true);

  const handleReplyThread = () => {
    setShowReplyMenu(false);
    setInlineReplyOpen(true);
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  const sendInlineReply = async () => {
    if (!replyBody.trim() || !selectedMessage) return;
    setLoading(true);
    setStatus('Sending reply...');
    try {
      const emailMatch = selectedMessage.from.match(/<([^>]+)>/);
      const replyToEmail = emailMatch ? emailMatch[1] : selectedMessage.from;
      const formData = new FormData();
      formData.append('to', replyToEmail);
      formData.append('subject', selectedMessage.subject);
      formData.append('body', replyBody);
      formData.append('threadId', selectedMessage.threadId);
      formData.append('messageId', selectedMessage.id);
      attachments.forEach((file) => formData.append('attachments', file));

      const response = await fetch(`${API_BASE}/email/send`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        setStatus('Reply sent!');
        setReplyBody('');
        setAttachments([]);
        setInlineReplyOpen(false);
      } else {
        setStatus('Failed: ' + (data.error || 'unknown'));
      }
    } catch (error) {
      console.error(error);
      setStatus('Error: ' + error.message);
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(''), 2000);
    }
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
      const formData = new FormData();
      formData.append('to', toField);
      formData.append('subject', subject);
      formData.append('body', body);
      if (ccField) formData.append('cc', ccField);
      if (bccField) formData.append('bcc', bccField);
      attachments.forEach((file) => formData.append('attachments', file));

      const response = await fetch(`${API_BASE}/email/send`, {
        method: 'POST',
        credentials: 'include',
        body: formData 
      });
      const data = await response.json();
      if (data.success) {
        setStatus('Email sent successfully!');
        setToField('');
        setCcField('');
        setBccField('');
        setSubject('');
        setBody('');
        setAttachments([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setShowCompose(false);
        setCurrentView('inbox');
        pushInboxState();
      } else {
        setStatus('Failed to send: ' + (data.error || 'unknown'));
      }
    } catch (error) {
      console.error(error);
      setStatus('Error: ' + error.message);
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(''), 3000);
    }
  };

  /* -------------------------
     AI Interaction Logic
     ------------------------- */
  const handleAudioToggle = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunksRef.current = [];
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');
          setIsAiProcessing(true);
          try {
            const response = await fetch(`${API_BASE}/audio/transcribe`, {
              method: 'POST',
              credentials: 'include',
              body: formData
            });
            const data = await response.json();
            if (data.success) {
              await fetch(`${API_BASE}/mediator/advance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ input: data.text })
              });
            }
          } catch (err) {
            console.error('Transcription failed', err);
          } finally {
            setIsAiProcessing(false);
          }
        };
        mediaRecorder.start();
        mediaRecorderRef.current = mediaRecorder;
        setIsRecording(true);
      } catch (err) {
        console.error('Failed to get audio', err);
      }
    } else {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current = null;
      streamRef.current = null;
      setIsRecording(false);
    }
  };

  const handleAiTextSubmit = async () => {
    if (!aiInstruction.trim()) return;
    setIsAiProcessing(true);
    try {
      await fetch(`${API_BASE}/mediator/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ input: aiInstruction })
      });
      setAiInstruction('');
    } catch (err) {
      console.error('Text submission failed', err);
    } finally {
      setIsAiProcessing(false);
    }
  };

  /* -------------------------
     Render Helpers
     ------------------------- */
  const renderSuggestions = (fieldType) => {
    if (activeField !== fieldType || suggestions.length === 0) return null;
    return (
      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
        {suggestions.map((contact, index) => (
          <div
            key={contact.email}
            onMouseDown={(e) => {
              e.preventDefault();
              selectSuggestion(contact);
            }}
            className={`px-4 py-3 cursor-pointer transition-all duration-150 border-b last:border-0 ${
              index === selectedIndex 
                ? 'bg-gradient-to-r from-violet-50 to-purple-50 border-l-4 border-violet-500' 
                : 'hover:bg-slate-50'
            }`}
          >
            <div className="font-semibold text-slate-800">{contact.name}</div>
            <div className="text-sm text-slate-500">{contact.email}</div>
          </div>
        ))}
      </div>
    );
  };

  /* -------------------------
     UI rendering
     ------------------------- */
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-100 via-purple-50 to-fuchsia-100 flex items-center justify-center p-4">
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 sm:p-10 max-w-md w-full mx-auto border border-white/20">
          <div className="text-center mb-8">
            <div className="inline-block p-5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl mb-5 shadow-lg">
              <Mail className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent mb-2">
              Echo Mail
            </h1>
            <p className="text-slate-600">Connect your Google account to get started</p>
          </div>
          <button
            onClick={handleAuth}
            disabled={loading}
            className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:from-violet-300 disabled:to-purple-300 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
             Sign in with Google
          </button>
          {status && (
            <div className="mt-5 p-4 bg-violet-50 text-violet-700 rounded-xl text-sm text-center font-medium border border-violet-200">
              {status}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200 px-4 sm:px-6 py-4 sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-md">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
              Echo Mail
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg">
              <User className="w-4 h-4 text-slate-600" />
              <span className="text-sm font-medium text-slate-700 truncate max-w-[150px]">{userEmail}</span>
            </div>
            <button onClick={handleLogout} className="text-sm font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition-all duration-200">Logout</button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 pb-24 sm:pb-6">
        {status && (
          <div className="mb-4 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 text-emerald-700 rounded-xl flex items-center gap-3 text-sm sm:text-base shadow-sm">
            <div className="p-1 bg-emerald-500 rounded-full">
              <Check className="w-4 h-4 text-white flex-shrink-0" />
            </div>
            <span className="font-medium">{status}</span>
          </div>
        )}

        {/* --- INBOX VIEW --- */}
        {currentView === 'inbox' && (
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-100 rounded-lg">
                  <Inbox className="w-5 h-5 text-violet-600" />
                </div>
                <h2 className="text-lg font-bold text-slate-800">Inbox</h2>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => loadInbox()} 
                  disabled={loadingMessages} 
                  className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-all duration-200 hover:shadow-md"
                >
                  <RefreshCw className={`w-5 h-5 ${loadingMessages ? 'animate-spin' : ''}`} />
                </button>
                <button 
                  onClick={handleCompose} 
                  className="hidden sm:inline-flex bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold py-2.5 px-5 rounded-lg transition-all duration-200 items-center gap-2 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                >
                  <Plus className="w-4 h-4" />
                  Compose
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {loadingMessages && messages.length === 0 ? (
                <div className="p-12 text-center">
                  <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">Loading messages...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="p-12 text-center">
                  <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No messages found</p>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <button
                      key={message.id}
                      onClick={() => loadMessageDetail(message.id)}
                      className={`w-full text-left p-4 sm:p-5 hover:bg-gradient-to-r hover:from-violet-50 hover:to-purple-50 cursor-pointer transition-all duration-200 group ${
                        message.isUnread ? 'bg-violet-50/50' : ''
                      }`}
                    >
                      <div className="flex justify-between items-baseline mb-2 gap-3">
                        <span className={`font-semibold text-sm sm:text-base text-slate-900 truncate flex-1 ${message.isUnread ? 'font-bold' : ''}`}>
                          {extractSenderName(message.from)}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-slate-500 flex-shrink-0">
                          {message.isUnread && <span className="w-2 h-2 bg-violet-500 rounded-full animate-pulse"></span>}
                          <Clock className="w-3.5 h-3.5" />
                          <span className="font-medium">{formatDate(message.date)}</span>
                        </div>
                      </div>
                      <div className={`text-sm sm:text-base mb-1.5 truncate ${message.isUnread ? 'font-semibold text-slate-900' : 'text-slate-700 font-medium'}`}>
                        {message.subject}
                      </div>
                      <div className="text-sm text-slate-500 line-clamp-2">{message.snippet}</div>
                    </button>
                  ))}
                  {nextPageToken && (
                    <div className="p-5 text-center bg-slate-50">
                      <button onClick={() => loadInbox(nextPageToken)} disabled={loadingMessages} className="text-violet-600 font-semibold hover:text-violet-700 px-6 py-2 hover:bg-white rounded-lg transition-all duration-200">Load More</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* --- MESSAGE DETAIL VIEW --- */}
        {currentView === 'message' && selectedMessage && (
          <div className="bg-white rounded-2xl shadow-xl flex flex-col h-full sm:h-auto pb-4 border border-slate-200">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 sticky top-0 bg-white/95 backdrop-blur-xl z-10 rounded-t-2xl">
              <button
                onClick={() => {
                  setCurrentView('inbox');
                  setSelectedMessage(null);
                  setInlineReplyOpen(false);
                  setSummary(''); 
                  setShowSummary(false);
                  pushInboxState();
                }}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 py-2 px-3 hover:bg-slate-100 rounded-lg transition-all duration-200"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline font-medium">Back</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSummarize}
                  disabled={isSummarizing}
                  className="bg-gradient-to-r from-indigo-100 to-purple-100 hover:from-indigo-200 hover:to-purple-200 text-indigo-700 font-semibold py-2.5 px-4 rounded-lg flex items-center gap-2 transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  {isSummarizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span className="hidden sm:inline">Summarize</span>
                </button>
                <button
                  onClick={handleReplyClick}
                  className="hidden sm:flex bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold py-2.5 px-5 rounded-lg items-center gap-2 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
                >
                  <Reply className="w-4 h-4" /> Reply
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-7 overflow-y-auto">
              <h2 className="text-xl sm:text-3xl font-bold text-slate-900 mb-5 break-words leading-tight">
                {selectedMessage.subject}
              </h2>
              
              <div className="mb-6 space-y-3 bg-gradient-to-r from-slate-50 to-slate-100 p-4 rounded-xl border border-slate-200 text-sm">
                <div className="flex flex-col sm:flex-row gap-2">
                  <span className="font-bold text-slate-700 min-w-[4rem]">From:</span>
                  <span className="text-slate-600 break-all font-medium">{selectedMessage.from}</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <span className="font-bold text-slate-700 min-w-[4rem]">To:</span>
                  <span className="text-slate-600 break-all font-medium">{selectedMessage.to}</span>
                </div>
              </div>

              {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    {selectedMessage.attachments.length} Attachment{selectedMessage.attachments.length > 1 ? 's' : ''}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedMessage.attachments.map((att, index) => (
                      <button
                        key={index}
                        onClick={() => handleDownload(selectedMessage.id, att.attachmentId, att.filename)}
                        className="flex items-center gap-3 p-4 bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-xl hover:border-violet-400 hover:shadow-lg transition-all duration-200 group text-left transform hover:-translate-y-0.5"
                      >
                        <div className="bg-violet-100 p-3 rounded-lg group-hover:bg-violet-200 text-violet-600 transition-colors">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{att.filename}</p>
                          <p className="text-xs text-slate-500 font-medium">{(att.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <Download className="w-4 h-4 text-slate-400 group-hover:text-violet-600 transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showSummary && summary && (
                <div className="mb-6 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-5 shadow-lg">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2 text-indigo-800 font-bold">
                      <div className="p-1.5 bg-indigo-500 rounded-lg">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <h3>AI Summary</h3>
                    </div>
                    <button onClick={() => setShowSummary(false)} className="text-indigo-400 hover:text-indigo-600 p-1 hover:bg-indigo-100 rounded-lg transition-all">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-indigo-900 text-sm leading-relaxed whitespace-pre-wrap font-medium">{summary}</p>
                </div>
              )}

              <div className="border-t-2 border-slate-200 pt-6 mb-6">
                {selectedMessage.isHtml ? (
                  <div className="w-full overflow-x-auto">
                    <div 
                      className="prose prose-sm sm:prose max-w-none text-slate-800 min-w-0 w-full [&_img]:!max-w-full [&_img]:!h-auto"
                      dangerouslySetInnerHTML={{ __html: selectedMessage.body }} 
                    />
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap text-slate-800 font-sans text-sm sm:text-base font-normal break-words overflow-x-auto leading-relaxed">
                    {selectedMessage.body}
                  </pre>
                )}
              </div>

              {inlineReplyOpen && (
                <div className="mt-6 border-2 border-violet-200 rounded-xl shadow-xl overflow-hidden">
                  <div className="bg-gradient-to-r from-violet-50 to-purple-50 px-5 py-3 border-b-2 border-violet-200 flex justify-between items-center">
                    <span className="text-sm font-bold text-violet-800">Replying to {extractSenderName(selectedMessage.from)}</span>
                    <button onClick={() => setInlineReplyOpen(false)} className="text-violet-500 hover:text-violet-700 p-1 hover:bg-violet-100 rounded-lg transition-all"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="p-5">
                    <textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Type your reply here..."
                      className="w-full min-h-[150px] p-4 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none resize-y mb-4 font-medium text-slate-800"
                      autoFocus
                    />
                    {attachments.length > 0 && (
                      <div className="mb-4 space-y-2">
                        {attachments.map((file, index) => (
                          <div key={index} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <Paperclip className="w-4 h-4 text-slate-500 flex-shrink-0" />
                              <span className="text-sm font-semibold text-slate-700 truncate">{file.name}</span>
                            </div>
                            <button onClick={() => removeAttachment(index)} className="text-slate-500 hover:text-red-500 p-1 hover:bg-red-50 rounded transition-all"><X className="w-4 h-4" /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-3 items-center">
                      <input type="file" id="reply-file-upload" onChange={handleFileSelect} className="hidden" multiple />
                      <button onClick={sendInlineReply} disabled={loading} className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:from-violet-300 disabled:to-purple-300 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200">
                        <Send className="w-4 h-4" /> {loading ? 'Sending...' : 'Send Reply'}
                      </button>
                      <button onClick={() => document.getElementById('reply-file-upload').click()} className="p-3 text-slate-600 hover:bg-slate-100 rounded-xl transition-all duration-200 border-2 border-slate-200 hover:border-violet-300">
                        <Paperclip className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- COMPOSE VIEW --- */}
        {currentView === 'compose' && (
          <div className="fixed inset-0 z-50 bg-white sm:relative sm:z-0 sm:bg-transparent sm:h-auto overflow-y-auto">
            <div className="bg-white sm:rounded-2xl sm:shadow-xl min-h-screen sm:min-h-0 sm:border sm:border-slate-200">
              <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-gradient-to-r from-violet-50 to-purple-50 z-10 sm:rounded-t-2xl">
                <h2 className="text-lg font-bold text-slate-800">New Message</h2>
                <button 
                  onClick={() => { 
                    setShowCompose(false); 
                    setCurrentView('inbox'); 
                    pushInboxState(); 
                  }} 
                  className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-5 sm:p-7 pb-24">
                {/* --- AI ASSISTANT BLOCK --- */}
                <div className="hidden sm:block mb-6 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl overflow-hidden shadow-md">
                  <div className="px-5 py-3 border-b border-indigo-100 flex items-center justify-between bg-white/50">
                    <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      AI Assistant
                    </h3>
                    <div className="flex bg-slate-200 p-1 rounded-lg">
                      <button 
                        onClick={() => setAiMode('voice')} 
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                          aiMode === 'voice' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        Voice
                      </button>
                      <button 
                        onClick={() => setAiMode('text')}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                          aiMode === 'text' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        Text
                      </button>
                    </div>
                  </div>

                  <div className="p-5">
                    {aiMode === 'voice' ? (
                      <>
                        <div className="flex justify-between items-center mb-3">
                           <span className="text-xs text-indigo-600 font-semibold">Speak your request to generate an email</span>
                           {isRecording && (
                             <span className="text-xs text-red-600 font-bold animate-pulse flex items-center gap-1">
                               <span className="w-2 h-2 bg-red-600 rounded-full"></span>
                               Recording...
                             </span>
                           )}
                           {isAiProcessing && (
                             <span className="text-xs text-indigo-600 font-bold animate-pulse">Processing...</span>
                           )}
                        </div>
                        <button 
                          onClick={handleAudioToggle} 
                          disabled={isAiProcessing}
                          className={`w-full py-4 rounded-xl font-bold text-white transition-all shadow-lg hover:shadow-xl active:scale-95 flex items-center justify-center gap-2 ${
                            isRecording 
                              ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700' 
                              : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
                          }`}
                        >
                          {isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                          {isRecording ? 'Stop Recording' : 'Tap to Speak'}
                        </button>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <textarea
                          value={aiInstruction}
                          onChange={(e) => setAiInstruction(e.target.value)}
                          placeholder="e.g., Write a polite email asking for a meeting next Tuesday..."
                          className="w-full p-3 rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm resize-none h-24 bg-white"
                        />
                        <button
                          onClick={handleAiTextSubmit}
                          disabled={isAiProcessing || !aiInstruction.trim()}
                          className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-bold text-sm shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                        >
                          {isAiProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          Generate
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* --- STANDARD FORM FIELDS --- */}
                <div className="mb-5 relative">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-bold text-slate-700">To</label>
                    <button type="button" onClick={() => setShowCcBcc(prev => !prev)} className="text-xs font-semibold text-violet-600 hover:text-violet-800 px-3 py-1.5 hover:bg-violet-50 rounded-lg transition-all">{showCcBcc ? 'Hide CC/BCC' : 'Add CC/BCC'}</button>
                  </div>
                  <div className="relative">
                    <input type="text" value={toField} onChange={(e) => setToField(e.target.value)} onFocus={() => setActiveField('to')} onBlur={handleBlur} onKeyDown={(e) => handleKeyDown(e, 'to')} placeholder="Recipient email(s)" className="w-full px-4 py-3.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none font-medium text-slate-800" autoComplete="off" />
                    {renderSuggestions('to')}
                  </div>
                </div>

                {showCcBcc && (
                  <div className="mb-5 space-y-4">
                    <div className="relative">
                      <label className="block text-sm font-bold text-slate-700 mb-2">CC</label>
                      <input type="text" value={ccField} onChange={(e) => setCcField(e.target.value)} onFocus={() => setActiveField('cc')} onBlur={handleBlur} onKeyDown={(e) => handleKeyDown(e, 'cc')} placeholder="Cc recipients" className="w-full px-4 py-3.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none font-medium text-slate-800" autoComplete="off" />
                      {renderSuggestions('cc')}
                    </div>
                    <div className="relative">
                      <label className="block text-sm font-bold text-slate-700 mb-2">BCC</label>
                      <input type="text" value={bccField} onChange={(e) => setBccField(e.target.value)} onFocus={() => setActiveField('bcc')} onBlur={handleBlur} onKeyDown={(e) => handleKeyDown(e, 'bcc')} placeholder="Bcc recipients" className="w-full px-4 py-3.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none font-medium text-slate-800" autoComplete="off" />
                      {renderSuggestions('bcc')}
                    </div>
                  </div>
                )}

                <div className="mb-5">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Subject</label>
                  <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full px-4 py-3.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none font-medium text-slate-800" />
                </div>

                <div className="mb-5 flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Message</label>
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Compose email..." className="w-full px-4 py-3.5 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none resize-y min-h-[200px] font-medium text-slate-800" />
                </div>

                {attachments.length > 0 && (
                  <div className="mb-5 space-y-2">
                    {attachments.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border-2 border-slate-200">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <Paperclip className="w-4 h-4 text-slate-500 flex-shrink-0" />
                          <div className="truncate">
                            <p className="text-sm font-semibold text-slate-700 truncate">{file.name}</p>
                            <p className="text-xs text-slate-500 font-medium">{formatFileSize(file.size)}</p>
                          </div>
                        </div>
                        <button onClick={() => removeAttachment(index)} className="p-1.5 hover:bg-red-100 rounded-lg text-slate-500 hover:text-red-600 transition-all"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 pt-2 items-center">
                  <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" multiple />
                  <button onClick={handleSend} disabled={loading} className="flex-1 sm:flex-none bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:from-violet-300 disabled:to-purple-300 text-white font-bold py-3.5 px-8 rounded-xl transition-all duration-200 inline-flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                    <Send className="w-4 h-4" /> {loading ? 'Sending...' : 'Send'}
                  </button>
                  <button onClick={() => fileInputRef.current.click()} className="p-3.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-all duration-200 border-2 border-slate-200 hover:border-violet-300" title="Attach file">
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <button onClick={() => { setShowCompose(false); setCurrentView('inbox'); clearAttachments(); pushInboxState(); }} className="hidden sm:block bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 px-8 rounded-xl transition-all duration-200">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Reply options modal */}
      {showReplyMenu && (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-200 border border-slate-200">
            <div className="p-5 bg-gradient-to-r from-violet-50 to-purple-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Choose Reply Option</h3>
              <button onClick={() => setShowReplyMenu(false)} className="text-slate-500 hover:text-slate-800 p-1 hover:bg-slate-200 rounded-lg transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-3 space-y-2">
              <button onClick={handleReplyThread} className="w-full text-left px-4 py-4 hover:bg-gradient-to-r hover:from-violet-50 hover:to-purple-50 flex items-center gap-3 rounded-xl group transition-all duration-200 border-2 border-transparent hover:border-violet-200">
                <div className="bg-violet-100 p-3 rounded-xl group-hover:bg-violet-200 transition-all"><Reply className="w-5 h-5 text-violet-600" /></div>
                <div><div className="font-bold text-slate-800">Reply to Thread</div><div className="text-xs text-slate-500 font-medium">Keep conversation history</div></div>
              </button>
              <button onClick={handleReplyNew} className="w-full text-left px-4 py-4 hover:bg-gradient-to-r hover:from-slate-50 hover:to-slate-100 flex items-center gap-3 rounded-xl group transition-all duration-200 border-2 border-transparent hover:border-slate-200">
                <div className="bg-slate-100 p-3 rounded-xl group-hover:bg-slate-200 transition-all"><Mail className="w-5 h-5 text-slate-600" /></div>
                <div><div className="font-bold text-slate-800">Edit as New Message</div><div className="text-xs text-slate-500 font-medium">Start a separate email</div></div>
              </button>
            </div>
            <div className="p-3 border-t border-slate-200">
              <button onClick={() => setShowReplyMenu(false)} className="w-full py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating action buttons */}
      {currentView === 'inbox' && (
        <button onClick={handleCompose} className="fixed right-6 bottom-6 sm:hidden bg-gradient-to-r from-violet-600 to-purple-600 text-white p-5 rounded-full shadow-2xl z-30 transform hover:scale-110 transition-transform duration-200 active:scale-95"><Plus className="w-6 h-6" /></button>
      )}

      {currentView === 'message' && !inlineReplyOpen && (
        <div className="fixed right-6 bottom-6 sm:hidden flex flex-col gap-3 z-30">
          <button onClick={handleSummarize} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-full shadow-2xl transform hover:scale-110 transition-transform duration-200 active:scale-95"><Sparkles className="w-6 h-6" /></button>
          <button onClick={handleReplyClick} className="bg-gradient-to-r from-violet-600 to-purple-600 text-white p-4 rounded-full shadow-2xl transform hover:scale-110 transition-transform duration-200 active:scale-95"><Reply className="w-6 h-6" /></button>
        </div>
      )}

      {currentView === 'compose' && (
        <button 
          onClick={() => {
            // For mobile FAB, we might just toggle modes or default to voice if closed
            if (aiMode === 'text') setAiMode('voice');
            handleAudioToggle();
          }}
          className={`fixed right-6 bottom-6 sm:hidden p-5 rounded-full shadow-2xl z-[60] text-white transform hover:scale-110 transition-all duration-200 active:scale-95 ${
            isRecording 
              ? 'bg-gradient-to-r from-red-500 to-red-600 animate-pulse' 
              : 'bg-gradient-to-r from-indigo-600 to-purple-600'
          }`}
        >
          {isRecording ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
      )}
    </div>
  );
};

export default GmailComposeApp;