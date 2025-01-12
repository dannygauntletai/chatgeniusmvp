import { useEffect } from 'react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { Modal } from '../../shared/components/Modal';
import { UserService } from '../../../services/user.service';

interface UserStatusModalProps {
  onClose: () => void;
  onSelect: (status: string) => void;
}

export const UserStatusModal = ({ onClose, onSelect }: UserStatusModalProps) => {
  const handleSelect = async (emoji: { native: string }) => {
    try {
      await UserService.updateUserStatus(emoji.native);
      onSelect(emoji.native);
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Set Your Status">
      <div className="inline-block">
        <Picker
          data={data}
          onEmojiSelect={handleSelect}
          theme="dark"
          set="native"
        />
      </div>
    </Modal>
  );
}; 