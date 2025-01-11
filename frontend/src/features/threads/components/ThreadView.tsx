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
  const { activeThread, isLoading, error, createThreadMessage } = useThreadData(parentMessageId, true);
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
    return <LoadingSpinner />;
  }

  if (error) {
    return <EmptyState message={error} />;
  }

  if (!activeThread) {
    return <EmptyState message="Thread not found" />;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Thread</h2>
        {onClose && (
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <span className="sr-only">Close thread</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
        <div className="flex flex-col h-full">
          <div>
            <MessageItem message={parentMessage} isThreadParent />
            <div className="border-b border-gray-200" />
          </div>
          
          {activeThread.replies.length > 0 ? (
            <div>
              {activeThread.replies.map((reply: Message) => (
                <MessageItem key={reply.id} message={reply} isThreadParent />
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-gray-500">No replies yet</div>
            </div>
          )}
        </div>
      </div>

      <div>
        <MessageInput 
          onSend={handleSendReply} 
          placeholder="Reply in thread..." 
          threadParentId={parentMessageId}
        />
      </div>
    </div>
  );
}; 