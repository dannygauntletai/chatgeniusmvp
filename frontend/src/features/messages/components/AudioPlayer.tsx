import React, { useState, useRef, useEffect } from 'react';

interface AudioPlayerProps {
    url: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ url }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (audioRef.current) {
            const audio = audioRef.current;
            
            const handleLoadedMetadata = () => {
                setAudioDuration(audio.duration);
                setIsLoading(false);
            };
            
            const handleTimeUpdate = () => {
                setCurrentTime(audio.currentTime);
                setProgress((audio.currentTime / audio.duration) * 100);
            };
            
            const handleEnded = () => {
                setIsPlaying(false);
                setProgress(0);
                setCurrentTime(0);
            };

            const handleCanPlay = () => {
                setIsLoading(false);
            };

            const handleError = (e: ErrorEvent) => {
                console.error('Audio error:', e);
                setIsLoading(false);
            };
            
            audio.addEventListener('loadedmetadata', handleLoadedMetadata);
            audio.addEventListener('timeupdate', handleTimeUpdate);
            audio.addEventListener('ended', handleEnded);
            audio.addEventListener('canplay', handleCanPlay);
            audio.addEventListener('error', handleError);
            
            // Reset state when URL changes
            setIsPlaying(false);
            setProgress(0);
            setCurrentTime(0);
            setIsLoading(true);
            
            return () => {
                audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
                audio.removeEventListener('timeupdate', handleTimeUpdate);
                audio.removeEventListener('ended', handleEnded);
                audio.removeEventListener('canplay', handleCanPlay);
                audio.removeEventListener('error', handleError);
            };
        }
    }, [url]);

    const togglePlayPause = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play().catch(console.error);
            }
            setIsPlaying(!isPlaying);
        }
    };

    const formatTime = (seconds: number) => {
        if (!seconds || isNaN(seconds) || !isFinite(seconds)) {
            return '0:00';
        }
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex items-center space-x-3 p-2 bg-white rounded-lg border border-gray-200 w-[400px] shadow-sm">
            <button
                onClick={togglePlayPause}
                disabled={isLoading}
                className="w-8 h-8 flex items-center justify-center bg-[#246FE0] hover:bg-[#246FE0]/90 rounded-full text-white transition-colors shadow-sm disabled:opacity-50"
            >
                {isPlaying ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                    </svg>
                ) : (
                    <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                )}
            </button>

            <div className="flex-1 min-w-0">
                <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                        className="absolute h-full bg-[#246FE0] rounded-full transition-all duration-300 ease-in-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <div className="mt-1 text-xs text-gray-500">
                    {isLoading ? (
                        <span>Loading...</span>
                    ) : (
                        `${formatTime(currentTime)} / ${formatTime(audioDuration)}`
                    )}
                </div>
            </div>

            <audio ref={audioRef} src={url} preload="auto" />
        </div>
    );
}; 