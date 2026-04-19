import { Hono } from "hono";
import {
  parseChildIdParam,
  parseChildProfilePayload,
} from "../contracts/children-contract.js";
import { json, readJsonBody } from "../lib/http.js";
import { requireSession } from "../middleware/require-session.js";
import {
  createChildForParent,
  listChildren,
  selectChildForParent,
  updateChildForParent,
} from "../services/children-service.js";

const childrenRoutes = new Hono();

childrenRoutes.get("/children", requireSession, async (c) => {
  return json(c, 200, listChildren(c.get("sessionBundle")));
});

childrenRoutes.post("/children", requireSession, async (c) => {
  const payload = parseChildProfilePayload(await readJsonBody(c));
  const response = await createChildForParent(
    c.env,
    c.get("sessionBundle"),
    c.get("sessionHash"),
    payload,
  );
  return json(c, 201, response);
});

childrenRoutes.put("/children/:childId", requireSession, async (c) => {
  const childId = parseChildIdParam(c.req.param("childId"));
  const payload = parseChildProfilePayload(await readJsonBody(c));
  const response = await updateChildForParent(
    c.env,
    c.get("sessionBundle"),
    c.get("sessionHash"),
    childId,
    payload,
  );
  return json(c, 200, response);
});

childrenRoutes.post("/children/:childId/select", requireSession, async (c) => {
  const childId = parseChildIdParam(c.req.param("childId"));
  const response = await selectChildForParent(
    c.env,
    c.get("sessionBundle"),
    c.get("sessionHash"),
    childId,
  );
  return json(c, 200, response);
});

export default childrenRoutes;
