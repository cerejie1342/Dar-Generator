import { Alert, Button, Card, Empty, List, Space, Statistic, Tag, Typography } from 'antd';
import { CloudDownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Commit } from '../types';

const { Text, Link } = Typography;

interface Props {
  commits: Commit[];
  fetched: boolean;
  loading: boolean;
  stage: string;
  dates: string[];
  onFetch: () => void;
}

export default function CommitsStep({
  commits,
  fetched,
  loading,
  stage,
  dates,
  onFetch,
}: Props) {
  const shortfall = fetched && commits.length < dates.length;
  const files = commits.reduce((sum, commit) => sum + (commit.files?.length ?? 0), 0);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card size="small">
        <Space size="large" wrap>
          <Button
            type="primary"
            icon={<CloudDownloadOutlined />}
            loading={loading}
            onClick={onFetch}
          >
            Fetch commits &amp; changes
          </Button>
          <Statistic title="Commits found" value={commits.length} />
          <Statistic title="Files changed" value={files} />
          <Statistic title="Days to fill" value={dates.length} />
        </Space>
        {loading && stage && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            {stage}
          </Text>
        )}
      </Card>

      {shortfall && (
        <Alert
          type="warning"
          showIcon
          message="Fewer commits than attendance days"
          description="Every commit still gets used exactly once; the days left over come through blank, and you can type their accomplishment by hand in the next step."
        />
      )}

      {fetched && commits.length === 0 && (
        <Alert
          type="warning"
          showIcon
          message="No commits found in this period"
          description="Check the branch, the date range, and whether 'Only commits authored by me' should be off (GitHub matches on the account that authored the commit, not the committer email)."
        />
      )}

      <Card title="Commit pool (chronological)" size="small">
        {commits.length === 0 ? (
          <Empty description={fetched ? 'No commits' : 'Not fetched yet'} />
        ) : (
          <List
            size="small"
            dataSource={commits}
            renderItem={(commit) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Space size={4} wrap>
                      <Tag>{dayjs(commit.date).format('DD-MMM HH:mm')}</Tag>
                      <Text>{commit.message.split('\n')[0]}</Text>
                    </Space>
                  }
                  description={
                    <Space size={8}>
                      <Text type="secondary">{commit.repo}</Text>
                      <Link href={commit.url} target="_blank">
                        {commit.sha.slice(0, 7)}
                      </Link>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </Space>
  );
}
