import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';

// Load Cyrillic font once at module level
let cyrillicFontBase64: string | null = null;
let cyrillicFontName: string | null = null;

function loadCyrillicFont(): { name: string; data: string } | null {
  if (cyrillicFontBase64 && cyrillicFontName) {
    return { name: cyrillicFontName, data: cyrillicFontBase64 };
  }
  const candidates = [
    { file: 'public/fonts/PTSans-Regular.ttf', name: 'PTSans-Regular.ttf' },
    { file: 'public/fonts/ArialUnicode.ttf', name: 'ArialUnicode.ttf' },
  ];
  for (const candidate of candidates) {
    const filePath = path.join(process.cwd(), candidate.file);
    if (fs.existsSync(filePath)) {
      cyrillicFontBase64 = fs.readFileSync(filePath).toString('base64');
      cyrillicFontName = candidate.name;
      return { name: candidate.name, data: cyrillicFontBase64 };
    }
  }
  return null;
}

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

    // Embed Cyrillic font if available
    const font = loadCyrillicFont();
    if (font) {
      doc.addFileToVFS(font.name, font.data);
      doc.addFont(font.name, 'CyrillicFont', 'normal');
      doc.setFont('CyrillicFont');
    } else {
      // Fallback: helvetica (Cyrillic will be broken, but at least PDF generates)
      doc.setFont('helvetica', 'normal');
    }

    doc.setFontSize(18);
    // Bold isn't available without separate bold font; just use same font
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

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
}
