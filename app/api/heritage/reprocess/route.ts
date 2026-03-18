import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { toFile } from 'openai';
import { supabaseAdmin } from '@/lib/supabase/server';

const SUMMARY_PROMPT =
  'Прочитай этот документ о семье и напиши плотное резюме (максимум 300 слов) всех ключевых фактов: имена, даты, места, события, семейные связи. Это резюме будет использовано как контекст для интервьюера. Только факты — никаких предположений.';

// Extract storage path from Supabase public URL
function storagePathFromUrl(fileUrl: string): string {
  const url = new URL(fileUrl);
  const match = url.pathname.match(/\/object\/(?:public|sign)\/Media\/(.+)/);
  if (!match) throw new Error('Cannot parse Supabase storage URL');
  return decodeURIComponent(match[1]);
}

async function summarise(buffer: ArrayBuffer, filename: string, mimeType: string): Promise<string | null> {
  if (mimeType === 'text/plain') {
    const text = Buffer.from(buffer).toString('utf-8');
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: `${SUMMARY_PROMPT}\n\n${text.substring(0, 8000)}` }],
    });
    return res.choices[0].message.content ?? null;
  }

  // PDF / DOCX — upload to OpenAI Files API, then use Responses API with file_id
  let fileId: string | null = null;
  try {
    const uploaded = await openai.files.create({
      file: await toFile(Buffer.from(buffer), filename, { type: mimeType }),
      purpose: 'user_data',
    });
    fileId = uploaded.id;

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
              { type: 'input_file', file_id: fileId },
              { type: 'input_text', text: SUMMARY_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Responses API error:', res.status, errText);
      return null;
    }

    const data = (await res.json()) as {
      output?: { content?: { text?: string }[] }[];
      output_text?: string;
    };
    return data.output?.[0]?.content?.[0]?.text ?? data.output_text ?? null;
  } finally {
    if (fileId) openai.files.del(fileId).catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data: doc, error: fetchError } = await supabaseAdmin
    .from('heritage_docs')
    .select('id, filename, file_url, mime_type')
    .eq('id', id)
    .single();

  if (fetchError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  let summaryText: string | null = null;
  try {
    // Download via Supabase Admin (bypasses public URL auth issues)
    const storagePath = storagePathFromUrl(doc.file_url);
    const { data: fileBlob, error: dlError } = await supabaseAdmin.storage
      .from('Media')
      .download(storagePath);
    if (dlError || !fileBlob) throw new Error(`Storage download: ${dlError?.message}`);

    const buffer = await fileBlob.arrayBuffer();
    summaryText = await summarise(buffer, doc.filename, doc.mime_type);
  } catch (err) {
    console.error('Reprocess failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  const { error: updateError } = await supabaseAdmin
    .from('heritage_docs')
    .update({ summary_text: summaryText })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, summary: summaryText });
}
