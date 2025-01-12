import React from 'react';
import { useThread as useThreadData } from '../../../hooks/useThread';
import { useThread as useThreadUI } from '../context';
import { MessageItem } from '../../messages/components/MessageItem';
import { MessageInput } from '../../messages/components/MessageInput';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { EmptyState } from '../../shared/components/EmptyState';
import { Message } from '../../messages/types/message.types';

interface ThreadViewProps {
  parentMessageId: string;
  parentMessage: Message;
  onClose?: () => void;
}

export const ThreadView: React.FC<ThreadViewProps> = ({ parentMessageId, parentMessage, onClose }) => {
  const { activeThread, isLoading, error, createThreadMessage, loadThreadMessages } = useThreadData(parentMessageId, true, parentMessage);
  const { closeThread } = useThreadUI();

  const handleSendReply = async (content: string) => {
    await createThreadMessage({
      content,
      parentMessageId
    });
  };

  const handleClose = () => {
    if (onClose) onClose();
    closeThread();
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-2">
        <LoadingSpinner />
        <p className="text-gray-400 text-sm">Loading thread messages...</p>
        <p className="text-gray-500 text-xs">This might take a moment</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Thread</h2>
          {onClose && (
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-white"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center space-y-3">
          <p className="text-gray-400">Unable to load thread.</p>
          <button
            onClick={() => loadThreadMessages()}
            className="text-[#246FE0] hover:text-blue-400"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!activeThread) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState message="Thread not found" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">Thread</h2>
        {onClose && (
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-gray-700">
          <MessageItem message={parentMessage} isThreadParent />
        </div>

        <div className="">
          {activeThread.replies.map(reply => (
            <MessageItem key={reply.id} message={reply} />
          ))}
        </div>
      </div>

      <div className="pb-4 border-t border-gray-700">
        <MessageInput onSend={handleSendReply} placeholder="Reply to thread..." />
      </div>
    </div>
  );
}; 