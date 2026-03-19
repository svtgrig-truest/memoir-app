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
  stopRecording: () => Promise<Blob>;
  disconnect: () => void;
}

export function buildSystemPrompt(opts: SystemPromptOptions): string {
  const { chapterTitle, heritageSummary, sessionSummaries, lastChapterShortTitle, lastChapterSummary } = opts;

  const chapterContext = chapterTitle
    ? `Цель текущей беседы: исследуй тему — «${chapterTitle}».`
    : 'Цель текущей беседы: следуй за тем, что хочет рассказать собеседник.';

  const heritageSection = heritageSummary
    ? `\n\nЧТО ТЫ УЖЕ ЗНАЕШЬ — СЕМЕЙНЫЙ АРХИВ:\n${heritageSummary}\n\nКАК ИСПОЛЬЗОВАТЬ ЭТИ ЗНАНИЯ: Ты уже знаком с этими фактами — не спрашивай о том, что прямо написано в документах. Вместо этого называй конкретные детали в своих вопросах: «Вы работали в [конкретное место] — что вы помните о том периоде?», «В архиве упоминается [конкретное имя] — расскажите об этом человеке». Всегда показывай в вопросе, что ты знаком с историей семьи.`
    : '';

  const summarySection = sessionSummaries.length
    ? `\n\nУЖЕ ИЗВЕСТНЫЕ ФАКТЫ ИЗ ПРОШЛЫХ РАЗГОВОРОВ:\n${sessionSummaries.join('\n')}\n\nЭТИ КОНКРЕТНЫЕ ДЕТАЛИ УЖЕ РАССКАЗАНЫ — не спрашивай о них снова и не делай вид, что узнаёшь впервые. Если хочешь углубиться в уже упомянутую тему — спроси о конкретном аспекте, которого ещё не касались. Например, если уже знаешь про дом на Ленинском проспекте, не спрашивай «где вы жили?» — спроси о чём-то конкретном, о чём ещё не говорили.`
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
- СТРОГО один вопрос за раз — задал вопрос, замолчи и жди ответа, сколько бы времени это ни заняло
- Никогда не задавай следующий вопрос, не получив ответа на предыдущий
- Никогда не заполняй тишину — молчание собеседника нормально, он думает
- Активное слушание: отражай сказанное собеседником перед тем, как переходить к следующему вопросу
- Если упоминается имя, место или событие — копай глубже именно в эту сторону
- Никогда не поправляй и не перебивай
- Каждый следующий вопрос должен быть связан с тем, что только что сказал собеседник: либо углубляет его ответ, либо проводит контраст («А до этого было иначе?»), либо подхватывает упомянутую деталь — никогда не переходи к новой теме без моста
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
    // Pipe AI voice into the recording mix
    try {
      const aiSource = audioCtx.createMediaStreamSource(e.streams[0]);
      aiSource.connect(dest);
    } catch { /* ignore if AudioContext already closed */ }
  };

  // Microphone input
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc.addTrack(stream.getTracks()[0]);

  // ── Audio recording (both mic + AI voice mixed) ─────────────────────────
  const audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});
  const dest = audioCtx.createMediaStreamDestination();
  const micSource = audioCtx.createMediaStreamSource(stream);
  micSource.connect(dest);

  const recChunks: BlobPart[] = [];
  // Ordered by preference; mp4/aac is the only option on Safari/iOS
  const mimeType = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
  const recorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : {});
  recorder.ondataavailable = (ev) => { if (ev.data.size > 0) recChunks.push(ev.data); };
  recorder.start(2000); // save a chunk every 2 s so data isn't lost on crash

  const stopRecording = (): Promise<Blob> =>
    new Promise((resolve) => {
      if (recorder.state === 'inactive') {
        resolve(new Blob(recChunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
        return;
      }
      recorder.onstop = () => {
        // Use recorder.mimeType (browser-resolved) rather than the requested mimeType string
        const resolvedType = recorder.mimeType || mimeType || 'audio/webm';
        resolve(new Blob(recChunks, { type: resolvedType }));
        audioCtx.close().catch(() => {});
      };
      recorder.stop();
    });

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
          silence_duration_ms: 1200,
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
    stopRecording,
    disconnect: () => {
      if (recorder.state !== 'inactive') recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
      pc.close();
      audioEl.srcObject = null;
      audioEl.remove();
      audioCtx.close().catch(() => {});
    },
  };
}
