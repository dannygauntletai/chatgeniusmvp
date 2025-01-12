import { useState } from 'react';
import { UserStatusModal } from './UserStatusModal';
import { useAuth } from '@clerk/clerk-react';

export const UserStatusButton = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('😊');

  const handleStatusChange = (status: string) => {
    setCurrentStatus(status);
    setIsModalOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded flex items-center justify-center"
        title="Set your status"
      >
        <span className="text-base">{currentStatus}</span>
      </button>

      {isModalOpen && (
        <UserStatusModal
          onClose={() => setIsModalOpen(false)}
          onSelect={handleStatusChange}
        />
      )}
    </>
  );
}; 