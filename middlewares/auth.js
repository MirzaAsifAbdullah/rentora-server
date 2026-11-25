import { createRemoteJWKSet, jwtVerify } from "jose";

const CLIENT_URL = (
  process.env.CLIENT_URL || "http://localhost:3000"
).replace(/\/+$/, "");

const AUTH_JWKS_URL = `${CLIENT_URL}/api/auth/jwks`;

let jwks = null;

function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(AUTH_JWKS_URL));
  }

  return jwks;
}

/**
 * Verifies the Bearer token sent by the client (Better Auth JWT) against the
 * JWKS endpoint exposed by the Next.js app, then attaches the payload to
 * `req.user`.
 */
export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Unauthorized!" });
  }

  const token = authHeader.slice(7).trim();

  try {
    const { payload } = await jwtVerify(token, getJwks());

    if (!payload.email) {
      return res.status(401).json({ success: false, message: "Unauthorized!" });
    }

    req.user = payload;
    return next();
  } catch (error) {
    console.error("Token verification failed:", error.message);
    return res.status(401).json({ success: false, message: "Unauthorized!" });
  }
}

export default verifyToken;
