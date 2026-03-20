import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { jsPDF } from 'jspdf';

let cyrillicFontBase64: string | null = null;

async function getCyrillicFont(): Promise<string | null> {
  if (cyrillicFontBase64) return cyrillicFontBase64;
  const FONT_URLS = [
    'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf',
    'https://github.com/dejavu-fonts/dejavu-fonts/raw/version_2_37/ttf/DejaVuSans.ttf',
  ];
  for (const url of FONT_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const buffer = await res.arrayBuffer();
      cyrillicFontBase64 = Buffer.from(buffer).toString('base64');
      return cyrillicFontBase64;
    } catch {
      // try next URL
    }
  }
  console.error('All Cyrillic font sources failed');
  return null;
}

function safeFilename(name: string | null, fallback: string): string {
  return encodeURIComponent(((name ?? fallback).replace(/[\/:*?"<>|]/g, '').trim() || fallback));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const sessionId = searchParams.get('session_id');
    const rawType = searchParams.get('type');

    if (!sessionId || !rawType) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }
    if (rawType !== 'raw' && rawType !== 'polished' && rawType !== 'pdf') {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const { data: transcript, error: dbErr } = await supabaseAdmin
      .from('transcripts')
      .select('*, sessions(chapters(title_ru), started_at)')
      .eq('session_id', sessionId)
      .single();

    if (dbErr) {
      console.error('[export] db error:', dbErr.message);
      return NextResponse.json({ error: 'DB error: ' + dbErr.message }, { status: 500 });
    }
    if (!transcript) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const shortTitle = (transcript.short_title as string | null) ?? null;

    if (rawType === 'raw') {
      const text = (transcript.raw_text as string | null) ?? '';
      const filename = safeFilename(shortTitle ? shortTitle + '-оригинал' : null, 'разговор-оригинал');
      return new Response(text, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename*=UTF-8''${filename}.txt`,
        },
      });
    }

    if (rawType === 'polished') {
      const text = (transcript.polished_text as string | null) ?? '';
      const filename = safeFilename(shortTitle, 'мемуар');
      return new Response(text, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename*=UTF-8''${filename}.txt`,
        },
      });
    }

    // type === 'pdf'
    const session = transcript.sessions as Record<string, unknown> | null;
    const chapter = session?.chapters as Record<string, unknown> | null;
    const title = shortTitle ?? (chapter?.title_ru as string | null) ?? 'Воспоминания';
    const date = session?.started_at
      ? new Date(session.started_at as string).toLocaleDateString('ru-RU')
      : '';
    const safeTitle = title.replace(/[\/:*?"<>|]/g, '').trim() || 'memoir';

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const fontData = await getCyrillicFont();
    if (fontData) {
      doc.addFileToVFS('DejaVuSans.ttf', fontData);
      doc.addFont('DejaVuSans.ttf', 'CyrillicFont', 'normal');
      doc.setFont('CyrillicFont');
    } else {
      doc.setFont('helvetica', 'normal');
    }

    doc.setFontSize(18);
    doc.text(title, 20, 25);
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text(date, 20, 33);
    doc.setTextColor(0);
    doc.setFontSize(12);

    const lines = doc.splitTextToSize((transcript.polished_text as string | null) ?? '', 170);
    let y = 45;
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const lineHeight = 7;

    for (const line of lines) {
      if (y + lineHeight > pageHeight - margin) { doc.addPage(); y = margin; }
      doc.text(line, 20, y);
      y += lineHeight;
    }

    const pdfBuffer = doc.output('arraybuffer');
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle)}.pdf`,
      },
    });
  } catch (err) {
    console.error('[export] unexpected error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
