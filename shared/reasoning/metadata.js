export const REASONING_CONTENT_RELEASE_ID = 'reasoning-poc-promoted-2026-05-11';

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
  "releaseId": "reasoning-poc-promoted-2026-05-11",
  "templateCount": 110,
  "skillCount": 17,
  "misconceptionCount": 20,
  "satsFriendlyCount": 110,
  "domains": {
    "Number and place value": 10,
    "Calculation": 10,
    "Fractions": 10,
    "Fractions, decimals and percentages": 10,
    "Ratio and proportion": 10,
    "Measure": 10,
    "Geometry and measure": 10,
    "Geometry": 10,
    "Statistics": 10,
    "Reasoning and checking": 10,
    "Measure and money": 10
  },
  "skills": {
    "pv_rounding": 6,
    "reasonableness": 16,
    "pv_compare": 8,
    "inverse_missing": 11,
    "mul_div_structure": 15,
    "add_sub_multistep": 34,
    "fractions_quantity": 6,
    "fractions_compare": 4,
    "percent_number": 4,
    "fdp_equiv": 9,
    "ratio_scale": 10,
    "unit_conversion": 5,
    "time_elapsed": 5,
    "perimeter_area": 10,
    "error_analysis": 18,
    "geometry_angles": 10,
    "statistics_reading": 10
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
