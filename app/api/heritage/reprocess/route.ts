import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import { supabaseAdmin } from '@/lib/supabase/server';

const SUMMARY_PROMPT =
  'Прочитай этот документ о семье и напиши плотное резюме (максимум 300 слов) всех ключевых фактов: имена, даты, места, события, семейные связи. Это резюме будет использовано как контекст для интервьюера. Только факты — никаких предположений.';

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
    const fileRes = await fetch(doc.file_url);
    if (!fileRes.ok) throw new Error(`Failed to fetch file: ${fileRes.status}`);
    const buffer = await fileRes.arrayBuffer();

    if (doc.mime_type === 'text/plain') {
      const text = Buffer.from(buffer).toString('utf-8');
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: `${SUMMARY_PROMPT}\n\n${text.substring(0, 8000)}` }],
      });
      summaryText = res.choices[0].message.content ?? null;
    } else {
      // PDF and DOCX — OpenAI Responses API
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
                {
                  type: 'input_file',
                  filename: doc.filename,
                  file_data: `data:${doc.mime_type};base64,${base64}`,
                },
                { type: 'input_text', text: SUMMARY_PROMPT },
              ],
            },
          ],
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('Responses API error:', res.status, errText);
        throw new Error(`OpenAI Responses API: ${res.status}`);
      }
      const data = await res.json() as { output?: { content?: { text?: string }[] }[] };
      summaryText = data.output?.[0]?.content?.[0]?.text ?? null;
    }
  } catch (err) {
    console.error('Reprocess failed:', err);
    return NextResponse.json({ error: 'Parsing failed', detail: String(err) }, { status: 500 });
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
