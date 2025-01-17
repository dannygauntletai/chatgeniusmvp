import { useCallback, useState } from 'react';
import { Modal } from '../../shared/components/Modal';
import { useDropzone } from 'react-dropzone';
import { fileService } from '../../../services/file.service';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { useUser } from '@clerk/clerk-react';

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
}

export const FileUploadModal = ({ isOpen, onClose, channelId }: FileUploadModalProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useUser();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
    setError(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({ 
    onDrop,
    noClick: true
  });

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    open();
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select at least one file to upload');
      return;
    }

    if (!user?.id) {
      setError('Please sign in to upload files');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      
      // Upload files one by one, let backend handle public bucket if no channelId
      await Promise.all(files.map(file => 
        fileService.uploadFile(file, channelId || undefined)
      ));
      
      setFiles([]);
      onClose();
    } catch (err) {
      console.error('Error uploading files:', err);
      setError('Failed to upload files. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upload Files">
      <div className="p-6">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-6 text-center ${
            isDragActive ? 'border-blue-500 bg-blue-50 bg-opacity-10' : 'border-gray-600'
          }`}
        >
          <input {...getInputProps()} />
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="mt-2 text-gray-300">
            {isDragActive ? (
              'Drop the files here...'
            ) : (
              <>
                Drag and drop files here, or{' '}
                <button
                  type="button"
                  className="text-blue-500 hover:text-blue-400"
                  onClick={handleSelectClick}
                >
                  browse
                </button>
              </>
            )}
          </p>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-gray-700 rounded"
              >
                <span className="text-sm truncate flex-1">{file.name}</span>
                <button
                  onClick={() => removeFile(index)}
                  className="ml-2 text-gray-400 hover:text-white"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={isUploading || files.length === 0}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isUploading ? (
              <>
                <LoadingSpinner className="w-4 h-4 mr-2" />
                Uploading...
              </>
            ) : (
              'Upload'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default FileUploadModal; 