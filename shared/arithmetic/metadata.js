export const ARITHMETIC_SUBJECT_ID = 'arithmetic';
export const ARITHMETIC_CONTENT_RELEASE_ID = 'arithmetic-ks2-worker-v1-2026-05-11';

export const ARITHMETIC_MISCONCEPTIONS = Object.freeze({
  fact_recall: 'Forgot or misrecalled a number fact',
  place_value_confusion: 'Place value confusion',
  powers_of_ten_shift: 'Moved digits the wrong way when multiplying or dividing by powers of 10',
  regrouping_error: 'Exchange / regrouping error',
  digit_alignment: 'Digits or decimal points were not aligned correctly',
  operation_confusion: 'Used the wrong operation or sequence of operations',
  inverse_error: 'Undo steps were done in the wrong order',
  decimal_point_error: 'Decimal point placed incorrectly',
  fraction_method_error: 'Fraction method error',
  simplification_missed: 'Equivalent fraction value but not in simplest form',
  percentage_method_error: 'Percentage method broke down',
  remainder_interpretation: 'Division remainder or quotient was handled incorrectly',
  order_of_operations_error: 'Order of operations error',
  misread_question: 'Misread what the question was asking for',
});

export const ARITHMETIC_MINIMAL_HINTS = Object.freeze({
  fact_recall: 'Pause and recall the key fact before doing the written work.',
  place_value_confusion: 'Focus on the value of each digit, not just the digit itself.',
  powers_of_ten_shift: 'Multiplying or dividing by 10, 100 or 1,000 changes place value.',
  regrouping_error: 'Check each column from right to left and see whether an exchange was needed.',
  digit_alignment: 'Line up ones under ones and decimal points under decimal points.',
  operation_confusion: 'Decide exactly which operation belongs first before calculating.',
  inverse_error: 'Undo the operations in reverse order.',
  decimal_point_error: 'Estimate first so the decimal point lands in a sensible place.',
  fraction_method_error: 'Check whether you are finding a fraction of an amount, combining fractions, or dividing a fraction.',
  simplification_missed: 'The value is right, but KS2 arithmetic usually expects the simplest fraction form.',
  percentage_method_error: 'Break the percentage into easy parts such as 10%, 5%, 1%, 50% or 25%.',
  remainder_interpretation: 'Check whether the division should be exact and how the remainder should be handled.',
  order_of_operations_error: 'Do brackets first, then multiplication or division, then addition or subtraction.',
  misread_question: 'Read the final line again and make sure your answer matches what is asked.',
});

export const ARITHMETIC_STRANDS = Object.freeze({
  facts_place_value: Object.freeze({ id: 'facts_place_value', name: 'Number facts and place value' }),
  operations_methods: Object.freeze({ id: 'operations_methods', name: 'Written operations and inverses' }),
  decimals_fractions: Object.freeze({ id: 'decimals_fractions', name: 'Decimals and fractions' }),
  percentages_mixed: Object.freeze({ id: 'percentages_mixed', name: 'Percentages and mixed arithmetic' }),
});

export const ARITHMETIC_SKILLS = Object.freeze({
  number_bonds: Object.freeze({ id: 'number_bonds', strand: 'facts_place_value', name: 'Number bonds and complements' }),
  place_value_partition: Object.freeze({ id: 'place_value_partition', strand: 'facts_place_value', name: 'Place value partitioning' }),
  powers_of_10_shift: Object.freeze({ id: 'powers_of_10_shift', strand: 'facts_place_value', name: 'Multiply and divide by 10, 100 and 1,000' }),
  times_tables: Object.freeze({ id: 'times_tables', strand: 'facts_place_value', name: 'Times-table facts' }),
  division_facts: Object.freeze({ id: 'division_facts', strand: 'facts_place_value', name: 'Division facts and exact quotients' }),
  mental_addition: Object.freeze({ id: 'mental_addition', strand: 'operations_methods', name: 'Mental addition' }),
  mental_subtraction: Object.freeze({ id: 'mental_subtraction', strand: 'operations_methods', name: 'Mental subtraction' }),
  column_addition: Object.freeze({ id: 'column_addition', strand: 'operations_methods', name: 'Column addition' }),
  column_subtraction: Object.freeze({ id: 'column_subtraction', strand: 'operations_methods', name: 'Column subtraction' }),
  inverse_missing: Object.freeze({ id: 'inverse_missing', strand: 'operations_methods', name: 'Missing-number inverse equations' }),
  mental_multiplication: Object.freeze({ id: 'mental_multiplication', strand: 'operations_methods', name: 'Mental multiplication' }),
  short_multiplication: Object.freeze({ id: 'short_multiplication', strand: 'operations_methods', name: 'Short multiplication' }),
  short_division: Object.freeze({ id: 'short_division', strand: 'operations_methods', name: 'Short division' }),
  long_multiplication: Object.freeze({ id: 'long_multiplication', strand: 'operations_methods', name: 'Long multiplication' }),
  long_division: Object.freeze({ id: 'long_division', strand: 'operations_methods', name: 'Long division' }),
  decimals_add_sub: Object.freeze({ id: 'decimals_add_sub', strand: 'decimals_fractions', name: 'Decimal addition and subtraction' }),
  decimals_multiply: Object.freeze({ id: 'decimals_multiply', strand: 'decimals_fractions', name: 'Decimal multiplication' }),
  decimals_divide: Object.freeze({ id: 'decimals_divide', strand: 'decimals_fractions', name: 'Decimal division by whole numbers' }),
  fractions_of_amount: Object.freeze({ id: 'fractions_of_amount', strand: 'decimals_fractions', name: 'Fractions of amounts' }),
  fractions_calc: Object.freeze({ id: 'fractions_calc', strand: 'decimals_fractions', name: 'Fraction calculations' }),
  fractions_multiply: Object.freeze({ id: 'fractions_multiply', strand: 'decimals_fractions', name: 'Multiplying fractions' }),
  fdp_links: Object.freeze({ id: 'fdp_links', strand: 'percentages_mixed', name: 'Fraction, decimal and percentage links' }),
  percentages_of_amount: Object.freeze({ id: 'percentages_of_amount', strand: 'percentages_mixed', name: 'Percentages of amounts' }),
  order_of_operations: Object.freeze({ id: 'order_of_operations', strand: 'percentages_mixed', name: 'Order of operations' }),
});

export const ARITHMETIC_MODE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'smart', label: 'Smart Review', description: 'Due, weak, new and recently missed skills are interleaved.' }),
  Object.freeze({ id: 'skill', label: 'Skill Builder', description: 'Concentrate on one arithmetic skill with varied numbers.' }),
  Object.freeze({ id: 'speed', label: 'Speed Drill', description: 'Short fluency burst for fact-friendly arithmetic.' }),
  Object.freeze({ id: 'clinic', label: 'Error Clinic', description: 'Repair recent wrong patterns with fresh numbers.' }),
  Object.freeze({ id: 'test', label: 'True Test Mode', description: 'SATs-style delayed-feedback arithmetic paper.' }),
]);

export const ARITHMETIC_GOAL_OPTIONS = Object.freeze([
  Object.freeze({ id: '10q', label: '10 marked questions' }),
  Object.freeze({ id: '20q', label: '20 marked questions' }),
  Object.freeze({ id: 'due', label: 'Clear due review' }),
]);

export const ARITHMETIC_TEST_FORMS = Object.freeze([
  Object.freeze({ id: 'short', label: 'Short paper: 12 questions, 14 marks' }),
  Object.freeze({ id: 'full', label: 'Full paper: 36 questions, 40 marks' }),
]);
