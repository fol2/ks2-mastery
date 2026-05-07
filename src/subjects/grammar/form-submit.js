export function dispatchGrammarAnswerFormSubmit({
  event,
  actions,
  isMiniTest = false,
  isFeedback = false,
}) {
  event.preventDefault();
  const submitter = event.nativeEvent?.submitter;
  const submitAction = submitter?.value || 'save';
  if (!isMiniTest && isFeedback) return;
  const formData = new FormData(event.currentTarget);
  if (isMiniTest) {
    if (submitAction === 'finish') {
      actions.dispatch('grammar-finish-mini-test', { formData });
      return;
    }
    const payload = {
      formData,
      advance: submitAction === 'save-next',
    };
    if (submitAction === 'move') payload.index = submitter?.dataset?.index;
    actions.dispatch('grammar-save-mini-test-response', payload);
    return;
  }
  actions.dispatch('grammar-submit-form', { formData });
}
