import React, { useState } from 'react';
import { ReactionPicker } from './ReactionPicker';
import { MessageService } from '../../../services/message.service';
import { socket } from '../../../services/socket.service';
import { useUserContext } from '../../../contexts/UserContext';

interface Reaction {
  emoji: string;
  users: Array<{
    id: string;
    username: string;
  }>;
}

interface MessageReactionsProps {
  messageId: string;
  reactions: Record<string, Array<{ id: string; username: string }>>;
  onReactionAdd?: (messageId: string, emoji: string) => void;
  onReactionRemove?: (messageId: string, emoji: string) => void;
}

export const MessageReactions: React.FC<MessageReactionsProps> = ({
  messageId,
  reactions,
  onReactionAdd,
  onReactionRemove,
}) => {
  const { userId } = useUserContext();
  const [showPicker, setShowPicker] = useState(false);

  const handleReactionClick = async (emoji: string) => {
        const hasReacted = reactions[emoji]?.some(user => user.id === userId);
    
    if (hasReacted) {
            onReactionRemove?.(messageId, emoji);
    } else {
            onReactionAdd?.(messageId, emoji);
    }
  };

  const handleAddReaction = (emoji: string) => {
        onReactionAdd?.(messageId, emoji);
    setShowPicker(false);
  };

  return (
    <div className="relative flex items-center space-x-1">
      <div className="flex items-center space-x-1">
        {Object.entries(reactions).map(([emoji, users]) => (
          <button
            key={emoji}
            onClick={() => handleReactionClick(emoji)}
            className={`inline-flex items-center space-x-1 px-1.5 py-1.5 rounded-full text-xs
              ${users.some(user => user.id === 'currentUserId') 
                ? 'bg-primary/10 text-primary' 
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            title={users.map(u => u.username).join(', ')}
          >
            <span className="leading-none w-4 h-4 flex items-center justify-center">{emoji}</span>
            <span className="leading-none">{users.length}</span>
          </button>
        ))}
        
        <div className="relative">
          <button
            onClick={() => setShowPicker(true)}
            className="inline-flex items-center p-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {showPicker && (
            <ReactionPicker
              onSelect={handleAddReaction}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}; 