import type {
  Role,
  Grade,
  CourseType,
  Term,
  AttachmentType,
  VideoProvider,
  WalletTxType,
  CodeStatus,
  PaymentStatus,
  PaymentPurpose,
  EnrollmentSource,
  QuestionType,
  AttemptStatus,
  ResultRelease,
  LiveProvider,
  NotifChannel,
  NotifStatus,
  NotifType,
  BroadcastAudience,
} from './enums.js';
import type { VideoKey } from './youtube.js';
import type { TemplateChannel } from './notifications.js';

// حمولة توكن الوصول
export interface JwtPayload {
  sub: number;
  role: Role;
  grade?: Grade;
  name: string;
}

// استجابة API موحّدة
export interface ApiError {
  message: string;
  code?: string;
  fields?: Record<string, string>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── DTOs للكورسات والحصص ─────────────────────────────────────
export interface CourseListItem {
  id: number;
  title: string;
  grade: Grade;
  type: CourseType;
  term: Term | null;
  month: number | null;
  price: number; // بالقرش
  coverImage: string | null;
  order: number;
  lessonsCount: number;
}

export interface LessonListItem {
  id: number;
  title: string;
  order: number;
  durationSec: number;
  isFreePreview: boolean;
  locked: boolean; // مقفول لغير المشترك (وغير المعاينة المجانية)
  attachmentsCount: number;
}

export interface CourseDetailDTO extends CourseListItem {
  description: string;
  isPublished: boolean;
  enrolled: boolean;
  enrollmentExpiresAt: string | null;
  lessons: LessonListItem[];
}

export interface AttachmentDTO {
  id: number;
  type: AttachmentType;
  url: string;
  title: string;
}

// مرجع الحصة للمشترك/المعاينة — بدون معرّف الفيديو الخام (التشغيل عبر /lessons/:id/play)
export interface LessonPlaybackDTO {
  id: number;
  courseId: number;
  title: string;
  durationSec: number;
  isFreePreview: boolean;
  hasVideo: boolean;
  attachments: AttachmentDTO[];
}

// استجابة /lessons/:id/play — حسب مصدر الفيديو:
// BUNNY: رابط iframe موقّع قصير العمر · YOUTUBE: معرّف مُخفى يُفك داخل المشغّل فقط
interface LessonPlayBase {
  lessonId: number;
  expiresAt: string; // ISO — بعده يعيد المشغّل طلب /play (وإعادة فحص الاشتراك)
  watermarkText: string;
  progress: LessonProgressDTO;
}
export type LessonPlayDTO =
  | (LessonPlayBase & { provider: 'BUNNY'; embedUrl: string })
  | (LessonPlayBase & { provider: 'YOUTUBE'; videoKey: VideoKey });

export interface LessonProgressDTO {
  percent: number;
  lastPositionSec: number;
  completedAt: string | null;
}

// استجابة /lessons/:id/progress
export interface ProgressResultDTO {
  progress: LessonProgressDTO;
  stars: number; // عدد الحصص المكتملة (نجوم التحفيز)
  justCompleted: boolean;
}

// استجابة /admin/bunny/create-video — رفع مباشر من المتصفح عبر TUS بتوقيع مؤقت
export interface BunnyUploadDTO {
  videoId: string;
  lessonId: number;
  tusEndpoint: string;
  headers: {
    AuthorizationSignature: string;
    AuthorizationExpire: string;
    VideoId: string;
    LibraryId: string;
  };
  expiresAt: string;
}

// DTOs إدارية (تشمل الحقول الكاملة)
export interface AdminLessonDTO {
  id: number;
  title: string;
  order: number;
  videoProvider: VideoProvider;
  bunnyVideoId: string | null;
  youtubeVideoId: string | null;
  durationSec: number;
  isFreePreview: boolean;
  attachments: AttachmentDTO[];
}

export interface AdminCourseDTO extends CourseListItem {
  description: string;
  isPublished: boolean;
  createdAt: string;
  lessons: AdminLessonDTO[];
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: number;
    name: string;
    phone: string;
    email: string | null;
    role: Role;
    grade: Grade | null;
    governorate: string;
  };
}

// ── DTOs المحفظة والدفع (كل المبالغ بالقرش) ─────────────────────
export interface WalletTxDTO {
  id: number;
  amount: number; // موجب = إضافة، سالب = خصم
  type: WalletTxType;
  balanceAfter: number;
  note: string;
  createdAt: string;
}

export interface WalletDTO {
  balance: number;
  transactions: WalletTxDTO[];
}

export interface RedeemResultDTO {
  amount: number;
  balance: number;
}

export interface SubscribeResultDTO {
  courseId: number;
  expiresAt: string;
  balance: number;
  charged: number;
}

export interface PaymentInitDTO {
  paymentId: number;
  iframeUrl: string;
}

export interface PaymentDTO {
  id: number;
  amount: number;
  status: PaymentStatus;
  purpose: PaymentPurpose;
  courseId: number | null;
  courseTitle: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface AdminPaymentDTO extends PaymentDTO {
  provider: string;
  providerRef: string | null;
  user: { id: number; name: string; phone: string };
}

export interface CodeBatchDTO {
  id: number;
  label: string;
  value: number;
  count: number;
  createdAt: string;
  createdBy: { id: number; name: string } | null;
  stats: Record<CodeStatus, number>;
}

// نتيجة توليد دفعة: الأكواد الخام تُرجع هنا فقط (مرة واحدة) ولا يمكن استرجاعها لاحقاً
export interface CodeBatchCreatedDTO {
  batch: CodeBatchDTO;
  codes: string[];
}

export interface AdminCodeDTO {
  id: number;
  codeHint: string;
  value: number;
  status: CodeStatus;
  batchId: number;
  batchLabel: string;
  usedBy: { id: number; name: string; phone: string } | null;
  usedAt: string | null;
  createdAt: string;
}

export interface AdminEnrollResultDTO {
  userId: number;
  courseId: number;
  source: EnrollmentSource;
  expiresAt: string;
}

// ── DTOs للامتحانات (طالب) ──────────────────────────────────────
// حالة الامتحان من منظور الطالب
export type ExamState = 'UPCOMING' | 'OPEN' | 'IN_PROGRESS' | 'FINISHED' | 'MISSED';

// حالة نتيجة محاولة منتهية من منظور الطالب:
// GRADING: فيها إجابات كتابية لم تصحّحها المس بعد؛ WAITING: مصحّحة لكن لم يحن وقت إعلانها؛ VISIBLE: ظاهرة
export type ResultState = 'GRADING' | 'WAITING' | 'VISIBLE';

export interface ExamAttemptBrief {
  id: number;
  status: AttemptStatus;
  resultState: ResultState | null; // null أثناء المحاولة
  score: number | null; // null ما لم تكن النتيجة VISIBLE
  totalPoints: number;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
}

export interface ExamListItemDTO {
  id: number;
  title: string;
  description: string;
  grade: Grade;
  courseId: number | null;
  courseTitle: string | null;
  durationMin: number;
  startAt: string | null;
  endAt: string | null;
  questionsCount: number;
  totalPoints: number;
  passScore: number;
  resultRelease: ResultRelease;
  state: ExamState;
  attempt: ExamAttemptBrief | null;
}

// لا يوجد isCorrect في أي DTO يصل للطالب قبل السماح بالمراجعة
export interface ExamChoiceDTO {
  id: number;
  text: string;
}

export interface ExamQuestionDTO {
  id: number;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  points: number;
  choices: ExamChoiceDTO[]; // فارغة للأسئلة الكتابية
}

export interface AttemptSessionDTO {
  attemptId: number;
  examId: number;
  title: string;
  status: AttemptStatus;
  startedAt: string;
  deadlineAt: string; // موعد الخادم — العدّاد يُحسب منه فقط
  serverNow: string; // لتصحيح فرق ساعة الجهاز
  graceSec: number;
  questions: ExamQuestionDTO[];
  answers: Record<number, number>; // questionId → choiceId (الموضوعية)
  texts: Record<number, string>; // questionId → نص الإجابة (الكتابية)
}

export interface AnswerSavedDTO {
  questionId: number;
  savedAt: string;
}

export interface ReviewChoiceDTO {
  id: number;
  text: string;
  isCorrect: boolean;
}

export interface ReviewItemDTO {
  questionId: number;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  points: number;
  earned: number; // الدرجة التي أخذها الطالب في السؤال
  correct: boolean; // الدرجة كاملة
  // موضوعي
  choices: ReviewChoiceDTO[];
  selectedChoiceId: number | null;
  // كتابي
  answerText: string | null;
  feedback: string | null;
  modelAnswer: string | null;
}

export interface AttemptResultDTO {
  attemptId: number;
  examId: number;
  examTitle: string;
  status: AttemptStatus;
  submittedAt: string | null;
  resultRelease: ResultRelease;
  resultState: ResultState;
  // موعد ظهور النتيجة (وضع AFTER_END) — لإعلام الطالب
  resultAvailableAt: string | null;
  passScore: number;
  // null كلها ما لم تكن النتيجة VISIBLE
  score: number | null;
  totalPoints: number | null;
  percent: number | null;
  passed: boolean | null;
  stars: number | null;
  answeredCount: number | null;
  review: ReviewItemDTO[] | null;
}

// ── DTOs للامتحانات (أدمن) ──────────────────────────────────────
export interface AdminExamListItemDTO {
  id: number;
  title: string;
  grade: Grade;
  courseId: number | null;
  courseTitle: string | null;
  durationMin: number;
  startAt: string | null;
  endAt: string | null;
  isPublished: boolean;
  shuffle: boolean;
  resultRelease: ResultRelease;
  resultsReleasedAt: string | null;
  notifyParent: boolean;
  passScore: number;
  questionsCount: number;
  totalPoints: number;
  attemptsCount: number;
  // محاولات سلّمت وتنتظر تصحيح الأسئلة الكتابية
  pendingGrading: number;
  createdAt: string;
}

export interface AdminChoiceDTO {
  id: number;
  text: string;
  isCorrect: boolean;
  order: number;
}

export interface AdminQuestionDTO {
  id: number;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  points: number;
  order: number;
  modelAnswer: string | null;
  choices: AdminChoiceDTO[];
}

export interface AdminExamDetailDTO extends AdminExamListItemDTO {
  description: string;
  // بعد أول محاولة: الأسئلة مقفولة هيكلياً (نص فقط) حتى لا تتغيّر درجات من امتحنوا
  locked: boolean;
  questions: AdminQuestionDTO[];
}

export interface QuestionStatDTO {
  questionId: number;
  order: number;
  type: QuestionType;
  text: string;
  points: number;
  answered: number;
  correct: number; // أخذ الدرجة كاملة
  errorRate: number; // % من المحاولات المصحّحة (عدم الإجابة = خطأ)
}

export interface ExamAnalyticsDTO {
  examId: number;
  title: string;
  totalPoints: number;
  passScore: number;
  finished: number; // محاولات مصحّحة بالكامل (تدخل في الإحصاءات)
  pendingGrading: number;
  inProgress: number;
  average: number | null; // بالدرجات (رقم عشري واحد)
  averagePercent: number | null;
  highest: number | null;
  lowest: number | null;
  passed: number;
  passRate: number | null; // %
  distribution: { label: string; count: number }[];
  questions: QuestionStatDTO[];
  hardest: QuestionStatDTO | null;
}

export interface AdminAttemptRowDTO {
  id: number;
  user: { id: number; name: string; phone: string };
  status: AttemptStatus;
  score: number | null;
  totalPoints: number;
  percent: number | null;
  needsGrading: boolean;
  gradedAt: string | null;
  startedAt: string;
  submittedAt: string | null;
}

// شاشة تصحيح محاولة واحدة
export interface GradingItemDTO {
  questionId: number;
  order: number;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  points: number;
  manual: boolean;
  // موضوعي (مصحّح آلياً — للعرض فقط)
  choices: AdminChoiceDTO[];
  selectedChoiceId: number | null;
  // كتابي
  modelAnswer: string | null;
  answerText: string | null;
  awardedPoints: number | null;
  feedback: string | null;
  earned: number;
}

export interface AdminAttemptDetailDTO {
  id: number;
  examId: number;
  examTitle: string;
  user: { id: number; name: string; phone: string };
  status: AttemptStatus;
  score: number | null;
  totalPoints: number;
  passScore: number;
  startedAt: string;
  submittedAt: string | null;
  gradedAt: string | null;
  pendingCount: number; // إجابات كتابية لم تُصحَّح بعد
  items: GradingItemDTO[];
}

// ── DTOs الواجبات ────────────────────────────────────────────────
// REQUIRED: لم يسلّم والموعد لم يمر · LATE: لم يسلّم والموعد مرّ (التسليم متاح ويُعلَّم متأخراً)
// SUBMITTED: سلّم وينتظر التصحيح · GRADED: صُحّح
export type HomeworkStatus = 'REQUIRED' | 'LATE' | 'SUBMITTED' | 'GRADED';

export interface HomeworkAttachmentDTO {
  name: string;
  mime: string;
}

export interface HomeworkSubmissionDTO {
  id: number;
  fileName: string;
  fileMime: string;
  fileSize: number;
  submittedAt: string;
  isLate: boolean; // سُلِّم بعد dueAt
  grade: number | null;
  feedback: string;
  gradedAt: string | null;
  canResubmit: boolean;
}

export interface HomeworkItemDTO {
  id: number;
  title: string;
  description: string;
  courseId: number;
  courseTitle: string;
  lessonId: number | null;
  lessonTitle: string | null;
  dueAt: string | null;
  maxGrade: number;
  attachment: HomeworkAttachmentDTO | null;
  status: HomeworkStatus;
  submission: HomeworkSubmissionDTO | null;
}

export interface HomeworkListDTO extends Paginated<HomeworkItemDTO> {
  counts: { REQUIRED: number; SUBMITTED: number; GRADED: number };
}

export interface AdminHomeworkDTO {
  id: number;
  title: string;
  description: string;
  courseId: number;
  courseTitle: string;
  lessonId: number | null;
  lessonTitle: string | null;
  dueAt: string | null;
  maxGrade: number;
  attachment: HomeworkAttachmentDTO | null;
  submissionsCount: number;
  gradedCount: number;
  createdAt: string;
}

export interface AdminSubmissionDTO {
  id: number;
  user: { id: number; name: string; phone: string };
  fileName: string;
  fileMime: string;
  fileSize: number;
  submittedAt: string;
  isLate: boolean;
  grade: number | null;
  feedback: string;
  gradedAt: string | null;
}

// ── DTOs الحصص اللايف ────────────────────────────────────────────
// UPCOMING: قبل نافذة الانضمام · OPEN: داخل النافذة (joinUrl موجود) · ENDED: انتهت
export type LiveState = 'UPCOMING' | 'OPEN' | 'ENDED';

export interface LiveSessionDTO {
  id: number;
  title: string;
  provider: LiveProvider;
  courseId: number;
  courseTitle: string;
  startAt: string;
  durationMin: number;
  joinOpensAt: string;
  endsAt: string;
  state: LiveState;
  // يُرسَل فقط للمشترك وداخل النافذة؛ غير موجود في الاستجابة خلاف ذلك
  joinUrl?: string;
}

export interface LiveListDTO extends Paginated<LiveSessionDTO> {
  serverNow: string; // لضبط العدّاد على ساعة الخادم لا ساعة الجهاز
}

export interface AdminLiveSessionDTO {
  id: number;
  title: string;
  provider: LiveProvider;
  courseId: number;
  courseTitle: string;
  joinUrl: string;
  startAt: string;
  durationMin: number;
  createdAt: string;
  updatedAt: string;
}

// ── DTOs الإشعارات ───────────────────────────────────────────────
export interface NotificationDTO {
  id: number;
  title: string;
  body: string;
  type: NotifType;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListDTO extends Paginated<NotificationDTO> {
  unread: number;
}

export interface AdminBroadcastDTO {
  id: number;
  title: string;
  body: string;
  audience: BroadcastAudience;
  grade: Grade | null;
  courseId: number | null;
  courseTitle: string | null;
  alsoWhatsapp: boolean;
  recipients: number;
  completedAt: string | null;
  createdAt: string;
  // حالة رسائل واتساب/SMS لهذا البث
  messages: Record<NotifStatus, number>;
}

// رسالة صادرة في سجل الأدمن — الرقم مُقنَّع، ونص كود التحقق لا يُخزَّن أصلاً
export interface AdminMessageDTO {
  id: number;
  type: NotifType;
  channel: NotifChannel;
  status: NotifStatus;
  toPhone: string;
  userName: string;
  body: string;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationTemplateDTO {
  key: string;
  channel: TemplateChannel;
  label: string;
  title: string;
  body: string;
  isSystem: boolean;
  // قالب نظام عُدّل نصه (الحذف يعيده للافتراضي)
  isCustomized: boolean;
  vars: readonly string[];
  required: readonly string[];
  updatedAt: string | null;
}

// ── لوحات التحكم (Phase 8) ─────────────────────────────────────

// لوحة الأدمن: المبالغ بالقرش، والأيام بتوقيت القاهرة (YYYY-MM-DD)
export interface RevenueSplit {
  online: number;
  codes: number;
  total: number;
}

export interface AdminStatsDTO {
  kpis: {
    students: number;
    activeEnrollments: number;
    usedCodes: number;
    revenueToday: RevenueSplit;
    revenueMonth: RevenueSplit;
  };
  daily: { day: string; online: number; codes: number; enrollments: number; students: number }[];
  studentsByGrade: { grade: Grade | null; count: number }[];
  latestEnrollments: {
    id: number;
    source: EnrollmentSource;
    createdAt: string;
    expiresAt: string;
    user: { id: number; name: string };
    course: { id: number; title: string };
  }[];
  latestPayments: {
    id: number;
    amount: number;
    status: PaymentStatus;
    purpose: PaymentPurpose;
    createdAt: string;
    user: { id: number; name: string };
    courseTitle: string | null;
  }[];
  generatedAt: string;
}

export interface AdminStudentListItemDTO {
  id: number;
  name: string;
  phone: string;
  parentPhone: string;
  grade: Grade | null;
  governorate: string;
  isActive: boolean;
  createdAt: string;
  balance: number;
  activeEnrollments: number;
}

export interface UserDeviceDTO {
  id: number;
  userAgent: string;
  ip: string;
  lastSeen: string;
  createdAt: string;
}

export interface AdminStudentDetailDTO extends AdminStudentListItemDTO {
  email: string | null;
  deviceLimit: number;
  stars: number;
  enrollments: {
    id: number;
    courseId: number;
    courseTitle: string;
    source: EnrollmentSource;
    createdAt: string;
    expiresAt: string;
    active: boolean;
  }[];
  devices: UserDeviceDTO[];
  recentAttempts: { id: number; examId: number; examTitle: string; score: number | null; totalPoints: number; submittedAt: string | null }[];
}

// تُعرض مرة واحدة فقط ولا تُخزَّن نصاً
export interface TempPasswordDTO {
  userId: number;
  tempPassword: string;
}

export interface StaffDTO {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface PlatformSettingsDTO {
  requirePhoneVerification: boolean;
  updatedAt: string;
  updatedBy: { id: number; name: string } | null;
}

export interface AuditLogDTO {
  id: number;
  action: string;
  entity: string;
  actor: { id: number; name: string; role: Role } | null;
  // قيم meta مسطّحة كنص (المفاتيح الحساسة محذوفة، والنصوص الطويلة مقصوصة)
  meta: { key: string; value: string }[];
  ip: string;
  createdAt: string;
}

// ── لوحة الطالب ──────────────────────────────────────────────────
export interface MyCourseDTO {
  courseId: number;
  title: string;
  coverImage: string | null;
  grade: Grade;
  type: CourseType;
  source: EnrollmentSource;
  expiresAt: string;
  active: boolean;
  lessonsCount: number;
  completedLessons: number;
  // نسبة الإكمال (الحصص المكتملة ÷ كل الحصص) 0–100
  percent: number;
  // أول حصة لم تكتمل (بالترتيب) — "كمّل من هنا"
  nextLessonId: number | null;
  lastWatchedAt: string | null;
}

export interface StudentOverviewDTO {
  balance: number;
  stars: number;
  activeCourses: MyCourseDTO[];
  activeCoursesCount: number;
  lastLesson: { lessonId: number; lessonTitle: string; courseId: number; courseTitle: string; percent: number; updatedAt: string } | null;
  recentResults: { attemptId: number; examId: number; title: string; score: number; totalPoints: number; submittedAt: string | null }[];
  upcomingExams: number;
  requiredHomework: number;
}
