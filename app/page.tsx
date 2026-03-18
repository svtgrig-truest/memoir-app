'use client';
import { useState, useEffect, useRef } from 'react';
import { VoiceOrb } from '@/components/VoiceOrb';
import { connectToRealtime, RealtimeConnection, TurnMessage } from '@/lib/realtime';
import { Chapter, OrbState } from '@/types';
import { Pause, X, ImagePlus, CheckCircle2 } from 'lucide-react';

const orbLabels: Record<OrbState, string> = {
  idle: 'Нажмите, чтобы начать',
  listening: 'Слушаю вас...',
  speaking: 'Отвечаю...',
  thinking: 'Думаю...',
};

export default function Home() {
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [photoToast, setPhotoToast] = useState<string | null>(null);
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const messagesRef = useRef<TurnMessage[]>([]);
  const isConnectingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlChapterId = params.get('chapter');
    const autostart = params.get('autostart') === '1';
    fetch('/api/chapters')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.chapters ?? []);
        if (Array.isArray(list)) setChapters(list);
        // Pre-select: URL param takes priority, then last used chapter
        const resolvedChapterId = urlChapterId ?? data?.lastChapterId ?? null;
        setSelectedChapterId(resolvedChapterId);
        if (autostart) {
          // Small delay so React flushes the selectedChapterId state before we start
          setTimeout(() => startSession(resolvedChapterId), 300);
        }
      })
      .catch((err) => console.error('Failed to load chapters:', err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (msg: string) => {
    setPhotoToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setPhotoToast(null), 3000);
  };

  const startSession = async (chapterId: string | null) => {
    if (isSessionActive || isConnectingRef.current) return;
    isConnectingRef.current = true;
    setOrbState('thinking');
    setPhotoCount(0);

    try {
      const tokenRes = await fetch('/api/session-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapterId }),
      });

      if (!tokenRes.ok) throw new Error('Failed to get session token');
      const { client_secret, session_id, system_prompt } = await tokenRes.json();
      setSessionId(session_id);
      messagesRef.current = [];

      const conn = await connectToRealtime(
        client_secret.value,
        system_prompt,
        (event) => {
          if (event.type === 'input_audio_buffer.speech_started') setOrbState('listening');
          if (event.type === 'response.created') setOrbState('thinking');
          if (event.type === 'response.audio.delta') setOrbState('speaking');
          if (event.type === 'response.audio.done') setOrbState('listening');

          if (event.type === 'conversation.item.input_audio_transcription.completed') {
            const text = (event.transcript as string)?.trim();
            if (text) messagesRef.current = [...messagesRef.current, { role: 'user', text }];
          }

          if (event.type === 'response.audio_transcript.done') {
            const text = (event.transcript as string)?.trim();
            if (text) messagesRef.current = [...messagesRef.current, { role: 'assistant', text }];
          }

          if (!['response.audio.delta', 'input_audio_buffer.appended'].includes(event.type as string)) {
            console.log('[realtime event]', event.type);
          }
        }
      );

      connectionRef.current = conn;
      setIsSessionActive(true);
      setOrbState('listening');
    } catch (err) {
      console.error('Failed to start session:', err);
      setOrbState('idle');
    } finally {
      isConnectingRef.current = false;
    }
  };

  const handleOrbClick = () => startSession(selectedChapterId);

  const handlePause = async () => {
    connectionRef.current?.disconnect();
    connectionRef.current = null;
    setOrbState('idle');
    setIsSessionActive(false);

    if (sessionId) {
      fetch('/api/session-pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      }).catch((err) => console.error('Failed to pause session:', err));
    }
  };

  const handleEnd = async () => {
    connectionRef.current?.disconnect();
    connectionRef.current = null;
    setOrbState('idle');
    setIsSessionActive(false);

    if (sessionId) {
      fetch('/api/session-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, messages: messagesRef.current }),
      }).catch((err) => console.error('Session-end pipeline failed:', err));
    }

    setSessionId(null);
    messagesRef.current = [];
    setPhotoCount(0);
  };

  const handleAttach = async (files: FileList) => {
    if (!sessionId) return;

    let uploaded = 0;
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', sessionId);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        console.error('Upload failed for', file.name);
        continue;
      }

      uploaded++;

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

    if (uploaded > 0) {
      const newCount = photoCount + uploaded;
      setPhotoCount(newCount);
      showToast(uploaded === 1 ? 'Фото прикреплено к разговору' : `Прикреплено ${uploaded} файла`);
    }

    if (fileRef.current) fileRef.current.value = '';
  };

  const selectedChapterTitle = chapters.find((c) => c.id === selectedChapterId)?.title_ru;

  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Ambient background glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 100%, rgba(212,168,83,0.07) 0%, transparent 70%)',
        }}
      />

      {/* Centred content column */}
      <div className="relative flex flex-col min-h-screen w-full max-w-3xl mx-auto px-6 md:px-10">

        {/* Header */}
        <header className="flex items-center justify-between pt-8 pb-4">
          <span className="text-2xl font-semibold tracking-wide" style={{ color: 'var(--accent)' }}>
            Memoir
          </span>
          <div className="flex items-center gap-6">
            <a
              href="/archive"
              className="text-base transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              Мои записи →
            </a>
            <a
              href="/family/dashboard"
              className="text-base transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              Семейный архив →
            </a>
          </div>
        </header>

        {/* Chapter selector */}
        <section className="pt-6 pb-4">
          <p
            className="text-sm uppercase tracking-widest mb-4"
            style={{ color: 'var(--text-muted)' }}
          >
            Тема разговора
          </p>
          <div className="flex flex-wrap gap-3">
            <ChapterChip
              label="Свободный разговор"
              selected={selectedChapterId === null}
              disabled={isSessionActive}
              onClick={() => setSelectedChapterId(null)}
            />
            {chapters.map((ch) => (
              <ChapterChip
                key={ch.id}
                label={ch.title_ru}
                selected={selectedChapterId === ch.id}
                disabled={isSessionActive}
                onClick={() => setSelectedChapterId(ch.id)}
                href={isSessionActive ? undefined : `/archive/chapter/${ch.id}`}
              />
            ))}
          </div>
        </section>

        {/* Orb area */}
        <div className="flex-1 flex flex-col items-center justify-center gap-8 py-12">
          <VoiceOrb state={orbState} onClick={handleOrbClick} disabled={isSessionActive} />

          {/* State label */}
          <p
            className="text-lg tracking-wide transition-all duration-300"
            style={{ color: isSessionActive ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            {isSessionActive ? orbLabels[orbState] : orbLabels['idle']}
          </p>

          {/* Chapter label during session */}
          {isSessionActive && selectedChapterTitle && (
            <p className="text-base -mt-4" style={{ color: 'var(--text-muted)' }}>
              Тема: {selectedChapterTitle}
            </p>
          )}

          {/* Session controls */}
          {isSessionActive && (
            <div className="flex items-center gap-8 mt-2">
              <input
                type="file"
                ref={fileRef}
                className="hidden"
                multiple
                accept="image/*,.pdf,.doc,.docx,.txt"
                onChange={(e) => e.target.files && handleAttach(e.target.files)}
              />
              <SessionButton
                icon={
                  <div className="relative">
                    <ImagePlus className="w-6 h-6" />
                    {photoCount > 0 && (
                      <span
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium"
                        style={{ background: 'var(--accent)', color: '#0d0b09' }}
                      >
                        {photoCount}
                      </span>
                    )}
                  </div>
                }
                label="Фото"
                onClick={() => fileRef.current?.click()}
              />
              <SessionButton
                icon={<Pause className="w-6 h-6" />}
                label="Пауза"
                onClick={handlePause}
              />
              <SessionButton
                icon={<X className="w-6 h-6" />}
                label="Завершить"
                onClick={handleEnd}
                danger
              />
            </div>
          )}
        </div>

      </div>

      {/* Photo upload toast */}
      {photoToast && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-3 rounded-xl text-base shadow-lg"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--accent-border)',
            color: 'var(--accent)',
          }}
        >
          <CheckCircle2 className="w-5 h-5" />
          {photoToast}
        </div>
      )}
    </main>
  );
}

function ChapterChip({
  label,
  selected,
  disabled,
  onClick,
  href,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  href?: string;
}) {
  const style = {
    background: selected ? 'var(--accent-dim)' : 'rgba(255,255,255,0.04)',
    color: selected ? 'var(--accent)' : 'var(--text-muted)',
    border: `1px solid ${selected ? 'var(--accent-border)' : 'var(--border)'}`,
  };
  const className = 'flex-shrink-0 px-5 py-3 rounded-full text-base transition-all duration-200';

  if (href && !disabled) {
    return (
      <a href={href} className={className} style={style}>
        {label}
      </a>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${className} disabled:cursor-default`}
      style={style}
    >
      {label}
    </button>
  );
}

function SessionButton({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2"
      style={{ opacity: 0.7 }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center"
        style={{
          background: danger ? 'rgba(220,80,60,0.15)' : 'rgba(255,255,255,0.07)',
          border: `1px solid ${danger ? 'rgba(220,80,60,0.25)' : 'var(--border)'}`,
          color: danger ? '#e05040' : 'var(--text)',
        }}
      >
        {icon}
      </div>
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
    </button>
  );
}
