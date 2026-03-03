'use client';
import { useState, useEffect } from 'react';
import { VoiceOrb } from '@/components/VoiceOrb';
import { ChapterSidebar } from '@/components/ChapterSidebar';
import { TextInputBar } from '@/components/TextInputBar';
import { supabase } from '@/lib/supabase/client';
import { Chapter, OrbState } from '@/types';
import { Pause, X } from 'lucide-react';

export default function Home() {
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);

  useEffect(() => {
    supabase
      .from('chapters')
      .select('*')
      .order('display_order')
      .then(({ data }) => data && setChapters(data));
  }, []);

  const handleOrbClick = () => {
    if (!isSessionActive) {
      setIsSessionActive(true);
      setOrbState('listening');
      // TODO Task 4: connect to OpenAI Realtime API
    }
  };

  const handlePause = () => {
    setOrbState('idle');
    setIsSessionActive(false);
    // TODO Task 4: pause session
  };

  const handleEnd = () => {
    setOrbState('idle');
    setIsSessionActive(false);
    // TODO Task 4: end session + trigger pipeline
  };

  const selectedChapterTitle = chapters.find(c => c.id === selectedChapterId)?.title_ru;

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-between relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-950/40 via-zinc-950 to-zinc-950 pointer-events-none" />

      <div className="relative w-full flex items-center p-4 gap-3">
        <ChapterSidebar
          chapters={chapters}
          completedIds={new Set()}
          selectedId={selectedChapterId}
          onSelect={setSelectedChapterId}
        />
        {selectedChapterTitle && (
          <span className="text-white/50 text-sm truncate">{selectedChapterTitle}</span>
        )}
      </div>

      <div className="relative flex flex-col items-center gap-12">
        <VoiceOrb state={orbState} onClick={handleOrbClick} />

        {isSessionActive && (
          <div className="flex gap-8">
            <button
              onClick={handlePause}
              className="flex flex-col items-center gap-2 text-white/60 hover:text-white transition-colors"
            >
              <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                <Pause className="w-6 h-6" />
              </div>
              <span className="text-xs">Пауза</span>
            </button>
            <button
              onClick={handleEnd}
              className="flex flex-col items-center gap-2 text-white/60 hover:text-white transition-colors"
            >
              <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                <X className="w-6 h-6" />
              </div>
              <span className="text-xs">Завершить</span>
            </button>
          </div>
        )}
      </div>

      <div className="relative w-full max-w-lg px-4 pb-8">
        <TextInputBar
          onSendText={(t) => console.log('text:', t)}
          onAttach={(f) => console.log('files:', f)}
          isMicActive={isSessionActive}
          onToggleMic={handleOrbClick}
          disabled={false}
        />
      </div>
    </main>
  );
}
