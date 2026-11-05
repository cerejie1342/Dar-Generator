import type { Commit, DayRow } from '../types';

export const MIN_CHARS = 80;
export const MAX_CHARS = 100;

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

interface ModelSpec {
  id: string;
  /** Supports `json_schema` with `strict: true`; otherwise falls back to plain JSON mode. */
  strictSchema: boolean;
  /** Reasoning model — accepts `reasoning_effort`, and its thinking counts toward output tokens. */
  reasoning: boolean;
}

/**
 * Tried in order. Groq rate-limits per model, so a model that is out of quota,
 * overloaded, retired, or not offered to this key falls through to the next one.
 * llama-3.1-8b-instant has by far the largest free daily allowance and is plenty
 * for paraphrasing commit messages; the gpt-oss models enforce the JSON schema.
 */
const MODELS: ModelSpec[] = [
  { id: 'llama-3.1-8b-instant', strictSchema: false, reasoning: false },
  { id: 'openai/gpt-oss-20b', strictSchema: true, reasoning: true },
  { id: 'openai/gpt-oss-120b', strictSchema: true, reasoning: true },
];

/** Transient server-side failures: retried on the same model before moving on. */
const OVERLOADED = new Set([500, 502, 503]);
/** Waits before each retry of an overloaded model (so up to 3 attempts per model). */
const RETRY_DELAYS_MS = [1000, 2000];

/** Keep the prompt small no matter how busy a day was. */
const MAX_COMMITS_PER_DAY = 15;
const MAX_MESSAGE_CHARS = 300;
const MAX_FILES_PER_DAY = 8;

export class GroqError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroqError';
  }
}

const SYSTEM = `You write the "actual accomplishment" cells of a Philippine government agency's Daily Accomplishment Report (DAR) for a software developer.

For each day you are given that day's commit messages and the names of the files that changed. Paraphrase them into ONE sentence describing what the developer accomplished that day.

Rules for every sentence:
- Between ${MIN_CHARS} and ${MAX_CHARS} characters. This is a hard requirement; count the characters.
- Plain professional English that a supervisor reading the report would understand. Name the feature, module, or behavior affected. Use the file names only to understand what a terse commit message refers to.
- When a day has several commits, combine them into one sentence about the main work; do not list them.
- Start with a past-tense verb or a noun phrase. Do not start with "Today" or the date.
- No commit-message artifacts: no "feat:", "fix:", no SHAs, no file paths, no branch names, no markdown.
- Do not invent work the commits do not support. If the commits are vague, describe honestly what was touched.

Respond with JSON only, in exactly this shape, one entry per day, echoing each date exactly:
{"days":[{"date":"yyyy-MM-dd","accomplishment":"..."}]}

Examples of the intended voice:
- "Migrated the Frontline Services table and added auto-logging relationships for tickets"
- "Converted password hashing from MD5 to PBKDF2 to enforce stricter account security"
- "Implemented the dynamic user profile update flow, including validation and error states"`;

/** Strip trailers such as "Co-Authored-By:" and fold a multi-line message onto one line. */
function cleanMessage(message: string): string {
  return message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^[\w-]+-by:/i.test(line))
    .join(' / ')
    .slice(0, MAX_MESSAGE_CHARS);
}

function digestDay(date: string, commits: Commit[]): string {
  const lines = [`## ${date}`, 'Commits:'];
  for (const commit of commits.slice(0, MAX_COMMITS_PER_DAY)) {
    lines.push(`- ${cleanMessage(commit.message)}`);
  }
  if (commits.length > MAX_COMMITS_PER_DAY) {
    lines.push(`- (+${commits.length - MAX_COMMITS_PER_DAY} more commits)`);
  }

  // Biggest changes first — those say the most about what the day was about.
  const files = commits
    .flatMap((c) => c.files ?? [])
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .map((f) => f.filename);
  const unique = [...new Set(files)];
  if (unique.length > 0) {
    const more = unique.length > MAX_FILES_PER_DAY ? ` (+${unique.length - MAX_FILES_PER_DAY} more)` : '';
    lines.push(`Files changed: ${unique.slice(0, MAX_FILES_PER_DAY).join(', ')}${more}`);
  }
  return lines.join('\n');
}

/** Standard JSON Schema, as Groq's `json_schema` response format expects. */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'The yyyy-MM-dd date, echoed back exactly' },
          accomplishment: {
            type: 'string',
            description: `The accomplishment sentence, ${MIN_CHARS}-${MAX_CHARS} characters`,
          },
        },
        required: ['date', 'accomplishment'],
        additionalProperties: false,
      },
    },
  },
  required: ['days'],
  additionalProperties: false,
};

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function errorDetail(res: Response): Promise<string> {
  try {
    return ((await res.json()) as ChatResponse)?.error?.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

/** Pull `{ date: sentence }` out of a reply, keeping only dates that were asked for. */
function parseDays(data: ChatResponse, wanted: Set<string>): Record<string, string> | null {
  const text = data.choices?.[0]?.message?.content;
  if (!text) return null;

  let parsed: { days?: { date?: unknown; accomplishment?: unknown }[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const out: Record<string, string> = {};
  for (const day of Array.isArray(parsed.days) ? parsed.days : []) {
    if (typeof day.date !== 'string' || typeof day.accomplishment !== 'string') continue;
    const sentence = day.accomplishment.trim().replace(/^"|"$/g, '');
    if (wanted.has(day.date) && sentence) out[day.date] = sentence;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Paraphrase each day's commits into one DAR-ready sentence.
 * Days with no commits are skipped and left for the user to fill in.
 */
export async function summarizeDays(
  apiKey: string,
  dayRows: DayRow[],
): Promise<Record<string, string>> {
  if (!apiKey) {
    throw new GroqError('No Groq API key set. Add one in Profile & Settings.');
  }

  const withWork = dayRows.filter((row) => row.commits.length > 0);
  if (withWork.length === 0) return {};

  const digest = withWork.map((row) => digestDay(row.date, row.commits)).join('\n\n');
  const userText = `Write one accomplishment sentence for each of these ${withWork.length} days. Return one entry per day, echoing the date exactly.\n\n${digest}`;
  const wanted = new Set(withWork.map((row) => row.date));

  const callModel = async (model: ModelSpec): Promise<Response> => {
    try {
      return await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model.id,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: userText },
          ],
          temperature: 0.3,
          max_completion_tokens: 2048,
          response_format: model.strictSchema
            ? {
                type: 'json_schema',
                json_schema: { name: 'dar_accomplishments', strict: true, schema: RESPONSE_SCHEMA },
              }
            : { type: 'json_object' },
          ...(model.reasoning ? { reasoning_effort: 'low' } : {}),
        }),
      });
    } catch {
      throw new GroqError('Could not reach api.groq.com. Check your internet connection.');
    }
  };

  const statuses = new Set<number>();
  const failures: string[] = [];

  for (const model of MODELS) {
    let res = await callModel(model);
    for (let attempt = 0; OVERLOADED.has(res.status) && attempt < RETRY_DELAYS_MS.length; attempt++) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      res = await callModel(model);
    }

    if (res.status === 401) {
      throw new GroqError('Groq rejected the API key. Check it in Profile & Settings.');
    }
    if (!res.ok) {
      // 400/403/404 (model retired or not offered to this key), 413 (too large for
      // this model's limit), 429 (this model's quota spent), 5xx (overloaded).
      statuses.add(res.status);
      failures.push(`${model.id} (${res.status}: ${await errorDetail(res)})`);
      continue;
    }

    const result = parseDays((await res.json()) as ChatResponse, wanted);
    if (result) return result;
    failures.push(`${model.id} (returned no usable sentences)`);
  }

  const retry = 'Wait a minute and press "Rewrite with Groq" again.';
  if (statuses.has(429)) {
    throw new GroqError(`Groq free-tier rate limit hit on every model. ${retry}`);
  }
  if ([...OVERLOADED].some((s) => statuses.has(s))) {
    throw new GroqError(`Groq is overloaded right now. ${retry}`);
  }
  throw new GroqError(`Groq could not summarize the commits. Tried: ${failures.join('; ')}`);
}
