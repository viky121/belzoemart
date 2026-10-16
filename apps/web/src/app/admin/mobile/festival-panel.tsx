'use client';

import {
  FESTIVAL_THEMES,
  MOBILE_FESTIVALS,
  MOTIF_EMOJI,
  festivalGreeting,
  type MobileFestival,
} from '@belzo/shared';
import { scheduleSummary, type FestivalFields } from './festival-schedule';

/** Phone-style mock of the app header in the chosen festival colours. */
function Preview({ festival, greeting }: { festival: MobileFestival; greeting: string }) {
  const t = FESTIVAL_THEMES[festival];
  const tint = t.tints;
  return (
    <div className="fp-phone" aria-label={`Preview of the ${t.label} theme`}>
      <div className="fp-head" style={{ background: `linear-gradient(135deg, ${t.headerFrom}, ${t.headerTo})` }}>
        <div className="fp-brand">Belzo Mart</div>
        {festival !== 'none' && (
          <div className="fp-greet">
            <strong>{greeting}</strong>
            <span>{t.greetingLocal}</span>
            <div className="fp-motifs" aria-hidden="true">
              {t.motifs.map((m) => (
                <span key={m}>{MOTIF_EMOJI[m]}</span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="fp-cats">
        {tint.slice(0, 4).map((c, i) => (
          <span key={i} className="fp-cat" style={{ background: c }} />
        ))}
      </div>
      <div className="fp-btn" style={{ background: t.primary }}>
        Add to Cart
      </div>
      <div className="fp-chips">
        <span className="fp-chip fp-chip--on" style={{ background: t.primary }}>
          Selected
        </span>
        <span className="fp-chip" style={{ background: t.primaryBg, color: t.primary }}>
          Tag
        </span>
      </div>
    </div>
  );
}

/** Admin: pick the festival theme for the mobile app (applies after Save). */
export function FestivalPanel({
  value,
  onChange,
}: {
  value: FestivalFields;
  onChange: (patch: Partial<FestivalFields>) => void;
}) {
  const t = FESTIVAL_THEMES[value.festival];
  const greeting = festivalGreeting(value.festival, value.festivalGreeting);
  const summary = scheduleSummary(value);

  return (
    <div>
      <p className="prod-form__hint">
        Choose a festival and the app recolours its header, buttons, tabs and category circles, and shows a festive
        greeting with falling decorations. Set a start and end date and the app switches the theme on and off by
        itself, or leave the dates empty and switch back to “No festival” yourself.
      </p>

      <div className="fp-grid" role="radiogroup" aria-label="Festival theme">
        {MOBILE_FESTIVALS.map((id) => {
          const f = FESTIVAL_THEMES[id];
          const on = value.festival === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              className={`fp-card${on ? ' fp-card--on' : ''}`}
              onClick={() => onChange({ festival: id })}
              data-testid={`festival-${id}`}
            >
              <span
                className="fp-swatch"
                style={{ background: `linear-gradient(135deg, ${f.headerFrom}, ${f.headerTo})` }}
              >
                <span className="fp-emoji">{f.emoji}</span>
              </span>
              <span className="fp-label">{f.label}</span>
              {on && <span className="fp-tick" aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>

      <div className="fp-detail">
        <Preview festival={value.festival} greeting={greeting} />
        <div className="fp-opts">
          <p>
            <strong>{t.label}</strong>
            {value.festival === 'none' ? ' — the app keeps its normal green look.' : ' — selected. Press Save changes to publish.'}
          </p>
          {value.festival !== 'none' && (
            <>
              <label className="auth-label" htmlFor="fp-greeting">
                Greeting text (optional)
              </label>
              <input
                id="fp-greeting"
                className="auth-input"
                maxLength={60}
                placeholder={t.greeting}
                value={value.festivalGreeting}
                onChange={(e) => onChange({ festivalGreeting: e.target.value })}
                style={{ maxWidth: 360 }}
              />
              <span className="prod-form__hint">Leave empty to use “{t.greeting}”.</span>

              <fieldset className="fp-schedule">
                <legend>Schedule (optional, India time)</legend>
                <div className="fp-dates">
                  <label htmlFor="fp-start">
                    Start date
                    <input
                      id="fp-start"
                      type="date"
                      className="auth-input"
                      value={value.festivalStart}
                      max={value.festivalEnd || undefined}
                      onChange={(e) => onChange({ festivalStart: e.target.value })}
                    />
                  </label>
                  <label htmlFor="fp-end">
                    End date (last day shown)
                    <input
                      id="fp-end"
                      type="date"
                      className="auth-input"
                      value={value.festivalEnd}
                      min={value.festivalStart || undefined}
                      onChange={(e) => onChange({ festivalEnd: e.target.value })}
                    />
                  </label>
                  {(value.festivalStart || value.festivalEnd) && (
                    <button
                      type="button"
                      className="mh-link-btn"
                      onClick={() => onChange({ festivalStart: '', festivalEnd: '' })}
                    >
                      Clear dates
                    </button>
                  )}
                </div>
                <p className={`fp-status fp-status--${summary.tone}`} role="status" data-testid="festival-schedule-status">
                  {summary.text}
                </p>
              </fieldset>

              <label className="mh-check" style={{ marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={value.festivalDecor}
                  onChange={(e) => onChange({ festivalDecor: e.target.checked })}
                />
                Show falling decorations (turned off automatically for users who enabled “reduce motion”)
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
