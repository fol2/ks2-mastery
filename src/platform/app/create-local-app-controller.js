import { createLocalPlatformRepositories } from '../core/repositories/index.js';
import { createPracticeStreakSubscriber } from '../events/index.js';
import { createPunctuationRewardSubscriber } from '../../subjects/punctuation/event-hooks.js';
import { createPunctuationPersistence } from '../../subjects/punctuation/repository.js';
import { createPunctuationService } from '../../subjects/punctuation/service.js';
import { createSpellingRewardSubscriber } from '../../subjects/spelling/event-hooks.js';
import { createSpellingPersistence } from '../../subjects/spelling/repository.js';
import { createSpellingService } from '../../subjects/spelling/service.js';
import { createAppController } from './create-app-controller.js';

export function createLocalAppController({
  repositories = createLocalPlatformRepositories(),
  services = {},
  subscribers = null,
  now = () => Date.now(),
  tts,
  ...options
} = {}) {
  const resolvedServices = { ...services };
  if (!resolvedServices.spelling) {
    resolvedServices.spelling = createSpellingService({
      repository: createSpellingPersistence({ repositories, now }),
      now,
      tts,
    });
  }
  if (!resolvedServices.punctuation) {
    resolvedServices.punctuation = createPunctuationService({
      repository: createPunctuationPersistence({ repositories }),
      now,
    });
  }

  return createAppController({
    ...options,
    repositories,
    services: resolvedServices,
    subscribers: subscribers || [
      createPracticeStreakSubscriber(),
      createSpellingRewardSubscriber({ gameStateRepository: repositories.gameState }),
      createPunctuationRewardSubscriber({ gameStateRepository: repositories.gameState }),
    ],
    now,
    tts,
  });
}
