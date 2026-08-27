import { clickThroughCopy } from '../../click-through';
import { singleRangeStyle } from '../../range-slider';
import {
  MAX_AVATAR_WINDOW_HEIGHT,
  MAX_AVATAR_WINDOW_WIDTH,
  DEFAULT_CURSOR_GAZE,
  MAX_GAZE_NOTICE_RADIUS,
  MAX_GAZE_REACTION_SIZE,
  MIN_AVATAR_WINDOW_HEIGHT,
  MIN_AVATAR_WINDOW_WIDTH,
  MIN_GAZE_NOTICE_RADIUS,
  MIN_GAZE_REACTION_SIZE,
  type LightingNumberField,
} from '../../settings-defaults';
import { THEME_OPTIONS, type ThemePreference } from '../../theme';

const GAZE_SLIDERS: readonly {
  field: keyof PersonaCursorGazeSettings;
  label: string;
  min: number;
  max: number;
  /** The middle mark on the scale, which is what the character ships with. */
  base: number;
  step: number;
  format: (value: number) => string;
}[] = [
  {
    field: 'reaction_size',
    label: 'Reaction size',
    min: MIN_GAZE_REACTION_SIZE,
    max: MAX_GAZE_REACTION_SIZE,
    base: DEFAULT_CURSOR_GAZE.reaction_size,
    step: 0.1,
    format: (value) => `${value.toFixed(1)}x`,
  },
  {
    field: 'notice_radius',
    label: 'Notices within',
    min: MIN_GAZE_NOTICE_RADIUS,
    max: MAX_GAZE_NOTICE_RADIUS,
    base: DEFAULT_CURSOR_GAZE.notice_radius,
    step: 0.05,
    format: (value) => `${value.toFixed(2)}m`,
  },
  {
    field: 'eyes_only_chance',
    label: 'Eyes-only glances',
    min: 0,
    max: 1,
    base: DEFAULT_CURSOR_GAZE.eyes_only_chance,
    step: 0.05,
    format: (value) => `${Math.round(value * 100)}%`,
  },
];

interface AppearanceSectionProps {
  avatarHeightInput: string;
  avatarWidthInput: string;
  avatarWindowSizeChanged: boolean;
  avatarWindowSizeValid: boolean;
  bridge: Window['personaSettings'];
  busy: boolean;
  chooseTheme: (preference: ThemePreference) => void;
  clickThroughMode: ClickThroughMode | null;
  previewCharacterSize: (size: number) => void;
  previewClickThroughEnabled: (enabled: boolean) => void;
  previewLookAtCursor: (enabled: boolean) => void;
  previewCursorGazeNumber: (
    field: keyof PersonaCursorGazeSettings,
    input: HTMLInputElement,
  ) => void;
  previewLighting: PersonaLightingSettings;
  previewLightingField: <Field extends keyof PersonaLightingSettings>(
    field: Field,
    value: PersonaLightingSettings[Field],
  ) => void;
  previewLightingNumber: (
    field: LightingNumberField,
    input: HTMLInputElement,
  ) => void;
  resetLighting: () => Promise<void>;
  saveAvatarWindowSize: () => Promise<void>;
  saveCharacterSize: (size: number) => Promise<void>;
  saveClickThroughEnabled: (enabled: boolean) => Promise<void>;
  saveLookAtCursor: (enabled: boolean) => Promise<void>;
  saveCursorGazeNumber: (
    field: keyof PersonaCursorGazeSettings,
    input: HTMLInputElement,
  ) => Promise<void>;
  saveLightingField: <Field extends keyof PersonaLightingSettings>(
    field: Field,
    value: PersonaLightingSettings[Field],
  ) => Promise<void>;
  saveLightingNumber: (
    field: LightingNumberField,
    input: HTMLInputElement,
  ) => void;
  selectedModel: PersonaModelSettings | undefined;
  setAvatarHeightInput: (height: string) => void;
  setAvatarWidthInput: (width: string) => void;
  settings: PersonaSettingsSnapshot;
  themePreference: ThemePreference;
}

export function AppearanceSection({
  avatarHeightInput,
  avatarWidthInput,
  avatarWindowSizeChanged,
  avatarWindowSizeValid,
  bridge,
  busy,
  chooseTheme,
  clickThroughMode,
  previewCharacterSize,
  previewClickThroughEnabled,
  previewLookAtCursor,
  previewCursorGazeNumber,
  previewLighting,
  previewLightingField,
  previewLightingNumber,
  resetLighting,
  saveAvatarWindowSize,
  saveCharacterSize,
  saveClickThroughEnabled,
  saveLookAtCursor,
  saveCursorGazeNumber,
  saveLightingField,
  saveLightingNumber,
  selectedModel,
  setAvatarHeightInput,
  setAvatarWidthInput,
  settings,
  themePreference,
}: AppearanceSectionProps) {
  const clickThrough = clickThroughMode
    ? clickThroughCopy(clickThroughMode)
    : null;
  return (
    <>
      <section className="settings-panel theme-panel">
        <div className="panel-heading">
          <div>
            <h2>Theme</h2>
            <p>
              Sets how this settings window looks. The character overlay
              stays transparent in every theme.
            </p>
          </div>
        </div>
        <div
          aria-label="Theme"
          className="theme-segmented"
          role="group"
        >
          {THEME_OPTIONS.map((option) => (
            <button
              aria-pressed={themePreference === option.id}
              data-testid={`theme-${option.id}`}
              key={option.id}
              onClick={() => chooseTheme(option.id)}
              type="button"
            >
              <span
                aria-hidden="true"
                className="theme-swatch"
                data-theme-preview={option.id}
              />
              {option.label}
            </button>
          ))}
        </div>
        <p className="theme-note">
          System follows your desktop appearance and updates when it
          changes.
        </p>
      </section>

      <section className="settings-panel appearance-panel">
        <div className="panel-heading">
          <div>
            <h2>Default character size</h2>
            <p>
              Set how large Persona appears when a model is first framed.
              You can still zoom and pan the live avatar manually.
            </p>
          </div>
          <strong className="size-value">
            {Math.round(settings.character_size * 100)}%
          </strong>
        </div>
        <input
          aria-label="Default character size"
          className="single-range-slider size-slider"
          max="1.6"
          min="0.7"
          onBlur={(event) =>
            void saveCharacterSize(Number(event.currentTarget.value))
          }
          onChange={(event) =>
            previewCharacterSize(Number(event.currentTarget.value))
          }
          onKeyUp={(event) => {
            if (event.key.startsWith('Arrow')) {
              void saveCharacterSize(
                Number(event.currentTarget.value),
              );
            }
          }}
          onPointerUp={(event) =>
            void saveCharacterSize(Number(event.currentTarget.value))
          }
          step="0.05"
          style={singleRangeStyle(settings.character_size, 0.7, 1.6)}
          type="range"
          value={settings.character_size}
        />
        <div className="slider-labels">
          <span>70%</span>
          <span>Default</span>
          <span>160%</span>
        </div>
      </section>

      <section className="settings-panel appearance-panel">
        <div className="panel-heading">
          <div>
            <h2>Avatar window size</h2>
            <p>
              Set the pixel width and height of the Avatar window.
            </p>
          </div>
        </div>
        <div className="avatar-window-size-row">
          <label>
            Width
            <input
              aria-label="Avatar window width"
              max={MAX_AVATAR_WINDOW_WIDTH}
              min={MIN_AVATAR_WINDOW_WIDTH}
              onChange={(event) =>
                setAvatarWidthInput(event.currentTarget.value)
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') void saveAvatarWindowSize();
              }}
              step="1"
              type="number"
              value={avatarWidthInput}
            />
          </label>
          <label>
            Height
            <input
              aria-label="Avatar window height"
              max={MAX_AVATAR_WINDOW_HEIGHT}
              min={MIN_AVATAR_WINDOW_HEIGHT}
              onChange={(event) =>
                setAvatarHeightInput(event.currentTarget.value)
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') void saveAvatarWindowSize();
              }}
              step="1"
              type="number"
              value={avatarHeightInput}
            />
          </label>
          <button
            className="btn btn-primary"
            disabled={
              busy ||
              !bridge ||
              !avatarWindowSizeValid ||
              !avatarWindowSizeChanged
            }
            onClick={() => void saveAvatarWindowSize()}
            type="button"
          >
            Apply
          </button>
        </div>
        {!bridge && (
          <p className="desktop-note">
            Resizing the avatar window is available in the Persona
            desktop app.
          </p>
        )}
      </section>

      <section className="settings-panel appearance-panel">
        <div className="panel-heading">
          <div>
            <h2>Click-through</h2>
            <p>
              Let the avatar float over the desktop instead of catching
              clicks meant for what sits behind it.
            </p>
          </div>
        </div>
        <div className="lighting-toggle-row">
          <span>Pass clicks through</span>
          <button
            aria-checked={settings.click_through_enabled}
            className={`toggle-switch${settings.click_through_enabled ? ' active' : ''}`}
            disabled={busy || !bridge || !clickThroughMode}
            onClick={() => {
              const next = !settings.click_through_enabled;
              previewClickThroughEnabled(next);
              void saveClickThroughEnabled(next);
            }}
            role="switch"
            type="button"
          />
        </div>
        {clickThrough && (
          <>
            <p className="theme-note">{clickThrough.description}</p>
            <p className="theme-note">{clickThrough.note}</p>
          </>
        )}
        {!bridge && (
          <p className="desktop-note">
            Click-through is available in the Persona desktop app.
          </p>
        )}
      </section>

      <section className="settings-panel appearance-panel">
        <div className="panel-heading">
          <div>
            <h2>Cursor</h2>
            <p>
              Let the character notice the pointer, so the window reads as
              something to reach for rather than a picture.
            </p>
          </div>
        </div>
        <div className="lighting-toggle-row">
          <span>Follow the cursor</span>
          <button
            aria-checked={settings.look_at_cursor}
            className={`toggle-switch${settings.look_at_cursor ? ' active' : ''}`}
            disabled={busy || !bridge}
            onClick={() => {
              const next = !settings.look_at_cursor;
              previewLookAtCursor(next);
              void saveLookAtCursor(next);
            }}
            role="switch"
            type="button"
          />
        </div>
        <p className="theme-note">
          The character turns its head and eyes toward the pointer as it comes
          near, and looks away again once it leaves. The pointer always shows an
          open hand over the character, whether or not this is on.
        </p>
        <p className="theme-note">
          The distance she notices from is measured against her own size, not
          against the window, so it means the same after a resize.
        </p>

        {GAZE_SLIDERS.map((slider) => (
          <div className="lighting-row" key={slider.field}>
            <label>
              <span>
                {slider.label}
                <small className="transition-range-state">
                  {slider.format(settings.cursor_gaze[slider.field])}
                </small>
              </span>
              <input
                className="single-range-slider"
                disabled={busy || !bridge || !settings.look_at_cursor}
                max={slider.max}
                min={slider.min}
                onChange={(event) =>
                  previewCursorGazeNumber(slider.field, event.currentTarget)
                }
                onKeyUp={(event) => {
                  if (event.key.startsWith('Arrow')) {
                    void saveCursorGazeNumber(slider.field, event.currentTarget);
                  }
                }}
                onPointerUp={(event) =>
                  void saveCursorGazeNumber(slider.field, event.currentTarget)
                }
                step={slider.step}
                style={singleRangeStyle(
                  settings.cursor_gaze[slider.field],
                  slider.min,
                  slider.max,
                )}
                type="range"
                value={settings.cursor_gaze[slider.field]}
              />
              <div className="slider-labels">
                <span>{slider.format(slider.min)}</span>
                <span>{slider.format(slider.base)}</span>
                <span>{slider.format(slider.max)}</span>
              </div>
            </label>
          </div>
        ))}
        {!bridge && (
          <p className="desktop-note">
            Following the cursor is available in the Persona desktop app.
          </p>
        )}
      </section>

      <section className="settings-panel lighting-panel">
        <div className="panel-heading">
          <div>
            <h2>Lighting</h2>
            <p>
              Adjust environment and key light for VRM models that look
              overexposed or too dark.
            </p>
          </div>
          <div className="panel-actions">
            <button
              className="btn btn-secondary"
              disabled={busy || !bridge || !selectedModel}
              onClick={() => void resetLighting()}
              type="button"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="lighting-select-row">
          <span>Tone mapping</span>
          <select
            disabled={busy || !bridge || !selectedModel}
            onChange={(e) => {
              const value = e.currentTarget.value as
                | 'none'
                | 'aces';
              previewLightingField('tone_mapping', value);
              void saveLightingField('tone_mapping', value);
            }}
            value={previewLighting.tone_mapping}
          >
            <option value="none">None</option>
            <option value="aces">ACES Filmic</option>
          </select>
        </div>

        <div className="lighting-toggle-row">
          <span>HDR environment</span>
          <button
            aria-checked={previewLighting.environment_enabled}
            className={`toggle-switch${previewLighting.environment_enabled ? ' active' : ''}`}
            disabled={busy || !bridge || !selectedModel}
            onClick={() => {
              const next = !previewLighting.environment_enabled;
              previewLightingField('environment_enabled', next);
              void saveLightingField('environment_enabled', next);
            }}
            role="switch"
            type="button"
          />
        </div>

        <div className="lighting-row">
          <label>
            <span>Environment intensity</span>
            <input
              className="single-range-slider"
              disabled={busy || !bridge || !selectedModel}
              max="2"
              min="0"
              onChange={(event) =>
                previewLightingNumber(
                  'environment_intensity',
                  event.currentTarget,
                )
              }
              onKeyUp={(event) =>
                saveLightingNumber(
                  'environment_intensity',
                  event.currentTarget,
                )
              }
              onPointerUp={(event) =>
                saveLightingNumber(
                  'environment_intensity',
                  event.currentTarget,
                )
              }
              step="0.01"
              style={singleRangeStyle(
                previewLighting.environment_intensity,
                0,
                2,
              )}
              type="range"
              value={previewLighting.environment_intensity}
            />
            <div className="slider-labels">
              <span>0.00</span>
              <span>1.00</span>
              <span>2.00</span>
            </div>
          </label>
          <input
            className="lighting-value"
            disabled={busy || !bridge || !selectedModel}
            max="2"
            min="0"
            onBlur={(event) =>
              saveLightingNumber(
                'environment_intensity',
                event.currentTarget,
              )
            }
            onChange={(event) =>
              previewLightingNumber(
                'environment_intensity',
                event.currentTarget,
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            step="0.01"
            type="number"
            value={previewLighting.environment_intensity}
          />
        </div>

        <div className="lighting-row">
          <label>
            <span>Key light intensity</span>
            <input
              className="single-range-slider"
              disabled={busy || !bridge || !selectedModel}
              max="4"
              min="0"
              onChange={(event) =>
                previewLightingNumber(
                  'key_light_intensity',
                  event.currentTarget,
                )
              }
              onKeyUp={(event) =>
                saveLightingNumber(
                  'key_light_intensity',
                  event.currentTarget,
                )
              }
              onPointerUp={(event) =>
                saveLightingNumber(
                  'key_light_intensity',
                  event.currentTarget,
                )
              }
              step="0.01"
              style={singleRangeStyle(
                previewLighting.key_light_intensity,
                0,
                4,
              )}
              type="range"
              value={previewLighting.key_light_intensity}
            />
            <div className="slider-labels">
              <span>0.00</span>
              <span>{Math.PI.toFixed(2)}</span>
              <span>4.00</span>
            </div>
          </label>
          <input
            className="lighting-value"
            disabled={busy || !bridge || !selectedModel}
            max="4"
            min="0"
            onBlur={(event) =>
              saveLightingNumber(
                'key_light_intensity',
                event.currentTarget,
              )
            }
            onChange={(event) =>
              previewLightingNumber(
                'key_light_intensity',
                event.currentTarget,
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            step="0.01"
            type="number"
            value={previewLighting.key_light_intensity}
          />
        </div>

        <div className="lighting-row">
          <label>
            <span>Ambient / fill intensity</span>
            <input
              className="single-range-slider"
              disabled={busy || !bridge || !selectedModel}
              max="4"
              min="0"
              onChange={(event) =>
                previewLightingNumber(
                  'ambient_intensity',
                  event.currentTarget,
                )
              }
              onKeyUp={(event) =>
                saveLightingNumber(
                  'ambient_intensity',
                  event.currentTarget,
                )
              }
              onPointerUp={(event) =>
                saveLightingNumber(
                  'ambient_intensity',
                  event.currentTarget,
                )
              }
              step="0.01"
              style={singleRangeStyle(
                previewLighting.ambient_intensity,
                0,
                4,
              )}
              type="range"
              value={previewLighting.ambient_intensity}
            />
            <div className="slider-labels">
              <span>0.00</span>
              <span>{Math.PI.toFixed(2)}</span>
              <span>4.00</span>
            </div>
          </label>
          <input
            className="lighting-value"
            disabled={busy || !bridge || !selectedModel}
            max="4"
            min="0"
            onBlur={(event) =>
              saveLightingNumber(
                'ambient_intensity',
                event.currentTarget,
              )
            }
            onChange={(event) =>
              previewLightingNumber(
                'ambient_intensity',
                event.currentTarget,
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            step="0.01"
            type="number"
            value={previewLighting.ambient_intensity}
          />
        </div>

        <div className="lighting-row">
          <label>
            <span>Exposure</span>
            <input
              className="single-range-slider"
              disabled={busy || !bridge || !selectedModel}
              max="3"
              min="0.1"
              onChange={(event) =>
                previewLightingNumber(
                  'exposure',
                  event.currentTarget,
                )
              }
              onKeyUp={(event) =>
                saveLightingNumber(
                  'exposure',
                  event.currentTarget,
                )
              }
              onPointerUp={(event) =>
                saveLightingNumber(
                  'exposure',
                  event.currentTarget,
                )
              }
              step="0.01"
              style={singleRangeStyle(
                previewLighting.exposure,
                0.1,
                3,
              )}
              type="range"
              value={previewLighting.exposure}
            />
            <div className="slider-labels">
              <span>0.10</span>
              <span>1.00</span>
              <span>3.00</span>
            </div>
          </label>
          <input
            className="lighting-value"
            disabled={busy || !bridge || !selectedModel}
            max="3"
            min="0.1"
            onBlur={(event) =>
              saveLightingNumber('exposure', event.currentTarget)
            }
            onChange={(event) =>
              previewLightingNumber('exposure', event.currentTarget)
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            step="0.01"
            type="number"
            value={previewLighting.exposure}
          />
        </div>
      </section>
    </>
  );
}
