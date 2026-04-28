function stripComment(line) {
  const hashIndex = line.indexOf('#');
  return (hashIndex === -1 ? line : line.slice(0, hashIndex)).trim();
}

function finishGroup(groups, group) {
  if (group && (group.agents.length || group.rules.length)) {
    groups.push({
      agents: Object.freeze([...group.agents]),
      rules: Object.freeze([...group.rules]),
    });
  }
}

export function parseRobotsGroups(robotsText) {
  if (typeof robotsText !== 'string') {
    throw new Error('parseRobotsGroups: robotsText must be a string.');
  }

  const groups = [];
  let group = null;
  for (const rawLine of robotsText.split(/\r?\n/u)) {
    const line = stripComment(rawLine);
    if (!line) continue;

    const match = line.match(/^([A-Za-z][A-Za-z-]*)\s*:\s*(.*)$/u);
    if (!match) continue;

    const directive = match[1].toLowerCase();
    const value = match[2].trim();
    if (directive === 'user-agent') {
      if (!group || group.rules.length) {
        finishGroup(groups, group);
        group = { agents: [], rules: [] };
      }
      group.agents.push(value);
      continue;
    }

    if (directive !== 'allow' && directive !== 'disallow') continue;
    if (!group) continue;
    if (!value) continue;
    group.rules.push({ directive, value });
  }
  finishGroup(groups, group);

  return Object.freeze(groups);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function normalisePath(path) {
  const value = String(path || '/');
  const withoutHash = value.split('#')[0];
  const withoutQuery = withoutHash.split('?')[0];
  return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
}

function agentMatchLength(agent, userAgent) {
  const normalisedAgent = String(agent || '').trim().toLowerCase();
  if (!normalisedAgent) return -1;
  if (normalisedAgent === '*') return 0;
  const normalisedUserAgent = String(userAgent || '').toLowerCase();
  return normalisedUserAgent.includes(normalisedAgent) ? normalisedAgent.length : -1;
}

function matchingGroups(groups, userAgent) {
  const matches = [];
  let bestLength = -1;
  for (const group of groups) {
    const groupBest = Math.max(...group.agents.map((agent) => agentMatchLength(agent, userAgent)));
    if (groupBest < 0) continue;
    if (groupBest > bestLength) {
      matches.length = 0;
      bestLength = groupBest;
    }
    if (groupBest === bestLength) matches.push(group);
  }
  return matches;
}

function ruleMatchesPath(ruleValue, path) {
  if (!ruleValue) return false;
  if (ruleValue.includes('*') || ruleValue.endsWith('$')) {
    const anchoredEnd = ruleValue.endsWith('$');
    const pattern = escapeRegExp(anchoredEnd ? ruleValue.slice(0, -1) : ruleValue)
      .replace(/\\\*/gu, '.*');
    const regex = new RegExp(`^${pattern}${anchoredEnd ? '$' : ''}`, 'u');
    return regex.test(path);
  }
  return path.startsWith(ruleValue);
}

export function hasSpecificCrawlerGroup(robotsText, userAgent) {
  const groups = parseRobotsGroups(robotsText);
  return groups.some((group) => group.agents.some((agent) => {
    const matchLength = agentMatchLength(agent, userAgent);
    return matchLength > 0;
  }));
}

export function isCrawlerPathAllowed(robotsText, userAgent, path) {
  const groups = matchingGroups(parseRobotsGroups(robotsText), userAgent);
  if (!groups.length) return true;

  const targetPath = normalisePath(path);
  let winner = null;
  for (const group of groups) {
    for (const rule of group.rules) {
      if (!ruleMatchesPath(rule.value, targetPath)) continue;
      if (!winner || rule.value.length > winner.value.length) {
        winner = rule;
        continue;
      }
      if (rule.value.length === winner.value.length && rule.directive === 'allow') {
        winner = rule;
      }
    }
  }

  return !winner || winner.directive === 'allow';
}

export function crawlerPolicyFailures(robotsText, {
  userAgent = 'OAI-SearchBot',
  publicPaths = [],
  privatePaths = [],
  label = 'robots.txt',
} = {}) {
  const failures = [];
  for (const publicPath of publicPaths) {
    if (!isCrawlerPathAllowed(robotsText, userAgent, publicPath)) {
      failures.push(
        `${label} must allow ${userAgent} to fetch public SEO path ${publicPath}. Check robots.txt and Cloudflare bot/crawler settings.`,
      );
    }
  }

  const hasSpecificGroup = hasSpecificCrawlerGroup(robotsText, userAgent);
  for (const privatePath of privatePaths) {
    if (isCrawlerPathAllowed(robotsText, userAgent, privatePath)) {
      const reason = hasSpecificGroup
        ? `has a bot-specific ${userAgent} group, so it must repeat the private-path disallow for ${privatePath}`
        : `must disallow ${userAgent} from private crawler path ${privatePath}`;
      failures.push(`${label} ${reason}. Check robots.txt and Cloudflare bot/crawler settings.`);
    }
  }

  return failures;
}
