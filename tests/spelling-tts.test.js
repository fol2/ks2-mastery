import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDictationTranscript,
  buildWordOnlyTranscript,
  createPlatformTts,
} from '../src/subjects/spelling/tts.js';

test('dictation transcript matches the spelling audio contract', () => {
  assert.equal(
    buildDictationTranscript({
      word: 'early',
      sentence: 'The birds sang early in the day.',
    }),
    'The word is early. The birds sang early in the day. The word is early.',
  );
});

test('word-only transcript reads vocabulary without the dictation script', () => {
  assert.equal(
    buildWordOnlyTranscript({ word: { word: 'possess' } }),
    'possess',
  );
});

test('platform TTS sends the selected Worker provider', async () => {
  const originalAudio = globalThis.Audio;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const played = [];

  globalThis.Audio = class MockAudio {
    constructor(src) {
      this.src = src;
      this.onended = null;
      this.onerror = null;
    }

    play() {
      played.push(this.src);
      setTimeout(() => this.onended?.(), 0);
      return Promise.resolve();
    }

    pause() {}
    removeAttribute() {}
    load() {}
  };
  URL.createObjectURL = () => 'blob:tts-audio';
  URL.revokeObjectURL = () => {};

  const calls = [];
  const tts = createPlatformTts({
    remoteEnabled: true,
    provider: () => 'gemini',
    bufferedVoice: () => 'Sulafat',
    fetchFn: async (url, init = {}) => {
      calls.push({
        url,
        credentials: init.credentials,
        headers: init.headers,
        body: JSON.parse(init.body),
      });
      return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    },
  });

  try {
    const result = await tts.speak({
      learnerId: 'learner-a',
      promptToken: 'prompt-token-a',
      word: { word: 'early' },
      sentence: 'The birds sang early in the day.',
      slow: true,
    });

    assert.equal(result, true);
    assert.deepEqual(played, ['blob:tts-audio']);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/tts');
    assert.equal(calls[0].credentials, 'include');
    assert.equal(calls[0].headers.accept, 'audio/*');
    assert.deepEqual(calls[0].body, {
      learnerId: 'learner-a',
      promptToken: 'prompt-token-a',
      slow: true,
      provider: 'gemini',
      bufferedGeminiVoice: 'Sulafat',
    });

    const wordOnlyResult = await tts.speak({
      learnerId: 'learner-a',
      promptToken: 'prompt-token-b',
      word: 'possess',
      wordOnly: true,
    });

    assert.equal(wordOnlyResult, true);
    assert.deepEqual(played, ['blob:tts-audio', 'blob:tts-audio']);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].body, {
      learnerId: 'learner-a',
      promptToken: 'prompt-token-b',
      slow: false,
      provider: 'gemini',
      bufferedGeminiVoice: 'Sulafat',
      wordOnly: true,
    });
  } finally {
    tts.stop();
    globalThis.Audio = originalAudio;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
});

test('platform TTS plays cached Gemini audio before the selected provider', async () => {
  const originalAudio = globalThis.Audio;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const played = [];

  globalThis.Audio = class MockAudio {
    constructor(src) {
      this.src = src;
      this.onended = null;
      this.onerror = null;
    }

    play() {
      played.push(this.src);
      setTimeout(() => this.onended?.(), 0);
      return Promise.resolve();
    }

    pause() {}
    removeAttribute() {}
    load() {}
  };
  URL.createObjectURL = () => 'blob:cached-gemini-audio';
  URL.revokeObjectURL = () => {};

  const calls = [];
  const tts = createPlatformTts({
    remoteEnabled: true,
    provider: 'openai',
    fetchFn: async (url, init = {}) => {
      calls.push({
        url,
        headers: init.headers,
        body: JSON.parse(init.body),
      });
      return new Response(new Blob([new Uint8Array([9, 8, 7])], { type: 'audio/mpeg' }), {
        status: 200,
        headers: {
          'content-type': 'audio/mpeg',
          'x-ks2-tts-cache': 'hit',
        },
      });
    },
  });

  try {
    const result = await tts.speak({
      learnerId: 'learner-a',
      promptToken: 'prompt-token-cached',
      word: 'early',
      sentence: 'The birds sang early in the day.',
    });

    assert.equal(result, true);
    assert.deepEqual(played, ['blob:cached-gemini-audio']);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers.accept, 'audio/*');
    assert.deepEqual(calls[0].body, {
      learnerId: 'learner-a',
      promptToken: 'prompt-token-cached',
      slow: false,
      provider: 'gemini',
      bufferedGeminiVoice: 'Iapetus',
      cacheLookupOnly: true,
    });
  } finally {
    tts.stop();
    globalThis.Audio = originalAudio;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
});

test('platform TTS does not warm or fall back after cancelled cache lookup', async () => {
  const originalAudio = globalThis.Audio;
  globalThis.Audio = class MockAudio {};

  let releaseLookup;
  let lookupStarted;
  const lookupStartedPromise = new Promise((resolve) => {
    lookupStarted = resolve;
  });
  const calls = [];
  const tts = createPlatformTts({
    remoteEnabled: true,
    provider: 'openai',
    fetchFn: async (url, init = {}) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      if (body.cacheLookupOnly) {
        lookupStarted();
        await new Promise((resolve) => {
          releaseLookup = resolve;
        });
        return new Response(null, {
          status: 204,
          headers: { 'x-ks2-tts-cache': 'miss' },
        });
      }
      return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    },
  });

  try {
    const resultPromise = tts.speak({
      learnerId: 'learner-a',
      promptToken: 'prompt-token-cancelled',
      word: 'early',
      sentence: 'The birds sang early in the day.',
    });
    await lookupStartedPromise;
    tts.stop();
    releaseLookup();
    const result = await resultPromise;

    assert.equal(result, false);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, {
      learnerId: 'learner-a',
      promptToken: 'prompt-token-cancelled',
      slow: false,
      provider: 'gemini',
      bufferedGeminiVoice: 'Iapetus',
      cacheLookupOnly: true,
    });
  } finally {
    tts.stop();
    globalThis.Audio = originalAudio;
  }
});

test('platform TTS allows a one-off provider override for profile tests', async () => {
  const originalAudio = globalThis.Audio;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const events = [];

  globalThis.Audio = class MockAudio {
    constructor(src) {
      this.src = src;
      this.onended = null;
      this.onerror = null;
    }

    play() {
      setTimeout(() => this.onended?.(), 0);
      return Promise.resolve();
    }

    pause() {}
    removeAttribute() {}
    load() {}
  };
  URL.createObjectURL = () => 'blob:tts-test-audio';
  URL.revokeObjectURL = () => {};

  const calls = [];
  const tts = createPlatformTts({
    remoteEnabled: true,
    provider: 'gemini',
    fetchFn: async (url, init = {}) => {
      const body = JSON.parse(init.body);
      calls.push({
        url,
        body,
      });
      if (body.cacheLookupOnly) {
        return new Response(new Blob([new Uint8Array([9, 8, 7])], { type: 'audio/mpeg' }), {
          status: 200,
          headers: {
            'content-type': 'audio/mpeg',
            'x-ks2-tts-cache': 'hit',
          },
        });
      }
      if (body.cacheOnly) {
        return new Response(null, {
          status: 204,
          headers: { 'x-ks2-tts-cache': 'stored' },
        });
      }
      return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    },
  });
  tts.subscribe((event) => events.push(event));

  try {
    const result = await tts.speak({
      learnerId: 'learner-a',
      promptToken: 'prompt-token-test',
      word: 'early',
      sentence: 'The birds sang early in the day.',
      provider: 'openai',
      kind: 'test',
    });

    assert.equal(result, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, {
      learnerId: 'learner-a',
      promptToken: 'prompt-token-test',
      slow: false,
      provider: 'openai',
      bufferedGeminiVoice: 'Iapetus',
    });
    assert.deepEqual(
      events.filter((event) => event.kind === 'test').map((event) => event.type),
      ['loading', 'start'],
    );
    assert.equal(events.at(-1).type, 'end');
  } finally {
    tts.stop();
    globalThis.Audio = originalAudio;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
});

test('platform TTS profile tests do not report cached audio as selected provider success', async () => {
  const originalAudio = globalThis.Audio;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  globalThis.Audio = class MockAudio {
    constructor(src) {
      this.src = src;
      this.onended = null;
      this.onerror = null;
    }

    play() {
      setTimeout(() => this.onended?.(), 0);
      return Promise.resolve();
    }

    pause() {}
    removeAttribute() {}
    load() {}
  };
  URL.createObjectURL = () => 'blob:cached-gemini-audio';
  URL.revokeObjectURL = () => {};

  const calls = [];
  const tts = createPlatformTts({
    remoteEnabled: true,
    provider: 'openai',
    fetchFn: async (url, init = {}) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      if (body.cacheLookupOnly) {
        return new Response(new Blob([new Uint8Array([9, 8, 7])], { type: 'audio/mpeg' }), {
          status: 200,
          headers: {
            'content-type': 'audio/mpeg',
            'x-ks2-tts-cache': 'hit',
          },
        });
      }
      return new Response(JSON.stringify({ error: 'selected provider unavailable' }), { status: 503 });
    },
  });

  try {
    const result = await tts.speak({
      learnerId: 'learner-a',
      promptToken: 'prompt-token-test-failure',
      word: 'early',
      sentence: 'The birds sang early in the day.',
      kind: 'test',
    });

    assert.equal(result, false);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, {
      learnerId: 'learner-a',
      promptToken: 'prompt-token-test-failure',
      slow: false,
      provider: 'openai',
      bufferedGeminiVoice: 'Iapetus',
    });
  } finally {
    tts.stop();
    globalThis.Audio = originalAudio;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
});

test('platform TTS does not fall back when the selected remote provider fails', async () => {
  const originalWindow = globalThis.window;
  const originalAudio = globalThis.Audio;
  const calls = [];
  let spoke = false;

  globalThis.Audio = class MockAudio {};
  globalThis.window = {
    speechSynthesis: {
      cancel() {},
      speak() { spoke = true; },
    },
    SpeechSynthesisUtterance: class MockUtterance {},
  };

  const tts = createPlatformTts({
    remoteEnabled: true,
    provider: 'openai',
    fetchFn: async (url, init = {}) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ error: 'busy' }), { status: 503 });
    },
  });

  try {
    const result = await tts.speak({
      learnerId: 'learner-a',
      promptToken: 'prompt-token-a',
      word: 'early',
      sentence: 'The birds sang early in the day.',
    });

    assert.equal(result, false);
    assert.equal(spoke, false);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0].body, {
      learnerId: 'learner-a',
      promptToken: 'prompt-token-a',
      slow: false,
      provider: 'gemini',
      bufferedGeminiVoice: 'Iapetus',
      cacheLookupOnly: true,
    });
    assert.deepEqual(calls[1].body, {
      learnerId: 'learner-a',
      promptToken: 'prompt-token-a',
      slow: false,
      provider: 'gemini',
      bufferedGeminiVoice: 'Iapetus',
      cacheOnly: true,
    });
    assert.deepEqual(calls[2].body, {
      learnerId: 'learner-a',
      promptToken: 'prompt-token-a',
      slow: false,
      provider: 'openai',
      bufferedGeminiVoice: 'Iapetus',
    });
  } finally {
    tts.stop();
    globalThis.window = originalWindow;
    globalThis.Audio = originalAudio;
  }
});

test('platform TTS can use the local browser voice provider', async () => {
  const originalWindow = globalThis.window;
  const originalAudio = globalThis.Audio;
  const spoken = [];
  const voices = [
    { name: 'Google US English', lang: 'en-US', voiceURI: 'Google US English' },
    { name: 'Google UK English Female', lang: 'en-GB', voiceURI: 'Google UK English Female' },
  ];

  globalThis.Audio = class MockAudio {};
  globalThis.window = {
    speechSynthesis: {
      cancel() {},
      getVoices() { return voices; },
      speak(utterance) {
        spoken.push(utterance);
        setTimeout(() => utterance.onend?.(), 0);
      },
    },
    SpeechSynthesisUtterance: class MockUtterance {
      constructor(text) {
        this.text = text;
        this.lang = '';
        this.rate = 1;
        this.voice = null;
      }
    },
  };

  const calls = [];
  const tts = createPlatformTts({
    remoteEnabled: true,
    provider: 'browser',
    fetchFn: async (url, init = {}) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      await new Promise(() => {});
    },
  });

  try {
    const result = await tts.speak({
      word: 'early',
      sentence: 'The birds sang early in the day.',
      slow: true,
    });

    assert.equal(result, true);
    assert.equal(calls.length, 0);
    assert.equal(spoken.length, 1);
    assert.equal(spoken[0].lang, 'en-GB');
    assert.equal(spoken[0].voice.name, 'Google UK English Female');
    assert.match(spoken[0].text, /The word is early/);

    let timeoutId;
    const tokenResult = await Promise.race([
      tts.speak({
        learnerId: 'learner-a',
        promptToken: 'prompt-token-browser',
        word: 'early',
        sentence: 'The birds sang early in the day.',
      }),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve('timeout'), 300);
      }),
    ]);
    clearTimeout(timeoutId);

    assert.equal(tokenResult, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, {
      learnerId: 'learner-a',
      promptToken: 'prompt-token-browser',
      slow: false,
      provider: 'gemini',
      bufferedGeminiVoice: 'Iapetus',
      cacheOnly: true,
    });
    assert.equal(spoken.length, 2);
  } finally {
    tts.stop();
    globalThis.window = originalWindow;
    globalThis.Audio = originalAudio;
  }
});
