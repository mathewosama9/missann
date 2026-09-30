// أدوار المستخدمين
export const Role = {
  STUDENT: 'STUDENT',
  ASSISTANT: 'ASSISTANT',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

// الصفوف الدراسية (المرحلة الابتدائية)
export const Grade = {
  FOURTH_PRIMARY: 'FOURTH_PRIMARY',
  FIFTH_PRIMARY: 'FIFTH_PRIMARY',
  SIXTH_PRIMARY: 'SIXTH_PRIMARY',
} as const;
export type Grade = (typeof Grade)[keyof typeof Grade];

export const CourseType = {
  MONTHLY: 'MONTHLY',
  FOUNDATION: 'FOUNDATION',
  REVISION: 'REVISION',
} as const;
export type CourseType = (typeof CourseType)[keyof typeof CourseType];

export const Term = {
  FIRST: 'FIRST',
  SECOND: 'SECOND',
} as const;
export type Term = (typeof Term)[keyof typeof Term];

export const EnrollmentSource = {
  CODE: 'CODE',
  ONLINE: 'ONLINE',
  ADMIN: 'ADMIN',
  WALLET: 'WALLET',
  FREE: 'FREE',
} as const;
export type EnrollmentSource = (typeof EnrollmentSource)[keyof typeof EnrollmentSource];

export const WalletTxType = {
  TOPUP: 'TOPUP',
  PURCHASE: 'PURCHASE',
  REFUND: 'REFUND',
} as const;
export type WalletTxType = (typeof WalletTxType)[keyof typeof WalletTxType];

export const CodeStatus = {
  ACTIVE: 'ACTIVE',
  USED: 'USED',
  DISABLED: 'DISABLED',
} as const;
export type CodeStatus = (typeof CodeStatus)[keyof typeof CodeStatus];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentPurpose = {
  TOPUP: 'TOPUP',
  COURSE: 'COURSE',
} as const;
export type PaymentPurpose = (typeof PaymentPurpose)[keyof typeof PaymentPurpose];

export const QuestionType = {
  MCQ: 'MCQ',
  TRUEFALSE: 'TRUEFALSE',
  // كتابية — تصحيح يدوي من المس
  ESSAY: 'ESSAY',
  COMPLETE: 'COMPLETE',
  TERM: 'TERM',
} as const;
export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

// متى تظهر الدرجة والمراجعة للطالب
export const ResultRelease = {
  IMMEDIATE: 'IMMEDIATE',
  AFTER_END: 'AFTER_END',
  MANUAL: 'MANUAL',
} as const;
export type ResultRelease = (typeof ResultRelease)[keyof typeof ResultRelease];

export const AttemptStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  EXPIRED: 'EXPIRED',
} as const;
export type AttemptStatus = (typeof AttemptStatus)[keyof typeof AttemptStatus];

export const LiveProvider = {
  ZOOM: 'ZOOM',
  MEET: 'MEET',
} as const;
export type LiveProvider = (typeof LiveProvider)[keyof typeof LiveProvider];

export const NotifChannel = {
  IN_APP: 'IN_APP',
  WHATSAPP: 'WHATSAPP',
  SMS: 'SMS',
} as const;
export type NotifChannel = (typeof NotifChannel)[keyof typeof NotifChannel];

export const NotifStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;
export type NotifStatus = (typeof NotifStatus)[keyof typeof NotifStatus];

export const NotifType = {
  GENERAL: 'GENERAL',
  OTP: 'OTP',
  PARENT_EXAM_RESULT: 'PARENT_EXAM_RESULT',
  LIVE_REMINDER: 'LIVE_REMINDER',
  ENROLLMENT_EXPIRY: 'ENROLLMENT_EXPIRY',
} as const;
export type NotifType = (typeof NotifType)[keyof typeof NotifType];

// جمهور الإرسال الجماعي
export const BroadcastAudience = {
  ALL: 'ALL',
  GRADE: 'GRADE',
  COURSE: 'COURSE',
} as const;
export type BroadcastAudience = (typeof BroadcastAudience)[keyof typeof BroadcastAudience];

export const AttachmentType = {
  PDF: 'PDF',
  FILE: 'FILE',
} as const;
export type AttachmentType = (typeof AttachmentType)[keyof typeof AttachmentType];

export const OtpPurpose = {
  ACTIVATION: 'ACTIVATION',
  RESET: 'RESET',
} as const;
export type OtpPurpose = (typeof OtpPurpose)[keyof typeof OtpPurpose];

// مصدر فيديو الحصة
export const VideoProvider = {
  BUNNY: 'BUNNY',
  YOUTUBE: 'YOUTUBE',
} as const;
export type VideoProvider = (typeof VideoProvider)[keyof typeof VideoProvider];
