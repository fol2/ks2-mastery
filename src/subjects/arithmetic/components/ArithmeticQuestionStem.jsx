import {
  arithmeticStemAriaLabel,
  expressionFractionAriaLabel,
  fractionAriaLabel,
  longDivisionAriaLabel,
  mixedNumberAriaLabel,
  sqrtAriaLabel,
  tokeniseArithmeticStem,
} from '../stem-renderer.js';

function ArithmeticTokenSequence({ tokens = [] }) {
  return tokens.map((token, index) => renderArithmeticToken(token, index));
}

function ArithmeticFraction({ token }) {
  const expressionFraction = token.type === 'expression-fraction';
  return (
    <span
      className={expressionFraction ? 'arithmetic-fraction arithmetic-expression-fraction' : 'arithmetic-fraction'}
      data-arithmetic-token={expressionFraction ? 'expression-fraction' : 'fraction'}
      data-arithmetic-label={expressionFraction ? expressionFractionAriaLabel(token) : fractionAriaLabel(token)}
      aria-hidden="true"
    >
      <span className="arithmetic-fraction-numerator">
        {expressionFraction ? <ArithmeticTokenSequence tokens={token.numeratorTokens} /> : token.numerator}
      </span>
      <span className="arithmetic-copy-space" aria-hidden="true"> </span>
      <span className="arithmetic-fraction-denominator">
        {expressionFraction ? <ArithmeticTokenSequence tokens={token.denominatorTokens} /> : token.denominator}
      </span>
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
      {token.type === 'placeholder' ? <span className="arithmetic-placeholder-box" /> : token.text}
    </span>
  );
}

function ArithmeticSqrt({ token }) {
  return (
    <span
      className="arithmetic-sqrt"
      data-arithmetic-token="sqrt"
      data-arithmetic-label={sqrtAriaLabel(token)}
      aria-hidden="true"
    >
      <span className="arithmetic-sqrt-symbol">√</span>
      <span className="arithmetic-sqrt-radicand">
        <ArithmeticTokenSequence tokens={token.radicandTokens} />
      </span>
    </span>
  );
}

function ArithmeticLongDivision({ token }) {
  return (
    <span
      className="arithmetic-long-division"
      data-arithmetic-token="long-division"
      data-arithmetic-label={longDivisionAriaLabel(token)}
      aria-hidden="true"
    >
      <span className="arithmetic-long-division-dividend">
        <ArithmeticTokenSequence tokens={token.dividendTokens} />
      </span>
      <span className="arithmetic-long-division-operator" data-arithmetic-token="operator" data-arithmetic-label="divided by">
        ÷
      </span>
      <span className="arithmetic-long-division-divisor">
        <ArithmeticTokenSequence tokens={token.divisorTokens} />
      </span>
    </span>
  );
}

function renderArithmeticToken(token, index) {
  const key = `${token.type}:${token.source || token.text}:${index}`;
  if (token.type === 'mixed-number') return <ArithmeticMixedNumber key={key} token={token} />;
  if (token.type === 'fraction' || token.type === 'expression-fraction') return <ArithmeticFraction key={key} token={token} />;
  if (token.type === 'sqrt') return <ArithmeticSqrt key={key} token={token} />;
  if (token.type === 'long-division') return <ArithmeticLongDivision key={key} token={token} />;
  if (token.type === 'number' || token.type === 'operator' || token.type === 'symbol' || token.type === 'placeholder') {
    return <ArithmeticInlineToken key={key} token={token} />;
  }
  return <span key={key} className="arithmetic-expression-text" aria-hidden="true">{token.text}</span>;
}

export function ArithmeticMathText({ text = '' }) {
  const tokens = tokeniseArithmeticStem(text);
  const hasRenderedMath = tokens.some((token) => token.type !== 'text');
  if (!hasRenderedMath) return String(text || '');

  return (
    <span className="arithmetic-expression" role="math" aria-label={arithmeticStemAriaLabel(text)}>
      <ArithmeticTokenSequence tokens={tokens} />
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
