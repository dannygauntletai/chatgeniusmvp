import React from 'react';
import { Message } from '../types/message.types';
import { formatRelativeTime } from '../../../utils/date';
import { useThread } from '../../threads/context';

interface MessageItemProps {
  message: Message;
  isThreadParent?: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message, isThreadParent }) => {
  const { openThread } = useThread();

  const handleThreadClick = () => {
    openThread(message.id, message);
  };

  if (!message || !message.user) {
    return null;
  }

  return (
    <div className="group relative flex items-start space-x-3 py-4 px-4 hover:bg-gray-50">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
          <span className="text-sm font-medium text-gray-700">
            {message.user.username[0].toUpperCase()}
          </span>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-900">
              {message.user.username}
            </span>
            <span className="text-sm text-gray-500">
              {formatRelativeTime(new Date(message.createdAt))}
            </span>
          </div>
        </div>

        <div className="mt-1 text-sm text-gray-700">
          {message.content}
        </div>

        {!isThreadParent && (
          <div className="mt-2">
            <button
              onClick={handleThreadClick}
              className="inline-flex items-center p-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}; 