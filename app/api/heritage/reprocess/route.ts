import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { toFile } from 'openai';
import { supabaseAdmin } from '@/lib/supabase/server';

const MAX_CHARS = 30_000;

const EXTRACT_PROMPT =
  'Извлеки полный текст этого документа дословно — точь-в-точь как в оригинале. ' +
  'Сохрани все имена, даты, места, события, семейные связи и любые детали. ' +
  'Ничего не сокращай, не перефразируй и не опускай. Выведи только текст документа.';

function storagePathFromUrl(fileUrl: string): string {
  const url = new URL(fileUrl);
  const match = url.pathname.match(/\/object\/(?:public|sign)\/Media\/(.+)/);
  if (!match) throw new Error('Cannot parse Supabase storage URL');
  return decodeURIComponent(match[1]);
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
    // Download file via Supabase Admin (bypasses public URL auth issues)
    const storagePath = storagePathFromUrl(doc.file_url);
    const { data: fileBlob, error: dlError } = await supabaseAdmin.storage
      .from('Media')
      .download(storagePath);
    if (dlError || !fileBlob) throw new Error(`Storage download: ${dlError?.message}`);

    const buffer = await fileBlob.arrayBuffer();

    if (doc.mime_type === 'text/plain') {
      summaryText = Buffer.from(buffer).toString('utf-8').slice(0, MAX_CHARS);
    } else {
      // PDF / DOCX — upload to OpenAI Files API, extract verbatim
      let fileId: string | null = null;
      try {
        const uploaded = await openai.files.create({
          file: await toFile(Buffer.from(buffer), doc.filename, { type: doc.mime_type }),
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
          const errText = await res.text();
          console.error('Responses API error:', res.status, errText);
          throw new Error(`OpenAI Responses API: ${res.status} — ${errText.slice(0, 200)}`);
        }

        const data = (await res.json()) as {
          output?: { content?: { text?: string }[] }[];
          output_text?: string;
        };
        const text = data.output?.[0]?.content?.[0]?.text ?? data.output_text ?? null;
        summaryText = text ? text.slice(0, MAX_CHARS) : null;
      } finally {
        if (fileId) openai.files.del(fileId).catch(() => {});
      }
    }
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
