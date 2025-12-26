import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mail, Send, User, X, Check, Inbox, RefreshCw, ArrowLeft, Clock, Mic, Square, Reply, Sparkles, FileText, Paperclip } from 'lucide-react';

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
  
  // NEW: Track which field is currently active for suggestions ('to', 'cc', 'bcc')
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

  // Mediator / recording
  const [mediatorState, setMediatorState] = useState(null);
  const [prevMediatorState, setPrevMediatorState] = useState(null);
  const [emailGenerated, setEmailGenerated] = useState(false);
  const [composeContext, setComposeContext] = useState(null);

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

  // NEW: Multi-email utilities
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
    parts.pop(); // Remove partial term
    parts.push(' ' + newEmail); // Add new email
    // Join back, filter empty strings if any, and ensure trailing comma/space
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
    try {
      const response = await fetch(`${API_BASE}/inbox/message/${messageId}`, {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        const complete = { ...data.message, threadId: data.message.threadId || data.message.id };
        setSelectedMessage(complete);
        setCurrentView('message');

        setMessages(prev => prev.map(msg => (msg.id === messageId ? { ...msg, isUnread: false } : msg)));

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
      // Convert FileList to Array and append to existing attachments
      setAttachments(prev => [...prev, ...Array.from(e.target.files)]);
    }
  };

  const removeAttachment = (indexToRemove) => {
    setAttachments(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  // Helper to format file size (e.g., 1.2 MB)
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Clear attachments when closing/sending
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

  // Update fields based on mediator changes
  useEffect(() => {
    if (!mediatorState || !prevMediatorState) return;

    // --- 1. Existing Recipient Logic ---
    if (
      mediatorState.recipient_name &&
      mediatorState.recipient_name !== prevMediatorState.recipient_name &&
      mediatorState.recipient_name !== toField
    ) {
      setToField(mediatorState.recipient_name);
    }

    // --- 2. New CC Logic ---
    // We compare JSON strings to detect if the array content actually changed
    const prevCcParams = JSON.stringify(prevMediatorState.cc || []);
    const newCcParams = JSON.stringify(mediatorState.cc || []);

    if (newCcParams !== prevCcParams && Array.isArray(mediatorState.cc) && mediatorState.cc.length > 0) {
      // Convert list ['a@b.com', 'c@d.com'] into string "a@b.com, c@d.com, "
      const emailsToAdd = mediatorState.cc.join(', ') + ', ';
      
      setCcField(prev => {
        const cleanPrev = prev ? prev.trim() : '';
        if (!cleanPrev) return emailsToAdd;
        // Append correctly handling commas
        return cleanPrev.endsWith(',') 
          ? `${cleanPrev} ${emailsToAdd}` 
          : `${cleanPrev}, ${emailsToAdd}`;
      });
      // Auto-show the CC/BCC fields if the mediator suggests them
      setShowCcBcc(true);
    }

    // --- 3. New BCC Logic ---
    const prevBccParams = JSON.stringify(prevMediatorState.bcc || []);
    const newBccParams = JSON.stringify(mediatorState.bcc || []);

    if (newBccParams !== prevBccParams && Array.isArray(mediatorState.bcc) && mediatorState.bcc.length > 0) {
      const emailsToAdd = mediatorState.bcc.join(', ') + ', ';
      
      setBccField(prev => {
        const cleanPrev = prev ? prev.trim() : '';
        if (!cleanPrev) return emailsToAdd;
        return cleanPrev.endsWith(',') 
          ? `${cleanPrev} ${emailsToAdd}` 
          : `${cleanPrev}, ${emailsToAdd}`;
      });
      setShowCcBcc(true);
    }

    // --- 4. Existing Description Logic ---
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
     Contact suggestions (UPDATED)
     ------------------------- */
  useEffect(() => {
    // Determine which field text we are looking at
    let currentText = '';
    if (activeField === 'to') currentText = toField;
    else if (activeField === 'cc') currentText = ccField;
    else if (activeField === 'bcc') currentText = bccField;

    // Get the last term (after last comma)
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

  /* -------------------------
     Key handling for suggestions (UPDATED)
     ------------------------- */
  const handleKeyDown = (e, fieldType) => {
    // Only intercept if we have suggestions and this field is active
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
    if (activeField === 'to') {
      setToField(prev => replaceLastTerm(prev, contact.email));
    } else if (activeField === 'cc') {
      setCcField(prev => replaceLastTerm(prev, contact.email));
    } else if (activeField === 'bcc') {
      setBccField(prev => replaceLastTerm(prev, contact.email));
    }
    setSuggestions([]);
    setSelectedIndex(-1);
    // Note: we don't clear activeField here to allow immediate typing of next email
    // But typically we might want to refocus the input
  };

  // Helper to handle blur (delayed to allow clicking suggestion)
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

        // Ensure the URL matches your backend route exactly
        // If your API_BASE already has '/api', use `${API_BASE}/email/summarize`
        // If API_BASE is just the domain, use `${API_BASE}/api/email/summarize`
        const response = await fetch(`${API_BASE}/api/email/summarize`, { 
            method: 'POST',
            // ▼▼▼ THIS LINE IS CRITICAL ▼▼▼
            headers: { 
                'Content-Type': 'application/json' 
            },
            // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
            credentials: 'include',
            body: JSON.stringify({ text: textToSummarize })
        });

        const data = await response.json();
        // ... rest of the function
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
    setShowCompose(true);
    setCurrentView('compose');
    window.history.pushState({ view: 'compose' }, '', window.location.pathname + '#compose');
  };

  const handleReplyClick = () => {
    setShowReplyMenu(true);
  };

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

        // 1. Create FormData
        const formData = new FormData();

        // 2. Append text fields
        formData.append('to', replyToEmail);
        formData.append('subject', selectedMessage.subject);
        formData.append('body', replyBody);
        formData.append('threadId', selectedMessage.threadId);
        formData.append('messageId', selectedMessage.id);

        // 3. Append attachments
        attachments.forEach((file) => {
          formData.append('attachments', file);
        });

        const response = await fetch(`${API_BASE}/email/send`, {
          method: 'POST',
          credentials: 'include',
          body: formData
        });

        const data = await response.json();
        
        if (data.success) {
          setStatus('Reply sent!');
          setReplyBody('');
          setAttachments([]); // Clear attachments
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
        // 1. Create FormData object
        const formData = new FormData();
        
        // 2. Append text fields
        formData.append('to', toField);
        formData.append('subject', subject);
        formData.append('body', body);
        if (ccField) formData.append('cc', ccField);
        if (bccField) formData.append('bcc', bccField);
        
        // 3. Append attachments (if any)
        // 'attachments' is the key your backend will look for
        attachments.forEach((file) => {
          formData.append('attachments', file);
        });

        // 4. Send request
        // NOTE: We REMOVED 'Content-Type': 'application/json'
        // The browser automatically sets the correct multipart boundary
        const response = await fetch(`${API_BASE}/email/send`, {
          method: 'POST',
          credentials: 'include',
          body: formData 
        });

        const data = await response.json();
        
        if (data.success) {
          setStatus('Email sent successfully!');
          // Clear form
          setToField('');
          setCcField('');
          setBccField('');
          setSubject('');
          setBody('');
          setAttachments([]); // Clear attachments state
          if (fileInputRef.current) fileInputRef.current.value = ""; // Reset file input
          
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
     Audio recording logic
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

  /* -------------------------
     Render Helper for Suggestions
     ------------------------- */
  const renderSuggestions = (fieldType) => {
    if (activeField !== fieldType || suggestions.length === 0) return null;
    return (
      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-60 overflow-y-auto">
        {suggestions.map((contact, index) => (
          <div
            key={contact.email}
            onMouseDown={(e) => {
                 e.preventDefault(); // Prevent blur
                 selectSuggestion(contact);
            }}
            className={`px-4 py-3 cursor-pointer transition-colors border-b last:border-0 ${
              index === selectedIndex ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-gray-50'
            }`}
          >
            <div className="font-medium text-gray-800">{contact.name}</div>
            <div className="text-sm text-gray-500">{contact.email}</div>
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

  /* -------------------------
     Authenticated UI
     ------------------------- */
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
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

        {/* --- MESSAGE DETAIL VIEW (UPDATED) --- */}
        {currentView === 'message' && selectedMessage && (
          <div className="bg-white rounded-lg shadow-lg flex flex-col h-full sm:h-auto pb-4">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <button
                onClick={() => {
                  setCurrentView('inbox');
                  setSelectedMessage(null);
                  setInlineReplyOpen(false);
                  pushInboxState();
                }}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 py-2"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline">Back</span>
              </button>

              <div className="flex items-center gap-2">
                {/* NEW: Summarize Button */}
                <button
                  onClick={handleSummarize}
                  disabled={isSummarizing}
                  className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-medium py-2 px-3 sm:px-4 rounded-lg flex items-center gap-2 transition-colors"
                >
                  {isSummarizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  <span className="hidden sm:inline">Summarize</span>
                </button>

                <button
                    onClick={handleReplyClick}
                    className="hidden sm:flex bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg items-center gap-2"
                >
                    <Reply className="w-4 h-4" /> Reply
                </button>
              </div>
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

              {/* NEW: Summary Display Section */}
              {showSummary && summary && (
                <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-lg p-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2 text-indigo-800 font-semibold">
                            <Sparkles className="w-4 h-4" />
                            <h3>AI Summary</h3>
                        </div>
                        <button onClick={() => setShowSummary(false)} className="text-indigo-400 hover:text-indigo-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <p className="text-indigo-900 text-sm leading-relaxed whitespace-pre-wrap">{summary}</p>
                </div>
              )}

              <div className="border-t border-gray-200 pt-6 mb-6">
                {selectedMessage.isHtml ? (
                  <div className="w-full overflow-x-auto">
                    <div 
                      className="prose prose-sm sm:prose max-w-none text-gray-800
                                min-w-0 w-full
                                [&_img]:!max-w-full [&_img]:!h-auto 
                                [&_table]:!w-full [&_table]:!max-w-full 
                                [&_td]:!break-word [&_td]:!min-w-0
                                [&_a]:!break-all"
                      dangerouslySetInnerHTML={{ __html: selectedMessage.body }} 
                    />
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap text-gray-800 font-sans text-sm sm:text-base font-normal break-words overflow-x-auto">
                    {selectedMessage.body}
                  </pre>
                )}
              </div>

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
                    {/* ... inside inlineReplyOpen ... */}

                    <div className="p-4">
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder="Type your reply here..."
                        className="w-full min-h-[150px] p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none resize-y mb-4"
                        autoFocus
                      />

                      {/* REUSE ATTACHMENT PREVIEW HERE */}
                      {attachments.length > 0 && (
                        <div className="mb-4 space-y-2">
                          {attachments.map((file, index) => (
                            <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-200">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <Paperclip className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                <span className="text-sm font-medium text-gray-700 truncate">{file.name}</span>
                              </div>
                              <button onClick={() => removeAttachment(index)} className="text-gray-500 hover:text-red-500"><X className="w-4 h-4" /></button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-3 items-center">
                        {/* Hidden File Input (Ref reused, ensure you reset it if needed or use a separate ref for reply) */}
                        <input 
                          type="file" 
                          id="reply-file-upload"
                          onChange={handleFileSelect} 
                          className="hidden" 
                          multiple 
                        />
                        
                        <button onClick={sendInlineReply} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg flex items-center gap-2">
                          <Send className="w-4 h-4" /> {loading ? 'Sending...' : 'Send Reply'}
                        </button>

                        {/* Attach Button for Reply */}
                        <button 
                          onClick={() => document.getElementById('reply-file-upload').click()}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                        >
                          <Paperclip className="w-5 h-5" />
                        </button>
                      </div>
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
            <div className="bg-white sm:rounded-lg sm:shadow-lg min-h-screen sm:min-h-0">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
                <h2 className="text-lg font-semibold text-gray-800">New Message</h2>
                <button onClick={() => { setShowCompose(false); setCurrentView('inbox'); pushInboxState(); }} className="p-2 -mr-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-4 sm:p-6 pb-24">
                <div className="hidden sm:block mb-6 bg-indigo-50 border border-indigo-100 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-indigo-900">Voice Assistant</h3>
                    {isRecording && <span className="text-xs text-red-600 font-bold animate-pulse">● Recording...</span>}
                  </div>
                  <button onClick={handleAudioToggle} className={`w-full py-3 rounded-lg font-medium text-white transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                    {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {isRecording ? 'Stop Recording' : 'Tap to Speak'}
                  </button>
                </div>

                <div className="mb-4 relative">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-gray-700">To</label>
                    <button type="button" onClick={() => setShowCcBcc(prev => !prev)} className="text-xs text-blue-600 hover:underline px-2 py-1">{showCcBcc ? 'Hide CC/BCC' : 'Add CC/BCC'}</button>
                  </div>
                  <div className="relative">
                    <input type="text" value={toField} onChange={(e) => setToField(e.target.value)} onFocus={() => setActiveField('to')} onBlur={handleBlur} onKeyDown={(e) => handleKeyDown(e, 'to')} placeholder="Recipient email(s)" className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" autoComplete="off" />
                    {renderSuggestions('to')}
                  </div>
                </div>

                {showCcBcc && (
                  <div className="mb-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-700 mb-1">CC</label>
                      <input type="text" value={ccField} onChange={(e) => setCcField(e.target.value)} onFocus={() => setActiveField('cc')} onBlur={handleBlur} onKeyDown={(e) => handleKeyDown(e, 'cc')} placeholder="Cc recipients" className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" autoComplete="off" />
                      {renderSuggestions('cc')}
                    </div>
                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-700 mb-1">BCC</label>
                      <input type="text" value={bccField} onChange={(e) => setBccField(e.target.value)} onFocus={() => setActiveField('bcc')} onBlur={handleBlur} onKeyDown={(e) => handleKeyDown(e, 'bcc')} placeholder="Bcc recipients" className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" autoComplete="off" />
                      {renderSuggestions('bcc')}
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>

                <div className="mb-4 flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Compose email..." className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-y min-h-[200px]" />
                </div>

                {/* ... inside the Compose View form ... */}

                {/* ATTACHMENT LIST PREVIEW */}
                {attachments.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {attachments.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-200">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <Paperclip className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          <div className="truncate">
                            <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                            <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                          </div>
                        </div>
                        <button onClick={() => removeAttachment(index)} className="p-1 hover:bg-gray-200 rounded-full text-gray-500">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* BUTTONS ROW */}
                <div className="flex gap-3 pt-2 items-center">
                  {/* Hidden File Input */}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    className="hidden" 
                    multiple 
                  />

                  {/* Send Button */}
                  <button onClick={handleSend} disabled={loading} className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-3 px-6 rounded-lg transition-colors inline-flex items-center justify-center gap-2">
                    <Send className="w-4 h-4" /> {loading ? 'Sending...' : 'Send'}
                  </button>

                  {/* Attach Button */}
                  <button 
                    onClick={() => fileInputRef.current.click()} 
                    className="p-3 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                    title="Attach file"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>

                  {/* Cancel Button */}
                  <button onClick={() => { setShowCompose(false); setCurrentView('inbox'); clearAttachments(); pushInboxState(); }} className="hidden sm:block bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-6 rounded-lg transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Reply options modal */}
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

      {/* Floating action buttons */}
      {currentView === 'inbox' && (
        <button onClick={handleCompose} className="fixed right-6 bottom-6 sm:hidden bg-blue-600 text-white p-4 rounded-full shadow-lg z-30">
          <Mail className="w-6 h-6" />
        </button>
      )}

      {currentView === 'message' && !inlineReplyOpen && (
        <div className="fixed right-6 bottom-6 sm:hidden flex flex-col gap-4 z-30">
             {/* Mobile summarize button */}
            <button onClick={handleSummarize} className="bg-indigo-600 text-white p-4 rounded-full shadow-lg">
                <FileText className="w-6 h-6" />
            </button>
            <button onClick={handleReplyClick} className="bg-blue-600 text-white p-4 rounded-full shadow-lg">
                <Reply className="w-6 h-6" />
            </button>
        </div>
      )}

      {currentView === 'compose' && (
        <button onClick={handleAudioToggle} className={`fixed right-6 bottom-6 sm:hidden p-4 rounded-full shadow-xl z-[60] ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-indigo-600'} text-white`}>
          {isRecording ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
      )}
    </div>
  );
};
export default GmailComposeApp;