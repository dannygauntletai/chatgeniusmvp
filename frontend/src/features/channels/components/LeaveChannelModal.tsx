import { Modal } from '../../shared/components/Modal';
import { ChannelService } from '../../../services/channel.service';

interface LeaveChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  channelName: string;
  onLeave: () => void;
}

export const LeaveChannelModal = ({ isOpen, onClose, channelId, channelName, onLeave }: LeaveChannelModalProps) => {
  const handleLeave = async () => {
    try {
      await ChannelService.leaveChannel(channelId);
      onLeave();
      onClose();
    } catch (error) {
      console.error('Failed to leave channel:', error);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Leave Channel">
      <div className="p-4">
        <p className="text-gray-300 mb-6">
          Are you sure you want to leave <span className="text-white font-medium">#{channelName}</span>?
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleLeave}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Leave Channel
          </button>
        </div>
      </div>
    </Modal>
  );
}; 