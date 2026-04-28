export interface SystemPromptOptions {
  chapterTitle: string | null;
  heritageSummary: string | null;
  sessionSummaries: string[];
  lastChapterShortTitle?: string | null;
  lastChapterSummary?: string | null;
  recentTranscripts?: { title: string | null; text: string }[];
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
  stopRecording: () => Promise<Blob>;
  disconnect: () => void;
}

/**
 * Wait for any in-flight user audio to finish transcribing on OpenAI's side
 * before the caller proceeds to disconnect the WebRTC connection.
 *
 * Background: user transcripts are emitted via the
 * `conversation.item.input_audio_transcription.completed` event, which fires
 * only after Whisper has processed the committed audio buffer on the server.
 * If the WebRTC data channel is closed (`pc.close()`) before this event
 * arrives, the user's last reply is silently lost — never reaches the client,
 * never gets pushed into `messagesRef`, never gets saved by `/api/session-end`.
 *
 * This helper:
 *   1. Sends `input_audio_buffer.commit` to force any pending audio to be
 *      transcribed (covers the case where End was pressed before VAD's
 *      silence_duration_ms had elapsed).
 *   2. Resolves on the next `input_audio_transcription.completed|failed`
 *      event, OR on an `input_audio_buffer_commit_empty` error (no audio
 *      pending), OR after `timeoutMs` as a hard upper bound.
 */
export function flushPendingTranscription(
  conn: RealtimeConnection,
  timeoutMs = 7000
): Promise<void> {
  return new Promise((resolve) => {
    const dc = conn.dc;
    if (dc.readyState !== 'open') return resolve();

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      dc.removeEventListener('message', onMsg);
      resolve();
    };

    const timer = setTimeout(finish, timeoutMs);

    const onMsg = (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data as string) as {
          type?: string;
          error?: { code?: string; message?: string };
        };
        if (
          ev.type === 'conversation.item.input_audio_transcription.completed' ||
          ev.type === 'conversation.item.input_audio_transcription.failed'
        ) {
          clearTimeout(timer);
          finish();
        }
        // Commit was a no-op because there is no buffered audio — nothing
        // to wait for, resolve immediately.
        if (
          ev.type === 'error' &&
          (ev.error?.code === 'input_audio_buffer_commit_empty' ||
            ev.error?.message?.toLowerCase().includes('buffer is empty') ||
            ev.error?.message?.toLowerCase().includes('buffer too small'))
        ) {
          clearTimeout(timer);
          finish();
        }
      } catch {
        /* ignore malformed events */
      }
    };

    dc.addEventListener('message', onMsg);

    try {
      dc.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

export function buildSystemPrompt(opts: SystemPromptOptions): string {
  const { chapterTitle, heritageSummary, sessionSummaries, lastChapterShortTitle, lastChapterSummary, recentTranscripts } = opts;

  const chapterContext = chapterTitle
    ? `Цель текущей беседы: исследуй тему — «${chapterTitle}».`
    : 'Цель текущей беседы: следуй за хронологией жизни собеседника — от детства вперёд, шаг за шагом.';

  const heritageSection = heritageSummary
    ? `\n\nФОНОВЫЕ ЗНАНИЯ — СЕМЕЙНЫЙ АРХИВ:\n${heritageSummary}\n\nКАК ИСПОЛЬЗОВАТЬ ЭТИ ЗНАНИЯ: Держи их как тихий контекст — не упоминай и не цитируй в вопросах по собственной инициативе, особенно в начале беседы. Твоя задача — дать собеседнику самому рассказать свою историю, а не проверять, совпадает ли она с документами. Используй эти факты только тогда, когда сам собеседник выходит на соответствующую тему — тогда можешь мягко углубить: «Расскажите подробнее о том периоде» или уточнить конкретную деталь. Никогда не начинай беседу с фактов из архива.`
    : '';

  const summarySection = sessionSummaries.length
    ? `\n\nУЖЕ ИЗВЕСТНЫЕ ФАКТЫ ИЗ ПРОШЛЫХ РАЗГОВОРОВ:\n${sessionSummaries.join('\n')}\n\nЭТИ КОНКРЕТНЫЕ ДЕТАЛИ УЖЕ РАССКАЗАНЫ — не спрашивай о них снова и не делай вид, что узнаёшь впервые. Если хочешь углубиться в уже упомянутую тему — спроси о конкретном аспекте, которого ещё не касались.`
    : '';

  const recentSection = recentTranscripts && recentTranscripts.length
    ? `\n\nПОСЛЕДНИЕ БЕСЕДЫ — ПОЛНЫЙ КОНТЕКСТ:\n` +
      recentTranscripts.map((t, i) => {
        const label = t.title ? `«${t.title}»` : `Беседа ${i + 1}`;
        return `[${i + 1}] ${label}\n${t.text}`;
      }).join('\n---\n') +
      `\n\nЭТО ПОДРОБНЫЕ ЗАПИСИ НЕДАВНИХ БЕСЕД. Ты слышал эти истории и помнишь их во всех деталях. Никогда не спрашивай о том, что уже описано выше — ты это уже знаешь. Можешь ссылаться на конкретные детали, имена и события из этих рассказов, показывая, что ценишь и помнишь всё услышанное.`
    : '';

  const isFirstEverSession = !recentTranscripts?.length && !sessionSummaries.length;

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
  } else if (isFirstEverSession) {
    greetingSection = `\n\nПОРЯДОК НАЧАЛА: Сразу начни беседу сам — не жди, когда заговорит собеседник. Поздоровайся: «Здравствуйте, Александр Григорьевич». Скажи, что вы начинаете записывать историю его жизни и спроси, с чего ему хотелось бы начать — можно с самого начала, с детства, а можно с тем, что сейчас приходит на ум. Один вопрос.`;
  } else {
    greetingSection = `\n\nПОРЯДОК НАЧАЛА: Сразу начни беседу сам — не жди, когда заговорит собеседник. Поздоровайся: «Здравствуйте, Александр Григорьевич». Продолжи с того места, где остановились в прошлый раз, или предложи двигаться дальше по хронологии жизни. Один вопрос.`;
  }

  return `Ты тёплый, любопытный, эмпатичный интервьюер, помогающий пожилому человеку написать книгу воспоминаний. Цель — создать полноценную книгу, охватывающую все периоды и стороны его жизни: детство, юность, учёбу, работу, семью, дружбу, исторические события и личные переживания. Говори только по-русски. Будь терпелив, внимателен и никогда не торопи собеседника.

Собеседника зовут Александр Григорьевич. Обращайся к нему на «вы». Имя-отчество используй естественно и редко — не чаще одного раза за несколько реплик, только когда это уместно. Никаких «дорогой», «уважаемый», «друг», «голубчик» и других фамильярных обращений.

Правила:
- СТРОГО один вопрос за раз — задал вопрос, замолчи и жди ответа, сколько бы времени это ни заняло
- Никогда не задавай следующий вопрос, не получив ответа на предыдущий
- Никогда не заполняй тишину — молчание собеседника нормально, он думает
- Активное слушание: отражай сказанное собеседником перед тем, как переходить к следующему вопросу
- Если упоминается имя, место или событие — копай глубже именно в эту сторону
- Никогда не поправляй и не перебивай
- Каждый следующий вопрос должен быть связан с тем, что только что сказал собеседник: либо углубляет его ответ, либо проводит контраст («А до этого было иначе?»), либо подхватывает упомянутую деталь — никогда не переходи к новой теме без моста
- После примерно 40 минут мягко предложи завершить беседу

ХРОНОЛОГИЧЕСКАЯ СТРАТЕГИЯ: Веди запись жизни последовательно — от детства к юности, от юности к взрослой жизни. Не перескакивай на яркие исторические события прежде, чем выстроен личный контекст. Исторические события уместны только когда они естественно вытекают из рассказа самого собеседника.

${chapterContext}${heritageSection}${recentSection}${summarySection}${greetingSection}`;
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
  // ── Recording vars declared before pc.ontrack to avoid TDZ ────────────
  let stopRecording: () => Promise<Blob> = () => Promise.resolve(new Blob([]));
  let recorderCleanup: () => void = () => {};

  pc.ontrack = (e) => {
    audioEl.srcObject = e.streams[0];
  };

  // Microphone input
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc.addTrack(stream.getTracks()[0]);

  // ── Audio recording (both mic + AI voice mixed) ─────────────────────────
  // Wrapped in try/catch so a recording failure never breaks WebRTC connectivity

  // ── Mic-only recording: no AudioContext to avoid interfering with AI audio playback ──
  try {
    const recChunks: BlobPart[] = [];
    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    recorder.ondataavailable = (ev) => { if (ev.data.size > 0) recChunks.push(ev.data); };
    recorder.start(2000);

    stopRecording = () =>
      new Promise((resolve) => {
        if (recorder.state === 'inactive') {
          resolve(new Blob(recChunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
          return;
        }
        recorder.onstop = () => {
          resolve(new Blob(recChunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
        };
        recorder.stop();
      });

    recorderCleanup = () => {
      if (recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* ignore */ } }
    };
  } catch (recErr) {
    console.warn('Audio recording setup failed — session will proceed without recording:', recErr);
  }

  // Data channel for events
  const dc = pc.createDataChannel('oai-events');

  // Track whether AI is currently generating/speaking so barge-in cancel is safe
  let isAIResponding = false;

  dc.onopen = () => {
    // Configure the session with system prompt
    dc.send(JSON.stringify({
      type: 'session.update',
      session: {
        instructions: systemPrompt,
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          silence_duration_ms: 2000,
          threshold: 0.6,
          prefix_padding_ms: 300,
          create_response: true,   // auto-respond after user stops speaking
        },
      },
    }));

    // Trigger AI to speak first (greeting). Clear buffer first to prevent
    // mic noise accumulated during WebRTC setup from triggering a VAD response.
    setTimeout(() => {
      if (dc.readyState !== 'open') return;
      dc.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
      dc.send(JSON.stringify({ type: 'response.create' }));
    }, 200);
  };
  dc.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data as string) as Record<string, unknown>;

      // Track AI speaking state
      if (event.type === 'response.created') isAIResponding = true;
      if (event.type === 'response.done' || event.type === 'response.cancelled') isAIResponding = false;

      // Barge-in: only cancel if AI is actively responding, not when it is already silent
      if (event.type === 'input_audio_buffer.speech_started' && isAIResponding) {
        if (dc.readyState === 'open') {
          dc.send(JSON.stringify({ type: 'response.cancel' }));
          isAIResponding = false;
          // After cancel, AI must respond once user finishes — VAD handles this
          // via create_response:true, but we log for debugging
          console.log('[barge-in] cancelled AI response, waiting for user to finish');
        }
      }

      onEvent(event);
    } catch {
      // ignore malformed events
    }
  };

  // SDP handshake with OpenAI
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Route SDP handshake through our server to avoid geo-restrictions on api.openai.com
  const response = await fetch('/api/realtime-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sdp: offer.sdp, token: ephemeralToken }),
  });

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
    stopRecording,
    disconnect: () => {
      recorderCleanup();
      stream.getTracks().forEach((t) => t.stop());
      pc.close();
      audioEl.srcObject = null;
      audioEl.remove();
    },
  };
}
