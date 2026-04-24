import React from 'react';
import { CheckIcon } from './spelling-icons.jsx';
import {
  feedbackTone,
  pathProgressDots,
} from './spelling-view-model.js';

const useMeasuredLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;
const CLOZE_BLANK_PATTERN = /_{5,}/;
const COUNT_UP_MIN_MS = 360;
const COUNT_UP_MAX_MS = 920;
const COUNT_UP_MS_PER_STEP = 9;

export const spellingAnswerInputProps = {
  autoComplete: 'off',
  autoCapitalize: 'none',
  autoCorrect: 'off',
  spellCheck: false,
};

function numericCountTarget(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Math.max(0, Number.parseInt(trimmed, 10));
}

function countDuration(from, to) {
  const distance = Math.abs(to - from);
  return Math.min(COUNT_UP_MAX_MS, Math.max(COUNT_UP_MIN_MS, distance * COUNT_UP_MS_PER_STEP));
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function CountUpValue({
  as: Element = 'span',
  value,
  className = '',
}) {
  const target = numericCountTarget(value);
  const initialValue = target == null ? value : target;
  const [displayValue, setDisplayValue] = React.useState(initialValue);
  const [isCounting, setIsCounting] = React.useState(false);
  const displayRef = React.useRef(initialValue);

  React.useEffect(() => {
    if (target == null) {
      displayRef.current = value;
      setDisplayValue(value);
      setIsCounting(false);
      return undefined;
    }

    if (prefersReducedMotion() || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      displayRef.current = target;
      setDisplayValue(target);
      setIsCounting(false);
      return undefined;
    }

    const startValue = Number(displayRef.current);
    if (!Number.isFinite(startValue) || startValue === target) {
      displayRef.current = target;
      setDisplayValue(target);
      setIsCounting(false);
      return undefined;
    }

    let frameId = 0;
    const startTime = window.performance?.now?.() ?? Date.now();
    const duration = countDuration(startValue, target);
    const distance = target - startValue;
    setIsCounting(true);

    const tick = (now) => {
      const elapsed = Math.max(0, now - startTime);
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - ((1 - progress) ** 3);
      const nextValue = Math.round(startValue + (distance * eased));
      displayRef.current = nextValue;
      setDisplayValue(nextValue);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
        return;
      }
      displayRef.current = target;
      setDisplayValue(target);
      setIsCounting(false);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      setIsCounting(false);
    };
  }, [target, value]);

  const classes = [className, isCounting ? 'is-counting' : ''].filter(Boolean).join(' ');
  const props = {
    className: classes || undefined,
  };
  if (target != null) {
    props['data-count-target'] = String(target);
  }

  return <Element {...props}>{target == null ? String(displayValue || '') : displayValue}</Element>;
}

function measurePromptCardHeight(cardNode, contentNode) {
  if (!cardNode || !contentNode || typeof window === 'undefined') return null;
  const styles = window.getComputedStyle(cardNode);
  const chromeHeight = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
    .reduce((sum, key) => sum + (Number.parseFloat(styles[key] || '0') || 0), 0);
  return Math.ceil(contentNode.getBoundingClientRect().height + chromeHeight);
}

export function PathProgress({ done, current, total }) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const dots = pathProgressDots({ done, current, total });
  return (
    <div className="path" aria-label={`Word ${Math.min(safeTotal, current + 1)} of ${safeTotal}`}>
      {dots.map((state, index) => (
        <span
          className={`path-step${state ? ` ${state}` : ''}`}
          key={`${state || 'pending'}-${index}`}
          style={{ '--path-step-index': index }}
        />
      ))}
    </div>
  );
}

export function Cloze({ sentence, answer = '', revealAnswer = false }) {
  const raw = String(sentence || '');
  const blankMatch = raw.match(CLOZE_BLANK_PATTERN);
  if (!blankMatch || typeof blankMatch.index !== 'number') return <div className="cloze">{raw}</div>;
  const lead = raw.slice(0, blankMatch.index);
  const tail = raw.slice(blankMatch.index + blankMatch[0].length);
  return (
    <div className="cloze">
      {lead}
      <span className="blank">{revealAnswer && answer ? answer : '\u00a0'}</span>
      {tail}
    </div>
  );
}

export function FamilyChips({ words, label = 'Word family', requireMultiple = true }) {
  const list = Array.isArray(words) ? words.filter(Boolean) : [];
  if (requireMultiple && list.length <= 1) return null;
  if (!list.length) return null;
  return (
    <div className="family-chips">
      {label ? <span className="flabel">{label}</span> : null}
      {list.map((word) => <span className="fchip" key={word}>{word}</span>)}
    </div>
  );
}

export function Ribbon({ tone, icon, headline, word, sub }) {
  return (
    <div className={`ribbon ${tone}`} role="status">
      <div className="ribbon-ic">{icon || null}</div>
      <div className="ribbon-body">
        {headline ? <b>{headline}</b> : null}
        {word ? <span className="word">“{word}”</span> : null}
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
    </div>
  );
}

export function AnimatedPromptCard({
  className = '',
  innerClassName = '',
  children,
  heightKey = '',
  lockHeightToKey = false,
}) {
  const cardRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const [height, setHeight] = React.useState(null);

  useMeasuredLayoutEffect(() => {
    const cardNode = cardRef.current;
    const node = contentRef.current;
    if (!cardNode || !node || typeof window === 'undefined') return undefined;

    let frameId = 0;
    let settleTimerId = 0;
    let cancelled = false;
    const measure = () => {
      frameId = 0;
      const nextHeight = measurePromptCardHeight(cardNode, node);
      if (!nextHeight) return;
      setHeight((current) => (current === nextHeight ? current : nextHeight));
    };
    const scheduleMeasure = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(measure);
    };
    const scheduleSettle = () => {
      scheduleMeasure();
      if (settleTimerId) window.clearTimeout(settleTimerId);
      settleTimerId = window.setTimeout(scheduleMeasure, 80);
    };

    scheduleSettle();
    window.addEventListener('resize', scheduleSettle);

    const observer = !lockHeightToKey && typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => scheduleMeasure())
      : null;
    observer?.observe(node);
    if (typeof document !== 'undefined' && document.fonts?.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(() => {
        if (!cancelled) scheduleMeasure();
      }).catch(() => {});
    }

    return () => {
      cancelled = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      if (settleTimerId) window.clearTimeout(settleTimerId);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleSettle);
    };
  }, [heightKey, lockHeightToKey]);

  const classes = ['prompt-card', 'animated-prompt-card', className].filter(Boolean).join(' ');
  const innerClasses = ['prompt-card-inner', innerClassName].filter(Boolean).join(' ');
  const style = height ? { '--prompt-card-height': `${height}px` } : undefined;

  return (
    <div className={classes} style={style} ref={cardRef}>
      <div className={innerClasses} ref={contentRef}>
        {children}
      </div>
    </div>
  );
}

function feedbackSub(feedback) {
  const attempt = String(feedback?.attemptedAnswer || '').trim();
  const body = feedback?.body || '';
  if (!attempt) return body;
  const attemptLead = `You wrote "${attempt}".`;
  return body ? `${attemptLead} ${body}` : attemptLead;
}

export function FeedbackSlot({ feedback, reserveSpace = false }) {
  if (!feedback) {
    if (!reserveSpace) return null;
    return <div className="feedback-slot is-placeholder" aria-hidden="true" />;
  }
  const tone = feedbackTone(feedback.kind);
  const icon = tone === 'good' ? <CheckIcon /> : tone === 'warn' ? '!' : '×';
  return (
    <div className="feedback-slot">
      <Ribbon
        tone={tone}
        icon={icon}
        headline={feedback.headline || ''}
        word={feedback.answer || ''}
        sub={feedbackSub(feedback)}
      />
      {feedback.footer ? <p className="feedback-foot small muted">{feedback.footer}</p> : null}
      <FamilyChips words={feedback.familyWords} />
    </div>
  );
}

export function SummaryCards({ cards = [] }) {
  return (
    <div className="stat-grid">
      {cards.map((card) => (
        <div className="stat" key={card.label}>
          <div className="stat-label">{card.label}</div>
          <CountUpValue as="div" className="stat-value" value={card.value} />
          <div className="stat-sub">{card.sub || ''}</div>
        </div>
      ))}
    </div>
  );
}
