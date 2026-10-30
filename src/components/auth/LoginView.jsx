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
    name: 'Campus User',
    email: 'user@campus.edu',
    password: 'password',
    role: 'user',
    specialty: 'Plumbing'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

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
          password: 'password',
          role: 'technician',
          specialty: 'Plumbing'
        });
      } else {
        setFormData({
          name: 'Campus User',
          email: 'user@campus.edu',
          password: 'password',
          role: 'user',
          specialty: 'Plumbing'
        });
      }
    } else {
      // In Sign-up mode, update selected registration role
      setFormData((prev) => ({
        ...prev,
        role: roleKey,
        specialty: roleKey === 'technician' ? (prev.specialty || 'Plumbing') : prev.specialty
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        // 1. REGISTRATION: Conditional approval based on selected role via shared /api/register
        const result = await register({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          specialty: formData.role === 'technician' ? (formData.specialty || 'Plumbing') : null
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
        // 2. LOGIN: Strictly verified against shared server /api/login endpoint
        const result = await login(formData.email, formData.password, formData.role);

        if (!result.success) {
          setErrorMessage(result.error);
          addToast({
            type: 'error',
            title: result.status === 'Pending' ? 'Approval Required' : 'Domain Access Denied',
            message: result.error
          });
          return; // Prevent routing on validation failure
        }

        // Login approved & granted!
        if (typeof onLogin === 'function') {
          onLogin(result.user);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#F5F7FA] relative">
      {/* Modern Card with Layered Depth Elevation */}
      <div className="max-w-md w-full bg-white rounded-3xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05),_0_4px_16px_-4px_rgba(0,0,0,0.05)] border border-[#E6EFF5] p-6 sm:p-10 relative z-10 text-slate-900">
        
        {/* Main Hero Header: Center-Aligned Style */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#E7EDFF] border border-[#2D60FF]/20 text-[#2D60FF] text-xs font-bold mb-3 shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5 text-[#2D60FF]" />
            <span>Admin Auth Validation</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-2 font-['Plus_Jakarta_Sans']">
            SmartFixFlow <span className="text-[#2D60FF]">- AI</span>
          </h1>
          <p className="text-slate-500 text-sm max-w-sm mx-auto leading-relaxed font-medium">
            {isSignUp ? 'Create an account to request campus maintenance portal access' : 'Sign in to access your campus maintenance dashboard'}
          </p>
        </div>

        {/* Success Alert Banner */}
        {successMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-[#DCFAF8] border border-[#16DBCC]/30 text-[#16DBCC] text-xs flex items-start gap-3 animate-slide-up shadow-2xs">
            <CheckCircle2 className="w-5 h-5 text-[#16DBCC] shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-[#16DBCC]">Registration Submitted</p>
              <p className="mt-1 leading-relaxed text-[#16DBCC]/90 font-medium">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-[#FFE0EB] border border-[#FF4B4A]/30 text-[#FF4B4A] text-xs flex items-start gap-3 animate-slide-up shadow-2xs">
            <ShieldAlert className="w-5 h-5 text-[#FF4B4A] shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-[#FF4B4A]">Access Restricted</p>
              <p className="mt-1 leading-relaxed font-semibold text-[#FF4B4A]/90">{errorMessage}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Role Selector: User, Technician, and Admin */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-2 tracking-wider font-['Plus_Jakarta_Sans']">
              {isSignUp ? 'I am registering as' : 'Choose Role / Account Type'}
            </label>
            <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2]">
              <button
                type="button"
                onClick={() => handleRoleSelect('user')}
                className={`h-11 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1.5 ${
                  formData.role === 'user'
                    ? 'bg-white text-[#2D60FF] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] font-bold border border-[#DFEAF2]'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <User className="w-4 h-4" />
                <span>User</span>
              </button>

              <button
                type="button"
                onClick={() => handleRoleSelect('technician')}
                className={`h-11 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1.5 ${
                  formData.role === 'technician'
                    ? 'bg-white text-[#2D60FF] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] font-bold border border-[#DFEAF2]'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Wrench className="w-4 h-4" />
                <span>Technician</span>
              </button>

              <button
                type="button"
                onClick={() => handleRoleSelect('admin')}
                className={`h-11 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1.5 ${
                  formData.role === 'admin'
                    ? 'bg-white text-[#2D60FF] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] font-bold border border-[#DFEAF2]'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Admin</span>
              </button>
            </div>

            {isSignUp && (
              formData.role === 'admin' ? (
                <p className="text-xs text-[#16DBCC] mt-2 bg-[#DCFAF8] p-3 rounded-2xl border border-[#16DBCC]/30 flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-[#16DBCC] shrink-0" />
                  <span>⚡ <strong>Auto-Approved:</strong> Admin accounts are immediately approved and granted management access.</span>
                </p>
              ) : (
                <p className="text-xs text-[#FFBB38] mt-2 bg-[#FFF5D9] p-3 rounded-2xl border border-[#FFBB38]/30 font-medium">
                  🔒 <strong>Strict Admin Gating:</strong> New accounts will require verification from an Administrator before you can log in.
                </p>
              )
            )}
          </div>

          {/* Technician Specialization / Department Selection (Sign-Up Only) */}
          {isSignUp && formData.role === 'technician' && (
            <div className="animate-slide-up">
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 tracking-wider font-['Plus_Jakarta_Sans']">
                Field of Specialization / Department <span className="text-[#FF4B4A]">*</span>
              </label>
              <div className="relative">
                <select
                  required
                  value={formData.specialty || 'Plumbing'}
                  onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                  className="block w-full h-11 px-4 text-xs sm:text-sm border border-[#DFEAF2] rounded-2xl focus:ring-2 focus:ring-[#2D60FF]/20 focus:border-[#2D60FF] focus:bg-white outline-none bg-[#F5F7FA] text-slate-900 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)] font-semibold transition-all cursor-pointer"
                >
                  {['Plumbing', 'Electrical', 'HVAC', 'IT', 'General'].map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">
                Work orders assigned to this trade will route directly to your queue.
              </p>
            </div>
          )}

          {/* Only show Name field if they are signing up */}
          {isSignUp && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 tracking-wider font-['Plus_Jakarta_Sans']">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="block w-full h-11 pl-11 pr-4 text-xs sm:text-sm border border-[#DFEAF2] rounded-2xl focus:ring-2 focus:ring-[#2D60FF]/20 focus:border-[#2D60FF] focus:bg-white outline-none bg-[#F5F7FA] text-slate-900 placeholder-slate-400 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)] transition-all font-medium"
                  placeholder="Alex Rivera"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 tracking-wider font-['Plus_Jakarta_Sans']">Email Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="block w-full h-11 pl-11 pr-4 text-xs sm:text-sm border border-[#DFEAF2] rounded-2xl focus:ring-2 focus:ring-[#2D60FF]/20 focus:border-[#2D60FF] focus:bg-white outline-none bg-[#F5F7FA] text-slate-900 placeholder-slate-400 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)] transition-all font-medium"
                placeholder="alex@campus.edu"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 tracking-wider font-['Plus_Jakarta_Sans']">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                className="block w-full h-11 pl-11 pr-4 text-xs sm:text-sm border border-[#DFEAF2] rounded-2xl focus:ring-2 focus:ring-[#2D60FF]/20 focus:border-[#2D60FF] focus:bg-white outline-none bg-[#F5F7FA] text-slate-900 placeholder-slate-400 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.03)] transition-all font-medium"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Quick Universal Demo Access Note */}
          {!isSignUp && (
            <div className="p-3.5 rounded-2xl bg-[#F5F7FA] border border-[#DFEAF2] text-[11px] text-slate-600 font-medium space-y-1.5 animate-fade-in">
              <p className="font-bold text-slate-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#16DBCC]" />
                <span>Universal Pre-Seeded Accounts (Works across all devices):</span>
              </p>
              <div className="grid grid-cols-3 gap-1.5 text-[10px] pt-0.5">
                <div className="bg-white p-2 rounded-xl border border-[#E6EFF5] text-center shadow-2xs">
                  <span className="font-bold text-[#2D60FF] block">User</span>
                  <span className="truncate block font-semibold text-slate-700">user@campus.edu</span>
                  <span className="text-slate-400 block font-mono">password</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-[#E6EFF5] text-center shadow-2xs">
                  <span className="font-bold text-[#FFBB38] block">Technician</span>
                  <span className="truncate block font-semibold text-slate-700">tech@campus.edu</span>
                  <span className="text-slate-400 block font-mono">password</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-[#E6EFF5] text-center shadow-2xs">
                  <span className="font-bold text-[#16DBCC] block">Admin</span>
                  <span className="truncate block font-semibold text-slate-700">admin@campus.edu</span>
                  <span className="text-slate-400 block font-mono">admin123</span>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full h-12 min-h-[48px] bg-[#2D60FF] hover:bg-[#1814F3] text-white font-bold px-4 rounded-2xl flex items-center justify-center gap-2 transition-all duration-200 mt-4 shadow-lg shadow-[#2D60FF]/25 active:scale-[0.98] ${
              isSubmitting ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            <span>
              {isSubmitting
                ? 'Processing...'
                : isSignUp
                ? (formData.role === 'admin' ? 'Create Administrator Account' : 'Request Account Approval')
                : 'Log In'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500 font-medium">
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
                role: 'user',
                specialty: 'Plumbing'
              });
            }}
            className="font-bold text-[#2D60FF] hover:underline transition-colors ml-1"
          >
            {isSignUp ? 'Log in' : 'Request account approval'}
          </button>
        </div>

      </div>
    </div>
  );
}
