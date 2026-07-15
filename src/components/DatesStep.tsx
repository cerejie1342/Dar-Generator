import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { listBranches, listRepos } from '../api/github';
import { periodCovered } from '../api/googleSheets';
import type { Repo, RepoSelection } from '../types';

const { Text } = Typography;

interface Props {
  token: string;
  selections: RepoSelection[];
  onSelectionsChange: (next: RepoSelection[]) => void;
  defaultSelections: RepoSelection[];
  onDefaultSelectionsChange: (next: RepoSelection[]) => void;
  dates: string[];
  onDatesChange: (next: string[]) => void;
  dateSubmitted: string;
  onDateSubmittedChange: (next: string) => void;
  onlyMine: boolean;
  onOnlyMineChange: (next: boolean) => void;
}

/** Order-independent comparison of a repo + branch selection. */
function sameSelection(a: RepoSelection[], b: RepoSelection[]): boolean {
  const norm = (list: RepoSelection[]) =>
    JSON.stringify(
      [...list]
        .sort((x, y) => x.fullName.localeCompare(y.fullName))
        .map((s) => ({ fullName: s.fullName, branches: [...s.branches].sort() })),
    );
  return norm(a) === norm(b);
}

export default function DatesStep({
  token,
  selections,
  onSelectionsChange,
  defaultSelections,
  onDefaultSelectionsChange,
  dates,
  onDatesChange,
  dateSubmitted,
  onDateSubmittedChange,
  onlyMine,
  onOnlyMineChange,
}: Props) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState<Record<string, string[]>>({});

  const loadRepos = async () => {
    if (!token) {
      message.warning('Add your GitHub PAT in Profile & Settings first.');
      return;
    }
    setLoading(true);
    try {
      setRepos(await listRepos(token));
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && repos.length === 0) void loadRepos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Pre-loaded (default) selections arrive without their branch lists; fetch
  // them so the branch dropdowns show every available branch, not just the picks.
  useEffect(() => {
    if (!token) return;
    for (const s of selections) {
      if (branches[s.fullName]) continue;
      listBranches(token, s.fullName)
        .then((list) => setBranches((prev) => ({ ...prev, [s.fullName]: list })))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selections]);

  const onReposPicked = async (fullNames: string[]) => {
    const next: RepoSelection[] = fullNames.map((fullName) => {
      const existing = selections.find((s) => s.fullName === fullName);
      if (existing) return existing;
      const repo = repos.find((r) => r.fullName === fullName);
      return { fullName, branches: [repo?.defaultBranch ?? 'main'] };
    });
    onSelectionsChange(next);

    for (const fullName of fullNames) {
      if (branches[fullName]) continue;
      try {
        const list = await listBranches(token, fullName);
        setBranches((prev) => ({ ...prev, [fullName]: list }));
      } catch (error) {
        message.error((error as Error).message);
      }
    }
  };

  const sortedDates = [...dates].sort();
  const hasDefault = defaultSelections.length > 0;
  const isDefault = hasDefault && sameSelection(selections, defaultSelections);

  const saveDefault = () => {
    onDefaultSelectionsChange(selections);
    message.success('Saved as your default repositories and branches.');
  };

  const clearDefault = () => {
    onDefaultSelectionsChange([]);
    message.success('Default repositories and branches cleared.');
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title="Repositories"
        size="small"
        extra={
          <Space>
            <Button
              size="small"
              disabled={selections.length === 0 || isDefault}
              onClick={saveDefault}
            >
              {isDefault ? 'Saved as default' : 'Set as default'}
            </Button>
            <Button icon={<ReloadOutlined />} size="small" loading={loading} onClick={loadRepos}>
              Refresh
            </Button>
          </Space>
        }
      >
        <Select
          mode="multiple"
          allowClear
          showSearch
          loading={loading}
          style={{ width: '100%' }}
          placeholder="Search and select one or more repositories"
          value={selections.map((s) => s.fullName)}
          onChange={onReposPicked}
          optionFilterProp="label"
          options={repos.map((r) => ({
            label: r.fullName,
            value: r.fullName,
          }))}
        />

        {hasDefault && (
          <Space size={6} style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {isDefault
                ? 'These are your saved default repositories and branches.'
                : 'A default selection is saved and loads on next visit.'}
            </Text>
            <Button type="link" size="small" style={{ padding: 0 }} onClick={clearDefault}>
              Clear default
            </Button>
          </Space>
        )}

        {selections.length > 0 && (
          <Table
            style={{ marginTop: 16 }}
            size="small"
            pagination={false}
            rowKey="fullName"
            dataSource={selections}
            columns={[
              {
                title: 'Repository',
                dataIndex: 'fullName',
                render: (value: string) => {
                  const repo = repos.find((r) => r.fullName === value);
                  return (
                    <Space>
                      <Text>{value}</Text>
                      {repo?.private && <Tag>private</Tag>}
                    </Space>
                  );
                },
              },
              {
                title: 'Branches',
                dataIndex: 'branches',
                width: 380,
                render: (picked: string[], row: RepoSelection) => {
                  const available = branches[row.fullName] ?? picked;
                  const setBranches = (next: string[]) =>
                    onSelectionsChange(
                      selections.map((s) =>
                        s.fullName === row.fullName ? { ...s, branches: next } : s,
                      ),
                    );
                  return (
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Select
                        mode="multiple"
                        showSearch
                        allowClear
                        style={{ width: '100%' }}
                        placeholder="Select at least one branch"
                        status={picked.length === 0 ? 'error' : undefined}
                        maxTagCount="responsive"
                        value={picked}
                        options={available.map((b) => ({ label: b, value: b }))}
                        onChange={setBranches}
                      />
                      <Space size={4}>
                        <Button
                          type="link"
                          size="small"
                          style={{ padding: 0 }}
                          disabled={available.length === picked.length}
                          onClick={() => setBranches(available)}
                        >
                          All {available.length} branches
                        </Button>
                        <Text type="secondary">·</Text>
                        <Button
                          type="link"
                          size="small"
                          style={{ padding: 0 }}
                          onClick={() => {
                            const repo = repos.find((r) => r.fullName === row.fullName);
                            if (repo) setBranches([repo.defaultBranch]);
                          }}
                        >
                          Default only
                        </Button>
                      </Space>
                    </Space>
                  );
                },
              },
            ]}
          />
        )}

        {selections.length > 0 && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message="Pick every branch you worked on during the period."
            description="A branch's history already contains whatever has been merged into it, so `development` covers merged feature work. Add feature branches that are still open, or that merged after the period, or their commits will not appear. Commits shared between branches are deduplicated by SHA and counted once."
          />
        )}

        <Checkbox
          style={{ marginTop: 12 }}
          checked={onlyMine}
          onChange={(e) => onOnlyMineChange(e.target.checked)}
        >
          Only commits authored by me
        </Checkbox>
      </Card>

      <Card title="Attendance dates" size="small">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Pick the exact dates from your attendance sheet. Nothing is inferred — weekends and holidays are included if you click them."
        />
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>
              Dates attended
            </Text>
            <DatePicker
              multiple
              style={{ width: '100%' }}
              maxTagCount="responsive"
              value={sortedDates.map((d) => dayjs(d))}
              onChange={(values: Dayjs[] | null) =>
                onDatesChange((values ?? []).map((d) => d.format('YYYY-MM-DD')).sort())
              }
            />
          </Col>
          <Col xs={24} md={12}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>
              Date submitted
            </Text>
            <DatePicker
              style={{ width: '100%' }}
              value={dateSubmitted ? dayjs(dateSubmitted) : null}
              onChange={(value) => onDateSubmittedChange(value ? value.format('YYYY-MM-DD') : '')}
            />
          </Col>
        </Row>

        <Descriptions style={{ marginTop: 16 }} size="small" bordered column={{ xs: 1, md: 3 }}>
          <Descriptions.Item label="Period Covered">
            {periodCovered(sortedDates) || '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Actual No. of Days Attended">
            {sortedDates.length}
          </Descriptions.Item>
          <Descriptions.Item label="Date Submitted">
            {dateSubmitted ? dayjs(dateSubmitted).format('MMMM D, YYYY') : '—'}
          </Descriptions.Item>
        </Descriptions>

        {sortedDates.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {sortedDates.map((d, i) => (
              <Tag
                key={d}
                closable
                onClose={() => onDatesChange(sortedDates.filter((x) => x !== d))}
                style={{ marginBottom: 4 }}
              >
                {i + 1}. {dayjs(d).format('DD-MMM')} {dayjs(d).format('ddd').toUpperCase()}
              </Tag>
            ))}
          </div>
        )}
      </Card>
    </Space>
  );
}
