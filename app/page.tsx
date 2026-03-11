'use client';
import { useState, useEffect, useRef } from 'react';
import { VoiceOrb } from '@/components/VoiceOrb';
import { ChapterSidebar } from '@/components/ChapterSidebar';
import { TextInputBar } from '@/components/TextInputBar';
import { supabase } from '@/lib/supabase/client';
import { connectToRealtime, buildSystemPrompt, RealtimeConnection, TurnMessage } from '@/lib/realtime';
import { Chapter, OrbState } from '@/types';
import { Pause, X } from 'lucide-react';

export default function Home() {
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const messagesRef = useRef<TurnMessage[]>([]);

  useEffect(() => {
    supabase
      .from('chapters')
      .select('*')
      .order('display_order')
      .then(({ data, error }) => {
        if (error) console.error('Failed to load chapters:', error.message);
        if (data) setChapters(data);
      });
  }, []);

  const handleOrbClick = async () => {
    if (isSessionActive) return;
    setOrbState('thinking');

    try {
      // Fetch heritage summaries and recent session summaries for system prompt
      const [{ data: docs }, { data: transcripts }] = await Promise.all([
        supabase.from('heritage_docs').select('summary_text'),
        supabase
          .from('transcripts')
          .select('session_summary')
          .not('session_summary', 'is', null)
          .order('created_at', { ascending: false })
          .limit(3),
      ]);

      const heritageSummary =
        docs?.map((d) => d.summary_text).filter(Boolean).join('\n') ?? null;
      const sessionSummaries =
        transcripts?.map((t) => t.session_summary as string).filter(Boolean) ?? [];
      const chapterTitle =
        chapters.find((c) => c.id === selectedChapterId)?.title_ru ?? null;

      const systemPrompt = buildSystemPrompt({ chapterTitle, heritageSummary, sessionSummaries });

      // Get ephemeral token + create session record
      const tokenRes = await fetch('/api/session-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: selectedChapterId }),
      });

      if (!tokenRes.ok) throw new Error('Failed to get session token');
      const { client_secret, session_id } = await tokenRes.json();
      setSessionId(session_id);
      messagesRef.current = [];

      // Connect WebRTC to OpenAI Realtime API
      const conn = await connectToRealtime(
        client_secret.value,
        systemPrompt,
        (event) => {
          // Drive orb animation from OpenAI events
          if (event.type === 'input_audio_buffer.speech_started') setOrbState('listening');
          if (event.type === 'response.created') setOrbState('thinking');
          if (event.type === 'response.audio.delta') setOrbState('speaking');
          if (event.type === 'response.audio.done') setOrbState('listening');

          // Capture user audio transcripts (arrives after speech ends)
          if (event.type === 'conversation.item.input_audio_transcription.completed') {
            const text = (event.transcript as string)?.trim();
            if (text) {
              messagesRef.current = [...messagesRef.current, { role: 'user', text }];
            }
          }

          // Capture assistant audio transcripts
          if (event.type === 'response.audio_transcript.done') {
            const text = (event.transcript as string)?.trim();
            if (text) {
              messagesRef.current = [...messagesRef.current, { role: 'assistant', text }];
            }
          }
        }
      );

      connectionRef.current = conn;
      setIsSessionActive(true);
      setOrbState('listening');
    } catch (err) {
      console.error('Failed to start session:', err);
      setOrbState('idle');
    }
  };

  const handlePause = async () => {
    connectionRef.current?.disconnect();
    connectionRef.current = null;
    setOrbState('idle');
    setIsSessionActive(false);

    if (sessionId) {
      await supabase
        .from('sessions')
        .update({ status: 'paused' })
        .eq('id', sessionId);
    }
  };

  const handleEnd = async () => {
    connectionRef.current?.disconnect();
    connectionRef.current = null;
    setOrbState('idle');
    setIsSessionActive(false);

    if (sessionId && messagesRef.current.length > 0) {
      // Fire-and-forget: trigger post-session pipeline
      fetch('/api/session-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, messages: messagesRef.current }),
      }).catch((err) => console.error('Session-end pipeline failed:', err));
    }

    setSessionId(null);
    messagesRef.current = [];
  };

  const handleSendText = (text: string) => {
    if (!connectionRef.current?.dc || connectionRef.current.dc.readyState !== 'open') return;

    connectionRef.current.dc.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      })
    );
    connectionRef.current.dc.send(JSON.stringify({ type: 'response.create' }));

    // Track in messages ref
    messagesRef.current = [...messagesRef.current, { role: 'user', text }];
  };

  const handleAttach = async (files: FileList) => {
    if (!sessionId) return;

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', sessionId);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        console.error('Upload failed for', file.name);
        continue;
      }

      // Notify the AI about the attachment via data channel
      if (connectionRef.current?.dc?.readyState === 'open') {
        const caption = `Пользователь прикрепил файл: ${file.name}`;
        connectionRef.current.dc.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: caption }],
            },
          })
        );
        connectionRef.current.dc.send(JSON.stringify({ type: 'response.create' }));
        messagesRef.current = [...messagesRef.current, { role: 'user', text: caption }];
      }
    }
  };

  const selectedChapterTitle = chapters.find((c) => c.id === selectedChapterId)?.title_ru;

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
          onSendText={handleSendText}
          onAttach={handleAttach}
          isMicActive={isSessionActive}
          onToggleMic={handleOrbClick}
          disabled={false}
        />
      </div>
    </main>
  );
}
