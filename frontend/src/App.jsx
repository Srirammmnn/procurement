import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SignInButton, SignUpButton, useAuth } from '@clerk/clerk-react';
import { Eye, EyeOff } from 'lucide-react';
import Dashboard from './pages/Dashboard';

function App() {
  const { isLoaded, isSignedIn, signOut, getToken } = useAuth();
  const [dbUser, setDbUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Local login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [isLocalMode, setIsLocalMode] = useState(true);

  // Sync / load session
  useEffect(() => {
    const syncSession = async () => {
      try {
        if (isSignedIn) {
          const token = await getToken();
          if (token) {
            localStorage.setItem('token', token);
            const response = await fetch('http://localhost:8000/api/v1/auth/me', {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            if (response.ok) {
              const data = await response.json();
              setDbUser(data);
              setAuthLoading(false);
              return;
            } else {
              console.error("Clerk session backend sync failed");
            }
          }
        }

        // Fallback: check for local database token
        const localToken = localStorage.getItem('token');
        if (localToken) {
          const response = await fetch('http://localhost:8000/api/v1/auth/me', {
            headers: {
              'Authorization': `Bearer ${localToken}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            setDbUser(data);
          } else {
            console.error("Local token validation failed");
            localStorage.removeItem('token');
            setDbUser(null);
          }
        } else {
          setDbUser(null);
        }
      } catch (err) {
        console.error("Error syncing session:", err);
      } finally {
        setAuthLoading(false);
      }
    };

    if (isLoaded) {
      syncSession();
    }
  }, [isLoaded, isSignedIn, getToken]);

  const handleLocalLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setAuthLoading(true);
    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.access_token);
        
        // Fetch profile
        const profileResponse = await fetch('http://localhost:8000/api/v1/auth/me', {
          headers: {
            'Authorization': `Bearer ${data.access_token}`
          }
        });
        
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          setDbUser(profileData);
        } else {
          setError('Failed to load user profile after login.');
          localStorage.removeItem('token');
        }
      } else {
        const errData = await response.json();
        setError(errData.detail || 'Invalid email or password.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection failed. Please check if backend is running.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    setAuthLoading(true);
    localStorage.removeItem('token');
    setDbUser(null);
    if (isSignedIn) {
      await signOut();
    }
    setAuthLoading(false);
  };

  if (!isLoaded || (authLoading && !dbUser)) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0a0a0f',
        color: '#ffffff',
        fontFamily: 'system-ui'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ marginBottom: '1rem' }}>Loading secure session...</div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            dbUser ? (
              <Navigate to="/" replace />
            ) : (
              <div className="auth-container animate-in">
                <div className="glass-panel auth-card">
                  <div className="auth-header">
                    <h1>Welcome to ProcureHub</h1>
                    <p>Access the Procurement Management System</p>
                  </div>

                  {/* Tab Selector */}
                  <div style={{
                    display: 'flex',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '12px',
                    padding: '4px',
                    border: '1px solid var(--glass-border)'
                  }}>
                    <button
                      type="button"
                      className="btn"
                      style={{
                        flex: 1,
                        background: isLocalMode ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' : 'transparent',
                        color: '#fff',
                        borderRadius: '8px',
                        padding: '8px'
                      }}
                      onClick={() => setIsLocalMode(true)}
                    >
                      Database Login
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{
                        flex: 1,
                        background: !isLocalMode ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' : 'transparent',
                        color: '#fff',
                        borderRadius: '8px',
                        padding: '8px'
                      }}
                      onClick={() => setIsLocalMode(false)}
                    >
                      Clerk SSO
                    </button>
                  </div>

                  {isLocalMode ? (
                    <form onSubmit={handleLocalLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {error && (
                        <div style={{
                          color: 'var(--accent-danger)',
                          fontSize: '0.9rem',
                          background: 'rgba(239, 68, 68, 0.1)',
                          padding: '12px',
                          borderRadius: '12px',
                          border: '1px solid rgba(239, 68, 68, 0.2)'
                        }}>
                          {error}
                        </div>
                      )}
                      
                      <div className="form-group">
                        <label>Email Address</label>
                        <input
                          type="email"
                          className="input-field"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="admin@company.com"
                        />
                      </div>

                      <div className="form-group">
                        <label>Password</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            className="input-field"
                            style={{ paddingRight: '44px' }}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            style={{
                              position: 'absolute',
                              right: '12px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '4px'
                            }}
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>

                      <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }}>
                        Sign In with Password
                      </button>
                    </form>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center' }}>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                        Use Single Sign-On to authenticate securely via Clerk SSO
                      </p>
                      <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '8px' }}>
                        <SignInButton mode="modal">
                          <button className="btn btn-primary" style={{ flex: 1 }}>Sign In</button>
                        </SignInButton>
                        <SignUpButton mode="modal">
                          <button className="btn btn-outline" style={{ flex: 1 }}>Sign Up</button>
                        </SignUpButton>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          }
        />
        <Route
          path="/*"
          element={
            dbUser ? (
              <Dashboard user={dbUser} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
