import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Upload to Supabase Storage
  const storagePath = `heritage/${Date.now()}-${file.name}`;
  const buffer = await file.arrayBuffer();
  const { error: uploadError } = await supabaseAdmin.storage
    .from('media')
    .upload(storagePath, buffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed', detail: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabaseAdmin.storage.from('media').getPublicUrl(storagePath);

  // Summarize plain-text files only; binary formats (PDF, DOCX) not yet parseable
  let summaryText: string | null = null;
  if (file.type === 'text/plain') {
    try {
      const text = await file.text();
      const summaryRes = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: `Прочитай следующий документ о семье и напиши плотное резюме (максимум 300 слов) всех ключевых фактов: имена, даты, места, события, семейные связи. Это резюме будет использовано как контекст для интервьюера.\n\n${text.substring(0, 8000)}`,
        }],
      });
      summaryText = summaryRes.choices[0].message.content ?? null;
    } catch (err) {
      console.error('Heritage summary failed:', err);
    }
  }

  const { error: insertError } = await supabaseAdmin.from('heritage_docs').insert({
    filename: file.name,
    file_url: publicUrl,
    mime_type: file.type,
    summary_text: summaryText,
  });

  if (insertError) {
    return NextResponse.json({ error: 'Failed to save document record' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, summary: summaryText });
}
