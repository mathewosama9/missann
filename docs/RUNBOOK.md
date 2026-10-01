# دليل التشغيل (Runbook) — منصة مس آن بهاء

دليل لمن يدير السيرفر: أول نشر، التحديث، النسخ الاحتياطي والاسترجاع، المتابعة، وحل الأعطال الشائعة.
كل الأوامر تُنفَّذ على السيرفر من مجلد المشروع. اختصار مفيد:

```bash
alias dc='docker compose -f docker-compose.prod.yml --env-file deploy/.env'
```

---

## 1) المتطلبات

| البند | الحد الأدنى المقترح |
| --- | --- |
| السيرفر | VPS بنظام Ubuntu 22.04/24.04 — 2 vCPU و 4GB RAM و 40GB SSD (يكفي بدايةً لآلاف الطلاب) |
| البرامج | Docker Engine 24+ مع Docker Compose v2 (`docker compose version`) |
| الدومين | سجل **A** للدومين (و `www`) يشير لعنوان IP السيرفر |
| المنافذ | 80 و 443 مفتوحان (Caddy يستخرج شهادة HTTPS تلقائياً) — لا تفتح 5432 أو 6379 للخارج |

الخدمات التي تعمل: `caddy` (HTTPS) ← `web` (nginx + الواجهة) ← `api` (الخادم + عمّال الطوابير) ← `postgres` + `redis`.
البيانات الدائمة في volumes: `pgdata` (القاعدة)، `redisdata` (الطوابير)، `uploads` (صور الكورسات)،
`private-uploads` (حلول الواجبات — خاصة، تُقدَّم عبر الـ API بعد التحقق فقط)، `caddy_data` (الشهادات).

## 2) أول نشر

```bash
git clone https://github.com/mathewosama9/missann.git && cd missann
cp deploy/.env.example deploy/.env
nano deploy/.env
```

املأ على الأقل: `DOMAIN`، `ACME_EMAIL`، `POSTGRES_PASSWORD`، `JWT_ACCESS_SECRET`، `JWT_REFRESH_SECRET`،
`SEED_ADMIN_PHONE`، `SEED_ADMIN_PASSWORD`. لتوليد كل سر:

```bash
openssl rand -hex 32
```

ثم:

```bash
dc up -d --build          # يبني الصور ويشغّل كل شيء؛ الـ API يطبّق الـ migrations تلقائياً عند الإقلاع
dc ps                     # كل الخدمات healthy
dc exec api node dist/seed.js   # ينشئ الأدمن الأول من SEED_ADMIN_* (مرة واحدة؛ آمن للتكرار)
```

افتح `https://<DOMAIN>` وادخل بحساب الأدمن، وغيّر كلمة المرور من الملف الشخصي فوراً، ثم احذف
`SEED_ADMIN_PASSWORD` من `deploy/.env`.

> بيانات تجريبية (كورسات + طالب + دفعة أكواد) للتجربة فقط: `dc exec -e SEED_DEMO=true api node dist/seed.js`

## 3) الربط بالخدمات الخارجية

| الخدمة | المتغيرات | ملاحظات |
| --- | --- | --- |
| Paymob | `PAYMOB_*` | في لوحة Paymob: Transaction processed callback = `https://<DOMAIN>/api/payments/paymob/webhook`، و Transaction response callback = `https://<DOMAIN>/payment/callback`. أي إشعار بتوقيع HMAC خاطئ يُرفض ويُسجَّل. |
| Bunny Stream | `BUNNY_STREAM_*`, `BUNNY_TOKEN_KEY` | فعّل Token Authentication في المكتبة وضع مفتاحها في `BUNNY_TOKEN_KEY`. |
| Bunny Storage | `BUNNY_STORAGE_*` | لملفات الواجبات؛ منطقة التخزين **بدون** Pull Zone عام (الملفات خاصة). |
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | رسائل المبادرة (الأكواد والنتائج) خارج نافذة 24 ساعة تحتاج قوالب معتمدة من Meta؛ بدونها تُجرَّب SMS. |
| SMS | `SMS_PROVIDER_URL`, `SMS_API_KEY`, `SMS_SENDER` | بوابة HTTP عامة (راجع التعليق في `deploy/.env.example`). |

بعد تعديل `deploy/.env`: `dc up -d api` (يعيد تشغيل الـ API بالقيم الجديدة).

> مهم: خيار "التحقق من رقم الموبايل عند التسجيل" (الإعدادات في لوحة الأدمن) مفعّل افتراضياً. لو لا توجد
> واتساب/SMS بعد، **عطّله** من الإعدادات وإلا لن يصل كود التفعيل للطلاب الجدد.

## 4) تحديث المنصة لإصدار جديد

```bash
dc exec postgres pg_dump -U missann -Fc missann > backups/pre-update-$(date +%F).dump   # نسخة قبل التحديث
git pull
dc up -d --build          # يعيد بناء الصور؛ الـ migrations تُطبَّق تلقائياً
dc ps && curl -fsS https://<DOMAIN>/api/health
```

الرجوع لإصدار سابق: `git checkout <commit>` ثم `dc up -d --build` (وإن كانت الـ migration الجديدة غيّرت البيانات،
استرجع النسخة — القسم 5).

## 5) النسخ الاحتياطي والاسترجاع

### يومياً (cron)
```bash
mkdir -p /opt/missann-backups
crontab -e
# 3 صباحاً: القاعدة (مضغوطة) + الملفات، والاحتفاظ 14 يوماً
0 3 * * * cd /path/to/missann && docker compose -f docker-compose.prod.yml --env-file deploy/.env exec -T postgres pg_dump -U missann -Fc missann > /opt/missann-backups/db-$(date +\%F).dump
15 3 * * * docker run --rm -v missann_uploads:/u -v missann_private-uploads:/p -v /opt/missann-backups:/b alpine tar czf /b/files-$(date +\%F).tgz -C / u p
30 3 * * * find /opt/missann-backups -type f -mtime +14 -delete
```
انسخ `/opt/missann-backups` لمكان خارج السيرفر (Bunny Storage أو Google Drive أو جهاز آخر) — نسخة على نفس
السيرفر لا تحمي من ضياعه.

### الاسترجاع
```bash
dc stop api
dc exec -T postgres pg_restore -U missann -d missann --clean --if-exists < /opt/missann-backups/db-YYYY-MM-DD.dump
docker run --rm -v missann_uploads:/u -v missann_private-uploads:/p -v /opt/missann-backups:/b alpine sh -c "cd / && tar xzf /b/files-YYYY-MM-DD.tgz"
dc start api
```

## 6) المتابعة اليومية

| ماذا | الأمر |
| --- | --- |
| حالة الخدمات | `dc ps` (الكل `healthy`) |
| صحة الـ API (قاعدة + Redis) | `curl -fsS https://<DOMAIN>/api/health` |
| سجلات الـ API (JSON، بلا أسرار) | `dc logs -f --tail=200 api` |
| الأخطاء فقط | `dc logs api \| grep '"level":50'` |
| مساحة القرص | `df -h` و `docker system df` |
| رسائل فشل إرسالها | لوحة الأدمن ← الإشعارات ← سجل الرسائل (حالة FAILED وسببها) |
| العمليات الحساسة | لوحة الأدمن ← الإعدادات ← سجل العمليات |

## 7) الأعطال الشائعة

| العَرَض | السبب المحتمل | الحل |
| --- | --- | --- |
| "حدث خطأ في الخادم" في كل الصفحات | القاعدة أو Redis متوقفة | `dc ps` ثم `dc up -d postgres redis` |
| الـ API لا يقلع: `متغيرات البيئة غير صحيحة` | سر JWT قصير/مثال/متطابق، أو APP_URL بلا https | صحّح `deploy/.env` (السجل يذكر الحقل) |
| لا شهادة HTTPS | الدومين لا يشير للسيرفر أو المنفذ 80 مغلق | `dig +short <DOMAIN>`، افتح 80/443، `dc logs caddy` |
| الطلاب الجدد لا يصلهم كود التفعيل | لا واتساب/SMS مضبوط | اضبطهما، أو عطّل التحقق من الإعدادات وفعّل الحسابات المعلّقة من صفحة الطلاب |
| رسائل كثيرة FAILED | مفاتيح المزوّد أو قوالب واتساب | راجع `lastError` في سجل الرسائل |
| "محاولات كثيرة" لطلاب سنتر واحد | كلهم خلف IP واحد | ارفع `RATE_LIMIT_PER_MIN` ثم `dc up -d api` |
| الدفع ينجح في Paymob ولا يُشحن الرصيد | عنوان الـ callback خاطئ أو HMAC خاطئ | راجع القسم 3؛ سجل العمليات يُظهر `PAYMOB_WEBHOOK_FORGED` لو التوقيع خاطئ |
| جهاز طالب مفقود/مسروق | — | صفحة الطالب ← الأجهزة ← إزالة (يخرج من كل الأجهزة فوراً) |

## 8) الأمان التشغيلي
- `deploy/.env` سرّي: صلاحيات `chmod 600 deploy/.env`، ولا يُرسل في شات أو بريد.
- تغيير سر JWT (عند الشك في تسريبه): ولّد قيمتين جديدتين في `deploy/.env` ثم `dc up -d api` — كل الجلسات تنتهي
  والكل يسجّل دخوله من جديد.
- حدّث النظام دورياً: `apt update && apt upgrade`، وحدّث الصور: `dc pull && dc up -d --build`.
- جدار ناري: `ufw allow 22,80,443/tcp && ufw enable`.
- المساعدون (ASSISTANT) لا يصلون للمال ولا الأكواد ولا الإعدادات ولا بيانات الطلاب الشخصية — راجع صلاحياتهم من
  لوحة الأدمن ← الإعدادات ← المساعدون.
