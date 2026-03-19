import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

function divider(char: string, len = 52) { return char.repeat(len); }

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export async function GET() {
  const [{ data: chapters }, { data: untagged }] = await Promise.all([
    supabaseAdmin
      .from('chapters')
      .select('id, title_ru, sessions(id, started_at, transcripts(short_title, polished_text))')
      .neq('theme', 'free')
      .order('display_order'),
    supabaseAdmin
      .from('sessions')
      .select('id, started_at, transcripts(short_title, polished_text)')
      .is('chapter_id', null)
      .eq('status', 'complete')
      .order('started_at'),
  ]);

  const lines: string[] = [
    'МЕМУАРЫ — ИСТОРИЯ АЛЕКСАНДРА ГРИГОРЬЕВИЧА',
    divider('═'),
    '',
  ];

  const addSession = (session: {
    id: string;
    started_at: string;
    transcripts: { short_title: string | null; polished_text: string | null } | { short_title: string | null; polished_text: string | null }[] | null;
  }) => {
    const tx = Array.isArray(session.transcripts) ? session.transcripts[0] : session.transcripts;
    if (!tx?.polished_text) return;
    if (tx.short_title) lines.push(`« ${tx.short_title} »`);
    lines.push(fmt(session.started_at));
    lines.push('');
    lines.push(tx.polished_text.trim());
    lines.push('');
    lines.push(divider('─'));
    lines.push('');
  };

  for (const ch of (chapters ?? [])) {
    const sessions = (ch as unknown as { sessions?: typeof untagged }).sessions ?? [];
    const withTranscript = sessions.filter((s) => {
      const tx = Array.isArray(s.transcripts) ? s.transcripts[0] : s.transcripts;
      return !!tx?.polished_text;
    });
    if (withTranscript.length === 0) continue;

    lines.push(divider('═'));
    lines.push((ch as { title_ru: string }).title_ru.toUpperCase());
    lines.push(divider('═'));
    lines.push('');

    for (const s of withTranscript) addSession(s as Parameters<typeof addSession>[0]);
  }

  const untaggedWithTx = (untagged ?? []).filter((s) => {
    const tx = Array.isArray(s.transcripts) ? s.transcripts[0] : s.transcripts;
    return !!tx?.polished_text;
  });

  if (untaggedWithTx.length > 0) {
    lines.push(divider('═'));
    lines.push('РАЗНОЕ');
    lines.push(divider('═'));
    lines.push('');
    for (const s of untaggedWithTx) addSession(s as Parameters<typeof addSession>[0]);
  }

  const text = lines.join('\n');

  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'inline; filename="memoir.txt"',
    },
  });
}
