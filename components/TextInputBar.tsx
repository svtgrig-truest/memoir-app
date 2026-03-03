'use client';
import { useState, useRef } from 'react';
import { Paperclip, Mic, MicOff, Send } from 'lucide-react';

interface Props {
  onSendText: (text: string) => void;
  onAttach: (files: FileList) => void;
  isMicActive: boolean;
  onToggleMic: () => void;
  disabled?: boolean;
}

export function TextInputBar({ onSendText, onAttach, isMicActive, onToggleMic, disabled }: Props) {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (!text.trim()) return;
    onSendText(text.trim());
    setText('');
  };

  return (
    <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-2xl px-4 py-3 border border-white/10">
      <input
        type="file"
        ref={fileRef}
        className="hidden"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt"
        onChange={(e) => e.target.files && onAttach(e.target.files)}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="text-white/50 hover:text-white transition-colors flex-shrink-0"
        disabled={disabled}
        aria-label="Прикрепить файл"
      >
        <Paperclip className="w-5 h-5" />
      </button>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
        placeholder="Напишите..."
        className="flex-1 bg-transparent text-white placeholder-white/30 outline-none text-base min-w-0"
        disabled={disabled}
      />
      {text.trim() ? (
        <button
          onClick={handleSend}
          className="text-blue-400 hover:text-blue-300 transition-colors flex-shrink-0"
          aria-label="Отправить"
        >
          <Send className="w-5 h-5" />
        </button>
      ) : (
        <button
          onClick={onToggleMic}
          className={`flex-shrink-0 transition-colors ${isMicActive ? 'text-blue-400' : 'text-white/50 hover:text-white'}`}
          aria-label={isMicActive ? 'Выключить микрофон' : 'Включить микрофон'}
        >
          {isMicActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>
      )}
    </div>
  );
}
