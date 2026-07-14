import { Alert, Button, Card, Col, Divider, Input, InputNumber, Row, Space, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { Settings, SupportFunction } from '../types';

const { Text, Link } = Typography;

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Text strong style={{ display: 'block', marginBottom: 4 }}>
        {label}
      </Text>
      {children}
    </div>
  );
}

export default function ProfileStep({ settings, onChange, onReset }: Props) {
  const updateSupport = (id: string, patch: Partial<SupportFunction>) => {
    onChange({
      supportFunctions: settings.supportFunctions.map((fn) =>
        fn.id === id ? { ...fn, ...patch } : fn,
      ),
    });
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="Employee profile" size="small">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Field label="Name of PBE">
              <Input
                value={settings.pbeName}
                onChange={(e) => onChange({ pbeName: e.target.value })}
                placeholder="CER EJIE C. LISONDATO"
              />
            </Field>
            <Field label="Position Title">
              <Input
                value={settings.positionTitle}
                onChange={(e) => onChange({ positionTitle: e.target.value })}
                placeholder="Senior Computer Services Programmer"
              />
            </Field>
            <Field label="Department">
              <Input
                value={settings.department}
                onChange={(e) => onChange({ department: e.target.value })}
              />
            </Field>
          </Col>
          <Col xs={24} md={12}>
            <Field label="Unit">
              <Input value={settings.unit} onChange={(e) => onChange({ unit: e.target.value })} />
            </Field>
            <Field label="Immediate Supervisor">
              <Input
                value={settings.supervisor}
                onChange={(e) => onChange({ supervisor: e.target.value })}
              />
            </Field>
          </Col>
        </Row>
      </Card>

      <Card title="Report header" size="small">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Field label="Organization name">
              <Input
                value={settings.orgName}
                onChange={(e) => onChange({ orgName: e.target.value })}
              />
            </Field>
            <Field label="Address line">
              <Input
                value={settings.orgAddress}
                onChange={(e) => onChange({ orgAddress: e.target.value })}
              />
            </Field>
          </Col>
          <Col xs={24} md={12}>
            <Field label="Report title">
              <Input
                value={settings.reportTitle}
                onChange={(e) => onChange({ reportTitle: e.target.value })}
              />
            </Field>
          </Col>
        </Row>
      </Card>

      <Card title="A.) Core function" size="small">
        <Field label="Duty description">
          <Input.TextArea
            rows={2}
            value={settings.coreDuty}
            onChange={(e) => onChange({ coreDuty: e.target.value })}
          />
        </Field>
        <Field label="Major Final Output (MFO)">
          <Input.TextArea
            rows={3}
            value={settings.coreMfo}
            onChange={(e) => onChange({ coreMfo: e.target.value })}
          />
        </Field>
      </Card>

      <Card
        title="B.) Support functions"
        size="small"
        extra={
          <Space>
            <Text type="secondary">First row number</Text>
            <InputNumber
              min={1}
              value={settings.supportStartNumber}
              onChange={(v) => onChange({ supportStartNumber: v ?? 5 })}
              style={{ width: 70 }}
            />
          </Space>
        }
      >
        {settings.supportFunctions.map((fn, i) => (
          <div key={fn.id}>
            {i > 0 && <Divider style={{ margin: '12px 0' }} />}
            <Row gutter={16} align="top">
              <Col flex="auto">
                <Field label={`Duty ${settings.supportStartNumber + i}`}>
                  <Input.TextArea
                    rows={2}
                    value={fn.name}
                    onChange={(e) => updateSupport(fn.id, { name: e.target.value })}
                  />
                </Field>
                <Field label="Minor Final Outputs (one sub-row each)">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {fn.mfos.map((mfo, j) => (
                      <Space.Compact key={j} style={{ width: '100%' }}>
                        <Input.TextArea
                          rows={2}
                          value={mfo}
                          onChange={(e) =>
                            updateSupport(fn.id, {
                              mfos: fn.mfos.map((m, k) => (k === j ? e.target.value : m)),
                            })
                          }
                        />
                        <Button
                          icon={<DeleteOutlined />}
                          disabled={fn.mfos.length === 1}
                          onClick={() =>
                            updateSupport(fn.id, { mfos: fn.mfos.filter((_, k) => k !== j) })
                          }
                        />
                      </Space.Compact>
                    ))}
                    <Button
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => updateSupport(fn.id, { mfos: [...fn.mfos, ''] })}
                    >
                      Add MFO sub-row
                    </Button>
                  </Space>
                </Field>
              </Col>
              <Col>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  disabled={settings.supportFunctions.length === 1}
                  onClick={() =>
                    onChange({
                      supportFunctions: settings.supportFunctions.filter((f) => f.id !== fn.id),
                    })
                  }
                />
              </Col>
            </Row>
          </div>
        ))}
        <Divider style={{ margin: '12px 0' }} />
        <Button
          icon={<PlusOutlined />}
          onClick={() =>
            onChange({
              supportFunctions: [
                ...settings.supportFunctions,
                { id: crypto.randomUUID(), name: '', mfos: [''] },
              ],
            })
          }
        >
          Add support function
        </Button>
      </Card>

      <Card title="Signatories" size="small">
        <Row gutter={16}>
          {(
            [
              ['Prepared by', 'preparedBy'],
              ['Confirmed by', 'confirmedBy'],
              ['Noted by', 'notedBy'],
            ] as const
          ).map(([label, key]) => (
            <Col xs={24} md={8} key={key}>
              <Field label={`${label} — name`}>
                <Input
                  value={settings[key].name}
                  onChange={(e) => onChange({ [key]: { ...settings[key], name: e.target.value } })}
                />
              </Field>
              <Field label={`${label} — title`}>
                <Input
                  value={settings[key].title}
                  onChange={(e) => onChange({ [key]: { ...settings[key], title: e.target.value } })}
                />
              </Field>
            </Col>
          ))}
        </Row>
      </Card>

      <Card title="Credentials" size="small">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Your token stays on this device"
          description={
            <>
              The PAT is saved in this browser's localStorage only — it is never sent anywhere
              except to GitHub. Create a fine-grained token with <Text code>Contents: Read-only</Text>{' '}
              (and <Text code>Metadata: Read-only</Text>) access to the repos you report on at{' '}
              <Link href="https://github.com/settings/tokens" target="_blank">
                github.com/settings/tokens
              </Link>
              . A classic token with the <Text code>repo</Text> scope also works.
            </>
          }
        />
        <Field label="GitHub Personal Access Token">
          <Input.Password
            value={settings.githubToken}
            onChange={(e) => onChange({ githubToken: e.target.value })}
            placeholder="github_pat_…"
            autoComplete="off"
          />
        </Field>
        {/* <Field  label="Gemini API key (optional if set in .env)">
          <Input.Password
            value={settings.geminiApiKey}
            onChange={(e) => onChange({ geminiApiKey: e.target.value })}
            placeholder="AIza…"
            autoComplete="off"
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Used to turn each day's code changes into the accomplishment sentence. Auto-loads from{' '}
            <Text code>VITE_GEMINI_API_KEY</Text> in .env if set. Get a free key at{' '}
            <Link href="https://aistudio.google.com/apikey" target="_blank">
              aistudio.google.com/apikey
            </Link>
            {' '}— the free tier covers this app comfortably.
          </Text>
        </Field> */}
        <Button danger onClick={onReset}>
          Reset all settings
        </Button>
      </Card>
    </Space>
  );
}
