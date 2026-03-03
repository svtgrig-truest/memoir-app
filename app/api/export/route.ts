import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { jsPDF } from 'jspdf';

// Fetched once per cold start; works in serverless environments
let cyrillicFontBase64: string | null = null;

async function getCyrillicFont(): Promise<string | null> {
  if (cyrillicFontBase64) return cyrillicFontBase64;
  try {
    const res = await fetch('https://fonts.gstatic.com/s/ptsans/v17/jizaRExUiTo99u79D0KEwA.ttf');
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    cyrillicFontBase64 = Buffer.from(buffer).toString('base64');
    return cyrillicFontBase64;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sessionId = searchParams.get('session_id');
  const rawType = searchParams.get('type');

  if (!sessionId || !rawType) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }
  if (rawType !== 'raw' && rawType !== 'polished' && rawType !== 'pdf') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }
  const type = rawType;

  const { data: transcript } = await supabaseAdmin
    .from('transcripts')
    .select('*, sessions(chapters(title_ru), started_at)')
    .eq('session_id', sessionId)
    .single();

  if (!transcript) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (type === 'raw') {
    return new NextResponse(transcript.raw_text ?? '', {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="transcript-${sessionId}.txt"`,
      },
    });
  }

  if (type === 'polished') {
    return new NextResponse(transcript.polished_text ?? '', {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="memoir-${sessionId}.txt"`,
      },
    });
  }

  // type === 'pdf'
  const session = transcript.sessions as Record<string, unknown>;
  const chapter = session?.chapters as Record<string, unknown> | null;
  const title = (chapter?.title_ru as string) ?? 'Воспоминания';
  const date = new Date(session?.started_at as string).toLocaleDateString('ru-RU');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const fontData = await getCyrillicFont();
  if (fontData) {
    doc.addFileToVFS('PTSans-Regular.ttf', fontData);
    doc.addFont('PTSans-Regular.ttf', 'CyrillicFont', 'normal');
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

  const lines = doc.splitTextToSize(transcript.polished_text ?? '', 170);
  let y = 45;
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const lineHeight = 7;

  for (const line of lines) {
    if (y + lineHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, 20, y);
    y += lineHeight;
  }

  const pdfBuffer = doc.output('arraybuffer');
  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="memoir-${sessionId}.pdf"`,
    },
  });
}
