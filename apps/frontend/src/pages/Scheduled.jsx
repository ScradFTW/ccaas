import { useEffect, useState } from 'react';
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
    <div className="card settings">
      <h2>Scheduled tasks</h2>
      <p>
        Claude Code will run each prompt on its own schedule, even if you're not connected.
        Results show up here.
      </p>

      <div className="mode-toggle">
        <textarea
          rows={2}
          placeholder="What should Claude do? e.g. Check for new GitHub issues and summarize them"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />

        <select value={freq} onChange={(e) => setFreq(e.target.value)}>
          <option value="daily">Daily</option>
          <option value="hourly">Hourly</option>
          <option value="weekly">Weekly</option>
          <option value="custom">Custom cron expression</option>
        </select>

        {(freq === 'daily' || freq === 'weekly') && (
          <div className="row">
            {freq === 'weekly' && (
              <select value={dow} onChange={(e) => setDow(Number(e.target.value))}>
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
              </select>
            )}
            <span>at</span>
            <input
              type="number"
              min={0}
              max={23}
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              style={{ width: '4rem' }}
            />
            <span>:</span>
            <input
              type="number"
              min={0}
              max={59}
              value={minute}
              onChange={(e) => setMinute(Number(e.target.value))}
              style={{ width: '4rem' }}
            />
          </div>
        )}

        {freq === 'hourly' && (
          <div className="row">
            <span>at minute</span>
            <input
              type="number"
              min={0}
              max={59}
              value={minute}
              onChange={(e) => setMinute(Number(e.target.value))}
              style={{ width: '4rem' }}
            />
            <span>of every hour</span>
          </div>
        )}

        {freq === 'custom' && (
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="0 9 * * *" />
        )}

        <div className="row">
          <button className="button" onClick={create} disabled={busy || !prompt.trim()}>
            Add scheduled task
          </button>
          <button className="button secondary" onClick={onClose}>
            Back
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="cron-list">
        {jobs.length === 0 && <p>No scheduled tasks yet.</p>}
        {jobs.map((job) => (
          <div key={job.id} className="cron-job">
            <div className="cron-job-header">
              <strong>{describeSchedule(job)}</strong>
              <div className="row">
                <button className="link" onClick={() => toggle(job)}>
                  {job.enabled ? 'Pause' : 'Resume'}
                </button>
                <button className="link" onClick={() => remove(job)}>
                  Delete
                </button>
              </div>
            </div>
            <div className="cron-job-prompt">{job.prompt}</div>
            {job.last_run_at && (
              <div className={`cron-job-result ${job.last_is_error ? 'chat-tool-error' : ''}`}>
                Last run {job.last_run_at}: {job.last_result?.slice(0, 300)}
              </div>
            )}
            {!job.enabled && <div className="cron-job-paused">Paused</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
