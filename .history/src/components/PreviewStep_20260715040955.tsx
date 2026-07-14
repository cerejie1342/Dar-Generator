import { Alert, Button, Card, Empty, Input, Space, Spin, Table, Tag, Typography } from 'antd';
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { MAX_CHARS, MIN_CHARS } from '../api/gemini';
import type { DayRow } from '../types';

const { Text, Link } = Typography;

interface Props {
  dayRows: DayRow[];
  summarizing: boolean;
  hasApiKey: boolean;
  onChange: (next: DayRow[]) => void;
  onSummarize: () => void;
  onRegenerate: () => void;
}

export default function PreviewStep({
  dayRows,
  summarizing,
  hasApiKey,
  onChange,
  onSummarize,
  onRegenerate,
}: Props) {
  if (dayRows.length === 0) {
    return <Empty description="Pick your dates and fetch commits first" />;
  }

  const setAccomplishment = (date: string, value: string) => {
    onChange(dayRows.map((row) => (row.date === date ? { ...row, accomplishment: value } : row)));
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="Ejie from your code changes, not your commit messages"
        description={`Gemini reads the files each day touched and writes one ${MIN_CHARS}–${MAX_CHARS} character sentence. Rewrite any cell — your edits are what land in the sheet.`}
      />

      {!hasApiKey && (
        <Alert
          type="warning"
          showIcon
          message="No Gemini API key"
          description="These cells are currently just cleaned-up commit messages. Add a free key in Profile & Settings to have the accomplishments written from the actual file changes."
        />
      )}

      <Card
        size="small"
        title="Daily accomplishments"
        extra={
          <Space>
            <Button
              type="primary"
              size="small"
              icon={<ThunderboltOutlined />}
              loading={summarizing}
              disabled={!hasApiKey}
              onClick={onSummarize}
            >
              Rewrite from code changes
            </Button>
            <Button size="small" icon={<ReloadOutlined />} onClick={onRegenerate}>
              Reset to commit messages
            </Button>
          </Space>
        }
      >
        <Spin spinning={summarizing} tip="Reading the diffs…">
          <Table
            size="small"
            rowKey="date"
            pagination={false}
            dataSource={dayRows}
            expandable={{
              expandedRowRender: (row) =>
                row.commits.length === 0 ? (
                  <Text type="secondary">No commits assigned to this day.</Text>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {row.commits.map((commit) => (
                      <li key={commit.sha}>
                        <Text>{commit.message.split('\n')[0]}</Text>{' '}
                        <Link href={commit.url} target="_blank" style={{ fontSize: 12 }}>
                          {commit.sha.slice(0, 7)}
                        </Link>{' '}
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {commit.repo} · actual {dayjs(commit.date).format('DD-MMM')} ·{' '}
                          {commit.files?.length ?? 0} file
                          {(commit.files?.length ?? 0) === 1 ? '' : 's'}
                        </Text>
                        {commit.files && commit.files.length > 0 && (
                          <ul style={{ margin: '2px 0 6px', paddingLeft: 18 }}>
                            {commit.files.slice(0, 8).map((file) => (
                              <li key={file.filename}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {file.filename}{' '}
                                  <Text style={{ color: '#237804', fontSize: 12 }}>
                                    +{file.additions}
                                  </Text>{' '}
                                  <Text style={{ color: '#a8071a', fontSize: 12 }}>
                                    -{file.deletions}
                                  </Text>
                                </Text>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                ),
              rowExpandable: () => true,
            }}
            columns={[
              { title: 'Day', width: 55, render: (_v, _r, index) => index + 1 },
              {
                title: 'Date',
                dataIndex: 'date',
                width: 95,
                render: (date: string) => dayjs(date).format('DD-MMM'),
              },
              {
                title: 'Weekday',
                dataIndex: 'date',
                width: 85,
                render: (date: string) => dayjs(date).format('ddd').toUpperCase(),
              },
              {
                title: 'Files',
                dataIndex: 'commits',
                width: 70,
                render: (commits: DayRow['commits']) => {
                  const files = commits.reduce((n, c) => n + (c.files?.length ?? 0), 0);
                  return files ? <Tag color="blue">{files}</Tag> : <Tag>0</Tag>;
                },
              },
              {
                title: 'Final accomplishment (editable)',
                dataIndex: 'accomplishment',
                render: (value: string, row: DayRow) => {
                  const len = value.trim().length;
                  const ok = len >= MIN_CHARS && len <= MAX_CHARS;
                  return (
                    <>
                      <Input.TextArea
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        value={value}
                        placeholder="Left blank in the sheet"
                        onChange={(e) => setAccomplishment(row.date, e.target.value)}
                      />
                      {len > 0 && (
                        <Text
                          type={ok ? 'success' : 'warning'}
                          style={{ fontSize: 12, display: 'block', marginTop: 2 }}
                        >
                          {len} characters{ok ? '' : ` — aim for ${MIN_CHARS}–${MAX_CHARS}`}
                        </Text>
                      )}
                    </>
                  );
                },
              },
            ]}
          />
        </Spin>
      </Card>
    </Space>
  );
}
