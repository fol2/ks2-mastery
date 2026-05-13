import {
  arithmeticStemAriaLabel,
  fractionAriaLabel,
  mixedNumberAriaLabel,
  tokeniseArithmeticStem,
} from '../stem-renderer.js';

function ArithmeticFraction({ token }) {
  return (
    <span
      className="arithmetic-fraction"
      data-arithmetic-token="fraction"
      data-arithmetic-label={fractionAriaLabel(token)}
      aria-hidden="true"
    >
      <span className="arithmetic-fraction-numerator">{token.numerator}</span>
      <span className="arithmetic-copy-space" aria-hidden="true"> </span>
      <span className="arithmetic-fraction-denominator">{token.denominator}</span>
    </span>
  );
}

function ArithmeticMixedNumber({ token }) {
  return (
    <span
      className="arithmetic-mixed-number"
      data-arithmetic-token="mixed-number"
      data-arithmetic-label={mixedNumberAriaLabel(token)}
      aria-hidden="true"
    >
      <span className="arithmetic-mixed-whole">{token.whole}</span>
      <span className="arithmetic-copy-space" aria-hidden="true"> </span>
      <ArithmeticFraction token={token} />
    </span>
  );
}

function ArithmeticInlineToken({ token }) {
  return (
    <span
      className={`arithmetic-${token.type}`}
      data-arithmetic-token={token.type}
      data-arithmetic-label={token.label}
      aria-hidden="true"
    >
      {token.text}
    </span>
  );
}

export function ArithmeticMathText({ text = '' }) {
  const tokens = tokeniseArithmeticStem(text);
  const hasRenderedMath = tokens.some((token) => token.type !== 'text');
  if (!hasRenderedMath) return String(text || '');

  return (
    <span className="arithmetic-expression" role="math" aria-label={arithmeticStemAriaLabel(text)}>
      {tokens.map((token, index) => {
        const key = `${token.type}:${token.source || token.text}:${index}`;
        if (token.type === 'mixed-number') return <ArithmeticMixedNumber key={key} token={token} />;
        if (token.type === 'fraction') return <ArithmeticFraction key={key} token={token} />;
        if (token.type === 'number' || token.type === 'operator' || token.type === 'placeholder') {
          return <ArithmeticInlineToken key={key} token={token} />;
        }
        return <span key={key} className="arithmetic-expression-text" aria-hidden="true">{token.text}</span>;
      })}
    </span>
  );
}

export function ArithmeticQuestionStem({ stem = '' }) {
  return <ArithmeticMathText text={stem} />;
}

export function ArithmeticQuestionVisual({ visual = '' }) {
  const lines = String(visual || '').split('\n');
  return (
    <pre className="alg arithmetic-visual">
      {lines.map((line, index) => (
        <span className="arithmetic-visual-line" key={`${index}:${line}`}>
          <ArithmeticMathText text={line} />
        </span>
      ))}
    </pre>
  );
}
