import { Modal } from '../../shared/components/Modal';
import { ChannelService } from '../../../services/channel.service';

interface DeleteChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  channelName: string;
  onDelete: () => void;
}

export const DeleteChannelModal = ({ isOpen, onClose, channelId, channelName, onDelete }: DeleteChannelModalProps) => {
  const handleDelete = async () => {
    try {
      await ChannelService.deleteChannel(channelId);
      onDelete();
      onClose();
    } catch (error) {
      console.error('Failed to delete channel:', error);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Channel">
      <div className="p-4">
        <p className="text-gray-300 mb-6">
          Are you sure you want to delete <span className="text-white font-medium">#{channelName}</span>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Delete Channel
          </button>
        </div>
      </div>
    </Modal>
  );
}; 