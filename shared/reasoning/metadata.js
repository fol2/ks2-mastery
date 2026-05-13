export const REASONING_CONTENT_RELEASE_ID = 'reasoning-variety-expansion-v2-2026-05-13';

export const REASONING_MODES = Object.freeze(['smart', 'skill', 'trouble', 'worked', 'faded', 'sats', 'satsset']);

export const REASONING_SKILLS = Object.freeze({
  "pv_rounding": {
    "domain": "Number and place value",
    "name": "Rounding and place value reasoning"
  },
  "pv_compare": {
    "domain": "Number and place value",
    "name": "Comparing and organising numbers"
  },
  "add_sub_multistep": {
    "domain": "Calculation",
    "name": "Multi-step addition and subtraction reasoning"
  },
  "mul_div_structure": {
    "domain": "Calculation",
    "name": "Multiplication / division structure in contexts"
  },
  "inverse_missing": {
    "domain": "Calculation",
    "name": "Missing number and inverse reasoning"
  },
  "fractions_quantity": {
    "domain": "Fractions, decimals and percentages",
    "name": "Fractions of quantities"
  },
  "fractions_compare": {
    "domain": "Fractions, decimals and percentages",
    "name": "Comparing fractions"
  },
  "fdp_equiv": {
    "domain": "Fractions, decimals and percentages",
    "name": "Fraction / decimal / percentage links"
  },
  "percent_number": {
    "domain": "Fractions, decimals and percentages",
    "name": "Percentages of quantities"
  },
  "ratio_scale": {
    "domain": "Ratio and proportion",
    "name": "Scaling and multiplicative comparison"
  },
  "unit_conversion": {
    "domain": "Measure",
    "name": "Unit conversion in word problems"
  },
  "time_elapsed": {
    "domain": "Measure",
    "name": "Elapsed time reasoning"
  },
  "perimeter_area": {
    "domain": "Geometry and measure",
    "name": "Perimeter and area reasoning"
  },
  "geometry_angles": {
    "domain": "Geometry",
    "name": "Angle reasoning"
  },
  "statistics_reading": {
    "domain": "Statistics",
    "name": "Reading tables, charts and scales"
  },
  "reasonableness": {
    "domain": "Reasoning and checking",
    "name": "Estimation and reasonableness checks"
  },
  "error_analysis": {
    "domain": "Reasoning and checking",
    "name": "Explaining and correcting mistakes"
  }
});

export const REASONING_QUESTION_TYPE_LABELS = Object.freeze({
  number: 'Number answer',
  text: 'Written answer',
  multi: 'Multi-part answer',
});

const PUBLIC_REASONING_CONTENT_SUMMARY = Object.freeze({
  "releaseId": "reasoning-variety-expansion-v2-2026-05-13",
  "templateCount": 138,
  "skillCount": 17,
  "misconceptionCount": 20,
  "satsFriendlyCount": 136,
  "contextThemeCount": 23,
  "themedTemplateCount": 28,
  "extraCreditTemplateCount": 2,
  "domains": {
    "Number and place value": 12,
    "Calculation": 13,
    "Fractions": 12,
    "Fractions, decimals and percentages": 12,
    "Ratio and proportion": 12,
    "Measure": 14,
    "Geometry and measure": 12,
    "Geometry": 12,
    "Statistics": 12,
    "Reasoning and checking": 15,
    "Measure and money": 12
  },
  "skills": {
    "pv_rounding": 8,
    "reasonableness": 27,
    "pv_compare": 10,
    "inverse_missing": 15,
    "mul_div_structure": 22,
    "add_sub_multistep": 45,
    "fractions_quantity": 8,
    "fractions_compare": 5,
    "percent_number": 7,
    "fdp_equiv": 12,
    "ratio_scale": 14,
    "unit_conversion": 9,
    "time_elapsed": 7,
    "perimeter_area": 12,
    "error_analysis": 22,
    "geometry_angles": 12,
    "statistics_reading": 14
  },
  "modes": [
    "smart",
    "skill",
    "trouble",
    "worked",
    "faded",
    "sats",
    "satsset"
  ]
});

export function reasoningContentSummary() {
  return JSON.parse(JSON.stringify(PUBLIC_REASONING_CONTENT_SUMMARY));
}
