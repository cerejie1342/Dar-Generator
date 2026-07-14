import { useState } from 'react';
import { Alert, Button, Card, Descriptions, Result, Space, Typography, message } from 'antd';
import { FileExcelOutlined, GoogleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getAccessToken, signOut } from '../api/googleAuth';
import { createDarSpreadsheet, periodCovered } from '../api/googleSheets';
import type { DayRow, Settings } from '../types';

const { Text } = Typography;

interface Props {
  settings: Settings;
  dayRows: DayRow[];
  dateSubmitted: string;
}

export default function GenerateStep({ settings, dayRows, dateSubmitted }: Props) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  const dates = dayRows.map((row) => row.date);
  const period = periodCovered(dates);
  const title = `DAR - ${settings.pbeName || 'PBE'} - ${period || dayjs().format('YYYY-MM-DD')}`;

  const generate = async () => {
    if (dayRows.length === 0) {
      message.warning('Select at least one attendance date first.');
      return;
    }
    setLoading(true);
    try {
      const token = await getAccessToken(settings.googleClientId);
      const result = await createDarSpreadsheet(token, title, settings, dayRows, {
        periodCovered: period,
        dateSubmitted: dateSubmitted ? dayjs(dateSubmitted).format('MMMM D, YYYY') : '',
        daysAttended: dayRows.length,
      });
      setUrl(result.url);
      message.success('Spreadsheet created in your Google Drive.');
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (url) {
    return (
      <Result
        status="success"
        title="Your DAR is ready"
        subTitle={title}
        extra={[
          <Button key="open" type="primary" href={url} target="_blank" icon={<FileExcelOutlined />}>
            Open in Google Sheets
          </Button>,
          <Button key="again" onClick={() => setUrl(null)}>
            Generate another
          </Button>,
        ]}
      />
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="Google sign-in happens in a popup"
        description="The app asks only for permission to create spreadsheets and touch the files it creates (drive.file). Nothing else in your Drive is visible to it. Allow popups for this site."
      />

      <Card size="small" title="About to create">
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label="Spreadsheet name">{title}</Descriptions.Item>
          <Descriptions.Item label="Period covered">{period || '—'}</Descriptions.Item>
          <Descriptions.Item label="Day columns">{dayRows.length}</Descriptions.Item>
          <Descriptions.Item label="Days with an accomplishment">
            {dayRows.filter((row) => row.accomplishment.trim()).length}
          </Descriptions.Item>
          <Descriptions.Item label="Name of PBE">{settings.pbeName || '—'}</Descriptions.Item>
        </Descriptions>

        <Space style={{ marginTop: 16 }}>
          <Button
            type="primary"
            size="large"
            icon={<GoogleOutlined />}
            loading={loading}
            onClick={generate}
          >
            Sign in with Google &amp; generate sheet
          </Button>
          <Button onClick={signOut}>Sign out of Google</Button>
        </Space>

        {!settings.googleClientId && (
          <Text type="danger" style={{ display: 'block', marginTop: 12 }}>
            No Google Client ID configured — set VITE_GOOGLE_CLIENT_ID or paste one in Profile &amp;
            Settings.
          </Text>
        )}
      </Card>
    </Space>
  );
}
