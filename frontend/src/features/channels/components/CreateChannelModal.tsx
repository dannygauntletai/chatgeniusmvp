import { useState } from 'react';
import { ChannelService } from '../../../services/channel.service';
import { Modal } from '../../shared/components/Modal';

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateChannelModal = ({ isOpen, onClose }: CreateChannelModalProps) => {
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await ChannelService.createChannel({ name, isPrivate });
      onClose();
    } catch (err) {
      setError('Failed to create channel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Channel">
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 bg-gray-900 text-white rounded border border-gray-700 focus:outline-none focus:border-blue-500"
            placeholder="Enter channel name..."
            required
          />
        </div>
        <div className="mb-6">
          <label className="flex items-center gap-2 text-gray-300">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded border-gray-700 bg-gray-900 text-blue-500 focus:ring-blue-500"
            />
            <span>Private Channel</span>
          </label>
        </div>
        {error && (
          <div className="text-red-500 text-sm mb-4">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Channel'}
          </button>
        </div>
      </form>
    </Modal>
  );
}; 