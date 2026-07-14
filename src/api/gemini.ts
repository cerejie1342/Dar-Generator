import type { Commit, DayRow } from '../types';

export const MIN_CHARS = 80;
export const MAX_CHARS = 100;

/**
 * Tried in order. Google retires models without warning and returns 404 with
 * "no longer available to new users", so falling through to the next candidate
 * keeps the app working when that happens.
 */
const MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];

const endpoint = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** Keep the prompt bounded no matter how large a day's diff is. */
const MAX_FILES_PER_DAY = 20;
const MAX_PATCH_CHARS = 700;

export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiError';
  }
}

const SYSTEM = `You write the "actual accomplishment" cells of a Philippine government agency's Daily Accomplishment Report (DAR) for a software developer.

For each day you are given the files that changed and their diffs. Write one sentence describing WHAT THE DEVELOPER ACCOMPLISHED, inferred from the code changes themselves — not from the commit messages, which are often terse or misleading.

Rules for every sentence:
- Between ${MIN_CHARS} and ${MAX_CHARS} characters. This is a hard requirement; count the characters.
- Describe the substance of the change in plain professional English, the way a supervisor reading the report would understand it. Name the feature, module, or behavior affected.
- Start with a past-tense verb or a noun phrase. Do not start with "Today" or the date.
- No commit-message artifacts: no "feat:", "fix:", no SHAs, no file paths, no branch names, no markdown.
- If a day's changes are trivial or unclear, still describe honestly what was touched rather than inventing work.

Examples of the intended voice:
- "Migrated the Frontline Services table and added auto-logging relationships for tickets"
- "Converted password hashing from MD5 to PBKDF2 to enforce stricter account security"
- "Implemented the dynamic user profile update flow, including validation and error states"`;

function digestDay(date: string, commits: Commit[]): string {
  const lines: string[] = [`## ${date}`];

  const files = commits.flatMap((c) => c.files ?? []);
  if (files.length === 0) {
    lines.push('(no file changes available)');
    return lines.join('\n');
  }

  // Biggest changes first — those carry the most signal about what the day was about.
  const ranked = [...files]
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, MAX_FILES_PER_DAY);

  for (const file of ranked) {
    lines.push(`\n### ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})`);
    if (file.patch) lines.push(file.patch.slice(0, MAX_PATCH_CHARS));
  }
  if (files.length > ranked.length) {
    lines.push(`\n(+${files.length - ranked.length} more files changed)`);
  }
  return lines.join('\n');
}

/** Gemini's structured-output schema (an OpenAPI 3.0 subset). */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    days: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING', description: 'The yyyy-MM-dd date, echoed back exactly' },
          accomplishment: {
            type: 'STRING',
            description: `The accomplishment sentence, ${MIN_CHARS}-${MAX_CHARS} characters`,
          },
        },
        required: ['date', 'accomplishment'],
        propertyOrdering: ['date', 'accomplishment'],
      },
    },
  },
  required: ['days'],
};

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

/**
 * Summarize each day's code changes into one DAR-ready sentence.
 * Days with no commits are skipped and left for the user to fill in.
 */
export async function summarizeDays(
  apiKey: string,
  dayRows: DayRow[],
): Promise<Record<string, string>> {
  if (!apiKey) {
    throw new GeminiError('No Gemini API key set. Add one in Profile & Settings.');
  }

  const withWork = dayRows.filter((row) => row.commits.length > 0);
  if (withWork.length === 0) return {};

  const digest = withWork.map((row) => digestDay(row.date, row.commits)).join('\n\n---\n\n');

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Write one accomplishment sentence for each of these ${withWork.length} days, based on the code changes below. Return one entry per day, echoing the date exactly.\n\n${digest}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  let res: Response | undefined;
  for (const model of MODELS) {
    res = await fetch(endpoint(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body,
    });
    if (res.status !== 404) break; // 404 = model retired; try the next candidate
  }
  if (!res) throw new GeminiError('No Gemini model could be reached.');

  if (res.status === 400 || res.status === 403) {
    throw new GeminiError('Google rejected the Gemini API key. Check it in Profile & Settings.');
  }
  if (res.status === 429) {
    throw new GeminiError(
      'Gemini free-tier rate limit hit. Wait a minute and press "Rewrite from code changes" again.',
    );
  }
  if (res.status === 404) {
    throw new GeminiError(
      `None of the known Gemini models are available to this key (tried ${MODELS.join(', ')}). Google may have retired them — check ai.google.dev/gemini-api/docs/models.`,
    );
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = ((await res.json()) as GeminiResponse)?.error?.message ?? detail;
    } catch {
      /* keep statusText */
    }
    throw new GeminiError(`Gemini API error (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as GeminiResponse;

  if (data.promptFeedback?.blockReason) {
    throw new GeminiError(`Gemini blocked the request (${data.promptFeedback.blockReason}).`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiError('Gemini returned no summary text.');

  let parsed: { days?: { date?: string; accomplishment?: string }[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiError('Gemini returned malformed JSON. Try again.');
  }

  const out: Record<string, string> = {};
  for (const day of parsed.days ?? []) {
    if (day.date && day.accomplishment) out[day.date] = day.accomplishment.trim();
  }
  return out;
}
