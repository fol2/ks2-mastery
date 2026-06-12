import { requireMutationCapability } from '../auth.js';
import { requireSameOrigin } from '../demo/sessions.js';
import {
  BadRequestError,
  ForbiddenError,
} from '../errors.js';
import { json, readJson } from '../http.js';
import {
  CONTENT_OPERATION_CAPABILITIES,
  serialiseContentOperation,
  serialiseContentOperationActor,
  serialiseContentOperationApproval,
  serialiseContentOperationCandidate,
  serialiseContentOperationEvent,
  serialiseContentOperationOverview,
  serialiseContentOperationPackage,
  serialiseContentOperationRelease,
  serialiseContentOperationStub,
} from './serialisers.js';
import {
  readSpellingContentBrowseModel,
  readSpellingContentSentenceDetailModel,
  readSpellingContentWordDetailModel,
} from './read-models.js';

const CONTENT_OPERATIONS_ROUTE_PREFIX = '/api/admin/content-operations';
const CONTENT_OPERATIONS_SUBJECT_ID = 'spelling';
const STUBBED_CONTENT_OPERATION_ROUTES = Object.freeze({
  rebase: { ticket: 'T6', capability: CONTENT_OPERATION_CAPABILITIES.EDIT },
  'scan-audio': { ticket: 'T7', capability: CONTENT_OPERATION_CAPABILITIES.EDIT },
  'generate-audio': { ticket: 'T7', capability: CONTENT_OPERATION_CAPABILITIES.EDIT },
  'upload-monster-asset': { ticket: 'T8', capability: CONTENT_OPERATION_CAPABILITIES.EDIT },
  'create-revert': { ticket: 'T9', capability: CONTENT_OPERATION_CAPABILITIES.ROLLBACK },
});

function mutationFromRequest(body = {}, request) {
  const mutation = body?.mutation && typeof body.mutation === 'object' ? body.mutation : {};
  return {
    requestId: body?.requestId || mutation.requestId || request.headers.get('x-ks2-request-id') || null,
    correlationId: body?.correlationId || mutation.correlationId || request.headers.get('x-ks2-correlation-id') || null,
  };
}

function normaliseBody(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normaliseLimit(value, fallback, maximum) {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(maximum, Math.max(1, Math.floor(limit)));
}

function includeSnapshot(url, body = {}) {
  const value = url.searchParams.get('includeSnapshot') ?? body.includeSnapshot;
  return value === true || value === 'true' || value === '1';
}

function optionalQueryString(url, key) {
  const value = url.searchParams.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function decodePathSegment(value, label) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new BadRequestError(`Invalid ${label}.`, {
      code: `invalid_${label}`,
    });
  }
}

function isContentOperationPath(pathname) {
  return pathname === CONTENT_OPERATIONS_ROUTE_PREFIX
    || pathname.startsWith(`${CONTENT_OPERATIONS_ROUTE_PREFIX}/`);
}

function relativeContentOperationPath(pathname) {
  const relative = pathname.slice(CONTENT_OPERATIONS_ROUTE_PREFIX.length);
  return relative || '/';
}

function operationPayloadFromBody(body) {
  if (body.operation && typeof body.operation === 'object' && !Array.isArray(body.operation)) {
    return body.operation;
  }
  return {
    entityType: body.entityType,
    entityId: body.entityId,
    fieldPath: body.fieldPath,
    action: body.action,
    payload: Object.prototype.hasOwnProperty.call(body, 'payload') ? body.payload : null,
    beforeHash: body.beforeHash,
    afterHash: body.afterHash,
  };
}

function proofFromRequest(body, request, action) {
  if (body.proof && typeof body.proof === 'object' && !Array.isArray(body.proof)) return body.proof;
  const mutation = mutationFromRequest(body, request);
  return {
    source: 'content-operations-api',
    action,
    requestId: mutation.requestId,
    correlationId: mutation.correlationId,
  };
}

function badContentOperation(error) {
  if (error?.status) throw error;
  const message = String(error?.message || error || 'Invalid content operation.');
  if (
    message.startsWith('Unsupported content operation')
    || message.startsWith('Unsupported audio requirement profile')
    || message.startsWith('Content operations require')
    || message.startsWith('Set operations require')
    || message.startsWith('Cannot ')
  ) {
    throw new BadRequestError('Invalid content operation.', {
      code: 'content_operation_invalid',
      detail: message,
    });
  }
  throw error;
}

async function requireContentOperationsActor({ repository, session, capability }) {
  const actor = await repository.assertAdminHubActorForBundle(session.accountId);
  if (actor.platformRole !== 'admin') {
    throw new ForbiddenError('Content operations require admin platform role.', {
      code: 'content_operations_forbidden',
      capability,
      required: 'platform_role:admin',
      platformRole: actor.platformRole,
    });
  }
  return {
    ...actor,
    id: session.accountId,
    accountId: session.accountId,
  };
}

async function requireRouteActor({
  repository,
  session,
  request,
  env,
  capability,
  mutation = false,
}) {
  requireSameOrigin(request, env);
  if (mutation) requireMutationCapability(session);
  return requireContentOperationsActor({ repository, session, capability });
}

async function contentOperationPackageDetail(repository, packageId) {
  const [contentPackage, events] = await Promise.all([
    repository.readContentOperationPackage(packageId, { includeOperations: true }),
    repository.listContentOperationEvents({ packageId, limit: 50 }),
  ]);
  return {
    package: serialiseContentOperationPackage(contentPackage),
    events: events.map(serialiseContentOperationEvent),
  };
}

function notFoundRoute() {
  return json({
    ok: false,
    code: 'content_operation_route_not_found',
    message: 'Content operation route was not found.',
  }, 404);
}

export async function handleContentOperationsAdminRequest({
  url,
  request,
  env,
  session,
  repository,
}) {
  if (!isContentOperationPath(url.pathname)) return null;

  const relativePath = relativeContentOperationPath(url.pathname);
  requireSameOrigin(request, env);

  if (request.method === 'GET' && relativePath === '/subjects/spelling/overview') {
    const actor = await requireRouteActor({
      repository,
      session,
      request,
      env,
      capability: CONTENT_OPERATION_CAPABILITIES.VIEW,
    });
    const limit = normaliseLimit(url.searchParams.get('limit'), 30, 100);
    const [latestRelease, packages, releases] = await Promise.all([
      repository.readLatestContentOperationRelease(CONTENT_OPERATIONS_SUBJECT_ID, { includeSnapshot: false }),
      repository.listContentOperationPackages({ subjectId: CONTENT_OPERATIONS_SUBJECT_ID, limit }),
      repository.listContentOperationReleases({ subjectId: CONTENT_OPERATIONS_SUBJECT_ID, limit: 10 }),
    ]);
    return json({
      ok: true,
      overview: serialiseContentOperationOverview({
        subjectId: CONTENT_OPERATIONS_SUBJECT_ID,
        latestRelease,
        packages,
        releases,
        actor,
      }),
    });
  }

  if (request.method === 'GET' && relativePath === '/subjects/spelling/browse') {
    const actor = await requireRouteActor({
      repository,
      session,
      request,
      env,
      capability: CONTENT_OPERATION_CAPABILITIES.VIEW,
    });
    const browse = await readSpellingContentBrowseModel({
      repository,
      subjectId: CONTENT_OPERATIONS_SUBJECT_ID,
      packageId: optionalQueryString(url, 'packageId'),
      filters: {
        query: optionalQueryString(url, 'query') || optionalQueryString(url, 'q'),
        pool: optionalQueryString(url, 'pool'),
        listId: optionalQueryString(url, 'listId'),
        limit: normaliseLimit(url.searchParams.get('limit'), 75, 250),
      },
    });
    return json({
      ok: true,
      actor: serialiseContentOperationActor(actor),
      browse,
    });
  }

  {
    const wordDetailMatch = /^\/subjects\/spelling\/words\/([^/]+)$/.exec(relativePath);
    if (request.method === 'GET' && wordDetailMatch) {
      const actor = await requireRouteActor({
        repository,
        session,
        request,
        env,
        capability: CONTENT_OPERATION_CAPABILITIES.VIEW,
      });
      const slug = decodePathSegment(wordDetailMatch[1], 'word_slug');
      const detail = await readSpellingContentWordDetailModel({
        repository,
        subjectId: CONTENT_OPERATIONS_SUBJECT_ID,
        packageId: optionalQueryString(url, 'packageId'),
        slug,
      });
      if (!detail.found) {
        return json({
          ok: false,
          code: 'spelling_content_word_not_found',
          message: 'Spelling content word was not found.',
          slug,
        }, 404);
      }
      return json({
        ok: true,
        actor: serialiseContentOperationActor(actor),
        detail,
      });
    }
  }

  {
    const sentenceDetailMatch = /^\/subjects\/spelling\/sentences\/([^/]+)$/.exec(relativePath);
    if (request.method === 'GET' && sentenceDetailMatch) {
      const actor = await requireRouteActor({
        repository,
        session,
        request,
        env,
        capability: CONTENT_OPERATION_CAPABILITIES.VIEW,
      });
      const sentenceId = decodePathSegment(sentenceDetailMatch[1], 'sentence_id');
      const detail = await readSpellingContentSentenceDetailModel({
        repository,
        subjectId: CONTENT_OPERATIONS_SUBJECT_ID,
        packageId: optionalQueryString(url, 'packageId'),
        sentenceId,
      });
      if (!detail.found) {
        return json({
          ok: false,
          code: 'spelling_content_sentence_not_found',
          message: 'Spelling content sentence was not found.',
          sentenceId,
        }, 404);
      }
      return json({
        ok: true,
        actor: serialiseContentOperationActor(actor),
        detail,
      });
    }
  }

  if (request.method === 'GET' && relativePath === '/subjects/spelling/releases') {
    const actor = await requireRouteActor({
      repository,
      session,
      request,
      env,
      capability: CONTENT_OPERATION_CAPABILITIES.VIEW,
    });
    const releases = await repository.listContentOperationReleases({
      subjectId: CONTENT_OPERATIONS_SUBJECT_ID,
      includeSnapshot: includeSnapshot(url),
      limit: normaliseLimit(url.searchParams.get('limit'), 20, 100),
    });
    return json({
      ok: true,
      actor: serialiseContentOperationActor(actor),
      releases: releases.map((release) => serialiseContentOperationRelease(release, {
        includeSnapshot: includeSnapshot(url),
      })),
    });
  }

  {
    const releaseMatch = /^\/subjects\/spelling\/releases\/([^/]+)$/.exec(relativePath);
    if (request.method === 'GET' && releaseMatch) {
      const actor = await requireRouteActor({
        repository,
        session,
        request,
        env,
        capability: CONTENT_OPERATION_CAPABILITIES.VIEW,
      });
      const releaseId = decodePathSegment(releaseMatch[1], 'release_id');
      const release = await repository.readContentOperationRelease(CONTENT_OPERATIONS_SUBJECT_ID, releaseId, {
        includeSnapshot: includeSnapshot(url),
      });
      if (!release) return notFoundRoute();
      return json({
        ok: true,
        actor: serialiseContentOperationActor(actor),
        release: serialiseContentOperationRelease(release, { includeSnapshot: includeSnapshot(url) }),
      });
    }
  }

  if (request.method === 'POST' && relativePath === '/subjects/spelling/packages') {
    const actor = await requireRouteActor({
      repository,
      session,
      request,
      env,
      capability: CONTENT_OPERATION_CAPABILITIES.EDIT,
      mutation: true,
    });
    const body = normaliseBody(await readJson(request));
    const contentPackage = await repository.createContentOperationPackage({
      subjectId: CONTENT_OPERATIONS_SUBJECT_ID,
      templateId: body.templateId,
      title: body.title,
      description: body.description,
      createdByAccountId: actor.id,
    });
    return json({
      ok: true,
      actor: serialiseContentOperationActor(actor),
      package: serialiseContentOperationPackage(contentPackage),
    }, 201);
  }

  if (request.method === 'GET' && relativePath === '/packages') {
    const actor = await requireRouteActor({
      repository,
      session,
      request,
      env,
      capability: CONTENT_OPERATION_CAPABILITIES.VIEW,
    });
    const state = url.searchParams.get('state');
    const packages = await repository.listContentOperationPackages({
      subjectId: CONTENT_OPERATIONS_SUBJECT_ID,
      state: state && state !== 'all' ? state : null,
      limit: normaliseLimit(url.searchParams.get('limit'), 50, 100),
    });
    return json({
      ok: true,
      actor: serialiseContentOperationActor(actor),
      packages: packages.map((contentPackage) => serialiseContentOperationPackage(contentPackage, { compact: true })),
    });
  }

  {
    const packageDetailMatch = /^\/packages\/([^/]+)$/.exec(relativePath);
    if (request.method === 'GET' && packageDetailMatch) {
      const actor = await requireRouteActor({
        repository,
        session,
        request,
        env,
        capability: CONTENT_OPERATION_CAPABILITIES.VIEW,
      });
      const packageId = decodePathSegment(packageDetailMatch[1], 'package_id');
      const detail = await contentOperationPackageDetail(repository, packageId);
      return json({
        ok: true,
        actor: serialiseContentOperationActor(actor),
        ...detail,
      });
    }

    if (request.method === 'PATCH' && packageDetailMatch) {
      const actor = await requireRouteActor({
        repository,
        session,
        request,
        env,
        capability: CONTENT_OPERATION_CAPABILITIES.EDIT,
        mutation: true,
      });
      const packageId = decodePathSegment(packageDetailMatch[1], 'package_id');
      const body = normaliseBody(await readJson(request));
      const contentPackage = await repository.updateContentOperationPackage(packageId, {
        templateId: body.templateId,
        title: body.title,
        description: body.description,
      }, {
        actorAccountId: actor.id,
      });
      return json({
        ok: true,
        actor: serialiseContentOperationActor(actor),
        package: serialiseContentOperationPackage(contentPackage),
      });
    }
  }

  {
    const operationsMatch = /^\/packages\/([^/]+)\/operations$/.exec(relativePath);
    if (request.method === 'POST' && operationsMatch) {
      const actor = await requireRouteActor({
        repository,
        session,
        request,
        env,
        capability: CONTENT_OPERATION_CAPABILITIES.EDIT,
        mutation: true,
      });
      const packageId = decodePathSegment(operationsMatch[1], 'package_id');
      const body = normaliseBody(await readJson(request));
      try {
        const operation = await repository.appendContentOperation(packageId, operationPayloadFromBody(body), {
          actorAccountId: actor.id,
        });
        return json({
          ok: true,
          actor: serialiseContentOperationActor(actor),
          operation: serialiseContentOperation(operation),
        }, 201);
      } catch (error) {
        badContentOperation(error);
      }
    }
  }

  {
    const deleteOperationMatch = /^\/packages\/([^/]+)\/operations\/([^/]+)$/.exec(relativePath);
    if (request.method === 'DELETE' && deleteOperationMatch) {
      const actor = await requireRouteActor({
        repository,
        session,
        request,
        env,
        capability: CONTENT_OPERATION_CAPABILITIES.EDIT,
        mutation: true,
      });
      const packageId = decodePathSegment(deleteOperationMatch[1], 'package_id');
      const operationId = decodePathSegment(deleteOperationMatch[2], 'operation_id');
      const result = await repository.deleteContentOperation(packageId, operationId, {
        actorAccountId: actor.id,
      });
      return json({
        ok: true,
        actor: serialiseContentOperationActor(actor),
        deleted: result.deleted,
        operation: serialiseContentOperation(result.operation),
      });
    }
  }

  {
    const actionMatch = /^\/packages\/([^/]+)\/(validate|approve|publish|resolve-conflict|rebase|scan-audio|generate-audio|upload-monster-asset|create-revert)$/.exec(relativePath);
    if (request.method === 'POST' && actionMatch) {
      const packageId = decodePathSegment(actionMatch[1], 'package_id');
      const action = actionMatch[2];
      const stub = STUBBED_CONTENT_OPERATION_ROUTES[action];
      const capability = action === 'approve'
        ? CONTENT_OPERATION_CAPABILITIES.APPROVE
        : (action === 'publish' ? CONTENT_OPERATION_CAPABILITIES.PUBLISH : (stub?.capability || CONTENT_OPERATION_CAPABILITIES.EDIT));
      const actor = await requireRouteActor({
        repository,
        session,
        request,
        env,
        capability,
        mutation: true,
      });

      if (stub) {
        return json(serialiseContentOperationStub({
          action,
          ticket: stub.ticket,
          capability,
        }), 501);
      }

      const body = normaliseBody(await readJson(request));
      if (action === 'validate') {
        let candidate;
        try {
          candidate = await repository.buildContentOperationCandidate(packageId, {
            actorAccountId: actor.id,
          });
        } catch (error) {
          badContentOperation(error);
        }
        return json({
          ok: true,
          actor: serialiseContentOperationActor(actor),
          candidate: serialiseContentOperationCandidate(candidate, {
            includeSnapshot: includeSnapshot(url, body),
          }),
        });
      }

      if (action === 'resolve-conflict') {
        let result;
        try {
          const resolveRequest = {
            conflictId: body.conflictId,
            conflict: body.conflict,
            resolution: body.resolution,
          };
          if (Object.prototype.hasOwnProperty.call(body, 'value')) {
            resolveRequest.value = body.value;
          }
          result = await repository.resolveContentOperationConflict(packageId, resolveRequest, {
            actorAccountId: actor.id,
          });
        } catch (error) {
          badContentOperation(error);
        }
        return json({
          ok: true,
          actor: serialiseContentOperationActor(actor),
          conflict: result.conflict,
          resolution: result.resolution,
          operation: serialiseContentOperation(result.operation),
          candidate: serialiseContentOperationCandidate(result.candidate, {
            includeSnapshot: includeSnapshot(url, body),
          }),
        });
      }

      if (action === 'approve') {
        const candidateId = body.candidateId || body.candidate_id;
        if (!candidateId) {
          throw new BadRequestError('Content operation approval requires a candidate id.', {
            code: 'content_operation_candidate_id_required',
            packageId,
          });
        }
        if (body.audioFallback != null) {
          throw new BadRequestError('Content operation audio fallback approvals are not supported.', {
            code: 'content_operation_audio_fallback_not_supported',
            packageId,
            candidateId,
          });
        }
        const approval = await repository.approveContentOperationCandidate(packageId, candidateId, {
          approvedByAccountId: actor.id,
          notes: body.notes,
          assetSummary: body.assetSummary ?? null,
        });
        return json({
          ok: true,
          actor: serialiseContentOperationActor(actor),
          approval: serialiseContentOperationApproval(approval),
        });
      }

      const release = await repository.publishContentOperationPackage(packageId, {
        publishedByAccountId: actor.id,
        proof: proofFromRequest(body, request, action),
      });
      return json({
        ok: true,
        actor: serialiseContentOperationActor(actor),
        release: serialiseContentOperationRelease(release, {
          includeSnapshot: includeSnapshot(url, body),
        }),
      });
    }
  }

  {
    const rollbackMatch = /^\/releases\/([^/]+)\/rollback$/.exec(relativePath);
    if (request.method === 'POST' && rollbackMatch) {
      const actor = await requireRouteActor({
        repository,
        session,
        request,
        env,
        capability: CONTENT_OPERATION_CAPABILITIES.ROLLBACK,
        mutation: true,
      });
      const releaseId = decodePathSegment(rollbackMatch[1], 'release_id');
      const body = normaliseBody(await readJson(request));
      const release = await repository.rollbackContentOperationRelease(CONTENT_OPERATIONS_SUBJECT_ID, releaseId, {
        rolledBackByAccountId: actor.id,
        proof: proofFromRequest(body, request, 'rollback'),
      });
      return json({
        ok: true,
        actor: serialiseContentOperationActor(actor),
        release: serialiseContentOperationRelease(release, {
          includeSnapshot: includeSnapshot(url, body),
        }),
      });
    }
  }

  await requireContentOperationsActor({
    repository,
    session,
    capability: CONTENT_OPERATION_CAPABILITIES.VIEW,
  });
  return notFoundRoute();
}
