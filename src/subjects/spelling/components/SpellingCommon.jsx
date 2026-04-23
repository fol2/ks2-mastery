import React from 'react';
import { CheckIcon } from './spelling-icons.jsx';
import {
  feedbackTone,
  pathProgressDots,
} from './spelling-view-model.js';

const useMeasuredLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;
export const spellingAnswerInputProps = {
  autoComplete: 'off',
  autoCapitalize: 'none',
  autoCorrect: 'off',
  spellCheck: false,
};

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
        <span className={`path-step${state ? ` ${state}` : ''}`} key={`${state}-${index}`} />
      ))}
    </div>
  );
}

export function Cloze({ sentence, answer = '', revealAnswer = false }) {
  const raw = String(sentence || '');
  if (!raw.includes('________')) return <div className="cloze">{raw}</div>;
  const [lead, tail = ''] = raw.split('________');
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
        <div className="stat" key={`${card.label}-${card.value}`}>
          <div className="stat-label">{card.label}</div>
          <div className="stat-value">{card.value}</div>
          <div className="stat-sub">{card.sub || ''}</div>
        </div>
      ))}
    </div>
  );
}
