import {
  queueTPCRLearningEvent,
  resolveCompanyIdForUser,
  resolveCompanyIdFromCourseId,
  resolveCompanyIdFromChapterId,
  resolveCompanyIdFromLessonId,
} from "../services/tpcrOutboxService.js";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const deriveCompanyId = async (req) => {
  const directCompanyId =
    toPositiveInt(req.body?.company_id) ??
    toPositiveInt(req.body?.companyId) ??
    toPositiveInt(req.query?.company_id);

  if (directCompanyId) return directCompanyId;

  const courseIdFromBody = toPositiveInt(req.body?.course_id) ?? toPositiveInt(req.params?.courseId);
  if (courseIdFromBody) {
    const fromCourseBody = await resolveCompanyIdFromCourseId(courseIdFromBody);
    if (fromCourseBody) return fromCourseBody;
  }

  const path = String(req.path || "").toLowerCase();
  const idParam = toPositiveInt(req.params?.id);
  if (idParam) {
    if (path.includes("/chapters/") && path.includes("/lessons")) {
      const fromChapter = await resolveCompanyIdFromChapterId(idParam);
      if (fromChapter) return fromChapter;
    } else if (path.includes("/chapters/")) {
      const fromChapter = await resolveCompanyIdFromChapterId(idParam);
      if (fromChapter) return fromChapter;
    } else if (path.includes("/lessons/")) {
      const fromLesson = await resolveCompanyIdFromLessonId(idParam);
      if (fromLesson) return fromLesson;
    } else if (path.includes("/courses/")) {
      const fromCourse = await resolveCompanyIdFromCourseId(idParam);
      if (fromCourse) return fromCourse;
    }
  }

  const userId = toPositiveInt(req.user?.profile_id) ?? toPositiveInt(req.user?.id);
  if (userId) {
    return resolveCompanyIdForUser(userId);
  }

  return null;
};

const buildEventType = (req) => {
  const normalizedPath = String(req.path || "")
    .split("/")
    .filter(Boolean)
    .slice(0, 5)
    .join(".");

  return `${String(req.method || "UNKNOWN").toLowerCase()}.learning.${normalizedPath || "api"}`;
};

export const tpcrOutboxMiddleware = (req, res, next) => {
  if (!MUTATION_METHODS.has(String(req.method || "").toUpperCase())) {
    return next();
  }

  res.on("finish", () => {
    if (res.statusCode >= 400) return;

    void (async () => {
      try {
        const companyId = await deriveCompanyId(req);
        await queueTPCRLearningEvent({
          eventType: buildEventType(req),
          companyId,
          domainId: toPositiveInt(req.body?.domain_id) ?? toPositiveInt(req.body?.domainId),
          payload: {
            route: req.originalUrl || req.path || null,
            method: req.method,
            user_id: req.user?.profile_id || req.user?.id || null,
            status_code: res.statusCode,
          },
        });
      } catch (error) {
        console.error("tpcrOutboxMiddleware (learning) error:", error.message);
      }
    })();
  });

  return next();
};

export default tpcrOutboxMiddleware;
