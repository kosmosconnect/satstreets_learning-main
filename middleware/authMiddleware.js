import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import db from "../config/db.js";

dotenv.config();

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];  

  if (!token) {
    return res.status(401).json({ status: 0, message: "Access Denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;  
    next();  
  } catch (err) {
    return res.status(403).json({ status: 0, message: "Invalid or expired token" });
  }
};

// Shared helper: fetch and validate subscription tier
const checkSubscriptionTier = async (req, requiredTiers, featureLabel) => {
  const primaryUserId = req.user?.profile_id || req.user?.id;
  if (!primaryUserId && !req.user?.phone && !req.user?.email) {
    return { ok: false, code: 403, message: `${featureLabel} requires authentication` };
  }

  let rows = [];
  if (primaryUserId) {
    const [rowsById] = await db.query(
      "SELECT id, subscription_status, subscription_expires_at FROM users WHERE id = ?",
      [primaryUserId]
    );
    rows = rowsById;
  }

  if ((!rows || rows.length === 0) && req.user?.phone) {
    const [rowsByPhone] = await db.query(
      "SELECT id, subscription_status, subscription_expires_at FROM users WHERE phone = ? LIMIT 1",
      [String(req.user.phone).trim()]
    );
    rows = rowsByPhone;
  }

  if ((!rows || rows.length === 0) && req.user?.email) {
    const [rowsByEmail] = await db.query(
      "SELECT id, subscription_status, subscription_expires_at FROM users WHERE email = ? ORDER BY id DESC LIMIT 1",
      [String(req.user.email).trim()]
    );
    rows = rowsByEmail;
  }

  if (!rows || rows.length === 0) {
    return { ok: false, code: 404, message: "User not found" };
  }

  const subscriptionStatus = rows[0].subscription_status;
  const subscriptionExpiresAt = rows[0].subscription_expires_at;
  req.user.profile_id = rows[0].id;

  req.user.subscription_status = subscriptionStatus;
  req.user.subscription_expires_at = subscriptionExpiresAt;

  const now = new Date();
  const expiresDate = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
  const isActive =
    requiredTiers.includes(subscriptionStatus) &&
    (!expiresDate || expiresDate.getTime() > now.getTime());

  if (!isActive) {
    return {
      ok: false,
      code: 402,
      message: `${featureLabel} subscription required for this action`,
    };
  }

  req.subscription = {
    status: subscriptionStatus,
    tier: subscriptionStatus,
    expires_at: subscriptionExpiresAt,
  };

  return { ok: true };
};

// Accepts: pro, enterprise (and legacy 'premium' mapped to pro)
export const requirePremium = async (req, res, next) => {
  try {
    const result = await checkSubscriptionTier(req, ["premium", "pro", "enterprise"], "Pro");
    if (!result.ok) return res.status(result.code).json({ status: 0, message: result.message });
    next();
  } catch (error) {
    console.error("requirePremium error:", error);
    return res.status(500).json({ status: 0, message: "Failed to verify subscription status" });
  }
};

// Accepts: pro, enterprise
export const requirePro = async (req, res, next) => {
  try {
    const result = await checkSubscriptionTier(req, ["pro", "enterprise"], "Pro");
    if (!result.ok) return res.status(result.code).json({ status: 0, message: result.message });
    next();
  } catch (error) {
    console.error("requirePro error:", error);
    return res.status(500).json({ status: 0, message: "Failed to verify subscription status" });
  }
};

// Accepts: enterprise only
export const requireEnterprise = async (req, res, next) => {
  try {
    const result = await checkSubscriptionTier(req, ["enterprise"], "Enterprise");
    if (!result.ok) return res.status(result.code).json({ status: 0, message: result.message });
    next();
  } catch (error) {
    console.error("requireEnterprise error:", error);
    return res.status(500).json({ status: 0, message: "Failed to verify subscription status" });
  }
};

export const requireAdmin = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ status: 0, message: "Access Denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userType = decoded?.user_typ || decoded?.user_type || "";
    if (String(userType).toLowerCase() !== "admin") {
      return res.status(403).json({ status: 0, message: "Admin access required" });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ status: 0, message: "Invalid or expired token" });
  }
};

/**
 * RBAC middleware factory.
 * Usage: requireAdminRole('super_admin', 'admin')
 * Verifies JWT is valid admin token AND decoded.role is in the allowed list.
 */
export const requireAdminRole = (...allowedRoles) => {
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ status: 0, message: "Access Denied. No token provided." });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userType = String(decoded?.user_typ || "").toLowerCase();
      if (userType !== "admin") {
        return res.status(403).json({ status: 0, message: "Admin access required" });
      }

      const role = decoded?.role;
      if (!role || !allowedRoles.includes(role)) {
        return res.status(403).json({ status: 0, message: `Insufficient permissions. Required role: ${allowedRoles.join(" or ")}` });
      }

      req.user = decoded;
      next();
    } catch (err) {
      return res.status(403).json({ status: 0, message: "Invalid or expired token" });
    }
  };
};
