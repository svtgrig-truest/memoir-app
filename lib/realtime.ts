export interface SystemPromptOptions {
  chapterTitle: string | null;
  heritageSummary: string | null;
  sessionSummaries: string[];
  lastChapterShortTitle?: string | null;
  lastChapterSummary?: string | null;
}

export interface TurnMessage {
  role: string;
  text: string;
}

export interface RealtimeConnection {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  stream: MediaStream;
  audioEl: HTMLAudioElement;
  disconnect: () => void;
}

export function buildSystemPrompt(opts: SystemPromptOptions): string {
  const { chapterTitle, heritageSummary, sessionSummaries, lastChapterShortTitle, lastChapterSummary } = opts;

  const chapterContext = chapterTitle
    ? `Цель текущей беседы: исследуй тему — «${chapterTitle}».`
    : 'Цель текущей беседы: следуй за тем, что хочет рассказать собеседник.';

  const heritageSection = heritageSummary
    ? `\n\nКонтекст семьи:\n${heritageSummary}`
    : '';

  const summarySection = sessionSummaries.length
    ? `\n\nПредыдущие беседы:\n${sessionSummaries.join('\n')}`
    : '';

  // Greeting instruction — context-aware
  let greetingSection: string;
  if (chapterTitle) {
    if (lastChapterSummary || lastChapterShortTitle) {
      const lastRef = lastChapterShortTitle
        ? `«${lastChapterShortTitle}»`
        : 'прошлом разговоре';
      greetingSection = `\n\nПОРЯДОК НАЧАЛА: Сразу начни беседу сам — не жди, когда заговорит собеседник. Поздоровайся: «Здравствуйте, Александр Григорьевич». Скажи, что в прошлый раз вы говорили о ${lastRef}${lastChapterSummary ? `, а именно: ${lastChapterSummary}` : ''}. Спроси, хотят ли они продолжить эту нить или рассказать что-то новое? Один вопрос.`;
    } else {
      greetingSection = `\n\nПОРЯДОК НАЧАЛА: Сразу начни беседу сам — не жди, когда заговорит собеседник. Поздоровайся: «Здравствуйте, Александр Григорьевич». Скажи, что сегодня начинаете разговор о теме «${chapterTitle}». Задай первый открытый вопрос — мягко, без давления. Один вопрос.`;
    }
  } else {
    greetingSection = `\n\nПОРЯДОК НАЧАЛА: Сразу начни беседу сам — не жди, когда заговорит собеседник. Поздоровайся: «Здравствуйте, Александр Григорьевич». Спроси, о чём сегодня хочется поговорить. Один вопрос.`;
  }

  return `Ты тёплый, любопытный, эмпатичный интервьюер, помогающий пожилому человеку записать историю его жизни. Говори только по-русски. Будь терпелив, внимателен и никогда не торопи собеседника.

Собеседника зовут Александр Григорьевич. Обращайся к нему на «вы». Имя-отчество используй естественно и редко — не чаще одного раза за несколько реплик, только когда это уместно. Никаких «дорогой», «уважаемый», «друг», «голубчик» и других фамильярных обращений.

Правила:
- Задавай только один вопрос за раз
- Активное слушание: отражай сказанное перед следующим вопросом
- Если тишина более 8 секунд, мягко спроси: «Расскажите подробнее...» или «Что вы помните об этом времени?»
- Если упоминается имя, место или событие — копай глубже
- Никогда не поправляй и не перебивай
- После примерно 40 минут мягко предложи завершить беседу

${chapterContext}${heritageSection}${summarySection}${greetingSection}`;
}

export async function connectToRealtime(
  ephemeralToken: string,
  systemPrompt: string,
  onEvent: (event: Record<string, unknown>) => void
): Promise<RealtimeConnection> {
  const pc = new RTCPeerConnection();

  // Audio output — must be in DOM for autoplay policy to work
  const audioEl = document.createElement('audio');
  audioEl.autoplay = true;
  audioEl.style.display = 'none';
  document.body.appendChild(audioEl);
  pc.ontrack = (e) => {
    audioEl.srcObject = e.streams[0];
  };

  // Microphone input
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc.addTrack(stream.getTracks()[0]);

  // Data channel for events
  const dc = pc.createDataChannel('oai-events');

  // Silence follow-up: if user doesn't speak within SILENCE_MS after AI finishes,
  // trigger another response so AI asks the next question itself.
  const SILENCE_MS = 8000;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  const clearSilenceTimer = () => {
    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
  };
  const scheduleSilenceFollowUp = () => {
    clearSilenceTimer();
    silenceTimer = setTimeout(() => {
      if (dc.readyState === 'open') {
        dc.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
        dc.send(JSON.stringify({ type: 'response.create' }));
      }
    }, SILENCE_MS);
  };

  dc.onopen = () => {
    // Configure the session with system prompt
    dc.send(JSON.stringify({
      type: 'session.update',
      session: {
        instructions: systemPrompt,
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          silence_duration_ms: 1200,
          threshold: 0.6,
          prefix_padding_ms: 300,
        },
      },
    }));

    // Trigger AI to speak first after session is configured.
    // Clear the audio buffer first to prevent mic noise accumulated during
    // WebRTC setup from triggering a spurious VAD response alongside ours.
    setTimeout(() => {
      if (dc.readyState !== 'open') return;
      dc.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
      dc.send(JSON.stringify({ type: 'response.create' }));
    }, 200);
  };
  dc.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data as string) as Record<string, unknown>;

      // Silence follow-up timer management
      if (event.type === 'response.audio.done') {
        // AI finished speaking — start the silence counter
        scheduleSilenceFollowUp();
      }
      if (
        event.type === 'input_audio_buffer.speech_started' ||
        event.type === 'response.created'
      ) {
        // User started speaking or AI is already generating — cancel follow-up
        clearSilenceTimer();
      }

      onEvent(event);
    } catch {
      // ignore malformed events
    }
  };

  // SDP handshake with OpenAI
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const response = await fetch(
    'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ephemeralToken}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    }
  );

  if (!response.ok) {
    throw new Error(`OpenAI Realtime connection failed: ${response.status}`);
  }

  const answerSdp = await response.text();
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

  return {
    pc,
    dc,
    stream,
    audioEl,
    disconnect: () => {
      clearSilenceTimer();
      stream.getTracks().forEach((t) => t.stop());
      pc.close();
      audioEl.srcObject = null;
      audioEl.remove();
    },
  };
}
