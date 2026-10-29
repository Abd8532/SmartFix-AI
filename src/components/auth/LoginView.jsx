import React, { useState } from 'react';
import { Mail, Lock, User, Wrench, ShieldCheck, ArrowRight, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTickets } from '../../context/TicketContext';

// Antigravity Auth Validation Login & Registration Portal
export default function LoginView({ onLogin }) {
  const { login, register } = useAuth();
  const { addToast } = useTickets();

  const [isSignUp, setIsSignUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user' // Default role for new sign-ups
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (isSignUp) {
      // 1. REGISTRATION: Register with strict 'Pending' status
      const result = register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role
      });

      if (!result.success) {
        setErrorMessage(result.error);
        return;
      }

      // Success message requested by user
      setSuccessMessage('Account created successfully. Please wait for an Administrator to approve your account before logging in.');
      setFormData((prev) => ({ ...prev, password: '' }));
      setIsSignUp(false); // Switch to login view with success banner

      addToast({
        type: 'info',
        title: 'Registration Pending Approval',
        message: 'Account created. Please wait for an Administrator to approve your account.'
      });
    } else {
      // 2. LOGIN: Strictly verified against approvalStatus === 'Approved'
      const result = login(formData.email, formData.password);

      if (!result.success) {
        // Displays exact message: 'Access Denied: Your account is still pending admin approval.'
        setErrorMessage(result.error);
        addToast({
          type: 'error',
          title: result.status === 'Pending' ? 'Approval Required' : 'Login Failed',
          message: result.error
        });
        return;
      }

      // Login approved & granted!
      if (typeof onLogin === 'function') {
        onLogin(result.user);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl border border-gray-100 p-8">
        
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200/90 text-slate-700 text-xs font-semibold mb-3">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Antigravity Auth Validation</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">FixFlow AI</h1>
          <p className="text-slate-500 text-sm">
            {isSignUp ? 'Create an account to request campus maintenance portal access' : 'Sign in to access your campus maintenance dashboard'}
          </p>
        </div>

        {/* Success Alert Banner (e.g. after registration awaiting approval) */}
        {successMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-3 animate-slide-up">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-emerald-900">Registration Submitted</p>
              <p className="mt-1 leading-relaxed">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Error Alert Banner (e.g. blocked due to Pending or Rejected status) */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-3 animate-slide-up">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-rose-900">Access Restricted</p>
              <p className="mt-1 leading-relaxed font-medium">{errorMessage}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Only show Name field if they are signing up */}
          {isSignUp && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="block w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl focus:ring-1 focus:ring-slate-900 focus:border-slate-900 outline-none bg-white shadow-2xs"
                  placeholder="Alex Rivera"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Email Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="block w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl focus:ring-1 focus:ring-slate-900 focus:border-slate-900 outline-none bg-white shadow-2xs"
                placeholder="alex@campus.edu"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                className="block w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl focus:ring-1 focus:ring-slate-900 focus:border-slate-900 outline-none bg-white shadow-2xs"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Only show Role Selection if they are signing up */}
          {isSignUp && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">I am requesting access as...</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({...formData, role: 'user'})}
                  className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs transition-all ${
                    formData.role === 'user' 
                      ? 'border-slate-900 bg-slate-900 text-white font-bold shadow-2xs' 
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50 bg-white'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Campus User</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, role: 'technician'})}
                  className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs transition-all ${
                    formData.role === 'technician' 
                      ? 'border-slate-900 bg-slate-900 text-white font-bold shadow-2xs' 
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50 bg-white'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Field Technician</span>
                </button>
              </div>
              <p className="text-[11px] text-amber-700 mt-2 bg-amber-50 p-2.5 rounded-xl border border-amber-200/80">
                🔒 <strong>Strict Admin Gating:</strong> New accounts will require verification from an Administrator before you can log in.
              </p>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors mt-3 shadow-2xs active:scale-[0.99]"
          >
            <span>{isSignUp ? 'Request Account Approval' : 'Log In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Demo Credentials Quick Fill for Instant Testing */}
        <div className="mt-5 pt-4 border-t border-slate-100 text-[11px] text-slate-500 text-center">
          <p className="font-semibold text-slate-600 mb-2">Test Credentials Quick-Fill:</p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setFormData({ name: 'Alex Rivera', email: 'alex@campus.edu', password: 'password123', role: 'user' });
                setIsSignUp(false);
                setErrorMessage('');
                setSuccessMessage('');
              }}
              className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-medium border border-emerald-200"
            >
              ✓ Approved User
            </button>
            <button
              type="button"
              onClick={() => {
                setFormData({ name: 'Marcus Vance', email: 'tech@campus.edu', password: 'password123', role: 'technician' });
                setIsSignUp(false);
                setErrorMessage('');
                setSuccessMessage('');
              }}
              className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-medium border border-emerald-200"
            >
              ✓ Approved Tech
            </button>
            <button
              type="button"
              onClick={() => {
                setFormData({ name: 'Sarthak Chaudhary', email: 'admin@campus.edu', password: 'password123', role: 'admin' });
                setIsSignUp(false);
                setErrorMessage('');
                setSuccessMessage('');
              }}
              className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 hover:bg-indigo-100 font-medium border border-indigo-200"
            >
              ✓ Admin
            </button>
            <button
              type="button"
              onClick={() => {
                setFormData({ name: 'Jordan Taylor', email: 'jordan@campus.edu', password: 'password123', role: 'user' });
                setIsSignUp(false);
                setErrorMessage('');
                setSuccessMessage('');
              }}
              className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 font-medium border border-amber-200"
              title="Click to test pending approval restriction"
            >
              ⏳ Test Pending
            </button>
          </div>
        </div>

        <div className="mt-5 text-center text-xs text-slate-600">
          {isSignUp ? "Already have an account? " : "New to FixFlow AI? "}
          <button 
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMessage('');
              setSuccessMessage('');
              setFormData({ name: '', email: '', password: '', role: 'user' });
            }}
            className="font-bold text-sky-600 hover:text-sky-700 transition-colors ml-1"
          >
            {isSignUp ? 'Log in' : 'Request account approval'}
          </button>
        </div>

      </div>
    </div>
  );
}
