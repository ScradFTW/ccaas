import { useEffect, useState } from 'react';
import { Button, Card, InputGroup, Link, TextField } from '@heroui/react';
import { api } from '../api';

function buildCronExpr(freq, { hour, minute, dow, custom }) {
  if (freq === 'custom') return custom.trim();
  if (freq === 'hourly') return `${minute} * * * *`;
  if (freq === 'weekly') return `${minute} ${hour} * * ${dow}`;
  return `${minute} ${hour} * * *`; // daily
}

function describeSchedule(job) {
  return job.cron_expr;
}

const SELECT_CLS = 'bg-field text-field-foreground border border-field-border rounded-field px-2 py-1.5 text-sm';

export function Scheduled({ onClose }) {
  const [jobs, setJobs] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [freq, setFreq] = useState('daily');
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [dow, setDow] = useState(1);
  const [custom, setCustom] = useState('0 9 * * *');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function refresh() {
    api.listCronJobs().then(setJobs).catch((err) => setError(err.message));
  }

  useEffect(refresh, []);

  async function create() {
    if (!prompt.trim()) return;
    setBusy(true);
    setError('');
    try {
      const cronExpr = buildCronExpr(freq, { hour, minute, dow, custom });
      await api.createCronJob(prompt.trim(), cronExpr);
      setPrompt('');
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(job) {
    await api.setCronJobEnabled(job.id, !job.enabled);
    refresh();
  }

  async function remove(job) {
    await api.deleteCronJob(job.id);
    refresh();
  }

  return (
    <div className="max-w-xl mx-auto my-8 w-full px-4">
      <Card>
        <Card.Header><Card.Title>Scheduled tasks</Card.Title></Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Your agent will run each prompt on its own schedule, even if you&apos;re not connected. Results show up here.
          </p>

          <TextField aria-label="Prompt" value={prompt} onChange={setPrompt}>
            <InputGroup>
              <InputGroup.TextArea rows={2} placeholder="What should it do? e.g. Check for new GitHub issues and summarize them"/>
            </InputGroup>
          </TextField>

          <select className={SELECT_CLS} value={freq} onChange={(e) => setFreq(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="hourly">Hourly</option>
            <option value="weekly">Weekly</option>
            <option value="custom">Custom cron expression</option>
          </select>

          {(freq === 'daily' || freq === 'weekly') && (
            <div className="flex items-center gap-3">
              {freq === 'weekly' && (
                <select className={SELECT_CLS} value={dow} onChange={(e) => setDow(Number(e.target.value))}>
                  <option value={0}>Sunday</option>
                  <option value={1}>Monday</option>
                  <option value={2}>Tuesday</option>
                  <option value={3}>Wednesday</option>
                  <option value={4}>Thursday</option>
                  <option value={5}>Friday</option>
                  <option value={6}>Saturday</option>
                </select>
              )}
              <span className="text-sm">at</span>
              <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} className={`${SELECT_CLS} w-16`}/>
              <span className="text-sm">:</span>
              <input type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(Number(e.target.value))} className={`${SELECT_CLS} w-16`}/>
            </div>
          )}

          {freq === 'hourly' && (
            <div className="flex items-center gap-3 text-sm">
              <span>at minute</span>
              <input type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(Number(e.target.value))} className={`${SELECT_CLS} w-16`}/>
              <span>of every hour</span>
            </div>
          )}

          {freq === 'custom' && (
            <TextField aria-label="Custom cron expression" value={custom} onChange={setCustom}>
              <InputGroup><InputGroup.Input placeholder="0 9 * * *"/></InputGroup>
            </TextField>
          )}

          <div className="flex items-center gap-3">
            <Button onPress={create} isDisabled={busy || !prompt.trim()}>Add scheduled task</Button>
            <Button variant="tertiary" onPress={onClose}>Back</Button>
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}

          <div className="flex flex-col gap-3 mt-2">
            {jobs.length === 0 && <p className="text-sm text-muted">No scheduled tasks yet.</p>}
            {jobs.map((job) => (
              <div key={job.id} className="bg-surface-secondary border border-border rounded-lg px-4 py-3">
                <div className="flex justify-between items-center">
                  <strong className="text-sm">{describeSchedule(job)}</strong>
                  <div className="flex items-center gap-3">
                    <Link onPress={() => toggle(job)}>{job.enabled ? 'Pause' : 'Resume'}</Link>
                    <Link onPress={() => remove(job)}>Delete</Link>
                  </div>
                </div>
                <div className="mt-1 text-sm text-foreground">{job.prompt}</div>
                {job.last_run_at && (
                  <div className={`mt-2 text-xs whitespace-pre-wrap break-words ${job.last_is_error ? 'text-danger' : 'text-muted'}`}>
                    Last run {job.last_run_at}: {job.last_result?.slice(0, 300)}
                  </div>
                )}
                {!job.enabled && <div className="mt-1 text-xs text-warning">Paused</div>}
              </div>
            ))}
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
