import React, { useState } from 'react';

export default function Avatar({ src, name, size = "w-8 h-8", className = "" }) {
  const [hasError, setHasError] = useState(false);

  const getInitials = (str) => {
    if (!str) return 'U';
    const parts = str.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return str.substring(0, 2).toUpperCase();
  };

  if (!src || hasError) {
    return (
      <div
        className={`${size} rounded-full bg-gradient-to-tr from-indigo-600 to-amber-500 text-white font-bold text-xs flex items-center justify-center shrink-0 ring-1 ring-white/20 select-none ${className}`}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name || 'User'}
      onError={() => setHasError(true)}
      className={`${size} rounded-full object-cover shrink-0 select-none ${className}`}
    />
  );
}
