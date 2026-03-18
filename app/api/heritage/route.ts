import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { toFile } from 'openai';
import { supabaseAdmin } from '@/lib/supabase/server';

// Max characters stored per document. Long enough for full books.
const MAX_CHARS = 30_000;

const EXTRACT_PROMPT =
  'Извлеки полный текст этого документа дословно — точь-в-точь как в оригинале. ' +
  'Сохрани все имена, даты, места, события, семейные связи и любые детали. ' +
  'Ничего не сокращай, не перефразируй и не опускай. Выведи только текст документа.';

async function extractText(buffer: ArrayBuffer, filename: string, mimeType: string): Promise<string | null> {
  try {
    if (mimeType === 'text/plain') {
      // Plain text — store as-is, no GPT needed
      return Buffer.from(buffer).toString('utf-8').slice(0, MAX_CHARS);
    }

    // PDF / DOCX — upload to OpenAI Files API, then extract verbatim via Responses API
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
                { type: 'input_text', text: EXTRACT_PROMPT },
              ],
            },
          ],
        }),
      });

      if (!res.ok) {
        console.error('Responses API error:', res.status, await res.text());
        return null;
      }

      const data = (await res.json()) as {
        output?: { content?: { text?: string }[] }[];
        output_text?: string;
      };
      const text = data.output?.[0]?.content?.[0]?.text ?? data.output_text ?? null;
      return text ? text.slice(0, MAX_CHARS) : null;
    } finally {
      if (fileId) openai.files.del(fileId).catch(() => {});
    }
  } catch (err) {
    console.error('Heritage extract failed:', err);
    return null;
  }
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

  const summaryText = await extractText(buffer, file.name, file.type);

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
