export const DEMO_TEMPLATE_ID = 'default-spelling-demo-v1';

export function demoLearnerTemplate({ learnerId, now } = {}) {
  return {
    id: learnerId,
    name: 'Demo Learner',
    yearGroup: 'Y5',
    avatarColor: '#3E6FA8',
    goal: 'sats',
    dailyMinutes: 15,
    createdAt: now,
  };
}
