import {
  createEmailUser,
  findOrCreateUserFromIdentity,
  getUserByEmail,
} from "../lib/store.js";

export function findUserByEmail(env, email) {
  return getUserByEmail(env, email);
}

export function createEmailUserAccount(env, payload) {
  return createEmailUser(env, payload);
}

export function findOrCreateUserFromProviderIdentity(env, payload) {
  return findOrCreateUserFromIdentity(env, payload);
}
