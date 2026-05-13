function optionLabel(option) {
  if (Array.isArray(option)) return String(option[1] ?? option[0] ?? '');
  if (option && typeof option === 'object') return String(option.label ?? option.value ?? '');
  return String(option ?? '');
}

function optionValue(option) {
  if (Array.isArray(option)) return String(option[0] ?? option[1] ?? '');
  if (option && typeof option === 'object') return String(option.value ?? option.label ?? '');
  return String(option ?? '');
}

function choiceFromOption(option) {
  return {
    label: optionLabel(option),
    value: optionValue(option),
  };
}

function choicesFromOptions(options) {
  return options.map(choiceFromOption).filter((choice) => choice.label || choice.value);
}

export function collectVisibleChoiceGroups(inputSpec) {
  if (!inputSpec || typeof inputSpec !== 'object') return [];

  if (Array.isArray(inputSpec.options) && inputSpec.options.length > 0) {
    return [{
      scope: 'options',
      choices: choicesFromOptions(inputSpec.options),
    }];
  }

  if (inputSpec.type === 'table_choice') {
    const rows = Array.isArray(inputSpec.rows) ? inputSpec.rows : [];
    const columns = Array.isArray(inputSpec.columns) ? inputSpec.columns : [];
    const rowGroups = rows
      .map((row) => ({
        scope: `row:${String(row.key ?? row.label ?? '')}`,
        choices: choicesFromOptions(
          Array.isArray(row?.options) && row.options.length > 0 ? row.options : columns,
        ),
      }))
      .filter((group) => group.choices.length > 0);
    if (rowGroups.length > 0) return rowGroups;
    if (columns.length > 0) {
      return [{
        scope: 'columns',
        choices: choicesFromOptions(columns),
      }];
    }
  }

  if (inputSpec.type === 'multi') {
    const fields = Array.isArray(inputSpec.fields) ? inputSpec.fields : [];
    return fields
      .filter((field) => Array.isArray(field?.options) && field.options.length > 0)
      .map((field) => ({
        scope: `field:${String(field.key ?? field.label ?? '')}`,
        choices: choicesFromOptions(field.options),
      }));
  }

  return [];
}

export function collectVisibleChoices(inputSpec) {
  return collectVisibleChoiceGroups(inputSpec).flatMap((group) => group.choices);
}
