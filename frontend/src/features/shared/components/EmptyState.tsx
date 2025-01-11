interface EmptyStateProps {
  message: string;
}

export const EmptyState = ({ message }: EmptyStateProps) => (
  <div className="flex justify-center items-center h-full text-gray-500">
    {message}
  </div>
); 