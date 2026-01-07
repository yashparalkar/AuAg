import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mail, Send, User, X, Check, Inbox, RefreshCw, ArrowLeft, Clock, Mic, Square, Reply, Sparkles, FileText, Paperclip, Download, Plus, Keyboard, ChevronUp, Calendar, Menu, LogOut, OctagonAlert, Search } from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_BASE || '';

const GmailComposeApp = () => {
  const activeLabelRef = useRef('INBOX');
  const observer = useRef();
  // Authentication
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [userAvatar, setUserAvatar] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- NEW SEARCH STATE ---
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Compose Fields
  const [toField, setToField] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [activeField, setActiveField] = useState(null);
  const [summary, setSummary] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  // Views
  const [currentView, setCurrentView] = useState('inbox');
  const [showCompose, setShowCompose] = useState(false);
  
  // Messages
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [messageCache, setMessageCache] = useState({});

  // Reply
  const [showReplyMenu, setShowReplyMenu] = useState(false);
  const [inlineReplyOpen, setInlineReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [ccField, setCcField] = useState('');
  const [bccField, setBccField] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [mediatorState, setMediatorState] = useState(null);
  const [prevMediatorState, setPrevMediatorState] = useState(null);
  const [emailGenerated, setEmailGenerated] = useState(false);
  const [composeContext, setComposeContext] = useState(null);
  const [aiMode, setAiMode] = useState('voice'); 
  const [aiInstruction, setAiInstruction] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [showMobileAiMenu, setShowMobileAiMenu] = useState(false);
  const [showMobileTextInput, setShowMobileTextInput] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);
  const [scheduleTime, setScheduleTime] = useState('');
  const [showScheduleInput, setShowScheduleInput] = useState(false);

  const avatarColors = [
    'bg-red-100 text-red-600', 'bg-orange-100 text-orange-600', 'bg-amber-100 text-amber-600',
    'bg-yellow-100 text-yellow-600', 'bg-lime-100 text-lime-600', 'bg-green-100 text-green-600',
    'bg-emerald-100 text-emerald-600', 'bg-teal-100 text-teal-600', 'bg-cyan-100 text-cyan-600',
    'bg-sky-100 text-sky-600', 'bg-blue-100 text-blue-600', 'bg-indigo-100 text-indigo-600',
    'bg-violet-100 text-violet-600', 'bg-purple-100 text-purple-600', 'bg-fuchsia-100 text-fuchsia-600',
    'bg-pink-100 text-pink-600', 'bg-rose-100 text-rose-600'
  ];

  // ... Utility functions (extractSenderName, getAvatarData, formatDate, handleDownload, etc) ...
  const extractSenderName = (fromString) => {
    const match = fromString && fromString.match(/^([^<]+)</);
    return match ? match[1].trim() : (fromString ? fromString.split('<')[0].trim() : '');
  };
  const getAvatarData = (name) => {
    const cleanName = name || '?';
    const charCode = cleanName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colorClass = avatarColors[charCode % avatarColors.length];
    const initial = cleanName.charAt(0).toUpperCase();
    return { colorClass, initial };
  };
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    else if (diffDays === 1) return 'Yesterday';
    else if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
    else return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
  const getLastTerm = (text) => { if (!text) return ''; const parts = text.split(','); return parts[parts.length - 1].trim(); };
  const stripHtml = (html) => { const tmp = document.createElement("DIV"); tmp.innerHTML = html; return tmp.textContent || tmp.innerText || ""; };
  const replaceLastTerm = (text, newEmail) => { const parts = text.split(','); parts.pop(); parts.push(' ' + newEmail); return parts.map(p => p.trim()).filter(p => p).join(', ') + ', '; };
  const pushInboxState = useCallback((replace = false, view = 'inbox') => {
    const state = { view: view };
    const url = window.location.pathname + '#' + view;
    if (replace) window.history.replaceState(state, '', url);
    else window.history.pushState(state, '', url);
  }, []);


  const loadInbox = useCallback(async (pageToken = null, label = 'INBOX', query = null, useCache = false) => {
    setLoadingMessages(true);

    // 1. CACHE CHECK
    // Only use cache if requested, we are on page 1 (no pageToken), and not searching
    if (useCache && !pageToken && !query && messageCache[label]) {
        console.log(`Loading ${label} from cache`);
        setMessages(messageCache[label].messages);
        setNextPageToken(messageCache[label].nextPageToken);
        setLoadingMessages(false);
        return; 
    }

    try {
      let url;
      
      if (query) {
        url = pageToken 
          ? `${API_BASE}/inbox/messages?pageToken=${pageToken}&q=${encodeURIComponent(query)}`
          : `${API_BASE}/inbox/messages?q=${encodeURIComponent(query)}`;
      } 
      else if (label === 'SCHEDULED') {
        url = `${API_BASE}/scheduled/messages`;
      } 
      else {
        url = pageToken 
          ? `${API_BASE}/inbox/messages?pageToken=${pageToken}&label=${label}` 
          : `${API_BASE}/inbox/messages?label=${label}`;
      }
        
      const response = await fetch(url, { credentials: 'include' });
      const data = await response.json();

      if (!query && activeLabelRef.current !== label) {
          console.log(`Ignoring stale ${label} data, user is now on ${activeLabelRef.current}`);
          return; // STOP! Do not update state.
      }
      
      if (data.success) {
        const newMessages = pageToken ? (messages) => [...messages, ...data.messages] : data.messages;
        
        // 2. UPDATE STATE
        setMessages(prev => pageToken ? [...prev, ...data.messages] : data.messages);
        setNextPageToken(data.nextPageToken);

        // 3. SAVE TO CACHE (Only if not searching and not paging)
        if (!query && !pageToken) {
            setMessageCache(prev => ({
                ...prev,
                [label]: { 
                    messages: data.messages, 
                    nextPageToken: data.nextPageToken 
                }
            }));
        }
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      setStatus('Failed to load messages');
    } finally {
      if (query || activeLabelRef.current === label) {
           setLoadingMessages(false);
       }
    }
  }, [messageCache]); // Add messageCache to dependencies

  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/status`, { credentials: 'include' });
      const data = await response.json();
      setIsAuthenticated(Boolean(data.authenticated));
      if (data.email) setUserEmail(data.email);
      if (data.picture) setUserAvatar(data.picture);
      
      if (data.authenticated) {
        const hash = window.location.hash;
        
        // --- START FIX ---
        // Explicitly handle the #compose hash so we don't redirect to Inbox
        if (hash === '#compose') {
           setShowCompose(true);
           setCurrentView('compose');
           return; 
        }
        // --- END FIX ---

        if (hash.startsWith('#message-')) {
            // Optional: You could ensure currentView is set to 'message' here
            // but usually we just want to let the existing state persist
            return; 
        }
        
        if (hash === '#sent') { setCurrentView('sent'); loadInbox(null, 'SENT'); }
        else if (hash === '#scheduled') { setCurrentView('scheduled'); loadInbox(null, 'SCHEDULED'); }
        else if (hash === '#spam') { setCurrentView('spam'); loadInbox(null, 'SPAM'); }
        else { setCurrentView('inbox'); loadInbox(null, 'INBOX'); }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
    finally {
      setIsAuthChecking(false);
    }
  }, [loadInbox]);

  const lastMessageElementRef = useCallback(node => {
    if (loadingMessages) return; // Don't trigger if already loading
    
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      // If the last element is visible AND we have a next page
      if (entries[0].isIntersecting && nextPageToken) {
        
        // Determine exactly what to load based on current view
        if (isSearching) {
            loadInbox(nextPageToken, null, searchQuery);
        } else if (currentView === 'spam') {
            loadInbox(nextPageToken, 'SPAM');
        } else if (currentView === 'sent') {
            loadInbox(nextPageToken, 'SENT');
        } else if (currentView === 'inbox') {
            loadInbox(nextPageToken, 'INBOX');
        }
      }
    });
    
    if (node) observer.current.observe(node);
  }, [loadingMessages, nextPageToken, loadInbox, isSearching, searchQuery, currentView]);

  const loadMessageDetail = useCallback(async (messageId, pushHistory = true) => {
    setSummary(''); 
    setShowSummary(false);
    setIsSummarizing(false);
    try {
      const response = await fetch(`${API_BASE}/inbox/message/${messageId}`, { credentials: 'include' });
      const data = await response.json();
      if (data.success) {
        // --- CHANGED: Use the attachments sent from backend directly ---
        const attachments = data.message.attachments || []; 
        
        const complete = { ...data.message, threadId: data.message.threadId || data.message.id, attachments: attachments };
        setSelectedMessage(complete);
        setCurrentView('message');
        setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, isUnread: false, attachments: attachments } : msg));
        if (pushHistory) {
          window.history.pushState({ view: 'message', messageId }, '', `${window.location.pathname}#message-${messageId}`);
        }
      }
    } catch (error) {
      console.error('Failed to load message:', error);
    }
  }, []);

  // ... File/Attachment/Effect helpers same as before ...
  const handleFileSelect = (e) => { if (e.target.files && e.target.files.length > 0) { setAttachments(prev => [...prev, ...Array.from(e.target.files)]); } };
  const removeAttachment = (indexToRemove) => { setAttachments(prev => prev.filter((_, index) => index !== indexToRemove)); };
  const clearAttachments = () => { setAttachments([]); if (fileInputRef.current) fileInputRef.current.value = ""; };
  const extractAttachments = (payload) => {
    if (!payload) return [];
    let attachments = [];
    const traverse = (parts) => {
      if (!parts) return;
      parts.forEach(part => {
        if (part.filename && part.body && part.body.attachmentId) { attachments.push({ filename: part.filename, mimeType: part.mimeType, size: part.body.size, attachmentId: part.body.attachmentId }); }
        if (part.parts) traverse(part.parts);
      });
    };
    if (payload.parts) traverse(payload.parts);
    return attachments;
  };

  useEffect(() => { 
    checkAuthStatus(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNavigation = (view) => {
    setCurrentView(view);
    setShowCompose(false);
    setSelectedMessage(null);
    setIsMobileMenuOpen(false);
    
    setSearchQuery('');
    setIsSearching(false);

    // --- KEY FIX: Clear messages immediately so old content doesn't show ---
    setMessages([]); 
    setLoadingMessages(true);
    // ---------------------------------------------------------------------

    pushInboxState(false, view);

    // Determine label and load with Cache enabled
    let label = 'INBOX';
    if (view === 'sent') label = 'SENT';
    else if (view === 'scheduled') label = 'SCHEDULED';
    else if (view === 'spam') label = 'SPAM';

    // Pass 'true' as the 4th argument to enable caching
    activeLabelRef.current = label;
    // -----------------------

    setMessages([]); // Clear old messages
    setLoadingMessages(true);
    pushInboxState(false, view);
    
    // Pass true for cache
    loadInbox(null, label, null, true);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    let mounted = true;
    const interval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/mediator/state`, { credentials: 'include' });
            const newState = await response.json();
            if (!mounted) return;
            setMediatorState(prev => { setPrevMediatorState(prev); return newState; });
        } catch (err) { console.error('Mediator polling failed', err); }
    }, 1000);
    return () => { mounted = false; clearInterval(interval); };
  }, [isAuthenticated]);
  useEffect(() => {
    if (!mediatorState || !prevMediatorState) return;
    if (mediatorState.recipient_name && mediatorState.recipient_name !== prevMediatorState.recipient_name && mediatorState.recipient_name !== toField) { setToField(mediatorState.recipient_name); }
    const prevCc = JSON.stringify(prevMediatorState.cc || []); const newCc = JSON.stringify(mediatorState.cc || []);
    if (newCc !== prevCc && Array.isArray(mediatorState.cc) && mediatorState.cc.length > 0) { const emails = mediatorState.cc.join(', ') + ', '; setCcField(prev => { const c = prev ? prev.trim() : ''; return c ? (c.endsWith(',') ? `${c} ${emails}` : `${c}, ${emails}`) : emails; }); setShowCcBcc(true); }
    const prevBcc = JSON.stringify(prevMediatorState.bcc || []); const newBcc = JSON.stringify(mediatorState.bcc || []);
    if (newBcc !== prevBcc && Array.isArray(mediatorState.bcc) && mediatorState.bcc.length > 0) { const emails = mediatorState.bcc.join(', ') + ', '; setBccField(prev => { const c = prev ? prev.trim() : ''; return c ? (c.endsWith(',') ? `${c} ${emails}` : `${c}, ${emails}`) : emails; }); setShowCcBcc(true); }
    if (mediatorState.description && mediatorState.description !== prevMediatorState.description) { setEmailGenerated(false); }
  }, [mediatorState, prevMediatorState, toField]);
  useEffect(() => { if (!showCompose) return; const loadComposeContext = async () => { try { const response = await fetch(`${API_BASE}/compose/context`, { credentials: 'include' }); const data = await response.json(); if (data.recipient_name) setToField(data.recipient_name); setComposeContext(data); } catch (err) { console.error('Failed to load compose context', err); } }; loadComposeContext(); }, [showCompose]);
  useEffect(() => { if (!showCompose || emailGenerated || !mediatorState || !mediatorState.description) return; const generateEmail = async () => { setLoading(true); setStatus('Generating email...'); try { const response = await fetch(`${API_BASE}/email/generate`, { method: 'POST', credentials: 'include' }); const data = await response.json(); if (data.success) { setSubject(data.subject); setBody(data.body); setEmailGenerated(true); } } catch (err) { console.error(err); } finally { setLoading(false); setStatus(''); } }; generateEmail(); }, [showCompose, mediatorState, emailGenerated]);

  useEffect(() => {
    const onPopState = (event) => {
      const state = event.state;
      const hash = window.location.hash;
      if (!state) {
        if (hash === '#sent') { handleNavigation('sent'); }
        else if (hash === '#scheduled') { handleNavigation('scheduled'); }
        else if (hash === '#spam') { handleNavigation('spam'); }
        else if (hash === '#compose') { setShowCompose(true); setCurrentView('compose'); }
        else { handleNavigation('inbox'); }
        return;
      }
      if (state.view === 'inbox' || state.view === 'sent' || state.view === 'scheduled' || state.view === 'spam') {
        setCurrentView(state.view); setShowCompose(false); setSelectedMessage(null);
        if (state.view === 'inbox') loadInbox(null, 'INBOX');
        else if (state.view === 'sent') loadInbox(null, 'SENT');
        else if (state.view === 'scheduled') loadInbox(null, 'SCHEDULED');
        else if (state.view === 'spam') loadInbox(null, 'SPAM');
      } 
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [loadInbox]);

  useEffect(() => {
    let currentText = ''; if (activeField === 'to') currentText = toField; else if (activeField === 'cc') currentText = ccField; else if (activeField === 'bcc') currentText = bccField; const term = getLastTerm(currentText);
    if (!activeField || term.length < 2) { setSuggestions([]); return; } const controller = new AbortController(); const searchContacts = async () => { try { const response = await fetch(`${API_BASE}/contacts/search?q=${encodeURIComponent(term)}`, { credentials: 'include', signal: controller.signal }); const data = await response.json(); setSuggestions(data.contacts || []); setSelectedIndex(-1); } catch (error) { if (error.name !== 'AbortError') console.error('Contact search failed:', error); } }; const id = setTimeout(searchContacts, 300); return () => { clearTimeout(id); controller.abort(); };
  }, [toField, ccField, bccField, activeField]);
  const handleKeyDown = (e, fieldType) => { if (activeField !== fieldType || suggestions.length === 0) return; if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1)); } else if (e.key === 'Enter' && selectedIndex >= 0) { e.preventDefault(); selectSuggestion(suggestions[selectedIndex]); } };
  const selectSuggestion = (contact) => { if (activeField === 'to') setToField(prev => replaceLastTerm(prev, contact.email)); else if (activeField === 'cc') setCcField(prev => replaceLastTerm(prev, contact.email)); else if (activeField === 'bcc') setBccField(prev => replaceLastTerm(prev, contact.email)); setSuggestions([]); setSelectedIndex(-1); };
  const handleBlur = () => { setTimeout(() => { setActiveField(null); setSuggestions([]); }, 200); };
  const handleAuth = () => { setStatus('Redirecting...'); window.location.href = `${API_BASE}/auth/google/login`; };
  const handleLogout = async () => { 
    try { 
      await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }); 
      
      // 1. Clear Data Cache (Prevents data leaks/glitches)
      setMessageCache({});
      setMessages([]);
      
      // 2. Reset Auth State
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
  const handleSummarize = async () => { if (!selectedMessage) return; setIsSummarizing(true); try { const bodyText = selectedMessage.isHtml ? stripHtml(selectedMessage.body) : selectedMessage.body; const textToSummarize = `Subject: ${selectedMessage.subject}\n\n${bodyText}`; const response = await fetch(`${API_BASE}/email/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ text: textToSummarize }) }); const data = await response.json(); if (data.success) { setSummary(data.summary); setShowSummary(true); } else { setStatus('Failed to generate summary'); setTimeout(() => setStatus(''), 2000); } } catch (error) { console.error('Summarize failed:', error); setStatus('Error summarizing'); setTimeout(() => setStatus(''), 2000); } finally { setIsSummarizing(false); } };
  const handleCompose = () => { setShowCompose(true); setCurrentView('compose'); setToField(''); setCcField(''); setBccField(''); setSubject(''); setBody(''); setAiInstruction(''); setAiMode('voice'); setShowMobileAiMenu(false); setShowMobileTextInput(false); setIsMobileMenuOpen(false); window.history.pushState({ view: 'compose' }, '', window.location.pathname + '#compose'); };
  const handleReplyNew = () => { setShowReplyMenu(false); if (!selectedMessage) return; const emailMatch = selectedMessage.from.match(/<([^>]+)>/); const replyToEmail = emailMatch ? emailMatch[1] : selectedMessage.from; setToField(replyToEmail); setSubject(selectedMessage.subject || ''); setBody(''); setAiInstruction(''); setAiMode('voice'); setShowMobileAiMenu(false); setShowMobileTextInput(false); setShowCompose(true); setCurrentView('compose'); window.history.pushState({ view: 'compose' }, '', window.location.pathname + '#compose'); };
  const handleReplyClick = () => setShowReplyMenu(true);
  const handleReplyThread = () => { setShowReplyMenu(false); setInlineReplyOpen(true); setTimeout(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }, 100); };
  const sendInlineReply = async () => { if (!replyBody.trim() || !selectedMessage) return; setLoading(true); setStatus('Sending reply...'); try { const emailMatch = selectedMessage.from.match(/<([^>]+)>/); const replyToEmail = emailMatch ? emailMatch[1] : selectedMessage.from; const formData = new FormData(); formData.append('to', replyToEmail); formData.append('subject', selectedMessage.subject); formData.append('body', replyBody); formData.append('threadId', selectedMessage.threadId); formData.append('messageId', selectedMessage.id); attachments.forEach((file) => formData.append('attachments', file)); const response = await fetch(`${API_BASE}/email/send`, { method: 'POST', credentials: 'include', body: formData }); const data = await response.json(); if (data.success) { setStatus('Reply sent!'); setReplyBody(''); setAttachments([]); setInlineReplyOpen(false); } else { setStatus('Failed: ' + (data.error || 'unknown')); } } catch (error) { console.error(error); setStatus('Error: ' + error.message); } finally { setLoading(false); setTimeout(() => setStatus(''), 2000); } };
  const handleSend = async () => { if (!toField || !subject) { setStatus('Please fill in recipient and subject'); setTimeout(() => setStatus(''), 2000); return; } setLoading(true); setStatus(scheduleTime ? 'Scheduling email...' : 'Sending email...'); try { const formData = new FormData(); formData.append('to', toField); formData.append('subject', subject); formData.append('body', body); if (ccField) formData.append('cc', ccField); if (bccField) formData.append('bcc', bccField); attachments.forEach((file) => formData.append('attachments', file)); if (scheduleTime) { formData.append('scheduledTime', new Date(scheduleTime).toISOString()); } const response = await fetch(`${API_BASE}/email/send`, { method: 'POST', credentials: 'include', body: formData }); const data = await response.json(); if (data.success) { setStatus(data.scheduled ? 'Email successfully scheduled!' : 'Email sent successfully!'); setToField(''); setCcField(''); setBccField(''); setSubject(''); setBody(''); 
    setMessageCache(prev => {
        const newCache = { ...prev };
        delete newCache['SENT']; 
        return newCache;
    });
    setAttachments([]); setScheduleTime(''); setShowScheduleInput(false); if (fileInputRef.current) fileInputRef.current.value = ""; setShowCompose(false); handleNavigation('inbox'); } else { setStatus('Failed: ' + (data.error || 'unknown')); } } catch (error) { console.error(error); setStatus('Error: ' + error.message); } finally { setLoading(false); setTimeout(() => setStatus(''), 3000); } };
  const handleAudioToggle = async () => { setShowMobileTextInput(false); if (!isRecording) { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream; const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' }); audioChunksRef.current = []; mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); }; mediaRecorder.onstop = async () => { const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' }); const formData = new FormData(); formData.append('audio', audioBlob, 'recording.webm'); setIsAiProcessing(true); try { const response = await fetch(`${API_BASE}/audio/transcribe`, { method: 'POST', credentials: 'include', body: formData }); const data = await response.json(); if (data.success) { await fetch(`${API_BASE}/mediator/advance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ input: data.text }) }); } } catch (err) { console.error('Transcription failed', err); } finally { setIsAiProcessing(false); } }; mediaRecorder.start(); mediaRecorderRef.current = mediaRecorder; setIsRecording(true); } catch (err) { console.error('Failed to get audio', err); } } else { if (mediaRecorderRef.current) mediaRecorderRef.current.stop(); if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); mediaRecorderRef.current = null; streamRef.current = null; setIsRecording(false); } };
  const handleAiTextSubmit = async () => { if (!aiInstruction.trim()) return; setIsAiProcessing(true); if (showMobileTextInput) setShowMobileTextInput(false); try { await fetch(`${API_BASE}/mediator/advance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ input: aiInstruction }) }); setAiInstruction(''); } catch (err) { console.error('Text submission failed', err); } finally { setIsAiProcessing(false); } };
  const handleMobileFabClick = () => { if (isRecording) handleAudioToggle(); else if (showMobileTextInput) setShowMobileTextInput(false); else setShowMobileAiMenu(prev => !prev); };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    // Reset view to 'search' conceptually (we'll just use currentView to render list, but data is from search)
    // We can keep currentView as is or switch to 'inbox' to show the list component
    // Let's just reload inbox with query
    loadInbox(null, null, searchQuery); 
  };

  const clearSearch = () => {
    setSearchQuery('');
    setIsSearching(false);
    handleNavigation('inbox');
  };

  const renderSuggestions = (fieldType) => { if (activeField !== fieldType || suggestions.length === 0) return null; return ( <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto"> {suggestions.map((contact, index) => ( <div key={contact.email} onMouseDown={(e) => { e.preventDefault(); selectSuggestion(contact); }} className={`px-4 py-3 cursor-pointer transition-all duration-150 border-b last:border-0 ${index === selectedIndex ? 'bg-gradient-to-r from-violet-50 to-purple-50 border-l-4 border-violet-500' : 'hover:bg-slate-50'}`}> <div className="font-semibold text-slate-800">{contact.name}</div> <div className="text-sm text-slate-500">{contact.email}</div> </div> ))} </div> ); };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="p-5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl mb-6 shadow-xl">
             <Mail className="w-10 h-10 text-white" />
          </div>
          <div className="h-4 w-32 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-gradient-to-br from-violet-100 via-purple-50 to-fuchsia-100 flex items-center justify-center p-4">
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 sm:p-10 max-w-md w-full mx-auto border border-white/20">
        <div className="text-center mb-8">
          <div className="inline-block p-5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl mb-5 shadow-lg"><Mail className="w-12 h-12 text-white" /></div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent mb-2">Echo Mail</h1>
          <p className="text-slate-600">Connect your Google account to get started</p>
        </div>
        <button onClick={handleAuth} disabled={loading} className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3">Sign in with Google</button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      
      {/* --- MOBILE OVERLAY BACKDROP --- */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden animate-in fade-in duration-200" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* --- SIDEBAR --- */}
      <aside className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out flex flex-col h-full
          md:translate-x-0 md:static
          ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        {/* Logo Area */}
        <div className="p-6 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-md">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">Echo Mail</h1>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-1 text-slate-400 hover:bg-slate-100 rounded-lg">
             <X className="w-5 h-5" />
          </button>
        </div>

        {/* Compose Button */}
        <div className="p-4">
          <button 
            onClick={handleCompose} 
            className="w-full bg-violet-50 hover:bg-violet-100 text-violet-700 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors border border-violet-100 shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span>Compose</span>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          <button 
            onClick={() => handleNavigation('inbox')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${currentView === 'inbox' && !isSearching ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Inbox className="w-5 h-5" /> Inbox
          </button>
          <button 
            onClick={() => handleNavigation('sent')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${currentView === 'sent' && !isSearching ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Send className="w-5 h-5" /> Sent
          </button>
          <button 
            onClick={() => handleNavigation('scheduled')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${currentView === 'scheduled' && !isSearching ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Clock className="w-5 h-5" /> Scheduled
          </button>
          <button 
            onClick={() => handleNavigation('spam')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${currentView === 'spam' && !isSearching ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <OctagonAlert className="w-5 h-5" /> Spam
          </button>
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-slate-200">
           <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 cursor-pointer group relative">
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden">
                {userAvatar ? <img src={userAvatar} alt="User" className="w-full h-full object-cover"/> : <User className="w-5 h-5 text-slate-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{userEmail}</p>
                <div onClick={handleLogout} className="flex items-center gap-1 text-xs text-red-500 font-medium hover:underline mt-0.5">
                   <LogOut className="w-3 h-3" /> Logout
                </div>
              </div>
           </div>
        </div>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 flex flex-col h-full w-full relative">
        
        {/* Mobile Header */}
        <header className="md:hidden bg-white/80 backdrop-blur-xl border-b border-slate-200 px-4 py-3 sticky top-0 z-20 flex items-center gap-4">
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 hover:bg-slate-100 rounded-lg text-slate-600">
             <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
             <div className="p-1.5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg"><Mail className="w-4 h-4 text-white" /></div>
             <span className="font-bold text-slate-800">Echo Mail</span>
          </div>
        </header>

        {/* Status Notification */}
        {status && (
          <div className="absolute top-16 md:top-4 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="px-4 py-2 bg-slate-800 text-white rounded-full shadow-xl flex items-center gap-2 text-sm font-medium">
              <Check className="w-4 h-4 text-emerald-400" />
              {status}
            </div>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          
          {/* List Views */}
          {(currentView === 'inbox' || currentView === 'sent' || currentView === 'scheduled' || currentView === 'spam') && (
             <div className="max-w-4xl mx-auto px-2 py-4 md:p-8 pb-24 md:pb-8">
                
                {/* --- HEADER & SEARCH BAR --- */}
                <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
                  
                  {/* Title */}
                  <h2 className="text-2xl font-bold text-slate-800 capitalize md:w-32">
                    {isSearching ? 'Results' : currentView}
                  </h2>

                  {/* WRAPPER: Groups Search + Refresh side-by-side on all screens */}
                  <div className="flex flex-1 gap-2 w-full">
                      
                      {/* Search Bar Input */}
                      <form onSubmit={handleSearchSubmit} className="flex-1 relative">
                        <div className="relative group">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                          </div>
                          <input 
                            type="text" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search mail..." 
                            className="block w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl leading-5 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-shadow shadow-sm"
                          />
                          {searchQuery && (
                            <button type="button" onClick={clearSearch} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                              <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
                            </button>
                          )}
                        </div>
                      </form>

                      {/* Refresh Button - Now sits next to search bar */}
                      <button 
                        onClick={() => {
                            const label = currentView === 'sent' ? 'SENT' : currentView === 'scheduled' ? 'SCHEDULED' : currentView === 'spam' ? 'SPAM' : 'INBOX';
                            if (!isSearching) setMessages([]); 
                            if (isSearching) loadInbox(null, null, searchQuery, false);
                            else loadInbox(null, label, null, false);
                        }}
                        disabled={loadingMessages} 
                        className="p-2.5 bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-violet-600 rounded-xl shadow-sm transition-all shrink-0"
                      >
                        <RefreshCw className={`w-5 h-5 ${loadingMessages ? 'animate-spin' : ''}`} />
                      </button>

                  </div>
                </div>

                {/* Message List */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
                  {loadingMessages && messages.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">Loading...</div>
                  ) : messages.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">
                      {isSearching ? `No results found for "${searchQuery}"` : 'No messages found'}
                    </div>
                  ) : messages.map((message, index) => {
                    const isSent = currentView === 'sent';
                    const isScheduled = currentView === 'scheduled';
                    const isSpam = currentView === 'spam';
                    
                    const displayName = (isSent || isScheduled) ? extractSenderName(message.to) : extractSenderName(message.from);
                    const displayLabel = (isSent || isScheduled) ? `To: ${displayName}` : displayName;
                    
                    const { colorClass, initial } = getAvatarData(displayName);
                    
                    // --- CHECK IF THIS IS THE LAST MESSAGE ---
                    const isLastElement = messages.length === index + 1;

                    return (
                      <div 
                        key={message.id} 
                        // --- ATTACH REF HERE IF LAST ---
                        ref={isLastElement ? lastMessageElementRef : null}
                        
                        onClick={() => !isScheduled && loadMessageDetail(message.id)} 
                        className={`w-full text-left p-3 md:p-4 hover:bg-slate-50 transition-all group flex items-start gap-4 ${message.isUnread ? 'bg-violet-50/50' : ''} ${!isScheduled ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold shadow-sm flex-shrink-0 ${colorClass}`}>
                          {initial}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-1 gap-2">
                            <span className={`font-semibold text-sm text-slate-900 truncate flex-1 ${message.isUnread ? 'font-bold' : ''}`}>
                               {displayLabel}
                            </span>
                            <div className={`flex items-center gap-1.5 text-xs flex-shrink-0 ${isScheduled ? 'text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded-full' : (isSpam ? 'text-red-500 font-bold bg-red-50 px-2 py-1 rounded-full' : 'text-slate-500')}`}>
                              {isSpam && <OctagonAlert className="w-3 h-3"/>}
                              {!isSpam && <Clock className="w-3 h-3" />}
                              <span>{isScheduled ? `Scheduled: ${formatDate(message.date)}` : (isSpam ? 'Spam' : formatDate(message.date))}</span>
                            </div>
                          </div>
                          <div className={`text-sm mb-0.5 truncate ${message.isUnread ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{message.subject}</div>
                          <div className="text-sm text-slate-500 line-clamp-1">{message.snippet}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {loadingMessages && messages.length > 0 && (
                  <div className="py-4 flex justify-center w-full">
                    <RefreshCw className="w-6 h-6 text-violet-500 animate-spin" />
                  </div>
                )}
             </div>
          )}

          {/* ... MESSAGE DETAIL VIEW & COMPOSE VIEW RENDER LOGIC REMAINS THE SAME ... */}
          {currentView === 'message' && selectedMessage && (
            <div className="px-2 pt-2 md:p-8 max-w-4xl mx-auto h-full flex flex-col">
     
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
                {/* Header section (Back button, etc) remains the same */}
                <div className="flex items-center justify-between p-4 border-b border-slate-100">
                    <button onClick={() => { handleNavigation(window.location.hash.includes('spam') ? 'spam' : 'inbox'); pushInboxState(); }} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors">
                      <ArrowLeft className="w-5 h-5" /> Back
                    </button>
                    <div className="flex gap-2">
                      <button onClick={handleSummarize} className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 font-medium text-sm">
                          {isSummarizing ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>} Summarize
                      </button>
                      <button onClick={handleReplyClick} className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 font-medium text-sm">
                          <Reply className="w-4 h-4" /> Reply
                      </button>
                    </div>
                </div>

                {/* 2. Modified Content Area: */}
                {/* - Added 'pb-24' here. This ensures the text scrolls ABOVE the floating buttons, but the card itself stays full height. */}
                <div className="p-6 overflow-y-auto flex-1 pb-24">
                    <h2 className="text-2xl font-bold text-slate-900 mb-6">{selectedMessage.subject}</h2>
                    <div className="flex gap-4 mb-6">
                       <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shadow-sm ${getAvatarData(extractSenderName(selectedMessage.from)).colorClass}`}>
                          {getAvatarData(extractSenderName(selectedMessage.from)).initial}
                       </div>
                       <div>
                          <p className="font-bold text-slate-900">{extractSenderName(selectedMessage.from)}</p>
                          <p className="text-sm text-slate-500">{selectedMessage.from}</p>
                          <p className="text-xs text-slate-400 mt-1">To: {selectedMessage.to}</p>
                       </div>
                    </div>
                    {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedMessage.attachments.map((att, index) => (
                          <button key={index} onClick={() => handleDownload(selectedMessage.id, att.attachmentId, att.filename)} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl hover:border-violet-400 transition-colors text-left">
                            <div className="bg-violet-100 p-2 rounded-lg"><FileText className="w-5 h-5 text-violet-600" /></div>
                            <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{att.filename}</p><p className="text-xs text-slate-500">{(att.size / 1024).toFixed(0)} KB</p></div>
                            <Download className="w-4 h-4 text-slate-400" />
                          </button>
                        ))}
                      </div>
                    )}
                    {showSummary && summary && (
                      <div className="mb-6 bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-xl p-5 shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                           <h3 className="font-bold text-indigo-900 flex items-center gap-2"><Sparkles className="w-4 h-4"/> AI Summary</h3>
                           <button onClick={() => setShowSummary(false)}><X className="w-4 h-4 text-indigo-400"/></button>
                        </div>
                        <p className="text-indigo-900 text-sm leading-relaxed">{summary}</p>
                      </div>
                    )}
                    <div className="prose prose-sm max-w-none text-slate-800">
                       {selectedMessage.isHtml 
                         ? <div dangerouslySetInnerHTML={{ __html: selectedMessage.body }} /> 
                         : <pre className="whitespace-pre-wrap font-sans">{selectedMessage.body}</pre>}
                    </div>
                    {inlineReplyOpen && (
                      <div className="mt-8 border border-slate-200 rounded-xl shadow-lg overflow-hidden animate-in slide-in-from-bottom-5">
                         <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                            <span className="text-sm font-bold text-slate-700">Reply</span>
                            <button onClick={() => setInlineReplyOpen(false)}><X className="w-4 h-4 text-slate-500" /></button>
                         </div>
                         <div className="p-4 bg-white">
                            <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Type your reply..." className="w-full h-32 p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none resize-none mb-3" />
                            <div className="flex justify-between items-center">
                               <div className="flex gap-2">
                                  <button onClick={() => document.getElementById('reply-file').click()} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"><Paperclip className="w-5 h-5"/></button>
                                  <input type="file" id="reply-file" onChange={handleFileSelect} className="hidden" multiple />
                                  {attachments.length > 0 && <span className="text-xs bg-slate-100 px-2 py-1 rounded-md self-center">{attachments.length} files</span>}
                               </div>
                               <button onClick={sendInlineReply} disabled={loading} className="bg-violet-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-violet-700">Send Reply</button>
                            </div>
                         </div>
                      </div>
                    )}
                 </div>
               </div>
            </div>
          )}
        </div>
      </main>

      {/* --- FLOATING BUTTONS, MODALS, ETC (Kept same) --- */}
      {(currentView === 'inbox' || currentView === 'sent' || currentView === 'scheduled' || currentView === 'spam') && (
        <button onClick={handleCompose} className="md:hidden fixed right-4 bottom-6 bg-violet-600 text-white p-4 rounded-full shadow-lg z-30 active:scale-95 transition-transform">
          <Plus className="w-6 h-6" />
        </button>
      )}
      {/* ... (Rest of Floating buttons and Compose Modal code remains the same as previous) ... */}
      {currentView === 'message' && !inlineReplyOpen && (
        <div className="md:hidden fixed right-4 bottom-6 flex flex-col gap-3 z-30">
          <button onClick={handleSummarize} className="bg-indigo-600 text-white p-3 rounded-full shadow-lg active:scale-95 transition-transform"><Sparkles className="w-6 h-6" /></button>
          <button onClick={handleReplyClick} className="bg-violet-600 text-white p-3 rounded-full shadow-lg active:scale-95 transition-transform"><Reply className="w-6 h-6" /></button>
        </div>
      )}
      {currentView === 'compose' && (
          <div className="fixed inset-0 z-50 bg-white md:bg-black/50 md:flex md:items-center md:justify-center p-0 md:p-4">
            <div className="bg-white w-full h-full md:h-auto md:max-w-2xl md:max-h-[85vh] md:rounded-2xl md:shadow-2xl overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
                <h2 className="text-lg font-bold text-slate-800">New Message</h2>
                <button onClick={() => { setShowCompose(false); handleNavigation('inbox'); }} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-32 md:pb-6">
                <div className="hidden md:block mb-6 bg-indigo-50 border border-indigo-100 rounded-xl overflow-hidden">
                  <div className="flex border-b border-indigo-100 bg-white/50 px-4 py-2 justify-between items-center">
                    <span className="text-xs font-bold text-indigo-800 flex items-center gap-1"><Sparkles className="w-3 h-3"/> AI Assistant</span>
                    <div className="flex bg-slate-200 rounded-lg p-0.5">
                      <button onClick={() => setAiMode('voice')} className={`px-3 py-0.5 rounded-md text-xs font-bold transition-all ${aiMode === 'voice' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500'}`}>Voice</button>
                      <button onClick={() => setAiMode('text')} className={`px-3 py-0.5 rounded-md text-xs font-bold transition-all ${aiMode === 'text' ? 'bg-white shadow-sm text-indigo-700' : 'text-slate-500'}`}>Text</button>
                    </div>
                  </div>
                  <div className="p-4">
                    {aiMode === 'voice' ? (
                      <button 
                        onClick={handleAudioToggle} 
                        // Disable button if processing
                        disabled={isAiProcessing} 
                        className={`w-full py-3 rounded-lg font-bold text-white transition-all flex items-center justify-center gap-2 ${
                          isRecording ? 'bg-red-500 animate-pulse' : 
                          isAiProcessing ? 'bg-indigo-400 cursor-not-allowed' : // Light indigo when processing
                          'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                      >
                        {isAiProcessing ? (
                          // SHOW SPINNER IF PROCESSING
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Processing...</span>
                          </>
                        ) : isRecording ? (
                          <>
                            <Square className="w-4 h-4" />
                            <span>Stop Recording</span>
                          </>
                        ) : (
                          <>
                            <Mic className="w-4 h-4" />
                            <span>Tap to Speak</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <input 
                          value={aiInstruction} 
                          onChange={(e) => setAiInstruction(e.target.value)} 
                          onKeyDown={(e) => e.key === 'Enter' && handleAiTextSubmit()}
                          placeholder="Describe email..." 
                          className="flex-1 px-3 py-2 rounded-lg border border-indigo-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                        />
                        <button 
                          onClick={handleAiTextSubmit} 
                          disabled={isAiProcessing || !aiInstruction.trim()} 
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold min-w-[100px] flex items-center justify-center"
                        >
                          {isAiProcessing ? <RefreshCw className="w-4 h-4 animate-spin"/> : 'Generate'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                   <div className="relative">
                      <div className="flex justify-between"><label className="text-xs font-bold text-slate-500 uppercase">To</label><button onClick={() => setShowCcBcc(!showCcBcc)} className="text-xs text-violet-600 font-semibold">CC/BCC</button></div>
                      <input value={toField} onChange={(e) => setToField(e.target.value)} onFocus={() => setActiveField('to')} onBlur={handleBlur} onKeyDown={(e) => handleKeyDown(e, 'to')} className="w-full py-2 border-b border-slate-200 focus:border-violet-500 outline-none font-medium text-slate-800" placeholder="Recipient" />
                      {renderSuggestions('to')}
                   </div>
                   {showCcBcc && (
                     <>
                       <div className="relative"><label className="text-xs font-bold text-slate-500 uppercase">Cc</label><input value={ccField} onChange={(e) => setCcField(e.target.value)} onFocus={() => setActiveField('cc')} onBlur={handleBlur} onKeyDown={(e) => handleKeyDown(e, 'cc')} className="w-full py-2 border-b border-slate-200 focus:border-violet-500 outline-none" />{renderSuggestions('cc')}</div>
                       <div className="relative"><label className="text-xs font-bold text-slate-500 uppercase">Bcc</label><input value={bccField} onChange={(e) => setBccField(e.target.value)} onFocus={() => setActiveField('bcc')} onBlur={handleBlur} onKeyDown={(e) => handleKeyDown(e, 'bcc')} className="w-full py-2 border-b border-slate-200 focus:border-violet-500 outline-none" />{renderSuggestions('bcc')}</div>
                     </>
                   )}
                   <div><label className="text-xs font-bold text-slate-500 uppercase">Subject</label><input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full py-2 border-b border-slate-200 focus:border-violet-500 outline-none font-bold text-lg text-slate-800" placeholder="Add a subject" /></div>
                   <textarea value={body} onChange={(e) => setBody(e.target.value)} className="w-full h-64 py-2 outline-none resize-none text-slate-700 leading-relaxed" placeholder="Type your message..." />
                   {attachments.length > 0 && (
                     <div className="flex flex-wrap gap-2">
                       {attachments.map((file, i) => (
                         <div key={i} className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                           <span className="text-xs font-medium truncate max-w-[150px]">{file.name}</span>
                           <button onClick={() => removeAttachment(i)}><X className="w-3 h-3 text-slate-500 hover:text-red-500"/></button>
                         </div>
                       ))}
                     </div>
                   )}
                </div>
                <div className="flex items-center gap-3 mt-6 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2 flex-1">
                     <button onClick={handleSend} disabled={loading} className={`px-6 py-2.5 rounded-xl font-bold text-white shadow-lg flex items-center gap-2 transition-all ${scheduleTime ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-violet-600 hover:bg-violet-700'}`}>
                        {scheduleTime ? <Calendar className="w-4 h-4" /> : <Send className="w-4 h-4" />} {scheduleTime ? 'Schedule' : 'Send'}
                     </button>
                     <div className="relative">
                        <button onClick={() => setShowScheduleInput(!showScheduleInput)} className={`p-2.5 rounded-xl border ${scheduleTime ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}><Clock className="w-5 h-5"/></button>
                        {showScheduleInput && (
                           <div className="absolute bottom-14 left-0 bg-white p-3 rounded-xl shadow-xl border border-slate-200 w-64 animate-in slide-in-from-bottom-2">
                              <label className="text-xs font-bold text-slate-500 mb-2 block">Pick date & time</label>
                              <input type="datetime-local" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="w-full text-sm p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 mb-2"/>
                              {scheduleTime && <button onClick={() => { setScheduleTime(''); setShowScheduleInput(false); }} className="text-xs text-red-500 font-bold w-full text-center hover:underline">Clear Schedule</button>}
                           </div>
                        )}
                     </div>
                     <button onClick={() => fileInputRef.current.click()} className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><Paperclip className="w-5 h-5"/></button>
                     <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" multiple />
                  </div>
                </div>
              </div>
              <div className="md:hidden">
                {showMobileTextInput ? (
                    <div className="p-4 bg-slate-50 border-t border-slate-200 animate-in slide-in-from-bottom">
                      <div className="flex gap-2">
                          <textarea 
                            value={aiInstruction} 
                            onChange={(e) => setAiInstruction(e.target.value)} 
                            className="flex-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-20" 
                            placeholder="Describe email..." 
                            autoFocus 
                          />
                          <div className="flex flex-col gap-2">
                            <button onClick={() => setShowMobileTextInput(false)} className="p-2 bg-slate-200 rounded-lg text-slate-600"><ChevronUp className="w-5 h-5 rotate-180"/></button>
                            <button 
                                onClick={handleAiTextSubmit} 
                                disabled={isAiProcessing}
                                className="flex-1 bg-indigo-600 text-white rounded-lg flex items-center justify-center disabled:bg-indigo-400"
                            >
                                {isAiProcessing ? <RefreshCw className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5"/>}
                            </button>
                          </div>
                      </div>
                    </div>
                ) : (
                    <div className="absolute bottom-6 right-6 flex flex-col items-end gap-3 pointer-events-none">
                      {showMobileAiMenu && !isAiProcessing && (
                          <>
                            <button onClick={() => { setShowMobileTextInput(true); setShowMobileAiMenu(false); }} className="pointer-events-auto bg-white text-indigo-600 p-3 rounded-full shadow-lg border border-indigo-100 flex items-center gap-2"><Keyboard className="w-5 h-5"/><span className="text-xs font-bold">Type</span></button>
                            <button onClick={() => { handleAudioToggle(); setShowMobileAiMenu(false); }} className="pointer-events-auto bg-white text-indigo-600 p-3 rounded-full shadow-lg border border-indigo-100 flex items-center gap-2"><Mic className="w-5 h-5"/><span className="text-xs font-bold">Speak</span></button>
                          </>
                      )}
                      <button 
                          onClick={() => { 
                            if (isAiProcessing) return; // Do nothing if processing
                            if (isRecording) handleAudioToggle(); 
                            else setShowMobileAiMenu(!showMobileAiMenu); 
                          }} 
                          className={`pointer-events-auto p-4 rounded-full shadow-xl text-white transition-all ${
                            isRecording ? 'bg-red-500 animate-pulse' : 
                            isAiProcessing ? 'bg-indigo-400' : // Lighter color when processing
                            'bg-indigo-600'
                          }`}
                      >
                          {isAiProcessing ? (
                            <RefreshCw className="w-6 h-6 animate-spin"/>
                          ) : isRecording ? (
                            <Square className="w-6 h-6"/>
                          ) : (
                            <Sparkles className="w-6 h-6"/>
                          )}
                      </button>
                    </div>
                )}
              </div>
            </div>
          </div>
      )}
      {showReplyMenu && (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10 border border-slate-200">
            <div className="p-5 bg-violet-50 border-b border-slate-200 flex justify-between items-center"><h3 className="font-bold text-slate-800">Reply Option</h3><button onClick={() => setShowReplyMenu(false)}><X className="w-5 h-5 text-slate-500" /></button></div>
            <div className="p-3 space-y-2">
              <button onClick={handleReplyThread} className="w-full text-left px-4 py-4 hover:bg-violet-50 flex items-center gap-3 rounded-xl border-2 border-transparent hover:border-violet-200"><div className="bg-violet-100 p-3 rounded-xl"><Reply className="w-5 h-5 text-violet-600" /></div><div><div className="font-bold text-slate-800">Reply to Thread</div><div className="text-xs text-slate-500">Keep history</div></div></button>
              <button onClick={handleReplyNew} className="w-full text-left px-4 py-4 hover:bg-slate-50 flex items-center gap-3 rounded-xl border-2 border-transparent hover:border-slate-200"><div className="bg-slate-100 p-3 rounded-xl"><Mail className="w-5 h-5 text-slate-600" /></div><div><div className="font-bold text-slate-800">New Message</div><div className="text-xs text-slate-500">Separate email</div></div></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default GmailComposeApp;