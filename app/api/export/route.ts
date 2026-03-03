import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { jsPDF } from 'jspdf';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sessionId = searchParams.get('session_id');
  const type = searchParams.get('type') as 'raw' | 'polished' | 'pdf';

  if (!sessionId || !type) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

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

  if (type === 'pdf') {
    const session = transcript.sessions as Record<string, unknown>;
    const chapter = session?.chapters as Record<string, unknown> | null;
    const title = (chapter?.title_ru as string) ?? 'Воспоминания';
    const date = new Date(session?.started_at as string).toLocaleDateString('ru-RU');

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(title, 20, 25);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text(date, 20, 33);
    doc.setTextColor(0);
    doc.setFontSize(12);

    const lines = doc.splitTextToSize(transcript.polished_text ?? '', 170);
    doc.text(lines, 20, 45);

    const pdfBuffer = doc.output('arraybuffer');
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="memoir-${sessionId}.pdf"`,
      },
    });
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
}
