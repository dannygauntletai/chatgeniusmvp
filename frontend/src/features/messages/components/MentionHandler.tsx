import React from 'react';

interface MentionHandlerProps {
  content: string;
  onMention: (type: string, query: string) => void;
  shouldProcess: boolean;
}

export const MentionHandler: React.FC<MentionHandlerProps> = ({
  content,
  onMention,
  shouldProcess,
}) => {
  // Only process mentions when shouldProcess is true
  if (shouldProcess && content.includes('@assistant')) {
    const query = content.replace('@assistant', '').trim();
    onMention('assistant', query);
  }

  return null; // This is a logic-only component
}; 