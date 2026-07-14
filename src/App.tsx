import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Layout, Modal, Space, Steps, Typography, message } from 'antd';
import dayjs from 'dayjs';
import ProfileStep from './components/ProfileStep';
import DatesStep from './components/DatesStep';
import CommitsStep from './components/CommitsStep';
import PreviewStep from './components/PreviewStep';
import GenerateStep from './components/GenerateStep';
import { fetchCommitFiles, fetchCommits, getUser } from './api/github';
import { summarizeDays } from './api/gemini';
import { distribute } from './lib/distribute';
import { summarize } from './lib/commitText';
import { DEFAULT_SETTINGS, loadSettings, resetSettings, saveSettings } from './lib/storage';
import type { Commit, DayRow, RepoSelection, Settings } from './types';

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

const STEPS = ['Profile & Settings', 'Dates & Repos', 'Commits', 'Preview & Edit', 'Generate'];

export default function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [step, setStep] = useState(0);

  const [selections, setSelections] = useState<RepoSelection[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [dateSubmitted, setDateSubmitted] = useState(dayjs().format('YYYY-MM-DD'));
  const [onlyMine, setOnlyMine] = useState(true);

  const [commits, setCommits] = useState<Commit[]>([]);
  const [fetched, setFetched] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchStage, setFetchStage] = useState('');
  const [dayRows, setDayRows] = useState<DayRow[]>([]);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => saveSettings(settings), [settings]);

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  /** Distribute commits across the days, seeding each cell from the commit messages. */
  const buildDayRows = useCallback((pool: Commit[], days: string[]): DayRow[] => {
    const assigned = distribute(pool, days);
    const rows = [...days].sort().map((date) => {
      const dayCommits = assigned.get(date) ?? [];
      return { date, commits: dayCommits, accomplishment: summarize(dayCommits) };
    });
    setDayRows(rows);
    return rows;
  }, []);

  /** Rewrite each day's cell from the actual file changes, via Claude. */
  const summarizeChanges = useCallback(
    async (rows: DayRow[]) => {
      if (!settings.geminiApiKey) {
        messageApi.warning(
          'Add a Gemini API key in Profile & Settings to summarize the code changes. Showing commit messages for now.',
        );
        return;
      }
      setSummarizing(true);
      try {
        const summaries = await summarizeDays(settings.geminiApiKey, rows);
        setDayRows((prev) =>
          prev.map((row) =>
            summaries[row.date] ? { ...row, accomplishment: summaries[row.date] } : row,
          ),
        );
        messageApi.success('Accomplishments written from the code changes.');
      } catch (error) {
        messageApi.error((error as Error).message);
      } finally {
        setSummarizing(false);
      }
    },
    [settings.geminiApiKey, messageApi],
  );

  const onFetch = async () => {
    if (!settings.githubToken) {
      messageApi.warning('Add your GitHub PAT in Profile & Settings first.');
      return;
    }
    if (selections.length === 0) {
      messageApi.warning('Select at least one repository.');
      return;
    }
    if (dates.length === 0) {
      messageApi.warning('Pick your attendance dates first.');
      return;
    }
    const branchless = selections.filter((s) => s.branches.length === 0);
    if (branchless.length > 0) {
      messageApi.warning(`Select at least one branch for ${branchless[0].fullName}.`);
      return;
    }

    setFetching(true);
    setFetchStage('Fetching commits…');
    try {
      const sorted = [...dates].sort();
      const since = dayjs(sorted[0]).startOf('day').toISOString();
      const until = dayjs(sorted[sorted.length - 1]).endOf('day').toISOString();

      let author: string | undefined;
      if (onlyMine) author = (await getUser(settings.githubToken)).login;

      let pool = await fetchCommits(settings.githubToken, selections, since, until, author);

      // A commit authored under a different email will not match the `author`
      // filter; fall back to the whole branch history rather than showing nothing.
      if (pool.length === 0 && author) {
        pool = await fetchCommits(settings.githubToken, selections, since, until);
        if (pool.length > 0) {
          messageApi.info(
            `No commits matched the GitHub account "${author}", so every commit on the selected branches is shown instead.`,
          );
        }
      }

      if (pool.length > 0) {
        pool = await fetchCommitFiles(settings.githubToken, pool, (done, total) =>
          setFetchStage(`Reading changed files… ${done}/${total}`),
        );
      }

      setCommits(pool);
      setFetched(true);
      const rows = buildDayRows(pool, sorted);
      messageApi.success(`${pool.length} commit${pool.length === 1 ? '' : 's'} fetched.`);

      if (pool.length > 0) {
        setStep(3);
        void summarizeChanges(rows);
      }
    } catch (error) {
      messageApi.error((error as Error).message);
    } finally {
      setFetching(false);
      setFetchStage('');
    }
  };

  const onReset = () => {
    Modal.confirm({
      title: 'Reset all settings?',
      content: 'Your profile, signatories, GitHub PAT and Client ID will be cleared from this browser.',
      okText: 'Reset',
      okButtonProps: { danger: true },
      onOk: () => {
        resetSettings();
        setSettings({ ...DEFAULT_SETTINGS });
        setSelections([]);
        setDates([]);
        setCommits([]);
        setDayRows([]);
        setFetched(false);
        messageApi.success('Settings reset.');
      },
    });
  };

  const canAdvance = useMemo(() => {
    if (step === 1) {
      return (
        dates.length > 0 &&
        selections.length > 0 &&
        selections.every((s) => s.branches.length > 0)
      );
    }
    if (step === 2) return dayRows.length > 0;
    return true;
  }, [step, dates, selections, dayRows]);

  const body = [
    <ProfileStep key="0" settings={settings} onChange={patchSettings} onReset={onReset} />,
    <DatesStep
      key="1"
      token={settings.githubToken}
      selections={selections}
      onSelectionsChange={setSelections}
      dates={dates}
      onDatesChange={(next) => {
        setDates(next);
        if (fetched) buildDayRows(commits, next);
      }}
      dateSubmitted={dateSubmitted}
      onDateSubmittedChange={setDateSubmitted}
      onlyMine={onlyMine}
      onOnlyMineChange={setOnlyMine}
    />,
    <CommitsStep
      key="2"
      commits={commits}
      fetched={fetched}
      loading={fetching}
      stage={fetchStage}
      dates={dates}
      onFetch={onFetch}
    />,
    <PreviewStep
      key="3"
      dayRows={dayRows}
      summarizing={summarizing}
      hasApiKey={!!settings.geminiApiKey}
      onChange={setDayRows}
      onSummarize={() => void summarizeChanges(dayRows)}
      onRegenerate={() => buildDayRows(commits, dates)}
    />,
    <GenerateStep key="4" settings={settings} dayRows={dayRows} dateSubmitted={dateSubmitted} />,
  ][step];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {contextHolder}
      <Header style={{ background: '#17375E', display: 'flex', alignItems: 'center' }}>
        <Title level={4} style={{ color: '#fff', margin: 0 }}>
          DAR Generator
        </Title>
        <Text style={{ color: '#c9d7e8', marginLeft: 12 }}>
          GitHub commits → Daily Accomplishment Report
        </Text>
      </Header>

      <Content style={{ padding: 24, maxWidth: 1180, margin: '0 auto', width: '100%' }}>
        <Steps
          current={step}
          onChange={setStep}
          size="small"
          style={{ marginBottom: 24 }}
          items={STEPS.map((title) => ({ title }))}
        />

        <Card>{body}</Card>

        <Space style={{ marginTop: 16 }}>
          <Button disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          <Button
            type="primary"
            disabled={step === STEPS.length - 1 || !canAdvance}
            onClick={() => setStep((s) => s + 1)}
          >
            Next
          </Button>
        </Space>
      </Content>

      <Footer style={{ textAlign: 'center' }}>
        <Text type="secondary">
          Runs entirely in your browser. Your PAT never leaves this device; Google access is granted
          per-session through the sign-in popup.
        </Text>
      </Footer>
    </Layout>
  );
}
