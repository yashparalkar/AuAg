import React, { useState, useEffect } from 'react';
import { Mail, Send, User, X, Check } from 'lucide-react';

// const API_BASE = 'http://192.168.0.102:5001/api';
// const API_BASE = 'http://localhost:5001/api';
const API_BASE = 'https://tangela-fiery-bitterly.ngrok-free.dev/api';



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

  const [composeContext, setComposeContext] = useState(null);

  const [emailGenerated, setEmailGenerated] = useState(false);

  // const [mediatorInput, setMediatorInput] = useState('');
  const [mediatorState, setMediatorState] = useState(null);

  const [prevMediatorState, setPrevMediatorState] = useState(null);

  const [isRecording, setIsRecording] = useState(false);

  const [ccField, setCcField] = useState('');
  const [bccField, setBccField] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);





  useEffect(() => {
    checkAuthStatus();
  }, []);

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
      await fetch(`${API_BASE}/audio/start`, {
        method: 'POST',
        credentials: 'include'
      });
      setIsRecording(true);
    } else {
      const response = await fetch(`${API_BASE}/audio/stop`, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();
      if (data.success) {
        // Send transcription to mediator
        await fetch(`${API_BASE}/mediator/advance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ input: data.text })
        });
      }

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
    }, 1000); // 1s polling (adjust later)

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!mediatorState || !prevMediatorState) return;

    // 1. Recipient name changed
    if (
      mediatorState.recipient_name &&
      mediatorState.recipient_name !== prevMediatorState.recipient_name &&
      mediatorState.recipient_name !== toField
    ) {
      setToField(mediatorState.recipient_name);
    }

    // 2. Recipient option index changed
    if (
      mediatorState.recipient_options !== null &&
      mediatorState.recipient_options !== prevMediatorState.recipient_options
    ) {
      // Do nothing here directly.
      // Existing suggestion-selection effect will pick this up
      // once suggestions are populated.
    }

    // 3. Description changed → allow regeneration
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


  // const handleAuth = async () => {
  //   setLoading(true);
  //   setStatus('Authenticating...');
  //   try {
  //     // const response = await fetch(`${API_BASE}/auth/google/login`, {
  //     //   method: 'POST',
  //     //   credentials: 'include'
  //     // });
  //     const handleGoogleLogin = () => {
  //       window.location.href = `${API_BASE}/auth/google/login`;
  //     };

  //     // const data = await response.json();
  //     // if (data.success) {
  //     //   setIsAuthenticated(true);
  //     //   setUserEmail(data.email);
  //     //   setStatus('Successfully authenticated!');
  //     // } else {
  //     //   setStatus('Authentication failed: ' + data.error);
  //     // }
  //   } catch (error) {
  //     setStatus('Error: ' + error.message);
  //   } finally {
  //     setLoading(false);
  //     setTimeout(() => setStatus(''), 3000);
  //   }
  // };

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

  // useEffect(() => {
  //   if (suggestions.length === 0) return;

  //   // Auto-select the first suggestion (hardcoded behavior)
  //   const firstContact = suggestions[0];
  //   setToField(firstContact.email);
  //   setSuggestions([]);
  //   setSelectedIndex(-1);
  // }, [suggestions]);

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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="inline-block p-4 bg-blue-100 rounded-full mb-4">
              <Mail className="w-12 h-12 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Gmail Compose</h1>
            <p className="text-gray-600">Authenticate with Google to compose and send emails</p>
          </div>
          
          <button
            onClick={handleAuth}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mail className="w-8 h-8 text-blue-600" />
            <h1 className="text-xl font-semibold text-gray-800">Gmail Compose</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User className="w-4 h-4" />
              <span>{userEmail}</span>
            </div>
            <button onClick={handleLogout} className="text-sm text-gray-600 hover:text-gray-800">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {status && (
          
          <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center gap-2">
            <Check className="w-5 h-5" />
            {status}
          </div>
        )}
        {/* Mediator Panel */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h3 className="text-md font-semibold text-gray-800 mb-3">
            Mediator
          </h3>

          <div className="flex gap-2 mb-3">
            <button
              onClick={handleAudioToggle}
              className={`flex-1 py-2 rounded-lg font-medium text-white transition-colors ${
                isRecording
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isRecording ? 'Stop Recording' : 'Record'}
            </button>
          </div>

          {mediatorState && (
            <pre className="bg-gray-100 p-3 rounded-lg text-sm overflow-auto max-h-64">
              {JSON.stringify(mediatorState, null, 2)}
            </pre>
          )}
        </div>



        {!showCompose ? (
          

          <div className="text-center py-12">
            <button
              onClick={() => setShowCompose(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors inline-flex items-center gap-2"
            >
              <Mail className="w-5 h-5" />
              New Message
            </button>
          </div>
          
        ) : (
          
          <div className="bg-white rounded-lg shadow-lg">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">New Message</h2>
              <button onClick={() => setShowCompose(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4 relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">To</label>
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCcBcc(prev => !prev)}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {showCcBcc ? 'Hide CC/BCC' : 'Add CC/BCC'}
                  </button>
                </div>

                <input
                  type="text"
                  value={toField}
                  onChange={(e) => setToField(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter recipient name or email"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />

                {showCcBcc && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      CC
                    </label>
                    <input
                      type="text"
                      value={ccField}
                      onChange={(e) => setCcField(e.target.value)}
                      placeholder="Enter CC recipients"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      BCC
                    </label>
                    <input
                      type="text"
                      value={bccField}
                      onChange={(e) => setBccField(e.target.value)}
                      placeholder="Enter BCC recipients"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </>
              )}

                
                {suggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {suggestions.map((contact, index) => (
                      <div
                        key={contact.email}
                        onClick={() => selectSuggestion(contact)}
                        className={`px-4 py-3 cursor-pointer transition-colors ${
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

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter subject"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Compose your email..."
                  rows={10}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSend}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-2 px-6 rounded-lg transition-colors inline-flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {loading ? 'Sending...' : 'Send'}
                </button>
                <button
                  onClick={() => setShowCompose(false)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-6 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

        )}
      </main>
    </div>
  );
};

export default GmailComposeApp;