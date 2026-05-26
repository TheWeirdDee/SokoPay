import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col w-full mb-4">
        {label && <label className="mb-1 text-sm font-semibold text-text-muted">{label}</label>}
        <input
          ref={ref}
          className={`px-4 py-3 bg-bg-card border-2 outline-none rounded-md transition-colors 
            ${error ? 'border-error' : 'border-border focus:border-accent'}
            ${className}`}
          {...props}
        />
        {error && <span className="text-error text-xs mt-1 font-semibold">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
