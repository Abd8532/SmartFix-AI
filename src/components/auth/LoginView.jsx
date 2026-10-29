import React, { useState } from 'react';
import { Mail, Lock, User, Wrench, ShieldCheck, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTickets } from '../../context/TicketContext';

// Admin Auth Validation Login & Registration Portal
export default function LoginView({ onLogin }) {
  const { login, register } = useAuth();
  const { addToast } = useTickets();

  const [isSignUp, setIsSignUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formData, setFormData] = useState({
    name: 'Alex Rivera',
    email: 'alex@campus.edu',
    password: 'password123',
    role: 'user'
  });

  const handleRoleSelect = (roleKey) => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!isSignUp) {
      // In Login mode, auto-fill standard credentials for the selected role for seamless switching
      if (roleKey === 'admin') {
        setFormData({
          name: 'Master Administrator',
          email: 'admin@campus.edu',
          password: 'admin123',
          role: 'admin'
        });
      } else if (roleKey === 'technician') {
        setFormData({
          name: 'Marcus Vance',
          email: 'tech@campus.edu',
          password: 'password123',
          role: 'technician'
        });
      } else {
        setFormData({
          name: 'Alex Rivera',
          email: 'alex@campus.edu',
          password: 'password123',
          role: 'user'
        });
      }
    } else {
      // In Sign-up mode, update selected registration role
      setFormData((prev) => ({
        ...prev,
        role: roleKey
      }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (isSignUp) {
      // 1. REGISTRATION: Conditional approval based on selected role
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

      // If registered as admin -> automatically approved!
      if (formData.role === 'admin') {
        setSuccessMessage('Administrator account created and automatically approved! You can now log in.');
        addToast({
          type: 'success',
          title: 'Admin Registered & Approved',
          message: 'Welcome! Your administrator account is ready. Please log in.'
        });
      } else {
        // user or technician -> pending approval
        setSuccessMessage('Account created successfully. Please wait for an Administrator to approve your account before logging in.');
        addToast({
          type: 'info',
          title: 'Registration Pending Approval',
          message: 'Account created. Please wait for an Administrator to approve your account.'
        });
      }

      setFormData((prev) => ({ ...prev, password: '' }));
      setIsSignUp(false); // Switch to login view with success banner
    } else {
      // 2. LOGIN: Strictly verified against approvalStatus === 'Approved'
      const result = login(formData.email, formData.password);

      if (!result.success) {
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
            <span>Admin Auth Validation</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">SmartFixFlow - AI</h1>
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
          
          {/* Role Selector: User, Technician, and Admin */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
              {isSignUp ? 'I am registering as' : 'Choose Role / Account Type'}
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-100 border border-slate-200/90">
              <button
                type="button"
                onClick={() => handleRoleSelect('user')}
                className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  formData.role === 'user'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold ring-1 ring-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-3.5 h-3.5 text-slate-700" />
                <span>User</span>
              </button>

              <button
                type="button"
                onClick={() => handleRoleSelect('technician')}
                className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  formData.role === 'technician'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold ring-1 ring-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Wrench className="w-3.5 h-3.5 text-amber-600" />
                <span>Technician</span>
              </button>

              <button
                type="button"
                onClick={() => handleRoleSelect('admin')}
                className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  formData.role === 'admin'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold ring-1 ring-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>Admin</span>
              </button>
            </div>

            {isSignUp && (
              formData.role === 'admin' ? (
                <p className="text-[11px] text-emerald-800 mt-2 bg-emerald-50 p-2 rounded-xl border border-emerald-200/80 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>⚡ <strong>Auto-Approved:</strong> Admin accounts are immediately approved and granted management access.</span>
                </p>
              ) : (
                <p className="text-[11px] text-amber-700 mt-2 bg-amber-50 p-2 rounded-xl border border-amber-200/80">
                  🔒 <strong>Strict Admin Gating:</strong> New accounts will require verification from an Administrator before you can log in.
                </p>
              )
            )}
          </div>

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

          <button
            type="submit"
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors mt-3 shadow-2xs active:scale-[0.99]"
          >
            <span>{isSignUp ? (formData.role === 'admin' ? 'Create Administrator Account' : 'Request Account Approval') : 'Log In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-slate-600">
          {isSignUp ? "Already have an account? " : "New to SmartFixFlow - AI? "}
          <button 
            type="button"
            onClick={() => {
              const nextIsSignUp = !isSignUp;
              setIsSignUp(nextIsSignUp);
              setErrorMessage('');
              setSuccessMessage('');
              setFormData({ 
                name: '', 
                email: '', 
                password: '', 
                role: 'user' 
              });
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
