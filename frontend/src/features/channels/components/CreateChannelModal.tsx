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
      <div className="p-4">
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 text-gray-700">
              Channel Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border rounded focus:outline-none focus:border-primary text-black"
              placeholder="e.g. general"
              required
            />
          </div>
          <div className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Private Channel</span>
            </label>
          </div>
          {error && (
            <div className="text-red-500 text-sm mb-4">{error}</div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}; 