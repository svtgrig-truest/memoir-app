import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { supabaseAdmin } from '@/lib/supabase/server';

const SUMMARY_PROMPT =
  'Прочитай этот документ о семье и напиши плотное резюме (максимум 300 слов) всех ключевых фактов: имена, даты, места, события, семейные связи. Это резюме будет использовано как контекст для интервьюера. Только факты — никаких предположений.';

async function summariseBuffer(
  buffer: ArrayBuffer,
  filename: string,
  mimeType: string
): Promise<string | null> {
  try {
    if (mimeType === 'text/plain') {
      const text = Buffer.from(buffer).toString('utf-8');
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: `${SUMMARY_PROMPT}\n\n${text.substring(0, 8000)}` }],
      });
      return res.choices[0].message.content ?? null;
    }

    // PDF and DOCX — use OpenAI Responses API (native file parsing)
    if (
      mimeType === 'application/pdf' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      const base64 = Buffer.from(buffer).toString('base64');
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_file', filename, file_data: `data:${mimeType};base64,${base64}` },
                { type: 'input_text', text: SUMMARY_PROMPT },
              ],
            },
          ],
        }),
      });
      if (!res.ok) {
        console.error('Responses API error:', res.status, await res.text());
        return null;
      }
      const data = await res.json() as { output?: { content?: { text?: string }[] }[] };
      return data.output?.[0]?.content?.[0]?.text ?? null;
    }
  } catch (err) {
    console.error('Heritage summarise failed:', err);
  }
  return null;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();

  const safeFilename = file.name.replace(/[^\w.\-]/g, '_');
  const storagePath = `heritage/${Date.now()}-${safeFilename}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('Media')
    .upload(storagePath, buffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed', detail: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabaseAdmin.storage.from('Media').getPublicUrl(storagePath);

  const summaryText = await summariseBuffer(buffer, file.name, file.type);

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
