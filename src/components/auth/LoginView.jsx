import React, { useState, useEffect } from 'react';
import { Mail, Lock, User, Wrench, ShieldCheck, ArrowRight, CheckCircle2, ShieldAlert, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTickets } from '../../context/TicketContext';

export default function LoginView({ onLogin }) {
  const { login, register, allowAdminSignup } = useAuth();
  const { addToast } = useTickets();

  const [isSignUp, setIsSignUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user',
    specialty: 'Plumbing'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-reset role to 'user' if Admin registration was selected but is locked
  useEffect(() => {
    if (isSignUp && formData.role === 'admin' && !allowAdminSignup) {
      setFormData((prev) => ({ ...prev, role: 'user' }));
    }
  }, [isSignUp, allowAdminSignup, formData.role]);

  const handleRoleSelect = (roleKey) => {
    setErrorMessage('');
    setSuccessMessage('');

    if (isSignUp && roleKey === 'admin') {
      if (!allowAdminSignup) {
        setErrorMessage('Admin sign-up is disabled by the system administrator.');
        return;
      }
    }

    setFormData((prev) => ({
      ...prev,
      role: roleKey,
      specialty: roleKey === 'technician' ? (prev.specialty || 'Plumbing') : prev.specialty
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        // Dynamic Administrator Sign-Up validation
        if (formData.role === 'admin') {
          if (!allowAdminSignup) {
            setErrorMessage('Administrator registration is currently locked by system security settings.');
            setIsSubmitting(false);
            return;
          }
        }

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

        if (formData.role === 'admin') {
          setSuccessMessage('Administrator account created and approved. You can now log in immediately.');
          addToast({
            type: 'success',
            title: 'Admin Account Created',
            message: 'Administrator account provisioned. You can now log in immediately.'
          });
        } else {
          setSuccessMessage('Account created successfully. Please wait for an Administrator to approve your account before logging in.');
          addToast({
            type: 'info',
            title: 'Registration Pending Approval',
            message: 'Account created. Please wait for an Administrator to approve your account.'
          });
        }

        setFormData((prev) => ({ ...prev, password: '' }));
        setIsSignUp(false);
      } else {
        const result = await login(formData.email, formData.password, formData.role);

        if (!result.success) {
          setErrorMessage(result.error);
          addToast({
            type: 'error',
            title: result.status === 'Pending' ? 'Approval Required' : 'Access Denied',
            message: result.error
          });
          return;
        }

        if (typeof onLogin === 'function') {
          onLogin(result.user);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#131316] text-zinc-100">
      {/* Matte Dark Card */}
      <div className="max-w-md w-full bg-[#1c1c21] border border-[#2a2a32] rounded-2xl p-6 sm:p-8 relative z-10">
        
        {/* Brand Logo & Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>NeetCode Matte Dark Workspace</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
            FixFlow AI<span className="text-indigo-500">.</span>
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1 max-w-sm mx-auto">
            {isSignUp ? 'Request campus maintenance portal credentials' : 'Sign in to access your operations dashboard'}
          </p>
        </div>

        {/* Success Alert Banner */}
        {successMessage && (
          <div className="mb-5 p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-300">Registration Submitted</p>
              <p className="mt-0.5 text-emerald-400/90">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="mb-5 p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-300">Access Restricted</p>
              <p className="mt-0.5 text-rose-400/90">{errorMessage}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Role Selector Tabs */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              {isSignUp ? 'Registering as' : 'Choose Account Role'}
            </label>

            <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-[#24242b] border border-[#32323b]">
              <button
                type="button"
                onClick={() => handleRoleSelect('user')}
                className={`h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  formData.role === 'user'
                    ? 'bg-[#2e2e38] text-white font-semibold border border-[#3f3f4e] shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <User className="w-3.5 h-3.5 text-indigo-400" />
                <span>User</span>
              </button>

              <button
                type="button"
                onClick={() => handleRoleSelect('technician')}
                className={`h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  formData.role === 'technician'
                    ? 'bg-[#2e2e38] text-white font-semibold border border-[#3f3f4e] shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                <span>Tech</span>
              </button>

              {isSignUp && !allowAdminSignup ? (
                <button
                  type="button"
                  disabled
                  title="Admin sign-up is disabled by the system administrator."
                  className="h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 text-zinc-600 bg-[#1e1e24] border border-[#2a2a32] opacity-60 cursor-not-allowed"
                >
                  <Lock className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Admin</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleRoleSelect('admin')}
                  className={`h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                    formData.role === 'admin'
                      ? 'bg-[#2e2e38] text-white font-semibold border border-[#3f3f4e] shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Admin</span>
                </button>
              )}
            </div>

            {/* Admin Signup Dynamic Indicator */}
            {isSignUp && !allowAdminSignup && (
              <p className="text-[11px] text-zinc-400 mt-2 bg-[#24242b] border border-[#32323b] p-2.5 rounded-lg flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Admin sign-up is disabled by the system administrator.</span>
              </p>
            )}
          </div>

          {/* Technician Specialty Field (Sign-up only) */}
          {isSignUp && formData.role === 'technician' && (
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Department Specialty <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={formData.specialty || 'Plumbing'}
                onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                className="w-full h-10 px-3 text-xs bg-[#24242b] border border-[#32323b] text-white rounded-lg focus:outline-none focus:border-indigo-500 transition"
              >
                {['Plumbing', 'Electrical', 'HVAC', 'IT', 'General'].map((dept) => (
                  <option key={dept} value={dept} className="bg-[#1c1c21] text-white">
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Full Name (Sign-up only) */}
          {isSignUp && (
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Alex Rivera"
                  className="w-full h-10 pl-9 pr-3 text-xs bg-[#24242b] border border-[#32323b] text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>
          )}

          {/* Email Address */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="alex@campus.edu"
                className="w-full h-10 pl-9 pr-3 text-xs bg-[#24242b] border border-[#32323b] text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
                className="w-full h-10 pl-9 pr-3 text-xs bg-[#24242b] border border-[#32323b] text-white placeholder-zinc-500 rounded-lg focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          {/* Demo Credentials Box (Login Mode) */}
          {!isSignUp && (
            <div className="p-3 rounded-lg bg-[#24242b] border border-[#32323b] text-[11px] text-zinc-400 space-y-2">
              <p className="font-semibold text-zinc-300">Quick Test Credentials:</p>
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <div 
                  onClick={() => setFormData({ email: 'user@campus.edu', password: 'password', role: 'user', specialty: 'Plumbing' })}
                  className="bg-[#1c1c21] p-1.5 rounded border border-[#32323b] text-center hover:border-indigo-500 cursor-pointer transition"
                >
                  <span className="font-bold text-indigo-400 block">User</span>
                  <span className="truncate block text-zinc-300">user@campus.edu</span>
                </div>
                <div 
                  onClick={() => setFormData({ email: 'tech@campus.edu', password: 'password', role: 'technician', specialty: 'Plumbing' })}
                  className="bg-[#1c1c21] p-1.5 rounded border border-[#32323b] text-center hover:border-amber-400 cursor-pointer transition"
                >
                  <span className="font-bold text-amber-400 block">Tech</span>
                  <span className="truncate block text-zinc-300">tech@campus.edu</span>
                </div>
                <div 
                  onClick={() => setFormData({ email: 'admin@campus.edu', password: 'admin123', role: 'admin', specialty: 'Plumbing' })}
                  className="bg-[#1c1c21] p-1.5 rounded border border-[#32323b] text-center hover:border-emerald-400 cursor-pointer transition"
                >
                  <span className="font-bold text-emerald-400 block">Admin</span>
                  <span className="truncate block text-zinc-300">admin@campus.edu</span>
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full h-10 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition shadow-sm ${
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

        {/* Switch Login / Sign-up Mode */}
        <div className="mt-5 text-center text-xs text-zinc-400">
          {isSignUp ? 'Already registered? ' : 'New to FixFlow AI? '}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
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
            className="text-indigo-400 hover:text-indigo-300 font-semibold underline transition ml-1"
          >
            {isSignUp ? 'Log in' : 'Request account approval'}
          </button>
        </div>

      </div>
    </div>
  );
}
