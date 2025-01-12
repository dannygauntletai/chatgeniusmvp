interface LoadingSpinnerProps {
  className?: string;
}

export const LoadingSpinner = ({ className = "h-8 w-8" }: LoadingSpinnerProps) => {
  return (
    <div className="flex justify-center items-center">
      <div className={`animate-spin rounded-full border-b-2 border-white ${className}`}></div>
    </div>
  );
}; 