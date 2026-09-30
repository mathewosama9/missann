import { Router } from 'express';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { coursesRouter } from './modules/courses/courses.routes.js';
import { adminContentRouter } from './modules/courses/courses.admin.routes.js';
import { lessonsRouter } from './modules/lessons/lessons.routes.js';
import { bunnyAdminRouter } from './modules/bunny/bunny.admin.routes.js';
import { walletRouter } from './modules/wallet/wallet.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { codesAdminRouter } from './modules/codes/codes.admin.routes.js';
import { financeAdminRouter } from './modules/payments/finance.admin.routes.js';
import { attemptsRouter, examsRouter } from './modules/exams/exams.routes.js';
import { adminAttemptsRouter, adminExamsRouter, adminQuestionsRouter } from './modules/exams/exams.admin.routes.js';
import { adminUploadsRouter } from './modules/uploads/uploads.admin.routes.js';
import { homeworkRouter } from './modules/homework/homework.routes.js';
import { adminHomeworkRouter } from './modules/homework/homework.admin.routes.js';
import { liveRouter } from './modules/live/live.routes.js';
import { adminLiveRouter } from './modules/live/live.admin.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { adminNotificationsRouter } from './modules/notifications/notifications.admin.routes.js';

// المُجمِّع الرئيسي لكل مسارات الـ API
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/courses', coursesRouter);
apiRouter.use('/lessons', lessonsRouter);
apiRouter.use('/wallet', walletRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/exams', examsRouter);
apiRouter.use('/attempts', attemptsRouter);
apiRouter.use('/homework', homeworkRouter);
apiRouter.use('/live', liveRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/admin/bunny', bunnyAdminRouter);
apiRouter.use('/admin/codes', codesAdminRouter);
// الامتحانات والرفع: أدمن + مساعد، مركّبة على مسارات محددة فلا تحجب غيرها
apiRouter.use('/admin/exams', adminExamsRouter);
apiRouter.use('/admin/questions', adminQuestionsRouter);
apiRouter.use('/admin/attempts', adminAttemptsRouter);
apiRouter.use('/admin/uploads', adminUploadsRouter);
// الواجبات والتصحيح والحصص اللايف: أدمن + مساعد، على مسارات محددة أيضاً
apiRouter.use('/admin/homework', adminHomeworkRouter);
apiRouter.use('/admin/live', adminLiveRouter);
// الإرسال الجماعي والقوالب: أدمن فقط
apiRouter.use('/admin/notifications', adminNotificationsRouter);
// حراسة الأدمن فيه على مستوى كل مسار (لا router.use) حتى لا يحجب مسارات المحتوى عن المساعد
apiRouter.use('/admin', financeAdminRouter);
apiRouter.use('/admin', adminContentRouter);
