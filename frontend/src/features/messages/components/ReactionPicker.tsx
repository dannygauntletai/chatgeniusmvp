import React from 'react';
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export const ReactionPicker: React.FC<ReactionPickerProps> = ({ onSelect, onClose }) => {
  return (
    <div 
      className="fixed inset-0 flex items-center justify-center bg-black/20 z-50"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <Picker 
          data={data}
          onEmojiSelect={(emoji: any) => {
            onSelect(emoji.native);
            onClose();
          }}
          theme="light"
          previewPosition="none"
          skinTonePosition="none"
          maxFrequentRows={0}
        />
      </div>
    </div>
  );
}; 