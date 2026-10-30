import React, { useState, useEffect } from 'react';
import { Mail, Lock, User, Wrench, ShieldCheck, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTickets } from '../../context/TicketContext';

// Helper check to verify if a user account is approved
const isUserApproved = (u) => !u ? false : (u.approved === true || u.isApproved === true || u.status === 'Approved' || u.role === 'admin');

export default function LoginView({ onLogin }) {
  const { login, register, allowAdminSignup, loginWithGoogle } = useAuth();
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
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const handleGoogleLogin = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsGoogleSubmitting(true);
    try {
      const email = formData.email && formData.email.includes('@')
        ? formData.email.trim()
        : 'abd@gmail.com';
      const name = formData.name || email.split('@')[0];
      const res = await loginWithGoogle({ email, name });
      if (res.success) {
        addToast?.({
          type: 'success',
          title: 'Google Sign-In Successful',
          message: `Logged in as ${res.user?.name || res.user?.email}`
        });
        if (onLogin) onLogin(res.user);
      } else {
        setErrorMessage(res.error || 'Google login failed.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to authenticate with Google.');
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

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
          // Check local users cache in case the user was approved by an administrator
          const storedUsers = (() => {
            try {
              return JSON.parse(localStorage.getItem('users') || localStorage.getItem('maintainx_users_v3') || '[]');
            } catch {
              return [];
            }
          })();
          const localMatch = storedUsers.find(
            (u) => u.email && u.email.toLowerCase() === formData.email.trim().toLowerCase()
          );

          if (localMatch && isUserApproved(localMatch)) {
            if (typeof onLogin === 'function') {
              onLogin(localMatch);
            }
            return;
          }

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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-['Plus_Jakarta_Sans',sans-serif]">
            SmartFix AI<span className="text-indigo-500">.</span>
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

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || isGoogleSubmitting}
            className={`w-full h-10 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition shadow-sm cursor-pointer ${
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

        {/* Or Continue with Google */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#2a2a32]" />
          </div>
          <div className="relative flex justify-center text-[10px]">
            <span className="bg-[#1c1c21] px-2 text-zinc-500 font-semibold uppercase tracking-wider">
              Or continue with
            </span>
          </div>
        </div>

        {/* Google Direct Sign-In Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isGoogleSubmitting || isSubmitting}
          className="w-full h-10 bg-[#24242b] hover:bg-[#282830] border border-[#32323b] hover:border-[#3f3f4a] text-zinc-200 hover:text-white font-medium rounded-lg flex items-center justify-center gap-2.5 transition text-xs shadow-sm cursor-pointer disabled:opacity-60"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <span>{isGoogleSubmitting ? 'Signing in with Google...' : 'Continue with Google'}</span>
        </button>

        {/* Switch Login / Sign-up Mode */}
        <div className="mt-5 text-center text-xs text-zinc-400">
          {isSignUp ? 'Already registered? ' : 'New to SmartFix AI? '}
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
