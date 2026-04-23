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

export function AnimatedPromptCard({ className = '', innerClassName = '', children }) {
  const contentRef = React.useRef(null);
  const [height, setHeight] = React.useState(null);

  useMeasuredLayoutEffect(() => {
    const node = contentRef.current;
    if (!node || typeof window === 'undefined') return undefined;

    let frameId = 0;
    const measure = () => {
      frameId = 0;
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      setHeight((current) => (current === nextHeight ? current : nextHeight));
    };
    const scheduleMeasure = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    window.addEventListener('resize', scheduleMeasure);

    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => scheduleMeasure())
      : null;
    observer?.observe(node);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, []);

  const classes = ['prompt-card', 'animated-prompt-card', className].filter(Boolean).join(' ');
  const innerClasses = ['prompt-card-inner', innerClassName].filter(Boolean).join(' ');
  const style = height ? { '--prompt-card-height': `${height}px` } : undefined;

  return (
    <div className={classes} style={style}>
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

export function FeedbackSlot({ feedback }) {
  if (!feedback) return null;
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
