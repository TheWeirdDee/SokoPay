import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  isLoading?: boolean;
}

export function Button({ variant = 'primary', isLoading, children, className = '', ...props }: ButtonProps) {
  const baseStyle = "w-full py-3 px-4 rounded-md font-display font-semibold transition-all duration-200 flex items-center justify-center";
  
  const variants = {
    primary: "bg-accent text-text-light hover:bg-accent-hover shadow-hover hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none",
    secondary: "bg-secondary text-text-light hover:opacity-90 shadow-hover hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none",
    outline: "border-2 border-border text-text hover:border-accent bg-transparent"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin h-5 w-5 mr-2 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : null}
      {children}
    </button>
  );
}
